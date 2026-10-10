// whatwg-url ships no types; it implements the standard URL classes.
declare module 'whatwg-url' {
  export const URL: typeof globalThis.URL;
  export const URLSearchParams: typeof globalThis.URLSearchParams;
}
