// Small helpers for reading site pages, shared by the adapters.
import { type HTMLElement, NodeType, parse } from 'node-html-parser';
import { htmlToText } from '../../epub/normalize.js';
import { resolveUrl } from '../urls.js';

export { type HTMLElement, NodeType, parse };

type Node = HTMLElement | null | undefined;

/** Text with whitespace collapsed; "" for no text. */
export const collapse = (value: string): string => value.split(/\s+/).filter(Boolean).join(' ');

/** A node's text with whitespace collapsed; "" for no node. */
export const text = (node: Node): string => (node ? collapse(node.textContent) : '');

/** The text of the first selector that matches something non-empty. */
export function firstText(root: HTMLElement, ...selectors: string[]): string {
  for (const selector of selectors) {
    const value = text(root.querySelector(selector));
    if (value) return value;
  }
  return '';
}

/** A string with whitespace collapsed, or null for anything else (or nothing left). */
export function clean(value: unknown): string | null {
  return typeof value === 'string' ? collapse(value) || null : null;
}

/** An attribute's trimmed value, or null when it is missing or empty. */
export function attribute(node: Node, name: string): string | null {
  return node?.getAttribute(name)?.trim() || null;
}

/** The content of `<meta property=name>` or `<meta name=name>`. */
export function meta(root: HTMLElement, name: string): string | null {
  const node =
    root.querySelector(`meta[property="${name}"]`) ?? root.querySelector(`meta[name="${name}"]`);
  return attribute(node, 'content');
}

/** An `<img>`'s real address: lazy-loading attributes first, then `src`. */
export function imageUrl(node: Node, base: string): string | null {
  for (const name of ['data-src', 'data-lazy-src', 'src']) {
    const value = attribute(node, name);
    if (value && !value.startsWith('data:')) return resolveUrl(value, base);
  }
  return null;
}

/** The distinct non-empty texts of `nodes`, in order (genre links, for example). */
export const texts = (nodes: HTMLElement[]): string[] => [
  ...new Set(nodes.map(text).filter(Boolean)),
];

/** Removes every element matching `junk` from inside `node`; returns `node`. */
export function strip(node: HTMLElement, junk: string): HTMLElement {
  for (const element of node.querySelectorAll(junk)) element.remove();
  return node;
}

/** A description element as plain paragraphs, without "show more" toggles. */
export function description(node: Node, junk?: string): string | null {
  if (!node) return null;
  if (junk) strip(node, junk);
  return htmlToText(node.outerHTML) || null;
}

/** A description the site's data holds as HTML (or plain text). */
export function htmlDescription(value: unknown): string | null {
  return typeof value === 'string' ? htmlToText(value) || null : null;
}

const ESCAPES: Record<string, string> = {
  '&': '&amp;',
  '<': '&lt;',
  '>': '&gt;',
  '"': '&quot;',
  "'": '&#x27;',
};

