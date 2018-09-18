var Q = require('q');
var fs = require('fs');
var async = require('async');
var dataAccess;
var models = [];

var path = require('path');
var Utilities = require('./utilities.js').Utilities;
var pluralize = require('pluralize');

EntityMethods = function (da, m) {
	dataAccess = da;
	models = m;
};

EntityMethods.prototype.ExecuteBackstrapQuery = function (obj_type, offset, range, objQuery, resolveRels, relsToResolve) {
	var deferred = Q.defer();

	dataAccess.getDbConnection()
	.then(function (client) {
		return [client, dataAccess.BackstrapQueryV2(client, objQuery, models, false)];
	})
	.spread(function (client, find_res) {
		var returnObj = {
			'result_count': find_res.length
		};

		// IF THE USER SPECIFIED AN OFFSET
		if (offset !== null && offset !== undefined) {
			if (offset <= find_res.length) {
				if (find_res.length > offset) {
					returnObj.offset = offset;
					var skip = offset;
					var take = (find_res.length < range ? find_res.length : range);
					find_res = find_res.slice(offset, range);
				}
			}
			else {
				var errorObj = new ErrorObj(400,
					'em0000',
					__filename,
					'get',
					'offset specified is greater than the size of the results set'
				);
				deferred.reject(errorObj);
			}
		}

		returnObj.results = [];
		if (resolveRels) {
			async.eachSeries(find_res,
				function (obj, obj_callback) {
					EntityMethods.prototype.t_rr(client, obj, relsToResolve, 1)
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
						dataAccess.closeDbConnection(client)
						.then(function () {
							deferred.resolve(returnObj);
						})
						.fail(function (close_err) {
							if (client !== undefined && client !== null && !client.isReleased) {
								client.release();
								client.isReleased = true;
							}
							if (close_err !== undefined && close_err !== null && typeof (close_err.AddToError) === 'function') {
								deferred.reject(close_err.AddToError(__filename, 'get'));
							}
							else {
								var errorObj = new ErrorObj(500,
									'em1004',
									__filename,
									'get',
									'error closing connection to db',
									'Error',
									close_err
								);
								deferred.reject(errorObj);
							}
						});
					}
					else {
						// SOME KIND OF PROBLEM RESOLVING RELATIONSHIPS
						dataAccess.closeDbConection(client)
						.then(function () {
							var errorObj = new ErrorObj(400,
								'em0002',
								__filename,
								'get',
								'error resolving relationships',
								'Error',
								rrp_err
							);
							deferred.reject(errorObj);
						})
						.fail(function (close_err) {
							if (client !== undefined && client !== null) {
								client.release();
								client.isReleased = true;
							}

							if (close_err !== undefined && close_err !== null && typeof (close_err.AddToError) === 'function') {
								deferred.reject(close_err.AddToError(__filename, 'get'));
							}
							else {
								var errorObj = new ErrorObj(500,
									'em1005',
									__filename,
									'get',
									'error closing connection to db',
									'Error',
									close_err
								);
								deferred.reject(errorObj);
							}
						});
					}
				});
		}
		else {
			returnObj.results = find_res;
			dataAccess.closeDbConnection(client)
			.then(function () {
				deferred.resolve(returnObj);
			})
			.fail(function (close_err) {
				if (client !== undefined && client !== null && !client.isReleased) {
					client.release();
					client.isReleased = true;
				}
				if (close_err !== undefined && close_err !== null && typeof (close_err.AddToError) === 'function') {
					deferred.reject(close_err.AddToError(__filename, 'get'));
				}
				else {
					var errorObj = new ErrorObj(500,
						'em1006',
						__filename,
						'get',
						'error closing connection to db',
						'Error',
						close_err
					);
					deferred.reject(errorObj);
				}
			});
		}
	})
	.fail(function (err) {
		if (err !== undefined && err !== null && typeof(err.AddToError) === 'function') {
			deferred.reject(err.AddToError(__filename, 'get'));
		}
		else {
			var errorObj = new ErrorObj(500,
				'em1007',
				__filename,
				'get',
				'error closing connection to db',
				'Error',
				close_err
			);
			deferred.reject(errorObj);
		}
	});

	return deferred.promise;
};

