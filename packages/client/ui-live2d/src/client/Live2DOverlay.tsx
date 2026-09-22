/** Right-workspace Live2D companion surface and local model picker. */

import {
  useEffect, useRef, useState, type ChangeEvent, type FormEvent,
  type InputHTMLAttributes, type KeyboardEvent,
} from 'react'
import type { ObservableSnapshot, SessionListState } from '@deepseek-ai/dsh-client-runtime/client'
import {
  Button,
  IconCloseOutline16,
  IconFolderOpenOutline16,
  IconNewChatOutline16,
  IconSendOutline16,
  IconSettingsOutline16,
  IconSparkle16,
  IconTrashOutline16,
} from '@deepseek-ai/dsh-client-ui-primitives'
import type {
  InjectFace, PropsLocale, PropsRuntime, TranslateNS,
} from '@deepseek-ai/dsh-client-ui-slots'
import type { DesktopPetChatView } from './desktop-pet-chat.ts'
import type { Live2DKey } from './locales.ts'
import { buildModelBundle, ModelImportError, type ModelBundle } from './model-files.ts'
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
  activatePetChat: () => Promise<void>
  /**
   * Send one text message to the desktop pet's isolated Session.
   * @param text - trimmed non-empty message.
   * @returns whether the Host accepted the message.
   */
  sendPetMessage: (text: string) => Promise<boolean>
}

/** Props composed by the shell's additive right-workspace slot. */
export type Live2DOverlayProps =
  PropsRuntime<'shell.right'>
  & PropsLocale<'live2d'>
  & InjectFace<DesktopPetChatInjected>

type LoadState = 'empty' | 'loading' | 'ready' | 'error'

const DESKTOP_PET_SCALE_MIN = 2 / 3
const DESKTOP_PET_BASE_WIDTH = 360
const DESKTOP_PET_BASE_HEIGHT = 480
const WORKSPACE_SCALE_MIN = 0.7
const WORKSPACE_SCALE_MAX = 1.35
const WORKSPACE_SCALE_STEP = 0.05

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
  const [chatOpen, setChatOpen] = useState(false)
  const [chatDraft, setChatDraft] = useState('')
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
    void activatePetChat().catch(() => undefined)
  }, [activatePetChat, chatOpen, desktopPet, sessionsReady])

  useEffect(() => {
    if (!desktopPet || !desktopShell) return
    window.location.assign(`dsh://desktop-pet/chat/${chatOpen ? 'open' : 'close'}`)
  }, [chatOpen, desktopPet, desktopShell])

  useEffect(() => {
    if (!chatOpen) return
    chatEndRef.current?.scrollIntoView({ block: 'end' })
  }, [chatOpen, petChat.messages])

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
    void sendPetMessage(text).then((accepted) => {
      if (accepted) setChatDraft('')
    }).catch(() => undefined)
  }

  const onPetChatKeyDown = (event: KeyboardEvent<HTMLTextAreaElement>): void => {
    if (event.key !== 'Enter' || event.shiftKey) return
    event.preventDefault()
    event.currentTarget.form?.requestSubmit()
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

      {desktopPet && (
        <button
          type="button"
          className={css.chatToggle}
          aria-label={chatOpen ? t('chat.close') : t('chat.open')}
          aria-expanded={chatOpen}
          onClick={() => { setChatOpen(open => !open) }}
        >
          {chatOpen ? <IconCloseOutline16 size={18} /> : <IconNewChatOutline16 size={18} />}
        </button>
      )}

      {desktopPet && chatOpen && (
        <aside className={css.chatPanel} aria-label={t('chat.title')}>
          <header className={css.chatHeader}>
            <div>
              <p className={css.chatTitle}>{t('chat.title')}</p>
              <p className={css.chatIsolation}>{t('chat.isolated')}</p>
            </div>
            <button
              type="button"
              className={css.chatClose}
              aria-label={t('chat.close')}
              onClick={() => { setChatOpen(false) }}
            >
              <IconCloseOutline16 size={16} />
            </button>
          </header>
          <div className={css.chatMessages} aria-live="polite">
            {petChat.status === 'loading' && (
              <p className={css.chatNotice}>{t('chat.loading')}</p>
            )}
            {petChat.status === 'ready' && petChat.messages.length === 0 && (
              <p className={css.chatNotice}>{t('chat.empty')}</p>
            )}
            {petChat.messages.map(message => (
              <p
                key={message.id}
                className={message.role === 'user' ? css.chatMessageUser : css.chatMessageAssistant}
                data-streaming={message.streaming || undefined}
              >
                {message.text}
              </p>
            ))}
            {petChat.running && (
              <p className={css.chatThinking}>{t('chat.thinking')}</p>
            )}
            <div ref={chatEndRef} />
          </div>
          {petChat.error !== null && (
            <p className={css.chatError} role="alert">
              {t('chat.error', { message: petChat.error })}
            </p>
          )}
          <form className={css.chatComposer} onSubmit={submitPetChat}>
            <textarea
              className={css.chatInput}
              rows={1}
              value={chatDraft}
              placeholder={t('chat.placeholder')}
              aria-label={t('chat.placeholder')}
              disabled={!sessionsReady || petChat.sending}
              onChange={(event) => { setChatDraft(event.currentTarget.value) }}
              onKeyDown={onPetChatKeyDown}
            />
            <button
              type="submit"
              className={css.chatSend}
              aria-label={petChat.sending ? t('chat.sending') : t('chat.send')}
              disabled={!sessionsReady || petChat.sending || chatDraft.trim() === ''}
            >
              <IconSendOutline16 size={16} />
            </button>
          </form>
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
