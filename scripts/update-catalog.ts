import assert from 'node:assert/strict';
import { createHash, randomUUID } from 'node:crypto';
import { mkdir, readFile, rename, unlink, writeFile } from 'node:fs/promises';
import { resolve } from 'node:path';
import { pathToFileURL } from 'node:url';
import { isDeepStrictEqual } from 'node:util';
import { gunzipSync, gzipSync } from 'node:zlib';
import { packCatalog, unpackCatalog } from '../src/services/catalogPayload';
import type { AnimeSongItem } from '../src/types';
import { catalogFromDump, catalogSummary, mergeCatalog } from './catalogUpdateData';

const root = new URL('../', import.meta.url);
const catalogPath = 'public/data/anime_catalog.json';
const reportPath = 'data/catalog-update-report.json';
const cachePath = '.cache/catalog-update/';
const endpoint = 'https://anisongdb.com/api/catalog_dump';
const statsEndpoint = 'https://anisongdb.com/api/database_stats';
const maxDumpBytes = 96 * 1024 * 1024;

type CatalogSong = AnimeSongItem & { id: string };
type Report = ReturnType<typeof buildPreview>['report'];

const hash = (bytes: Buffer) => createHash('sha256').update(bytes).digest('hex');
const json = (value: unknown) => Buffer.from(JSON.stringify(value, null, 2) + '\n');

async function readOptional(file: URL) {
  try { return await readFile(file); }
  catch (error) { if (error.code !== 'ENOENT') throw error; }
}

async function removeIfPresent(file: URL) {
  try { await unlink(file); }
  catch (error) { if (error.code !== 'ENOENT') throw error; }
}

async function writeAtomic(file: URL, bytes: Buffer) {
  const temp = new URL(`${file.href}.${randomUUID()}.tmp`);
  try {
    await writeFile(temp, bytes, { flag: 'wx' });
    await rename(temp, file);
  } finally {
    await removeIfPresent(temp);
  }
}

async function archive(file: URL, bytes: Buffer, digest: string, decode = (value: Buffer) => value) {
  const existing = await readOptional(file);
  if (existing) assert.equal(hash(decode(existing)), digest, 'Existing archive has unexpected bytes');
  else await writeAtomic(file, bytes);
}

async function request(fetcher: typeof fetch, url: string, headers?: HeadersInit) {
  const response = await fetcher(url, { headers, signal: AbortSignal.timeout(60_000) });
  if (!response.ok && response.status !== 304) throw new Error(`AniSongDB HTTP ${response.status} for ${url}`);
  return response;
}

async function readDump(response: Response) {
  if (!response.body) throw new Error('AniSongDB returned an empty catalog response');
  const reader = response.body.getReader();
  const parts: Uint8Array[] = [];
  let size = 0;
  try {
    for (let chunk = await reader.read(); !chunk.done; chunk = await reader.read()) {
      size += chunk.value.length;
      if (size > maxDumpBytes) throw new Error('AniSongDB dump exceeds the supported size');
      parts.push(chunk.value);
    }
  } finally {
    await reader.cancel().catch(() => {});
  }
  return Buffer.concat(parts, size);
}

function buildPreview(before: Buffer, original: CatalogSong[], upstream: Map<string, CatalogSong>, snapshot: Buffer, etag: string | null) {
  const { catalog, added, changes, retained, preservedMedia, withoutMedia, ambiguousFingerprints } = mergeCatalog(original, upstream);
  const unchanged = isDeepStrictEqual(catalog, original);
  const newline = before.at(-1) === 10 ? (before.at(-2) === 13 ? '\r\n' : '\n') : '';
  const candidate = unchanged ? before : Buffer.from(JSON.stringify(catalog) + newline);
  const changedFields: Record<string, number> = {};
  for (const change of changes) for (const field of change.fields) {
    changedFields[field] = (changedFields[field] ?? 0) + 1;
  }
  const report = {
    version: 2,
    checkedAt: new Date().toISOString(),
    result: unchanged ? 'already-current' : 'updated',
    endpoint,
    etag,
    decodedBytes: snapshot.length,
    snapshotSha256: hash(snapshot),
    canonicalSource: catalogPath,
    canonicalSha256Before: hash(before),
    canonicalSha256After: hash(candidate),
    localRows: original.length,
    upstreamRows: upstream.size,
    added: added.length,
    changed: changes.length,
    retained: retained.length,
    retainedIds: retained,
    addedWithoutMedia: withoutMedia,
    preservedMedia,
    changedFields,
    legacyFingerprints: {
      songsWithHistory: catalog.filter(song => song.legacy_song_fingerprints?.length).length,
      songsWithAmbiguities: ambiguousFingerprints.length,
    },
    catalog: catalogSummary(catalog),
  };
  return { candidate, report, added, changes, ambiguousFingerprints };
}

