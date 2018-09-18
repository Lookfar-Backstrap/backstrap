dashboard.controller("EntityInsertController", ['$rootScope', '$scope', '$state', '$location', '$q',
'backstrap_service', 'Flash', 'ModalService', 
function ($rootScope, $scope, $state, $location, $q, backstrap_service, Flash, ModalService) {
    var vm = this;
    vm.min = 0;
    vm.max = 100;
    var rel = {
        relates_to: '',
        parameters:[{
            property: '',
            value: ''
        }]
    };

    $scope.btnExecuteText = "Insert Record";

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

   vm.model.properties.forEach(function(p){
        vm.query.props.push({
            property: p.name,
            data_type: p.data_type,
            required: p.required,
            hint: p.hint,  
            value: ''
        });
    });   

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
                        queryItems.forEach(function(obj){  
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

     $scope.showJSON = function(){     
            var title = createQueryJSON();
            ModalService.showModal({
            templateUrl: '../../app/modules/dashboard/views/query_json.html',
            controller: "QueryJSONController",
            inputs: {
                title: title,               
            }
            }).then(function(modal) {
                modal.element.modal();
                modal.close.then(function(result) {                 
                  
                });
            });
        };   

        function searchRelationQuery(){
            var query = '';
            query += "{" +
            "\"query_object\": {" + 
                "\"resolve\": []," +
                "\"obj_type\": \"" + $scope.data.relGroup +  "\"," + 
                "\"parameters\": [],"+
                "\"relates_to\": []," + 
                "\"offset\": " + vm.min + "," + 
                "\"range\": " + vm.max + 
                "}}";
                return JSON.stringify(JSON.parse(query),null,"    ");
        }

      
        $scope.executeQuery = function(){
            //prevent double clicking
            if (!$scope.dataLoading){
                if ($scope.QueryResultItemsCount > 2){
                    vm.queryResults.splice($scope.QueryResultItemsCount, 1);
                }
                $scope.dataLoading = true;
                $scope.btnExecuteText = "Inserting Data...";               
                var query = createQueryJSON();
                backstrap_service.postBackstrapQuery(query)
                .then(function(queryItems){          
                $scope.QueryResultItemsCount++;     
                itemNameNumber++;
                var qr ={
                        title: vm.model.obj_type + ' ' + itemNameNumber,
                        query: query,
                        items: [],
                        table: {},
                    };   
                    qr.items.push(JSON.stringify(queryItems));  
                    qr.table = makeTabular(queryItems);
                    vm.queryResults.push(qr);  
                    $scope.selectedIndex =  $scope.QueryResultItemsCount;
                    $scope.dataLoading = false;
                    $scope.btnExecuteText = "Insert Record";  
                    //hack to fix tab issue where tabs after the third disappear 
                    if ($scope.QueryResultItemsCount > 2){
                        vm.queryResults.push({
                            title: '',
                            query: '',
                            items: []
                        });                         
                    }               
                });     
            }      
        };
       
     

        function makeTabular(json){
            var table = {
                headers: [],
                rows: []
            };        
            vm.model.properties.forEach(function(p){ 
                table.headers.push(p.name);
            });              
            
            json.forEach(function(obj){  
                var row = [];
                row["row_items"] = [];               
                vm.model.properties.forEach(function(p){  
                   var propVal = obj[p.name];  
                    if (propVal === undefined){
                        propVal = '';
                    }   
                    var objProp = { item: propVal };                
                    row["row_items"].push(objProp);
                });     
               
                table.rows.push(row)
            });    
      
        return table;
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
                        saveRel["lookup_rel_type"] = result.lookupKey;       
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
                if (r.display_text === rel.display_text && r.lookup_rel_type === rel.lookup_rel_type){
                    toRemove = ix;
                }
                ix++;
            });
            $scope.selectedRelationshipProperties.splice(toRemove, 1);
        };

        $scope.entityInsert = function(){
            if (!$scope.dataLoading){
                var create_object = {};
                var newEntityObj = {};
                var objRelationships = [];
                var doSave = true;
                $scope.dataLoading = true;
                $scope.btnExecuteText = "Creating Record...";
                vm.query.props.forEach(function(prop){               
                    if (prop.required && prop.value === '' && prop.property !== 'id'){
                        Flash.create('danger', 'Missing required fields.', 'large-text');
                        $scope.btnExecuteText = "Insert Record";
                        $scope.dataLoading = false;
                        doSave = false;
                    }
                    else{
                        if (prop.property !== 'id'){
                            if(prop.data_type === 'object' || prop.data_type === 'array' || prop.data_type === 'boolean') {
                                try {
                                    if (prop.value === ""){
                                        if (prop.data_type === 'array'){
                                            newEntityObj[prop.property] = [];
                                        }
                                        else if (prop.data_type === 'object'){
                                            newEntityObj[prop.property] = {};
                                        }
                                        else if (prop.data_type === 'boolean'){
                                            newEntityObj[prop.property] = null;
                                        }     
                                    }
                                    else{
                                        newEntityObj[prop.property] = JSON.parse(prop.value);
                                    }
                                }
                                catch(e) {
                                    doSave = false;
                                    console.log('There was a problem parsing the input: '+prop.value+' for the property: '+prop.property);
                                }
                            }
                            else {
                                newEntityObj[prop.property] = prop.value;
                            }
                        }
                    }                             
                });
                if (doSave){
                    newEntityObj['object_type'] = vm.model.obj_type;            
                    $scope.selectedRelationshipProperties.forEach(function(r){
                        objRelationships.push({
                            object_type: r.rel.object_type,
                            id: r.rel.id,
                            rel_type: r.lookup_rel_type
                        });
                    });
                    create_object['new_entity'] = newEntityObj;
                    create_object['relationships'] = objRelationships; 
                    var postObj = {};
                    postObj['create_object'] = create_object;
                    backstrap_service.createEntity(postObj)
                    .then(function(insertedEntity){
                        if (insertedEntity.id === undefined){
                            insertedEntity = insertedEntity[0];
                        }                      
                        $scope.dataLoading = false;
                        $scope.btnExecuteText = "Insert Record";
                        vm.selectedEntity = insertedEntity;
                        backstrap_service.setSelectedEntity(insertedEntity);
                        Flash.create('success', 'Successfully created the record.', 'large-text');
                        $state.go('app.entityUpdate');
                    },
                    function(err) {
                        $scope.dataLoading = false;
                        $scope.btnExecuteText = "Insert Record";
                        Flash.create('danger', 'There was a problem creating the entity', 'large-text');
                    });                                  
                }
            }
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
}]);