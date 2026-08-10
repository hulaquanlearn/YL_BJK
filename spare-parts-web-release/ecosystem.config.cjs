module.exports = {
  apps: [
    {
      name: 'spare-parts-web',
      script: 'server.js',
      cwd: __dirname,
      instances: 1,
      autorestart: true,
      max_memory_restart: '300M',
      env: {
        NODE_ENV: 'production',
        PORT: 8503,
        API_TARGET: 'http://127.0.0.1:3000'
      }
    }
  ]
}
