// ==================================================================
// SERVICE REGISTRATION
// ==================================================================
// Service Registration handles loading, processing, and validation
// of endpoints and arguments.  Works in tandem with endpoints.js
// ==================================================================
const moment = require('moment');
const base64 = require('./base64.js');

class ServiceRegistration {
  constructor() {
    this.endpoints = null;
  }

  init(e) {
    this.endpoints = e;
  }

  registerServiceCall(call, area, controller, verb, version, args, authRequired, description) {
    return new Promise((resolve, reject) => {
      // -------------------------------------------------------------------
      // VALIDATE THAT WE HAVE ALL THE INFO NECESSARY TO CREATE AN ENDPOINT
      // -------------------------------------------------------------------
      var isValid = true;
      var invalidArgs = [];
      if(call===null) {
        invalidArgs.push('call');
        isValid = false;
      }
      if(area===null) {
        invalidArgs.push('area');
        isValid = false;
      }
      if(controller===null) {
        invalidArgs.push('controller');
        isValid = false;
      }
      if(verb===null) {
        invalidArgs.push('verb');
        isValid = false;
      }
      if(version===null) {
        invalidArgs.push('version');
        isValid = false;
      }
      if(authRequired===null) {
        authRequired = false;
      }

      // MISSING REQUIRED ARGS TO CREATE AN ENDPOINT
      if(isValid===false) {
        var errorObj = new ErrorObj(500, 
                      'sr0001', 
                      __filename, 
                      'registerServiceCall', 
                      'invalid args',
                      'Invalid args',
                      invalidArgs
                      );
        reject(errorObj);
      }
      else {
        verb = verb.toUpperCase();

        // CHECK IF WE HAVE ALREADY CREATED THIS ENDPOINT
        this.serviceCallExists(call, area, controller, verb, version)
        .then(() => {
          var errorObj = new ErrorObj(500, 
                        'sr0002', 
                        __filename, 
                        'registerServiceCall', 
                        'duplicate service call'
                        );
          reject(errorObj);
        })
        .catch((err) => {
          if(err != null &&
            (err.message==='no matching controller found' ||
            err.message==='no matching area found' ||
            err.message==='no matching method found')) {
            var areaNames = Object.getOwnPropertyNames(this.endpoints.areas);
            // NO AREA IN ENDPOINTS FILE
            if(areaNames.indexOf(area) === -1) {
              this.endpoints.areas[area] = [{
                'name': controller,
                'version': version,
                'methods': [
                  {
                    'verb': verb,
                    'call': call,
                    'desc': description,
                    'authRequired': authRequired,
                    'args': args,
                    'isUserCreated': true
                  }
                ]
              }];
            }
            // FOUND THE AREA, CHECK FOR CONTROLLER/VERSION
            else {
              var controllers = this.endpoints.areas[area];
              var foundController = false;
              for(var cIdx = 0; cIdx < controllers.length; cIdx++) {
                if(controllers[cIdx].name.toLowerCase() === controller.toLowerCase() &&
                  controllers[cIdx].version === version) {
                  // FOUND THE CONTROLLER, ADD THE METHOD
                  controllers[cIdx].methods.push({
                    'verb': verb,
                    'call': call,
                    'desc': description,
                    'authRequired': authRequired,
                    'args': args,
                    'isUserCreated': true
                  });

                  foundController = true
                  break;
                }
              }
              if(!foundController) {
                // GOT THE AREA, BUT NO CONTROLLER
                // ADD A CONTROLLER AND THE METHOD
                var controllerObj = {
                  'name': controller,
                  'version': version,
                  'methods': [
                    {
                      'verb': verb,
                      'call': call,
                      'desc': description,
                      'authRequired': authRequired,
                      'args': args,
                      'isUserCreated': true
                    }
                  ]
                };
                this.endpoints.areas[area].push(controllerObj);
              }
            }

            // WRITE TO FILE
            this.endpoints.save(true)
            .then((save_res) => {
              resolve(save_res);
            })
            .catch((err) => {
              if(err !== undefined && err !== null && typeof(err.AddToError) === 'function') {
                reject(err.AddToError(__filename, 'registerServiceCall'));
              }
              else {
                var errorObj = new ErrorObj(500, 
                              'sr1002', 
                              __filename, 
                              'registerServiceCall', 
                              'error saving endpoints config',
                              'Error saving endpoints config',
                              err
                              );
                reject(errorObj);
              }
            });
          }
          else {
            if(err != null && typeof(err.AddToError) === 'function') {
              reject(err.AddToError(__filename, 'registerServiceCall'));
            }
            else {
              let errorObj = new ErrorObj(500, 
                            'sr1003', 
                            __filename, 
                            'registerServiceCall', 
                            'error registering service call',
                            'Error registering service call',
                            err
                            );
              reject(errorObj);
            }
          }
        });
      }
    });
  }

