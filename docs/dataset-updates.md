# Dataset freshness and updates

## November 22, 2026 refresh

AniSongDB’s [catalog dump](https://anisongdb.com/api/catalog_dump) and [statistics](https://anisongdb.com/api/database_stats) both reported **39,257 songs**. The bundled catalog now has **39,268 tracks**. It adds **447**, updates **881**, and retains **11** that are absent from the latest dump. Fall 2026 accounts for **188** of the additions. Five new entries have no media URLs and are searchable with the app’s **Media unavailable** state. The [update report](../data/catalog-update-report.json) records the snapshot hashes, counts, and song IDs that need review.

Matched songs and retained rows keep their ANN song IDs. Older saved songs and notes that rely on metadata can still match 630 songs whose old metadata uniquely identifies them. Six songs had ambiguous old metadata. Their existing collection entries and notes keep their original identities. The browser’s storage formats are unchanged.

The October 21 audit found an exact match at 38,821 tracks. Its [verification report](https://github.com/ltrieu22/anime-music-library/blob/dd799834c90851a0503bcc495097e620961b3460/data/catalog-update-report.json) is available in Git history.

## Updating the catalog

1. Run `npm run update:catalog`. When the published report’s hash matches the canonical file, the command sends the recorded ETag. A `304` ends the check without modifying the catalog. For a new dump, the command validates the schema, compares the song count with AniSongDB’s statistics, and stages the candidate in `.cache/catalog-update/`.
2. Review `.cache/catalog-update/preview.json` for changed fields, additions, absent IDs, preserved media, and ambiguous older metadata. Rows keep their order and IDs. New rows are appended in ANN song ID order. An existing media URL is retained when the new dump omits that media type.
3. Run `npm run update:catalog -- --promote`. Promotion checks the source and candidate hashes, validates the compact catalog round trip, and writes an immutable backup in `.cache/catalog-update/` before replacing the canonical file. It records the ETag in the checked-in report after replacement. If promotion stops after the catalog replacement, rerun `--promote` to finish publishing the report.
4. Run `npm run lint`, `npm test`, `npm run build`, and `npm run test:browser`. Review the resulting catalog and report together in a pull request. Vite regenerates the compact asset during the build, and GitHub Actions deploys the checked-in catalog to Pages.

The workflow runs on demand. A scheduled job that opens data-only pull requests remains a future option. The bulk endpoint is defined in [AniSongDB’s backend](https://github.com/xSardine/AMQ-Artists-DB/blob/main/backEnd/app/main.py#L544). The dump stores songs and anime separately. The updater joins them by ANN anime ID and uses the same English and Japanese-display title fallback as AniSongDB’s song endpoint. `npm run enrich:titles` remains available for title enrichment by known song ID.
