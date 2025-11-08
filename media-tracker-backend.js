// Media Tracker Backend Server
// Supports TV shows, movies, and Audible library tracking
// Optimized for German VOD services and Tailscale deployment

const express = require('express');
const cors = require('cors');
const sqlite3 = require('sqlite3').verbose();
const path = require('path');
const fs = require('fs').promises;
const axios = require('axios');
const cheerio = require('cheerio');
const cron = require('node-cron');
const XLSX = require('xlsx');

const app = express();
const PORT = process.env.PORT || 3000;

// Database setup
const db = new sqlite3.Database('./data/media_tracker.db');

// Middleware
app.use(cors());
app.use(express.json());
app.use(express.static('public'));

// Configuration
const CONFIG = {
    tmdb_api_key: process.env.TMDB_API_KEY || 'your-tmdb-key-here',
    justwatch_country: 'DE', // Germany
    timezone: 'Europe/Berlin',
    update_interval: '0 */6 * * *', // Every 6 hours
    audible_library_path: './data/audible_library.xlsx'
};

// Database initialization
function initDatabase() {
    return new Promise((resolve, reject) => {
        db.serialize(() => {
            // TV Shows table
            db.run(`
                CREATE TABLE IF NOT EXISTS shows (
                    id INTEGER PRIMARY KEY AUTOINCREMENT,
                    tmdb_id INTEGER UNIQUE,
                    title TEXT NOT NULL,
                    season INTEGER,
                    next_episode INTEGER,
                    next_date TEXT,
                    service TEXT,
                    german_available BOOLEAN DEFAULT 0,
                    status TEXT DEFAULT 'airing',
                    poster_url TEXT,
                    created_at DATETIME DEFAULT CURRENT_TIMESTAMP,
                    updated_at DATETIME DEFAULT CURRENT_TIMESTAMP
                )
            `);

            // Movies table
            db.run(`
                CREATE TABLE IF NOT EXISTS movies (
                    id INTEGER PRIMARY KEY AUTOINCREMENT,
                    tmdb_id INTEGER UNIQUE,
                    title TEXT NOT NULL,
                    release_date TEXT,
                    service TEXT,
                    german_available BOOLEAN DEFAULT 0,
                    status TEXT DEFAULT 'upcoming',
                    poster_url TEXT,
                    created_at DATETIME DEFAULT CURRENT_TIMESTAMP,
                    updated_at DATETIME DEFAULT CURRENT_TIMESTAMP
                )
            `);

            // Audiobooks table
            db.run(`
                CREATE TABLE IF NOT EXISTS audiobooks (
                    id INTEGER PRIMARY KEY AUTOINCREMENT,
                    asin TEXT UNIQUE,
                    title TEXT NOT NULL,
                    series_name TEXT,
                    series_position REAL,
                    author TEXT,
                    narrator TEXT,
                    owned BOOLEAN DEFAULT 0,
                    listened BOOLEAN DEFAULT 0,
                    release_date TEXT,
                    purchase_date TEXT,
                    rating REAL,
                    length_minutes INTEGER,
                    created_at DATETIME DEFAULT CURRENT_TIMESTAMP,
                    updated_at DATETIME DEFAULT CURRENT_TIMESTAMP
                )
            `);

            // User watchlist/library
            db.run(`
                CREATE TABLE IF NOT EXISTS user_library (
                    id INTEGER PRIMARY KEY AUTOINCREMENT,
                    media_type TEXT NOT NULL, -- 'show', 'movie', 'audiobook'
                    media_id INTEGER NOT NULL,
                    status TEXT DEFAULT 'watching', -- 'watching', 'completed', 'planned', 'dropped'
                    current_episode INTEGER,
                    current_season INTEGER,
                    added_at DATETIME DEFAULT CURRENT_TIMESTAMP,
                    updated_at DATETIME DEFAULT CURRENT_TIMESTAMP
                )
            `);

            resolve();
        });
    });
}

// TMDB API functions
class TMDBClient {
    constructor(apiKey) {
        this.apiKey = apiKey;
        this.baseUrl = 'https://api.themoviedb.org/3';
    }

    async searchTV(query) {
        try {
            const response = await axios.get(`${this.baseUrl}/search/tv`, {
                params: {
                    api_key: this.apiKey,
                    query: query,
                    language: 'de-DE'
                }
            });
            return response.data.results;
        } catch (error) {
            console.error('TMDB TV search error:', error.message);
            return [];
        }
    }

