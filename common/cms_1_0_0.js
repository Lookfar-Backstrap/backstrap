var Q = require('q');
var fs = require('fs');
var crypto = require('crypto');

var dataAccess;
var utilities;
var accessControl;
var serviceRegistration;
var settings;
var models;

const path = require('path');
const rootDir = path.dirname(require.main.filename);

var schemaController = require('../schema.js');

//Settings File, contains DB params
var nodeEnv = process.env.NODE_ENV || 'local';
var settingsFile = rootDir+'/config/config.' + nodeEnv + '.js';
var config;
try {
	config = require(settingsFile);
}
catch(e) {
	settingsFile = '../config/config.'+nodeEnv+'.js';
	config = require(settingsFile);
}

var rsString = process.env.BS_REMOTE || 'false';
rsString = rsString.toLowerCase();
var useRemoteSettings = rsString == 'true' ? true : false;


var Cms = function(da, util, ac, sr, st, m) {
	dataAccess = da;
	utilities = util;
	accessControl = ac;
	serviceRegistration = sr;
	settings = st;
	models = m;
};

Cms.prototype.get = {
	file: function(req, callback) {
        var requestedFile = req.query.file_name;
        var deferred = Q.defer();       
        var returnObj;
        if(requestedFile === 'models') {
        	returnObj = {models: models.data.models};
        }
        else if(requestedFile === 'security') {
        	returnObj = {roles: accessControl.data.roles};
        }
        else {
        	var errorObj = new ErrorObj(500, 
									'cm0001', 
									__filename, 
									'unknown file'
									);
        	deferred.reject(errorObj);
        }

        // ADD EVENT TO SESSION
		var resolveObj = returnObj;
		deferred.resolve(resolveObj);

        deferred.promise.nodeify(callback);
		return deferred.promise;
	}
};

Cms.prototype.post = {	
	file: function(req, callback) {
		var body = req.body;
        var file_object = body.file_object;
        var deferred = Q.defer();
        if (file_object.type === 'models'){
			models.data.models = file_object.data;
			models.save(false)
			.then(function(success){
				return schemaController.updateSchema(models, config.db.name, config.db.user, config.db.pass, config.db.host, config.db.port, utilities);
			})
			.then(function(schemaUpdate_res) {
				return serviceRegistration.updateFromModels(false);
			})
			.then(function(endptsUpdate_res) {
				return settings.reloadNetwork();
			})
			.then(function(reloadNetwork_res) {
				var resolveObj = {models: models.data.models};
				deferred.resolve(resolveObj);
			})
			.fail(function(err){
				if(err !== undefined && err !== null && typeof(err.AddToMessage) === 'function') {
					err.setMessages('error writing models config file', 'Problem updating models config file');
					deferred.reject(err.AddToError(__filename, 'file'));
				}
				else {
					var errorObj = new ErrorObj(500, 
												'cm0002', 
												__filename, 
												'file', 
												'error saving models config file',
												'Error saving models config file',
												err
												);
					deferred.reject(errorObj);
				}
			});
		}
		else if (file_object.type === 'security'){
			var objSecurity = { roles: file_object.data };

			accessControl.data = objSecurity;
			accessControl.save(true)
			.then(function(success) {
				var resolveObj = {roles: models.data.roles};
				deferred.resolve(resolveObj);
			})
			.fail(function(err) {
				if(err !== undefined && err !== null && typeof(err.AddToMessage) === 'function') {
					err.setMessages('error writing security config file', 'Problem updating security config file');
					deferred.reject(err.AddToError(__filename, 'file'));
				}
				else {
					var errorObj = new ErrorObj(500, 
												'cm0003', 
												__filename, 
												'file', 
												'error saving security config file',
												'Error saving security config file',
												err
												);
					deferred.reject(errorObj);
				}
			});
		}			
        else{
             var errorObj = new ErrorObj(500, 
										'cm0004', 
										__filename, 
										'file', 
										'error saving file'
										);
             deferred.reject(errorObj);
        }

        deferred.promise.nodeify(callback);
		return deferred.promise;
	}
};

Cms.prototype.put = {

};

Cms.prototype.patch = {

};

Cms.prototype.delete = {
	
};


exports.cms = Cms;
