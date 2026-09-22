/** Browser half of the local Live2D companion surface. */

import type { ClientContext } from '@deepseek-ai/dsh-client-runtime/client'
// Type-only: pull the locale Context merge into this client assembly.
import type {} from '@deepseek-ai/dsh-client-locale/client'
// Type-only: pull the frame's additive right-workspace slot declaration.
import type {} from '@deepseek-ai/dsh-client-ui-layout/client'
// Type-only: pull the desktop-pet model child-slot declaration into this assembly.
import type {} from '@deepseek-ai/dsh-client-ui-model-selection/client'
import { Live2DOverlay, type DesktopPetChatInjected } from './Live2DOverlay.tsx'
import { DesktopPetChatController } from './desktop-pet-chat.ts'
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
export const inject = ['slots', 'sessions', 'locale']

/** Register the companion as an additive right-workspace surface. */
export function apply(ctx: ClientContext): void {
  const petChat = new DesktopPetChatController(
    ctx.sessions,
    typeof localStorage === 'undefined' ? undefined : localStorage,
  )
  ctx.effect(() => () => { petChat.dispose() }, 'ui-live2d: desktop-pet chat')
  ctx.effect(() => ctx.locale.register(NS, { zh, en }), 'ui-live2d: dictionaries')
  ctx.slots.inject('shell.right', () => ctx.slots.register({
    name: 'shell.right',
    id: 'live2d-companion',
    order: 40,
    locale: NS,
    children: {
      'desktop-pet.model': { kind: 'single', scope: 'root' },
    },
    inject: (): DesktopPetChatInjected => ({
      hooks: { petChat },
      activatePetChat: async () => { await petChat.activate() },
      sendPetMessage: text => petChat.send(text),
      answerPetApproval: outcome => petChat.answerApproval(outcome),
    }),
  }, Live2DOverlay))
}
