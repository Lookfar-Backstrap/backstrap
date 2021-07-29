// ===============================================================================
// ANALYTICS WEB SERVICE CALLS v1.0.0
// ===============================================================================
var Q = require('q');

class Analytics {
  constructor(da, utils, ac, sr, st) {
    this.dataAccess = da;
    this.utilities = utils;
    this.accessControl = ac;
    this.serviceRegistration = sr;
    this.settings = st;

    this.get = {};
    this.post = {
      event: this.#event.bind(this)
    };
    this.patch = {};
    this.put = {};
    this.delete = {};
  }

  #event(req, callback) {
		var deferred = Q.defer();

		var eventDescriptor = req.body.event_descriptor;
		var tkn = req.headers[settings.token_header];

		this.utilities.logEvent(tkn, eventDescriptor)
		.then(function(logEvent_res) {
			deferred.resolve({success: true});
		})
		.fail(function(err) {
			deferred.reject(err);
		})

		deferred.promise.nodeify(callback);
		return deferred.promise;
	}
}

module.exports = Analytics;
