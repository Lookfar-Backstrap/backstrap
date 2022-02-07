const jwt = require('jsonwebtoken');
const jwks = require('jwks-rsa');

const baseOptions = {algorithms: ['RS256']}
module.exports = {
  verifyToken: (tkn, pubKey) => {
    return new Promise((resolve, reject) => {
      jwt.verify(tkn, pubKey, baseOptions, (err, decoded) => {
        if(!err) {
          resolve(decoded);
        }
        else {
          let errorObj = new ErrorObj(500,
                                      'jwt0001',
                                      __filename,
                                      'verifyToken',
                                      'error verifying token',
                                      'There was a problem verifying user\'s identity',
                                      err);
          reject(err);
        }
      })
    });
  },
  getKey: (url, kid) => {
    return new Promise((resolve, reject) => {
      var client = jwks({
        jwksUri: url
      });
  
      client.getSigningKey(kid, function(err, key) {
        if(!err) {
          var signingKey = key.publicKey || key.rsaPublicKey;
          resolve(signingKey);
        }
        else {
          let errorObj = new ErrorObj(500,
                                      'jwt0002',
                                      __filename,
                                      'getKey',
                                      'problem obtaining signing key for auth',
                                      'There was a proble mverifying user\'s identity',
                                      err);
          reject(errorObj);
        }
      });
    });
  }
};