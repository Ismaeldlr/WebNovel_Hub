// What a platform provides for fetching from source sites. Requests go through the
// platform's native client, which no site's cross-origin rules apply to.

export interface HttpRequest {
  url: string;
  method: 'GET' | 'POST';
  headers: Record<string, string>;
  body?: string | Uint8Array;
  /** Milliseconds before the request is given up. */
  timeout: number;
}

export interface HttpResponse {
  /** The final URL, after redirects. */
  url: string;
  status: number;
  /** Header names in lower case. */
  headers: Record<string, string>;
  body: Uint8Array;
}

export interface HttpClient {
  /**
   * Sends the request, following redirects. Rejects only when no answer arrived (DNS,
   * connection, timeout); an error status is a response like any other.
   */
  request(request: HttpRequest): Promise<HttpResponse>;
}

export interface RenderRequest {
  url: string;
  /** A CSS selector to wait for before the page counts as loaded. */
  waitFor?: string;
  /** Milliseconds to wait for the page and the selector. */
  timeout: number;
  /** Left out, the web view sends its own. */
  userAgent?: string;
}

/**
 * Loads a page in a hidden web view, for sites whose text only their scripts produce.
 * Resolves with the page's HTML once `waitFor` matches, or with whatever there is when
 * the time runs out; rejects when the page didn't load at all.
 */
export interface PageRenderer {
  render(request: RenderRequest): Promise<{ url: string; status: number; html: string }>;
}

/** A system notification, such as "5 new chapters". */
export interface Notice {
  title: string;
  body: string;
}
