/** Browser half of the local Live2D companion surface. */

import type { ClientContext } from '@deepseek-ai/dsh-client-runtime/client'
// Type-only: pull the locale Context merge into this client assembly.
import type {} from '@deepseek-ai/dsh-client-locale/client'
// Type-only: pull the frame's additive right-workspace slot declaration.
import type {} from '@deepseek-ai/dsh-client-ui-layout/client'
import { Live2DOverlay } from './Live2DOverlay.tsx'
import { en, NS, zh, type Live2DKey } from './locales.ts'

export { Live2DOverlay } from './Live2DOverlay.tsx'
export type { Live2DOverlayProps } from './Live2DOverlay.tsx'
export { buildModelBundle, ModelImportError } from './model-files.ts'
export type { ModelBundle, ModelImportErrorCode } from './model-files.ts'
export { NS }

declare module '@deepseek-ai/dsh-client-ui-slots' {
  interface LocaleNamespaceMap {
    /** Local Live2D companion copy. */
    live2d: Live2DKey
  }
}

/** Services required by the right-workspace registration and its bilingual copy. */
export const inject = ['slots', 'locale']

/** Register the companion as an additive right-workspace surface. */
export function apply(ctx: ClientContext): void {
  ctx.effect(() => ctx.locale.register(NS, { zh, en }), 'ui-live2d: dictionaries')
  ctx.slots.inject('shell.right', () => ctx.slots.register({
    name: 'shell.right',
    id: 'live2d-companion',
    order: 40,
    locale: NS,
  }, Live2DOverlay))
}
