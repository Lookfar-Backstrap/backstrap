var Q = require('q');
var fs = require('fs');

class Endpoints {
  #file = null;
  #extensionFile = null;

  constructor(file) {
    this.areas = [];
    this.#file = file;
    this.#extensionFile = null;
    this.settings = null;
  }

  init(s) {
     this.settings = s;
     this.#extensionFile = this.#file.replace('_in', '');

     try {
      if(this.#file.substring(0,2) !== './') this.#file = './'+this.#file;
      if(this.#extensionFile.substring(0,2) !== './') this.#extensionFile = './'+this.#extensionFile;
      this.areas = require(this.#file);
  
      // FOR EACH CUSTOM ENDPOINT SPECIFIED IN USER DEFINED ENDPOINTS FILE
      // UPDATE OR ADD TO endpointData AS APPLICABLE
      let customEndpointData = require(this.#extensionFile);
  
      var areaNames = Object.keys(customEndpointData);
      for(var aIdx = 0; aIdx < areaNames.length; aIdx++) {
        var customArea = customEndpointData[areaNames[aIdx]]
        // THIS IS A NEW AREA.  JUST ADD IT TO THE ENDPOINT DATA
        if(this.areas[areaNames[aIdx]] == undefined || this.areas[areaNames[aIdx]] == null) {
          this.areas[areaNames[aIdx]] = customArea;
        }
        // WE ALREADY HAVE THIS AREA, MUST CHECK EACH CONTROLLER
        else {
          var area = this.areas[areaNames[aIdx]];
  
          // FOR EACH CUSTOM CONTROLLER
          for(var cIdx = 0; cIdx < customArea.length; cIdx++) {
            var originalController = null;
            for(var ocIdx = 0; ocIdx < area.length; ocIdx++) {
              if(customArea[cIdx].name == area[ocIdx].name && 
                customArea[cIdx].version == area[ocIdx].version) {
                originalController = area[ocIdx];
                break;
              }
            }
            // IF WE COULDN'T FIND THIS CONTROLLER, JUST ADD IT
            if(originalController == null) {
              this.areas[areaNames[aIdx]].push(customArea[cIdx]);
            }
            // OTHERWISE WE HAVE THIS CONTROLLER AND WE NEED TO CHECK EACH METHOD
            else {
              var customMethods = customArea[cIdx].methods;
              for(var mIdx = 0; mIdx < customMethods.length; mIdx++) {
                var customMethod = customMethods[mIdx];
                for(var omIdx = 0; omIdx < originalController.methods.length; omIdx++) {
                  var originalMethod = originalController.methods[omIdx];
                  var foundMethod = false;
                  if(customMethod.verb == originalMethod.verb &&
                    customMethod.call == originalMethod.call) {
                    foundMethod = true;
                    break;
                  }
                }
                if(!foundMethod) {
                  this.areas[areaNames[aIdx]][ocIdx].methods.push(customMethod);
                }
              }
            }
          }
        }
      }
    }
    catch(e) {
      console.error("Initialization Error -- endpoints.js");
      console.error(e);
    }
  }

  save() {
    var deferred = Q.defer();

    // SEPARATE USER-DEFINED ENDPOINT DESCRIPTORS FROM
    // CORE SYSTEM ENDPOINT DESCRIPTORS
    var customEndpoints = {};
    var systemEndpoints = {};
    var areaNames = Object.keys(this.areas);
    // FOR EACH AREA IN THE ENDPOINTS DATA
    for(var aIdx = 0; aIdx < areaNames.length; aIdx++) {
      var area = this.areas[areaNames[aIdx]];
      // FOR EACH CONTROLLER IN THE ENDPOINTS DATA
      for(var cIdx = 0; cIdx < area.length; cIdx++) {
        var controller = area[cIdx];
        // FOR EACH METHOD IN THE ENDPOINTS DATA
        for(var mIdx = 0; mIdx < controller.methods.length; mIdx++) {
          var method = controller.methods[mIdx];

          // USER CREATED METHOD
          if(method.isUserCreated == null || method.isUserCreated == true) {
            // THE customEndpoints OBJECT DOES NOT HAVE AN ENTRY FOR THIS AREA
            if(!customEndpoints.hasOwnProperty(areaNames[aIdx])) {
              customEndpoints[areaNames[aIdx]] = [];
            }
            var cArea = customEndpoints[areaNames[aIdx]];
            // IF NO MATCHING CONTROLLER IS FOUND,
            // DEEP COPY USING JSON stringify/parse
            // AND REMOVE THE METHODS.  THIS WILL GIVE US JUST THE
            // HEADER INFO FROM THE CONTROLLER
            var cntrl = JSON.parse(JSON.stringify(controller));
            cntrl.methods = [];
            var foundController = false;
            for(var ctIdx = 0; ctIdx < cArea.length; ctIdx++) {
              var c = cArea[ctIdx];
              if(controller.name == c.name && controller.version == c.version) {
                // FOUND THE CONTROLLER IN customEndpoints, SO USE THAT ONE
                cntrl = c;
                foundController = true;
                break;
              }
            }

            cntrl.methods.push(method);
            if(!foundController) {
              cArea.push(cntrl);
            }
          }
          // SYSTEM METHOD
          else {
            // THE systemEndpoints OBJECT DOES NOT HAVE AN ENTRY FOR THIS AREA
            if(!systemEndpoints.hasOwnProperty(areaNames[aIdx])) {
              systemEndpoints[areaNames[aIdx]] = [];
            }
            var cArea = systemEndpoints[areaNames[aIdx]];
            // IF NO MATCHING CONTROLLER IS FOUND,
            // DEEP COPY USING JSON stringify/parse
            // AND REMOVE THE METHODS.  THIS WILL GIVE US JUST THE
            // HEADER INFO FROM THE CONTROLLER
            var cntrl = JSON.parse(JSON.stringify(controller));
            cntrl.methods = [];
            var foundController = false;
            for(var ctIdx = 0; ctIdx < cArea.length; ctIdx++) {
              var c = cArea[ctIdx];
              if(controller.name == c.name && controller.version == c.version) {
                // FOUND THE CONTROLLER IN systemEndpoints, SO USE THAT ONE
                cntrl = c;
                foundController = true;
                break;
              }
            }

            cntrl.methods.push(method);
            if(!foundController) {
              cArea.push(cntrl);
            }
          }
        }
      }
    }
    
    var fswrite = Q.denodeify(fs.writeFile);
    Q.all([fswrite(this.#file, JSON.stringify(systemEndpoints, null, 4)), fswrite(this.#extensionFile, JSON.stringify(customEndpoints, null, 4))])
    .then(function(write_res) {
      deferred.resolve(true);
    })
    .fail(function(err) {
      var errorObj = new ErrorObj(400, 
                    'e0002', 
                    __filename, 
                    'save', 
                    'error writing to Endpoints config file',
                    'External error',
                    err
                    );
      deferred.reject(errorObj);
    });

    return deferred.promise;
  }
}

const instance = new Endpoints('Endpoints_in.json');
module.exports = instance;