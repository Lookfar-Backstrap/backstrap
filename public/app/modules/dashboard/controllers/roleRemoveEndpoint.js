
dashboard.controller("RoleRemoveEndpointController", ['$scope', '$animate', '$element', 'title', 'close','backstrap_service',
  function($scope, $animate, $element, title, close, backstrap_service) {
      $scope.role = backstrap_service.getSelectedRole();
      $scope.permission = title.permission;

      $scope.remove = function(){
            var splitPattern = [];
            var patternLen = 0;
            var ixPattern = -1;
            var ixPatternToRemove = 0;
            //get the correct permission by pattern
            $scope.role.pattern_matches.forEach(function(pm){
                ixPattern++;
                if (pm === $scope.permission){
                    ixPatternToRemove = ixPattern;
                    splitPattern = pm.split('|');
                    patternLen = splitPattern.length;                                  
                }
            });           
            //locate the area
            var area = {};
            var ixArea = -1;
            var ixAreaToRemove = -1;
            $scope.role.areas.forEach(function(a){ 
                ixArea.remove;                  
                if ($scope.permission.indexOf(a.name) !== -1){
                    ixAreaToRemove = ixArea;
                    area = a;                    
                }
            });
            //remove permission            
            if (patternLen === 1){ //area                
                $scope.role.areas.splice(ixArea, 1);
            } 
            else{
                //locate the controller
                var controller = {};              
                area.validRoutes.forEach(function(vr){
                    ixController++;
                    if ($scope.permission.indexOf(vr.controller) !== -1){
                        controller = vr;
                        ixControllerToRemove = ixController;
                    }                    
                });
                if (patternLen === 2){ //controller               
                    var ixController = -1;
                    var ixControllerToRemove = 0;
                    area.validRoutes.splice(ixControllerToRemove, 1);                   
                }
                else{ //method
                    var ixMethod = -1;
                    var ixMethodToRemove = 0;
                    controller.methods.forEach(function(m){
                        ixMethod++;
                        if ($scope.permission.indexOf(m.call) !== -1 && $scope.permission.indexOf(m.verb) !== -1){
                            ixMethodToRemove = ixMethod;
                        }
                    });
                    controller.methods.splice(ixMethodToRemove, 1); 
                    if (controller.methods.length === 0){
                        area.validRoutes.splice(ixControllerToRemove, 1);
                    }                  
                }
                $scope.role.pattern_matches.splice(ixPatternToRemove, 1);
                $scope.role.areas.splice(ixAreaToRemove, 1);
                $scope.role.areas.push(area);
                var elBackDrop = angular.element(document.querySelector('.modal-backdrop'));  
                var elModal = angular.element(document.querySelector('.modal'));  
                elBackDrop.fadeOut();
                elModal.fadeOut();
                elBackDrop.remove();
                close({
                    role: $scope.role,
                    permission: $scope.permission                             
                }, 500); // close, but give 500ms for bootstrap to animate     
            }    
      };
  }]);