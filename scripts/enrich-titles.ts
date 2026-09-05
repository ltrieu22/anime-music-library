import { createHash, randomUUID } from 'node:crypto';
import { mkdir, readFile, readdir, rename, writeFile } from 'node:fs/promises';
import path from 'node:path';
import { fileURLToPath, pathToFileURL } from 'node:url';
import type { AnimeSongItem } from '../src/types';
import { enrichmentSongId, matchTitleMetadata } from '../src/services/titleEnrichment';

const ENDPOINT = 'https://anisongdb.com/api/ann_song_ids_request';
const ROOT = fileURLToPath(new URL('../', import.meta.url));
const SOURCE = path.join(ROOT, 'public/data/anime_catalog.json');
const WORK = path.join(ROOT, '.cache/title-enrichment');
type Candidate = Record<string, unknown>;
interface ResponseCache {
  version: 1;
  endpoint: string;
  fetchedAt: string;
  requestedIds: number[];
  candidates: Candidate[];
}
interface Options {
  ids?: string[];
  full?: boolean;
  limit?: number;
  stage?: boolean;
  preview?: boolean;
  retryUnresolved?: boolean;
}

async function atomicJson(file: string, value: unknown) {
  const temp = `${file}.${randomUUID()}.tmp`;
  await writeFile(temp, JSON.stringify(value, null, 2) + '\n', { flag: 'wx' });
  await rename(temp, file);
}

async function requestCandidates(ids: number[]): Promise<Candidate[]> {
  for (let attempt = 0; attempt < 3; attempt++) {
    let response: Response;
    try {
      response = await fetch(ENDPOINT, {
        method: 'POST', headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ ann_song_ids: ids }), signal: AbortSignal.timeout(30_000),
      });
    } catch (error) {
      if (attempt === 2) throw error;
      await new Promise((resolve) => setTimeout(resolve, 1000 * 2 ** attempt));
      continue;
    }
    if (!response.ok) {
      if (attempt === 2 || (response.status !== 429 && response.status < 500)) throw new Error(`AniSongDB HTTP ${response.status}`);
      const retry = response.headers.get('retry-after');
      const seconds = retry && /^\d+$/.test(retry) ? Number(retry) : retry ? (Date.parse(retry) - Date.now()) / 1000 : 0;
      // Do not retry earlier than a long server-requested delay. Resume later instead.
      if (seconds > 60) throw new Error(`Rate limited; resume after ${retry}`);
      await new Promise((resolve) => setTimeout(resolve, Math.max(1000 * 2 ** attempt, (seconds || 0) * 1000)));
      continue;
    }
    const payload: unknown = await response.json();
    if (!Array.isArray(payload) || payload.some((row) => !row || typeof row !== 'object' || Array.isArray(row))) {
      throw new Error('Invalid AniSongDB response; nothing cached');
    }
    return payload;
  }
  throw new Error('Request attempts exhausted');
}

