// ==================================================================
// SERVICE REGISTRATION
// ==================================================================
// Service Registration handles loading, processing, and validation
// of endpoints and arguments.  Works in tandem with endpoints.js
// ==================================================================

var dataAccess;
var endpoints;
var Q = require('q');
var moment = require('moment');
var base64 = require('./base64.js');

// CONSTRUCTOR
var ServiceRegistration = function(db, e) {
	dataAccess = db;
	endpoints = e;
};

// ServiceRegistration.prototype.reload = function() {
	// var deferred = Q.defer();

	// endpoints.reload()
	// .then(function(reload_res) {
	// 	deferred.resolve(true);
	// })
	// .fail(function(err) {
	// 	if(err !== undefined && err !== null && typeof(err.AddToError) === 'function') {
	// 		deferred.reject(err.AddToError(__filename, 'reload'));
	// 	}
	// 	else {
	// 		var errorObj = new ErrorObj(500, 
	// 									'sr1001', 
	// 									__filename, 
	// 									'reload', 
	// 									'error reloading ServiceRegistration',
	// 									'Error reloading configs',
	// 									err
	// 									);
	// 		deferred.reject(errorObj);
	// 	}
	// });

	// return deferred.promise;
// };

// ====================================
// CREATE A NEW ENDPOINT
// ====================================
ServiceRegistration.prototype.registerServiceCall = function(call, area, controller, verb, version, args, authRequired, description, callback) {
	var deferred = Q.defer();

	// -------------------------------------------------------------------
	// VALIDATE THAT WE HAVE ALL THE INFO NECESSARY TO CREATE AN ENDPOINT
	// -------------------------------------------------------------------
	var isValid = true;
	var invalidArgs = [];
	if(call===null) {
		invalidArgs.push('call');
		isValid = false;
	}
	if(area===null) {
		invalidArgs.push('area');
		isValid = false;
	}
	if(controller===null) {
		invalidArgs.push('controller');
		isValid = false;
	}
	if(verb===null) {
		invalidArgs.push('verb');
		isValid = false;
	}
	if(version===null) {
		invalidArgs.push('version');
		isValid = false;
	}
	if(authRequired===null) {
		authRequired = false;
	}

  // MISSING REQUIRED ARGS TO CREATE AN ENDPOINT
	if(isValid===false) {
		var errorObj = new ErrorObj(500, 
									'sr0001', 
									__filename, 
									'registerServiceCall', 
									'invalid args',
									'Invalid args',
									invalidArgs
									);
		deferred.reject(errorObj);
	}
	else {
		verb = verb.toUpperCase();

    // CHECK IF WE HAVE ALREADY CREATED THIS ENDPOINT
		this.serviceCallExists(call, area, controller, verb, version)
		.then(function() {
			var errorObj = new ErrorObj(500, 
										'sr0002', 
										__filename, 
										'registerServiceCall', 
										'duplicate service call'
										);
			deferred.reject(errorObj);
		})
		.fail(function(err) {
			if(err != null &&
        (err.message==='no matching controller found' ||
				err.message==='no matching area found' ||
				err.message==='no matching method found')) {
				var areas = Object.getOwnPropertyNames(endpoints.data);
				// NO AREA IN ENDPOINTS FILE
				if(areas.indexOf(area) === -1) {
					endpoints.data[area] = [{
						'name': controller,
						'version': version,
						'methods': [
							{
								'verb': verb,
								'call': call,
								'desc': description,
								'authRequired': authRequired,
								'args': args,
								'isUserCreated': true
							}
						]
					}];
				}
				// FOUND THE AREA, CHECK FOR CONTROLLER/VERSION
				else {
					var controllers = endpoints.data[area];
					var foundController = false;
					for(var cIdx = 0; cIdx < controllers.length; cIdx++) {
						if(controllers[cIdx].name.toLowerCase() === controller.toLowerCase() &&
							controllers[cIdx].version === version) {
							// FOUND THE CONTROLLER, ADD THE METHOD
							controllers[cIdx].methods.push({
								'verb': verb,
								'call': call,
								'desc': description,
								'authRequired': authRequired,
								'args': args,
								'isUserCreated': true
							});

							foundController = true
							break;
						}
					}
					if(!foundController) {
						// GOT THE AREA, BUT NO CONTROLLER
						// ADD A CONTROLLER AND THE METHOD
						var controllerObj = {
							'name': controller,
							'version': version,
							'methods': [
								{
									'verb': verb,
									'call': call,
									'desc': description,
									'authRequired': authRequired,
									'args': args,
									'isUserCreated': true
								}
							]
						};
						endpoints.data[area].push(controllerObj);
					}
				}

				// WRITE TO FILE
				endpoints.save(true)
				.then(function(save_res) {
					deferred.resolve(save_res);
				})
				.fail(function(err) {
					if(err !== undefined && err !== null && typeof(err.AddToError) === 'function') {
						deferred.reject(err.AddToError(__filename, 'registerServiceCall'));
					}
					else {
						var errorObj = new ErrorObj(500, 
													'sr1002', 
													__filename, 
													'registerServiceCall', 
													'error saving endpoints config',
													'Error saving endpoints config',
													err
													);
						deferred.reject(errorObj);
					}
				});
			}
			else {
				if(err != null && typeof(err.AddToError) === 'function') {
					deferred.reject(err.AddToError(__filename, 'registerServiceCall'));
				}
				else {
					var errorObj = new ErrorObj(500, 
												'sr1003', 
												__filename, 
												'registerServiceCall', 
												'error registering service call',
												'Error registering service call',
												err
												);
					deferred.reject(errorObj);
				}
			}
		});
	}

	deferred.promise.nodeify(callback);
	return deferred.promise;
};

