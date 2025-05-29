// ===============================================================================
// ACCOUNTS WEB SERVICE CALLS v1.0.0
// ===============================================================================
const util = require('util');
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
      signIn: this.#signIn.bind(this),
      signUp: this.#signUp.bind(this),
      apiUser: this.#apiUser.bind(this),
      externalUser: this.#externalUser.bind(this),
      apiCredentials: this.#apiCredentials.bind(this),
      signOut: this.#signOut.bind(this),
      forgotUsername: this.#forgotUsername.bind(this),
      forgotPassword: this.#forgotPassword.bind(this),
      resetPassword: this.#resetPassword.bind(this),
      session: this.#startAnonymousSession.bind(this)
    };
    this.patch = {
      password: this.#updatePassword.bind(this)
    };
    this.put = {
      email: this.#updateEmail.bind(this)
    };
    this.delete = {
      account: this.#deleteUser.bind(this),
      apiCredentials: this.#deleteApiCredentials.bind(this)
    };
  }

  #checkToken(req) {
     // AUTH HAS ALREADY BEEN CHECKED, THIS TOKEN IS VALID
     return Promise.resolve({success: true});
  }

  #signIn(req) {
    return new Promise((resolve, reject) => {
      var body = req.body;

      var apiToken = req.headers[this.settings.token_header] || null;
      this.accessControl.signIn(body, apiToken)
      .then((res) => {
        resolve(res);
      })
      .catch((err) => {
        let errorObj;
        try {
          errorObj = err.AddToError(__filename, 'signIn');
        }
        catch(e) {
          errorObj = new ErrorObj(500,
                                  '',
                                  __filename,
                                  'signIn',
                                  'internal error',
                                  'There was a problem with your request.',
                                  err);
          console.error(e);
        }
        reject(errorObj);
      })
    });
  }

  #signUp(req) {
    return new Promise((resolve, reject) => {
      if(this.settings.allow_signup === true) {
        var apiToken = req.headers[this.settings.token_header] || null;
        // ONLY INITIALIZE A USER WITH 'default-user' ROLE
        if(req.body.roles) req.body.roles = null;

        // CREATE THE USER
        this.accessControl.createUser('standard', req.body, apiToken)
        .then((usr) => {
          resolve(usr);
        })
        .catch((err) => {
          typeof(err.AddToError) === 'function' ?
            reject(err.AddToError(__filename, 'signUp'))
          :
            reject(new ErrorObj(500,
                                        'a0100',
                                        __filename,
                                        'signUp',
                                        'create user error',
                                        'There was a problem creating an account.',
                                        err
                                        ));
        });
      }
      else {
        reject(new ErrorObj(401,
                            'a0101',
                            __filename,
                            'signUp',
                            'no public signup',
                            'Public signup is not allowed.',
                            null));
      }
    });
  }

  #apiUser(req) {
    return new Promise((resolve, reject) => {
      if(this.settings.allow_api_signup === true) {
        // apiUser CAN ONLY INITIALIZE A USER WITH 'default-user' ROLE
        if(req.body.roles) req.body.roles = null;

        // CREATE THE USER
        this.accessControl.createUser('api', req.body)
        .then((usr) => {
          resolve(usr);
        })
        .catch((err) => {
          typeof(err.AddToError) === 'function' ?
            reject(err.AddToError(__filename, 'apiUser'))
          :
            reject(new ErrorObj(500,
                                'a0110',
                                __filename,
                                'apiUser',
                                'create user error',
                                'There was a problem creating an account.',
                                err
                                ));
        });
      }
      else {
        reject(new ErrorObj(401,
                            'a0111',
                            __filename,
                            'apiUser',
                            'no public api signup',
                            'Public signup for api users is not allowed.',
                            null));
      }
    });
  }

  #apiCredentials(req) {
    return new Promise((resolve, reject) => {
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
      this.accessControl.createUser('api', req.body, null, req.this_user)
      .then((usr) => {
        resolve(usr);
      })
      .catch((err) => {
        typeof(err.AddToError) === 'function' ?
          reject(err.AddToError(__filename, 'apiCredentials'))
        :
          reject(new ErrorObj(500,
                              'a0120',
                              __filename,
                              'apiCredentials',
                              'create user error',
                              'There was a problem creating an account.',
                              err
                              ));
      });
    });
  }

  #externalUser(req) {
    return new Promise((resolve, reject) => {
      if(this.settings.allow_external_signup === true) {
        // ONLY INITIALIZE A USER WITH 'default-user' ROLE
        if(req.body.roles) req.body.roles = null;

        // CREATE THE USER
        this.accessControl.createUser('external-api', req.body)
        .then((usr) => {
          resolve(usr);
        })
        .catch((err) => {
          typeof(err.AddToError) === 'function' ?
            reject(err.AddToError(__filename, 'externalUser'))
          :
            reject(new ErrorObj(500,
                                        'a0130',
                                        __filename,
                                        'externalUser',
                                        'create external user error',
                                        'There was a problem creating an account.',
                                        err
                                        ));
        });
      }
      else {
        reject(new ErrorObj(401,
                            'a0101',
                            __filename,
                            'signUp',
                            'no public external signup',
                            'Public signup of external accounts is not allowed.',
                            null));
      }
    });
  }

  #signOut(req) {
    return new Promise((resolve, reject) => {
      var token = req.headers[this.settings.token_header];
    
      this.dataAccess.getSession(null, token)
      .then((session) => {
        return this.utilities.invalidateSession(session);
      })
      .then((invld_res) => {
        resolve({success: true});
      })
      .catch((err) => {
        reject(err.AddToError(__filename, 'signOut'));
      });
    });
  }

  #forgotUsername(req) {
    return new Promise((resolve, reject) => {
      this.dataAccess.getUserByEmail(req.body.email)
      .then((user) => {
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
                  reject(errorObj);
                  return;
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
              reject(errorObj);
              return;
          }
      })
      .then((emailRes) => {
          resolve({success:true});
      })
      .catch((err) => {
          if (err !== undefined && err !== null && typeof (err.AddToError) == 'function') {
              err.setMessages('Problem generating email and retrieving forgotten username');
              reject(err.AddToError(__filename, 'forgotUsername'));
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
              reject(errorObj);
          }
      });
    });
  }

  #forgotPassword(req) {
    return new Promise((resolve, reject) => {
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
          this.accessControl.forgotPassword(email, username)
          .then((fpwRes) => {
            if(fpwRes != null) {
              let userObj = fpwRes.user;
              let tkn = fpwRes.token;

              var reset_link = process.env.reset_password_link || "";
              reset_link = (reset_link == "" || reset_link == "FILL_IN") ? tkn : reset_link + '?token=' + tkn;

              // IF WE HAVE A TEMPLATE SPECIFIED IN THE ENV VARS
              // USE THAT.  OTHERWISE, JUST SEND OFF THE LINK/TOKEN
              if(process.env.reset_password_email) {
                return this.utilities.sendMailTemplate(userObj.email, 'Password Reset', process.env.reset_password_email, {resetLink: reset_link});
              }
              else {
                var message = 'Reset password: ' + reset_link;
                return this.utilities.sendMail(userObj.email, 'Password Reset', message);
              }
            }
            else {
              var resolveObj = { 
                            'success': true,
                            'uExists': false
                        };
              resolve(resolveObj);
              return;
            }
          })
          .then((mailRes) => {
            resolve({'success': true});
          })
          .catch((err) => {
            var errorObj = new ErrorObj(500,
                'a1031',
                __filename,
                'forgotPassword',
                'error generating password reset link',
                'Problem generating email and link to reset password',
                err
            );
            reject(errorObj);
          });
      }
      else {
          let errorObj = new ErrorObj(400,
              'a0032',
              __filename,
              'forgotPassword',
              'must supply username or email associated with this bs3 user'
          );
          reject(errorObj);
      }
    });
  }

  #resetPassword(req) {
    return new Promise((resolve, reject) => {
      var args = req.body;
      var tkn = args.token;
      var password = args.password;

      this.dataAccess.getUserByForgotPasswordToken(tkn)
      .then((userObj) => {
        if (userObj != null) {
            // IF USER IS LOCKED, BAIL OUT
            if (userObj.locked) {
                var errorObj = new ErrorObj(403,
                    'a2007',
                    __filename,
                    'resetPassword',
                    'bsuser is locked',
                    'Unauthorized',
                    null
                );
                reject(errorObj);
                return;
            }

            var cryptoCall = util.promisify(crypto.randomBytes);
            return Promise.all([userObj, cryptoCall(48)]);
        }
        else {
            var errorObj = new ErrorObj(500,
                'a0033',
                __filename,
                'resetPassword',
                'token not found'
            );
            reject(errorObj);
        }
      })
      .then(([userObj, buf]) => {
          var salt = buf.toString('hex');
          var saltedPassword = password + salt;
          var hashedPassword = crypto.createHash('sha256').update(saltedPassword).digest('hex');
          return this.dataAccess.updateCredentialsForUser(userObj.id, salt, hashedPassword, null);
      })
      .then(() => {
          resolve({success:true});
      })
      .catch((err) => {
          if (err !== undefined && err !== null && typeof (err.AddToError) == 'function') {
              err.setMessages('Problem reseting password');
              reject(err.AddToError(__filename, 'resetPassword'));
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
              reject(errorObj);
          }
      });
    });
  }

  #startAnonymousSession(req) {
    return new Promise((resolve, reject) => {
      // ACCESS CONTROL'S startSession() CREATES AN ANONYMOUS SESSION IF
      // YOU DO NOT PASS IT A USER OBJECT AS THE FIRST ARGUMENT
      this.accessControl.startSession()
      .then((sess_res) => {
          // ADD EVENT TO SESSION
          var resolveObj = sess_res;
          resolveObj[this.settings.token_header] = sess_res.token;
          delete resolveObj.token;
          resolve(resolveObj);
      })
      .catch((err) => {
          if (err !== undefined && err !== null && typeof (err.AddToError) === 'function') {
            reject(err.AddToError(__filename, 'startAnonymousSession'));
          }
          else {
            var errorObj = new ErrorObj(500,
                'a1050',
                __filename,
                'startAnonymousSession',
                'error starting anonymous session',
                'Error starting anonymous session',
                err);
            reject(errorObj);
          }
      });
    });
  }

  #updatePassword(req) {
    return new Promise((resolve, reject) => {
      // TODO: validate password if possible

      // GET SALT
      var cryptoCall = util.promisify(crypto.randomBytes);
      cryptoCall(48)
      .then((saltBuf) => {
        let salt = saltBuf.toString('hex');
        // SALT AND HASH PASSWORD
        var saltedPassword = req.body.password + salt;
        var hashedPassword = crypto.createHash('sha256').update(saltedPassword).digest('hex');

        return this.dataAccess.updateCredentialsForUser(req.this_user.id, salt, hashedPassword);
      })
      .then((updatedUser) => {
        resolve({success: true});
      })
      .catch((err) => {
        if (err !== undefined && err !== null && typeof (err.AddToError) === 'function') {
            err.setMessages('error updating bsuser', 'Problem updating password');
            reject(err.AddToError(__filename, 'PATCH password'));
        }
        else {
            let errorObj = new ErrorObj(500,
                'a0052',
                __filename,
                'password',
                'error updating user password'
            );
            reject(errorObj);
        }
      });
    });
  }

  #updateEmail(req) {
    return new Promise((resolve, reject) => {
      var updateUser = req.body;
      var existingUser = req.this_user;

      this.utilities.validateEmail(updateUser.email, existingUser.email)
      .then(() => {
          return this.utilities.validateUsername(updateUser.email, existingUser.username);
      })
      .then(() => {
        return this.dataAccess.updateUserInfo(existingUser.id, null, null, updateUser.email);
      })
      .then((updateRes) => {
          if(updateRes) {
            resolve(updateRes);
          }
          else {
            resolve(null);
          }
      })
      .catch((err) => {
          if (err !== undefined && err !== null && typeof (err.AddToError) === 'function') {
              reject(err.AddToError(__filename, 'PUT bsuser'));
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
              reject(errorObj);
          }
      });
    });
  }

  #deleteUser(req) {
    return new Promise((resolve, reject) => {
      this.dataAccess.deleteUser(req.this_user.id)
      .then(() => {
          resolve({success:true});
      })
      .catch((err) => {
          if (err !== undefined && err !== null && typeof (err.AddToError) === 'function') {
              err.setMessages('error deleting bsuser');
              reject(err.AddToError(__filename, 'DELETE bsuser'));
          }
          else {
              var errorObj = new ErrorObj(500,
                  'a00051',
                  __filename,
                  'bsuser',
                  'error deleting bsuser',
                  err
              );
              reject(errorObj);
          }
      });
    });
  }

  #deleteApiCredentials(req) {
    return new Promise((resolve, reject) => {
      this.dataAccess.deleteCredentialsByClientId(req.body.client_id)
      .then((res) => {
        resolve(res);
      })
      .catch((err) => {
        reject(err.AddToError(__filename, 'deleteApiCredentials'));
      })
    });
  }
}

module.exports = Accounts;