EntityMethods.prototype.get = function (obj_type, offset, range, objQuery, resolveRels, relsToResolve) {
	var deferred = Q.defer();

	dataAccess.getDbConnection()
		.then(function (client) {
			return [client, dataAccess.t_BackstrapQuery(client, objQuery, models, false)];
		})
		.spread(function (client, find_res) {
			var returnObj = {
				'result_count': find_res.length
			};

			// IF THE USER SPECIFIED AN OFFSET
			if (offset !== null && offset !== undefined) {
				if (offset <= find_res.length) {
					if (find_res.length > offset) {
						returnObj.offset = offset;
						var skip = offset;
						var take = (find_res.length < range ? find_res.length : range);
						find_res = find_res.slice(offset, range);
					}
				}
				else {
					var errorObj = new ErrorObj(500,
						'em0001',
						__filename,
						'get',
						'offset specified is greater than the size of the results set'
					);
					deferred.reject(errorObj);
				}
			}

			returnObj.results = [];
			if (resolveRels) {
				async.eachSeries(find_res,
					function (obj, obj_callback) {
						EntityMethods.prototype.t_rr(client, obj, relsToResolve, 1)
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
							dataAccess.closeDbConnection(client)
								.then(function () {
									deferred.resolve(returnObj);
								})
								.fail(function (close_err) {
									if (client !== undefined && client !== null) {
										client.release();
									}
									if (close_err !== undefined && close_err !== null && typeof (close_err.AddToError) === 'function') {
										deferred.reject(close_err.AddToError(__filename, 'get'));
									}
									else {
										var errorObj = new ErrorObj(500,
											'em1004',
											__filename,
											'get',
											'error closing connection to db',
											'Error',
											close_err
										);
										deferred.reject(errorObj);
									}
								});
						}
						else {
							// SOME KIND OF PROBLEM RESOLVING RELATIONSHIPS
							dataAccess.closeDbConection(client)
								.then(function () {
									var errorObj = new ErrorObj(400,
										'em0002',
										__filename,
										'get',
										'error resolving relationships',
										'Error',
										rrp_err
									);
									deferred.reject(errorObj);
								})
								.fail(function (close_err) {
									if (client !== undefined && client !== null) {
										client.release();
									}

									if (close_err !== undefined && close_err !== null && typeof (close_err.AddToError) === 'function') {
										deferred.reject(close_err.AddToError(__filename, 'get'));
									}
									else {
										var errorObj = new ErrorObj(500,
											'em1005',
											__filename,
											'get',
											'error closing connection to db',
											'Error',
											close_err
										);
										deferred.reject(errorObj);
									}
								});
						}
					});
			}
			else {
				returnObj.results = find_res;
				dataAccess.closeDbConnection(client)
					.then(function () {
						deferred.resolve(returnObj);
					})
					.fail(function (close_err) {
						if (client !== undefined && client !== null) {
							client.release();
						}
						if (close_err !== undefined && close_err !== null && typeof (close_err.AddToError) === 'function') {
							deferred.reject(close_err.AddToError(__filename, 'get'));
						}
						else {
							var errorObj = new ErrorObj(500,
								'em1006',
								__filename,
								'get',
								'error closing connection to db',
								'Error',
								close_err
							);
							deferred.reject(errorObj);
						}
					});
			}
		})
		.fail(function (err) {
			if (client !== undefined && client !== null) {
				client.release();
			}

			if (err !== undefined && err !== null && typeof (err.AddToError) === 'function') {
				deferred.reject(err.AddToError(__filename, 'get'));
			}
			else {
				var errorObj = new ErrorObj(500,
					'em1007',
					__filename,
					'get',
					'error closing connection to db',
					'Error',
					close_err
				);
				deferred.reject(errorObj);
			}
		});

	return deferred.promise;
};