  updateServiceCall(call, area, controller, verb, version, args, authRequired, description) {
    return new Promise((resolve, reject) => {
      this.serviceCallExists(call, area, controller, verb, version)
      .then(() => {
        var updatedMethod = false;
        var controllers = this.endpoints.areas[area];
        for(var cIdx = 0; cIdx < controllers.length; cIdx++) {
          if(controllers[cIdx].name.toLowerCase() === controller.toLowerCase() &&
            controllers[cIdx].version === version) {
            // FOUND THE CONTROLLER, DELETE THE METHOD
            for(var mIdx = 0; mIdx < controllers[cIdx].methods.length; mIdx++) {
              var method = controllers[cIdx].methods[mIdx];
              if(method.verb.toLowerCase() === verb.toLowerCase() &&
                method.call.toLowerCase() === call.toLowerCase()) {
                if(args !== undefined) {
                  method.args = args;
                }
                if(authRequired !== undefined) {
                  method.authRequired = authRequired;
                }
                if(description !== undefined) {
                  method.description = description;
                }
    
                updatedMethod = true;
    
                break;
              }
            }
    
            break;
          }
        }
        if(updatedMethod) {
          // WRITE TO FILE
          this.endpoints.save(true)
          .then((save_res) => {
            resolve(save_res);
          })
          .catch((err) => {
            if(err !== undefined && err !== null && typeof(err.AddToError) === 'function') {
              reject(err.AddToError(__filename, 'updateServiceCall'));
            }
            else {
              let errorObj = new ErrorObj(500, 
                            'sr1004', 
                            __filename, 
                            'updateServiceCall', 
                            'error saving endpoints config',
                            'Error saving endpoints config',
                            err
                            );
              reject(errorObj);
            }
          });
        }
        else {
          var errorObj = new ErrorObj(500, 
                        'sr0003', 
                        __filename, 
                        'updateServiceCall', 
                        'no service call found to update'
                        );
          reject(errorObj);
        }
      })
      .catch((err) => {
        if(err !== undefined && err !== null && typeof(err.AddToError) === 'function') {
          reject(err.AddToError(__filename, 'updateServiceCall'));
        }
        else {
          let errorObj = new ErrorObj(500, 
                        'sr1005', 
                        __filename, 
                        'updateServiceCall', 
                        'error updating endpoint',
                        'Error updating endpoint',
                        err
                        );
          reject(errorObj);
        }
      });
    });
  }

