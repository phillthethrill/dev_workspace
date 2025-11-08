# Universal Media Tracker (DE)

A production-ready media tracking application focused on German VOD availability for TV shows, movies, and audiobooks. Features automatic episode tracking, Audible library integration, and seamless Notion embed support.

![Media Tracker Screenshot](https://via.placeholder.com/800x400/6366f1/ffffff?text=Media+Tracker+Screenshot)

## ✨ Features

- **📺 TV Show Tracking**: Automatic episode release monitoring with German VOD availability
- **🎬 Movie Releases**: Upcoming movie tracking with German streaming service detection
- **🎧 Audible Integration**: Import and track audiobook libraries with series progress
- **🇩🇪 German Focus**: Optimized for German streaming services (Netflix, Prime, Disney+, etc.)
- **📱 Notion Embed**: Seamless integration as embeddable web component
- **🔄 Auto Updates**: Background cron jobs update data every 6 hours
- **🐳 Docker Ready**: Unraid-friendly containerized deployment
- **📊 REST API**: Full programmatic access to all data
- **🎨 Modern UI**: Responsive design with dark mode support

## 🚀 Quick Start

### Docker (Recommended)

1. **Clone the repository**
   ```bash
   git clone https://github.com/your-repo/media-tracker.git
   cd media-tracker
   ```

2. **Create environment file**
   ```bash
   cp .env.example .env
   # Edit .env with your TMDB API key
   ```

3. **Run with Docker Compose**
   ```bash
   docker-compose up -d
   ```

4. **Access the application**
   - Web UI: http://localhost:3000
   - API: http://localhost:3000/api/health

### Local Development

1. **Install dependencies**
   ```bash
   npm install
   ```

2. **Build and run**
   ```bash
   npm run build
   npm start
   ```

## 📋 Requirements

- **Node.js**: 18.0.0 or higher
- **TMDB API Key**: Required for TV/movie data ([Get one here](https://www.themoviedb.org/settings/api))
- **Audible Library**: Optional Excel export from Libation/Audible

## 🔧 Configuration

### Environment Variables

| Variable | Description | Default | Required |
|----------|-------------|---------|----------|
| `TMDB_API_KEY` | The Movie Database API key | - | Yes |
| `AUDIBLE_LIBRARY_PATH` | Path to Audible Excel file | `./data/audible_library.xlsx` | No |
| `PORT` | Server port | `3000` | No |
| `TZ` | Timezone | `Europe/Berlin` | No |
| `GOODREADS_API_KEY` | Goodreads API key (future use) | - | No |

### Sample .env file

```env
TMDB_API_KEY=your_tmdb_api_key_here
AUDIBLE_LIBRARY_PATH=./data/audible_library.xlsx
PORT=3000
TZ=Europe/Berlin
```

## 📚 API Documentation

### Core Endpoints

#### GET `/api/upcoming`
Returns next 10 TV episodes and 5 movies with future release dates.

**Response:**
```json
[
  {
    "type": "show",
    "id": 1,
    "title": "Foundation",
    "next_date": "2025-01-17",
    "service": "apple",
    "german_available": true,
    "poster_url": "https://..."
  }
]
```

#### GET `/api/shows`
Returns all tracked TV shows with user library status.

#### GET `/api/audiobooks/series`
Returns audiobook series with progress statistics.

#### POST `/api/shows/add`
Add a new TV show to track.

**Request:**
```json
{
  "title": "Foundation",
  "tmdb_id": 84680
}
```

#### POST `/api/sync/audible`
Import Audible library from Excel file.

#### GET `/api/health`
Health check endpoint.

## 🎯 Usage

### Adding TV Shows

1. Search for shows using TMDB ID
2. Add to your watchlist
3. System automatically tracks new episodes and German availability

### Audible Integration

1. Export your Audible library using Libation
2. Place Excel file at `./data/audible_library.xlsx`
3. Call `POST /api/sync/audible` to import
4. View series progress and missing books

### Notion Integration

Embed in Notion using:
```html
<iframe src="http://your-server:3000/embed" width="100%" height="600"></iframe>
```

## 🏗️ Architecture

```text
media-tracker/
├── server/                 # TypeScript backend
│   ├── src/
│   │   ├── routes/         # API endpoints
│   │   ├── services/       # Business logic
│   │   ├── types/          # TypeScript definitions
│   │   └── utils/          # Database, helpers
│   └── dist/               # Compiled output
├── web/                    # Frontend (vanilla JS)
│   └── index.html          # Single-page application
├── data/                   # SQLite database & files
└── public/                 # Static web assets
```

### Database Schema

- **shows**: TV show tracking with episode data
- **movies**: Movie release tracking
- **audiobooks**: Audible library with series support
- **user_library**: User watchlist/status tracking

## 🐳 Docker Deployment

### Unraid Setup

1. **Add Community Application**
   - Search for "MediaTracker"
   - Configure paths and API keys

2. **Manual Docker Run**
   ```bash
   docker run -d \
     --name media-tracker \
     -p 3000:3000 \
     -v /path/to/data:/app/data \
     -e TMDB_API_KEY=your_key \
     your-registry/media-tracker:latest
   ```

### Tailscale Access

For remote access via Tailscale:

1. Install Tailscale on your server
2. Connect to your tailnet
3. Access via: `http://media-tracker.tailnet-name.ts.net:3000`

## 🔄 Background Updates

The application runs automated updates every 6 hours:

- **TV Shows**: Fetch latest episode information
- **Movies**: Update upcoming releases
- **Audiobooks**: Check for new releases (future feature)

## 🧪 Testing

```bash
# Run server tests
npm run test --workspace=server

# Run with test data
npm run seed
```

## 🤝 Contributing

1. Fork the repository
2. Create a feature branch
3. Make your changes
4. Add tests
5. Submit a pull request

## 📄 License

MIT License - see [LICENSE](LICENSE) file for details.

## 🙏 Acknowledgments

- [The Movie Database (TMDB)](https://www.themoviedb.org/) for TV/movie data
- [Libation](https://github.com/rmcrackan/Libation) for Audible export format
- [Notion](https://www.notion.so/) for embeddable interface inspiration

## 📞 Support

- **Issues**: [GitHub Issues](https://github.com/your-repo/media-tracker/issues)
- **Discussions**: [GitHub Discussions](https://github.com/your-repo/media-tracker/discussions)

---

**Made with ❤️ for media enthusiasts in Germany**
