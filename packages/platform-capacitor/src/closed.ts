// The checks for new chapters that run while the app is closed (apps/mobile/runner). The
// runner can't open the database, so the app leaves it the list of novels to check, and
// when the app comes back it runs its own checks for the novels the runner found new
// chapters in, which store those chapters. The runner plugin only takes events while the
// app is on screen (it stops its engine when the app stops), so the list is kept up to
// date while the app is open rather than handed over as it leaves.
import { BackgroundRunner } from '@capacitor/background-runner';
import type { Core, Inbox } from '@webnovel-hub/core';

/** capacitor.config.ts: BackgroundRunner.label */
const LABEL = 'io.github.ismaeldlr.webnovelhub.checks';

/** Leaves the runner the list of novels to check, whenever it differs from the last one. */
export function checkListKeeper(core: Core): () => Promise<void> {
  let left = '';
  return async () => {
    const list = await core.checkList();
    const text = JSON.stringify(list);
    if (text === left) return;
    await BackgroundRunner.dispatchEvent({ label: LABEL, event: 'saveCheckList', details: list });
    left = text;
  };
}

/** Runs the app's own check for each novel the runner found new chapters in. */
export async function collectInbox(core: Core): Promise<void> {
  const inbox = await BackgroundRunner.dispatchEvent<Inbox | null>({
    label: LABEL,
    event: 'takeInbox',
    details: {},
  });
  for (const novelId of Object.keys(inbox ?? {})) {
    await core.dispatch({ method: 'POST', path: `/novels/${novelId}/update-check` });
  }
}
