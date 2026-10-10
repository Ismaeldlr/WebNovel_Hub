// What the runner's engine (QuickJS) lacks and libraries read as they load, so this module
// comes first: the getters of resizable and growable array buffers (read by the URL
// polyfill's helpers, never used here) and atob (the HTML parser's entity tables).
const scope = globalThis as Record<string, unknown>;

const getter = (prototype: object, name: string, value: unknown) => {
  if (!Object.getOwnPropertyDescriptor(prototype, name)) {
    Object.defineProperty(prototype, name, { configurable: true, get: () => value });
  }
};
getter(ArrayBuffer.prototype, 'resizable', false);
if (typeof SharedArrayBuffer === 'function') {
  getter(SharedArrayBuffer.prototype as object, 'growable', false);
}

const BASE64 = 'ABCDEFGHIJKLMNOPQRSTUVWXYZabcdefghijklmnopqrstuvwxyz0123456789+/';

scope.atob ??= (input: string): string => {
  const text = String(input)
    .replace(/[\t\n\f\r ]+/g, '')
    .replace(/=+$/, '');
  let output = '';
  let buffer = 0;
  let bits = 0;
  for (const char of text) {
    const value = BASE64.indexOf(char);
    if (value < 0) throw new Error('The string to decode is not base64.');
    buffer = ((buffer << 6) | value) & 0xffffff;
    bits += 6;
    if (bits >= 8) {
      bits -= 8;
      output += String.fromCharCode((buffer >> bits) & 0xff);
    }
  }
  return output;
};
