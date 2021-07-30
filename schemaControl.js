var Q = require('q');

class SchemaControl {
  constructor() {
    this.dataAccess = null;
    this.accessControl = null;
  }

  init(da, ac) {
    this.dataAccess = da;
    this.accessControl = ac;
    Object.freeze(this);
  }

  update(name, user, pass, host, port) {
    var deferred = Q.defer();

		this.#checkDbExists(name, user, pass, host, port)
			.then(() => {
				return this.dataAccess.getDbConnection();
			})
			.then((connection) => {
				return [connection, this.#createInitialTables(connection)];
			})
			.spread((connection, res) => {
				return [res, this.dataAccess.closeDbConnection(connection)];
			})
			.spread((commit_res) => {
				return [this.#createDefaultUser()];
			})
			.then((res) => {
				deferred.resolve(res);
			})
			.fail((err) => {
				if (err !== undefined && err !== null && typeof (err.AddToError) === 'function') {
					deferred.reject(err.AddToError(__filename, 'updateSchema'));
				}
				else {
					var errorObj = new ErrorObj(500,
						'sc1001',
						__filename,
						'updateSchema',
						'error updating schema',
						'Database error',
						err
					);
					deferred.reject(errorObj);
				}
			});

		return deferred.promise;
  }

  #createInitialTables(connection) {
    var deferred = Q.defer();
  
    let createCmds = [];
    let createSessTable = false;
  
    this.#checkForTable('bs3_users', connection)
    .then((usrTblExists) => {
      if(!usrTblExists) {
        let usrTblCreate = `CREATE TABLE bs3_users (
                              id SERIAL PRIMARY KEY NOT NULL,
                              account_type VARCHAR(16),
                              username VARCHAR(128) UNIQUE,
                              email VARCHAR(256) UNIQUE,
                              locked BOOLEAN,
                              roles JSONB,
                              external_id VARCHAR(256),
                              created_at TIMESTAMP,
                              modified_at TIMESTAMP,
                              deleted_at TIMESTAMP
                            )`;
          createCmds.push(this.dataAccess.runSql(usrTblCreate, [], connection));
      }
      return this.#checkForTable('bs3_credentials', connection);
    })
    .then((credTblExists) => {
      if(!credTblExists) {
        let credTblCreate = `CREATE TABLE bs3_credentials (
                              id SERIAL PRIMARY KEY NOT NULL,
                              salt VARCHAR(128),
                              password TEXT,
                              client_id VARCHAR(256) UNIQUE,
                              client_secret VARCHAR(256),
                              forgot_password JSONB,
                              user_id INTEGER REFERENCES bs3_users(id),
                              created_at TIMESTAMP,
                              modified_at TIMESTAMP,
                              deleted_at TIMESTAMP
                            )`;
        createCmds.push(this.dataAccess.runSql(credTblCreate, [], connection));
      }
      return this.#checkForTable('bs3_sessions', connection);
    })
    .then((sessTblExists) => {
      if(!sessTblExists) {
        let sessTblCreate = `CREATE TABLE bs3_sessions (
                              id SERIAL PRIMARY KEY NOT NULL,
                              token VARCHAR(256),
                              created_at TIMESTAMP,
                              ended_at TIMESTAMP,
                              last_touch TIMESTAMP,
                              user_id INTEGER REFERENCES bs3_users(id),
                              anonymous BOOLEAN
                            )`;
        createCmds.push(this.dataAccess.runSql(sessTblCreate, [], connection));
        createSessTable = true;
      }
      return Q.all(createCmds);
    })
    .then((createRes) => {
      let idxCmds = [];
      if(createSessTable) {
        idxCmds.push(this.dataAccess.runSql('CREATE INDEX idx_token ON bs3_sessions(token)', [], connection));
        idxCmds.push(this.dataAccess.runSql('CREATE INDEX idx_user_id ON bs3_sessions(user_id)', [], connection));
      }
      
      if(idxCmds.length > 0) {
        Q.all(idxCmds)
        .then((createIdxRes) => {
          deferred.resolve({success:true});
        })
        .fail((idxErr) => {
          if(idxErr && typeof(idxErr.AddToError) === 'function') {
            deferred.reject(idxErr.AddToError(__filename, 'createInitialTables'));
          }
          else {
            let errorObj = new ErrorObj(500,
                                        'sc2001',
                                        __filename,
                                        'createInitialTables',
                                        'error creating indexes',
                                        'Problem creating tables',
                                        idxErr);
            deferred.reject(errorObj);
          }
        });
      }
      else {
        deferred.resolve({success: true});
      }
    })
    .fail((err) => {
      if(err && typeof(err.AddToError) === 'function') {
        deferred.reject(err.AddToError(__filename, 'createInitialTables'));
      }
      else {
        let errorObj = new ErrorObj(500,
                                    'sc2000',
                                    __filename,
                                    'createInitialTables',
                                    'postgres error',
                                    'Problem creating tables',
                                    err);
        deferred.reject(errorObj);
      }
    })
  
    return deferred.promise;
  }

  #createDefaultUser() {
    var deferred = Q.defer();
    var qry = "SELECT COUNT(*) FROM bs3_users WHERE LOWER(username) = 'bsroot'";
    var qry_params = [];
    this.dataAccess.ExecutePostgresQuery(qry, qry_params, null)
    .then((connection) => {
      if (parseInt(connection.results[0].count) === 0) {
        let userParams = {
          'username': 'bsroot',
          'first': 'bs3',
          'last': 'admin',
          'email': 'bsroot@backstrap.io',
          'password': 'abcd@1234',
          'roles': ['super-user']
        };
        this.accessControl.createUser('default', userParams, null, null)
        .then((createUserRes) => {
          deferred.resolve(createUserRes);
        })
        .fail((createUserErr) => {
          if(createUserErr && typeof(createUserErr.AddToError) === 'function') {
            deferred.reject(createUserErr.AddToError(__filename, 'createDefaultUser'));
          }
          else {
            let errorObj = new ErrorObj(500,
                                        'sc2002',
                                        __filename,
                                        'createDefaultUser',
                                        'error creating bsroot',
                                        'There was  problem creating the initial user.',
                                        createUserErr);
            deferred.reject(errorObj);
          }
        });
      }
      else {
        deferred.resolve(true);
      }
    })
    .fail((err) => {
      var errorObj = new ErrorObj(500,
        'sc1008',
        __filename,
        'createDefaultUser',
        'error creating default user',
        'Database error',
        err
      );
      deferred.reject(errorObj);
    });
  
    return deferred.promise;
  }