    async getTVDetails(tvId) {
        try {
            const response = await axios.get(`${this.baseUrl}/tv/${tvId}`, {
                params: {
                    api_key: this.apiKey,
                    language: 'de-DE',
                    append_to_response: 'external_ids,watch/providers'
                }
            });
            return response.data;
        } catch (error) {
            console.error('TMDB TV details error:', error.message);
            return null;
        }
    }

    async getSeasonDetails(tvId, seasonNumber) {
        try {
            const response = await axios.get(`${this.baseUrl}/tv/${tvId}/season/${seasonNumber}`, {
                params: {
                    api_key: this.apiKey,
                    language: 'de-DE'
                }
            });
            return response.data;
        } catch (error) {
            console.error('TMDB season details error:', error.message);
            return null;
        }
    }

    async getUpcomingMovies() {
        try {
            const response = await axios.get(`${this.baseUrl}/movie/upcoming`, {
                params: {
                    api_key: this.apiKey,
                    language: 'de-DE',
                    region: 'DE'
                }
            });
            return response.data.results;
        } catch (error) {
            console.error('TMDB upcoming movies error:', error.message);
            return [];
        }
    }
}

// German Streaming Service Checker
class GermanVODChecker {
    constructor() {
        this.services = {
            'netflix': 'Netflix',
            'prime': 'Amazon Prime Video',
            'disney': 'Disney+',
            'apple': 'Apple TV+',
            'sky': 'Sky Deutschland',
            'paramount': 'Paramount+',
            'wow': 'WOW',
            'rtl': 'RTL+'
        };
    }

    async checkAvailability(tmdbId, mediaType = 'tv') {
        try {
            const tmdb = new TMDBClient(CONFIG.tmdb_api_key);
            const details = mediaType === 'tv' 
                ? await tmdb.getTVDetails(tmdbId)
                : await tmdb.getMovieDetails(tmdbId);

            if (details && details['watch/providers'] && details['watch/providers'].results.DE) {
                const providers = details['watch/providers'].results.DE;
                const availableOn = [];

                // Check flatrate (subscription) providers
                if (providers.flatrate) {
                    providers.flatrate.forEach(provider => {
                        const serviceName = this.mapProviderToService(provider.provider_name);
                        if (serviceName) {
                            availableOn.push(serviceName);
                        }
                    });
                }

                return availableOn;
            }
            return [];
        } catch (error) {
            console.error('VOD availability check error:', error.message);
            return [];
        }
    }

    mapProviderToService(providerName) {
        const mapping = {
            'Netflix': 'netflix',
            'Amazon Prime Video': 'prime',
            'Disney Plus': 'disney',
            'Apple TV Plus': 'apple',
            'Sky Deutschland': 'sky',
            'Paramount Plus': 'paramount',
            'WOW': 'wow',
            'RTL+': 'rtl'
        };
        return mapping[providerName] || null;
    }
}

// Audible Library Manager
class AudibleLibraryManager {
    async loadLibraryFromExcel(filePath) {
        try {
            const workbook = XLSX.readFile(filePath);
            const sheetName = workbook.SheetNames[0];
            const worksheet = workbook.Sheets[sheetName];
            const data = XLSX.utils.sheet_to_json(worksheet);

            // Process each audiobook
            for (const book of data) {
                await this.upsertAudiobook({
                    asin: book.ASIN || book.asin,
                    title: book.Title || book.title,
                    series_name: book.Series || book.series,
                    series_position: book['Series Position'] || book.series_position,
                    author: book.Author || book.author,
                    narrator: book.Narrator || book.narrator,
                    owned: true, // If in library, assume owned
                    release_date: book['Release Date'] || book.release_date,
                    purchase_date: book['Purchase Date'] || book.purchase_date,
                    rating: book.Rating || book.rating,
                    length_minutes: book['Length (minutes)'] || book.length_minutes
                });
            }

            console.log(`Processed ${data.length} audiobooks from Excel`);
            return data.length;
        } catch (error) {
            console.error('Excel processing error:', error.message);
            return 0;
        }
    }

    async upsertAudiobook(bookData) {
        return new Promise((resolve, reject) => {
            const sql = `
                INSERT OR REPLACE INTO audiobooks (
                    asin, title, series_name, series_position, author, narrator,
                    owned, listened, release_date, purchase_date, rating, length_minutes,
                    updated_at
                ) VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, CURRENT_TIMESTAMP)
            `;

            db.run(sql, [
                bookData.asin,
                bookData.title,
                bookData.series_name,
                bookData.series_position,
                bookData.author,
                bookData.narrator,
                bookData.owned || false,
                bookData.listened || false,
                bookData.release_date,
                bookData.purchase_date,
                bookData.rating,
                bookData.length_minutes
            ], function(err) {
                if (err) reject(err);
                else resolve(this.lastID);
            });
        });
    }

