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

const jwt = require('./jwt.js');

var AccessControlExtension = require('./accessControl_ext.js');

var AccessControl = function (util, s, d) {
	s3 = new AWS.S3();
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
			deferred.resolve(true);
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
				deferred.resolve(true);
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

AccessControl.prototype.signIn = (params, headers) => {
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

    // WE HAVE USERNAME/PASSWORD
    if((username || email) && password) {
      let identifier = username ? username : email;
      if(identifier) {
        dataAccess.getUserByUserName(identifier)
        .then((usr) => {
          inner_deferred.resolve(usr);
        })
        .fail((usrErr) => {
          inner_deferred.reject(usrErr);
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
    // WE HAVE A TOKEN
    else if(token) {
      let keyUrl = settings.data.identity.key_url || null;
      let kid = settings.data.identity.kid || null;
      jwt.getKey(keyUrl, kid)
      .then((key) => {
        return jwt.verifyToken(token, key);
      })
      .then((decodedToken) => {
        let externalId = decodedToken.sub;
        return dataAccess.getUserByExternalIdentityId(externalId);
      })
      .then((usr) => {
        inner_deferred.resolve(usr);
      })
      .fail((jwtErr) => {
        inner_deferred.reject(jwtErr.AddToError(__filename, 'signin'));
      });
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
      // WE'RE USING EXTERNAL SIGNIN, BUT THIS IS AN ADMIN OR SUPERUSER USING USERNAME/PASSWORD
      else if((userObj.roles.includes('super-user') || userObj.roles.includes('admin-user')) && ((username || email) && password)) {
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
        var errorObj = new ErrorObj(500,
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
    return AccessControl.prototype.startSession(userObj, headers, params.clientInfo);
  })
  .then((sessRes) => {
    deferred.resolve(sessRes);
  })
  .fail((err) => {
    var errorObj = new ErrorObj(401,
                                'ac0100',
                                __filename,
                                'signin',
                                'unauthorized',
                                'invalid credentials',
                                err
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

AccessControl.prototype.startSession = (userObj, headers, clientInfo) => {
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
    return [tkn, dataAccess.saveEntity('session', sessionObj)];
  })
  .spread(function(tkn, newSess) {
    return [tkn, dataAccess.addRelationship(userObj, newSess, null)];
  })
  .spread(function(tkn, rel_res) {
      return [tkn, AccessControl.prototype.validateTokenAndContinue(headers[settings.data.token_header])];
  })
  .spread(function(tkn, validTokenRes) {
      var sess = null;
      if (validTokenRes.is_valid === true && validTokenRes.session.is_anonymous === true && validTokenRes.session.username === 'anonymous') {
          sess = validTokenRes.session;
          sess.username = username;
          return [tkn, true, dataAccess.saveEntity('session', sess)];
      }
      else {
          return [tkn, false];
      }
  })
  .spread(function(tkn, isNewAnonSess, sess) {
      if (isNewAnonSess) {
          return [tkn, dataAccess.addRelationship(userObj, sess)];
      }
      else {
          return [tkn];
      }
  })
  .spread(function(tkn) {
      var returnObj = {};
      returnObj[settings.data.token_header] = tkn;
      var uiKeys = Object.keys(userObj);
      for (var uiIdx = 0; uiIdx < uiKeys.length; uiIdx++) {
          returnObj[uiKeys[uiIdx]] = userObj[uiKeys[uiIdx]];
      }
      delete returnObj.password;
      delete returnObj.salt;
      delete returnObj.id;
      delete returnObj.object_type;
      delete returnObj.created_at;
      delete returnObj.updated_at;
      delete returnObj.forgot_password_tokens;
      delete returnObj.is_active;

      // ADD EVENT TO SESSION
      var resolveObj = returnObj;
      deferred.resolve(resolveObj);
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

AccessControl.prototype.validateToken = function (tkn, callback) {
	var deferred = Q.defer();

	if (tkn === undefined || tkn === null) {
		var errorObj = new ErrorObj(401,
			'ac0005',
			__filename,
			'validateToken',
			'no token provided'
		);
		deferred.reject(errorObj);

		deferred.promise.nodeify(callback);
		return deferred.promise;
	}

	dataAccess.findOne('session', { 'object_type': 'session', 'token': tkn })
  .then(function (find_results) {
    deferred.resolve({is_valid:true, session:find_results});
  })
  .fail(function (err) {
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
  });

	deferred.promise.nodeify(callback);
	return deferred.promise;
};

AccessControl.prototype.validateBasicAuth = function(authHeader, callback) {
  var deferred = Q.defer();

  let [authType, authToken] = authHeader.split(' ');
  if(authType.toLowerCase() === 'basic') {
    let [clientId, clientSecret] = new Buffer(authToken, 'base64').toString().split(':');
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
      })
      .fail((usrErr) => {
        let errorObj = new ErrorObj(401,
          'ac1007',
          __filename,
          'validateBasicAuth',
          'Authentication Error',
          'unauthorized',
          null
        );
        deferred.reject(errorObj);
      })
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

  deferred.promise.nodeify(callback);
  return deferred.promise;
}

AccessControl.prototype.validateBasicAuthAndContinue = function(authHeader, callback) {
  var deferred = Q.defer();

  let [authType, authToken] = authHeader.split(' ');
  if(authType.toLowerCase() === 'basic') {
    let [clientId, clientSecret] = new Buffer(authToken, 'base64').toString().split(':');
    if(clientId && clientSecret) {
      dataAccess.find('bsuser', {client_id: clientId})
      .then((usr) => {
        if(!usr.is_locked) {
          let saltedSecret = clientSecret + usr.salt;
          let hashedClientSecret = crypto.createHash('sha256').update(saltedSecret).digest('hex');
          if(hashedClientSecret === usr.client_secret) {
            // VALID
            deferred.resolve({is_valid: true, client_id: clientId});
          }
          else {
            deferred.resolve({is_valid: false});
          }
        }
        else {
          deferred.resolve({is_valid: false});
        }
      })
      .fail((usrErr) => {
        deferred.resolve({is_valid: false});
      })
    }
    else {
      deferred.resolve({is_valid: false});
    }
  }
  else {
    deferred.resolve({is_valid: false});
  }

  deferred.promise.nodeify(callback);
  return deferred.promise;
}

AccessControl.prototype.validateTokenAndContinue = function (tkn, callback) {
	var deferred = Q.defer();

	if (tkn == null) {
		deferred.resolve({ 'is_valid': false });
	}
	else {
		dataAccess.findOne('session', { 'object_type': 'session', 'token': tkn })
		.then(function (find_results) {
			deferred.resolve({ 'is_valid': true, 'session': find_results });
		})
		.fail(function (err) {
			deferred.resolve({ 'is_valid': false });
		});
	}

	deferred.promise.nodeify(callback);
	return deferred.promise;
};

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

exports.AccessControl = AccessControl;