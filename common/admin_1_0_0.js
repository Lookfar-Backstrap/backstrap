var Q = require('q');
var crypto = require('crypto');

var dataAccess;
var utilities;
var accessControl;
var serviceRegistration;
var settings;
var models;
var endpoints;


var Admin = function (da, util, ac, sr, st, m, e) {
	dataAccess = da;
	utilities = util;
	accessControl = ac;
	serviceRegistration = sr;
	settings = st;
	models = m;
	endpoints = e;
};

Admin.prototype.get = {
	user: function (req, callback) {
		var deferred = Q.defer();

		var searchObj = {};
		if (req.query.username !== undefined && req.query.username !== null) {
			searchObj.username = req.query.username.toLowerCase();
		}
		if (req.query.id !== undefined && req.query.id !== null) {
			searchObj.id = req.query.id;
		}
		if (req.query.email !== undefined && req.query.email !== null) {
			searchObj.email = req.query.email.toLowerCase();
		}

    // IF THIS NO AGRUMENTS WERE SUPPLIED, GET ALL USERS
    let getUserCmd = null;
    if(searchObj.username || searchObj.id || searchObj.email) {
		  getUserCmd = dataAccess.findUser(searchObj.id, searchObj.username, searchObj.email);
    }
    else {
      getUserCmd = dataAccess.getAllUsers();
    }

    Q(getUserCmd)
    .then(function (findRes) {
      let userObjs = [];
      if(!Array.isArray(findRes)) {
        userObjs.push(findRes);
      }
      else {
        userObjs = findRes;
      }

      var formattedUserObjs = [];
      for (var uIdx = 0; uIdx < userObjs.length; uIdx++) {
        var userObj = userObjs[uIdx];
        delete userObj.password;
        delete userObj.salt;
        formattedUserObjs.push(userObj);
      }

      var resolveObj = formattedUserObjs;
      deferred.resolve(resolveObj);
    })
    .fail(function (err) {
      if (err !== undefined && err !== null && typeof (err.AddToError) == 'function') {
        err.setMessages('error getting user', 'Problem fetching users');
        deferred.reject(err.AddToError(__filename, 'user'));
      }
      else {
        var errorObj = new ErrorObj(500,
          'ad0001',
          __filename,
          'user',
          'error getting user',
          'Error getting user',
          err
        );
        deferred.reject(errorObj);
      }
    });

		deferred.promise.nodeify(callback);
		return deferred.promise;
	},
	// GET A USER'S ROLES
	userRole: function (req, callback) {
		var deferred = Q.defer();

    var uid = req.query.id || null;
		var username = req.query.username ? req.query.username.toLowerCase() : null;
    var email = req.query.email ? req.query.email.toLowerCase() : null;

		dataAccess.findUser(uid, username, email)
    .then(function (userObj) {
      if(userObj) {
        deferred.resolve({'roles': userObj.roles});
      }
      else {
        let errorObj = new ErrorObj(404,
                                    'ad0012',
                                    __filename,
                                    'userRole',
                                    'no user found',
                                    'Error getting user',
                                    null
                                  );
        deferred.reject(errorObj);
      }
    })
    .fail(function (err) {
      if (err !== undefined && err !== null && typeof (err.AddToError) == 'function') {
        err.setMessages('error getting user\'s roles', 'Problem getting user roles');
        deferred.reject(err.AddToError(__filename, 'user'));
      }
      else {
        let errorObj = new ErrorObj(500,
                                    'ad0002',
                                    __filename,
                                    'userRole',
                                    'error getting user',
                                    'Error getting user',
                                    err
                                  );
        deferred.reject(errorObj);
      }
    });

		deferred.promise.nodeify(callback);
		return deferred.promise;
	}
};

