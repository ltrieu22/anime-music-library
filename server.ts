import { copyAnimeSeasonMetadata } from './src/services/animeSeason';
import express from 'express';
import path from 'path';
import fs from 'fs';
import { createServer as createViteServer } from 'vite';
import { searchCatalogResults } from './src/services/catalogResults';
import type { AnimeTitleMetadata } from './src/types';
import { copyAnimeTitleMetadata } from './src/services/animeTitles';
import { fetchAniList } from './src/services/anilistClient';

interface AnimeSongEntry extends AnimeTitleMetadata {
  id: number;
  source_song_id?: string | number;
  anime_name: string;
  anime_year: number;
  artist: string;
  song_name: string;
  theme_type?: string;
  video_url?: string;
}

const PORT = 3000;
const DATA_DIR = path.join(process.cwd(), 'data');
const DATA_FILE = path.join(DATA_DIR, 'entries.json');

// In-memory cache for API searches (TTL 1 hour)
const searchCache = new Map<string, { timestamp: number; data: any }>();
const CACHE_TTL_MS = 60 * 60 * 1000;

function normalizeSourceSongId(value: unknown): string | number | undefined {
  if (typeof value === 'number' && Number.isFinite(value)) {
    return value;
  }
  if (typeof value === 'string' && value.trim()) {
    return value.trim();
  }
  return undefined;
}

function loadEntries(): AnimeSongEntry[] {
  try {
    if (!fs.existsSync(DATA_FILE)) {
      return [];
    }
    const raw = fs.readFileSync(DATA_FILE, 'utf-8');
    return JSON.parse(raw);
  } catch (err) {
    console.error('Failed to load data file:', err);
    return [];
  }
}

// Atomic file write to prevent data corruption
function saveEntries(entries: AnimeSongEntry[]): boolean {
  try {
    if (!fs.existsSync(DATA_DIR)) {
      fs.mkdirSync(DATA_DIR, { recursive: true });
    }
    const tempFile = `${DATA_FILE}.tmp.${Date.now()}`;
    fs.writeFileSync(tempFile, `${JSON.stringify(entries, null, 2)}\n`, 'utf-8');
    fs.renameSync(tempFile, DATA_FILE);
    return true;
  } catch (err) {
    console.error('Failed to save data file:', err);
    return false;
  }
}

