

dashboard.controller("QueryJSONController", ['$scope', '$animate', '$element', 'title', 'close',
  function($scope, $animate, $element, title, close) {
      $scope.query = title;
    

    $scope.cancel = function() {     
        //  Manually hide the modal.
            $element.modal('hide');      
            //  Now call close, returning control to the caller.
            close({         
                doSave: $scope.doSave,           
            }, 500); // close, but give 500ms for bootstrap to animate
        };  
  }]);