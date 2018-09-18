dashboard.controller('YesNoController', ['$scope', 'close', 'message', function($scope, close, message) {

	$scope.message = message;

  $scope.close = function(result) {
 	  close(result, 500); // close, but give 500ms for bootstrap to animate
  };

}]);