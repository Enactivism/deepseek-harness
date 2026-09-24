/** Desktop-pet chat controller over one transiently selected Harness Session per mode. */

import type {
  ConversationNode,
  ConversationSnapshot,
  ISessions,
  ObservableSnapshot,
  RunningToolCall,
  SessionFace,
  SessionId,
  ToolCallBlock,
} from '@deepseek-ai/dsh-client-runtime/client'

const PET_SESSION_STORAGE_KEY = 'dsh.live2d.desktop-pet-session'
const GALGAME_SESSION_STORAGE_KEY = 'dsh.live2d.galgame-session'
const GALGAME_AGENT_PRESET = 'chat-only'

/** The desktop-pet conversation selected by the visible chat mode. */
export type DesktopPetChatMode = 'chat' | 'galgame'

interface DesktopPetSession {
  sessionId: SessionId
  session: SessionFace
  dispose: () => void
  actionError: string | null
}

/** One compact message rendered inside the desktop-pet chat panel. */
export interface DesktopPetChatMessage {
  /** Stable React identity derived from the durable event or running step. */
  id: string
  /** Speaker displayed by the compact panel. */
  role: 'user' | 'assistant'
  /** Message text extracted from the Session projection. */
  text: string
  /** Present only for the assistant output still streaming. */
  streaming?: true
}

/** The approval prompt currently blocking the desktop-pet Session, if any. */
export interface DesktopPetChatApproval {
  /** Stable request identity used to reset one-shot button state. */
  key: string
  /** Tool that requested the approval. */
  toolName: string
  /** Model-provided reason, when present. */
  reason?: string
  /** Paired tool call's command argument, when available. */
  command?: string
}

/** Outcomes the desktop-pet approval card can submit. */
export type DesktopPetChatApprovalOutcome = 'allowed-once' | 'rejected'

/** Immutable desktop-pet chat projection bound into the Live2D component. */
export interface DesktopPetChatView {
  /** Session preparation lifecycle. */
  status: 'idle' | 'loading' | 'ready' | 'error'
  /** Dedicated Session id after preparation succeeds. */
  sessionId?: SessionId
  /** Finalized messages plus the current streamed assistant text. */
  messages: readonly DesktopPetChatMessage[]
  /** Whether the dedicated Session is running a turn. */
  running: boolean
  /** Whether one prompt admission is in flight. */
  sending: boolean
  /** Approval prompt currently blocking the Session, or null when none is pending. */
  pendingApproval: DesktopPetChatApproval | null
  /** Preparation or prompt error rendered by the panel. */
  error: string | null
}

/** Sessions operations used by the desktop-pet controller. */
export type DesktopPetChatSessions = Pick<
  ISessions,
  'list' | 'create' | 'openTransient' | 'binding'
>

interface SessionStorage {
  getItem(key: string): string | null
  setItem(key: string, value: string): void
}

const INITIAL_VIEW: DesktopPetChatView = {
  status: 'idle',
  messages: [],
  running: false,
  sending: false,
  pendingApproval: null,
  error: null,
}

function userText(node: Extract<ConversationNode, { kind: 'user' | 'steering' }>): string {
  return node.content.flatMap(block => block.type === 'text' ? [block.text] : []).join('\n')
}

function assistantText(node: Extract<ConversationNode, { kind: 'assistant' }>): string {
  return node.blocks.flatMap(block => block.kind === 'text' ? [block.text] : []).join('\n')
}

function messagesOf(snapshot: ConversationSnapshot): readonly DesktopPetChatMessage[] {
  const messages: DesktopPetChatMessage[] = []
  for (const node of snapshot.nodes) {
    if (node.kind === 'user' || node.kind === 'steering') {
      const text = userText(node)
      if (text !== '') messages.push({ id: `${node.kind}-${node.seq}`, role: 'user', text })
    } else if (node.kind === 'assistant') {
      const text = assistantText(node)
      if (text !== '') messages.push({ id: `assistant-${node.seq}`, role: 'assistant', text })
    }
  }
  const partial = snapshot.partial
  if (partial !== null) {
    const text = partial.blocks.flatMap(block => block.kind === 'text' ? [block.text] : []).join('\n')
    if (text !== '') {
      messages.push({
        id: `assistant-partial-${partial.turn}-${partial.step}`,
        role: 'assistant',
        text,
        streaming: true,
      })
    }
  }
  return messages
}

function runningCallOf(
  calls: readonly ToolCallBlock[],
  callId: string,
): RunningToolCall | undefined {
  for (const call of calls) {
    if (call.callId === callId && !('kind' in call)) return call
    const nested = runningCallOf(call.subCalls, callId)
    if (nested !== undefined) return nested
  }
  return undefined
}