  deleteServiceCall(call, area, controller, verb, version) {
    return new Promise((resolve, reject) => {
      this.serviceCallExists(call, area, controller, verb, version)
      .then(() => {
        var controllers = this.endpoints.areas[area];
        for(var cIdx = 0; cIdx < controllers.length; cIdx++) {
          if(controllers[cIdx].name.toLowerCase() === controller.toLowerCase() &&
            controllers[cIdx].version === version) {
            // FOUND THE CONTROLLER, UPDATE THE METHOD
            for(var mIdx = 0; mIdx < controllers[cIdx].methods.length; mIdx++) {
              var method = controllers[cIdx].methods[mIdx];
              if(method.verb.toLowerCase() === verb.toLowerCase() &&
                method.call.toLowerCase() === call.toLowerCase()) {
                controllerIdx = cIdx;
                methodIdx = mIdx;
    
                break;
              }
            }
    
            break;
          }
        }
    
        if(controllerIdx !== -1 && methodIdx !== -1) {
          this.endpoints.areas[area][controllerIdx].methods.splice(methodIdx, 1);
    
          // WRITE TO FILE
          this.endpoints.save(true)
          .then((save_res) => {
            resolve(save_res);
          })
          .catch((err) => {
            if(err !== undefined && err !== null && typeof(err.AddToError) === 'function') {
              reject(err.AddToError(__filename, 'deleteServiceCall'));
            }
            else {
              let errorObj = new ErrorObj(500, 
                            'sr1006', 
                            __filename, 
                            'deleteServiceCall', 
                            'error deleting endpoint',
                            'Error deleting endpoint',
                            err
                            );
              reject(errorObj);
            }
          });
        }
        else {
          let errorObj = new ErrorObj(500, 
                        'sr0004', 
                        __filename, 
                        'deleteServiceCall', 
                        'no service call found to delete'
                        );
          reject(errorObj);
        }
      })
      .catch((err) => {
        if(err !== undefined && err !== null && typeof(err.AddToError) === 'function') {
          reject(err.AddToError(__filename, 'deleteServiceCall'));
        }
        else {
          var errorObj = new ErrorObj(500, 
                        'sr1007', 
                        __filename, 
                        'deleteServiceCall', 
                        'error deleting endpoint',
                        'Error deleting endpoint',
                        err
                        );
          reject(errorObj);
        }
      });
    });
  }

  getServiceCall(call, area, controller, verb, version) {
    return new Promise((resolve, reject) => {
      var serviceCallObj = {
        'object_type':'webServiceCallDescriptor'
      };
    
      if(this.endpoints.areas.hasOwnProperty(area) && this.endpoints.areas[area]!==null) {
        // FOUND THE AREA
        var foundController = false;
        var activeController = null;
        if(version !== undefined && version !== null) {
          for(var cIdx = 0; cIdx < this.endpoints.areas[area].length; cIdx++) {
            var cntrl = this.endpoints.areas[area][cIdx];
            if(cntrl.name.toLowerCase()===controller.toLowerCase() && cntrl.version===version) {
              foundController = true;
              activeController = cntrl;
              serviceCallObj.area = area.toLowerCase();
    
              break;
            }
          }
        }
        else {
          var greatestVersionWithCall = '0.0.0';
          for(var cIdx = 0; cIdx < this.endpoints.areas[area].length; cIdx++) {
            var cntrl = this.endpoints.areas[area][cIdx];
            // THIS CONTROLLER HAS THE CORRECT NAME.  SEE IF IT HAS THE METHOD
            if(cntrl.name.toLowerCase() === controller.toLowerCase()) {
              if(cntrl.hasOwnProperty('methods') && cntrl.methods.length > 0) {
                methodloop:
                for(var mIdx = 0; mIdx < cntrl.methods.length; mIdx++) {
                  var mthd = cntrl.methods[mIdx];
                  // THIS CONTROLLER HAS THE CORRECT METHOD.  MARK THE VERSION
                  // SO WE CAN SEE IF THIS IS THE LATEST
                  if(mthd.verb.toLowerCase() === verb.toLowerCase() && mthd.call.toLowerCase() === call.toLowerCase()) {
                    var compareRes = this.#compareVersionStrings(cntrl.version, greatestVersionWithCall);
                    if(compareRes === 1) {
                      greatestVersionWithCall = cntrl.version;
                      foundController = true;
                      activeController = cntrl;
                      serviceCallObj.area = area.toLowerCase();
    
                      break methodloop;
                    }
                  }
                }
              }
            }
          }
        }
    
        if(foundController) {
          // FOUND THE CONTROLLER AND VERSION
          serviceCallObj.controller = activeController.name;
          serviceCallObj.version = activeController.version;
    
          if(activeController.hasOwnProperty('methods') && activeController.methods.length > 0) {
            var foundMethod = false;
            var activeMethod = null;
            for(var mIdx = 0; mIdx < activeController.methods.length; mIdx++) {
              var mthd = activeController.methods[mIdx];
              if(mthd.verb.toLowerCase()===verb.toLowerCase() && mthd.call.toLowerCase()===call.toLowerCase()) {
                if(mthd.isUserCreated === undefined || mthd.isUserCreated === null) {
                  mthd.isUserCreated = false;
                }
    
                // FOUND METHOD WITH MATCHING VERB AND CALL
                activeMethod = mthd;
                foundMethod = true;
                serviceCallObj.verb = activeMethod.verb;
                serviceCallObj.call = activeMethod.call;
                serviceCallObj.description = activeMethod.desc;
                serviceCallObj.args = activeMethod.args;
                serviceCallObj.authRequired = activeMethod.authRequired;
                serviceCallObj.isUserCreated = activeMethod.isUserCreated;
    
                break;
              }
            }
    
            if(foundMethod) {
              resolve(serviceCallObj);
            }
            else {
              // COULDN'T FIND IT
              let errorObj = new ErrorObj(400,
                            'sr0005', 
                            __filename, 
                            'getServiceCall', 
                            'no matching method found' 
                            );
              reject(errorObj);
            }
          }
          else {
            // COULDN'T FIND IT
            let errorObj = new ErrorObj(400,
                          'sr0006', 
                          __filename, 
                          'getServiceCall', 
                          'no matching method found' 
                          );
            reject(errorObj);
          }
        }
        else {
          let errorObj = new ErrorObj(400,
                        'sr0007', 
                        __filename, 
                        'getServiceCall', 
                        'no matching controller found' 
                        );
          reject(errorObj);
        }
      }
      else {
        // COULDN'T FIND IT
        let errorObj = new ErrorObj(500, 
                      'sr0008', 
                      __filename, 
                      'getServiceCall', 
                      'no matching area found'
                      );
        reject(errorObj);
      }
    });
  }

