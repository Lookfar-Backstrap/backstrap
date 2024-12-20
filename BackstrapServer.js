// ==================================================================================
// SETUP
// ==================================================================================
// ---------------------------------
// IMPORT MODULES
// ---------------------------------
const http = require('http');		// We'll create our server with the http module
const express = require('express');	// Import express to handle routing and server details
const cors = require('cors');		// Setup CORS
const path = require('path');			// Import path to control our folder structure
const rootDir = path.dirname(require.main.filename);
const fs = require('fs');
const multer = require('multer');
const upload = multer();

console.log('==================================================');
console.log('INITIALIZATION');
console.log('==================================================');

require('./ErrorObj');

var Settings = require('./settings');
var Endpoints = require('./endpoints');
var DataAccess = require('./dataAccess');
var ServiceRegistration = require('./serviceRegistration');
var Controller = require('./controller');		// GETS THE CORRECT WEB SERVICE FILE AND ROUTES CALLS
var Utilities = require('./utilities');
var AccessControl =  require('./accessControl');
var SchemaControl = require('./schemaControl.js');
var expressSettings;

// ---------------------------------
// SETUP EXPRESS
// ---------------------------------
var app = express();

const requestSizeLimit = (process.env.MAX_REQUEST_SIZE && !isNaN(process.env.MAX_REQUEST_SIZE) && Number(process.env.MAX_REQUEST_SIZE > 0)) ? process.env.MAX_REQUEST_SIZE+'mb' : '50mb';
app.use(express.json({ limit: requestSizeLimit }));		// THIS IS A HIGH DEFAULT LIMIT SINCE BACKSTRAP ALLOWS BASE64 ENCODED FILE UPLOAD
app.use(express.urlencoded({ extended: true }));			// DETERMINE IF THIS IS HTML OR JSON REQUEST
// UPLOAD FILES AS form-data IN A FIELD CALLED "mpfd_files"
app.use(upload.array("mpfd_files", 10));
app.use(cors());

// PASS THE HANDLE TO THE EXPRESS APP INTO
// express_init.js SO THE USER CAN ADD EXPRESS MODULES
try {
  expressSettings = require(`${rootDir}/expressSettings`);
}
catch(esErr) {
  console.warn('ExpressSettings could not be created.')
  console.warn(esErr);
}
try {
  expressSettings.init(app);
}
catch(expressInitErr) {
  console.error('ExpressSettings initialization failed');
  console.error(expressInitErr);
}


if(process.env.DEBUG_MODE != null && (process.env.DEBUG_MODE === true || process.env.DEBUG_MODE.toString().toLowerCase() === 'true')) {
  process.on('warning', e => console.warn(e.stack));       // USEFUL IN DEBUGGING
  process.on('unhandledRejection', r => console.log(r));   // USEFUL IN DEBUGGING
}


//Config File, contains DB params
var config;
var nodeEnv = process.env.NODE_ENV || 'local';
var configFile = `${rootDir}/dbconfig/dbconfig.${nodeEnv}.js`;
try {
  config = require(configFile);
}
catch(e) {
  console.error('INITIALIZATION ERROR -- dbconfig');
  console.error(e);
  throw {message: 'problem loading database config file', error: e};
}

var errorLog;
var sessionLog;
var accessLog;
var eventLog;

