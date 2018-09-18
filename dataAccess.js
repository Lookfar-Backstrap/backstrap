// ================================================================================
// dataAccess.js
// 
// DataAccess is responsible for reading from and writing to the database in
// Backstrap.  It includes some methods for running sql commands against the
// db and for retrieving and updating by row_id, the bulk of these functions
// are built around the Backstrap model-entity system.  
//
// Backstrap pulls descriptors of models from the models.json file (through the 
// models.js code). Instances of those models called entities are stored as a 
// single JSONB field and can be connected via linking tables to other entities.  
// They are accessed most often using an 'id' field.  At absolute minimum, an 
// entity must include an 'id' and an 'object_type'.
//
// 'immutableKeys' describes all fields in an entity which should only be
// manipulated by the system (aside from assigning object_type the first time).
// 
// 'object_type' is mapped to db table using the 'typeToCollectionMap' array which
// is initialized in the constructor here and maintained in memory.
//
// All possible relationships between two entities of 'object_type' x and y are
// described in the 'relationshipMap' array.  That is also maintained in memory
// and is used to determine in which linking table a relationship between 
// entities of type x and y may be found.
//
// All functions beginning with t_ take a db connection as the first argument.
// This db connection includes the actual connection, a release() function,
// and a boolean indicating if this is a transaction or simply a set of 
// t_ functions using the same connection.
// ================================================================================

const { Pool, Client } = require('pg')
var crypto = require('crypto');
var Q = require('q');
var async = require('async');

var DataAccessExtension = require('./dataAccess_ext.js');
var backstrapSql = require('./backstrapSql.js').BackstrapSql;

var utilities;
var models;
var dbConnection;
var pool;

// KEEPS TRACK OF THE TABLE NAME FOR EACH object_type.
var typeToCollectionMap = {
	'bsuser': 'bsuser',
	'session': 'session',
	'analytics': 'analytics',
	'webServiceCallDescriptor': 'service_call'
};

// KEEPS TRACK OF WHICH LINKING TABLE GOES WITH WHICH RELATIONSHIP
var relationshipMap = [
	{
		'type1': 'bsuser',
		'type2': 'session',
		'linkingTable': 'bsuser_session'
	},
	{
		'type1': 'bsuser',
		'type2': 'analytics',
		'linkingTable': 'bsuser_analytics'
	}
];

// THESE ARE SYSTEM FIELDS WHICH SHOULD NOT BE ALTERED MANUALLY. 
// ALL ENTITIES INCLUDE THESE KEYS.
var immutableKeys = ['id', 'object_type', 'is_active', 'created_at', 'updated_at'];

// ================================================================================
// CONSTRUCTOR
// ------------------------------------------------------------------
// Create the class, setup pg, instantiate the extension
// file, and setup backstrapSql.  Fill out the relationshipMap 
// and the typeToCollectionMap
// ------------------------------------------------------------------
var DataAccess = function (dbConfig, mdls, util) {
	utilities = util;

	//INSTANTIATE THE PG pool CONSTANT
	pool = new Pool({
		user: dbConfig.db.user,
		host: dbConfig.db.host,
		database: dbConfig.db.name,
		password: dbConfig.db.pass,
		port: dbConfig.db.port,
		max: 1000
	});

	this.extension = new DataAccessExtension(this, mdls);

	models = mdls;
	backstrapSql = new BackstrapSql(models);

	// RUN THROUGH THE MODELS AND ADD ENTRIES TO THE typeToCollectionMap
	// AND THE relationshipMap
	for (var mIdx = 0; mIdx < models.length; mIdx++) {
		var model = models[mIdx];
		this.AddTypeToCollectionMap(model.obj_type, model.obj_type);

		for (var rIdx = 0; rIdx < model.relationships.length; rIdx++) {
			var r = model.relationships[rIdx];
			var relMapObj = {
				'type1': model.obj_type,
				'type2': r.relates_to,
				'linkingTable': r.linking_table
			};
			this.AddRelationshipMap(relMapObj);
		}
	}
};

// ================================================================================
// RELATIONSHIP & TYPE DESCRIPTOR FUNCTIONS
// ------------------------------------------------------------------
// Functions for adding descriptors to the relationship-to-linking
// table map and the type-to-table map
// ------------------------------------------------------------------
// ADD A DESCRIPTOR TO THE RELATIONSHIP MAP FROM OUTSIDE DataAccess
DataAccess.prototype.AddRelationshipMap = function (rel) {
	var doAdd = true;
	relationshipMap.forEach(function (rm) {
		if (rm.linkingTable === rel.linkingTable) {
			doAdd = false;
		}
	});
	if (doAdd) {
		relationshipMap.push(rel);
	}
};

