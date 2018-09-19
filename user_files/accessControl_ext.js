var Q = require('q');

var AccessControlExtension = function(ac, util, s) {
	this.utilities = util;
	this.settings = s;
	this.accessControl = ac;
}

module.exports = AccessControlExtension;