// ====================================
// UPDATE ENDPOINT
// ====================================
ServiceRegistration.prototype.updateServiceCall = function(call, area, controller, verb, version, args, authRequired, description, callback) {
	var deferred = Q.defer();

	this.serviceCallExists(call, area, controller, verb, version)
	.then(function() {
		var updatedMethod = false;
		var controllers = endpoints.data[area];
		for(var cIdx = 0; cIdx < controllers.length; cIdx++) {
			if(controllers[cIdx].name.toLowerCase() === controller.toLowerCase() &&
				controllers[cIdx].version === version) {
				// FOUND THE CONTROLLER, DELETE THE METHOD
				for(var mIdx = 0; mIdx < controllers[cIdx].methods.length; mIdx++) {
					var method = controllers[cIdx].methods[mIdx];
					if(method.verb.toLowerCase() === verb.toLowerCase() &&
						method.call.toLowerCase() === call.toLowerCase()) {
						if(args !== undefined) {
							method.args = args;
						}
						if(authRequired !== undefined) {
							method.authRequired = authRequired;
						}
						if(description !== undefined) {
							method.description = description;
						}

						updatedMethod = true;

						break;
					}
				}

				break;
			}
		}
		if(updatedMethod) {
			// WRITE TO FILE
			endpoints.save(true)
			.then(function(save_res) {
				deferred.resolve(save_res);
			})
			.fail(function(err) {
				if(err !== undefined && err !== null && typeof(err.AddToError) === 'function') {
					deferred.reject(err.AddToError(__filename, 'updateServiceCall'));
				}
				else {
					var errorObj = new ErrorObj(500, 
												'sr1004', 
												__filename, 
												'updateServiceCall', 
												'error saving endpoints config',
												'Error saving endpoints config',
												err
												);
					deferred.reject(errorObj);
				}
			});
		}
		else {
			var errorObj = new ErrorObj(500, 
										'sr0003', 
										__filename, 
										'updateServiceCall', 
										'no service call found to update'
										);
			deferred.reject(errorObj);
		}
	})
	.fail(function(err) {
		if(err !== undefined && err !== null && typeof(err.AddToError) === 'function') {
			deferred.reject(err.AddToError(__filename, 'updateServiceCall'));
		}
		else {
			var errorObj = new ErrorObj(500, 
										'sr1005', 
										__filename, 
										'updateServiceCall', 
										'error updating endpoint',
										'Error updating endpoint',
										err
										);
			deferred.reject(errorObj);
		}
	});

	deferred.promise.nodeify(callback);
	return deferred.promise;
};

