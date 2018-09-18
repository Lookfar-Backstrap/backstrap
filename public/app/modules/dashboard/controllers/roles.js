dashboard.controller("RolesController", ['$rootScope', '$scope', '$state', '$location', '$q',
'backstrap_service', 'Flash', 'ModalService', 'pagination_service',
function ($rootScope, $scope, $state, $location, $q, backstrap_service, Flash, ModalService, pagination_service) {
    if(backstrap_service.getSendToAccount()){
        $state.go('app.account');
    }
    var vm = this;
    $scope.showLoading = true;
    vm.filteredResults = [];
    $scope.searchString = '';
    vm.roleList = [];
    var userData = backstrap_service.getUserInfo();
    var roleObj = {
        name: '',
        title:'',
        created_by: userData.username,
        created_date: new Date().toISOString(),
        description:''
    };

    pagination_service.init('Role(s)');

    vm.roleList = backstrap_service.getLocalRoles();    
    $scope.showLoading = false;
    vm.filteredResults = vm.roleList;
    refreshPagination(true);  
   

    $scope.searchList = function(){    
        vm.filteredResults = [];     
        vm.roleList.forEach(function(r){
            if (r.title.toLowerCase().indexOf($scope.searchString.toLowerCase()) > -1 
            || r.name.toLowerCase().indexOf($scope.searchString.toLowerCase()) > -1           
            || r.created_by.toString().toLowerCase().indexOf($scope.searchString.toLowerCase()) > -1){
                vm.filteredResults.push(r);
            }
        });
        refreshPagination(true);  
    }  

    $scope.roleDetail = function(role){      
        if (role === null){
            role =  {
                'name': '',
                'title': '',
                'description':'',
                'created_by': backstrap_service.getUserInfo().username,
                'created_date': new Date().toISOString(),
            };
        }
        backstrap_service.setSelectedRole(role);
        ModalService.showModal({
            templateUrl: '../../app/modules/dashboard/views/roleDetail.html',
            controller: "RoleDetailController",
            inputs: {
                title: (role.name === '' ? 'create' : 'update')        
            }
            }).then(function(modal) {
                modal.element.modal();
                modal.close.then(function(result) {    
                    if (result.addSecurity){ 
                        console.log(result.role);
                         backstrap_service.setSelectedRole(result.role);
                        $rootScope.isUpdate = result.isUpdate;
                        $state.go('app.roleSecurity');
                    }                    
            });
        });
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

}]);