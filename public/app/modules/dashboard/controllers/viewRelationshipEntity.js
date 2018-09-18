dashboard.controller('viewRelationshipEntityController', ['$scope', 'close', 'title', function($scope, close, title) {

    var relEntity = [];
    Object.keys(title.entity).forEach(function(key){
        var r = [key, title.entity[key]];	
        if (key !== 'obj_type' && key !== 'object_type')
            relEntity.push(r);
        }); 
    $scope.data = relEntity;
    $scope.object_type = title.object_type;
    $scope.close = function(result) {
 	  close(result, 500); // close, but give 500ms for bootstrap to animate
  };
}]);