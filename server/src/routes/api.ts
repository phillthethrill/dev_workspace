import express from 'express';
import { TMDBClient } from '../services/tmdb-client';
import { GermanVODChecker } from '../services/german-vod-checker';
import { AudibleManager } from '../services/audible-manager';
import { getDatabase } from '../utils/database';
import { Show, Movie, UpcomingItem, HealthStatus } from '../types';

const router = express.Router();
const db = getDatabase();

// Initialize services
const tmdb = new TMDBClient(process.env.TMDB_API_KEY || '');
const vodChecker = new GermanVODChecker();
const audibleManager = new AudibleManager();

// GET /api/upcoming - Next 10 shows and next 5 movies with future dates
router.get('/upcoming', async (req, res) => {
  try {
    const shows = await db.all(`
      SELECT * FROM shows
      WHERE next_date IS NOT NULL
      AND date(next_date) >= date('now')
      ORDER BY next_date ASC
      LIMIT 10
    `) as Show[];

    const movies = await db.all(`
      SELECT * FROM movies
      WHERE release_date IS NOT NULL
      AND date(release_date) >= date('now')
      ORDER BY release_date ASC
      LIMIT 5
    `) as Movie[];

    const upcoming: UpcomingItem[] = [
      ...shows.map(show => ({
        type: 'show' as const,
        id: show.id,
        title: show.title,
        next_date: show.next_date || undefined,
        service: show.service || undefined,
        german_available: show.german_available,
        poster_url: show.poster_url || undefined
      })),
      ...movies.map(movie => ({
        type: 'movie' as const,
        id: movie.id,
        title: movie.title,
        next_date: movie.release_date || undefined,
        service: movie.service || undefined,
        german_available: movie.german_available,
        poster_url: movie.poster_url || undefined
      }))
    ].sort((a, b) => {
      if (!a.next_date) return 1;
      if (!b.next_date) return -1;
      return new Date(a.next_date).getTime() - new Date(b.next_date).getTime();
    });

    res.json(upcoming);
  } catch (error) {
    res.status(500).json({ error: 'Failed to fetch upcoming content' });
  }
});

// GET /api/shows - Shows joined with user_library status
router.get('/shows', async (req, res) => {
  try {
    const shows = await db.all(`
      SELECT s.*, ul.status as watch_status, ul.current_season, ul.current_episode
      FROM shows s
      LEFT JOIN user_library ul ON s.id = ul.media_id AND ul.media_type = 'show'
      ORDER BY s.updated_at DESC
    `) as (Show & { watch_status?: string; current_season?: number; current_episode?: number })[];

    res.json(shows);
  } catch (error) {
    res.status(500).json({ error: 'Failed to fetch shows' });
  }
});

// GET /api/audiobooks/series - Series list with contained books
router.get('/audiobooks/series', async (req, res) => {
  try {
    const series = await audibleManager.getSeriesProgress();
    res.json(series);
  } catch (error) {
    res.status(500).json({ error: 'Failed to fetch audiobook series' });
  }
});

// GET /api/audiobooks/missing - All missing (owned = 0) series books
router.get('/audiobooks/missing', async (req, res) => {
  try {
    const missing = await audibleManager.getMissingBooksCount();
    const books = await db.all(`
      SELECT * FROM audiobooks
      WHERE owned = 0
      ORDER BY series_name, series_position
    `);
    res.json({ count: missing, books });
  } catch (error) {
    res.status(500).json({ error: 'Failed to fetch missing books' });
  }
});

// POST /api/shows/add - Add show to watchlist
router.post('/shows/add', async (req, res) => {
  try {
    const { title, tmdb_id } = req.body;

    if (!tmdb_id) {
      return res.status(400).json({ error: 'TMDB ID is required' });
    }

    // Get show details from TMDB
    const details = await tmdb.getTVDetails(tmdb_id);
    if (!details) {
      return res.status(404).json({ error: 'Show not found' });
    }

    // Check German availability
    const services = await vodChecker.checkShowAvailability(details);

    // Insert into database
    const showResult = await db.run(`
      INSERT OR REPLACE INTO shows (
        tmdb_id, title, season, service, german_available,
        poster_url, updated_at
      ) VALUES (?, ?, ?, ?, ?, ?, CURRENT_TIMESTAMP)
    `, [
      tmdb_id,
      details.name,
      details.number_of_seasons,
      services.join(','),
      services.length > 0 ? 1 : 0,
      details.poster_path ? `https://image.tmdb.org/t/p/w500${details.poster_path}` : null
    ]);

    // Add to user library
    await db.run(`
      INSERT OR REPLACE INTO user_library (
        media_type, media_id, status, updated_at
      ) VALUES ('show', ?, 'watching', CURRENT_TIMESTAMP)
    `, [showResult.lastID]);

    res.json({ success: true, showId: showResult.lastID });
  } catch (error) {
    res.status(500).json({ error: 'Failed to add show' });
  }
});