EntityMethods.prototype.getActive = function (obj_type, offset, range, objQuery, resolveRels, relsToResolve) {
	var deferred = Q.defer();
	var client;

	dataAccess.getDbConnection()
		.then(function (client) {
			return [client, dataAccess.t_BackstrapQuery(client, objQuery, models, true)];
		})
		.spread(function (client, find_res) {
			var returnObj = {
				'result_count': find_res.length
			};

			// IF THE USER SPECIFIED AN OFFSET
			if (offset !== null && offset !== undefined) {
				if (offset <= find_res.length) {
					if (find_res.length > offset) {
						returnObj.offset = offset;
						var skip = offset;
						var take = (find_res.length < range ? find_res.length : range);
						find_res = find_res.slice(offset, range);
					}
				}
				else {
					var errorObj = new ErrorObj(500,
						'em0003',
						__filename,
						'getActive',
						'offset specified is greater than the size of the results set'
					);
					deferred.reject(errorObj);
				}
			}

			returnObj.results = [];
			if (resolveRels) {
				async.eachSeries(find_res,
					function (obj, obj_callback) {
						EntityMethods.prototype.t_rr(client, obj, relsToResolve, 1)
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
							dataAccess.closeDbConnection(client)
								.then(function () {
									deferred.resolve(returnObj);
								})
								.fail(function (close_err) {
									if (client !== undefined && client !== null) {
										client.release();
									}
									if (close_err !== undefined && close_err !== null && typeof (close_err.AddToError) === 'function') {
										deferred.reject(close_err.AddToError(__filename, 'getActive'));
									}
									else {
										var errorObj = new ErrorObj(500,
											'em1008',
											__filename,
											'getActive',
											'error closing connection to db',
											'Error',
											close_err
										);
										deferred.reject(errorObj);
									}
								});
						}
						else {
							// SOME KIND OF PROBLEM RESOLVING RELATIONSHIPS
							dataAccess.closeDbConection(client)
								.then(function () {
									var errorObj = new ErrorObj(400,
										'em0004',
										__filename,
										'get',
										'error resolving relationships',
										'Error',
										rrp_err
									);
									deferred.reject(errorObj);
								})
								.fail(function (close_err) {
									if (client !== undefined && client !== null) {
										client.release();
									}
									if (close_err !== undefined && close_err !== null && typeof (close_err.AddToError) === 'function') {
										deferred.reject(close_err.AddToError(__filename, 'getActive'));
									}
									else {
										var errorObj = new ErrorObj(500,
											'em1009',
											__filename,
											'getActive',
											'error closing connection to db',
											'Error',
											close_err
										);
										deferred.reject(errorObj);
									}
								});
						}
					});
			}
			else {
				returnObj.results = find_res;
				dataAccess.closeDbConnection(client)
					.then(function () {
						deferred.resolve(returnObj);
					})
					.fail(function (close_err) {
						if (client !== undefined && client !== null) {
							client.release();
						}
						if (close_err !== undefined && close_err !== null && typeof (close_err.AddToError) === 'function') {
							deferred.reject(close_err.AddToError(__filename, 'getActive'));
						}
						else {
							var errorObj = new ErrorObj(500,
								'em1010',
								__filename,
								'getActive',
								'error closing connection to db',
								'Error',
								close_err
							);
							deferred.reject(errorObj);
						}
					});
			}
		})
		.fail(function (err) {
			if (client !== undefined && client !== null) {
				client.release();
			}

			if (err !== undefined && err !== null && typeof (err.AddToError) === 'function') {
				deferred.reject(err.AddToError(__filename, 'getActive'));
			}
			else {
				var errorObj = new ErrorObj(500,
					'em1020',
					__filename,
					'getActive',
					'error',
					'Error',
					err
				);
				deferred.reject(errorObj);
			}
		});


	return deferred.promise;
};

EntityMethods.prototype.create = function (obj, obj_relationships) {
	var dh = this;
	models.data.models.forEach(function (m) {
		if (m.obj_type === obj.object_type) {
			dataAccess.AddTypeToCollectionMap(obj.object_type, obj.object_type);
			m.relationships.forEach(function (r) {
				var relTo = r.relates_to;
				var relMapObj = {
					'type1': obj.object_type,
					'type2': r.relates_to,
					'linkingTable': r.linking_table
				};
				dataAccess.AddRelationshipMap(relMapObj);
			});
		}
	});
	var deferred = Q.defer();
	var obj_type = obj["object_type"];
	dataAccess.startTransaction()
		.then(function (client) {
			return [client, dataAccess.t_saveEntity(client, obj_type, obj)];
		})
		.spread(function (client, save_res) {
			if (obj_relationships !== null && obj_relationships.length > 0) {
				return [client, save_res, Q.all(obj_relationships.map(function (obj_rel) {
					var inner_deferred = Q.defer();
					dataAccess.t_addRelationship(client, save_res, { 'id': obj_rel.id, 'object_type': obj_rel.object_type }, obj_rel.rel_type, obj_rel.rel_props)
						.then(function (find_res) {
							inner_deferred.resolve(find_res);
						})
						.fail(function (err) {
							if (err !== undefined && err !== null && typeof (err.AddToError) === 'function') {
								inner_deferred.reject(err.AddToError(__filename, 'create'));
							}
							else {
								var errorObj = new ErrorObj(500,
									'em1011',
									__filename,
									'create',
									'error adding relationship',
									'Error',
									err
								);
								inner_deferred.reject(errorObj);
							}
						});
					return inner_deferred.promise;
				}))];
			}
			else {
				var inner_deferred = Q.defer();
				inner_deferred.resolve();
				return [client, save_res, inner_deferred.promise];
			}
		})
		.spread(function (client, save_res, addRel_res) {
			return [save_res, dataAccess.commitTransaction(client)];
		})
		.spread(function (save_res, commit_res) {
			return dh.rr(save_res, [], 1);
		})
		.then(function (resolved_res) {
			deferred.resolve(resolved_res);
		})
		.fail(function (err) {
			if (err !== undefined && err !== null && typeof (err.AddToError) === 'function') {
				deferred.reject(err.AddToError(__filename, 'create'));
			}
			else {
				var errorObj = new ErrorObj(500,
					'em1012',
					__filename,
					'create',
					'error creating entity',
					'Error creating entity',
					err
				);
				deferred.reject(errorObj);
			}
		});

	return deferred.promise;
};