// ====================================
// DELETE ENDPOINT
// ====================================
ServiceRegistration.prototype.deleteServiceCall = function(call, area, controller, verb, version, callback) {
	var deferred = Q.defer();

	this.serviceCallExists(call, area, controller, verb, version)
	.then(function() {
		var controllers = endpoints.data[area];
		for(var cIdx = 0; cIdx < controllers.length; cIdx++) {
			if(controllers[cIdx].name.toLowerCase() === controller.toLowerCase() &&
				controllers[cIdx].version === version) {
				// FOUND THE CONTROLLER, UPDATE THE METHOD
				for(var mIdx = 0; mIdx < controllers[cIdx].methods.length; mIdx++) {
					var method = controllers[cIdx].methods[mIdx];
					if(method.verb.toLowerCase() === verb.toLowerCase() &&
						method.call.toLowerCase() === call.toLowerCase()) {
						controllerIdx = cIdx;
						methodIdx = mIdx;

						break;
					}
				}

				break;
			}
		}

		if(controllerIdx !== -1 && methodIdx !== -1) {
			//delete endpoints.data[area][controllerIdx].methods[methodIdx];
			endpoints.data[area][controllerIdx].methods.splice(methodIdx, 1);

			// WRITE TO FILE
			endpoints.save(true)
			.then(function(save_res) {
				deferred.resolve(save_res);
			})
			.fail(function(err) {
				if(err !== undefined && err !== null && typeof(err.AddToError) === 'function') {
					deferred.reject(err.AddToError(__filename, 'deleteServiceCall'));
				}
				else {
					var errorObj = new ErrorObj(500, 
												'sr1006', 
												__filename, 
												'deleteServiceCall', 
												'error deleting endpoint',
												'Error deleting endpoint',
												err
												);
					deferred.reject(errorObj);
				}
			});
		}
		else {
			var errorObj = new ErrorObj(500, 
										'sr0004', 
										__filename, 
										'deleteServiceCall', 
										'no service call found to delete'
										);
			deferred.reject(errorObj);
		}
	})
	.fail(function(err) {
		if(err !== undefined && err !== null && typeof(err.AddToError) === 'function') {
			deferred.reject(err.AddToError(__filename, 'deleteServiceCall'));
		}
		else {
			var errorObj = new ErrorObj(500, 
										'sr1007', 
										__filename, 
										'deleteServiceCall', 
										'error deleting endpoint',
										'Error deleting endpoint',
										err
										);
			deferred.reject(errorObj);
		}
	});

	deferred.promise.nodeify(callback);
	return deferred.promise;
};

// ====================================
// GET ENDPOINT
// ====================================
ServiceRegistration.prototype.getServiceCall = function(call, area, controller, verb, version, callback) {
	var deferred = Q.defer();

	var serviceCallObj = {
		'object_type':'webServiceCallDescriptor'
	};

	if(endpoints.data.hasOwnProperty(area) && endpoints.data[area]!==null) {
		// FOUND THE AREA
		var foundController = false;
		var activeController = null;
		if(version !== undefined && version !== null) {
			for(var cIdx = 0; cIdx < endpoints.data[area].length; cIdx++) {
				var cntrl = endpoints.data[area][cIdx];
				if(cntrl.name.toLowerCase()===controller.toLowerCase() && cntrl.version===version) {
					foundController = true;
					activeController = cntrl;
					serviceCallObj.area = area.toLowerCase();

					break;
				}
			}
		}
		else {
			var greatestVersionWithCall = '0.0.0';
			for(var cIdx = 0; cIdx < endpoints.data[area].length; cIdx++) {
				var cntrl = endpoints.data[area][cIdx];
				// THIS CONTROLLER HAS THE CORRECT NAME.  SEE IF IT HAS THE METHOD
				if(cntrl.name.toLowerCase() === controller.toLowerCase()) {
					if(cntrl.hasOwnProperty('methods') && cntrl.methods.length > 0) {
						methodloop:
						for(var mIdx = 0; mIdx < cntrl.methods.length; mIdx++) {
							var mthd = cntrl.methods[mIdx];
							// THIS CONTROLLER HAS THE CORRECT METHOD.  MARK THE VERSION
							// SO WE CAN SEE IF THIS IS THE LATEST
							if(mthd.verb.toLowerCase() === verb.toLowerCase() && mthd.call.toLowerCase() === call.toLowerCase()) {
								var compareRes = compareVersionStrings(cntrl.version, greatestVersionWithCall);
								if(compareRes === 1) {
									greatestVersionWithCall = cntrl.version;
									foundController = true;
									activeController = cntrl;
									serviceCallObj.area = area.toLowerCase();

									break methodloop;
								}
							}
						}
					}
				}
			}
		}

		if(foundController) {
			// FOUND THE CONTROLLER AND VERSION
			serviceCallObj.controller = activeController.name;
			serviceCallObj.version = activeController.version;

			if(activeController.hasOwnProperty('methods') && activeController.methods.length > 0) {
				var foundMethod = false;
				var activeMethod = null;
				for(var mIdx = 0; mIdx < activeController.methods.length; mIdx++) {
					var mthd = activeController.methods[mIdx];
					if(mthd.verb.toLowerCase()===verb.toLowerCase() && mthd.call.toLowerCase()===call.toLowerCase()) {
						if(mthd.isUserCreated === undefined || mthd.isUserCreated === null) {
							mthd.isUserCreated = false;
						}

						// FOUND METHOD WITH MATCHING VERB AND CALL
						activeMethod = mthd;
						foundMethod = true;
						serviceCallObj.verb = activeMethod.verb;
						serviceCallObj.call = activeMethod.call;
						serviceCallObj.description = activeMethod.desc;
						serviceCallObj.args = activeMethod.args;
						serviceCallObj.authRequired = activeMethod.authRequired;
						serviceCallObj.isUserCreated = activeMethod.isUserCreated;

						break;
					}
				}

				if(foundMethod) {
					deferred.resolve(serviceCallObj);
				}
				else {
					// COULDN'T FIND IT
					var errorObj = new ErrorObj(400,
												'sr0005', 
												__filename, 
												'getServiceCall', 
												'no matching method found' 
												);
					deferred.reject(errorObj);
				}
			}
			else {
				// COULDN'T FIND IT
				var errorObj = new ErrorObj(400,
											'sr0006', 
											__filename, 
											'getServiceCall', 
											'no matching method found' 
											);
				deferred.reject(errorObj);
			}
		}
		else {
			var errorObj = new ErrorObj(400,
										'sr0007', 
										__filename, 
										'getServiceCall', 
										'no matching controller found' 
										);
			deferred.reject(errorObj);
		}
	}
	else {
		// COULDN'T FIND IT
		var errorObj = new ErrorObj(500, 
									'sr0008', 
									__filename, 
									'getServiceCall', 
									'no matching area found'
									);
		deferred.reject(errorObj);
	}

	deferred.promise.nodeify(callback);
	return deferred.promise;
};

