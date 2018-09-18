dashboard.controller("RoleSecurityController", ['$rootScope', '$scope', '$state', '$location', '$q',
'backstrap_service', 'Flash', 'ModalService', 
function ($rootScope, $scope, $state, $location, $q, backstrap_service, Flash, ModalService) {
    $scope.role = backstrap_service.getSelectedRole();
    $scope.modelList = [];
    $scope.modelGrid = [];
    $scope.isUpdate = $rootScope.isUpdate;

    if ($scope.role === undefined || $scope.role === null){
        $state.go('app.roles');
    }
    loadModelGrid();

    $scope.addEndpoint = function(){
        ModalService.showModal({
        templateUrl: '../../app/modules/dashboard/views/roleAddEndpoint.html',
        controller: "RoleAddEndpointController",
        inputs: {
            title: $scope.role,               
        }
        }).then(function(modal) {
            modal.element.modal();
            modal.close.then(function(result) {
                if ( result.permission !== null &&  result.permission !== undefined &&  result.permission != ''){
                    saveRoles(result.role, 'Successfully added permission: ' + result.permission);   
                }
            });
        });
    };

    $scope.removeEndpoint = function(p){
        ModalService.showModal({
        templateUrl: '../../app/modules/dashboard/views/roleRemoveEndpoint.html',
        controller: "RoleRemoveEndpointController",
        inputs: {
            title: { role: $scope.role, permission: p }              
        }
        }).then(function(modal) {
            modal.element.modal();
            modal.close.then(function(result) {    
                saveRoles(result.role, 'Successfully removed permission: ' + result.permission);               
            });
        });

    };

    $scope.addModel = function(){
        ModalService.showModal({
        templateUrl: '../../app/modules/dashboard/views/roleModel.html',
        controller: "RoleModelController",
        inputs: {
            title: {role: $scope.role, create:true, models: $scope.modelList}               
        }
        }).then(function(modal) {
            modal.element.modal();
            modal.close.then(function(result) {                 
               if (result.doSave){                
                    saveModelFile(result.model, 'Successfully added model: ' + result.model.obj_type + ' from role.');  
                }
            });
        });
    };

    $scope.removeModel = function(modelName){
        ModalService.showModal({
        templateUrl: '../../app/modules/dashboard/views/roleModel.html',
        controller: "RoleModelController",
        inputs: {
            title: {role: $scope.role, create:false, models: $scope.modelList, modelName: modelName}               
        }
        }).then(function(modal) {
            modal.element.modal();
            modal.close.then(function(result) { 
                if (result.doSave){                
                    saveModelFile(result.model, 'Successfully removed model: ' + result.model.obj_type + ' from role.');                    
                }
            });
        });
    };

    function loadModelGrid(){
        $scope.modelList = backstrap_service.getLocalModels();
        $scope.modelGrid = [];
        $scope.modelList.forEach(function(m){
            if (m.roles !== undefined && m.roles !== null && m.roles.length > 0){
                if (m.roles.indexOf($scope.role.name) !== -1){
                    $scope.modelGrid.push(m.obj_type);
                }
            }
        });
    }
    
    function saveRoles(role, message){
        $rootScope.actionInProgress = true;
        var roles = backstrap_service.getLocalRoles();
        var ixRole = -1;
        var ixRoleToUpdate = -1;           
        roles.forEach(function(r){
            ixRole++;
            if (r.name === $scope.role.name){
                ixRoleToUpdate = ixRole;
            }
        });  
            
        if (ixRoleToUpdate === -1){
            //new role
            roles.push(role);
        }
        else{
            roles[ixRoleToUpdate] = role;
        }
        var file_object = { 
            file_object: { 
                type: 'security',
                data: roles
            }
        };
        //do save action
        var deferred = $q.defer();
        backstrap_service.postFile(file_object)    
        .then(function(response){
           $rootScope.actionInProgress = false;
            $scope.role = role;
            backstrap_service.setSelectedRole(role);
            //backstrap_service.setSecurityFileUid(response.uid);                         
             deferred.resolve(response); 
             Flash.create('success', message, 'large-text');                  
        });
    }

    function saveModelFile(modelToUpdate, message){
        var deferred = $q.defer();
        var modelIxToUpdate = 0;
        //make sure that we have the most recent models file downloaded.                        
        $rootScope.actionInProgress = true;
        var objModels = backstrap_service.getLocalModels();                  
        objModels.forEach(function(model, ixx){
            if (model.obj_type === modelToUpdate.obj_type){
                modelIxToUpdate = ixx;
            }
        });            
        //save this scoped instance
        var updatedDate = new Date().toISOString().slice(0, 10);
        modelToUpdate.updated_date = updatedDate;
            
        //persist collection back to scope
        objModels[modelIxToUpdate] = modelToUpdate;  
            
        var file_object = { 
            file_object: { 
                type: 'models',
                data: objModels
            }
        };
        //do save action
        backstrap_service.postFile(file_object)    
        .then(function(response){
            backstrap_service.setLocalModels(objModels); 
            //backstrap_service.setModelFileUid(response.uid);                         
            $rootScope.actionInProgress = false;
            loadModelGrid();
            Flash.create('success', message, 'large-text');   
            deferred.resolve(response);
                             
        });
    }

}]);

