dashboard.controller("RoleDetailController", ['$scope', '$animate', '$element', 'title', 'close', 'backstrap_service',
  function($scope, $animate, $element, title, close, backstrap_service) {
    $scope.isUpdate = title === 'update';
    $scope.buttonText = $scope.isUpdate ? "Manage Security Features" : "Add Security Features";
    $scope.role = backstrap_service.getSelectedRole();    
    var btnClicked = false;
    var isValid = true;

    $scope.validateName = function(){
        $scope.role.name = $scope.role.title.replace(/[^a-zA-Z]/g,'_').trim().toLowerCase();
    }

    $scope.save = function(){
         btnClicked = true;
        if ($scope.role.title.length === 0){
            $scope.message = "Please proivde a title for this security role."
        }
        else{
             var roles = backstrap_service.getLocalRoles();
             isValid = true;
             roles.forEach(function(role){
                 if ($scope.role.name === role.name && !$scope.isUpdate){
                     isValid = false;
                     $scope.message = "This role already exists";

                 }
             });
             if (isValid){
                if (!$scope.isUpdate){
                    $scope.role['created_date'] = new Date().toISOString();
                    $scope.role['pattern_matches'] = [];
                }
                var elBackDrop = angular.element(document.querySelector('.modal-backdrop'));  
                var elModal = angular.element(document.querySelector('.modal'));  
                elBackDrop.fadeOut();
                elModal.fadeOut();
                elBackDrop.remove();
                close({
                    addSecurity: true,
                    isUpdate: $scope.isUpdate, 
                    role:  $scope.role                                     
                }, 500); // close, but give 500ms for bootstrap to animate      
             }
        }          
    }

    $scope.showMessage = function(){       
        if (btnClicked && $scope.role.title.length === 0 || !isValid){
            return true;
        }
        else{
            return false;
        }
    }
}]);