module.exports = {
  apps: [
    {
      name: 'media-tracker-server',
      script: 'server/dist/index.js',
      instances: 'max',
      exec_mode: 'cluster',
      
      // Resource management
      max_memory_restart: '512M',
      min_uptime: '10s',
      max_restarts: 5,
      
      // Environment
      env: {
        NODE_ENV: 'production',
        PORT: 3000,
        HOST: '0.0.0.0'
      },
      env_staging: {
        NODE_ENV: 'staging',
        PORT: 3000,
        HOST: '0.0.0.0'
      },
      
      // Performance optimization
      node_args: '--max-old-space-size=512',
      
      // Auto restart conditions
      autorestart: true,
      watch: false,
      ignore_watch: [
        'node_modules',
        'logs',
        'data',
        'uploads'
      ],
      
      // Health monitoring
      health_check_url: 'http://localhost:3000/health',
      health_check_grace_period: 3000,
      
      // Log management
      log_file: './logs/combined.log',
      out_file: './logs/out.log',
      error_file: './logs/error.log',
      log_date_format: 'YYYY-MM-DD HH:mm:ss Z',
      merge_logs: true,
      
      // Advanced features
      instance_var: 'INSTANCE_ID',
      
      // Memory and CPU optimization
      kill_timeout: 5000,
      listen_timeout: 3000,
      
      // Monitoring
      pmx: true,
      automation: true
    }
  ],
  
  // Deployment configuration
  deploy: {
    production: {
      user: 'deploy',
      host: ['your-server.com'],
      ref: 'origin/main',
      repo: 'git@github.com:yourusername/universal-media-tracker.git',
      path: '/var/www/media-tracker',
      'pre-deploy-local': '',
      'post-deploy': 'npm install && npm run build && pm2 reload ecosystem.config.js --env production',
      'pre-setup': ''
    },
    staging: {
      user: 'deploy',
      host: ['staging-server.com'],
      ref: 'origin/develop',
      repo: 'git@github.com:yourusername/universal-media-tracker.git',
      path: '/var/www/media-tracker-staging',
      'post-deploy': 'npm install && npm run build && pm2 reload ecosystem.config.js --env staging'
    }
  }
};