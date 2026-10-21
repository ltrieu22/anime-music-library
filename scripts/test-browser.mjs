import { spawnSync } from 'node:child_process';

// Each runner owns isolated storage, blocks/mocks providers, and closes its browser.
for (const runner of [
  'browser-fixtures', 'catalog-loading', 'collection-reliability', 'anilist-usage',
  'playlist-picker', 'playlist-management', 'play-next-repeat', 'playback-restoration',
  'media-session', 'removal-undo', 'mobile-layout',
]) {
  console.log(`\nRunning ${runner}`);
  const result = spawnSync(process.execPath, [`tests/${runner}.mjs`], { stdio: 'inherit', env: process.env });
  if (result.error) throw result.error;
  if (result.status !== 0) process.exit(result.status ?? 1);
}
