/** A file to put in an archive. */
export interface ZipFile {
  /** Its path inside the archive, e.g. `OEBPS/content.opf`. */
  name: string;
  content: string | Uint8Array;
  /** Stored as is instead of deflated: EPUB's `mimetype`, or already compressed images. */
  store?: boolean;
}

/** What a ZIP header says about one file. */
export interface ZipEntryHeader {
  /** The path, UTF-8 encoded. */
  name: Uint8Array;
  /** 0 stored, 8 deflated. */
  method: 0 | 8;
  crc: number;
  compressedSize: number;
  size: number;
}

/** The largest archive without ZIP64, which no novel needs. */
const MAX_ENTRIES = 0xffff;
const MAX_OFFSET = 0xffffffff;

const CRC_TABLE = Uint32Array.from({ length: 256 }, (_, n) => {
  let c = n;
  for (let k = 0; k < 8; k++) c = c & 1 ? 0xedb88320 ^ (c >>> 1) : c >>> 1;
  return c >>> 0;
});

/** The CRC-32 a ZIP header records for a file. */
export function crc32(data: Uint8Array): number {
  let crc = 0xffffffff;
  for (const byte of data) crc = CRC_TABLE[(crc ^ byte) & 0xff]! ^ (crc >>> 8);
  return (crc ^ 0xffffffff) >>> 0;
}

/** Raw deflate, as ZIP's method 8 stores it. */
async function deflate(data: Uint8Array): Promise<Uint8Array> {
  const stream = new Blob([data as Uint8Array<ArrayBuffer>])
    .stream()
    .pipeThrough(new CompressionStream('deflate-raw'));
  return new Uint8Array(await new Response(stream).arrayBuffer());
}

export function concat(parts: Uint8Array[]): Uint8Array {
  const out = new Uint8Array(parts.reduce((length, part) => length + part.length, 0));
  let at = 0;
  for (const part of parts) {
    out.set(part, at);
    at += part.length;
  }
  return out;
}

/** An MS-DOS date and time, in UTC like the rest of the app. */
function dosDateTime(when: Date): { date: number; time: number } {
  const year = Math.min(Math.max(when.getUTCFullYear(), 1980), 2107);
  return {
    date: ((year - 1980) << 9) | ((when.getUTCMonth() + 1) << 5) | when.getUTCDate(),
    time: (when.getUTCHours() << 11) | (when.getUTCMinutes() << 5) | (when.getUTCSeconds() >> 1),
  };
}

/** The fields both headers share, from "version needed" to "extra field length" (26 bytes). */
function writeCommon(view: DataView, at: number, entry: ZipEntryHeader, modified: Date): void {
  const { date, time } = dosDateTime(modified);
  view.setUint16(at, 20, true); // version needed: 2.0 (deflate)
  view.setUint16(at + 2, 0x0800, true); // names are UTF-8
  view.setUint16(at + 4, entry.method, true);
  view.setUint16(at + 6, time, true);
  view.setUint16(at + 8, date, true);
  view.setUint32(at + 10, entry.crc, true);
  view.setUint32(at + 14, entry.compressedSize, true);
  view.setUint32(at + 18, entry.size, true);
  view.setUint16(at + 22, entry.name.length, true);
  view.setUint16(at + 24, 0, true); // no extra field (EPUB forbids one on `mimetype`)
}

function header(size: number): { bytes: Uint8Array; view: DataView } {
  const bytes = new Uint8Array(size);
  return { bytes, view: new DataView(bytes.buffer) };
}

/** The local file header that precedes a file's data, with its name. */
export function localFileHeader(entry: ZipEntryHeader, modified: Date): Uint8Array {
  const { bytes, view } = header(30);
  view.setUint32(0, 0x04034b50, true);
  writeCommon(view, 4, entry, modified);
  return concat([bytes, entry.name]);
}

/** A file's record in the central directory; `offset` is where its local header starts. */
export function centralDirectoryHeader(
  entry: ZipEntryHeader,
  modified: Date,
  offset: number,
): Uint8Array {
  const { bytes, view } = header(46);
  view.setUint32(0, 0x02014b50, true);
  view.setUint16(4, 20, true); // version made by: 2.0, MS-DOS attributes
  writeCommon(view, 6, entry, modified);
  // Comment length, disk number, internal and external attributes stay 0.
  view.setUint32(42, offset, true);
  return concat([bytes, entry.name]);
}

/** The end of central directory record that closes the archive. */
export function endOfCentralDirectory(
  entries: number,
  directorySize: number,
  directoryOffset: number,
): Uint8Array {
  const { bytes, view } = header(22);
  view.setUint32(0, 0x06054b50, true);
  view.setUint16(8, entries, true);
  view.setUint16(10, entries, true);
  view.setUint32(12, directorySize, true);
  view.setUint32(16, directoryOffset, true);
  return bytes;
}

/**
 * A ZIP archive of `files`, in their order, produced as the consumer reads it: each file
 * is compressed when its turn comes. Only the central directory (about 100 bytes a file)
 * is kept until the end.
 */
export async function* zipStream(
  files: AsyncIterable<ZipFile> | Iterable<ZipFile>,
  options: { modified?: Date } = {},
): AsyncGenerator<Uint8Array> {
  const modified = options.modified ?? new Date();
  const encoder = new TextEncoder();
  const directory: Uint8Array[] = [];
  let offset = 0;
  for await (const file of files) {
    const data = typeof file.content === 'string' ? encoder.encode(file.content) : file.content;
    const body = file.store ? data : await deflate(data);
    const entry: ZipEntryHeader = {
      name: encoder.encode(file.name),
      method: file.store ? 0 : 8,
      crc: crc32(data),
      compressedSize: body.length,
      size: data.length,
    };
    const local = localFileHeader(entry, modified);
    if (directory.length === MAX_ENTRIES || offset + local.length + body.length > MAX_OFFSET) {
      throw new Error('The archive is too large for a ZIP file without ZIP64.');
    }
    directory.push(centralDirectoryHeader(entry, modified, offset));
    offset += local.length + body.length;
    yield concat([local, body]);
  }
  const central = concat(directory);
  yield concat([central, endOfCentralDirectory(directory.length, central.length, offset)]);
}
