import axios, { AxiosResponse } from 'axios';
import { TMDBShow, TMDBMovie } from '../types';

export class TMDBClient {
  private apiKey: string;
  private baseUrl = 'https://api.themoviedb.org/3';

  constructor(apiKey: string) {
    this.apiKey = apiKey;
  }

  async searchTV(query: string): Promise<TMDBShow[]> {
    try {
      const response: AxiosResponse<{ results: TMDBShow[] }> = await axios.get(
        `${this.baseUrl}/search/tv`,
        {
          params: {
            api_key: this.apiKey,
            query: query,
            language: 'de-DE'
          }
        }
      );
      return response.data.results;
    } catch (error) {
      console.error('TMDB TV search error:', error);
      return [];
    }
  }

  async getTVDetails(tvId: number): Promise<TMDBShow | null> {
    try {
      const response: AxiosResponse<TMDBShow> = await axios.get(
        `${this.baseUrl}/tv/${tvId}`,
        {
          params: {
            api_key: this.apiKey,
            language: 'de-DE',
            append_to_response: 'external_ids,watch/providers'
          }
        }
      );
      return response.data;
    } catch (error) {
      console.error('TMDB TV details error:', error);
      return null;
    }
  }

  async getSeasonDetails(tvId: number, seasonNumber: number): Promise<any> {
    try {
      const response = await axios.get(
        `${this.baseUrl}/tv/${tvId}/season/${seasonNumber}`,
        {
          params: {
            api_key: this.apiKey,
            language: 'de-DE'
          }
        }
      );
      return response.data;
    } catch (error) {
      console.error('TMDB season details error:', error);
      return null;
    }
  }

  async getUpcomingMovies(): Promise<TMDBMovie[]> {
    try {
      const response: AxiosResponse<{ results: TMDBMovie[] }> = await axios.get(
        `${this.baseUrl}/movie/upcoming`,
        {
          params: {
            api_key: this.apiKey,
            language: 'de-DE',
            region: 'DE'
          }
        }
      );
      return response.data.results;
    } catch (error) {
      console.error('TMDB upcoming movies error:', error);
      return [];
    }
  }

  async getMovieDetails(movieId: number): Promise<TMDBMovie | null> {
    try {
      const response: AxiosResponse<TMDBMovie> = await axios.get(
        `${this.baseUrl}/movie/${movieId}`,
        {
          params: {
            api_key: this.apiKey,
            language: 'de-DE',
            append_to_response: 'watch/providers'
          }
        }
      );
      return response.data;
    } catch (error) {
      console.error('TMDB movie details error:', error);
      return null;
    }
  }
}