export interface Channel {
  id: string;
  name: string;
  logo: string;
  group: string;
  url: string;
  seriesName?: string; // Metadata for series
  season?: number;
  episode?: number;
}

export interface Category {
  id: string;
  name: string;
  count: number;
}

export interface Series {
  name: string;
  logo: string;
  seasonCount: number;
  episodeCount: number;
  episodes: Channel[];
}
