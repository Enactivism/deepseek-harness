/** File and path helpers for a browser-selected Live2D model folder. */

/** Import failures the UI can translate without exposing parser internals. */
export type ModelImportErrorCode =
  | 'no-files'
  | 'missing-entry'
  | 'multiple-entries'
  | 'missing-model-data'

/** Structured validation failure for a user-selected model set. */
export class ModelImportError extends Error {
  override readonly name = 'ModelImportError'
  readonly code: ModelImportErrorCode

  constructor(code: ModelImportErrorCode) {
    super(code)
    this.code = code
  }
}

/** The selected files plus the one model entry l2d should load. */
export interface ModelBundle {
  readonly name: string
  readonly entryPath: string
  readonly files: readonly File[]
}

/** Normalize browser-relative paths so JSON references can be matched safely. */
export function normalizePath(value: string): string {
  const parts: string[] = []
  for (const part of value.replaceAll('\\', '/').split('/')) {
    if (part === '' || part === '.') continue
    if (part === '..') {
      parts.pop()
      continue
    }
    parts.push(part)
  }
  return parts.join('/')
}

/** Read the directory-relative path exposed by `webkitdirectory`. */
export function filePath(file: File): string {
  const relative = (file.webkitRelativePath || '').trim()
  return normalizePath(relative === '' ? file.name : relative)
}

/** Build a user-facing model name from its entry file. */
export function modelName(entryPath: string): string {
  return entryPath
    .split('/')
    .at(-1)
    ?.replace(/\.model(?:3)?\.json$/i, '')
    || 'Live2D'
}

/** Select and validate one Live2D model directory from a FileList. */
export function buildModelBundle(files: readonly File[]): ModelBundle {
  if (files.length === 0) throw new ModelImportError('no-files')

  const entries = files.filter(file => /\.model(?:3)?\.json$/i.test(filePath(file)))
  if (entries.length === 0) throw new ModelImportError('missing-entry')
  if (entries.length > 1) throw new ModelImportError('multiple-entries')

  const entry = entries[0]
  if (entry === undefined) throw new ModelImportError('missing-entry')
  const hasModelData = files.some(file => /\.(?:moc3?|moc)$/i.test(filePath(file)))
  if (!hasModelData) throw new ModelImportError('missing-model-data')

  const entryPath = filePath(entry)
  return {
    name: modelName(entryPath),
    entryPath,
    files: [...files],
  }
}
