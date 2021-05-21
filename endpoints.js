var Q = require('q');
var fs = require('fs');

var endpointData = null;
var extensionFile = null;
var remoteSettings = null;
var settings;

var Endpoints = function(s, f) {
  var deferred = Q.defer();

  settings = s;
	file = f;
	//extensionFile = file.substring(0, file.indexOf('.json'))+'_ext.json';
  extensionFile = file.replace('_in', '');

  try {
    if(file.substring(0,2) !== './') file = './'+file;
    if(extensionFile.substring(0,2) !== './') extensionFile = './'+extensionFile;
    endpointData = require(file);

    // FOR EACH CUSTOM ENDPOINT SPECIFIED IN USER DEFINED ENDPOINTS FILE
    // UPDATE OR ADD TO endpointData AS APPLICABLE
    customEndpointData = require(extensionFile);

    var areas = Object.keys(customEndpointData);
    for(var aIdx = 0; aIdx < areas.length; aIdx++) {
      var customArea = customEndpointData[areas[aIdx]]
      // THIS IS A NEW AREA.  JUST ADD IT TO THE ENDPOINT DATA
      if(endpointData[areas[aIdx]] == undefined || endpointData[areas[aIdx]] == null) {
        endpointData[areas[aIdx]] = customArea;
      }
      // WE ALREADY HAVE THIS AREA, MUST CHECK EACH CONTROLLER
      else {
        var area = endpointData[areas[aIdx]];

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
            endpointData[areas[aIdx]].push(customArea[cIdx]);
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
                endpointData[areas[aIdx]][ocIdx].methods.push(customMethod);
              }
            }
          }
        }
      }
    }

    this.data = endpointData;
  }
  catch(e) {
    console.error("Initialization Error -- endpoints.js");
    console.error(e);
  }
};


Endpoints.prototype.reload = function() {
	var e = this;
	var deferred = Q.defer();
	e.init(bucket, file)
	.then(function(res) {
		deferred.resolve(res);
	})
	.fail(function(err) {
		if(err !== undefined && err !== null && typeof(err.AddToError) === 'function') {
			deferred.reject(err.AddToError(__filename, 'reload'));
		}
		else {
			var errorObj = new ErrorObj(500, 
										'e1001', 
										__filename, 
										'reload', 
										'error reloading endpoints config',
										'External error',
										err
										);
			deferred.reject(errorObj);
		}
	});
	

	return deferred.promise;
}

Endpoints.prototype.save = function() {
	var deferred = Q.defer();

	// SEPARATE USER-DEFINED ENDPOINT DESCRIPTORS FROM
	// CORE SYSTEM ENDPOINT DESCRIPTORS
	var customEndpoints = {};
	var systemEndpoints = {};
	var eData = this.constructor.prototype.data;
	var areaNames = Object.keys(eData);
	// FOR EACH AREA IN THE ENDPOINTS DATA
	for(var aIdx = 0; aIdx < areaNames.length; aIdx++) {
		var area = eData[areaNames[aIdx]];
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
  Q.all([fswrite(file, JSON.stringify(systemEndpoints, null, 4)), fswrite(extensionFile, JSON.stringify(customEndpoints, null, 4))])
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
};

exports.Endpoints = Endpoints;
