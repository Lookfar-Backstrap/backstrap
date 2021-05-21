const { Pool, Client } = require('pg');
const QueryStream = require('pg-query-stream');
var Q = require('q');
var fs = require('fs');
const Stream = require('stream');

var DataAccessExtension = require('./dataAccess_ext.js');
const { util } = require('chai');

var utilities;
var pool;

// ================================================================================
// CONSTRUCTOR
// ------------------------------------------------------------------
// Create the class, setup pg, instantiate the extension file
// ------------------------------------------------------------------
var DataAccess = function (dbConfig, util, settings) {
	utilities = util;

	//INSTANTIATE THE PG pool CONSTANT
	pool = new Pool({
		user: dbConfig.db.user,
		host: dbConfig.db.host,
		database: dbConfig.db.name,
		password: dbConfig.db.pass,
		port: dbConfig.db.port,
		max: dbConfig.db.max_connections || 1000
	});

  this.extension = new DataAccessExtension(this, dbConfig);
  
  // IF THERE IS A SERVICES DIRECTORY SPECIFIED IN Settings.json
  // RUN THROUGH IT AND INSTANTIATE EACH SERVICE FILE
  let serviceDir = settings.data.data_service_directory;
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
};


// ================================================================================
// SCHEMA.JS FUNCTIONS 
// -------------------------------------------------------------------
// Schema.js performs several checks for intital db/user state and will 
// create the default schema depending on the current state of the db
// -------------------------------------------------------------------
DataAccess.prototype.CheckForDatabase = function (db_name, db_user, db_pass, db_host, db_port, callback) {
	var deferred = Q.defer();
	
	var connectionString = 'postgres://' + db_user + ':' + db_pass + '@' + db_host + ':' + db_port + '/' + db_name;
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

	deferred.promise.nodeify(callback);
	return deferred.promise;
};

DataAccess.prototype.CreateDatabase = function (db_name, db_user, db_pass, db_host, db_port, callback) {
	var deferred = Q.defer();
	
	var qryString = 'CREATE DATABASE ' + db_name;
	var qryParams = [];
	
	ExecutePostgresQuery(qryString, qryParams, null)
	.then(res => {
		deferred.resolve(res);
	})
	.fail(err => {
		deferred.resolve(err);
	})

	deferred.promise.nodeify(callback);
	return deferred.promise;
};
// -------------------------------------------------------------------

