/**
 * Package-owned invariant companion for
 * `@deepseek-ai/dsh-client-ui-live2d`.
 * @module @deepseek-ai/dsh-client-ui-live2d/invariant
 */

/* jscpd:ignore-start */
import type { Context } from '@deepseek-ai/cordis'
import type { InvariantInstaller } from '@deepseek-ai/dsh-invariants'

const PACKAGE_NAME = '@deepseek-ai/dsh-client-ui-live2d'

/** Cordis companion plugin name. */
export const name = 'client-ui-live2d-invariant'
/** Service required before the companion can reserve package ownership. */
export const inject = ['invariants']

/**
 * No runtime invariant: this local-only UI surface emits no cordis events,
 * owns no cross-plugin mutable state, and keeps its model bytes in the browser.
 */
const install: InvariantInstaller = () => {}

/** Register this package's invariant companion. */
export const apply = (ctx: Context): Promise<() => void> =>
  Promise.resolve(ctx.invariants.register(PACKAGE_NAME, install))
/* jscpd:ignore-end */
