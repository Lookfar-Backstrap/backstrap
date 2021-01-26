var Q = require('q');
var async = require('async');
var dataAccess;
var utilities;
var accessControl;
var serviceRegistration;
var settings;
var models;

var EntityMethods = require('../entityMethods.js').EntityMethods;
var entityMethods;

var backstrapSql = require('../backstrapSql.js').BackstrapSql;
var base64 = require('../base64.js');

var AWS = require('aws-sdk');
var s3;

Data = function (da, u, ac, sr, st, m) {
    dataAccess = da;
    utilities = u;
    accessControl = ac;
    serviceRegistration = sr;
    settings = st;
    models = m;

    entityMethods = new EntityMethods(da, m);
    backstrapSql = new BackstrapSql(m.data.models);
    s3 = new AWS.S3();
}

Data.prototype.get = {
    query: function (req, callback) {
        var deferred = Q.defer();        
        var emptyResultSet = {
            'result_count': 0,
            'results': [],
        };        
        try {
            //IF TRYING TO QUERY bsuser (ACCOUNT) USER MUST BE SUPER USER
            if (((req.query.select === 'bsuser') 
            && req.this_user.roles.indexOf('super-user') == -1)){
                deferred.resolve(emptyResultSet);
            }
            var query = req.query;
            var objQuery = backstrapSql.BackstrapQueryObject(query);
            if (objQuery !== null) {
                backstrapSql.BuildQuery(objQuery, models)
                    .then(function (data) {
                        dataAccess.ExecuteParameterizedQuery(data.parameterizedQuery, data.parameters)
                            .then(function (query_res) {
                                var returnObj = {
                                    'result_count': query_res.length,
                                    'results': [],
                                };
                                if (query.resolve && query.resolve.length > 0) {
                                    async.eachSeries(query_res,
                                        function (obj, obj_callback) {
                                            entityMethods.rr(obj, query.resolve, 1, [])
                                                .then(function (rrObj) {
                                                    returnObj.results.push(rrObj);
                                                    obj_callback();
                                                })
                                                .fail(function (rr_err) {
                                                    // SOME KIND OF PROBLEM RESOLVING RELATIONSHIPS
                                                    obj_callback();
                                                });
                                        },
                                        function (rrp_err) {
                                            if (!rrp_err) {
                                                deferred.resolve(returnObj);
                                            }
                                            else {
                                                deferred.resolve(emptyResultSet);
                                            }
                                        });
                                }
                                else {
                                    returnObj.results = query_res;
                                    deferred.resolve(returnObj);
                                }
                            })
                            .fail(function (err) {
                                if (err !== undefined && err !== null && typeof (err.AddToError) === 'function') {
                                    err.setMessages('error with query', 'Problem querying the system');
                                    deferred.reject(err.AddToError(__filename, 'query'));
                                }
                                deferred.resolve(emptyResultSet);
                            });
                    });
            }
            else {
                deferred.resolve(emptyResultSet);
            }
        }
        catch (err) {
            // ADD EVENT TO SESSION
            deferred.resolve(emptyResultSet);
        }

        deferred.promise.nodeify(callback);
        return deferred.promise;
    }
};