EntityMethods.prototype.update = function (obj, obj_add_rel, obj_remove_rel) {
	var obj_type = obj['object_type'];
	var deferred = Q.defer();
	if (obj_add_rel === null) obj_add_rel = [];
	if (obj_remove_rel === null) obj_remove_rel = [];
	models.data.models.forEach(function (m) {
		if (m.obj_type === obj.object_type) {
			dataAccess.AddTypeToCollectionMap(obj.object_type, obj.object_type);
			m.relationships.forEach(function (r) {
				var relMapObj = {
					'type1': obj.object_type,
					'type2': r.relates_to,
					'linkingTable': r.linking_table
				};
				dataAccess.AddRelationshipMap(relMapObj);
			});
		}
	});
	dataAccess.startTransaction()
		.then(function (client) {
			return [client, dataAccess.t_updateEntity(client, obj_type, obj)];
		})
		.spread(function (client, update_res, addRel_res) {
			if (obj_remove_rel.length > 0) {
				return [client, update_res, Q.all(obj_remove_rel.map(function (dr) {
					var inner_deferred = Q.defer();
					dataAccess.t_removeRelationship(client, update_res, { 'id': dr.id, 'object_type': dr.object_type }, dr.rel_type)
						.then(function (remRel_res) {
							inner_deferred.resolve(remRel_res);
						})
						.fail(function (err) {
							if (err !== undefined && err !== null && typeof (err.AddToError) === 'function') {
								inner_deferred.reject(err.AddToError(__filename, 'update'));
							}
							else {
								var errorObj = new ErrorObj(500,
									'em1013',
									__filename,
									'update',
									'error updating entity',
									'Error updating entity',
									err
								);
								inner_deferred.reject(errorObj);
							}
						});

					return inner_deferred.promise;
				}))];
			}
			else {
				return [client, update_res, null];
			}
		})
		.spread(function (client, update_res) {
			if (obj_add_rel.length > 0) {
				return [client, update_res, Q.all(obj_add_rel.map(function (ar) {
					var inner_deferred = Q.defer();
					dataAccess.t_addRelationship(client, update_res, { 'id': ar.id, 'object_type': ar.object_type }, ar.rel_type, ar.rel_props)
						.then(function (addRel_res) {
							inner_deferred.resolve(addRel_res);
						})
						.fail(function (err) {
							if (err !== undefined && err !== null && typeof (err.AddToError) === 'function') {
								inner_deferred.reject(err.AddToError(__filename, 'update'));
							}
							else {
								var errorObj = new ErrorObj(500,
									'em1014',
									__filename,
									'update',
									'error updating entity',
									'Error updating entity',
									err
								);
								inner_deferred.reject(errorObj);
							}
						});

					return inner_deferred.promise;
				}))];
			}
			else {
				return [client, update_res, null];
			}
		})
		.spread(function (client, update_res, remRel_res) {
			return [client, EntityMethods.prototype.t_rr(client, update_res, [], 1, [])];
		})
		.spread(function (client, resolved_res) {
			return [resolved_res, dataAccess.commitTransaction(client)];
		})
		.spread(function (resolved_res) {
			deferred.resolve(resolved_res);
		})
		.fail(function (err) {
			if (err !== undefined && err !== null && typeof (err.AddToError) === 'function') {
				deferred.reject(err.AddToError(__filename, 'update'));
			}
			else {
				var errorObj = new ErrorObj(500,
					'em1015',
					__filename,
					'update',
					'error updating entity',
					'Error updating entity',
					err
				);
				deferred.reject(errorObj);
			}
		});

	return deferred.promise;
};

EntityMethods.prototype.delete = function (obj_type, obj) {
	var deferred = Q.defer();

	dataAccess.deleteEntity(obj_type, obj)
		.then(function (del_res) {
			deferred.resolve(del_res);
		})
		.fail(function (err) {
			if (err !== undefined && err !== null && typeof (err.AddToError) === 'function') {
				deferred.reject(err.AddToError(__filename, 'delete'));
			}
			else {
				var errorObj = new ErrorObj(500,
					'em1016',
					__filename,
					'delete',
					'error deleting entity',
					'Error deleting entity',
					err
				);
				deferred.reject(errorObj);
			}
		});

	return deferred.promise;
};

