/**
 * Node-half discovery anchor for dsh-plugin-composer-compact.
 *
 * The web plugin table walks the host Loader entries and reads each row's
 * nearest package.json. This module exists only so one top-level Loader row
 * resolves to this package, whose dsh.client declaration then contributes the
 * browser row. It is intentionally side-effect free: no services, no routes,
 * no tools, no presets, no timers, no model access.
 *
 * The feature itself lives entirely in client.js (hand-written web client half);
 * this file is the host-side anchor that makes the package discoverable.
 *
 * @module dsh-plugin-composer-compact
 */

/** Cordis plugin name (diagnostic only; the Loader row name is the specifier). */
export const name = "composer-compact-host-anchor";

/** No host services are required. */
export const inject = [];

/** No-op: the host half deliberately owns nothing. */
export function apply() {}