    async getSeriesProgress() {
        return new Promise((resolve, reject) => {
            const sql = `
                SELECT 
                    series_name,
                    COUNT(*) as total_books,
                    SUM(CASE WHEN owned = 1 THEN 1 ELSE 0 END) as owned_books,
                    SUM(CASE WHEN listened = 1 THEN 1 ELSE 0 END) as listened_books,
                    MIN(series_position) as first_book,
                    MAX(series_position) as latest_book
                FROM audiobooks 
                WHERE series_name IS NOT NULL 
                GROUP BY series_name
                ORDER BY series_name
            `;

            db.all(sql, [], (err, rows) => {
                if (err) reject(err);
                else resolve(rows);
            });
        });
    }

    async getMissingBooks() {
        return new Promise((resolve, reject) => {
            const sql = `
                SELECT * FROM audiobooks 
                WHERE series_name IS NOT NULL 
                AND owned = 0
                ORDER BY series_name, series_position
            `;

            db.all(sql, [], (err, rows) => {
                if (err) reject(err);
                else resolve(rows);
            });
        });
    }
}

// API Routes
const tmdb = new TMDBClient(CONFIG.tmdb_api_key);
const vodChecker = new GermanVODChecker();
const audibleManager = new AudibleLibraryManager();

// Get upcoming episodes/releases
app.get('/api/upcoming', async (req, res) => {
    try {
        const shows = await new Promise((resolve, reject) => {
            db.all(`
                SELECT * FROM shows 
                WHERE next_date IS NOT NULL 
                AND date(next_date) >= date('now') 
                ORDER BY next_date ASC 
                LIMIT 10
            `, [], (err, rows) => {
                if (err) reject(err);
                else resolve(rows);
            });
        });

        const movies = await new Promise((resolve, reject) => {
            db.all(`
                SELECT * FROM movies 
                WHERE release_date IS NOT NULL 
                AND date(release_date) >= date('now') 
                ORDER BY release_date ASC 
                LIMIT 5
            `, [], (err, rows) => {
                if (err) reject(err);
                else resolve(rows);
            });
        });

        res.json({ shows, movies });
    } catch (error) {
        res.status(500).json({ error: error.message });
    }
});

// Get TV shows
app.get('/api/shows', async (req, res) => {
    try {
        const shows = await new Promise((resolve, reject) => {
            db.all(`
                SELECT s.*, ul.status as watch_status, ul.current_season, ul.current_episode
                FROM shows s
                LEFT JOIN user_library ul ON s.id = ul.media_id AND ul.media_type = 'show'
                ORDER BY s.updated_at DESC
            `, [], (err, rows) => {
                if (err) reject(err);
                else resolve(rows);
            });
        });

        res.json(shows);
    } catch (error) {
        res.status(500).json({ error: error.message });
    }
});

// Get audiobook series
app.get('/api/audiobooks/series', async (req, res) => {
    try {
        const series = await audibleManager.getSeriesProgress();
        const seriesWithBooks = [];

        for (const serie of series) {
            const books = await new Promise((resolve, reject) => {
                db.all(`
                    SELECT * FROM audiobooks 
                    WHERE series_name = ? 
                    ORDER BY series_position ASC
                `, [serie.series_name], (err, rows) => {
                    if (err) reject(err);
                    else resolve(rows);
                });
            });

            seriesWithBooks.push({
                ...serie,
                books: books
            });
        }

        res.json(seriesWithBooks);
    } catch (error) {
        res.status(500).json({ error: error.message });
    }
});

// Get missing audiobooks
app.get('/api/audiobooks/missing', async (req, res) => {
    try {
        const missing = await audibleManager.getMissingBooks();
        res.json(missing);
    } catch (error) {
        res.status(500).json({ error: error.message });
    }
});

