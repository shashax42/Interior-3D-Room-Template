/**
 * Flags the live scene sets for the photoreal renderer. Kept apart from photoreal.ts so the realtime view
 * doesn't pull the (large) path tracer into the first download.
 */

/** Objects (and their children) with this flag are not part of the photo: selection boxes, fake fill lights. */
export const NO_TRACE = 'noTrace'

/** Surfaces that are true mirrors in the photo (drawn as plain polished metal in realtime, which is far cheaper). */
export const TRACE_MIRROR = 'traceMirror'

/**
 * Glass and crystal: realtime draws them as simple see-through surfaces, because real transmission re-renders the
 * whole room every frame. The photo gets real transmission with this amount.
 */
export const TRACE_TRANSMISSION = 'traceTransmission'
