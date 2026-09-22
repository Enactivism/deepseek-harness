/** Desktop-pet chat controller over one transiently selected Harness Session. */

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
 * Own one Session for the desktop-pet page without mutating the primary
 * surface's persisted selection.
 */
export class DesktopPetChatController implements ObservableSnapshot<DesktopPetChatView> {
  private view = INITIAL_VIEW
  private readonly listeners = new Set<() => void>()
  private session: SessionFace | undefined
  private sessionId: SessionId | undefined
  private sessionDisposer: (() => void) | undefined
  private activation: Promise<SessionId> | null = null
  private sending = false
  private actionError: string | null = null
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
   * Restore or create the dedicated Session and open its history transiently.
   * @returns the dedicated Session id.
   */
  activate(): Promise<SessionId> {
    if (this.sessionId !== undefined) return Promise.resolve(this.sessionId)
    if (this.activation !== null) return this.activation
    this.publish({ ...this.view, status: 'loading', error: null })
    const activation = this.resolveSession().then((sessionId) => {
      if (this.disposed) throw new Error('desktop-pet chat controller is disposed')
      this.sessions.openTransient(sessionId)
      const binding = this.sessions.binding(sessionId)
      if (binding === undefined) throw new Error(`desktop-pet chat session "${sessionId}" is unavailable`)
      this.sessionId = sessionId
      this.session = binding.session
      this.sessionDisposer = binding.session.subscribe(() => { this.publishSession() })
      this.publishSession()
      return sessionId
    }).catch((error: unknown) => {
      if (!this.disposed) {
        this.publish({ ...INITIAL_VIEW, status: 'error', error: errorMessage(error) })
      }
      throw error
    }).finally(() => {
      if (this.activation === activation) this.activation = null
    })
    this.activation = activation
    return activation
  }

  /**
   * Admit one text prompt into the dedicated Session.
   * @param text - trimmed non-empty user message.
   * @returns whether the Host accepted the prompt.
   */
  async send(text: string): Promise<boolean> {
    if (this.sending || text === '') return false
    await this.activate()
    const session = this.session
    if (session === undefined) return false
    this.sending = true
    this.actionError = null
    this.publishSession()
    try {
      const result = await session.prompt([{ type: 'text', text }], 'queue')
      if (!result.ok) {
        this.actionError = result.error.message
        return false
      }
      return true
    } catch (error: unknown) {
      this.actionError = errorMessage(error)
      return false
    } finally {
      this.sending = false
      this.publishSession()
    }
  }

  /**
   * Answer the approval currently blocking the dedicated Session.
   * @param outcome - one-shot allow or reject decision.
   * @returns whether the Host accepted the response carrier.
   */
  async answerApproval(outcome: DesktopPetChatApprovalOutcome): Promise<boolean> {
    await this.activate()
    const session = this.session
    const sessionId = this.sessionId
    if (session === undefined || sessionId === undefined) return false
    const wait = session.getSnapshot().pending.find(item => item.kind === 'approval')
    if (wait === undefined) return false
    try {
      const receipt = await wait.respond({
        ok: true,
        value: {
          sessionId,
          approvalId: wait.payload.approvalId,
          outcome,
        },
      })
      if (receipt.accepted) return true
      this.actionError = `approval response rejected: ${receipt.reason}`
    } catch (error: unknown) {
      this.actionError = errorMessage(error)
    }
    this.publishSession()
    return false
  }

  /** Stop publications and release the Session subscription. */
  dispose(): void {
    if (this.disposed) return
    this.disposed = true
    this.sessionDisposer?.()
    this.sessionDisposer = undefined
    this.listeners.clear()
  }

  private async resolveSession(): Promise<SessionId> {
    const stored = this.readStoredSession()
    if (stored !== undefined && this.sessions.list.getSnapshot().byId[stored] !== undefined) {
      return stored
    }
    const created = await this.sessions.create()
    this.writeStoredSession(created)
    return created
  }

  private readStoredSession(): SessionId | undefined {
    try {
      const value = this.storage?.getItem(PET_SESSION_STORAGE_KEY)
      return value === null || value === undefined ? undefined : value as SessionId
    } catch (error: unknown) {
      console.error('[ui-live2d] failed to restore desktop-pet chat session', error)
      return undefined
    }
  }

  private writeStoredSession(sessionId: SessionId): void {
    try {
      this.storage?.setItem(PET_SESSION_STORAGE_KEY, sessionId)
    } catch (error: unknown) {
      console.error('[ui-live2d] failed to persist desktop-pet chat session', error)
    }
  }

  private publishSession(): void {
    const snapshot = this.session?.getSnapshot()
    if (snapshot === undefined || this.sessionId === undefined) return
    this.publish({
      status: snapshot.openState === 'error' ? 'error' : 'ready',
      sessionId: this.sessionId,
      messages: messagesOf(snapshot),
      running: snapshot.running,
      sending: this.sending,
      pendingApproval: approvalOf(snapshot),
      error: this.actionError ?? snapshot.openError?.message ?? snapshot.promptError?.error.message ?? null,
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
