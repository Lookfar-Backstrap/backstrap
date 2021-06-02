// ===============================================================================
// ACCOUNTS WEB SERVICE CALLS v1.0.0
// ===============================================================================
var dataAccess;
var utilities;
var accessControl;
var serviceRegistration;
var settings;

var Q = require('q');
var crypto = require('crypto');
const e = require('express');

var Accounts = function(db, utils, ac, sr, st) {
    dataAccess = db;
    utilities = utils;
    accessControl = ac;
    serviceRegistration = sr;
    settings = st;
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

        var userObj = req.this_user;
        delete userObj.id;
        delete userObj.password;
        delete userObj.salt;
        delete userObj.client_secret;
        delete userObj.object_type;
        delete userObj.created_at;
        delete userObj.updated_at;
        delete userObj.roles;
        delete userObj.forgot_password_tokens;
        delete userObj.is_active;

        deferred.resolve(userObj);
        
        deferred.promise.nodeify(callback);
        return deferred.promise;
    }
};

Accounts.prototype.post = {
    signIn: function(req, callback) {
        var deferred = Q.defer();
        var body = req.body;

        var apiToken = req.headers[settings.data.token_header] || null;
        accessControl.signIn(body, apiToken)
        .then((res) => {
          deferred.resolve(res);
        })
        .fail((err) => {
          deferred.reject(err.AddToError(__filename, 'signIn'));
        })
        
        deferred.promise.nodeify(callback);
        return deferred.promise;
    },
    signUp: function(req, callback) {
        var deferred = Q.defer();

        var apiToken = req.headers[settings.data.token_header] || null;
        // ONLY INITIALIZE A USER WITH 'default-user' ROLE
        if(req.body.roles) req.body.roles = null;

        // CREATE THE USER
        accessControl.createUser('standard', req.body, apiToken)
        .then((usr) => {
          delete usr.password;
          delete usr.salt;
          delete usr.client_secret;
          delete usr.forgot_password_tokens;
          delete usr.object_type;
          deferred.resolve(usr);
        })
        .fail((err) => {
          typeof(err.AddToError) === 'function' ?
            deferred.reject(err.AddToError(__filename, 'signUp'))
          :
            deferred.reject(new ErrorObj(500,
                                        'a0100',
                                        __filename,
                                        'signUp',
                                        'create user error',
                                        'There was a problem creating an account.  Please try again.',
                                        err
                                        ));
        });

        deferred.promise.nodeify(callback);
        return deferred.promise;
    },
    // CREATE A NEW API USER WITH CLIENT ID & CLIENT SECRET
    apiUser: function(req, callback) {
      var deferred = Q.defer();

      // apiUser CAN ONLY INITIALIZE A USER WITH 'default-user' ROLE
      if(req.body.roles) req.body.roles = null;

      // CREATE THE USER
      accessControl.createUser('api', req.body)
      .then((usr) => {
        delete usr.password;
        delete usr.salt;
        delete usr.forgot_password_tokens;
        delete usr.object_type;
        deferred.resolve(usr);
      })
      .fail((err) => {
        typeof(err.AddToError) === 'function' ?
          deferred.reject(err.AddToError(__filename, 'apiUser'))
        :
          deferred.reject(new ErrorObj(500,
                                      'a0102',
                                      __filename,
                                      'signUp',
                                      'create user error',
                                      'There was a problem creating an account.  Please try again.',
                                      err
                                      ));
      });

      deferred.promise.nodeify(callback);
      return deferred.promise;
    },
    // CREATE API CREDENTIALS (CLIENT ID & CLIENT SECRET) FOR
    // AN EXISTING USER
    apiCredentials: function(req, callback) {
      var deferred = Q.defer();

      if(req.body.roles) {
        let validRoles = [];
        req.body.roles.forEach((role) => {
          if(req.this_user.roles.includes(role) || role === 'default-user') {
            validRoles.push(role);
          }
        });
        if(validRoles.length === 0) validRoles = ['default-user'];
        req.body.roles = validRoles;
      }
      accessControl.createUser('api', req.body, null, req.this_user)
      .then((usr) => {
        delete usr.password;
        delete usr.salt;
        delete usr.forgot_password_tokens;
        delete usr.object_type;
        deferred.resolve(usr);
      })
      .fail((err) => {
        typeof(err.AddToError) === 'function' ?
          deferred.reject(err.AddToError(__filename, 'apiCredentials'))
        :
          deferred.reject(new ErrorObj(500,
                                      'a0102',
                                      __filename,
                                      'apiCredentials',
                                      'create user error',
                                      'There was a problem creating an account.  Please try again.',
                                      err
                                      ));
      });

      deferred.promise.nodeify(callback);
      return deferred.promise;
    },
    signOut: function(req, callback) {
        var deferred = Q.defer();

        var token = req.headers[settings.data.token_header];
        dataAccess.getSession(null, token)
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

      dataAccess.getUserByEmail(req.body.email)
      .then(function(user) {
          if (user != null) {
              if (user.is_locked) {
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
              return utilities.sendMail(user.email, 'Forgot Username?', null, '<h2>Your username is, ' + user.username + '</h2>');
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
            dataAccess.findUser(null, username, email)
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
              return [userObj, utilities.getHash(null, null, 48)];
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
                return [tkn, dataAccess.updateJsonbField('bsuser', 'data', userObj, `data->>'id' = '${userObj.id}'`)];
            })
            .spread(function(tkn, save_res) {
                // ADD EVENT TO SESSION
                var resolveObj = { 'success': true };
                deferred.resolve(resolveObj);
            })
            .fail(function(err) {
                if(err != null && err.err_code == 'da0200'){
                    var resolveObj = { 
                        'success': true,
                        'uExists': false
                    };
                    deferred.resolve(resolveObj);
                }
                else if (err != null && typeof (err.AddToError) == 'function') {
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
        .then(function(userObj) {
          if (userObj != null) {
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
            return dataAccess.updateJsonbField('bsuser', 'data', userObj, `data->>'id' = '${userObj.id}'`);
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

        var appendObj = req.body.userprofile;
        var userObj = req.this_user;
        var immutableKeys = ['object_type', 'username', 'salt', 'password', 'created_at', 'updated_at', 'roles', 'forgot_password_tokens', 'id', 'is_active', 'email'];
        var objKeys = Object.keys(appendObj);
        for (var idx = 0; idx < objKeys.length; idx++) {
            if (immutableKeys.indexOf(objKeys[idx]) === -1) {
                var k = objKeys[idx];
                var v = appendObj[k];
                userObj[k] = v;
            }
        }

        dataAccess.updateJsonbField('bsuser', 'data', userObj, `data->>'id' = '${userObj.id}'`)
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
    startAnonymousSession: function(req, callback) {
        var deferred = Q.defer();

            // ACCESS CONTROL'S startSession() CREATES AN ANONYMOUS SESSION IF
            // YOU DO NOT PASS IT A USER OBJECT AS THE FIRST ARGUMENT
            accessControl.startSession()
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

          dataAccess.updateJsonbField('bsuser', 'data', {password: hashedPassword}, `data->>'id' = '${existingUser.id}'`)
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
    email: function(req, callback) {
        var deferred = Q.defer();

        var updateUser = req.body;
        var existingUser = req.this_user;
        updateUser.id = existingUser.id;
        delete updateUser.is_active;
        delete updateUser.password;

        utilities.validateEmail(updateUser.email, existingUser.email)
        .then(function() {
            return utilities.validateUsername(updateUser.email, existingUser.username);
        })
        .then(function() {
            return dataAccess.updateJsonbField('bsuser', 'data', updateUser, `data->>'id' = '${updateUser.id}'`);
        })
        .then(function(update_res) {
            if(update_res) {
              deferred.resolve(update_res[0].data);
            }
            else {
              deferred.resolve(null);
            }
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

        dataAccess.deleteUser(req.this_user.id)
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

exports.accounts = Accounts;