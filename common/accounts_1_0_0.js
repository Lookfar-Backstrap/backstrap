/*jshint expr: true, es5: true, unused:false */

// ===============================================================================
// ACCOUNTS WEB SERVICE CALLS v1.0.0
// ===============================================================================
var dataAccess;
var utilities;
var accessControl;
var serviceRegistration;
var settings;
var models;

var Q = require('q');
var crypto = require('crypto');
var request = require('request');


var Accounts = function(db, utils, ac, sr, st, m) {
    dataAccess = db;
    utilities = utils;
    accessControl = ac;
    serviceRegistration = sr;
    settings = st;
    models = m;
};

Accounts.prototype.get = {
    checkToken: function(req, callback) {
        // AUTH HAS ALREADY BEEN CHECKED, THIS TOKEN IS VALID
        var deferred = Q.defer();
        
        deferred.resolve({'success': true});

        deferred.promise.nodeify(callback);
        return deferred.promise;
    },
    profile: function(req, callback) {
        var deferred = Q.defer();

        var token = req.headers[settings.data.token_header];
        var userObj = req.this_user;
        delete userObj.id;
        delete userObj.password;
        delete userObj.salt;
        delete userObj.object_type;
        delete userObj.created_at;
        delete userObj.updated_at;
        delete userObj.roles;
        delete userObj.forgot_password_tokens;
        delete userObj.is_active;

        // ADD EVENT TO SESSION
        deferred.resolve(userObj);
        
        deferred.promise.nodeify(callback);
        return deferred.promise;
    },
    profileImage: function(req, callback) {
        var deferred = Q.defer();

		deferred.resolve({});

        deferred.promise.nodeify(callback);
        return deferred.promise;
    },
    user: function(req, callback) {
        var deferred = Q.defer();

        var username = (typeof (req.query.username) == 'undefined' || req.query.username === null) ? req.query.email.toLowerCase() : req.query.username.toLowerCase();
        var token = req.headers[settings.data.token_header];
        var userObj = req.this_user;
        dataAccess.findOne('bsuser', { 'username': username })
            .then(function(userObj) {
                delete userObj.password;
                delete userObj.salt;
                delete userObj.object_type;
                delete userObj.forgot_password_tokens;

                // ADD EVENT TO SESSION
                var resolveObj = userObj;
                deferred.resolve(resolveObj);
            })
            .fail(function(err) {
                if (err !== undefined && err !== null && typeof (err.AddToError) === 'function') {
                    if (err.message === 'no results found' || err.err_code === 'da0109') {
                        err.setStatus(400);
                        err.setMessages('user not found', 'User not found');
                    }
                    deferred.reject(err.AddToError(__filename, 'GET user'));
                }
                else {
                    var errorObj = new ErrorObj(500,
                        'a1002',
                        __filename,
                        'GET user',
                        'error getting user',
                        'Error getting user',
                        err
                    );
                    deferred.reject(errorObj);
                }
            });

        deferred.promise.nodeify(callback);
        return deferred.promise;
    },
    userExists: function(req, callback) {
        var deferred = Q.defer();
        req.body = req.query;
        getUser(req)
            .then(function() {
                // ADD EVENT TO SESSION
                var resolveObj = { 'set_up_pending': false };
                deferred.resolve(resolveObj);
            })
            .fail(function(err) {
                if (err !== undefined && err !== null && typeof (err.AddToError) === 'function') {
                    if (err.message === 'no user found' || err.err_code === 'da2000') {
                        err.setStatus(400);
                        err.setMessages('user not found', 'User not found');
                    }
                    deferred.reject(err.AddToError(__filename, 'GET userExists'));
                }
                else {
                    var errorObj = new ErrorObj(500,
                        'a1003',
                        __filename,
                        'GET userExists',
                        'error getting user',
                        'Error getting user',
                        err
                    );
                    deferred.reject(errorObj);
                }
            });

        deferred.promise.nodeify(callback);
        return deferred.promise;
    },
    defaultUserCheck: function(req, callback) {
        var deferred = Q.defer();
        dataAccess.findAll('bsuser')
            .then(function(users) {
                users.forEach(function(user) {
                    if (user.username === 'bsroot') {
                        if (user.first === '') {
                            if (user.forgot_password_tokens.length > 0) {
                                var token = user['forgot_password_tokens'][0];
                                deferred.resolve({ 'set_up_pending': true, 'token': token });
                            }
                            else {
                                deferred.resolve({ 'set_up_pending': true, 'token': null });
                            }
                        }
                    }
                });

                // ADD EVENT TO SESSION
                var resolveObj = { 'set_up_pending': false };
                deferred.resolve(resolveObj);
            })
            .fail(function(err) {
                if (err !== undefined && err !== null && typeof (err.AddToError) === 'function') {
                    deferred.reject(err.AddToError(__filename, 'GET defaultUserCheck'));
                }
                else {
                    var errorObj = new ErrorObj(500,
                        'a1004',
                        __filename,
                        'GET defaultUserCheck',
                        'error checking if this is default user',
                        'Error checking if this is default user',
                        err
                    );
                    deferred.reject(errorObj);
                }
            });

        deferred.promise.nodeify(callback);
        return deferred.promise;
    }
};

