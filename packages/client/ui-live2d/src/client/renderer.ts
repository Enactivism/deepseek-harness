/** Small l2d adapter that keeps the renderer lifecycle under React's effect. */

// l2d publishes its browser ESM entry under dist/; its package.json keeps a
// legacy CommonJS `main` that does not exist, so the explicit ESM entry keeps
// both Vite and TypeScript on the same resolvable file.
import { init, type L2D } from 'l2d/dist/index.js'
import type { ModelBundle } from './model-files.ts'
import { prepareLocalModel, type PreparedLocalModel } from './local-model.ts'

/** Renderer events consumed by the companion surface. */
export interface Live2DRendererCallbacks {
  onProgress: (loaded: number, total: number) => void
  onReady: () => void
  onError: (error: unknown) => void
}

/**
 * l2d builds every asset URL with string concatenation. That works for a
 * normal HTTP directory, but a browser-selected file is represented by a
 * `blob:` URL and therefore has no real directory. Translate l2d's generated
 * blob paths back to the object URLs owned by the selected files while a model
 * is loading.
 */
function installLocalResourceResolver(prepared: PreparedLocalModel): () => void {
  const originalFetch = globalThis.fetch
  const resolveFetchInput = (input: RequestInfo | URL): RequestInfo | URL => {
    if (typeof input === 'string') return prepared.resolveUrl(input)
    if (input instanceof Request) {
      const resolved = prepared.resolveUrl(input.url)
      return resolved === input.url ? input : new Request(resolved, input)
    }
    const resolved = prepared.resolveUrl(input.toString())
    return resolved === input.toString() ? input : resolved
  }
  globalThis.fetch = (input: RequestInfo | URL, init?: RequestInit) => (
    originalFetch.call(globalThis, resolveFetchInput(input), init)
  )

  const imagePrototype = HTMLImageElement.prototype
  const imageSrcDescriptor = Object.getOwnPropertyDescriptor(imagePrototype, 'src')
  if (imageSrcDescriptor?.set !== undefined) {
    Object.defineProperty(imagePrototype, 'src', {
      ...imageSrcDescriptor,
      set(value: string) {
        imageSrcDescriptor.set?.call(this, prepared.resolveUrl(value))
      },
    })
  }

  return () => {
    globalThis.fetch = originalFetch
    if (imageSrcDescriptor !== undefined) {
      Object.defineProperty(imagePrototype, 'src', imageSrcDescriptor)
    }
  }
}

/**
 * Start loading one local model and return a synchronous disposer. The
 * disposer is safe to call while the model JSON or WebGL resources are still
 * loading, which matters when the user selects a second model quickly.
 */
export function mountLive2D(
  canvas: HTMLCanvasElement,
  bundle: ModelBundle,
  callbacks: Live2DRendererCallbacks,
): () => void {
  let disposed = false
  let runtime: L2D | null = null
  let prepared: PreparedLocalModel | null = null
  let restoreResourceResolver: (() => void) | null = null

  const isActive = (): boolean => !disposed
  const release = (): void => {
    restoreResourceResolver?.()
    restoreResourceResolver = null
    try {
      runtime?.destroy()
    } catch {
      // A partially initialized WebGL context can reject destruction; the DOM
      // and object URLs still need to be released below.
    }
    runtime = null
    prepared?.dispose()
    prepared = null
  }

  const start = async (): Promise<void> => {
    const next = await prepareLocalModel(bundle)
    if (!isActive()) {
      next.dispose()
      return
    }
    prepared = next
    runtime = init(canvas)
    restoreResourceResolver = installLocalResourceResolver(next)

    runtime.on('loadstart', (total) => { callbacks.onProgress(0, total) })
    runtime.on('loadprogress', (loaded, total) => { callbacks.onProgress(loaded, total) })
    try {
      await runtime.load({ path: next.entryUrl })
    } finally {
      restoreResourceResolver()
      restoreResourceResolver = null
    }
    if (isActive()) callbacks.onReady()
  }

  void start().catch((error: unknown) => {
    release()
    if (isActive()) callbacks.onError(error)
  })

  return () => {
    if (disposed) return
    disposed = true
    release()
  }
}