  serviceCallExists(call, area, controller, verb, version) {
    return new Promise((resolve, reject) => {
      this.getServiceCall(call, area, controller, verb, version)
      .then((sc_res) => {
        resolve(sc_res);
      })
      .catch((gsc_err) => {
        if(gsc_err !== undefined && gsc_err !== null && typeof(gsc_err.AddToError) === 'function') {
          reject(gsc_err.AddToError(__filename, 'serviceCallExists'));
        }
        else {
          let errorObj = new ErrorObj(500, 
                        'sr1008', 
                        __filename, 
                        'serviceCallExists', 
                        'error finding service call',
                        'Error finding service call',
                        gsc_err
                        );
          reject(errorObj);
        }
      });
    });
  }

  validateArguments(call, area, controller, verb, version, inputArgs) {
    return new Promise((resolve, reject) => {
      this.getServiceCall(call, area, controller, verb, version)
      .then((get_res) => {
        if(get_res.args!==null && get_res.args.length > 0) {
          var isValid = true;
          var invalidArgs = [];
          for(var argIdx = 0; argIdx < get_res.args.length; argIdx++) {
            var arg = get_res.args[argIdx];
    
            if(arg.isRequired===null) {
              arg.isRequired = false;
            }
            if(arg.isRequired===true && (inputArgs[arg.name]===null || inputArgs[arg.name]==='')) {
              isValid = false;
              invalidArgs.push(arg.name);
              break;
            }
            if(arg.type!==null) {
              if((inputArgs[arg.name]===undefined || inputArgs[arg.name]===null) && !arg.isRequired) {
                continue;
              }
              if(arg.type==='string') {
                if(typeof(inputArgs[arg.name])!=='string') {
                  isValid = false;
                  invalidArgs.push(arg.name);
                  break;
                }
              }
              else if(arg.type==='number') {
                if(isNaN(inputArgs[arg.name])) {
                  isValid = false;
                  invalidArgs.push(arg.name);
                  break;
                }
              }
              else if(arg.type==='array') {
                if(typeof(inputArgs[arg.name])!=='object') {
                  isValid = false;
                  invalidArgs.push(arg.name);
                  break;
                }
              }
              else if(arg.type==='object') {
                if(typeof(inputArgs[arg.name])!=='object') {
                  isValid = false;
                  invalidArgs.push(arg.name);
                  break;
                }
              }
              else if(arg.type==='boolean') {
                if(verb.toLowerCase() === 'get') {
                  inputArgs[arg.name] = inputArgs[arg.name].toLowerCase() == 'true' ? true : false;
                }
                if(typeof(inputArgs[arg.name])!=='boolean') {
                  isValid = false;
                  invalidArgs.push(arg.name);
                  break;
                }
              }
              else if(arg.type==='symbol') {
                if(typeof(inputArgs[arg.name])!=='symbol') {
                  isValid = false;
                  invalidArgs.push(arg.name);
                  break;
                }
              }
              else if(arg.type==='date') {
                if(typeof(inputArgs[arg.name])==='string') {
                  var dateToStore = this.#formatDateForStorage(inputArgs[arg.name]);
                  if(dateToStore === 'Invalid Date') {
                    isValid = false;
                    invalidArgs.push(arg.name);
                    break;
                  }
                  else {
                    inputArgs[arg.name] = dateToStore;
                  }
                }
                else {
                  isValid = false;
                  invalidArgs.push(arg.name);
                  break;
                }
              }
              else if(arg.type==='file') {
                // VERIFY THAT THIS IS A STRING CONTAINING VALID BASE64 DATA
                if(typeof(inputArgs[arg.name]) === 'string') {
                  var stringData = inputArgs[arg.name];
                  if(!base64.validate(stringData)) {
                    isValid = false;
                    invalidArgs.push(arg.name);
                    break;
                  }
                }
                else {
                  isValid = false;
                  invalidArgs.push(arg.name);
                  break;
                }
              }
              else if(arg.type === 'filestreamarray') {
                // THIS IS A MULTER ARRAY OF FILE UPLOADS
                // FOR NOW JUST MAKE SURE WE HAVE AN ARRAY
                if(!Array.isArray(inputArgs[arg.name])) {
                  isValid = false;
                  invalidArgs.push(arg.name);
                  break;
                }
              }
              else if(arg.type === '*') {
                // VALID
              }
              // I DON'T KNOW WHY YOU'D WANT TO DO THIS, BUT HERE...
              else if(arg.type==='undefined') {
                if(typeof(inputArgs[arg.name])!=='undefined') {
                  isValid = false;
                  invalidArgs.push(arg.name);
                  break;
                }
              }
            }
            else {
              console.log(
                'Could not find a type for this argument. This service may have been misformed during registration.');
              isValid = false;
              break;
            }
          }
          if(isValid===true) {
            resolve(true);
          }
          else {
            var errorObj = new ErrorObj(400, 
                          'sr0009', 
                          __filename, 
                          'validateArguments', 
                          'invalid args',
                          'Invalid args',
                          invalidArgs
                          );
            reject(errorObj);
          }
        }
        else {
          resolve(true);
        }
      })
      .catch((err) => {
        if(err !== undefined && err !== null && typeof(err.AddToError) === 'function') {
          reject(err.AddToError(__filename, 'validateArguments'));
        }
        else {
          let errorObj = new ErrorObj(500, 
                        'sr1009', 
                        __filename, 
                        'validateArguments', 
                        'error validating arguments',
                        'Error validating arguments',
                        err
                        );
          reject(errorObj);
        }
      });
    });
  }