// ADD A DESCRIPTOR TO THE TYPE MAP FROM OUTSIDE DataAccess
DataAccess.prototype.AddTypeToCollectionMap = function (key, value) {
	typeToCollectionMap[key] = value;
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
	DataAccess.prototype.ExecutePostgresQuery(qry, qry_params, null)
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
	var defaultConnection = 'postgres://' + db_user + ':' + db_pass + '@' + db_host + ':' + db_port + '/template1';
	
	var qryString = 'CREATE DATABASE ' + db_name;
	var qryParams = [];
	
	DataAccess.prototype.ExecutePostgresQuery(qryString, qryParams, null)
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
DataAccess.prototype.getDbConnection = function (callback) {
	var deferred = Q.defer();

	pool.connect((err, client, done) => {
		if (!err) {
			deferred.resolve({ 'client': client, 'release': done, 'transactional': false, 'results': [] });
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
};

// CLOSE A CONNECTION TO THE DATABASE AFTER USING FUNCTIONS
DataAccess.prototype.closeDbConnection = function (connection, callback) {
	var deferred = Q.defer();
	if(!utilities.isNullOrUndefined(connection) && !connection.isReleased) {
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
};

// GET A CONNECTION TO THE DATABASE AND START A TRANSACTION
DataAccess.prototype.startTransaction = function (callback) {
	var deferred = Q.defer();

	DataAccess.prototype.getDbConnection()
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
};

// COMMIT A TRANSACTION AND CLOSE THE DATABASE CONNECTION
DataAccess.prototype.commitTransaction = function (connection, callback) {
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
			releaseConnection(connection);
			deferred.resolve(connection.results);
		}
	});

	deferred.promise.nodeify(callback);
	return deferred.promise;
};

// ROLLBACK A TRANSACTION AND CLOSE THE DATABASE CONNECTION
DataAccess.prototype.rollbackTransaction = function (connection, callback) {
	var deferred = Q.defer();

	if(!utilities.isNullOrUndefined(connection) && !connection.isReleased) {
		if(connection.isTransactional) {
			connection.client.query('ROLLBACK', (err) => {
				if (err) {

					if(!utilities.isNullOrUndefined(connection)) {
						connection.release();
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
					connection.release();
					connection.isReleased = true;
					deferred.resolve({ 'rollback_results': 'success' });
				}
			});
		}
		// THIS ISN'T ACTUALLY A TRANSACTION.  IT'S JUST A CHAIN OF CALLS
		// ON A SINGLE CONNECTION.  CLOSE THE CONNECTION, BUT DON'T WORRY
		// ABOUT ROLLING BACK.
		else {
			connection.release();
			connection.isReleased = true;
			deferred.resolve();
		}
	}
	else {
		deferred.resolve();
	}

	deferred.promise.nodeify(callback);
	return deferred.promise;
};

//THIS FUNCTION IS USED SO ONE FUNCTION CAN RESOLVE THE CURRENT CONNECTION STATE AND RETURN A CONNECTION
function resolveDbConnection(connection, callback) {
	var deferred = Q.defer();
	
	if(utilities.isNullOrUndefined(connection)) {
		DataAccess.prototype.getDbConnection()
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
function releaseConnection(connection) {
	var deferred = Q.defer();

	if(!utilities.isNullOrUndefined(connection) && !connection.isReleased) {
		if(connection.isTransactional) {
			dataAccess.rollbackTransaction(connection)
			.then(function(rollback_res) {
				deferred.resolve();
			})
			.fail(function(rollback_err) {
				connection.release();
				connection.isReleased = true;
				deferred.resolve();
			});
		}
		else {
			connection.release();
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
DataAccess.prototype.ExecutePostgresQuery = function (query, params, connection, callback) {
	var deferred = Q.defer();
	var pg_query = query;
	//THE QUERY CONFIG OBJECT DOES NOT WORK IF THERE IS AN EMPTY ARRAY OF PARAMS
	if (!utilities.isNullOrUndefined(params) && params.length > 0) {
		pg_query = {
			text: query,
			values: params,
		}
	}


	resolveDbConnection(connection)
	.then(function(db_connection) {

		// PERFORM THE QUERY
		db_connection.client.query(pg_query)
		.then(function(res) {
			db_connection.results = res.rows;
			//THE NEW pg 7 NPM PACKAGE RETURNS ROW QUERIES WITH THE KEY data FOR EACH ROW
			//WE ONLY WANT THE JSON OBJECT VALUE NOT THE KEY
			if (db_connection.results !== undefined && db_connection.results !== null && db_connection.results.length > 0) {
				var result = db_connection.results[0];
				var keys = Object.keys(result);
				if ((keys.length === 1 && keys[0] === 'data')
					|| (keys.length == 2 && keys[0] === 'row_id' && keys[1] === 'data')) {
					db_connection.results = db_connection.results.map(r => r.data);
				}
			}

			// IF THE ARG connection PASSED INTO THE FUNCTION IS null/undefined
			// THIS IS A ONE-OFF AND WE MUST SHUT DOWN THE CONNECTION WE MADE
			// BEFORE RETURNING THE RESULTS
			if(utilities.isNullOrUndefined(connection)) {
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
			if(utilities.isNullOrUndefined(connection)) {
				db_connection.release();
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
				if(db_connection.isTransactional) {
					DataAccess.prototype.rollbackTransaction(db_connection)
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
					db_connection.release();
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
};


// ================================================================================
// ENTITY FUNCTIONS
// ------------------------------------------------------------------
// These functions are responsible for creating, updating, and
// deleting entity instances.  They use objects which must include
// object_type and id fields.  The id field is generated whenever a
// new entity is created via createEntity() or saveEntity().
// deleteEntity() flips the is_active field of an entity to false
// while hardDeleteEntity actually removes it from the db.
// ------------------------------------------------------------------

// tableName -- THE NAME OF THE TABLE TO SAVE THE ENTITY
// obj -- THE ENTITY AS JSON INCLUDING THE 'object_type'
//			'id', 'created_at', AND 'is_active' ARE ADDED BY THE SYSTEM
// CREATE A NEW ENTITY
DataAccess.prototype.createEntity = function (tableName, obj, connection, callback) {
	var deferred = Q.defer();
	
	utilities.getUID()
	.then(function (uid_res) {
		obj.id = uid_res;
		obj.created_at = new Date();
		obj.is_active = true;

		var params = [obj];
		var qry = "INSERT INTO \"" + tableName + "\"(\"data\") VALUES($1) RETURNING \"row_id\"";

		DataAccess.prototype.ExecutePostgresQuery(qry, params, connection)
		.then(function (db_connection) {
			if (!utilties.isNullOrUndefined(connection)) {
				deferred.resolve({ object_id: uid_res, row_id: db_connection.results[0].row_id });
			}
			else {
				deferred.resolve(db_connection.results);
			}
		})
		.fail(function (err) {
			deferred.reject(err.AddToError(__filename, 'createEntity'));
		});
	});

	deferred.promise.nodeify(callback);
	return deferred.promise;
};

DataAccess.prototype.t_createEntity = function (connection, tableName, obj, callback) {
	var deferred = Q.defer();

	DataAccess.prototype.createEntity(tableName, obj, connection)
	.then(function (res_obj) {
		deferred.resolve(res_obj)
	})
	.fail(function (err) {
		DataAccess.prototype.rollbackTransaction(connection)
		.then(function (rollback_res) {
			deferred.reject(err.AddToError(__filename, 't_createEntity', 'transaction rolled back'));
		})
		.fail(function (rollback_err) {
			deferred.reject(rollback_err.AddToError(__filename, 't_createEntity'));
		});
	});
};

// tableName -- NAME OF THE TABLE
// obj -- AN ENTITY AS JSON WHICH INCLUDES AN 'id' FIELD ON WHICH TO MATCH
// USED IF YOU NEED TO RE-FETCH AN ENTITY YOU ALREADY HAVE
DataAccess.prototype.getEntity = function (tableName, obj, connection, callback) {
	var deferred = Q.defer();

	if (obj.id !== null) {
		var qry = "SELECT * FROM \"" + tableName + "\" WHERE data @> '{\"id\": \"" + obj.id + "\", \"is_active\":true}'";
		var params = [];
		DataAccess.prototype.ExecutePostgresQuery(qry, params, connection)
			.then(function (connection) {
				deferred.resolve(connection.results);
			})
			.fail(function (err) {
				deferred.reject(err.AddToError(__filename, 'getEntity'));
			})
	}
	else {
		releaseConnection(connection)
		.then(function() {
			var errorObj = new ErrorObj(500,
										'da0012',
										__filename,
										'getEntity',
										'object input must have an id and object_type property'
									);
			deferred.reject(errorObj);
		});
	}

	deferred.promise.nodeify(callback);
	return deferred.promise;
};

DataAccess.prototype.t_getEntity = function (connection, tableName, obj, callback) {

	if (obj.id !== null) {
		DataAccess.prototype.getEntity(tableName, obj, connection)
		.then(function (res_obj) {
			deferred.resolve(res_obj)
		})
		.fail(function (err) {
			DataAccess.prototype.rollbackTransaction(connection)
			.then(function (rollback_res) {
				deferred.reject(err.AddToError(__filename, 't_getEntity'));
			})
			.fail(function (rollback_err) {
				deferred.reject(rollback_err.AddToError(__filename, 't_getEntity'));
			});
		});
	}
	else {
		DataAccess.prototype.rollbackTransaction(connection)
		.then(function (rollback_res) {
			var errorObj = new ErrorObj(500,
				'da0013',
				__filename,
				't_getEntity',
				'object input must have an id and object_type property'
			);
			deferred.reject(errorObj);
		})
		.fail(function (rollback_err) {
			deferred.reject(rollback_err.AddToError(__filename, 't_getEntity'));
		});
	}

	deferred.promise.nodeify(callback);
	return deferred.promise;
};

// tableName -- NAME OF THE TABLE
// obj -- THE ENTITY AS JSON INCLUDING THE 'object_type'
//			'id', 'created_at', AND 'is_active' ARE ADDED BY THE SYSTEM
// IF THE OBJECT PASSED IN MATCHES AN ENTITY, THAT ENTITY IS UPDATED IN
// PLACE WITH THE KEYS PROVIDED IN obj.  IF IT DOES NOT MATCH, IT CREATES
// A NEW ENTITY BASED ON obj.
DataAccess.prototype.saveEntity = function (tableName, obj, connection, callback) {
	var deferred = Q.defer();
	utilities.getUID()
	.then(function (uid_res) {
		if (obj.id !== null) {
			var qry = "SELECT * FROM \"" + tableName + "\" WHERE \"data\" @> '{\"id\": \"" + obj.id + "\", \"is_active\":true}'";
			var params = [];
			DataAccess.prototype.ExecutePostgresQuery(qry, params, connection)
			.then(function (connection) {
				if (connection.results.length === 0) {
					// NO RESULTS, CREATE A NEW RECORD				
					obj.id = uid_res;
					obj.created_at = new Date();
					obj.is_active = true;

					var save_qry = "INSERT INTO \"" + tableName + "\"(\"data\") VALUES($1)";
					var save_params = [obj];
					DataAccess.prototype.ExecutePostgresQuery(save_qry, save_params, connection)
						.then(function (connection) {
							deferred.resolve(obj);
						})
						.fail(function (err) {
							var errorObj = new ErrorObj(500,
								'da0015',
								__filename,
								'getEntity',
								'error reading from postgres',
								'Database error',
								qry_err
							);
							deferred.reject(errorObj);
						})
				}
				else if (connection.results.length > 1) {
					var errorObj = new ErrorObj(500,
						'da0016',
						__filename,
						'saveEntity',
						'multiple entities found with that id'
					);
					deferred.reject(errorObj);
				}
				else {
					// FOUND THE OBJECT
					var updateObj = connection.results[0];
					var keys = Object.keys(obj);

					for (var propIdx = 0; propIdx < keys.length; propIdx++) {
						var key = keys[propIdx];
						if (immutableKeys.indexOf(key) === -1) {
							updateObj[key] = obj[key];
						}
					}
					updateObj.updated_at = new Date();

					var update_qry = "UPDATE \"" + tableName + "\" SET \"data\" = $1 WHERE \"data\" @> '{\"id\": \"" + obj.id + "\"}'";
					var update_params = [updateObj];
					DataAccess.prototype.ExecutePostgresQuery(update_qry, update_params, connection)
						.then(function (connection) {
							deferred.resolve(updateObj);
						})
						.fail(function (qry_err) {
							var errorObj = new ErrorObj(500,
								'da0017',
								__filename,
								'saveEntity',
								'error updating in postgres',
								'Database error',
								qry_err
							);
							deferred.reject(errorObj);
						})
				}
			})
			.fail(function (err) {
				if(err !== undefined && err !== null && typeof(err) === 'function') {
					deferred.reject(err.AddToError(__filename, 'saveEntity'))
				}
				else {
					var errorObj = new ErrorObj(500,
						'da1018',
						__filename,
						'getEntity',
						'error reading from postgres',
						'Database error',
						err
					);
					deferred.reject(errorObj);
				}
			});
		}
		else {
			// NO RESULTS, CREATE A NEW RECORD				
			obj.id = uid_res;
			obj.created_at = new Date();
			obj.is_active = true;
			var save_qry = "INSERT INTO \"" + tableName + "\"(\"data\") VALUES($1)";
			var save_params = [obj];
			DataAccess.prototype.ExecutePostgresQuery(save_qry, save_params, connection)
			.then(function (connection) {
				deferred.resolve(obj);
			})
			.fail(function (save_err) {
				deferred.reject(save_err.AddToError(__filename, 'saveEntity'));
			});
		}
	});

	deferred.promise.nodeify(callback);
	return deferred.promise;
};

DataAccess.prototype.t_saveEntity = function (connection, tableName, obj, callback) {
	var deferred = Q.defer();

	DataAccess.prototype.saveEntity(tableName, obj, connection)
	.then(function (res_obj) {
		deferred.resolve(res_obj)
	})
	.fail(function (err) {
		DataAccess.prototype.rollbackTransaction(connection)
		.then(function (rollback_res) {
			deferred.reject(err.AddToError(__filename, 't_saveEntity', 'transaction rolled back'));
		})
		.fail(function (rollback_err) {
			deferred.reject(rollback_err.AddToError(__filename, 't_saveEntity'));
		});
	});

	deferred.promise.nodeify(callback);
	return deferred.promise;
};

// tableName -- NAME OF THE TABLE
// updateObj -- THE ENTITY AS JSON INCLUDING THE 'id' AND KEY/VALUES FOR UPDATE
// THIS USES THE 'id' PROPERTY OF updateObj TO LOCATE AN ENTITY AND THEN PERFORMS
// AN IN-PLACE UPDATE OF ANY KEY/VALUES SUPPLIED IN updateObj.
DataAccess.prototype.updateEntity = function (tableName, updateObj, connection, withisActive, callback) {
	var deferred = Q.defer();
	if (updateObj.id === undefined || updateObj.id === null) {
		releaseConnection(connection)
		.then(function() {
			var errorObj = new ErrorObj(500,
				'da0022',
				__filename,
				'updateEntity',
				'updateObj must include an id'
			);
			deferred.reject(errorObj);
		});
	}
	else {
		var qry = "SELECT * FROM \"" + tableName + "\" WHERE \"data\" @> '{\"id\": \"" + updateObj.id + "\", \"is_active\":true}'"
		var params = [];
		DataAccess.prototype.ExecutePostgresQuery(qry, params, connection)
		.then(function (connection) {
			if (connection.results.length === 0) {
				releaseConnection(connection)
				.then(function() {
					var errorObj = new ErrorObj(500,
						'da0023',
						__filename,
						'updateEntity',
						'no entities found with that id'
					);
					deferred.reject(errorObj);
				});
			}
			else if (connection.results.length > 1) {
				releaseConnection(connection)
				.then(function() {
					var errorObj = new ErrorObj(500,
						'da0024',
						__filename,
						'updateEntity',
						'multiple entities found with that id'
					);
					deferred.reject(errorObj);
				});
			}
			else {
				// FOUND THE OBJECT
				var dbObj = connection.results[0];
				var keys = Object.keys(updateObj);

				for (var propIdx = 0; propIdx < keys.length; propIdx++) {
					var key = keys[propIdx];
					if (withisActive) {
						if (immutableKeys.indexOf(key) === -1 || key === 'is_active') {
							dbObj[key] = updateObj[key];
						}
					}
					else {
						if (immutableKeys.indexOf(key) === -1) {
							dbObj[key] = updateObj[key];
						}
					}
				}

				dbObj.updated_at = new Date();

				var update_qry = "UPDATE \"" + tableName + "\" SET \"data\" = $1 WHERE \"data\" @> '{\"id\": \"" + dbObj.id + "\"}'";
				var update_params = [dbObj];
				DataAccess.prototype.ExecutePostgresQuery(update_qry, update_params, connection)
				.then(function (connection) {
					deferred.resolve(updateObj);
				})
				.fail(function (err) {
					deferred.reject(err.AddToError(__filename, 'updateEntity'));
				});
			}
		})
		.fail(function (qry_err) {
			deferred.reject(qry_err.AddToError(__filename, 'updateEntity'));
		});
	}

	deferred.promise.nodeify(callback);
	return deferred.promise;
};

DataAccess.prototype.t_updateEntity = function (connection, tableName, updateObj, callback) {
	var deferred = Q.defer();

	if (updateObj.id === undefined || updateObj.id === null) {
		DataAccess.prototype.rollbackTransaction(connection)
		.then(function (rollback_res) {
			var errorObj = new ErrorObj(500,
				'da0027',
				__filename,
				't_updateEntity',
				'updateObj must include an id',
				'Updating Entity failed',
				{}
			);
			deferred.reject(errorObj);
		})
		.fail(function (rollback_err) {
			deferred.reject(rollback_err.AddToError(__filename, 't_updateEntity'));
		});
	}
	else {

		DataAccess.prototype.updateEntity(tableName, updateObj, connection)
		.then(function (result) {
			deferred.resolve(result);
		})
		.fail(function (err) {
			DataAccess.prototype.rollbackTransaction(connection)
			.then(function (rollback_res) {
				deferred.reject(err.AddToError(__filename, 't_updateEntity', 'transaction rolled back'));
			})
			.fail(function (rollback_err) {
				deferred.reject(rollback_err.AddToError(__filename, 't_updateEntity'));
			});
		})

	}

	deferred.promise.nodeify(callback);
	return deferred.promise;
};

// tableName -- NAME OF THE TABLE
// updateObj -- THE ENTITY AS JSON INCLUDING THE 'id' AND KEY/VALUES FOR UPDATE
// THIS USES THE 'id' PROPERTY OF updateObj TO LOCATE AN ENTITY AND THEN PERFORMS
// AN IN-PLACE UPDATE OF ANY KEY/VALUES SUPPLIED IN updateObj.  ALLOWS UPDATE OF
// THE 'is_active' FIELD WHICH IS ORDINARILY DISALLOWED
DataAccess.prototype.updateEntityWithIsActiveProperty = function (tableName, updateObj, callback) {
	return DataAccess.prototype.updateEntity(tableName, updateObj, null, true);
};

// tableName -- NAME OF THE TABLE
// obj -- THE ENTITY AS JSON INCLUDING THE 'id'
// THE MATCHING ENTITY IS MARKED AS 'is_active' = false
DataAccess.prototype.deleteEntity = function (tableName, obj, connection, callback) {
	var deferred = Q.defer();

	var qry = "SELECT * FROM \"" + tableName + "\" WHERE \"data\" @> '{\"id\": \"" + obj.id + "\"}'";
	var params = [];
	DataAccess.prototype.ExecutePostgresQuery(qry, params, connection)
	.then(function (connection) {
		if (connection.results.length === 0) {
			releaseConnection(connection)
			.then(function() {
				var errorObj = new ErrorObj(500,
					'da0031',
					__filename,
					'deleteEntity',
					'no entities found with that id'
				);
				deferred.reject(errorObj);
			});
		}
		else if (connection.results.length > 1) {
			releaseConnection(connection)
			.then(function() {
				var errorObj = new ErrorObj(500,
					'da0032',
					__filename,
					'deleteEntity',
					'multiple entities found with that id'
				);
				deferred.reject(errorObj);
			});
		}
		else {
			// FOUND THE OBJECT
			var updateObj = connection.results[0];
			updateObj.is_active = false;
			updateObj.updated_at = new Date();

			var update_qry = "UPDATE \"" + tableName + "\" SET \"data\" = $1 WHERE \"data\" @> '{\"id\": \"" + obj.id + "\"}'";
			var update_params = [updateObj];

			DataAccess.prototype.ExecutePostgresQuery(update_qry, update_params, connection)
			.then(function (connection) {
				deferred.resolve(updateObj);
			})
			.fail(function (update_err) {
				deferred.reject(update_err.AddToError(__filename, 'deleteEntity'));
			});
		}
	})
	.fail(function (err) {
		deferred.reject(err.AddToError(__filename, 'deleteEntity'));
	});

	deferred.promise.nodeify(callback);
	return deferred.promise;
};

DataAccess.prototype.t_deleteEntity = function (connection, tableName, obj, callback) {
	var deferred = Q.defer();

	DataAccess.prototype.deleteEntity(tableName, obj, connection)
	.then(function (res_obj) {
		deferred.resolve(res_obj);
	})
	.fail(function (err) {
		da.rollbackTransaction(connection)
		.then(function () {
			deferred.reject(err.AddToError(__filename, 't_deleteEntity', 'transaction rolled back'));
		})
		.fail(function (rollback_err) {
			deferred.reject(rollback_err.AddToError(__filename, 't_deleteEntity'));
		});
	});

	deferred.promise.nodeify(callback);
	return deferred.promise;
};

// tableName -- NAME OF THE TABLE
// obj -- THE ENTITY AS JSON INCLUDING THE 'id'
// REMOVES THIS ENTITY FROM THE DATABASE
DataAccess.prototype.hardDeleteEntity = function (tableName, obj, connection, callback) {
	var deferred = Q.defer();
	var da = this;

	resolveDbConnection(connection)
	.then(function (connection) {
		if (!utilities.isNullOrUndefined(obj.id) && !utilities.isNullOrUndefined(obj.object_type)) {
			t_removeAllRelationships(connection, { "id": obj.id, "object_type": obj.object_type }, da)
			.then(function () {
				var qry = "DELETE FROM \"" + tableName + "\"WHERE data->>'id'=$1";
				var params = [obj.id];
				DataAccess.prototype.ExecutePostgresQuery(qry, params, connection)
				.then(function (connection) {
					deferred.resolve(true);
				})
				.fail(function (err) {
					deferred.reject(err.AddToError(__filename, 'hardDeleteEntity'));
				})
			})
			.fail(function (rem_err) {
				deferred.reject(rem_err.AddToError(__filename, 'hardDeleteEntity'));
			});
		}
		else {
			releaseConnection(connection)
			.then(function() {
				var errorObj = new ErrorObj(500,
					'da0045',
					__filename,
					'hardDeleteEntity',
					'object argument must have a id and object_type property',
					'Error hard deleting entity.',
					{}
				);
				deferred.reject(errorObj);
			});
		}
	});

	deferred.promise.nodeify(callback);
	return deferred.promise;
};

DataAccess.prototype.t_hardDeleteEntity = function (connection, tableName, obj, callback) {
	var deferred = Q.defer();

	DataAccess.prototype.hardDeleteEntity(tableName, obj, connection)
		.then(function (result) {
			deferred.resolve(result);
		})
		.fail(function (err) {
			DataAccess.prototype.rollbackTransaction(connection)
				.then(function (rb_res) {
					deferred.reject(err.AddToError(__filename, 't_hardDeleteEntity'));
				})
				.fail(function (rollback_err) {
					deferred.reject(rollback_err.AddToError(__filename, 't_hardDeleteEntity'));
				});

		})

	deferred.promise.nodeify(callback);
	return deferred.promise;
};

//UpdateAllEntities REQUIRES POSTGRES 9.5.X 
DataAccess.prototype.UpdateAllEntities = function (updateAllObject, connection, callback) {
	var deferred = Q.defer();

	var qryUpdate = "";
	var qryWhere = " WHERE data->>'id' IN ('abcdefg'"; // this is so my where clause can all start with , 

	//distinct because in the case of location, mikes house may be both pick up and drop off.
	qryUpdate = "UPDATE " + updateAllObject.obj_type + " SET data = JSONB_SET(data,'{" + updateAllObject.property + "}', '\"" + updateAllObject.value + "\"', false)";

	var ix = 0;
	updateAllObject.ids.forEach(function (id) {
		ix++;
		qryWhere += ",'" + id + "'";
	});
	qryWhere += ")";
	qryUpdate += qryWhere;
	var params = [];

	DataAccess.prototype.ExecutePostgresQuery(qryUpdate, params, connection)
	.then(function (connection) {
		deferred.resolve(connection.results);
	})
	.fail(function (err) {
		deferred.reject(err.AddToError(__filename, 'UpdateAllEntities'));
	});

	deferred.promise.nodeify(callback);
	return deferred.promise;
};
// ================================================================================


// ================================================================================
// FIND FUNCTIONS
// ------------------------------------------------------------------
// These functions are for retrieving entities from the db by various
// parameters.
// ------------------------------------------------------------------
// tableName -- NAME OF THE TABLE
// RETURN ALL ENTITIES IN A GIVEN TABLE
DataAccess.prototype.findAll = function (tableName, connection, callback) {
	var deferred = Q.defer();
	var qry = "SELECT * FROM \"" + tableName + "\" ORDER BY row_id";
	var params = [];

	DataAccess.prototype.ExecutePostgresQuery(qry, params, connection)
	.then(function (connection) {
		deferred.resolve(connection.results);
	})
	.fail(function (err) {
		deferred.reject(err.AddToError(__filename, 'findAll'));
	});

	deferred.promise.nodeify(callback);
	return deferred.promise;
};

DataAccess.prototype.t_findAll = function (connection, tableName, callback) {
	var deferred = Q.defer();

	DataAccess.prototype.findAll(tableName, connection)
	.then(function (results) {
		deferred.resolve([results, connection]);
	})
	.fail(function (err) {
		DataAccess.prototype.rollbackTransaction(connection)
		.then(function (rollback_res) {
			deferred.reject(err.AddToError(__filename, 't_findAll', 'transaction rolled back'));
		})
		.fail(function (rollback_err) {
			deferred.reject(rollback_err.AddToError(__filename, 't_findAll'));
		});
	})

	deferred.promise.nodeify(callback);
	return deferred.promise;
};

// tableName -- NAME OF THE TABLE
// RETURN ALL ENTITIES IN A GIVEN TABLE WITH 'is_active' PROPERTY
// SET TO TRUE
DataAccess.prototype.findAllActive = function (tableName, connection, callback) {
	var deferred = Q.defer();

	var qry = "SELECT * FROM \"" + tableName + "\" WHERE \"data\" @> '" + JSON.stringify({ 'is_active': true }) + "' ORDER BY row_id";
	var params = [];

	DataAccess.prototype.ExecutePostgresQuery(qry, params, connection)
	.then(function (connection) {
		deferred.resolve(connection.results);
	})
	.fail(function (err) {
		deferred.reject(err.AddToError(__filename, 'findAllActive'));
	});

	deferred.promise.nodeify(callback);
	return deferred.promise;
};

// tableName -- NAME OF THE TABLE
// searchObject -- JSON OBJECT INCLUDING PARAMETERS ON WHICH TO MATCH
//					eg.	{'id': 'a39vawes9fj03'}
//					{'first_name': 'steve', 'city': 'austin'}
DataAccess.prototype.find = function (tableName, searchObject, connection, callback) {
	var deferred = Q.defer();

	searchObject.is_active = true;
	var qry = "SELECT * FROM \"" + tableName + "\" WHERE \"data\" @> $1 ORDER BY row_id";
	var params = [searchObject];

	DataAccess.prototype.ExecutePostgresQuery(qry, params, connection)
	.then(function (connection) {
		deferred.resolve(connection.results);
	})
	.fail(function (err) {
		deferred.resolve(err.AddToError(__filename, 'find'));
	});

	deferred.promise.nodeify(callback);
	return deferred.promise;
};

DataAccess.prototype.t_find = function (connection, tableName, searchObject, callback) {
	var deferred = Q.defer();

	DataAccess.prototype.find(tableName, searchObject, connection)
	.then(function (results) {
		deferred.resolve(results);
	})
	.fail(function (err) {
		DataAccess.prototype.rollbackTransaction(connection)
		.then(function (rollback_res) {
			deferred.reject(err.AddToError(__filename, 't_find', 'transaction rolled back'));
		})
		.fail(function (rollback_err) {
			deferred.reject(rollback_err.AddToError(__filename, 't_find'));
		});
	})

	deferred.promise.nodeify(callback);
	return deferred.promise;
};

// objType -- VALUE OF object_type FOR THE ENTITIES IN QUESTION
// searchObject -- JSON OBJECT INCLUDING PARAMETERS ON WHICH TO MATCH
//					eg.	{'id': 'a39vawes9fj03'}
//					{'first_name': 'steve', 'city': 'austin'}
// SEARCHES BY OBJECT TYPE INSTEAD OF TABLE NAME
DataAccess.prototype.findByObjType = function (objType, searchObject, connection, callback) {
	var deferred = Q.defer();

	var tbl = typeToCollectionMap[objType.toLowerCase()];
	if (tbl === undefined || tbl === null) {
		releaseConnection(connection)
		.then(function() {
			var errorObj = new ErrorObj(500,
				'da0055',
				__filename,
				'findObjType',
				'Could not resolve object type to table',
				'Database error',
				{}
			);
			deferred.reject(errorObj);	
		});
		
		deferred.promise.denodeify(callback);
		return deferred.promise;
	}

	searchObject.is_active = true;
	var qry = "SELECT * FROM \"" + tbl + "\" WHERE \"data\" @> $1 ORDER BY row_id";
	var params = [searchObject];

	DataAccess.prototype.ExecutePostgresQuery(qry, params, connection)
		.then(function (connection) {
			deferred.resolve(connection.results);
		})
		.fail(function (err) {
			deferred.reject(err.AddToError(__filename, 'findObjType'));
		})

	deferred.promise.nodeify(callback);
	return deferred.promise;
};

// tableName -- NAME OF THE TABLE
// searchObject -- JSON OBJECT INCLUDING PARAMETERS ON WHICH TO MATCH
//					eg.	{'id': 'a39vawes9fj03'}
//					{'first_name': 'steve', 'city': 'austin'}
// RETURNS ERROR IF ZERO OR MULTIPLE ENTITIES MATCH THE CRITERIA IN searchObject
DataAccess.prototype.findOne = function (tableName, searchObject, connection, callback) {
	var deferred = Q.defer();

	searchObject.is_active = true;
	var qry = "SELECT * FROM \"" + tableName + "\" WHERE \"data\" @> $1";
	var params = [searchObject];

	DataAccess.prototype.ExecutePostgresQuery(qry, params, connection)
	.then(function (connection) {
		var results = connection.results;
		if (results.length <= 0) {
			releaseConnection(connection)
			.then(function() {
				var errorObj = new ErrorObj(500,
					'da0057',
					__filename,
					'findOne',
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
					'da0058',
					__filename,
					'findOne',
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
		releaseConnection(connection)
		.then(function() {
			var errorObj = new ErrorObj(500,
				'da0059',
				__filename,
				'findOne',
				'error querying postgres',
				'Database error',
				err
			);
			deferred.reject(errorObj);
		});
	});

	deferred.promise.nodeify(callback);
	return deferred.promise;
};

DataAccess.prototype.t_findOne = function (connection, tableName, searchObject, callback) {
	var deferred = Q.defer();

	DataAccess.prototype.findOne(tableName, searchObject, connection)
	.then(function (results) {
		deferred.resolve(results);
	})
	.fail(function (err) {
		DataAccess.prototype.rollbackTransaction(connection)
		.then(function (rollback_res) {
			deferred.reject(err.AddToError(__filename, 't_findOne', 'transaction rolled back'));
		})
		.fail(function (rollback_err) {
			deferred.reject(rollback_err.AddToError(__filename, 't_findOne'));
		});
	});

	deferred.promise.nodeify(callback);
	return deferred.promise;
};

// tableName -- NAME OF THE TABLE
// searchObject -- JSON OBJECT INCLUDING PARAMETERS ON WHICH TO MATCH
//					eg.	{'id': 'a39vawes9fj03'}
//					{'first_name': 'steve', 'city': 'austin'}
// likeField -- FIELD FROM THE ENTITY ON WHICH TO PERFORM A FUZZY MATCH
// likeVal -- THE VALUE TO USE IN THE FUZZY MATCH
DataAccess.prototype.findLike = function (tableName, searchObject, likeField, likeVal, connection, callback) {
	var deferred = Q.defer();

	searchObject.is_active = true;
	var qry = "SELECT * FROM " + tableName + " WHERE data @> '" + JSON.stringify(searchObject) + "' AND data->>'" + likeField + "' LIKE '%" + likeVal + "%' ORDER BY row_id";
	var params = [];

	DataAccess.prototype.ExecutePostgresQuery(qry, params, connection)
	.then(function (connection) {
		deferred.resolve(connection.results);
	})
	.fail(function (err) {
		deferred.reject(err.AddToError(__filename, 'findLike'));
	})

	deferred.promise.nodeify(callback);
	return deferred.promise;
};

DataAccess.prototype.t_findLike = function (connection, tableName, searchObject, likeField, likeVal, callback) {
	var deferred = Q.defer();

	DataAccess.prototype.findLike(tableName, searchObject, likeField, likeVal, connection)
	.then(function (results) {
		deferred.resolve(results);
	})
	.fail(function (err) {
		DataAccess.prototype.rollbackTransaction(connection)
		.then(function (rollback_res) {
			deferred.reject(err.AddToError(__filename, 't_findLike', 'transaction rolled back'));
		})
		.fail(function (rollback_err) {
			deferred.reject(rollback_err.AddToError(__filename, 't_findLike'));
		});
	})

	deferred.promise.nodeify(callback);
	return deferred.promise;
};

// tableName -- NAME OF THE TABLE
// searchObject -- JSON OBJECT INCLUDING PARAMETERS ON WHICH TO MATCH
//					eg.	{'id': 'a39vawes9fj03'}
//					{'first_name': 'steve', 'city': 'austin'}
// orderField -- FIELD FROM THE ENTITY TO USE IN ORDERING THE RESULTS
// desc -- IF true, RETURN THE RESULTS IN DESCENDING ORDER, OTHERWISE USE ASCENDING ORDER
DataAccess.prototype.findOrdered = function (tableName, searchObject, orderField, desc, connection, callback) {
	var deferred = Q.defer();

	var direction = 'ASC';
	if (desc) {
		direction = 'DESC';
	}
	searchObject.is_active = true;
	var qry = "SELECT * FROM \"" + tableName + "\" WHERE \"data\" @> $1 ORDER BY \"data\"->>'" + orderField + "' $2";
	var params = [searchObject, direction];

	DataAccess.prototype.ExecutePostgresQuery(qry, params, connection)
	.then(function (connection) {
		deferred.resolve(connection.results);
	})
	.fail(function (err) {
		deferred.reject(err.AddToError(__filename, 'findOrdered'));
	});

	deferred.promise.nodeify(callback);
	return deferred.promise;
};

DataAccess.prototype.t_findOrdered = function (connection, tableName, searchObject, orderField, desc, callback) {
	var deferred = Q.defer();

	DataAccess.prototype.findOrdered(tableName, searchObject, orderField, desc, connection)
	.then(function (results) {
		deferred.resolve(results);
	})
	.fail(function (err) {
		DataAccess.prototype.rollbackTransaction(connection)
		.then(function (rollback_res) {
			deferred.reject(err.AddToError(__filename, 't_findOrdered', 'transaction rolled back'));
		})
		.fail(function (rollback_err) {
			deferred.reject(rollback_err.AddToError(__filename, 't_findOrdered'));
		});
	});

	deferred.promise.nodeify(callback);
	return deferred.promise;
};

// tableName -- NAME OF THE TABLE
// searchObject -- JSON OBJECT INCLUDING PARAMETERS ON WHICH TO MATCH
//					eg.	{'id': 'a39vawes9fj03'}
//					{'first_name': 'steve', 'city': 'austin'}
// orderFields -- ARRAY OF FIELDS FROM THE ENTITY TO USE IN ORDERING THE RESULTS
// desc -- IF true, RETURN THE RESULTS IN DESCENDING ORDER, OTHERWISE USE ASCENDING ORDER
DataAccess.prototype.findMultiOrdered = function (tableName, searchObject, orderFields, desc, connection, callback) {
	var deferred = Q.defer();

	var direction = 'ASC';
	if (desc) {
		direction = 'DESC';
	}
	searchObject.is_active = true;
	var qryTxt = "SELECT * FROM \"" + tableName + "\" WHERE \"data\" @> $1 ORDER BY ";
	for (var fIdx = 0; fIdx < orderFields.length; fIdx++) {
		qryTxt += "\"data\"->>'" + orderFields[fIdx] + "', ";
	}
	qryTxt = qryTxt.substring(0, qryTxt.length - 2);
	qryTxt += " " + direction;

	var params = [searchObject];

	DataAccess.prototype.ExecutePostgresQuery(qryTxt, params, connection)
	.then(function (connection) {
		deferred.resolve(connection.results);
	})
	.fail(function (err) {
		deferred.reject(err.AddToError(__filename, 'findMultiOrdered'));
	});

	deferred.promise.nodeify(callback);
	return deferred.promise;
};

DataAccess.prototype.t_findMultiOrdered = function (connection, tableName, searchObject, orderFields, desc, callback) {
	var deferred = Q.defer();

	DataAccess.prototype.findMultiOrdered(tableName, searchObject, orderFields, desc, connection)
	.then(function (results) {
		deferred.resolve(results);
	})
	.fail(function (err) {
		DataAccess.prototype.rollbackTransaction(connection)
		.then(function (rollback_res) {
			deferred.reject(err.AddToError(__filename, 't_findMultiOrdered', 'transaction rolled back'));
		})
		.fail(function (rollback_err) {
			deferred.reject(rollback_err.AddToError(__filename, 't_findMultiOrdered'));
		});
	})

	deferred.promise.nodeify(callback);
	return deferred.promise;
};

// tableName  -- NAME OF THE TABLE
// dateField -- THE FIELD FROM THE ENTITIES IN SPECIFIED TABLE
//				CONTAINING AN ISO FORMAT DATE STRING.  (eg created_at)
// startDate -- DATETIME AFTER WHICH TO PULL ENTITIES
// endDate -- DATETIME BEFORE WHICH TO PULL ENTITIES
// startDate OR endDate MAY BE null, BUT NOT BOTH
// DATES MUST BE ISO FORMAT YYYY-MM-DDTHH:mm:ss.uuuZ TO DESIRED PRECISION
DataAccess.prototype.findBetweenDates = function (tableName, dateField, startDate, endDate, connection, callback) {
	var deferred = Q.defer();

	if (startDate === undefined) {
		startDate = null;
	}
	if (endDate === undefined) {
		endDate = null;
	}
	if (startDate === null && endDate === null) {
		releaseConnection(connection)
		.then(function() {
			var errorObj = new ErrorObj(500,
				'da0071',
				__filename,
				'findBetweenDates',
				'either startDate or endDate must be supplied',
				'Database Error',
				{}
			);
			deferred.reject(errorObj);
		});

		deferred.promise.nodeify(callback);
		return deferred.promise;
	}

	var qryString;
	if (startDate !== null && endDate !== null) {
		qryString = "SELECT " + tableName + ".data FROM " + tableName + " WHERE to_timestamp(" + tableName + ".data->>'" + dateField + "', 'YYYY-MM-DD HH24:MI:SS.MS') BETWEEN to_timestamp('" + startDate + "', 'YYYY-MM-DD HH24:MI:SS.MS') AND to_timestamp('" + endDate + "', 'YYYY-MM-DD HH24:MI:SS.MS') ORDER BY row_id";
	}
	else if (endDate === null) {
		qryString = "SELECT " + tableName + ".data FROM " + tableName + " WHERE to_timestamp(" + tableName + ".data->>'" + dateField + "', 'YYYY-MM-DD HH24:MI:SS.MS') > to_timestamp('" + startDate + "', 'YYYY-MM-DD HH24:MI:SS.MS') ORDER BY row_id";
	}
	else {
		qryString = "SELECT " + tableName + ".data FROM " + tableName + " WHERE to_timestamp(" + tableName + ".data->>'" + dateField + "', 'YYYY-MM-DD HH24:MI:SS.MS') < to_timestamp('" + endDate + "', 'YYYY-MM-DD HH24:MI:SS.MS') ORDER BY row_id";
	}

	var params = [];

	DataAccess.prototype.ExecutePostgresQuery(qryString, params, connection)
	.then(function (connection) {
		deferred.resolve(connection.results);
	})
	.fail(function (err) {
		deferred.reject(err.AddToError(__filename, 'findBetweenDates'));
	});

	deferred.promise.nodeify(callback);
	return deferred.promise;
}

DataAccess.prototype.t_findBetweenDates = function (connection, tableName, dateField, startDate, endDate, callback) {
	var deferred = Q.defer();

	DataAccess.prototype.findBetweenDates(tableName, dateField, startDate, endDate, connection)
	.then(function (results) {
		deferred.resolve(results);
	})
	.fail(function (err) {
		DataAccess.prototype.rollbackTransaction(connection)
		.then(function (rollback_res) {
			deferred.reject(err.AddToError(__filename, 't_findBetweenDates', 'transaction rolled back'));
		})
		.fail(function (rollback_err) {
			deferred.reject(rollback_err.AddToError(__filename, 't_findBetweenDates'));
		});
	});

	deferred.promise.nodeify(callback);
	return deferred.promise;
}
// ================================================================================


// ================================================================================
// RELATIONSHIP FUNCTIONS
// ------------------------------------------------------------------
// These functions are for handling relationships between entities.
// You can add a relationship between entities, remove a relationship
// or get the related entities.
//
// relType is 'default' if none is specified
// ------------------------------------------------------------------
// entity1 -- ONE ENTITY IN THE RELATIONSHIP
//				REQUIRES AT LEAST 'object_type' AND 'id'
// entity2 -- THE OTHER ENTITY IN THE RELATIONSHIP
//				REQUIRES AT LEAST 'object_type' AND 'id'
// relType -- NAME OR TYPE FOR THIS RELATIONSHIP
// THIS CREATES A NAMED RELATIONSHIP BETWEEN THE TWO SPECIFIED ENTITIES
DataAccess.prototype.addRelationship = function (entity1, entity2, relType, connection, rel_props, callback) {
	var deferred = Q.defer();

	if (entity1.id !== null && entity2.id !== null && entity1.object_type !== null && entity2.object_type !== null) {
		var linkingTable = null;
		for (var mpIdx = 0; mpIdx < relationshipMap.length; mpIdx++) {
			var relDescriptor = relationshipMap[mpIdx];
			if (relDescriptor.type1 === entity1.object_type && relDescriptor.type2 === entity2.object_type) {
				linkingTable = relDescriptor.linkingTable;
				break;
			}
			else if (relDescriptor.type1 === entity2.object_type && relDescriptor.type2 === entity1.object_type) {
				// THEY ARE IN THE WRONG ORDER, SWITCH THEM
				var entityTemp = entity1;
				entity1 = entity2;
				entity2 = entityTemp;
				linkingTable = relDescriptor.linkingTable;
				break;
			}
		}
		if (linkingTable === null) {
			releaseConnection(connection)
			.then(function() {
				var errorObj = new ErrorObj(500,
					'da0075',
					__filename,
					'addRelationship',
					'error determining correct linking table'
				);
				deferred.reject(errorObj);
			});

			deferred.promise.nodeify(callback);
			return deferred.promise;
		}
		var entity1Collection = typeToCollectionMap[entity1.object_type];
		var entity2Collection = typeToCollectionMap[entity2.object_type];
		if (entity1Collection === null || entity2Collection === null) {
			releaseConnection(connection)
			.then(function() {
				var errorObj = new ErrorObj(500,
					'da0076',
					__filename,
					'addRelationship',
					'could not determine entity type'
				);
				deferred.reject(errorObj);
			});

			deferred.promise.nodeify(callback);
			return deferred.promise;
		}
		var e1_rowId = null;
		var e2_rowId = null;
		var e1_params = [];
		var e1_qry = "SELECT row_id FROM \"" + entity1Collection + "\" WHERE \"data\" @> '{\"id\": \"" + entity1.id + "\", \"is_active\":true}'";
		DataAccess.prototype.ExecutePostgresQuery(e1_qry, e1_params, connection)
		.then(function (connection) {

			if (connection.results.length === 0) {
				releaseConnection(connection)
				.then(function() {
					var errorObj = new ErrorObj(500,
						'da0077',
						__filename,
						'addRelationship',
						'no entities found with that id'
					);
					deferred.reject(errorObj);
				});
			}
			else if (connection.results.length > 1) {
				releaseConnection(connection)
				.then(function() {
					var errorObj = new ErrorObj(500,
						'da0078',
						__filename,
						'addRelationship',
						'multiple entities found with that id'
					);
					deferred.reject(errorObj);
				});
			}
			else {
				// GOT ENTITY 1
				e1_rowId = connection.results[0].row_id;
				var ec2_qry_params = [];
				var e2_qry = "SELECT row_id FROM \"" + entity2Collection + "\" WHERE \"data\" @> '{\"id\": \"" + entity2.id + "\", \"is_active\":true}'";
				DataAccess.prototype.ExecutePostgresQuery(e2_qry, ec2_qry_params, connection)
				.then(function (connection) {
					if (connection.results.length === 0) {
						releaseConnection(connection)
						.then(function() {
							var errorObj = new ErrorObj(500,
								'da0079',
								__filename,
								'addRelationship',
								'no entities found with that id'
							);
							deferred.reject(errorObj);
						});
					}
					else if (connection.results.length > 1) {
						releaseConnection(connection)
						.then(function() {
							var errorObj = new ErrorObj(500,
								'da0080',
								__filename,
								'addRelationship',
								'multiple entities found with that id'
							);
							deferred.reject(errorObj);
						});
					}
					else {
						// GOT ENTITY 2
						e2_rowId = connection.results[0].row_id;
						// CHECK IF THIS RELATIONSHIP ALREADY EXISTS
						var rel_qry = "SELECT * FROM \"" + linkingTable + "\" WHERE left_id = $1 AND right_id = $2 AND rel_type = $3";
						var rel_qry_params = [];
						if (rel_props === undefined || rel_props === null) {
							rel_props = null;
						}
						if (relType === undefined || relType === null) {
							rel_qry_params = [e1_rowId, e2_rowId, 'default'];
						}
						else {
							rel_qry_params = [e1_rowId, e2_rowId, relType];
						}
						DataAccess.prototype.ExecutePostgresQuery(rel_qry, rel_qry_params, connection)
						.then(function (connection) {
							if (connection.results.length < 1) {
								var save_qry = "INSERT INTO \"" + linkingTable + "\"(\"left_id\", \"right_id\", \"rel_type\", \"rel_props\") VALUES($1, $2, $3, $4)";
								var save_qry_params = [];
								if (relType === undefined || relType === null || relType.length === 0) {
									save_qry_params = [e1_rowId, e2_rowId, 'default', rel_props];
								}
								else {
									save_qry_params = [e1_rowId, e2_rowId, relType, rel_props];
								}
								DataAccess.prototype.ExecutePostgresQuery(save_qry, save_qry_params, connection)
								.then(function (connection) {
									deferred.resolve(true);
								})
								.fail(function (err) {
									deferred.reject(err.AddToError(__filename, 'addRelationship'));
								})
							}
							else {
								releaseConnection(connection)
								.then(function() {
									var errorObj = new ErrorObj(500,
										'da0082',
										__filename,
										'addRelationship',
										'duplicate relationship'
									);
									deferred.reject(errorObj);
								});
							}
						})
						.fail(function (err) {
							deferred.reject(err.AddToError(__filename, 'addRelationship'));
						});
					}
				})
				.fail(function (err) {
					deferred.reject(err.AddToError(__filename, 'addRelationship'));
				});
			}
		});
	}
	else {
		releaseConnection(connection)
		.then(function() {
			var errorObj = new ErrorObj(500,
				'da0085',
				__filename,
				'addRelationship',
				'invalid parameters',
				'function error'
			);
			deferred.reject(errorObj);
		});
	}

	deferred.promise.nodeify(callback);
	return deferred.promise;

}

DataAccess.prototype.t_addRelationship = function (connection, entity1, entity2, relType, rel_props, callback) {
	var deferred = Q.defer();

	DataAccess.prototype.addRelationship(entity1, entity2, relType, connection, rel_props, callback)
	.then(function (res_obj) {
		deferred.resolve(res_obj)
	})
	.fail(function (err) {
		DataAccess.prototype.rollbackTransaction(connection)
		.then(function (rollback_res) {
			deferred.reject(err.AddToError(__filename, 't_addRelationship', 'transaction rolled back'));
		})
		.fail(function (rollback_err) {
			deferred.reject(rollback_err.AddToError(__filename, 't_addRelationship'));
		})
	});

	deferred.promise.nodeify(callback);
	return deferred.promise;
};

// entity1 -- ONE ENTITY IN THE RELATIONSHIP
//				REQUIRES AT LEAST 'object_type' AND 'id'
// entity2 -- THE OTHER ENTITY IN THE RELATIONSHIP
//				REQUIRES AT LEAST 'object_type' AND 'id'
// relType -- NAME OR TYPE FOR THIS RELATIONSHIP
// THIS DESTROYS THE NAMED RELATIONSHIP BETWEEN THE TWO SPECIFIED ENTITIES
DataAccess.prototype.removeRelationship = function (entity1, entity2, relType, connection, callback) {
	var deferred = Q.defer();
	var e1_rowId = null;
	var e2_rowId = null;
	if (entity1.id !== null && entity2.id !== null && entity1.object_type !== null && entity2.object_type !== null) {
		var linkingTable = null;
		for (var mpIdx = 0; mpIdx < relationshipMap.length; mpIdx++) {
			var relDescriptor = relationshipMap[mpIdx];
			if (relDescriptor.type1 === entity1.object_type && relDescriptor.type2 === entity2.object_type) {
				linkingTable = relDescriptor.linkingTable;
				break;
			}
			else if (relDescriptor.type1 === entity2.object_type && relDescriptor.type2 === entity1.object_type) {
				// THEY ARE IN THE WRONG ORDER, SWITCH THEM
				var entityTemp = entity1;
				entity1 = entity2;
				entity2 = entityTemp;
				linkingTable = relDescriptor.linkingTable;
				break;
			}
		}
		if (linkingTable === null) {
			releaseConnection(connection)
			.then(function() {
				var errorObj = new ErrorObj(500,
					'da0088',
					__filename,
					'removeRelationship',
					'could not resolve a relationship between these entity types'
				);
				deferred.reject(errorObj);
			});

			deferred.promise.nodeify(callback);
			return deferred.promise;
		}
		var entity1Collection = typeToCollectionMap[entity1.object_type];
		var entity2Collection = typeToCollectionMap[entity2.object_type];
		if (entity1Collection === null || entity2Collection === null) {
			releaseConnection(connection)
			.then(function() {
				var errorObj = new ErrorObj(500,
					'da0089',
					__filename,
					'removeRelationship',
					'could not determine entity type'
				);
				deferred.reject(errorObj);
			});

			deferred.promise.nodeify(callback);
			return deferred.promise;
		}
		var e1_params = [];
		var e1_qry = "SELECT row_id FROM \"" + entity1Collection + "\" WHERE \"data\" @> '{\"id\": \"" + entity1.id + "\", \"is_active\":true}'";
		DataAccess.prototype.ExecutePostgresQuery(e1_qry, e1_params, connection)
		.then(function (connection) {

			if (connection.results.length === 0) {
				releaseConnection(connection)
				.then(function() {
					var errorObj = new ErrorObj(500,
						'da0090',
						__filename,
						'removeRelationship',
						'no entities found with that id'
					);
					deferred.reject(errorObj);
				});
			}
			else if (connection.results.length > 1) {
				releaseConnection(connection)
				.then(function() {
					var errorObj = new ErrorObj(500,
						'da0091',
						__filename,
						'removeRelationship',
						'multiple entities found with that id'
					);
					deferred.reject(errorObj);
				});
			}
			else {
				// GOT ENTITY 1
				e1_rowId = connection.results[0].row_id;
				var e2_params = [];
				var e2_qry = "SELECT row_id FROM \"" + entity2Collection + "\" WHERE \"data\" @> '{\"id\": \"" + entity2.id + "\", \"is_active\":true}'";
				DataAccess.prototype.ExecutePostgresQuery(e2_qry, e2_params, connection)
				.then(function (connection) {
					if (connection.results.length === 0) {
						releaseConnection(connection)
						.then(function() {
							var errorObj = new ErrorObj(500,
								'da0092',
								__filename,
								'removeRelationship',
								'no entities found with that id'
							);
							deferred.reject(errorObj);
						});
					}
					else if (connection.results.length > 1) {
						releaseConnection(connection)
						.then(function() {
							var errorObj = new ErrorObj(500,
								'da0093',
								__filename,
								'removeRelationship',
								'multiple entities found with that id'
							);
							deferred.reject(errorObj);
						});
					}
					else {
						// GOT ENTITY 2
						e2_rowId = connection.results[0].row_id;

						// DELETE THE RELATIONSHIP
						var del_qry = "DELETE FROM \"" + linkingTable + "\" WHERE left_id = $1 AND right_id = $2 AND rel_type = $3";
						var del_params = [];
						if (relType === undefined || relType === null || relType.length === 0) {
							del_params = [e1_rowId, e2_rowId, 'default'];
						}
						else {
							del_params = [e1_rowId, e2_rowId, relType];
						}
						DataAccess.prototype.ExecutePostgresQuery(del_qry, del_params, connection)
						.then(function (connection) {
							deferred.resolve(true);
						})
						.fail(function (err) {
							deferred.reject(err.AddToError(__filename, 'removeRelationship'));
						})
					}
				})
				.fail(function (err) {
					deferred.reject(err.AddToError(__filename, 'removeRelationship'));
				});
			}
		})
		.fail(function (err) {
			deferred.reject(err.AddToError(__filename, 'removeRelationship'));
		});

	}
	else {
		releaseConnection(connection)
		.then(function() {
			var errorObj = new ErrorObj(500,
				'da0097',
				__filename,
				'removeRelationship',
				'object inputs must have an id and objec_type property'
			);
			deferred.reject(errorObj);
		});
	}

	deferred.promise.nodeify(callback);
	return deferred.promise;
};

DataAccess.prototype.t_removeRelationship = function (connection, entity1, entity2, relType, callback) {
	var deferred = Q.defer();
	DataAccess.prototype.removeRelationship(entity1, entity2, relType, connection, callback)
	.then(function (res_obj) {
		deferred.resolve(res_obj)
	})
	.fail(function (err) {
		DataAccess.prototype.rollbackTransaction(connection)
		.then(function (rollback_res) {
			deferred.reject(err.AddToError(__filename, 't_removeRelationship', 'transaction rolled back'));
		})
		.fail(function (rollback_err) {
			deferred.reject(rollback_err.AddToError(__filename, 't_removeRelationship'));
		});
	});
	deferred.promise.nodeify(callback);
	return deferred.promise;
};

// obj -- AN ENTITY INCLUDING 'id' AND 'object_type'
// REMOVES ALL RELATIONSHIPS TO ALL OTHER ENTITIES
function removeAllRelationships(obj, da, connection, callback) {
	var deferred = Q.defer();

	if (!utilities.isNullOrUndefined(obj.id) && !utilities.isNullOrUndefined(obj.object_type)) {
		var col = obj.object_type;
		var qry = "SELECT row_id FROM \"" + col + "\" WHERE \"data\" @> '{\"id\": \"" + obj.id + "\"}'";
		var params = [];
		DataAccess.prototype.ExecutePostgresQuery(qry, params, connection)
		.then(function (connection) {
			if (connection.results.length === 0) {
				releaseConnection(connection)
				.then(function() {
					var errorObj = new ErrorObj(500,
						'da0100',
						__filename,
						'removeAllRelationships',
						'no entities found with that id'
					);
					deferred.reject(errorObj);
				});
			}
			else if (connection.results.length > 1) {
				releaseConnection(connection)
				.then(function() {
					var errorObj = new ErrorObj(500,
						'da0101',
						__filename,
						'removeAllRelationships',
						'multiple entities found with that id'
					);
					deferred.reject(errorObj);
				});
			}
			else {
				// WE HAVE THE OBJECT, FIND THE RELATIONSHIPS AND DELETE THEM
				var rowId = connection.results[0].row_id;
				async.forEach(da.relationshipMap, function (relDescriptor, callback) {
					if (relDescriptor.type1 === obj.object_type) {
						var del_qry = "DELETE FROM \"" + relDescriptor.linkingTable + "\" WHERE left_id = $1";
						var del_params = [rowId];
						DataAccess.prototype.ExecutePostgresQuery(del_qry, del_params, connection)
						.then(function (connection) {
							callback();
						})
						.fail(function (err) {
							var errorObj = new ErrorObj(500,
								'da0102',
								__filename,
								'removeAllRelationships',
								'error deleting in postgres',
								'Database error',
								err
							);
							console.log(errorObj);
							callback();
						});
					}
					else if (relDescriptor.type2 === obj.object_type) {
						var del_qry2 = "DELETE FROM \"" + relDescriptor.linkingTable + "\" WHERE right_id = $1";
						var del2_params = [rowId];
						DataAccess.prototype.ExecutePostgresQuery(del_qry, del_params, connection)
						.then(function (connection) {
							callback();
						})
						.fail(function (err) {
							var errorObj = new ErrorObj(500,
								'da0103',
								__filename,
								'removeAllRelationships',
								'error deleting in postgres',
								'Database error',
								del_err
							);
							console.log(errorObj);
							callback();
						});
					}
					else {
						callback();
					}
				}, function (err) {
					if (!err) {
						deferred.resolve(true);
					}
					else {
						releaseConnection(connection)
						.then(function() {
							var errorObj = new ErrorObj(500,
								'da0104',
								__filename,
								'removeAllRelationships',
								'error removing all relationships',
								'Database error',
								err
							);
							deferred.reject(errorObj);
						});
					}
				});
			}
		})
		.fail(function (err) {
			deferred.reject(err.AddToError(__filename, 'removeAllRelationships'));
		});
	}
	else {
		releaseConnection(connection)
		.then(function() {
			var errorObj = new ErrorObj(500,
				'da0106',
				__filename,
				'removeAllRelationships',
				'object inputs must include an id and object_type property'
			);
			deferred.reject(errorObj);
		});
	}

	deferred.promise.nodeify(callback);
	return deferred.promise;
};

function t_removeAllRelationships(connection, obj, da, callback) {
	var deferred = Q.defer();

	removeAllRelationships(obj, da, connection)
	.then(function (res) {
		deferred.resolve(res);
	})
	.fail(function (err) {
		DataAccess.prototype.rollbackTransaction(connection)
		.then(function (rollback_res) {
			deferred.reject(err.AddToError(__filename, 't_removeAllRelationships', 'transaction rolled back'));
		})
		.fail(function (rollback_err) {
			deferred.reject(rollback_err.AddToError(__filename, 't_removeAllRelationships'));
		});
	});
	deferred.promise.nodeify(callback);
	return deferred.promise;
};


// obj -- AN ENTITY INCLUDING 'id' AND 'object_type'
// relatedType -- AN 'object_type' VALUE
// relType -- THE NAME OR TYPE OF A RELATIONSHIP
// GIVEN AN ENTITY obj, RETURN ALL RELATED ENTITIES WITH 'object_type' = relatedType
// AND WHERE THE RELATIONSHIP'S relType IS THE SAME AS THE ONE SPECIFIED.  IF
// relType IS undefined OR null, RETURN ALL RELATED OBJECTS REGARDLESS OF relType
DataAccess.prototype.join = function (obj, relatedType, relType, connection, callback) {
	var deferred = Q.defer();

	if (obj.id !== null && obj.object_type !== null) {
		var origCollection = typeToCollectionMap[obj.object_type];
		if (origCollection === null) {
			releaseConnection(connection)
			.then(function() {
				var errorObj = new ErrorObj(500,
					'da0109',
					__filename,
					'join',
					'could not find entity type'
				);
				deferred.reject(errorObj);
			});

			deferred.promise.nodeify(callback);
			return deferred.promise;
		}
		var relatedCollection = typeToCollectionMap[relatedType];
		if (relatedCollection === null) {
			releaseConnection(connection)
			.then(function() {
				var errorObj = new ErrorObj(500,
					'da0110',
					__filename,
					'join',
					'could not find related entity type'
				);
				deferred.reject(errorObj);
			});

			deferred.promise.nodeify(callback);
			return deferred.promise;
		}

		var linkingTable = null;
		var typesAreReversed = false;
		for (var mpIdx = 0; mpIdx < relationshipMap.length; mpIdx++) {
			var relDescriptor = relationshipMap[mpIdx];
			if (relDescriptor.type1 === obj.object_type && relDescriptor.type2 === relatedType) {
				linkingTable = relDescriptor.linkingTable;
				break;
			}
			else if (relDescriptor.type1 === relatedType && relDescriptor.type2 === obj.object_type) {
				// THEY ARE IN THE WRONG ORDER, SWITCH THEM
				typesAreReversed = true;
				linkingTable = relDescriptor.linkingTable;
				break;
			}
		}
		if (linkingTable === null) {
			releaseConnection(connection)
			.then(function() {
				var errorObj = new ErrorObj(500,
					'da0111',
					__filename,
					'join',
					'could not resolve a relationship between these entity types'
				);
				deferred.reject(errorObj);
			});

			deferred.promise.nodeify(callback);
			return deferred.promise;
		}


		var qry;
		var qry_params = [];
		if (!typesAreReversed) {
			if (relType === null || relType === undefined) {
				qry = "SELECT rTable.data as data, lTable.rel_type as rel_type, lTable.rel_props as rel_props FROM \"" + origCollection + "\" oTable INNER JOIN \"" + linkingTable + "\" lTable ON oTable.row_id = lTable.left_id INNER JOIN \"" + relatedCollection + "\" rTable ON lTable.right_id = rTable.row_id WHERE oTable.data @> '{\"id\": \"" + obj.id + "\"}' AND rTable.data->'is_active' = 'true' ORDER BY rTable.row_id"
			}
			else {
				qry = "SELECT rTable.data as data, lTable.rel_props as rel_props FROM \"" + origCollection + "\" oTable INNER JOIN \"" + linkingTable + "\" lTable ON oTable.row_id = lTable.left_id INNER JOIN \"" + relatedCollection + "\" rTable ON lTable.right_id = rTable.row_id WHERE oTable.data @> '{\"id\": \"" + obj.id + "\"}' AND lTable.rel_type = $1 AND rTable.data->'is_active' = 'true' ORDER BY rTable.row_id";
				qry_params = [relType];
			}
		}
		else {
			if (relType === null || relType === undefined) {
				qry = "SELECT rTable.data as data, lTable.rel_type as rel_type, lTable.rel_props as rel_props FROM \"" + origCollection + "\" oTable INNER JOIN \"" + linkingTable + "\" lTable ON oTable.row_id = lTable.right_id INNER JOIN \"" + relatedCollection + "\" rTable ON lTable.left_id = rTable.row_id WHERE oTable.data @> '{\"id\": \"" + obj.id + "\"}' AND rTable.data->'is_active' = 'true' ORDER BY rTable.row_id";
			}
			else {
				qry = "SELECT rTable.data as data, lTable.rel_props as rel_props FROM \"" + origCollection + "\" oTable INNER JOIN \"" + linkingTable + "\" lTable ON oTable.row_id = lTable.right_id INNER JOIN \"" + relatedCollection + "\" rTable ON lTable.left_id = rTable.row_id WHERE oTable.data @> '{\"id\": \"" + obj.id + "\"}' AND lTable.rel_type = $1 AND rTable.data->'is_active' = 'true' ORDER BY rTable.row_id";
				qry_params = [relType];
			}
		}
		DataAccess.prototype.ExecutePostgresQuery(qry, qry_params, connection)
		.then(function (connection) {
			var resolveObjs = [];
			for(var rIdx = 0; rIdx < connection.results.length; rIdx++) {
				var result = connection.results[rIdx].data;
				if (typeof(connection.results[rIdx].rel_props) !== 'undefined'){
					result.rel_props = connection.results[rIdx].rel_props;
				}
				else {
					result.rel_props = null;
				}
				if(relType === undefined || relType === null) {
					result.rel_type = connection.results[rIdx].rel_type;
				}
				else {
					result.rel_type = relType;
				}
				resolveObjs.push(result);
			}
			deferred.resolve(resolveObjs);
		})
		.fail(function (err) {
			deferred.reject(err.AddToError(__filename, 'join'));
		});
	}
	else {
		var errorObj = new ErrorObj(500,
			'da0113',
			__filename,
			'join',
			'object inputs must have an id and object_type property'
		);
		deferred.reject(errorObj);
	}
	deferred.promise.nodeify(callback);
	return deferred.promise;
};

DataAccess.prototype.t_join = function (connection, obj, relatedType, relType, callback) {
	var deferred = Q.defer();
	DataAccess.prototype.join(obj, relatedType, relType, connection)
	.then(function (res_obj) {
		deferred.resolve(res_obj);
	})
	.fail(function (err) {
		DataAccess.prototype.rollbackTransaction(connection)
		.then(function (rollback_res) {
			deferred.reject(err.AddToError(__filename, 't_join', 'transaction rolled back'));
		})
		.fail(function (rollback_err) {
			deferred.reject(rollback_err.AddToError(__filename, 't_join'));
		});
	});

	deferred.promise.nodeify(callback);
	return deferred.promise;
};

// obj -- AN ENTITY INCLUDING 'id' AND 'object_type'
// relatedType -- AN 'object_type' VALUE
// relType -- THE NAME OR TYPE OF A RELATIONSHIP
// GIVEN AN ENTITY obj, RETURN ALL RELATED ENTITIES WITH 'object_type' = relatedType
// AND WHERE THE RELATIONSHIP'S relType IS THE SAME AS THE ONE SPECIFIED.  IF
// relType IS undefined OR null, RETURN ALL RELATED OBJECTS REGARDLESS OF relType
// IF MORE THAN ONE ENTITY OR NO ENTITIES MATCH, RETURN AN ERROR
DataAccess.prototype.joinOne = function (obj, relatedType, relType, connection, callback) {
	var deferred = Q.defer();

	if (obj.id !== null && obj.object_type !== null) {
		var origCollection = typeToCollectionMap[obj.object_type];
		if (origCollection === null) {
			releaseConnection(connection)
			.then(function() {
				var errorObj = new ErrorObj(500,
					'da0116',
					__filename,
					'joinOne',
					'could not find entity type'
				);
				deferred.reject(errorObj);
			});

			deferred.promise.nodeify(callback);
			return deferred.promise;
		}
		var relatedCollection = typeToCollectionMap[relatedType];
		if (relatedCollection === null) {
			releaseConnection(connection)
			.then(function() {
				var errorObj = new ErrorObj(500,
					'da0117',
					__filename,
					'joinOne',
					'could not find related entity type'
				);
				deferred.reject(errorObj);
			});

			deferred.promise.nodeify(callback);
			return deferred.promise;
		}

		var linkingTable = null;
		var typesAreReversed = false;
		for (var mpIdx = 0; mpIdx < relationshipMap.length; mpIdx++) {
			var relDescriptor = relationshipMap[mpIdx];
			if (relDescriptor.type1 === obj.object_type && relDescriptor.type2 === relatedType) {
				linkingTable = relDescriptor.linkingTable;
				break;
			}
			else if (relDescriptor.type1 === relatedType && relDescriptor.type2 === obj.object_type) {
				// THEY ARE IN THE WRONG ORDER, SWITCH THEM
				typesAreReversed = true;
				linkingTable = relDescriptor.linkingTable;
				break;
			}
		}
		if (linkingTable === null) {
			releaseConnection(connection)
			.then(function() {
				var errorObj = new ErrorObj(500,
					'da0118',
					__filename,
					'joinOne',
					'could not resolve a relationship between these entity types'
				);
				deferred.reject(errorObj);
			});

			deferred.promise.nodeify(callback);
			return deferred.promise;
		}

		var qry;
		var qry_params = [];
		if (!typesAreReversed) {
			if (relType === undefined || relType === null) {
				qry = "SELECT rTable.data as data, lTable.rel_type as rel_type FROM \"" + origCollection + "\" oTable INNER JOIN \"" + linkingTable + "\" lTable ON oTable.row_id = lTable.left_id INNER JOIN \"" + relatedCollection + "\" rTable ON lTable.right_id = rTable.row_id WHERE oTable.data @> '{\"id\": \"" + obj.id + "\"}' AND rTable.data->'is_active' = 'true'";
			}
			else {
				qry = "SELECT rTable.data as data FROM \"" + origCollection + "\" oTable INNER JOIN \"" + linkingTable + "\" lTable ON oTable.row_id = lTable.left_id INNER JOIN \"" + relatedCollection + "\" rTable ON lTable.right_id = rTable.row_id WHERE oTable.data @> '{\"id\": \"" + obj.id + "\"}' AND lTable.rel_type = $1 AND rTable.data->'is_active' = 'true'";
				qry_params = [relType];
			}
		}
		else {
			if (relType === undefined || relType === null) {
				qry = "SELECT rTable.data as data, lTable.rel_type as rel_type FROM \"" + origCollection + "\" oTable INNER JOIN \"" + linkingTable + "\" lTable ON oTable.row_id = lTable.right_id INNER JOIN \"" + relatedCollection + "\" rTable ON lTable.left_id = rTable.row_id WHERE oTable.data @> '{\"id\": \"" + obj.id + "\"}' AND rTable.data->'is_active' = 'true'";
			}
			else {
				qry = "SELECT rTable.data as data FROM \"" + origCollection + "\" oTable INNER JOIN \"" + linkingTable + "\" lTable ON oTable.row_id = lTable.right_id INNER JOIN \"" + relatedCollection + "\" rTable ON lTable.left_id = rTable.row_id WHERE oTable.data @> '{\"id\": \"" + obj.id + "\"}' AND lTable.rel_type = $1 AND rTable.data->'is_active' = 'true'";
				qry_params = [relType];
			}
		}
		DataAccess.prototype.ExecutePostgresQuery(qry, qry_params, connection)
		.then(function (connection) {
			if (connection.results.length === 0) {
				releaseConnection(connection)
				.then(function() {
					var errorObj = new ErrorObj(500,
						'da0119',
						__filename,
						'joinOne',
						'no entities found with that id'
					);
					deferred.reject(errorObj);
				});
			}
			else if (connection.results.length > 1) {
				releaseConnection(connection)
				.then(function() {
					var errorObj = new ErrorObj(500,
						'da0120',
						__filename,
						'joinOne',
						'multiple entities found with that id'
					);
					deferred.reject(errorObj);
				});
			}
			else {
				var result = connection.results[0].data;
				if(relType === undefined || relType === null) {
					result.rel_type = connection.results[0].rel_type;
				}
				else {
					result.rel_type = relType;
				}
				deferred.resolve(result);
			}
		})
		.fail(function (err) {
			deferred.reject(err.AddToError(__filename, 'joinOne'));
		});
	}
	else {
		releaseConnection(connection)
		.then(function() {
			var errorObj = new ErrorObj(500,
				'da0122',
				__filename,
				'joinOne',
				'object inputs must have an id and object_type property'
			);
			deferred.reject(errorObj);
		});
	}

	deferred.promise.nodeify(callback);
	return deferred.promise;
};

DataAccess.prototype.t_joinOne = function (connection, obj, relatedType, relType, callback) {
	var deferred = Q.defer();
	DataAccess.prototype.joinOne(obj, relatedType, relType, connection)
	.then(function (res_obj) {
		deferred.resolve(res_obj);
	})
	.fail(function (err) {
		DataAccess.prototype.rollbackTransaction(connection)
		.then(function (rollback_res) {
			deferred.reject(err.AddToError(__filename, 't_joinOne', 'transaction rolled back'));
		})
		.fail(function (rollback_err) {
			deferred.reject(rollback_err.AddToError(__filename, 't_joinOne'));
		});
	});

	deferred.promise.nodeify(callback);
	return deferred.promise;
};

// objectType -- AN 'object_type' VALUE
// objectWhere -- A JSON OBJECT WITH ANY PARAMETERS TO BE USED FOR MATCHING THE 
//					ROOT ENTITIES
// relatedType -- AN 'object_type' VALUE OF RELATED ENTITIES
// relatedWhere -- A JSON OBJECT WITH ANY PARAMETERS TO BE USED FOR MATCHING THE
//					RELATED ENTITIES
// GIVEN A ROOT ENTITY TYPE AND A SET OF PARAMETERS ON WHICH TO MATCH, FIND ALL
// RELATED ENTITIES OF TYPE relatedType MATCHING THE PARAMETERS IN relatedWhere
DataAccess.prototype.joinWhere = function (objectType, objectWhere, relatedType, relatedWhere, relType, connection, callback) {
	var deferred = Q.defer();

	if (objectType !== null || objectWhere !== null || relatedType !== null || relatedWhere !== null) {
		var origCollection = typeToCollectionMap[objectType];
		if (origCollection === null) {
			releaseConnection(connection)
			.then(function() {
				var errorObj = new ErrorObj(500,
					'da0125',
					__filename,
					'joinWhere',
					'could not resolve entity type'
				);
				deferred.reject(errorObj);
			});

			deferred.promise.nodeify(callback);
			return deferred.promise;
		}
		var relatedCollection = typeToCollectionMap[relatedType];
		if (relatedCollection === null) {
			releaseConnection(connection)
			.then(function() {
				var errorObj = new ErrorObj(500,
					'da0203',
					__filename,
					'joinWhere',
					'could not resolve related entity type'
				);
				deferred.reject(errorObj);
			});

			deferred.promise.nodeify(callback);
			return deferred.promise;
		}

		var linkingTable = null;
		var typesAreReversed = false;
		for (var mpIdx = 0; mpIdx < relationshipMap.length; mpIdx++) {
			var relDescriptor = relationshipMap[mpIdx];
			if (relDescriptor.type1 === objectType && relDescriptor.type2 === relatedType) {
				linkingTable = relDescriptor.linkingTable;
				break;
			}
			else if (relDescriptor.type1 === relatedType && relDescriptor.type2 === objectType) {
				// THEY ARE IN THE WRONG ORDER, SWITCH THEM
				typesAreReversed = true;
				linkingTable = relDescriptor.linkingTable;
				break;
			}
		}
		if (linkingTable === null) {
			releaseConnection(connection)
			.then(function() {
				var errorObj = new ErrorObj(500,
					'da0126',
					__filename,
					'joinWhere',
					'could not resolve relationship between these entity types'
				);
				deferred.reject(errorObj);
			});

			deferred.promise.nodeify(callback);
			return deferred.promise;
		}
		var qry;
		var qry_params = [];
		if (!typesAreReversed) {
			if (relType === undefined || relType === null) {
				qry = "SELECT rTable.data as data, lTable.rel_type as rel_type FROM \"" + origCollection + "\" oTable INNER JOIN \"" + linkingTable + "\" lTable ON oTable.row_id = lTable.left_id INNER JOIN \"" + relatedCollection + "\" rTable ON lTable.right_id = rTable.row_id WHERE oTable.data @> '" + JSON.stringify(objectWhere) + "' AND rTable.data @> '" + JSON.stringify(relatedWhere) + "' AND rTable.data->'is_active' = 'true' ORDER BY rTable.row_id";
			}
			else {
				qry = "SELECT rTable.data as data FROM \"" + origCollection + "\" oTable INNER JOIN \"" + linkingTable + "\" lTable ON oTable.row_id = lTable.left_id INNER JOIN \"" + relatedCollection + "\" rTable ON lTable.right_id = rTable.row_id WHERE oTable.data @> '" + JSON.stringify(objectWhere) + "' AND rTable.data @> '" + JSON.stringify(relatedWhere) + "' AND lTable.rel_type = $1 AND rTable.data->'is_active' = 'true' ORDER BY rTable.row_id";
				qry_params = [relType];
			}
		}
		else {
			if (relType === undefined || relType === null) {
				qry = "SELECT rTable.data as data, lTable.rel_type as rel_type FROM \"" + origCollection + "\" oTable INNER JOIN \"" + linkingTable + "\" lTable ON oTable.row_id = lTable.right_id INNER JOIN \"" + relatedCollection + "\" rTable ON lTable.left_id = rTable.row_id WHERE oTable.data @> '" + JSON.stringify(objectWhere) + "' AND rTable.data @> '" + JSON.stringify(relatedWhere) + "' AND rTable.data->'is_active' = 'true' ORDER BY rTable.row_id";
			}
			else {
				qry = "SELECT rTable.data as data FROM \"" + origCollection + "\" oTable INNER JOIN \"" + linkingTable + "\" lTable ON oTable.row_id = lTable.right_id INNER JOIN \"" + relatedCollection + "\" rTable ON lTable.left_id = rTable.row_id WHERE oTable.data @> '" + JSON.stringify(objectWhere) + "' AND rTable.data @> '" + JSON.stringify(relatedWhere) + "' AND lTable.rel_type = $1 AND rTable.data->'is_active' = 'true' ORDER BY rTable.row_id";
				qry_params = [relType];
			}
		}

		DataAccess.prototype.ExecutePostgresQuery(qry, qry_params, connection)
		.then(function (connection) {
			var resolveObjs = [];
			for(var rIdx = 0; rIdx < connection.results.length; rIdx++) {
				var result = connection.results[rIdx].data;
				if(relType === undefined || relType === null) {
					result.rel_type = connection.results[rIdx].rel_type;
				}
				else {
					result.rel_type = relType;
				}
				resolveObjs.push(result);
			}
			deferred.resolve(resolveObjs);
		})
		.fail(function (err) {
			deferred.reject(err.AddToError(__filename, 'joinWhere'));
		});
	}
	else {
		releaseConnection(connection)
		.then(function() {
			var errorObj = new ErrorObj(500,
				'da0128',
				__filename,
				'joinWhere',
				'missing arguments'
			);
			deferred.reject(errorObj);
		});
	}

	deferred.promise.nodeify(callback);
	return deferred.promise;
};

DataAccess.prototype.t_joinWhere = function (connection, objectType, objectWhere, relatedType, relatedWhere, relType, callback) {
	var deferred = Q.defer();
	DataAccess.prototype.joinWhere(objectType, objectWhere, relatedType, relatedWhere, relType, connection)
	.then(function (res_obj) {
		deferred.resolve(res_obj);
	})
	.fail(function (err) {
		DataAccess.prototype.rollbackTransaction(connection)
		.then(function (rollback_res) {
			deferred.reject(err.AddToError(__filename, 't_joinWhere', 'transaction rolled back'));
		})
		.fail(function (rollback_err) {
			deferred.reject(rollback_err.AddToError(__filename, 't_joinWhere'));
		});
	});

	deferred.promise.nodeify(callback);
	return deferred.promise;
};

// objectType -- AN 'object_type' VALUE
// objectWhere -- A JSON OBJECT WITH ANY PARAMETERS TO BE USED FOR MATCHING THE 
//					ROOT ENTITIES
// relatedType -- AN 'object_type' VALUE OF RELATED ENTITIES
// relatedWhere -- A JSON OBJECT WITH ANY PARAMETERS TO BE USED FOR MATCHING THE
//					RELATED ENTITIES
// orderField -- THE FIELD FROM THE RELATED ENTITIES TO USE IN ORDERING THE RESULTS
// desc -- IF true, USE DESCENDING ORDER, OTHERWISE, USE ASCENDING ORDER
// GIVEN A ROOT ENTITY TYPE AND A SET OF PARAMETERS ON WHICH TO MATCH, FIND ALL
// RELATED ENTITIES OF TYPE relatedType MATCHING THE PARAMETERS IN relatedWhere
// ORDER THE RESULTS BASED ON orderField and desc
DataAccess.prototype.joinWhereOrdered = function (objectType, objectWhere, relatedType, relatedWhere, relType, orderField, desc, connection, callback) {
	var deferred = Q.defer();

	var direction = 'ASC';
	if (desc) {
		direction = 'DESC';
	}

	if (objectType !== null || objectWhere !== null || relatedType !== null || relatedWhere !== null) {
		var origCollection = typeToCollectionMap[objectType];
		if (origCollection === null) {
			releaseConnection(connection)
			.then(function() {
				var errorObj = new ErrorObj(500,
					'da0131',
					__filename,
					'joinWhereOrdered',
					'could not resolve entity type'
				);
				deferred.reject(errorObj);
			});

			deferred.promise.nodeify(callback);
			return deferred.promise;
		}
		var relatedCollection = typeToCollectionMap[relatedType];
		if (relatedCollection === null) {
			releaseConnection(connection)
			.then(function() {
				var errorObj = new ErrorObj(500,
					'da0132',
					__filename,
					'joinWhereOrdered',
					'could not resolve related entity type'
				);
				deferred.reject(errorObj);
			});

			deferred.promise.nodeify(callback);
			return deferred.promise;
		}

		var linkingTable = null;
		var typesAreReversed = false;
		for (var mpIdx = 0; mpIdx < relationshipMap.length; mpIdx++) {
			var relDescriptor = relationshipMap[mpIdx];
			if (relDescriptor.type1 === objectType && relDescriptor.type2 === relatedType) {
				linkingTable = relDescriptor.linkingTable;
				break;
			}
			else if (relDescriptor.type1 === relatedType && relDescriptor.type2 === objectType) {
				// THEY ARE IN THE WRONG ORDER, SWITCH THEM
				typesAreReversed = true;
				linkingTable = relDescriptor.linkingTable;
				break;
			}
		}
		if (linkingTable === null) {
			releaseConnection(connection)
			.then(function() {
				var errorObj = new ErrorObj(500,
					'da0133',
					__filename,
					'joinWhereOrdered',
					'could not resolve relationship between these entity types'
				);
				deferred.reject(errorObj);
			});

			deferred.promise.nodeify(callback);
			return deferred.promise;
		}
		var qry;
		var qry_params = [];
		if (!typesAreReversed) {
			if (relType === undefined || relType === null) {
				qry = "SELECT rTable.data as \"" + relatedType + "\", oTable.data as \"" + objectType + "\", lTable.rel_type as rel_type FROM \"" + origCollection + "\" oTable INNER JOIN \"" + linkingTable + "\" lTable ON oTable.row_id = lTable.left_id INNER JOIN \"" + relatedCollection + "\" rTable ON lTable.right_id = rTable.row_id WHERE oTable.data @> '" + JSON.stringify(objectWhere) + "' AND rTable.data @> '" + JSON.stringify(relatedWhere) + "'  AND rTable.data->'is_active' = 'true' ORDER BY rTable.data->>'" + orderField + "' " + direction;
			}
			else {
				qry = "SELECT rTable.data as \"" + relatedType + "\", oTable.data as \"" + objectType + "\", lTable.rel_type as rel_type FROM \"" + origCollection + "\" oTable INNER JOIN \"" + linkingTable + "\" lTable ON oTable.row_id = lTable.left_id INNER JOIN \"" + relatedCollection + "\" rTable ON lTable.right_id = rTable.row_id WHERE oTable.data @> '" + JSON.stringify(objectWhere) + "' AND rTable.data @> '" + JSON.stringify(relatedWhere) + "' AND lTable.rel_type = $1 AND rTable.data->'is_active' = 'true' ORDER BY rTable.data->>'" + orderField + "' " + direction;
				qry_params = [relType];
			}
		}
		else {
			if (relType === undefined || relType === null) {
				qry = "SELECT rTable.data as \"" + relatedType + "\", oTable.data \"" + objectType + "\", lTable.rel_type as rel_type FROM \"" + origCollection + "\" oTable INNER JOIN \"" + linkingTable + "\" lTable ON oTable.row_id = lTable.right_id INNER JOIN \"" + relatedCollection + "\" rTable ON lTable.left_id = rTable.row_id WHERE oTable.data @> '" + JSON.stringify(objectWhere) + "' AND rTable.data @> '" + JSON.stringify(relatedWhere) + "' AND rTable.data->'is_active' = 'true' ORDER BY rTable.data->>'" + orderField + "' " + direction;
			}
			else {
				qry = "SELECT rTable.data as \"" + relatedType + "\", oTable.data \"" + objectType + "\", lTable.rel_type as rel_type FROM \"" + origCollection + "\" oTable INNER JOIN \"" + linkingTable + "\" lTable ON oTable.row_id = lTable.right_id INNER JOIN \"" + relatedCollection + "\" rTable ON lTable.left_id = rTable.row_id WHERE oTable.data @> '" + JSON.stringify(objectWhere) + "' AND rTable.data @> '" + JSON.stringify(relatedWhere) + "' AND lTable.rel_type = $1 AND rTable.data->'is_active' = 'true' ORDER BY rTable.data->>'" + orderField + "' " + direction;
				qry_params = [relType];
			}
		}
		DataAccess.prototype.ExecutePostgresQuery(qry, qry_params, connection)
		.then(function (connection) {
			deferred.resolve(connection.results);
		})
		.fail(function (err) {
			deferred.reject(err.AddToError(__filename, 'joinWhereOrdered'));
		});
	}
	else {
		releaseConnection(connection)
		.then(function() {
			var errorObj = new ErrorObj(500,
				'da0135',
				__filename,
				'joinWhereOrdered',
				'missing arguments'
			);
			deferred.reject(errorObj);
		});
	}

	deferred.promise.nodeify(callback);
	return deferred.promise;
};

DataAccess.prototype.t_joinWhereOrdered = function (connection, objectType, objectWhere, relatedType, relatedWhere, relType, orderField, desc, callback) {
	var deferred = Q.defer();
	DataAccess.prototype.joinWhereOrdered(objectType, objectWhere, relatedType, relatedWhere, relType, orderField, desc, connection)
	.then(function (res_obj) {
		deferred.resolve(res_obj);
	})
	.fail(function (err) {
		DataAccess.prototype.rollbackTransaction(connection)
		.then(function (rollback_res) {
			deferred.reject(err.AddToError(__filename, 't_joinWhereOrdered', 'transaction rolled back'));
		})
		.fail(function (rollback_err) {
			deferred.reject(rollback_err.AddToError(__filename, 't_joinWhereOrdered'));
		});
	});

	deferred.promise.nodeify(callback);
	return deferred.promise;
};

// obj -- THE ROOT ENTITY USED FOR THE JOIN
// relatedType -- THE 'object_type' VALUE OF THE RELATED ENTITIES
// relType -- THE NAME OR TYPE OF THE RELATIONSHIPS TO USE WHEN FINDING
//				RELATED ENTITIES
// dateField -- THE FIELD IN THE RELATED ENTITIES TO USE FOR DATE FILTERING
// startDate -- RETURN ONLY RELATED ENTITIES WITH dateField AFTER THIS DATE
// endDate -- RETURN ONLY RELATED ENTITIES WITH dateField BEFORE THIS DATE
// startDate OR endDate MAY BE null, BUT NOT BOTH
// DATES MUST BE ISO FORMAT YYYY-MM-DDTHH:mm:ss.uuuZ TO DESIRED PRECISION
DataAccess.prototype.joinBetweenDates = function (obj, relatedType, relType, dateField, startDate, endDate, connection, callback) {
	var deferred = Q.defer();

	if (startDate === undefined) {
		startDate = null;
	}
	if (endDate === undefined) {
		endDate = null;
	}
	if (startDate === null && endDate === null) {
		releaseConnection(connection)
		.then(function() {
			var errorObj = new ErrorObj(500,
				'da0138',
				__filename,
				'joinBetweenDates',
				'either startDate or endDate must be supplied'
			);
			deferred.reject(errorObj);
		});

		deferred.promise.nodeify(callback);
		return deferred.promise;
	}

	if (obj.id !== null && obj.object_type !== null) {
		var origCollection = typeToCollectionMap[obj.object_type];
		if (origCollection === null) {
			releaseConnection(connection)
			.then(function() {
				var errorObj = new ErrorObj(500,
					'da0139',
					__filename,
					'joinBetweenDates',
					'could not find entity type'
				);
				deferred.reject(errorObj);
			});

			deferred.promise.nodeify(callback);
			return deferred.promise;
		}
		var relatedCollection = typeToCollectionMap[relatedType];
		if (relatedCollection === null) {
			releaseConnection(connection)
			.then(function() {
				var errorObj = new ErrorObj(500,
					'da0140',
					__filename,
					'joinBetweenDates',
					'could not find related entity type'
				);
				deferred.reject(errorObj);
			});

			deferred.promise.nodeify(callback);
			return deferred.promise;
		}

		var linkingTable = null;
		var typesAreReversed = false;
		for (var mpIdx = 0; mpIdx < relationshipMap.length; mpIdx++) {
			var relDescriptor = relationshipMap[mpIdx];
			if (relDescriptor.type1 === obj.object_type && relDescriptor.type2 === relatedType) {
				linkingTable = relDescriptor.linkingTable;
				break;
			}
			else if (relDescriptor.type1 === relatedType && relDescriptor.type2 === obj.object_type) {
				// THEY ARE IN THE WRONG ORDER, SWITCH THEM
				typesAreReversed = true;
				linkingTable = relDescriptor.linkingTable;
				break;
			}
		}
		if (linkingTable === null) {
			releaseConnection(connection)
			.then(function() {
				var errorObj = new ErrorObj(500,
					'da0141',
					__filename,
					'joinBetweenDates',
					'could not resolve a relationship between these entity types'
				);
				deferred.reject(errorObj);
			});

			deferred.promise.nodeify(callback);
			return deferred.promise;
		}


		var qry;
		var qry_params = [];
		if (!typesAreReversed) {
			if (relType === null || relType === undefined) {
				if (startDate !== null && endDate !== null) {
					qry = "SELECT rTable.data as data, lTable.rel_type as rel_type FROM \"" + origCollection + "\" oTable INNER JOIN \"" + linkingTable + "\" lTable ON oTable.row_id = lTable.left_id INNER JOIN \"" + relatedCollection + "\" rTable ON lTable.right_id = rTable.row_id WHERE oTable.data @> '{\"id\": \"" + obj.id + "\"}' AND rTable.data->'is_active' = 'true' AND to_timestamp(rTable.data->>'" + dateField + "', 'YYYY-MM-DD HH24:MI:SS.MS') BETWEEN to_timestamp('" + startDate + "', 'YYYY-MM-DD HH24:MI:SS.MS') AND to_timestamp('" + endDate + "', 'YYYY-MM-DD HH24:MI:SS.MS') ORDER BY rTable.row_id";
				}
				else if (endDate === null) {
					qry = "SELECT rTable.data as data, lTable.rel_type as rel_type FROM \"" + origCollection + "\" oTable INNER JOIN \"" + linkingTable + "\" lTable ON oTable.row_id = lTable.left_id INNER JOIN \"" + relatedCollection + "\" rTable ON lTable.right_id = rTable.row_id WHERE oTable.data @> '{\"id\": \"" + obj.id + "\"}' AND rTable.data->'is_active' = 'true' AND to_timestamp(rTable.data->>'" + dateField + "', 'YYYY-MM-DD HH24:MI:SS.MS') > to_timestamp('" + startDate + "', 'YYYY-MM-DD HH24:MI:SS.MS') ORDER BY rTable.row_id";
				}
				else {
					qry = "SELECT rTable.data as data, lTable.rel_type as rel_type FROM \"" + origCollection + "\" oTable INNER JOIN \"" + linkingTable + "\" lTable ON oTable.row_id = lTable.left_id INNER JOIN \"" + relatedCollection + "\" rTable ON lTable.right_id = rTable.row_id WHERE oTable.data @> '{\"id\": \"" + obj.id + "\"}' AND rTable.data->'is_active' = 'true' AND to_timestamp(rTable.data->>'" + dateField + "', 'YYYY-MM-DD HH24:MI:SS.MS') < to_timestamp('" + endDate + "', 'YYYY-MM-DD HH24:MI:SS.MS') ORDER BY rTable.row_id";
				}
			}
			else {
				qry_params = [relType];
				if (startDate !== null && endDate !== null) {
					qry = "SELECT rTable.data as data FROM \"" + origCollection + "\" oTable INNER JOIN \"" + linkingTable + "\" lTable ON oTable.row_id = lTable.left_id INNER JOIN \"" + relatedCollection + "\" rTable ON lTable.right_id = rTable.row_id WHERE oTable.data @> '{\"id\": \"" + obj.id + "\"}' AND lTable.rel_type = $1 AND rTable.data->'is_active' = 'true' AND to_timestamp(rTable.data->>'" + dateField + "', 'YYYY-MM-DD HH24:MI:SS.MS') BETWEEN to_timestamp('" + startDate + "', 'YYYY-MM-DD HH24:MI:SS.MS') AND to_timestamp('" + endDate + "', 'YYYY-MM-DD HH24:MI:SS.MS') ORDER BY rTable.row_id";
				}
				else if (endDate === null) {
					qry = "SELECT rTable.data as data FROM \"" + origCollection + "\" oTable INNER JOIN \"" + linkingTable + "\" lTable ON oTable.row_id = lTable.left_id INNER JOIN \"" + relatedCollection + "\" rTable ON lTable.right_id = rTable.row_id WHERE oTable.data @> '{\"id\": \"" + obj.id + "\"}' AND lTable.rel_type = $1 AND rTable.data->'is_active' = 'true' AND to_timestamp(rTable.data->>'" + dateField + "', 'YYYY-MM-DD HH24:MI:SS.MS') > to_timestamp('" + startDate + "', 'YYYY-MM-DD HH24:MI:SS.MS') ORDER BY rTable.row_id";
				}
				else {
					qry = "SELECT rTable.data as data FROM \"" + origCollection + "\" oTable INNER JOIN \"" + linkingTable + "\" lTable ON oTable.row_id = lTable.left_id INNER JOIN \"" + relatedCollection + "\" rTable ON lTable.right_id = rTable.row_id WHERE oTable.data @> '{\"id\": \"" + obj.id + "\"}' AND lTable.rel_type = $1 AND rTable.data->'is_active' = 'true' AND to_timestamp(rTable.data->>'" + dateField + "', 'YYYY-MM-DD HH24:MI:SS.MS') < to_timestamp('" + endDate + "', 'YYYY-MM-DD HH24:MI:SS.MS') ORDER BY rTable.row_id";
				}
			}
		}
		else {
			if (relType === null || relType === undefined) {
				if (startDate !== null && endDate !== null) {
					qry = "SELECT rTable.data, lTable.rel_type as rel_type FROM \"" + origCollection + "\" oTable INNER JOIN \"" + linkingTable + "\" lTable ON oTable.row_id = lTable.right_id INNER JOIN \"" + relatedCollection + "\" rTable ON lTable.left_id = rTable.row_id WHERE oTable.data @> '{\"id\": \"" + obj.id + "\"}' AND rTable.data->'is_active' = 'true' AND to_timestamp(rTable.data->>'" + dateField + "', 'YYYY-MM-DD HH24:MI:SS.MS') BETWEEN to_timestamp('" + startDate + "', 'YYYY-MM-DD HH24:MI:SS.MS') AND to_timestamp('" + endDate + "', 'YYYY-MM-DD HH24:MI:SS.MS') ORDER BY rTable.row_id";
				}
				else if (endDate === null) {
					qry = "SELECT rTable.data, lTable.rel_type as rel_type FROM \"" + origCollection + "\" oTable INNER JOIN \"" + linkingTable + "\" lTable ON oTable.row_id = lTable.right_id INNER JOIN \"" + relatedCollection + "\" rTable ON lTable.left_id = rTable.row_id WHERE oTable.data @> '{\"id\": \"" + obj.id + "\"}' AND rTable.data->'is_active' = 'true' AND to_timestamp(rTable.data->>'" + dateField + "', 'YYYY-MM-DD HH24:MI:SS.MS') > to_timestamp('" + startDate + "', 'YYYY-MM-DD HH24:MI:SS.MS') ORDER BY rTable.row_id";
				}
				else {
					qry = "SELECT rTable.data, lTable.rel_type as rel_type FROM \"" + origCollection + "\" oTable INNER JOIN \"" + linkingTable + "\" lTable ON oTable.row_id = lTable.right_id INNER JOIN \"" + relatedCollection + "\" rTable ON lTable.left_id = rTable.row_id WHERE oTable.data @> '{\"id\": \"" + obj.id + "\"}' AND rTable.data->'is_active' = 'true' AND to_timestamp(rTable.data->>'" + dateField + "', 'YYYY-MM-DD HH24:MI:SS.MS') < to_timestamp('" + endDate + "', 'YYYY-MM-DD HH24:MI:SS.MS') ORDER BY rTable.row_id";
				}
			}
			else {
				qry_params = [relType];
				if (startDate !== null && endDate !== null) {
					qry = "SELECT rTable.data as data FROM \"" + origCollection + "\" oTable INNER JOIN \"" + linkingTable + "\" lTable ON oTable.row_id = lTable.right_id INNER JOIN \"" + relatedCollection + "\" rTable ON lTable.left_id = rTable.row_id WHERE oTable.data @> '{\"id\": \"" + obj.id + "\"}' AND lTable.rel_type = $1 AND rTable.data->'is_active' = 'true' AND to_timestamp(rTable.data->>'" + dateField + "', 'YYYY-MM-DD HH24:MI:SS.MS') BETWEEN to_timestamp('" + startDate + "', 'YYYY-MM-DD HH24:MI:SS.MS') AND to_timestamp('" + endDate + "', 'YYYY-MM-DD HH24:MI:SS.MS') ORDER BY rTable.row_id";
				}
				else if (endDate === null) {
					qry = "SELECT rTable.data as data FROM \"" + origCollection + "\" oTable INNER JOIN \"" + linkingTable + "\" lTable ON oTable.row_id = lTable.right_id INNER JOIN \"" + relatedCollection + "\" rTable ON lTable.left_id = rTable.row_id WHERE oTable.data @> '{\"id\": \"" + obj.id + "\"}' AND lTable.rel_type = $1 AND rTable.data->'is_active' = 'true' AND to_timestamp(rTable.data->>'" + dateField + "', 'YYYY-MM-DD HH24:MI:SS.MS') > to_timestamp('" + startDate + "', 'YYYY-MM-DD HH24:MI:SS.MS') ORDER BY rTable.row_id";
				}
				else {
					qry = "SELECT rTable.data as data FROM \"" + origCollection + "\" oTable INNER JOIN \"" + linkingTable + "\" lTable ON oTable.row_id = lTable.right_id INNER JOIN \"" + relatedCollection + "\" rTable ON lTable.left_id = rTable.row_id WHERE oTable.data @> '{\"id\": \"" + obj.id + "\"}' AND lTable.rel_type = $1 AND rTable.data->'is_active' = 'true' AND to_timestamp(rTable.data->>'" + dateField + "', 'YYYY-MM-DD HH24:MI:SS.MS') < to_timestamp('" + endDate + "', 'YYYY-MM-DD HH24:MI:SS.MS') ORDER BY rTable.row_id";
				}
			}
		}

		DataAccess.prototype.ExecutePostgresQuery(qry, qry_params, connection)
		.then(function (connection) {
			var resolveObjs = [];
			for(var rIdx = 0; rIdx < connection.results.length; rIdx++) {
				var result = connection.results[rIdx].data;
				if(relType === undefined || relType === null) {
					result.rel_type = connection.results[rIdx].rel_type;
				}
				else {
					result.rel_type = relType;
				}
				resolveObjs.push(result);
			}
			deferred.resolve(resolveObjs);
		})
		.fail(function (err) {
			deferred.reject(err.AddToError(__filename, 'joinBetweenDates'));
		});
	}
	else {
		releaseConnection(connection)
		.then(function() {
			var errorObj = new ErrorObj(500,
				'da0143',
				__filename,
				'joinBetweenDates',
				'object inputs must have an id and object_type property'
			);
			deferred.reject(errorObj);
		});
	}

	deferred.promise.nodeify(callback);
	return deferred.promise;
};

DataAccess.prototype.t_joinBetweenDates = function (connection, obj, relatedType, relType, dateField, startDate, endDate, callback) {
	var deferred = Q.defer();
	DataAccess.prototype.joinBetweenDates(obj, relatedType, relType, dateField, startDate, endDate, connection)
	.then(function (res_obj) {
		deferred.resolve(res_obj);
	})
	.fail(function (err) {
		DataAccess.prototype.rollbackTransaction(connection)
		.then(function (rollback_res) {
			deferred.reject(err.AddToError(__filename, 't_joinBetweenDates', 'transaction rolled back'));
		})
		.fail(function (rollback_err) {
			deferred.reject(rollback_err.AddToError(__filename, 't_joinBetweenDates'));
		});
	});

	deferred.promise.nodeify(callback);
	return deferred.promise;
};

// objectType -- AN 'object_type' VALUE
// objectWhere -- A JSON OBJECT WITH ANY PARAMETERS TO BE USED FOR MATCHING THE 
//					ROOT ENTITIES
// relatedType -- AN 'object_type' VALUE OF RELATED ENTITIES
// relatedWhere -- A JSON OBJECT WITH ANY PARAMETERS TO BE USED FOR MATCHING THE
//					RELATED ENTITIES
// GIVEN A ROOT ENTITY TYPE AND A SET OF PARAMETERS ON WHICH TO MATCH, FIND ALL
// RELATED ENTITIES OF TYPE relatedType MATCHING THE PARAMETERS IN relatedWhere
// AND PACK THEM INTO THE ROOT ENTITY TO RETURN RESOLVED ENTITIES
DataAccess.prototype.joinWhereAndResolve = function (objectType, objectWhere, relatedType, relatedWhere, relType, connection, callback) {
	var deferred = Q.defer();

	if (objectType !== null || objectWhere !== null || relatedType !== null || relatedWhere !== null) {
		var origCollection = typeToCollectionMap[objectType];
		if (origCollection === null) {
			releaseConnection(connection)
			.then(function() {
				var errorObj = new ErrorObj(500,
					'da0146',
					__filename,
					'joinWhereAndResolve',
					'could not resolve entity type'
				);
				deferred.reject(errorObj);
			});

			deferred.promise.nodeify(callback);
			return deferred.promise;
		}
		var relatedCollection = typeToCollectionMap[relatedType];
		if (relatedCollection === null) {
			releaseConnection(connection)
			.then(function() {
				var errorObj = new ErrorObj(500,
					'da0147',
					__filename,
					'joinWhereAndResolve',
					'could not resolve related entity type'
				);
				deferred.reject(errorObj);
			});

			deferred.promise.nodeify(callback);
			return deferred.promise;
		}

		var linkingTable = null;
		var typesAreReversed = false;
		for (var mpIdx = 0; mpIdx < relationshipMap.length; mpIdx++) {
			var relDescriptor = relationshipMap[mpIdx];
			if (relDescriptor.type1 === objectType && relDescriptor.type2 === relatedType) {
				linkingTable = relDescriptor.linkingTable;
				break;
			}
			else if (relDescriptor.type1 === relatedType && relDescriptor.type2 === objectType) {
				// THEY ARE IN THE WRONG ORDER, SWITCH THEM
				typesAreReversed = true;
				linkingTable = relDescriptor.linkingTable;
				break;
			}
		}
		if (linkingTable === null) {
			releaseConnection(connection)
			.then(function() {
				var errorObj = new ErrorObj(500,
					'da0148',
					__filename,
					'joinWhereAndResolve',
					'could not resolve relationship between these entity types'
				);
				deferred.reject(errorObj);
			});

			deferred.promise.nodeify(callback);
			return deferred.promise;
		}

		// HANDLE THE RELATIONSHIPS WHICH ARE NOT DESCRIBED IN models.json
		// BECAUSE THEY ARE THE DEFAULT TABLES/RELATIONSHIPS
		var propName = null;
		if (objectType === 'bsuser') {
			if (relatedType === 'session') {
				propName = 'sessions';
			}
			else if (relatedType === 'analytics') {
				propName = 'analytics';
			}
		}
		else if (objectType === 'session') {
			propName = 'bsusers';
		}
		else if (objectType === 'analytics' && relatedType === 'bsuser') {
			propName = 'bsusers';
		}

		if (propName === null) {
			loop1:
			for (var mIdx = 0; mIdx < models.length; mIdx++) {
				// CHECK THE MODEL FOR objectType
				if (models[mIdx].obj_type === objectType) {
					for (var rIdx = 0; rIdx < models[mIdx].relationships.length; rIdx++) {
						if (models[mIdx].relationships[rIdx].relates_to === relatedType) {
							propName = models[mIdx].relationships[rIdx].plural_name;
							break loop1;
						}
					}
				}

				// RELATIONSHIPS ONLY HAVE DESCRIPTORS IN A SINGLE DIRECTION
				// SO CHECK THE RELATED TYPE TOO
				if (models[mIdx].obj_type === relatedType) {
					for (var rIdx = 0; rIdx < models[mIdx].relationships.length; rIdx++) {
						if (models[mIdx].relationships[rIdx].relates_to === objectType) {
							propName = models[mIdx].relationship[rIdx].plural_rev;
							break loop1;
						}
					}
				}
			}
		}

		if (propName === null) {
			releaseConnection(connection)
			.then(function() {
				var errorObj = new ErrorObj(500,
					'da0149',
					__filename,
					'joinWhereAndResolve',
					'could not locate the relationship descriptor in models.json'
				);
				deferred.reject(errorObj);
			});

			deferred.promise.nodeify(callback);
			return deferred.promise;
		}
		var qry;
		var qry_params = [];
		if (!typesAreReversed) {
			if (relType === undefined || relType === null) {
				qry = "SELECT oTable.data as \"rootObj\", rTable.data as \"relObj\", lTable.rel_type as \"relType\" FROM \"" + origCollection + "\" oTable INNER JOIN \"" + linkingTable + "\" lTable ON oTable.row_id = lTable.left_id INNER JOIN \"" + relatedCollection + "\" rTable ON lTable.right_id = rTable.row_id WHERE oTable.data @> '" + JSON.stringify(objectWhere) + "' AND rTable.data @> '" + JSON.stringify(relatedWhere) + "' AND rTable.data->'is_active' = 'true' ORDER BY oTable.row_id";
			}
			else {
				qry = "SELECT oTable.data as \"rootObj\", rTable.data as \"relObj\", lTable.rel_type as \"relType\" FROM \"" + origCollection + "\" oTable INNER JOIN \"" + linkingTable + "\" lTable ON oTable.row_id = lTable.left_id INNER JOIN \"" + relatedCollection + "\" rTable ON lTable.right_id = rTable.row_id WHERE oTable.data @> '" + JSON.stringify(objectWhere) + "' AND rTable.data @> '" + JSON.stringify(relatedWhere) + "' AND lTable.rel_type = $1 AND rTable.data->'is_active' = 'true' ORDER BY oTable.row_id";
				qry_params = [relType];
			}
		}
		else {
			if (relType === undefined || relType === null) {
				qry = "SELECT oTable.data as \"rootObj\", rTable.data as \"relObj\", lTable.rel_type as \"relType\" FROM \"" + origCollection + "\" oTable INNER JOIN \"" + linkingTable + "\" lTable ON oTable.row_id = lTable.right_id INNER JOIN \"" + relatedCollection + "\" rTable ON lTable.left_id = rTable.row_id WHERE oTable.data @> '" + JSON.stringify(objectWhere) + "' AND rTable.data @> '" + JSON.stringify(relatedWhere) + "' AND rTable.data->'is_active' = 'true' ORDER BY oTable.row_id";
			}
			else {
				qry = "SELECT oTable.data as \"rootObj\", rTable.data as \"relObj\", lTable.rel_type as \"relType\" FROM \"" + origCollection + "\" oTable INNER JOIN \"" + linkingTable + "\" lTable ON oTable.row_id = lTable.right_id INNER JOIN \"" + relatedCollection + "\" rTable ON lTable.left_id = rTable.row_id WHERE oTable.data @> '" + JSON.stringify(objectWhere) + "' AND rTable.data @> '" + JSON.stringify(relatedWhere) + "' AND lTable.rel_type = $1 AND rTable.data->'is_active' = 'true' ORDER BY oTable.row_id";
				qry_params = [relType];
			}
		}

		DataAccess.prototype.ExecutePostgresQuery(qry, qry_params, connection)
		.then(function (connection) {
			var returnObjs = [];
			for (var rIdx = 0; rIdx < connection.results.length; rIdx++) {
				var row = connection.results[rIdx];
				var foundObj = false;
				innerloop:
				for (var oIdx = 0; oIdx < returnObjs.length; oIdx++) {
					var obj = returnObjs[oIdx];
					if (obj.id === row.rootObj.id) {
						var rt = row.relType;
						if (rt === undefined || rt === null) {
							rt = 'default';
						}

						if (obj[propName] === undefined || obj[propName] === null) {
							obj[propName] = {};
							obj[propName][rt] = [row.relObj];
						}
						else {
							if (obj[propName][rt] === undefined || obj[propName][rt] === null) {
								obj[propName][rt] = [row.relObj];
							}
							else {
								obj[propName][rt].push(row.relObj);
							}
						}
						foundObj = true;
						break innerloop;
					}
				}
				if (!foundObj) {
					var newObj = row.rootObj;
					var rt = row.relType;
					if (rt === undefined || rt === null) {
						rt = 'default';
					}
					newObj[propName] = {};
					newObj[propName][rt] = [row.relObj];
					returnObjs.push(newObj);
				}
			}
			deferred.resolve(returnObjs);
		})
		.fail(function(err) {
			deferred.reject(err.AddToError(__filename, 'joinWhereAndResolve'));
		});
	}
	else {
		releaseConnection(connection)
		.then(function() {
			var errorObj = new ErrorObj(500,
				'da0150',
				__filename,
				'joinWhereAndResolve',
				'missing arguments'
			);
			deferred.reject(errorObj);
		});
	}

	deferred.promise.nodeify(callback);
	return deferred.promise;
};

DataAccess.prototype.t_joinWhereAndResolve = function (connection, objectType, objectWhere, relatedType, relatedWhere, relType, callback) {
	var deferred = Q.defer();
	DataAccess.prototype.joinWhereAndResolve(objectType, objectWhere, relatedType, relatedWhere, relType, connection)
	.then(function (res_obj) {
		deferred.resolve(res_obj);
	})
	.fail(function (err) {
		DataAccess.prototype.rollbackTransaction(connection)
		.then(function (rollback_res) {
			deferred.reject(err.AddToErrorr(__filename, 't_joinWhereOrdered', 'transaction rolled back'));
		})
		.fail(function (rollback_err) {
			deferred.reject(rollback_err.AddToError(__filename, 't_joinWhereAndResolve'));
		});
	});

	deferred.promise.nodeify(callback);
	return deferred.promise;
};
// ================================================================================


// ================================================================================
// DATA ACCESS UTILITIES
// -------------------------------------------------------------------
// These functions handle various common tasks
// -------------------------------------------------------------------
// RUN ARBITRARY SQL STATEMENTS
DataAccess.prototype.runSql = function (sqlStatement, connection) {
	var deferred = Q.defer();
	var qry = sqlStatement;
	var qry_params = [];
	DataAccess.prototype.ExecutePostgresQuery(qry, qry_params, connection)
	.then(function (connection) {
		deferred.resolve(connection.results);
	})
	.fail(function (err) {
		deferred.reject(err.AddToError(__filename, 'runSql'));
	});

	return deferred.promise;
}

// RUN ARBITRARY SQL STATEMENTS ON THE DB CONNECTION PASSED IN AS ARGUMENT
DataAccess.prototype.t_runSql = function (connection, sqlStatement) {
	var deferred = Q.defer();
	DataAccess.prototype.runsql(sqlStatement, connection)
	.then(function (res_obj) {
		deferred.resolve(res_obj);
	})
	.fail(function (err) {
		DataAccess.prototype.rollbackTransaction(connection)
		.then(function (rollback_res) {
			deferred.reject(err.AddToError(__filename, 't_runSql', 'transaction rolled back'));
		})
		.fail(function (rollback_err) {
			deferred.reject(rollback_err.AddToError(__filename, 't_runSql'));
		});
	});
	deferred.promise.nodeify(callback);
	return deferred.promise;
};

// RETURN THE USER ENTITY BASED ON AN EMAIL ADDRESS
// EMAILS ADDRESSES ARE UNIQUE ACROSS BACKSTRAP
DataAccess.prototype.getUserByEmail = function (email, callback) {
	var deferred = Q.defer();

	var qry = "SELECT bsuser.data FROM bsuser WHERE bsuser.data->>'email' ILIKE $1";
	var qry_params = [email];
	DataAccess.prototype.ExecutePostgresQuery(qry, qry_params, null)
	.then(function (connection) {
		if (connection.results.length === 0) {
			var errorObj = new ErrorObj(500,
				'da0156',
				__filename,
				'getUserByEmailOrUsername',
				'no user found',
				'Cannot find user.',
				null
			);
			deferred.reject(errorObj);
		}
		else if (connection.results.length === 1) {
			deferred.resolve(connection.results[0]);
		}
		else {
			var errorObj = new ErrorObj(500,
				'da0157',
				__filename,
				'getUserByEmailOrUsername',
				'',
				'Found multiple users with that email.',
				null
			);
			deferred.reject(errorObj);
		}
	})
	.fail(function (err) {
		deferred.reject(err.AddToError(__filename, 'getUserByEmail'));
	});

	deferred.promise.nodeify(callback);
	return deferred.promise;
}

// RETURN THE USER ENTITY BASED ON THE SESSION TOKEN
DataAccess.prototype.getUserBySessionToken = function (tkn, connection, callback) {
	var deferred = Q.defer();

	var qry = "SELECT bsuser.data FROM bsuser JOIN bsuser_session ON bsuser.row_id=bsuser_session.left_id JOIN session ON bsuser_session.right_id=session.row_id WHERE session.data->'token' ? '" + tkn + "'";
	var qry_params = [];
	DataAccess.prototype.ExecutePostgresQuery(qry, qry_params, connection)
	.then(function (connection) {
		deferred.resolve(connection.results)
	})
	.fail(function (err) {
		deferred.reject(err.AddToError(__filename, 'getUserBySessionToken'));
	});
	deferred.promise.nodeify(callback);
	return deferred.promise;
}

// RETURN THE USER ENTITY BASED ON username
// USERNAMES ARE UNIQUE ACROSS BACKSTRAP
DataAccess.prototype.getUserByUserName = function (userName, callback) {
	var deferred = Q.defer();

	var qry = "SELECT * FROM bsuser WHERE bsuser.data->'username' ? $1";
	var qry_params = [userName];
	DataAccess.prototype.ExecutePostgresQuery(qry, qry_params, null)
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
			deferred.resolve(connection.results[0]);
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

	deferred.promise.nodeify(callback);
	return deferred.promise;
}

// RETURN THE USER ENTITY BASED ON A FORGOT PASSWORD TOKEN
DataAccess.prototype.getUserByForgotPasswordToken = function (tkn, callback) {
	var deferred = Q.defer();
	var qry_params = [];
	var qry = "SELECT bsuser.data FROM bsuser WHERE data->'forgot_password_tokens' ? '" + tkn + "'";
	DataAccess.prototype.ExecutePostgresQuery(qry, qry_params, null)
		.then(function (connection) {
			deferred.resolve(connection.results);
		})
		.fail(function (err) {
			deferred.reject(err.AddToError(__filename, 'getUserByForgotPasswordToken'));
		});

	deferred.promise.nodeify(callback);
	return deferred.promise;
}

//Pass obj type and a list of that type
DataAccess.prototype.BulkInsert = function (objType, objList, callback) {
	var objCount = objList.length;
	var ix = 0;
	var deferred = Q.defer();

	DataAccess.prototype.startTransaction()
	.then(function (connection) {
		async.eachSeries(objList, function (obj, obj_callback) {
			ix++;
			utilities.getUID()
				.then(function (uid_res) {
					obj.id = uid_res;
					obj.created_at = new Date();
					obj.is_active = true;
					var save_qry = "INSERT INTO \"" + objType + "\"(\"data\") VALUES($1)";
					var save_qry_params = [obj];
					DataAccess.prototype.ExecutePostgresQuery(save_qry, save_qry_params, connection)
						.then(function (connection) {
							obj_callback();
						})
						.fail(function (err) {
							obj_callback(err);
						});
				});
		},
			function (err) {
				if(!err) {
					/* Finished the  series */
					DataAccess.prototype.commitTransaction(connection)
					.then(function (dbEntityObj) {
						deferred.resolve(true);
					})
					.fail(function (commit_err) {
						deferred.reject(commit_err.AddToError(__filename, 'BulkInsert', 'parseAllData >> parseDescriptors3'));
					});
				}
				else {
					deferred.reject(err.AddToError(__filename, 'BulkInsert'));
				}
			});
	});
	deferred.promise.nodeify(callback);
	return deferred.promise;
};

// RETURN A DATABASE RECORD BASED ON tanleName AND rowId
DataAccess.prototype.getByRowId = function (tableName, rowId, connection, callback) {
	var deferred = Q.defer();

	var qry = "SELECT * FROM \"" + tableName + "\" WHERE \"row_id\" = $1";
	var qry_params = [rowId];
	DataAccess.prototype.ExecutePostgresQuery(qry, qry_params, connection)
	.then(function (connection) {
		deferred.resolve(connection.results);
	})
	.fail(function (err) {
		deferred.reject(err.AddToError(__filename, 'getByRowId'));
	});

	deferred.promise.nodeify(callback);
	return deferred.promise;
};

DataAccess.prototype.t_getByRowId = function (connection, tableName, rowId, callback) {
	var deferred = Q.defer();
	DataAccess.prototype.getByRowId(tableName, rowId, connection)
	.then(function (res_obj) {
		deferred.resolve(res_obj);
	})
	.fail(function (err) {
		DataAccess.prototype.rollbackTransaction(connection)
		.then(function (rollback_res) {
			deferred.reject(err.AddToError(__filename, 't_getByRowId', 'transaction rolled back'));
		})
		.fail(function (rollback_err) {
			deferred.reject(rollback_err.AddToError(__filename, 't_getByRowId'));
		});
	});

	deferred.promise.nodeify(callback);
	return deferred.promise;
};

// tableName -- THE NAME OF THE TABLE
// obj -- A JSON OBJECT WITH KEY/VALUES TO BE UPDATED IN THE ENTITY
// rowId -- THE row_id OF THE RECORD HOLDING THE ENTITY IN ITS 'data' COLUMN
// UPDATE AN ENTITY STORED IN THE RECORD WITH rowId IN PLACE USING THE 
// KEY VALUES PAIRS IN obj.
DataAccess.prototype.updateByRowId = function (tableName, obj, rowId, callback) {
	var deferred = Q.defer();

	var qry = "SELECT * FROM \"" + tableName + "\" WHERE \"row_id\" = $1";
	var qry_params = [rowId];
	DataAccess.prototype.ExecutePostgresQuery(qry, qry_params, null)
	.then(function (connection) {
		if (connection.results.length === 0) {
			var errorObj = new ErrorObj(500,
				'da0169',
				__filename,
				'updateByRowId',
				'no entity found with this id'
			);
			deferred.reject(errorObj);
		}
		else if (connection.results.length > 1) {
			var errorObj = new ErrorObj(500,
				'da0170',
				__filename,
				'updateByRowId',
				'multiple entities found with this id'
			);
			deferred.reject(errorObj);
		}
		else {
			// FOUND THE OBJECT
			var updateObj = connection.results[0];
			var keys = Object.keys(obj);
			for (var propIdx = 0; propIdx < keys.length; propIdx++) {
				var key = keys[propIdx];
				if (key !== 'id') {
					updateObj[key] = obj[key];
				}
			}
			updateObj.updated_at = new Date();
			var update_qry = "UPDATE \"" + tableName + "\" SET \"data\" = $1 WHERE \"row_id\" = $2";
			var update_qry_params = [updateObj, rowId];
			DataAccess.prototype.ExecutePostgresQuery(update_qry, update_qry_params, null)
			.then(function (connection) {
				defferred.resolve(connection);
			})
			.fail(function (err) {
				deferred.reject(err.AddToError(__filename, 'updateByRowId'));
			});
		}
	})
	.fail(function(err) {
		deferred.reject(err.AddToError(__filename, 'updateByRowId'));
	});

	deferred.promise.nodeify(callback);
	return deferred.promise;
};

DataAccess.prototype.t_updateByRowId = function (connection, tableName, obj, rowId, callback) {
	var deferred = Q.defer();
	DataAccess.prototype.updateByRowId(tableName, obj, rowId)
	.then(function (res_obj) {
		deferred.resolve(res_obj);
	})
	.fail(function (err) {
		DataAccess.prototype.rollbackTransaction(connection)
		.then(function (rollback_res) {
			deferred.reject(err.AddToError(__filename, 't_updateByRowId', 'transaction rolled back'));
		})
		.fail(function (rollback_err) {
			deferred.reject(rollback_err.AddToError(__filename, 't_updateByRowId'));
		});
	});

	deferred.promise.nodeify(callback);
	return deferred.promise;
};
// ================================================================================


// ================================================================================


// ================================================================================
// BACKSTRAP SQL AND DATA CONTROLLER FUNCTIONS
// -------------------------------------------------------------------
// These functions handle calls for Backstrap-SQL and the calls in
// the /common/data controller.
// -------------------------------------------------------------------


// THIS FUNCTION IS USED BY common/data/query GET 
// USER WRITES A PARAMERTIZED QUERY WHICH IS PARSED INTO A PARAMTERIZED SQL STATEMENT
// EXAMPLE OF PARAMETERIZED QUERY IS SELECT * FROM {0} -- THE {0} WOULD BE A PARAMETER VALUE, THUS PARAMETERIZED
// THIS PREVENTS SQL INJECTION
//EXAMPLE QUERY: common/data/query/select=person&where=person.first_name equals michael or person.age gt 30&orderBy=person.last_name desc
DataAccess.prototype.ExecuteParameterizedQuery = function (parameterizedQuery, parameters, callback) {
	var deferred = Q.defer();
	var qry = parameterizedQuery;
	var qry_params = parameters;
	DataAccess.prototype.ExecutePostgresQuery(qry, qry_params, null)
	.then(function (connection) {
		deferred.resolve(connection.results);
	})
	.fail(function (err) {
		deferred.reject(err.AddToError(__filename, 'ExecuteParameterizedQuery'));
	});

	deferred.promise.nodeify(callback);
	return deferred.promise;
};

//THIS IS USED BY common/data/query POST
//EXAMPLE OF QUERY OBJECT:
// var query_object = {
//     "resolve_relationships": true,
//     "obj_type": "person",
//     "parameters": [],
//     "relates_to": [
//          {
//              "obj_type": service_record,
//              "rel_type": "",
//              "parameters": [["and","service_description","oil","partial"]
//          }
//     ],
//     "offset": 0,
//     "range": 100,
//     "orderBy":"",
// }
DataAccess.prototype.BackstrapQueryV2 = function (connection, queryObject, models, isActive, callback) {
	var deferred = Q.defer();

	backstrapSql.BuildQuery(queryObject, models)
		.then(function (data) {
			var qry = data.parameterizedQuery;
			var qry_params = data.parameters;
			DataAccess.prototype.ExecutePostgresQuery(qry, qry_params, connection)
			.then(function (connection) {
				deferred.resolve(connection.results);
			})
			.fail(function (err) {
				deferred.reject(err.AddToError(__filename, 'BackstrapQueryV2'));
			});
		});

	deferred.promise.nodeify(callback);
	return deferred.promise;
};

//THIS IS USED BY ENTITY METHODS - QUERY OBJECT IS DIFFERENT THAN the v2 VERSION
//TO DO: QUERY OBJECT SCHEMA 
DataAccess.prototype.t_BackstrapQuery = function (connection, queryObject, models, isActive, callback) {
	var deferred = Q.defer();
	var qry;
	var qrySelect;

	try {
		var dblQuotedQueryString = JSON.stringify(queryObject).replace('\'', '\'\'');
		queryObject = JSON.parse(dblQuotedQueryString);
	} catch (error) {
		console.log(error);
	}

	try {
		var isUserObj = false;
		if (queryObject.obj_type === 'bsuser') {
			isUserObj = true;
		}

		qrySelect = "SELECT " + queryObject.obj_type + ".data FROM " + queryObject.obj_type;
		var qryJoins = "";
		var whereAppend = "";
		if (!isUserObj) {
			models.data.models.forEach(function (m) {
				if (m.obj_type === queryObject.obj_type) {
					queryObject.relates_to.forEach(function (relTo) {
						var parentJoinKey = m.obj_type + '.row_id';
						var ixLink = 0;
						m.relationships.forEach(function (r) {
							if (relTo.obj_type === r.relates_to) {
								//JOIN LINKING TABLE
								ixLink++;
								var ltAlias = "lt" + ixLink;
								var ltJoinLeft = ltAlias + ".left_id";
								var ltJoinRight = ltAlias + ".right_id";
								qryJoins += " INNER JOIN " + r.linking_table + " " + ltAlias + " ON " + parentJoinKey + "=" + ltJoinLeft;
								//IF there is a rel_type, we need to add that to the where statement
								if (relTo.lookup_rel_type !== undefined && relTo.lookup_rel_type !== null && relTo.lookup_rel_type.length > 0) {
									whereAppend += " AND LOWER(" + ltAlias + ".rel_type) = '" + relTo.lookup_rel_type.toLowerCase() + "'";
								}
								//THEN LINKED ENTITY TABLE
								var rtAlias = "rt" + ixLink;
								var rtJoinField = rtAlias + ".row_id";
								if (relTo.obj_type === 'bsuser') {
									qryJoins += " INNER JOIN bsuser " + rtAlias + " ON " + ltJoinRight + "=" + rtJoinField;
								}
								else {
									qryJoins += " INNER JOIN " + r.relates_to + " " + rtAlias + " ON " + ltJoinRight + "=" + rtJoinField;
								}
								//ADD the joined table properties as join criteria
								//use the ILIKE for case insensitive, but require whole word match
								relTo.parameters.forEach(function (p) {
									whereAppend += " AND (" + rtAlias + ".data #>> '{" + p.property + "}' ILIKE '" + p.value + "')";
								});
							}
						});
					});
					//only active records
					qrySelect += qryJoins += " WHERE " + m.obj_type + ".data->'is_active' = 'true'";

					// IF THE USER DOESN'T SPECIFY, WE ONLY WANT ACTIVE RECORDS FOR MAIN OBJECT
					if (isActive === undefined || isActive === null || isActive === true) {
						qrySelect += " AND " + queryObject.obj_type + ".data->'is_active' = 'true'";
					}

					//add where clause for any parent obj properties in query
					queryObject.parameters.forEach(function (p) {
						//use the ILIKE for case insensitive, but require whole word match
						qrySelect += " AND (" + m.obj_type + ".data #>> '{" + p.property + "}' ILIKE '" + p.value + "')";
					});
					qrySelect += whereAppend;
				}
			});
		}
	}
	catch (err) {
		var errorObj = new ErrorObj(500,
			'da0200',
			__filename,
			't_BackstrapQuery',
			'error querying postgres',
			'Database error',
			err
		);
		deferred.reject(errorObj);
	}
	var qry = qrySelect;
	var qry_params = [];
	DataAccess.prototype.ExecutePostgresQuery(qry, qry_params, connection)
	.then(function (connection) {
		deferred.resolve(connection.results);
	})
	.fail(function (err) {
		deferred.reject(err.AddToError(__filename, 't_BackstrapQuery'));
	});

	deferred.promise.nodeify(callback);
	return deferred.promise;
};
// -------------------------------------------------------------------

///////////////			BEGIN INVALIDATE SESSION FUNCTIONS        ////////////////
DataAccess.prototype.GetDeadSessions = function (timeOut, callback) {
	var deferred = Q.defer();
	var minutes = "'" + timeOut + " minutes'";
	var qry = "select * from session where (data->>'last_touch')::timestamp with time zone < (NOW() - INTERVAL " + minutes + ")";
	var qry_params = [];
	DataAccess.prototype.ExecutePostgresQuery(qry, qry_params, null)
	.then(function (connection) {
		deferred.resolve(connection.results);
	})
	.fail(function (err) {
		deferred.reject(err.AddToError(__filename, 'GetDeadSessions'));
	});

	deferred.promise.nodeify(callback);
	return deferred.promise;
};

DataAccess.prototype.DeleteInvalidSessReturnUser = function (sess, callback) {
	var deferred = Q.defer();
	var qry = "";
	var qry_params = [];
	DataAccess.prototype.startTransaction()
	.then(function (connection) {
		qry = "SELECT row_id FROM session WHERE data->>'token' = '" + sess.token + "'";
		return [connection, DataAccess.prototype.ExecutePostgresQuery(qry, qry_params, connection)];
	})
	.spread(function (connection, res) {
		var sessRowId = res.results[0].row_id;
		qry = "DELETE FROM bsuser_session WHERE right_id = " + sessRowId;
		return [connection, sessRowId, DataAccess.prototype.ExecutePostgresQuery(qry, qry_params, connection)];
	})
	.spread(function (connection, sessRowId, delete_right_res) {
		qry = "DELETE FROM session WHERE row_id = " + sessRowId;
		return [connection, DataAccess.prototype.ExecutePostgresQuery(qry, qry_params, connection)];
	})
	.spread(function (connection, delete_rowId_res) {
		return DataAccess.prototype.commitTransaction(connection);
	})
	.then(function (commit_res) {
		qry = "SELECT * FROM bsuser WHERE  data@> '{ \"username\" : \"" + sess.username + "\" }'";
		deferred.resolve(DataAccess.prototype.ExecutePostgresQuery(qry, qry_params, null));
	})
	.fail(function (err) {
		DataAccess.prototype.rollbackTransaction(connection)
		.then(function (rollback_res) {
			deferred.reject(err.AddToError(__filename, 'DeleteInvalidSessReturnUser', 'transaction rolled back'));
		})
		.fail(function (rollback_err) {
			deferred.reject(rollback_err.AddToError(__filename, 'DeleteInvalidSessReturnUser'));
		});
	})
	deferred.promise.nodeify(callback);
	return deferred.promise;
};

DataAccess.prototype.CreateEntityReturnObjAndRowId = function (tableName, obj, callback) {
	var deferred = Q.defer();

	utilities.getUID()
		.then(function (uid_res) {
			obj.id = uid_res;
			obj.created_at = new Date();
			obj.is_active = true;
			var qry = "INSERT INTO \"" + tableName + "\"(\"data\") VALUES($1) RETURNING \"row_id\",\"data\"";
			var qry_params = [obj];
			DataAccess.prototype.ExecutePostgresQuery(qry, qry_params, null)
			.then(function (connection) {
				deferred.resolve(connection.results);
			})
			.fail(function (err) {
				deferred.reject(err.AddToError(__filename, 'CreateEntityReturnObjAndRowId'));
			});
		});

	deferred.promise.nodeify(callback);
	return deferred.promise;
};

DataAccess.prototype.DeleteAllByRowId = function (table, row_ids, callback) {
	var deferred = Q.defer();
	var strIn = '';
	row_ids.forEach(function (id) {
		strIn += "'" + id + "',";
	});
	if (strIn.length > 4) {
		strIn = strIn.substring(0, (strIn.length - 1));
	}

	var qry = "DELETE FROM " + table + " WHERE data->>'id' IN (" + strIn + ")";
	var qry_params = [];
	DataAccess.prototype.ExecutePostgresQuery(qry, qry_params, null)
	.then(function (connection) {
		deferred.resolve(true);
	})
	.fail(function (err) {
		deferred.reject(err.AddToError(__filename, 'DeleteAllByRowId'));
	});

	deferred.promise.nodeify(callback);
	return deferred.promise;
};

DataAccess.prototype.AddRelationshipUsingRowIds = function (linkingTable, left_id, right_id, relTyp, callback) {
	var deferred = Q.defer();

	var qry = "INSERT INTO \"" + linkingTable + "\"(\"left_id\", \"right_id\", \"rel_type\") VALUES(" + left_id + "," + right_id + ",'" + relTyp + "')";
	var qry_params = [];
	DataAccess.prototype.ExecutePostgresQuery(qry, qry_params, null)
	.then(function (connection) {
		deferred.resolve(true);
	})
	.fail(function (err) {
		deferred.reject(err.AddToError(__filename, 'AddRelationshipUsingRowIds'));;
	});

	deferred.promise.nodeify(callback);
	return deferred.promise;
};

/**
 * updates the reltype and/or rel props of the given relationship directly
 * @param {String} linking_table_name linking table that contains relationship
 * @param {Number} relationship_row_id row id of the relationship to be updated
 * @param {*} rel_props optional relationship properties to write (full write over old rel_props)
 * @param {String} rel_type optional relationship type identifier/label to update
 * @param {connection} connection optional db connection, can be null 
 * @param {*} callback 
 * 
 * @returns postgres results of query execution
 */
DataAccessExtension.prototype.updateRelationship = function(linkingTable, relationship_row_id, rel_props, rel_type, connection, callback) {
	var deferred = Q.defer();

	var query_params = [];
	var update_query = "UPDATE "+ linking_table_name;
	if (typeof(rel_props) !== 'undefined' && typeof(rel_type) !== 'undefined'){
		update_query += " SET rel_type = '"+ rel_type +"', rel_props = $1";
		query_params.push(rel_props);
	}
	else if(typeof(rel_props) == 'undefined' && typeof(rel_type) !== 'undefined') {
		update_query += " SET rel_type = '"+ rel_type +"'";
	}
	else if (typeof(rel_props) !== 'undefined' && typeof(rel_type) == 'undefined') {
		update_query += " SET rel_props = $1";
		query_params.push(rel_props);
	}
	update_query += " WHERE row_id = " + relationship_row_id;

	dataAccess.ExecutePostgresQuery(update_query, query_params, connection)
	.then(function(result){
		deferred.resolve(result.results);
	})
	.fail(function(err){
		var errorObj = new ErrorObj(500,
			'da_ext2011',
			__filename,
			'updateRelationship',
			'updating the relationship failed',
			'Updating the relationship failed. ',
			err
		);
		deferred.reject(errorObj);
	})

	deferred.promise.nodeify(callback);
    return deferred.promise;
}
///////////////			END INVALIDATE SESSION FUNCTIONS        ////////////////
// -------------------------------------------------------------------

DataAccess.prototype.findUser = function (email, username, connection, callback) {
	var deferred = Q.defer();

	var qry = "SELECT * FROM bsuser WHERE data->>'email' ILIKE '" + email + "'";
	var qry_params = [];
	DataAccess.prototype.ExecutePostgresQuery(qry, qry_params, null)
	.then(function (connection) {
		var results = connection.results;
		if (results.length <= 0) {
			qry = "SELECT * FROM bsuser WHERE data->>'username' ILIKE '" + username + "'";
			qry_params = [];
			DataAccess.prototype.ExecutePostgresQuery(qry, qry_params, null)
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

exports.DataAccess = DataAccess;