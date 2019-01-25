// ===============================================================================
// MODELS WEB SERVICE CALLS v1.0.0
// ===============================================================================
var dataAccess;
var utilities;
var accessControl;
var serviceRegistration;
var settings;
var models;

var Q = require('q');
var EntityMethods = require('../entityMethods.js').EntityMethods;
var entityMethods;

var Models = function(da, utils, ac, sr, st, m) {
	dataAccess = da;
	utilities = utils;
	accessControl = ac;
	serviceRegistration = sr;
	settings = st;
	models = m;

	entityMethods = new EntityMethods(da, m);
};

Models.prototype.get = {
	model: function(req, callback) {
		var deferred = Q.defer();
		var args = req.query;
		var params = [];
		var relates = [];
    var relsToResolve;
    var modelType;
    var offset;
    var range;

		if(args){
      var resolve_rels = (args.resolve_rels !== false && args.resolve_rels !== 'false');
      delete args.resolve_rels;

			modelType = args.model_type;
			delete args.model_type;

			if(args.resolve){
				try {
					relsToResolve = JSON.parse(args.resolve);
				} catch (error) {
					console.log(error);
				} finally {
					delete args.resolve
				}
      }
      
      if(args.hasOwnProperty('offset')) {
        offset = args['offset'];
        delete args.offset;
      }
      
      if(args.hasOwnProperty('range')) {
        range = args['range'];
        delete args.range;
      }

      if(args.hasOwnProperty('relates_to')) {
        if(typeof args['relates_to'] === 'string') {
          var urlEncoded = args['relates_to'];
          var jsonString = decodeURIComponent(urlEncoded);
          try {
            var relateObj = JSON.parse(jsonString);
            var paramsLength = relateObj.parameters.length;
            var newParams = [];
            for(var rkIdx = 0; rkIdx < paramsLength; rkIdx++) {
              var rop = relateObj.parameters[rkIdx];
              var key = Object.keys(rop)[0];
              var param = {
                property: key,
                value: rop[key]
              };
              newParams.push(param);
            }
            relateObj.parameters = newParams;
            relates.push(relateObj);
          }
          catch(e) {
            console.log(e);
          }
        }
        else {
          for(var rIdx = 0; rIdx < args['relates_to'].length; rIdx++) {
            var urlEncoded = args['relates_to'][rIdx];
            var jsonString = decodeURIComponent(urlEncoded);
            var relateObj = JSON.parse(jsonString);
            var paramsLength = relateObj.parameters.length;
            var newParams = [];
            for(var rkIdx = 0; rkIdx < paramsLength; rkIdx++) {
              var rop = relateObj.parameters[rkIdx];
              var key = Object.keys(rop)[0];
              var param = {
                property: key,
                value: rop[key]
              };
              newParams.push(param);
            }
            relateObj.parameters = newParams;
            relates.push(relateObj);
          }
        }
        delete args['relates_to'];
      }
      
      var keys = Object.keys(args);
      var keyNumber = keys.length;
      for(var i = 0; i < keyNumber; i++){
        var tempKey = keys[i];
        var tempValue = args[tempKey];
        var tempObject = {property: tempKey, value: tempValue};
        params.push(tempObject);
      }
		
      var queryObject = {
            "obj_type": modelType,
            "resolve": [],
            "parameters": params,
            "relates_to": relates,
            "offset": offset,
            "range": range
      };
      entityMethods.getActive(modelType, offset, range, queryObject, resolve_rels, relsToResolve)
      .then(function(objs) {
        deferred.resolve(objs);
      })
      .fail(function(err) {
        if(err !== undefined && err !== null && typeof(err.AddToError) === 'function') {
          err.setMessages('error getting models', 'Problem getting models');
          deferred.reject(err.AddToError(__filename, 'GET model'));
        }
        else {
            var errorObj = new ErrorObj(500,
                                        'md0001',
                                        __filename,
                                        'model',
                                        'error getting model',
                                        'Error getting model',
                                        err
                                        );
            deferred.reject(errorObj);
        }
      });
    }
    else {
      var errorObj = new ErrorObj(500,
                                  'md1001',
                                  __filename,
                                  'model',
                                  'no args provided',
                                  'Error getting model',
                                  null
                                  );
      deferred.reject(errorObj);
    }

		deferred.promise.nodeify(callback);
		return deferred.promise;
	}
};

