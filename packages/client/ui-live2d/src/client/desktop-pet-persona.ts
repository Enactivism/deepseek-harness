/** Persisted desktop-pet persona instructions and their compact-chat projection. */

/** Same-origin key for the persona shared by the pet and its native chat window. */
export const DESKTOP_PET_PERSONA_STORAGE_KEY = 'dsh.live2d.desktop-pet-persona'
/** Maximum stored persona length accepted by the desktop-pet editor. */
export const DESKTOP_PET_PERSONA_TEXT_LIMIT = 1000

/** Marker kept in the logged user message so the model receives the persona on every turn. */
export const DESKTOP_PET_PERSONA_PREFIX = '[Desktop pet persona]\n'

/**
 * Read the persona from same-origin storage.
 * @returns the bounded persona, or an empty string when storage is absent or invalid.
 */
export function readDesktopPetPersona(): string {
  if (typeof window === 'undefined') return ''
  try {
    return window.localStorage.getItem(DESKTOP_PET_PERSONA_STORAGE_KEY)?.slice(
      0,
      DESKTOP_PET_PERSONA_TEXT_LIMIT,
    ) ?? ''
  } catch {
    return ''
  }
}

/**
 * Persist the persona without making storage availability a prerequisite for the current page.
 * @param persona - persona prose to retain.
 */
export function writeDesktopPetPersona(persona: string): void {
  if (typeof window === 'undefined') return
  try {
    window.localStorage.setItem(
      DESKTOP_PET_PERSONA_STORAGE_KEY,
      persona.slice(0, DESKTOP_PET_PERSONA_TEXT_LIMIT),
    )
  } catch {
    // The current page keeps the in-memory value when storage is unavailable.
  }
}

/**
 * Add the persona to one model-visible pet message while retaining the user's actual text.
 * @param text - user message or feature-owned mode instruction.
 * @param persona - current persona prose.
 * @returns the logged message sent to the dedicated pet Session.
 */
export function withDesktopPetPersona(text: string, persona: string): string {
  const trimmed = persona.trim()
  return trimmed === '' ? text : `${DESKTOP_PET_PERSONA_PREFIX}${trimmed}\n\n${text}`
}

/**
 * Remove the feature-owned persona wrapper before rendering a compact transcript.
 * @param text - projected user message.
 * @returns the original message without the hidden persona block.
 */
export function displayDesktopPetMessage(text: string): string {
  if (!text.startsWith(DESKTOP_PET_PERSONA_PREFIX)) return text
  const body = text.slice(DESKTOP_PET_PERSONA_PREFIX.length)
  const separator = body.indexOf('\n\n')
  return separator < 0 ? body : body.slice(separator + 2)
}
