import { getDatabase } from '../utils/database';
import { TMDBClient } from '../services/tmdb-client';
import { GermanVODChecker } from '../services/german-vod-checker';

async function seedDatabase() {
  console.log('🌱 Seeding database with sample data...');

  const db = getDatabase();
  const tmdb = new TMDBClient(process.env.TMDB_API_KEY || '');
  const vodChecker = new GermanVODChecker();

  try {
    // Seed some popular TV shows
    const sampleShows = [
      { tmdbId: 84680, title: 'Foundation' },
      { tmdbId: 95557, title: 'Invasion' },
      { tmdbId: 1429, title: 'Attack on Titan' },
      { tmdbId: 66732, title: 'Stranger Things' },
      { tmdbId: 1399, title: 'Game of Thrones' }
    ];

    for (const show of sampleShows) {
      try {
        const details = await tmdb.getTVDetails(show.tmdbId);
        if (details) {
          const services = await vodChecker.checkShowAvailability(details);

          await db.run(`
            INSERT OR IGNORE INTO shows (
              tmdb_id, title, season, service, german_available,
              poster_url, status
            ) VALUES (?, ?, ?, ?, ?, ?, ?)
          `, [
            show.tmdbId,
            details.name,
            details.number_of_seasons,
            services.join(','),
            services.length > 0 ? 1 : 0,
            details.poster_path ? `https://image.tmdb.org/t/p/w500${details.poster_path}` : null,
            'airing'
          ]);

          console.log(`✅ Added ${details.name}`);
        }
      } catch (error) {
        console.error(`❌ Failed to add ${show.title}:`, error);
      }

      // Rate limiting
      await new Promise(resolve => setTimeout(resolve, 200));
    }

    // Seed some upcoming movies
    const upcomingMovies = await tmdb.getUpcomingMovies();
    const moviesToAdd = upcomingMovies.slice(0, 5);

    for (const movie of moviesToAdd) {
      try {
        const services = await vodChecker.checkMovieAvailability(movie);

        await db.run(`
          INSERT OR IGNORE INTO movies (
            tmdb_id, title, release_date, service, german_available,
            poster_url, status
          ) VALUES (?, ?, ?, ?, ?, ?, ?)
        `, [
          movie.id,
          movie.title,
          movie.release_date,
          services.join(','),
          services.length > 0 ? 1 : 0,
          movie.poster_path ? `https://image.tmdb.org/t/p/w500${movie.poster_path}` : null,
          'upcoming'
        ]);

        console.log(`🎬 Added ${movie.title}`);
      } catch (error) {
        console.error(`❌ Failed to add movie ${movie.title}:`, error);
      }

      // Rate limiting
      await new Promise(resolve => setTimeout(resolve, 200));
    }

    // Add sample user library entries
    const shows = await db.all('SELECT id FROM shows LIMIT 3');
    for (let i = 0; i < shows.length; i++) {
      await db.run(`
        INSERT OR IGNORE INTO user_library (
          media_type, media_id, status
        ) VALUES ('show', ?, ?)
      `, [shows[i].id, i === 0 ? 'watching' : i === 1 ? 'completed' : 'planned']);
    }

    console.log('✅ Database seeded successfully!');
    console.log(`📺 Added ${sampleShows.length} sample shows`);
    console.log(`🎬 Added ${moviesToAdd.length} upcoming movies`);

  } catch (error) {
    console.error('❌ Seeding failed:', error);
  } finally {
    await db.close();
  }
}

// Run if called directly
if (require.main === module) {
  seedDatabase().catch(console.error);
}

export { seedDatabase };