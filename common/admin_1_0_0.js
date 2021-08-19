const util = require('util');
const crypto = require('crypto');

class Admin {
  constructor(da, utils, ac, sr, st) {
    this.dataAccess = da;
    this.utilities = utils;
    this.accessControl = ac;
    this.serviceRegistration = sr;
    this.settings = st;

    this.get = {
      user: this.#getUser.bind(this),
      userRole: this.#getUserRole.bind(this)
    };
    this.post = {
      user: this.#createUser.bind(this),
      userRole: this.#addUserRole.bind(this)
    };
    this.patch = {
      user: this.#updateUser.bind(this)
    };
    this.put = {};
    this.delete = {
      user: this.#deleteUser.bind(this),
      userRole: this.#deleteUserRole.bind(this)
    };
  }

  #getUser(req, callback) {
    return new Promise((resolve, reject) => {
      var searchObj = {};
      if (req.query.username !== undefined && req.query.username !== null) {
        searchObj.username = req.query.username.toLowerCase();
      }
      if (req.query.id !== undefined && req.query.id !== null) {
        searchObj.id = req.query.id;
      }
      if (req.query.email !== undefined && req.query.email !== null) {
        searchObj.email = req.query.email.toLowerCase();
      }

      // IF THIS NO AGRUMENTS WERE SUPPLIED, GET ALL USERS
      let getUserCmd = null;
      if(searchObj.username || searchObj.id || searchObj.email) {
        getUserCmd = this.dataAccess.findUser(searchObj.id, searchObj.username, searchObj.email);
      }
      else {
        getUserCmd = this.dataAccess.getAllUsers();
      }

      getUserCmd
      .then((findRes) => {
        let userObjs = [];
        if(!Array.isArray(findRes)) {
          userObjs.push(findRes);
        }
        else {
          userObjs = findRes;
        }

        var formattedUserObjs = [];
        for (var uIdx = 0; uIdx < userObjs.length; uIdx++) {
          var userObj = userObjs[uIdx];
          delete userObj.password;
          delete userObj.salt;
          formattedUserObjs.push(userObj);
        }

        resolve(formattedUserObjs);
      })
      .catch((err) => {
        if (err !== undefined && err !== null && typeof (err.AddToError) == 'function') {
          err.setMessages('error getting user', 'Problem fetching users');
          reject(err.AddToError(__filename, 'user'));
        }
        else {
          var errorObj = new ErrorObj(500,
            'ad0001',
            __filename,
            'user',
            'error getting user',
            'Error getting user',
            err
          );
          reject(errorObj);
        }
      });
    });
	}

  #getUserRole(req, callback) {
    return new Promise((resolve, reject) => {
      var uid = req.query.id || null;
      var username = req.query.username ? req.query.username.toLowerCase() : null;
      var email = req.query.email ? req.query.email.toLowerCase() : null;

      this.dataAccess.findUser(uid, username, email)
      .then((userObjs) => {
        if(userObjs.length === 1) {
          resolve({'roles': userObjs[0].roles});
        }
        else if(userObjs.length > 1) {
          let errorObj = new ErrorObj(404,
                                      'ad0012',
                                      __filename,
                                      'userRole',
                                      'no user found',
                                      'Error getting user',
                                      null
                                    );
          reject(errorObj);
        }
        else {
          let errorObj = new ErrorObj(404,
                                      'ad0013',
                                      __filename,
                                      'userRole',
                                      'multiple users found',
                                      'Error getting user',
                                      null
                                    );
          reject(errorObj);
        }
      })
      .catch((err) => {
        if (err !== undefined && err !== null && typeof (err.AddToError) == 'function') {
          err.setMessages('error getting user\'s roles', 'Problem getting user roles');
          reject(err.AddToError(__filename, 'user'));
        }
        else {
          let errorObj = new ErrorObj(500,
                                      'ad0002',
                                      __filename,
                                      'userRole',
                                      'error getting user',
                                      'Error getting user',
                                      err
                                    );
          reject(errorObj);
        }
      });
    });
	}

  #createUser(req, callback) {
    return new Promise((resolve, reject) => {
      var username = req.body.username.toLowerCase();
      var password = req.body.password;
      var roles = (req.body.roles == null ? ['default-user'] : req.body.roles);
      var email = req.body.email;

      var validEmailRegex = /^(([^<>()\[\]\\.,;:\s@"]+(\.[^<>()\[\]\\.,;:\s@"]+)*)|(".+"))@((\[[0-9]{1,3}\.[0-9]{1,3}\.[0-9]{1,3}\.[0-9]{1,3}])|(([a-zA-Z\-0-9]+\.)+[a-zA-Z]{2,}))$/
      if(!validEmailRegex.test(email)){
        var errorObj = new ErrorObj(500, 
                    'a0060', 
                    __filename, 
                    'signUp', 
                    'invalid email address'
                    );
        reject(errorObj);
      }
      else if (username.indexOf('@') > -1){
        var errorObj = new ErrorObj(500,
                    'a0029',
                    __filename,
                    'signUp',
                    'username cannot contain special characters'
                    );
        reject(errorObj);
      }
      else {
        this.utilities.validateEmail(email)
        .then(() => {
          return this.utilities.validateUsername(username);
        })
        .then(() => {
          var cryptoCall = util.promisify(crypto.randomBytes);
          return cryptoCall(48);
        })
        .then((buf) => {
          var salt = buf.toString('hex');
          var saltedPassword = password + salt;
          var hashedPassword = crypto.createHash('sha256').update(saltedPassword).digest('hex');

          var userObj = {
            'account_type': 'native',
            'username': username,
            'email': email,
            'salt': salt,
            'password': hashedPassword,
            'roles': roles,
            'locked': false
          };

          return this.dataAccess.createUser(userObj);
        })
        .then((userDbEntity) => {
          delete userDbEntity.password;
          delete userDbEntity.salt;

          var resolveObj = userDbEntity;
          resolve(resolveObj);
        })
        .catch((err) => {
          if(err !== undefined && err !== null && typeof(err.AddToError) == 'function') {
            reject(err.AddToError(__filename, 'signUp'));
          }
          else {
            var errorObj = new ErrorObj(500,
                          'ad0010',
                          __filename,
                          'user',
                          'error creating user',
                          'Error creating user',
                          err
                          );
            reject(errorObj);
          }
        });
      }
    });
  }

  #addUserRole(req, callback) {
    return new Promise((resolve, reject) => {
      var uid = req.body.user_id;
      var email = req.body.email ? req.body.email.toLowerCase() : null;
      var username = req.body.username ? req.body.username.toLowerCase() : null;
      var role = req.body.role ? req.body.role.toLowerCase() : null;

      this.accessControl.roleExists(role)
      .then(() => {
        return this.dataAccess.findUser(uid, username, email);
      })
      .then((userObjs) => {
        if(userObjs.length > 0) {
          let userObj = userObjs[0];
          if(!userObj.roles.includes(role)) {
            userObj.roles.push(role);
            return this.dataAccess.updateUserInfo(userObj.id, null, userObj.roles, null, null);
          }
          else {
            return null;
          }
        }
        else {
          var errorObj = new ErrorObj(500,
                                      'ad0007',
                                      __filename,
                                      'userRole',
                                      'no user found',
                                      'Error setting user\'s role',
                                      err
                                      );
          reject(errorObj);
        }
      })
      .then(() => {
        resolve({'success': true});
      })
      .catch((err) => {
        if(err !== undefined && err !== null && typeof(err.AddToError) == 'function') {
          reject(err.AddToError(__filename, 'userRole'));
        }
        else {
          var errorObj = new ErrorObj(500,
                                      'ad0003',
                                      __filename,
                                      'userRole',
                                      'error getting user\'s roles',
                                      'Error setting user\'s role',
                                      err
                                      );
          reject(errorObj);
        }
      });
    });
  }

  #updateUser(req, callback) {
    return new Promise((resolve, reject) => {
      var username;
      if (req.body.username !== undefined) {
        if (req.body.username == null) {
          var errorObj = new ErrorObj(500,
            'ad0006',
            __filename,
            'user',
            'cannot delete username',
            'Cannot delete username');
          reject(errorObj);
          return;
        }
        else {
          username = req.body.username.toLowerCase();
        }
      }

      var password = req.body.password;
      var roles = req.body.roles || null;
      var email = req.body.email || null;
      var locked = req.body.locked || null;
      var exid = req.body.external_id || null;

      if(email){
        var validEmailRegex = /^(([^<>()\[\]\\.,;:\s@"]+(\.[^<>()\[\]\\.,;:\s@"]+)*)|(".+"))@((\[[0-9]{1,3}\.[0-9]{1,3}\.[0-9]{1,3}\.[0-9]{1,3}])|(([a-zA-Z\-0-9]+\.)+[a-zA-Z]{2,}))$/
        if(!validEmailRegex.test(email)){
          var errorObj = new ErrorObj(400, 
                      'a0029', 
                      __filename, 
                      'signUp', 
                      'invalid email address'
                      );
          reject(errorObj);
          return;
        }
      }

      this.dataAccess.getUserById(req.body.id)
      .then((existingUser) => {
        if(username) {
          return [existingUser, this.utilities.validateUsername(username, existingUser.username)];
        }
        else {
          return [existingUser];
        }
      })
      .then(([existingUser]) => {
        if(email) {
          return [existingUser, this.utilities.validateEmail(email, existingUser.email)];
        }
        else {
          return [existingUser];
        }
      })
      .then(([existingUser]) => {
        if(password !== undefined) {
          var cryptoCall = util.promisify(crypto.randomBytes);
          return [existingUser, cryptoCall(48)];
        }
        else {
          return [existingUser];
        }
      })
      .then(([existingUser, buf]) => {
        var salt = null;
        var hashedPassword = null;
        if(buf !== undefined && password != null) {
          salt = buf.toString('hex');
          let saltedPassword = password + salt;
          hashedPassword = crypto.createHash('sha256').update(saltedPassword).digest('hex');
        }

        let updCmds = [this.dataAccess.updateUserInfo(existingUser.id, locked, roles, email, exid, username)];
        if(password && salt) {
          updCmds.push(this.dataAccess.updateCredentialsForUser(existingUser.id));
        }
        return Promise.all(updCmds);
      })
      .then((resArray) => {
        resolve(resArray[0]);
      })
      .catch((err) => {
        if(err !== undefined && err !== null && typeof(err.AddToError) == 'function') {
          err.setMessages('error updating user object', 'Problem updating user object');
          reject(err.AddToError(__filename, 'user'));
        }
        else {
          var errorObj = new ErrorObj(500,
                        'ad0009',
                        __filename,
                        'user',
                        'error updating user object',
                        'Error updating user object',
                        err
                        );
          reject(errorObj);
        }
      });
    });
  }

  #deleteUser(req, callback) {
    return new Promise((resolve, reject) => {
      this.dataAccess.deleteUser(req.body.id)
      .then((del_res) => {
        var resolveObj = del_res;
        resolve(resolveObj);
      })
      .catch((err) => {
        if (err !== undefined && err !== null && typeof (err.AddToError) == 'function') {
          reject(err.AddToError(__filename, 'DELETE user'));
        }
        else {
          var errorObj = new ErrorObj(500,
            'ad0005',
            __filename,
            'user',
            'error deleting user',
            'Error deleting user',
            err
          );
          reject(errorObj);
        }
      });
    });
  }

  #deleteUserRole(req, callback) {
    return new Promise((resolve, reject) => {
      var uid = req.body.id;
      var username = req.body.username ? eq.body.username.toLowerCase() : null;
      var email = req.body.email ? req.body.email.toLowerCase() : null;
      var role = req.body.role.toLowerCase();

      this.accessControl.roleExists(role)
      .then(() => {
        return this.dataAccess.findUser(uid, username, email);
      })
      .then((userObjs) => {
        if(userObjs.length > 0) {
          let userObj = userObjs[0];
          
          if(userObj.roles.includes(role)) {
            userObj.roles.splice(userObj.roles.indexOf(role), 1);
            return this.dataAccess.updateUserInfo(userObj.id, null, userObj.roles, null, null, null);
          }
          else {
            return null;
          }
        }
        else {
          let errorObj = new ErrorObj(404,
                                    'ad0010',
                                    __filename,
                                    'deleteUserRole',
                                    'user not found',
                                    'The user sepcified could not be found',
                                    null);
          reject(errorObj);
        }
      })
      .then(() => {
        resolve({'success': true});
      })
      .catch((err) => {
        if(err !== undefined && err !== null && typeof(err.AddToError) == 'function') {
          if(err.message === 'no results found' || err.err_code === 'da0109') {
            err.setStatus(404);
            err.setMessages('user not found', 'User not found');
          }

          reject(err.AddToError(__filename, 'userRole'));
        }
        else {
          var errorObj = new ErrorObj(500,
                        'ad0004',
                        __filename,
                        'userRole',
                        'error removing user\'s roles',
                        'Error removing user\'s roles',
                        err
                        );
          reject(errorObj);
        }
      });
    });
  }
}

module.exports = Admin;
