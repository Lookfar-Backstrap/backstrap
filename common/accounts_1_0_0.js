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

class Accounts {
  constructor(db, utils, ac, sr, st) {
    this.dataAccess = db;
    this.utilities = utils;
    this.accessControl = ac;
    this.serviceRegistration = sr;
    this.settings = st;

    this.get = {
      checkToken: this.#checkToken
    };
    this.post = {
      signIn: this.#signIn,
      signUp: this.#signUp,
      apiUser: this.#apiUser,
      apiCredentials: this.#apiCredentials,
      signOut: this.#signOut,
      forgotUsername: this.#forgotUsername,
      forgotPassword: this.#forgotPassword,
      resetPassword: this.#resetPassword,
      startAnonymousSession: this.#startAnonymousSession
    };
    this.patch = {
      password: this.#updatePassword
    };
    this.put = {};
    this.delete = {
      account: this.#deleteUser
    };
  }

  #checkToken(req, callback) {
     // AUTH HAS ALREADY BEEN CHECKED, THIS TOKEN IS VALID
     var deferred = Q.defer();
      
     deferred.resolve({'success': true});

     deferred.promise.nodeify(callback);
     return deferred.promise;
  }

  #signIn(req, callback) {
    var deferred = Q.defer();
    var body = req.body;

    var apiToken = req.headers[settings.token_header] || null;
    accessControl.signIn(body, apiToken)
    .then((res) => {
      deferred.resolve(res);
    })
    .fail((err) => {
      deferred.reject(err.AddToError(__filename, 'signIn'));
    })
    
    deferred.promise.nodeify(callback);
    return deferred.promise;
  }

  #signUp(req, callback) {
    var deferred = Q.defer();

    var apiToken = req.headers[settings.token_header] || null;
    // ONLY INITIALIZE A USER WITH 'default-user' ROLE
    if(req.body.roles) req.body.roles = null;

    // CREATE THE USER
    accessControl.createUser('standard', req.body, apiToken)
    .then((usr) => {
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
  }

  #apiUser(req, callback) {
    var deferred = Q.defer();

    // apiUser CAN ONLY INITIALIZE A USER WITH 'default-user' ROLE
    if(req.body.roles) req.body.roles = null;

    // CREATE THE USER
    accessControl.createUser('api', req.body)
    .then((usr) => {
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
  }

  #apiCredentials(req, callback) {
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
  }

  #signOut(req, callback) {
    var deferred = Q.defer();

    var token = req.headers[settings.token_header];
    
    dataAccess.getSession(null, token)
    .then(function(session) {
      return utilities.invalidateSession(session);
    })
    .then(function(invld_res) {
      deferred.resolve({success: true});
    })
    .fail(function(err) {
      deferred.reject(err.AddToError(__filename, 'signOut'));
    })

    deferred.promise.nodeify(callback);
    return deferred.promise;
  }

  #forgotUsername(req, callback) {
    var deferred = Q.defer();

    this.dataAccess.getUserByEmail(req.body.email)
    .then(function(user) {
        if (user != null) {
            if (user.locked) {
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
            return this.utilities.sendMail(user.email, 'Forgot Username?', null, '<h2>Your username is, ' + user.username + '</h2>');
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
  }

  #forgotPassword(req, callback) {
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
        this.dataAccess.findUser(null, username, email)
        .then(function(userObj) {
          if (userObj.locked) {
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
            return [userObj, tkn, this.utilities.sendMail(userObj.email, 'Password Reset', message)];
        })
        .spread(function(userObj, tkn, mail_res) {
          return dataAccess.updateCredentialsForUser(userObj.id, null, null, null, tkn);
        })
        .then(function(saveRes) {
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
  }

  #resetPassword(req, callback) {
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
        return dataAccess.updateCredentialsForUser(userObj.id, salt, hashedPassword, null, 'RESET');
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
  }

  #startAnonymousSession(req, callback) {
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

  #updatePassword(req, callback) {
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

          dataAccess.updateCredentialsForUser(existingUser.id, null, hashedPassword)
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

  #updateEmail(req, callback) {
    // **************
    // HERE HERE HERE
    // **************
  }

  #deleteUser(req, callback) {
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
}

// **************
// HERE HERE HERE
// **************
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

module.exports = Accounts;