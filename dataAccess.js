const { Pool, Client } = require('pg');
const QueryStream = require('pg-query-stream');
const fs = require('fs');
const Stream = require('stream');
const path = require('path');
const rootDir = path.dirname(require.main.filename);

var DataAccessExtension;
try {
  DataAccessExtension = require(`${rootDir}/dataAccess_ext.js`);
}
catch(e) {
  console.error('INITIALIZATION ERROR -- dataAccess_ext.js');
  throw(e);
}


class DataAccess {
  #pool = null;
  constructor() {
    this.utilities = null;
    this.#pool = null;
  }

  init(dbConfig, u, s) {
    this.utilities = u;
    this.settings = s;

    try {
      // ARE WE CONFIGURED FOR SSL
      let sslDesc = false;
      if(dbConfig.db.ssl === true) sslDesc = true;
      if(dbConfig.db.ssl != null && (dbConfig.db.ssl.ca || dbConfig.db.ssl.key || dbConfig.db.ssl.cert)) {
        sslDesc = {
          rejectUnauthorized: true,
          ca: dbConfig.db.ssl.ca == null ? null : fs.readFileSync(dbConfig.db.ssl.ca),
          key: dbConfig.db.ssl.key == null ? null : fs.readFileSync(dbConfig.db.ssl.key),
          cert: dbConfig.db.ssl.cert == null ? null : fs.readFileSync(dbConfig.db.ssl.cert)
        };
      }

      // CONNECT TO THE DB
      this.#pool = new Pool({
        user: dbConfig.db.user,
        host: dbConfig.db.host,
        database: dbConfig.db.name,
        password: dbConfig.db.pass,
        port: dbConfig.db.port,
        max: dbConfig.db.max_connections || 1000,
        ssl: sslDesc
      });
    }
    catch(err) {
      console.error(err);
      throw('Database Connection Failed');
    }

    this.extension = new DataAccessExtension(this);
  
    // IF THERE IS A SERVICES DIRECTORY SPECIFIED IN Settings.json
    // RUN THROUGH IT AND INSTANTIATE EACH SERVICE FILE
    let serviceDir = this.settings.data_service_directory;
    if(serviceDir != null) {
      serviceDir.replace(/^\.\//, '');
      serviceDir.replace(/^\//, '');
      let services = fs.readdirSync(serviceDir);
      services.forEach((serviceFile) => {
        // DON'T OVERWRITE dataAccess.extension
        if(serviceFile.toLowerCase() !== 'extension') {
          let fileNoExt = serviceFile.replace('.js', '');
          try {
            let Service = require(`${rootDir}/${serviceDir}/${serviceFile}`);
            this[fileNoExt] = new Service(this, this.utilities);
          }
          catch(e) {
            let err = new Error(`Error starting services file: ${rootDir}/${serviceDir}/${serviceFile}`);
            throw err;
          }
        }
      });
    }
  }

  async CheckForDatabase(db_name) {
    return new Promise((resolve, reject) => {
      var qry_params = [];
      var qry = " IF EXISTS (SELECT 1 FROM pg_database WHERE datname = '" + db_name + "') THEN" +
            " 	SELECT 'true';" +
            " ELSE" +
            " 	SELECT 'false';" +
            " END IF";
      ExecutePostgresQuery(qry, qry_params, null)
      .then((connection) => {
        resolve(connection.results[0]);
      })
      .catch((err) => {
        resolve(false);
      })
    });
  }

  async CreateDatabase(db_name) {
    return new Promise((resolve, reject) => {
      var qryString = 'CREATE DATABASE ' + db_name;
      var qryParams = [];
      
      this.ExecutePostgresQuery(qryString, qryParams, null)
      .then(res => {
        resolve(res);
      })
      .catch(err => {
        resolve(err);
      })
    });
  }

  // START A CONNECTION TO THE DATABASE TO USE FUNCTIONS 
  async getDbConnection() {
    return new Promise((resolve, reject) => {
      this.#pool.connect((err, client, done) => {
        if (!err) {
          resolve({ 'client': client, 'release': done, 'transactional': false, 'results': [], isReleased: false });
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
          reject(errorObj);
        }
      });
    });
  }

  // CLOSE A CONNECTION TO THE DATABASE AFTER USING FUNCTIONS
  async closeDbConnection(connection) {
    return new Promise((resolve, reject) => {
      if(connection != null && !connection.isReleased) {
        try {
          connection.release();
          connection.isReleased = true;
          resolve(true);
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
          reject(errorObj);
        }
      }
      else {
        resolve(true);
      }
    });
  }

  // GET A CONNECTION TO THE DATABASE AND START A TRANSACTION
  async startTransaction() {
    return new Promise((resolve, reject) => {
      this.getDbConnection()
      .then((connection) => {
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
            reject(errorObj);
          }
          else {
            resolve(connection);
          }
        });
      })
      .catch((err) => {
        var errorObj = new ErrorObj(500,
          'da9005',
          __filename,
          'startTransaction',
          'error creating postgres transaction connection',
          'Database error',
          err
        );
        reject(errorObj);
      });
    });
  }

  // COMMIT A TRANSACTION AND CLOSE THE DATABASE CONNECTION
  async commitTransaction(connection) {
    return new Promise((resolve, reject) => {
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
          reject(errorObj);
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
          resolve(connection.results);
        }
      });
    });
  }

  // ROLLBACK A TRANSACTION AND CLOSE THE DATABASE CONNECTION
  async rollbackTransaction(connection) {
    return new Promise((resolve, reject) => {
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
  
              reject(errorObj);
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
              resolve({ 'rollback_results': 'success' });
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
          resolve();
        }
      }
      else {
        resolve();
      }
    });
  }

  // THIS FUNCTION IS USED SO ONE FUNCTION CAN RESOLVE THE CURRENT CONNECTION STATE AND RETURN A CONNECTION
  async resolveDbConnection(connection) {
    return new Promise((resolve, reject) => {
      if(connection == null) {
        this.getDbConnection()
        .then((db_connection) => {
          resolve(db_connection);
        })
        .catch((err) => {
          var errorObj = new ErrorObj(500,
            'da0500',
            __filename,
            'resolveDbConnection',
            'error creating a connection to postgres',
            'Database error',
            err
          );
          reject(errorObj);
        })
      }
      else {
        resolve(connection);
      }
    });
  }

  // RELEASES A CONNECTION (IF YOU NEED TO DO THAT MANUALLY)
  async releaseConnection(connection) {
    return new Promise((resolve, reject) => {
      if(connection != null && !connection.isReleased) {
        if(connection.transactional) {
          this.rollbackTransaction(connection)
          .then((rollback_res) => {
            delete connection.transactional;
            resolve();
          })
          .catch((rollback_err) => {
            try {
              connection.release();
            }
            catch(e) {
              console.log('Problem releasing connection to db:');
              console.log(e);
            }
            connection.isReleased = true;
  
            resolve();
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
          
          resolve();
        }
      }
      else {
        resolve();
      }
    });
  }

  // ================================================================================
  //THIS FUNCTION GLOBALIZES ALL QUERIES (SELECT) AND NON QUERIES (INSERT UPDATE DELETE ETC)
  //CONDITIONALLY CREATES AND DESTROYS CONNECTIONS DEPENDING IF THEY ARE TRANSACTIONAL OR NOT
  async ExecutePostgresQuery(query, params, connection, isStreaming) {
    return new Promise((resolve, reject) => {
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
      .then((db_connection) => {

        // PERFORM THE QUERY
        if(!isStreaming) {
          db_connection.client.query(pg_query)
          .then((res) => {
            db_connection.results = res.rows;

            // IF THE ARG connection PASSED INTO THE FUNCTION IS null/undefined
            // THIS IS A ONE-OFF AND WE MUST SHUT DOWN THE CONNECTION WE MADE
            // BEFORE RETURNING THE RESULTS
            if(connection == null) {
              that.releaseConnection(db_connection)
              .then(() => {
                resolve(db_connection);
              });
            }
            // OTHERWISE THIS IS ONE CALL IN A CHAIN ON A SINGLE CONNECTION
            // SO WE SHOULD PASS BACK THE CONNECTION WITH RESULTS
            else {
              resolve(db_connection);
            }
          })
          .catch((qry_err) => {
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
              reject(errorObj);
            }
            // OTHERWISE, THIS IS ONE CALL IN A CHAIN ON A SINGLE CONNECTION
            else {
              // IF THIS IS PART OF A TRANSACTIONAL SEQUENCE, WE NEED TO ROLL BACK
              // AND FAIL OUT
              if(db_connection.transactional) {
                this.rollbackTransaction(db_connection)
                .then((rollback_res) => {
                  var errorObj = new ErrorObj(500,
                                'da0502',
                                __filename,
                                'ExecutePostgresQuery',
                                'error querying postgres--transaction rolled back',
                                'Database error',
                                qry_err
                              );
                  reject(errorObj);
                })
                .catch((rollback_err) => {
                  reject(rollback_err.AddToError(__filename, 'ExecutePostgresQuery'));
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
                reject(errorObj);
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
              .finally(() => {
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
          resolve(db_connection);
        }
      })
      .catch((err) => {
        var errorObj = new ErrorObj(500,
                      'da0505',
                      __filename,
                      'ExecutePostgresQuery',
                      'error connecting to postgres',
                      'Database error',
                      err
                    );
        reject(errorObj);
      });
    });
  }

  // RUN ARBITRARY SQL STATEMENTS
  async runSql(sqlStatement, params, connection, isStreaming) {
    return new Promise((resolve, reject) => {
      this.ExecutePostgresQuery(sqlStatement, params, connection, isStreaming)
      .then((connection) => {
        resolve(connection.results);
      })
      .catch((err) => {
        if(err && typeof(err.AddToError) === 'function') {
          reject(err.AddToError(__filename, 'runSql'));
        }
        else {
          let errorObj = new ErrorObj(500,
                                      'da0090',
                                      __filename,
                                      'runSql',
                                      'psql error',
                                      'There was a problem with your request.',
                                      err);
          reject(errorObj);
        }
      });
    });
  }

  async GetDeadSessions(timeOut, markAsEnded) {
    return new Promise((resolve, reject) => {
      var minutes = "'" + timeOut + " minutes'";
      var qry = "select * from bs3_sessions where last_touch < (NOW() - INTERVAL " + minutes + ")";
      var qry_params = [];
      if(markAsEnded) qry = "UPDATE bs3_sessions SET ended_at = NOW() WHERE last_touch < (NOW() - INTERVAL " + minutes + ") RETURNING *";
      this.ExecutePostgresQuery(qry, qry_params, null)
      .then((connection) => {
        resolve(connection.results);
      })
      .catch((err) => {
        reject(err.AddToError(__filename, 'GetDeadSessions'));
      });
    });
  }

  async DeleteSessions(dsIds) {
    return new Promise((resolve, reject) => {
      let qry = "DELETE FROM bs3_sessions WHERE id = ANY($1)";
      this.ExecutePostgresQuery(qry, [dsIds])
      .then((delRes) => {
        resolve();
      })
      .catch((err) => {
        reject(err);
      });
    });
  }

  async UpdateLastTouch(sid) {
    return new Promise((resolve) => {
      let sql = 'UPDATE bs3_sessions SET last_touch = NOW() WHERE id = $1 RETURNING id';
      let params = [sid];
      this.runSql(sql, params)
      .then((updRes) => {
        resolve({success:true});
      })
      .catch((updErr) => {
        console.error(updErr);
        // DON'T REJECT.  IF THIS FAILS, WE STILL WANT TO RETURN SUCCESS
        // IF THE CALL WAS SUCCESSFUL
        resolve({success:false, message:updErr});
      });
    })
  }

  async findUser(id, username, email, connection) {
    return new Promise((resolve, reject) => {
      if(!id) id = null;
      if(!username) username = null;
      if(!email) email = null;
    
      if(id || username || email) {
        let sql = "SELECT * FROM bs3_users WHERE (id = $1 OR LOWER(username) = LOWER($2) OR LOWER(email) = LOWER($3)) AND deleted_at IS NULL";
        let params = [id, username, email];
    
        this.ExecutePostgresQuery(sql, params, connection)
        .then((userRes) => {
          resolve(userRes.results)
        })
        .catch((err) => {
          if(err && typeof(err.AddToError) === 'function') {
            reject(err.AddToError(__filename, 'find user'));
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
            reject(errorObj);
          }
        });
      }
      else {
        resolve(null);
      }
    });
  }

  async getAllUsers(connection) {
    return new Promise((resolve, reject) => {
      let sql = "SELECT * FROM bs3_users WHERE deleted_at IS NULL";
      this.runSql(sql,[],connection)
      .then((userRes) => {
        resolve(userRes);
      })
      .catch((allUsrErr) => {
        let errorObj = new ErrorObj(500,
                                    'da0204',
                                    __filename,
                                    'getAllUsers',
                                    'error gettomg users',
                                    'There was a problem with your request',
                                    allUsrErr
                                  );
        reject(errorObj);
      })
    });
  }

  async GenerateForgotPasswordToken(email, username) {
    return new Promise((resolve, reject) => {
      this.findUser(null, username, email)
      .then((userObj) => {
        if (userObj.locked) {
          reject(new ErrorObj(
            403,
            'a2006',
            __filename,
            'forgotPassword',
            'bsuser is locked',
            'Unauthorized'
          ));
          return;
        }
        else {
          return Promise.all([userObj, this.utilities.getHash(null, null, 48)]);
        }
      })
      .then(([userObj, tkn]) => {
        if (userObj.forgot_password_tokens === undefined || userObj.forgot_password_tokens === null) {
          userObj.forgot_password_tokens = [tkn];
        }
        else {
          userObj.forgot_password_tokens.push(tkn);
        }
        return Promise.all([tkn, this.updateCredentialsForUser(userObj.id, null, null, userObj.forgot_password_tokens)]);
      })
      .then(([tkn]) => {
        resolve(tkn);
      })
      .catch((err) => {
        reject(err);
      });
    });
  }

  async getActiveTokens() {
    return new Promise((resolve, reject) => {
      let sql = "SELECT token FROM bs3_sessions WHERE ended_at IS NULL";
      this.runSql(sql, [])
      .then((tokenRes) => {
        resolve(tokenRes.map(tknObj => tknObj.token));
      })
      .catch((err) => {
        reject(err.AddToError(__filename, 'getActiveTokens'));
      });
    });
  }

  async startSession(token, userId, clientInfo, isAnonymous, connection) {
    return new Promise((resolve, reject) => {
      if(isAnonymous == null) isAnonymous = false;
      let sql = "INSERT INTO bs3_sessions(token, user_id, client_info, anonymous, created_at, last_touch) VALUES($1, $2, $3, $4, NOW(), NOW()) RETURNING *";
      let params = [token, userId, clientInfo, isAnonymous]
    
      this.runSql(sql, params, connection)
      .then((sessRes) => {
        resolve(sessRes[0]);
      })
      .catch((err) => {
        reject(err.AddToError(__filename, 'startSession', 'Problem starting up a new session'));
      });
    });
  }

  async getUserById(id, connection) {
    return new Promise((resolve, reject) => {
      if(id) {
        var qry = "SELECT * FROM bs3_users WHERE id = $1 AND deleted_at IS NULL";
        var qry_params = [id];
        this.ExecutePostgresQuery(qry, qry_params, connection)
        .then((connection) => {
          if (connection.results.length === 0) {
            var errorObj = new ErrorObj(404,
              'da0160',
              __filename,
              'getUserById',
              'no user found',
              'Cannot find user.',
              null
            );
            reject(errorObj);
          }
          else if (connection.results.length === 1) {
            resolve(connection.results[0]);
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
            reject(errorObj);
          }
        })
        .catch((err) => {
          try {
            reject(err.AddToError(__filename, 'getUserById'));
          }
          catch(e) {console.log(e)}
        });
      }
      else {
        resolve(null);
      }
    });
  }

  async getUserByUserName(username, connection) {
    return new Promise((resolve, reject) => {
      if(username) {
        var qry = "SELECT * FROM bs3_users WHERE LOWER(username) = LOWER($1) AND deleted_at IS NULL";
        var qry_params = [username];
        this.ExecutePostgresQuery(qry, qry_params, connection)
        .then((connection) => {
          if (connection.results.length === 0) {
            var errorObj = new ErrorObj(404,
              'da0162',
              __filename,
              'getUserByUserName',
              'no user found',
              'Cannot find user.',
              null
            );
            reject(errorObj);
          }
          else if (connection.results.length === 1) {
            resolve(connection.results[0]);
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
            reject(errorObj);
          }
        })
        .catch((err) => {
          try {
            reject(err.AddToError(__filename, 'getUserByUserName'));
          }
          catch(e) {console.log(e)}
        });
      }
      else {
        resolve(null);
      }
    });
  }

  async getUserByEmail(email, connection) {
    return new Promise((resolve, reject) => {
      if(email) {
        var qry = "SELECT * FROM bs3_users WHERE LOWER(email) = LOWER($1) AND deleted_at IS NULL";
        var qry_params = [email];
        this.ExecutePostgresQuery(qry, qry_params, connection)
        .then((connection) => {
          if (connection.results.length === 0) {
            var errorObj = new ErrorObj(404,
              'da0164',
              __filename,
              'getUserByEmail',
              'no user found',
              'Cannot find user.',
              null
            );
            reject(errorObj);
          }
          else if (connection.results.length === 1) {
            resolve(connection.results[0]);
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
            reject(errorObj);
          }
        })
        .catch((err) => {
          try {
            reject(err.AddToError(__filename, 'getUserByEmail'));
          }
          catch(e) {console.log(e)}
        });
      }
      else {
        resolve(null);
      }
    });
  }

  async getUserByClientId(cid, includeCreds, connection) {
    return new Promise((resolve, reject) => {
      if(cid) {
        var qry = "SELECT usr.*";
        if(includeCreds) qry += ", creds.salt, creds.client_secret"; 
        qry += " FROM bs3_users usr JOIN bs3_credentials creds ON creds.user_id = usr.id WHERE creds.client_id = $1 AND creds.deleted_at IS NULL AND usr.deleted_at IS NULL";
        var qry_params = [cid];
        this.ExecutePostgresQuery(qry, qry_params, connection)
        .then((connection) => {
          if (connection.results.length === 0) {
            var errorObj = new ErrorObj(404,
              'da0166',
              __filename,
              'getUserByClientId',
              'no user found',
              'Cannot find user.',
              null
            );
            reject(errorObj);
          }
          else if (connection.results.length === 1) {
            resolve(connection.results[0]);
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
            reject(errorObj);
          }
        })
        .catch((err) => {
          try {
            reject(err.AddToError(__filename, 'getUserByClientId'));
          }
          catch(e) {console.log(e)}
        });
      }
      else {
        resolve(null);
      }
    });
  }

  async getUserByExternalIdentityId(exid, connection) {
    return new Promise((resolve, reject) => {
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
          reject(errorObj);
        }
        else if (usersRes.length === 1) {
          resolve(usersRes[0]);
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
          reject(errorObj);
        }
      })
      .catch((err) => {
        var errorObj = new ErrorObj(500,
                                    'da3170',
                                    __filename,
                                    'getUserByExternalIdentityId',
                                    '',
                                    'Found multiple users with that client id.',
                                    null
                                  );
        reject(errorObj);
      });
    });
  }

  async getUserByForgotPasswordToken(fptkn, connection) {
    return new Promise((resolve, reject) => {
      if(fptkn) {
        var qry = "SELECT DISTINCT bu.* FROM bs3_users bu INNER JOIN bs3_credentials bc ON bc.user_id = bu.id WHERE bc.forgot_password ? $1 AND bc.deleted_at IS NULL";
        var qry_params = [fptkn];
        this.ExecutePostgresQuery(qry, qry_params, connection)
        .then((connection) => {
          if (connection.results.length === 0) {
            var errorObj = new ErrorObj(404,
              'da0164',
              __filename,
              'getUserByForgotPasswordToken',
              'no user found',
              'Cannot find user.',
              null
            );
            reject(errorObj);
          }
          else if (connection.results.length === 1) {
            resolve(connection.results[0]);
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
            reject(errorObj);
          }
        })
        .catch((err) => {
          try {
            reject(err.AddToError(__filename, 'getUserByForgotPasswordToken'));
          }
          catch(e) {console.log(e)}
        });
      }
      else {
        resolve(null);
      }
    });
  }

  async deleteUser(uid, connection) {
    return new Promise((resolve, reject) => {
      let sql = "UPDATE bs3_users SET deleted_at = NOW() WHERE id = $1 RETURNING id";
      let params = [uid];
    
      this.runSql(sql, params, connection)
      .then((delRes) => {
        if(delRes.length > 0) {
          resolve({success: true});
        }
        else {
          reject({success:false, message:'problem deleting user'});
        }
      })
      .catch((delErr) => {
        let errorObj = new ErrorObj(500,
                                    'da0170',
                                    __filename,
                                    'deleteUser',
                                    'problem deleting user',
                                    'There was a problem with your request.',
                                    delErr
                                  );
        reject(errorObj);
      })
    });
  }

  async createUser(userObj) {
    return new Promise((resolve, reject) => {
      this.startTransaction()
      .then((dbHandle) => {
        let sql = `INSERT INTO bs3_users(account_type, username, email, roles, external_id, locked, created_at) VALUES ($1, $2, $3, $4, $5, $6, $7) RETURNING *`;
        let params = [userObj.account_type, userObj.username, userObj.email, JSON.stringify(userObj.roles), userObj.external_id, false, new Date().toISOString()];
        return Promise.all([dbHandle, this.runSql(sql, params, dbHandle)]);
      })
      .then(([dbHandle, userRes]) => {
        let sql = `INSERT INTO bs3_credentials(salt, password, client_id, client_secret, created_at, user_id) VALUES($1, $2, $3, $4, $5, $6)`;
        let params = [userObj.salt, userObj.password || null, userObj.client_id || null, userObj.client_secret || null, new Date().toISOString(), userRes[0].id];
        let outUsr = userRes[0];
        if(userObj.client_id) outUsr['client_id'] = userObj.client_id;
        if(userObj.client_id) outUsr['client_secret'] = userObj.client_secret;
        return Promise.all([dbHandle, outUsr, this.runSql(sql, params, dbHandle)]);
      })
      .then(([dbHandle, usr, credRes]) => {
        return Promise.all([usr, this.commitTransaction(dbHandle)]);
      })
      .then(([usr, commitRes]) => {
        resolve(usr);
      })
      .catch((err) => {
        if(err && typeof(err.AddToError) === 'function') {
          reject(err.AddToError(__filename, 'createUser'));
        }
        else {
          let errorObj = new ErrorObj(500,
                                      'da3000',
                                      __filename,
                                      'createUser',
                                      'problem creating user',
                                      'There was a problem creating this user',
                                      err);
          reject(errorObj);
        }
      })
    });
  }

  async updateJsonbField(tableName, fieldname, updateObj, whereClause) {
    return new Promise((resolve, reject) => {
      let sql = `UPDATE ${tableName} SET ${fieldname} = ${fieldname} || $1`;
      if(whereClause) {
        sql += ` WHERE ${whereClause}`;
      } 
      sql += ` RETURNING *`;
      let params = [JSON.stringify(updateObj)];
    
      this.runSql(sql, params)
      .then((updRes) => {
        resolve(updRes);
      })
      .catch((err) => {
        reject(err.AddToError(__filename, 'updateJsonbField'));
      })
    });
  }

  async saveApiCredentials(clientId, salt, hashedSecret, uid) {
    return new Promise((resolve, reject) => {
      if(clientId && salt && hashedSecret && uid) {
        let sql = 'INSERT INTO bs3_credentials(client_id, salt, client_secret, user_id) VALUES($1, $2, $3, $4) RETURNING *';
        let params = [clientId, salt, hashedSecret, uid];
        this.runSql(sql, params)
        .then((credRes) => {
          if(credRes.length > 0) {
            resolve(credRes[0]);
          }
          else {
            let errorObj = new ErrorObj(500,
                                        'da3002',
                                        __filename,
                                        'saveApiCredentials',
                                        'problem saving to db',
                                        'There was a problem saving credentials',
                                        null);
            reject(errorObj);
          }
        })
        .catch((err) => {
          if(err && typeof(err.AddToError) === 'function') {
            reject(err.AddToError(__filename, 'saveApiCredentials'));
          }
          else {
            let errorObj = new ErrorObj(500,
                                      'da3001',
                                      __filename,
                                      'saveApiCredentials',
                                      'problem saving to db',
                                      'There was a problem saving credentials',
                                      err);
            reject(errorObj);
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
        reject(errorObj);
      }
    });
  }

  async updateApiCredentials(clientId, salt, hashedSecret) {
    return new Promise((resolve, reject) => {
      if(clientId && salt && hashedSecret && uid) {
        let sql = 'UPDATE bs3_credentials SET salt = $2, client_secret = $3 WHERE client_id = $1 RETURNING id';
        let params = [clientId, salt, hashedSecret];
        this.runSql(sql, params)
        .then((credRes) => {
          resolve(credRes);
        })
        .catch((err) => {
          if(err && typeof(err.AddToError) === 'function') {
            reject(err.AddToError(__filename, 'updateApiCredentials'));
          }
          else {
            let errorObj = new ErrorObj(500,
                                      'da3101',
                                      __filename,
                                      'updateApiCredentials',
                                      'problem saving to db',
                                      'There was a problem saving credentials',
                                      err);
            reject(errorObj);
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
        reject(errorObj);
      }
    });
  }

  async getSession(sid, tkn) {
    return new Promise((resolve, reject) => {
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
          resolve(sessRes[0]);
        }
        else if(sessRes.length === 0) {
          resolve(null);
        }
        else {
          let errorObj = new ErrorObj(500,
                                      'da0080',
                                      __filename,
                                      'getSession',
                                      'multiple sessions found',
                                      'There was a problem with your request',
                                      null);
          reject(errorObj);
        }
      })
      .catch((err) => {
        let errorObj = new ErrorObj(500,
                                  'da0081',
                                  __filename,
                                  'getSession',
                                  'db error',
                                  'There was a problem with your request',
                                  err);
        reject(errorObj);
      });
    });
  }

  async getUserBySession(sid, tkn) {
    return new Promise((resolve, reject) => {
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
          resolve(sessRes[0]);
        }
        else if(sessRes.length === 0) {
          resolve(null);
        }
        else {
          let errorObj = new ErrorObj(500,
                                      'da0082',
                                      __filename,
                                      'getUserBySession',
                                      'multiple sessions found',
                                      'There was a problem with your request',
                                      null);
          reject(errorObj);
        }
      })
      .catch((err) => {
        let errorObj = new ErrorObj(500,
                                  'da0083',
                                  __filename,
                                  'getUserBySession',
                                  'db error',
                                  'There was a problem with your request',
                                  err);
        reject(errorObj);
      });
    });
  }

  async attachUserToSession(uid, sid) {
    return new Promise((resolve, reject) => {
      let sql = "UPDATE bs3_sessions SET user_id = $1 WHERE id = $2";
      this.runSql(sql, [uid, sid])
      .then((updRes) => {
        resolve({success:true});
      })
      .catch((err) => {
        let errorObj = new ErrorObj(500,
                                    'da0090',
                                    __filename,
                                    'attachUserToSession',
                                    'db error',
                                    'There was a problem with your request',
                                    err);
        reject(errorObj);
      });
    });
  }

  async getCredentialsForUser(userId, connection) {
    return new Promise((resolve, reject) => {
      let sql = "SELECT * FROM bs3_credentials WHERE user_id = $1 AND deleted_at IS NULL";
      let params = [userId];
    
      this.runSql(sql, params, connection)
      .then((credRes) => {
        resolve(credRes);
      })
      .catch((err) => {
        let errorObj = new ErrorObj(500,
                                    'da0100',
                                    __filename,
                                    'getCredentialsForUser',
                                    'db error',
                                    'There was a problem with your request',
                                    err);
        reject(errorObj);
      });
    });
  }

  async updateCredentialsForUser(userId, salt, password, forgotPasswordToken, connection) {
    return new Promise((resolve, reject) => {
      let params = [userId];
      let sql = "UPDATE bs3_credentials SET modified_at = NOW()";
      if(salt) {
        params.push(salt);
        sql += `, salt = $${params.length}`;
      }
      if(password) {
        params.push(password);
        sql += `, password = $${params.length}, forgot_password = '[]'::jsonb`;
      }
      else if(forgotPasswordToken) {
        sql += `, forgot_password = COALESCE(forgot_password, '[]'::JSONB) || '["${forgotPasswordToken}"]'::jsonb`;
      }
      sql += ` WHERE user_id = $1 AND deleted_at IS NULL AND password IS NOT NULL`;

      this.runSql(sql, params, connection)
      .then((updRes) => {
        resolve(updRes);
      })
      .catch((err) => {
        let errorObj = new ErrorObj(500,
                                    'da0110',
                                    __filename,
                                    'updateCredentialsForUser',
                                    'db error',
                                    'There was a problem with your request',
                                    err);
        reject(errorObj);
      });
    });
  }

  async deleteCredentialsByClientId(clientId) {
    return new Promise((resolve, reject) => {
      let sql = `UPDATE bs3_credentials SET deleted_at = NOW() WHERE client_id = $1 RETURNING id`;
      this.runSql(sql, [clientId])
      .then((res) => {
        if(res.length > 0) {
          resolve({success: true});
        }
        else {
          let errorObj = new ErrorObj(500,
                                      'da0120',
                                      __filename,
                                      'deleteCredentialsByClientId',
                                      'db error',
                                      'There was a problem with your request',
                                      null);
          reject(errorObj);
        }
      })
      .catch((err) => {
        let errorObj = new ErrorObj(500,
                                    'da0121',
                                    __filename,
                                    'deleteCredentialsByClientId',
                                    'db error',
                                    'There was a problem with your request',
                                    err);
        reject(errorObj);
      })
    });
  }

  async updateUserInfo(userId, locked, roles, email, exId, username) {
    return new Promise((resolve, reject) => {
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

      if(username) {
        params.push(username);
        sql += `, username = $${params.length}`;
      }

      sql += ` WHERE id = $1 RETURNING *`;

      this.runSql(sql, params)
      .then((res) => {
        if(res.length > 0) {
          resolve(res[0]);
        }
        else {
          let errorObj = new ErrorObj(500,
                                      'da0121',
                                      __filename,
                                      'updateUserInfo',
                                      'no user updated',
                                      'There was a problem update user info',
                                      null);
          reject(errorObj);
        }
      })
      .catch((err) => {
        let errorObj = new ErrorObj(500,
                                    'da0120',
                                    __filename,
                                    'updateUserInfo',
                                    'db error',
                                    'There was a problem with your request',
                                    err);
        reject(errorObj);
      });
    });
  }
}

const instance = new DataAccess();
module.exports = instance;