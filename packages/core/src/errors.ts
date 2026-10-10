/** A failure to report to the reader with a status and a message they can act on. */
export class AppError extends Error {
  readonly status: number;
  readonly data: unknown;

  constructor(status: number, message: string, options?: ErrorOptions & { data?: unknown }) {
    super(message, options);
    this.name = 'AppError';
    this.status = status;
    this.data = options?.data ?? null;
  }
}

export const MESSAGES = {
  notFound: 'Not found.',
  badRequest: 'The request could not be processed.',
  tooLarge: 'The file is too large.',
  unexpected: 'Something went wrong. Please try again.',
} as const;

/** How a failure is reported: an AppError as it is, anything else as unexpected. */
export function toFailure(error: unknown): { status: number; message: string; data: unknown } {
  if (error instanceof AppError) {
    return { status: error.status, message: error.message, data: error.data };
  }
  return { status: 500, message: MESSAGES.unexpected, data: null };
}
