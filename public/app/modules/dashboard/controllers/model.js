

dashboard.controller("ModelController", ['$scope','$state', '$animate', '$element', 'title', 'close', 'backstrap_service',
  function($scope, $state, $animate, $element, title, close, backstrap_service) {   
    if(backstrap_service.getSendToAccount()){       
         close({         
            doSave:false,           
        }, 500); // close, but give 500ms for bootstrap to animate      
    }
    $scope.obj_type = '';
    $scope.description = '';
    $scope.showMessage = false;
    $scope.doSave = false;
    $scope.message = 'All fields are required.';
    $scope.save = function(){
        var message = "";
        if ($scope.description === '' || $scope.obj_type === ''){
            $scope.showMessage = true;
        }
        else{
            var today = new Date().toISOString().slice(0, 10);
            var objModel = {
                obj_type: $scope.obj_type,
                description: $scope.description,
                date_created: today,
                date_updated: today,
                relationships:  [],
                properties: [{
                    "name": "id",
                    "data_type": "string",
                    "required": true,
                    "hint": "This is a system generated field. It is a unique identifier for a record."
                },
                {
                    "name": "name",
                    "data_type": "string",
                    "required": true,
                    "hint": ""
                }],
            };
            backstrap_service.setSelectedModel(objModel);
            //persist collection back to root scope
            var allModels = backstrap_service.getLocalModels();
            var okayToSave = true;  
            allModels.forEach(function(m){
                if (m.obj_type.toLowerCase() === $scope.obj_type.toLowerCase()){
                    okayToSave = false;
                    message = "This object already exists. Please rename your entity and try again.";
                }
            });  
            var modelName = $scope.obj_type.toLowerCase().trim();
            if (modelName === "bsuser" || modelName === "bsuser_analytics" || modelName === "bsuser_session" ||
                modelName === "analytics" || modelName === "internal_system" || modelName === "logged_event"|| modelName === "session" || modelName === "uid"){   
                okayToSave = false;             
                    message = "Sorry, " + $scope.obj_type + " is reserved for internal use.";
                    $scope.obj_type = "";
            }
            if (okayToSave){ 
                if (objModel.roles === undefined || objModel.roles === null){
                    objModel['roles'] = ['super-user'];
                }
                objModel.obj_type = objModel.obj_type.trim();               
                allModels.push(objModel);  
                var elBackDrop = angular.element(document.querySelector('.modal-backdrop'));  
                var elModal = angular.element(document.querySelector('.modal'));  
                elBackDrop.fadeOut();
                elModal.fadeOut();
                $scope.doSave = true;
                elBackDrop.remove();
                close({      
                        doSave: $scope.doSave,  
                        models: allModels                                     
                }, 500); // close, but give 500ms for bootstrap to animate                 
            }
            else{
                $scope.message = message;
                $scope.showMessage = true;
            }
        }
    }

    $scope.validateName = function(){
        $scope.obj_type = $scope.obj_type.replace(/[^a-zA-Z]/g,'_').trim().toLowerCase();
        var modelName = $scope.obj_type.toLowerCase().trim();
            if (modelName === "bsuser" || modelName === "bsuser_analytics" || modelName === "bsuser_session" ||
                modelName === "analytics" || modelName === "internal_system" || modelName === "session" || modelName === "uid"){   
                okayToSave = false;             
                $scope.message = "Sorry, " + $scope.obj_type + " is reserved for internal use.";
                $scope.obj_type = "";
                $scope.showMessage = true;
            }
    }
      
      $scope.cancel = function() {     
      //  Manually hide the modal.
        $element.modal('hide');      
        //  Now call close, returning control to the caller.
        close({         
            doSave: $scope.doSave,           
        }, 500); // close, but give 500ms for bootstrap to animate
    };  
  }]);