  getAllServiceCalls() {
    var serviceCalls = [];
  
    var areaNames = Object.keys(this.endpoints.areas);
    for(var aIdx = 0; aIdx < areaNames.length; aIdx++) {
      var areaName = areaNames[aIdx];
      var controllerArray = this.endpoints.areas[areaNames[aIdx]];
      for(var cIdx = 0; cIdx < controllerArray.length; cIdx++) {
        var controllerObj = controllerArray[cIdx];
        var controllerName = controllerObj.name;
        var controllerVersion = controllerObj.version;
        var methodArray = controllerObj.methods;
        for(var mIdx = 0; mIdx < methodArray.length; mIdx++) {
          var methodObj = methodArray[mIdx];
          if(methodObj.isUserCreated === undefined || methodObj.isUserCreated === null) {
            methodObj.isUserCreated = false;
          }
          var serviceCall = {
            'area':areaName,
            'controller':controllerName,
            'version':controllerVersion,
            'call':methodObj.call,
            'verb':methodObj.verb,
            'description':methodObj.desc,
            'authRequired':methodObj.authRequired,
            'args':methodObj.args,
            'isUserCreated':methodObj.isUserCreated
          };
          serviceCalls.push(serviceCall);
        }
      }
    }
  
    return Promise.resolve(serviceCalls);
  }

