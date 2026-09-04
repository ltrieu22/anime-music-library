export interface SongTrack {
  id: string | number;
  animeTitle: string;
  songName?: string;
  artist?: string;
  type?: string;
  image?: string;
  videoUrl: string; // e.g. "https://naedist.animemusicquiz.com/...webm" or "....webm"
}