Models.prototype.post = {
	model: function(req, callback) {
		var deferred = Q.defer();
		var args = req.body;
		var postObj = {};
		var relates = [];

		var argKeys = Object.keys(args);
		for(var pIdx = 0; pIdx < argKeys.length; pIdx++) {
			var curArgKey = argKeys[pIdx];
			var curArgVal = args[curArgKey];

			if(curArgKey === 'model_type') {
				postObj.object_type = curArgVal;
			}
			else if(curArgKey === 'relates_to') {
				relates = curArgVal;
			}
			else {
				postObj[curArgKey] = curArgVal;
			}
		}

		entityMethods.create(postObj, relates)
		.then(function(create_res) {
			deferred.resolve(create_res);
		})
		.fail(function(err) {
			if(err !== undefined && err !== null && typeof(err.AddToError) === 'function') {
                err.setMessages('error creating entity', 'Problem creating model');
				deferred.reject(err.AddToError(__filename, 'POST model'));
            }
            else {
                var errorObj = new ErrorObj(500,
                                            'md0002',
                                            __filename,
                                            'model',
                                            'error posting model',
                                            'Error creating model',
                                            err
                                            );
                deferred.reject(errorObj);
            }
		});

		deferred.promise.nodeify(callback);
		return deferred.promise;
	}
};

Models.prototype.put = {

};

Models.prototype.patch = {
	model: function(req, callback) {
		var deferred = Q.defer();
		var args = req.body;
		var patchObj = {};
		var relates = [];
		var unrelates = [];

		var argKeys = Object.keys(args);
		for(var pIdx = 0; pIdx < argKeys.length; pIdx++) {
			var curArgKey = argKeys[pIdx];
			var curArgVal = args[curArgKey];

			if(curArgKey === 'model_type') {
				patchObj.object_type = curArgVal;
			}
			else if(curArgKey === 'remove_relationships') {
				unrelates = curArgVal;
			}
			else if(curArgKey === 'add_relationships') {
				relates = curArgVal;
			}
			else {
				patchObj[curArgKey] = curArgVal;
			}
		}

		entityMethods.update(patchObj, relates, unrelates)
		.then(function(update_res) {
			deferred.resolve(update_res);
		})
		.fail(function(err) {
			if(err !== undefined && err !== null && typeof(err.AddToError) === 'function') {
                err.setMessages('error updating entity', 'Problem updating model');
				deferred.reject(err.AddToError(__filename, 'PATCH model'));
            }
            else {
                var errorObj = new ErrorObj(500,
                                            'md0003',
                                            __filename,
                                            'model',
                                            'error updating model',
                                            'Error updating model',
                                            err
                                            );
                deferred.reject(errorObj);
            }
		});

		deferred.promise.nodeify(callback);
		return deferred.promise;
	}
};

Models.prototype.delete = {
	model: function(req, callback) {
		var deferred = Q.defer();
		var args = req.body;
		var deleteObj = {};
		var objType = null;

		var argKeys = Object.keys(args);
		for(var pIdx = 0; pIdx < argKeys.length; pIdx++) {
			var curArgKey = argKeys[pIdx];
			var curArgVal = args[curArgKey];

			if(curArgKey === 'model_type') {
				objType = curArgVal;
			}
			else if(curArgKey === 'id') {
				deleteObj['id'] = curArgVal;
			}
		}

		entityMethods.delete(objType, deleteObj)
		.then(function(delete_res) {
			deferred.resolve(delete_res);
		})
		.fail(function(err) {
			if(err !== undefined && err !== null && typeof(err.AddToError) === 'function') {
                err.setMessages('error deleting entity', 'Problem deleting model');
				deferred.reject(err.AddToError(__filename, 'DELETE model'));
            }
            else {
                var errorObj = new ErrorObj(500,
                                            'md0004',
                                            __filename,
                                            'model',
                                            'error deleting model',
                                            'Error deleting model',
                                            err
                                            );
                deferred.reject(errorObj);
            }
		});

		deferred.promise.nodeify(callback);
		return deferred.promise;
	}
};

// =================================================
// UTILITY FUNCTIONS
// =================================================


exports.models = Models;
