/**
 * The layout's breakpoints, for scripts. Stylesheets
 * can't read custom properties in a media query, so they write the same two widths
 * literally; breakpoints.test.ts keeps every stylesheet to them.
 */

/** Phones: up to 599px wide. */
export const COMPACT_MAX_WIDTH = 599;
/** Below the desktop layout (up to 899px): the sidebar becomes a drawer. */
export const MEDIUM_MAX_WIDTH = 899;

export const COMPACT_QUERY = `(max-width: ${COMPACT_MAX_WIDTH}px)`;
export const BELOW_DESKTOP_QUERY = `(max-width: ${MEDIUM_MAX_WIDTH}px)`;
