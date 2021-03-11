var Q = require('q');
var fs = require('fs');
var crypto = require('crypto');

var securityObj;
var permissions = {
	some: 'some',
	all: 'all'
}
var AWS = require('aws-sdk');
var s3;
var bucket = null;
var file = null;
var remoteSettings = null;
var data = [];
var settings;
var dataAccess;
var utilities;
var authSigningKey;

const jwt = require('./jwt.js');

var AccessControlExtension = require('./accessControl_ext.js');

var AccessControl = function (util, s, d) {
  s3 = new AWS.S3();
  utilities = util;
  settings = s;
  dataAccess = d;

  this.extension = new AccessControlExtension(this, util, s);
};

AccessControl.prototype.init = function (b, f, rs) {
	var ac = this;
	var deferred = Q.defer();

	bucket = b;
	file = f;
	remoteSettings = rs;

	if (remoteSettings == null || remoteSettings === false) {
		try {
			if(file.substring(0,2) !== './') file = './'+file;
			securityObj = require(file);
			AccessControl.prototype.data = securityObj;

      if(settings.data.identity && settings.data.identity.provider && settings.data.identity.provider.toLowerCase() === 'auth0') {
        let keyUrl = settings.data.identity.key_url || null;
        let kid = settings.data.identity.kid || null;
        jwt.getKey(keyUrl, kid)
        .then((key) => {
          authSigningKey = key;
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
	}
	else {
		s3.getObject({ Bucket: bucket, Key: file }, function (err, res) {
			if (!err) {
				securityObj = JSON.parse(res.Body.toString());
				AccessControl.prototype.data = securityObj;
        
        if(settings.data.identity && settings.data.identity.provider && settings.data.identity.provider.toLowerCase() === 'auth0') {
          let keyUrl = settings.data.identity.key_url || null;
          let kid = settings.data.identity.kid || null;
          jwt.getKey(keyUrl, kid)
          .then((key) => {
            authSigningKey = key;
            deferred.resolve(true);
          })
          .fail((keyErr) => {
            let errorObj = new ErrorObj(500,
                                        'ac0021',
                                        __filename,
                                        'init',
                                        'problem getting signing key from auth0',
                                        'Initialization Failure.  Please contact your administrator.',
                                        keyErr);
            deferred.reject(errorObj);
          });
        }
        else {
          deferred.resolve(true);
        }
			}
			else {
				var errorObj = new ErrorObj(500,
					'ac0002',
					__filename,
					'init',
					'error getting file from S3'
				);
				deferred.reject(errorObj);
			}
		});
	}

	return deferred.promise;
}

AccessControl.prototype.createUser = function(userType, params, apiToken, thisUser) {
  var deferred = Q.defer();

  var username = params.username || params.email;
  var email = params.email || null;
  var first = params.first || null;
  var last = params.last || null;
  var password = params.password || null;
  var roles = params.roles || null;
  var exid = params.external_identity_id || null;


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

  var createUserCmd;
  switch(userType) {
    case 'api':
      let uid = null;
      if(thisUser) uid = thisUser.id;
      createUserCmd = createAPIUser(email, first, last, roles, uid);
      break;
    case 'external-api':
      createUserCmd = createExternalAPIUser(email, exid, first, last, roles);
      break;
    default:
      createUserCmd = createStandardUser(username, email, password, exid, first, last, roles, apiToken);
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
                                  __filename,
                                  'createUser',
                                  'create user error',
                                  'There was a problem creating an account.  Please try again.',
                                  err
                                  ));
  });

  return deferred.promise;
}

AccessControl.prototype.signIn = (params, apiToken) => {
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
      let keyUrl = settings.data.identity.key_url || null;
      let kid = settings.data.identity.kid || null;
      jwt.getKey(keyUrl, kid)
      .then((key) => {
        return jwt.verifyToken(token, key);
      })
      .then((decodedToken) => {
        let externalId = decodedToken.sub;
        return dataAccess.getUserByExternalIdentityId(externalId, ['native','external']);
      })
      .then((usr) => {
        inner_deferred.resolve(usr);
      })
      .fail((jwtErr) => {
        inner_deferred.reject(jwtErr.AddToError(__filename, 'signin'));
      });
    }
    // WE HAVE USERNAME/PASSWORD
    else if((username || email) && password) {
      let identifier = username ? username : email;
      if(identifier) {
        dataAccess.getUserByUserName(identifier)
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
    if(settings.data.identity == null || settings.data.identity.length === 0 || 
      (settings.data.identity.provider != null && settings.data.identity.provider.toLowerCase() === 'native')) {
      
      AccessControl.prototype.checkCredentials(password, userObj)
      .then(() => {
        inner_deferred.resolve(userObj);
      })
      .fail((credErr) => {
        // JUST PASS ALONG THE ERROR, WE'LL MARK IT UP IN THE MAIN FAIL BLOCK OF THIS FUNCTION
        inner_deferred.reject(credErr);
      });
    }
    // EXTERNAL SIGNIN -- TOKEN HAS ALREADY BEEN CHECKED, JUST PASS ALONG
    else if(settings.data.identity.provider != null && settings.data.identity.provider.toLowerCase() === 'auth0') {
      if(token) {
        inner_deferred.resolve(userObj)
      }
      // WE'RE USING EXTERNAL SIGNIN, BUT THIS IS A NATIVE ACCOUNT OR AN ADMIN/SUPERUSER USING USERNAME/PASSWORD
      else if((userObj.account_type === 'native' || userObj.roles.includes('super-user') || userObj.roles.includes('admin-user')) && ((username || email) && password)) {
        AccessControl.prototype.checkCredentials(password, userObj)
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
    return [userObj, AccessControl.prototype.startSession(userObj, params.clientInfo)];
  })
  .spread((userObj, newSess) => {
    return [userObj, newSess.token, dataAccess.addRelationship(userObj, newSess, null)];
  })
  .spread((userObj, tkn, rel_res) => {
      return [userObj, tkn, AccessControl.prototype.validateToken(apiToken, true)];
  })
  .spread((userObj, tkn, validTokenRes) => {
      var sess = null;
      if (validTokenRes.is_valid === true && validTokenRes.session.is_anonymous === true && validTokenRes.session.username === 'anonymous') {
          sess = validTokenRes.session;
          sess.username = username;
          return [userObj, tkn, true, dataAccess.saveEntity('session', sess)];
      }
      else {
          return [userObj, tkn, false];
      }
  })
  .spread((userObj, tkn, isNewAnonSess, sess) => {
      if (isNewAnonSess) {
          return [userObj, tkn, dataAccess.addRelationship(userObj, sess)];
      }
      else {
          return [userObj, tkn];
      }
  })
  .spread((userObj, tkn) => {
      var returnObj = {};
      returnObj[settings.data.token_header] = tkn;
      var uiKeys = Object.keys(userObj);
      for (var uiIdx = 0; uiIdx < uiKeys.length; uiIdx++) {
        if(!['password', 'salt', 'object_type', 'created_at', 'updated_at', 'forgot_password_tokens', 'is_active'].includes(uiKeys[uiIdx])) {
          returnObj[uiKeys[uiIdx]] = userObj[uiKeys[uiIdx]];
        }
      }

      deferred.resolve(returnObj);
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

AccessControl.prototype.checkCredentials = (password, userObj) => {
  var deferred = Q.defer();

  // IF USER IS LOCKED, BAIL OUT
  if (userObj.is_locked) {
    var errorObj = new ErrorObj(403,
        'ac0200',
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
  // GOT A USER, MAKE SURE THERE IS A STORED SALT
  var salt = userObj.salt;
  if (salt === null) {
      var errorObj = new ErrorObj(500,
          'a0025',
          __filename,
          'signIn',
          'error retrieving salt for this user'
      );
      deferred.reject(errorObj);
      deferred.promise.nodeify(callback);
      return deferred.promise;
  }
  var stored_password = userObj.password;
  if (stored_password === null) {
      var errorObj = new ErrorObj(500,
          'a0026',
          __filename,
          'signIn',
          'error retrieving password for this user'
      );
      deferred.reject(errorObj);
      deferred.promise.nodeify(callback);
      return deferred.promise;
  }

  // SALT AND HASH PASSWORD
  var saltedPassword = password + userObj.salt;
  var hashedPassword = crypto.createHash('sha256').update(saltedPassword).digest('hex');

  // CHECK IF HASHES MATCH
  if (hashedPassword === stored_password) {
      deferred.resolve();
  }
  else {
    var errorObj = new ErrorObj(401,
                                'a0027',
                                __filename,
                                'signIn',
                                'authentication failed'
                              );
    deferred.reject(errorObj);
  }

  return deferred.promise;
}

AccessControl.prototype.startSession = (userObj, clientInfo) => {
  var deferred = Q.defer();

  getSessionToken()
  .then((tkn) => {
    var rightNow = new Date();
    var sessionObj = {
        'object_type': 'session',
        'token': tkn,
        'username': userObj.username ? userObj.username : userObj.email,
        'user_id': userObj.id,
        'started_at': rightNow,
        'client_info': clientInfo || null,
        'last_touch': rightNow
    };
    return dataAccess.saveEntity('session', sessionObj);
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

AccessControl.prototype.reload = function () {
	var ac = this;
	var deferred = Q.defer();
	ac.init(bucket, file, remoteSettings)
		.then(function (res) {
			deferred.resolve(res);
		})
		.fail(function (err) {
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

AccessControl.prototype.save = function (doNetworkReload) {
	var deferred = Q.defer();
	if (remoteSettings == null || remoteSettings === false) {
		var fswrite = Q.denodeify(fs.writeFile);
		fswrite(file, JSON.stringify(this.data, null, 4))
			.then(function (write_res) {
				deferred.resolve(true);
			})
			.fail(function (err) {
				var errorObj = new ErrorObj(500,
					'ac0004',
					__filename,
					'save',
					'error writing to Security config file'
				);
				deferred.reject(errorObj);
			});
	}
	else {
		s3.putObject({ Bucket: bucket, Key: file, Body: JSON.stringify(this.data, null, 4) }, function (err, save_res) {
			if (!err) {
				if (doNetworkReload === true) {
					settings.reloadNetwork()
						.then(function (reload_res) {
							deferred.resolve(true);
						})
						.fail(function (err) {
							var errorObj = new ErrorObj(500,
								'ac0005',
								__filename,
								'save',
								'error reloading servers',
								err
							);
							deferred.reject(errorObj);
						});
				}
				else {
					deferred.resolve(true);
				}
			}
			else {
				var errorObj = new ErrorObj(500,
					'ac0006',
					__filename,
					'save',
					'error writing Security config file to S3',
					'External error',
					err
				);
				deferred.reject(errorObj);
			}
		});
	}

	return deferred.promise;
};

// ----------------------------------------------------------------
// SESSION TOKENS
// ----------------------------------------------------------------
AccessControl.prototype.validateToken = function (tkn, continueWhenInvalid, callback) {
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

	dataAccess.findOne('session', { 'object_type': 'session', 'token': tkn })
  .then(function (find_results) {
    deferred.resolve({is_valid:true, session:find_results});
  })
  .fail(function (err) {
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
};



// ----------------------------------------------------------------
// BASIC AUTH
// ----------------------------------------------------------------
AccessControl.prototype.validateBasicAuth = function(authHeader, continueWhenInvalid, callback) {
  var deferred = Q.defer();

  let [authType, authToken] = authHeader.split(' ');
  if(authType.toLowerCase() === 'basic') {
    let [clientId, clientSecret] = Buffer.from(authToken, 'base64').toString().split(':');
    if(clientId && clientSecret) {
      dataAccess.findOne('bsuser', {client_id: clientId})
      .then((usr) => {
        if(!usr.is_locked) {
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


// ----------------------------------------------------------------
// JWT
// ----------------------------------------------------------------
AccessControl.prototype.validateJwt = function(authHeader, continueWhenInvalid, callback) {
  var deferred = Q.defer();

  let [authType, authToken] = authHeader.split(' ');
  if(authType.toLowerCase() === 'bearer') {
    jwt.verifyToken(authToken, authSigningKey)
    .then((decodedToken) => {
      let externalId = decodedToken.sub;
      return dataAccess.getUserByExternalIdentityId(externalId, ['external-api']);
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



// ----------------------------------------------------------------
// CHECK ROLES & PERMISSIONS
// ----------------------------------------------------------------
AccessControl.prototype.verifyAccess = function (req, serviceCall, callback) {
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
			for (var allRolesIdx = 0; allRolesIdx < securityObj.roles.length; allRolesIdx++) {
				var securityRole = securityObj.roles[allRolesIdx];

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
};

AccessControl.prototype.roleExists = function (roleName, callback) {
	var deferred = Q.defer();

	roleName = roleName.toLowerCase();
	var allRoles = [];
	for (var rIdx = 0; rIdx < securityObj.roles.length; rIdx++) {
		allRoles.push(securityObj.roles[rIdx].name.toLowerCase());
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
};

AccessControl.prototype.getToken = getSessionToken;

// =====================================================================
// UTILITY FUNCTIONS
// =====================================================================
function createStandardUser(username, email, password = null, exid = null, first = '', last = '', roles, apiToken = null) {
  var deferred = Q.defer();

  var cryptoCall = Q.denodeify(crypto.randomBytes);

  username = username || email;
  roles = roles || ['default-user'];

  utilities.validateEmail(email)
  .then(function() {
      return utilities.validateUsername(username);
  })
  .then(function() {
      var inner_deferred = Q.defer();

      if(username && username !== '' && password && password !== '') {
        cryptoCall(48)
        .then((buf) => {
          var salt = buf.toString('hex');
          var saltedPassword = password + salt;
          var hashedPassword = crypto.createHash('sha256').update(saltedPassword).digest('hex');
          var userObj = {
            'object_type': 'bsuser',
            'account_type': 'native',
            'username': username,
            'first': first,
            'last': last,
            'email': email,
            'salt': salt,
            'password': hashedPassword,
            'roles': roles,
            'is_active': true,
            'is_locked': false
          };
          if(exid) userObj.external_identity_id = exid;
          return dataAccess.saveEntity('bsuser', userObj);
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
          'object_type': 'bsuser',
          'account_type': 'external',
          'username': email,
          'first': first,
          'last': last,
          'email': email,
          'roles': roles,
          'is_active': true,
          'is_locked': false,
          'external_identity_id': exid
        };
        return dataAccess.saveEntity('bsuser', userObj);
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
  .then(function(userObj) {
    return [userObj, AccessControl.prototype.validateToken(apiToken, true)];
  })
  .spread(function(userObj, validTokenRes) {
      var sess;
      if (validTokenRes.is_valid === true && validTokenRes.session.is_anonymous === true && validTokenRes.session.username === 'anonymous') {
          sess = validTokenRes.session;
          sess.username = username;
          return [userObj, true, dataAccess.saveEntity('session', sess)];
      }
      else {
          return [userObj, false];
      }
  })
  .spread(function(userObj, isNewAnonSess, sess) {
      if (isNewAnonSess) {
          return [userObj, dataAccess.addRelationship(sess, userObj)];
      }
      else {
          return [userObj];
      }
  })
  .spread(function(userObj) {
      delete userObj.password;
      delete userObj.salt;

      // ADD EVENT TO SESSION
      var resolveObj = userObj;
      deferred.resolve(resolveObj);
  })
  .fail(function(err) {
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

function createAPIUser(email, first, last, roles, parentAccountId) {
  var deferred = Q.defer();
  
  roles = roles || ['default-user'];
  first = first || '';
  last = last || '';
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
    validateEmailOrSkip = utilities.validateEmail(email);
  }
  
  validateEmailOrSkip
  .then(function() {
      return generateApiUserCreds();
  })
  .then(function(creds) {
      var saltedSecret = creds.clientSecret + creds.salt;
      var hashedSecret = crypto.createHash('sha256').update(saltedSecret).digest('hex');

      var userObj = {
          'object_type': 'bsuser',
          'account_type': 'api',
          'client_id': creds.clientId,
          'first': first,
          'last': last,
          'salt': creds.salt,
          'client_secret': hashedSecret,
          'roles': roles,
          'is_active': true,
          'is_locked': false
      };
      if(parentAccountId) {
        userObj.parent_account_id = parentAccountId;
      }
      else {
        userObj.email = email;
      }
      return [creds.clientSecret, dataAccess.saveEntity('bsuser', userObj)];
  })
  .spread(function(clientSecret, userObj) {
      delete userObj.id;
      delete userObj.salt;
      userObj.client_secret = clientSecret;

      deferred.resolve(userObj);
  })
  .fail(function(err) {
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

function getSessionToken() {
  var deferred = Q.defer();

  // DO A COLLISION CHECK.  THIS IS PROBABLY OVERKILL SINCE OUR TOTAL POOL IS 256^48
  // BUT WE REALLY DON'T WANT TWO SESSIONS WITH THE SAME TOKEN
  dataAccess.findAll('session')
  .then(function(find_results) {
      var tokenIsGood = false;
      var token;
      while (!tokenIsGood) {
          token = crypto.randomBytes(48).toString('hex');

          var sessions = find_results.filter(function(inSysObj) {
              return (inSysObj.object_type === 'session' && inSysObj.token === token);
          });

          if (sessions === null || sessions.length === 0) {
              tokenIsGood = true;
          }
          else {
              tokenIsGood = false;
          }
      }

      deferred.resolve(token);
  })
  .fail(function(err) {
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

function generateApiUserCreds() {
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

function createExternalAPIUser(email, exid, first, last, roles) {
  var deferred = Q.defer();
  
  roles = roles || ['default-user'];
  first = first || '';
  last = last || '';
  email = email || null;
  exud = exid || null;

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

  utilities.validateEmail(email)
  .then(function() {
    let qry = "SELECT data from bsuser where data->>'external_identity_id' = $1";
    let params = [exid];
    return dataAccess.runSql(qry, params);
  })
  .then((usrRes) => {
    if(usrRes.length == 0) {
      var userObj = {
          'object_type': 'bsuser',
          'account_type': 'external-api',
          'first': first,
          'last': last,
          'email': email,
          'roles': roles,
          'external_identity_id': exid,
          'is_active': true,
          'is_locked': false
      };
      return dataAccess.saveEntity('bsuser', userObj);
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
  .then(function(userObj) {
      delete userObj.id;
      deferred.resolve(userObj);
  })
  .fail(function(err) {
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

exports.AccessControl = AccessControl;