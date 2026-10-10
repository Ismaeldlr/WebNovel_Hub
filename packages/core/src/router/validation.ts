import { z } from 'zod';
import { AppError } from '../errors.js';

/** Validates a request body; the first problem becomes a 400 with a message for the reader. */
export function parseBody<T extends z.ZodType>(schema: T, body: unknown): z.infer<T> {
  const result = schema.safeParse(body);
  if (!result.success) {
    throw new AppError(400, result.error.issues[0]?.message ?? 'The request is invalid.');
  }
  return result.data;
}

/** Validates query parameters, like `parseBody`. */
export const parseQuery = parseBody;

const UUID = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i;

/** A route's id parameter. Anything that isn't a UUID can't name a record: the same 404. */
export function idParam(value: string | undefined, notFoundMessage: string): string {
  if (value === undefined || !UUID.test(value)) throw new AppError(404, notFoundMessage);
  return value.toLowerCase();
}

/** An optional id query parameter, e.g. a filter's `?novelId=`: a UUID, lower-cased. */
export function optionalId(message: string) {
  return z
    .string({ error: message })
    .regex(UUID, message)
    .transform((id) => id.toLowerCase())
    .optional();
}

/** An optional positive integer query parameter, e.g. `?page=2`. */
export function positiveInt(message: string, { max }: { max: number }) {
  return z.coerce
    .number({ error: message })
    .int(message)
    .min(1, message)
    .max(max, message)
    .optional();
}

/**
 * An optional search text query parameter, e.g. `?q=`: trimmed, at most 200 characters.
 * Missing or blank means no search (null).
 */
export function searchText(name: string) {
  return z
    .string({ error: `${name} must be text.` })
    .trim()
    .max(200, 'The search is too long.')
    .optional()
    .transform((text) => (text ? text : null));
}

/** An optional `true` / `false` query parameter, e.g. `?favorite=true`. */
export function booleanFlag(name: string) {
  return z
    .enum(['true', 'false'], { error: `${name} must be true or false.` })
    .transform((value) => value === 'true')
    .optional();
}
