dashboard.controller("AddRelationshipToModelController", ['$scope', '$rootScope', '$animate', '$element', 'title', 'close', 'backstrap_service',
  function($scope, $rootScope, $animate, $element, title, close, backstrap_service) {
    var allModels = [];
    $scope.model = backstrap_service.getSelectedModel();
    allModels  = backstrap_service.getLocalModels();
    $scope.lookupKey = '';
    $scope.objRel = title;
    $scope.doSave = false;
    $scope.table = makeTabular(title.rel);      

    $scope.addRelationship = function(){
        $scope.doSave = true;   
        $scope.cancel();
    };

    $scope.cancel = function() {     
    //  Manually hide the modal.
    $element.modal('hide');      
    
    //  Now call close, returning control to the caller.
    close({
        rel: $scope.objRel,
        lookupKey: $scope.lookupKey,
        doSave: $scope.doSave
    }, 500); // close, but give 500ms for bootstrap to animate
};  

     function makeTabular(obj){           
            var table = {
                headers: [],
                rows: []
            };
            var modelsWithUser = [];
            for(var idx = 0; idx < allModels.length; idx++) {
                modelsWithUser[idx] = allModels[idx];
            }
            modelsWithUser.push({
                'obj_type': 'bsuser',
                'description': 'This is a user entity',
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
            modelsWithUser.forEach(function(m){           
               if (m.obj_type === obj.object_type){
                    m.properties.forEach(function(p){ 
                    table.headers.push(p.name);
                    });      
                var row = [];
                row["row_items"] = [];               
                m.properties.forEach(function(p){  
                    var propVal = obj[p.name];  
                    if (propVal === undefined){
                        propVal = '';
                    }   
                    var objProp = { item: propVal };                
                    row["row_items"].push(objProp);
                });                   
                table.rows.push(row)
               }
            });           
        return table;
    }
  }]);