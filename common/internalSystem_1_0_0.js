// ===============================================================================
// INTERNAL SYSTEM WEB SERVICE CALLS v1.0.0
// ===============================================================================
var Q = require('q');
var os = require('os');
var fs = require('fs')

class InternalSystem {
  constructor(da, utils, ac, sr, st) {
    this.dataAccess = da;
    this.utilities = utils;
    this.accessControl = ac;
    this.serviceRegistration = sr;
    this.settings = st;

    this.get = {
      version: this.#version.bind(this),
      headerTokenKey: this.#headerTokenKey.bind(this),
      health: this.#health.bind(this),
      endpoint: this.#endpoint.bind(this)
    };
    this.post = {
      reload: this.#reload,
      endpoint: this.#post_endpoint.bind(this)
    };
    this.patch = {
      endpoint: this.#patch_endpoint.bind(this)
    };
    this.delete = {
      endpoint: this.#delete_endpoint.bind(this)
    };
  }

  #version(req, callback) {
    var deferred = Q.defer();
		var pkgJson = JSON.parse(fs.readFileSync('package.json', 'utf8'))
		var version = pkgJson.version;
		
		var resolveObj = {version};
		deferred.resolve(resolveObj);

		deferred.promise.nodeify(callback);
		return deferred.promise;
  }

  #headerTokenKey(req, callback) {
		var deferred = Q.defer();
		var tokenKey = this.settings.token_header;

		var resolveObj = {"header_token_key": tokenKey};
		deferred.resolve(resolveObj);

		deferred.promise.nodeify(callback);
		return deferred.promise;
	}

  #endpoint(req, callback) {
		var deferred = Q.defer();
		this.serviceRegistration.getAllServiceCalls()
		.then((serviceCalls) => {
			var resolveObj = {available: true, endpoints: serviceCalls};
			deferred.resolve(resolveObj);
		})
		.fail((err) => {
			if(err !== undefined && err !== null && typeof(err.AddToError) === 'function') {
                err.setMessages('error getting endpoints', 'Problem getting endpoints');
				deferred.reject(err.AddToError(__filename, 'endpoint'));
      }
      else {
          var errorObj = new ErrorObj(500,
                                      'is1001',
                                      __filename,
                                      'endpoint',
                                      'error getting endpoints',
                                      'Error getting endpoints',
                                      err
                                      );
          deferred.reject(errorObj);
      }
		});

		deferred.promise.nodeify(callback);
		return deferred.promise;
	}

  #health(req, callback) {
		var deferred = Q.defer();

		var interfaces = os.networkInterfaces();
		var ips = [];
		for (var i in interfaces) {
		    for (var j in interfaces[i]) {
		        var address = interfaces[i][j];
		        if (address.family === 'IPv4' && !address.internal) {
		            ips.push(address.address);
		        }
		    }
		}

		var healthObj = {
			'status': 'ok',
			'ip': ips,
			'datetime': new Date()
		};

		var resolveObj = healthObj;
		deferred.resolve(resolveObj);

		deferred.promise.nodeify(callback);
		return deferred.promise;
	}

  #reload(req, callback) {
		var deferred = Q.defer();
		console.log('----------------------------------------------');
		console.log('----------------------------------------------');
		console.log('RELOADING');
		console.log('initiated by: '+req.connection.remoteAddress);
		console.log('received at: '+new Date());
		console.log('');

		this.accessControl.reload()
		.then((ac_res) => {
			console.log('Access Control reloaded');
			return this.settings.reload();
		})
		.then((set_res) => {
			console.log('Settings reloaded');
			return this.serviceRegistration.reload();
		})
		.then((sr_res) => {
			console.log('Service Registration reloaded');
			console.log('----------------------------------------------');
			console.log('');

			var resolveObj = {'success': true};
			deferred.resolve(resolveObj);
		})
		.fail((err) => {
			if(err !== undefined && err !== null && typeof(err.AddToError) === 'function') {
                err.setMessages('error reloading configs', 'Problem reloading configs');
				deferred.reject(err.AddToError(__filename, 'reload'));
            }
            else {
                var errorObj = new ErrorObj(500,
                                            'is1002',
                                            __filename,
                                            'reload',
                                            'error reloading configs',
                                            'Error reloading configs',
                                            err
                                            );
                deferred.reject(errorObj);
            }
		});

		deferred.promise.nodeify(callback);
		return deferred.promise;
	}

  #post_endpoint(req, callback) {
		var deferred = Q.defer();
		var inputArgs = req.body;
		var call = inputArgs.call;
		var area = inputArgs.area;
		var controller = inputArgs.controller;
		var verb = inputArgs.verb;
		var version = inputArgs.version;
		var args = inputArgs.args;
		var authRequired = inputArgs.authRequired;
		var description = inputArgs.description;
		this.serviceRegistration.registerServiceCall(call, area, controller, verb, version, args, authRequired, description)
		.then((registration_result) => {
			return this.serviceRegistration.getAllServiceCalls();
		})
		.then((serviceCalls) => {
			var resolveObj = {endpoints: serviceCalls};
			deferred.resolve(resolveObj);
		})
		.fail((err) => {
			if(err !== undefined && err !== null && typeof(err.AddToError) === 'function') {
                err.setMessages('error creating endpoint', 'Problem creating endpoint');
				deferred.reject(err.AddToError(__filename, 'endpoint'));
            }
            else {
                var errorObj = new ErrorObj(500,
                                            'is1003',
                                            __filename,
                                            'endpoint',
                                            'error creating endpoint',
                                            'Error creating endpoint',
                                            err
                                            );
                deferred.reject(errorObj);
            }
		});

		deferred.promise.nodeify(callback);
		return deferred.promise;
	}

  #patch_endpoint(req, callback) {
		var deferred = Q.defer();
		var inputArgs = req.body;
		var call = inputArgs.call;
		var area = inputArgs.area;
		var controller = inputArgs.controller;
		var verb = inputArgs.verb;
		var version = inputArgs.version;
		var args = inputArgs.args;
		var authRequired = inputArgs.authRequired;
		var description = inputArgs.description;
		this.serviceRegistration.updateServiceCall(call, area, controller, verb, version, args, authRequired, description)
		.then((update_result) => {
			return this.serviceRegistration.getAllServiceCalls();
		})
		.then((serviceCalls) => {
			var resolveObj = {endpoints: serviceCalls};
			deferred.resolve(resolveObj);
		})
		.fail((err) => {
			if(err !== undefined && err !== null && typeof(err.AddToError) === 'function') {
                err.setMessages('error updating endpoint', 'Problem updating endpoint');
				deferred.reject(err.AddToError(__filename, 'endpoint'));
            }
            else {
                var errorObj = new ErrorObj(500,
                                            'is1004',
                                            __filename,
                                            'endpoint',
                                            'error updating endpoint',
                                            'Error updating endpoint',
                                            err
                                            );
                deferred.reject(errorObj);
            }
		})

		deferred.promise.nodeify(callback);
		return deferred.promise;
	}

  #delete_endpoint(req, callback) {
		var deferred = Q.defer();
		var inputArgs = req.body;
		var call = inputArgs.call;
		var area = inputArgs.area;
		var controller = inputArgs.controller;
		var verb = inputArgs.verb;
		var version = inputArgs.version;

		this.serviceRegistration.deleteServiceCall(call, area, controller, verb, version)
		.then((delete_res) => {
			return this.serviceRegistration.getAllServiceCalls();
		})
		.then((serviceCalls) => {
			var resolveObj = {endpoints: serviceCalls};
			deferred.resolve(resolveObj);
		})
		.fail((err) => {
			if(err !== undefined && err !== null && typeof(err.AddToError) === 'function') {
                err.setMessages('error deleting endpoint', 'Problem deleting endpoint');
				deferred.reject(err.AddToError(__filename, 'endpoint'));
            }
            else {
                var errorObj = new ErrorObj(500,
                                            'is1005',
                                            __filename,
                                            'endpoint',
                                            'error deleting endpoint',
                                            'Error deleting endpoint',
                                            err
                                            );
                deferred.reject(errorObj);
            }
		});

		deferred.promise.nodeify(callback);
		return deferred.promise;
	}
}

module.exports = InternalSystem;
