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
        let errorObj = new ErrorObj(500,
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

    client.getSigningKey(kid, function(err, key) {
      if(!err) {
        var signingKey = key.publicKey || key.rsaPublicKey;
        deferred.resolve(signingKey);
      }
      else {
        let errorObj = new ErrorObj(500,
                                    'jwt0002',
                                    __filename,
                                    'getKey',
                                    'problem obtaining signing key for auth',
                                    'There was a proble mverifying user\'s identity',
                                    err);
        deferred.reject(errorObj);
      }
    });

    return deferred.promise;
  }
};