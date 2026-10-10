// Just enough Protocol Buffers and gRPC-web to read Wuxiaworld's chapter list. Messages
// are decoded without their schema, as field number → values (numbers for varints, bytes
// for everything else); the adapter knows which numbers it needs.
import { StructureChanged } from '../../errors.js';

export type Fields = Map<number, (number | Uint8Array)[]>;

export function encodeVarint(value: number): Uint8Array {
  const bytes: number[] = [];
  let rest = value;
  while (rest >= 0x80) {
    bytes.push((rest % 0x80) | 0x80);
    rest = Math.floor(rest / 0x80);
  }
  bytes.push(rest);
  return Uint8Array.from(bytes);
}

export const concat = (...parts: Uint8Array[]): Uint8Array => {
  const out = new Uint8Array(parts.reduce((size, part) => size + part.length, 0));
  let offset = 0;
  for (const part of parts) {
    out.set(part, offset);
    offset += part.length;
  }
  return out;
};

/** One varint field of a message (field `number`, wire type 0). */
export const intField = (number: number, value: number): Uint8Array =>
  concat(encodeVarint(number * 8), encodeVarint(value));

function readVarint(data: Uint8Array, start: number): [number, number] {
  let result = 0;
  let scale = 1;
  for (let position = start; position < data.length; position += 1) {
    const byte = data[position]!;
    result += (byte & 0x7f) * scale;
    if (!(byte & 0x80)) return [result, position + 1];
    scale *= 0x80;
  }
  throw new StructureChanged('truncated protobuf message');
}

export function decode(message: Uint8Array): Fields {
  const fields: Fields = new Map();
  let position = 0;
  while (position < message.length) {
    const [key, afterKey] = readVarint(message, position);
    const number = Math.floor(key / 8);
    const wireType = key % 8;
    let value: number | Uint8Array;
    let size: number;
    position = afterKey;
    if (wireType === 0) {
      [value, position] = readVarint(message, position);
    } else {
      if (wireType === 2) [size, position] = readVarint(message, position);
      else if (wireType === 1) size = 8;
      else if (wireType === 5) size = 4;
      else throw new StructureChanged(`unsupported protobuf wire type ${wireType}`);
      if (position + size > message.length)
        throw new StructureChanged('truncated protobuf message');
      value = message.subarray(position, position + size);
      position += size;
    }
    fields.set(number, [...(fields.get(number) ?? []), value]);
  }
  return fields;
}

export function firstInt(fields: Fields, number: number, fallback = 0): number {
  const value = fields.get(number)?.[0];
  return typeof value === 'number' ? value : fallback;
}

export function firstBytes(fields: Fields, number: number): Uint8Array {
  const value = fields.get(number)?.[0];
  return value instanceof Uint8Array ? value : new Uint8Array();
}

export function firstText(fields: Fields, number: number): string {
  return new TextDecoder().decode(firstBytes(fields, number));
}

export const messages = (fields: Fields, number: number): Fields[] =>
  (fields.get(number) ?? []).filter((value) => value instanceof Uint8Array).map(decode);

/** A request body: one uncompressed data frame. */
export function grpcWebFrame(message: Uint8Array): Uint8Array {
  const header = new Uint8Array(5);
  new DataView(header.buffer).setUint32(1, message.length);
  return concat(header, message);
}

/** The first data frame of an answer; `StructureChanged` when the call failed. */
export function grpcWebMessage(body: Uint8Array): Uint8Array {
  let position = 0;
  const trailers: Uint8Array[] = [];
  while (position + 5 <= body.length) {
    const flag = body[position]!;
    const length = new DataView(body.buffer, body.byteOffset + position + 1, 4).getUint32(0);
    const frame = body.subarray(position + 5, position + 5 + length);
    position += 5 + length;
    if (flag & 0x80) trailers.push(frame);
    else return frame;
  }
  const text = new TextDecoder().decode(concat(...trailers)).slice(0, 200);
  throw new StructureChanged(`gRPC-web answer without a message: ${JSON.stringify(text)}`);
}
