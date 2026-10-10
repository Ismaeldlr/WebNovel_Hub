import { type Core, createCore } from '@webnovel-hub/core';
import { getPlatform } from '../platform';

let started: Promise<Core> | null = null;

/**
 * Runs the core's jobs in one tab only: two tabs on one database would each take the
 * other's interrupted jobs for their own, and ask each site twice as often.
 */
function runJobsInOneTab(core: Core): void {
  const runner = core.runner;
  if (!runner) return;
  if (!('locks' in navigator)) {
    void runner.start();
    return;
  }
  void navigator.locks.request('webnovel-hub-jobs', async () => {
    await runner.start();
    // Held while the tab is open; the next tab takes over when this one closes.
    await new Promise<never>(() => undefined);
  });
}

/** The app's core: its library database and services, opened once on first use. */
export function getCore(): Promise<Core> {
  started ??= getPlatform()
    .then(async (platform) => {
      const core = await createCore({
        driver: platform.driver,
        http: platform.http,
        ...(platform.renderer ? { renderer: platform.renderer } : {}),
        ...(platform.notify ? { notify: platform.notify } : {}),
        logger: console,
      });
      return { platform, core };
    })
    .then(
      ({ platform, core }) => {
        runJobsInOneTab(core);
        platform.onCoreReady?.(core);
        return core;
      },
      (error: unknown) => {
        started = null; // try again on the next request
        throw error;
      },
    );
  return started;
}
