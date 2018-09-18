dashboard.controller("AccountController", ['$rootScope', '$scope', '$state', '$location', '$q',
'backstrap_service', 'Flash', 'ModalService', 
function ($rootScope, $scope, $state, $location, $q, backstrap_service, Flash, ModalService) {
  
    $scope.isEdit = false;
    $scope.user = backstrap_service.getSelectedUser();
    $scope.isEdit = $scope.user.username !== '';
    $scope.firstValid = false;
    $scope.lastValid = false;
    $scope.emailValid = false;
    $scope.usernameValid = false;
    $scope.isValid = false;
    validateForm();

    if ($scope.isEdit){
        $scope.buttonText = "Save";
        $scope.createdDate = new Date($scope.user.created_at).toISOString().slice(0, 10);
    }
    else{
        $scope.buttonText = "Create User";
        $scope.createdDate = new Date().toISOString().slice(0, 10);
    }
    $scope.selectedRoles = $scope.user.roles;
    $scope.roles = [];
    backstrap_service.fetchFile('file_name=security').then(function (response) {
        $scope.roles = response.roles;
        $scope.roles.forEach(function(role){
            role.selected = $scope.user.roles.indexOf(role.name) != -1;
        });
    });

    $scope.toggle = function (paramRole) {
        $scope.roles.forEach(function(role){                   
            if (role.name === paramRole.name){
                role.selected = !role.selected;              
            }
        });    
        
    };  
    $scope.isActive = function (paramUser) {
        $scope.user.is_active = !paramUser.is_active;
    };  

    $scope.cancel = function(){
        $state.go('app.users');
    };
    
    $scope.create = function(){
        $scope.user.roles = [];        
        $scope.roles.forEach(function(role){
            if (role.selected){
                $scope.user.roles.push(role.name);
            }
        });
        if ($scope.user.roles.length === 0){
            $scope.user.roles = ['default-user'];
        }
        if ($scope.user.password !== $scope.user.confirm_password){
            Flash.create('danger', 'Passwords do not match.', 'large-text');
            return;
        }
        else{
            if ($scope.isEdit){
                doUpdate();
            }
            else{
                createNew();
            }
        }       
    }

    function createNew(){
        var deferred = $q.defer();
        backstrap_service.signup($scope.user.username, $scope.user.password, $scope.user.email)
        .then(function(res){
            $scope.user["id"] = res.id;
            $rootScope.newUser = $scope.user;
            doUpdate()
            .then(function(){
                $scope.isEdit = true;
                $scope.buttonText = "Save";
                deferred.resolve();
               Flash.create('success', 'Account successfully created', 'large-text');
            },
            function(err) {
                Flash.create('danger', err.message, 'large-text');
                deferred.reject();
            });          
        },
        function(err) {
            Flash.create('danger', err.message, 'large-text');
            deferred.reject();
        });
    }

    function doUpdate(){  
        var deferred = $q.defer();
        backstrap_service.updateUser($scope.user)
        .then(function(res){
            if ($scope.user.username === 'bsuser'){
                backstrap_service.setSendToAccount(false);
            }
            $rootScope.newUser = $scope.user;    
            backstrap_service.getUsers()               
            .then(function(response){
                backstrap_service.setLocalUsers(response);            
                deferred.resolve();
                Flash.create('success', 'Account successfully updated', 'large-text');
            });
        },
        function(err) {
            Flash.create('danger', err.message, 'large-text');
            deferred.reject();
        });
        return deferred.promise;
    }

    $scope.validate = function(){
        validateForm();
    }

    function validateForm(){
        $scope.emailValid = ($scope.user.email !== undefined && $scope.user.email.length > 0 && $scope.user.email.indexOf('@') > -1 &&  $scope.user.email.indexOf('.') > -1);
        $scope.firstValid = $scope.user.first !== undefined && $scope.user.first.length > 0;
        $scope.lastValid = $scope.user.last !== undefined && $scope.user.last.length > 0;
        if ($scope.isEdit){
            $scope.usernameValid = $scope.user.username.length > 2;
        }
        else{
            $scope.usernameValid = true;
        }
        $scope.isValid = $scope.emailValid && $scope.firstValid && $scope.lastValid && $scope.usernameValid;
    }

    $scope.validateName = function(){
        if ($scope.user.username !== undefined && $scope.user.username !== null && $scope.user.username.length > 0){
            $scope.user.username = $scope.user.username.replace(/[^a-zA-Z]/g,'_').trim().toLowerCase();  
        }
    }      

}]);