Admin.prototype.post = {
	// AMALGAMATION OF POST common/accounts/signup/1.0.0 AND POST common/accounts/profile/1.0.0
	user: function (req, callback) {
		var deferred = Q.defer();

		var username = req.body.username.toLowerCase();
		var password = req.body.password;
		var first = (req.body.first == null ? '' : req.body.first);
		var last = (req.body.last == null ? '' : req.body.last);
		var roles = (req.body.roles == null ? ['default-user'] : req.body.roles);
		var email = req.body.email;
		var userProfile = (req.body.userprofile === undefined || req.body.userprofile === null) ? {} : req.body.userprofile;

		var validEmailRegex = /^(([^<>()\[\]\\.,;:\s@"]+(\.[^<>()\[\]\\.,;:\s@"]+)*)|(".+"))@((\[[0-9]{1,3}\.[0-9]{1,3}\.[0-9]{1,3}\.[0-9]{1,3}])|(([a-zA-Z\-0-9]+\.)+[a-zA-Z]{2,}))$/
		if(!validEmailRegex.test(email)){
			var errorObj = new ErrorObj(500, 
									'a0060', 
									__filename, 
									'signUp', 
									'invalid email address'
									);
			deferred.reject(errorObj);
			deferred.promise.nodeify(callback);
		}

		if (username.indexOf('@') > -1){
			var errorObj = new ErrorObj(500,
									'a0029',
									__filename,
									'signUp',
									'username cannot contain special characters'
									);
			deferred.reject(errorObj);

			deferred.promise.nodeify(callback);
			return deferred.promise;
		}

		utilities.validateEmail(email)
		.then(function(){
			return utilities.validateUsername(username);
		})
		.then(function(){
			var cryptoCall = Q.denodeify(crypto.randomBytes);
			return cryptoCall(48);
		})
		.then(function(buf) {
			var salt = buf.toString('hex');
			var saltedPassword = password + salt;
			var hashedPassword = crypto.createHash('sha256').update(saltedPassword).digest('hex');

			var userObj = {
				'object_type': 'bsuser',
        'id': utilities.getUID(true),
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


			var immutableKeys = ['object_type', 'username', 'salt', 'password', 'created_at', 'modified_at', 'roles', 'is_active'];
			var objKeys  = Object.keys(userProfile);
			for(var idx = 0; idx < objKeys.length; idx++) {
				if(immutableKeys.indexOf(objKeys[idx])===-1) {
					var k = objKeys[idx];
					var v = userProfile[k];
					userObj[k] = v;
				}
			}

			return dataAccess.createUser(userObj);
		})
		.then(function(userDbEntity) {
			delete userDbEntity.password;
			delete userDbEntity.salt;

			var resolveObj = userDbEntity;
			deferred.resolve(resolveObj);
		})
		.fail(function(err) {
			if(err !== undefined && err !== null && typeof(err.AddToError) == 'function') {
				deferred.reject(err.AddToError(__filename, 'signUp'));
			}
			else {
				var errorObj = new ErrorObj(500,
											'ad0010',
											__filename,
											'user',
											'error creating user',
											'Error creating user',
											err
											);
				deferred.reject(errorObj);
			}
		});

		deferred.promise.nodeify(callback);
		return deferred.promise;
	},
	// ADD A USER ROLE TO A USER
	userRole: function (req, callback) {
		var deferred = Q.defer();

    var uid = req.body.user_id;
    var email = req.body.email;
		var username = req.body.username.toLowerCase();
		var role = req.body.role.toLowerCase();

		accessControl.roleExists(role)
		.then(function() {
			return dataAccess.findUser(uid, username, email);
		})
		.then(function(userObj) {
			if(userObj.roles.indexOf(role)===-1) {
				userObj.roles.push(role);
				return dataAccess.updateJsonbField('bsuser', 'data', {roles:userObj.roles}, `data->>'id' = '${userObj.id}'`);
			}
			else {
				var innerPromise = Q.defer();
				innerPromise.resolve(userObj);
				return innerPromise;
			}
		})
		.then(function() {
			var resolveObj = {'success': true};
			deferred.resolve(resolveObj);
		})
		.fail(function(err) {
			if(err !== undefined && err !== null && typeof(err.AddToError) == 'function') {
				if(err.message === 'no results found' || err.err_code === 'da0109') {
					err.setStatus(404);
					err.setMessages('user not found', 'User not found');
				}

				deferred.reject(err.AddToError(__filename, 'userRole'));
			}
			else {
				var errorObj = new ErrorObj(500,
											'ad0003',
											__filename,
											'userRole',
											'error getting user\'s roles',
											'Error getting user\'s roles',
											err
											);
				deferred.reject(errorObj);
			}
		});

		deferred.promise.nodeify(callback);
		return deferred.promise;
  },
  resetClientSecret: function(req, callback) {
    var deferred = Q.defer();

    var clientId = req.body.client_id;
    var cryptoCall = Q.denodeify(crypto.randomBytes);

    dataAccess.getUserByClientId(clientId)
    .then((usr) => {
      return [usr, cryptoCall(24)];
    })
    .spread((usr, buf) => {
      let clientSecret = buf.toString('hex');
      return [usr, clientSecret, cryptoCall(48)];
    })
    .spread((usr, clientSecret, buf) => {
      let salt = buf.toString('hex');
      let saltedSecret = clientSecret + salt;
      let hashedSecret = crypto.createHash('sha256').update(saltedSecret).digest('hex');

      return [clientSecret, dataAccess.updateJsonbField('bsuser', 'data', {salt: salt, client_secret: hashedSecret}, `data->>'id' = '${usr.id}'`)];
    })
    .spread((clientSecret, usr) => {
      deferred.resolve({client_secret: clientSecret});
    })
    .fail((err) => {
      var errorObj = new ErrorObj(500,
                                  'ad0020',
                                  __filename,
                                  'POST resetClientSecret',
                                  'error resetting client secret',
                                  'Error resetting client secret',
                                  err
                              );
      deferred.reject(errorObj);
    });


    deferred.promise.nodeify(callback);
    return deferred.promise;
  }
};

