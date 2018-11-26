var Q = require('q');
var fs = require('fs');

// ---------------------------------
// AWS
// ---------------------------------
var AWS = require('aws-sdk');
AWS.config.region = 'us-east-1';
var s3 = null;

var endpointData = null;
var bucket = null;
var file = null;
var extensionFile = null;
var remoteSettings = null;
var settings;
var utilities;

var Endpoints = function(s, u) {
	s3 = new AWS.S3();
	settings = s;
	utilities = u;
};

Endpoints.prototype.init = function(b, f, rs) {
	var deferred = Q.defer();

	bucket = b;
	file = f;
	extensionFile = file.substring(0, file.indexOf('.json'))+'_ext.json';
	remoteSettings = rs;

	if(utilities.isNullOrUndefined(remoteSettings) || remoteSettings === false) {
		try {
			if(file.substring(0,2) !== './') file = './'+file;
			if(extensionFile.substring(0,2) !== './') extensionFile = './'+extensionFile;
			endpointData = require(file);

			// FOR EACH CUSTOM ENDPOINT SPECIFIED IN USER DEFINED ENDPOINTS FILE
			// UPDATE OR ADD TO endpointData AS APPLICABLE
			customEndpointData = require(extensionFile);

			var areas = Object.keys(customEndpointData);
			for(var aIdx = 0; aIdx < areas.length; aIdx++) {
				var customArea = customEndpointData[areas[aIdx]]
				// THIS IS A NEW AREA.  JUST ADD IT TO THE ENDPOINT DATA
				if(endpointData[areas[aIdx]] == undefined || endpointData[areas[aIdx]] == null) {
					endpointData[areas[aIdx]] = customArea;
				}
				// WE ALREADY HAVE THIS AREA, MUST CHECK EACH CONTROLLER
				else {
					var area = endpointData[areas[aIdx]];

					// FOR EACH CUSTOM CONTROLLER
					for(var cIdx = 0; cIdx < customArea.length; cIdx++) {
						var originalController = null;
						for(var ocIdx = 0; ocIdx < area.length; ocIdx++) {
							if(customArea[cIdx].name == area[ocIdx].name && 
								customArea[cIdx].version == area[ocIdx].version) {
								originalController = area[ocIdx];
								break;
							}
						}
						// IF WE COULDN'T FIND THIS CONTROLLER, JUST ADD IT
						if(originalController == null) {
							endpointData[areas[aIdx]].push(customArea[cIdx]);
						}
						// OTHERWISE WE HAVE THIS CONTROLLER AND WE NEED TO CHECK EACH METHOD
						else {
							var customMethods = customArea[cIdx].methods;
							for(var mIdx = 0; mIdx < customMethods.length; mIdx++) {
								var customMethod = customMethods[mIdx];
								for(var omIdx = 0; omIdx < originalController.methods.length; omIdx++) {
									var originalMethod = originalController.methods[omIdx];
									var foundMethod = false;
									if(customMethod.verb == originalMethod.verb &&
										customMethod.call == originalMethod.call) {
										foundMethod = true;
										break;
									}
								}
								if(!foundMethod) {
									endpointData[areas[aIdx]][ocIdx].methods.push(customMethod);
								}
							}
						}
					}
				}
			}

			Endpoints.prototype.data = endpointData;
			deferred.resolve(true);
		}
		catch(e) {
			deferred.reject(e);
		}
	}
	else {
		Endpoints.prototype.data = {};
		s3.getObject({Bucket: bucket, Key: file}, function(err, res) {
			if(!err) {
				var obj = JSON.parse(res.Body.toString());
				endpointData = obj;

				s3.getObject({Bucket: bucket, Key: extensionFile}, function(c_err, c_res) {
					if(!c_err) {
						var customEndpointData = JSON.parse(c_res.Body.toString());
						var areas = Object.keys(customEndpointData);
						for(var aIdx = 0; aIdx < areas.length; aIdx++) {
							var customArea = customEndpointData[areas[aIdx]]
							// THIS IS A NEW AREA.  JUST ADD IT TO THE ENDPOINT DATA
							if(endpointData[areas[aIdx]] == undefined || endpointData[areas[aIdx]] == null) {
								endpointData[areas[aIdx]] = customArea;
							}
							// WE ALREADY HAVE THIS AREA, MUST CHECK EACH CONTROLLER
							else {
								var area = endpointData[areas[aIdx]];

								// FOR EACH CUSTOM CONTROLLER
								for(var cIdx = 0; cIdx < customArea.length; cIdx++) {
									var originalController = null;
									for(var ocIdx = 0; ocIdx < area.length; ocIdx++) {
										if(customArea[cIdx].name == area[ocIdx].name && 
											customArea[cIdx].version == area[ocIdx].version) {
											originalController = area[ocIdx];
											break;
										}
									}
									// IF WE COULDN'T FIND THIS CONTROLLER, JUST ADD IT
									if(originalController == null) {
										endpointData[areas[aIdx]].push(customArea[cIdx]);
									}
									// OTHERWISE WE HAVE THIS CONTROLLER AND WE NEED TO CHECK EACH METHOD
									else {
										var customMethods = customArea[cIdx].methods;
										for(var mIdx = 0; mIdx < customMethods.length; mIdx++) {
											var customMethod = customMethods[mIdx];
											for(var omIdx = 0; omIdx < originalController.methods.length; omIdx++) {
												var originalMethod = originalController.methods[omIdx];
												var foundMethod = false;
												if(customMethod.verb == originalMethod.verb &&
													customMethod.call == originalMethod.call) {
													foundMethod = true;
													break;
												}
											}
											if(!foundMethod) {
												endpointData[areas[aIdx]][ocIdx].methods.push(customMethod);
											}
										}
									}
								}
							}
						}

						Endpoints.prototype.data = endpointData;
						deferred.resolve(true);
					}
					else {
						var errorObj = new ErrorObj(500, 
													'e1001', 
													__filename, 
													'init', 
													'error getting file from S3',
													'External error',
													c_err
													);
						deferred.reject(errorObj);
					}
				});
			}
			else {
				var errorObj = new ErrorObj(500, 
											'e0001', 
											__filename, 
											'init', 
											'error getting file from S3',
											'External error',
											err
											);
				deferred.reject(errorObj);
			}
		});
	}

	return deferred.promise;
}

