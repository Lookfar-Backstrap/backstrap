var dataAccess;
var utilities;
var accessControl;
var serviceRegistration;
var settings;
var models;
var endpoints;

var fs = require('fs');
var Q = require('q');

var Controller = function (da, utils, ac, sr, st, m, e) {
	dataAccess = da;
	utilities = utils;
	accessControl = ac;
	serviceRegistration = sr;
	settings = st;
	models = m;
	endpoints = e;
};

Controller.prototype.resolveServiceCall = function (serviceCallDescriptor, req, callback) {
	var deferred = Q.defer();
	// ===================================================================
	// PULL THE APPROPRIATE VERSION OF WEB SERVICE WITH APPROPRIATE VERB
	// ===================================================================
	var versionObj;
	try {
		versionObj = exports.makeVersionObject(serviceCallDescriptor.version);
	}
	catch (err) {
		var errorObj = new ErrorObj(400,
			'c0001',
			__filename,
			'resolveServiceCall',
			'invalid version string',
			'Invalid version string. Please follow version format x.y.x - major.minor.bug',
			err
		);
    deferred.reject(errorObj);
    return deferred.promise;
	}
	var versionOfWS;

	if (serviceCallDescriptor.verb.toLowerCase() === 'get' ||
		serviceCallDescriptor.verb.toLowerCase() === 'post' ||
		serviceCallDescriptor.verb.toLowerCase() === 'put' ||
		serviceCallDescriptor.verb.toLowerCase() === 'patch' ||
		serviceCallDescriptor.verb.toLowerCase() === 'delete') {
		var wsNoVerb = exports.getVersionOfWebService(serviceCallDescriptor.area.toLowerCase(), serviceCallDescriptor.controller.toLowerCase(), versionObj);
		if (wsNoVerb !== null) {
			versionOfWS = wsNoVerb[serviceCallDescriptor.verb.toLowerCase()];
		}
		else {
			versionOfWS = null;
		}
	}
	else {
		var errorObj = new ErrorObj(400,
			'c0002',
			__filename,
			'resolveServiceCall',
			'unsupported http verb',
			'That http verb is not supported.  Please use GET, POST, PUT, PATCH, or DELETE'
		);
    deferred.reject(errorObj);
    return deferred.promise;
	}

	if (versionOfWS === null) {
		var errorObj = new ErrorObj(500,
			'c0003',
			__filename,
			'resolveServiceCall',
			'error locating correct controller file',
			'Problem finding that endpoint',
			serviceCallDescriptor
		);
    deferred.reject(errorObj);
    return deferred.promise;
	}

	var funcName = null;
	var foundFuncName = false;
	if (serviceCallDescriptor.area.toLowerCase() === 'common' && serviceCallDescriptor.controller.toLowerCase() === 'models') {
		for (var mIdx = 0; mIdx < models.data.models.length; mIdx++) {
			var currentModel = models.data.models[mIdx];
			if (currentModel.obj_type.toLowerCase() === serviceCallDescriptor.call.toLowerCase()) {
				foundFuncName = true;
				funcName = 'model';
				if (serviceCallDescriptor.verb.toLowerCase() === 'get') {
					req.query.model_type = currentModel.obj_type.toLowerCase();
				}
				else {
					req.body.model_type = currentModel.obj_type.toLowerCase();
				}

				break;
			}
		}
	}
	else {
		var funcNames = Object.keys(versionOfWS);
		for (var fIdx = 0; fIdx < funcNames.length; fIdx++) {
			if (funcNames[fIdx].toLowerCase() === serviceCallDescriptor.call.toLowerCase()) {
				foundFuncName = true;
				funcName = funcNames[fIdx];

				break;
			}
		}
	}

	if (foundFuncName) {
		var mainCall = Q.denodeify(versionOfWS[funcName]);		
		mainCall(req)
		.then(function(results) {
			deferred.resolve(results);
		})
		.fail(function(err) {
			var errorObj;
			if(err !== undefined && err !== null && typeof(err.AddToError) === 'function') {
				errorObj = err.AddToError(__filename, 'resolveServiceCall', 'main function call failed');	
			}
			else {
				errorObj = new ErrorObj(500,
										'c0004',
										__filename,
										'resolveServiceCall',
										'main function call failed',
										'Something went wrong',
										err
										);
			}

			errorObj.timestamp = new Date();
			
			console.log('\n========================== ERROR ==========================');
			console.log(errorObj);
			console.log('=============================================================\n');

				console.log('\n========================== ERROR ==========================');
				console.log(errorObj);
				console.log('=============================================================\n');

				deferred.reject(errorObj);
			});			
	}
	else {
		var errorObj = new ErrorObj(400,
			'c1005',
			__filename,
			'resolveServiceCall',
			'error locating correct function in controller file',
			'Problem finding that endpoint',
			serviceCallDescriptor
		);
		deferred.reject(errorObj);
	}

	deferred.promise.nodeify(callback);
	return deferred.promise;
};

/**
 * Takes a version string and generates a JS version object.
 * @param {string} versionString - A version string following the format x.y.z - major.minor.bug.
 * @return {object} versionObject - JS object detailing version information.
 * @throws Will throw an error on invalid input (wrong format, non-numerical)
 */
exports.makeVersionObject = function makeVersionObject(versionString) {
	var digits = /^\d+$/;
	var versionDetails = versionString.split('.');

	if (versionDetails.length != 3) {
		throw new Error("Invalid arguments for makeVersionObject()");
	}
	else if ((digits.test(versionDetails[0])
		|| digits.test(versionDetails[1])
		|| digits.test(versionDetails[2]))
		== false) {
		throw new Error("Invalid arguments for makeVersionObject()");
	}

	var versionObject = {
		'major': versionDetails[0],
		'minor': versionDetails[1],
		'bug': versionDetails[2]
	};

	return versionObject;
}

exports.getVersionOfWebService = function getVersionOfWebService(areaName, controllerName, versionObj) {
	var servicesDir = './' + areaName + '/';
	var services = fs.readdirSync(servicesDir);
	var baseServiceName = null;
	var inputVersionString = versionObj.major + '_' + versionObj.minor + '_' + versionObj.bug;
	for (var sIdx = 0; sIdx < services.length; sIdx++) {
		var serviceName = services[sIdx].substring(0, services[sIdx].indexOf('_'));
		var versionString = services[sIdx].substring(services[sIdx].indexOf('_') + 1);
		versionString = versionString.substring(0, versionString.indexOf('.'));

		if (serviceName.toLowerCase() === controllerName.toLowerCase() && versionString === inputVersionString) {
			baseServiceName = serviceName;
			break;
		}
	}
	if (baseServiceName === null) {
		return null;
  }
  
  try {
    var serviceCallsPath = servicesDir + baseServiceName + '_' + inputVersionString + '.js';
    var ServiceCalls = require(serviceCallsPath)[baseServiceName];
    var versionOfWS = new ServiceCalls(dataAccess, utilities, accessControl, serviceRegistration, settings, models, endpoints);
    return versionOfWS;
  }
  catch(e) {
    let errorObj = new ErrorObj(500,
			'c1006',
			__filename,
			'getVersionOfWebService',
			'error loading web service file',
			'There was a problem with your request.  Please try again.',
			e
    );
    utilities.writeErrorToLog(errorObj);
  }
}

exports.Controller = Controller;