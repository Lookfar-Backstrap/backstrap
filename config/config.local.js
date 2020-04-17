module.exports = {
  db: {
    user: process.env.DB_USER || '[YOUR DB USER HERE]',
    name: process.env.DB_NAME || '[YOUR DB NAME HERE]',
    pass: process.env.DB_PASS || '[YOUR DB PASSWORD HERE]',
    host: process.env.DB_HOST || 'localhost',
    port: process.env.DB_PORT || '5432'
  },
  s3: {
    bucket: '[YOUR BUCKET HERE]'
  }
};