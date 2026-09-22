/** Model-selection slot occupant for the native desktop-pet chat window. */

import type { SessionId } from '@deepseek-ai/dsh-client-runtime/client'
import type { PropsLocale } from '@deepseek-ai/dsh-client-ui-slots'
import { ModelSelect } from './ModelSelect.tsx'
import type { ModelSelectInjected } from './slots.ts'

/** Owner props supplied by the Live2D chat window when it renders this slot. */
export interface DesktopPetModelSelectOwner {
  /** Dedicated Session whose model route the selector edits. */
  sessionId: SessionId
  /** Whether the owner is currently waiting for a one-shot approval decision. */
  locked: boolean
}

/** Model-directory resolver supplied by this package's registration. */
export interface DesktopPetModelSelectInjected {
  /** Resolve the shared model-directory face for one Session. */
  selectionFor: (sessionId: SessionId) => ModelSelectInjected
}

/**
 * Render the maintained model selector for a caller-selected Session.
 * @param props - the dedicated Session owner data and directory resolver.
 * @returns the model selector.
 */
export function DesktopPetModelSelect({
  sessionId,
  locked,
  selectionFor,
  t,
}: DesktopPetModelSelectOwner & DesktopPetModelSelectInjected & PropsLocale<'model'>) {
  return <ModelSelect {...selectionFor(sessionId)} locked={locked} t={t} />
}