  #checkForTable(tableName, connection) {
    var deferred = Q.defer();
  
    var qry = "SELECT EXISTS ( " +
      "SELECT 1 " +
      "FROM   pg_catalog.pg_class c " +
      "JOIN   pg_catalog.pg_namespace n ON n.oid = c.relnamespace " +
      "WHERE  n.nspname = 'public' " +
      "AND    c.relname = '" + tableName + "' " +
      "AND    c.relkind = 'r' " +
      ");";
  
    var qry_params = [];
    this.dataAccess.ExecutePostgresQuery(qry, qry_params, connection)
      .then((connection) => {
        deferred.resolve(connection.results[0].exists);
      })
      .fail((err) => {
        var errorObj = new ErrorObj(500,
          'sc0008',
          __filename,
          'checkForTable',
          'error querying postgres',
          'Database error',
          err
        );
        deferred.reject(errorObj);
      });
  
    return deferred.promise;
  }

  #checkDbExists(db_name, db_user, db_pass, db_host, db_port) {
    var deferred = Q.defer();
    this.dataAccess.CreateDatabase(db_name, db_user, db_pass, db_host, db_port)
      .spread((err, res) => {
        //BECAUSE events.js THROWS AN UNHANDLED EXCEPTION WHEN 
        //QUERYING A DB THAT DOESNT EXIST, WE CANNOT DO SELECT 1 FROM pg_database WHERE datname = '" + db_name + "'
        //SO WE JUST CREATE AND IGNORE IF ERRORS BECAUSE IT EXISTS
        //42P04 == Datbase already exists
        if (err && err.code !== '42P04') {
          var errorObj = new ErrorObj(500,
            'sc0013',
            __filename,
            'checkDbExists',
            'error checking to see if database exists and creating if not',
            'Database error',
            err
          );
          deferred.reject(errorObj);
        }
        else {
          deferred.resolve();
        }
      })
      .fail((err) => {
        var errorObj = new ErrorObj(500,
          'sc0014',
          __filename,
          'getDatabase',
          'error connecting to postgres',
          'Database error',
          err
        );
        deferred.reject(errorObj);
      });
  
    return deferred.promise;
  }
}

var instance = new SchemaControl();
module.exports = instance;