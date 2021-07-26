const { Pool, Client } = require('pg');
const QueryStream = require('pg-query-stream');
var Q = require('q');
var fs = require('fs');
const Stream = require('stream');

var DataAccessExtension = require('./dataAccess_ext.js');


class DataAccess {
  #pool = null;
  constructor() {
    this.utilities = null;
    this.#pool = null;
  }

  init(dbConfig, u, s) {
    this.utilities = u;
    this.settings = s;

    this.#pool = new Pool({
      user: dbConfig.db.user,
      host: dbConfig.db.host,
      database: dbConfig.db.name,
      password: dbConfig.db.pass,
      port: dbConfig.db.port,
      max: dbConfig.db.max_connections || 1000
    });

    this.extension = new DataAccessExtension(this);
  
  // IF THERE IS A SERVICES DIRECTORY SPECIFIED IN Settings.json
  // RUN THROUGH IT AND INSTANTIATE EACH SERVICE FILE
  let serviceDir = this.settings.data_service_directory;
  if(serviceDir != null) {
    let services = fs.readdirSync(serviceDir);
    services.forEach((serviceFile) => {
      // DON'T OVERWRITE dataAccess.extension
      if(serviceFile.toLowerCase() !== 'extension') {
        let fileNoExt = serviceFile.replace('.js', '');
        try {
          let Service = require(serviceDir+'/'+serviceFile)[fileNoExt];
          this[fileNoExt] = new Service(this, util);
        }
        catch(e) {
          throw e;
        }
      }
    });
  }
  }

  CheckForDatabase(db_name) {
    var deferred = Q.defer();
    
    var qry_params = [];
    var qry = " IF EXISTS (SELECT 1 FROM pg_database WHERE datname = '" + db_name + "') THEN" +
          " 	SELECT 'true';" +
          " ELSE" +
          " 	SELECT 'false';" +
          " END IF";
    ExecutePostgresQuery(qry, qry_params, null)
    .then(function(connection){
      deferred.resolve(connection.results[0]);
    })
    .fail(function(err){
      deferred.resolve(false);
    })
  
    return deferred.promise;
  }

  CreateDatabase(db_name) {
    var deferred = Q.defer();
    
    var qryString = 'CREATE DATABASE ' + db_name;
    var qryParams = [];
    
    this.ExecutePostgresQuery(qryString, qryParams, null)
    .then(res => {
      deferred.resolve(res);
    })
    .fail(err => {
      deferred.resolve(err);
    })
  
    return deferred.promise;
  }

  // START A CONNECTION TO THE DATABASE TO USE FUNCTIONS 
  getDbConnection() {
    var deferred = Q.defer();

    this.#pool.connect((err, client, done) => {
      if (!err) {
        deferred.resolve({ 'client': client, 'release': done, 'transactional': false, 'results': [], isReleased: false });
      }
      else {
        var errorObj = new ErrorObj(500,
          'da9004',
          __filename,
          'getDbConnection',
          'error creating connection to postgres',
          'Database error',
          err
        );
        deferred.reject(errorObj);
      }
    });

    return deferred.promise;
  }

  // CLOSE A CONNECTION TO THE DATABASE AFTER USING FUNCTIONS
  closeDbConnection(connection) {
    var deferred = Q.defer();
    if(connection != null && !connection.isReleased) {
      try {
        connection.release();
        connection.isReleased = true;
        deferred.resolve(true);
      }
      catch (err) {
        var errorObj = new ErrorObj(500,
          'da10001',
          __filename,
          'closeDbConnection',
          'error closing postgres connection',
          'Database error',
          err
        );
        deferred.reject(errorObj);
      }
    }
    else {
      deferred.resolve(true);
    }

    return deferred.promise;
  }

  // GET A CONNECTION TO THE DATABASE AND START A TRANSACTION
  startTransaction() {
    var deferred = Q.defer();

    this.getDbConnection()
    .then(function (connection) {
      //SET TRANSACTIONAL
      connection['transactional'] = true;
      connection.client.query('BEGIN', (err) => {
        if (err) {
          var errorObj = new ErrorObj(500,
            'da0005',
            __filename,
            'startTransaction',
            'error querying postgres',
            'Database error',
            err
          );
          deferred.reject(errorObj);
        }
        deferred.resolve(connection)
      });
    })
    .fail(function (err) {
      var errorObj = new ErrorObj(500,
        'da9005',
        __filename,
        'startTransaction',
        'error creating postgres transaction connection',
        'Database error',
        err
      );
      deferred.reject(errorObj);
    });

    return deferred.promise;
  }

  // COMMIT A TRANSACTION AND CLOSE THE DATABASE CONNECTION
  commitTransaction(connection) {
    var deferred = Q.defer();

    connection.client.query('COMMIT', (err) => {
      if (err) {
        var errorObj = new ErrorObj(500,
          'da0006',
          __filename,
          'commitTransaction',
          'error committing transaction in postgres',
          'Database error',
          err
        );
        this.releaseConnection(connection);
        deferred.reject(errorObj);
      }
      else {
        delete connection.transactional;
        try {
          connection.release();
        }
        catch(e) {
          console.log('Problem releasing connection to db:');
          console.log(e);
        }
        connection.isReleased = true;
        deferred.resolve(connection.results);
      }
    });

    return deferred.promise;
  }

  // ROLLBACK A TRANSACTION AND CLOSE THE DATABASE CONNECTION
  rollbackTransaction(connection) {
    var deferred = Q.defer();

    if(connection != null && !connection.isReleased) {
      if(connection.transactional) {
        connection.client.query('ROLLBACK', (err) => {
          if (err) {
            // THERE WAS AN ERROR ROLLING BACK TRY TO JUST RELEASE THE CONNECTION
            if(connection != null) {
              try {
                connection.release();
              }
              catch(e) {
                console.log('Problem releasing connection to db:');
                console.log(e);
              }
              connection.isReleased = true;
            }

            var errorObj = new ErrorObj(500,
                          'da0007',
                          __filename,
                          'ExecutePostgresQuery',
                          'error rolling back transaction in postgres',
                          'Database error',
                          err
                        );
            
            // PANIC....ROLLBACK FAILED...I GUESS JUST PRINT A MESSAGE FOR NOW
            // ...UNTIL WE GET A BETTER PLAN
            console.log('***************************************************');
            console.log('\t\tROLLBACK ERROR')
            console.log('***************************************************');
            console.log(errorObj);
            console.log('***************************************************');

            deferred.reject(errorObj);
          }
          else {
            try {
              connection.release();
            }
            catch(e) {
              console.log('Problem releasing connection to db:');
              console.log(e);
            }
            connection.isReleased = true;
            deferred.resolve({ 'rollback_results': 'success' });
          }
        });
      }
      // THIS ISN'T ACTUALLY A TRANSACTION.  IT'S JUST A CHAIN OF CALLS
      // ON A SINGLE CONNECTION.  CLOSE THE CONNECTION, BUT DON'T WORRY
      // ABOUT ROLLING BACK.
      else {
        try {
          connection.release();
        }
        catch(e) {
          console.log('Problem releasing connection to db:');
          console.log(e);
        }
        connection.isReleased = true;
        deferred.resolve();
      }
    }
    else {
      deferred.resolve();
    }

    return deferred.promise;
  }

  // THIS FUNCTION IS USED SO ONE FUNCTION CAN RESOLVE THE CURRENT CONNECTION STATE AND RETURN A CONNECTION
  resolveDbConnection(connection) {
    var deferred = Q.defer();
    
    if(connection == null) {
      this.getDbConnection()
      .then(function(db_connection) {
        deferred.resolve(db_connection);
      })
      .fail(function(err) {
        var errorObj = new ErrorObj(500,
          'da0500',
          __filename,
          'resolveDbConnection',
          'error creating a connection to postgres',
          'Database error',
          err
        );
        deferred.reject(errorObj);
      })
    }
    else {
      deferred.resolve(connection);
    }

    return deferred.promise;
  }

  // RELEASES A CONNECTION (IF YOU NEED TO DO THAT MANUALLY)
  releaseConnection(connection) {
    var deferred = Q.defer();

    if(connection != null && !connection.isReleased) {
      if(connection.transactional) {
        this.rollbackTransaction(connection)
        .then(function(rollback_res) {
          delete connection.transactional;
          deferred.resolve();
        })
        .fail(function(rollback_err) {
          try {
            connection.release();
          }
          catch(e) {
            console.log('Problem releasing connection to db:');
            console.log(e);
          }
          connection.isReleased = true;

          deferred.resolve();
        });
      }
      else {
        delete connection.transactional;
        
        try {
          connection.release();
        }
        catch(e) {
          console.log('Problem releasing connection to db:');
          console.log(e);
        }
        connection.isReleased = true;
        
        deferred.resolve();
      }
    }
    else {
      deferred.resolve();
    }

    return deferred.promise;
  }

  // ================================================================================
  //THIS FUNCTION GLOBALIZES ALL QUERIES (SELECT) AND NON QUERIES (INSERT UPDATE DELETE ETC)
  //CONDITIONALLY CREATES AND DESTROYS CONNECTIONS DEPENDING IF THEY ARE TRANSACTIONAL OR NOT
  ExecutePostgresQuery(query, params, connection, isStreaming) {
    var deferred = Q.defer();
    var pg_query = query;
    //THE QUERY CONFIG OBJECT DOES NOT WORK IF THERE IS AN EMPTY ARRAY OF PARAMS
    if (params != null && params.length > 0) {
      pg_query = {
        text: query,
        values: params,
      }
    }

    var that = this;

    this.resolveDbConnection(connection)
    .then(function(db_connection) {

      // PERFORM THE QUERY
      if(!isStreaming) {
        db_connection.client.query(pg_query)
        .then(function(res) {
          db_connection.results = res.rows;

          // IF THE ARG connection PASSED INTO THE FUNCTION IS null/undefined
          // THIS IS A ONE-OFF AND WE MUST SHUT DOWN THE CONNECTION WE MADE
          // BEFORE RETURNING THE RESULTS
          if(connection == null) {
            that.releaseConnection(db_connection)
            .then(function() {
              deferred.resolve(db_connection);
            });
          }
          // OTHERWISE THIS IS ONE CALL IN A CHAIN ON A SINGLE CONNECTION
          // SO WE SHOULD PASS BACK THE CONNECTION WITH RESULTS
          else {
            deferred.resolve(db_connection);
          }
        })
        .catch(function(qry_err) {
          // IF THE ARG connection PASSED INTO THE FUNCTION IS null/undefined
          // THIS IS A ONE-OFF AND WE MUST SHUT DOWN THE CONNECTION WE MADE
          // AND FAIL OUT
          if(connection == null) {
            try {
              db_connection.release();
            }
            catch(e) {
              console.log('Problem releasing connection to db:');
              console.log(e);
            }
            db_connection.isReleased = true;
            var errorObj = new ErrorObj(500,
                          'da0501',
                          __filename,
                          'ExecutePostgresQuery',
                          'error querying postgres',
                          'Database error',
                          qry_err
                        );
            deferred.reject(errorObj);
          }
          // OTHERWISE, THIS IS ONE CALL IN A CHAIN ON A SINGLE CONNECTION
          else {
            // IF THIS IS PART OF A TRANSACTIONAL SEQUENCE, WE NEED TO ROLL BACK
            // AND FAIL OUT
            if(db_connection.transactional) {
              this.rollbackTransaction(db_connection)
              .then(function(rollback_res) {
                var errorObj = new ErrorObj(500,
                              'da0502',
                              __filename,
                              'ExecutePostgresQuery',
                              'error querying postgres--transaction rolled back',
                              'Database error',
                              qry_err
                            );
                deferred.reject(errorObj);
              })
              .fail(function(rollback_err) {
                deferred.reject(rollback_err.AddToError(__filename, 'ExecutePostgresQuery'));
              });
            }
            // OTHERWISE, JUST RELEASE THE CONNECTION AND FAIL OUT
            else {
              try {
                db_connection.release();
              }
              catch(e) {
                console.log('Problem releasing connection to db:');
                console.log(e);
              }
              db_connection.isReleased = true;
              var errorObj = new ErrorObj(500,
                            'da0504',
                            __filename,
                            'ExecutePostgresQuery',
                            'error querying postgres',
                            'Database error',
                            qry_err
                          );
              deferred.reject(errorObj);
            }
          }
        });
      }
      else {
        // STREAMING RESULTS
        let streamQry;
        if(typeof(pg_query) === 'object') {
          streamQry = new QueryStream(pg_query.text, pg_query.values)
        }
        else {
          streamQry = new QueryStream(pg_query);
        }
        let stream = db_connection.client.query(streamQry);
        let outStream = new Stream.Readable();
        outStream._read = () => {};

        stream.on('data', (chunk) => {
          outStream.push(JSON.stringify(chunk));
        });

        stream.on('end', () => {
          outStream.push(null);
          try {
            db_connection.release();
          }
          catch(e) {
            console.log('Problem releasing connection to db:');
            console.log(e);
          }
        });

        stream.on('error', (streamErr) => {
          if(db_connection.transactional === true) {
            this.rollbackTransaction(db_connection)
            .finally(function() {
              outStream.destroy(streamErr);
            });
          }
          else {
            try {
              db_connection.release();
            }
            catch(e) {
              console.log('Problem releasing connection to db:');
              console.log(e);
            }
            outStream.destroy(streamErr);
          }
        });
        
        db_connection.results = outStream;
        deferred.resolve(db_connection);
      }
    })
    .fail(function(err) {
      var errorObj = new ErrorObj(500,
                    'da0505',
                    __filename,
                    'ExecutePostgresQuery',
                    'error connecting to postgres',
                    'Database error',
                    err
                  );
      deferred.reject(errorObj);
    });

    return deferred.promise;
  }

  // RUN ARBITRARY SQL STATEMENTS
  runSql(sqlStatement, params, connection, isStreaming) {
    var deferred = Q.defer();
    
    this.ExecutePostgresQuery(sqlStatement, params, connection, isStreaming)
    .then(function (connection) {
      deferred.resolve(connection.results);
    })
    .fail(function (err) {
      if(err && typeof(err.AddToError) === 'function') {
        deferred.reject(err.AddToError(__filename, 'runSql'));
      }
      else {
        let errorObj = new ErrorObj(500,
                                    'da0090',
                                    __filename,
                                    'runSql',
                                    'psql error',
                                    'There was a problem with your request.',
                                    err);
        deferred.reject(errorObj);
      }
    });

    return deferred.promise;
  }

  GetDeadSessions(timeOut, markAsEnded) {
    var deferred = Q.defer();
    var minutes = "'" + timeOut + " minutes'";
    var qry = "select * from bs3_sessions where last_touch < (NOW() - INTERVAL " + minutes + ")";
    var qry_params = [];
    if(markAsEnded) qry = "UPDATE bs3_sessions SET ended_at = NOW() WHERE last_touch < (NOW() - INTERVAL " + minutes + ") RETURNING *";
    this.ExecutePostgresQuery(qry, qry_params, null)
    .then(function (connection) {
      deferred.resolve(connection.results);
    })
    .fail(function (err) {
      deferred.reject(err.AddToError(__filename, 'GetDeadSessions'));
    });
  
    return deferred.promise;
  }

  DeleteSessions(dsIds) {
    var deferred = Q.defer();
  
    let qry = "DELETE FROM bs3_sessions WHERE ids = ANY($1)";
    this.ExecutePostgresQuery(qry, [dsIds])
    .then((delRes) => {
      deferred.resolve();
    })
    .fail((err) => {
      deferred.reject(err);
    });
  
    return deferred.promise;
  }

  findUser(id, username, email, connection) {
    var deferred = Q.defer();
  
    if(!id) id = null;
    if(!username) username = null;
    if(!email) email = null;
  
    if(id || username || email) {
      let sql = "SELECT * FROM bs3_users WHERE (id = $1 OR LOWER(username) = LOWER($2) OR LOWER(email) = LOWER($3)) AND deleted_at IS NULL";
      let params = [id, username, email];
  
      this.ExecutePostgresQuery(sql, params, connection)
      .then((userRes) => {
        deferred.resolve(userRes.results)
      })
      .fail((err) => {
        if(err && typeof(err.AddToError) === 'function') {
          deferred.reject(err.AddToError(__filename, 'find user'));
        }
        else {
          let errorObj = new ErrorObj(404,
                                      'da0203',
                                      __filename,
                                      'findUser',
                                      'error finding user',
                                      'There was a problem with your request',
                                      err
                                    );
          deferred.reject(errorObj);
        }
      });
    }
    else {
      deferred.resolve(null);
    }
    
    return deferred.promise;
  }

  getAllUsers(connection) {
    var deferred = Q.defer();
  
    let sql = "SELECT * FROM bs3_users WHERE deleted_at IS NULL";
    this.runSql(sql,[],connection)
    .then((userRes) => {
      deferred.resolve(userRes.map(u => u.data));
    })
    .fail((allUsrErr) => {
      let errorObj = new ErrorObj(500,
                                  'da0204',
                                  __filename,
                                  'getAllUsers',
                                  'error gettomg users',
                                  'There was a problem with your request',
                                  allUsrErr
                                );
      deferred.reject(errorObj);
    })
  
    return deferred.promise;
  }

  GenerateForgotPasswordToken(email, username) {
    var deferred = Q.defer();
  
    let sql = "SELECT * FROM bs3_users WHERE LOWER(username) = LOWER($1) OR LOWER(email) = LOWER($2)";
  
  
    this.findUser(null, username, email)
    .then(function (userObj) {
      if (userObj.is_locked) {
        deferred.reject(new ErrorObj(
          403,
          'a2006',
          __filename,
          'forgotPassword',
          'bsuser is locked',
          'Unauthorized'
        ));
        return deferred.promise;
      }
      else {
        return [userObj, utilities.getHash(null, null, 48)];
      }
    })
    .spread(function (userObj, tkn) {
      if (userObj.forgot_password_tokens === undefined || userObj.forgot_password_tokens === null) {
        userObj.forgot_password_tokens = [tkn];
      }
      else {
        userObj.forgot_password_tokens.push(tkn);
      }
      return [tkn, DataAccess.prototype.updateJsonbField('bsuser', 'data', userObj, `data->>'id' = '${userObj.id}'`)];
    })
    .spread(function(tkn) {
      deferred.resolve(tkn);
    })
    .fail(function(err) {
      deferred.reject(err);
    });
  
    return deferred.promise;
  }

  getActiveTokens() {
    var deferred = Q.defer();
  
    let sql = "SELECT token FROM bs3_sessions WHERE ended_at IS NULL";
    this.runSql(sql, [])
    .then((tokenRes) => {
      deferred.resolve(tokenRes.map(tknObj => tknObj.token));
    })
    .fail((err) => {
      deferred.reject(err.AddToError(__filename, 'getActiveTokens'));
    });
  
    return deferred.promise;
  }

  startSession(token, userId, clientInfo, isAnonymous, connection) {
    var deferred = Q.defer();
  
    if(isAnonymous == null) isAnonymous = false;
    let sql = "INSERT INTO bs3_sessions(token, user_id, client_info, anonymous, created_at, last_touch) VALUES($1, $2, $3, $4, NOW(), NOW()) RETURNING *";
    let params = [token, userId, clientInfo, isAnonymous]
  
    this.runSql(sql, params, connection)
    .then((sessRes) => {
      deferred.resolve(sessRes[0]);
    })
    .fail((err) => {
      deferred.reject(err.AddToError(__filename, 'startSession', 'Problem starting up a new session'));
    });
    
    return deferred.promise;
  }

  getUserById(id, connection) {
    var deferred = Q.defer();
  
    if(id) {
      var qry = "SELECT * FROM bs3_users WHERE id = $1 AND deleted_at IS NULL";
      var qry_params = [id];
      this.ExecutePostgresQuery(qry, qry_params, connection)
      .then(function (connection) {
        if (connection.results.length === 0) {
          var errorObj = new ErrorObj(404,
            'da0160',
            __filename,
            'getUserById',
            'no user found',
            'Cannot find user.',
            null
          );
          deferred.reject(errorObj);
        }
        else if (connection.results.length === 1) {
          deferred.resolve(connection.results[0].data);
        }
        else {
          console.log('found multiple users');
          var errorObj = new ErrorObj(500,
            'da0161',
            __filename,
            'getUserById',
            '',
            'Found multiple users with that id.',
            null
          );
          deferred.reject(errorObj);
        }
      })
      .fail(function (err) {
        try {
          deferred.reject(err.AddToError(__filename, 'getUserById'));
        }
        catch(e) {console.log(e)}
      });
    }
    else {
      deferred.resolve(null);
    }
  
    return deferred.promise;
  }

  getUserByUserName(username, connection) {
    var deferred = Q.defer();
  
    if(username) {
      var qry = "SELECT * FROM bs3_users WHERE LOWER(username) = LOWER($1) AND deleted_at IS NULL";
      var qry_params = [username];
      this.ExecutePostgresQuery(qry, qry_params, connection)
      .then(function (connection) {
        if (connection.results.length === 0) {
          var errorObj = new ErrorObj(404,
            'da0162',
            __filename,
            'getUserByUserName',
            'no user found',
            'Cannot find user.',
            null
          );
          deferred.reject(errorObj);
        }
        else if (connection.results.length === 1) {
          deferred.resolve(connection.results[0].data);
        }
        else {
          console.log('found multiple users');
          var errorObj = new ErrorObj(500,
            'da0163',
            __filename,
            'getUserByUserName',
            '',
            'Found multiple users with that user name.',
            null
          );
          deferred.reject(errorObj);
        }
      })
      .fail(function (err) {
        try {
          deferred.reject(err.AddToError(__filename, 'getUserByUserName'));
        }
        catch(e) {console.log(e)}
      });
    }
    else {
      deferred.resolve(null);
    }
  
    return deferred.promise;
  }

  getUserByEmail(email, connection) {
    var deferred = Q.defer();
  
    if(email) {
      var qry = "SELECT * FROM bs3_users WHERE LOWER(email) = LOWER($1) AND deleted_at IS NULL";
      var qry_params = [email];
      this.ExecutePostgresQuery(qry, qry_params, connection)
      .then(function (connection) {
        if (connection.results.length === 0) {
          var errorObj = new ErrorObj(404,
            'da0164',
            __filename,
            'getUserByEmail',
            'no user found',
            'Cannot find user.',
            null
          );
          deferred.reject(errorObj);
        }
        else if (connection.results.length === 1) {
          deferred.resolve(connection.results[0].data);
        }
        else {
          var errorObj = new ErrorObj(500,
            'da0165',
            __filename,
            'getUserByEmail',
            '',
            'Found multiple users with that user name.',
            null
          );
          deferred.reject(errorObj);
        }
      })
      .fail(function (err) {
        try {
          deferred.reject(err.AddToError(__filename, 'getUserByEmail'));
        }
        catch(e) {console.log(e)}
      });
    }
    else {
      deferred.resolve(null);
    }
  
    return deferred.promise;
  }

  getUserByClientId(cid, includeCreds, connection) {
    var deferred = Q.defer();
  
    if(cid) {
      var qry = "SELECT usr.*";
      if(includeCreds) qry += ", creds.salt, creds.client_secret"; 
      qry += " FROM bs3_users usr JOIN bs3_credentials creds WHERE creds.client_id = $1 AND deleted_at IS NULL";
      var qry_params = [cid];
      this.ExecutePostgresQuery(qry, qry_params, connection)
      .then(function (connection) {
        if (connection.results.length === 0) {
          var errorObj = new ErrorObj(404,
            'da0166',
            __filename,
            'getUserByClientId',
            'no user found',
            'Cannot find user.',
            null
          );
          deferred.reject(errorObj);
        }
        else if (connection.results.length === 1) {
          deferred.resolve(connection.results[0].data);
        }
        else {
          let errorObj = new ErrorObj(500,
            'da0167',
            __filename,
            'getUserByClientId',
            '',
            'Found multiple users with that client id.',
            null
          );
          deferred.reject(errorObj);
        }
      })
      .fail(function (err) {
        try {
          deferred.reject(err.AddToError(__filename, 'getUserByClientId'));
        }
        catch(e) {console.log(e)}
      });
    }
    else {
      deferred.resolve(null);
    }
  
    return deferred.promise;
  }

  getUserByExternalIdentityId(exid, connection) {
    var deferred = Q.defer();
  
    let sql = "SELECT * FROM bs3_users WHERE external_id = $1 AND deleted_at IS NULL";
    let params = [exid];
    this.runSql(sql, params, connection)
    .then((usersRes) => {
      if (usersRes.length === 0) {
        let errorObj = new ErrorObj(404,
          'da3166',
          __filename,
          'getUserByExternalIdentityId',
          'no user found',
          'Cannot find user.',
          null
        );
        deferred.reject(errorObj);
      }
      else if (usersRes.length === 1) {
        deferred.resolve(usersRes[0].data);
      }
      else {
        let errorObj = new ErrorObj(500,
          'da3167',
          __filename,
          'getUserByExternalIdentityId',
          '',
          'Found multiple users with that external id.',
          null
        );
        deferred.reject(errorObj);
      }
    })
    .fail((err) => {
      var errorObj = new ErrorObj(500,
                                  'da3170',
                                  __filename,
                                  'getUserByExternalIdentityId',
                                  '',
                                  'Found multiple users with that client id.',
                                  null
                                );
      deferred.reject(errorObj);
    });
  
    return deferred.promise;
  }

  getUserByForgotPasswordToken(fptkn, connection) {
    var deferred = Q.defer();
  
    if(fptkn) {
      var qry = "SELECT * FROM bs3_users bu INNER JOIN bs3_credentials bc ON bc.user_id = bu.id WHERE bc.forgot_password_tokens ? $1 AND deleted_at IS NULL";
      var qry_params = [fptkn];
      this.ExecutePostgresQuery(qry, qry_params, connection)
      .then(function (connection) {
        if (connection.results.length === 0) {
          var errorObj = new ErrorObj(404,
            'da0164',
            __filename,
            'getUserByForgotPasswordToken',
            'no user found',
            'Cannot find user.',
            null
          );
          deferred.reject(errorObj);
        }
        else if (connection.results.length === 1) {
          deferred.resolve(connection.results[0].data);
        }
        else {
          var errorObj = new ErrorObj(500,
            'da0165',
            __filename,
            'getUserByForgotPasswordToken',
            'forgot password token collision',
            'Found multiple users with that token.',
            null
          );
          deferred.reject(errorObj);
        }
      })
      .fail(function (err) {
        try {
          deferred.reject(err.AddToError(__filename, 'getUserByForgotPasswordToken'));
        }
        catch(e) {console.log(e)}
      });
    }
    else {
      deferred.resolve(null);
    }
  
    return deferred.promise;
  }

  deleteUser(uid, connection) {
    var deferred = Q.defer();
  
    let sql = "UPDATE bs3_users SET deleted_at = NOW() WHERE id = $1 RETURNING id";
    let params = [uid];
  
    this.runSql(sql, params, connection)
    .then((delRes) => {
      if(delRes.length > 0) {
        deferred.resolve({success: true});
      }
      else {
        deferred.reject({success:false, message:'problem deleting user'});
      }
    })
    .fail((delErr) => {
      let errorObj = new ErrorObj(500,
                                  'da0170',
                                  __filename,
                                  'deleteUser',
                                  'problem deleting user',
                                  'There was a problem with your request.',
                                  delErr
                                );
      deferred.reject(errorObj);
    })
  
    return deferred.promise;
  }

  createUser(userObj) {
    var deferred = Q.defer();
    startTransaction()
    .then((dbHandle) => {
      let sql = `INSERT INTO bs3_users(account_type, username, email, roles, external_id, locked, created_at) VALUES ($1, $2, $3, $4, $5, $6, $7) RETURNING *`;
      let params = [userObj.account_type, userObj.username, userObj.email, JSON.stringify(userObj.roles), userObj.external_id, false, new Date().toISOString()];
      return [dbHandle, this.runSql(sql, params, dbHandle)];
    })
    .spread((dbHandle, userRes) => {
      let sql = `INSERT INTO bs3_credentials(salt, password, client_id, client_secret, created_at, user_id) VALUES($1, $2, $3, $4, $5, $6)`;
      let params = [userObj.salt, userObj.password || null, userObj.client_id || null, userObj.client_secret || null, new Date().toISOString(), userRes[0].id];
      let outUsr = userRes[0];
      if(userObj.client_id) outUsr['client_id'] = userObj.client_id;
      if(userObj.client_id) outUsr['client_secret'] = userObj.client_secret;
      return [dbHandle, outUsr, this.runSql(sql, params, dbHandle)];
    })
    .spread((dbHandle, usr, credRes) => {
      return [usr, commitTransaction(dbHandle)];
    })
    .spread((usr, commitRes) => {
      deferred.resolve(usr);
    })
    .fail((err) => {
      if(err && typeof(err.AddToError) === 'function') {
        deferred.reject(err.AddToError(__filename, 'createUser'));
      }
      else {
        let errorObj = new ErrorObj(500,
                                    'da3000',
                                    __filename,
                                    'createUser',
                                    'problem creating user',
                                    'There was a problem creating this user',
                                    err);
          deferred.reject(errorObj);
      }
    })
  
    return deferred.promise;
  }

  updateJsonbField(tableName, fieldname, updateObj, whereClause) {
    var deferred = Q.defer();
  
    let sql = `UPDATE ${tableName} SET ${fieldname} = ${fieldname} || $1`;
    if(whereClause) {
      sql += ` WHERE ${whereClause}`;
    } 
    sql += ` RETURNING *`;
    let params = [JSON.stringify(updateObj)];
  
    this.runSql(sql, params)
    .then((updRes) => {
      deferred.resolve(updRes);
    })
    .fail((err) => {
      deferred.reject(err.AddToError(__filename, 'updateJsonbField'));
    })
  
    return deferred.promise;
  }

  saveApiCredentials(clientId, salt, hashedSecret, uid) {
    var deferred = Q.defer();
    if(clientId && salt && hashedSecret && uid) {
      let sql = 'INSERT INTO bs3_credentials(client_id, salt, client_secret, user_id) VALUES($1, $2, $3, $4) RETURNING *';
      let params = [clientId, salt, hashedSecret, uid];
      this.runSql(sql, params)
      .then((credRes) => {
        deferred.resolve(credRes);
      })
      .fail((err) => {
        if(err && typeof(err.AddToError) === 'function') {
          deferred.reject(err.AddToError(__filename, 'saveApiCredentials'));
        }
        else {
          let errorObj = new ErrorObj(500,
                                    'da3001',
                                    __filename,
                                    'saveApiCredentials',
                                    'problem saving to db',
                                    'There was a problem saving credentials',
                                    err);
          deferred.reject(errorObj);
        }
      })
    }
    else {
      let errorObj = new ErrorObj(500,
                                  'da3000',
                                  __filename,
                                  'saveApiCredentials',
                                  'missing args',
                                  'There was a problem saving credentials');
      deferred.reject(errorObj);
    }
  
    return deferred.promise;
  }

  updateApiCredentials(clientId, salt, hashedSecret) {
    var deferred = Q.defer();
    if(clientId && salt && hashedSecret && uid) {
      let sql = 'UPDATE bs3_credentials SET salt = $2, client_secret = $3 WHERE client_id = $1 RETURNING id';
      let params = [clientId, salt, hashedSecret];
      this.runSql(sql, params)
      .then((credRes) => {
        deferred.resolve(credRes);
      })
      .fail((err) => {
        if(err && typeof(err.AddToError) === 'function') {
          deferred.reject(err.AddToError(__filename, 'updateApiCredentials'));
        }
        else {
          let errorObj = new ErrorObj(500,
                                    'da3101',
                                    __filename,
                                    'updateApiCredentials',
                                    'problem saving to db',
                                    'There was a problem saving credentials',
                                    err);
          deferred.reject(errorObj);
        }
      })
    }
    else {
      let errorObj = new ErrorObj(500,
                                  'da3000',
                                  __filename,
                                  'saveApiCredentials',
                                  'missing args',
                                  'There was a problem saving credentials');
      deferred.reject(errorObj);
    }
  
    return deferred.promise;
  }

  getSession(sid, tkn) {
    var deferred = Q.defer();
  
    let sql = "SELECT * FROM bs3_sessions WHERE";
    let params = [];
    if(sid) {
      sql += " id = $1";
      params.push(sid);
    }
    else if(tkn) {
      sql += " token = $1";
      params.push(tkn);
    }
  
    this.runSql(sql, params)
    .then((sessRes) => {
      if(sessRes.length === 1) {
        deferred.resolve(sessRes[0]);
      }
      else if(sessRes.length === 0) {
        deferred.resolve(null);
      }
      else {
        let errorObj = new ErrorObj(500,
                                    'da0080',
                                    __filename,
                                    'getSession',
                                    'multiple sessions found',
                                    'There was a problem with your request',
                                    null);
        deferred.reject(errorObj);
      }
    })
    .fail((err) => {
      let errorObj = new ErrorObj(500,
                                'da0081',
                                __filename,
                                'getSession',
                                'db error',
                                'There was a problem with your request',
                                err);
      deferred.reject(errorObj);
    });
  
    return deferred.promise;
  }

  getUserBySession(sid, tkn) {
    var deferred = Q.defer();
  
    let sql = "SELECT bu.* FROM bs3_users bu JOIN bs3_sessions bs ON bu.id = bs.user_id WHERE bs.ended_at IS NULL AND"
  
    let params = [];
    if(sid) {
      sql += " bs.id = $1";
      params.push(sid);
    }
    else if(tkn) {
      " bs.token = $1";
      params.push(tkn);
    }
  
    this.runSql(sql, params)
    .then((sessRes) => {
      if(sessRes.length === 1) {
        deferred.resolve(sessRes[0]);
      }
      else if(sessRes.length === 0) {
        deferred.resolve(null);
      }
      else {
        let errorObj = new ErrorObj(500,
                                    'da0082',
                                    __filename,
                                    'getUserBySession',
                                    'multiple sessions found',
                                    'There was a problem with your request',
                                    null);
        deferred.reject(errorObj);
      }
    })
    .fail((err) => {
      let errorObj = new ErrorObj(500,
                                'da0083',
                                __filename,
                                'getUserBySession',
                                'db error',
                                'There was a problem with your request',
                                err);
      deferred.reject(errorObj);
    });
  
    return deferred.promise;
  }

  attachUserToSession = (uid, sid) => {
    let deferred = Q.defer();
  
    let sql = "UPDATE bs3_sessions SET user_id = $1 WHERE id = $2";
    this.runSql(sql, [uid, sid])
    .then((updRes) => {
      deferred.resolve({success:true});
    })
    .fail((err) => {
      let errorObj = new ErrorObj(500,
                                  'da0090',
                                  __filename,
                                  'attachUserToSession',
                                  'db error',
                                  'There was a problem with your request',
                                  err);
      deferred.reject(errorObj);
    });
  
    return deferred.promise;
  }

  getCredentialsForUser(userId, connection) {
    var deferred = Q.defer();
  
    let sql = "SELECT * FROM bs3_credentials WHERE user_id = $1 AND deleted_at IS NULL";
    let params = [userId];
  
    this.runSql(sql, params, connection)
    .then((credRes) => {
      deferred.resolve(credRes);
    })
    .fail((err) => {
      let errorObj = new ErrorObj(500,
                                  'da0100',
                                  __filename,
                                  'getCredentialsForUser',
                                  'db error',
                                  'There was a problem with your request',
                                  err);
      deferred.reject(errorObj);
    });
  
    return deferred.promise;
  }

  updateCredentialsForUser(userId, salt, password, clientSecret, forgotPasswordToken, connection) {
    var deferred = Q.defer();

    let params = [userId];
    let sql = "UPDATE credentials SET modified_at = NOW()";
    if(salt) {
      params.push(salt);
      sql += `, salt = $${params.length}`;
    }
    if(password) {
      params.push(password);
      sql += `, password = $${params.length}`;
    }
    if(clientSecret) {
      params.push(clientSecret);
      sql += `, client_secret = $${params.length}`;
    }
    if(forgotPasswordToken) {
      if(forgotPasswordToken === 'RESET') {
        sql = `, forgotPassword = []'::jsonb`;
      }
      else {
        sql += `, forgotPassword = forgotPassword || '["${forgotPasswordToken}"]'::jsonb`;
      }
    }
    params.push(userId);
    sql += ` WHERE user_id = $1`;

    this.runSql(sql, params, connection)
    .then((updRes) => {
      deferred.resolve(updRes);
    })
    .fail((err) => {
      let errorObj = new ErrorObj(500,
                                  'da0110',
                                  __filename,
                                  'updateCredentialsForUser',
                                  'db error',
                                  'There was a problem with your request',
                                  err);
      deferred.reject(errorObj);
    });

    return deferred.promise;
  }

  updateUserInfo(userId, locked, roles, email, exId) {
    var deferred = Q.defer();

    let params = [userId];
    let sql = 'UPDATE bs3_users SET modified_at = NOW()';
    if(locked) {
      params.push(locked);
      sql += `, locked = $${params.length}`;
    }
    if(roles) {
     params.push(JSON.stringify(roles));
     sql += `, roles = $${params.length}`; 
    }
    if(email) {
      params.push(email);
      sql += `, email = $${params.length}`;
    }
    if(exId) {
      params.push(exId);
      sql += `, external_id = $${params.length}`;
    }

    sql += ` WHERE user_id = $1 RETURNING *`;

    this.runSql(sql, params)
    .then((res) => {
      if(res.lentgth > 0) {
        deferred.resolve(res[0]);
      }
      else {
        let errorObj = new ErrorObj(500,
                                    'da0121',
                                    __filename,
                                    'updateUserInfo',
                                    'no user updated',
                                    'There was a problem update user info',
                                    null);
        deferred.reject(errorObj);
      }
    })
    .fail((err) => {
      let errorObj = new ErrorObj(500,
                                  'da0120',
                                  __filename,
                                  'updateUserInfo',
                                  'db error',
                                  'There was a problem with your request',
                                  err);
      deferred.reject(errorObj);
    });
    
    return deferred.promise;
  }
}

const instance = new DataAccess();
module.exports = instance;