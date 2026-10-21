# Dataset freshness and future updates

## Latest check: 2026-10-21

The live `GET https://anisongdb.com/api/catalog_dump` snapshot contains **38,821 songs with 38,821 unique ANN song IDs**, matching the shipped catalog. The live `GET /api/database_stats` independently reports the same song count. The latest season represented by that source is Summer 2026; this check does not imply that upstream has added every recently released song.

The compressed snapshot was 3,833,739 bytes (23,349,398 bytes decoded). Comparing all thirteen existing song fields by exact `song-<annSongId>` identity found:

| Result | Songs |
| --- | ---: |
| New | 0 |
| Changed | 0 |
| Missing upstream | 0 |
| Existing IDs retained | 38,821 |

No canonical catalog rewrite was needed. Its SHA-256 remains `da1df9014934e291f5213e91eb70dd71bd23ad33dfdd311e43f331c9de23c34a`. The original bytes, downloaded snapshot and comparison script are retained locally in the ignored `.cache/catalog-update/` directory. The durable evidence is [catalog-update-report.json](../data/catalog-update-report.json).

The dump uses separate `anime`, `artists` and `songs` structures. Its raw anime names can be null even when the ordinary song API returns both display names: the API falls back to the other available language. Applying that same fallback preserves the existing English titles on 10,158 songs and romaji/display titles on 10,207 songs. API lookups for ANN song IDs 15, 25, 34830 and 34831 confirmed the interpretation. These are fallback counts, not changed songs. Copying the raw nullable fields directly would lose existing title coverage.

## Saved-data compatibility

The comparison checked every existing catalog ID, note key, metadata fingerprint, saved-copy source ID, playlist reference and playback mapping. It also parsed the legacy, v1 and v2 backup fixtures. The canonical JSON remains byte-for-byte unchanged. No browser storage was accessed by the comparison, and no storage schema, saved numbers, playlist IDs, queue IDs, imports or migrations were changed.

Validation includes TypeScript checking, all 131 service tests, the production build, and isolated production-browser checks for catalog loading/exact-ID media, playlist management/persistence, and playback/history restoration. Browser checks use disposable profiles, local test audio and blocked provider requests; they do not touch people's normal site storage. They verify application compatibility, not the availability of every remote media file.

## Proposed easier workflow (not implemented)

Add a manual `npm run update:catalog` command that checks and previews changes, with a separate `--promote` step for reviewed data. It can reuse the ETag recorded in the verification report:

1. Request `/api/catalog_dump` with `If-None-Match`. A `304` needs no dataset download. Only trust a recorded ETag when its associated canonical hash still matches the current file. Handle failed requests as errors, never as empty catalogs.
2. When changed, cache the compressed snapshot and metadata, reconstruct the existing song shape, and compare by exact ANN song ID. Preserve IDs and existing row order; append new IDs. Keep old rows missing upstream available and report them for review rather than automatically breaking old references. Flag conflicting identities and missing titles/media instead of silently discarding valid existing data.
3. Write a staged catalog and an additions/changes/retained-rows report. Run identity, title, search, playback, backup and compact-payload checks before promotion. The current tests, historical title-enrichment validator and footer contain fixed snapshot counts; review those when the catalog actually grows.
4. Preserve an immutable source backup and promote validated data atomically. Record the new ETag only after successful promotion, then rebuild the generated compact browser asset. A no-change check should leave the canonical file alone.

A later GitHub Actions job could run that command and open a data-only pull request for review. This idea is deliberately deferred: no scheduled job, automatic deployment, runtime refresh or general updater was added in this check.

The endpoint is live but omitted from Swagger. Its implementation and dump format can be checked in [AnisongDB's backend](https://github.com/xSardine/AMQ-Artists-DB/blob/main/backEnd/app/main.py#L544) and [catalog builder](https://github.com/xSardine/AMQ-Artists-DB/blob/main/backEnd/app/catalog.py#L191). The existing `enrich:titles` command only enriches known IDs and reuses its own historical cache; it is not a full-catalog refresh.