Accounts.prototype.post = {
    oauth_signIn: function(req, callback) {
        var deferred = Q.defer();

        var body = req.body;
        var service = body.service.toLowerCase();
        var auth = body.auth;

        if (service === 'facebook') {
            request({
                url: settings.data.oauth.facebook.get_token_url + settings.data.oauth.facebook.client_id +
                '&redirect_uri=' + auth.redirect_uri + '&client_secret=' + settings.data.oauth.facebook.client_secret +
                '&code=' + auth.code,
                method: 'GET',
                headers: {
                    'Content-Type': 'application/json'
                }
            }, function(err, res, bodyString) {
                var body = JSON.parse(bodyString);
                if (!err && res.statusCode === 200 && body.error === undefined) {
                    var access_token = body.access_token;
                    var token_type = body.token_type;
                    var expires_in = body.expires_in;

                    // CHECK IF THIS IS A NEW USER
                    // GET THE USER'S FBID
                    request({
                        url: settings.data.oauth.facebook.token_info_url + access_token +
                        '&fields=id,name,first_name,last_name,picture,email,gender,age_range,birthday',
                        method: 'GET',
                        headers: {
                            'Content-Type': 'application/json'
                        }
                    }, function(fbu_err, fbu_res, fbu_body) {
                        if (!fbu_err && fbu_res.statusCode == 200) {
                            // DO WE HAVE THIS USER IN OUR SYSTEM?  CHECK BY FBID
                            var fbuBodyObj = JSON.parse(fbu_body);
                            dataAccess.findOne('bsuser', { 'account_type': 'facebook', 'fbid': fbuBodyObj.id })
                                .then(function(find_res) {
                                    // USER EXISTS IN OUR SYSTEM
                                    // TODO: UPDATE USER OBJ WITH INFO THAT COMES BACK FROM FB HERE
                                    var userObj = find_res;

                                    // IF USER IS LOCKED, BAIL OUT
                                    if (find_res.is_locked) {
                                        var errorObj = new ErrorObj(403,
                                            'a2000',
                                            __filename,
                                            'oauth_signin',
                                            'bsuser is locked',
                                            'Unauthorized',
                                            null
                                        );
                                        deferred.reject(errorObj);

                                        deferred.promise.nodeify(callback);
                                        return deferred.promise;
                                    }

                                    // CHECK TOKENS
                                    // ADD 100 SECOND FUDGE FACTOR
                                    if (find_res.token_info.granted_at + find_res.token_info.expires_in + 100 >= Math.floor(new Date().getTime() / 1000)) {
                                        // FB LONG-LIVED TOKEN IS EXPIRED, RENEW
                                        request({
                                            url: settings.data.oauth.facebook.endpoint + '?grant_type=fb_exchange_token&client_id=' +
                                            settings.data.oauth.facebook.client_id + '&client_secret=' + settings.data.oauth.facebook.client_secret +
                                            '&fb_exchange_token=' + access_token,
                                            method: 'GET',
                                            headers: {
                                                'Content-Type': 'application/json'
                                            }
                                        }, function(ll_err, ll_res, ll_body) {
                                            if (!ll_err && ll_res.statusCode == 200) {
                                                var llBodyObj = JSON.parse(ll_body);
                                                userObj.token_info = {
                                                    'token': llBodyObj.access_token,
                                                    'token_type': llBodyObj.token_type,
                                                    'granted_at': Math.floor(new Date().getTime() / 1000),
                                                    'expires_in': llBodyObj.expires_in
                                                }
                                                dataAccess.saveEntity('bsuser', userObj)
                                                    .then(function(st_res) {
                                                        // ALL DONE.  CREATE A BS SESSION
                                                        return createSession(userObj, null);
                                                    })
                                                    .then(function(sess_res) {
                                                        var resolveObj = sess_res;
                                                        deferred.resolve(resolveObj);
                                                    })
                                                    .fail(function(st_err) {
                                                        if (st_err !== undefined && st_err !== null && typeof (st_err.AddToError) === 'function') {
                                                            deferred.reject(st_err.AddToError(__filename, 'POST oauth_signIn'));
                                                        }
                                                        else {
                                                            var errorObj = new ErrorObj(500,
                                                                'a1005',
                                                                __filename,
                                                                'POST oauth_signIn',
                                                                'error saving bsuser',
                                                                'Error saving bsuser',
                                                                st_err
                                                            );
                                                            deferred.reject(errorObj);
                                                        }
                                                    });
                                            }
                                            else {
                                                var errorObj;

                                                if (ll_err) {
                                                    errorObj = new ErrorObj(500,
                                                        'a0001',
                                                        __filename,
                                                        'oauth_signIn',
                                                        'error with request to fb',
                                                        'External error',
                                                        ll_err
                                                    );
                                                }
                                                else {
                                                    errorObj = new ErrorObj(500,
                                                        'a0002',
                                                        __filename,
                                                        'oauth_signIn',
                                                        'error with request to fb',
                                                        'External error',
                                                        ll_body
                                                    );
                                                }

                                                deferred.reject(errorObj);
                                            }
                                        });
                                    }
                                    else {
                                        // CREATE A NEW BS SESSION
                                        createSession(userObj, null)
                                        .then(function(sess_res) {
                                            // ADD EVENT TO SESSION
                                            var resolveObj = sess_res;
                                            deferred.resolve(resolveObj);
                                        })
                                        .fail(function(sess_err) {
                                            if (sess_err !== undefined && sess_err !== null && typeof (sess_err.AddToError) === 'function') {
                                                deferred.reject(sess_err.AddToError(__filename, 'POST oauth_signIn'));
                                            }
                                            else {
                                                var errorObj = new ErrorObj(500,
                                                    'a1006',
                                                    __filename,
                                                    'POST oauth_signIn',
                                                    'error creating new session',
                                                    'Error creating new session',
                                                    sess_err
                                                );
                                                deferred.reject(errorObj);
                                            }
                                        });
                                    }
                                })
                                .fail(function(find_err) {
                                    // USER DOES NOT EXIST, CREATE THIS USER
                                    if (find_err.message === 'no results found') {
                                        var fbUserObj = JSON.parse(fbu_body);
                                        var userObj = {
                                            'object_type': 'bsuser',
                                            'account_type': 'facebook',
                                            'fbid': fbUserObj.id,
                                            'username': fbUserObj.name.toLowerCase(),
                                            'first': fbUserObj.first_name,
                                            'last': fbUserObj.last_name,
                                            'email': fbUserObj.email,
                                            'gender': fbUserObj.gender,
                                            'age_range': fbUserObj.age_range,
                                            'picture': fbUserObj.picture,
                                            'roles': ['default-user'],
                                            'is_locked': false
                                        };
                                        dataAccess.saveEntity('bsuser', userObj)
                                            .then(function(save_res) {
                                                // USER IS SAVED, GET LONG LIVED TOKEN
                                                userObj = save_res;
                                                request({
                                                    url: settings.data.oauth.facebook.endpoint + '?grant_type=fb_exchange_token&client_id=' +
                                                    settings.data.oauth.facebook.client_id + '&client_secret=' + settings.data.oauth.facebook.client_secret +
                                                    '&fb_exchange_token=' + access_token,
                                                    method: 'GET',
                                                    headers: {
                                                        'Content-Type': 'application/json'
                                                    }
                                                }, function(ll_err, ll_res, ll_body) {
                                                    if (!ll_err && ll_res.statusCode == 200) {
                                                        var llBodyObj = JSON.parse(ll_body);
                                                        userObj.token_info = {
                                                            'token': llBodyObj.access_token,
                                                            'token_type': llBodyObj.token_type,
                                                            'granted_at': Math.floor(new Date().getTime() / 1000),
                                                            'expires_in': llBodyObj.expires_in
                                                        };
                                                        dataAccess.saveEntity('bsuser', userObj)
                                                            .then(function(st_res) {
                                                                // ALL DONE.  CREATE A BS SESSION
                                                                return createSession(userObj);
                                                            })
                                                            .then(function(sess_res) {
                                                                // ADD EVENT TO SESSION
                                                                var resolveObj = sess_res;
                                                                deferred.resolve(resolveObj);
                                                            })
                                                            .fail(function(st_err) {
                                                                if (st_err !== undefined && st_err !== null && typeof (st_err.AddToError) === 'function') {
                                                                    deferred.reject(st_err.AddToError(__filename, 'POST oauth_signIn'));
                                                                }
                                                                else {
                                                                    var errorObj = new ErrorObj(500,
                                                                        'a1007',
                                                                        __filename,
                                                                        'POST oauth_signIn',
                                                                        'error saving entity',
                                                                        'Error saving entity',
                                                                        st_err
                                                                    );
                                                                    deferred.reject(errorObj);
                                                                }
                                                            });
                                                    }
                                                    else {
                                                        var errorObj;

                                                        if (ll_err) {
                                                            errorObj = new ErrorObj(500,
                                                                'a0003',
                                                                __filename,
                                                                'oauth_signIn',
                                                                'error with request to fb',
                                                                'External error',
                                                                ll_err
                                                            );
                                                        }
                                                        else {
                                                            errorObj = new ErrorObj(500,
                                                                'a0004',
                                                                __filename,
                                                                'oauth_signIn',
                                                                'error with request to fb',
                                                                'External error',
                                                                ll_body
                                                            );
                                                        }
                                                    }
                                                });
                                            })
                                            .fail(function(save_err) {
                                                if (save_err !== undefined && save_err !== null && typeof (save_err.AddToError) === 'function') {
                                                    deferred.reject(save_err.AddToError(__filename, 'POST oauth_signIn'));
                                                }
                                                else {
                                                    var errorObj = new ErrorObj(500,
                                                        'a1008',
                                                        __filename,
                                                        'POST oauth_signIn',
                                                        'error saving user object',
                                                        'Error saving user object',
                                                        save_err
                                                    );
                                                    deferred.reject(errorObj);
                                                }
                                            });
                                    }
                                    else {
                                        if (typeof (find_err.AddToError) == 'function') {
                                            deferred.reject(find_err.AddToError(__filename, 'oauth_signIn'));
                                        }
                                        else {
                                            var errorObj = new ErrorObj(500,
                                                'a0005',
                                                __filename,
                                                'oauth_signIn',
                                                'error executing oauth with fb',
                                                'External error',
                                                find_err
                                            );
                                            deferred.reject(errorObj);
                                        }
                                    }
                                });
                        }
                        else {
                            if (fbu_err) {
                                var errorObj = new ErrorObj(500,
                                    'a0006',
                                    __filename,
                                    'oauth_signIn',
                                    'error executing oauth with fb',
                                    'External error',
                                    fbu_err
                                );
                                deferred.reject(errorObj);
                            }
                            else {
                                var errorObj = new ErrorObj(500,
                                    'a0007',
                                    __filename,
                                    'oauth_signIn',
                                    'error executing oauth with fb',
                                    'External error',
                                    fbu_body
                                );
                                deferred.reject(errorObj);
                            }
                        }
                    });
                }
                else {
                    if (err) {
                        var errorObj = new ErrorObj(500,
                            'a0008',
                            __filename,
                            'oauth_signIn',
                            'error executing oauth with fb',
                            'External error',
                            err
                        );
                        deferred.reject(errorObj);
                    }
                    else if (body.error !== undefined) {
                        var errorObj = new ErrorObj(500,
                            'a0009',
                            __filename,
                            'oauth_signIn',
                            'error executing oauth with fb',
                            'External error',
                            body
                        );
                        deferred.reject(errorObj);
                    }
                    else {
                        var msg = 'Received status code: ' + res.statusCode + ' from fb while exchanging code for token';
                        var errorObj = new ErrorObj(500,
                            'a0010',
                            __filename,
                            'oauth_signIn',
                            'error executing oauth with fb',
                            'External error',
                            msg
                        );
                        deferred.reject(errorObj);
                    }
                }
            });
        }
        else if (service === 'twitter') {
            // IS THERE A WAY FOR US TO CHECK IF THIS USER ALREADY HAS AN ACCESS TOKEN??
            createTwitterAuthHeader('POST', settings.data.oauth.access_token_url, null, auth.oauth_token)
                .then(function(authHeader) {
                    request({
                        url: settings.data.oauth.access_token_url + '?oauth_verifier=' + auth.oauth_verifier,
                        method: 'POST',
                        headers: {
                            'Content-Type': 'application/json',
                            'Authorization': authHeader
                        }
                    }, function(err, res, body) {
                        if (!err && res.statusCode == 200) {
                            // RESPONSE IS NOT JSON --- WHY TWITTER, WHY??
                            var bodyObj = splitParams(body);

                            var oauth_token = bodyObj.oauth_token;
                            var oauth_token_secret = bodyObj.oauth_token_secret;
                            var user_id = bodyObj.user_id;
                            var screen_name = bodyObj.screen_name;

                            // SEE IF WE HAVE THIS USER ALREADY
                            dataAccess.findOne('bsuser', { 'account_type': 'twitter', 'twid': user_id })
                                .then(function(userObj) {
                                    // IF USER IS LOCKED, BAIL OUT
                                    if (userObj.is_locked) {
                                        var errorObj = new ErrorObj(403,
                                            'a2001',
                                            __filename,
                                            'oauth_signin',
                                            'bsuser is locked',
                                            'Unauthorized',
                                            null
                                        );
                                        deferred.reject(errorObj);

                                        deferred.promise.nodeify(callback);
                                        return deferred.promise;
                                    }
                                    // WE HAVE THIS USER, UPDATE TOKEN & SPIN UP BS SESSION
                                    userObj.token_info = {
                                        'oauth_token': oauth_token,
                                        'oauth_token_secret': oauth_token_secret
                                    };
                                    dataAccess.saveEntity('bsuser', userObj)
                                        .then(function(save_res) {
                                            return createSession(save_res, null);
                                        })
                                        .then(function(sess_res) {
                                            // ADD EVENT TO SESSION
                                            var resolveObj = sess_res;
                                            deferred.resolve(resolveObj);
                                        })
                                        .fail(function(save_err) {
                                            deferred.reject(save_err.AddToError(__filename, 'oauth_signIn'));
                                        });
                                })
                                .fail(function(find_err) {
                                    // WE DON'T HAVE THIS USER, CREATE A NEW ONE
                                    if (find_err != null && find_err.message === 'no results found') {
                                        createTwitterAuthHeader('GET', settings.data.oauth.twitter.verify_credentials_json_url, { 'include_email': true }, oauth_token, oauth_token_secret)
                                            .then(function(authHeader) {
                                                request({
                                                    url: settings.data.oauth.twitter.verify_credentials_json_url + '?include_email=true',
                                                    method: 'GET',
                                                    headers: {
                                                        'Content-Type': 'application/json',
                                                        'Authorization': authHeader
                                                    }
                                                }, function(userinfo_err, userinfo_res, userinfo_body) {
                                                    if (!userinfo_err && userinfo_res.statusCode == 200) {
                                                        var userInfo = JSON.parse(userinfo_body);
                                                        var firstName = '';
                                                        var lastName = '';
                                                        var spaceIdx = userInfo.name.lastIndexOf(' ');
                                                        if (spaceIdx === -1) {
                                                            firstName = userInfo.name;
                                                        }
                                                        else {
                                                            firstName = userInfo.name.substring(0, spaceIdx);
                                                            lastName = userInfo.name.substring(spaceIdx + 1);
                                                        }

                                                        var userObj = {
                                                            'object_type': 'bsuser',
                                                            'account_type': 'twitter',
                                                            'twid': user_id,
                                                            'username': userInfo.screen_name.toLowerCase(),
                                                            'first': firstName,
                                                            'last': lastName,
                                                            'email': userInfo.email,
                                                            'picture': {
                                                                'profile_image_url': userInfo.profile_image_url,
                                                                'profile_image_url_https': userInfo.profile_image_url_https
                                                            },
                                                            'token_info': {
                                                                'oauth_token': oauth_token,
                                                                'oauth_token_secret': oauth_token_secret
                                                            },
                                                            'roles': ['default-user'],
                                                            'is_locked': false
                                                        };

                                                        dataAccess.saveEntity('bsuser', userObj)
                                                            .then(function(save_res) {
                                                                return createSession(save_res);
                                                            })
                                                            .then(function(sess_res) {
                                                                // ADD EVENT TO SESSION
                                                                var resolveObj = sess_res;
                                                                deferred.resolve(resolveObj);
                                                            })
                                                            .fail(function(save_err) {
                                                                if (save_err !== undefined && save_err !== null && typeof (save_err.AddToError) === 'function') {
                                                                    deferred.reject(save_err.AddToError(__filename, 'POST oauth_signIn'));
                                                                }
                                                                else {
                                                                    var errorObj = new ErrorObj(500,
                                                                        'a1009',
                                                                        __filename,
                                                                        'POST oauth_signIn',
                                                                        'error saving user obj',
                                                                        'Error saving user obj',
                                                                        save_err
                                                                    );
                                                                    deferred.reject(errorObj);
                                                                }
                                                            });
                                                    }
                                                    else {
                                                        if (userinfo_err) {
                                                            var errorObj = new ErrorObj(500,
                                                                'a0011',
                                                                __filename,
                                                                'oauth_signIn',
                                                                'error executing oauth with twitter',
                                                                'External error',
                                                                userinfo_err
                                                            );
                                                            deferred.reject(errorObj);
                                                        }
                                                        else {
                                                            var errorObj = new ErrorObj(500,
                                                                'a0012',
                                                                __filename,
                                                                'oauth_signIn',
                                                                'error executing oauth with twitter',
                                                                'External error',
                                                                userinfo_body
                                                            );
                                                            deferred.reject(errorObj);
                                                        }
                                                    }
                                                });
                                            })
                                    }
                                    else {
                                        if (find_err != null && typeof(find_err.AddToError) == 'function') {
                                            deferred.reject(find_err.AddToError(__filename, 'oauth_signIn'));
                                        }
                                        else {
                                            var errorObj = new ErrorObj(500,
                                                'a0013',
                                                __filename,
                                                'oauth_signIn',
                                                'error executing oauth with twitter',
                                                'External error',
                                                find_err
                                            );
                                            deferred.reject(errorObj);
                                        }
                                    }
                                });
                        }
                        else {
                            if (err) {
                                var errorObj = new ErrorObj(500,
                                    'a0014',
                                    __filename,
                                    'oauth_signIn',
                                    'error executing oauth with twitter',
                                    'External error',
                                    err
                                );
                                deferred.reject(errorObj);
                            }
                            else {
                                var errorObj = new ErrorObj(500,
                                    'a0015',
                                    __filename,
                                    'oauth_signIn',
                                    'error executing oauth with twitter',
                                    'External error',
                                    body
                                );
                                deferred.reject(errorObj);
                            }
                        }
                    });
                })
                .fail(function(header_err) {
                    if (header_err !== undefined && header_err !== null && typeof (header_err.AddToError) === 'function') {
                        deferred.reject(header_err.AddToError(__filename, 'POST oauth_signIn'));
                    }
                    else {
                        var errorObj = new ErrorObj(500,
                            'a1010',
                            __filename,
                            'POST oauth_signIn',
                            'error constructing header for twitter',
                            'Error constructing header for twitter',
                            header_err
                        );
                        deferred.reject(errorObj);
                    }
                });
        }
        else if (service === 'google') {
            // EXCHANGE CODE FOR ACCESS TOKEN & ID TOKEN
            request({
                url: settings.data.oauth.google.get_token_url,
                method: 'POST',
                form: {
                    client_id: settings.data.oauth.google.client_id,
                    client_secret: settings.data.oauth.google.client_secret,
                    code: auth.code,
                    grant_type: 'authorization_code',
                    access_type: 'offline',
                    redirect_uri: auth.redirect_uri
                },
                headers: {
                    'content-type': 'application/x-www-form-urlencoded'
                }
            }, function(err, res, body) {
                if (!err && res.statusCode == 200) {
                    var bodyObj = JSON.parse(body);
                    var access_token = bodyObj.access_token;
                    var token_type = bodyObj.token_type;
                    var expires_in = bodyObj.expires_in;
                    var granted_at = new Date().getTime() / 1000;
                    var id_token = bodyObj.id_token;

                    request({
                        url: settings.data.oauth.google.token_info_url,
                        method: 'GET',
                        qs: { 'id_token': id_token },
                        headers: { 'content-type': 'x-www-form-urlencoded' }
                    }, function(id_err, id_res, id_body) {
                        if (!id_err && id_res.statusCode == 200) {
                            var idBody = JSON.parse(id_body);
                            // CHECK THAT THE aud FIELD MATCHES OUR CLIENT ID
                            if (idBody.aud === settings.data.oauth.google.client_id) {
                                // WE HAVE THE INFO WE NEED, CHECK IF THIS IS A NEW USER
                                dataAccess.findOne('bsuser', { 'account_type': 'google', 'ggid': idBody.sub })
                                    .then(function(userObj) {
                                        // FOUND THE USER, UPDATE TOKEN & SPIN UP BS SESSION
                                        userObj.token_info = {
                                            'access_token': access_token,
                                            'token_type': token_type,
                                            'expires_in': expires_in,
                                            'granted_at': granted_at
                                        };
                                        dataAccess.saveEntity('bsuser', userObj)
                                            .then(function(save_res) {
                                                // IF USER IS LOCKED, BAIL OUT
                                                if (userObj.is_locked) {
                                                    var errorObj = new ErrorObj(403,
                                                        'a2002',
                                                        __filename,
                                                        'oauth_signin',
                                                        'bsuser is locked',
                                                        'Unauthorized',
                                                        null
                                                    );
                                                    deferred.reject(errorObj);

                                                    deferred.promise.nodeify(callback);
                                                    return deferred.promise;
                                                }

                                                return createSession(save_res, null);
                                            })
                                            .then(function(sess_res) {
                                                // ADD EVENT TO SESSION
                                                var resolveObj = sess_res;
                                                deferred.resolve(resolveObj);
                                            })
                                            .fail(function(save_err) {
                                                if (save_err !== undefined && save_err !== null && typeof (save_err.AddToError) == 'function') {
                                                    deferred.reject(save_err.AddToError(__filename, 'oauth_signIn'));
                                                }
                                                else {
                                                    var errorObj = new ErrorObj(500,
                                                        'a1011',
                                                        __filename,
                                                        'oauth_signIn',
                                                        'error saving user obj',
                                                        'Error saving user obj',
                                                        save_err
                                                    );
                                                    deferred.reject(errorObj);
                                                }
                                            });
                                    })
                                    .fail(function(find_err) {
                                        // NEW USER, CREATE
                                        if (find_err != null && find_err.message === 'no results found') {
                                            var userObj = {
                                                'object_type': 'bsuser',
                                                'account_type': 'google',
                                                'ggid': idBody.sub,
                                                'username': idBody.name.toLowerCase(),
                                                'first': idBody.given_name,
                                                'last': idBody.family_name,
                                                'email': idBody.email,
                                                'picture': {
                                                    'profile_image_url': idBody.picture
                                                },
                                                'token_info': {
                                                    'access_token': access_token,
                                                    'token_type': token_type,
                                                    'expires_in': expires_in,
                                                    'granted_at': granted_at
                                                },
                                                'roles': ['default-user'],
                                                'is_locked': false
                                            };
                                            dataAccess.saveEntity('bsuser', userObj)
                                                .then(function(save_res) {
                                                    return createSession(save_res, null);
                                                })
                                                .then(function(sess_res) {
                                                    // ADD EVENT TO SESSION
                                                    var resolveObj = sess_res;
                                                    deferred.resolve(resolveObj);
                                                })
                                                .fail(function(save_err) {
                                                    if (save_err !== undefined && save_err !== null && typeof (save_err.AddToError) == 'function') {
                                                        deferred.reject(save_err.AddToError(__filename, 'oauth_signIn'));
                                                    }
                                                    else {
                                                        var errorObj = new ErrorObj(500,
                                                            'a1012',
                                                            __filename,
                                                            'oauth_signIn',
                                                            'error saving user obj',
                                                            'Error saving user obj',
                                                            save_err
                                                        );
                                                        deferred.reject(errorObj);
                                                    }
                                                });
                                        }
                                        else {
                                            if (find_err != null && typeof (find_err.AddToError) == 'function') {
                                                deferred.reject(find_err.AddToError(__filename, 'oauth_signIn'));
                                            }
                                            else {
                                                var errorObj = new ErrorObj(500,
                                                    'a0016',
                                                    __filename,
                                                    'oauth_signIn',
                                                    'error executing oauth with google',
                                                    'External error',
                                                    find_err
                                                );
                                                deferred.reject(errorObj);
                                            }
                                        }
                                    });
                            }
                            else {
                                var errorObj = new ErrorObj(500,
                                    'a0017',
                                    __filename,
                                    'oauth_signIn',
                                    'incorrect aud field',
                                    'External error',
                                    id_err
                                );
                                deferred.reject(errorObj);
                            }
                        }
                        else {
                            if (id_err) {
                                var errorObj = new ErrorObj(500,
                                    'a0018',
                                    __filename,
                                    'oauth_signIn',
                                    'error executing oauth with google',
                                    'External error',
                                    id_err
                                );
                                deferred.reject(errorObj);
                            }
                            else {
                                var errorObj = new ErrorObj(500,
                                    'a0019',
                                    __filename,
                                    'oauth_signIn',
                                    'error executing oauth with google',
                                    'External error',
                                    id_body
                                );
                                deferred.reject(errorObj);
                            }
                        }
                    });
                }
                else {
                    if (err) {
                        var errorObj = new ErrorObj(500,
                            'a0020',
                            __filename,
                            'oauth_signIn',
                            'error executing oauth with google',
                            'External error',
                            err
                        );
                        deferred.reject(errorObj);
                    }
                    else {
                        var errorObj = new ErrorObj(500,
                            'a0021',
                            __filename,
                            'oauth_signIn',
                            'error executing oauth with google',
                            'External error',
                            body
                        );
                        deferred.reject(errorObj);
                    }
                }
            });
        }
        else {
            var errorObj = new ErrorObj(400,
                'a0040',
                __filename,
                'oauth_signIn',
                'this oauth provider is not supported',
                'OAuth error'
            );
            deferred.reject(errorObj);
        }

        deferred.promise.nodeify(callback);
        return deferred.promise;
    },
    // THIS KICKS OFF TWITTER OAUTH.  THE CLIENT MUST REACH OUT TO GET THIS REQUEST TOKEN
    twitter_oauth_token: function(req, callback) {
        var deferred = Q.defer();
        createTwitterAuthHeader('POST', settings.data.oauth.twitter.get_token_url)
            .then(function(authHeader) {
                request({
                    url: settings.data.oauth.twitter.get_token_url,
                    method: 'POST',
                    headers: {
                        'Content-Type': 'application/json',
                        'Authorization': authHeader
                    },
                    body: JSON.stringify({ 'oauth_callback': settings.data.oauth.twitter.callback_url })
                }, function(err, res, body) {
                    if (!err && res.statusCode == 200) {
                        var responseArgs = body.split('&');
                        var responseObj = {};
                        for (var aIdx = 0; aIdx < responseArgs.length; aIdx++) {
                            var pair = responseArgs[aIdx].split('=');
                            responseObj[pair[0]] = pair[1];
                        }

                        if (responseObj.oauth_callback_confirmed === 'true') {
                            // ADD EVENT TO SESSION
                            var resolveObj = { 'oauth_token': responseObj.oauth_token };
                            deferred.resolve(resolveObj);
                        }
                        else {
                            var errorObj = new ErrorObj(500,
                                'a0022',
                                __filename,
                                'twitter_oauth_token',
                                'oauth_callback not confirmed by twitter'
                            );
                            deferred.reject(errorObj);
                        }
                    }
                    else {
                        if (err) {
                            var errorObj = new ErrorObj(500,
                                'a0023',
                                __filename,
                                'twitter_oauth_token',
                                'error executing oauth with twitter',
                                'External error',
                                err
                            );
                            deferred.reject(errorObj);
                        }
                        else {
                            var errorObj = new ErrorObj(500,
                                'a0024',
                                __filename,
                                'twitter_oauth_token',
                                'error executing oauth with twitter',
                                'External error',
                                body
                            );
                            deferred.reject(errorObj);
                        }
                    }
                });
            })
            .fail(function(header_err) {
                if (header_err !== undefined && header_err !== null && typeof (header_err.AddToError) == 'function') {
                    deferred.reject(header_err.AddToError(__filename, 'twitter_oauth_token'));
                }
                else {
                    var errorObj = new ErrorObj(500,
                        'a1013',
                        __filename,
                        'twitter_oauth_token',
                        'error coonstructing header for twitter',
                        'Error constructing header for twitter',
                        header_err
                    );
                    deferred.reject(errorObj);
                }
            });

        deferred.promise.nodeify(callback);
        return deferred.promise;
    },
    signIn: function(req, callback) {
        var deferred = Q.defer();
        var body = req.body;

        try {
            var username = (req.body.username)== null ? req.body.email.toLowerCase() : req.body.username.toLowerCase();
        }
        catch (err) {
            var errorObj = new ErrorObj(400,
                'a00001',
                __filename,
                'signIn',
                'Please include username or email to sign in.'
            );
            deferred.reject(errorObj);
            deferred.promise.nodeify(callback);
            return deferred.promise;
        }
        var password = body.password;
        var clientInfo = body.clientInfo;


        getUser(req)
        .then(function(userObj) {
            // IF USER IS LOCKED, BAIL OUT
            if (userObj.is_locked) {
                var errorObj = new ErrorObj(403,
                    'a2004',
                    __filename,
                    'signin',
                    'bsuser is locked',
                    'Unauthorized',
                    null
                );
                deferred.reject(errorObj);

                deferred.promise.nodeify(callback);
                return deferred.promise;
            }
            // GOT A USER, MAKE SURE THERE IS A STORED SALT
            var salt = userObj.salt;
            if (salt === null) {
                var errorObj = new ErrorObj(500,
                    'a0025',
                    __filename,
                    'signIn',
                    'error retrieving salt for this user'
                );
                deferred.reject(errorObj);
                deferred.promise.nodeify(callback);
                return deferred.promise;
            }
            var stored_password = userObj.password;
            if (stored_password === null) {
                var errorObj = new ErrorObj(500,
                    'a0026',
                    __filename,
                    'signIn',
                    'error retrieving password for this user'
                );
                deferred.reject(errorObj);
                deferred.promise.nodeify(callback);
                return deferred.promise;
            }

            // SALT AND HASH PASSWORD
            var saltedPassword = password + userObj.salt;
            var hashedPassword = crypto.createHash('sha256').update(saltedPassword).digest('hex');

            // CHECK IF HASHES MATCH
            if (hashedPassword === stored_password) {
                return [userObj, getToken()];
            }
            else {
                var errorObj = new ErrorObj(401,
                    'a0027',
                    __filename,
                    'signIn',
                    'authentication failed'
                );
                deferred.reject(errorObj);
            }
        })
        .spread(function(userObj, tkn) {
            var rightNow = new Date();
            var sessionObj = {
                'object_type': 'session',
                'token': tkn,
                'username': username,
                'user_id': userObj.id,
                'started_at': rightNow,
                'client_info': clientInfo,
                'last_touch': rightNow
            };
            return [tkn, userObj, dataAccess.saveEntity('session', sessionObj)];
        })
        .spread(function(tkn, userObj, newSess) {
            return [tkn, userObj, dataAccess.addRelationship(userObj, newSess, null)];
        })
        .spread(function(tkn, userObj, rel_res) {
            return [tkn, userObj, utilities.validateTokenAndContinue(req.headers[settings.data.token_header])];
        })
        .spread(function(tkn, userObj, validTokenRes) {
            var sess = null;
            if (validTokenRes.is_valid === true && validTokenRes.session.is_anonymous === true && validTokenRes.session.username === 'anonymous') {
                sess = validTokenRes.session;
                sess.username = username;
                return [tkn, userObj, true, dataAccess.saveEntity('session', sess)];
            }
            else {
                return [tkn, userObj, false];
            }
        })
        .spread(function(tkn, userObj, isNewAnonSess, sess) {
            if (isNewAnonSess) {
                return [tkn, userObj, dataAccess.addRelationship(userObj, sess)];
            }
            else {
                return [tkn, userObj];
            }
        })
        .spread(function(tkn, userObj) {
            var returnObj = {};
            returnObj[settings.data.token_header] = tkn;
            var uiKeys = Object.keys(userObj);
            for (var uiIdx = 0; uiIdx < uiKeys.length; uiIdx++) {
                returnObj[uiKeys[uiIdx]] = userObj[uiKeys[uiIdx]];
            }
            delete returnObj.password;
            delete returnObj.salt;
            delete returnObj.id;
            delete returnObj.object_type;
            delete returnObj.created_at;
            delete returnObj.updated_at;
            delete returnObj.forgot_password_tokens;
            delete returnObj.is_active;

            // ADD EVENT TO SESSION
            var resolveObj = returnObj;
            deferred.resolve(resolveObj);
        })
        .fail(function(err) {
            if (err !== undefined && err !== null && typeof (err.AddToError) == 'function') {
                err.setMessages('authentication failed', 'authentication failed');
                err.setStatus(401);
                deferred.reject(err.AddToError(__filename, 'signIn'))
            }
            else {
                var errorObj = new ErrorObj(401,
                    'a0028',
                    __filename,
                    'signIn',
                    'authentication failed',
                    'authentication failed',
                    err
                );
                deferred.reject(errorObj);
            }
        });
        

        deferred.promise.nodeify(callback);
        return deferred.promise;
    },
    signUp: function(req, callback) {
        var deferred = Q.defer();

        var username = req.body.username == null ? req.body.email.toLowerCase() : req.body.username.toLowerCase();
        var password = req.body.password;
        var first = req.body.first == null ? '' : req.body.first;
        var last = req.body.last == null ? '' : req.body.last;
        var roles = ['default-user'];
        var email = req.body.email;

        var validEmailRegex = /^(([^<>()\[\]\\.,;:\s@"]+(\.[^<>()\[\]\\.,;:\s@"]+)*)|(".+"))@((\[[0-9]{1,3}\.[0-9]{1,3}\.[0-9]{1,3}\.[0-9]{1,3}])|(([a-zA-Z\-0-9]+\.)+[a-zA-Z]{2,}))$/
        if (!validEmailRegex.test(email)) {
            var errorObj = new ErrorObj(500,
                'a0029',
                __filename,
                'signUp',
                'invalid email address'
            );
            deferred.reject(errorObj);
            deferred.promise.nodeify(callback);
            return deferred.promise;
        }

        utilities.validateEmail(email)
            .then(function() {
                return utilities.validateUsername(username);
            })
            .then(function() {
                var cryptoCall = Q.denodeify(crypto.randomBytes);
                return cryptoCall(48);
            })
            .then(function(buf) {
                var salt = buf.toString('hex');
                var saltedPassword = password + salt;
                var hashedPassword = crypto.createHash('sha256').update(saltedPassword).digest('hex');

                var userObj = {
                    'object_type': 'bsuser',
                    'account_type': 'native',
                    'username': username,
                    'first': first,
                    'last': last,
                    'email': email,
                    'salt': salt,
                    'password': hashedPassword,
                    'roles': roles,
                    'is_active': true,
                    'is_locked': false
                };
                return dataAccess.saveEntity('bsuser', userObj);
            })
            .then(function(userObj) {
                return [userObj, utilities.validateTokenAndContinue(req.headers[settings.data.token_header])];
            })
            .spread(function(userObj, validTokenRes) {
                var sess;
                if (validTokenRes.is_valid === true && validTokenRes.session.is_anonymous === true && validTokenRes.session.username === 'anonymous') {
                    sess = validTokenRes.session;
                    sess.username = username;
                    return [userObj, true, dataAccess.saveEntity('session', sess)];
                }
                else {
                    return [userObj, false];
                }
            })
            .spread(function(userObj, isNewAnonSess, sess) {
                if (isNewAnonSess) {
                    return [userObj, dataAccess.addRelationship(sess, userObj)];
                }
                else {
                    return [userObj];
                }
            })
            .spread(function(userObj) {
                delete userObj.password;
                delete userObj.salt;

                // ADD EVENT TO SESSION
                var resolveObj = userObj;
                deferred.resolve(resolveObj);
            })
            .fail(function(err) {
                if (err !== undefined && err !== null && typeof (err.AddToError) == 'function') {
                    deferred.reject(err.AddToError(__filename, 'signUp'));
                }
                else {
                    var errorObj = new ErrorObj(500,
                        'a0030',
                        __filename,
                        'signUp',
                        'error signing up',
                        'Error',
                        err
                    );
                    deferred.reject(errorObj);
                }
            });

        deferred.promise.nodeify(callback);
        return deferred.promise;
    },
    signOut: function(req, callback) {
        var deferred = Q.defer();

        var token = req.headers[settings.data.token_header];
        dataAccess.find('session', {'token':token})
        .then(function(sessions) {
          return Q.all(sessions.map((s) => {
            var inner_deferred = Q.defer();
            utilities.invalidateSession(s)
            .then(() => {
              inner_deferred.resolve();
            })
            .fail((inner_err) => {
              inner_deferred.reject(inner_err);
            })
            return inner_deferred.promise;
          }))
        })
        .then(function(invld_res) {
          deferred.resolve({success: true});
        })
        .fail(function(err) {
          deferred.reject(err.AddToError(__filename, 'signOut'));
        })

        deferred.promise.nodeify(callback);
        return deferred.promise;
    },
    forgotUsername: function(req, callback) {
        var deferred = Q.defer();

        dataAccess.find('bsuser', { email: req.body.email })
            .then(function(usersFound) {
                if (usersFound.length === 1) {
                    if (usersFound[0].is_locked) {
                        var errorObj = new ErrorObj(403,
                            'a2005',
                            __filename,
                            'forgotUsername',
                            'bsuser is locked',
                            'Unauthorized',
                            null
                        );
                        deferred.reject(errorObj);

                        deferred.promise.nodeify(callback);
                        return deferred.promise;
                    }
                    return utilities.sendMail(usersFound[0].email, 'Forgot Username?', null, '<h2>Your username is, ' + usersFound[0].username + '</h2>');
                }
                else {
                    var errorObj = new ErrorObj(500,
                        'a1058',
                        __filename,
                        'forgotUsername',
                        'More than one userfound with this email adress'
                    );
                    deferred.reject(errorObj);
                }

                deferred.promise.nodeify(callback);
                return deferred.promise;
            })
            .then(function(emailRes) {
                deferred.resolve();
            })
            .fail(function(err) {
                if (err !== undefined && err !== null && typeof (err.AddToError) == 'function') {
                    err.setMessages('Problem generating email and retrieving forgotten username');
                    deferred.reject(err.AddToError(__filename, 'forgotUsername'));
                }
                else {
                    var errorObj = new ErrorObj(400,
                        'a1054',
                        __filename,
                        'forgotUsername',
                        'error retrieving forgotten username',
                        'Problem generating email and retrieving forgotten username',
                        err
                    );
                    deferred.reject(errorObj);
                }
            });

        deferred.promise.nodeify(callback);
        return deferred.promise;
    },
    forgotPassword: function(req, callback) {
        var deferred = Q.defer();
        var args = req.body;
        var email = args.email;
        var username = args.username;

        var validArgs = false;
        if (username != null && username !== '') {
            validArgs = true;
        }
        else if (email != null && email !== '') {
            validArgs = true;
        }

        if (validArgs) {
            dataAccess.findUser(email, username)
                .then(function(userObj) {
                    if (userObj.is_locked) {
                        var errorObj = new ErrorObj(403,
                            'a2006',
                            __filename,
                            'forgotPassword',
                            'bsuser is locked',
                            'Unauthorized',
                            null
                        );
                        deferred.reject(errorObj);

                        deferred.promise.nodeify(callback);
                        return deferred.promise;
                    }
                    return [userObj, getToken()];
                })
                .spread(function(userObj, tkn) {
                    var reset_link = process.env.reset_password_link || "";
                    reset_link = (reset_link == "" || reset_link == "FILL_IN") ? "" : reset_link + '?token=';
                    var message = 'Reset password: ' + reset_link + tkn;
                    return [userObj, tkn, utilities.sendMail(userObj.email, 'Password Reset', message)];
                })
                .spread(function(userObj, tkn, mail_res) {
                    if (userObj.forgot_password_tokens === undefined || userObj.forgot_password_tokens === null) {
                        userObj.forgot_password_tokens = [tkn];
                    }
                    else {
                        userObj.forgot_password_tokens.push(tkn);
                    }
                    return [tkn, dataAccess.saveEntity('bsuser', userObj)];
                })
                .spread(function(tkn, save_res) {
                    // ADD EVENT TO SESSION
                    var resolveObj = { 'success': true };
                    deferred.resolve(resolveObj);
                })
                .fail(function(err) {
                    if (err !== undefined && err !== null && typeof (err.AddToError) == 'function') {
                        err.setMessages('error generating password reset link', 'Problem generating email and link to reset password');
                        deferred.reject(err.AddToError(__filename, 'forgotPassword'));
                    }
                    else {
                        var errorObj = new ErrorObj(500,
                            'a1032',
                            __filename,
                            'forgotPassword',
                            'error generating password reset link',
                            'Problem generating email and link to reset password',
                            err
                        );
                        deferred.reject(errorObj);
                    }
                });
        }
        else {
            var errorObj = new ErrorObj(400,
                'a0032',
                __filename,
                'forgotPassword',
                'must supply username or email associated with this bsuser'
            );
            deferred.reject(errorObj);
        }

        deferred.promise.nodeify(callback);
        return deferred.promise;
    },

    resetPassword: function(req, callback) {
        var deferred = Q.defer();
        var args = req.body;
        var tkn = args.token;
        var password = args.password;

        dataAccess.getUserByForgotPasswordToken(tkn)
            .then(function(userObjs) {
                if (userObjs !== undefined && userObjs !== null && userObjs.length > 0) {
                    var userObj = userObjs[0];
                    // IF USER IS LOCKED, BAIL OUT
                    if (userObj.is_locked) {
                        var errorObj = new ErrorObj(403,
                            'a2007',
                            __filename,
                            'resetPassword',
                            'bsuser is locked',
                            'Unauthorized',
                            null
                        );
                        deferred.reject(errorObj);

                        deferred.promise.nodeify(callback);
                        return deferred.promise;
                    }

                    var cryptoCall = Q.denodeify(crypto.randomBytes);
                    return [userObj, cryptoCall(48)];
                }
                else {
                    var errorObj = new ErrorObj(500,
                        'a0033',
                        __filename,
                        'resetPassword',
                        'token not found'
                    );
                    deferred.reject(errorObj);
                }

            })
            .spread(function(userObj, buf) {
                var salt = buf.toString('hex');
                var saltedPassword = password + salt;
                var hashedPassword = crypto.createHash('sha256').update(saltedPassword).digest('hex');
                userObj.password = hashedPassword;
                userObj.salt = salt;
                userObj.forgot_password_tokens = [];
                return dataAccess.saveEntity('bsuser', userObj);
            })
            .then(function() {
                var resolveObj = { 'success': true };
                deferred.resolve(resolveObj);
            })
            .fail(function(err) {
                if (err !== undefined && err !== null && typeof (err.AddToError) == 'function') {
                    err.setMessages('Problem reseting password');
                    deferred.reject(err.AddToError(__filename, 'resetPassword'));
                }
                else {
                    var errorObj = new ErrorObj(500,
                        'a1033',
                        __filename,
                        'resetPassword',
                        'error reseting password',
                        'Problem reseting password',
                        err
                    );
                    deferred.reject(errorObj);
                }
            });

        deferred.promise.nodeify(callback);
        return deferred.promise;
    },

    profile: function(req, callback) {
        var deferred = Q.defer();

        var token = req.headers[settings.data.token_header];
        var appendObj = req.body.userprofile;
        var userObj = req.this_user;
        var immutableKeys = ['object_type', 'username', 'salt', 'password', 'created_at', 'updated_at', 'roles', 'forgot_password_tokens', 'id', 'is_active'];
        var objKeys = Object.keys(appendObj);
        for (var idx = 0; idx < objKeys.length; idx++) {
            if (immutableKeys.indexOf(objKeys[idx]) === -1) {
                var k = objKeys[idx];
                var v = appendObj[k];
                userObj[k] = v;
            }
        }

        dataAccess.saveEntity('bsuser', userObj)
            .then(function() {
                // ADD EVENT TO SESSION
                var resolveObj = { 'profile': true };
                deferred.resolve(resolveObj);
            })
            .fail(function(err) {
                if (err !== undefined && err !== null && typeof (err.AddToError) == 'function') {
                    err.setMessages('error posting user profile', 'Problem setting your profile');
                    deferred.reject(err.AddToError(__filename, 'profile'));
                }
                else {
                    var errorObj = new ErrorObj(500,
                        'a1034',
                        __filename,
                        'profile',
                        'error posting user profile',
                        'Problem setting your profile',
                        err
                    );
                    deferred.reject(errorObj);
                }
            });

        deferred.promise.nodeify(callback);
        return deferred.promise;
    },

    profileImage: function(req, callback) {
        var deferred = Q.defer();

		deferred.resolve({});

        deferred.promise.nodeify(callback);
        return deferred.promise;
    },
    startAnonymousSession: function(req, callback) {
        var deferred = Q.defer();

        createAnonymousSession()
            .then(function(sess_res) {
                // ADD EVENT TO SESSION
                var resolveObj = sess_res;
                deferred.resolve(resolveObj);
            })
            .fail(function(err) {
                if (err !== undefined && err !== null && typeof (err.AddToError) === 'function') {
                    deferred.reject(err.AddToError(__filename, 'startAnonymousSession'));
                }
                else {
                    var errorObj = new ErrorObj(500,
                        'a1050',
                        __filename,
                        'startAnonymousSession',
                        'error starting anonymous session',
                        'Error starting anonymous session',
                        err);
                    deferred.reject(errorObj);
                }
            });

        deferred.promise.nodeify(callback);
        return deferred.promise;
    }
};

