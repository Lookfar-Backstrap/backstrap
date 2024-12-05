module.exports = {
  db: {
    user: process.env.DB_USER || '[YOUR DB USER HERE]',
    name: process.env.DB_NAME || '[YOUR DB NAME HERE]',
    pass: process.env.DB_PASS || '[YOUR DB PASSWORD HERE]',
    host: process.env.DB_HOST || 'localhost',
    port: process.env.DB_PORT || '5432',
    ssl: {
      ca: process.env.DB_SSL_CA || null,
      key: process.env.DB_SSL_KEY || null,
      cert: process.env.DB_SSL_CERT || null
    }
  }
};