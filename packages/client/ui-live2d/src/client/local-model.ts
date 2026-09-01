/** Convert a local model folder into object URLs consumable by l2d. */

import type { ModelBundle } from './model-files.ts'
import { filePath, normalizePath } from './model-files.ts'

/** Prepared entry URL and the object URL lifetime it owns. */
export interface PreparedLocalModel {
  readonly entryUrl: string
  /** Resolve the URL shape produced by l2d's string-based asset loader. */
  readonly resolveUrl: (value: string) => string
  readonly dispose: () => void
}

/** Return the directory portion of a normalized path. */
function dirname(path: string): string {
  const slash = path.lastIndexOf('/')
  return slash < 0 ? '' : path.slice(0, slash)
}

/** Resolve one JSON file reference against the JSON file that owns it. */
function referencedPath(ownerPath: string, reference: string): string {
  const withoutQuery = reference.split(/[?#]/, 1)[0] ?? reference
  if (withoutQuery.startsWith('/')) return normalizePath(withoutQuery)
  const base = dirname(ownerPath)
  return normalizePath(base === '' ? withoutQuery : `${base}/${withoutQuery}`)
}

/** References that already point outside the selected folder. */
function isExternalReference(value: string): boolean {
  return /^(?:[a-z][a-z\d+.-]*:|\/\/)/i.test(value)
}

/** Rewrite local resource strings in a parsed model document to object URLs. */
function rewriteReferences(value: unknown, ownerPath: string, urls: ReadonlyMap<string, string>): unknown {
  if (typeof value === 'string') {
    if (isExternalReference(value)) return value
    return urls.get(referencedPath(ownerPath, value)) ?? value
  }
  if (Array.isArray(value)) {
    return value.map(item => rewriteReferences(item, ownerPath, urls))
  }
  if (value !== null && typeof value === 'object') {
    const result: Record<string, unknown> = {}
    for (const [key, item] of Object.entries(value)) {
      result[key] = rewriteReferences(item, ownerPath, urls)
    }
    return result
  }
  return value
}

/**
 * Create an in-page resource graph for one model folder. The model entry is
 * rewritten because a blob URL has no usable relative directory; all of its
 * local references therefore need their own object URLs.
 */
export async function prepareLocalModel(bundle: ModelBundle): Promise<PreparedLocalModel> {
  const urls = new Map<string, string>()
  const ownedUrls = new Set<string>()
  try {
    for (const file of bundle.files) {
      const path = filePath(file)
      if (urls.has(path)) continue
      const url = URL.createObjectURL(file)
      urls.set(path, url)
      ownedUrls.add(url)
    }

    const entry = bundle.files.find(file => filePath(file) === bundle.entryPath)
    if (entry === undefined) throw new Error('model entry disappeared')

    let document: unknown
    try {
      document = JSON.parse(await entry.text()) as unknown
    } catch {
      throw new Error('model entry is not valid JSON')
    }
    const rewritten = rewriteReferences(document, bundle.entryPath, urls)
    const entryUrl = URL.createObjectURL(new Blob([JSON.stringify(rewritten)], { type: 'application/json' }))
    ownedUrls.add(entryUrl)
    const modelHomeDir = entryUrl.slice(0, entryUrl.lastIndexOf('/') + 1)
    const generatedUrls = new Map<string, string>()
    for (const url of urls.values()) generatedUrls.set(`${modelHomeDir}${url}`, url)
    return {
      entryUrl,
      resolveUrl: (value: string) => generatedUrls.get(value) ?? value,
      dispose: () => {
        for (const url of ownedUrls) URL.revokeObjectURL(url)
        ownedUrls.clear()
        generatedUrls.clear()
      },
    }
  } catch (error) {
    for (const url of ownedUrls) URL.revokeObjectURL(url)
    ownedUrls.clear()
    throw error
  }
}
