// Enhanced Audible Library Integration for Libation Export Format
// Handles series tracking, missing books detection, and release monitoring

const XLSX = require('xlsx');
const axios = require('axios');
const cheerio = require('cheerio');

class EnhancedAudibleManager {
    constructor(db) {
        this.db = db;
        this.goodreadsApiKey = process.env.GOODREADS_API_KEY;
        this.audibleBaseUrl = 'https://www.audible.de'; // German Audible
    }

    // Parse Libation export format
    async parseLibationExport(filePath) {
        try {
            console.log(`📚 Reading Libation export: ${filePath}`);
            
            const workbook = XLSX.readFile(filePath);
            const sheetName = workbook.SheetNames[0];
            const worksheet = workbook.Sheets[sheetName];
            const data = XLSX.utils.sheet_to_json(worksheet);

            console.log(`📊 Found ${data.length} books in library`);

            const processedBooks = [];
            const seriesMap = new Map();

            for (const row of data) {
                const book = this.normalizeLibationData(row);
                processedBooks.push(book);

                // Track series
                if (book.series_name) {
                    if (!seriesMap.has(book.series_name)) {
                        seriesMap.set(book.series_name, []);
                    }
                    seriesMap.get(book.series_name).push(book);
                }
            }

            // Process each book
            for (const book of processedBooks) {
                await this.upsertAudiobook(book);
            }

            // Find missing books in series
            await this.detectMissingSeriesBooks(seriesMap);

            return {
                processed: processedBooks.length,
                series: seriesMap.size,
                missingBooksFound: await this.getMissingBooksCount()
            };

        } catch (error) {
            console.error('❌ Libation parsing error:', error);
            throw error;
        }
    }

    // Normalize different Libation column formats
    normalizeLibationData(row) {
        // Libation export can have various column names
        const possibleColumns = {
            asin: ['ASIN', 'asin', 'Asin'],
            title: ['Title', 'title', 'BookTitle', 'Product Name'],
            author: ['Author', 'author', 'Authors', 'By'],
            narrator: ['Narrator', 'narrator', 'Narrated By'],
            series: ['Series', 'series', 'Series Name'],
            seriesPosition: ['Series Position', 'Book #', 'Book', '#'],
            releaseDate: ['Release Date', 'Publication Date', 'Date Added'],
            purchaseDate: ['Purchase Date', 'Date Purchased', 'Added'],
            length: ['Length', 'Duration', 'Runtime'],
            rating: ['Rating', 'My Rating', 'Overall Rating'],
            categories: ['Categories', 'Genre', 'Genres']
        };

        const normalized = {};

        // Find values for each field
        for (const [field, possibleNames] of Object.entries(possibleColumns)) {
            for (const name of possibleNames) {
                if (row[name] !== undefined && row[name] !== null && row[name] !== '') {
                    normalized[field] = row[name];
                    break;
                }
            }
        }

        // Clean up and parse specific fields
        return {
            asin: normalized.asin || null,
            title: normalized.title || 'Unknown Title',
            author: normalized.author || 'Unknown Author',
            narrator: normalized.narrator || null,
            series_name: this.cleanSeriesName(normalized.series),
            series_position: this.parseSeriesPosition(normalized.seriesPosition),
            release_date: this.parseDate(normalized.releaseDate),
            purchase_date: this.parseDate(normalized.purchaseDate),
            length_minutes: this.parseDuration(normalized.length),
            rating: this.parseRating(normalized.rating),
            categories: normalized.categories || null,
            owned: true, // If it's in Libation, it's owned
            listened: false // Default to false, can be updated manually
        };
    }

