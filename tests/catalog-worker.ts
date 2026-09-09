import { loadStaticCatalog, searchStaticCatalog } from '../src/services/catalogEngine';
import { searchCatalogResults, type CatalogParams } from '../src/services/catalogResults';

document.getElementById('run')!.onclick = async () => {
  const output = document.getElementById('result')!;
  output.textContent = 'Running…';
  const check = (ok: boolean, message: string) => { if (!ok) throw new Error(message); };
  try {
    const [catalog, aliases] = await loadStaticCatalog();
    await searchStaticCatalog({}); // Initializes the real module worker.
    let mainThreadTicked = false;
    setTimeout(() => { mainThreadTicked = true; }, 0);
    await searchStaticCatalog({ q: 'h' });
    check(mainThreadTicked, 'Broad query must allow the main thread to run while searching');
    const queries: CatalogParams[] = [
      { q: 'Heike' }, { q: 'IKE', offset: 600 }, { q: 'SPYAIR' }, { q: 'fhána' }, { q: 'fhana' },
      { q: 'Gundam', offset: 500 }, { q: 'no matching xyz' },
      { season: 'UNKNOWN' }, { season: 'Fall', yearMin: 2000, yearMax: 2020, themeType: 'OP' },
      ...['anime_name', 'artist', 'song_name', 'anime_year'].flatMap(sortKey => ['asc', 'desc'].map(sortOrder => ({ sortKey, sortOrder, offset: 100 }))),
    ];
    for (const params of queries) {
      const actual = await searchStaticCatalog(params);
      check(JSON.stringify(actual) === JSON.stringify(searchCatalogResults(catalog, aliases, params)), `Worker parity: ${JSON.stringify(params)}`);
    }
    const extras = [catalog[0], { ...catalog[1], id: 'missing-note-song' }];
    const params = { q: 'private note only', limit: 1, offset: 1 };
    check(JSON.stringify(await searchStaticCatalog(params, extras)) === JSON.stringify(searchCatalogResults(catalog, aliases, params, extras)), 'Private note merge before pagination');
    check((await searchStaticCatalog(params)).total === 0, 'Private matches cannot contaminate public cache');
    const controller = new AbortController();
    const obsolete = searchStaticCatalog({ q: 'h', sortOrder: 'asc' }, [], controller.signal).catch(error => error.name);
    controller.abort();
    const latest = await searchStaticCatalog({ q: 'Heike' });
    check(await obsolete === 'AbortError' && latest.total === 2, 'Canceled search cannot replace latest result');
    output.textContent = 'PASS: real worker responsiveness, complete ordered results, aliases, pagination, private notes and cancellation';
  } catch (error) { output.textContent = `FAIL: ${error}`; }
};
