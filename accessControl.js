var Q = require('q');
var fs = require('fs');
var crypto = require('crypto');

const jwt = require('./jwt.js');
var AccessControlExtension = require('./accessControl_ext.js');

const permissions = {
	some: 'some',
	all: 'all'
}

class AccessControl {
  constructor() {
    this.utilities = null;
    this.settings = null;
    this.dataAccess = null;
    this.roles = null;
    this.file = null;
    this.authSigningKey = null;
    this.extension = null;
  }

  init(util, s, d, f) {
    var deferred = Q.defer();

    this.utilities = util;
    this.settings = s;
    this.dataAccess = d;
    this.extension = new AccessControlExtension(this);
    this.file = f;
    try {
      if(this.file.substring(0,2) !== './') this.file = './'+this.file;
      let fileData = require(this.file);
      this.roles = fileData['roles'];

      if(this.settings.identity && this.settings.identity.provider && this.settings.identity.provider.toLowerCase() === 'auth0') {
        let keyUrl = this.settings.identity.key_url || null;
        let kid = this.settings.identity.kid || null;
        jwt.getKey(keyUrl, kid)
        .then((key) => {
          this.authSigningKey = key;
          Object.freeze(this);
          deferred.resolve(true);
        })
        .fail((keyErr) => {
          let errorObj = new ErrorObj(500,
                                      'ac0020',
                                      __filename,
                                      'init',
                                      'problem getting signing key from auth0',
                                      'Initialization Failure.  Please contact your administrator.',
                                      keyErr);
          deferred.reject(errorObj);
        });
      }
      else {
        Object.freeze(this);
        deferred.resolve(true);
      }
    }
    catch (e) {
      var errorObj = new ErrorObj(403,
        'ac0001',
        __filename,
        'init',
        'unauthorized',
        'You are not authorized to access this endpoint',
        null);
      deferred.reject(errorObj);
    }

    return deferred.promise;
  }

  createUser(userType, params, apiToken, thisUser) {
    var deferred = Q.defer();
  
    if(params) {
      var username = params.username || params.email;
      var email = params.email || null;
      var password = params.password || null;
      var roles = params.roles || null;
      var exid = params.external_id || null;
    }
  
  
    if(userType !== 'api' || thisUser == null) {
      var validEmailRegex = /^(([^<>()\[\]\\.,;:\s@"]+(\.[^<>()\[\]\\.,;:\s@"]+)*)|(".+"))@((\[[0-9]{1,3}\.[0-9]{1,3}\.[0-9]{1,3}\.[0-9]{1,3}])|(([a-zA-Z\-0-9]+\.)+[a-zA-Z]{2,}))$/
      if (email == null || !validEmailRegex.test(email)) {
        var errorObj = new ErrorObj(500,
            'ac0329',
            __filename,
            'createUser',
            'invalid email address'
        );
        deferred.reject(errorObj);
        return deferred.promise;
      }
    }

    const createAPI = this.#createAPIUser.bind(this);
    const createExt = this.#createExternalAPIUser.bind(this);
    const createStd = this.#createStandardUser.bind(this);
  
    var createUserCmd;
    switch(userType) {
      case 'api':
        let uid = null;
        if(thisUser) uid = thisUser.id;
        createUserCmd = createAPI(email, roles, uid);
        break;
      case 'external-api':
        createUserCmd = createExt(email, exid, first, last, roles);
        break;
      default:
        createUserCmd = createStd(username, email, password, exid, roles, apiToken);
    }
  
    createUserCmd
    .then((userObj) => {
      deferred.resolve(userObj);
    })
    .fail((err) => {
      typeof(err.AddToError) === 'function' ?
        deferred.reject(err.AddToError(__filename, 'createUser'))
      :
        deferred.reject(new ErrorObj(500,
                                    'ac0300',
                                    __this.authSigningKeyname,
                                    'createUser',
                                    'create user error',
                                    'There was a problem creating an account.  Please try again.',
                                    err
                                    ));
    });
  
