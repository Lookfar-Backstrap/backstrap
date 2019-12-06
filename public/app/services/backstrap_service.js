app.service('backstrap_service', ['$rootScope', '$http', '$location', '$state', '$q', 'Flash', function ($rootScope, $http, $location, $state, $q, Flash) {
    // ====================================================================
    // PRIVATE PROPERTIES
    // ====================================================================
    var bs = this;

    var apiBase =  $location.protocol() + '://' + location.host + '/';
    var session_timeout = 900000; //15 minutes
    var objBackstrap = {
        header_token_key: '',
        api_token: '',
        user_info: {},
        local_users: [],
        local_models: [],
        local_endpoints: [],
        local_roles: [],
        selected_model: {},
        selected_entity: {},
        selected_endpoint: {},
        selected_user: {},
        version: '',
        endpointModalOpened: false,
        sendToAccount: false,
    };    

    //init master obj
    var objBs = JSON.parse(localStorage.getItem('backstrap_master'));
    bs.objBackstrap = objBs == null ? objBackstrap : objBs;

    //Reset header if new http
    $http.defaults.headers.common['Content-Type'] = 'application/json';

    //invalidate api token after 15 minutes of idleness
    var url = $location.path();
    var session_timer;
    session_timer = setInterval(invalidateSession, session_timeout);

    function invalidateSession() {
        if (bs.objBackstrap.api_token !== '') {
            bs.objBackstrap = {
                api_token: '',
                user_info: {},
                local_users: [],
                local_models: [],
                local_endpoints: [],
                local_roles: [],
                selected_model: {},
                selected_entity: {},
                selected_endpoint: {},
                selected_role: {},
                selected_user: {},
                endpointModalOpened: false,
                sendToAccount: false,
            };
            saveLocalStorage(false);
            clearInterval(session_timer);
            bs.logOut();
        }
    }    

    bs.resetInvalidateTimer = function () {
        clearInterval(session_timer);
        session_timer = setInterval(invalidateSession, session_timeout);
    }

    bs.logOut = function () {
        delete $http.defaults.headers.common[bs.objBackstrap.header_token_key];
        $state.go('app.logout');
        return false;
    };

    // ====================================================================
    // GETTERS & SETTERS
    // ====================================================================
    bs.getApiToken = function () {
        bs.resetInvalidateTimer();
        return bs.objBackstrap.api_token;
    };

    bs.setApiToken = function (tkn) {
        bs.objBackstrap.api_token = tkn;       
        $http.defaults.headers.common['Content-Type'] = 'application/json';
        $http.defaults.headers.common[bs.objBackstrap.header_token_key] = bs.objBackstrap.api_token;
         saveLocalStorage();
    };

    bs.getUserInfo = function () {
        return bs.objBackstrap.user_info;
    };

    bs.setUserInfo = function (uiObj) {
        bs.objBackstrap.user_info = uiObj;
        saveLocalStorage();
    };
    bs.getBackstrapVersion = function () {
       var deferred = $q.defer();
        if(bs.objBackstrap.version !== undefined && bs.objBackstrap.version !== null) {
            if (bs.objBackstrap.version.length > 0) {
                deferred.resolve(bs.objBackstrap.version);
            }
            else {
                getVersion()
                .then(function (v) {
                    bs.objBackstrap.version = v;
                    saveLocalStorage();
                    deferred.resolve(v);
                });
            }
        }
        else {
            getVersion()
            .then(function (v) {
                bs.objBackstrap.version = v;
                saveLocalStorage();
                deferred.resolve(v);
            });
        }

        
        return deferred.promise;
    };

    bs.getLocalUsers = function () {
        return bs.objBackstrap.local_users;
    };
    bs.setLocalUsers = function (users) {
        bs.objBackstrap.local_users = users;
        saveLocalStorage();
    };
    bs.getLocalModels = function () {
        return bs.objBackstrap.local_models;
    };

    bs.setLocalModels = function (mdls) {
        bs.objBackstrap.local_models = mdls;
        saveLocalStorage();
    };

    bs.setLocalEndpoints = function (epList) {
        bs.objBackstrap.local_endpoints = epList;
        saveLocalStorage();
    };

    bs.getLocalEndpoints = function () {
        return bs.objBackstrap.local_endpoints;
    };

    bs.getSelectedModel = function () {
        return bs.objBackstrap.selected_model;
    };

    bs.setSelectedModel = function (mdl) {
        bs.objBackstrap.selected_model = mdl;
        saveLocalStorage();
    };

    bs.getSelectedEntity = function () {
        return bs.objBackstrap.selected_entity;
    };

    bs.setSelectedEntity = function (se) {
        bs.objBackstrap.selected_entity = se;
        saveLocalStorage();
    };

    bs.getSelectedEndpoint = function () {
        return bs.objBackstrap.selected_endpoint;
    };

    bs.setSelectedEndpoint = function (se) {
        bs.objBackstrap.selected_endpoint = se;
        saveLocalStorage();
    };
    bs.setLocalRoles = function (objRoles) {
        bs.objBackstrap.local_roles = objRoles;
        saveLocalStorage();
    };
    bs.getLocalRoles = function () {
        return bs.objBackstrap.local_roles;
    };
    bs.setSelectedRole = function (objRoles) {
        bs.objBackstrap.selected_role = objRoles;
        saveLocalStorage();
    };
    bs.getSelectedRole = function () {
        return bs.objBackstrap.selected_role;
    };
    bs.setSelectedUser = function (objUser) {
        bs.objBackstrap.selected_user = objUser;
        saveLocalStorage();
    };
    bs.getSelectedUser = function () {
        return bs.objBackstrap.selected_user;
    };
    bs.getValidPropertyTypes = function () {
        return [{ label: 'Object', value: 'object' }, { label: 'Array', value: 'array' }, { label: 'String', value: 'string' }, { label: 'Boolean', value: 'boolean' }, { label: 'Number', value: 'number' }, { label: 'Date', value: 'date' }, { label: 'File', value: 'file' }];
    };

    bs.getEndpointModalOpened = function () {
        return bs.objBackstrap.endpointModalOpened;
    };

    bs.setEndpointModalOpened = function (id) {
        bs.objBackstrap.endpointModalOpened = id;
        saveLocalStorage();
    };

    bs.getSendToAccount = function () {
        return bs.objBackstrap.sendToAccount;
    };

    bs.setSendToAccount = function (b) {
        bs.objBackstrap.sendToAccount = b;
        saveLocalStorage();
    };
    function saveLocalStorage(resetTimer) {
        localStorage.setItem('backstrap_master', JSON.stringify(bs.objBackstrap));
        //the timeout function sends a resetTimer = false, so we don't reset, otherwise true'
        if (resetTimer == null || resetTimer) {
            bs.resetInvalidateTimer();
        }
    }


    //get and apply the bs instance header token key 
    function getHeaderTokenKey() {       
        var token_name = "";
        $http.get(apiBase + "common/internalSystem/headerTokenKey/1.0.0").success(function (data) {
            token_name = data.header_token_key;
            bs.objBackstrap.header_token_key = token_name;
            $http.defaults.headers.common[token_name] = token_name;
            if (bs.objBackstrap.api_token && bs.objBackstrap.api_token.length > 0){
                $http.defaults.headers.common[bs.objBackstrap.header_token_key] = bs.objBackstrap.api_token;
            }
            saveLocalStorage();         
        }, function (err) {
          
        });    
    }
    getHeaderTokenKey();

    //Get current Backstrap Version
    function getVersion() {
        var deferred = $q.defer();
        //Get current bs version
        $http.get(apiBase + "common/internalSystem/version/1.0.0").success(function (data) {
            objBackstrap.version = data.version;
            saveLocalStorage();
            deferred.resolve(objBackstrap.version);
        }, function (err) {
            deferred.reject(err);
        });
        return deferred.promise;
    }
    getVersion();

    // ====================================================================
    // ====================================================================


    // ====================================================================
    // LOGIN/LOGOUT/AUTH STUFF
    // ====================================================================
    bs.login = function (username, password, clientInfo) {
        var srvc = this;
        var deferred = $q.defer();
        var postObj = {
            'username': username,
            'password': password,
            'clientInfo': clientInfo
        };
        post("common/accounts/signin/1.0.0", postObj).then(
            function (response) {
                // ONLY LET THROUGH USERS WITH ADMIN LEVEL SECURITY ROLE OR HIGHER
                if (response.roles.indexOf('super-user') !== -1 ||
                    response.roles.indexOf('admin-user') !== -1) {
                    var tkn = response[bs.objBackstrap.header_token_key];
                    bs.setApiToken(tkn);
                    console.log(tkn);
                    response['organization'] = 'Backstrap';
                    bs.setUserInfo(response);
                    response.token = tkn;;
                    deferred.resolve(response);
                }
                else {
                    deferred.reject("You do not have sufficient permissions.");
                }
            },
            function (response) {
                deferred.reject(response);
            });
        return deferred.promise;
    };

    bs.logout = function () {       
        var deferred = $q.defer();

        if(bs.objBackstrap.api_token !== undefined && bs.objBackstrap.api_token !== null 
            && bs.objBackstrap.api_token !== '') {
            post("common/accounts/signout/1.0.0").then(
                function (response) {
                    bs.setApiToken('');     
                    bs.objBackstrap.local_endpoints = [];
                    bs.objBackstrap.local_models = [];
                    bs.objBackstrap.users = [];
                    bs.objBackstrap.roles = [];
                    saveLocalStorage(false);
                    deferred.resolve(response);
                },
                function (response) {
                    deferred.reject(response);
            });
        }
        else {
            deferred.resolve(true);
        }
        
        return deferred.promise;
    };

    bs.resetPassword = function (resetObj, email) {
        var deferred = $q.defer();
        post("common/accounts/resetPassword/1.0.0", resetObj).then(
            function (response) {
                deferred.resolve(response);
            },
            function (response) {
                deferred.reject(response);
            });
        return deferred.promise;
    };

    bs.forgotPassword = function (fpwObj, email) {
        var deferred = $q.defer();
        post("common/accounts/forgotPassword/1.0.0", fpwObj).then(
            function (response) {
                deferred.resolve(response);
            },
            function (response) {
                deferred.reject(response);
            });
        return deferred.promise;
    };

    bs.signup = function (username, password, email) {
        var deferred = $q.defer();
        post("common/accounts/signup/1.0.0", "{\"username\": \"" + username + "\", \"password\":\"" + password + "\", \"email\":\"" + email + "\"}").then(
            function (response) {
                // ADD THE NEW USER TO THE USER LIST IN MEMORY
                if (bs.objBackstrap.local_users !== null && bs.objBackstrap.local_users !== undefined) {
                    bs.objBackstrap.local_users.push(response);
                }
                else {
                    bs.objBackstrap.local_users = [response];
                }
                deferred.resolve(response);
            },
            function (response) {
                deferred.reject(response);
            });
        return deferred.promise;
    };

    //service to communicate with users to include a new user
    bs.updateUser = function (userObj) {
      var deferred = $q.defer();
      update("common/admin/user/1.0.0", userObj).then(function (response) {
          deferred.resolve(response);
      },
          function (response) {
              deferred.reject(response);
          });
      return deferred.promise;
    };

    bs.resetClientSecret = function(clientId) {
      var deferred = $q.defer();
      post("common/admin/resetClientSecret/1.0.0", {client_id: clientId}).then(function (response) {
          deferred.resolve(response);
      },
      function (response) {
          deferred.reject(response);
      });
      return deferred.promise;
    }

    //service to communicate with users to include a new user
    bs.defaultUserCheck = function () {
        var deferred = $q.defer();
        get("common/accounts/defaultUserCheck/1.0.0", '').then(function (response) {
            deferred.resolve(response);
        },
            function (response) {
                deferred.reject(response);
            });
        return deferred.promise;
    };

    // ====================================================================
    // ====================================================================

    // ====================================================================
    // USERS
    // ====================================================================
    //get the list of users
    bs.getUsers = function () {
        var deferred = $q.defer();
        get("common/admin/user/1.0.0").then(
            function (response) {
                bs.setLocalUsers(response);
                deferred.resolve(response);
            },
            function (response) {
                deferred.reject(response);
            });
        return deferred.promise;
    };
    // ====================================================================
    // ====================================================================

    // ====================================================================
    // MODELS
    // ====================================================================
    bs.getModels = function () {
        var deferred = $q.defer();
        bs.fetchFile('file_name=models').then(function (response) {
            bs.setLocalModels(response.models);
            deferred.resolve(true);
        },
            function (response) {
                deferred.reject(response);
            });
        return deferred.promise;
    };
    // ====================================================================
    //SECURITY
    // ====================================================================
    bs.getRoles = function () {
        var deferred = $q.defer();
        bs.fetchFile('file_name=security').then(function (response) {
            bs.setLocalRoles(response.roles);
            deferred.resolve(true);
        },
            function (response) {
                deferred.reject(response);
            });
    };


    // ====================================================================
    // ENDPOINTS
    // ====================================================================
    bs.getEndpoints = function () {
        var deferred = $q.defer();
        get("common/internalSystem/endpoint/1.0.0").then(function (response) {
            if (response.available) {
                bs.setLocalEndpoints(response.endpoints);
            }
            deferred.resolve(response);
        },
            function (response) {
                deferred.reject(response);
            });
        return deferred.promise;
    };



    bs.postEndpoint = function (endpoint_object) {
        var deferred = $q.defer();
        post("common/internalSystem/endpoint/1.0.0", endpoint_object).then(function (response) {
            bs.setLocalEndpoints(response.endpoints);
            deferred.resolve(response.endpoints);

        },
            function (response) {
                deferred.reject(response);
            });
        return deferred.promise;
    };

    bs.updateEndpoint = function (endpoint_object) {
        var deferred = $q.defer();
        update("common/internalSystem/endpoint/1.0.0", endpoint_object).then(function (response) {
            deferred.resolve(response.endpoints);
        },
            function (response) {
                deferred.reject(response);
            });
        return deferred.promise;
    };

    bs.removeEndpoint = function (endpoint_object) {
        var deferred = $q.defer();
        delet("common/internalSystem/endpoint/1.0.0", { params: endpoint_object }).then(function (response) {
            deferred.resolve(response.endpoints);
        },
            function (response) {
                deferred.reject(response);
            });
        return deferred.promise;
    };

    // ====================================================================
    // ====================================================================


    // ====================================================================
    // JSON FILE READERS/WRITERS
    // ====================================================================
    bs.fetchFile = function (parameters) {
        var deferred = $q.defer();
        get("common/cms/file/1.0.0?" + parameters, "").then(function (response) {
            bs.resetInvalidateTimer();
            deferred.resolve(response);
        },
            function (response) {
                deferred.reject(response);
            });
        return deferred.promise;
    };

    //post file
    bs.postFile = function (file_object) {
        var deferred = $q.defer();
        post("common/cms/file/1.0.0", file_object).then(function (response) {
            bs.resetInvalidateTimer();
            deferred.resolve(response);
        },
            function (response) {
                deferred.reject(response);
            });
        return deferred.promise;
    };
    // ====================================================================
    // ====================================================================

    // ====================================================================
    // HTTP CALLS -- PRIVATE
    // ====================================================================
    function get(module, parameter) {
        var deferred = $q.defer();
        $http.get(apiBase + module, { params: parameter }, {}).success(function (response) {
            bs.resetInvalidateTimer();
            deferred.resolve(response);

        }).catch(function (data, status, headers, config) { // <--- catch instead error
            deferred.reject(data.data);
        });

        return deferred.promise;
    };

    function post(module, jsonBody) {
        var deferred = $q.defer();
        $http.post(apiBase + module, jsonBody, {}).success(function (response) {
            bs.resetInvalidateTimer();
            deferred.resolve(response);
        }).catch(function (data, status, headers, config) { // <--- catch instead error
            deferred.reject(data.data);
        });
        return deferred.promise;
    };

    function update(module, jsonBody) {
        var deferred = $q.defer();
        $http.patch(apiBase + module, jsonBody, {}).success(function (response) {
            bs.resetInvalidateTimer();
            deferred.resolve(response);
        }).catch(function (data, status, headers, config) { // <--- catch instead error
            deferred.reject(data.data);
        });
        return deferred.promise;
    };

    function delet(module, jsonBody) {
        var deferred = $q.defer();
        $http.delete(apiBase + module, jsonBody, {}).success(function (response) {
            bs.resetInvalidateTimer();
            deferred.resolve(response);
        }).catch(function (data, status, headers, config) { // <--- catch instead error
            deferred.reject(data.data);
        });
        return deferred.promise;
    };
    // ====================================================================
    // ====================================================================




    // ====================================================================
    // DATA HANDLER FUNCTIONS
    //=====================================================================
    //exeute query
    bs.postBackstrapQuery = function (queryObject) {
        var deferred = $q.defer();
        post("common/data/query/1.0.0", queryObject).then(function (response) {
            if (response) {
                deferred.resolve(response);
            }
            else
                deferred.reject("Something went wrong while processing your request. Please Contact Administrator.");
        },
            function (response) {
                deferred.reject(response);
            });
        return deferred.promise;
    };

    //exeute query
    bs.executeBackstrapSqlQuery = function (queryString) {
        console.log(queryString);
        var deferred = $q.defer();
        get("common/data/query/1.0.0?" + queryString, null).then(function (response) {
            if (response) {
                deferred.resolve(response);
            }
            else
                deferred.reject("Something went wrong while processing your request. Please Contact Administrator.");
        },
            function (response) {
                deferred.reject(response);
            });
        return deferred.promise;
    };

    //create entity
    bs.createEntity = function (createObj) {
        var deferred = $q.defer();
        post("common/data/create/1.0.0", createObj).then(function (response) {
            if (response.hasOwnProperty('id'))
                deferred.resolve(response);
            else
                deferred.reject("Something went wrong while processing your request. Please Contact Administrator.");
        },
            function (response) {
                deferred.reject(response);
            });
        return deferred.promise;
    };

    //update entity
    bs.updateEntity = function (updateObj) {
        var deferred = $q.defer();
        post("common/data/update/1.0.0", updateObj).then(function (response) {
            if (response.hasOwnProperty('id'))
                deferred.resolve(response);
            else
                deferred.reject("Something went wrong while processing your request. Please Contact Administrator.");
        },
            function (response) {
                deferred.reject(response);
            });
        return deferred.promise;
    };

    // GET RESOURCE
    bs.query = function (module, parameter) {
        var deferred = $q.defer();
        $http.post(apiBase + module, parameter, {}).success(function (response) {
            deferred.resolve(response);
        }).catch(function (data, status, headers, config) { // <--- catch instead error
            deferred.reject(data.data);
        });

        return deferred.promise;
    };

    // CREATE RESOURCE
    bs.create = function (module, parameter) {
        var deferred = $q.defer();
        $http.post(apiBase + module, parameter, {}).success(function (response) {
            deferred.resolve(response);
        }).catch(function (data, status, headers, config) { // <--- catch instead error
            deferred.reject(data.data);
        });

        return deferred.promise;
    };

    // UPDATE RESOURCE
    bs.update = function (module, parameter) {
        var deferred = $q.defer();
        $http.post(apiBase + module + '/' + parameter.id, parameter, {}).success(function (response) {
            deferred.resolve(response);
        }).catch(function (data, status, headers, config) { // <--- catch instead error
            deferred.reject(data.data);
        });

        return deferred.promise;
    };

    // DELETE RESOURCE
    bs.delet = function (module, parameter) {
        var deferred = $q.defer();
        $http.post(apiBase + module + '/' + parameter.id, parameter, {}).success(function (response) {
            deferred.resolve(response);
        }).catch(function (data, status, headers, config) { // <--- catch instead error
            deferred.reject(data.data);
        });

        return deferred.promise;
    };

    bs.errorMessage = function (errMessage) {
        Flash.create('error', errMessage, 'large-text');
    };
}]);
