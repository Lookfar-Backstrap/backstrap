

dashboard.controller("RelationshipController", ['$scope', '$rootScope', '$animate', '$element', 'title', 'close', 'backstrap_service',
    function ($scope, $rootScope, $animate, $element, title, close, backstrap_service) {
        var allModels = [];
        var self = this;
        $scope.models = [];

        $scope.model = backstrap_service.getSelectedModel();
        allModels = backstrap_service.getLocalModels();
        $scope.models = loadAll();

        $scope.doSave = false;
        $scope.doDelete = false;
        $scope.showDelete = false;
        $scope.message = "Are you sure you want to deactivate this relationship?";
        $scope.selectedItem = '';
        $scope.results = [];
        $scope.searchText = '';
        $scope.showMessage = false;
        $scope.enabled = (title[0] === 'create');


        //enabled states if the dom elements are enabled. This is only on create
        if (!$scope.enabled) {
            $scope.rel = {
                relates_from: $scope.model.obj_type,
                plural_rev: pluralize.plural($scope.model.obj_type),
                relates_to: title[1].relates_to,
                rel_type: title[1].rel_type,
                plural_name: title[1].plural_name,
                linking_table: title[1].linking_table,
                is_active: title[1].is_active
            };
        }
        else {
            $scope.rel = {
                relates_to: '',
                obj_type: ''
            };
        }

        $scope.querySearch = function () {
            $scope.results = [];
            if ($scope.rel.relates_to == '') {
                $scope.results = loadAll();
            }
            else {
                $scope.models.forEach(function (m) {
                    if (m.obj_type !== undefined) {
                        if ($scope.results.indexOf(m) == -1) {
                            $scope.results.push(m);
                        }
                    }
                });
                var userModel = {
                    'obj_type': 'bsuser',
                    'description': 'a user object',
                    'relationships': [],
                    'properties': []
                };
                if ($scope.results.indexOf(m) == -1) {
                    $scope.results.push(userModel);
                }
            }
        };

        $scope.searchTextChange = function (text) {
            console.log('Text changed to ' + text);

        };

        $scope.selectedItemChange = function (item) {
            $scope.rel.relates_to = item.obj_type;
            $scope.rel.plural_name = pluralize.plural(item.obj_type);
            $scope.rel.relates_from = $scope.model.obj_type;
            $scope.rel.plural_rev = pluralize.plural($scope.model.obj_type);
            if (item.obj_type === 'bsuser') {
                $scope.rel.linking_table = $scope.model.obj_type + '_bsuser';
            }
            else {
                $scope.rel.linking_table = $scope.model.obj_type + '_' + item.obj_type;
            }
            $scope.results = [];
        };

        /**
         * Build `states` list of key/value pairs
         */
        function loadAll() {
            var availModels = [];
            allModels.forEach(function (m) {
                availModels.push(m);
            });
            var userModel = {
                'obj_type': 'bsuser',
                'description': 'a user object',
                'relationships': [],
                'properties': []
            };
            availModels.push(userModel);

            return availModels;
        }




        //  This close function doesn't need to use jQuery or bootstrap, because
        //  the button has the 'data-dismiss' attribute.
        $scope.saveRelationship = function () {
            if ($scope.rel.relates_to === '' ||
                $scope.plural_name === '' || $scope.rel.linking_table === '' || $scope.rel.rel_type === '') {
                $scope.showMessage = true;
                $scope.message = 'All fields are required.';
                return false;
            }
            else {
                var isValidRelTo = false;
                if ($scope.rel.relates_to.toLowerCase() === 'bsuser') {
                    isValidRelTo = true;
                }
                else {
                    allModels.forEach(function (m) {
                        if (m.obj_type.toLowerCase() === $scope.rel.relates_to.toLowerCase()) {
                            isValidRelTo = true;
                        }
                    });
                }

                if (isValidRelTo) {
                    $scope.doSave = true;
                    var elBackDrop = angular.element(document.querySelector('.modal-backdrop'));
                    var elModal = angular.element(document.querySelector('.modal'));
                    elBackDrop.fadeOut();
                    elModal.fadeOut();
                    elBackDrop.remove();
                    close({
                        rel: $scope.rel,
                        doSave: $scope.doSave
                    }, 500); // close, but give 500ms for bootstrap to animate
                }
                else {
                    $scope.message = 'Relates to object is not a valid selection.';
                    $scope.showMessage = true;
                    return false;
                }
            }
        };

        $scope.showDeleteMessage = function () {
            $scope.message = "Are you sure you want to deactivate this relationship?";
            $scope.showMessage = true;
            $scope.showDelete = true;
        }

        //reactivate relatinship
        $scope.activate = function () {
            var elBackDrop = angular.element(document.querySelector('.modal-backdrop'));
            var elModal = angular.element(document.querySelector('.modal'));
            elBackDrop.fadeOut();
            elModal.fadeOut();
            elBackDrop.remove();
            $scope.false = true;
            $scope.rel['is_active'] = true;
            close({
                rel: $scope.rel,
                doDelete: false,
                doActivate: true,
            }, 500); // close, but give 500ms for bootstrap to animate
        };

        //saves relatinship
        $scope.deleteRelationship = function () {
            $scope.doDelete = true;
            $scope.rel['is_active'] = false;
            close({
                rel: $scope.rel,
                doDelete: true
            }, 500); // close, but give 500ms for bootstrap to animate
        };

        //  This cancel function must use the bootstrap, 'modal' function because
        //  the doesn't have the 'data-dismiss' attribute.
        $scope.cancel = function () {

            //  Manually hide the modal.
            $element.modal('hide');
            //  Now call close, returning control to the caller.
            close({
                rel: $scope.rel,
                doSave: $scope.doSave,
                doDelete: $scope.doDelete
            }, 500); // close, but give 500ms for bootstrap to animate
        };
    }]);
