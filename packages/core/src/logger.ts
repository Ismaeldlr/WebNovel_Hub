type Log = (details: object, message: string) => void;

/** Where core writes diagnostics; pino's methods fit it as they are. */
export interface Logger {
  debug: Log;
  info: Log;
  warn: Log;
  error: Log;
}

const ignore: Log = () => undefined;

export const silentLogger: Logger = { debug: ignore, info: ignore, warn: ignore, error: ignore };
