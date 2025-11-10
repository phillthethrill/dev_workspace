import sqlite3 from 'sqlite3';
import path from 'path';
import fs from 'fs/promises';
import { getCache } from './cache';
import { getLogger } from './logger';

export interface QueryStats {
  executionTime: number;
  rowCount: number;
  cacheHit: boolean;
}

export class OptimizedDatabase {
  private db: sqlite3.Database;
  private dbPath: string;
  private queryStats = new Map<string, QueryStats>();
  private connectionPool: sqlite3.Database[] = [];
  private maxConnections = 5;
  private activeConnections = 0;

  constructor(dbPath: string = './data/media_tracker_optimized.db') {
    this.dbPath = dbPath;
    this.db = new sqlite3.Database(dbPath);
    this.setupConnectionPooling();
  }

  private setupConnectionPooling(): void {
    // Create additional connections for read operations
    for (let i = 0; i < this.maxConnections - 1; i++) {
      const conn = new sqlite3.Database(this.dbPath, sqlite3.OPEN_READONLY);
      this.connectionPool.push(conn);
    }
  }

  async init(): Promise<void> {
    const logger = getLogger();
    
    // Ensure data directory exists
    const dataDir = path.dirname(this.dbPath);
    await fs.mkdir(dataDir, { recursive: true });

    return new Promise((resolve, reject) => {
      this.db.serialize(async () => {
        try {
          // Enable performance optimizations
          this.db.run('PRAGMA journal_mode = WAL');
          this.db.run('PRAGMA synchronous = NORMAL');
          this.db.run('PRAGMA cache_size = 10000');
          this.db.run('PRAGMA temp_store = memory');
          this.db.run('PRAGMA mmap_size = 268435456'); // 256MB
          this.db.run('PRAGMA foreign_keys = ON');

          // Create tables with optimized schema
          await this.createTables();
          
          // Create indexes for performance
          await this.createIndexes();
          
          // Optimize database
          this.db.run('PRAGMA optimize');
          
          logger.info('Database initialized with optimizations');
          resolve();
        } catch (error) {
          logger.error('Database initialization error:', error);
          reject(error);
        }
      });
    });
  }

