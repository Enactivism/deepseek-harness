/** Right-workspace Live2D companion surface and local model picker. */

import {
  useEffect, useRef, useState, type ChangeEvent, type FormEvent,
  type InputHTMLAttributes, type KeyboardEvent,
} from 'react'
import type { ObservableSnapshot, SessionListState } from '@deepseek-ai/dsh-client-runtime/client'
// Type-only: pull the model locale namespace into the composed overlay props.
import type {} from '@deepseek-ai/dsh-client-ui-model-selection/client'
import {
  Button,
  IconCloseOutline16,
  IconFolderOpenOutline16,
  IconNewChatOutline16,
  IconSendOutline16,
  IconSettingsOutline16,
  IconSparkle16,
  IconTrashOutline16,
  MarkdownText,
} from '@deepseek-ai/dsh-client-ui-primitives'
import type {
  InjectFace, PropsLocale, PropsRenderSlots, PropsRuntime, TranslateNS,
} from '@deepseek-ai/dsh-client-ui-slots'
import type {
  DesktopPetChatMode,
  DesktopPetChatApprovalOutcome,
  DesktopPetChatView,
} from './desktop-pet-chat.ts'
import type { Live2DKey } from './locales.ts'
import { buildModelBundle, ModelImportError, type ModelBundle } from './model-files.ts'
import {
  GALGAME_CONTROL_PREFIX, GALGAME_STORY_CARD_MARKER, isGalgameControlMessage, parseGalgameReply,
} from './galgame.ts'
import { mountLive2D } from './renderer.ts'
import { loadModelBundle, saveModelBundle } from './model-store.ts'
import { broadcastModelBundle, subscribeToModelTransfer } from './model-transfer.ts'
import css from './Live2DOverlay.module.css'

/** Registration-side controller face for the desktop-pet chat panel. */
export interface DesktopPetChatInjected {
  hooks: {
    /** Dedicated Session projection bound by the renderer as usePetChat. */
    petChat: ObservableSnapshot<DesktopPetChatView>
  }
  /** Restore or create the desktop pet's isolated Session. */
  activatePetChat: (mode?: DesktopPetChatMode) => Promise<void>
  /**
   * Send one text message to the desktop pet's isolated Session.
   * @param text - trimmed non-empty message.
   * @returns whether the Host accepted the message.
   */
  sendPetMessage: (text: string, mode?: DesktopPetChatMode) => Promise<boolean>
  /**
   * Answer the approval currently blocking the desktop pet's Session.
   * @param outcome - one-shot allow or reject decision.
   * @returns whether the Host accepted the response.
   */
  answerPetApproval: (outcome: DesktopPetChatApprovalOutcome) => Promise<boolean>
}

/** Props composed by the shell's additive right-workspace slot. */
export type Live2DOverlayProps =
  PropsRuntime<'shell.right'>
  & PropsRenderSlots<'desktop-pet.model'>
  & PropsLocale<'live2d'>
  & InjectFace<DesktopPetChatInjected>

type LoadState = 'empty' | 'loading' | 'ready' | 'error'
type GalgameMode = 'choose' | 'setup' | 'free' | 'story'
type GalgameTone = 'everyday' | 'romance' | 'fantasy' | 'mystery'

interface GalgameStorySetup {
  tone: GalgameTone
  character: string
  player: string
  scenario: string
}

const GALGAME_MODE_STORAGE_KEY = 'dsh.live2d.galgame-mode'
const GALGAME_STORY_ACTIVE_STORAGE_KEY = 'dsh.live2d.galgame-story-active'
const GALGAME_STORY_SETUP_STORAGE_KEY = 'dsh.live2d.galgame-story-setup'
const GALGAME_FOCUS_MODE_STORAGE_KEY = 'dsh.live2d.galgame-focus-mode'
const GALGAME_SETUP_TEXT_LIMIT = 240
const DEFAULT_GALGAME_STORY_SETUP: GalgameStorySetup = {
  tone: 'everyday',
  character: '',
  player: '',
  scenario: '',
}

const galgameToneLabels: Record<GalgameTone, Live2DKey> = {
  everyday: 'game.tone.everyday',
  romance: 'game.tone.romance',
  fantasy: 'game.tone.fantasy',
  mystery: 'game.tone.mystery',
}

const DESKTOP_PET_SCALE_MIN = 2 / 3
const DESKTOP_PET_BASE_WIDTH = 360
const DESKTOP_PET_BASE_HEIGHT = 480
const WORKSPACE_SCALE_MIN = 0.7
const WORKSPACE_SCALE_MAX = 1.35
const WORKSPACE_SCALE_STEP = 0.05

function readGalgameMode(): GalgameMode | null {
  if (typeof window === 'undefined') return null
  try {
    const value = window.localStorage.getItem(GALGAME_MODE_STORAGE_KEY)
    return value === 'choose' || value === 'setup' || value === 'free' || value === 'story' ? value : null
  } catch {
    return null
  }
}

