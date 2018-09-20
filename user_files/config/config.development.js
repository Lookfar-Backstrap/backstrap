module.exports = {
  db: {
    user: process.env.DB_USER || '[YOUR DB USER]',
    name: process.env.DB_NAME || '[YOUR DB NAME]',
    pass: process.env.DB_PASS || '[YOUR DB PASSWORD]',
    host: process.env.DB_HOST || 'localhost',
    port: process.env.DB_PORT || '5432'
  },
  s3: {
  	bucket: '[YOUR BUCKET]'
  }
};