EntityMethods.prototype.rr = function (obj, relsToResolve, idx, resolvedRelList) {
	var deferred = Q.defer();

	// GET THE OBJECT TYPE FOR THIS OBJECT
	var objType = obj.object_type;
	obj = sanitizeObject(obj);
	// IF WE DON'T HAVE A resolvedRelList YET, CREATE ONE
	// THIS IS USED TO PREVENT LOOPS WHEN RESOLVING RELATIONSHIPS
	if (resolvedRelList === undefined || resolvedRelList === null) {
		resolvedRelList = [];
	}

	// IF IDX IS MISSING OR NULL, RESOLVE AS FAR AS YOU CAN
	if (idx === undefined || idx === null) {
		idx = -1;
	}

	var resolveAllRels = false;
	if (relsToResolve === undefined || relsToResolve === null || relsToResolve.length === 0 || relsToResolve === '*') {
		resolveAllRels = true;
	}

	// GET THE MODEL FOR THIS OBJECT
	var objModel;
	if (objType === 'bsuser') {
		objModel = {
			'obj_type': 'bsuser',
			'description': 'This is a user',
			'relationships': [],
			'properties': []
		}
	}
	else {
		for (var mIdx = 0; mIdx < models.data.models.length; mIdx++) {
			if (objType === models.data.models[mIdx].obj_type) {
				objModel = models.data.models[mIdx];
				break;
			}
		}
	}

	if (objModel === undefined || objModel === null) {
		var errorObj = new ErrorObj(500,
			'em0005',
			__filename,
			'rr',
			'tried to resolve unknown object type'
		);
		deferred.reject(errorObj);
		return deferred.promise;
	}


	// ADD "PARENT" OBJECTS RELATIONSHIPS
	var allRelationships = [];
	if (objModel.relationships !== undefined && objModel.relationships !== null) {
		for (var relIdx = 0; relIdx < objModel.relationships.length; relIdx++) {
			if (resolveAllRels || relsToResolve.indexOf(objModel.relationships[relIdx].relates_to) !== -1) {
				allRelationships.push(objModel.relationships[relIdx]);
			}
		}
	}

	// ADD "CHILD" OBJECTS RELATIONSHIPS
	for (var mIdx = 0; mIdx < models.data.models.length; mIdx++) {
		var model = models.data.models[mIdx];
		if (model.relationships !== undefined && model.relationships !== null) {
			for (var rIdx = 0; rIdx < model.relationships.length; rIdx++) {
				var r = model.relationships[rIdx];

				if (r.relates_to === objModel.obj_type && (resolveAllRels || relsToResolve.indexOf(r.relates_from) !== -1)) {
					allRelationships.push(r);
				}
			}
		}
	}

	if (allRelationships.length === 0) {
		deferred.resolve(obj);
	}
	else {
		dataAccess.getDbConnection()
			.then(function (client) {
				async.forEach(allRelationships,
					function (relationshipDescriptor, relCallback) {
						var linkingTable = relationshipDescriptor.linking_table;
						dataAccess.AddRelationshipMap({
							'type1': objType,
							'type2': relationshipDescriptor.relates_to,
							'linkingTable': linkingTable
						});

						var relToArg = relationshipDescriptor.relates_to;
						if (relationshipDescriptor.relates_to === objType) {
							relToArg = relationshipDescriptor.relates_from;
						}

						if (resolvedRelList.indexOf(relToArg) == -1) {
							var newResolvedRelList = [];
							for (var rrlIdx = 0; rrlIdx < resolvedRelList.length; rrlIdx++) {
								newResolvedRelList.push(resolvedRelList[rrlIdx]);
							}
							newResolvedRelList.push(relToArg);
							dataAccess.t_join(client, obj, relToArg, relationshipDescriptor.rel_type)
								.then(function (join_res) {
									var join_deferred = Q.defer();

									if (join_res.length == 0) {
										join_deferred.resolve([]);
									}
									else {
										var newIdx = idx;
										if (idx > 1 || idx == -1) {
											if (idx != -1) {
												newIdx--;
											}

											async.map(join_res, function(joined_obj, joinCallback) {
												EntityMethods.prototype.t_rr(client, joined_obj, relsToResolve, newIdx, newResolvedRelList)
												.then(function(trr_res) {
													joinCallback(null, trr_res);
												})
												.fail(function(trr_err) {
													joinCallback(trr_err);
												});
											},
											function(resolve_err, resolve_res) {
												if(!resolve_err) {
													join_deferred.resolve(resolve_res);
												}
												else {
													if (inner_err !== undefined && inner_err !== null && typeof (inner_err.AddToError) === 'function') {
														join_deferred.reject(inner_err.AddToError(__filename, 'rr'));
													}
													else {
														var errorObj = new ErrorObj(500,
															'em1017',
															__filename,
															'rr',
															'error resolving relationships',
															'Error resolving relationships',
															inner_err
														);
														join_deferred.reject(errorObj);
													}
												}
											});
										}
										else {
											var sanitized_obj_array = [];
											join_res.forEach(function (jr) {
												sanitized_obj_array.push(sanitizeObject(jr));
											});
											join_deferred.resolve(sanitized_obj_array);
										}
									}

									return join_deferred.promise;
								})
								.then(function (resolved_join_res) {
									// SORT THE RESULTS BY THEIR rel_type
									var relObjs = {};
									for (var rtIdx = 0; rtIdx < resolved_join_res.length; rtIdx++) {
										var joinedObj = resolved_join_res[rtIdx];
										var relType = 'default';
										if (joinedObj.rel_type !== undefined && joinedObj.rel_type !== null && joinedObj.rel_type !== '') {
											relType = joinedObj.rel_type;
										}
										if (relObjs.hasOwnProperty(relType)) {
											relObjs[relType].push(joinedObj);
										}
										else {
											relObjs[relType] = [joinedObj];
										}
									}

									var argName = relationshipDescriptor.plural_name;
									if (relationshipDescriptor.relates_to === objModel.obj_type) {
										argName = relationshipDescriptor.plural_rev;
									}
									obj[argName] = relObjs;
									relCallback();
								})
								.fail(function (err) {
									relCallback();
								});
						}
						else {
							relCallback();
						}
					},
					function (rel_err) {
						dataAccess.closeDbConnection(client)
							.then(function (close_res) {
								if (!rel_err) {
									deferred.resolve(obj);
								}
								else {
									if (rel_err !== undefined && rel_err !== null && typeof (rel_err.AddToError) == 'function') {
										deferred.reject(rel_err.AddToError(__filename, 'rr'));
									}
									else {
										var errorObj = new ErrorObj(500,
											'em0006',
											__filename,
											'rr',
											'error resolving relationships',
											'Error',
											rel_err
										);
										deferred.reject(errorObj);
									}
								}
							})
							.fail(function (close_err) {
								if (close_err !== undefined && close_err !== null && typeof (close_err.AddToError) === 'function') {
									deferred.reject(close_err.AddToError(__filename, 'rr'));
								}
								else {
									var errorObj = new ErrorObj(500,
										'em1018',
										__filename,
										'rr',
										'error closing connection to db',
										'Error closing connection to db',
										close_err
									);
									deferred.reject(errorObj);
								}
							});
					}
				);
			})
			.fail(function (trans_err) {
				if (trans_err !== undefined && trans_err !== null && typeof (trans_err.AddToError) === 'function') {
					deferred.reject(trans_err.AddToError(__filename, 'rr'));
				}
				else {
					var errorObj = new ErrorObj(500,
						'em1018',
						__filename,
						'rr',
						'error transacting with db',
						'Error transacting with db',
						trans_err
					);
					deferred.reject(errorObj);
				}
			});
	}

	return deferred.promise;
}

