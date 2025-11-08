import * as XLSX from 'xlsx';
import { Audiobook, SeriesProgress } from '../types';
import { getDatabase } from '../utils/database';

export class AudibleManager {
  private db = getDatabase();

  async parseLibationExport(filePath: string): Promise<{ processed: number; series: number; missingBooksFound: number }> {
    const workbook = XLSX.readFile(filePath);
    const sheetName = workbook.SheetNames[0];
    const worksheet = workbook.Sheets[sheetName];
    const data = XLSX.utils.sheet_to_json(worksheet);

    console.log(`📚 Reading Libation export: ${data.length} books`);

    const processedBooks: Audiobook[] = [];
    const seriesMap = new Map<string, Audiobook[]>();

    for (const row of data) {
      const book = this.normalizeLibationData(row);
      processedBooks.push(book);

      // Track series
      if (book.series_name) {
        if (!seriesMap.has(book.series_name)) {
          seriesMap.set(book.series_name, []);
        }
        seriesMap.get(book.series_name)!.push(book);
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
  }

  private normalizeLibationData(row: any): Audiobook {
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

    const normalized: any = {};

    // Find values for each field
    for (const [field, possibleNames] of Object.entries(possibleColumns)) {
      for (const name of possibleNames) {
        if (row[name] !== undefined && row[name] !== null && row[name] !== '') {
          normalized[field] = row[name];
          break;
        }
      }
    }

    return {
      id: 0, // Will be set by database
      asin: normalized.asin || undefined,
      title: normalized.title || 'Unknown Title',
      author: normalized.author || undefined,
      narrator: normalized.narrator || undefined,
      series_name: this.cleanSeriesName(normalized.series),
      series_position: this.parseSeriesPosition(normalized.seriesPosition),
      release_date: this.parseDate(normalized.releaseDate),
      purchase_date: this.parseDate(normalized.purchaseDate),
      length_minutes: this.parseDuration(normalized.length),
      rating: this.parseRating(normalized.rating),
      owned: true, // If it's in Libation, it's owned
      listened: false, // Default to false, can be updated manually
      created_at: new Date().toISOString(),
      updated_at: new Date().toISOString()
    };
  }

  private cleanSeriesName(series: string): string | undefined {
    if (!series || series.trim() === '') return undefined;

    return series
      .replace(/,?\s*Book\s+\d+.*$/i, '')
      .replace(/,?\s*#\d+.*$/i, '')
      .replace(/,?\s*Volume\s+\d+.*$/i, '')
      .replace(/,?\s*Part\s+\d+.*$/i, '')
      .trim();
  }

  private parseSeriesPosition(position: any): number | undefined {
    if (!position) return undefined;

    const match = String(position).match(/(\d+(?:\.\d+)?)/);
    return match ? parseFloat(match[1]) : undefined;
  }

  private parseDate(dateStr: string): string | undefined {
    if (!dateStr) return undefined;

    const date = new Date(dateStr);
    return isNaN(date.getTime()) ? undefined : date.toISOString().split('T')[0];
  }

  private parseDuration(duration: any): number | undefined {
    if (!duration) return undefined;

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

    return undefined;
  }

  private parseRating(rating: any): number | undefined {
    if (!rating) return undefined;

    const num = parseFloat(String(rating).replace(/[^\d.]/g, ''));
    return isNaN(num) ? undefined : num;
  }

  async upsertAudiobook(bookData: Audiobook): Promise<number> {
    const result = await this.db.run(`
      INSERT OR REPLACE INTO audiobooks (
        asin, title, series_name, series_position, author, narrator,
        owned, listened, release_date, purchase_date, rating,
        length_minutes, updated_at
      ) VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, CURRENT_TIMESTAMP)
    `, [
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
      bookData.length_minutes
    ]);

    return result.lastID;
  }

  private async detectMissingSeriesBooks(seriesMap: Map<string, Audiobook[]>): Promise<void> {
    console.log('🔍 Detecting missing books in series...');

    for (const [seriesName, books] of seriesMap) {
      if (books.length < 2) continue; // Skip single-book series

      const sortedBooks = books
        .filter(book => book.series_position !== undefined)
        .sort((a, b) => (a.series_position || 0) - (b.series_position || 0));

      if (sortedBooks.length < 2) continue;

      // Check for gaps in sequence
      for (let i = 0; i < sortedBooks.length - 1; i++) {
        const current = sortedBooks[i].series_position!;
        const next = sortedBooks[i + 1].series_position!;

        if (next - current > 1) {
          for (let pos = current + 1; pos < next; pos++) {
            await this.addMissingBookPlaceholder(seriesName, pos, books[0].author);
          }
        }
      }

      // Check for books before the first one
      const firstPos = sortedBooks[0].series_position!;
      if (firstPos > 1) {
        for (let pos = 1; pos < firstPos; pos++) {
          await this.addMissingBookPlaceholder(seriesName, pos, books[0].author);
        }
      }
    }
  }

  private async addMissingBookPlaceholder(seriesName: string, position: number, author?: string): Promise<void> {
    const placeholderTitle = `${seriesName} Book ${position}`;

    try {
      await this.upsertAudiobook({
        id: 0,
        title: placeholderTitle,
        series_name: seriesName,
        series_position: position,
        author: author,
        owned: false,
        listened: false,
        created_at: new Date().toISOString(),
        updated_at: new Date().toISOString()
      });

      console.log(`📝 Added missing book placeholder: ${placeholderTitle}`);
    } catch (error) {
      console.error(`Error adding placeholder for ${placeholderTitle}:`, error);
    }
  }

  async getSeriesProgress(): Promise<SeriesProgress[]> {
    const rows = await this.db.all(`
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
    `);

    return rows.map(series => ({
      ...series,
      completion_percentage: series.listened_books ? Math.round((series.listened_books / series.owned_books) * 100) : 0,
      ownership_percentage: Math.round((series.owned_books / series.total_books) * 100),
      total_hours: Math.round(series.total_listening_time / 60),
      next_book_position: series.latest_position + 1
    }));
  }

  async getMissingBooksCount(): Promise<number> {
    const result = await this.db.get("SELECT COUNT(*) as count FROM audiobooks WHERE owned = 0", []);
    return result?.count || 0;
  }

  async getSeriesDetails(seriesName: string): Promise<Audiobook[]> {
    const books = await this.db.all(`
      SELECT * FROM audiobooks
      WHERE series_name = ?
      ORDER BY
        CASE WHEN series_position IS NULL THEN 999999 ELSE series_position END,
        title
    `, [seriesName]);

    return books.map(book => ({
      ...book,
      status: book.owned ? (book.listened ? 'completed' : 'owned') : 'missing',
      display_title: book.series_position
        ? `Book ${book.series_position}: ${book.title}`
        : book.title
    })) as Audiobook[];
  }

  async markAsListened(bookId: number): Promise<boolean> {
    const result = await this.db.run(
      "UPDATE audiobooks SET listened = 1, updated_at = CURRENT_TIMESTAMP WHERE id = ?",
      [bookId]
    );
    return result.changes > 0;
  }
}