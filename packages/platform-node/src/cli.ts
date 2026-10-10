// Checks adapters against the real sites: `npm run scrape -- <novel URL> [--chapter N]`
// reads a novel's metadata, its chapter list and one chapter, as an import and a reader
// would; `npm run scrape -- --samples [site key…]` does the same for one sample novel per
// site. Requests keep the app's pace (2 s apart per site).
import { parseArgs } from 'node:util';
import {
  HostThrottle,
  SourceSession,
  countWords,
  defaultRegistry,
  htmlToText,
} from '@webnovel-hub/core/scraper';
import { nodeHttpClient } from './http.js';

/** A novel on each site that should keep working: long-running and free to read. */
const SAMPLES: Record<string, string> = {
  royal_road: 'https://www.royalroad.com/fiction/21220/mother-of-learning',
  wtr_lab: 'https://wtr-lab.com/en/novel/2/lin-yuanxing',
  ranobes: 'https://ranobes.net/novels/1207214-make-the-immortal-sect-great-again.html',
  novel_fire: 'https://novelfire.net/book/shadow-slave',
  wuxiaworld: 'https://www.wuxiaworld.com/novel/martial-world',
  read_novel_full: 'https://readnovelfull.com/second-world.html',
  novgo: 'https://novgo.net/versatile-mage.html',
  novel_ping: 'https://novelping.com/book/a-hospital-in-another-world',
  wuxia_box: 'https://www.wuxiabox.com/novel/absolute-resonance.html',
  fan_mtl: 'https://www.fanmtl.com/novel/i-can-copy-talents.html',
  wuxia_spot: 'https://www.wuxiaspot.com/novel/valkyrie-domination.html',
  readnovel_eu: 'https://readnovel.eu/novel/lord-of-the-mysteries',
  lnmtl: 'https://lnmtl.com/novel/king-of-worlds',
  wuxiaworld_site: 'https://wuxiaworld.site/novel/i-have-a-dual-world-seal/',
  light_novel_heaven: 'https://lightnovelheaven.com/series/genius-summoner/',
  sleepy_translations:
    'https://sleepytranslations.com/series/little-one-tears-the-villains-script/',
  hiraeth_translation: 'https://hiraethtranslation.com/novel/after-the-lord-of-the-abyss-awakens/',
  translatin_otaku: 'https://translatinotaku.net/novel/the-strongest-hokage/',
};

const registry = defaultRegistry();
const fetcher = { http: nodeHttpClient(), throttle: new HostThrottle(2_000) };

/** Reads one novel; resolves to whether every step worked. */
async function check(url: string, chapterNumber: number): Promise<boolean> {
  const started = Date.now();
  try {
    const adapter = registry.forUrl(url);
    const canonical = adapter.canonicalize(url);
    const session = new SourceSession(fetcher);
    console.log(`\n${adapter.name}: ${canonical}`);
    const meta = await adapter.fetchNovel(session, canonical);
    console.log(`  title    ${meta.title}`);
    console.log(`  author   ${meta.author ?? '(none)'}`);
    console.log(`  tags     ${meta.tags.join(', ') || '(none)'}`);
    console.log(`  cover    ${meta.coverUrl ?? '(none)'}`);
    console.log(`  about    ${(meta.description ?? '(none)').slice(0, 100).replace(/\n/g, ' ')}`);
    const chapters = await adapter.fetchChapterList(session, canonical);
    console.log(
      `  chapters ${chapters.length}: "${chapters[0]?.title}" … "${chapters.at(-1)?.title}"`,
    );
    const chapter = chapters[chapterNumber - 1];
    if (!chapter) throw new Error(`there is no chapter ${chapterNumber}`);
    const page = await adapter.fetchChapter(session, chapter);
    const text = htmlToText(page.html);
    console.log(`  chapter  ${chapterNumber}, "${chapter.title}": ${countWords(text)} words`);
    console.log(`           ${text.slice(0, 160).replace(/\n+/g, ' / ')}…`);
    console.log(`  ok in ${((Date.now() - started) / 1000).toFixed(1)} s`);
    return true;
  } catch (error) {
    const detail =
      error instanceof Error
        ? ((error as { detail?: string }).detail ?? error.message)
        : String(error);
    console.log(
      `  FAILED (${error instanceof Error ? error.name : 'error'}): ${detail.split('\n')[0]}`,
    );
    return false;
  }
}

const { values, positionals } = parseArgs({
  allowPositionals: true,
  options: {
    chapter: { type: 'string', default: '1' },
    samples: { type: 'boolean', default: false },
  },
});

const urls = values.samples
  ? Object.entries(SAMPLES)
      .filter(([key]) => positionals.length === 0 || positionals.includes(key))
      .map(([, url]) => url)
  : positionals;
if (urls.length === 0) {
  console.log(
    'Usage: npm run scrape -- <novel URL> [--chapter N]\n       npm run scrape -- --samples [site key…]',
  );
  process.exit(2);
}

let failures = 0;
for (const url of urls) {
  if (!(await check(url, Number(values.chapter)))) failures += 1;
}
console.log(`\n${urls.length - failures} of ${urls.length} worked.`);
process.exitCode = failures > 0 ? 1 : 0;
