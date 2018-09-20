module.exports = {
  //Auto-populated by Elastic Beanstalk from RDS on environment setup
  db: {
   host: process.env.RDS_HOSTNAME,
   port: process.env.RDS_PORT,
   user: process.env.RDS_USERNAME,
   pass: process.env.RDS_PASSWORD,
   name: process.env.RDS_DB_NAME 
  },
  s3: {
    bucket: '[YOUR BUCKET]'
  }
}
