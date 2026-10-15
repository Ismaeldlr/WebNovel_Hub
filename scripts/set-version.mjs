// Sets the apps' version everywhere it is written: `npm run set-version -- 1.2.3`.
// Android's version code comes from it too (apps/mobile/android/app/build.gradle).
// Merging a pull request that changes it releases that version (.github/workflows/release.yml).
import { readFileSync, writeFileSync } from 'node:fs';

const version = process.argv[2] ?? '';
if (!/^\d+\.\d+\.\d+$/.test(version)) {
  console.error('Give the new version, such as: npm run set-version -- 1.2.3');
  process.exit(1);
}

const CHANGES = {
  'apps/desktop/package.json': (text) => text.replace(/("version": ")[^"]+"/, `$1${version}"`),
  'apps/mobile/package.json': (text) => text.replace(/("version": ")[^"]+"/, `$1${version}"`),
  'package-lock.json': (text) =>
    text.replace(
      /("name": "@webnovel-hub\/(?:desktop|mobile)",\s*"version": ")[^"]+"/g,
      `$1${version}"`,
    ),
  'apps/desktop/src-tauri/Cargo.toml': (text) =>
    text.replace(/^(version = ")[^"]+"/m, `$1${version}"`),
  'apps/desktop/src-tauri/Cargo.lock': (text) =>
    text.replace(/(name = "webnovel-hub"\nversion = ")[^"]+"/, `$1${version}"`),
  '.github/ISSUE_TEMPLATE/site_broken.yml': (text) =>
    text.replace(/(placeholder: )\d+\.\d+\.\d+( on Android)/, `$1${version}$2`),
};

for (const [path, change] of Object.entries(CHANGES)) {
  const before = readFileSync(path, 'utf8');
  const after = change(before);
  if (!after.includes(version)) throw new Error(`${path}: couldn't find its version`);
  if (after !== before) writeFileSync(path, after);
  console.log(`${after === before ? 'already' : 'set    '} ${path}`);
}
console.log(`Webnovel Hub ${version}`);
