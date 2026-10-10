import { UnsupportedUrl } from '../errors.js';
import { parseHttpUrl } from '../urls.js';
import type { Adapter } from './base.js';
import { LnmtlAdapter } from './lnmtl/index.js';
import {
  HiraethTranslationAdapter,
  LightNovelHeavenAdapter,
  SleepyTranslationsAdapter,
  TranslatinOtakuAdapter,
  WuxiaWorldSiteAdapter,
} from './madara/index.js';
import { NovelFireAdapter } from './novel-fire/index.js';
import { NovelPingAdapter, NovgoAdapter, ReadNovelFullAdapter } from './novelfull/index.js';
import { RanobesAdapter } from './ranobes/index.js';
import { ReadNovelEuAdapter } from './readnovel-eu/index.js';
import { FanMtlAdapter, WuxiaBoxAdapter, WuxiaSpotAdapter } from './readwn/index.js';
import { RoyalRoadAdapter } from './royal-road/index.js';
import { WtrLabAdapter } from './wtr-lab/index.js';
import { WuxiaworldAdapter } from './wuxiaworld/index.js';

/** Names the site in messages when a job's site is unknown (a scheduled update check). */
export const GENERIC_SITE_NAME = 'the source site';

/** The supported sites, and which one an address belongs to. */
export class Registry {
  readonly adapters: readonly Adapter[];

  constructor(adapters: readonly Adapter[]) {
    this.adapters = adapters;
  }

  /** The adapter for `url`; `UnsupportedUrl`, naming the supported sites, otherwise. */
  forUrl(url: string): Adapter {
    parseHttpUrl(url);
    const adapter = this.adapters.find((candidate) => candidate.matches(url));
    if (adapter) return adapter;
    const names = this.adapters.map((candidate) => candidate.name);
    throw new UnsupportedUrl(
      `no adapter matches ${JSON.stringify(url)}`,
      `This site isn't supported. Supported sites: ${names.join(', ')}.`,
    );
  }

  /** The site's name for messages; a generic phrase when it isn't known. */
  siteName(url: string | null): string {
    return (
      (url && this.adapters.find((adapter) => adapter.matches(url))?.name) || GENERIC_SITE_NAME
    );
  }

  /** Per-host delays, for the sites that need more than the default. */
  hostDelays(): Map<string, number> {
    const delays = new Map<string, number>();
    for (const adapter of this.adapters) {
      if (adapter.requestDelay === null) continue;
      for (const host of adapter.hosts) delays.set(host, adapter.requestDelay);
    }
    return delays;
  }
}

/** Every site the app reads. Supporting another one means adding its adapter here. */
export function defaultRegistry(): Registry {
  return new Registry([
    new RoyalRoadAdapter(),
    new WtrLabAdapter(),
    new RanobesAdapter(),
    new NovelFireAdapter(),
    new WuxiaworldAdapter(),
    new ReadNovelFullAdapter(),
    new NovgoAdapter(),
    new NovelPingAdapter(),
    new WuxiaBoxAdapter(),
    new FanMtlAdapter(),
    new WuxiaSpotAdapter(),
    new ReadNovelEuAdapter(),
    new LnmtlAdapter(),
    new WuxiaWorldSiteAdapter(),
    new LightNovelHeavenAdapter(),
    new SleepyTranslationsAdapter(),
    new HiraethTranslationAdapter(),
    new TranslatinOtakuAdapter(),
  ]);
}