Accounts.prototype.patch = {
    password: function(req, callback) {
        var deferred = Q.defer();

        // TODO: validate password if possible

        var token = req.headers[settings.data.token_header];
        var existingUser = req.this_user;
        // GOT A USER, MAKE SURE THERE IS A STORED SALT
        var salt = existingUser.salt;
        if (salt === null) {
            var errorObj = new ErrorObj(500,
                'a0034',
                __filename,
                'bsuser',
                'error retrieving salt for this user'
            );
            deferred.reject(errorObj);
        }
        else {
            // SALT AND HASH PASSWORD
            var saltedPassword = req.body.password + existingUser.salt;
            var hashedPassword = crypto.createHash('sha256').update(saltedPassword).digest('hex');
            existingUser.password = hashedPassword;

            dataAccess.updateEntity('bsuser', existingUser)
            .then(function(updatedUser) {
                deferred.resolve();
            })
            .fail(function(err) {
                if (err !== undefined && err !== null && typeof (err.AddToError) === 'function') {
                    err.setMessages('error updating bsuser', 'Problem updating password');
                    deferred.reject(err.AddToError(__filename, 'PATCH password'));
                }
                else {
                    var errorObj = new ErrorObj(500,
                        'a0052',
                        __filename,
                        'password',
                        'error updating user password'
                    );
                    deferred.reject(errorObj);
                }
            });
        }

        deferred.promise.nodeify(callback);
        return deferred.promise;
    }
};

