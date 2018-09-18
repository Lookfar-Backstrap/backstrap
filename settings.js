var Q = require('q');
var fs = require('fs');
var AWS = require('aws-sdk');
var os = require('os');
var request = require('request');
var s3;
var bucket = null;
var file = null;
var remoteSettings = null;
var port = null;

var Settings = function() {
	s3 = new AWS.S3();
};

Settings.prototype.init = function(b, f, rs) {
	var deferred = Q.defer();
	var s = this;
	bucket = b;
	file = f;
	remoteSettings = rs;

	if(remoteSettings === undefined || remoteSettings === null || remoteSettings === false) {
		try {
			if(file.substring(0,2) !== './') file = './'+file;
			Settings.prototype.data = require(file);
			port = process.env.PORT || s.data.server_port;
			deferred.resolve(true);
		}
		catch(e) {
			deferred.reject(e);
		}
	}
	else {
		s3.getObject({Bucket: bucket, Key: file}, function(err, res) {
			if(!err) {
				var f = JSON.parse(res.Body.toString());
				Settings.prototype.data = JSON.parse(JSON.stringify(f));
				deferred.resolve(true);
			}
			else {
				var errorObj = new ErrorObj(500, 
											'se0001', 
											__filename, 
											'init', 
											'error getting file from s3',
											'S3 error',
											err
											);
				deferred.reject(errorObj);
			}
		});
	}

	return deferred.promise;
}

Settings.prototype.registerIp = function() {
	var deferred = Q.defer();

	var s = this;
	port = process.env.PORT || s.data.server_port;

	// MAKE SURE THAT THE IP FOR THIS SERVER IS IN THE LIST
	var interfaces = os.networkInterfaces();
	var ips = s.data.servers;
	var addedIp = false;
	for (var i in interfaces) {
	    for (var j in interfaces[i]) {
	        var address = interfaces[i][j];
	        if (address.family === 'IPv4' && !address.internal) {
	        	var addressWithPort = address.address+':'+port;
	        	if(ips.indexOf(addressWithPort) == -1) {
	            	ips.push(addressWithPort);
	            	addedIp = true;
	        	}
	        }
	    }
	}

	if(addedIp) {
		s.data.servers = ips;
		s.save(true)
		.then(function(save_res) {
			deferred.resolve(true);
		})
		.fail(function(err) {
			var errorObj = new ErrorObj(500, 
										'se0002', 
										__filename, 
										'registerIp', 
										'error saving ip of server',
										'Error',
										err
										);
			deferred.reject(errorObj);
		});
	}
	else {
		deferred.resolve(true);
	}

	return deferred.promise;
}

Settings.prototype.reload = function() {
	var s = this;
	var deferred = Q.defer();
	s.init(bucket, file, remoteSettings)
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

// IF REMOTE SETTINGS IS FALSE, THIS GETS BYPASSED
Settings.prototype.reloadNetwork = function() {
	var deferred = Q.defer();
	if(remoteSettings === true) {
		var settings = this;
		port = process.env.PORT || s.data.server_port;

		var interfaces = os.networkInterfaces();
		var myIps = [];
		for (var i in interfaces) {
		    for (var j in interfaces[i]) {
		        var address = interfaces[i][j];
		        if (address.family === 'IPv4' && !address.internal) {
		        	var addressWithPort = address.address+':'+port;
		        	if(myIps.indexOf(addressWithPort) == -1) {
		            	myIps.push(addressWithPort);
		        	}
		        }
		    }
		}

		var ips = settings.data.servers;

		var headers = {
			'Content-Type': 'application/json'
		};

		var postData = {
			'username': settings.data.reload_user,
			'password': settings.data.reload_pass
		};

		if((myIps.length !== ips.length && myIps.length > 0)) {
			// LOGIN
			request.post({
					url: 'http://'+myIps[0]+'/common/accounts/signin/1.0.0',
					headers: headers,
					body: postData,
					json: true
				}, 
				function(err, res, body) {
				if (!err && res.statusCode == 200) {
		            headers[settings.data.token_header] = body.data[settings.data.token_header];

		            // CALL EACH SERVER IN THE REGISTRY AND TELL IT TO RELOAD
					Q.all(ips.map(function(ip) {
						var inner_deferred = Q.defer();
						if(myIps.indexOf(ip) == -1) {
							request.post({
									headers: headers,
									url: 'http://'+ip+'/common/internalSystem/reload/1.0.0'
								},
								function(err, res, body) {
								if (!err && res.statusCode == 200) {
						            inner_deferred.resolve({'ip':ip});
						        }
						        else {
						        	settings.data.servers.splice(settings.data.servers.indexOf(ip),1);
						        	settings.save(false)
						        	.then(function(res) {
						        		inner_deferred.resolve({'ip':ip});
						        	})
						        	.fail(function(err) {
										if(err !== undefined && err !== null && typeof(err.AddToError) === 'function') {
											inner_deferred.reject(err.AddToError(__filename, 'reloadNetwork'));
										}
										else {
											var errorObj = new ErrorObj(500, 
																		'sr1003', 
																		__filename, 
																		'reloadNetwork', 
																		'error reloading network',
																		'Error reloading network',
																		err
																		);
											inner_deferred.reject(errorObj);
										}
						        	});
						        	
						        }
							});
						}
						else {
							// DON'T RELOAD SELF, JUST MARK AS COMPLETE
							inner_deferred.resolve({'ip':ip});
						}
						
						return inner_deferred.promise;
					}))
					.then(function(res) {
						deferred.resolve(true);
					})
					.fail(function(err) {
						if(err !== undefined && err !== null && typeof(err.AddToError) === 'function') {
							deferred.reject(err.AddToError(__filename, 'reloadNetwork'));
						}
						else {
							var errorObj = new ErrorObj(500, 
														'sr1004', 
														__filename, 
														'reloadNetwork', 
														'error reloading network',
														'Error reloading network',
														err
														);
							deferred.reject(errorObj);
						}
					});
		        }
		        else {
		        	var errorObj = new ErrorObj(500, 
												'se0003', 
												__filename, 
												'reloadNetwork', 
												'error signing into backstrap to reload servers',
												'Network reload error',
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
		deferred.resolve(true);
	}

	return deferred.promise;
}


Settings.prototype.save = function(doNetworkReload) {
	var s = this;
	var deferred = Q.defer();
	if(remoteSettings === undefined || remoteSettings === null || remoteSettings === false) {
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
	}
	else {
		s3.putObject({Bucket:bucket, Key:file, Body:JSON.stringify(this.constructor.prototype.data, null, 4)}, function(err, save_res) {
			if(!err) {
				if(doNetworkReload === true) {
					s.reloadNetwork()
					.then(function(reload_res) {
						deferred.resolve(true);
					})
					.fail(function(err) {
						if(err !== undefined && err !== null && typeof(err.AddToError) === 'function') {
							deferred.reject(err.AddToError(__filename, 'save'));
						}
						else {
							var errorObj = new ErrorObj(500, 
														'sr1005', 
														__filename, 
														'save', 
														'error saving settings remotely',
														'Error saving settings remotely',
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
											'se0005', 
											__filename, 
											'save', 
											'error saving file to s3',
											'S3 error',
											err
											);
				deferred.reject(errorObj);
			}
		});
	}
	return deferred.promise;
};

exports.Settings = Settings;