console.log('Settings initialized');
Utilities.init(Settings);
console.log('Utilities initialized');
Endpoints.init(Settings);
console.log('Endpoints initialized');
DataAccess.init(config, Utilities, Settings);
console.log('DataAccess initialized');
//NOW SET THE DATA ACCESS VAR IN UTILITIES
Utilities.setDataAccess(DataAccess);
ServiceRegistration.init(Endpoints);
console.log('ServiceRegistration initialized');
AccessControl.init(Utilities, Settings, DataAccess, 'Security.json')
.then((aclRes) => {
  console.log('AccessControl initialized');
  return Controller.init(DataAccess, Utilities, AccessControl, ServiceRegistration, Settings, Endpoints);
})
.then((cInit) => {
  console.log('Controller initialized');
  SchemaControl.init(DataAccess, AccessControl)
  return SchemaControl.update(config.db.name, config.db.user, config.db.pass, config.db.host, config.db.port)
})
.then((schemaUpd) => {
  // CREATE A LOG DIRECTORY IF NEEDED
  // DO IT SYNCHRONOUSLY WHICH IS ALRIGHT SINCE THIS IS JUST ONCE
  // DURING STARTUP
  if(!fs.existsSync('./logs')) fs.mkdirSync('./logs');
  
  changeErrorLogs();
  Utilities.setLogs(eventLog, errorLog, sessionLog);
  console.log('Log files opened');

  // SERVER PORT
  app.set('port', process.env.PORT || Settings.port);

  // STARTUP THE SESSION INVALIDATION -- CHECK EVERY X MINUTES
  var invalidSessionTimer = setInterval(() => { checkForInvalidSessions(DataAccess, Settings) }, Settings.timeout_check * 60000);
  
  // EVERYTHING IS INITIALIZED.  RUN ANY INITIALIZATION CODE
  try {
    require(`${rootDir}/onInit`).run(DataAccess, Utilities, AccessControl, ServiceRegistration, Settings);
  }
  catch(onInitErr) {
    if(onInitErr && onInitErr.code === 'MODULE_NOT_FOUND') {
      console.log('Initialization script skipped -- no file found');
    }
    else {
      console.error(onInitErr);
    }
  }
  
  // ========================================================
  // SETUP ROUTE HANDLERS
  // ========================================================
  // ---------------------------------------------------------------------------------
  // OVERRIDES
  // ---------------------------------------------------------------------------------
  if(expressSettings) {
    try {
      expressSettings.overrideRoutes(app, DataAccess, Utilities);
    }
    catch(err) {
      console.error('Override Routes Failed');
    }
  }
  // ---------------------------------------------------------------------------------
  // GETS
  // ---------------------------------------------------------------------------------
  app.get('/:area/:controller/:serviceCall/:version?', function (req, res) {
    requestPipeline(req, res, 'GET');
  });
  app.get('/:area/:controller?', function (req, res) {
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
  app.post('/:area/:controller?', function (req, res) {
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
  app.put('/:area/:controller?', function (req, res) {
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
  app.patch('/:area/:controller?', function (req, res) {
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
  app.delete('/:area/:controller?', function (req, res) {
    requestPipeline(req, res, 'DELETE');
  });
  // ---------------------------------------------------------------------------------
  // ---------------------------------------------------------------------------------

  app.get('*', function (req, res) {
    res.status(404).send({ 'Error': 'Route/File Not Found' });
  });

  app.use((err, req, res, next) => {
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
  const server = http.Server(app).listen(app.get('port'), function () {
    console.log('\n');
    console.log('==============================================');
    console.log('**************** BACKSTRAP 3 *****************')
    console.log('==============================================');
    console.log('Express server listening on port ' + app.get('port'));
    console.log(new Date().toISOString());
    console.log('');
  });
  
  if(Settings.server_timeout != null) server.timeout = parseInt(Settings.server_timeout);
  if(Settings.keep_alive_timeout != null) server.keepAliveTimeout = parseInt(Settings.keep_alive_timeout);
  if(Settings.headers_timeout != null) server.headersTimeout = parseInt(Settings.headers_timeout);
})
.catch((err) => {
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
  var serviceCall
  if(!params.serviceCall) {
    if(Settings.index_service_call != null) {
      serviceCall = Settings.index_service_call;
    }
    else {
      serviceCall = "index";
    }
  }
  else{
    serviceCall = params.serviceCall;
  }
  
  var args;
   if(verb.toLowerCase() === 'get') {
    args = req.query;
  }
  else if(verb.toLowerCase() === 'delete') {
    // CHECK THE BODY FIRST, IF THERE IS NO BODY OR THE BODY IS EMPTY
    // CHECK THE QUERY STRING.
    args = req.body;
    if (args == null || args.length === 0) {
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
  if(Settings.access_logging === true) {
    var endpointString = area+'/'+controller+'/'+serviceCall+'/'+version;
    var ips = req.headers['x-forwarded-for'] || req.connection.remoteAddress;
    accessLogEvent = {
      start_timestamp: new Date().toISOString(),
      endpoint: endpointString,
      user_agent: req.headers['user-agent'],
      ips: ips
    };
  }

  ServiceRegistration.serviceCallExists(serviceCall, area, controller, verb, version)
  .then((sc) => {
    let continueWhenInvalid = false;
    if (!sc.authRequired) {
      continueWhenInvalid = true;
    }

    // IF THERE IS A BACKSTRAP STYLE AUTH HEADER OR NEITHER A BACKSTRAP AUTH HEADER NOR BASIC/BEARER AUTH HEADER 
    if(req.headers[Settings.token_header] != null || 
        (req.headers[Settings.token_header] == null && req.headers['authorization'] == null)) {
      return Promise.all([sc, AccessControl.validateToken(req.headers[Settings.token_header], continueWhenInvalid)]);
    }
    // OTHERWISE THIS IS BASIC OR BEARER AUTH
    // BASIC AUTH IS BACKSTRAP NATIVE API USERS
    // BEARER AUTH USES JWTs FROM EXTERNAL IDENTITY PROVIDERS
    else {
      [authType] = req.headers['authorization'].split(' ');
      if(authType.toLowerCase() === 'basic') {
        return Promise.all([sc, AccessControl.validateBasicAuth(req.headers['authorization'], continueWhenInvalid)]);
      }
      else if(authType.toLowerCase() === 'bearer') {
        return Promise.all([sc, AccessControl.validateJwt(req.headers['authorization'], continueWhenInvalid)]);
      }
      else {
        if(continueWhenInvalid) {
          return Promise.all([sc, Promise.resolve({is_valid: false})]);
        }
        else {
          return Promise.all([sc, Promise.reject(new ErrorObj(403,
                                            'bs0001',
                                            __filename,
                                            'requestPipeline',
                                            'bad auth type',
                                            'Unauthorized',
                                           null))]);
        }
      }
    }
  })
  .then(([sc, validTokenResponse]) => {
    let inner_promise = new Promise((resolve, reject) => {
      if(validTokenResponse.is_valid === true) {

        // SEE IF THIS IS BACKSTRAP STYLE AUTH OR BASIC/BEARER AUTH
        if(validTokenResponse.hasOwnProperty('session')) {
          if(Settings.access_logging === true) accessLogEvent.session_id = validTokenResponse.session.id;
  
          DataAccess.getUserBySession(validTokenResponse.session.id)
          .then((usr) => {
            resolve(usr);
          })
          .catch((usr_err) => {
            if(sc.authRequired) {
              let errorObj = new ErrorObj(403,
                                          'bs0002',
                                          __filename,
                                          'requestPipeline',
                                          'unauthorized',
                                          'Unauthorized',
                                          null);
              reject(errorObj);
            }
            else {
              resolve(null);
            }
          });
        }
        else if(validTokenResponse.hasOwnProperty('user')) {
          resolve(validTokenResponse.user);
        }
        else {
          if(Settings.access_logging === true) accessLogEvent.client_id = validTokenResponse.client_id;
  
          DataAccess.getUserByClientId(validTokenResponse.client_id, false)
          .then((usr) => {
            resolve(usr);
          })
          .catch((usr_err) => {
            if(sc.authRequired) {
              let errorObj = new ErrorObj(403,
                                          'bs0003',
                                          __filename,
                                          'requestPipeline',
                                          'unauthorized',
                                          'Unauthorized',
                                          null);
              reject(errorObj);
            }
            else {
              resolve(null);
            }
          });
        }
      }
      else {
        resolve(null);
      }
    });

    return Promise.all([sc, validTokenResponse, inner_promise]);
  })
  .then(([sc, validTokenResponse, userOrNull]) => {
    //PUT THE USER OBJECT ON THE REQUEST
    if(userOrNull !== null) {
      req.this_user = userOrNull;
    }
    if (sc.authRequired) {
      return Promise.all([sc, validTokenResponse, AccessControl.verifyAccess(req, sc)]);
    }
    else {
      return [sc, validTokenResponse];
    }
  })
  .then(([sc, validTokenResponse]) => {
    return Promise.all([sc, validTokenResponse, ServiceRegistration.validateArguments(serviceCall, area, controller, verb, version, args)]);
  })
  .then(async ([sc, validTokenResponse]) => {
    try {
      let results = await Controller.resolveServiceCall(sc, req);
      if(validTokenResponse.session != null) {
        DataAccess.UpdateLastTouch(validTokenResponse.session.id);
      }
  
      // IF ACCESS LOGGING IS ENABLED.  ADD THE END TIMESTAMP
      // AND RESPONSE STATUS NUM TO THE ACCESS LOG EVENT AND
      // WRITE IT TO THE LOG
      if(Settings.access_logging === true) {
        accessLogEvent.end_timestamp = new Date().toISOString();
        accessLogEvent.http_status = 200;
        let logEntry = JSON.stringify(accessLogEvent)+'\n';
        accessLog.write(logEntry);
      }
  
      if(results && results.express_download === true){
        if(results.download_name){
          res.status(200).download(results.download_path, results.download_name);
        }
        else {
          res.status(200).download(results.download_path);
        }
      }
      else if (results && results.status_code === 308 && results.redirect_url) {
        res.redirect(results.redirect_url);
      }
      else {
        res.status(200).send(results);
      }
    }
    catch(err) {
      let formattedErr = formatError(err);
      finishLogging(formattedErr, accessLog, accessLogEvent, errorLog);
      res.status(formattedErr.status).send(formattedErr);
    }

  })
  .catch((err) => {
    let formattedErr = formatError(err);
    finishLogging(formattedErr, accessLog, accessLogEvent, errorLog);
    res.status(formattedErr.status).send(formattedErr);
  });
}


// ----------------------------------------------
// DETERMINE IF THIS IS A CUSTOM OR NATIVE ERROR
// AND FORMAT APPROPRIATELY
// ----------------------------------------------
function formatError(err) {
  let formattedErr;
  if(err != null) {
    if(err instanceof ErrorObj) {
      formattedErr = err;
      if(err.message == null || err.message == '') formattedErr.message = 'unknown error';
      formattedErr.status = err.http_status;
      delete formattedErr.http_status;
    }
    else if(err instanceof Error) {
      formattedErr = { timestamp: new Date().toISOString() };
      if(err.status == null) {
        formattedErr.status = 500;
      }
      else {
        formattedErr.status = err.status;
      }
      formattedErr.message = err.toString();
      formattedErr.stack_trace = err.stack.toString();
    }
  }
  else {
    formattedErr = {
      status: 500,
      message: 'unknown error'
    };
  }
  return formattedErr;
}

// ---------------------------------------------------
// WRITE TO ACCESS LOG AND ERROR LOG WHERE APPLICABLE
// ---------------------------------------------------
function finishLogging(err, accessLog, accessLogEvent, errorLog) {
  // IF ACCESS LOGGING IS ENABLED.  ADD THE END TIMESTAMP
    // AND RESPONSE STATUS NUM TO THE ACCESS LOG EVENT AND
    // WRITE IT TO THE LOG
    if(Settings.access_logging === true) {
      accessLogEvent.end_timestamp = new Date().toISOString();
      accessLogEvent.http_status = err.status;
      let logEntry = JSON.stringify(accessLogEvent)+'\n';
      accessLog.write(logEntry);
    }

    let errorLogEntry = JSON.stringify(err) + '\n';
    errorLog.write(errorLogEntry);
}

// -----------------------------------
// SWITCH ERROR LOGS AT MIDNIGHT
// -----------------------------------
function changeErrorLogs() {
  let today = new Date();
  var monthNum = today.getMonth()+1;
  var monthString = monthNum < 10 ? '0'+monthNum : monthNum;
  var dateString = today.getDate() < 10 ? '0'+today.getDate() : today.getDate();
  let todayString = monthString+'-'+dateString+'-'+today.getFullYear();
  // THESE PATHS ARE USED WITH fs WHICH USES THE PROJECT ROOT AS PWD
  let errorLogPath = './logs/error-'+todayString;
  let accessLogPath = './logs/access-'+todayString;
  let sessionLogPath = './logs/session-'+todayString;
  let eventLogPath = './logs/event-'+todayString;
  

  var newErrorLog = fs.createWriteStream(errorLogPath, {flags:'a'});
  var newEventLog = fs.createWriteStream(eventLogPath, {flags:'a'});
  var newAccessLog = null;
  if(Settings.access_logging === true)
    newAccessLog = fs.createWriteStream(accessLogPath, {flags:'a'});
  var newSessionLog = null;
  if(Settings.session_logging === true)
    newSessionLog = fs.createWriteStream(sessionLogPath, {flags:'a'});


  if(errorLog != null) errorLog.end();
  errorLog = newErrorLog;

  if(eventLog != null) eventLog.end();
  eventLog = newEventLog;

  if(Settings.access_logging === true) {
    if(accessLog != null) accessLog.end();
    accessLog = newAccessLog;
  }
  else {
    accessLog = null;
  }

  if(Settings.session_logging === true) {
    if(sessionLog != null) sessionLog.end();
    sessionLog = newSessionLog;
  }
  else {
    sessionLog = null;
  }
  

  // DELETE LOGS OLDER THAN today - log_rotation_period
  var evictionDate = new Date();
  evictionDate.setDate(evictionDate.getDate()-Settings.log_rotation_period);
  evictionDate.setHours(0,0,0,0);
  fs.readdir('./logs/', (err, files) => {
    if(!err) {
      for(var fIdx = 0; fIdx < files.length; fIdx++) {
        let filepath = './logs/'+files[fIdx];
        fs.stat(filepath, (stat_err, stats) => {
          if(!stat_err) {
            var createDate = new Date(stats.birthtime);
            createDate.setHours(0,0,0,0);
            if(createDate < evictionDate) {
              fs.unlink(filepath, (del_err, del_res) => {
                if(del_err) {
                  var errObj = {
                    display_message:"Problem evicting log files",
                    file: filepath,
                    timestamp: new Date(),
                    results: del_err
                  }
                  let logEntry = JSON.stringify(errObj)+'\n';
                  errorLog.write(logEntry);
                }
              })
            }
          }
          else {
            var errObj = {
              display_message:"Problem evicting log files",
              file: filepath,
              timestamp: new Date(),
              results: stat_err
            }
            let logEntry = JSON.stringify(errObj)+'\n';
            errorLog.write(logEntry);
          }
        })
      }
    }
    else {
      var errObj = {
        display_message:"Problem evicting log files",
        timestamp: new Date(),
        results: err
      }
      let logEntry = JSON.stringify(errObj)+'\n';
      errorLog.write(logEntry);
    }
  })

  var midnightTonight = new Date();
  midnightTonight.setDate(midnightTonight.getDate()+1);
  midnightTonight.setHours(0, 0, 0, 0);
  var rightNow = new Date();
  var interval = midnightTonight.getTime() - rightNow.getTime();
  setTimeout(changeErrorLogs, interval);

  return;
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
function checkForInvalidSessions(DataAccess, Settings, callback) {
  return new Promise((resolve, reject) => {
    //THIS RETURNS STALE SESSIONS
    DataAccess.GetDeadSessions(Settings.timeout, true)
    .then((deadSessions) => {
      let ids = [];
      // IF LOGGING SESSIONS, WRITE OUT THE DEAD SESSIONS TO
      // THE SESSION LOG
      for(var sIdx = 0; sIdx < deadSessions.length; sIdx++) {
        ids.push(deadSessions[sIdx].id);
        
        if(Settings.session_logging === true) {
          let dsObj = {
            session_id: deadSessions[sIdx].id,
            token: deadSessions[sIdx].token,
            user_id: deadSessions[sIdx].user_id,
            started_at: deadSessions[sIdx].created_at,
            ended_at: deadSessions[sIdx].ended_at
          }
          var logEntry = JSON.stringify(dsObj)+'\n';
          sessionLog.write(logEntry);
        }
      }

      if(ids.length > 0) {
        DataAccess.DeleteSessions(ids)
        .then((res) => {
          resolve();
        })
        .catch((err) => {
          let logEntry = JSON.stringify(err)+'\n';
          errorLog.write(logEntry);
          resolve();
        })
      }
      else {
        resolve();
      }
    })
    .catch((err) => {
      console.log(err);
      resolve();
    })
  });
}