Data.prototype.post = {
    query: function (req, callback) {
        var deferred = Q.defer();
        var args = req.body;
        var objQuery = args.query_object;
        var objType = objQuery.obj_type;
        var resolveRels = objQuery.resolve;
        if (resolveRels === undefined || resolveRels === null) {
            resolveRels = true;
        }
        var searchObj = {};
        entityMethods.ExecuteBackstrapQuery(objType, objQuery.offset, objQuery.range, objQuery, true)
            .then(function (query_res) {
                var resolveObj = query_res;
                deferred.resolve(resolveObj);
            })
            .fail(function (err) {
                if (err !== undefined && err !== null && typeof (err.AddToError) === 'function') {
                    err.setMessages('error with query', 'Problem querying the system');
                    deferred.reject(err.AddToError(__filename, 'query'));
                }
                else {
                    var errorObj = new ErrorObj(500,
                        'dc1001',
                        __filename,
                        'query',
                        'error querying db',
                        'Error querying db',
                        err
                    );
                    deferred.reject(errorObj);
                }
            });

        deferred.promise.nodeify(callback);
        return deferred.promise;
    },
    updateAll: function (req, callback) {
        var deferred = Q.defer();
        var args = req.body;
        var objUpdate = args.update_all_object;
        var objType = objUpdate.obj_type;
        dataAccess.UpdateAllEntities(objUpdate, null)
            .then(function (query_res) {
                var resolveObj = query_res;
                deferred.resolve(resolveObj);
            })
            .fail(function (err) {
                deferred.reject(err.AddToError(__filename, 'updateAll'));
            });

        deferred.promise.nodeify(callback);
        return deferred.promise;
    },
    create: function (req, callback) {
        var deferred = Q.defer();
        var args = req.body;
        var createObj = args.create_object;
        var newEntity = createObj.new_entity;

        // THIS METHOD TAKES AN OBJECT, THUS ENTITIES DO NOT
        // GET VALIDATED AGAINST THEIR MODELS IN THE NORMAL WAY
        // SO WE MUST VALIDATE ARGUMENTS HERE
        var inputArgs = {};
        var propNames = Object.getOwnPropertyNames(newEntity);

        for (var pIdx = 0; pIdx < propNames.length; pIdx++) {
            if (propNames[pIdx].toLowerCase() !== 'object_type') {
                inputArgs[propNames[pIdx]] = newEntity[propNames[pIdx]];
            }
        }

        serviceRegistration.validateArguments(newEntity.object_type, 'common', 'models', 'POST', '1.0.0', inputArgs)
            .then(function () {
                var relationships = createObj.relationships;
                return entityMethods.create(newEntity, relationships);
            })
            .then(function (save_res) {
                var resolveObj = save_res;
                deferred.resolve(resolveObj);
            })
            .fail(function (err) {
                if (err !== undefined && err !== null && typeof (err.AddToError) === 'function') {
                    err.setMessages('error creating entity', 'Problem creating entity');
                    deferred.reject(err.AddToError(__filename, 'create'));
                }
                else {
                    var errorObj = new ErrorObj(500,
                        'dc1002',
                        __filename,
                        'create',
                        'error creating entity',
                        'Error creating entity',
                        err
                    );
                    deferred.reject(errorObj);
                }
            });

        deferred.promise.nodeify(callback);
        return deferred.promise;
    },
    update: function (req, callback) {
        var deferred = Q.defer();
        var args = req.body;
        var updateObject = args.update_object;
        var updateEntity = updateObject.update_entity;
        var relsToAdd = updateObject.obj_add_rel;
        var relsToRemove = updateObject.obj_remove_rel;

        // THIS METHOD TAKES AN OBJECT, THUS ENTITIES DO NOT
        // GET VALIDATED AGAINST THEIR MODELS IN THE NORMAL WAY
        // SO WE MUST VALIDATE ARGUMENTS HERE
        if(updateEntity == null) {
            var errorObj = new ErrorObj(400,
                'dc1103',
                __filename,
                'update',
                'no entity specified to update',
                'Error updating entity',
                null
            );
            deferred.reject(errorObj);

            deferred.promise.nodeify(callback);
            return deferred.promise;
        }


        var inputArgs = {};
        var propNames = Object.getOwnPropertyNames(updateEntity);
        for (var pIdx = 0; pIdx < propNames.length; pIdx++) {
            if (propNames[pIdx].toLowerCase() !== 'object_type') {
                inputArgs[propNames[pIdx]] = updateEntity[propNames[pIdx]];
            }
        }

        serviceRegistration.validateArguments(updateEntity.object_type, 'common', 'models', 'PATCH', '1.0.0', inputArgs)
            .then(function (res) {
                return entityMethods.update(updateEntity, relsToAdd, relsToRemove);
            })
            .then(function (update_res) {
                var resolveObj = update_res;
                deferred.resolve(resolveObj);
            })
            .fail(function (err) {
                if (err !== undefined && err !== null && typeof (err.AddToError) === 'function') {
                    err.setMessages('error updating entity', 'Problem updating entity');
                    deferred.reject(err.AddToError(__filename, 'update'));
                }
                else {
                    var errorObj = new ErrorObj(500,
                        'dc1003',
                        __filename,
                        'update',
                        'error updating entity',
                        'Error updating entity',
                        err
                    );
                    deferred.reject(errorObj);
                }
            });

        deferred.promise.nodeify(callback);
        return deferred.promise;
    },
    upload: function (req, callback) {
        // TODO: 
        // -VERIFY THAT PATH WILL RESOLVE TO AN ACCEPTABLE PLACE
        // -VERIFY THAT PATH IS ONLY N LEVELS DEEP??
        // -SETUP TO OPTIONALLY USE S3

        var deferred = Q.defer();

        var args = req.body;
        var fileData = args.file_data;
        var fileName = args.file_name;

        // REMOTE SAVE IS A BOOLEAN INDICATING WHETHER TO SAVE TO THE SERVER OR TO CLOUD FILES
        // DEFAULT IS TO SAVE TO THE SERVER
        var remoteSave = args.remote_save;
        if (remoteSave === undefined || remoteSave === null) {
            remoteSave = false;
        }

        var plainFileData = base64.decode(fileData);

        var fileDestination = args.file_destination;

        var fileUploadPath;
        if (!remoteSave) {
            if (fileDestination === undefined || fileDestination === null) {
                fileDestination = '';
            }
            if (fileDestination.length > 0) {
                if (fileDestination.substring(0, 1) === '/') {
                    fileDestination = fileDestination.substring(1);
                }
                if (fileDestination.substring(fileDestination.length - 1) === '/') {
                    fileDestination = fileDestination.substring(0, fileDestination.length - 1);
                }

                var folders = fileDestination.split('/');

                if (folders.length > 10) {
                    var errorObj = new ErrorObj(400,
                        'dc0004',
                        __filename,
                        'upload',
                        'file_destination folder structure too deep'
                    );
                    deferred.reject(errorObj);
                }

                fileDestination += '/';
            }

            // IF DESTINATION INVOLVES BACKING UP, REJECT
            if (fileDestination.indexOf('..') !== -1) {
                var errorObj = new ErrorObj(400,
                    'dc0005',
                    __filename,
                    'upload',
                    'file_destination was relative'
                );
                deferred.reject(errorObj);
            }
            else {
                fileUploadPath = 'uploads/' + fileDestination + fileName;

                utilities.writeBinaryToFile(fileUploadPath, plainFileData)
                    .then(function (write_file_res) {
                        var resolveObj = write_file_res;
                        deferred.resolve(resolveObj);
                    })
                    .fail(function (err) {
                        if (err !== undefined && err !== null && typeof (err.AddToError) === 'function') {
                            err.setMessages('error uploading file', 'Problem uploading file');
                            deferred.reject(err.AddToError(__filename, 'upload'));
                        }
                        else {
                            var errorObj = new ErrorObj(500,
                                'dc1006',
                                __filename,
                                'upload',
                                'error uploading file',
                                'Error uploading file',
                                err
                            );
                            deferred.reject(errorObj);
                        }
                    });
            }
        }
        else {
            if (fileDestination === undefined || fileDestination === null) {
                var errorObj = new ErrorObj(500,
                    'dc0007',
                    __filename,
                    'upload',
                    'file_destination was blank'
                );
                deferred.reject(errorObj);
            }
            else {
                s3.putObject({ Bucket: fileDestination, Key: fileName, Body: Buffer.from(plainFileData, 'binary') }, function (err, save_res) {
                    if (!err) {
                        var resolveObj = save_res;
                        deferred.resolve(resolveObj);
                    }
                    else {
                        var errorObj = new ErrorObj(500,
                            'dc0008',
                            __filename,
                            'upload',
                            'error saving to s3',
                            'External error',
                            err
                        );
                        deferred.reject(errorObj);
                    }
                });
            }
        }

        deferred.promise.nodeify(callback);
        return deferred.promise;
    },
    delete: function (req, callback) {
        var deferred = Q.defer();
        var args = req.body;
        var deleteObject = args.delete_object;

        // THIS METHOD TAKES AN OBJECT, THUS ENTITIES DO NOT
        // GET VALIDATED AGAINST THEIR MODELS IN THE NORMAL WAY
        // SO WE MUST VALIDATE ARGUMENTS HERE
        var inputArgs = {};
        var propNames = Object.getOwnPropertyNames(deleteObject);
        for (var pIdx = 0; pIdx < propNames.length; pIdx++) {
            if (propNames[pIdx].toLowerCase() !== 'object_type') {
                inputArgs[propNames[pIdx]] = deleteObject[propNames[pIdx]];
            }
        }

        serviceRegistration.validateArguments(deleteObject.object_type, 'common', 'models', 'DELETE', '1.0.0', inputArgs)
            .then(function (res) {
                return entityMethods.delete(deleteObject.object_type, deleteObject);
            })
            .then(function (delete_res) {
                var resolveObj = delete_res;
                deferred.resolve(resolveObj);
            })
            .fail(function (err) {
                if (err !== undefined && err !== null && typeof (err.AddToError) === 'function') {
                    err.setMessages('error deleting entity', 'Problem deleting entity');
                    deferred.reject(err.AddToError(__filename, 'delete'));
                }
                else {
                    var errorObj = new ErrorObj(500,
                        'dc1003',
                        __filename,
                        'delete',
                        'error deleting entity',
                        'Error deleting entity',
                        err
                    );
                    deferred.reject(errorObj);
                }
            });

        deferred.promise.nodeify(callback);
        return deferred.promise;
    }
};

Data.prototype.put = {

};

Data.prototype.patch = {

};

Data.prototype.delete = {

};


exports.data = Data;