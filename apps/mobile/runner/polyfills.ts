// What the runner's engine lacks and the site adapters use.
import './shims';
import { URL, URLSearchParams } from 'whatwg-url';

const scope = globalThis as Record<string, unknown>;
scope.URL ??= URL;
scope.URLSearchParams ??= URLSearchParams;