    // Clean series name (remove book numbers, subtitles)
    cleanSeriesName(series) {
        if (!series || series.trim() === '') return null;
        
        // Remove common patterns
        return series
            .replace(/,?\s*Book\s+\d+.*$/i, '') // Remove "Book 1" etc
            .replace(/,?\s*#\d+.*$/i, '') // Remove "#1" etc
            .replace(/,?\s*Volume\s+\d+.*$/i, '') // Remove "Volume 1" etc
            .replace(/,?\s*Part\s+\d+.*$/i, '') // Remove "Part 1" etc
            .trim();
    }

    // Parse series position (handle various formats)
    parseSeriesPosition(position) {
        if (!position) return null;
        
        // Handle different formats: "1", "1.0", "1.5", "Book 1", "#1"
        const match = String(position).match(/(\d+(?:\.\d+)?)/);
        return match ? parseFloat(match[1]) : null;
    }

    // Parse various date formats
    parseDate(dateStr) {
        if (!dateStr) return null;
        
        const date = new Date(dateStr);
        return isNaN(date.getTime()) ? null : date.toISOString().split('T')[0];
    }

    // Parse duration (handle various formats)
    parseDuration(duration) {
        if (!duration) return null;
        
        // Handle formats like "5 hrs 30 mins", "5:30:00", "330 minutes"
        const str = String(duration).toLowerCase();
        
        // Hours and minutes format
        const hm = str.match(/(\d+)\s*hrs?.*?(\d+)\s*mins?/);
        if (hm) {
            return parseInt(hm[1]) * 60 + parseInt(hm[2]);
        }
        
        // Time format (H:MM:SS or HH:MM:SS)
        const time = str.match(/(\d+):(\d+)(?::(\d+))?/);
        if (time) {
            return parseInt(time[1]) * 60 + parseInt(time[2]);
        }
        
        // Minutes only
        const mins = str.match(/(\d+)\s*mins?/);
        if (mins) {
            return parseInt(mins[1]);
        }
        
        // Hours only
        const hrs = str.match(/(\d+)\s*hrs?/);
        if (hrs) {
            return parseInt(hrs[1]) * 60;
        }
        
        return null;
    }

    // Parse rating
    parseRating(rating) {
        if (!rating) return null;
        
        const num = parseFloat(String(rating).replace(/[^\d.]/g, ''));
        return isNaN(num) ? null : num;
    }

    // Insert/update audiobook in database
    async upsertAudiobook(bookData) {
        return new Promise((resolve, reject) => {
            const sql = `
                INSERT OR REPLACE INTO audiobooks (
                    asin, title, series_name, series_position, author, narrator,
                    owned, listened, release_date, purchase_date, rating, 
                    length_minutes, categories, updated_at
                ) VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, CURRENT_TIMESTAMP)
            `;

            this.db.run(sql, [
                bookData.asin,
                bookData.title,
                bookData.series_name,
                bookData.series_position,
                bookData.author,
                bookData.narrator,
                bookData.owned ? 1 : 0,
                bookData.listened ? 1 : 0,
                bookData.release_date,
                bookData.purchase_date,
                bookData.rating,
                bookData.length_minutes,
                bookData.categories
            ], function(err) {
                if (err) {
                    console.error('Database error:', err);
                    reject(err);
                } else {
                    resolve(this.lastID);
                }
            });
        });
    }

    // Detect missing books in series by checking for gaps
    async detectMissingSeriesBooks(seriesMap) {
        console.log('🔍 Detecting missing books in series...');

        for (const [seriesName, books] of seriesMap) {
            if (books.length < 2) continue; // Skip single-book series

            // Sort by series position
            const sortedBooks = books
                .filter(book => book.series_position !== null)
                .sort((a, b) => a.series_position - b.series_position);

            if (sortedBooks.length < 2) continue;

            // Check for gaps in sequence
            for (let i = 0; i < sortedBooks.length - 1; i++) {
                const current = sortedBooks[i].series_position;
                const next = sortedBooks[i + 1].series_position;

                // If there's a gap of 1 or more, there might be missing books
                if (next - current > 1) {
                    for (let pos = current + 1; pos < next; pos++) {
                        await this.addMissingBookPlaceholder(seriesName, pos, books[0].author);
                    }
                }
            }

            // Check for books before the first one
            const firstPos = sortedBooks[0].series_position;
            if (firstPos > 1) {
                for (let pos = 1; pos < firstPos; pos++) {
                    await this.addMissingBookPlaceholder(seriesName, pos, books[0].author);
                }
            }

            // Check for potential next books (look up recent releases)
            const lastPos = sortedBooks[sortedBooks.length - 1].series_position;
            await this.checkForNewerBooksInSeries(seriesName, lastPos, books[0].author);
        }
    }

    // Add placeholder for missing book
    async addMissingBookPlaceholder(seriesName, position, author) {
        const placeholderTitle = `${seriesName} Book ${position}`;
        
        try {
            await this.upsertAudiobook({
                asin: null,
                title: placeholderTitle,
                series_name: seriesName,
                series_position: position,
                author: author,
                narrator: null,
                owned: false,
                listened: false,
                release_date: null,
                purchase_date: null,
                rating: null,
                length_minutes: null,
                categories: null
            });

            console.log(`📝 Added missing book placeholder: ${placeholderTitle}`);
        } catch (error) {
            console.error(`Error adding placeholder for ${placeholderTitle}:`, error);
        }
    }

    // Check online for newer books in series
    async checkForNewerBooksInSeries(seriesName, lastKnownPosition, author) {
        try {
            // This would involve scraping Audible or using Goodreads API
            // For now, we'll check if there are common sequel patterns
            
            const potentialTitles = [
                `${seriesName} Book ${lastKnownPosition + 1}`,
                `${seriesName} ${lastKnownPosition + 1}`,
                `${seriesName}: Book ${lastKnownPosition + 1}`
            ];

            for (const title of potentialTitles) {
                const exists = await this.searchAudibleForBook(title, author);
                if (exists) {
                    await this.addMissingBookPlaceholder(seriesName, lastKnownPosition + 1, author);
                    break;
                }
            }
        } catch (error) {
            console.error(`Error checking for newer books in ${seriesName}:`, error);
        }
    }

    // Search Audible for specific book (basic implementation)
    async searchAudibleForBook(title, author) {
        try {
            // Simple web scraping approach
            const searchUrl = `${this.audibleBaseUrl}/search?keywords=${encodeURIComponent(title + ' ' + author)}`;
            const response = await axios.get(searchUrl, {
                headers: {
                    'User-Agent': 'Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36'
                },
                timeout: 5000
            });

            const $ = cheerio.load(response.data);
            
            // Look for book results
            const results = $('.bc-list-item').length;
            return results > 0;

        } catch (error) {
            console.error('Audible search error:', error.message);
            return false;
        }
    }

    // Get series progress statistics
    async getSeriesProgress() {
        return new Promise((resolve, reject) => {
            const sql = `
                SELECT 
                    series_name,
                    COUNT(*) as total_books,
                    SUM(CASE WHEN owned = 1 THEN 1 ELSE 0 END) as owned_books,
                    SUM(CASE WHEN listened = 1 THEN 1 ELSE 0 END) as listened_books,
                    SUM(CASE WHEN owned = 0 THEN 1 ELSE 0 END) as missing_books,
                    MIN(series_position) as first_position,
                    MAX(series_position) as latest_position,
                    AVG(CASE WHEN rating IS NOT NULL THEN rating ELSE NULL END) as avg_rating,
                    SUM(CASE WHEN owned = 1 AND length_minutes IS NOT NULL THEN length_minutes ELSE 0 END) as total_listening_time
                FROM audiobooks 
                WHERE series_name IS NOT NULL 
                GROUP BY series_name
                HAVING COUNT(*) > 1
                ORDER BY owned_books DESC, total_books DESC
            `;

            this.db.all(sql, [], (err, rows) => {
                if (err) {
                    reject(err);
                } else {
                    // Add progress percentage and reading stats
                    const enhanced = rows.map(series => ({
                        ...series,
                        completion_percentage: Math.round((series.listened_books / series.owned_books) * 100) || 0,
                        ownership_percentage: Math.round((series.owned_books / series.total_books) * 100),
                        total_hours: Math.round(series.total_listening_time / 60),
                        next_book_position: series.latest_position + 1
                    }));
                    resolve(enhanced);
                }
            });
        });
    }

    // Get missing books count
    async getMissingBooksCount() {
        return new Promise((resolve, reject) => {
            this.db.get(
                "SELECT COUNT(*) as count FROM audiobooks WHERE owned = 0",
                [],
                (err, row) => {
                    if (err) reject(err);
                    else resolve(row.count);
                }
            );
        });
    }

    // Get books by series with detailed info
    async getSeriesDetails(seriesName) {
        return new Promise((resolve, reject) => {
            const sql = `
                SELECT * FROM audiobooks 
                WHERE series_name = ? 
                ORDER BY 
                    CASE WHEN series_position IS NULL THEN 999999 ELSE series_position END,
                    title
            `;

            this.db.all(sql, [seriesName], (err, rows) => {
                if (err) {
                    reject(err);
                } else {
                    resolve(rows.map(book => ({
                        ...book,
                        status: book.owned ? (book.listened ? 'completed' : 'owned') : 'missing',
                        display_title: book.series_position 
                            ? `Book ${book.series_position}: ${book.title}`
                            : book.title
                    })));
                }
            });
        });
    }

    // Mark book as listened
    async markAsListened(bookId) {
        return new Promise((resolve, reject) => {
            this.db.run(
                "UPDATE audiobooks SET listened = 1, updated_at = CURRENT_TIMESTAMP WHERE id = ?",
                [bookId],
                function(err) {
                    if (err) reject(err);
                    else resolve(this.changes > 0);
                }
            );
        });
    }

    // Get listening statistics
    async getListeningStats() {
        return new Promise((resolve, reject) => {
            const sql = `
                SELECT 
                    COUNT(*) as total_books,
                    SUM(CASE WHEN owned = 1 THEN 1 ELSE 0 END) as owned_books,
                    SUM(CASE WHEN listened = 1 THEN 1 ELSE 0 END) as completed_books,
                    SUM(CASE WHEN owned = 0 THEN 1 ELSE 0 END) as missing_books,
                    SUM(CASE WHEN owned = 1 AND length_minutes IS NOT NULL THEN length_minutes ELSE 0 END) as total_listening_time,
                    COUNT(DISTINCT series_name) as total_series,
                    AVG(CASE WHEN rating IS NOT NULL THEN rating ELSE NULL END) as avg_rating
                FROM audiobooks
            `;

            this.db.get(sql, [], (err, row) => {
                if (err) {
                    reject(err);
                } else {
                    resolve({
                        ...row,
                        total_hours: Math.round(row.total_listening_time / 60),
                        completion_rate: Math.round((row.completed_books / row.owned_books) * 100) || 0,
                        avg_rating: Math.round(row.avg_rating * 10) / 10 || null
                    });
                }
            });
        });
    }

    // Export current library state
    async exportLibrary() {
        return new Promise((resolve, reject) => {
            this.db.all(
                "SELECT * FROM audiobooks ORDER BY series_name, series_position, title",
                [],
                (err, rows) => {
                    if (err) reject(err);
                    else resolve(rows);
                }
            );
        });
    }
}

module.exports = EnhancedAudibleManager;