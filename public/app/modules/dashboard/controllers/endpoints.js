
dashboard.controller("EndpointsController", ['$rootScope', '$scope', '$state', '$location',
  'backstrap_service', 'Flash', 'ModalService', '$q', 'pagination_service',
  function ($rootScope, $scope, $state, $location, backstrap_service, Flash, ModalService, $q, pagination_service) {
    if(backstrap_service.getSendToAccount()){
        $state.go('app.account');
    }
    var vm = this;
    var initialized = false;
    $scope.searchString = '';
    vm.filteredResults = [];  

    vm.endpointList = backstrap_service.getLocalEndpoints();
    vm.filteredResults = vm.endpointList;

    pagination_service.init('Endpoint(s)');
    refreshPagination(true);
    initialized = true;

    $scope.searchList = function () {
      if (initialized) {
        vm.filteredResults = [];
        vm.endpointList.forEach(function (e) {
          if (e.area.toLowerCase().indexOf($scope.searchString.toLowerCase()) > -1
            || e.controller.toLowerCase().indexOf($scope.searchString.toLowerCase()) > -1
            || e.call.toLowerCase().indexOf($scope.searchString.toLowerCase()) > -1
            || e.verb.toLowerCase().indexOf($scope.searchString.toLowerCase()) > -1) {
            vm.filteredResults.push(e);
          }
        });
        refreshPagination(true);
      }
    }

    $scope.showPagination = function () {
      return pagination_service.showPagination();
    };

    $scope.previous = function () {
      pagination_service.decrement();
      refreshPagination(false);
    };

    $scope.next = function () {
      pagination_service.increment();
      refreshPagination(false);
    };

    function refreshPagination(setList) {
      if (setList) {
        pagination_service.set(vm.filteredResults);
      }
      vm.paginatedList = pagination_service.getList();
      $scope.showPrevious = pagination_service.showPrevious();
      $scope.showNext = pagination_service.showNext();
      $scope.pageOfText = pagination_service.pageOfText();
    }

    vm.endpointDetail = function (endpoint) {
      backstrap_service.setEndpointModalOpened(true);      
      backstrap_service.setSelectedEndpoint(endpoint);
      $state.go('app.endpointDetail');
    }

    $scope.showArguments = false;
    $scope.okToClose = false;
    $scope.form = {};
    $scope.arguments = [];


    vm.endpointDetail = function (endpoint) {
       backstrap_service.setEndpointModalOpened(true);   
      localStorage.setItem("selectedEndpoint", JSON.stringify(endpoint));
      $state.go('app.endpointDetail');
    }

    $scope.createEndpoint = function (endpoint) {
      var endpoint = endpoint;
      backstrap_service.setEndpointModalOpened(true);      
      ModalService.showModal({
          templateUrl: '../../app/modules/dashboard/views/endpoint.html',
          controller: "AddEndpointController",
          inputs: {
            existingEndpoint: endpoint
          }
      }).then(function (modal) {
        vm.endpointList = backstrap_service.getLocalEndpoints();

        modal.element.modal();
        modal.close.then(function (result) { 
              backstrap_service.setEndpointModalOpened(false);           
              $state.reload();
          });
      });
    };
}]);





