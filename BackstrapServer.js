/*jshint expr: true, es5: true, unused:false */

// ==================================================================================
// SETUP
// ==================================================================================
// ---------------------------------
// IMPORT MODULES
// ---------------------------------
var http = require('http');		// We'll create our server with the http module
var express = require('express');	// Import express to handle routing and server details
var cors = require('cors');		// Setup CORS
var path = require('path');			// Import path to control our folder structure
var bodyParser = require('body-parser');
var Q = require('q');
var fs = require('fs');
var async = require('async');


require('./ErrorObj');

var Settings = require('./settings').Settings;
var Endpoints = require('./endpoints').Endpoints;
var DataAccess = require('./dataAccess').DataAccess;
var ServiceRegistration = require('./serviceRegistration').ServiceRegistration;
var Controller = require('./controller').Controller;		// GETS THE CORRECT WEB SERVICE FILE AND ROUTES CALLS
var Utilities = require('./utilities').Utilities;
var AccessControl = require('./accessControl').AccessControl;
var Models = require('./models.js').Models;
var schemaControl = require('./schema.js');

// ---------------------------------
// SETUP EXPRESS
// ---------------------------------
var app = express();
app.set('views', path.join(__dirname, 'views'));	// MAP views TO FOLDER STRUCTURE
app.set('view engine', 'jade');						// USE JADE FOR TEMPLATING

app.use(bodyParser.json({ limit: '50mb' }));		// THIS IS A HIGH LIMIT SINCE BACKSTRAP ALLOWS BASE64 ENCODED FILE UPLOAD
app.use(bodyParser.urlencoded({ extended: true }));			// DETERMINE IF THIS IS HTML OR JSON REQUEST
app.use(express.static(path.join(__dirname, 'public')));	// MAP STATIC PAGE CALLS TO public FOLDER
app.use(cors());


//Settings File, contains DB params
var nodeEnv = process.env.NODE_ENV || 'local';
var configFile = './config/config.' + nodeEnv + '.js';
var config = require(configFile);

var rsString = process.env.BS_REMOTE || 'false';
rsString = rsString.toLowerCase();
var useRemoteSettings = rsString == 'true' ? true : false;

var connectionString =
	'postgres://' + config.db.user + ':' + config.db.pass + '@' + config.db.host + ':' + config.db.port + '/' + config.db.name;  // DATABASE

console.log('==================================================');
console.log('INITIALIZATION');
console.log('==================================================');

var models;
var endpoints;
var dataAccess;
var serviceRegistration;
var utilities;
var accessControl;
var mainController;

var errorLog;
var sessionLog;
var accessLog;
var eventLog;