Endpoints.prototype.reload = function() {
	var e = this;
	var deferred = Q.defer();
	e.init(bucket, file, remoteSettings)
	.then(function(res) {
		deferred.resolve(res);
	})
	.fail(function(err) {
		if(err !== undefined && err !== null && typeof(err.AddToError) === 'function') {
			deferred.reject(err.AddToError(__filename, 'reload'));
		}
		else {
			var errorObj = new ErrorObj(500, 
										'e1001', 
										__filename, 
										'reload', 
										'error reloading endpoints config',
										'External error',
										err
										);
			deferred.reject(errorObj);
		}
	});
	

	return deferred.promise;
}

Endpoints.prototype.generateFromModels = function(models, doNetworkReload, callback) {
	var deferred = Q.defer();

	if(doNetworkReload === undefined || doNetworkReload === null) {
		doNetworkReload = false;
	}

	var modelEndpoints = null;
	var commonEndpoints = this.constructor.prototype.data.common;
	var foundModelsSection = false;
	for(var cIdx = 0; cIdx < commonEndpoints.length; cIdx++) {
		var cntrl = commonEndpoints[cIdx];
		if(cntrl.name.toLowerCase() === 'models') {
			modelEndpoints = cntrl.methods;
			foundModelsSection = true;
			break;
		}
	}
	if(!foundModelsSection) {
		var modelsHeader = {
			"name": "models",
        	"version": "1.0.0"
		}
		commonEndpoints.push(modelsHeader);
	}

	var newModelEndpoints = [];

	for(var mIdx = 0; mIdx < models.length; mIdx++) {
		var currentModel = models[mIdx];

		// GET
		var eArgs = [];
		if(currentModel.properties !== undefined && currentModel.properties !== null) {
			eArgs = [];
			for(var pIdx = 0; pIdx < currentModel.properties.length; pIdx++) {
				var prop = JSON.parse(JSON.stringify(currentModel.properties[pIdx]));
				prop.isRequired = false;
				delete prop.required;
				prop.type = prop.data_type;
				delete prop.data_type;
				eArgs.push(prop);
			}
		}
		eArgs.push({
			"name": "relates_to",
			"type": "*",
			"isRequired": false
		});
		var endpointDescriptor = {
			'verb': 'GET',
			'call': currentModel.obj_type.toLowerCase(),
			'desc': 'Returns '+currentModel.obj_type+' objects',
			'authRequired': true,
			'args': eArgs,
			'isUserCreated': false
		};

		newModelEndpoints.push(endpointDescriptor);

		// POST
		var eArgs = [];
		if(currentModel.properties !== undefined && currentModel.properties !== null) {
			eArgs = [];
			for(var pIdx = 0; pIdx < currentModel.properties.length; pIdx++) {
				var prop = JSON.parse(JSON.stringify(currentModel.properties[pIdx]));
				if(prop.name.toLowerCase() !== 'id') {
					prop.isRequired = prop.required;
					delete prop.required;
					prop.type = prop.data_type;
					delete prop.data_type;
					eArgs.push(prop);
				}
			}
		}
		eArgs.push({
			"name": "relates_to",
			"type": "array",
			"isRequired": false
		});
		endpointDescriptor = {
			'verb': 'POST',
			'call': currentModel.obj_type.toLowerCase(),
			'desc': 'Adds a '+currentModel.obj_type+' object',
			'authRequired': true,
			'args': eArgs,
			'isUserCreated':false
		};

		newModelEndpoints.push(endpointDescriptor);

		// PATCH
		var eArgs = [];
		if(currentModel.properties !== undefined && currentModel.properties !== null) {
			eArgs = [];
			for(var pIdx = 0; pIdx < currentModel.properties.length; pIdx++) {
				var prop = JSON.parse(JSON.stringify(currentModel.properties[pIdx]));

				if(prop.name.toLowerCase() === 'id') {
					prop.isRequired = true;
				}
				else {
					prop.isRequired = false;
				}
				delete prop.required;
				prop.type = prop.data_type;
				delete prop.data_type;
				eArgs.push(prop);
			}
		}
		eArgs.push({
			"name": "add_relationships",
			"type": "array",
			"isRequired": false
		});
		eArgs.push({
			"name": "remove_relationships",
			"type": "array",
			"isRequired": false
		});
		endpointDescriptor = {
			'verb': 'PATCH',
			'call': currentModel.obj_type.toLowerCase(),
			'desc': 'Updates a '+currentModel.obj_type+' object',
			'authRequired': true,
			'args': eArgs,
			'isUserCreated': false
		};

		newModelEndpoints.push(endpointDescriptor);
		
		// DELETE
		var eArgs = [];
		eArgs.push({
			"name": "id",
			"type": "string",
			"isRequired": true
		});
		eArgs.push({
			"name": "relates_to",
			"type": "obj_type",
			"isRequired": false
		});
		if(currentModel.properties !== undefined && currentModel.properties !== null) {
			eArgs = [];
			for(var pIdx = 0; pIdx < currentModel.properties.length; pIdx++) {
				var prop = JSON.parse(JSON.stringify(currentModel.properties[pIdx]));
				if(prop.name.toLowerCase() === 'id') {
					prop.isRequired = true;
					delete prop.required;
					prop.type = prop.data_type;
					delete prop.data_type;
					eArgs.push(prop);
				}
			}
		}
		endpointDescriptor = {
			'verb': 'DELETE',
			'call': currentModel.obj_type.toLowerCase(),
			'desc': 'Deletes a model object',
			'authRequired': true,
			'args': eArgs,
			'isUserCreated': false
		};

		newModelEndpoints.push(endpointDescriptor);
	}
	
	for(var cIdx = 0; cIdx < commonEndpoints.length; cIdx++) {
		var cntrl = commonEndpoints[cIdx];
		if(cntrl.name.toLowerCase() === 'models') {
			cntrl.methods = newModelEndpoints;
			break;
		}	
	}

	// WRITE ENDPOINT DATA BACK TO FILE
	this.save(doNetworkReload)
	.then(function(save_res) {
		deferred.resolve(save_res);
	})
	.fail(function(err) {
		if(err !== undefined && err !== null && typeof(err.AddToError) === 'function') {
			deferred.reject(err.AddToError(__filename, 'generateFromModels'));
		}
		else {
			var errorObj = new ErrorObj(500, 
										'e1002', 
										__filename, 
										'generateFromModels', 
										'error saving endpoints config',
										'External error',
										err
										);
			deferred.reject(errorObj);
		}
	});

	return deferred.promise;
};