export async function updateCatalog(
  action: 'preview' | 'promote',
  project = root,
  fetcher = globalThis.fetch,
) {
  const source = new URL(catalogPath, project);
  const receipt = new URL(reportPath, project);
  const cache = new URL(cachePath, project);
  const preview = new URL('preview.json', cache);
  const stagedFile = new URL('anime_catalog.staged.json', cache);
  await mkdir(cache, { recursive: true });
  const lock = new URL('update.lock', cache);
  await writeFile(lock, String(process.pid), { flag: 'wx' }).catch(error => {
    if (error.code === 'EEXIST') throw new Error('A catalog update is in progress. Check the update.lock process before retrying.');
    throw error;
  });
  try {
    const current = await readFile(source);
    const currentHash = hash(current);
    const previousReceipt = await readOptional(receipt);
    const published = previousReceipt && JSON.parse(previousReceipt.toString('utf8'));
    if (action === 'promote') {
      const staged = await readOptional(preview);
      if (!staged) throw new Error('Run the catalog preview before promoting');
      const { report }: { report: Report } = JSON.parse(staged.toString('utf8'));
      const completingPromotion = currentHash === report.canonicalSha256After;
      if (!completingPromotion && currentHash !== report.canonicalSha256Before) {
        throw new Error('Canonical catalog changed since preview. Run a new preview.');
      }
      const candidate = await readFile(stagedFile);
      assert.equal(hash(candidate), report.canonicalSha256After, 'Staged catalog changed since preview');
      const rows = JSON.parse(candidate.toString('utf8'));
      assert.deepEqual(catalogSummary(rows), report.catalog, 'Staged catalog summary does not match the preview');
      assert.deepEqual(unpackCatalog(JSON.parse(JSON.stringify(packCatalog(rows)))), rows, 'Compact catalog round-trip failed');
      if (published?.canonicalSha256After === currentHash && isDeepStrictEqual(published, report)) return report;
      const backup = new URL(`before-${report.canonicalSha256Before}.json`, cache);
      if (completingPromotion && report.canonicalSha256Before !== currentHash) {
        assert.equal(hash(await readFile(backup)), report.canonicalSha256Before, 'Original catalog backup does not match the preview');
      } else {
        await archive(backup, current, currentHash);
      }
      assert.equal(hash(await readFile(source)), currentHash, 'Canonical catalog changed during promotion');
      if (!completingPromotion) await writeAtomic(source, candidate);
      await writeAtomic(receipt, json(report));
      return report;
    }

    await removeIfPresent(preview);
    const conditional = published?.endpoint === endpoint && published.canonicalSha256After === currentHash
      && typeof published.etag === 'string' && !!published.etag;
    const response = await request(fetcher, endpoint, conditional ? { 'If-None-Match': published.etag } : undefined);
    if (response.status === 304) {
      if (!conditional) throw new Error('AniSongDB returned an unexpected 304 without a matching published catalog');
      return { result: 'not-modified' as const, etag: published.etag };
    }

    const snapshot = await readDump(response);
    const upstream = catalogFromDump(JSON.parse(snapshot.toString('utf8')));
    const stats = await (await request(fetcher, statsEndpoint)).json();
    assert.equal(stats.total_songs, upstream.size, 'AniSongDB statistics and dump counts disagree. Retry the preview.');
    const original: CatalogSong[] = JSON.parse(current.toString('utf8'));
    catalogSummary(original);
    const { candidate, ...stage } = buildPreview(current, original, upstream, snapshot, response.headers.get('etag'));
    assert.equal(hash(await readFile(source)), currentHash, 'Canonical catalog changed during preview');
    const compressed = gzipSync(snapshot);
    await archive(new URL(`snapshot-${stage.report.snapshotSha256}.json.gz`, cache), compressed, stage.report.snapshotSha256, gunzipSync);
    await writeAtomic(stagedFile, candidate);
    await writeAtomic(preview, json(stage));
    return stage.report;
  } finally {
    await unlink(lock);
  }
}

if (process.argv[1] && import.meta.url === pathToFileURL(resolve(process.argv[1])).href) {
  const args = process.argv.slice(2);
  if (args.length > 1 || (args.length === 1 && !['--preview', '--promote'].includes(args[0]))) {
    console.error('Usage: npm run update:catalog -- [--preview | --promote]');
    process.exitCode = 1;
  } else {
    updateCatalog(args[0] === '--promote' ? 'promote' : 'preview').then(report => {
      console.log(JSON.stringify(report, null, 2));
    }).catch(error => {
      console.error(error instanceof Error ? error.message : String(error));
      process.exitCode = 1;
    });
  }
}