var settings = new Settings();
settings.init(config.s3.bucket, 'Settings.json', useRemoteSettings)
	.then(function (settings_res) {
		console.log('Settings initialized');
		utilities = new Utilities(settings);
		console.log('Utilities initialized');
		models = new Models(settings, utilities);
		return models.init(config.s3.bucket, 'Models.json', useRemoteSettings);
	})
	.then(function (endpoints_res) {
		console.log('Models initialized');
		endpoints = new Endpoints(settings, utilities);
		return endpoints.init(config.s3.bucket, 'Endpoints.json', useRemoteSettings, utilities);
	})
	.then(function (model_res) {
		console.log('Endpoints initialized');

		dataAccess = new DataAccess(config, models.data.models, utilities);
		console.log('DataAccess initialized');
		//NOW SET THE DATA ACCESS VAR IN UTILITIES
		utilities.setDataAccess(dataAccess);
		serviceRegistration = new ServiceRegistration(dataAccess, endpoints, models, utilities);
		console.log('ServiceRegistration initialized');
		accessControl = new AccessControl(utilities, settings);
		return accessControl.init(config.s3.bucket, 'Security.json', useRemoteSettings);
	})
	.then(function (acl_res) {
		console.log('AccessControl initialized');
		mainController = new Controller(dataAccess, utilities, accessControl, serviceRegistration, settings, models);
		console.log('Controller initialized');
		// GENERATE ENDPOINTS FROM MODELS
		return endpoints.generateFromModels(models.data.models, false);
	})
	.then(function (ge_res) {
		console.log('Models generated');
		// CREATE ANY NEW DB TABLES BASED ON MODELS
		return schemaControl.updateSchema(models, config.db.name, config.db.user, config.db.pass, config.db.host, config.db.port, utilities)
	})
	.then(function (us_Res) {
    console.log('Schema updated');
    
    // GET HANDLES FOR LOG FILES
    let today = new Date();
    let todayString = today.getDay()+'-'+today.getMonth()+'-'+today.getFullYear();
    let errorLogPath = './logs/error-'+todayString;
    let accessLogPath = './logs/access-'+todayString;
    let sessionLogPath = './logs/session-'+todayString;
    let eventLogPath = './logs/event-'+todayString;

    errorLog = fs.createWriteStream(errorLogPath, {flags:'a'});
    if(settings.data.access_logging === true)
      accessLog = fs.createWriteStream(accessLogPath, {flags:'a'});
    if(settings.data.session_logging === true)  
      sessionLog = fs.createWriteStream(sessionLogPath, {flags:'a'});
    eventLog = fs.createWriteStream(eventLogPath, {flags:'a'});
    console.log('Log files opened');

    utilities.setLogs(eventLog, errorLog);
    

		// SERVER PORT
		app.set('port', process.env.PORT || settings.data.server_port);

		// STARTUP THE SESSION INVALIDATION -- CHECK EVERY X MINUTES
		var timeoutInMintues = settings.data.timeout;
		var invalidSessionTimer = setInterval(function () { checkForInvalidSessions(dataAccess, settings) }, settings.data.timeout_check * 60000);
		

		// ========================================================
		// SETUP ROUTE HANDLERS
		// ========================================================
		// ---------------------------------------------------------------------------------
		// GETS
		// ---------------------------------------------------------------------------------
		app.get('/:area/:controller/:serviceCall/:version?', function (req, res) {
			requestPipeline(req, res, 'GET');
		});
		// ---------------------------------------------------------------------------------
		// ---------------------------------------------------------------------------------

		// ---------------------------------------------------------------------------------
		// POSTS
		// ---------------------------------------------------------------------------------
		app.post('/:area/:controller/:serviceCall/:version?', function (req, res) {
			requestPipeline(req, res, 'POST');
		});
		// ---------------------------------------------------------------------------------
		// ---------------------------------------------------------------------------------
		// ---------------------------------------------------------------------------------
		// PUTS
		// ---------------------------------------------------------------------------------
		app.put('/:area/:controller/:serviceCall/:version?', function (req, res) {
			requestPipeline(req, res, 'PUT');
		});
		// ---------------------------------------------------------------------------------
		// ---------------------------------------------------------------------------------
		// ---------------------------------------------------------------------------------
		// PATCH
		// ---------------------------------------------------------------------------------
		app.patch('/:area/:controller/:serviceCall/:version?', function (req, res) {
			requestPipeline(req, res, 'PATCH');
		});
		// ---------------------------------------------------------------------------------
		// ---------------------------------------------------------------------------------
		// ---------------------------------------------------------------------------------
		// DELETES
		// ---------------------------------------------------------------------------------
		app.delete('/:area/:controller/:serviceCall/:version?', function (req, res) {
			requestPipeline(req, res, 'DELETE');
		});
		// ---------------------------------------------------------------------------------
		// ---------------------------------------------------------------------------------

		app.get('*', function (req, res) {
			res.status(404).send({ 'Error': 'Route/File Not Found' });
		});

		app.use(function (err, req, res, next) {
			if (req.xhr) {
				if (err instanceof SyntaxError && err.status === 400 && 'body' in err) {
					console.error('Bad JSON');
					res.status(400).send({ 'message': 'json body malformed' });
				}
				else {
					res.status(500).send({ 'message': 'unknown error' });
				}
			}
			else {
				next(err);
			}
		});

		// -----------------------------------
		// LAUNCH THE SERVER
		// -----------------------------------
		http.createServer(app).listen(app.get('port'), function () {
			console.log('----------------------------------------------');
			console.log('----------------------------------------------');
			console.log('Express server listening on port ' + app.get('port'));
			console.log('');

			if (useRemoteSettings) {
				settings.registerIp()
				.then(function (res) {
					console.log('Running in distributed mode');
				})
				.fail(function (err) {
					console.error('Problem registering ip');
				});
			}
		});
	})
	.fail(function (err) {
		console.log('Initialization Failure');
		console.log(err);
		return 2;
	});


