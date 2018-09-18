dashboard.controller("ModelListController", ['$rootScope', '$scope', '$state', '$location', 
'backstrap_service', 'Flash', 'ModalService', '$q', 'pagination_service',
function ($rootScope, $scope, $state, $location, backstrap_service, Flash, ModalService, $q, pagination_service) {
    if(backstrap_service.getSendToAccount()){
        $state.go('app.account');
    }
    var vm = this;
    $scope.searchString = '';
    vm.filteredResults = [];
    vm.modelList = backstrap_service.getLocalModels();
    vm.filteredResults = vm.modelList;
    pagination_service.init('Model(s)');
    refreshPagination(true);
    
    $scope.searchList = function(){    
      vm.filteredResults = [];
      vm.modelList.forEach(function(m){
            if (m.obj_type.toLowerCase().indexOf($scope.searchString.toLowerCase()) > -1){
                vm.filteredResults.push(m);
            }
        });
        refreshPagination(true);
    }

    $scope.showPagination = function(){
        return pagination_service.showPagination();
    };

    $scope.previous = function(){
        pagination_service.decrement();       
        refreshPagination(false);
    };
    
    $scope.next = function(){
        pagination_service.increment();   
        refreshPagination(false);     
    };

    function refreshPagination(setList){
        if (setList){
            pagination_service.set(vm.filteredResults);
        }
        vm.paginatedList = pagination_service.getList();
        $scope.showPrevious = pagination_service.showPrevious();
        $scope.showNext = pagination_service.showNext();
        $scope.pageOfText = pagination_service.pageOfText();
    }

    vm.modelDetail = function(model){
        backstrap_service.setSelectedModel(model);             
        $state.go('app.modelDetail');
    }

    $scope.createModel = function(role){
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
                        
                        var url = $location.path();                        
                        var ix = url.indexOf("/model");
                        var toRemove = url.substring(0, ix + 1);
                        var area = url.replace(toRemove, '');
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
                            Flash.create('success', 'Model Created', 'large-text');
                            $state.go('app.modelDetail');

                            deferred.resolve(response);
                        }); 
                }
            });
        });
    }
}]);