Accounts.prototype.put = {
    account: function(req, callback) {
        var deferred = Q.defer();

        var updateUser = req.body;

        var token = req.headers[settings.data.token_header];
        var existingUser = req.this_user;

        updateUser.id = existingUser.id;
        updateUser.object_type = 'bsuser';
        delete updateUser.is_active;
        delete updateUser.password;

        utilities.validateEmail(updateUser.email, existingUser.email)
            .then(function() {
                return utilities.validateUsername(updateUser.username, existingUser.username);
            })
            .then(function() {
                return dataAccess.updateEntity('bsuser', updateUser);
            })
            .then(function(update_res) {
                // ADD EVENT TO SESSION
                var resolveObj = update_res;
                deferred.resolve(resolveObj);
            })
            .fail(function(err) {
                if (err !== undefined && err !== null && typeof (err.AddToError) === 'function') {
                    deferred.reject(err.AddToError(__filename, 'PUT bsuser'));
                }
                else {
                    var errorObj = new ErrorObj(500,
                        'a00051',
                        __filename,
                        'bsuser',
                        'error updating bsuser',
                        'Error updating bsuser',
                        err
                    );
                    deferred.reject(errorObj);
                }
            });
        deferred.promise.nodeify(callback);
        return deferred.promise;
    }
};

