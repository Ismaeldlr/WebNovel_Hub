// SQL values and rows as JSON, for drivers that reach SQLite over a message channel (the
// development bridge, Capacitor): bytes travel as base64.

interface WireBytes {
  $bytes: string;
}

function toBase64(bytes: Uint8Array): string {
  let text = '';
  for (let i = 0; i < bytes.length; i += 0x8000) {
    text += String.fromCharCode(...bytes.subarray(i, i + 0x8000));
  }
  return btoa(text);
}

function fromBase64(text: string): Uint8Array {
  return Uint8Array.from(atob(text), (char) => char.charCodeAt(0));
}

/** JSON text for values and rows, with bytes encoded. */
export function toWire(value: unknown): string {
  return JSON.stringify(value, (_key, item: unknown) =>
    item instanceof Uint8Array ? ({ $bytes: toBase64(item) } satisfies WireBytes) : item,
  );
}

/** The values and rows `toWire` encoded. */
export function fromWire<T>(text: string): T {
  return JSON.parse(text, (_key, item: unknown) =>
    typeof item === 'object' && item !== null && typeof (item as WireBytes).$bytes === 'string'
      ? fromBase64((item as WireBytes).$bytes)
      : item,
  ) as T;
}