EntityMethods.prototype.t_rr = function (client, obj, relsToResolve, idx, resolvedRelList) {
	var deferred = Q.defer();

	// GET THE OBJECT TYPE FOR THIS OBJECT
	var objType = obj.object_type;
	obj = sanitizeObject(obj);
	// IF WE DON'T HAVE A resolvedRelList YET, CREATE ONE
	// THIS IS USED TO PREVENT LOOPS WHEN RESOLVING RELATIONSHIPS
	if (resolvedRelList === undefined || resolvedRelList === null) {
		resolvedRelList = [];
	}

	// IF IDX IS MISSING OR NULL, RESOLVE AS FAR AS YOU CAN
	if (idx === undefined || idx === null) {
		idx = -1;
	}

	var resolveAllRels = false;
	if (relsToResolve === undefined || relsToResolve === null || relsToResolve.length === 0 || relsToResolve === '*') {
		resolveAllRels = true;
	}

	// GET THE MODEL FOR THIS OBJECT
	var objModel;
	if (objType === 'bsuser') {
		objModel = {
			'obj_type': 'bsuser',
			'description': 'This is a user',
			'relationships': [],
			'properties': []
		}
	}
	else {
		for (var mIdx = 0; mIdx < models.data.models.length; mIdx++) {
			if (objType === models.data.models[mIdx].obj_type) {
				objModel = models.data.models[mIdx];
				break;
			}
		}
	}

	if (objModel === undefined || objModel === null) {
		var errorObj = new ErrorObj(500,
			'em0005',
			__filename,
			't_rr',
			'tried to resolve unknown object type'
		);
		deferred.reject(errorObj);
		return deferred.promise;
	}


	// ADD "PARENT" OBJECTS RELATIONSHIPS
	var allRelationships = [];
	if (objModel.relationships !== undefined && objModel.relationships !== null) {
		for (var relIdx = 0; relIdx < objModel.relationships.length; relIdx++) {
			if (resolveAllRels || relsToResolve.indexOf(objModel.relationships[relIdx].relates_to) !== -1) {
				allRelationships.push(objModel.relationships[relIdx]);
			}
		}
	}

	// ADD "CHILD" OBJECTS RELATIONSHIPS
	for (var mIdx = 0; mIdx < models.data.models.length; mIdx++) {
		var model = models.data.models[mIdx];
		if (model.relationships !== undefined && model.relationships !== null) {
			for (var rIdx = 0; rIdx < model.relationships.length; rIdx++) {
				var r = model.relationships[rIdx];

				if (r.relates_to === objModel.obj_type && (resolveAllRels || relsToResolve.indexOf(r.relates_from) !== -1)) {
					allRelationships.push(r);
				}
			}
		}
	}


	if (allRelationships.length === 0) {
		deferred.resolve(obj);
	}
	else {
		async.forEach(allRelationships,
			function (relationshipDescriptor, relCallback) {
				var linkingTable = relationshipDescriptor.linking_table;
				dataAccess.AddRelationshipMap({
					'type1': objType,
					'type2': relationshipDescriptor.relates_to,
					'linkingTable': linkingTable
				});

				var relToArg = relationshipDescriptor.relates_to;
				if (relationshipDescriptor.relates_to === objType) {
					relToArg = relationshipDescriptor.relates_from;
				}

				if (resolvedRelList.indexOf(relToArg) == -1) {
					var newResolvedRelList = [];
					for (var rrlIdx = 0; rrlIdx < resolvedRelList.length; rrlIdx++) {
						newResolvedRelList.push(resolvedRelList[rrlIdx]);
					}
					newResolvedRelList.push(relToArg);
					dataAccess.t_join(client, obj, relToArg, relationshipDescriptor.rel_type)
						.then(function (join_res) {
							var join_deferred = Q.defer();

							if (join_res.length == 0) {
								join_deferred.resolve([]);
							}
							else {
								var newIdx = idx;
								if (idx > 1 || idx == -1) {
									if (idx != -1) {
										newIdx--;
									}

									async.map(join_res, function(joined_obj, joinCallback) {
										EntityMethods.prototype.t_rr(client, joined_obj, relsToResolve, newIdx, newResolvedRelList)
										.then(function(trr_res) {
											joinCallback(null, trr_res);
										})
										.fail(function(trr_err) {
											joinCallback(trr_err);
										});
									},
									function(resolve_err, resolve_res) {
										if(!resolve_err) {
											join_deferred.resolve(resolve_res);
										}
										else {
											if (inner_err !== undefined && inner_err !== null && typeof (inner_err.AddToError) === 'function') {
												join_deferred.reject(inner_err.AddToError(__filename, 'rr'));
											}
											else {
												var errorObj = new ErrorObj(500,
													'em1017',
													__filename,
													'rr',
													'error resolving relationships',
													'Error resolving relationships',
													inner_err
												);
												join_deferred.reject(errorObj);
											}
										}
									});
								}
								else {
									var sanitized_obj_array = [];
									join_res.forEach(function (jr) {
										sanitized_obj_array.push(sanitizeObject(jr));
									});
									join_deferred.resolve(sanitized_obj_array);
								}
							}

							return join_deferred.promise;
						})
						.then(function (resolved_join_res) {
							// SORT THE RESULTS BY THEIR rel_type
							var relObjs = {};
							for (var rtIdx = 0; rtIdx < resolved_join_res.length; rtIdx++) {
								var joinedObj = resolved_join_res[rtIdx];
								var relType = 'default';
								if (joinedObj.rel_type !== undefined && joinedObj.rel_type !== null && joinedObj.rel_type !== '') {
									relType = joinedObj.rel_type;
								}
								if (relObjs.hasOwnProperty(relType)) {
									relObjs[relType].push(joinedObj);
								}
								else {
									relObjs[relType] = [joinedObj];
								}
							}

							var argName = relationshipDescriptor.plural_name;
							if (relationshipDescriptor.relates_to === objModel.obj_type) {
								argName = relationshipDescriptor.plural_rev;
							}
							obj[argName] = relObjs;
							relCallback();
						})
						.fail(function (err) {
							relCallback();
						});
				}
				else {
					relCallback();
				}
			},
			function (rel_err) {
				deferred.resolve(obj);
			}
		);
	}

	return deferred.promise;
}

