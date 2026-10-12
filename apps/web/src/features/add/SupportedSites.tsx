import type { SourceSite } from '@webnovel-hub/shared';
import { ChevronDown, ExternalLink } from 'lucide-react';
import { useState } from 'react';
import { Button } from '../../components/ui';
import { COMPACT_QUERY } from '../../lib/breakpoints';
import { useMediaQuery } from '../../lib/hooks';
import styles from './AddNovelsPage.module.css';

/** Phones: how many sites show before "Show all". */
const PHONE_SITES = 5;

type ListedSite = SourceSite & { homeUrl: string };

/** "https://www.novelfire.net/" -> "novelfire.net". */
function siteAddress(homeUrl: string): string {
  try {
    return new URL(homeUrl).hostname.replace(/^www\./, '');
  } catch {
    return homeUrl;
  }
}

/** The sites as links; on phones the first few, then a button for the rest. */
function SiteList({ sites }: { sites: ListedSite[] }) {
  const phone = useMediaQuery(COMPACT_QUERY);
  const [all, setAll] = useState(false);
  const folded = phone && !all && sites.length > PHONE_SITES + 1;
  const shown = folded ? sites.slice(0, PHONE_SITES) : sites;
  return (
    <>
      <ul className={styles.siteList}>
        {shown.map((site) => (
          <li key={site.key}>
            <a
              className={styles.site}
              href={site.homeUrl}
              target="_blank"
              rel="noopener noreferrer"
            >
              <span className={styles.siteText}>
                <span className={styles.siteName}>{site.name}</span>
                <span className={styles.siteAddress}>{siteAddress(site.homeUrl)}</span>
              </span>
              <ExternalLink className={styles.siteIcon} aria-hidden="true" />
            </a>
          </li>
        ))}
      </ul>
      {folded && (
        <Button
          variant="ghost"
          size="sm"
          iconEnd={<ChevronDown aria-hidden="true" />}
          className={styles.allSites}
          onClick={() => setAll(true)}
        >
          Show all {sites.length} sites
        </Button>
      )}
    </>
  );
}

/**
 * Every site a novel can be imported from, each a link to its front page, so the reader
 * can go find a novel there and paste its address in the form above. Sites that don't
 * work reliably yet are listed apart.
 */
export function SupportedSites({ sources }: { sources: readonly SourceSite[] }) {
  const listed = sources
    .filter((source): source is ListedSite => Boolean(source.importable && source.homeUrl))
    .sort((a, b) => a.name.localeCompare(b.name, undefined, { sensitivity: 'base' }));
  const sites = listed.filter((site) => !site.inProgress);
  const inProgress = listed.filter((site) => site.inProgress);
  if (listed.length === 0) return null;

  return (
    <>
      {sites.length > 0 && (
        <section className={styles.sites} aria-labelledby="supported-sites">
          <h2 id="supported-sites" className={styles.sitesTitle}>
            Supported sites
          </h2>
          <p className={styles.help}>
            Find a novel on one of these {sites.length} sites, then paste its address above. Each
            opens in a new tab.
          </p>
          <SiteList sites={sites} />
        </section>
      )}
      {inProgress.length > 0 && (
        <section className={styles.sites} aria-labelledby="sites-in-progress">
          <h2 id="sites-in-progress" className={styles.sitesTitle}>
            Work in progress
          </h2>
          <p className={styles.help}>
            These sites can be imported from, but they don&apos;t work reliably yet: an import or a
            chapter may fail.
          </p>
          <SiteList sites={inProgress} />
        </section>
      )}
    </>
  );
}
