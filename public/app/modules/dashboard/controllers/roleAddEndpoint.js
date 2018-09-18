
dashboard.controller("RoleAddEndpointController", ['$scope', '$animate', '$element', 'title', 'close','backstrap_service',
  function($scope, $animate, $element, title, close, backstrap_service) {

      $scope.confirmClobberPending = false;     
      var okayToClobberAndAddEndpoint = false;
      $scope.message = '';
      $scope.role = backstrap_service.getSelectedRole();
      $scope.filteredResults = [];
      $scope.endpointList = [];
      $scope.searchString = '';
      $scope.verbs = ['GET','POST','PATCH','DELETE'];
      $scope.selectedResult = null;
      $scope.securityJson = [];
      
      $scope.endpointList = backstrap_service.getLocalEndpoints();

      $scope.securityJson = backstrap_service.getLocalRoles();
     
      $scope.querySearch = function(){        
        if ($scope.searchString.length < 3){
            filteredResults = [];
            return false;
        }
        $scope.filteredResults = [];
        var rez = [];
            $scope.endpointList.forEach(function(e){
                delete e.displayText;
                var isArea = e.area.toLowerCase().indexOf($scope.searchString.toLowerCase()) > -1;
                var isController = e.controller.toLowerCase().indexOf($scope.searchString.toLowerCase()) > -1;
                var isMethod = e.call.toLowerCase().indexOf($scope.searchString.toLowerCase()) > -1;
                var dispText = '';
                
                if (isArea){
                    dispText = 'Area: ' + e.area;
                }
                else if (isController){
                    dispText = 'Area: ' + e.area + ' | Controller: ' + e.controller;
                }
                else if (isMethod){
                    dispText = 'Area: ' + e.area + ' | Controller: ' + e.controller + ' | Method: ' + e.call;
                }
                if (isArea || isController || isMethod)
                {      
                    var result = {
                        endpoint: e,
                        displayText: dispText,
                        is_area: isArea,
                        is_controller: isController,
                        is_method: isMethod
                    };
                        if (rez.indexOf(dispText) === -1){
                        $scope.filteredResults.push(result);
                        rez.push(dispText);
                    }
                }                   
            });
           
        }      

        $scope.save = function(){
            save(false);
        }

        $scope.confirmClobberAndSave = function(){
            save(true);            
        }

        $scope.showDeleteMessage = function(r){
            $scope.message = "Are you sure you want to remove this endpoint security feature?"
        };

        $scope.remove = function(r){

        };

        $scope.setSelectedItem = function(r){
            $scope.selectedResult = r;
            $scope.filteredResults = [];
            $scope.searchString = '';
            $scope.message = '';            
            if (r.is_method){
                $scope.verbs = [];
                $scope.endpointList.forEach(function(e){
                    if (e.area === r.endpoint.area && e.controller === r.endpoint.controller 
                    && r.endpoint.call === r.endpoint.call && $scope.verbs.indexOf(e.verb) === -1){
                        $scope.verbs.push(e.verb);
                    }
                });
            }
        };

        function save(okayToClobberAndAddEndpoint){
            var isGoingToClobber = false;
            var goingToClobberWhat = '';
            var doSave = true;
            var origSelectedResult = $scope.selectedResult;
            $scope.message = '';
           var area = {};
           if ($scope.role.areas === undefined || $scope.role.areas === null){
                $scope.role['areas'] = [];                
           }
            var addArea = true;
            var aName = $scope.selectedResult.endpoint.area;
            var aPerm = ($scope.selectedResult.is_controller || $scope.selectedResult.is_method ? "some" : "all")
            //ADD THER AREA IF IT DOESNT EXIST
            var ixAreaToRemove = 0;
            var ix = -1;
            var newPatternMatches = [];
            if ($scope.role.pattern_matches === undefined || $scope.role.pattern_matches === null){
                $scope.role['pattern_matches'] = [];
            }
            $scope.role.areas.forEach(function(varArea){
                ix++;               
                if (varArea.name === aName){
                    addArea = false;
                    area = varArea;  
                    area.name = aName;
                    area.permission = aPerm;    
                    ixAreaToRemove = ix;     
                     //Remove any controller if the new rule for the role says the area is the 
                    //top level for auth
                    if ($scope.selectedResult.is_area){                        
                         $scope.role.pattern_matches.forEach(function(pm){
                            if (pm === $scope.selectedResult.displayText){
                                $scope.message = 'This permission already exists.';
                                doSave = false;                               
                            }
                            //strip out all the lower level permissions
                            //if it doesn't exist add it to the new pattern_matches array                               
                            if (pm.indexOf(aName + ' | ') == -1){
                                newPatternMatches.push(pm);
                            }
                            else{
                                 if (!okayToClobberAndAddEndpoint){
                                    doSave = false;
                                }
                                isGoingToClobber = true;
                                goingToClobberWhat += '<br />' + pm;
                            }
                        });
                        if (isGoingToClobber && !okayToClobberAndAddEndpoint){
                            doSave = false;
                            $scope.confirmClobberPending = true;
                            $scope.message = 'The security level you have chosen will remove lower level security entries. If you wish to ' +
                            'proceed, click the "Confirm and Add" button below. The entries that will be removed are: <br />' + goingToClobberWhat;                                
                        }                        
                    }                           
                }                
            });
           
            if (addArea){               
                area = {
                    name: aName,
                    permission: aPerm  				
                };
            }
            if (isGoingToClobber){
                try{
                    delete area.validRoutes;
                }catch(err){}
            }          
            if ($scope.selectedResult.is_area && doSave){
                newPatternMatches.push($scope.selectedResult.displayText);
                $scope.role.pattern_matches = newPatternMatches;               
            }

            if ($scope.selectedResult.is_controller || $scope.selectedResult.is_method){              
               var addValidRoutes = true;
               if (area.validRoutes === undefined || area.validRoutes === null){
                    area['validRoutes'] = [];
               }
               var addValidRoute = true;              
               var cName = $scope.selectedResult.endpoint.controller;
               var cPerm =  ($scope.selectedResult.is_method ? "some" : "all")
               var cVers = "1.0.0";
               var areaController = {};
               //Loop through existing routes and find if exists
               area.validRoutes.forEach(function(paramValidRoute){
                   if (paramValidRoute.controller === cName){
                       addValidRoute = false;
                       paramValidRoute.controller = cName;
                       paramValidRoute.permission = cPerm;
                       paramValidRoute.version = cVers;                                        
                    }                   
               });
              if ($scope.selectedResult.is_controller){
                    $scope.role.pattern_matches.forEach(function(pm){
                        if (pm === $scope.selectedResult.displayText){
                            $scope.message = 'This permission already exists.';
                            doSave = false;                                  
                        }
                        //strip out all the lower, or higher level permissions
                        //if it doesn't exist add it to the new pattern_matches array                                     
                        if (pm.indexOf(cName + ' | ') === -1 && pm !== 'Area: ' + area.name){
                            newPatternMatches.push(pm);
                        }
                        else{
                            if (!okayToClobberAndAddEndpoint){
                                doSave = false;
                            }
                            isGoingToClobber = true;
                            goingToClobberWhat += '<br />' + pm;
                        }
                    });
                    if (isGoingToClobber && !okayToClobberAndAddEndpoint){
                        doSave = false;
                        $scope.confirmClobberPending = true;
                        $scope.message = 'The security level you have chosen will remove existing security entries. If you wish to ' +
                        'proceed, click the "Confirm and Add" button below. The entries that will be removed are:  <br />' + goingToClobberWhat;                                
                    }
                    else if (isGoingToClobber){
                        try{
                            delete areaController.methods;
                        }catch(err){}
                    }                      
                }
               if (addValidRoute){                  
                   area.validRoutes.push({
                        controller: cName,
                        permission:  cPerm,	
                        version: cVers				
                   });                  
               }  

                if (doSave && $scope.selectedResult.is_controller){
                    newPatternMatches.push($scope.selectedResult.displayText);
                    $scope.role.pattern_matches = newPatternMatches;                   
                }                  
           }
         
           if ($scope.selectedResult.is_method){
               var addMethod = true;                          
                area.validRoutes.forEach(function(route){    
                   if (route.controller === $scope.selectedResult.endpoint.controller){                                         
                        if (route.methods === undefined || route.methods === null){
                                route['methods'] = [];
                        }
                        if ($scope.selectedResult.verb === undefined || $scope.selectedResult.verb === null){
                            $scope.message = 'Please select a verb.';
                            doSave = false;                                             
                        }
                        var mVerb = $scope.selectedResult.verb;
                        var mCall =  $scope.selectedResult.endpoint.call;
                        route.methods.forEach(function(meth){
                            if (meth === mCall){
                                addMethod = false;
                                meth.verb = mVerb;
                                meth.call = mCall;
                            }                            
                        });
                        var methPattern = $scope.selectedResult.displayText + ' | Verb: ' + mVerb;
                         $scope.role.pattern_matches.forEach(function(pm){
                            if (pm === methPattern){
                                $scope.message = 'This permission already exists.';
                                doSave = false;                                   
                            }
                             //strip out all the higher level permissions
                            //if it doesn't exist add it to the new pattern_matches array 
                            var areaMatch = 'Area: ' + area.name;
                            var controllerMatch = areaMatch + ' | Controller: ' + route.controller;
                            if (pm !== controllerMatch && pm !== areaMatch){
                                newPatternMatches.push(pm);
                            }
                            else{
                                if (!okayToClobberAndAddEndpoint){
                                    doSave = false;
                                }
                                isGoingToClobber = true;
                                goingToClobberWhat += '<br />' + pm;
                            }     
                        });   
                         if (isGoingToClobber && !okayToClobberAndAddEndpoint){
                            doSave = false;
                            $scope.confirmClobberPending = true;
                            $scope.message = 'The security level you have chosen will remove higher level security entries. If you wish to ' +
                            'proceed, click the "Confirm and Add" button below. The entries that will be removed are:  <br />' + goingToClobberWhat;                                
                        }
                        if (addMethod){
                            route.methods.push({
                                verb: mVerb,
                                call: mCall,	                                   			
                            });
                        } 
                        if (doSave){
                            //This has no higher security level, so add the verb and push
                            newPatternMatches.push(methPattern);
                            $scope.role.pattern_matches = newPatternMatches;    
                            $scope.selectedResult.displayText = methPattern;                           
                        }                           
                    }                  
                });               
           }
           if (ixAreaToRemove > -1){
                $scope.role.areas.splice(ixAreaToRemove, 1);
            }
           if (doSave){                
                //add area back                
                $scope.role.areas.push(area); 
                var elBackDrop = angular.element(document.querySelector('.modal-backdrop'));  
                var elModal = angular.element(document.querySelector('.modal'));  
                elBackDrop.fadeOut();
                elModal.fadeOut();
                elBackDrop.remove();
                close({
                    role: $scope.role,
                    permission: $scope.selectedResult.displayText                         
                        }, 500); // close, but give 500ms for bootstrap to animate                     

            }  
            else{
                 $scope.selectedResult = origSelectedResult;  
            }                
        }
  }]);