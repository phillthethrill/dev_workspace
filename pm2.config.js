module.exports = {
  apps: [{
    name: 'media-tracker',
    script: 'dist/index.js',
    cwd: './server',
    instances: 1,
    exec_mode: 'fork',
    env: {
      NODE_ENV: 'development',
      PORT: 3000,
      TZ: 'Europe/Berlin'
    },
    env_production: {
      NODE_ENV: 'production',
      PORT: 3000,
      TZ: 'Europe/Berlin'
    },
    error_file: './logs/err.log',
    out_file: './logs/out.log',
    log_file: './logs/combined.log',
    time: true,
    watch: false,
    max_memory_restart: '1G',
    restart_delay: 4000,
    autorestart: true,
    // Development mode
    ignore_watch: ['node_modules', 'dist', 'logs'],
    watch_options: {
      followSymlinks: false
    }
  }]
};