

dashboard.controller("ModelPropertyController", ['$scope','$rootScope', '$animate', '$element', 'title', 'close','backstrap_service',
  function($scope, $rootScope, $animate, $element, title, close,backstrap_service) {
    var functionVerb = title[0];
    
    $scope.message = "WARNING: Properties cannot be deleted. Additionally, once a property has been created, you cannot change the name.";
    $scope.showName = functionVerb === 'create';
    if (functionVerb === "update"){
         $scope.model = title[2];
         $scope.property =  $scope.property = {
            name: title[1].name,
            type: title[1].data_type,
            required: title[1].required,
            hint: title[1].hint,
         };;
    }
    else{
         $scope.model = title[1];
         $scope.property = {
            name: '',
            type: '',
            required: false,
            hint: '',  
         };
    }
    
   //select list doesn't work for shit with true / false
    //so we'll override with yes no
    $scope.is_req = "No";
    $scope.req_options = ["Yes", "No"];
    $scope.data_types = backstrap_service.getValidPropertyTypes();
    $scope.functionVerb = functionVerb;
   var req = $scope.property.required;
   
    if (req === null || req === undefined){
        req = "No";
    }
    else{
        req = $scope.property.required ? "Yes" : "No";
    }
    $scope.property.required = req;
   
      
     //  This close function doesn't need to use jQuery or bootstrap, because
    //  the button has the 'data-dismiss' attribute.
    $scope.doSave = function() { 
       var message = "";
        if ($scope.property.name === '' || $scope.property.data_type === '' || $scope.property.required === '')
        {
            $scope.message = "All fields are required.";  
        }
        else{ 
            $scope.model = backstrap_service.getSelectedModel();
            var propName = '';
            var validSubmit = true;
            $scope.model.properties.forEach(function(prop){
                propName = prop.name.toLowerCase().trim();
                if (propName === $scope.property.name.toLowerCase().trim()){
                    if ($scope.functionVerb === "create"){
                        validSubmit = false;
                        message = "Sorry, a property already exists with that name.";    
                    }
                }
            });
            propName = $scope.property.name.toLowerCase().trim();
            if (propName === "id" || propName === "is_active" || propName === "created_at"){
                validSubmit = false;
                message = "Sorry, but you can't add the property" + $scope.property.name + " because it is a reserved property";
            }
            if (validSubmit){
                $scope.property.name = $scope.property.name.trim();
                $scope.property.required = $scope.property.required === "Yes";   
                var elBackDrop = angular.element(document.querySelector('.modal-backdrop'));  
                var elModal = angular.element(document.querySelector('.modal'));  
                elBackDrop.fadeOut();
                elModal.fadeOut();
                elBackDrop.remove();
                close({
                    property: $scope.property,
                    doSave: true
                }, 500); // close, but give 500ms for bootstrap to animate
            }
            else{
                $scope.message = message;        
            }
        }
    };

    //  This cancel function must use the bootstrap, 'modal' function because
    //  the doesn't have the 'data-dismiss' attribute.
    $scope.cancel = function() {
        
        //  Manually hide the modal.
        $element.modal('hide');
        
        //  Now call close, returning control to the caller.
        close({
            rel: $scope.model,
            doSave: false
        }, 500); // close, but give 500ms for bootstrap to animate
    };

    $scope.validateName = function(){
        $scope.property.name =$scope.property.name.replace(/[^a-zA-Z]/g,'_').trim().toLowerCase();
         var propName = $scope.property.name.toLowerCase().trim();
            if (propName === "id" || propName === "is_active" || propName === "created_at"){                
                $scope.message = "Sorry, " + $scope.property.name + " is reserved for internal use.";
                $scope.property.name = "";
            }
    }
}]);
