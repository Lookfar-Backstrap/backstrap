
login.controller("loginCtrl", ['$rootScope', '$scope','$state', '$location', 'Flash', 'backstrap_service', 'appSettings', '$q',
function ($rootScope, $scope, $state, $location, Flash, backstrap_service, appSettings, $q) {

    //Start by logging out
    backstrap_service.logout()
    .then(function(res){});
     
    var vm = this;
    vm.passwordResetSubmitted = false;
    vm.ForgotPasswordUsernameOrEmail = '';
    vm.showForgotPassword = false;
    vm.showLoading = false;

    vm.username = '';
    vm.password = '';
  
    //REMEMBER ME 
    var strRemMeUserName = '';
    strRemMeUserName = localStorage.getItem('rememberMeUser');           
    if (strRemMeUserName !== null && strRemMeUserName !== undefined && strRemMeUserName.length > 0){
        vm.username = strRemMeUserName;
        vm.rememberMe = true;
    }    
    else{
        vm.rememberMe = false;
    }   

    //Reset
    vm.resetToken = '';
    vm.resetPassword = '';
    vm.resetPasswordConfirm = ''; 
    vm.resetMessage = ' We have sent an email to the address on file. Be sure to check your junk/spam folder. Please enter the token you received below along with your new password.';
    vm.pendingSetup = false;

    localStorage.removeItem('backstrap_master');   

    //This is where we check to see if the default backstrap user has been set up
    backstrap_service.defaultUserCheck()
    .then(function(response){
        if (response.set_up_pending){
            backstrap_service.setSendToAccount(true);
            if (response.token !== null){                       
                vm.ForgotPasswordUsernameOrEmail = 'bsroot';
                vm.showForgotPassword = true;
                vm.resetToken = response.token;
                vm.passwordResetSubmitted = true; 
                vm.resetMessage = "Welcome to Backstrap!!! You must finish setting up the default user's account. (Username: bsroot). Once you create a password and login, you will be redirected to the accounts page where you will need to finish setting up the default account.";             vm.pendingSetup = true;    
            }                   
        }
    });           
        

    //access login
    vm.login = function () {   
         //REMEMBER ME -- didn't want this to be a part of the backstrap service, so we'll just use local storage
        if (vm.rememberMe){                
            localStorage.setItem('rememberMeUser', vm.username);
        }  
        else{                
            localStorage.removeItem('rememberMeUser');
        }           

        var deferred = $q.defer(); 

        backstrap_service.login(vm.username, vm.password, null).then(function (response) {      
            var tkn = response.token;        
            if (tkn !== null && tkn !== undefined && tkn.length > 0){     
                $rootScope.setUpDefaultAccount = false;       
                vm.userInfo = backstrap_service.getUserInfo();
                           console.log(vm.userInfo);
                backstrap_service.getModels()  
                .then(function(response){   console.log(response);
                    return backstrap_service.getRoles();
                })
                .then(function(response){console.log(response);
                    return backstrap_service.getEndpoints();
                })
                .then(function(response){console.log(response);
                    return backstrap_service.getUsers();
                })
                .then(function(response){console.log(response);
                    backstrap_service.setLocalUsers(response);
                    var goToAccount = false;
                    response.forEach(function(u){
                        if (u.username === 'bsroot' && u.first === ''){
                            goToAccount = true;
                            backstrap_service.setSendToAccount(true);
                            backstrap_service.setSelectedUser(u);
                        }
                        else if (u.username === 'bsroot' && u.first !== ''){
                            backstrap_service.setSendToAccount(false);
                        }
                    });
                    if (goToAccount){
                        $state.go('app.account');
                    }else{
                        $state.go('app.modelList');
                    }
                    deferred.resolve(true);
                },
                function(err){  
                    Flash.create('error', 'Well crap!  ...Something has gone wrong.', 'large-text');
                    deferred.reject(err);
                });
            }
            else {   
                Flash.create('error', 'Well crap!  ...Something has gone wrong.', 'large-text');
                deferred.reject();
            }            
        },
        function(err) {
            if(err) {
                console.log(err);
                Flash.create('error', err.message, 'large-text');
                deferred.reject(err);
            }
            else {
                deferred.resolve();
            }
        });

        return deferred.promise;
    };

   vm.forgotPassword = function() {
        vm.showLoading = true;
        var fpwEmail = vm.ForgotPasswordUsernameOrEmail.indexOf('@') > -1 ? vm.ForgotPasswordUsernameOrEmail : null;
        var fpwUserName = vm.ForgotPasswordUsernameOrEmail.indexOf('@') === -1 ? vm.ForgotPasswordUsernameOrEmail : null
        var fpwObj = {
            'email': fpwEmail,
            'username': fpwUserName
        };
        backstrap_service.forgotPassword(fpwObj).then(function (response) {
            vm.passwordResetSubmitted = true;
            Flash.create('success', 'Be sure to check your junk mail, as an email has been sent to the address on file.', 'large-text');
            
            vm.showLoading = false;       
            vm.ForgotPasswordUsernameOrEmail = "";    
        },
        function(response) {
            vm.passwordResetSubmitted = false;
            vm.showLoading = false;       
            vm.ForgotPasswordUsernameOrEmail = "";
        });
        
    };

    vm.resetPasswordFunction = function() {
        vm.showLoading = true;
       if (vm.resetPassword !== vm.resetPasswordConfirm){
             Flash.create('error', 'Passwords do not match.', 'large-text');
             vm.showLoading = false;
       }
       else{
            var resetObj = {
                'token': vm.resetToken,
                'password': vm.resetPassword
            };
            backstrap_service.resetPassword(resetObj).then(function (response) {                   
                if (vm.pendingSetup){                        
                    $rootScope.setUpDefaultAccount = true;
                }
                else{
                    $rootScope.setUpDefaultAccount = false;                    
                }
                vm.passwordResetSubmitted = true;
                Flash.create('success', 'You have successfully reset your password.', 'large-text');
                vm.showForgotPassword = false;
                vm.passwordResetSubmitted = false;
                vm.showLoading = false;       
                vm.resetPasswordConfirm = '';
                vm.resetPassword = '';   
                vm.resetToken = '';
                $state.reload();                                  
            });
       }
    };
    backstrap_service.getBackstrapVersion()
    .then(function(v){
        vm.bs_version = v;
    });
}]);

