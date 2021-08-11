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
    };
    this.patch = {
    };
    this.delete = {
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

  async #health(req, callback) {
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

		return Promise.resolve(healthObj);
	}
}

module.exports = InternalSystem;