Endpoints.prototype.save = function(doNetworkReload) {
	var deferred = Q.defer();

	// SEPARATE USER-DEFINED ENDPOINT DESCRIPTORS FROM
	// CORE SYSTEM ENDPOINT DESCRIPTORS
	var customEndpoints = {};
	var systemEndpoints = {};
	var eData = this.constructor.prototype.data;
	var areaNames = Object.keys(eData);
	// FOR EACH AREA IN THE ENDPOINTS DATA
	for(var aIdx = 0; aIdx < areaNames.length; aIdx++) {
		var area = eData[areaNames[aIdx]];
		// FOR EACH CONTROLLER IN THE ENDPOINTS DATA
		for(var cIdx = 0; cIdx < area.length; cIdx++) {
			var controller = area[cIdx];
			// FOR EACH METHOD IN THE ENDPOINTS DATA
			for(var mIdx = 0; mIdx < controller.methods.length; mIdx++) {
				var method = controller.methods[mIdx];

				// USER CREATED METHOD
				if(method.isUserCreated == null || method.isUserCreated == true) {
					// THE customEndpoints OBJECT DOES NOT HAVE AN ENTRY FOR THIS AREA
					if(!customEndpoints.hasOwnProperty(areaNames[aIdx])) {
						customEndpoints[areaNames[aIdx]] = [];
					}
					var cArea = customEndpoints[areaNames[aIdx]];
					// IF NO MATCHING CONTROLLER IS FOUND,
					// DEEP COPY USING JSON stringify/parse
					// AND REMOVE THE METHODS.  THIS WILL GIVE US JUST THE
					// HEADER INFO FROM THE CONTROLLER
					var cntrl = JSON.parse(JSON.stringify(controller));
					cntrl.methods = [];
					var foundController = false;
					for(var ctIdx = 0; ctIdx < cArea.length; ctIdx++) {
						var c = cArea[ctIdx];
						if(controller.name == c.name && controller.version == c.version) {
							// FOUND THE CONTROLLER IN customEndpoints, SO USE THAT ONE
							cntrl = c;
							foundController = true;
							break;
						}
					}

					cntrl.methods.push(method);
					if(!foundController) {
						cArea.push(cntrl);
					}
				}
				// SYSTEM METHOD
				else {
					// THE systemEndpoints OBJECT DOES NOT HAVE AN ENTRY FOR THIS AREA
					if(!systemEndpoints.hasOwnProperty(areaNames[aIdx])) {
						systemEndpoints[areaNames[aIdx]] = [];
					}
					var cArea = systemEndpoints[areaNames[aIdx]];
					// IF NO MATCHING CONTROLLER IS FOUND,
					// DEEP COPY USING JSON stringify/parse
					// AND REMOVE THE METHODS.  THIS WILL GIVE US JUST THE
					// HEADER INFO FROM THE CONTROLLER
					var cntrl = JSON.parse(JSON.stringify(controller));
					cntrl.methods = [];
					var foundController = false;
					for(var ctIdx = 0; ctIdx < cArea.length; ctIdx++) {
						var c = cArea[ctIdx];
						if(controller.name == c.name && controller.version == c.version) {
							// FOUND THE CONTROLLER IN systemEndpoints, SO USE THAT ONE
							cntrl = c;
							foundController = true;
							break;
						}
					}

					cntrl.methods.push(method);
					if(!foundController) {
						cArea.push(cntrl);
					}
				}
			}
		}
	}

	if(utilities.isNullOrUndefined(remoteSettings) || remoteSettings === false) {
		var fswrite = Q.denodeify(fs.writeFile);
		Q.all([fswrite(file, JSON.stringify(systemEndpoints, null, 4)), fswrite(extensionFile, JSON.stringify(customEndpoints, null, 4))])
		.then(function(write_res) {
			deferred.resolve(true);
		})
		.fail(function(err) {
			var errorObj = new ErrorObj(400, 
										'e0002', 
										__filename, 
										'save', 
										'error writing to Endpoints config file',
										'External error',
										err
										);
			deferred.reject(errorObj);
		});
	}
	else {
		s3.putObject({Bucket:bucket, Key:file, Body:JSON.stringify(systemEndpoints, null, 4)}, function(err, save_res) {
			if(!err) {
				s3.putObject({Bucket:bucket, Key:extensionFile, Body:JSON.stringify(customEndpoints, null, 4)}, function(c_err, c_save_res) {
					if(!c_err) {
						if(doNetworkReload === true) {
							settings.reloadNetwork()
							.then(function(reload_res) {
								deferred.resolve(true);
							})
							.fail(function(err) {
								if(err !== undefined && err !== null && typeof(err.AddToError) === 'function') {
									deferred.reject(err.AddToError(__filename, 'save'));
								}
								else {
									var errorObj = new ErrorObj(500, 
																'e1003', 
																__filename, 
																'save', 
																'error saving endpoints config',
																'External error',
																err
																);
									deferred.reject(errorObj);
								}
							});
						}
						else {
							deferred.resolve(true);
						}
					}
					else {
						var errorObj = new ErrorObj(500, 
													'e0004', 
													__filename, 
													'save', 
													'error saving endpoints',
													'S3 error',
													err
													);
						deferred.reject(errorObj);
					}
				});
			}
			else {
				var errorObj = new ErrorObj(500, 
											'e0003', 
											__filename, 
											'save', 
											'error saving endpoints',
											'S3 error',
											err
											);
				deferred.reject(errorObj);
			}
		});
	}

	return deferred.promise;
};

exports.Endpoints = Endpoints;
