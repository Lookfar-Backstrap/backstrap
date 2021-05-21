var Q = require('q');
var fs = require('fs');

var port = null;

var Settings = function(file) {
	var s = this;

  try {
    if(file.substring(0,2) !== './') file = './'+file;
    Settings.prototype.data = require(file);
    port = process.env.PORT || s.data.server_port;
  }
  catch(e) {
    console.error('Initialization Error - settings.js');
    console.log(e);
  }
};

Settings.prototype.reload = function() {
	var s = this;
	var deferred = Q.defer();
	s.init(bucket, file)
	.then(function(res) {
		deferred.resolve(res);
	})
	.fail(function(err) {
		if(err !== undefined && err !== null && typeof(err.AddToError) === 'function') {
			deferred.reject(err.AddToError(__filename, 'reload'));
		}
		else {
			var errorObj = new ErrorObj(500, 
										'se1002', 
										__filename, 
										'reload', 
										'error reloading settings',
										'Error reloading settings',
										err
										);
			deferred.reject(errorObj);
		}
	});
	return deferred.promise;
}

Settings.prototype.save = function() {
	var s = this;
	var deferred = Q.defer();
	
		var fswrite = Q.denodeify(fs.writeFile);
		fswrite(file, JSON.stringify(this.constructor.prototype.data, null, 4))
		.then(function(write_res) {
			deferred.resolve(true);
		})
		.fail(function(err) {
			var errorObj = new ErrorObj(500, 
										'se0004', 
										__filename, 
										'save', 
										'external error with fswrite',
										'External error',
										err
										);
			deferred.reject(errorObj);
		});
	
	return deferred.promise;
};

exports.Settings = Settings;