/** Read the command argument paired with one pending approval. */
function commandOf(snapshot: ConversationSnapshot, callId: string | undefined): string | undefined {
  if (callId === undefined) return undefined
  const call = runningCallOf(snapshot.runningCalls, callId)
  if (call === undefined) return undefined
  try {
    const args = JSON.parse(call.argsRaw) as Record<string, unknown>
    return typeof args.command === 'string' ? args.command : undefined
  } catch {
    // Unparseable model arguments do not prevent the approval itself from rendering.
    return undefined
  }
}

function approvalOf(snapshot: ConversationSnapshot): DesktopPetChatApproval | null {
  const wait = snapshot.pending.find(item => item.kind === 'approval')
  if (wait === undefined) return null
  const command = commandOf(snapshot, wait.payload.callId)
  return {
    key: wait.key,
    toolName: wait.payload.toolName,
    ...(wait.payload.reason === undefined ? {} : { reason: wait.payload.reason }),
    ...(command === undefined ? {} : { command }),
  }
}

/**
 * Own mode-specific Sessions without mutating the primary surface's persisted
 * selection.
 */
export class DesktopPetChatController implements ObservableSnapshot<DesktopPetChatView> {
  private view = INITIAL_VIEW
  private readonly listeners = new Set<() => void>()
  private readonly petSessions = new Map<DesktopPetChatMode, DesktopPetSession>()
  private readonly activations = new Map<DesktopPetChatMode, Promise<SessionId>>()
  private activeMode: DesktopPetChatMode = 'chat'
  private sendingMode: DesktopPetChatMode | undefined
  private disposed = false

  /**
   * @param sessions - root Sessions service; transient selection opens history without changing primary navigation.
   * @param storage - feature-owned Session id persistence; absent storage keeps the chat page-lifetime only.
   */
  constructor(
    private readonly sessions: DesktopPetChatSessions,
    private readonly storage?: SessionStorage,
  ) {}

  /** @returns the cached view, stable until the next publication. */
  getSnapshot(): DesktopPetChatView {
    return this.view
  }

  /**
   * @param listener - snapshot-change callback.
   * @returns unsubscribe function.
   */
  subscribe(listener: () => void): () => void {
    this.listeners.add(listener)
    return () => { this.listeners.delete(listener) }
  }

  /**
   * Restore or create the Session for one mode and open its history transiently.
   * @param mode - ordinary desktop-pet chat or the tool-free Galgame conversation.
   * @returns the Session id for the selected mode.
   */
  activate(mode: DesktopPetChatMode = 'chat'): Promise<SessionId> {
    this.activeMode = mode
    const current = this.petSessions.get(mode)
    if (current !== undefined) {
      this.sessions.openTransient(current.sessionId)
      this.publishSession()
      return Promise.resolve(current.sessionId)
    }
    this.publish({ ...INITIAL_VIEW, status: 'loading', error: null })
    const pending = this.activations.get(mode)
    if (pending !== undefined) return pending
    const activation = this.resolveSession(mode).then((sessionId) => {
      if (this.disposed) throw new Error('desktop-pet chat controller is disposed')
      const binding = this.sessions.binding(sessionId)
      if (binding === undefined) throw new Error(`desktop-pet chat session "${sessionId}" is unavailable`)
      const petSession: DesktopPetSession = {
        sessionId,
        session: binding.session,
        dispose: () => {},
        actionError: null,
      }
      petSession.dispose = binding.session.subscribe(() => {
        if (this.activeMode === mode) this.publishSession()
      })
      this.petSessions.set(mode, petSession)
      if (this.activeMode === mode) {
        this.sessions.openTransient(sessionId)
        this.publishSession()
      }
      return sessionId
    }).catch((error: unknown) => {
      if (!this.disposed && this.activeMode === mode) {
        this.publish({ ...INITIAL_VIEW, status: 'error', error: errorMessage(error) })
      }
      throw error
    }).finally(() => {
      if (this.activations.get(mode) === activation) this.activations.delete(mode)
    })
    this.activations.set(mode, activation)
    return activation
  }

