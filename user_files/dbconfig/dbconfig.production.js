module.exports = {
  db: {
    host: process.env.DB_HOST,
    port: process.env.DB_PORT,
    user: process.env.DB_USER,
    pass: process.env.DB_PASS,
    name: process.env.DB_NAME,
    ssl: {
      ca: process.env.DB_SSL_CA || null,
      key: process.env.DB_SSL_KEY || null,
      cert: process.env.DB_SSL_CERT || null
    }
  },
  s3: {
    bucket: '[YOUR BUCKET HERE]'
  }
}