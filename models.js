var Q = require('q');
var fs = require('fs');
var AWS = require('aws-sdk');
var s3;
var bucket = null;
var file = null;
var remoteSettings = null;
var settings;

var Models = function(s) {
	s3 = new AWS.S3();
	settings = s;
};

Models.prototype.init = function(b, f, rs) {
	var deferred = Q.defer();

	bucket = b;
	file = f;
	remoteSettings = rs;
	if(remoteSettings == null || remoteSettings === false) {
		try {
			if(file.substring(0,2) !== './') file = './'+file;
			Models.prototype.data = require(file);
			deferred.resolve(true);
		}
		catch(e) {
			var errorObj = new ErrorObj(500, 
										'm0001', 
										__filename, 
										'init', 
										'error fetching models file',
										'Config error',
										e
										);
			deferred.reject(errorObj);
		}
	}
	else {
		s3.getObject({Bucket: bucket, Key: file}, function(err, res) {
			if(!err) {
				var f = JSON.parse(res.Body.toString());
				Models.prototype.data = f;
				deferred.resolve(true);
			}
			else {
				var errorObj = new ErrorObj(500, 
											'm0002', 
											__filename, 
											'init', 
											'error getting file from S3',
											'S3 error',
											err
											);
				deferred.reject(errorObj);
			}
		});
	}

	return deferred.promise;
}


Models.prototype.reload = function() {
	var m = this;
	var deferred = Q.defer();
	m.init(bucket, file, remoteSettings)
	.then(function(res) {
		deferred.resolve(res);
	})
	.fail(function(err) {
		if(err !== undefined && err !== null && typeof(err.AddToError) === 'function') {
			deferred.reject(err.AddToError(__filename, 'reload'));
		}
		else {
			var errorObj = new ErrorObj(500, 
										'm1002', 
										__filename, 
										'reload', 
										'error reloading configs',
										'Error reloading configs',
										err
										);
			deferred.reject(errorObj);
		}
	});
	return deferred.promise;
}

Models.prototype.save = function(doNetworkReload) {
	var deferred = Q.defer();
	if(remoteSettings == null || remoteSettings === false) {
		var fswrite = Q.denodeify(fs.writeFile);
		fswrite(file, JSON.stringify(this.constructor.prototype.data, null, 4))
		.then(function(write_res) {
			deferred.resolve(true);
		})
		.fail(function(err) {
			var errorObj = new ErrorObj(500, 
										'm0003', 
										__filename, 
										'save',
										'error with fswrite()',
										'External Error',
										err
										);
			deferred.reject(errorObj);
		});
	}
	else {
		s3.putObject({Bucket:bucket, Key:file, Body:JSON.stringify(this.constructor.prototype.data, null, 4)}, function(err, save_res) {
			if(!err) {
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
														'm1003', 
														__filename, 
														'save',
														'error reloading network',
														'Error reloading network',
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
											'm0004', 
											__filename, 
											'save',
											'error writing models file to s3',
											'S3 error',
											err
											);
				deferred.reject(errorObj);
			}
		});
	}

	return deferred.promise;
};


exports.Models = Models;
