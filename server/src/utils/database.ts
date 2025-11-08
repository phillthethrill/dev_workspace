import sqlite3 from 'sqlite3';
import path from 'path';
import fs from 'fs/promises';

export class Database {
  private db: sqlite3.Database;

  constructor(dbPath: string = './data/media_tracker.db') {
    this.db = new sqlite3.Database(dbPath);
  }

  async init(): Promise<void> {
    // Ensure data directory exists
    const dataDir = path.dirname('./data/media_tracker.db');
    await fs.mkdir(dataDir, { recursive: true });

    return new Promise((resolve, reject) => {
      this.db.serialize(() => {
        // Enable foreign keys
        this.db.run('PRAGMA foreign_keys = ON');

        // Shows table
        this.db.run(`
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
        this.db.run(`
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
        this.db.run(`
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

        // User library table
        this.db.run(`
          CREATE TABLE IF NOT EXISTS user_library (
            id INTEGER PRIMARY KEY AUTOINCREMENT,
            media_type TEXT NOT NULL CHECK(media_type IN ('show', 'movie', 'audiobook')),
            media_id INTEGER NOT NULL,
            status TEXT DEFAULT 'watching' CHECK(status IN ('watching', 'completed', 'planned', 'dropped')),
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

  // Generic query methods
  async get<T = any>(sql: string, params: any[] = []): Promise<T | undefined> {
    return new Promise((resolve, reject) => {
      this.db.get(sql, params, (err, row) => {
        if (err) reject(err);
        else resolve(row as T);
      });
    });
  }

  async all<T = any>(sql: string, params: any[] = []): Promise<T[]> {
    return new Promise((resolve, reject) => {
      this.db.all(sql, params, (err, rows) => {
        if (err) reject(err);
        else resolve(rows as T[]);
      });
    });
  }

  async run(sql: string, params: any[] = []): Promise<{ lastID: number; changes: number }> {
    return new Promise((resolve, reject) => {
      this.db.run(sql, params, function(err) {
        if (err) reject(err);
        else resolve({ lastID: this.lastID, changes: this.changes });
      });
    });
  }

  async close(): Promise<void> {
    return new Promise((resolve) => {
      this.db.close(() => resolve());
    });
  }

  // Health check
  async healthCheck(): Promise<boolean> {
    try {
      const result = await this.get('SELECT 1 as health');
      return result?.health === 1;
    } catch {
      return false;
    }
  }
}

// Singleton instance
let dbInstance: Database | null = null;

export function getDatabase(): Database {
  if (!dbInstance) {
    dbInstance = new Database();
  }
  return dbInstance;
}