function readGalgameStorySetup(): GalgameStorySetup {
  try {
    const stored = window.localStorage.getItem(GALGAME_STORY_SETUP_STORAGE_KEY)
    if (stored === null) return DEFAULT_GALGAME_STORY_SETUP
    const value: unknown = JSON.parse(stored)
    if (typeof value !== 'object' || value === null) return DEFAULT_GALGAME_STORY_SETUP
    const fields = value as Record<string, unknown>
    const tone = fields.tone
    const text = (field: unknown): string => (
      typeof field === 'string' ? field.slice(0, GALGAME_SETUP_TEXT_LIMIT) : ''
    )
    return {
      tone: tone === 'everyday' || tone === 'romance' || tone === 'fantasy' || tone === 'mystery'
        ? tone
        : DEFAULT_GALGAME_STORY_SETUP.tone,
      character: text(fields.character),
      player: text(fields.player),
      scenario: text(fields.scenario),
    }
  } catch {
    return DEFAULT_GALGAME_STORY_SETUP
  }
}

function writeGalgameStorySetup(setup: GalgameStorySetup): void {
  try {
    window.localStorage.setItem(GALGAME_STORY_SETUP_STORAGE_KEY, JSON.stringify(setup))
  } catch {
    // The current story can still use the in-memory setup when storage is unavailable.
  }
}

function readGalgameFocusMode(): boolean {
  try {
    return window.localStorage.getItem(GALGAME_FOCUS_MODE_STORAGE_KEY) === 'true'
  } catch {
    return false
  }
}

function writeGalgameFocusMode(enabled: boolean): void {
  try {
    if (enabled) window.localStorage.setItem(GALGAME_FOCUS_MODE_STORAGE_KEY, 'true')
    else window.localStorage.removeItem(GALGAME_FOCUS_MODE_STORAGE_KEY)
  } catch {
    // The story transcript remains available when storage is unavailable.
  }
}

function writeGalgameMode(mode: GalgameMode | null): void {
  try {
    if (mode === null) window.localStorage.removeItem(GALGAME_MODE_STORAGE_KEY)
    else window.localStorage.setItem(GALGAME_MODE_STORAGE_KEY, mode)
  } catch {
    // The native chat page can still be used when browser storage is unavailable.
  }
}

function readGalgameStoryActive(): boolean {
  if (typeof window === 'undefined') return false
  try {
    return window.localStorage.getItem(GALGAME_STORY_ACTIVE_STORAGE_KEY) === 'true'
  } catch {
    return false
  }
}

function writeGalgameStoryActive(active: boolean): void {
  try {
    if (active) window.localStorage.setItem(GALGAME_STORY_ACTIVE_STORAGE_KEY, 'true')
    else window.localStorage.removeItem(GALGAME_STORY_ACTIVE_STORAGE_KEY)
  } catch {
    // Story mode still works in the current page when browser storage is unavailable.
  }
}

/** Translate structured import/runtime failures at the UI boundary. */
function errorText(error: unknown, t: TranslateNS<'live2d'>): string {
  if (error instanceof ModelImportError) {
    const keys: Record<ModelImportError['code'], Live2DKey> = {
      'no-files': 'error.noFiles',
      'missing-entry': 'error.missingEntry',
      'multiple-entries': 'error.multipleEntries',
      'missing-model-data': 'error.missingData',
    }
    return t(keys[error.code])
  }
  if (error instanceof Error && error.message === 'model entry is not valid JSON') {
    return t('error.invalidModel')
  }
  return t('error.runtime')
}

/** Status copy follows the current Harness session while staying local to UI. */
function statusText(
  state: LoadState,
  progress: number,
  running: boolean,
  t: TranslateNS<'live2d'>,
): string {
  if (state === 'loading') return t('status.loading', { percent: progress })
  if (state === 'error') return t('status.error')
  if (state === 'ready' && running) return t('status.thinking')
  if (state === 'ready') return t('status.ready')
  return t('status.empty')
}

/** Directory selector attributes supported by Chromium and WebKit browsers. */
const directoryInputProps = {
  webkitdirectory: '',
  directory: '',
} as unknown as InputHTMLAttributes<HTMLInputElement>

/**
 * Render the companion in the shell's additive right workspace. The parent
 * flex layout accounts for the panel width, so model pixels never cover the
 * conversation or composer.
 */