  /**
   * Admit one text prompt into the dedicated Session.
   * @param text - trimmed non-empty user message.
   * @param mode - conversation that receives the message.
   * @returns whether the Host accepted the prompt.
   */
  async send(text: string, mode: DesktopPetChatMode = 'chat'): Promise<boolean> {
    if (this.sendingMode !== undefined || text === '') return false
    await this.activate(mode)
    if (this.activeMode !== mode) return false
    const petSession = this.petSessions.get(mode)
    if (petSession === undefined) return false
    this.sendingMode = mode
    petSession.actionError = null
    this.publishSession()
    try {
      const result = await petSession.session.prompt([{ type: 'text', text }], 'queue')
      if (!result.ok) {
        petSession.actionError = result.error.message
        return false
      }
      return true
    } catch (error: unknown) {
      petSession.actionError = errorMessage(error)
      return false
    } finally {
      this.sendingMode = undefined
      this.publishSession()
    }
  }

  /**
   * Answer the approval currently blocking the dedicated Session.
   * @param outcome - one-shot allow or reject decision.
   * @returns whether the Host accepted the response carrier.
   */
  async answerApproval(outcome: DesktopPetChatApprovalOutcome): Promise<boolean> {
    await this.activate(this.activeMode)
    const petSession = this.petSessions.get(this.activeMode)
    if (petSession === undefined) return false
    const wait = petSession.session.getSnapshot().pending.find(item => item.kind === 'approval')
    if (wait === undefined) return false
    try {
      const receipt = await wait.respond({
        ok: true,
        value: {
          sessionId: petSession.sessionId,
          approvalId: wait.payload.approvalId,
          outcome,
        },
      })
      if (receipt.accepted) return true
      petSession.actionError = `approval response rejected: ${receipt.reason}`
    } catch (error: unknown) {
      petSession.actionError = errorMessage(error)
    }
    this.publishSession()
    return false
  }

  /** Stop publications and release the Session subscription. */
  dispose(): void {
    if (this.disposed) return
    this.disposed = true
    for (const petSession of this.petSessions.values()) petSession.dispose()
    this.petSessions.clear()
    this.listeners.clear()
  }

  private resolveSession(mode: DesktopPetChatMode): Promise<SessionId> {
    const locks = typeof navigator === 'undefined' ? undefined : navigator.locks
    const resolve = (): Promise<SessionId> => this.resolveOrCreateSession(mode)
    if (locks === undefined) return resolve()
    return locks.request(`dsh.live2d.session.${mode}`, resolve)
  }

  private async resolveOrCreateSession(mode: DesktopPetChatMode): Promise<SessionId> {
    const key = mode === 'galgame' ? GALGAME_SESSION_STORAGE_KEY : PET_SESSION_STORAGE_KEY
    const stored = this.readStoredSession(key)
    const storedSummary = stored === undefined ? undefined : this.sessions.list.getSnapshot().byId[stored]
    if (stored !== undefined && storedSummary !== undefined
      && (mode === 'chat' || storedSummary.agentPreset === GALGAME_AGENT_PRESET)) {
      return stored
    }
    const created = await this.sessions.create(mode === 'galgame' ? { agentPreset: GALGAME_AGENT_PRESET } : {})
    if (mode === 'galgame'
      && this.sessions.list.getSnapshot().byId[created]?.agentPreset !== GALGAME_AGENT_PRESET) {
      throw new Error(`desktop-pet Galgame Session did not use the "${GALGAME_AGENT_PRESET}" preset`)
    }
    this.writeStoredSession(key, created)
    return created
  }

  private readStoredSession(key: string): SessionId | undefined {
    try {
      const value = this.storage?.getItem(key)
      return value === null || value === undefined ? undefined : value as SessionId
    } catch (error: unknown) {
      console.error('[ui-live2d] failed to restore desktop-pet session', error)
      return undefined
    }
  }

  private writeStoredSession(key: string, sessionId: SessionId): void {
    try {
      this.storage?.setItem(key, sessionId)
    } catch (error: unknown) {
      console.error('[ui-live2d] failed to persist desktop-pet chat session', error)
    }
  }

  private publishSession(): void {
    const petSession = this.petSessions.get(this.activeMode)
    const snapshot = petSession?.session.getSnapshot()
    if (snapshot === undefined || petSession === undefined) return
    this.publish({
      status: snapshot.openState === 'error' ? 'error' : 'ready',
      sessionId: petSession.sessionId,
      messages: messagesOf(snapshot),
      running: snapshot.running,
      sending: this.sendingMode === this.activeMode,
      pendingApproval: approvalOf(snapshot),
      error: petSession.actionError ?? snapshot.openError?.message ?? snapshot.promptError?.error.message ?? null,
    })
  }

  private publish(view: DesktopPetChatView): void {
    if (this.disposed) return
    this.view = view
    for (const listener of [...this.listeners]) listener()
  }
}

function errorMessage(error: unknown): string {
  return error instanceof Error ? error.message : String(error)
}
