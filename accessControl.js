const util = require('util');
const fs = require('fs');
const crypto = require('crypto');

const jwt = require('./jwt.js');

var AccessControlExtension;
try {
  AccessControlExtension = require('../../accessControl_ext.js');
}
catch(e) {
  console.error('INITIALIZATION ERROR -- accessControl_ext.js');
  throw(e);
}

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
    return new Promise((resolve, reject) => {
      this.utilities = util;
      this.settings = s;
      this.dataAccess = d;
      this.extension = new AccessControlExtension(this);
      this.file = f;
      try {
        if(this.file.substring(0,6) !== '../../') this.file = '../../'+this.file;
        let fileData = require(this.file);
        this.roles = fileData['roles'];

        if(this.settings.identity && this.settings.identity.provider && this.settings.identity.provider.toLowerCase() === 'auth0') {
          let keyUrl = this.settings.identity.key_url || null;
          let kid = this.settings.identity.kid || null;
          jwt.getKey(keyUrl, kid)
          .then((key) => {
            this.authSigningKey = key;
            Object.freeze(this);
            resolve(true);
          })
          .catch((keyErr) => {
            let errorObj = new ErrorObj(500,
                                        'ac0020',
                                        __filename,
                                        'init',
                                        'problem getting signing key from auth0',
                                        'Initialization Failure.  Please contact your administrator.',
                                        keyErr);
            reject(errorObj);
          });
        }
        else {
          Object.freeze(this);
          resolve(true);
        }
      }
      catch (e) {
        let errorObj = new ErrorObj(403,
          'ac0001',
          __filename,
          'init',
          'unauthorized',
          'You are not authorized to access this endpoint',
          null);
        reject(errorObj);
      }
    });
  }

  async createUser(userType, params, apiToken, thisUser) {
    return new Promise((resolve, reject) => {
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
          reject(errorObj);
          return;
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
          createUserCmd = createExt(email, exid, roles);
          break;
        default:
          createUserCmd = createStd(username, email, password, exid, roles, apiToken);
      }
    
      createUserCmd
      .then((userObj) => {
        resolve(userObj);
      })
      .catch((err) => {
        typeof(err.AddToError) === 'function' ?
          reject(err.AddToError(__filename, 'createUser'))
        :
          reject(new ErrorObj(500,
                              'ac0300',
                              __this.authSigningKeyname,
                              'createUser',
                              'create user error',
                              'There was a problem creating an account.  Please try again.',
                              err
                              ));
      });
    });
  }

  async signIn(params, apiToken) {
    return new Promise((resolve, reject) => {
      var username = params.username || null;
      var email = params.email || null;
      var password = params.password || null;
      var token = params.token || null;

      // CHECK THE ARGUMENTS PASSED IN AND GET THE USER FROM OUR DB.  
      // IF USERNAME/PASSWORD IS USED, GET THE USER VIA USERNAME
      // IF TOKEN IS USED, CHECK THAT THE TOKEN IS VALID, THEN EXTRACT EXTERNAL ID TO
      // GET THE USER FROM OUR DB
      let initialProcessing = new Promise((ipResolve, ipReject) => {
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
            return this.dataAccess.getUserByExternalIdentityId(externalId, ['native','external']);
          })
          .then((usr) => {
            ipResolve(usr);
          })
          .catch((jwtErr) => {
            ipReject(jwtErr.AddToError(__name, 'signin'));
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
                ipResolve(usr);
              }
              else {
                let errorObj = new ErrorObj(401,
                                            'ac0104',
                                            __filename,
                                            'signin',
                                            'unauthorized',
                                            'invalid credentials'
                                          );
                ipReject(errorObj);
              }
            })
            .catch((usrErr) => {
              let errorObj = new ErrorObj(401,
                                          'ac0105',
                                          __filename,
                                          'signin',
                                          'unauthorized',
                                          'invalid credentials'
                                        );
              ipReject(errorObj);
            })
          }
          else {
            // NO USERNAME
            let errorObj = new ErrorObj(401,
                                        'ac0103',
                                        __filename,
                                        'signin',
                                        'unauthorized',
                                        'invalid credentials'
                                      );
            ipReject(errorObj);
          }
        }
        else {
          let errorObj = new ErrorObj(401,
                                      'ac0102',
                                      __filename,
                                      'signin',
                                      'unauthorized',
                                      'invalid credentials'
                                    );
          ipReject(errorObj);
        }
      });

      initialProcessing
      .then((userObj) => {
        // IF THIS IS A USERNAME/PASSWORD SIGNIN, CHECK THE CREDENTIALS AGAINST OUR DB
        // IF THIS IS A TOKEN SIGNIN, JUST PASS THROUGH
        return new Promise((innerResolve, innerReject) => {
          // NATIVE SIGNIN -- USE OUR DB
          if(this.settings.identity == null || this.settings.identity.length === 0 || 
            (this.settings.identity.provider != null && this.settings.identity.provider.toLowerCase() === 'native')) {
            
            this.checkCredentials(password, userObj)
            .then(() => {
              innerResolve(userObj);
            })
            .catch((credErr) => {
              // JUST PASS ALONG THE ERROR, WE'LL MARK IT UP IN THE MAIN FAIL BLOCK OF THIS FUNCTION
              innerReject(credErr);
            });
          }
          // EXTERNAL SIGNIN -- TOKEN HAS ALREADY BEEN CHECKED, JUST PASS ALONG
          else if(this.settings.identity.provider != null && this.settings.identity.provider.toLowerCase() === 'auth0') {
            if(token) {
              innerResolve(userObj);
            }
            // WE'RE USING EXTERNAL SIGNIN, BUT THIS IS A NATIVE ACCOUNT OR AN ADMIN/SUPERUSER USING USERNAME/PASSWORD
            else if((userObj.account_type === 'native' || userObj.roles.includes('super-user') || userObj.roles.includes('admin-user')) && ((username || email) && password)) {
              this.checkCredentials(password, userObj)
              .then(() => {
                innerResolve(userObj);
              })
              .catch((credErr) => {
                // JUST PASS ALONG THE ERROR, WE'LL MARK IT UP IN THE MAIN FAIL BLOCK OF THIS FUNCTION
                innerReject(credErr);
              });
            }
            else {
              // INSUFFICIENT CREDENTIALS
              let errorObj = new ErrorObj(401,
                                          'ac0103',
                                          __filename,
                                          'signin',
                                          'unauthorized',
                                          'invalid credentials'
                                        );
              innerReject(errorObj);
            }
          }
          else {
            // UNKNOWN IDENTITY PROVIDER
            let errorObj = new ErrorObj(500,
                                        'ac0101',
                                        __filename,
                                        'signin',
                                        'Unknown identity provider',
                                        'Ask your administrator to set up a known identity provider.'
                                      );
            innerReject(errorObj);
          }
        });
      })
      .then((userObj) => {
        // START UP A SESSION
        return Promise.all([userObj, this.startSession(userObj, params.clientInfo)]);
      })
      .then(([userObj, sess]) => {
          return Promise.all([userObj, sess.token, this.validateToken(apiToken, true)]);
      })
      .then(([userObj, tkn, validTokenRes]) => {
          var sess = null;
          if (validTokenRes.is_valid === true && validTokenRes.session.anonymous === true) {
              sess = validTokenRes.session;
              return Promise.all([userObj, tkn, this.dataAccess.attachUserToSession(userObj.id, sess.id)]);
          }
          else {
              return [userObj, tkn];
          }
      })
      .then(([userObj, tkn]) => {
          userObj[this.settings.token_header] = tkn;
          resolve(userObj);
      })
      .catch((err) => {
        let errorObj = new ErrorObj(401,
                                    'ac0100',
                                    __filename,
                                    'signin',
                                    'unauthorized',
                                    'invalid credentials'
                                  );
        reject(errorObj);
      });
    });
  }

  async checkCredentials(password, userObj) {
    return new Promise((resolve, reject) => {
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
        reject(errorObj);
        return;
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
          resolve();
        }
        else {
          var errorObj = new ErrorObj(401,
                                      'a0027',
                                      __filename,
                                      'checkCredentials',
                                      'authentication failed'
                                    );
          reject(errorObj);
        }
      })
      .catch((err) => {
        let errorObj = new ErrorObj(401,
                                    'a0027',
                                    __filename,
                                    'checkCredentials',
                                    'authentication failed'
                                  );
        let eLogObj = JSON.parse(JSON.stringify(errorObj));
        eLogObj.results = err;
        this.utilities.writeErrorToLog(eLogObj);
        reject(errorObj);
      });
    });
  }

  async startSession(userObj, clientInfo) {
    return new Promise((resolve, reject) => {
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
        resolve(newSess);
      })
      .catch((err) => {
        if(err && typeof(err.AddToError) === 'function') {
          reject(err.AddToError(__filename, 'startSession'));
        }
        else {
          let errorObj = new ErrorObj(500,
                                      'ac0200',
                                      __filename,
                                      'startSession',
                                      'error starting session',
                                      'There was a problem with your request. Please try again.',
                                      err
                                    );
          reject(errorObj);
        }
      })
    });
  }

  async reload() {
    var ac = this;
    return new Promise((resolve, reject) => {
      ac.init(this.file)
      .then((res) => {
        resolve(res);
      })
      .catch((err) => {
        let errorObj = new ErrorObj(500,
          'ac0003',
          __filename,
          'reload',
          'error while reloading access control'
        );
        reject(errorObj);
      });
    });
  }

  async save() {
    return new Promise((resolve, reject) => {
      let fileData = { roles: this.roles };
      var fswrite = util.promisify(fs.writeFile);
      fswrite(this.file, JSON.stringify(fileData, null, 4))
      .then((write_res) => {
        resolve(true);
      })
      .catch((err) => {
        let errorObj = new ErrorObj(500,
          'ac0004',
          __filename,
          'save',
          'error writing to Security config file'
        );
        reject(errorObj);
      });
    });
  }

  async validateToken(tkn, continueWhenInvalid) {
    return new Promise((resolve, reject) => {
      if (tkn === undefined || tkn === null) {
        if(continueWhenInvalid) {
          resolve({is_valid: false});
        }
        else {
          var errorObj = new ErrorObj(401,
            'ac0005',
            __filename,
            'validateToken',
            'no token provided'
          );
          reject(errorObj);
        }
        return;
      }
  
      this.dataAccess.getSession(null, tkn)
      .then((sess) => {
        if(sess) {
          resolve({is_valid:true, session:sess});
        }
        else {
          if(continueWhenInvalid) {
            resolve({is_valid: false});
          }
          else {
            let errorObj = new ErrorObj(401,
                                      'ac1005',
                                      __filename,
                                      'validateToken',
                                      'could not find session for this token',
                                      'unauthorized',
                                      null
                                    );
            reject(errorObj);
          }
        }
      })
      .catch((err) => {
        if(continueWhenInvalid) {
          resolve({is_valid: false});
        }
        else {
          if (err !== undefined && err !== null && typeof (err.AddToError) === 'function') {
            err.setStatus(401);
            err.setMessages('could not find session for this token', 'unauthorized');
            reject(err.AddToError(__filename, 'validateToken', 'could not find session for this token'));
          }
          else {
            let errorObj = new ErrorObj(401,
              'ac1004',
              __filename,
              'validateToken',
              'could not find session for this token',
              'unauthorized',
              err
            );
            reject(errorObj);
          }
        }
      });
    });
  }

  async validateBasicAuth(authHeader, continueWhenInvalid) {
    return new Promise((resolve, reject) => {
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
                resolve({is_valid: true, client_id: clientId});
              }
              else {
                if(continueWhenInvalid) {
                  resolve({is_valid: false});
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
                  reject(errorObj);
                }
              }
            }
            else {
              if(continueWhenInvalid) {
                resolve({is_valid: false});
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
                reject(errorObj);
              }
            }
          })
          .catch((usrErr) => {
            if(continueWhenInvalid) {
              resolve({is_valid: false});
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
              reject(errorObj);
            }
          })
        }
        else {
          if(continueWhenInvalid) {
            resolve({is_valid: false});
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
            reject(errorObj);
          }
        }
      }
      else {
        if(continueWhenInvalid) {
          resolve({is_valid: false});
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
          reject(errorObj);
        }
      }
    });
  }

  async validateJwt(authHeader, continueWhenInvalid) {
    return new Promise((resolve, reject) => {
      let [authType, authToken] = authHeader.split(' ');
      if(authType.toLowerCase() === 'bearer') {
        jwt.verifyToken(authToken, this.authSigningKey)
        .then((decodedToken) => {
          let externalId = decodedToken.sub;
          return this.dataAccess.getUserByExternalIdentityId(externalId, ['external-api']);
        })
        .then((usr) => {
          if(usr.is_locked !== true) {
            resolve({is_valid: true, user: usr});
          }
          else {
            if(continueWhenInvalid) {
              resolve({is_valid: false});
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
              reject(errorObj);
            }
          }
        })
        .catch((err) => {
          if(continueWhenInvalid) {
            resolve({is_valid: false});
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
            reject(errorObj);
          }
        })
      }
      else {
        if(continueWhenInvalid) {
          resolve({is_valid: false});
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
          reject(errorObj);
        }
      }
    });
  }

  async verifyAccess(req, serviceCall) {
    return new Promise((resolve, reject) => {
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
        reject(errorObj);
        return;
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
        reject(errorObj);
        return;
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
        resolve(true);
      }
      else {
        let errorObj = new ErrorObj(403,
          'ac0007',
          __filename,
          'verifyAccess',
          'not authorized to use this endpoint'
        );
        reject(errorObj);
      }
    });
  }

  async roleExists(roleName) {
    return new Promise((resolve, reject) => {
      roleName = roleName.toLowerCase();
      var allRoles = [];
      for (var rIdx = 0; rIdx < this.roles.length; rIdx++) {
        allRoles.push(this.roles[rIdx].name.toLowerCase());
      }

      if (allRoles.indexOf(roleName) !== -1) {
        resolve(true);
      }
      else {
        var errorObj = new ErrorObj(404,
          'ac0008',
          __filename,
          'roleExists',
          'role not found'
        );
        reject(errorObj);
      }
    });
  }

  async getToken() {
    return this.#getSessionToken();
  }
  
  async #getSessionToken() {
    return new Promise((resolve, reject) => {
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

          resolve(token);
      })
      .catch((err) => {
          if (err !== undefined && err !== null && typeof (err.AddToError) == 'function') {
              if (err.message === 'no results found') {
                  var token = crypto.randomBytes(48).toString('hex');
                  resolve(token);
              }
              else {
                  reject(err.AddToError(__filename, 'getToken'));
              }
          }
          else {
              let errorObj = new ErrorObj(500,
                  'ac1000',
                  __filename,
                  'getToken',
                  'error getting token',
                  'Error getting token',
                  err
              );
              reject(errorObj);
          }
      });
    });
  }

  async #createStandardUser(username, email, password = null, exid = null, roles, apiToken = null) {
    return new Promise((resolve, reject) => {
      var cryptoCall = util.promisify(crypto.randomBytes);

      username = username || email;
      roles = roles || ['default-user'];

      this.utilities.validateEmail(email)
      .then(() => {
        return this.utilities.validateUsername(username);
      })
      .then(() => {
        return  new Promise((innerResolve, innerReject) => {
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
              innerResolve(usr);
            })
            .catch((innerErr) => {
              innerReject(innerErr)
            })
          }
          else {
            innerReject(new ErrorObj(400,
                                    'ac0350',
                                    __filename,
                                    'createStandardUser',
                                    'insufficient data to create user',
                                    'You must provide username/email & password or an external identity provider id',
                                    null));
          }
        })
      })
      .then((userObj) => {
        return Promise.all([userObj, this.validateToken(apiToken, true)]);
      })
      .then(([userObj, validTokenRes]) => {
          var sess;
          if (validTokenRes.is_valid === true && validTokenRes.session.is_anonymous === true) {
              sess = validTokenRes.session;
              return Promise.all([userObj, this.dataAccess.attachUserToSession(userObj, sess)]);
          }
          else {
              return [userObj, false];
          }
      })
      .then(([userObj, isNewAnonSess, sessRes]) => {
          if (isNewAnonSess) {
            let sess = sessRes[0] ? sessRes[0].data : null;
            return Promise.all([userObj, this.dataAccess.attachUserToSession(userObj, sess)]);
          }
          else {
            return [userObj];
          }
      })
      .then(([userObj]) => {
          delete userObj.password;
          delete userObj.salt;

          // ADD EVENT TO SESSION
          var resolveObj = userObj;
          resolve(resolveObj);
      })
      .catch((err) => {
          if (err !== undefined && err !== null && typeof (err.AddToError) == 'function') {
            reject(err.AddToError(__filename, 'createStandardUser'));
          }
          else {
            let errorObj = new ErrorObj(500,
                                        'ac0330',
                                        __filename,
                                        'createStandardUser',
                                        'error signing up',
                                        'Error',
                                        err
                                    );
            reject(errorObj);
          }
      });
    });
  }

  async #createAPIUser(email, roles, parentAccountId) {
    return new Promise((resolve, reject) => {
      roles = roles || ['default-user'];
      email = email || null;

      let validateEmailOrSkip;
      if(parentAccountId) {
        validateEmailOrSkip = Promise.resolve(null);
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
            reject(errorObj);
            return;
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
          return Promise.all([creds.clientSecret, nextCmd]);
      })
      .then(([clientSecret, userOrCreds]) => {
          if(clientSecret) userOrCreds.client_secret = clientSecret;
          if(userOrCreds.hasOwnProperty('email')) {
            delete userOrCreds.id;
            delete userOrCreds.salt;
            
            resolve(userOrCreds);
          }
          else {
            resolve({client_id: userOrCreds.client_id, client_secret: userOrCreds.client_secret});
          }
      })
      .catch((err) => {
          if (err !== undefined && err !== null && typeof (err.AddToError) == 'function') {
              reject(err.AddToError(__filename, 'createAPIUser'));
          }
          else {
              let errorObj = new ErrorObj(500,
                                          'ac0332',
                                          __filename,
                                          'POST apiUser',
                                          'error signing up api user',
                                          'Error creating new api user',
                                          err
                                      );
              reject(errorObj);
          }
      });
    });
  }

  async #generateApiUserCreds() {
    return new Promise((resolve, reject) => {
      var cryptoCall = util.promisify(crypto.randomBytes);
      cryptoCall(12)
      .then((buf) => {
        let clientId = buf.toString('hex');
        return Promise.all([clientId, cryptoCall(24)]);
      })
      .then(([clientId, buf]) => {
        let clientSecret = buf.toString('hex');
        return Promise.all([clientId, clientSecret, cryptoCall(48)]);
      })
      .then(([clientId, clientSecret, buf]) => {
        let salt = buf.toString('hex');
        resolve({clientId: clientId, clientSecret: clientSecret, salt: salt});
      })
      .catch((err) => {
        let errorObj = new ErrorObj(500,
                                  'a1050',
                                  __filename,
                                  'generateApiUserCreds',
                                  'error generating credentials for api user',
                                  'Error generating credentials for api user',
                                  err
                                  );
        reject(errorObj);
      });
    });
  }

  async #createExternalAPIUser(email, exid, roles) {
    return new Promise((resolve, reject) => {
      roles = roles || ['default-user'];
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
          reject(errorObj);
          return;
      }
      if(exid == null) {
        let errorObj = new ErrorObj(500,
                                    'ac0433',
                                    __filename,
                                    'createExternalAPIUser',
                                    'no external identifier'
                                  );
        reject(errorObj);
        return;
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
          let errorObj = new ErrorObj(500,
                                        'ac0435',
                                        __filename,
                                        'createExternalUser',
                                        'a user already exists with that external id',
                                        'This external identifier is assigned to another user',
                                        null
                                      );
          reject(errorObj);
          return;
        }
      })
      .then((userObj) => {
          delete userObj.id;
          resolve(userObj);
      })
      .catch((err) => {
          if (err !== undefined && err !== null && typeof (err.AddToError) == 'function') {
              reject(err.AddToError(__filename, 'createExternalUser'));
          }
          else {
              let errorObj = new ErrorObj(500,
                                          'ac0432',
                                          __filename,
                                          'createExternalUser',
                                          'error signing up external user',
                                          'Error creating new api user',
                                          err
                                      );
              reject(errorObj);
          }
      });
    });
  }
}

const instance = new AccessControl();
module.exports = instance;