export function Live2DOverlay({
  t,
  useSessions,
  usePetChat,
  activatePetChat,
  sendPetMessage,
  answerPetApproval,
  renderSlot,
}: Live2DOverlayProps) {
  const canvasRef = useRef<HTMLCanvasElement>(null)
  const fileInputRef = useRef<HTMLInputElement>(null)
  const [model, setModel] = useState<ModelBundle | null>(null)
  const [state, setState] = useState<LoadState>('empty')
  const [progress, setProgress] = useState(0)
  const [error, setError] = useState<string | null>(null)
  const [visible, setVisible] = useState(true)
  const [controlsOpen, setControlsOpen] = useState(false)
  const [scale, setScale] = useState(1)
  const [opacity, setOpacity] = useState(1)
  const desktopPetChatWindow = typeof window !== 'undefined'
    && new URLSearchParams(window.location.search).has('dshDesktopPetChat')
  const [chatOpen, setChatOpen] = useState(desktopPetChatWindow)
  const [chatDraft, setChatDraft] = useState('')
  const [galgameMode, setGalgameMode] = useState<GalgameMode | null>(() => readGalgameMode())
  const [galgameStoryActive, setGalgameStoryActive] = useState(() => readGalgameStoryActive())
  const [galgameStorySetup, setGalgameStorySetup] = useState(() => readGalgameStorySetup())
  const [galgameFocusMode, setGalgameFocusMode] = useState(() => readGalgameFocusMode())
  const [galgameSending, setGalgameSending] = useState(false)
  const [approvalAnswering, setApprovalAnswering] = useState(false)
  const chatEndRef = useRef<HTMLDivElement>(null)
  const savePromiseRef = useRef<Promise<void> | null>(null)
  const [desktopPet, setDesktopPet] = useState(() => (
    typeof window !== 'undefined' && new URLSearchParams(window.location.search).has('dshDesktopPet')
  ))
  const desktopShell = typeof navigator !== 'undefined'
    && navigator.userAgent.includes('DeepSeekHarnessQt')
  const primaryRunning = useSessions((snapshot: SessionListState) => {
    const current = snapshot.current
    return current !== undefined && snapshot.byId[current]?.running === true
  })
  const sessionsReady = useSessions((snapshot: SessionListState) => snapshot.phase === 'ready')
  const petChat = usePetChat(snapshot => snapshot)
  const running = desktopPet ? petChat.running : primaryRunning
  const approvalKey = petChat.pendingApproval?.key ?? null
  const separateDesktopPetChat = desktopPet && desktopShell
  const petChatMode: DesktopPetChatMode = galgameMode === null ? 'chat' : 'galgame'
  const lastPetMessage = petChat.messages[petChat.messages.length - 1]
  const galgameStoryStarted = galgameStoryActive || petChat.messages.some(message => (
    message.role === 'user'
      ? isGalgameControlMessage(message.text) && message.text.includes(GALGAME_STORY_CARD_MARKER)
      : parseGalgameReply(message.text).choices !== null
  ))
  const conversationMessages = petChat.messages.filter(message => (
    message.role !== 'user' || !isGalgameControlMessage(message.text)
  ))
  const displayedPetMessages = galgameMode === 'story' && galgameFocusMode
    ? conversationMessages.slice(-1)
    : conversationMessages

  useEffect(() => {
    setApprovalAnswering(false)
  }, [approvalKey])

  useEffect(() => {
    const syncGalgameMode = (event: StorageEvent): void => {
      if (event.key !== null && event.key !== GALGAME_MODE_STORAGE_KEY
        && event.key !== GALGAME_STORY_ACTIVE_STORAGE_KEY
        && event.key !== GALGAME_STORY_SETUP_STORAGE_KEY
        && event.key !== GALGAME_FOCUS_MODE_STORAGE_KEY) return
      setGalgameMode(readGalgameMode())
      setGalgameStoryActive(readGalgameStoryActive())
      setGalgameStorySetup(readGalgameStorySetup())
      setGalgameFocusMode(readGalgameFocusMode())
    }
    window.addEventListener('storage', syncGalgameMode)
    return () => { window.removeEventListener('storage', syncGalgameMode) }
  }, [])

  useEffect(() => {
    if (model === null) {
      setState('empty')
      setProgress(0)
      return
    }
    const canvas = canvasRef.current
    if (canvas === null) return

    setState('loading')
    setError(null)
    setProgress(0)
    return mountLive2D(canvas, model, {
      onProgress: (loaded, total) => {
        const next = total > 0 ? Math.min(100, Math.max(0, Math.round((loaded / total) * 100))) : 0
        setProgress(next)
      },
      onReady: () => { setState('ready'); setProgress(100) },
      onError: (loadError) => {
        setState('error')
        setError(errorText(loadError, t))
      },
    })
  }, [model, t])

  useEffect(() => {
    if (!desktopPet) return
    let cancelled = false
    const unsubscribe = subscribeToModelTransfer((next) => {
      if (!cancelled) setModel(next)
    })
    void loadModelBundle().then((next) => {
      if (!cancelled && next !== null) setModel(next)
    }).catch((storageError: unknown) => {
      console.error('[ui-live2d] failed to restore model for desktop pet', storageError)
    })
    return () => { cancelled = true; unsubscribe() }
  }, [desktopPet])

  useEffect(() => {
    const onDesktopPetChange = (): void => {
      setDesktopPet(new URLSearchParams(window.location.search).has('dshDesktopPet'))
    }
    window.addEventListener('dsh-desktop-pet-change', onDesktopPetChange)
    return () => { window.removeEventListener('dsh-desktop-pet-change', onDesktopPetChange) }
  }, [])

  useEffect(() => {
    if (!desktopPet) return
    const onDesktopPetScale = (event: Event): void => {
      const detail = (event as CustomEvent<unknown>).detail
      if (typeof detail !== 'object' || detail === null || !('scale' in detail)) return
      const nextScale = detail.scale
      if (typeof nextScale !== 'number' || !Number.isFinite(nextScale) || nextScale <= 0) return
      setScale(Math.max(DESKTOP_PET_SCALE_MIN, Number(nextScale.toFixed(6))))
    }
    window.addEventListener('dsh-desktop-pet-scale', onDesktopPetScale)
    return () => { window.removeEventListener('dsh-desktop-pet-scale', onDesktopPetScale) }
  }, [desktopPet])

  useEffect(() => {
    if (!desktopPet || !chatOpen || !sessionsReady) return
    void activatePetChat(petChatMode).catch(() => undefined)
  }, [activatePetChat, chatOpen, desktopPet, petChatMode, sessionsReady])

  useEffect(() => {
    if (!desktopPet || !desktopShell) return
    window.location.assign(`dsh://desktop-pet/chat/${chatOpen ? 'open' : 'close'}`)
  }, [chatOpen, desktopPet, desktopShell])

  useEffect(() => {
    if (!desktopPet || !desktopShell) return
    const onDesktopPetChatVisibility = (event: Event): void => {
      const detail = (event as CustomEvent<unknown>).detail
      if (typeof detail !== 'object' || detail === null || !('open' in detail)) return
      const open = detail.open
      if (typeof open === 'boolean') setChatOpen(open)
    }
    window.addEventListener('dsh-desktop-pet-chat-visibility', onDesktopPetChatVisibility)
    return () => {
      window.removeEventListener('dsh-desktop-pet-chat-visibility', onDesktopPetChatVisibility)
    }
  }, [desktopPet, desktopShell])

  useEffect(() => {
    if (!chatOpen) return
    chatEndRef.current?.scrollIntoView({ block: 'end' })
  }, [chatOpen, galgameMode, petChat.messages])

  const openPicker = (): void => { fileInputRef.current?.click() }

  const onFilesSelected = (event: ChangeEvent<HTMLInputElement>): void => {
    const files = Array.from(event.currentTarget.files ?? [])
    event.currentTarget.value = ''
    try {
      const next = buildModelBundle(files)
      setModel(next)
      savePromiseRef.current = saveModelBundle(next)
      void savePromiseRef.current.catch((storageError: unknown) => {
        console.error('[ui-live2d] failed to persist model bundle', storageError)
      })
      setState('loading')
      setError(null)
      setProgress(0)
      setControlsOpen(false)
    } catch (selectionError) {
      setState('error')
      setError(errorText(selectionError, t))
    }
  }

  const removeModel = (): void => {
    setModel(null)
    setState('empty')
    setError(null)
    setControlsOpen(true)
  }

  const submitPetChat = (event: FormEvent<HTMLFormElement>): void => {
    event.preventDefault()
    const text = chatDraft.trim()
    if (text === '') return
    void sendPetMessage(text, 'chat').then((accepted) => {
      if (accepted) setChatDraft('')
    }).catch(() => undefined)
  }

  const onPetChatKeyDown = (event: KeyboardEvent<HTMLTextAreaElement>): void => {
    if (event.key !== 'Enter' || event.shiftKey) return
    event.preventDefault()
    event.currentTarget.form?.requestSubmit()
  }

  const submitPetApproval = (outcome: DesktopPetChatApprovalOutcome): void => {
    setApprovalAnswering(true)
    void answerPetApproval(outcome).then((accepted) => {
      if (!accepted) setApprovalAnswering(false)
    }).catch(() => { setApprovalAnswering(false) })
  }

  const setGalgameScreen = (mode: GalgameMode | null): void => {
    setGalgameMode(mode)
    writeGalgameMode(mode)
  }

  const markGalgameStoryActive = (active: boolean): void => {
    setGalgameStoryActive(active)
    writeGalgameStoryActive(active)
  }

  const updateGalgameStorySetup = (next: GalgameStorySetup): void => {
    setGalgameStorySetup(next)
    writeGalgameStorySetup(next)
  }

  const submitGalgameMessage = (text: string, onAccepted?: () => void): void => {
    if (galgameSending) return
    setGalgameSending(true)
    void sendPetMessage(text, 'galgame')
      .then((accepted) => {
        if (accepted) onAccepted?.()
      })
      .catch(() => undefined)
      .finally(() => { setGalgameSending(false) })
  }

  const submitGalgameControl = (text: string, onAccepted?: () => void): void => {
    submitGalgameMessage(`${GALGAME_CONTROL_PREFIX}${text}`, onAccepted)
  }

  const selectGalgameMode = (mode: 'free' | 'story'): void => {
    if (petChat.status !== 'ready' || galgameMode === mode || galgameSending || petChat.running
      || petChat.sending || petChat.pendingApproval !== null) return
    setGalgameScreen(mode)
    if (mode === 'free') {
      if (galgameStoryActive) {
        submitGalgameControl(t('game.freePrompt'), () => { markGalgameStoryActive(false) })
      }
      return
    }
    if (!galgameStoryStarted) {
      setGalgameScreen('setup')
      return
    }
    setGalgameScreen('story')
    const latestConversationMessage = [...conversationMessages].reverse()[0]
    const hasCurrentChoices = latestConversationMessage?.role === 'assistant'
      && parseGalgameReply(latestConversationMessage.text).choices !== null
    if (hasCurrentChoices) {
      markGalgameStoryActive(true)
      return
    }
    submitGalgameControl(t('game.continuePrompt'), () => { markGalgameStoryActive(true) })
  }

  const startGalgameStory = (event: FormEvent<HTMLFormElement>): void => {
    event.preventDefault()
    if (galgameSending || petChat.running || petChat.sending || petChat.pendingApproval !== null) return
    writeGalgameStorySetup(galgameStorySetup)
    const setupLines = [
      `${t('game.storyToneLabel')}: ${t(galgameToneLabels[galgameStorySetup.tone])}`,
      ...(galgameStorySetup.character.trim() === ''
        ? [] : [`${t('game.characterLabel')}: ${galgameStorySetup.character.trim()}`]),
      ...(galgameStorySetup.player.trim() === ''
        ? [] : [`${t('game.playerRoleLabel')}: ${galgameStorySetup.player.trim()}`]),
      ...(galgameStorySetup.scenario.trim() === ''
        ? [] : [`${t('game.scenarioLabel')}: ${galgameStorySetup.scenario.trim()}`]),
    ]
    const prompt = galgameStoryStarted ? t('game.updateSetupPrompt') : t('game.storyPrompt')
    const storyCard = [
      `${prompt}\n\n${GALGAME_STORY_CARD_MARKER}`,
      setupLines.join('\n'),
    ].filter(line => line !== '').join('\n')
    setGalgameScreen('story')
    submitGalgameControl(storyCard, () => { markGalgameStoryActive(true) })
  }

  const toggleGalgameFocusMode = (): void => {
    const next = !galgameFocusMode
    setGalgameFocusMode(next)
    writeGalgameFocusMode(next)
  }

  const submitStoryChoice = (choice: string): void => {
    submitGalgameMessage(choice)
  }

  const retryStoryChoices = (): void => {
    submitGalgameControl(t('game.retryPrompt'))
  }

  const exitGalgame = (): void => {
    setGalgameScreen(null)
    if (galgameStoryActive) {
      submitGalgameControl(t('game.freePrompt'), () => { markGalgameStoryActive(false) })
    }
  }

  if (!visible) {
    return (
      <button
        type="button"
        className={css.restoreButton}
        aria-label={t('action.show')}
        onClick={() => { setVisible(true) }}
      >
        <span className={css.restoreDot} aria-hidden="true" />
        {t('brand')}
      </button>
    )
  }

  const displayStatus = statusText(state, progress, running, t)
  return (
    <section
      className={css.root}
      data-live2d-companion="true"
      data-desktop-pet={desktopPet || undefined}
      data-desktop-pet-chat={desktopPetChatWindow || undefined}
      data-state={state}
      data-running={running || undefined}
      data-desktop-pet-chat-open={chatOpen || undefined}
      aria-label={t('brand')}
    >
      <header className={css.header}>
        <span className={css.brandMark} aria-hidden="true"><IconSparkle16 size={16} /></span>
        <div className={css.heading}>
          <p className={css.title}>{t('brand')}</p>
          <p className={css.subtitle}>{t('subtitle')}</p>
        </div>
        <span className={css.status} role="status" aria-live="polite">
          <span className={css.statusDot} aria-hidden="true" />
          <span>{displayStatus}</span>
        </span>
        <button
          type="button"
          className={css.iconButton}
          aria-label={t('action.hide')}
          onClick={() => { setVisible(false) }}
        >
          <IconCloseOutline16 size={16} />
        </button>
      </header>

      <div className={css.stage} data-model-loaded={model !== null || undefined}>
        {model === null ? (
          <div className={css.emptyState}>
            <span className={css.emptyGlyph} aria-hidden="true"><IconSparkle16 size={20} /></span>
            <p className={css.emptyTitle}>{t('empty.title')}</p>
            <p className={css.emptyDescription}>{t('empty.description')}</p>
            <p className={css.localNotice}>{t('empty.local')}</p>
          </div>
        ) : (
          <canvas
            ref={canvasRef}
            className={css.canvas}
            style={{
              opacity,
              width: desktopPet ? `${Math.round(DESKTOP_PET_BASE_WIDTH * scale)}px` : undefined,
              height: desktopPet ? `${Math.round(DESKTOP_PET_BASE_HEIGHT * scale)}px` : undefined,
              transform: desktopPet ? undefined : `scale(${scale})`,
            }}
            role="img"
            aria-label={model.name}
          />
        )}

        {model !== null && state === 'loading' && (
          <div className={css.loading} aria-hidden="true">
            <div className={css.loadingTrack}>
              <div className={css.loadingBar} style={{ width: `${progress}%` }} />
            </div>
            <p className={css.statusText}>{t('model.loading', { name: model.name })}</p>
          </div>
        )}
        {model !== null && <span className={css.modelBadge}>{model.name}</span>}
      </div>

      {desktopPet && !desktopPetChatWindow && (
        <>
          <button
            type="button"
            className={css.galgameOpenButton}
            aria-label={t('game.open')}
            onClick={() => {
              setGalgameScreen('choose')
              setChatOpen(true)
            }}
          >
            Galgame
          </button>
          <button
            type="button"
            className={css.chatToggle}
            aria-label={chatOpen ? t('chat.close') : t('chat.open')}
            aria-expanded={chatOpen}
            onClick={() => { setChatOpen(open => !open) }}
          >
            {chatOpen ? <IconCloseOutline16 size={18} /> : <IconNewChatOutline16 size={18} />}
          </button>
        </>
      )}

      {desktopPet && chatOpen && (!separateDesktopPetChat || desktopPetChatWindow) && (
        <aside
          className={css.chatPanel}
          aria-label={galgameMode === null ? t('chat.title') : t('game.title')}
          data-galgame-mode={galgameMode ?? undefined}
        >
          <header className={css.chatHeader}>
            <div>
              <p className={css.chatTitle}>{galgameMode === null ? t('chat.title') : t('game.title')}</p>
              <p className={css.chatIsolation}>
                {galgameMode === null
                  ? t('chat.isolated')
                  : galgameMode === 'choose'
                    ? t('game.intro')
                    : galgameMode === 'setup' ? t('game.setupTitle') : t(`game.${galgameMode}`)}
              </p>
            </div>
            <div className={css.chatHeaderActions}>
              {galgameMode !== null && (
                <button
                  type="button"
                  className={css.galgameHeaderButton}
                  aria-label={t('game.exit')}
                  disabled={galgameSending || petChat.running || petChat.sending
                    || petChat.pendingApproval !== null}
                  onClick={exitGalgame}
                >
                  {t('game.exit')}
                </button>
              )}
              {desktopPetChatWindow && petChat.sessionId !== undefined && (
                <div className={css.chatModelSelect}>
                  {renderSlot('desktop-pet.model', {
                    sessionId: petChat.sessionId,
                    locked: petChat.pendingApproval !== null,
                  })}
                </div>
              )}
              <button
                type="button"
                className={css.chatClose}
                aria-label={t('chat.close')}
                onClick={() => { setChatOpen(false) }}
              >
                <IconCloseOutline16 size={16} />
              </button>
            </div>
          </header>
          {galgameMode === 'choose'
            ? (
              <div className={css.galgameChooser}>
                <button
                  type="button"
                  className={css.galgameModeCard}
                  disabled={petChat.status !== 'ready' || galgameSending || petChat.running
                    || petChat.sending || petChat.pendingApproval !== null}
                  onClick={() => { selectGalgameMode('free') }}
                >
                  <span className={css.galgameModeName}>{t('game.free')}</span>
                  <span className={css.galgameModeDescription}>{t('game.freeDescription')}</span>
                </button>
                <button
                  type="button"
                  className={css.galgameModeCard}
                  disabled={petChat.status !== 'ready' || galgameSending || petChat.running
                    || petChat.sending || petChat.pendingApproval !== null}
                  onClick={() => { selectGalgameMode('story') }}
                >
                  <span className={css.galgameModeName}>{t('game.story')}</span>
                  <span className={css.galgameModeDescription}>{t('game.storyDescription')}</span>
                </button>
              </div>
            )
            : (
              <>
                {galgameMode === 'setup' && (
                  <form className={css.galgameStorySetup} onSubmit={startGalgameStory}>
                    <p className={css.galgameSetupHint}>{t('game.setupHint')}</p>
                    <label className={css.galgameSetupField}>
                      <span>{t('game.storyToneLabel')}</span>
                      <select
                        className={css.galgameSetupSelect}
                        value={galgameStorySetup.tone}
                        onChange={(event) => {
                          updateGalgameStorySetup({ ...galgameStorySetup, tone: event.currentTarget.value as GalgameTone })
                        }}
                      >
                        {(Object.keys(galgameToneLabels) as GalgameTone[]).map(tone => (
                          <option key={tone} value={tone}>{t(galgameToneLabels[tone])}</option>
                        ))}
                      </select>
                    </label>
                    <label className={css.galgameSetupField}>
                      <span>{t('game.characterLabel')}</span>
                      <textarea
                        className={css.galgameSetupInput}
                        rows={2}
                        maxLength={GALGAME_SETUP_TEXT_LIMIT}
                        value={galgameStorySetup.character}
                        placeholder={t('game.characterPlaceholder')}
                        onChange={(event) => {
                          updateGalgameStorySetup({ ...galgameStorySetup, character: event.currentTarget.value })
                        }}
                      />
                    </label>
                    <label className={css.galgameSetupField}>
                      <span>{t('game.playerRoleLabel')}</span>
                      <textarea
                        className={css.galgameSetupInput}
                        rows={2}
                        maxLength={GALGAME_SETUP_TEXT_LIMIT}
                        value={galgameStorySetup.player}
                        placeholder={t('game.playerRolePlaceholder')}
                        onChange={(event) => {
                          updateGalgameStorySetup({ ...galgameStorySetup, player: event.currentTarget.value })
                        }}
                      />
                    </label>
                    <label className={css.galgameSetupField}>
                      <span>{t('game.scenarioLabel')}</span>
                      <textarea
                        className={css.galgameSetupInput}
                        rows={3}
                        maxLength={GALGAME_SETUP_TEXT_LIMIT}
                        value={galgameStorySetup.scenario}
                        placeholder={t('game.scenarioPlaceholder')}
                        onChange={(event) => {
                          updateGalgameStorySetup({ ...galgameStorySetup, scenario: event.currentTarget.value })
                        }}
                      />
                    </label>
                    <button
                      type="submit"
                      className={css.galgameSetupSubmit}
                      disabled={petChat.status !== 'ready' || galgameSending || petChat.running
                      || petChat.sending || petChat.pendingApproval !== null}
                    >
                      {galgameStoryStarted ? t('game.applySetup') : t('game.startStory')}
                    </button>
                  </form>
                )}
                {galgameMode !== null && (
                  <div className={css.galgameToolbar}>
                    <div className={css.galgameModeTabs} role="tablist" aria-label={t('game.title')}>
                      {(['free', 'story'] as const).map(mode => (
                        <button
                          key={mode}
                          type="button"
                          role="tab"
                          aria-selected={galgameMode === mode}
                          className={css.galgameModeTab}
                          disabled={galgameSending || petChat.running || petChat.sending || petChat.pendingApproval !== null}
                          onClick={() => { selectGalgameMode(mode) }}
                        >
                          {t(`game.${mode}`)}
                        </button>
                      ))}
                    </div>
                    {galgameMode === 'story' && (
                      <div className={css.galgamePresentationActions}>
                        <button
                          type="button"
                          className={css.galgameModeTab}
                          aria-pressed={galgameFocusMode}
                          onClick={toggleGalgameFocusMode}
                        >
                          {galgameFocusMode ? t('game.showHistory') : t('game.focus')}
                        </button>
                        <button
                          type="button"
                          className={css.galgameModeTab}
                          disabled={galgameSending || petChat.running || petChat.sending
                            || petChat.pendingApproval !== null}
                          onClick={() => { setGalgameScreen('setup') }}
                        >
                          {t('game.editSetup')}
                        </button>
                      </div>
                    )}
                  </div>
                )}
                <div
                  className={css.chatMessages}
                  data-galgame-focus={galgameMode === 'story' && galgameFocusMode || undefined}
                  aria-live="polite"
                >
                  {petChat.status === 'loading' && (
                    <p className={css.chatNotice}>{t('chat.loading')}</p>
                  )}
                  {petChat.status === 'ready' && displayedPetMessages.length === 0 && (
                    <p className={css.chatNotice}>
                      {galgameMode === 'story' ? t('game.storyEmpty') : t('chat.empty')}
                    </p>
                  )}
                  {displayedPetMessages.map((message) => {
                    const storyReply = galgameMode === 'story' && message.role === 'assistant'
                      ? parseGalgameReply(message.text)
                      : null
                    const visibleText = storyReply?.narrative ?? message.text
                    const isLatestAssistant = lastPetMessage?.id === message.id
                    return message.role === 'user'
                      ? (
                        <p key={message.id} className={css.chatMessageUser}>
                          {message.text}
                        </p>
                      )
                      : (
                        <div
                          key={message.id}
                          className={css.chatMessageAssistant}
                          data-streaming={message.streaming || undefined}
                        >
                          {visibleText !== '' && (
                            <MarkdownText text={visibleText} streaming={message.streaming === true} />
                          )}
                          {storyReply !== null && storyReply.choices !== null
                            && !message.streaming && isLatestAssistant && (
                            <div className={css.galgameChoices}>
                              <p className={css.galgameChoiceHint}>{t('game.chooseHint')}</p>
                              {storyReply.choices.map((choice, index) => (
                                <button
                                  key={`${message.id}-choice-${index + 1}`}
                                  type="button"
                                  className={css.galgameChoiceButton}
                                  disabled={galgameSending || petChat.running || petChat.sending
                                    || petChat.pendingApproval !== null}
                                  onClick={() => { submitStoryChoice(choice) }}
                                >
                                  <span className={css.galgameChoiceNumber}>{index + 1}</span>
                                  <span>{choice}</span>
                                </button>
                              ))}
                            </div>
                          )}
                          {storyReply !== null && storyReply.choices === null
                            && !message.streaming && isLatestAssistant && !petChat.running && (
                            <div className={css.galgameRetry}>
                              <p>{t('game.noChoices')}</p>
                              <button
                                type="button"
                                className={css.galgameRetryButton}
                                disabled={galgameSending || petChat.sending || petChat.pendingApproval !== null}
                                onClick={retryStoryChoices}
                              >
                                {t('game.retryChoices')}
                              </button>
                            </div>
                          )}
                        </div>
                      )
                  })}
                  {petChat.pendingApproval !== null && (
                    <section className={css.chatApproval} data-approval-key={petChat.pendingApproval.key}>
                      <div className={css.chatApprovalHeader}>
                        <span className={css.chatApprovalDot} aria-hidden="true" />
                        {t('chat.approval.waiting')}
                      </div>
                      <div
                        className={css.chatApprovalBody}
                        data-approval-scroll=""
                        tabIndex={0}
                        role="group"
                        aria-label={t('chat.approval.detailAria')}
                      >
                        <p className={css.chatApprovalReason}>
                          {petChat.pendingApproval.reason
                            ?? t('chat.approval.escalation', { toolName: petChat.pendingApproval.toolName })}
                        </p>
                        {petChat.pendingApproval.command !== undefined && (
                          <p className={css.chatApprovalCommand}>{petChat.pendingApproval.command}</p>
                        )}
                      </div>
                      <div className={css.chatApprovalActions}>
                        <Button
                          variant="outline"
                          className={css.chatApprovalReject}
                          disabled={approvalAnswering}
                          onClick={() => { submitPetApproval('rejected') }}
                        >
                          {t('chat.approval.reject')}
                        </Button>
                        <Button
                          variant="primary"
                          disabled={approvalAnswering}
                          onClick={() => { submitPetApproval('allowed-once') }}
                        >
                          {t('chat.approval.allowOnce')}
                        </Button>
                      </div>
                    </section>
                  )}
                  {petChat.running && (
                    <p className={css.chatThinking}>{t('chat.thinking')}</p>
                  )}
                  <div ref={chatEndRef} />
                </div>
                {galgameMode !== 'story' && (
                  <form className={css.chatComposer} onSubmit={submitPetChat}>
                    <textarea
                      className={css.chatInput}
                      rows={1}
                      value={chatDraft}
                      placeholder={t('chat.placeholder')}
                      aria-label={t('chat.placeholder')}
                      disabled={!sessionsReady || galgameSending || petChat.sending || petChat.pendingApproval !== null}
                      onChange={(event) => { setChatDraft(event.currentTarget.value) }}
                      onKeyDown={onPetChatKeyDown}
                    />
                    <button
                      type="submit"
                      className={css.chatSend}
                      aria-label={petChat.sending ? t('chat.sending') : t('chat.send')}
                      disabled={!sessionsReady || galgameSending || petChat.sending || petChat.pendingApproval !== null || chatDraft.trim() === ''}
                    >
                      <IconSendOutline16 size={16} />
                    </button>
                  </form>
                )}
              </>
            )}
          {petChat.error !== null && (
            <p className={css.chatError} role="alert">
              {t('chat.error', { message: petChat.error })}
            </p>
          )}
        </aside>
      )}

      {model !== null && (
        <div className={css.modelInfo}>
          <div className={css.modelInfoText}>
            <p className={css.modelName}>{model.name}</p>
            <p className={css.modelFiles}>{t('model.files', { count: model.files.length })}</p>
          </div>
        </div>
      )}

      {error !== null && <p className={css.error} role="alert">{error}</p>}

      {controlsOpen && model !== null && (
        <div className={css.controls}>
          <div className={css.controlsHeader}>
            <p className={css.controlsTitle}>{t('controls.title')}</p>
            <IconSettingsOutline16 size={14} />
          </div>
          <label>
            <span className={css.rangeHeader}>
              <span className={css.rangeLabel}>{t('controls.scale')}</span>
              <span className={css.rangeValue}>{Math.round(scale * 100)}%</span>
            </span>
            <input
              className={css.range}
              type="range"
              min={String(WORKSPACE_SCALE_MIN)}
              max={String(WORKSPACE_SCALE_MAX)}
              step={String(WORKSPACE_SCALE_STEP)}
              value={scale}
              aria-label={t('controls.scale')}
              onChange={(event) => { setScale(Number(event.currentTarget.value)) }}
            />
          </label>
          <label>
            <span className={css.rangeHeader}>
              <span className={css.rangeLabel}>{t('controls.opacity')}</span>
              <span className={css.rangeValue}>{Math.round(opacity * 100)}%</span>
            </span>
            <input
              className={css.range}
              type="range"
              min="0.35"
              max="1"
              step="0.05"
              value={opacity}
              aria-label={t('controls.opacity')}
              onChange={(event) => { setOpacity(Number(event.currentTarget.value)) }}
            />
          </label>
        </div>
      )}

      <footer className={css.footer}>
        <Button
          className={css.uploadButton}
          variant="primary"
          size="sm"
          icon={<IconFolderOpenOutline16 size={15} />}
          onClick={openPicker}
        >
          {model === null ? t('action.upload') : t('action.change')}
        </Button>
        {model !== null && (
          <Button
            className={css.removeButton}
            variant="ghost"
            size="sm"
            icon={<IconTrashOutline16 size={15} />}
            aria-label={t('action.clear')}
            onClick={removeModel}
          />
        )}
        {model !== null && (
          <button
            type="button"
            className={css.controlButton}
            aria-expanded={controlsOpen}
            onClick={() => { setControlsOpen(open => !open) }}
          >
            {controlsOpen ? t('action.closeControls') : t('action.openControls')}
          </button>
        )}
        {desktopShell && model !== null && (
          <button
            type="button"
            className={css.controlButton}
            aria-label={desktopPet ? t('action.exitDesktopPet') : t('action.desktopPet')}
            onClick={() => {
              const next = model
              void (savePromiseRef.current ?? Promise.resolve()).catch(() => undefined).then(() => {
                window.location.assign('dsh://desktop-pet/toggle')
                for (const delay of [500, 1500, 3000]) {
                  window.setTimeout(() => {
                    try {
                      broadcastModelBundle(next)
                    } catch (transferError: unknown) {
                      console.error('[ui-live2d] failed to transfer model to desktop pet', transferError)
                    }
                  }, delay)
                }
              })
            }}
          >
            {desktopPet ? t('action.exitDesktopPet') : t('action.desktopPet')}
          </button>
        )}
      </footer>

      <input
        ref={fileInputRef}
        className={css.hiddenInput}
        type="file"
        multiple
        accept=".model3.json,.model.json,.moc3,.moc,.png,.jpg,.jpeg,.webp,.json,.motion3.json,.motion.json,.mtn,.exp3.json,.exp.json,.physics3.json,.physics.json,.pose3.json,.ogg,.mp3,.wav"
        aria-label={t('action.upload')}
        onChange={onFilesSelected}
        {...directoryInputProps}
      />
    </section>
  )
}
