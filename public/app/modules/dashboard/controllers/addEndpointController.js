dashboard.controller("AddEndpointController", ['$scope', '$animate', '$element', '$parse', 'ModalService', 'close', 'existingEndpoint', 'backstrap_service',
  function ($scope, $animate, $element, $parse, ModalService, close, existingEndpoint, backstrap_service) {

    $scope.form.required = false;
    $scope.form.authReq = false;
    $scope.canEdit = [];
    $scope.canEdit.reqFields = false;
    $scope.canEdit.arguments = false;
    $scope.okToSave = false;
    $scope.arguments = [];
    $scope.types = backstrap_service.getValidPropertyTypes();
    $scope.verbs = [{ label: 'GET', value: 'GET' }, { label: 'POST', value: 'POST' }, { label: 'PATCH', value: 'PATCH' }, { label: 'DELETE', value: 'DELETE' }];
    $scope.form.type = "object"; // selects first option
    $scope.form.verb = "GET"; // selects first option
    $scope.titleText = "View";
    $scope.versionPattern = "\\d+\\.\\d+\\.\\d+";
    $scope.canDelete = false;
    if (existingEndpoint) {
      $scope.form.id = existingEndpoint.id;
      $scope.form.area = existingEndpoint.area;
      $scope.form.controller = existingEndpoint.controller;
      $scope.form.verb = existingEndpoint.verb;
      $scope.form.method = existingEndpoint.call;
      $scope.form.version = existingEndpoint.version;
      $scope.form.desc = existingEndpoint.description;
      $scope.form.authReq = existingEndpoint.authRequired;
      $scope.canDelete = existingEndpoint.isUserCreated;
      if ((existingEndpoint.args != null && !angular.isUndefined(existingEndpoint.args)) && existingEndpoint.args.length > 0) {
        for (var i = 0; i < existingEndpoint.args.length; i++) {
          $scope.arguments[i] = existingEndpoint.args[i];
        }
      }
      if (existingEndpoint.isUserCreated === undefined || !existingEndpoint.isUserCreated) {
        $scope.titleText = "View";
      }
      else {
        $scope.titleText = "Edit";
        $scope.canEdit.arguments = true;
      }
    }
    else {
      $scope.canEdit.reqFields = true;
      $scope.canEdit.arguments = true;
      $scope.titleText = "Create";
    }

    $scope.flipShowArgumentSwitch = function () {
      $scope.showArguments = !$scope.showArguments;
    }

    $scope.addArgument = function () {
      if ($scope.argumentForm.$valid) {
        var newArgument = {};

        newArgument.name = $scope.form.name;
        newArgument.type = $scope.form.type;
        newArgument.isRequired = $scope.form.required;
        newArgument.description = $scope.form.argDesc;

        var argsCount = $scope.arguments.length;
        $scope.arguments.push(newArgument)
        if ($scope.arguments.length == argsCount + 1) {
          $scope.form.name = '';
          $scope.form.type = $scope.types[0];
          $scope.form.required = false;
          $scope.form.argDesc = '';
          $scope.argumentForm.arg_name.$setPristine();
        } else {
          console.log('did not insert')
        }
        $scope.showArguments = false;
      }
    }

    $scope.removeArgument = function (arg) {
      var index = $scope.arguments.indexOf(arg);
      $scope.arguments.splice(index, 1);
    }

    $scope.save = function () {
      // hit common/enternalsystem
      if ($scope.showArguments && $scope.argumentForm.arg_name.$valid) {
        ModalService.showModal({
          templateUrl: '../../app/modules/dashboard/views/yesNoModal.html',
          controller: 'YesNoController',
          inputs: {
            message: 'You have selected to add an argument, and even entered it in, but did not save it. Would you like to save it now?'
          }
        }).then(function (modal) {
          modal.element.modal();
          modal.close.then(function (result) {
            if (result) {
              $scope.addArgument();
              $scope.okToSave = true;
            }
            // closing this modal removes the 'modal-open' class on the body html tag. we have to put it back since the addEndpoint modal is still open
            $('body').addClass('modal-open');
          });
        });
      } else {
        $scope.okToSave = true;
      }

      if ($scope.okToSave) {
        var objEndpoint = {
          'call': $scope.form.method,
          'area': $scope.form.area,
          'controller': $scope.form.controller,
          'verb': $scope.form.verb,
          'version': $scope.form.version,
          'args': $scope.arguments,
          'authRequired': $scope.form.authReq,
          'description': $scope.form.desc
        };

        //the update and post now reset local endpoints 
        if (existingEndpoint) {
          backstrap_service.updateEndpoint(angular.toJson(objEndpoint)).then(function (res) {
            var elBackDrop = angular.element(document.querySelector('.modal-backdrop'));
            var elModal = angular.element(document.querySelector('.modal'));
            elBackDrop.fadeOut();
            elModal.fadeOut();
            elBackDrop.remove();
            $scope.okToSave = false;
            close({

            }, 500); // close, but give 500ms for bootstrap to animate
          },
            function (err) {
              console.log(err);
            });
        }
        else {
          backstrap_service.postEndpoint(objEndpoint).then(function (res) {
            var elBackDrop = angular.element(document.querySelector('.modal-backdrop'));
            var elModal = angular.element(document.querySelector('.modal'));
            elBackDrop.fadeOut();
            elModal.fadeOut();
            elBackDrop.remove();
            $scope.okToSave = false;
            close({

            }, 500); // close, but give 500ms for bootstrap to animate
          },
            function (err) {
              console.log(err);
            });
        }
      }
    }

    $scope.delete = function () {
      // hit common/enternalsystem

      ModalService.showModal({
        templateUrl: '../../app/modules/dashboard/views/yesNoModal.html',
        controller: 'YesNoController',
        inputs: {
          message: 'Are you sure you want to delete this endpoint?'
        }
      }).then(function (modal) {
        modal.element.modal();
        modal.close.then(function (result) {
          console.log(result);
          if (result) {
            $scope.addArgument();
            var objEndpoint = {
              'call': $scope.form.method,
              'area': $scope.form.area,
              'controller': $scope.form.controller,
              'verb': $scope.form.verb,
              'version': $scope.form.version 
            };
            var strObjEndPoint = JSON.stringify(objEndpoint);
            
             backstrap_service.removeEndpoint(JSON.parse(strObjEndPoint)).then(function (res) {
              backstrap_service.setLocalEndpoints(res);
              var elBackDrop = angular.element(document.querySelector('.modal-backdrop'));
              var elModal = angular.element(document.querySelector('.modal'));
              elBackDrop.fadeOut();
              elModal.fadeOut();
              elBackDrop.remove();
              $scope.okToSave = false;
              close({

              }, 500); // close, but give 500ms for bootstrap to animate
            },
              function (err) {
                console.log(err);
              });
          }        
            // closing this modal removes the 'modal-open' class on the body html tag. we have to put it back since the addEndpoint modal is still open
            $('body').addClass('modal-open');
      });
    });
  };



$scope.close = function (result) {
  close(result, 500); // close, but give 500ms for bootstrap to animate
};


function getNewId() {
  var existingIds = [];
  // grabs all endpoints
  var allEndpoints = backstrap_service.getLocalEndpoints();
  allEndpoints.forEach(function (element, index, array) {
    // loop through each endpoint and look to see if they have an id
    if ("id" in element) {
      // add id to array
      existingIds.push(element.id);
    }
  });
  // sort array from high to low
  existingIds.sort(function (a, b) { return b - a });
  // return the largest id + 1
  return existingIds[0] + 1;
};

$scope.validateName = function (model) {
  if ($scope.form[model] !== undefined) {
    if (model == 'area') {
      $scope.form.area = $scope.form.area.replace(/[^a-zA-Z]/g, '_').trim().toLowerCase();
    }
    else if (model == 'controller') {
      $scope.form.controller = $scope.form.controller.replace(/[^a-zA-Z]/g, '_').trim().toLowerCase();
    }
    else if (model == 'name') {
      $scope.form.name = $scope.form.name.replace(/[^a-zA-Z]/g, '_').trim().toLowerCase();
    }
  }
}

  }
]);