// ================================================
// MAIN REQUEST PIPELINE
// ================================================
function requestPipeline(req, res, verb) {
  var params = req.params;
  var area = params.area;
  var controller = params.controller;
  var serviceCall = params.serviceCall;
  var args;
  if(verb.toLowerCase() === 'get') {
    args = req.query;
  }
  else if(verb.toLowerCase() === 'delete') {
    // CHECK THE BODY FIRST, IF THERE IS NO BODY OR THE BODY IS EMPTY
    // CHECK THE QUERY STRING.
    args = req.body;
    if (utilities.isNullOrUndefinedOrZeroLength(args)) {
      args = {};
    }
    var argKeys = Object.keys(args);
    if (argKeys.length === 0) {
      args = req.query;
      req.body = req.query;
    }
  }
  else {
    args = req.body;
  }

  var version = params.version;

  var accessLogEvent;
  if(settings.data.access_logging === true) {
    var endpointString = area+'/'+controller+'/'+serviceCall+'/'+version;
    var ips = req.headers['x-forwarded-for'] || req.connection.remoteAddress;
    accessLogEvent = {
      start_timestamp: new Date().toISOString(),
      endpoint: endpointString,
      user_agent: req.headers['user-agent'],
      ips: ips
    };
  }

  serviceRegistration.serviceCallExists(serviceCall, area, controller, verb, version)
  .then(function (sc) {
    if (sc.authRequired) {
      return [sc, mainController.validateToken(req.headers[settings.data.token_header])];
    }
    else {
      return [sc, utilities.validateTokenAndContinue(req.headers[settings.data.token_header])];
    }
  })
  .spread(function(sc, validTokenResponse) {
    var inner_deferred = Q.defer();
    if(validTokenResponse.is_valid === true) {
      if(settings.data.access_logging === true)
        accessLogEvent.session_id = validTokenResponse.session.id;

      dataAccess.joinOne({object_type:'session', id:validTokenResponse.session.id}, 'bsuser')
      .then(function(usr) {
        inner_deferred.resolve(usr);
      })
      .fail(function() {
        inner_deferred.resolve(null);
      });
    }
    else {
      inner_deferred.resolve(null);
    }
    return [sc, validTokenResponse, inner_deferred.promise];
  })
  .spread(function (sc, validTokenResponse, userOrNull) {
    //PUT THE USER OBJECT ON THE REQUEST
    if(userOrNull !== null) {
      req.this_user = userOrNull;
    }
    if (sc.authRequired) {
      return [sc, true, accessControl.verifyAccess(req, sc)];
    }
    else {
      var hasValidToken = false;
      if (validTokenResponse.hasOwnProperty('is_valid') && validTokenResponse.is_valid === true) {
        hasValidToken = true;
      }
      return [sc, hasValidToken];
    }
  })
  .spread(function (sc, hasValidToken) {
    return [sc, hasValidToken, serviceRegistration.validateArguments(serviceCall, area, controller, verb, version, args)];
  })
  .spread(function (sc, hasValidToken) {
    return mainController.resolveServiceCall(sc, req, hasValidToken);
  })
  .then(function (results) {
    // IF ACCESS LOGGING IS ENABLED.  ADD THE END TIMESTAMP
    // AND RESPONSE STATUS NUM TO THE ACCESS LOG EVENT AND
    // WRITE IT TO THE LOG
    if(settings.data.access_logging === true) {
      accessLogEvent.end_timestamp = new Date().toISOString();
      accessLogEvent.http_status = 200;
      let logEntry = JSON.stringify(accessLogEvent)+'\n';
      accessLog.write(logEntry);
    }

    res.status(200).send(results);
  })
  .fail(function (err) {
    if (err.http_status === null) {
      err.http_status = 500;
    }

    if (err.message == null || err.message.length === 0) {
      err['message'] = 'Something went wrong and we are working to fix it. Please try again later.'
    }

    // IF ACCESS LOGGING IS ENABLED.  ADD THE END TIMESTAMP
    // AND RESPONSE STATUS NUM TO THE ACCESS LOG EVENT AND
    // WRITE IT TO THE LOG
    if(settings.data.access_logging === true) {
      accessLogEvent.end_timestamp = new Date().toISOString();
      accessLogEvent.http_status = err.http_status;
      let logEntry = JSON.stringify(accessLogEvent)+'\n';
      accessLog.write(logEntry);
    }

    errorLog.write(JSON.stringify(err));

    res.status(err.http_status).send(err);
  });
}


// -----------------------------------
// PRINT OBJECT AS JSON TO CONSOLE
// -----------------------------------
function printObject(obj) {
	console.log(JSON.stringify(obj, null, 4));
}


// ----------------------------------------
// CHECK FOR SESSIONS WHICH HAVE TIMED OUT
// ----------------------------------------
function checkForInvalidSessions(dataAccess, settings, callback) {
	//THIS FUNCTION INTENTIONALLY USES NEW DATA ACCESS FUNCTIONS THAT RETURN row_id UPON CREATING 
	//SO WE DONT HAVE THE OVERHEAD OF RE-RESOLVING THEM LATER USING THE BUILT-IN DA FUNCTIONS

	//SET UTILITIES DATA ACCESS
	var deferred = Q.defer();
	//THIS RETURNS STALE SESSIONS
	dataAccess.GetDeadSessions(settings.data.timeout)
	.then(function (deadSessions) {
    var dsIds = [];
    // IF LOGGING SESSIONS, WRITE OUT THE DEAD SESSIONS TO
    // THE SESSION LOG
    for(var sIdx = 0; sIdx < deadSessions.length; sIdx++) {
      let dsid = "'"+deadSessions[sIdx].rid+"'";
      dsIds.push(dsid);
      
      if(settings.data.session_logging === true) {
        let dsObj = {
          session_id: deadSessions[sIdx].data.id,
          token: deadSessions[sIdx].data.token,
          user_id: deadSessions[sIdx].data.user_id,
          started_at: deadSessions[sIdx].data.started_at,
          ended_at: new Date()
        }
        var logEntry = JSON.stringify(dsObj)+'\n';
        sessionLog.write(logEntry);
      }
    }

    if(dsIds.length > 0) {
      dataAccess.DeleteSessions(dsIds)
      .then(function(res) {
        deferred.resolve();
      })
      .fail(function(err) {
        let logEntry = JSON.stringify(err)+'\n';
        errorLog.write(logEntry);
        deferred.resolve();
      })
    }
    else {
      deferred.resolve();
    }
	});
	deferred.promise.nodeify(callback);
	return deferred.promise;
}