Admin.prototype.put = {

};

Admin.prototype.patch = {
	user: function (req, callback) {
		var deferred = Q.defer();

		var username;
		if (req.body.username !== undefined) {
			if (req.body.username == null) {
				var errorObj = new ErrorObj(500,
					'ad0006',
					__filename,
					'user',
					'cannot delete username',
					'Cannot delete username');
				deferred.reject(errorObj);

				deferred.promise.nodeify(callback);
				return deferred.promise;
			}
			else {
				username = req.body.username.toLowerCase();
			}
		}

		var password = req.body.password;
		var first = (req.body.first === null) ? '' : req.body.first;
		var last = (req.body.last === null) ? '' : req.body.last;
		var roles = (req.body.roles === null) ? ['default-user'] : req.body.roles;
		var email = req.body.email;
		var isLocked = req.body.is_locked;

		var userProfile;
		if (req.body.userprofile !== undefined) {
			userProfile = (req.body.userprofile === null) ? {} : req.body.userprofile;
		}

		if(email){
			var validEmailRegex = /^(([^<>()\[\]\\.,;:\s@"]+(\.[^<>()\[\]\\.,;:\s@"]+)*)|(".+"))@((\[[0-9]{1,3}\.[0-9]{1,3}\.[0-9]{1,3}\.[0-9]{1,3}])|(([a-zA-Z\-0-9]+\.)+[a-zA-Z]{2,}))$/
			if(!validEmailRegex.test(email)){
				var errorObj = new ErrorObj(400, 
										'a0029', 
										__filename, 
										'signUp', 
										'invalid email address'
										);
				deferred.reject(errorObj);
				deferred.promise.nodeify(callback);
				return deferred.promise;
			}
		}

		dataAccess.getUserById(req.body.id)
		.then(function(existingUser) {
			if(username) {
				return [existingUser, utilities.validateUsername(username, existingUser.username)];
			}
			else {
				return [existingUser];
			}
		})
		.spread(function(existingUser){
			if(email) {
				return [existingUser, utilities.validateEmail(email, existingUser.email)];
			}
			else {
				return [existingUser];
			}
		})
		.spread(function(existingUser){
			if(username !== undefined) {
				existingUser.username = username;
			}

			if(password !== undefined) {
				var cryptoCall = Q.denodeify(crypto.randomBytes);
				return [existingUser, cryptoCall(48)];
			}
			else {
				return [existingUser];
			}
		})
		.spread(function(existingUser, buf) {
			if(buf !== undefined && password != null) {
				var salt = buf.toString('hex');
				var saltedPassword = password + salt;
				var hashedPassword = crypto.createHash('sha256').update(saltedPassword).digest('hex');
				existingUser.salt = salt;
				existingUser.password = hashedPassword;
			}

			if(first !== undefined) {
				existingUser.first = first;
			}

			if(last !== undefined) {
				existingUser.last = last;
			}

			if(roles !== undefined) {
				existingUser.roles = roles;
			}

			if(email !== undefined) {
				existingUser.email = email;
			}

			if(isLocked !== undefined) {
				existingUser.is_locked = isLocked;
			}

			var immutableKeys = ['object_type', 'username', 'salt', 'password', 'created_at', 'modified_at', 'roles', 'is_active'];
			var objKeys;
			if(userProfile === undefined) {
				objKeys = [];
			}
			else {
				objKeys = Object.keys(userProfile);
			}
			for(var idx = 0; idx < objKeys.length; idx++) {
				if(immutableKeys.indexOf(objKeys[idx])===-1) {
					var k = objKeys[idx];
					var v = userProfile[k];
					existingUser[k] = v;
				}
			}

      return dataAccess.updateJsonbField('bsuser', 'data', existingUser, `data->>'id' = '${existingUser.id}'`);
		})
		.then(function(userDbEntity) {
      let user = userDbEntity[0] != null ? userDbEntity[0].data : null;
			delete user.password;
			delete user.salt;

			deferred.resolve(user);
		})
		.fail(function(err) {
			if(err !== undefined && err !== null && typeof(err.AddToError) == 'function') {
				err.setMessages('error updating user object', 'Problem updating user object');
				deferred.reject(err.AddToError(__filename, 'user'));
			}
			else {
				var errorObj = new ErrorObj(500,
											'ad0009',
											__filename,
											'user',
											'error updating user object',
											'Error updating user object',
											err
											);
				deferred.reject(errorObj);
			}
		});

		deferred.promise.nodeify(callback);
		return deferred.promise;
	}
};

