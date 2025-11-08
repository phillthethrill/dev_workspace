# Use Node.js 18 Alpine for smaller image size
FROM node:18-alpine

# Install SQLite and build dependencies
RUN apk add --no-cache sqlite

# Set working directory
WORKDIR /app

# Copy package files
COPY package*.json ./
COPY server/package*.json ./server/
COPY web/package*.json ./web/

# Install dependencies
RUN npm ci

# Copy source code
COPY server/ ./server/
COPY web/ ./web/

# Build the server
RUN npm run build --workspace=server

# Copy web files to public directory
RUN mkdir -p ./public && cp -r ./web/* ./public/

# Create data directory
RUN mkdir -p ./data

# Expose port
EXPOSE 3000

# Health check
HEALTHCHECK --interval=30s --timeout=3s --start-period=5s --retries=3 \
  CMD curl -f http://localhost:3000/api/health || exit 1

# Start the application
CMD ["npm", "start"]