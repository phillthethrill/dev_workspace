import express, { Request, Response } from 'express';
import cors from 'cors';
import helmet from 'helmet';
import compression from 'compression';
import * as cron from 'node-cron';
import path from 'path';
import fs from 'fs/promises';
import apiRoutes from './routes/api';
import embedRoutes from './routes/embed';
import { getDatabase } from './utils/database';
import { TMDBClient } from './services/tmdb-client';
import { GermanVODChecker } from './services/german-vod-checker';
import { AudibleManager } from './services/audible-manager';
import { getLogger } from './utils/logger';

const app = express();
const PORT = process.env.PORT || 3000;

// Configuration
const CONFIG = {
  tmdb_api_key: process.env.TMDB_API_KEY || '',
  justwatch_country: 'DE',
  timezone: 'Europe/Berlin',
  update_interval: '0 */6 * * *', // Every 6 hours
  audible_library_path: process.env.AUDIBLE_LIBRARY_PATH || './data/audible_library.xlsx'
};

// Middleware
app.use(helmet({
  contentSecurityPolicy: {
    directives: {
      defaultSrc: ["'self'"],
      styleSrc: ["'self'", "'unsafe-inline'"],
      scriptSrc: ["'self'"],
      imgSrc: ["'self'", "data:", "https:"],
    },
  },
}));
app.use(compression());
app.use(cors());
app.use(express.json());
app.use(express.static(path.join(__dirname, '../public')));

// Routes
app.use('/api', apiRoutes);
app.use('/embed', embedRoutes);

// Serve the frontend
app.get('/', (req: Request, res: Response) => {
  const indexPath = path.join(__dirname, '../public/index.html');
  res.sendFile(indexPath);
});

// Health check for Docker
app.get('/health', async (req: Request, res: Response) => {
  const db = getDatabase();
  const dbHealthy = await db.healthCheck();
  const logger = getLogger();

  const health = {
    ok: dbHealthy,
    time: new Date().toISOString(),
    db: dbHealthy ? 'ok' : 'error',
    version: '1.0.0',
    uptime: process.uptime()
  };

  if (dbHealthy) {
    logger.info('Health check passed', health);
  } else {
    logger.error('Health check failed', health);
  }

  res.json(health);
});

// Background update functions
async function updateShowEpisodes(): Promise<void> {
  const db = getDatabase();
  const tmdb = new TMDBClient(CONFIG.tmdb_api_key);

  const shows = await db.all("SELECT * FROM shows WHERE status = 'airing'");

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
      const logger = getLogger();
      logger.error(`Error updating show ${show.title}:`, error);
    }
  }
}

async function updateMovieReleases(): Promise<void> {
  const db = getDatabase();
  const tmdb = new TMDBClient(CONFIG.tmdb_api_key);
  const vodChecker = new GermanVODChecker();

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
      const logger = getLogger();
      logger.error(`Error updating movie ${movie.title}:`, error);
    }
  }
}

async function checkAudiobookReleases(): Promise<void> {
  // This would involve scraping Audible or using their API
  // For now, we'll check if there are any upcoming releases in our series
  const logger = getLogger();
  logger.info('Checking for new audiobook releases...');

  // Implementation would depend on available APIs or scraping capabilities
  // Could check Goodreads, Amazon, or publisher websites for series updates
}

// Schedule automatic updates
cron.schedule(CONFIG.update_interval, async () => {
  const logger = getLogger();
  logger.info('Running scheduled data update...');

  try {
    await updateShowEpisodes();
    await updateMovieReleases();
    await checkAudiobookReleases();
    logger.info('Data update completed successfully');
  } catch (error) {
    logger.error('Data update error:', error);
  }
});

// Initialize and start server
async function startServer(): Promise<void> {
  try {
    // Ensure data directory exists
    await fs.mkdir('./data', { recursive: true });
    await fs.mkdir('./public', { recursive: true });

    // Initialize database
    const db = getDatabase();
    await db.init();

    // Load initial Audible data if available
    try {
      const audibleManager = new AudibleManager();
      await audibleManager.parseLibationExport(CONFIG.audible_library_path);
      const logger = getLogger();
      logger.info('Audible library loaded successfully');
    } catch (error) {
      const logger = getLogger();
      logger.info('No Audible library found, skipping initial load');
    }

    // Start server
    app.listen(PORT, '0.0.0.0', () => {
      const logger = getLogger();
      logger.info(`🚀 Media Tracker Server running on port ${PORT}`);
      logger.info(`📱 Accessible via Tailscale at: http://your-tailscale-ip:${PORT}`);
      logger.info(`🔄 Auto-updates scheduled: ${CONFIG.update_interval}`);
      logger.info(`🕐 Timezone: ${CONFIG.timezone}`);
    });

    // Run initial data update
    setTimeout(async () => {
      try {
        await updateShowEpisodes();
        await updateMovieReleases();
        await checkAudiobookReleases();
      } catch (error) {
        const logger = getLogger();
        logger.error('Initial data update error:', error);
      }
    }, 5000);

  } catch (error) {
    const logger = getLogger();
    logger.error('Server startup error:', error);
    process.exit(1);
  }
}

// Graceful shutdown
process.on('SIGTERM', async () => {
  const logger = getLogger();
  logger.info('SIGTERM received, shutting down gracefully');
  const db = getDatabase();
  await db.close();
  process.exit(0);
});

process.on('SIGINT', async () => {
  const logger = getLogger();
  logger.info('SIGINT received, shutting down gracefully');
  const db = getDatabase();
  await db.close();
  process.exit(0);
});

startServer();