// ====================================
// CHECK FOR ENDPOINT
// ====================================
// DEPENDS ON ServiceRegistration.getServiceCall()'s ERRORS TO DETERMINE IF SERVICE CALL EXISTS
ServiceRegistration.prototype.serviceCallExists = function(call, area, controller, verb, version, callback) {
	var deferred = Q.defer();

	this.getServiceCall(call, area, controller, verb, version)
	.then(function(sc_res) {
		deferred.resolve(sc_res);
	})
	.fail(function(gsc_err) {
		if(gsc_err !== undefined && gsc_err !== null && typeof(gsc_err.AddToError) === 'function') {
			deferred.reject(gsc_err.AddToError(__filename, 'serviceCallExists'));
		}
		else {
			var errorObj = new ErrorObj(500, 
										'sr1008', 
										__filename, 
										'serviceCallExists', 
										'error finding service call',
										'Error finding service call',
										gsc_err
										);
			deferred.reject(errorObj);
		}
	});

	deferred.promise.nodeify(callback);
	return deferred.promise;
};

// ====================================
// VALIDATE ENDPOINT ARGS
// ====================================
ServiceRegistration.prototype.validateArguments = function(call, area, controller, verb, version, inputArgs, callback) {
	var deferred = Q.defer();

	this.getServiceCall(call, area, controller, verb, version)
	.then(function(get_res) {
		if(get_res.args!==null && get_res.args.length > 0) {
			var isValid = true;
			var invalidArgs = [];
			for(var argIdx = 0; argIdx < get_res.args.length; argIdx++) {
				var arg = get_res.args[argIdx];

				if(arg.isRequired===null) {
					arg.isRequired = false;
				}
				if(arg.isRequired===true && (inputArgs[arg.name]===null || inputArgs[arg.name]==='')) {
					isValid = false;
					invalidArgs.push(arg.name);
					break;
				}
				if(arg.type!==null) {
					if((inputArgs[arg.name]===undefined || inputArgs[arg.name]===null) && !arg.isRequired) {
						continue;
					}
					if(arg.type==='string') {
						if(typeof(inputArgs[arg.name])!=='string') {
							isValid = false;
							invalidArgs.push(arg.name);
							break;
						}
					}
					else if(arg.type==='number') {
						if(isNaN(inputArgs[arg.name])) {
							isValid = false;
							invalidArgs.push(arg.name);
							break;
						}
					}
					else if(arg.type==='array') {
						if(typeof(inputArgs[arg.name])!=='object') {
							isValid = false;
							invalidArgs.push(arg.name);
							break;
						}
					}
					else if(arg.type==='object') {
						if(typeof(inputArgs[arg.name])!=='object') {
							isValid = false;
							invalidArgs.push(arg.name);
							break;
						}
					}
					else if(arg.type==='boolean') {
            if(verb.toLowerCase() === 'get') {
              inputArgs[arg.name] = inputArgs[arg.name].toLowerCase() == 'true' ? true : false;
            }
						if(typeof(inputArgs[arg.name])!=='boolean') {
							isValid = false;
							invalidArgs.push(arg.name);
							break;
						}
					}
					else if(arg.type==='symbol') {
						if(typeof(inputArgs[arg.name])!=='symbol') {
							isValid = false;
							invalidArgs.push(arg.name);
							break;
						}
					}
					else if(arg.type==='date') {
						if(typeof(inputArgs[arg.name])==='string') {
							var dateToStore = formatDateForStorage(inputArgs[arg.name]);
							if(dateToStore === 'Invalid Date') {
								isValid = false;
								invalidArgs.push(arg.name);
								break;
							}
							else {
								inputArgs[arg.name] = dateToStore;
							}
						}
						else {
							isValid = false;
							invalidArgs.push(arg.name);
							break;
						}
					}
					else if(arg.type==='file') {
						// VERIFY THAT THIS IS A STRING CONTAINING VALID BASE64 DATA
						if(typeof(inputArgs[arg.name]) === 'string') {
							var stringData = inputArgs[arg.name];
							if(!base64.validate(stringData)) {
								isValid = false;
								invalidArgs.push(arg.name);
								break;
							}
						}
						else {
							isValid = false;
							invalidArgs.push(arg.name);
							break;
						}
					}
					else if(arg.type === '*') {
						// VALID
					}
					// I DON'T KNOW WHY YOU'D WANT TO DO THIS, BUT HERE...
					else if(arg.type==='undefined') {
						if(typeof(inputArgs[arg.name])!=='undefined') {
							isValid = false;
							invalidArgs.push(arg.name);
							break;
						}
					}
				}
				else {
					console.log(
						'Could not find a type for this argument. This service may have been misformed during registration.');
					isValid = false;
					break;
				}
			}
			if(isValid===true) {
				deferred.resolve(true);
			}
			else {
				var errorObj = new ErrorObj(400, 
											'sr0009', 
											__filename, 
											'validateArguments', 
											'invalid args',
											'Invalid args',
											invalidArgs
											);
				deferred.reject(errorObj);
			}
		}
		else {
			deferred.resolve(true);
		}
	})
	.fail(function(err) {
		if(err !== undefined && err !== null && typeof(err.AddToError) === 'function') {
			deferred.reject(err.AddToError(__filename, 'validateArguments'));
		}
		else {
			var errorObj = new ErrorObj(500, 
										'sr1009', 
										__filename, 
										'validateArguments', 
										'error validating arguments',
										'Error validating arguments',
										err
										);
			deferred.reject(errorObj);
		}
	});

	deferred.promise.nodeify(callback);
	return deferred.promise;
};

