// ===============================================================================
// ANALYTICS WEB SERVICE CALLS v1.0.0
// ===============================================================================
var dataAccess;
var utilities;
var accessControl;
var serviceRegistration;
var settings;
var models;

var Q = require('q');

var Analytics = function(da, utils, ac, sr, st, m) {
	dataAccess = da;
	utilities = utils;
	accessControl = ac;
	serviceRegistration = sr;
	settings = st;
	models = m;
};

Analytics.prototype.get = {

};

Analytics.prototype.post = {
	event: function(req, callback) {
		var deferred = Q.defer();

		var eventDescriptor = req.body.event_descriptor;
		var tkn = req.headers[settings.data.token_header];

		utilities.logEvent(tkn, eventDescriptor)
		.then(function(logEvent_res) {
			deferred.resolve({success: true});
		})
		.fail(function(err) {
			deferred.reject(err);
		})

		deferred.promise.nodeify(callback);
		return deferred.promise;
	}
};

Analytics.prototype.put = {

};

Analytics.prototype.patch = {

};

Analytics.prototype.delete = {

};

exports.analytics = Analytics;
