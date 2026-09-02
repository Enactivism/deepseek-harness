import type { ModelBundle } from './model-files.ts'
import { filePath } from './model-files.ts'

const channelName = 'dsh-live2d-transfer'

interface TransferFile {
  readonly path: string
  readonly name: string
  readonly type: string
  readonly lastModified: number
  readonly file: File
}

interface TransferMessage {
  readonly kind: 'model'
  readonly name: string
  readonly entryPath: string
  readonly files: readonly TransferFile[]
}

/** Send the selected model directly to an already-open or soon-to-open pet page. */
export function broadcastModelBundle(bundle: ModelBundle): void {
  if (typeof BroadcastChannel === 'undefined') throw new Error('BroadcastChannel is unavailable')
  const files: TransferFile[] = bundle.files.map(file => ({
    path: filePath(file),
    name: file.name,
    type: file.type,
    lastModified: file.lastModified,
    file,
  }))
  const channel = new BroadcastChannel(channelName)
  const message: TransferMessage = {
    kind: 'model', name: bundle.name, entryPath: bundle.entryPath, files,
  }
  channel.postMessage(message)
  window.setTimeout(() => { channel.close() }, 5000)
}

/** Subscribe to model transfers from the main workspace page. */
export function subscribeToModelTransfer(onModel: (model: ModelBundle) => void): () => void {
  if (typeof BroadcastChannel === 'undefined') return () => {}
  const channel = new BroadcastChannel(channelName)
  const onMessage = (event: MessageEvent<TransferMessage>): void => {
    const message = event.data
    if (message?.kind !== 'model') return
    onModel({
      name: message.name,
      entryPath: message.entryPath,
      files: message.files.map((file) => {
        const restored = file.file as File & { webkitRelativePath: string }
        Object.defineProperty(restored, 'webkitRelativePath', { value: file.path })
        return restored
      }),
    })
  }
  channel.addEventListener('message', onMessage)
  return () => { channel.removeEventListener('message', onMessage); channel.close() }
}