Accounts.prototype.delete = {
    account: function(req, callback) {
        var deferred = Q.defer();

        var token = req.headers[settings.data.token_header];
        var existingUser = req.this_user;
        dataAccess.deleteEntity('bsuser', existingUser)
            .then(function() {
                deferred.resolve();
            })
            .fail(function(err) {
                if (err !== undefined && err !== null && typeof (err.AddToError) === 'function') {
                    err.setMessages('error deleting bsuser');
                    deferred.reject(err.AddToError(__filename, 'DELETE bsuser'));
                }
                else {
                    var errorObj = new ErrorObj(500,
                        'a00051',
                        __filename,
                        'bsuser',
                        'error deleting bsuser',
                        err
                    );
                    deferred.reject(errorObj);
                }
                deferred.reject();
            });
        deferred.promise.nodeify(callback);
        return deferred.promise;
    }
};


// =====================================================================================
// UTILITY FUNCTIONS
// =====================================================================================
function getToken(callback) {
    var deferred = Q.defer();

    dataAccess.findAll('session')
        .then(function(find_results) {
            var tokenIsGood = false;
            var token;
            while (!tokenIsGood) {
                token = crypto.randomBytes(48).toString('hex');

                var sessions = find_results.filter(function(inSysObj) {
                    return (inSysObj.object_type === 'session' && inSysObj.token === token);
                });

                if (sessions === null || sessions.length === 0) {
                    tokenIsGood = true;
                }
                else {
                    tokenIsGood = false;
                }
            }

            deferred.resolve(token);
        })
        .fail(function(err) {
            if (err !== undefined && err !== null && typeof (err.AddToError) == 'function') {
                if (err.message === 'no results found') {
                    var token = crypto.randomBytes(48).toString('hex');
                    deferred.resolve(token);
                }
                else {
                    deferred.reject(err.AddToError(__filename, 'getToken'));
                }
            }
            else {
                var errorObj = new ErrorObj(500,
                    'a1036',
                    __filename,
                    'getToken',
                    'error getting token',
                    'Error getting token',
                    err
                );
                deferred.reject(errorObj);
            }
        });

    deferred.promise.nodeify(callback);
    return deferred.promise;
}


