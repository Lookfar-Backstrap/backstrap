var Q = require('q');
var fs = require('fs');
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

var AccessControlExtension = require('./accessControl_ext.js');

var AccessControl = function (util, s) {
	s3 = new AWS.S3();
	settings = s;

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

AccessControl.prototype.verifyAccess = function (req, serviceCall, callback) {
	var deferred = Q.defer();
  var userObj = req.this_user;
  if(userObj == null) {
    var errorObj = new ErrorObj(403, 
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

	if(userObj == null || userObj.is_locked) {
		var errorObj = new ErrorObj(403, 
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
		var errorObj = new ErrorObj(403,
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

exports.AccessControl = AccessControl;