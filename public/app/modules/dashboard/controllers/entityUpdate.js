dashboard.controller("EntityUpdateController", ['$rootScope', '$scope', '$state', '$location', '$q',
'backstrap_service', 'Flash', 'ModalService', 
function ($rootScope, $scope, $state, $location, $q, backstrap_service, Flash, ModalService) {
    var vm = this;
    vm.selectedEntity = backstrap_service.getSelectedEntity();
    //console.log(vm.selectedEntity);
    vm.fromQueryResult = $rootScope.fromQueryResult;
    var rel = {
        relates_to: '',
        parameters:[{
            property: '',
            value: ''           
        }]
    };
    var deferred = $q.defer();
    $scope.origRelationships = [];

    $scope.btnExecuteText = "Update Record";

    $scope.selectedRelationshipProperties = [];
    $scope.dataLoading = false;
    $scope.selectedItemChange = function(obj){
        $scope.selectedRelationshipProperties.push(obj);
        $scope.data = {
            relGroup : '',     
        };
         $scope.relSearchResults = [];
         $scope.rel.relates_to = '';
    };

    vm.query = {rels: [], props: []};
    
    vm.model = backstrap_service.getSelectedModel();
    vm.allModels = backstrap_service.getLocalModels();

    //display Arrays and Objects different than other values such as string bool and int
    vm.model.properties.forEach(function(p){ 
      var entityProps = {
            property: p.name,
            data_type: p.data_type,
            required: p.required,
            hint: p.hint,           
            value: vm.selectedEntity[p.name] == undefined ? '' : vm.selectedEntity[p.name],
        };
        if (entityProps.data_type === 'array' || entityProps.data_type === 'object' || entityProps.data_type === 'boolean'){
            try{
                    if (entityProps.value === ""){
                        if (entityProps.data_type === 'array'){
                            entityProps.value = [];
                        }
                        else if (entityProps.data_type === 'object'){
                            entityProps.value = {};
                        }
                        else if (entityProps.data_type === 'boolean'){
                            entityProps.value = null;
                        }
                    }
                    else{
                        var jsonObj = JSON.stringify(entityProps.value);
                        jsonObj = jsonObj.replace("\\\"", "\"");
                        entityProps.value = jsonObj;
                    }                    
                }
                catch(err){
                    entityProps.value = "Error parsing JSON: " + entityProps.value;
                }
        }
        vm.query.props.push(entityProps);
    });   
    //now rels
    var allRels = [];
    vm.allModels.forEach(function(m) {
        m.relationships.forEach(function(r) {
            if (r['is_active'] === undefined || r['is_active'] === null){
                r['is_active'] = false;
            }
            if(r.is_active === true && (r.relates_to === vm.selectedEntity.object_type) && (r.relates_from !== vm.selectedEntity.object_type)) {
                allRels.push(r);
            }
        });
    });
    vm.model.relationships.forEach(function(r) {
        if (r['is_active'] === undefined || r['is_active'] === null){
            r['is_active'] = false;
        }
        if (r.is_active){
            allRels.push(r);
        }
    });

    allRels.forEach(function(r){
        if(r.relates_from === vm.selectedEntity.object_type) {
            var rels = vm.selectedEntity[r.plural_name];
            if (rels !== undefined && rels !== null){
                var relTypes = Object.keys(rels);
                for(var kIdx = 0; kIdx < relTypes.length; kIdx++) {
                    var relObjs = rels[relTypes[kIdx]];

                    if(relObjs.length > 0) {
                        relObjs.forEach(function(rObj){
                            var relates_to = {
                                display_text: getDisplayText(rObj),
                                rel: rObj,
                                rel_type: relTypes[kIdx]
                            };                       
                            $scope.selectedRelationshipProperties.push(relates_to);
                            $scope.origRelationships.push(relates_to);
                        });
                    }
                }
            }
        }
        else {
            var rels = vm.selectedEntity[r.plural_rev];
            if (rels !== undefined && rels !== null){
                var relTypes = Object.keys(rels);
                for(var kIdx = 0; kIdx < relTypes.length; kIdx++) {
                    var relObjs = rels[relTypes[kIdx]];

                    if(relObjs.length > 0) {
                        relObjs.forEach(function(rObj){
                            var relates_to = {
                                display_text: getDisplayText(rObj),
                                rel: rObj,
                                rel_type: relTypes[kIdx]
                            };                       
                            $scope.selectedRelationshipProperties.push(relates_to);
                            $scope.origRelationships.push(relates_to);
                        });
                    }
                }
            }
        }
    });

    function getDisplayText(rel){
        var strVal = '';

        if(rel['rel_type'] !== undefined && rel['rel_type'] !== null && rel['rel_type'] !== '') {
            strVal = rel['rel_type']+'-';
        }

        if (rel['name'] == null){
            if (rel['username'] == null){
                if (rel['title'] == null){     
                    var exit = false;
                 
                    Object.keys(rel).forEach(function(key){	
                       if (key !== "id" && key !== 'created_at' && key !== 'is_active' && key.indexOf('_id') === -1 && !exit){
                            exit = true;     
                            strVal += rel[key].toString();
                        }
                    }); 
                }
                else{
                    strVal += rel['title'];
                }
            }
            else {
                strVal += rel['username'];
            }
        }
        else{
            strVal += rel['name'];
        }
        if (strVal.length > 15){
            return strVal.substring(0, 15); 
        }
        else{
            return strVal;
        }
    };

  $scope.data = {
      relGroup : '',     
    };
  
  $scope.relSearchResults = [];

   $scope.querySearch = function(){
       if ($scope.rel.relates_to.length >= 3){
             var modelsWithUser = [];
            for(var idx = 0; idx < vm.allModels.length; idx++) {
                modelsWithUser[idx] = vm.allModels[idx];
            }
            modelsWithUser.push({
                'obj_type': 'bsuser',
                'description': 'This is a person entity',
                'relationships': [],
                'properties': [{
                    'name': 'id',
                    'data_type': 'string',
                    'required': true,
                    'hint': ''
                },
                {
                    'name': 'username',
                    'data_type': 'string',
                    'required': true,
                    'hint': ''
                },
                {
                    'name': 'first_name',
                    'data_type': 'string',
                    'required': false,
                    'hint': ''
                },
                {
                    'name': 'last_name',
                    'data_type': 'string',
                    'required': false,
                    'hint': ''
                },
                {
                    'name': 'email',
                    'data_type': 'string',
                    'required': false,
                    'hint': ''
                },
                {
                    'name': 'title',
                    'data_type': 'string',
                    'required': false,
                    'hint': ''
                }]
            });           
            modelsWithUser.forEach(function(r){
                if (r.obj_type === $scope.data.relGroup){  
                    var query = searchRelationQuery();
                    backstrap_service.postBackstrapQuery(query)
                    .then(function(queryItems){
                      $scope.relSearchResults = [];
                        queryItems.results.forEach(function(obj){
                            r.properties.forEach(function(p){  
                                var propVal = obj[p.name];  
                                if (propVal === undefined){
                                    propVal = '';
                                }   
                               propVal = propVal.toString().toLowerCase();
                                var relTo = $scope.rel.relates_to.toLowerCase();
                                if (propVal.indexOf(relTo) != -1){
                                    var relates_to = {
                                        display_text: propVal,
                                        rel: obj,
                                        id: obj.id,
                                    }; 
                                    var add = true;
                                     $scope.relSearchResults.forEach(function(r){
                                         if (r.id === relates_to.id){
                                             add = false;
                                         }
                                     });  
                                    $scope.selectedRelationshipProperties.forEach(function(o){
                                          if (o.rel.id === relates_to.id){
                                             add = false;
                                         }
                                     });
                                     if (add){                             
                                        $scope.relSearchResults.push(relates_to);           
                                     }                        
                                }                         
                            });   
                        });   
                         return false; 
                    });   
                }
            });              
        }      
        else if ($scope.rel.relates_to.length === 0){
               $scope.relSearchResults = [];
        }
   };
    

        function searchRelationQuery(){
            var query = '';
            query += "{" +
            "\"query_object\": {" + 
                "\"resolve\": []," +
                "\"obj_type\": \"" + $scope.data.relGroup +  "\"," + 
                "\"parameters\": [],"+
                "\"relates_to\": []," + 
                "\"offset\": " + "\"0\"" + "," + 
                "\"range\": " + "\"100\"" + 
                "}}";            
                return JSON.stringify(JSON.parse(query),null,"    ");
        }

     
$scope.addRelationshipModal = function(rel){
     ModalService.showModal({
            templateUrl: '../../app/modules/dashboard/views/addRelationshipToModel.html',
            controller: "AddRelationshipToModelController",
            inputs: {
                title: rel,               
            }
            }).then(function(modal) {
                modal.element.modal();
                modal.close.then(function(result) {
                    if (result.doSave){
                        var saveRel = result.rel;
                        saveRel.rel["rel_type"] = result.lookupKey;       
                        $scope.selectedRelationshipProperties.push(saveRel);
                    }
                    $scope.data = {
                        relGroup : '',     
                    };
                    $scope.relSearchResults = [];
                    $scope.rel.relates_to = '';
                });
            });
        };   

        $scope.removeRel = function(rel){
            var ix = 0;
            var toRemove = 0;
            $scope.selectedRelationshipProperties.forEach(function(r){             
                if (r.display_text === rel.display_text && r.rel_type === rel.rel_type){
                    toRemove = ix;
                }
                ix++;
            });
            $scope.selectedRelationshipProperties.splice(toRemove, 1);
        };

        $scope.entityUpdate = function(){
            if (!$scope.dataLoading){
                var update_object = {};
                var updateEntityObj = {};
                var addObjRelationships = [];
                var removeObjRelationships = [];
                var doSave = true;
                $scope.dataLoading = true;
                $scope.btnExecuteText = "Updating Record...";
                vm.query.props.forEach(function(prop){               
                    if (prop.required && prop.value === ''){
                        Flash.create('danger', 'Missing required fields.', 'large-text');
                        $scope.btnExecuteText = "Update Record";
                        $scope.dataLoading = false;
                        doSave = false;
                    }
                    else{
                        if(prop.data_type === 'object' || prop.data_type === 'array' || prop.data_type === 'boolean') {
                            try {
                                var propObj;
                                if (!prop.required && (prop.value == null || prop.value =="")){
                                    propObj = null;
                                }
                                else {
                                    propObj = JSON.parse(prop.value);
                                }
                                updateEntityObj[prop.property] = propObj
                            }
                            catch(e) {
                                var error_msg = 'There was a problem parsing the input: '+prop.value+' for the property: '+prop.property;
                                console.log(error_msg);
                                Flash.create('danger', error_msg, 'large-text')
                            }
                        }
                        else {
                            updateEntityObj[prop.property] = prop.value;
                        }
                    }                             
                });
                if (doSave){
                    updateEntityObj['id'] = vm.selectedEntity.id;
                    updateEntityObj['object_type'] = vm.model.obj_type;
                    console.log(updateEntityObj);
                    //find the new                        
                    $scope.selectedRelationshipProperties.forEach(function(r){                  
                        var isNew = true;
                        $scope.origRelationships.forEach(function(relation){
                            if (relation.rel.id === r.rel.id && relation.rel.rel_type === r.rel.rel_type){
                                isNew = false;
                            }
                        });
                        if (isNew){
                            addObjRelationships.push({
                                object_type: r.rel.object_type,
                                id: r.rel.id,
                                rel_type: r.rel.rel_type
                            });
                        }
                    });
                    //find the ones to remove
                    $scope.origRelationships.forEach(function(relation){
                        var doRemove = true;
                        $scope.selectedRelationshipProperties.forEach(function(r){
                            if (relation.rel.id === r.rel.id && relation.rel.rel_type === r.rel.rel_type){
                                doRemove = false;
                            }
                        });
                        if (doRemove){                           
                            removeObjRelationships.push({
                                object_type: relation.rel.object_type,
                                id: relation.rel.id,
                                rel_type: relation.rel.rel_type
                            });
                        }
                    });
                   // console.log(removeObjRelationships);
                    update_object['update_entity'] = updateEntityObj;
                    update_object['obj_add_rel'] = addObjRelationships;    
                    update_object['obj_remove_rel'] = removeObjRelationships;
                      
                    var deferred = $q.defer();
                    var postObj = {};
                    postObj['update_object'] = update_object;                        
                    backstrap_service.updateEntity(postObj)
                    .then(function(updatedEntity){
                        if (updatedEntity.id === undefined){
                            updatedEntity = updatedEntity[0];
                        }
                        deferred.resolve(updatedEntity); 
                        $scope.dataLoading = false;
                        $scope.btnExecuteText = "Update Record";
                        vm.selectedEntity = updatedEntity;
                        backstrap_service.setSelectedEntity(updatedEntity);
                        addObjRelationships.forEach(function(r){
                            $scope.origRelationships.push({"rel":r});
                        });
                        Flash.create('success', 'Successfully updated the record.', 'large-text');
                        
                    },
                    function(err) {
                        console.log(err);
                        $scope.dataLoading = false;
                        $scope.btnExecuteText = "Update Record";
                        Flash.create('danger', 'There was a problem updating the entity.', 'large-text');
                    });                          
                }
            }
        };

        $scope.viewRelationshipEntity = function(rel){           
            ModalService.showModal({
            templateUrl: '../../app/modules/dashboard/views/viewRelationshipEntity.html',
            controller: "viewRelationshipEntityController",
            inputs: {
                title: {entity: rel, object_type:rel.object_type}               
            }
            }).then(function(modal) {
                modal.element.modal();
                modal.close.then(function(result) { 
                  
                });
            });
        };

        $scope.showHint = function(propName){
            var propObj = {
                 obj_type: vm.model.obj_type,
                 property: propName,
                 hint: ''
                }
            if (propName !== 'name'){
                vm.model.properties.forEach(function(p){
                    if (p.name === propName){
                        propObj.hint = p.hint;
                       
                    }
                });
            }
            ModalService.showModal({
            templateUrl: '../../app/modules/dashboard/views/modelPropertyHint.html',
            controller: "ModelPropertyHintController",
            inputs: {
                title: propObj,               
            }
            }).then(function(modal) {
                modal.element.modal();
                modal.close.then(function(result) {                                
                  
                });
            });             
        };


         $scope.backToQueryResults = function(){    
            $rootScope.backToQueryResults = true;
            $state.go('app.modelData');
        };
}]);