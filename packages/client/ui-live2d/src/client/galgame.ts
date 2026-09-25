/** Story-mode prompt and assistant-choice projection for the desktop pet. */

/** Parsed assistant narrative and its optional player choices. */
export interface GalgameReply {
  /** Assistant text outside the choice block. */
  narrative: string
  /** Exactly three sendable player messages when the block is valid. */
  choices: readonly [string, string, string] | null
}

const OPEN_TAG = '<galgame-choices>'
const CLOSE_TAG = '</galgame-choices>'
/** Prefix distinguishing model-visible mode instructions from player messages. */
export const GALGAME_CONTROL_PREFIX = '[Galgame mode instruction]\n'
/** Marker identifying the story card stored in the Galgame Session history. */
export const GALGAME_STORY_CARD_MARKER = '[Galgame story card]'

/**
 * Identify a logged mode instruction that is hidden from the player transcript.
 * @param text - User message projected from the desktop-pet Session.
 * @returns Whether the text begins with the feature-owned control prefix.
 */
export function isGalgameControlMessage(text: string): boolean {
  return text.startsWith(GALGAME_CONTROL_PREFIX)
}

/**
 * Parse the final tagged choice block from one assistant response.
 * @param text - Complete or currently streaming assistant text.
 * @returns The visible narrative and exactly three choices when the numbered block is complete.
 */
export function parseGalgameReply(text: string): GalgameReply {
  const start = text.lastIndexOf(OPEN_TAG)
  if (start < 0) return { narrative: text, choices: null }

  const end = text.indexOf(CLOSE_TAG, start + OPEN_TAG.length)
  if (end < 0) {
    return { narrative: text.slice(0, start).trimEnd(), choices: null }
  }

  const trailing = text.slice(end + CLOSE_TAG.length).trim()
  const lines = text.slice(start + OPEN_TAG.length, end)
    .split('\n')
    .map(line => line.trim())
    .filter(line => line !== '')
  const choices = lines.map((line, index) => {
    const match = new RegExp(`^${index + 1}\\.\\s+(.+)$`).exec(line)
    return match?.[1]?.trim() ?? ''
  })

  if (choices.length === 3 && choices.every(choice => choice !== '') && trailing === '') {
    return {
      narrative: text.slice(0, start).trimEnd(),
      choices: choices as [string, string, string],
    }
  }

  return { narrative: text.slice(0, start).trimEnd(), choices: null }
}