// ================================================================================
// CONNECTION LIFECYCLE FUNCTIONS
// -------------------------------------------------------------------
// These functions are responsible for creating and tearing down
// connections to the database as well as starting, commiting, and
// rolling back transactions
// -------------------------------------------------------------------
// START A CONNECTION TO THE DATABASE TO USE FUNCTIONS 
var getDbConnection = (callback) => {
  var deferred = Q.defer();

	pool.connect((err, client, done) => {
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

	deferred.promise.nodeify(callback);
	return deferred.promise;
}
DataAccess.prototype.getDbConnection = getDbConnection;

// CLOSE A CONNECTION TO THE DATABASE AFTER USING FUNCTIONS
var closeDbConnection = (connection, callback) => {
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

	deferred.promise.nodeify(callback);
	return deferred.promise;
}
DataAccess.prototype.closeDbConnection = closeDbConnection;

// GET A CONNECTION TO THE DATABASE AND START A TRANSACTION

var startTransaction = (callback) => {
  var deferred = Q.defer();

	getDbConnection()
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

	deferred.promise.nodeify(callback);
	return deferred.promise;
}
DataAccess.prototype.startTransaction = startTransaction;

// COMMIT A TRANSACTION AND CLOSE THE DATABASE CONNECTION
var commitTransaction = (connection, callback) => {
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
			releaseConnection(connection);
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

	deferred.promise.nodeify(callback);
	return deferred.promise;
}
DataAccess.prototype.commitTransaction = commitTransaction;

// ROLLBACK A TRANSACTION AND CLOSE THE DATABASE CONNECTION
var rollbackTransaction = () => {
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

	deferred.promise.nodeify(callback);
	return deferred.promise;
}
DataAccess.prototype.rollbackTransaction = rollbackTransaction;

//THIS FUNCTION IS USED SO ONE FUNCTION CAN RESOLVE THE CURRENT CONNECTION STATE AND RETURN A CONNECTION
var resolveDbConnection = (connection, callback) => {
	var deferred = Q.defer();
	
	if(connection == null) {
		getDbConnection()
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

	deferred.promise.nodeify(callback);
	return deferred.promise;
}

// RELEASES A CONNECTION (IF YOU NEED TO DO THAT MANUALLY)
var releaseConnection = (connection) => {
	var deferred = Q.defer();

	if(connection != null && !connection.isReleased) {
		if(connection.transactional) {
			rollbackTransaction(connection)
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
var ExecutePostgresQuery = (query, params, connection, isStreaming, callback) => {
  var deferred = Q.defer();
	var pg_query = query;
	//THE QUERY CONFIG OBJECT DOES NOT WORK IF THERE IS AN EMPTY ARRAY OF PARAMS
	if (params != null && params.length > 0) {
		pg_query = {
			text: query,
			values: params,
		}
	}

	resolveDbConnection(connection)
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
          releaseConnection(db_connection)
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
            rollbackTransaction(db_connection)
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
          rollbackTransaction(db_connection)
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

	deferred.promise.nodeify(callback);
	return deferred.promise;
}
DataAccess.prototype.ExecutePostgresQuery = ExecutePostgresQuery;



// ================================================================================
// DATA ACCESS UTILITIES
// -------------------------------------------------------------------
// These functions handle various common tasks
// -------------------------------------------------------------------
// RUN ARBITRARY SQL STATEMENTS
var runSql = (sqlStatement, params, connection, isStreaming) => {
  var deferred = Q.defer();
	
	ExecutePostgresQuery(sqlStatement, params, connection, isStreaming)
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
    }
	});

	return deferred.promise;
}
DataAccess.prototype.runSql = runSql;



DataAccess.prototype.GetDeadSessions = function (timeOut, callback) {
	var deferred = Q.defer();
	var minutes = "'" + timeOut + " minutes'";
	var qry = "select row_id as rid, data from session where (data->>'last_touch')::timestamp with time zone < (NOW() - INTERVAL " + minutes + ")";
	var qry_params = [];
	ExecutePostgresQuery(qry, qry_params, null)
	.then(function (connection) {
		deferred.resolve(connection.results);
	})
	.fail(function (err) {
		deferred.reject(err.AddToError(__filename, 'GetDeadSessions'));
	});

	deferred.promise.nodeify(callback);
	return deferred.promise;
};

DataAccess.prototype.DeleteSessions = function(dsIds, callback) {
  var deferred = Q.defer();

  var idString = dsIds.join(',');
  var db_connection;

  startTransaction()
  .then((db_handle) => {
    db_connection = db_handle;
    var qry_linking = "DELETE FROM bsuser_session WHERE right_id IN ("+idString+")";
    return [db_handle, ExecutePostgresQuery(qry_linking, [], db_handle)];
  })
  .spread((db_handle, qry_res) => {
    var qry = "DELETE FROM session WHERE row_id IN ("+idString+")";
    return [db_handle, ExecutePostgresQuery(qry, [], db_handle)];
  })
  .spread((db_handle, qry_res) => {
    return commitTransaction(db_handle);
  })
  .then(() => {
    deferred.resolve();
  })
  .fail((err) => {
    rollbackTransaction(db_connection)
    .finally(() => {
      deferred.reject(err);
    })
  });

  deferred.promise.nodeify(callback);
  return deferred.promise;
};


DataAccess.prototype.findUser = function (email, username, connection, callback) {
	var deferred = Q.defer();

	var qry = "SELECT * FROM bsuser WHERE data->>'email' ILIKE '" + email + "'";
	var qry_params = [];
	ExecutePostgresQuery(qry, qry_params, null)
	.then(function (connection) {
		var results = connection.results;
		if (results.length <= 0) {
			qry = "SELECT * FROM bsuser WHERE data->>'username' ILIKE '" + username + "'";
			qry_params = [];
			ExecutePostgresQuery(qry, qry_params, null)
			.then(function (connection) {
				var results = connection.results;
				if (results.length <= 0) {
					releaseConnection(connection)
					.then(function() {
						var errorObj = new ErrorObj(500,
							'da0200',
							__filename,
							'findUser',
							'no results found',
							'No results found.',
							{}
						);
						deferred.reject(errorObj);
					});
				}
				else if (results.length > 1) {
					releaseConnection(connection)
					.then(function() {
						var errorObj = new ErrorObj(500,
							'da0201',
							__filename,
							'findUser',
							'multiple results found',
							'Multiple results found',
							{}
						);
						deferred.reject(errorObj);
					});
				}
				else {
					deferred.resolve(results[0]);
				}
			})
			.fail(function (err) {
				deferred.reject(err.AddToError(__filename, 'findUser'));;
			});
		}
		else if (results.length > 1) {
			releaseConnection(connection)
			.then(function() {
				var errorObj = new ErrorObj(500,
					'da0202',
					__filename,
					'findUser',
					'multiple results found',
					'Multiple results found',
					{}
				);
				deferred.reject(errorObj);
			});
		}
		else {
			deferred.resolve(results[0]);
		}
	})
	.fail(function (err) {
		deferred.reject(err.AddToError(__filename, 'findUser'));;
	});

	deferred.promise.nodeify(callback);
	return deferred.promise;
};


DataAccess.prototype.GenerateForgotPasswordToken = (email, username) => {
  var deferred = Q.defer();

  DataAccess.prototype.findUser(email, username)
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
    return [tkn, DataAccess.prototype.updateJsonbField('bsuser', 'data', userObj)];
  })
  .spread(function(tkn) {
    deferred.resolve(tkn);
  })
  .fail(function(err) {
    deferred.reject(err);
  });

  return deferred.promise;
}




DataAccess.prototype.getActiveTokens = () => {
  var deferred = Q.defer();

  let sql = "SELECT data->>'token' FROM session";
  runSql(sql, [])
  .then((tokenRes) => {
    deferred.resolve(tokenRes.map(tknObj => tknObj.token));
  })
  .fail((err) => {
    deferred.reject(err.AddToError(__filename, 'getActiveTokens'));
  });

  return deferred.promise;
}


DataAccess.prototype.startSession = (userObj, sessionObj) => {
  var deferred = Q.defer();

  utilities.getUID()
  .then((uid) => {
    sessionObj.id = uid;
    return startTransaction();
  })
  .then((dbHandle) => {
    let sql = "INSERT INTO session(data) VALUES($1) RETURNING *";
    return [dbHandle, runSql(sql, [sessionObj], dbHandle)];
  })
  .spread((dbHandle, sessRes) => {
    let sess = sessRes[0].data;
    let sessRowId = sessRes[0].row_id;
    let sql = "INSERT INTO bsuser_session(left_id, right_id) VALUES((SELECT row_id FROM bsuser WHERE data->>'id' = $1), $2)";
    return [dbHandle, sess, runSql(sql, [userObj.id, sessRowId], dbHandle)];
  })
  .spread((dbHandle, sess, insRes) => {
    return [sess, commitTransaction(dbHandle)];
  })
  .spread((sess) => {
    deferred.resolve(sess);
  })
  .fail((err) => {
    deferred.reject(err.AddToError(__filename, 'startSession', 'Problem starting up a new session'));
  });
  
  return deferred.promise;
}

var attachUserToSession = (userObj, sessionObj, connection) => {
  var deferred = Q.defer();

  let sql = "INSERT INTO bsuser_session(left_id, right_id) VALUES((SELECT row_id FROM bsuser WHERE data->>'id' = $1), (SELECT row_id FROM session WHERE data->>'id' = $2))";
  let params = [userObj.id, sessionObj.id];
  runSql(sql, params, connection)
  .then((res) => {
    deferred.resolve({success:true});
  })
  .fail((attachErr) => {
    deferred.reject(attachErr.AddToError(__filename, 'attachUserToSession', 'Problem attaching user to session'));
  })

  return deferred.promise;
}
DataAccess.prototype.attachUserToSession = attachUserToSession;

DataAccess.prototype.getUserByUserName = (username) => {
  var deferred = Q.defer();

	var qry = "SELECT * FROM bsuser WHERE LOWER(bsuser.data->>'username') = LOWER($1)";
	var qry_params = [username];
	ExecutePostgresQuery(qry, qry_params, null)
	.then(function (connection) {
		if (connection.results.length === 0) {
			var errorObj = new ErrorObj(500,
				'da0160',
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
				'da0161',
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

	return deferred.promise;
}

DataAccess.prototype.createUser = (userObj) => {
  var deferred = Q.defer();

  let sql = `INSERT INTO bsuser(data) VALUES($1) RETURNING *`;
  let params = [JSON.stringify(userObj)];

  runSql(sql, params)
  .then((res) => {
    deferred.resolve(res);
  })
  .fail((err) => {
    deferred.reject(err.AddToError(__filename, 'createUser'));
  });

  return deferred.promise;
}


DataAccess.prototype.updateJsonbField = (tableName, fieldname, updateObj, whereClause) => {
  var deferred = Q.defer();

  let sql = `UPDATE ${tableName} SET ${fieldname} = ${fieldname} || $1 WHERE ${whereClause} RETURNING *`;
  let params = [JSON.stringify(updateObj)];

  runSql(sql, params)
  .then((updRes) => {
    deferred.resolve(updRes);
  })
  .fail((err) => {
    deferred.reject(err.AddToError(__filename, 'updateJsonbField'));
  })

  return deferred.promise;
}

exports.DataAccess = DataAccess;