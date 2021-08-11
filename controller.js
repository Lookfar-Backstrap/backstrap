var Q = require('q');

class Controller {
  constructor() {
    this.dataAccess = null;
    this.utilities = null;
    this.accessControl = null;
    this.serviceRegistration = null;
    this.settings = null;
    this.endpoints = null;
    this.controllers = null;
  }

  init(da, utils, ac, sr, st, e) {
    var deferred = Q.defer();

    this.dataAccess = da;
    this.utilities = utils;
    this.accessControl = ac;
    this.serviceRegistration = sr;
    this.settings = st;
    this.endpoints = e;

    let hasErrors = false;
    this.controllers = {};
    var areaNames = Object.keys(this.endpoints.areas);
    for(var aIdx = 0; aIdx < areaNames.length; aIdx++) {
      var areaName = areaNames[aIdx];
      this.controllers[areaName] = {};
      var controllerArray = this.endpoints.areas[areaNames[aIdx]];
      for(var cIdx = 0; cIdx < controllerArray.length; cIdx++) {
        var controllerObj = controllerArray[cIdx];
        var controllerName = controllerObj.name;
        var controllerVersion = controllerObj.version;
        if(this.controllers[areaName][controllerName] == null) {
          this.controllers[areaName][controllerName] = {};
        }

        // DUPLICATE CONTROLLER DEFINITION
        if(this.controllers[areaName][controllerName][controllerVersion] != null) {
          console.warn('DUPLICATE CONTROLLER DEFINITION');
        }

        let filePath = `./${areaName}/${controllerName}_${controllerVersion.replace(/\./g, '_')}.js`;
        let thisController = null;
        try {
          thisController = require(filePath);
        }
        catch(e) {
          let errorObj = new ErrorObj(500,
                                      'c0100',
                                      __filename,
                                      'init',
                                      `Error loading controller: ${filePath}`,
                                      'There was a problem executing your request.',
                                      e
                                      );
          console.error(errorObj);
          this.utilities.writeErrorToLog(errorObj);
        }
        try {
          this.controllers[areaName][controllerName][controllerVersion] = new thisController(this.dataAccess, this.utilities, this.accessControl, this.serviceRegistration, this.settings, this.endpoints);
        }
        catch(e) {
          let errorObj = new ErrorObj(500,
                                      'c0101',
                                      __filename,
                                      'init',
                                      `Error initializing controller: ${filePath}`,
                                      'There was a problem executing your request.',
                                      e
                                      );
          console.error(errorObj);
          this.utilities.writeErrorToLog(errorObj);
        }
      }
    }

    if(!hasErrors) {
      deferred.resolve({success:true});
    }
    else {
      deferred.reject({success:false, message:'Controller initialization error'});
    }

    return deferred.promise;
  }

  async resolveServiceCall(serviceCallDescriptor, req, callback) {
    var deferred = Q.defer();
    // ===================================================================
    // PULL THE APPROPRIATE VERSION OF WEB SERVICE WITH APPROPRIATE VERB
    // ===================================================================
    var versionOfWS;
  
    if (serviceCallDescriptor.verb.toLowerCase() === 'get' ||
      serviceCallDescriptor.verb.toLowerCase() === 'post' ||
      serviceCallDescriptor.verb.toLowerCase() === 'put' ||
      serviceCallDescriptor.verb.toLowerCase() === 'patch' ||
      serviceCallDescriptor.verb.toLowerCase() === 'delete') {
      
        // GRAB THE CONTROLLER
      var wsNoVerb = this.controllers[serviceCallDescriptor.area][serviceCallDescriptor.controller][serviceCallDescriptor.version]
      if (wsNoVerb !== null) {
        // GRAB THE BLOCK OF FUNCTIONS FOR THIS VERB
        versionOfWS = wsNoVerb[serviceCallDescriptor.verb.toLowerCase()];
      }
      else {
        versionOfWS = null;
      }
    }
    else {
      var errorObj = new ErrorObj(400,
        'c0002',
        __filename,
        'resolveServiceCall',
        'unsupported http verb',
        'That http verb is not supported.  Please use GET, POST, PUT, PATCH, or DELETE'
      );
      deferred.reject(errorObj);
      return deferred.promise;
    }
  
    if (versionOfWS === null) {
      var errorObj = new ErrorObj(500,
        'c0003',
        __filename,
        'resolveServiceCall',
        'error locating correct controller file',
        'Problem finding that endpoint',
        serviceCallDescriptor
      );
      deferred.reject(errorObj);
      return deferred.promise;
    }
  
    // LOOK THROUGH THE CONTROLLER FOR THIS METHOD
    var funcName = null;
    var foundFuncName = false;
    var funcNames = Object.keys(versionOfWS);
    for (var fIdx = 0; fIdx < funcNames.length; fIdx++) {
      if (funcNames[fIdx].toLowerCase() === serviceCallDescriptor.call.toLowerCase()) {
        foundFuncName = true;
        funcName = funcNames[fIdx];
  
        break;
      }
    }
  
    if (foundFuncName) {
      // EXECUTE THE ACTUAL FUNCTION
      try {
        let mainCallRes = await versionOfWS[funcName];
        deferred.resolve(mainCallRes);
      }
      catch(err) {
        let errorObj;
        if(err !== undefined && err !== null && typeof(err.AddToError) === 'function') {
          errorObj = err.AddToError(__filename, 'resolveServiceCall', 'main function call failed');	
        }
        else {
          errorObj = new ErrorObj(500,
                      'c0004',
                      __filename,
                      'resolveServiceCall',
                      'main function call failed',
                      'Something went wrong',
                      err
                      );
        }
  
        errorObj.timestamp = new Date();
        
        console.log('\n========================== ERROR ==========================');
        console.log(errorObj);
        console.log('=============================================================\n');
  
        deferred.reject(errorObj);
      }		
    }
    else {
      var errorObj = new ErrorObj(400,
        'c1005',
        __filename,
        'resolveServiceCall',
        'error locating correct function in controller file',
        'Problem finding that endpoint',
        serviceCallDescriptor
      );
      deferred.reject(errorObj);
    }
  
    deferred.promise.nodeify(callback);
    return deferred.promise;
  }
}

const instance = new Controller();
module.exports = instance;