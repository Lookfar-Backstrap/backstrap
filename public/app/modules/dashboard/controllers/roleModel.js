dashboard.controller("RoleModelController", ['$scope', '$animate', '$element', 'title', 'close', 'backstrap_service',
  function($scope, $animate, $element, title, close, backstrap_service) {   
    $scope.role = backstrap_service.getSelectedRole(); 
    $scope.models = title.models;
    $scope.doSave = false;
    $scope.doDelete = false;
    $scope.showDelete = false;   
    $scope.message = "Are you sure you want to remove this security function?";
    $scope.selectedModelText = title.create ? '' : title.modelName;
    $scope.results = [];
    $scope.searchText = '';
    $scope.showMessage = false;
    $scope.isCreate = title.create;   
    $scope.bodyTitle = (title.create ? 'Create' : 'Update') + ' model level security function';
     var self = this;
     
      $scope.querySearch = function() {
            $scope.results = [];
            $scope.models.forEach(function(m){                 
                if (m.obj_type !== undefined){                         
                    if (m.obj_type.indexOf($scope.selectedModelText) > -1){
                        if (m.roles !== undefined && m.roles !== null && m.roles.length > 0){
                            if (m.roles.indexOf($scope.role.name) === -1){
                                $scope.results.push(m);  
                            }
                        }
                    }
                }
            });    
        };

        $scope.selectedItemChange = function(item) {          
            $scope.selectedModelText = item.obj_type;     
            $scope.results = [];
        };

        $scope.cancel = function(){
            close({
                models: $scope.models,
                doSave: false
            }, 500); // close, but give 500ms for bootstrap to animate
        };

        $scope.save = function(){
            var model = {};
            if ($scope.selectedModelText.length === 0){
                $scope.showMessage = true;
                $scope.message = "Please select a model.";
            }
            else{
                $scope.models.forEach(function(m){
                    if (m.obj_type === $scope.selectedModelText){
                        m.roles.push($scope.role.name);
                        model = m;
                    }
                });
                var elBackDrop = angular.element(document.querySelector('.modal-backdrop'));  
                var elModal = angular.element(document.querySelector('.modal'));  
                elBackDrop.fadeOut();
                elModal.fadeOut();
                elBackDrop.remove();
                close({
                    model: model,
                    doSave: true
                }, 500); // close, but give 500ms for bootstrap to animate
            }
        };

         $scope.remove = function(){           
            var ixRole = -1;
            var ixRoleToRemove = 0;
            var model = {};
            $scope.models.forEach(function(m){              
               if (m.obj_type === $scope.selectedModelText){     
                   m.roles.forEach(function(r){
                       ixRole++;
                       if (r.name === $scope.role.name){
                           ixRoleToRemove
                       }
                   });
                   console.log('removed' + ixRoleToRemove);
                   m.roles.splice(ixRoleToRemove, 1);      
                   model = m; 
                }
            });
            
            var elBackDrop = angular.element(document.querySelector('.modal-backdrop'));  
            var elModal = angular.element(document.querySelector('.modal'));  
            elBackDrop.fadeOut();
            elModal.fadeOut();
            elBackDrop.remove();
            close({
                model: model,
                doSave: true
            }, 500); // close, but give 500ms for bootstrap to animate
        };

        function loadAll() {
           
            var availModels = [];            
            $scope.models.forEach(function(m){          
                if (m.roles !== undefined && m.roles !== null && m.roles.length > 0){      
                    if (m.roles.indexOf($scope.role.name) === -1){
                        availModels.push(m);
                    }
                }
            });                   
            return availModels;
        }

        $scope.showDeleteMessage = function(){
            $scope.showDelete = true;
            $scope.showMessage = true;
            $scope.message = "Are you sure you want to remove this security function?";
        };
   
     
}]);