    return deferred.promise;
  }

  signIn(params, apiToken) {
    var deferred = Q.defer();

    var username = params.username || null;
    var email = params.email || null;
    var password = params.password || null;
    var token = params.token || null;
    

    Q()
    .then(() => {
      // CHECK THE ARGUMENTS PASSED IN AND GET THE USER FROM OUR DB.  
      // IF USERNAME/PASSWORD IS USED, GET THE USER VIA USERNAME
      // IF TOKEN IS USED, CHECK THAT THE TOKEN IS VALID, THEN EXTRACT EXTERNAL ID TO
      // GET THE USER FROM OUR DB
      let inner_deferred = Q.defer();

      // WE HAVE A TOKEN
      if(token) {
        let keyUrl = this.settings.identity.key_url || null;
        let kid = this.settings.identity.kid || null;
        jwt.getKey(keyUrl, kid)
        .then((key) => {
          return jwt.verifyToken(token, key);
        })
        .then((decodedToken) => {
          let externalId = decodedToken.sub;
          return this.dataAccessgetUserByExternalIdentityId(externalId, ['native','external']);
        })
        .then((usr) => {
          inner_deferred.resolve(usr);
        })
        .fail((jwtErr) => {
          inner_deferred.reject(jwtErr.AddToError(__name, 'signin'));
        });
      }
      // WE HAVE USERNAME/PASSWORD
      else if((username || email) && password) {
        let identifier = username ? username : email;
        if(identifier) {
          this.dataAccess.getUserByUserName(identifier)
          .then((usr) => {
            // ONLY ADMINS AND SUPERUSERS CAN LOG IN WITH USER/PASSWORD IN NON-NATIVE ACCOUNTS (API USERS DON'T SIGN IN)
            if(['native'].includes(usr.account_type) || usr.roles.includes('super-user') || usr.roles.includes('admin-user')) {
              inner_deferred.resolve(usr);
            }
            else {
              var errorObj = new ErrorObj(401,
                                          'ac0104',
                                          __filename,
                                          'signin',
                                          'unauthorized',
                                          'invalid credentials'
                                        );
              inner_deferred.reject(errorObj);
            }
          })
          .fail((usrErr) => {
            var errorObj = new ErrorObj(401,
                                        'ac0105',
                                        __filename,
                                        'signin',
                                        'unauthorized',
                                        'invalid credentials'
                                      );
            inner_deferred.reject(errorObj);
          })
        }
        else {
          // NO USERNAME
          var errorObj = new ErrorObj(401,
                                      'ac0103',
                                      __filename,
                                      'signin',
                                      'unauthorized',
                                      'invalid credentials'
                                    );
          inner_deferred.reject(errorObj);
        }
      }
      else {
        var errorObj = new ErrorObj(401,
                                    'ac0102',
                                    __filename,
                                    'signin',
                                    'unauthorized',
                                    'invalid credentials'
                                  );
        inner_deferred.reject(errorObj);
      }

      return inner_deferred.promise;
    })
    .then((userObj) => {
      // IF THIS IS A USERNAME/PASSWORD SIGNIN, CHECK THE CREDENTIALS AGAINST OUR DB
      // IF THIS IS A TOKEN SIGNIN, JUST PASS THROUGH
      var inner_deferred = Q.defer();

      // NATIVE SIGNIN -- USE OUR DB
      if(this.settings.identity == null || this.settings.identity.length === 0 || 
        (this.settings.identity.provider != null && this.settings.identity.provider.toLowerCase() === 'native')) {
        
        this.checkCredentials(password, userObj)
        .then(() => {
          inner_deferred.resolve(userObj);
        })
        .fail((credErr) => {
          // JUST PASS ALONG THE ERROR, WE'LL MARK IT UP IN THE MAIN FAIL BLOCK OF THIS FUNCTION
          inner_deferred.reject(credErr);
        });
      }
      // EXTERNAL SIGNIN -- TOKEN HAS ALREADY BEEN CHECKED, JUST PASS ALONG
      else if(this.settings.identity.provider != null && this.settings.identity.provider.toLowerCase() === 'auth0') {
        if(token) {
          inner_deferred.resolve(userObj)
        }
        // WE'RE USING EXTERNAL SIGNIN, BUT THIS IS A NATIVE ACCOUNT OR AN ADMIN/SUPERUSER USING USERNAME/PASSWORD
        else if((userObj.account_type === 'native' || userObj.roles.includes('super-user') || userObj.roles.includes('admin-user')) && ((username || email) && password)) {
          this.checkCredentials(password, userObj)
          .then(() => {
            inner_deferred.resolve(userObj);
          })
          .fail((credErr) => {
            // JUST PASS ALONG THE ERROR, WE'LL MARK IT UP IN THE MAIN FAIL BLOCK OF THIS FUNCTION
            inner_deferred.reject(credErr);
          });
        }
        else {
          // INSUFFICIENT CREDENTIALS
          var errorObj = new ErrorObj(401,
                                      'ac0103',
                                      __filename,
                                      'signin',
                                      'unauthorized',
                                      'invalid credentials'
                                    );
          inner_deferred.reject(errorObj);
        }
      }
      else {
        // UNKNOWN IDENTITY PROVIDER
        var errorObj = new ErrorObj(500,
                                    'ac0101',
                                    __filename,
                                    'signin',
                                    'Unknown identity provider',
                                    'Ask your administrator to set up a known identity provider.'
                                  );
        inner_deferred.reject(errorObj);
      }

      return inner_deferred.promise;
    })
    .then((userObj) => {
      // START UP A SESSION
      return [userObj, this.startSession(userObj, params.clientInfo)];
    })
    .spread((userObj, sess) => {
        return [userObj, sess.token, this.validateToken(apiToken, true)];
    })
    .spread((userObj, tkn, validTokenRes) => {
        var sess = null;
        if (validTokenRes.is_valid === true && validTokenRes.session.anonymous === true) {
            sess = validTokenRes.session;

            return [userObj, tkn, this.dataAccess.attachUserToSession(userObj.id, sess.id)];
        }
        else {
            return [userObj, tkn];
        }
    })
    .spread((userObj, tkn) => {
        userObj[this.settings.token_header] = tkn;
        deferred.resolve(userObj);
    })
    .fail((err) => {
      var errorObj = new ErrorObj(401,
                                  'ac0100',
                                  __filename,
                                  'signin',
                                  'unauthorized',
                                  'invalid credentials'
                                );
      deferred.reject(errorObj);
    });

    return deferred.promise;
  }

  checkCredentials(password, userObj) {
    var deferred = Q.defer();

    // IF USER IS LOCKED, BAIL OUT
    if (userObj.is_locked) {
      var errorObj = new ErrorObj(403,
          'ac0300',
          __filename,
          'signin',
          'Account is locked',
          'Unauthorized',
          null
      );
      deferred.reject(errorObj);

      deferred.promise.nodeify(callback);
      return deferred.promise;
    }
    // GOT A USER, GRAB THE ACTIVE CREDS
    this.dataAccess.getCredentialsForUser(userObj.id)
    .then((credRes) => {
      let foundValidCreds = false;
      for(let cIdx = 0; cIdx < credRes.length; cIdx++) {
        let curCred = credRes[cIdx];
        if(curCred.password != null && curCred.salt != null) {
          let salt = curCred.salt;
          let stored_password = curCred.password;

          // SALT AND HASH PASSWORD
          var saltedPassword = password + salt;
          var hashedPassword = crypto.createHash('sha256').update(saltedPassword).digest('hex');

          // CHECK IF HASHES MATCH
          if (hashedPassword === stored_password) {
              foundValidCreds = true;
              break;
          }
        }
      }
      if(foundValidCreds) {
        deferred.resolve();
      }
      else {
        var errorObj = new ErrorObj(401,
                                    'a0027',
                                    __filename,
                                    'checkCredentials',
                                    'authentication failed'
                                  );
        deferred.reject(errorObj);
      }
    })
    .fail((err) => {
      let errorObj = new ErrorObj(401,
                                  'a0027',
                                  __filename,
                                  'checkCredentials',
                                  'authentication failed'
                                );
      let eLogObj = JSON.parse(JSON.stringify(errorObj));
      eLogObj.results = err;
      this.utilities.writeErrorToLog(eLogObj);
      deferred.reject(errorObj);
    });

    return deferred.promise;
  }

  startSession(userObj, clientInfo) {
    var deferred = Q.defer();

    this.#getSessionToken()
    .then((tkn) => {
      if(userObj != null) {
        return this.dataAccess.startSession(tkn, userObj.id, clientInfo, false);
      }
      else {
        return this.dataAccess.startSession(tkn, null, clientInfo, true);
      }
    })
    .then((newSess) => {
      deferred.resolve(newSess);
    })
    .fail((err) => {
      if(err && typeof(err.AddToError) === 'function') {
        deferred.reject(err.AddToError(__filename, 'startSession'));
      }
      else {
        var errorObj = new ErrorObj(500,
                                    'ac0200',
                                    __filename,
                                    'startSession',
                                    'error starting session',
                                    'There was a problem with your request. Please try again.',
                                    err
                                  );
        deferred.reject(errorObj);
      }
    })

    return deferred.promise;
  }

  reload() {
    var ac = this;
    var deferred = Q.defer();
    ac.init(this.file)
    .then((res) => {
      deferred.resolve(res);
    })
    .fail((err) => {
      var errorObj = new ErrorObj(500,
        'ac0003',
        __filename,
        'reload',
        'error while reloading access control'
      );
      deferred.reject(errorObj);
    });
    return deferred.promise;
  }

  save() {
    var deferred = Q.defer();
    let fileData = { roles: this.roles };
    var fswrite = Q.denodeify(fs.writeFile);
    fswrite(this.file, JSON.stringify(fileData, null, 4))
      .then((write_res) => {
        deferred.resolve(true);
      })
      .fail((err) => {
        var errorObj = new ErrorObj(500,
          'ac0004',
          __filename,
          'save',
          'error writing to Security config file'
        );
        deferred.reject(errorObj);
      });

    return deferred.promise;
  }

  validateToken(tkn, continueWhenInvalid, callback) {
    var deferred = Q.defer();

    if (tkn === undefined || tkn === null) {
      if(continueWhenInvalid) {
        deferred.resolve({is_valid: false});
      }
      else {
        var errorObj = new ErrorObj(401,
          'ac0005',
          __filename,
          'validateToken',
          'no token provided'
        );
        deferred.reject(errorObj);
      }

      deferred.promise.nodeify(callback);
      return deferred.promise;
    }

    this.dataAccess.getSession(null, tkn)
    .then((sess) => {
      if(sess) {
        deferred.resolve({is_valid:true, session:sess});
      }
      else {
        if(continueWhenInvalid) {
          deferred.resolve({is_valid: false});
        }
        else {
          var errorObj = new ErrorObj(401,
                                    'ac1005',
                                    __filename,
                                    'validateToken',
                                    'could not find session for this token',
                                    'unauthorized',
                                    err
                                  );
          deferred.reject(errorObj);
        }
      }
    })
    .fail((err) => {
      if(continueWhenInvalid) {
        deferred.resolve({is_valid: false});
      }
      else {
        if (err !== undefined && err !== null && typeof (err.AddToError) === 'function') {
          err.setStatus(401);
          err.setMessages('could not find session for this token', 'unauthorized');
          deferred.reject(err.AddToError(__filename, 'validateToken', 'could not find session for this token'));
        }
        else {
          var errorObj = new ErrorObj(401,
            'ac1004',
            __filename,
            'validateToken',
            'could not find session for this token',
            'unauthorized',
            err
          );
          deferred.reject(errorObj);
        }
      }
    });

    deferred.promise.nodeify(callback);
    return deferred.promise;
  }

  validateBasicAuth(authHeader, continueWhenInvalid, callback) {
    var deferred = Q.defer();

    let [authType, authToken] = authHeader.split(' ');
    if(authType.toLowerCase() === 'basic') {
      let [clientId, clientSecret] = Buffer.from(authToken, 'base64').toString().split(':');
      if(clientId && clientSecret) {
        this.dataAccess.getUserByClientId(clientId, true)
        .then((usr) => {
          if(!usr.locked) {
            let saltedSecret = clientSecret + usr.salt;
            let hashedClientSecret = crypto.createHash('sha256').update(saltedSecret).digest('hex');
            if(hashedClientSecret === usr.client_secret) {
              // VALID
              deferred.resolve({is_valid: true, client_id: clientId});
            }
            else {
              if(continueWhenInvalid) {
                deferred.resolve({is_valid: false});
              }
              else {
                let errorObj = new ErrorObj(401,
                                            'ac1009',
                                            __filename,
                                            'validateBasicAuth',
                                            'Authentication Error',
                                            'unauthorized',
                                            null
                                          );
                deferred.reject(errorObj);
              }
            }
          }
          else {
            if(continueWhenInvalid) {
              deferred.resolve({is_valid: false});
            }
            else {
              let errorObj = new ErrorObj(401,
                'ac1008',
                __filename,
                'validateBasicAuth',
                'User is locked',
                'unauthorized',
                null
              );
              deferred.reject(errorObj);
            }
          }
        })
        .fail((usrErr) => {
          if(continueWhenInvalid) {
            deferred.resolve({is_valid: false});
          }
          else {
            let errorObj = new ErrorObj(401,
              'ac1007',
              __filename,
              'validateBasicAuth',
              'Authentication Error',
              'unauthorized',
              null
            );
            deferred.reject(errorObj);
          }
        })
      }
      else {
        if(continueWhenInvalid) {
          deferred.resolve({is_valid: false});
        }
        else {
          let errorObj = new ErrorObj(401,
            'ac1006',
            __filename,
            'validateBasicAuth',
            'Malformed basic auth',
            'unauthorized',
            null
          );
          deferred.reject(errorObj);
        }
      }
    }
    else {
      if(continueWhenInvalid) {
        deferred.resolve({is_valid: false});
      }
      else {
        let errorObj = new ErrorObj(401,
          'ac1005',
          __filename,
          'validateBasicAuth',
          'Malformed basic auth',
          'unauthorized',
          null
        );
        deferred.reject(errorObj);
      }
    }

    deferred.promise.nodeify(callback);
    return deferred.promise;
  }

  validateJwt(authHeader, continueWhenInvalid, callback) {
    var deferred = Q.defer();

    let [authType, authToken] = authHeader.split(' ');
    if(authType.toLowerCase() === 'bearer') {
      jwt.verifyToken(authToken, this.authSigningKey)
      .then((decodedToken) => {
        let externalId = decodedToken.sub;
        return this.dataAccess.getUserByExternalIdentityId(externalId, ['external-api']);
      })
      .then((usr) => {
        if(usr.is_locked !== true) {
          deferred.resolve({is_valid: true, user: usr});
        }
        else {
          if(continueWhenInvalid) {
            deferred.resolve({is_valid: false});
          }
          else {
            let errorObj = new ErrorObj(401,
              'ac1108',
              __filename,
              'validateJwt',
              'User is locked',
              'unauthorized',
              null
            );
            deferred.reject(errorObj);
          }
        }
      })
      .fail((err) => {
        if(continueWhenInvalid) {
          deferred.resolve({is_valid: false});
        }
        else {
          let errorObj = new ErrorObj(401,
            'ac1107',
            __filename,
            'validateJwt',
            'Authentication Error',
            'unauthorized',
            err
          );
          deferred.reject(errorObj);
        }
      })
    }
    else {
      if(continueWhenInvalid) {
        deferred.resolve({is_valid: false});
      }
      else {
        let errorObj = new ErrorObj(401,
          'ac1105',
          __filename,
          'validateJwt',
          'Malformed bearer auth',
          'unauthorized',
          null
        );
        deferred.reject(errorObj);
      }
    }

    deferred.promise.nodeify(callback);
    return deferred.promise;
  }

  verifyAccess(req, serviceCall, callback) {
    var deferred = Q.defer();
    var userObj = req.this_user;
    if(userObj == null) {
      let errorObj = new ErrorObj(403, 
                                  'ac0010', 
                                  __filename, 
                                  'verifyAccess', 
                                  'no user object found on the request',
                                  'Unauthorized',
                                  null 
                                  );
      deferred.reject(errorObj);

      deferred.promise.nodeify(callback);
      return deferred.promise;
    }

    if(userObj.is_locked) {
      let errorObj = new ErrorObj(403, 
                                  'ac0009', 
                                  __filename, 
                                  'verifyAccess', 
                                  'bsuser is locked',
                                  'Unauthorized',
                                  null 
                                  );
      deferred.reject(errorObj);
      
      deferred.promise.nodeify(callback);
      return deferred.promise;
    }
    var accessGranted = false;
    if (userObj.hasOwnProperty('roles')) {
      userRolesLoop:
      for (var roleIdx = 0; roleIdx < userObj.roles.length; roleIdx++) {
        var userRole = userObj.roles[roleIdx];
        allRolesLoop:
        for (var allRolesIdx = 0; allRolesIdx < this.roles.length; allRolesIdx++) {
          var securityRole = this.roles[allRolesIdx];

          if (userRole === securityRole.name) {

            areasLoop:
            for (var areaIdx = 0; areaIdx < securityRole.areas.length; areaIdx++) {
              var area = securityRole.areas[areaIdx];
              if (area.name === serviceCall.area) {
                if (area.permission === permissions.all) {
                  accessGranted = true;
                  break userRolesLoop;
                }
                else if (area.permission == permissions.some) {

                  routeLoop:
                  for (var routeIdx = 0; routeIdx < area.validRoutes.length; routeIdx++) {
                    var route = area.validRoutes[routeIdx];

                    if (route.controller === serviceCall.controller && route.version === serviceCall.version) {
                      if (route.permission === permissions.all) {
                        accessGranted = true;
                        break userRolesLoop;
                      }
                      else if (route.permission === permissions.some) {

                        methodLoop:
                        for (var methodIdx = 0; methodIdx < route.methods.length; methodIdx++) {
                          var method = route.methods[methodIdx];
                          if (method.verb === serviceCall.verb && method.call === serviceCall.call) {
                            accessGranted = true;
                            break userRolesLoop;
                          }
                        }
                      }
                    }
                  }
                }
              }
            }
          }
        }
      }
    }
    else {
      // FAILURE
    }

    if (accessGranted) {
      deferred.resolve(true);
    }
    else {
      let errorObj = new ErrorObj(403,
        'ac0007',
        __filename,
        'verifyAccess',
        'not authorized to use this endpoint'
      );
      deferred.reject(errorObj);
    }

    deferred.promise.nodeify(callback);
    return deferred.promise;
  }

  roleExists(roleName, callback) {
    var deferred = Q.defer();

    roleName = roleName.toLowerCase();
    var allRoles = [];
    for (var rIdx = 0; rIdx < this.roles.length; rIdx++) {
      allRoles.push(this.roles[rIdx].name.toLowerCase());
    }

    if (allRoles.indexOf(roleName) !== -1) {
      deferred.resolve(true);
    }
    else {
      var errorObj = new ErrorObj(404,
        'ac0008',
        __filename,
        'roleExists',
        'role not found'
      );
      deferred.reject(errorObj);
    }

    deferred.promise.nodeify(callback);
    return deferred.promise;
  }

  getToken() {
    return this.#getSessionToken();
  }
  
  #getSessionToken() {
    var deferred = Q.defer();

    // DO A COLLISION CHECK.  THIS IS PROBABLY OVERKILL SINCE OUR TOTAL POOL IS 256^48
    // BUT WE REALLY DON'T WANT TWO SESSIONS WITH THE SAME TOKEN
    this.dataAccess.getActiveTokens()
    .then((tokens) => {
        var tokenIsGood = false;
        var token;
        while (!tokenIsGood) {
            token = crypto.randomBytes(48).toString('hex');

            var sessions = tokens.filter(tkn => tkn === token);

            if (sessions === null || sessions.length === 0) {
                tokenIsGood = true;
            }
            else {
                tokenIsGood = false;
            }
        }

        deferred.resolve(token);
    })
    .fail((err) => {
        if (err !== undefined && err !== null && typeof (err.AddToError) == 'function') {
            if (err.message === 'no results found') {
                var token = crypto.randomBytes(48).toString('hex');
                deferred.resolve(token);
            }
            else {
                deferred.reject(err.AddToError(__filename, 'getToken'));
            }
        }
        else {
            var errorObj = new ErrorObj(500,
                'ac1000',
                __filename,
                'getToken',
                'error getting token',
                'Error getting token',
                err
            );
            deferred.reject(errorObj);
        }
    });

    return deferred.promise;
  }

  #createStandardUser(username, email, password = null, exid = null, roles, apiToken = null) {
    var deferred = Q.defer();

    var cryptoCall = Q.denodeify(crypto.randomBytes);

    username = username || email;
    roles = roles || ['default-user'];

    this.utilities.validateEmail(email)
    .then(() => {
        return this.utilities.validateUsername(username);
    })
    .then(() => {
        var inner_deferred = Q.defer();

        if(username && username !== '' && password && password !== '') {
          cryptoCall(48)
          .then((buf) => {
            var salt = buf.toString('hex');
            var saltedPassword = password + salt;
            var hashedPassword = crypto.createHash('sha256').update(saltedPassword).digest('hex');
            var userObj = {
              'account_type': 'native',
              'username': username,
              'email': email,
              'salt': salt,
              'password': hashedPassword,
              'roles': roles
            };
            if(exid) userObj.external_identity_id = exid;
            
            return this.dataAccess.createUser(userObj);
          })
          .then((usr) => {
            inner_deferred.resolve(usr);
          })
          .fail((innerErr) => {
            inner_deferred.reject(innerErr)
          })
        }
        else if(exid) {
          var userObj = {
            'account_type': 'external',
            'username': email,
            'email': email,
            'roles': roles,
            'locked': false,
            'external_id': exid
          };
          return this.dataAccess.createUser(userObj);
        }
        else {
          inner_deferred.reject(new ErrorObj(400,
                                              'ac0350',
                                              __filename,
                                              'createStandardUser',
                                              'insufficient data to create user',
                                              'You must provide username/email & password or an external identity provider id',
                                              null));
        }

        return inner_deferred.promise;
    })
    .then((userObj) => {
      return [userObj, this.validateToken(apiToken, true)];
    })
    .spread((userObj, validTokenRes) => {
        var sess;
        if (validTokenRes.is_valid === true && validTokenRes.session.is_anonymous === true && validTokenRes.session.username === 'anonymous') {
            sess = validTokenRes.session;
            sess.username = username;
            return [userObj, true, this.dataAccess.updateJsonbField('session', 'data', sess, `data->>'id' = '${sess.id}'`)];
        }
        else {
            return [userObj, false];
        }
    })
    .spread((userObj, isNewAnonSess, sessRes) => {
        if (isNewAnonSess) {
          let sess = sessRes[0] ? sessRes[0].data : null;
          return [userObj, this.dataAccess.attachUserToSession(userObj, sess)];
        }
        else {
          return [userObj];
        }
    })
    .spread((userObj) => {
        delete userObj.password;
        delete userObj.salt;

        // ADD EVENT TO SESSION
        var resolveObj = userObj;
        deferred.resolve(resolveObj);
    })
    .fail((err) => {
        if (err !== undefined && err !== null && typeof (err.AddToError) == 'function') {
            deferred.reject(err.AddToError(__filename, 'createStandardUser'));
        }
        else {
            var errorObj = new ErrorObj(500,
                'ac0330',
                __filename,
                'createStandardUser',
                'error signing up',
                'Error',
                err
            );
            deferred.reject(errorObj);
        }
    });

    return deferred.promise;
  }

  #createAPIUser(email, roles, parentAccountId) {
    var deferred = Q.defer();
  
    roles = roles || ['default-user'];
    email = email || null;

    let validateEmailOrSkip;
    if(parentAccountId) {
      validateEmailOrSkip = Q(null);
    }
    else {
      var validEmailRegex = /^(([^<>()\[\]\\.,;:\s@"]+(\.[^<>()\[\]\\.,;:\s@"]+)*)|(".+"))@((\[[0-9]{1,3}\.[0-9]{1,3}\.[0-9]{1,3}\.[0-9]{1,3}])|(([a-zA-Z\-0-9]+\.)+[a-zA-Z]{2,}))$/
      if (!validEmailRegex.test(email)) {
          var errorObj = new ErrorObj(500,
              'ac0331',
              __filename,
              'createAPIUser',
              'no parent account & invalid email address'
          );
          deferred.reject(errorObj);
          deferred.promise.nodeify(callback);
          return deferred.promise;
      }
      validateEmailOrSkip = this.utilities.validateEmail(email);
    }
    
    validateEmailOrSkip
    .then(() => {
        return this.#generateApiUserCreds();
    })
    .then((creds) => {
        var saltedSecret = creds.clientSecret + creds.salt;
        var hashedSecret = crypto.createHash('sha256').update(saltedSecret).digest('hex');

        let nextCmd;
        if(parentAccountId){
          nextCmd = this.dataAccess.saveApiCredentials(creds.clientId, creds.salt, hashedSecret, parentAccountId);
        }
        else {
          var userObj = {
            'account_type': 'api',
            'email': email,
            'client_id': creds.clientId,
            'salt': creds.salt,
            'client_secret': hashedSecret,
            'roles': roles,
            'locked': false
          };
          nextCmd = this.dataAccess.createUser(userObj);
        }
        return [creds.clientSecret, nextCmd];
    })
    .spread((clientSecret, userOrCreds) => {
        if(clientSecret) userOrCreds.client_secret = clientSecret;
        if(userOrCreds.hasOwnProperty('email')) {
          delete userOrCreds.id;
          delete userOrCreds.salt;
          
          deferred.resolve(userOrCreds);
        }
        else {
          deferred.resolve({client_id: userOrCreds.client_id, client_secret: userOrCreds.client_secret});
        }
    })
    .fail((err) => {
        if (err !== undefined && err !== null && typeof (err.AddToError) == 'function') {
            deferred.reject(err.AddToError(__filename, 'createAPIUser'));
        }
        else {
            var errorObj = new ErrorObj(500,
                'ac0332',
                __filename,
                'POST apiUser',
                'error signing up api user',
                'Error creating new api user',
                err
            );
            deferred.reject(errorObj);
        }
    });

    return deferred.promise;
  }

  #generateApiUserCreds() {
    var deferred = Q.defer();

    var cryptoCall = Q.denodeify(crypto.randomBytes);
    cryptoCall(12)
    .then((buf) => {
      let clientId = buf.toString('hex');
      return [clientId, cryptoCall(24)];
    })
    .spread((clientId, buf) => {
      let clientSecret = buf.toString('hex');
      return [clientId, clientSecret, cryptoCall(48)];
    })
    .spread((clientId, clientSecret, buf) => {
      let salt = buf.toString('hex');
      deferred.resolve({clientId: clientId, clientSecret: clientSecret, salt: salt});
    })
    .fail((err) => {
      var errorObj = new ErrorObj(500,
                                'a1050',
                                __filename,
                                'generateApiUserCreds',
                                'error generating credentials for api user',
                                'Error generating credentials for api user',
                                err
                                );
      deferred.reject(errorObj);
    });

    return deferred.promise;
  }

  #createExternalAPIUser(email, exid, first, last, roles) {
    var deferred = Q.defer();
  
    roles = roles || ['default-user'];
    first = first || '';
    last = last || '';
    email = email || null;
    exid = exid || null;

    var validEmailRegex = /^(([^<>()\[\]\\.,;:\s@"]+(\.[^<>()\[\]\\.,;:\s@"]+)*)|(".+"))@((\[[0-9]{1,3}\.[0-9]{1,3}\.[0-9]{1,3}\.[0-9]{1,3}])|(([a-zA-Z\-0-9]+\.)+[a-zA-Z]{2,}))$/
    if (!validEmailRegex.test(email)) {
        var errorObj = new ErrorObj(500,
            'ac0431',
            __filename,
            'createExternalAPIUser',
            'invalid email address'
        );
        deferred.reject(errorObj);
        deferred.promise.nodeify(callback);
        return deferred.promise;
    }
    if(exid == null) {
      var errorObj = new ErrorObj(500,
                                  'ac0433',
                                  __filename,
                                  'createExternalAPIUser',
                                  'no external identifier'
                                );
      deferred.reject(errorObj);
      deferred.promise.nodeify(callback);
      return deferred.promise;
    }

    this.utilities.validateEmail(email)
    .then(() => {
      let qry = "SELECT COUNT(*) FROM bs3_users WHERE external_id = $1 AND deleted_at IS NULL";
      let params = [exid];
      return this.dataAccess.runSql(qry, params);
    })
    .then((usrRes) => {
      if(usrRes[0].count == 0) {
        var userObj = {
            'account_type': 'external-api',
            'email': email,
            'roles': roles,
            'external_id': exid,
            'is_locked': false
        };
        return this.dataAccess.createUser(userObj);
      }
      else {
        var errorObj = new ErrorObj(500,
                                      'ac0435',
                                      __filename,
                                      'createExternalUser',
                                      'a user already exists with that external id',
                                      'This external identifier is assigned to another user',
                                      null
                                    );
        deferred.reject(errorObj);
        deferred.promise.nodeify(callback);
        return deferred.promise;
      }
    })
    .then((userObj) => {
        delete userObj.id;
        deferred.resolve(userObj);
    })
    .fail((err) => {
        if (err !== undefined && err !== null && typeof (err.AddToError) == 'function') {
            deferred.reject(err.AddToError(__filename, 'createExternalUser'));
        }
        else {
            var errorObj = new ErrorObj(500,
                'ac0432',
                __filename,
                'createExternalUser',
                'error signing up external user',
                'Error creating new api user',
                err
            );
            deferred.reject(errorObj);
        }
    });

    return deferred.promise;
  }
}

const instance = new AccessControl();
// Object.freeze(instance);
module.exports = instance;