// ====================================
// GET ALL ENDPOINTS
// ====================================
ServiceRegistration.prototype.getAllServiceCalls = function(callback) {
	var deferred = Q.defer();

	var serviceCalls = [];

	var areas = Object.keys(endpoints.data);
	for(var aIdx = 0; aIdx < areas.length; aIdx++) {
		var areaName = areas[aIdx];
		var controllerArray = endpoints.data[areas[aIdx]];
		for(var cIdx = 0; cIdx < controllerArray.length; cIdx++) {
			var controllerObj = controllerArray[cIdx];
			var controllerName = controllerObj.name;
			var controllerVersion = controllerObj.version;
			var methodArray = controllerObj.methods;
			for(var mIdx = 0; mIdx < methodArray.length; mIdx++) {
				var methodObj = methodArray[mIdx];
				if(methodObj.isUserCreated === undefined || methodObj.isUserCreated === null) {
					methodObj.isUserCreated = false;
				}
				var serviceCall = {
					'object_type':'webServiceCallDescriptor',
					'area':areaName,
					'controller':controllerName,
					'version':controllerVersion,
					'call':methodObj.call,
					'verb':methodObj.verb,
					'description':methodObj.desc,
					'authRequired':methodObj.authRequired,
					'args':methodObj.args,
          			'isUserCreated':methodObj.isUserCreated
				};
				serviceCalls.push(serviceCall);
			}
		}
	}

	deferred.resolve(serviceCalls);
	deferred.promise.nodeify(callback);
	return deferred.promise;
};


