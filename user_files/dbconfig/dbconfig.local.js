module.exports = {
  db: {
    user: process.env.DB_USER || 'backstrap_user',
    name: process.env.DB_NAME || 'backstrap',
    pass: process.env.DB_PASS || 'bs4u',
    host: process.env.DB_HOST || 'localhost',
    port: process.env.DB_PORT || '5432'
  }
};