var Q = require('q');
var crypto = require('crypto');

var dataAccess;
var utilities;
var accessControl;
var serviceRegistration;
var settings;
var models;

var Admin = function (da, util, ac, sr, st, m) {
	dataAccess = da;
	utilities = util;
	accessControl = ac;
	serviceRegistration = sr;
	settings = st;
	models = m;
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

		dataAccess.find('bsuser', searchObj)
			.then(function (userObjs) {
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

		var username = req.query.username.toLowerCase();

		dataAccess.findOne('bsuser', { 'username': username })
			.then(function (userObj) {
				var resolveObj = { 'roles': userObj.roles };
				deferred.resolve(resolveObj);
			})
			.fail(function (err) {
				if (err !== undefined && err !== null && typeof (err.AddToError) == 'function') {
					err.setMessages('error getting user\'s roles', 'Problem getting user roles');
					deferred.reject(err.AddToError(__filename, 'user'));
				}
				else {
					var errorObj = new ErrorObj(404,
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
		var first = (utilities.isNullOrUndefined(req.body.first) ? '' : req.body.first);
		var last = (utilities.isNullOrUndefined(req.body.last) ? '' : req.body.last);
		var roles = (utilities.isNullOrUndefined(req.body.roles) ? ['default-user'] : req.body.roles);
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

			return dataAccess.saveEntity('bsuser', userObj);
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

		var username = req.body.username.toLowerCase();
		var role = req.body.role.toLowerCase();

		accessControl.roleExists(role)
		.then(function() {
			return dataAccess.findOne('bsuser', {'username': username});
		})
		.then(function(userObj) {
			if(userObj.roles.indexOf(role)===-1) {
				userObj.roles.push(role);
				return dataAccess.saveEntity('bsuser', userObj);
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
	}
};

Admin.prototype.put = {

};

Admin.prototype.patch = {
	user: function (req, callback) {
		var deferred = Q.defer();

		var id = req.body.id;
		var username;
		var bIsActive = req.body.is_active;
		if (req.body.username !== undefined) {
			if (utilities.isNullOrUndefined(req.body.username)) {
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

		dataAccess.findOne('bsuser', {'id': req.body.id})
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
			if(buf !== undefined && !utilities.isNullOrUndefined(password)) {
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

			return dataAccess.saveEntity('bsuser', existingUser);
		})
		.then(function(userDbEntity) {
			delete userDbEntity.password;
			delete userDbEntity.salt;

			var resolveObj = userDbEntity;
			deferred.resolve(resolveObj);
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

		dataAccess.findOne('bsuser', { 'id': req.body.id })
			.then(function (user) {
				return dataAccess.deleteEntity('bsuser', user);
			})
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

		var username = req.body.username.toLowerCase();
		var role = req.body.role.toLowerCase();

		accessControl.roleExists(role)
		.then(function() {
			return dataAccess.findOne('bsuser', {'username': username});
		})
		.then(function(userObj) {
			if(userObj.roles.indexOf(role)!==-1) {
				userObj.roles.splice(userObj.roles.indexOf(role), 1);
				return dataAccess.saveEntity('bsuser', userObj);
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
function getUser(req, callback) {
	var deferred = Q.defer();
	var username = req.body.username.toLowerCase();

	//find all lets us get users that have been deleted so we'll loop until we find ours.
	dataAccess.findAll('bsuser')
		.then(function (users) {
			var foundUser = false;
			for (var uIdx = 0; uIdx < users.length; uIdx++) {
				var user = users[uIdx];
				if (user.username.toLowerCase() === username) {
					foundUser = true;
					deferred.resolve(user);
					break;
				}
			}
			if (!foundUser) {
				var errorObj = new ErrorObj(500,
					'a0035',
					__filename,
					'getUser',
					'no user found'
				);
				deferred.reject(errorObj);
			}
		})
		.fail(function (err) {
			if (err !== undefined && err !== null && typeof (err.AddToError) == 'function') {
				deferred.reject(err.AddToError(__filename, 'getUser'));
			}
			else {
				var errorObj = new ErrorObj(500,
					'a1037',
					__filename,
					'getUser',
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

function userExists(req, callback) {
	var deferred = Q.defer();

	getUser(req)
		.then(function () {
			deferred.resolve({ 'user_exists': true });
		})
		.fail(function (err) {
			if (err !== undefined && err !== null && typeof (err.AddToError) == 'function') {
				deferred.reject(err.AddToError(__filename, 'userExists'));
			}
			else {
				var errorObj = new ErrorObj(500,
					'a1038',
					__filename,
					'userExists',
					'error checking that user exists',
					'Error checking that user exists',
					err
				);
				deferred.reject(errorObj);
			}
		});

	deferred.promise.nodeify(callback);
	return deferred.promise;
}

function userDoesNotExist(req, callback) {
	var deferred = Q.defer();
	getUser(req)
		.then(function () {
			var errorObj = new ErrorObj(500,
				'a0036',
				__filename,
				'userDoesNotExist',
				'a user already exists with the information provided'
			);
			deferred.reject(errorObj);
		})
		.fail(function (err) {
			if (err !== undefined && err !== null && typeof (err.AddToError) == 'function') {
				if (err.message === 'no user found' || err.err_code === 'a0035') {
					deferred.resolve({ 'user_not_exist': true });
				}
				else {
					deferred.reject(err.AddToError(__filename, 'userDoesNotExist'));
				}
			}
			else {
				var errorObj = new ErrorObj(500,
					'a1039',
					__filename,
					'userExists',
					'error checking that user does not exist',
					'Error checking that user does not exist',
					err
				);
				deferred.reject(errorObj);
			}
		});

	deferred.promise.nodeify(callback);
	return deferred.promise;
}

exports.admin = Admin;