// ==================================================
// UTILITY FUNCTIONS
// ==================================================
// BS3 TODO: REPLACE MOMENT PACKAGE
function formatDateForStorage(dateString) {
	var re = /(\+|\-)\d\d:?\d\d$/;
	var reZ = /(Z$|\+00:?00$)/;
	var timezone;
	var isLocalTime = false;
	var dateToStore;
		
	if(reZ.test(dateString)) {
		// ZULU TIME
		timezone = dateString.match(reZ)[0];
	}
	else if(re.test(dateString)) {
		// LOCAL TIME
		timezone = dateString.match(re)[0];
		isLocalTime = true;
	}
	else {
		// NO TIMEZONE, ASSUME ZULU
		dateString += 'Z';
	}

	var isValid = false;
	if(moment(dateString, 'YYYY-MM-DDZ', true).isValid()) {
		isValid = true;
		if(isLocalTime) {
			var dsNoTimezone = dateString.substring(0, dateString.indexOf(timezone));
			var dts = dsNoTimezone+'T00:00:00.000'+timezone;
			dateToStore = dts;
		}
		else {
			dateToStore = moment(dateString, 'YYYY-MM-DDZ', true).utc().format('YYYY-MM-DDTHH:mm:ss.SSSZ');
		}
	}
	else if(moment(dateString, 'YYYY-MM-DDTHH:mmZ', true).isValid()) {
		isValid = true;
		if(isLocalTime) {
			var dsNoTimezone = dateString.substring(0, dateString.indexOf(timezone));
			var dts = dsNoTimezone+':00.000'+timezone;
			dateToStore = dts;
		}
		else {
			dateToStore = moment(dateString, 'YYYY-MM-DDTHH:mmZ', true).utc().format('YYYY-MM-DDTHH:mm:ss.SSSZ');
		}
	}
	else if(moment(dateString, 'YYYY-MM-DDTHH:mm:ssZ', true).isValid()) {
		isValid = true;
		if(isLocalTime) {
			var dsNoTimezone = dateString.substring(0, dateString.indexOf(timezone));
			var dts = dsNoTimezone+'.000'+timezone;
			dateToStore = dts;
		}
		else {
			dateToStore = moment(dateString, 'YYYY-MM-DDTHH:mm:ssZ', true).utc().format('YYYY-MM-DDTHH:mm:ss.SSSZ');
		}
	}
	else if(moment(dateString, 'YYYY-MM-DDTHH:mm:ss.SSSZ', true).isValid()) {
		isValid = true;
		if(isLocalTime) {
			dateToStore = dateString;
		}
		else {
			dateToStore = moment(dateString, 'YYYY-MM-DDTHH:mm:ss.SSSZ', true).utc().format('YYYY-MM-DDTHH:mm:ss.SSSZ');
		}
	}
	else {
		isValid = false;
	}

	if(isValid) {
		return dateToStore;
	}
	else {
		return "Invalid Date";
	}
}

// IF A IS GREATER, RETURN 1
// IF B IS GREATER, RETURN -1
// IF EQUAL, RETURN 0
function compareVersionStrings(a, b) {
	var aObj = {};
	var pIdx = a.indexOf('.');
	aObj.major = parseInt(a.substring(0, pIdx));
	var tempInput = a.substring(pIdx+1);
	pIdx = tempInput.indexOf('.');
	aObj.minor = parseInt(tempInput.substring(0, pIdx));
	tempInput = tempInput.substring(pIdx+1);
	aObj.bug = parseInt(tempInput);

	var bObj = {};
	pIdx = b.indexOf('.');
	bObj.major = parseInt(b.substring(0, pIdx));
	tempInput = b.substring(pIdx+1);
	pIdx = tempInput.indexOf('.');
	bObj.minor = parseInt(tempInput.substring(0, pIdx));
	tempInput = tempInput.substring(pIdx+1);
	bObj.bug = parseInt(tempInput);

	if(aObj.major > bObj.major) {
		return 1;
	}
	else if(aObj.major < bObj.major) {
		return -1;
	}
	else {
		if(aObj.minor > bObj.minor) {
			return 1;
		}
		else if(aObj.minor < bObj.minor) {
			return -1;
		}
		else {
			if(aObj.bug > bObj.bug) {
				return 1;
			}
			else if(aObj.bug < bObj.bug) {
				return -1;
			}
			else {
				return 0;
			}
		}
	}
}


exports.ServiceRegistration = ServiceRegistration;