function getUser(req, callback) {
    var deferred = Q.defer();
    var username = (typeof(req.body.username) == 'undefined' || req.body.username === null) ? req.body.email.toLowerCase() : req.body.username.toLowerCase();	

    dataAccess.getUserByUserName(username)
        .then(function(user) {
            deferred.resolve(user);
        })
        .fail(function(err) {
            if (err !== undefined && err !== null && typeof (err.AddToError) == 'function') {
                deferred.reject(err.AddToError(__filename, 'getUser'));
            }
            else {
                var errorObj = new ErrorObj(500,
                    'a2038',
                    __filename,
                    'getUser',
                    'error getting user',
                    'Error getting user',
                    err
                );
                deferred.reject(errorObj);
            }
        })

    deferred.promise.nodeify(callback);
    return deferred.promise;
}


function userExists(req, callback) {
    var deferred = Q.defer();

    getUser(req)
        .then(function() {
            deferred.resolve({ 'user_exists': true });
        })
        .fail(function(err) {
            if (err !== undefined && err !== null && typeof (err.AddToError) == 'function') {
                deferred.reject(err.AddToError(__filename, 'userExists'));
            }
            else {
                var errorObj = new ErrorObj(500,
                    'a1038',
                    __filename,
                    'userExists',
                    'error checking that user exists',
                    'Error checking that user exists',
                    err
                );
                deferred.reject(errorObj);
            }
        });

    deferred.promise.nodeify(callback);
    return deferred.promise;
}

