var Q = require('q');

var UtilitiesExtension = function(u, da, s) {
	this.dataAccess = da;
	this.settings = s;
	this.utilities = u;
}

module.exports = UtilitiesExtension;