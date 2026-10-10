/** What an uploaded archive may hold, so a zip bomb is refused. */
export interface ZipLimits {
  /** Entries in the central directory, folders included. */
  maxEntries: number;
  /** Declared uncompressed size of all files together. */
  maxTotalBytes: number;
  /** Declared uncompressed size of any one file. */
  maxEntryBytes: number;
}

export const ZIP_LIMITS: ZipLimits = {
  maxEntries: 10_000,
  maxTotalBytes: 512 * 1024 * 1024,
  maxEntryBytes: 64 * 1024 * 1024,
};

/** Why an archive was refused; `message` is safe to show. */
export class ZipError extends Error {
  override readonly name = 'ZipError';
}

/** Read access to the files of an archive, by their path inside it. */
export interface ZipArchive {
  /** The stored name of `path`, matched exactly, else ignoring case; null if absent. */
  resolve(path: string): string | null;
  /** The file's bytes; null when there is no such file or it can't be decompressed. */
  read(path: string): Promise<Uint8Array | null>;
}

interface Entry {
  method: number;
  encrypted: boolean;
  compressedSize: number;
  size: number;
  localHeaderOffset: number;
}

const TOO_BIG = 'This EPUB unpacks to more than we can import.';
const NOT_A_ZIP = "This file isn't a valid EPUB: it can't be opened as a ZIP archive.";

const END_OF_CENTRAL_DIRECTORY = 0x06054b50;
const CENTRAL_DIRECTORY_HEADER = 0x02014b50;
const LOCAL_FILE_HEADER = 0x04034b50;

/** Where the end of central directory record starts: it may be followed by a comment. */
function findEnd(view: DataView): number {
  const earliest = Math.max(0, view.byteLength - 22 - 0xffff);
  for (let at = view.byteLength - 22; at >= earliest; at--) {
    if (view.getUint32(at, true) === END_OF_CENTRAL_DIRECTORY) return at;
  }
  throw new ZipError(NOT_A_ZIP);
}

/** Inflates raw deflate data, giving up as soon as it grows past `size`. */
async function inflate(data: Uint8Array, size: number): Promise<Uint8Array | null> {
  const stream = new Blob([data as Uint8Array<ArrayBuffer>])
    .stream()
    .pipeThrough(new DecompressionStream('deflate-raw'));
  const reader = stream.getReader();
  const out = new Uint8Array(size);
  let at = 0;
  for (;;) {
    const { done, value } = await reader.read();
    if (done) break;
    if (at + value.length > size) {
      await reader.cancel();
      return null;
    }
    out.set(value, at);
    at += value.length;
  }
  return at === size ? out : null;
}

/**
 * Opens a ZIP held in memory and lists its files from the central directory, without
 * decompressing anything. Refuses archives with too many entries or whose declared sizes
 * are too large; a file that inflates past its declared size is refused when read, so
 * the declared sizes bound the work. Nothing is written anywhere from the archive.
 */
export function openZip(bytes: Uint8Array, limits: ZipLimits = ZIP_LIMITS): ZipArchive {
  const view = new DataView(bytes.buffer, bytes.byteOffset, bytes.byteLength);
  const entries = new Map<string, Entry>();
  const byLowerCase = new Map<string, string>();
  const names = new TextDecoder('utf-8');

  try {
    const end = findEnd(view);
    const count = view.getUint16(end + 10, true);
    if (count > limits.maxEntries) {
      throw new ZipError('This EPUB holds more files than we can import.');
    }
    let at = view.getUint32(end + 16, true);
    let total = 0;
    for (let i = 0; i < count; i++) {
      if (view.getUint32(at, true) !== CENTRAL_DIRECTORY_HEADER) throw new ZipError(NOT_A_ZIP);
      const nameLength = view.getUint16(at + 28, true);
      const name = names.decode(bytes.subarray(at + 46, at + 46 + nameLength));
      const entry: Entry = {
        method: view.getUint16(at + 10, true),
        encrypted: (view.getUint16(at + 8, true) & 1) === 1,
        compressedSize: view.getUint32(at + 20, true),
        size: view.getUint32(at + 24, true),
        localHeaderOffset: view.getUint32(at + 42, true),
      };
      at += 46 + nameLength + view.getUint16(at + 30, true) + view.getUint16(at + 32, true);
      // Absolute names, backslashes and names that climb out mark a malformed archive.
      if (/^[/\\]|^[A-Za-z]:|\\/.test(name) || name.split('/').includes('..')) {
        throw new ZipError(NOT_A_ZIP);
      }
      if (name.endsWith('/')) continue;
      total += entry.size;
      if (entry.size > limits.maxEntryBytes || total > limits.maxTotalBytes) {
        throw new ZipError(TOO_BIG);
      }
      entries.set(name, entry);
      const lower = name.toLowerCase();
      if (!byLowerCase.has(lower)) byLowerCase.set(lower, name);
    }
  } catch (error) {
    throw error instanceof ZipError ? error : new ZipError(NOT_A_ZIP, { cause: error });
  }

  const resolve = (path: string) =>
    entries.has(path) ? path : (byLowerCase.get(path.toLowerCase()) ?? null);

  return {
    resolve,
    async read(path) {
      const name = resolve(path);
      const entry = name === null ? undefined : entries.get(name);
      if (!entry || entry.encrypted) return null;
      try {
        const local = entry.localHeaderOffset;
        if (view.getUint32(local, true) !== LOCAL_FILE_HEADER) return null;
        const start =
          local + 30 + view.getUint16(local + 26, true) + view.getUint16(local + 28, true);
        const data = bytes.subarray(start, start + entry.compressedSize);
        if (entry.method === 0) return data.length === entry.size ? data.slice() : null;
        if (entry.method === 8) return await inflate(data, entry.size);
        return null; // a compression method EPUBs don't use
      } catch {
        return null; // corrupt data
      }
    },
  };
}