function userDoesNotExist(req, callback) {
    var deferred = Q.defer();
    getUser(req)
        .then(function() {
            var errorObj = new ErrorObj(500,
                'a0036',
                __filename,
                'userDoesNotExist',
                'a user already exists with the information provided'
            );
            deferred.reject(errorObj);
        })
        .fail(function(err) {
            if (err !== undefined && err !== null && typeof (err.AddToError) == 'function') {
                if (err.message === 'no user found' || err.err_code === 'da2000') {
                    deferred.resolve({ 'user_not_exist': true });
                }
                else {
                    deferred.reject(err.AddToError(__filename, 'userDoesNotExist'));
                }
            }
            else {
                var errorObj = new ErrorObj(500,
                    'a1039',
                    __filename,
                    'userExists',
                    'error checking that user does not exist',
                    'Error checking that user does not exist',
                    err
                );
                deferred.reject(errorObj);
            }
        });

    deferred.promise.nodeify(callback);
    return deferred.promise;
}

function createSession(userObj, clientInfo) {
	var deferred = Q.defer();

	getToken()
	.then(function(tkn) {
		return [tkn, dataAccess.startTransaction()]
	})
	.spread(function(tkn, client) {
		var rightNow = new Date();
		var sessionObj = {
			'object_type': 'session',
			'is_anonymous': false,
      'token': tkn,
      'username': userObj.username,
			'user_id': userObj.id,
			'started_at': rightNow,
			'client_info': clientInfo,
			'last_touch': rightNow
		};
		return [client, dataAccess.t_saveEntity(client, 'session', sessionObj)];
	})
	.spread(function(client, save_res) {
		return [client, save_res.token, dataAccess.t_addRelationship(client, userObj, save_res, null)];
	})
	.spread(function(client, tkn, rel_res) {
		return [tkn, dataAccess.commitTransaction(client)];
	})
	.spread(function(tkn, commit_res) {
		var returnObj = {};
		returnObj[settings.data.token_header] = tkn;
		var uiKeys = Object.keys(userObj);
		for(var uiIdx = 0; uiIdx < uiKeys.length; uiIdx++) {
			returnObj[uiKeys[uiIdx]] = userObj[uiKeys[uiIdx]];
		}
		delete returnObj.password;
		delete returnObj.salt;
		delete returnObj.forgot_password_tokens;

		deferred.resolve(returnObj);
	})
	.fail(function(err) {
		if(err !== undefined && err !== null && typeof(err.AddToError) == 'function') {
			deferred.reject(err.AddToError(__filename, 'createSession'));
		}
		else {
			var errorObj = new ErrorObj(500,
									'a1040',
									__filename,
									'createSession',
									'error creating session',
									'Error creating session',
									err
									);
			deferred.reject(errorObj);
		}
	});

	return deferred.promise;
}

