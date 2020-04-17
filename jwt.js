const Q = require('q');
const jwt = require('jsonwebtoken');
const jwks = require('jwks-rsa');

const baseOptions = {algorithms: ['RS256']}
module.exports = {
  verifyToken: (tkn, pubKey) => {
    var deferred = Q.defer();

    jwt.verify(tkn, pubKey, baseOptions, (err, decoded) => {
      if(!err) {
        deferred.resolve(decoded);
      }
      else {
        let errorObj = new errorObj(500,
                                    'jwt0001',
                                    __filename,
                                    'verifyToken',
                                    'error verifying token',
                                    'There was a problem verifying user\'s identity',
                                    err);
        deferred.reject(err);
      }
    })

    return deferred.promise;
  },
  getKey: (url, kid) => {
    var deferred = Q.defer();

    var client = jwks({
      jwksUri: url
    });

    client.getSigningKey(null, function(err, key) {
      var signingKey = key.publicKey || key.rsaPublicKey;
      deferred.resolve(signingKey);
    });

    return deferred.promise;
  }
};