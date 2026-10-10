import { type ApiResponse, apiFailure, apiSuccess } from '@webnovel-hub/shared';
import { AppError, MESSAGES, toFailure } from '../errors.js';
import type { Logger } from '../logger.js';

export type Method = 'GET' | 'POST' | 'PATCH' | 'PUT' | 'DELETE';

/** A file the reader picked, e.g. an EPUB to import or a cover image. */
export interface UploadedFile {
  name: string;
  /** The media type the file picker reported; may be empty. */
  type: string;
  bytes: Uint8Array;
}

/** A file to hand back, e.g. an exported EPUB or a cover image. */
export interface FileResult {
  mediaType: string;
  /** The name to save it under; null for images shown on the page. */
  name: string | null;
  bytes: Uint8Array;
}

/** What the app asks of core: the same paths and bodies the REST API took. */
export interface CoreRequest {
  method: Method;
  /** A path with its query string, e.g. `/library?sort=title`. */
  path: string;
  body?: unknown;
  file?: UploadedFile | null;
}

export type CoreResponse =
  { status: number; body: ApiResponse<unknown, unknown> } | { status: number; file: FileResult };

export interface RouteRequest {
  params: Record<string, string>;
  query: Record<string, string>;
  body: unknown;
  file: UploadedFile | null;
}

export type RouteResult = { status: number; data: unknown } | { status: number; file: FileResult };

export interface Route {
  method: Method;
  /** Segments, with `:name` for a parameter, e.g. `/library/:novelId/status`. */
  path: string;
  handle: (request: RouteRequest) => Promise<RouteResult>;
}

/** A successful result in the envelope. */
export const ok = (data: unknown, status = 200): RouteResult => ({ status, data });

interface CompiledRoute extends Route {
  segments: string[];
}

function match(route: CompiledRoute, parts: string[]): Record<string, string> | null {
  if (route.segments.length !== parts.length) return null;
  const params: Record<string, string> = {};
  for (const [index, segment] of route.segments.entries()) {
    const part = parts[index]!;
    if (segment.startsWith(':')) params[segment.slice(1)] = decodeURIComponent(part);
    else if (segment !== part) return null;
  }
  return params;
}

/**
 * Routes requests to their handlers. A path with fixed segments wins over one with
 * parameters in the same place, so `/library/stats` never reads as a novel id.
 */
export function createRouter(routes: Route[], logger: Logger) {
  const compiled: CompiledRoute[] = routes
    .map((route) => ({ ...route, segments: route.path.split('/').filter(Boolean) }))
    .sort(
      (a, b) =>
        a.segments.filter((s) => s.startsWith(':')).length -
        b.segments.filter((s) => s.startsWith(':')).length,
    );

  return async function dispatch(request: CoreRequest): Promise<CoreResponse> {
    const [pathname = '', search = ''] = request.path.split('?', 2);
    const parts = pathname.split('/').filter(Boolean);
    const query = Object.fromEntries(new URLSearchParams(search));
    try {
      for (const route of compiled) {
        if (route.method !== request.method) continue;
        const params = match(route, parts);
        if (!params) continue;
        const result = await route.handle({
          params,
          query,
          body: request.body ?? null,
          file: request.file ?? null,
        });
        return 'file' in result ? result : { status: result.status, body: apiSuccess(result.data) };
      }
      throw new AppError(404, MESSAGES.notFound);
    } catch (error) {
      const failure = toFailure(error);
      if (failure.status >= 500) {
        logger.error({ err: error, method: request.method, path: pathname }, 'request failed');
      }
      return { status: failure.status, body: apiFailure(failure.message, failure.data) };
    }
  };
}

export type Dispatch = ReturnType<typeof createRouter>;