  private async createTables(): Promise<void> {
    return new Promise((resolve, reject) => {
      this.db.serialize(() => {
        // Shows table with optimized schema
        this.db.run(`
          CREATE TABLE IF NOT EXISTS shows (
            id INTEGER PRIMARY KEY AUTOINCREMENT,
            tmdb_id INTEGER UNIQUE NOT NULL,
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

        // Movies table with optimized schema
        this.db.run(`
          CREATE TABLE IF NOT EXISTS movies (
            id INTEGER PRIMARY KEY AUTOINCREMENT,
            tmdb_id INTEGER UNIQUE NOT NULL,
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

        // Audiobooks table with optimized schema
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

        // User library table with optimized schema
        this.db.run(`
          CREATE TABLE IF NOT EXISTS user_library (
            id INTEGER PRIMARY KEY AUTOINCREMENT,
            media_type TEXT NOT NULL CHECK(media_type IN ('show', 'movie', 'audiobook')),
            media_id INTEGER NOT NULL,
            status TEXT DEFAULT 'watching' CHECK(status IN ('watching', 'completed', 'planned', 'dropped')),
            current_episode INTEGER,
            current_season INTEGER,
            added_at DATETIME DEFAULT CURRENT_TIMESTAMP,
            updated_at DATETIME DEFAULT CURRENT_TIMESTAMP,
            UNIQUE(media_type, media_id)
          )
        `);

        // Cache table for API responses
        this.db.run(`
          CREATE TABLE IF NOT EXISTS api_cache (
            cache_key TEXT PRIMARY KEY,
            cache_value TEXT NOT NULL,
            created_at DATETIME DEFAULT CURRENT_TIMESTAMP,
            expires_at DATETIME NOT NULL
          )
        `);

        resolve();
      });
    });
  }

  private async createIndexes(): Promise<void> {
    return new Promise((resolve, reject) => {
      this.db.serialize(() => {
        // Shows indexes
        this.db.run('CREATE INDEX IF NOT EXISTS idx_shows_tmdb_id ON shows(tmdb_id)');
        this.db.run('CREATE INDEX IF NOT EXISTS idx_shows_next_date ON shows(next_date)');
        this.db.run('CREATE INDEX IF NOT EXISTS idx_shows_status ON shows(status)');
        this.db.run('CREATE INDEX IF NOT EXISTS idx_shows_updated ON shows(updated_at)');
        this.db.run('CREATE INDEX IF NOT EXISTS idx_shows_german_available ON shows(german_available)');

        // Movies indexes
        this.db.run('CREATE INDEX IF NOT EXISTS idx_movies_tmdb_id ON movies(tmdb_id)');
        this.db.run('CREATE INDEX IF NOT EXISTS idx_movies_release_date ON movies(release_date)');
        this.db.run('CREATE INDEX IF NOT EXISTS idx_movies_status ON movies(status)');
        this.db.run('CREATE INDEX IF NOT EXISTS idx_movies_german_available ON movies(german_available)');

        // Audiobooks indexes
        this.db.run('CREATE INDEX IF NOT EXISTS idx_audiobooks_asin ON audiobooks(asin)');
        this.db.run('CREATE INDEX IF NOT EXISTS idx_audiobooks_series ON audiobooks(series_name)');
        this.db.run('CREATE INDEX IF NOT EXISTS idx_audiobooks_series_position ON audiobooks(series_position)');
        this.db.run('CREATE INDEX IF NOT EXISTS idx_audiobooks_owned ON audiobooks(owned)');
        this.db.run('CREATE INDEX IF NOT EXISTS idx_audiobooks_listened ON audiobooks(listened)');

        // User library indexes
        this.db.run('CREATE INDEX IF NOT EXISTS idx_user_library_media ON user_library(media_type, media_id)');
        this.db.run('CREATE INDEX IF NOT EXISTS idx_user_library_status ON user_library(status)');

        // API cache indexes
        this.db.run('CREATE INDEX IF NOT EXISTS idx_api_cache_expires ON api_cache(expires_at)');
        this.db.run('CREATE INDEX IF NOT EXISTS idx_api_cache_created ON api_cache(created_at)');

        resolve();
      });
    });
  }

  // Cached query method
  async cachedQuery<T = any>(
    cacheKey: string,
    sql: string,
    params: any[] = [],
    ttlMs: number = 300000
  ): Promise<T[]> {
    const cache = getCache();
    const cached = cache.get<T[]>(cacheKey);
    
    if (cached) {
      this.recordQueryStats(sql, 0, cached.length, true);
      return cached;
    }

    const result = await this.query<T>(sql, params);
    cache.set(cacheKey, result, ttlMs);
    this.recordQueryStats(sql, 0, result.length, false);
    
    return result;
  }

  // Optimized query method
  async query<T = any>(sql: string, params: any[] = []): Promise<T[]> {
    const startTime = Date.now();
    
    return new Promise((resolve, reject) => {
      // Use connection pooling for read queries
      const db = this.getConnection();
      
      db.all(sql, params, (err, rows) => {
        this.releaseConnection(db);
        
        if (err) {
          this.recordQueryStats(sql, Date.now() - startTime, 0, false);
          reject(err);
        } else {
          this.recordQueryStats(sql, Date.now() - startTime, rows.length, false);
          resolve(rows as T[]);
        }
      });
    });
  }

  // Optimized get method
  async get<T = any>(sql: string, params: any[] = []): Promise<T | undefined> {
    const startTime = Date.now();
    
    return new Promise((resolve, reject) => {
      const db = this.getConnection();
      
      db.get(sql, params, (err, row) => {
        this.releaseConnection(db);
        
        if (err) {
          this.recordQueryStats(sql, Date.now() - startTime, 0, false);
          reject(err);
        } else {
          this.recordQueryStats(sql, Date.now() - startTime, row ? 1 : 0, false);
          resolve(row as T);
        }
      });
    });
  }

  // Optimized run method for writes
  async run(sql: string, params: any[] = []): Promise<{ lastID: number; changes: number }> {
    const startTime = Date.now();
    
    return new Promise((resolve, reject) => {
      this.db.run(sql, params, function(err) {
        if (err) {
          reject(err);
        } else {
          resolve({ lastID: this.lastID, changes: this.changes });
        }
      });
    });
  }

  // Batch operations for better performance
  async batch(operations: Array<{ sql: string; params: any[] }>): Promise<void> {
    return new Promise((resolve, reject) => {
      this.db.serialize(() => {
        this.db.run('BEGIN TRANSACTION');
        
        let completed = 0;
        let hasError = false;

        for (const op of operations) {
          this.db.run(op.sql, op.params, (err) => {
            if (err && !hasError) {
              hasError = true;
              this.db.run('ROLLBACK');
              reject(err);
              return;
            }

            completed++;
            if (completed === operations.length && !hasError) {
              this.db.run('COMMIT', (commitErr) => {
                if (commitErr) {
                  reject(commitErr);
                } else {
                  resolve();
                }
              });
            }
          });
        }
      });
    });
  }

  // Connection pooling methods
  private getConnection(): sqlite3.Database {
    if (this.connectionPool.length > 0) {
      return this.connectionPool.pop()!;
    }
    return new sqlite3.Database(this.dbPath, sqlite3.OPEN_READONLY);
  }

  private releaseConnection(conn: sqlite3.Database): void {
    if (this.connectionPool.length < this.maxConnections - 1) {
      this.connectionPool.push(conn);
    } else {
      conn.close();
    }
  }

  // Query statistics and monitoring
  private recordQueryStats(sql: string, executionTime: number, rowCount: number, cacheHit: boolean): void {
    const simplifiedSql = sql.substring(0, 50) + '...';
    this.queryStats.set(simplifiedSql, {
      executionTime,
      rowCount,
      cacheHit
    });
  }

  getQueryStats(): Record<string, QueryStats> {
    const stats: Record<string, QueryStats> = {};
    for (const [query, stat] of this.queryStats.entries()) {
      stats[query] = stat;
    }
    return stats;
  }

  // Database maintenance
  async vacuum(): Promise<void> {
    return new Promise((resolve, reject) => {
      this.db.run('VACUUM', (err) => {
        if (err) {
          reject(err);
        } else {
          resolve();
        }
      });
    });
  }

  async analyze(): Promise<void> {
    return new Promise((resolve, reject) => {
      this.db.run('ANALYZE', (err) => {
        if (err) {
          reject(err);
        } else {
          resolve();
        }
      });
    });
  }

  async healthCheck(): Promise<boolean> {
    try {
      const result = await this.get('SELECT 1 as health');
      return result?.health === 1;
    } catch {
      return false;
    }
  }

  async close(): Promise<void> {
    // Close main connection
    await new Promise<void>((resolve) => {
      this.db.close(() => resolve());
    });

    // Close connection pool
    for (const conn of this.connectionPool) {
      await new Promise<void>((resolve) => {
        conn.close(() => resolve());
      });
    }
  }
}

// Singleton instance
let dbInstance: OptimizedDatabase | null = null;

export function getOptimizedDatabase(): OptimizedDatabase {
  if (!dbInstance) {
    dbInstance = new OptimizedDatabase();
  }
  return dbInstance;
}