// POST /api/sync/audible - Import Libation-format Excel
router.post('/sync/audible', async (req, res) => {
  try {
    const filePath = process.env.AUDIBLE_LIBRARY_PATH || './data/audible_library.xlsx';
    const result = await audibleManager.parseLibationExport(filePath);
    res.json(result);
  } catch (error) {
    res.status(500).json({ error: 'Failed to sync Audible library' });
  }
});

// POST /api/sync/all - Run full update pipeline
router.post('/sync/all', async (req, res) => {
  try {
    // Update show episodes
    await updateShowEpisodes();

    // Update movie releases
    await updateMovieReleases();

    // Check audiobook releases (stub)
    console.log('Checking for new audiobook releases...');

    res.json({ success: true, message: 'Data update completed' });
  } catch (error) {
    res.status(500).json({ error: 'Failed to sync all data' });
  }
});

// GET /api/search/shows/:query - TMDB search + annotate with German availability
router.get('/search/shows/:query', async (req, res) => {
  try {
    const results = await tmdb.searchTV(req.params.query);

    // Enhance with German availability
    for (const result of results) {
      result.german_services = await vodChecker.checkShowAvailability(result);
    }

    res.json(results);
  } catch (error) {
    res.status(500).json({ error: 'Failed to search shows' });
  }
});

// GET /api/health - Health check
router.get('/health', async (req, res) => {
  try {
    const dbHealthy = await db.healthCheck();
    const health: HealthStatus = {
      ok: dbHealthy,
      time: new Date().toISOString(),
      db: dbHealthy ? 'ok' : 'error',
      version: '1.0.0',
      uptime: process.uptime()
    };
    res.json(health);
  } catch (error) {
    res.status(500).json({ ok: false, error: 'Health check failed' });
  }
});

// Helper functions for data updates
async function updateShowEpisodes(): Promise<void> {
  const shows = await db.all("SELECT * FROM shows WHERE status = 'airing'") as Show[];

  for (const show of shows) {
    try {
      const details = await tmdb.getTVDetails(show.tmdb_id);
      if (details && details.seasons) {
        const lastSeason = details.seasons[details.seasons.length - 1];
        if (lastSeason) {
          const seasonDetails = await tmdb.getSeasonDetails(show.tmdb_id, lastSeason.season_number);

          if (seasonDetails && seasonDetails.episodes) {
            // Find next unaired episode
            const now = new Date();
            let nextEpisode = null;

            for (const episode of seasonDetails.episodes) {
              if (episode.air_date) {
                const airDate = new Date(episode.air_date);
                if (airDate > now) {
                  nextEpisode = episode;
                  break;
                }
              }
            }

            if (nextEpisode) {
              await db.run(`
                UPDATE shows SET
                  season = ?,
                  next_episode = ?,
                  next_date = ?,
                  updated_at = CURRENT_TIMESTAMP
                WHERE id = ?
              `, [
                lastSeason.season_number,
                nextEpisode.episode_number,
                nextEpisode.air_date,
                show.id
              ]);
            }
          }
        }
      }

      // Rate limiting delay
      await new Promise(resolve => setTimeout(resolve, 100));

    } catch (error) {
      console.error(`Error updating show ${show.title}:`, error);
    }
  }
}

async function updateMovieReleases(): Promise<void> {
  const upcomingMovies = await tmdb.getUpcomingMovies();

  for (const movie of upcomingMovies.slice(0, 10)) {
    try {
      const services = await vodChecker.checkMovieAvailability(movie);

      await db.run(`
        INSERT OR REPLACE INTO movies (
          tmdb_id, title, release_date, service, german_available,
          poster_url, updated_at
        ) VALUES (?, ?, ?, ?, ?, ?, CURRENT_TIMESTAMP)
      `, [
        movie.id,
        movie.title,
        movie.release_date,
        services.join(','),
        services.length > 0 ? 1 : 0,
        movie.poster_path ? `https://image.tmdb.org/t/p/w500${movie.poster_path}` : null
      ]);

    } catch (error) {
      console.error(`Error updating movie ${movie.title}:`, error);
    }
  }
}

export default router;