function getModelForObject(objType) {
	var objModel;
	if (objType === 'bsuser') {
		objModel = {
			'obj_type': 'bsuser',
			'description': 'This is a user',
			'relationships': [],
			'properties': []
		}
	}
	else {
		for (var mIdx = 0; mIdx < models.data.models.length; mIdx++) {
			if (objType === models.data.models[mIdx].obj_type) {
				objModel = models.data.models[mIdx];
				break;
			}
		}
	}

	return objModel;
}

function getAllRelationships(objModel) {

	// ADD "PARENT" OBJECTS RELATIONSHIPS
	var allRelationships = [];
	if (objModel.relationships !== undefined && objModel.relationships !== null) {
		for (var relIdx = 0; relIdx < objModel.relationships.length; relIdx++) {
			allRelationships.push(objModel.relationships[relIdx]);
		}
	}

	// ADD "CHILD" OBJECTS RELATIONSHIPS
	for (var mIdx = 0; mIdx < models.data.models.length; mIdx++) {
		var model = models.data.models[mIdx];
		if (model.relationships !== undefined && model.relationships !== null) {
			for (var rIdx = 0; rIdx < model.relationships.length; rIdx++) {
				var r = model.relationships[rIdx];

				if (r.relates_to === objModel.obj_type) {
					allRelationships.push(r);
				}
			}
		}
	}

	return allRelationships;
}

// function resolveRelationships(client, currentObj, relsToResolve, currentModel, currentObjType, resolvedRelList, idx){

// 	var deferred = Q.defer();

// 	async.eachSeries(relsToResolve,
// 		function (relationshipDescriptor, relCallback) {
// 			var linkingTable = relationshipDescriptor.linking_table;
// 			dataAccess.AddRelationshipMap({
// 				'type1': currentObjType,
// 				'type2': relationshipDescriptor.relates_to,
// 				'linkingTable': linkingTable
// 			});

