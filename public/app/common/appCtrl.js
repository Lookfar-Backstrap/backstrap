

app.controller("appCtrl", ['$rootScope', '$scope', '$state', '$location', 'Flash','appSettings','ModalService', 'backstrap_service','$q',
function ($rootScope, $scope, $state, $location, Flash,appSettings, ModalService, backstrap_service, $q) {
    backstrap_service.resetInvalidateTimer();
    $scope.url = $location.path();        
    $rootScope.theme = appSettings.theme;
    $rootScope.layout = appSettings.layout;
    $rootScope.actionInProgress = false;
 
    var vm = this;
    vm.userData = backstrap_service.getUserInfo();
    vm.models = backstrap_service.getLocalModels();
    backstrap_service.getBackstrapVersion()
    .then(function(v){
        $scope.bs_version = v;
    });
    
   if (vm.userData.username === undefined && $scope.url.indexOf('login') === -1){     
       $location.path('../#/login');    
       return false;
   }
   

   //clear items
    var ixEndpoint = $scope.url.indexOf("endpoint");
    var ixModel = $scope.url.indexOf("model");
    var ixRole = $scope.url.indexOf("role");
    var ixLogin = $scope.url.indexOf("login");
   if (ixRole !== -1){
       backstrap_service.setSelectedModel(null);
       backstrap_service.setSelectedEndpoint(null);
   }
   else if (ixModel !== -1)
   {
        backstrap_service.setSelectedRole(null);
        backstrap_service.setSelectedEndpoint(null);
   }
   else if (ixEndpoint !== -1){
       backstrap_service.setSelectedModel(null);
       backstrap_service.setSelectedRole(null);
   }
    


    //Main menu items of the dashboard
    vm.menuItems = [
        /*{
            title: "Dashboard",
            icon: "dashboard",
            state: "dashboard"
        },*/
        {
            title: "Models",
            icon: "medium",
            state: "modelList"
        }, 
        {
            title: "Endpoints",
            icon: "connectdevelop ",
            state: "endpoints"
        },       
        {
            title: "Users",
            icon: "user",
            state: "users"
        },       
        {
            title: "Roles",
            icon: "lock",
            state: "roles"
        }
    ];
   

    //set the Layout in normal view
    vm.setModel = function (value) {
        if (value === 'create'){
            $state.go('app.createModel');
        }
        else if(value === 'viewModelList'){
             $state.go('app.modelList');
        }
        else{
            backstrap_service.setSelectedModel(value);
            if($state.current.name === 'app.modelDetail') {
                $state.reload();
            }
            else {
                $state.go('app.modelDetail');
            }
        }
    };


    //controll sidebar open & close in mobile and normal view
    vm.sideBar = function (value) {
        if($(window).width()<=767){
        if ($("body").hasClass('sidebar-open'))
            $("body").removeClass('sidebar-open');
        else
            $("body").addClass('sidebar-open');
        }
        else {
            if(value==1){
            if ($("body").hasClass('sidebar-collapse'))
                $("body").removeClass('sidebar-collapse');
            else
                $("body").addClass('sidebar-collapse');
            }
        }
    };

    /**
    vm.createModel = function(){
        ModalService.showModal({
            templateUrl: '../../app/modules/dashboard/views/model.html',
            controller: "ModelController",
            inputs: {
                title: 'create',               
            }
            }).then(function(modal) {
                modal.element.modal();
                modal.close.then(function(result) {                 
                    if (result.doSave){
                        var deferred = $q.defer();
                        $rootScope.actionInProgress = true;   
                        $rootScope.checkForSystemFile('models')
                       .then(function(syncResponses){   
                        var syncSuccess = false;
                        syncResponses.forEach(function(resp){
                            if (resp.fileType === 'models'){
                                syncSuccess = resp.success;
                            }
                        }); 
                        if (syncSuccess){    
                            var ix = $scope.url.indexOf("/model");
                            var toRemove = $scope.url.substring(0, ix + 1);
                            var area = $scope.url.replace(toRemove, '');
                            var file_object = { 
                                file_object: { 
                                    type: 'models',
                                    data: result.models
                                }
                            };                       
                            backstrap_service.postFile(file_object)    
                            .then(function(response){
                                backstrap_service.setLocalModels(result.models);
                                $rootScope.actionInProgress = false;                           
                                backstrap_service.setModelFileUid(response.uid);    
                                if (response.success){
                                    Flash.create('success', 'Entity Created', 'large-text');
                                    $state.go('app.modelDetail');
                                }
                                deferred.resolve(response);
                            });  
                        }
                        else{
                            Flash.create('error', 'There was a problem syncing the model file. Your data may not have saved. Please log out and try again.', 'large-text');   
                        }
                    });
                }
                else{
                    var elBackDrop = angular.element(document.querySelector('.modal-backdrop'));  
                    var elModal = angular.element(document.querySelector('.modal'));  
                    elBackDrop.fadeOut();
                    elModal.fadeOut();    
                    elBackDrop.remove();
                }
            });
        });
    }
    */
    
    //navigate to search page
    vm.search = function () {
        $state.go('app.search');
    };   
}]);
