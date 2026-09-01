/** Right-workspace Live2D companion surface and local model picker. */

import { useEffect, useRef, useState, type ChangeEvent, type InputHTMLAttributes } from 'react'
import type { SessionListState } from '@deepseek-ai/dsh-client-runtime/client'
import {
  Button,
  IconCloseOutline16,
  IconFolderOpenOutline16,
  IconSettingsOutline16,
  IconSparkle16,
  IconTrashOutline16,
} from '@deepseek-ai/dsh-client-ui-primitives'
import type { PropsLocale, PropsRuntime, TranslateNS } from '@deepseek-ai/dsh-client-ui-slots'
import type { Live2DKey } from './locales.ts'
import { buildModelBundle, ModelImportError, type ModelBundle } from './model-files.ts'
import { mountLive2D } from './renderer.ts'
import css from './Live2DOverlay.module.css'

/** Props composed by the shell's additive right-workspace slot. */
export type Live2DOverlayProps = PropsRuntime<'shell.right'> & PropsLocale<'live2d'>

type LoadState = 'empty' | 'loading' | 'ready' | 'error'

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
export function Live2DOverlay({ t, useSessions }: Live2DOverlayProps) {
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
  const running = useSessions((snapshot: SessionListState) => {
    const current = snapshot.current
    return current !== undefined && snapshot.byId[current]?.running === true
  })

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

  const openPicker = (): void => { fileInputRef.current?.click() }

  const onFilesSelected = (event: ChangeEvent<HTMLInputElement>): void => {
    const files = Array.from(event.currentTarget.files ?? [])
    event.currentTarget.value = ''
    try {
      const next = buildModelBundle(files)
      setModel(next)
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
      data-state={state}
      data-running={running || undefined}
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
            style={{ opacity, transform: `scale(${scale})` }}
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
              min="0.7"
              max="1.35"
              step="0.05"
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