Admin.prototype.delete = {
	user: function (req, callback) {
		var deferred = Q.defer();

    dataAccess.deleteUser(req.body.id)
    .then(function (del_res) {
      var resolveObj = del_res;
      deferred.resolve(resolveObj);
    })
    .fail(function (err) {
      if (err !== undefined && err !== null && typeof (err.AddToError) == 'function') {
        deferred.reject(err.AddToError(__filename, 'DELETE user'));
      }
      else {
        var errorObj = new ErrorObj(500,
          'ad0005',
          __filename,
          'user',
          'error deleting user',
          'Error deleting user',
          err
        );
        deferred.reject(errorObj);
      }
    });

		deferred.promise.nodeify(callback);
		return deferred.promise;
	},
	// DELETE A USER'S ROLE
	userRole: function (req, callback) {
		var deferred = Q.defer();

    var uid = req.body.user_id;
		var username = req.body.username.toLowerCase();
    var email = req.body.email.toLowerCase();
		var role = req.body.role.toLowerCase();

		accessControl.roleExists(role)
		.then(function() {
			return dataAccess.findUser(uid, username, email);
		})
		.then(function(userObj) {
			if(userObj.roles.indexOf(role)!==-1) {
				userObj.roles.splice(userObj.roles.indexOf(role), 1);
				return dataAccess.updateJsonbField('bsuser', 'data', {roles:userObj.roles}, `data->>'id' = '${userObj.id}'`);
			}
			else {
				var innerPromise = Q.defer();
				innerPromise.resolve(userObj);
				return innerPromise;
			}
		})
		.then(function() {
			var resolveObj = {'success': true};
			deferred.resolve(resolveObj);
		})
		.fail(function(err) {
			if(err !== undefined && err !== null && typeof(err.AddToError) == 'function') {
				if(err.message === 'no results found' || err.err_code === 'da0109') {
					err.setStatus(404);
					err.setMessages('user not found', 'User not found');
				}

				deferred.reject(err.AddToError(__filename, 'userRole'));
			}
			else {
				var errorObj = new ErrorObj(500,
											'ad0004',
											__filename,
											'userRole',
											'error removing user\'s roles',
											'Error removing user\'s roles',
											err
											);
				deferred.reject(errorObj);
			}
		});

		deferred.promise.nodeify(callback);
		return deferred.promise;
	}
};


// ===============================================================
// UTILITY FUNCTIONS
// ===============================================================



exports.admin = Admin;