  #formatDateForStorage(dateString) {
    var re = /(\+|\-)\d\d:?\d\d$/;
    var reZ = /(Z$|\+00:?00$)/;
    var timezone;
    var isLocalTime = false;
    var dateToStore;
      
    if(reZ.test(dateString)) {
      // ZULU TIME
      timezone = dateString.match(reZ)[0];
    }
    else if(re.test(dateString)) {
      // LOCAL TIME
      timezone = dateString.match(re)[0];
      isLocalTime = true;
    }
    else {
      // NO TIMEZONE, ASSUME ZULU
      dateString += 'Z';
    }
  
    var isValid = false;
    if(moment(dateString, 'YYYY-MM-DDZ', true).isValid()) {
      isValid = true;
      if(isLocalTime) {
        var dsNoTimezone = dateString.substring(0, dateString.indexOf(timezone));
        var dts = dsNoTimezone+'T00:00:00.000'+timezone;
        dateToStore = dts;
      }
      else {
        dateToStore = moment(dateString, 'YYYY-MM-DDZ', true).utc().format('YYYY-MM-DDTHH:mm:ss.SSSZ');
      }
    }
    else if(moment(dateString, 'YYYY-MM-DDTHH:mmZ', true).isValid()) {
      isValid = true;
      if(isLocalTime) {
        var dsNoTimezone = dateString.substring(0, dateString.indexOf(timezone));
        var dts = dsNoTimezone+':00.000'+timezone;
        dateToStore = dts;
      }
      else {
        dateToStore = moment(dateString, 'YYYY-MM-DDTHH:mmZ', true).utc().format('YYYY-MM-DDTHH:mm:ss.SSSZ');
      }
    }
    else if(moment(dateString, 'YYYY-MM-DDTHH:mm:ssZ', true).isValid()) {
      isValid = true;
      if(isLocalTime) {
        var dsNoTimezone = dateString.substring(0, dateString.indexOf(timezone));
        var dts = dsNoTimezone+'.000'+timezone;
        dateToStore = dts;
      }
      else {
        dateToStore = moment(dateString, 'YYYY-MM-DDTHH:mm:ssZ', true).utc().format('YYYY-MM-DDTHH:mm:ss.SSSZ');
      }
    }
    else if(moment(dateString, 'YYYY-MM-DDTHH:mm:ss.SSSZ', true).isValid()) {
      isValid = true;
      if(isLocalTime) {
        dateToStore = dateString;
      }
      else {
        dateToStore = moment(dateString, 'YYYY-MM-DDTHH:mm:ss.SSSZ', true).utc().format('YYYY-MM-DDTHH:mm:ss.SSSZ');
      }
    }
    else {
      isValid = false;
    }
  
    if(isValid) {
      return dateToStore;
    }
    else {
      return "Invalid Date";
    }
  }

  #compareVersionStrings(a, b) {
    var aObj = {};
    var pIdx = a.indexOf('.');
    aObj.major = parseInt(a.substring(0, pIdx));
    var tempInput = a.substring(pIdx+1);
    pIdx = tempInput.indexOf('.');
    aObj.minor = parseInt(tempInput.substring(0, pIdx));
    tempInput = tempInput.substring(pIdx+1);
    aObj.bug = parseInt(tempInput);
  
    var bObj = {};
    pIdx = b.indexOf('.');
    bObj.major = parseInt(b.substring(0, pIdx));
    tempInput = b.substring(pIdx+1);
    pIdx = tempInput.indexOf('.');
    bObj.minor = parseInt(tempInput.substring(0, pIdx));
    tempInput = tempInput.substring(pIdx+1);
    bObj.bug = parseInt(tempInput);
  
    if(aObj.major > bObj.major) {
      return 1;
    }
    else if(aObj.major < bObj.major) {
      return -1;
    }
    else {
      if(aObj.minor > bObj.minor) {
        return 1;
      }
      else if(aObj.minor < bObj.minor) {
        return -1;
      }
      else {
        if(aObj.bug > bObj.bug) {
          return 1;
        }
        else if(aObj.bug < bObj.bug) {
          return -1;
        }
        else {
          return 0;
        }
      }
    }
  }
}

var instance = new ServiceRegistration();
module.exports = instance;
