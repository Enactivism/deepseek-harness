import type { ModelBundle } from './model-files.ts'
import { filePath } from './model-files.ts'

const databaseName = 'dsh-live2d'
const storeName = 'model'

function readFile(file: File): Promise<ArrayBuffer> {
  if (typeof file.arrayBuffer === 'function') return file.arrayBuffer()
  return new Promise((resolve, reject) => {
    const reader = new FileReader()
    reader.onload = () => {
      if (reader.result instanceof ArrayBuffer) resolve(reader.result)
      else reject(new Error('FileReader returned an invalid result'))
    }
    reader.onerror = () => { reject(reader.error ?? new Error('Failed to read model file')) }
    reader.readAsArrayBuffer(file)
  })
}

interface StoredFile {
  readonly path: string
  readonly name: string
  readonly type: string
  readonly lastModified: number
  readonly bytes: ArrayBuffer
}

interface StoredModel {
  readonly name: string
  readonly entryPath: string
  readonly files: readonly StoredFile[]
}

function openDatabase(): Promise<IDBDatabase> {
  return new Promise((resolve, reject) => {
    const request = indexedDB.open(databaseName, 1)
    request.onupgradeneeded = () => { request.result.createObjectStore(storeName) }
    request.onsuccess = () => { resolve(request.result) }
    request.onerror = () => { reject(request.error ?? new Error('Live2D model storage failed')) }
  })
}

/**
 * Persist the selected model so an independent desktop-pet page can load it.
 * @param bundle Model files and entry path to store.
 */
export async function saveModelBundle(bundle: ModelBundle): Promise<void> {
  if (typeof indexedDB === 'undefined') throw new Error('IndexedDB is unavailable')
  const files: StoredFile[] = []
  for (const file of bundle.files) {
    files.push({
      path: filePath(file),
      name: file.name,
      type: file.type,
      lastModified: file.lastModified,
      bytes: await readFile(file),
    })
  }
  const database = await openDatabase()
  try {
    await new Promise<void>((resolve, reject) => {
      const request = database.transaction(storeName, 'readwrite').objectStore(storeName)
        .put({ name: bundle.name, entryPath: bundle.entryPath, files }, 'current')
      request.onsuccess = () => { resolve() }
      request.onerror = () => { reject(request.error ?? new Error('Live2D model storage failed')) }
    })
  } finally {
    database.close()
  }
}

/**
 * Remove the persisted model so an explicit UI removal survives the next launch.
 */
export async function clearModelBundle(): Promise<void> {
  if (typeof indexedDB === 'undefined') throw new Error('IndexedDB is unavailable')
  const database = await openDatabase()
  try {
    await new Promise<void>((resolve, reject) => {
      const request = database.transaction(storeName, 'readwrite').objectStore(storeName).delete('current')
      request.onsuccess = () => { resolve() }
      request.onerror = () => { reject(request.error ?? new Error('Live2D model storage failed')) }
    })
  } finally {
    database.close()
  }
}

/**
 * Read the last selected model for the standalone desktop-pet page.
 * @returns Stored model bundle, or null when no model is saved.
 */
export async function loadModelBundle(): Promise<ModelBundle | null> {
  if (typeof indexedDB === 'undefined') throw new Error('IndexedDB is unavailable')
  const database = await openDatabase()
  let stored: StoredModel | undefined
  try {
    stored = await new Promise<StoredModel | undefined>((resolve, reject) => {
      const request = database.transaction(storeName, 'readonly').objectStore(storeName).get('current')
      request.onsuccess = () => { resolve(request.result as StoredModel | undefined) }
      request.onerror = () => { reject(request.error ?? new Error('Live2D model storage failed')) }
    })
  } finally {
    database.close()
  }
  if (stored === undefined) return null
  return {
    name: stored.name,
    entryPath: stored.entryPath,
    files: stored.files.map((file) => {
      const restored = new File([file.bytes], file.name, {
        type: file.type,
        lastModified: file.lastModified,
      }) as File & { webkitRelativePath: string }
      Object.defineProperty(restored, 'webkitRelativePath', { value: file.path })
      return restored
    }),
  }
}
