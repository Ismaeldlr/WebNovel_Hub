/** File extensions of the cover formats we store. */
export type CoverExtension = 'jpg' | 'png' | 'webp' | 'gif';

/** Covers are at most 8 MB. */
export const MAX_COVER_BYTES = 8 * 1024 * 1024;

const startsWith = (bytes: Uint8Array, signature: number[], offset = 0) =>
  signature.every((byte, index) => bytes[offset + index] === byte);

/** The image format, judged by the file signature alone; null when it isn't one of ours. */
export function imageType(bytes: Uint8Array): CoverExtension | null {
  if (startsWith(bytes, [0xff, 0xd8, 0xff])) return 'jpg';
  if (startsWith(bytes, [0x89, 0x50, 0x4e, 0x47, 0x0d, 0x0a, 0x1a, 0x0a])) return 'png';
  // "GIF87a" or "GIF89a"
  if (startsWith(bytes, [0x47, 0x49, 0x46, 0x38]) && [0x37, 0x39].includes(bytes[4] ?? 0)) {
    return bytes[5] === 0x61 ? 'gif' : null;
  }
  // "RIFF", a size, then "WEBP"
  if (
    startsWith(bytes, [0x52, 0x49, 0x46, 0x46]) &&
    startsWith(bytes, [0x57, 0x45, 0x42, 0x50], 8)
  ) {
    return 'webp';
  }
  return null;
}

const MEDIA_TYPES: Record<CoverExtension, 'image/jpeg' | 'image/png' | 'image/webp' | 'image/gif'> =
  {
    jpg: 'image/jpeg',
    png: 'image/png',
    webp: 'image/webp',
    gif: 'image/gif',
  };

/** The media type a cover of this format is stored and served with. */
export const coverMediaType = (extension: CoverExtension) => MEDIA_TYPES[extension];