// 			var relToArg = relationshipDescriptor.relates_to;
// 			if (relationshipDescriptor.relates_to === currentObjType) {
// 				relToArg = relationshipDescriptor.relates_from;
// 			}

// 			if (resolvedRelList.indexOf(relToArg) == -1) {
// 				var newResolvedRelList = [];
// 				for (var rrlIdx = 0; rrlIdx < resolvedRelList.length; rrlIdx++) {
// 					newResolvedRelList.push(resolvedRelList[rrlIdx]);
// 				}
// 				newResolvedRelList.push(relToArg);
// 				dataAccess.t_join(client, currentObj, relToArg, relationshipDescriptor.rel_type)
// 					.then(function (join_res) {
// 						var join_deferred = Q.defer();
// 						if (join_res.length == 0) {
// 							join_deferred.resolve([]);
// 						}
// 						else {
// 							var newIdx = idx;
// 							if (idx > 1 || idx == -1) {
// 								if (idx != -1) {
// 									newIdx--;
// 								}
// 								Q.all(join_res.map(function (joined_obj) {
// 									return EntityMethods.prototype.t_rr(client, joined_obj, [], newIdx, newResolvedRelList);
// 								}))
// 									.then(function (relObjArray) {
// 										join_deferred.resolve(relObjArray);
// 									})
// 									.fail(function (inner_err) {
// 										if (inner_err !== undefined && inner_err !== null && typeof (inner_err.AddToError) === 'function') {
// 											join_deferred.reject(inner_err.AddToError(__filename, 't_rr'));
// 										}
// 										else {
// 											var errorObj = new ErrorObj(500,
// 												'em1018',
// 												__filename,
// 												'rr',
// 												'error resolving relationships',
// 												'Error resolving relationships',
// 												inner_err
// 											);
// 											join_deferred.reject(errorObj);
// 										}
// 									});
// 							}
// 							else {
// 								var sanitized_obj_array = [];
// 								join_res.forEach(function (jr) {
// 									sanitized_obj_array.push(sanitizeObject(jr));
// 								});
// 								join_deferred.resolve(sanitized_obj_array);
// 							}
// 						}

// 						return join_deferred.promise;
// 					})
// 					.then(function (resolved_join_res) {
// 						// SORT THE RESULTS BY THEIR rel_type
// 						var relObjs = {};
// 						for (var rtIdx = 0; rtIdx < resolved_join_res.length; rtIdx++) {
// 							var joinedObj = resolved_join_res[rtIdx];
// 							var relType = 'default';
// 							if (joinedObj.rel_type !== undefined && joinedObj.rel_type !== null && joinedObj.rel_type !== '') {
// 								relType = joinedObj.rel_type;
// 							}
// 							if (relObjs.hasOwnProperty(relType)) {
// 								relObjs[relType].push(joinedObj);
// 							}
// 							else {
// 								relObjs[relType] = [joinedObj];
// 							}
// 						}

// 						var argName = relationshipDescriptor.plural_name;
// 						if (relationshipDescriptor.relates_to === currentModel.obj_type) {
// 							argName = relationshipDescriptor.plural_rev;
// 						}
// 						currentObj[argName] = relObjs;
// 						relCallback();
// 					})
// 					.fail(function (err) {
// 						relCallback();
// 					});
// 			}
// 			else {
// 				relCallback();
// 			}
// 		},
// 		function (rel_err) {
// 			deferred.resolve(currentObj);
// 		}
// 	);

// 	return deferred.promise;
// }

EntityMethods.prototype.cleanList = function (resolvedRels) {
	//if a rel_type was used for a join, there are going to be nulls,
	//strip those out into a clean list for filter
	var noNullsResolvedRels = [];
	resolvedRels.forEach(function (qr) {
		if (qr[0] !== null) {
			noNullsResolvedRels.push(qr);
		}
	});
	// there is a  null object that gets appended to each iteration.
	//just cleaning them up this way until the root cause can be determined.
	var cleanResolvedRels = [];
	noNullsResolvedRels.forEach(function (qr) {
		var obj = qr[1];
		if (obj !== undefined) {
			cleanResolvedRels.push(qr[1]); //many rels
		}
		else {
			var qr0 = qr[0];
			if (qr0 === undefined || qr0 === null) {
				cleanResolvedRels.push(qr); //no rels
			}
			else {
				cleanResolvedRels.push(qr[0]); //no rels
			}
		}
	});
	return cleanResolvedRels;
};

var invalidObjKeys = ['salt', 'password'];
function sanitizeObject(obj) {
	for (var p in obj) {
		if (obj.hasOwnProperty(p) && invalidObjKeys.indexOf(p) != -1) {
			delete obj[p];
		}
	};
	return obj;
};

EntityMethods.prototype.updateModelFile = function (objModel) {
	models.data.models = objModel;
};

exports.EntityMethods = EntityMethods;