export const escapeHtml = (value: string): string =>
  value.replace(/[&<>"']/g, (char) => ESCAPES[char]!);

/** Plain text with one paragraph per line, as HTML for the normalizer. */
export function paragraphs(plain: string): string {
  return plain
    .split(/\r\n|\r|\n/)
    .map((line) => line.trim())
    .filter(Boolean)
    .map((line) => `<p>${escapeHtml(line)}</p>`)
    .join('');
}

type JsonObject = Record<string, unknown>;

const isObject = (value: unknown): value is JsonObject =>
  typeof value === 'object' && value !== null && !Array.isArray(value);

/** The first JSON-LD object of one of `types` (any type if none given), or {}. */
export function jsonLd(root: HTMLElement, ...types: string[]): JsonObject {
  for (const script of root.querySelectorAll('script[type="application/ld+json"]')) {
    let data: unknown;
    try {
      data = JSON.parse(script.textContent);
    } catch {
      continue;
    }
    const items = isObject(data) ? (data['@graph'] ?? [data]) : data;
    for (const item of Array.isArray(items) ? (items as unknown[]) : []) {
      if (!isObject(item)) continue;
      const kind = item['@type'];
      const kinds = Array.isArray(kind) ? (kind as unknown[]) : [kind];
      if (types.length === 0 || kinds.some((k) => types.includes(k as string))) return item;
    }
  }
  return {};
}

/**
 * The JSON value that starts right after `marker` in a page's scripts, or undefined.
 * The value ends where its brackets (or string) close; whatever follows is ignored.
 */
export function embeddedJson(page: string, marker: RegExp): unknown {
  const found = marker.exec(page);
  if (!found) return undefined;
  const start = found.index + found[0].length;
  const end = jsonEnd(page, start);
  if (end === null) return undefined;
  try {
    return JSON.parse(page.slice(start, end));
  } catch {
    return undefined;
  }
}

/** Where the JSON value starting at `start` ends, or null when it doesn't. */
function jsonEnd(text: string, start: number): number | null {
  const first = text[start];
  if (first !== '{' && first !== '[' && first !== '"') {
    // A number, true, false or null.
    const literal = /^-?[\w.+-]+/.exec(text.slice(start, start + 64));
    return literal ? start + literal[0].length : null;
  }
  let depth = 0;
  let inString = false;
  for (let i = start; i < text.length; i += 1) {
    const char = text[i];
    if (inString) {
      if (char === '\\') i += 1;
      else if (char === '"') {
        inString = false;
        if (depth === 0) return i + 1;
      }
    } else if (char === '"') inString = true;
    else if (char === '{' || char === '[') depth += 1;
    else if (char === '}' || char === ']') {
      depth -= 1;
      if (depth === 0) return i + 1;
    }
  }
  return null;
}

const MONTHS = [
  'january',
  'february',
  'march',
  'april',
  'may',
  'june',
  'july',
  'august',
  'september',
  'october',
  'november',
  'december',
];

const FIELDS: Record<string, string> = {
  '%Y': '(?<year>\\d{4})',
  '%m': '(?<month>\\d{1,2})',
  '%d': '(?<day>\\d{1,2})',
  '%H': '(?<hour>\\d{1,2})',
  '%M': '(?<minute>\\d{1,2})',
  '%S': '(?<second>\\d{1,2})',
  '%B': `(?<monthName>${MONTHS.join('|')})`,
  '%b': `(?<monthShort>${MONTHS.map((month) => month.slice(0, 3)).join('|')})`,
};

function parseFormat(value: string, format: string): Date | null {
  const pattern = format
    .split(/(%[YmdHMSBb])/)
    .map((part) => FIELDS[part] ?? part.replace(/[.*+?^${}()|[\]\\]/g, '\\$&'))
    .join('');
  const groups = new RegExp(`^${pattern}$`, 'i').exec(value)?.groups;
  if (!groups) return null;
  const month = groups.month
    ? Number(groups.month)
    : MONTHS.findIndex((name) =>
        name.startsWith((groups.monthName ?? groups.monthShort ?? '').toLowerCase()),
      ) + 1;
  const parts = [
    Number(groups.year),
    month,
    Number(groups.day ?? 1),
    Number(groups.hour ?? 0),
    Number(groups.minute ?? 0),
    Number(groups.second ?? 0),
  ] as const;
  const [year, , day, hour, minute, second] = parts;
  const date = new Date(Date.UTC(year, month - 1, day, hour, minute, second));
  // Reject dates that rolled over, such as February 30.
  return date.getUTCMonth() === month - 1 && date.getUTCDate() === day ? date : null;
}

/**
 * A date written in one of `formats` (strftime-style: %Y %m %d %H %M %S %B %b), or in
 * ISO 8601 when none is given. A date without a time zone is taken as UTC.
 */
export function parseDate(value: unknown, ...formats: string[]): Date | null {
  if (typeof value !== 'string') return null;
  const textValue = collapse(value);
  if (!textValue) return null;
  if (formats.length === 0) return parseIsoDate(textValue);
  for (const format of formats) {
    const date = parseFormat(textValue, format);
    if (date) return date;
  }
  return null;
}

/**
 * An ISO 8601 date or date-time; null when it isn't one. Without a time zone it is taken
 * as UTC, or refused when `zoned` asks for one.
 */
export function parseIsoDate(value: unknown, zoned = false): Date | null {
  if (typeof value !== 'string') return null;
  const match =
    /^(\d{4})-(\d{2})-(\d{2})(?:[T ](\d{2}):(\d{2})(?::(\d{2})(\.\d+)?)?)?(Z|[+-]\d{2}(?::?\d{2})?)?$/i.exec(
      value.trim(),
    );
  if (!match) return null;
  const [, year, month, day, hour = '0', minute = '0', second = '0', fraction, zone] = match;
  if (zoned && !zone) return null;
  let time = Date.UTC(
    Number(year),
    Number(month) - 1,
    Number(day),
    Number(hour),
    Number(minute),
    Number(second),
    fraction ? Math.floor(Number(fraction) * 1000) : 0,
  );
  if (zone && zone.toUpperCase() !== 'Z') {
    const sign = zone.startsWith('-') ? -1 : 1;
    const digits = zone.slice(1).replace(':', '');
    time -= sign * (Number(digits.slice(0, 2)) * 60 + Number(digits.slice(2) || 0)) * 60_000;
  }
  const date = new Date(time);
  return Number.isNaN(date.getTime()) ? null : date;
}