/** Injectable I/O locations/request for offline tests. CLI always uses the canonical source. */
export async function runTitleEnrichment(
  options: Options,
  source = SOURCE,
  work = WORK,
  request = requestCandidates,
) {
  if (Boolean(options.full) === Boolean(options.ids?.length)) throw new Error('Choose --ids song-ID,... or --full');
  const limit = options.limit ?? (options.full ? Infinity : options.ids!.length);
  if (limit !== Infinity && (!Number.isSafeInteger(limit) || limit < 1)) throw new Error('--limit must be a positive integer');
  if (options.stage && !options.full) throw new Error('--stage requires --full; sample runs only write previews');
  if (options.stage && options.preview) throw new Error('Choose --preview or --stage, not both');
  const sourceBytes = await readFile(source);
  const catalog: AnimeSongItem[] = JSON.parse(sourceBytes.toString('utf8'));
  if (!Array.isArray(catalog) || new Set(catalog.map((song) => song.id)).size !== catalog.length) throw new Error('Invalid or duplicate catalog IDs');
  const requested = new Set(options.ids);
  const selected = options.full ? catalog : catalog.filter((song) => requested.has(String(song.id)));
  if (!options.full && selected.length !== requested.size) throw new Error('Requested sample ID is missing from the canonical source');
  const sourceSha256 = createHash('sha256').update(sourceBytes).digest('hex');
  const responses = path.join(work, 'responses');
  await mkdir(responses, { recursive: true });
  const cached = new Map<number, Candidate[]>();
  const unexpectedIds: unknown[] = [];
  function absorb(record: ResponseCache) {
    const byId = new Map<number, Candidate[]>();
    for (const candidate of record.candidates) {
      const id = candidate.annSongId;
      if (typeof id !== 'number' || !record.requestedIds.includes(id)) unexpectedIds.push(id ?? null);
      else byId.set(id, [...(byId.get(id) ?? []), candidate]);
    }
    for (const id of record.requestedIds) cached.set(id, byId.get(id) ?? []);
  }
  for (const file of (await readdir(responses)).filter((file) => file.endsWith('.json')).sort()) {
    const record: ResponseCache = JSON.parse(await readFile(path.join(responses, file), 'utf8'));
    if (record.version !== 1 || record.endpoint !== ENDPOINT || !Array.isArray(record.requestedIds) || !Array.isArray(record.candidates)) {
      throw new Error(`Invalid cache file: ${file}; inspect it before resuming`);
    }
    absorb(record);
  }
  const reusable = (song: AnimeSongItem) => {
    const id = enrichmentSongId(song.id);
    return id !== null && cached.has(id) && (!options.retryUnresolved || matchTitleMetadata(song, cached.get(id)!).status === 'matched');
  };
  const cacheHits = selected.filter(reusable).length;
  const pending = selected.filter((song) => enrichmentSongId(song.id) !== null && !reusable(song)).slice(0, limit);
  let requests = 0;
  let fetchedIds = 0;
  const report = () => {
    const mappings = selected.map((song) => {
      const id = enrichmentSongId(song.id);
      if (id !== null && !cached.has(id)) return { id: song.id, status: 'pending' as const };
      return { id: song.id, ...matchTitleMetadata(song, id === null ? [] : cached.get(id)!) };
    });
    const counts = { matched: 0, unmatched: 0, ambiguous: 0, mismatched: 0, pending: 0 };
    for (const mapping of mappings) counts[mapping.status]++;
    return { version: 1, source, sourceSha256, sourceRows: catalog.length, selectedRows: selected.length,
      requests, fetchedIds, cacheHits, counts, unexpectedIds, mappings };
  };
  await atomicJson(path.join(work, 'progress.json'), report());
  for (let offset = 0; offset < pending.length; offset += 100) {
    const ids = pending.slice(offset, offset + 100).map((song) => enrichmentSongId(song.id)!);
    const candidates = await request(ids);
    const record: ResponseCache = { version: 1, endpoint: ENDPOINT, fetchedAt: new Date().toISOString(), requestedIds: ids, candidates };
    // Commit each complete response before advancing progress. Never touch the source.
    await atomicJson(path.join(responses, `${Date.now()}-${randomUUID()}.json`), record);
    absorb(record);
    requests++;
    fetchedIds += ids.length;
    await atomicJson(path.join(work, 'progress.json'), report());
    console.log(`Cached ${fetchedIds}/${pending.length} requested IDs`);
    if (offset + 100 < pending.length) await new Promise((resolve) => setTimeout(resolve, 1000));
  }
  const result = report();
  if (!sourceBytes.equals(await readFile(source))) throw new Error('Source changed during run; revalidate before using preview');
  await atomicJson(path.join(work, 'preview.json'), result);
  if (options.stage) {
    if (result.counts.pending > 0) throw new Error('Full run still has pending IDs; resume before staging');
    const enriched = catalog.map((song) => {
      const id = enrichmentSongId(song.id);
      const mapping = matchTitleMetadata(song, id === null ? [] : cached.get(id) ?? []);
      return mapping.status === 'matched' ? { ...song, ...mapping.metadata } : song;
    });
    await atomicJson(path.join(work, 'anime_catalog.enriched.json'), enriched);
  }
  console.log(JSON.stringify({ ...result, mappings: undefined }, null, 2));
  return result;
}

function parseArgs(args: string[]): Options {
  const options: Options = {};
  for (let index = 0; index < args.length; index++) {
    switch (args[index]) {
      case '--ids': options.ids = args[++index]?.split(','); break;
      case '--full': options.full = true; break;
      case '--limit': options.limit = Number(args[++index]); break;
      case '--preview': options.preview = true; break; // Default: cache + metadata preview only, no catalog output.
      case '--stage': options.stage = true; break;
      case '--retry-unresolved': options.retryUnresolved = true; break;
      default: throw new Error(`Unknown argument: ${args[index]}`);
    }
  }
  return options;
}

if (process.argv[1] && import.meta.url === pathToFileURL(path.resolve(process.argv[1])).href) {
  runTitleEnrichment(parseArgs(process.argv.slice(2))).catch((error) => {
    console.error(error);
    process.exitCode = 1;
  });
}
