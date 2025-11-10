// Core data types for Universal Media Tracker

export interface Show {
  id: number;
  tmdb_id: number;
  title: string;
  season?: number;
  next_episode?: number;
  next_date?: string;
  service?: string;
  german_available: boolean;
  status: 'airing' | 'ended' | 'canceled';
  poster_url?: string;
  created_at: string;
  updated_at: string;
}

export interface Movie {
  id: number;
  tmdb_id: number;
  title: string;
  release_date?: string;
  service?: string;
  german_available: boolean;
  status: 'upcoming' | 'released';
  poster_url?: string;
  created_at: string;
  updated_at: string;
}

export interface Audiobook {
  id: number;
  asin?: string;
  title: string;
  series_name?: string;
  series_position?: number;
  author?: string;
  narrator?: string;
  owned: boolean;
  listened: boolean;
  release_date?: string;
  purchase_date?: string;
  rating?: number;
  length_minutes?: number;
  created_at: string;
  updated_at: string;
}

export interface UserLibrary {
  id: number;
  media_type: 'show' | 'movie' | 'audiobook';
  media_id: number;
  status: 'watching' | 'completed' | 'planned' | 'dropped';
  current_episode?: number;
  current_season?: number;
  added_at: string;
  updated_at: string;
}

export interface TMDBShow {
  id: number;
  name: string;
  number_of_seasons: number;
  poster_path?: string;
  seasons?: Array<{
    season_number: number;
    episode_count: number;
    air_date?: string;
  }>;
  'watch/providers'?: {
    results: {
      DE?: {
        flatrate?: Array<{
          provider_name: string;
          provider_id: number;
        }>;
      };
    };
  };
  german_services?: string[];
}

export interface TMDBMovie {
  id: number;
  title: string;
  release_date: string;
  poster_path?: string;
  'watch/providers'?: {
    results: {
      DE?: {
        flatrate?: Array<{
          provider_name: string;
          provider_id: number;
        }>;
      };
    };
  };
}

export interface ServiceAvailability {
  service: string;
  available: boolean;
}

export interface UpcomingItem {
  type: 'show' | 'movie';
  id: number;
  title: string;
  next_date?: string;
  service?: string;
  german_available: boolean;
  poster_url?: string;
}

export interface SeriesProgress {
  series_name: string;
  total_books: number;
  owned_books: number;
  listened_books: number;
  missing_books: number;
  first_position?: number;
  latest_position?: number;
  avg_rating?: number;
  total_hours: number;
  completion_percentage: number;
  ownership_percentage: number;
  next_book_position?: number;
}

export interface HealthStatus {
  ok: boolean;
  time: string;
  db: 'ok' | 'error';
  version: string;
  uptime: number;
}