function createAnonymousSession(clientInfo) {
	var deferred = Q.defer();

	getToken()
	.then(function(tkn) {
		return [tkn, dataAccess.startTransaction()]
	})
	.spread(function(tkn, client) {
		var rightNow = new Date();
		var sessionObj = {
			'object_type': 'session',
			'is_anonymous': true,
			'token': tkn,
			'username': 'anonymous',
			'started_at': rightNow,
			'client_info': clientInfo,
			'last_touch': rightNow
		};
		return [client, dataAccess.t_saveEntity(client, 'session', sessionObj)];
	})
	.spread(function(client, save_res) {
		return [save_res, dataAccess.commitTransaction(client)];
	})
	.spread(function(save_res, commit_res) {
		deferred.resolve(save_res);
	})
	.fail(function(err) {
		if(err !== undefined && err !== null && typeof(err.AddToError) == 'function') {
			deferred.reject(err.AddToError(__filename, 'createAnonymousSession'));
		}
		else {
			var errorObj = new ErrorObj(500,
										'a1041',
										__filename,
										'createAnonymousSession',
										'error creating anonymous session',
										'Error creating anonymous session',
										err
										);
			deferred.reject(errorObj);
		}
	});

	return deferred.promise;
}

function createTwitterAuthHeader(verb, url, params, token, token_secret) {
	var deferred = Q.defer();

	if(token_secret === undefined || token_secret === null) {
		token_secret = '';
	}

	// CREATE THE SIGNATURE
	var nonce = crypto.randomBytes(32).toString('hex');
	var timestamp = Math.floor(new Date().getTime()/1000);
	var paramString = '';
	if(params === undefined || params === null) {
		params = {};
	}

	// ADD ALL REQUIRED & OPTIONAL PARAMETERS TO THE PARAMS OBJECT
	params.oauth_consumer_key = settings.data.oauth.twitter.consumer_key;
	params.oauth_nonce = nonce;
	params.oauth_signature_method = 'HMAC-SHA1';
	params.oauth_timestamp = timestamp;
	if(token !== null && token !== undefined && token !== '') {
		params.oauth_token = token;
	}
	params.oauth_version = '1.0';

	// SORT THE KEYS LEXIGRAPHICALLY & ADD THEM TO THE PARAMSTRING
	var paramKeys = Object.keys(params).sort();
	for(var pIdx = 0; pIdx < paramKeys.length; pIdx++) {
		paramString += encodeURIComponent(paramKeys[pIdx])+'='+encodeURIComponent(params[paramKeys[pIdx]]);
		if(pIdx < paramKeys.length-1) {
			paramString += '&';
		}
	}

	verb = verb.toUpperCase();
	var signatureBase = verb+'&'+
		encodeURIComponent(url)+'&'+
		encodeURIComponent(paramString);
	var signingKey = encodeURIComponent(settings.data.oauth.twitter.consumer_secret)+'&'+encodeURIComponent(token_secret);
	var hmac = crypto.createHmac('sha1', signingKey);
	hmac.setEncoding('base64');
	hmac.write(signatureBase);
	hmac.end();
	var signature = hmac.read();


	// CREATE THE OAUTH HEADER
	var authHeader = 'OAuth '+encodeURIComponent('oauth_consumer_key')+'="'+encodeURIComponent(settings.data.oauth.twitter.consumer_key)+'",'+
		encodeURIComponent('oauth_nonce')+'="'+encodeURIComponent(nonce)+'",'+
		encodeURIComponent('oauth_signature_method')+'="'+encodeURIComponent('HMAC-SHA1')+'",'+
		encodeURIComponent('oauth_timestamp')+'="'+encodeURIComponent(timestamp)+'",';
	if(token !== null && token !== undefined && token !== '') {
		authHeader += encodeURIComponent('oauth_token')+'="'+encodeURIComponent(token)+'",';
	}
	authHeader += encodeURIComponent('oauth_version')+'="'+encodeURIComponent('1.0')+'",'+
		encodeURIComponent('oauth_signature')+'="'+encodeURIComponent(signature)+'"';

	deferred.resolve(authHeader);
	return deferred.promise;
}

function splitParams(paramString) {
	var kvpairs = paramString.split('&');
	var params = {};
	for(var kvIdx = 0; kvIdx < kvpairs.length; kvIdx++) {
		var pair = kvpairs[kvIdx].split('=');
		params[pair[0]] = pair[1];
	}

	return params;
}

exports.accounts = Accounts;