// Add show to watchlist
app.post('/api/shows/add', async (req, res) => {
    try {
        const { title, tmdb_id } = req.body;
        
        // Get show details from TMDB
        const details = await tmdb.getTVDetails(tmdb_id);
        if (!details) {
            return res.status(404).json({ error: 'Show not found' });
        }

        // Check German availability
        const services = await vodChecker.checkAvailability(tmdb_id, 'tv');

        // Insert into database
        const showId = await new Promise((resolve, reject) => {
            db.run(`
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
            ], function(err) {
                if (err) reject(err);
                else resolve(this.lastID);
            });
        });

        // Add to user library
        await new Promise((resolve, reject) => {
            db.run(`
                INSERT OR REPLACE INTO user_library (
                    media_type, media_id, status, updated_at
                ) VALUES ('show', ?, 'watching', CURRENT_TIMESTAMP)
            `, [showId], function(err) {
                if (err) reject(err);
                else resolve(this.lastID);
            });
        });

        res.json({ success: true, showId });
    } catch (error) {
        res.status(500).json({ error: error.message });
    }
});

// Sync Audible library
app.post('/api/sync/audible', async (req, res) => {
    try {
        const count = await audibleManager.loadLibraryFromExcel(CONFIG.audible_library_path);
        res.json({ success: true, processed: count });
    } catch (error) {
        res.status(500).json({ error: error.message });
    }
});

// Update data (manual trigger)
app.post('/api/sync/all', async (req, res) => {
    try {
        await updateAllData();
        res.json({ success: true, message: 'Data update completed' });
    } catch (error) {
        res.status(500).json({ error: error.message });
    }
});

// Search shows
app.get('/api/search/shows/:query', async (req, res) => {
    try {
        const results = await tmdb.searchTV(req.params.query);
        
        // Enhance with German availability
        for (const result of results) {
            result.german_services = await vodChecker.checkAvailability(result.id, 'tv');
        }

        res.json(results);
    } catch (error) {
        res.status(500).json({ error: error.message });
    }
});

// Data update functions
async function updateAllData() {
    console.log('Starting data update...');
    
    try {
        // Update show episode information
        await updateShowEpisodes();
        
        // Update movie releases
        await updateMovieReleases();
        
        // Check for new audiobook releases
        await checkAudiobookReleases();
        
        console.log('Data update completed successfully');
    } catch (error) {
        console.error('Data update error:', error.message);
    }
}

async function updateShowEpisodes() {
    const shows = await new Promise((resolve, reject) => {
        db.all("SELECT * FROM shows WHERE status = 'airing'", [], (err, rows) => {
            if (err) reject(err);
            else resolve(rows);
        });
    });

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
                            await new Promise((resolve, reject) => {
                                db.run(`
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
                                ], function(err) {
                                    if (err) reject(err);
                                    else resolve();
                                });
                            });
                        }
                    }
                }
            }
            
            // Small delay to avoid rate limiting
            await new Promise(resolve => setTimeout(resolve, 100));
            
        } catch (error) {
            console.error(`Error updating show ${show.title}:`, error.message);
        }
    }
}

async function updateMovieReleases() {
    const upcomingMovies = await tmdb.getUpcomingMovies();
    
    for (const movie of upcomingMovies.slice(0, 10)) { // Limit to 10
        try {
            const services = await vodChecker.checkAvailability(movie.id, 'movie');
            
            await new Promise((resolve, reject) => {
                db.run(`
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
                ], function(err) {
                    if (err) reject(err);
                    else resolve();
                });
            });
            
        } catch (error) {
            console.error(`Error updating movie ${movie.title}:`, error.message);
        }
    }
}

async function checkAudiobookReleases() {
    // This would involve scraping Audible or using their API
    // For now, we'll check if there are any upcoming releases in our series
    console.log('Checking for new audiobook releases...');
    
    // Implementation would depend on available APIs or scraping capabilities
    // Could check Goodreads, Amazon, or publisher websites for series updates
}

// Schedule automatic updates
cron.schedule(CONFIG.update_interval, () => {
    console.log('Running scheduled data update...');
    updateAllData();
});

// Serve the frontend
app.get('/', (req, res) => {
    res.sendFile(path.join(__dirname, 'public', 'index.html'));
});

// Initialize and start server
async function startServer() {
    try {
        // Ensure data directory exists
        await fs.mkdir('./data', { recursive: true });
        await fs.mkdir('./public', { recursive: true });
        
        // Initialize database
        await initDatabase();
        
        // Load initial Audible data if available
        try {
            await audibleManager.loadLibraryFromExcel(CONFIG.audible_library_path);
            console.log('Audible library loaded successfully');
        } catch (error) {
            console.log('No Audible library found, skipping initial load');
        }
        
        // Start server
        app.listen(PORT, '0.0.0.0', () => {
            console.log(`🚀 Media Tracker Server running on port ${PORT}`);
            console.log(`📱 Accessible via Tailscale at: http://your-tailscale-ip:${PORT}`);
            console.log(`🔄 Auto-updates scheduled: ${CONFIG.update_interval}`);
        });
        
        // Run initial data update
        setTimeout(() => {
            updateAllData();
        }, 5000);
        
    } catch (error) {
        console.error('Server startup error:', error);
        process.exit(1);
    }
}

startServer();