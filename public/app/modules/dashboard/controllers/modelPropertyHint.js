dashboard.controller('ModelPropertyHintController', ['$scope', 'close', 'title', function($scope, close, title) {
   
    $scope.property = title.property;
    $scope.object_type = title.obj_type;
    $scope.hint = title.hint;
    $scope.isName = false;
    if ($scope.property === "name"){
        $scope.isName = true;
        $scope.property = "name";
    }



    $scope.close = function(result) {
 	  close(result, 500); // close, but give 500ms for bootstrap to animate
  };
}]);