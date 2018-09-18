

dashboard.controller("UserController", ['$rootScope', '$scope', '$state', '$location',
    'backstrap_service', 'Flash', 'ModalService', '$q', 'pagination_service',
    function ($rootScope, $scope, $state, $location, backstrap_service, Flash, ModalService, $q, pagination_service) {
        var vm = this;
        if (backstrap_service.getSendToAccount()) {
            $state.go('app.account');
        }

        $scope.showLoading = true;
        $scope.searchString = '';
        vm.filteredResults = [];

        pagination_service.init('User(s)');
        refreshPagination(true);

        vm.userList = backstrap_service.getLocalUsers();
        if ($rootScope.newUser != null) {
            $scope.searchString = $rootScope.newUser.username.toLowerCase();
            vm.userList.forEach(function (u) {
                if (u.username.toLowerCase().indexOf($scope.searchString.toLowerCase()) > -1
                    || u.email.toLowerCase().indexOf($scope.searchString.toLowerCase()) > -1
                    || u.is_active.toString().toLowerCase().indexOf($scope.searchString.toLowerCase()) > -1) {
                    vm.filteredResults.push(u);
                }
                else {
                    u.roles.forEach(function (role) {
                        if (role.toLowerCase().indexOf($scope.searchString.toLowerCase()) > -1) {
                            vm.filteredResults.push(u);
                            return;
                        }
                    });
                }
            });
            refreshPagination(true);
            delete $rootScope.newUser;
        }
        else {
            vm.filteredResults = vm.userList;
            refreshPagination(true);
        }

        $scope.showLoading = false;



        $scope.searchList = function () {
            vm.filteredResults = [];
            vm.userList.forEach(function (u) {
                if (u.username.toLowerCase().indexOf($scope.searchString.toLowerCase()) > -1
                    || u.email.toLowerCase().indexOf($scope.searchString.toLowerCase()) > -1
                    || u.is_active.toString().toLowerCase().indexOf($scope.searchString.toLowerCase()) > -1) {
                    vm.filteredResults.push(u);
                }
                else {
                    u.roles.forEach(function (role) {
                        if (role.toLowerCase().indexOf($scope.searchString.toLowerCase()) > -1) {
                            vm.filteredResults.push(u);
                            return;
                        }
                    });
                }
            });

        }
        initialized = true;
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

        $scope.createUser = function () {
            backstrap_service.setSelectedUser({
                first: '',
                last: '',
                username: '',
                email: '',
                password: '',
                confirm_password: '',
                is_active: true,
                roles: [],
                created_at: new Date().toISOString()
            });
            $state.go('app.account');
        };

        $scope.editUser = function (user) {
            backstrap_service.setSelectedUser(user);
            $state.go('app.account');
        };

    }]);