async function startServer() {
  const app = express();
  app.use(express.json({ limit: '10mb' }));

  // API Routes
  app.get('/api/health', (req, res) => {
    res.json({ status: 'ok', timestamp: new Date().toISOString() });
  });

  // Get all entries
  app.get('/api/entries', (req, res) => {
    const entries = loadEntries();
    res.json({ data: entries, total: entries.length });
  });

  // Add new entry
  app.post('/api/entries', (req, res) => {
    const { anime_name, anime_year, artist, song_name, source_song_id, theme_type, video_url } = req.body;
    if (!anime_name || !anime_name.trim()) {
      return res.status(400).json({ error: 'Anime name is required' });
    }

    const entries = loadEntries();
    const maxId = entries.length > 0 ? Math.max(...entries.map((e) => e.id || 0)) : 0;
    const sourceSongId = normalizeSourceSongId(source_song_id);
    const newEntry: AnimeSongEntry = {
      ...copyAnimeTitleMetadata(req.body),
      ...copyAnimeSeasonMetadata(req.body),
      id: maxId + 1,
      ...(sourceSongId !== undefined ? { source_song_id: sourceSongId } : {}),
      anime_name: anime_name.trim(),
      anime_year: Number(anime_year) || new Date().getFullYear(),
      artist: (artist || '').trim(),
      song_name: (song_name || '').trim(),
      ...(theme_type ? { theme_type: String(theme_type).trim() } : {}),
      ...(video_url ? { video_url: String(video_url).trim() } : {}),
    };

    entries.push(newEntry);
    saveEntries(entries);
    res.status(201).json({ success: true, entry: newEntry });
  });

  // Update entry
  app.put('/api/entries/:id', (req, res) => {
    const id = Number(req.params.id);
    const { anime_name, anime_year, artist, song_name, source_song_id, theme_type, video_url } = req.body;
    const sourceSongId = normalizeSourceSongId(source_song_id);

    const entries = loadEntries();
    const idx = entries.findIndex((e) => e.id === id);
    if (idx === -1) {
      return res.status(404).json({ error: 'Entry not found' });
    }

    entries[idx] = {
      ...entries[idx],
      ...copyAnimeTitleMetadata(req.body),
      ...copyAnimeSeasonMetadata(req.body),
      ...(source_song_id !== undefined && sourceSongId !== undefined
        ? { source_song_id: sourceSongId }
        : {}),
      anime_name: anime_name !== undefined ? anime_name.trim() : entries[idx].anime_name,
      anime_year: anime_year !== undefined ? Number(anime_year) || entries[idx].anime_year : entries[idx].anime_year,
      artist: artist !== undefined ? artist.trim() : entries[idx].artist,
      song_name: song_name !== undefined ? song_name.trim() : entries[idx].song_name,
      ...(theme_type !== undefined ? { theme_type: String(theme_type).trim() } : {}),
      ...(video_url !== undefined ? { video_url: String(video_url).trim() } : {}),
    };

    saveEntries(entries);
    res.json({ success: true, entry: entries[idx] });
  });

  // Delete entry
  app.delete('/api/entries/:id', (req, res) => {
    const id = Number(req.params.id);
    const entries = loadEntries();
    const filtered = entries.filter((e) => e.id !== id);

    if (filtered.length === entries.length) {
      return res.status(404).json({ error: 'Entry not found' });
    }

    saveEntries(filtered);
    res.json({ success: true, deletedId: id });
  });

  // Reset entries to default
  app.post('/api/entries/reset', (req, res) => {
    try {
      saveEntries([]);
      res.json({ success: true, count: 0 });
    } catch (err: any) {
      res.status(500).json({ error: err.message });
    }
  });

  // Import entries
  app.post('/api/entries/import', (req, res) => {
    const { entries } = req.body;
    if (!Array.isArray(entries)) {
      return res.status(400).json({ error: 'Invalid entries format' });
    }

    const validated: AnimeSongEntry[] = entries.map((e, index) => {
      const sourceSongId = normalizeSourceSongId(e.source_song_id);
      return {
        id: Number(e.id) || index + 1,
        ...copyAnimeTitleMetadata(e),
        ...copyAnimeSeasonMetadata(e),
        ...(sourceSongId !== undefined ? { source_song_id: sourceSongId } : {}),
        anime_name: String(e.anime_name || '').trim(),
        anime_year: Number(e.anime_year) || 2020,
        artist: String(e.artist || '').trim(),
        song_name: String(e.song_name || '').trim(),
      };
    }).filter((e) => e.anime_name.length > 0);

    saveEntries(validated);
    res.json({ success: true, count: validated.length });
  });

  // Fast Anime Theme Song search proxy
  // Queries AnimeThemes.moe for OP/ED/Insert songs and artists, plus AniList for cover art
  app.get('/api/anime/search', async (req, res) => {
    const query = String(req.query.q || '').trim();
    if (!query) {
      return res.json({ results: [] });
    }

    const cacheKey = query.toLowerCase();
    const cached = searchCache.get(cacheKey);
    if (cached && Date.now() - cached.timestamp < CACHE_TTL_MS) {
      return res.json({ results: cached.data, cached: true });
    }

    try {
      // 1. Query AnimeThemes API (specialized in OP/ED/Insert themes + song titles + artists)
      const atUrl = `https://api.animethemes.moe/anime?q=${encodeURIComponent(query)}&include=animethemes.song.artists,images`;
      const atPromise = fetch(atUrl, {
        headers: {
          'User-Agent': 'AnimeSongDB/1.0 (private-use; github.com/ltrieu22/testi_anime_db)',
          Accept: 'application/json',
        },
      }).then((r) => (r.ok ? r.json() : null)).catch(() => null);

      // 2. Query AniList GraphQL for cover image & official english/romaji titles
      const anilistQuery = `
        query ($search: String) {
          Page(page: 1, perPage: 5) {
            media(search: $search, type: ANIME, sort: SEARCH_MATCH) {
              id
              title {
                romaji
                english
                native
              }
              seasonYear
              startDate {
                year
              }
              coverImage {
                medium
                large
              }
            }
          }
        }
      `;
      const anilistPromise = fetchAniList({
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
          Accept: 'application/json',
        },
        body: JSON.stringify({
          query: anilistQuery,
          variables: { search: query },
        }),
      }).then((r) => (r.ok ? r.json() : null)).catch(() => null);

      const [atData, anilistData] = await Promise.all([atPromise, anilistPromise]);

      const anilistMediaList: any[] = anilistData?.data?.Page?.media || [];
      const anilistMap = new Map<string, any>();
      for (const m of anilistMediaList) {
        if (m.title?.romaji) anilistMap.set(m.title.romaji.toLowerCase(), m);
        if (m.title?.english) anilistMap.set(m.title.english.toLowerCase(), m);
      }

      const results: any[] = [];

      if (atData?.anime && Array.isArray(atData.anime)) {
        for (const anime of atData.anime.slice(0, 8)) {
          const themes = (anime.animethemes || []).map((t: any) => ({
            type: t.type || 'THEME',
            sequence: t.sequence,
            title: t.song?.title || 'Unknown Title',
            artist: (t.song?.artists || []).map((a: any) => a.name).join(', ') || 'Unknown Artist',
          }));

          // Try finding cover in AnimeThemes or fallback to AniList
          let coverImage: string | undefined = undefined;
          if (anime.images && Array.isArray(anime.images) && anime.images.length > 0) {
            const largeCover = anime.images.find((img: any) => img.facet === 'Large Cover');
            coverImage = largeCover ? largeCover.link : anime.images[0].link;
          }

          if (!coverImage) {
            const matchedAni = anilistMap.get(anime.name.toLowerCase());
            if (matchedAni) {
              coverImage = matchedAni.coverImage?.large || matchedAni.coverImage?.medium;
            }
          }

          results.push({
            id: anime.id,
            name: anime.name,
            year: anime.year || null,
            coverImage,
            themes,
          });
        }
      }

      // If AnimeThemes returned nothing or few results, also add AniList results as suggestions
      if (results.length === 0 && anilistMediaList.length > 0) {
        for (const m of anilistMediaList) {
          results.push({
            id: `al-${m.id}`,
            name: m.title?.english || m.title?.romaji,
            year: m.seasonYear || m.startDate?.year || null,
            coverImage: m.coverImage?.large || m.coverImage?.medium,
            themes: [], // AniList does not store OP/ED tracks
          });
        }
      }

      searchCache.set(cacheKey, { timestamp: Date.now(), data: results });
      res.json({ results, cached: false });
    } catch (err: any) {
      console.error('Anime search error:', err);
      res.status(500).json({ error: 'Search failed', message: err.message });
    }
  });

  // Anime Cover & Details Endpoint (AniList GraphQL with in-memory caching)
  const coverCache = new Map<string, { timestamp: number; data: any }>();
  const COVER_CACHE_TTL = 24 * 60 * 60 * 1000; // 24 hours

  app.get('/api/anime/cover', async (req, res) => {
    const title = String(req.query.title || '').trim();
    const anilistId = req.query.id ? Number(req.query.id) : null;
    if (!title && !anilistId) {
      return res.status(400).json({ error: 'Title or AniList ID is required' });
    }

    const cacheKey = anilistId ? `id_${anilistId}` : title.toLowerCase();
    const cached = coverCache.get(cacheKey);
    if (cached && Date.now() - cached.timestamp < COVER_CACHE_TTL) {
      return res.json({ data: cached.data, cached: true });
    }

    try {
      const anilistQuery = `
        query ($search: String, $id: Int) {
          Media(search: $search, id: $id, type: ANIME) {
            id
            title {
              romaji
              english
              native
            }
            coverImage {
              large
              medium
              color
            }
            bannerImage
            format
            season
            seasonYear
            startDate {
              year
            }
            episodes
            genres
            averageScore
            studios(isMain: true) {
              nodes {
                name
              }
            }
          }
        }
      `;

      const variables: any = {};
      if (anilistId) {
        variables.id = anilistId;
      } else {
        variables.search = title;
      }

      const response = await fetchAniList({
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
          Accept: 'application/json',
        },
        body: JSON.stringify({
          query: anilistQuery,
          variables,
        }),
      });

      if (!response.ok) {
        // Fallback to Kitsu API if AniList is unreachable or blocked
        try {
          const kitsuUrl = `https://kitsu.io/api/edge/anime?filter[text]=${encodeURIComponent(title || '')}&page[limit]=1`;
          const kRes = await fetch(kitsuUrl, { headers: { Accept: 'application/vnd.api+json' } });
          if (kRes.ok) {
            const kJson = await kRes.json();
            const item = kJson.data?.[0]?.attributes;
            if (item) {
              const kResult = {
                id: anilistId || null,
                anime: item.canonicalTitle || title,
                romaji: item.titles?.ja_jp || item.canonicalTitle || title,
                english: item.titles?.en || item.titles?.en_jp || null,
                coverImage: item.posterImage?.small || item.posterImage?.medium || item.posterImage?.original || null,
                year: item.startDate ? parseInt(item.startDate.slice(0, 4)) : null,
                score: item.averageRating ? Math.round(parseFloat(item.averageRating)) : null,
              };
              coverCache.set(cacheKey, { timestamp: Date.now(), data: kResult });
              return res.json({ data: kResult, cached: false });
            }
          }
        } catch (e) {
          console.warn('Kitsu fallback in server.ts failed:', e);
        }
        return res.json({ data: { anime: title || `Anime #${anilistId}` } });
      }

      const json = await response.json();
      const media = json?.data?.Media;

      if (!media) {
        try {
          const kitsuUrl = `https://kitsu.io/api/edge/anime?filter[text]=${encodeURIComponent(title || '')}&page[limit]=1`;
          const kRes = await fetch(kitsuUrl, { headers: { Accept: 'application/vnd.api+json' } });
          if (kRes.ok) {
            const kJson = await kRes.json();
            const item = kJson.data?.[0]?.attributes;
            if (item) {
              const kResult = {
                id: anilistId || null,
                anime: item.canonicalTitle || title,
                romaji: item.titles?.ja_jp || item.canonicalTitle || title,
                english: item.titles?.en || item.titles?.en_jp || null,
                coverImage: item.posterImage?.small || item.posterImage?.medium || item.posterImage?.original || null,
                year: item.startDate ? parseInt(item.startDate.slice(0, 4)) : null,
                score: item.averageRating ? Math.round(parseFloat(item.averageRating)) : null,
              };
              coverCache.set(cacheKey, { timestamp: Date.now(), data: kResult });
              return res.json({ data: kResult, cached: false });
            }
          }
        } catch (e) {
          console.warn('Kitsu fallback in server.ts failed:', e);
        }

        const fallback = { anime: title || `Anime #${anilistId}` };
        coverCache.set(cacheKey, { timestamp: Date.now(), data: fallback });
        return res.json({ data: fallback });
      }

      const result = {
        id: media.id || anilistId || null,
        anime: title || media.title?.english || media.title?.romaji,
        romaji: media.title?.romaji || title,
        english: media.title?.english || null,
        native: media.title?.native || null,
        coverImage: media.coverImage?.large || media.coverImage?.medium || null,
        bannerImage: media.bannerImage || null,
        year: media.seasonYear || media.startDate?.year || null,
        season: media.season || null,
        format: media.format || null,
        genres: media.genres || [],
        score: media.averageScore || null,
        episodes: media.episodes || null,
        studio: media.studios?.nodes?.[0]?.name || null,
      };

      coverCache.set(cacheKey, { timestamp: Date.now(), data: result });
      if (title && !coverCache.has(title.toLowerCase())) {
        coverCache.set(title.toLowerCase(), { timestamp: Date.now(), data: result });
      }
      res.json({ data: result, cached: false });
    } catch (err: any) {
      console.error('Failed to fetch anime cover details:', err);
      res.json({ data: { anime: title || 'Unknown Anime' } });
    }
  });

  // public/data is the canonical source; a packaged server can use Vite's built copy.
  const sourceCatalogFile = path.join(process.cwd(), 'public', 'data', 'anime_catalog.json');
  const builtCatalogFile = path.join(process.cwd(), 'dist', 'data', 'anime_catalog.json');
  const CATALOG_FILE = fs.existsSync(sourceCatalogFile) ? sourceCatalogFile : builtCatalogFile;
  const ALIAS_FILE = path.join(DATA_DIR, 'artist_aliases.json');
  let localCatalog: any[] = [];
  let artistAliases: Record<string, string[]> = {};

  const loadLocalCatalog = () => {
    try {
      if (fs.existsSync(CATALOG_FILE)) {
        localCatalog = JSON.parse(fs.readFileSync(CATALOG_FILE, 'utf-8'));
      }
    } catch (err) {
      console.error('Failed to load local anime catalog:', err);
    }
    return localCatalog;
  };
  loadLocalCatalog();

  const loadArtistAliases = () => {
    try {
      if (fs.existsSync(ALIAS_FILE)) {
        artistAliases = JSON.parse(fs.readFileSync(ALIAS_FILE, 'utf-8'));
      }
    } catch (err) {
      console.error('Failed to load artist aliases:', err);
    }
    return artistAliases;
  };
  loadArtistAliases();

  const handleLocalCatalog = async (req: express.Request, res: express.Response) => {
    try {
      const result = searchCatalogResults(localCatalog.length > 0 ? localCatalog : loadLocalCatalog(), artistAliases, {
        q: String(req.query.q || ''),
        season: req.query.season === undefined ? undefined : String(req.query.season),
        yearMin: req.query.yearMin === undefined ? undefined : Number(req.query.yearMin),
        yearMax: req.query.yearMax === undefined ? undefined : Number(req.query.yearMax),
        themeType: String(req.query.themeType || 'ALL'),
        sortKey: String(req.query.sortKey || 'anime_year'),
        sortOrder: String(req.query.sortOrder || 'desc'),
        limit: Number(req.query.limit),
        offset: Number(req.query.offset),
      });
      res.json({ ...result, source: 'local' });
    } catch (err: any) {
      console.error('Local catalog query error:', err);
      res.status(500).json({ error: 'Failed to query catalog', message: err.message, data: [] });
    }
  };

  app.get('/api/catalog/songs', handleLocalCatalog);
  app.get('/api/anisongdb/songs', handleLocalCatalog);
  app.get('/api/animethemes/songs', handleLocalCatalog);

  // Vite middleware setup
  if (process.env.NODE_ENV !== 'production') {
    const vite = await createViteServer({
      server: { middlewareMode: true },
      appType: 'spa',
    });
    app.use(vite.middlewares);
  } else {
    const distPath = path.join(process.cwd(), 'dist');
    app.use(express.static(distPath));
    app.get('*', (req, res) => {
      res.sendFile(path.join(distPath, 'index.html'));
    });
  }

  app.listen(PORT, '0.0.0.0', () => {
    console.log(`Server running at http://0.0.0.0:${PORT}`);
  });
}

startServer();
