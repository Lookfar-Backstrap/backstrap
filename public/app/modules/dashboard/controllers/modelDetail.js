

dashboard.controller("ModelDetailController", ['$rootScope', '$scope', '$state', '$location', 
'backstrap_service', 'Flash', 'ModalService','$q', 
function ($rootScope, $scope, $state, $location, backstrap_service, Flash, ModalService, $q) {
    if(backstrap_service.getSendToAccount()){
        $state.go('app.account');
    }
    var vm = this;
    $scope.editDesc = false;
    var user = backstrap_service.getUserInfo();
    vm.model = backstrap_service.getSelectedModel();
    if (vm.model === undefined || vm.modal === null || user.username === null || user.username === undefined){
        $location.path('../#/login');
        return false;
    }
  
    var canBeHere = false;
    if (vm.model.roles.length === 0){
        canBeHere = true;       
    }
    else{
        user.roles.forEach(function(ur){
            vm.model.roles.forEach(function(mr){
                if (mr === ur){
                    canBeHere = true;
                }
            });
        });
    }
    if (!canBeHere){
          Flash.create('error', 'You do not have the correct permissions to view model: ' + vm.model.obj_type, 'large-text');
           $state.go('app.modelList');
    }
    $scope.childRelationships = []; 
    $scope.relFilterOptions =  ["All","Active","DeActivated"];
    $scope.relFilterGrid = [];
    $scope.relFilter = "All";

    var modelIxToUpdate = 0;
    var propIxToUpdate = 0;

    var allModels = backstrap_service.getLocalModels();

    loadModelRelationships();

    function loadModelRelationships(){
          $scope.relFilterGrid = [];
            allModels.forEach(function(m){      
            if (m.obj_type === vm.model.obj_type){             
                m.relationships.forEach(function(r){
                    if (r['is_active'] === undefined || r['is_active'] === null){
                        r['is_active'] = true;    
                    }      
                      
                    if ($scope.relFilter === 'All'){
                            $scope.relFilterGrid.push(r);
                    }
                    else if ($scope.relFilter === 'Active' && r.is_active){
                            $scope.relFilterGrid.push(r);
                    }
                    else if ($scope.relFilter === 'DeActivated' && !r.is_active){
                            $scope.relFilterGrid.push(r);
                    }
                   
                });   
            } 
            else{
                  m.relationships.forEach(function(r){
                        if (r.linking_table.indexOf(vm.model.obj_type) != -1 && r.relates_to !== m.obj_Type){                  
                            $scope.childRelationships.push(m.obj_type);                
                        }
                  });
            }
        });
    }

    $scope.updateRelationships = function(){
       loadModelRelationships();
    };
    
    $scope.complexResult = null;
    $scope.createRelationship = function(){     
        $rootScope.actionInProgress = true;
        var title = [];
        title[0] = "create";   
        title[1] = null;
        title[2] = vm.model;              
        ModalService.showModal({
        templateUrl: '../../app/modules/dashboard/views/relationship.html',
        controller: "RelationshipController",
        inputs: {
            title: title,               
        }
        }).then(function(modal) {
            modal.element.modal();
            modal.close.then(function(result) {                 
                if (result.doSave){   
                    vm.model = backstrap_service.getSelectedModel();           
                    var relationship = result.rel;
                    relationship['is_active'] = true;         
                    try{
                        //relates_to is the object type. 
                        delete relationship.obj_type;
                    } 
                    catch(err){

                    }    
                    vm.model.relationships.push(result.rel);
                    backstrap_service.setSelectedModel(vm.model);
                    saveModelFile();
                }
            });

        });
    };
        
    vm.relationshipDetail = function(rel){     
        var title = [];
        title[0] = "update";
        title[1] = rel;      
        title[2] = vm.model;    
        ModalService.showModal({
        templateUrl: '../../app/modules/dashboard/views/relationship.html',
        controller: "RelationshipController",
        inputs: {
            title: title,               
        }
        }).then(function(modal) {
            modal.element.modal();
            modal.close.then(function(result) { 
                vm.model = backstrap_service.getSelectedModel();                      
                if (result.doDelete){
                    vm.model.relationships.forEach(function(rel, ix){
                        if (rel.linking_table === result.rel.linking_table){
                            rel['is_active'] = false;
                        }
                    });
                    backstrap_service.setSelectedModel(vm.model);
                    saveModelFile();                   
                }
                else if (result.doActivate){
                    vm.model.relationships.forEach(function(rel, ix){
                        if (rel.linking_table === result.rel.linking_table){
                            rel['is_active'] = true;
                        }
                    });
                    backstrap_service.setSelectedModel(vm.model);
                    saveModelFile();                  
                }
            });
        })
    };
      
    vm.propertyDetail = function(property){       
        var title = []
        title[0] = "update";
        title[1] = property;   
        title[2] = vm.model;       
        ModalService.showModal({
        templateUrl: '../../app/modules/dashboard/views/modelProperty.html',
        controller: "ModelPropertyController",
        inputs: {
            title: title,               
        }
        }).then(function(modal) {
            modal.element.modal();
            modal.close.then(function(result) {                  
               if (result.doSave){
                   vm.model = backstrap_service.getSelectedModel();       
                    var objModels = backstrap_service.getLocalModels();
                    vm.model.properties.forEach(function(prop, ix){                        
                        if (prop.name === result.property.name){
                            propIxToUpdate = ix;   
                        }
                    });
                    //save this scoped instance
                    vm.model.properties[propIxToUpdate] = result.property;
                    saveModelFile();   
                }                             
            });
        });
    };   

    $scope.createProperty = function(){ 
        var title = []            
        title[0] = "create";
        title[1] = vm.model;    
        ModalService.showModal({
        templateUrl: '../../app/modules/dashboard/views/modelProperty.html',
        controller: "ModelPropertyController",
        inputs: {
            title: title,               
        }
        }).then(function(modal) {
            modal.element.modal();
            modal.close.then(function(result) {                                 
               if (result.doSave){    
                   vm.model = backstrap_service.getSelectedModel();        
                    var updatedDate = new Date().toISOString().slice(0, 10);
                    vm.model.updated_date = updatedDate;
                    vm.model.properties.push(result.property);
                    backstrap_service.setSelectedModel(vm.model);
                    saveModelFile();
                }
            });
        });
    };      

    $scope.goToModel = function(parentModel){
         allModels.forEach(function(m){ 
            if (m.obj_type === parentModel){
                backstrap_service.setSelectedModel(m);    
               $state.reload();
            }
        });
    };

    $scope.saveDesc =function(){
        $scope.editDesc = false;
         var updatedDate = new Date().toISOString().slice(0, 10);
        vm.model.updated_date = updatedDate;
        saveModelFile();
    };

    function saveModelFile(){
        var deferred = $q.defer();
        //make sure that we have the most recent models file downloaded.    
        $rootScope.actionInProgress = true;
        var objModels = backstrap_service.getLocalModels();                  
        vm.model.properties.forEach(function(prop, ix){                        
            objModels.forEach(function(model, ixx){
                if (model.obj_type === vm.model.obj_type){
                    modelIxToUpdate = ixx;
                }
            });            
        });
        //save this scoped instance
        var updatedDate = new Date().toISOString().slice(0, 10);
        vm.model['date_updated'] = updatedDate;
            
        //persist collection back to scope
        objModels[modelIxToUpdate] = vm.model;  
                
        var file_object = { 
            file_object: { 
                type: 'models',
                data: objModels
            }
        };
        //do save action
        backstrap_service.postFile(file_object)    
        .then(function(response){
            backstrap_service.setSelectedModel(vm.model);
            backstrap_service.setLocalModels(objModels); 
            deferred.resolve(response);
            $rootScope.actionInProgress = false;
            Flash.create('success', 'Model saved', 'large-text');
            $state.reload();
        });           
    }

    $scope.showNameHint = function(){
        var prop = {};
        vm.model.properties.forEach(function(p){
            if (p.name === "name"){
                prop = p;
            }
        });
        ModalService.showModal({
        templateUrl: '../../app/modules/dashboard/views/modelPropertyHint.html',
        controller: "ModelPropertyHintController",
        inputs: {
            title: {obj_type: vm.model.obj_type, property: prop.name, hint: prop.hint},               
        }
        }).then(function(modal) {
            modal.element.modal();
            modal.close.then(function(result) {                                
              
            });
        });             
    };
}]);



