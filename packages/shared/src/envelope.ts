/**
 * The standard `/api` response envelope.
 * Every JSON response carries all three keys. A success has `error: null`; a failure has a
 * message in `error` and `data: null`, except for the few failures that document details
 * the client needs to act on, such as the `ImportConflict` of a 409 import.
 */
export interface ApiSuccess<T> {
  success: true;
  data: T;
  error: null;
}

export interface ApiFailure<D = null> {
  success: false;
  data: D;
  /** User-safe message. Never a stack trace, credential or internal detail. */
  error: string;
}

export type ApiResponse<T, D = null> = ApiSuccess<T> | ApiFailure<D>;

export function apiSuccess<T>(data: T): ApiSuccess<T> {
  return { success: true, data, error: null };
}

export function apiFailure(error: string): ApiFailure;
export function apiFailure<D>(error: string, data: D): ApiFailure<D>;
export function apiFailure(error: string, data: unknown = null): ApiFailure<unknown> {
  return { success: false, data, error };
}
