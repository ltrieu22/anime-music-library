export function getAniListAnimeUrl(animeName: string, anilistId?: number | null): string {
  if (anilistId && Number.isFinite(anilistId)) {
    return `https://anilist.co/anime/${anilistId}`;
  }

  return `https://anilist.co/search/anime?search=${encodeURIComponent(animeName)}`;
}
