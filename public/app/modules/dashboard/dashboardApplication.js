var dashboard = angular.module('dashboard', ['ui.router', 'ngAnimate','ngMaterial']);


dashboard.config(["$stateProvider", function ($stateProvider) {

    //dashboard home page state
   $stateProvider.state('app.logout', {
       url: '/logout',
       templateUrl: 'app/modules/dashboard/views/logout.html',
       controller: 'LogoutController',
       controllerAs: 'vm',
       data: {
           pageTitle: 'Home'
       }
   });

   //dashboard home page state
   $stateProvider.state('app.dashboard', {
       url: '/dashboard',
       templateUrl: 'app/modules/dashboard/views/home.html',
       controller: 'HomeController',
       controllerAs: 'vm',
       data: {
           pageTitle: 'Home'
       }
   });

  //model detail page state
   $stateProvider.state('app.modelDetail', {
       url: '/model',
       templateUrl: 'app/modules/dashboard/views/modelDetail.html',
       controller: 'ModelDetailController',
       controllerAs: 'vm',
       data: {
           pageTitle: 'Model Details'
       }
   });

   //model detail page state
   $stateProvider.state('app.modelList', {
       url: '/models',
       templateUrl: 'app/modules/dashboard/views/modelList.html',
       controller: 'ModelListController',
       controllerAs: 'vm',
       data: {
           pageTitle: 'Model List'
       }
   });

   //model query data
   $stateProvider.state('app.modelData', {
       url: '/model/data',
       templateUrl: 'app/modules/dashboard/views/modelData.html',
       controller: 'ModelDataController',
       controllerAs: 'vm',
       data: {
           pageTitle: 'Query Model Data'
       }
   });

   //insert enitty record
   $stateProvider.state('app.entityInsert', {
       url: '/model/entity/add',
       templateUrl: 'app/modules/dashboard/views/entityInsert.html',
       controller: 'EntityInsertController',
       controllerAs: 'vm',
       data: {
           pageTitle: 'Insert Entity Data'
       }
   });

    //update entity
   $stateProvider.state('app.entityUpdate', {
       url: '/model/entity/update',
       templateUrl: 'app/modules/dashboard/views/entityUpdate.html',
       controller: 'EntityUpdateController',
       controllerAs: 'vm',
       data: {
           pageTitle: 'Update Entity Data'
       }
   });

    //view relationship entity(Modal) 
    $stateProvider.state('app.viewRelationshipEntity', {
        url: '/model/view/relationship',
        templateUrl: 'app/modules/dashboard/views/roleModel.html',
        controller: 'viewRelationshipEntityController',
        controllerAs: 'vm',
        data: {
            pageTitle: 'Role Security'
        }
    });

   //Endpoints page state
   $stateProvider.state('app.endpoints', {
       url: '/endpoints',
       templateUrl: 'app/modules/dashboard/views/endpoints.html',
       controller: 'EndpointsController',
       controllerAs: 'vm',
       data: {
           pageTitle: 'Endpoints'
       }
   });

   //Experience page state
   $stateProvider.state('app.users', {
       url: '/users',
       templateUrl: 'app/modules/dashboard/views/users.html',
       controller: 'UserController',
       controllerAs: 'vm',
       data: {
           pageTitle: 'Users'
       }
   });

    //backstrap account
    $stateProvider.state('app.account', {
        url: '/account',
        templateUrl: 'app/modules/dashboard/views/account.html',
        controller: 'AccountController',
        controllerAs: 'vm',
        data: {
            pageTitle: 'Account'
        }
    });

    //manage roles
    $stateProvider.state('app.roles', {
        url: '/roles',
        templateUrl: 'app/modules/dashboard/views/roles.html',
        controller: 'RolesController',
        controllerAs: 'vm',
        data: {
            pageTitle: 'Roles'
        }
    });

    //role detail (Modal) 
    $stateProvider.state('app.roleDetail', {
        url: '/role/detail',
        templateUrl: 'app/modules/dashboard/views/roleDetail.html',
        controller: 'RoleDetailController',
        controllerAs: 'vm',
        data: {
            pageTitle: 'Role Detail'
        }
    });
    //role security 
    $stateProvider.state('app.roleSecurity', {
        url: '/role/security',
        templateUrl: 'app/modules/dashboard/views/roleSecurity.html',
        controller: 'RoleSecurityController',
        controllerAs: 'vm',
        data: {
            pageTitle: 'Role Security'
        }
    });
    //role add endpoint (Modal) 
    $stateProvider.state('app.roleAddEnpoint', {
        url: '/role/security/endpoint/add',
        templateUrl: 'app/modules/dashboard/views/roleAddEndpoint.html',
        controller: 'RoleAddEndpointController',
        controllerAs: 'vm',
        data: {
            pageTitle: 'Role Security - Add Endpoint'
        }
    });

     //role remove endpoint (Modal) 
    $stateProvider.state('app.roleRemoveEnpoint', {
        url: '/role/security/endpoint/remove',
        templateUrl: 'app/modules/dashboard/views/roleRemoveEndpoint.html',
        controller: 'RoleRemoveEndpointController',
        controllerAs: 'vm',
        data: {
            pageTitle: 'Role Security - Remove Endpoint'
        }
    });    
      //role remove endpoint (Modal) 
    $stateProvider.state('app.roleAddModel', {
        url: '/role/security/model',
        templateUrl: 'app/modules/dashboard/views/roleModel.html',
        controller: 'RoleAddModelController',
        controllerAs: 'vm',
        data: {
            pageTitle: 'Role Security'
        }
    });

      //model propety hint
    $stateProvider.state('app.propetyHint', {
        url: '/role/security/model/property/hint',
        templateUrl: 'app/modules/dashboard/views/modelPropertyHint.html',
        controller: 'ModelPropertyHintController',
        controllerAs: 'vm',
        data: {
            pageTitle: 'Property Hint'
        }
    });

}]);