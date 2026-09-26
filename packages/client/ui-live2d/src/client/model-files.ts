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
  /** Stable translation key for the validation failure. */
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

/**
 * Normalize browser-relative paths so JSON references can be matched safely.
 * @param value Browser-relative or JSON reference path.
 * @returns Canonical slash-separated relative path.
 */
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

/**
 * Read the directory-relative path exposed by `webkitdirectory`.
 * @param file Browser-selected model file.
 * @returns Normalized directory-relative path.
 */
export function filePath(file: File): string {
  const relative = (file.webkitRelativePath || '').trim()
  return normalizePath(relative === '' ? file.name : relative)
}

/**
 * Build a user-facing model name from its entry file.
 * @param entryPath Directory-relative model entry path.
 * @returns Display name without the model-file suffix.
 */
export function modelName(entryPath: string): string {
  return entryPath
    .split('/')
    .at(-1)
    ?.replace(/\.model(?:3)?\.json$/i, '')
    || 'Live2D'
}

/**
 * Select and validate one Live2D model directory from a FileList, excluding
 * directory placeholders emitted by Qt WebEngine's folder picker.
 * @param files Browser-selected files.
 * @returns Validated model bundle.
 */
export function buildModelBundle(files: readonly File[]): ModelBundle {
  const modelFiles = files.filter(file => file.name !== '.' && file.name !== '..')
  if (modelFiles.length === 0) throw new ModelImportError('no-files')

  const entries = modelFiles.filter(file => /\.model(?:3)?\.json$/i.test(filePath(file)))
  if (entries.length === 0) throw new ModelImportError('missing-entry')
  if (entries.length > 1) throw new ModelImportError('multiple-entries')

  const entry = entries[0]
  if (entry === undefined) throw new ModelImportError('missing-entry')
  const hasModelData = modelFiles.some(file => /\.(?:moc3?|moc)$/i.test(filePath(file)))
  if (!hasModelData) throw new ModelImportError('missing-model-data')

  const entryPath = filePath(entry)
  return {
    name: modelName(entryPath),
    entryPath,
    files: modelFiles,
  }
}
