/**
 * Live2D companion plugin, node half. The feature is browser-local: the node
 * entry exists so the Loader can mount the browser client plugin, while model
 * files never enter the Host process.
 */

/** Host plugin body — all rendering and file handling stay in the browser. */
export function apply(): void {}
