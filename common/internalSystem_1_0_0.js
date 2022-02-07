// ===============================================================================
// INTERNAL SYSTEM WEB SERVICE CALLS v1.0.0
// ===============================================================================
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

  #version(req) {
		var pkgJson = JSON.parse(fs.readFileSync('package.json', 'utf8'));
		var version = pkgJson.version;
		return Promise.resolve({"version": version});
  }

  #headerTokenKey(req) {
    return Promise.resolve({"header_token_key": this.settings.token_header});
	}

  #endpoint(req) {
    return new Promise((resolve, reject) => {
      this.serviceRegistration.getAllServiceCalls()
      .then((serviceCalls) => {
        resolve(serviceCalls);
      })
      .catch((err) => {
        if(err !== undefined && err !== null && typeof(err.AddToError) === 'function') {
                  err.setMessages('error getting endpoints', 'Problem getting endpoints');
          reject(err.AddToError(__filename, 'endpoint'));
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
            reject(errorObj);
        }
      });
    });
	}

  async #health(req) {
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
