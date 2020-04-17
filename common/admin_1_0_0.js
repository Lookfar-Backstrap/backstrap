var Q = require('q');
var crypto = require('crypto');
const fs = require('fs');
const { exec } = require('child_process');

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
	},
	apiBlueprint:function (req, callback) {
		var deferred = Q.defer();
		// var html = (req.query.html) ? req.query.html.toLowerCase() == 'true' : false;
		var apib = 'FORMAT: 1A \n\n';
		var common = endpoints.common;
		var custom = endpoints.custom;
		var project_settings = settings.data;

		apib += '# '+ project_settings.api_name + '\n\n';


		//add common endpoints with apiBlueprint: true flag set
		for (let i = 0; i < common.length; i++) {
			const controller = common[i];
			var include_controller = false;

			for (let j = 0; j < controller.methods.length; j++) {
				const call = controller.methods[j];
				if (call.apiBlueprint == true){
					if(include_controller == false){
						include_controller = true;
						apib += '## '+ controller.name + ' Calls \n' + 'Version: ' + controller.version;
					}
					apib += '\n\n### '+ call.call + ' [' + call.verb + ']\n ' + call.desc + '\n\n'
					apib += '+ Attributes \n'

					// var sample_request = "\n\n+ Request (application/json) \n";
					// var sample_body ={};
					for (let k = 0; k < call.args.length; k++) {
						const argument = call.args[k];
						var sample_val = utilities.isNullOrUndefinedOrZeroLength(argument.apib_sample) ? '' : argument.apib_sample;
						if(Array.isArray(sample_val) || typeof(sample_val) == 'object'){
							sample_val = JSON.stringify(sample_val)
						}
						else if (typeof(sample_val) =="string"){
							sample_val = "\"" + sample_val + "\"";
						}
						if (argument.isRequired == true){

							apib += '    + ' + argument.name + ': ' + sample_val + ' (required, ' + argument.type + ') - ' + argument.description + '\n'

						}
						else {
							apib += '    + ' + argument.name + ': ' + sample_val + ' (' + argument.type + ') - ' + argument.description  + '\n'
						}
						// if(argument.apib_sample){
						// 	sample_body[argument.name] = argument.apib_sample;
						// }					
					}

					// sample_request +=  "\n" + JSON.stringify(sample_body, null, "\n   ") + "\n\n";
					// apib += sample_request;
				}
				
			}
			
		}

		//add custom endpoints
		for (let i = 0; i < custom.length; i++) {
			const controller = custom[i];
			var include_controller = false;

			for (let j = 0; j < controller.methods.length; j++) {
				const call = controller.methods[j];
				if (call.apiBlueprint == true){
					if(include_controller == false){
						include_controller = true;
						apib += '## '+ controller.name + ' Calls \n' + 'Version: ' + controller.version;
					}
					apib += '\n\n### '+ call.call + ' [' + call.verb + ']\n ' + call.desc + '\n\n'
					apib += '+ Attributes \n'
					// var sample_request = "\n\n+ Request (application/json) \n";
					var sample_body ={};
					for (let k = 0; k < call.args.length; k++) {
						const argument = call.args[k];
						var sample_val = utilities.isNullOrUndefinedOrZeroLength(argument.apib_sample) ? '' : argument.apib_sample;
						if(Array.isArray(sample_val) || typeof(sample_val) == 'object'){
							sample_val = JSON.stringify(sample_val)
						}
						else if (typeof(sample_val) =="string"){
							sample_val = "\"" + sample_val + "\"";
						}
						if (argument.isRequired == true){
							apib += '    + ' + argument.name + ': ' + sample_val + ' (required, ' + argument.type + ') - ' + argument.description  + '\n'

						}
						else {
							apib += '    + ' + argument.name + ': ' + sample_val + ' (' + argument.type + ') - ' + argument.description  + '\n'
						}
						// if(argument.apib_sample){
						// 	sample_body[argument.name] = argument.apib_sample;
						// }
					}
					// sample_request +=  "\n" + JSON.stringify(sample_body, null, "\n   ") + "\n\n";
					// apib += sample_request;

				}
				
			}
			
		}

		var options = {
			themeVariables: 'default',
			requireBlueprintName: false
		  };
		


		// write to a new file named 2pac.txt
		fs.writeFile('./blueprint.apib', apib, (err) => {
			// throws an error, you could also catch it here
			if (err) {
				deferred.reject(err)
			};

			dir = exec("snowboard html -o apiboutput.html blueprint.apib", function(err, stdout, stderr) {
				if (err) {
					deferred.reject(err)
				}
				console.log(stderr);
				deferred.resolve(apib)
			});
			
			dir.on('exit', function (code) {
				deferred.resolve(apib)
			});


			// success case, the file was saved
			console.log('blueprint saved!');
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
  },
  resetClientSecret: function(req, callback) {
    var deferred = Q.defer();

    var clientId = req.body.client_id;
    var cryptoCall = Q.denodeify(crypto.randomBytes);

    dataAccess.findOne('bsuser', {client_id: clientId})
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

      return [clientSecret, dataAccess.updateEntity('bsuser', {object_type: 'bsuser', id: usr.id, salt: salt, client_secret: hashedSecret})];
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

		var id = req.body.id;
		var username;
		var bIsActive = req.body.is_active;
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
