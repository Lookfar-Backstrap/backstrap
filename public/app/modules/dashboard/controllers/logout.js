dashboard.controller("LogoutController", ['$rootScope', '$scope', '$state', '$location',
function ($rootScope, $scope, $state, $location) {       
        $location.path('../#/login');
     
}]);