
var Q = require('q');
var async = require('async');
var models;

BackstrapSql = function (m) {
	models = m;
};


///BEGIN BACKSTRAP QUERY V2 

var validQueryOperators = ['exact', 'partial', 'between'];
function parseQueryParameters(objType, objParams, relType, ix) {
	var noResObj = { "whereClause": "", "parameterVal": "", "ixAdd": 0 };
	try {
		var returnWhere = "";
		var operator = objParams[0].replace("'", "''");
		var propName = ""
		var propVals = [];
		var propVal;
		var propOperator = "";
		var ixAdd = 0; // this is incase the statement is a between or other operator that requires 2 parameters. We can return the increased count
		var propCondition = "";
		var isNumber = false;

		if (operator !== undefined && operator !== null && operator === "and" || operator === "or" || operator === "between") {
			propName = objParams[1].replace("'", "''");
			propVal = objParams[2];
			propCondition = objParams[3];
			isNumber = !isNaN((propVal * 1));
			if (!isNumber) {
				propVal = propVal.toLowerCase();
				if (propVal.indexOf("'") !== -1) {
					propVal = propVal.replace("'", "''");
				}
			}

			propVals.push(propVal);
		}
		else {
			operator = "and";
			propName = objParams[0].replace("'", "''");
			propVal = objParams[1];
			propCondition = objParams[2];
			isNumber = !isNaN((propVal * 1));
			if (!isNumber) {
				propVal = propVal.toLowerCase();
				if (propVal.indexOf("'") !== -1) {
					propVal = propVal.replace("'", "''");
				}
			}
			propVals.push(propVal);

		}
		if (propCondition !== undefined || propCondition !== null && validQueryOperators.indexOf(propCondition) !== -1) {
			if (propCondition === 'partial' || propCondition === 'like') {
				returnWhere += " " + operator + " (LOWER((" + objType + ".data #>> '{" + propName + "}')::text) ILIKE '%' || $" + ix + " || '%')";
			}
			else if (propCondition === 'gt') {
				returnWhere += " " + operator + " ((" + objType + ".data #>> '{" + propName + "}')::int > $" + ix + ")";
			}
			else if (propCondition === 'gte') {
				returnWhere += " " + operator + " ((" + objType + ".data #>> '{" + propName + "}')::int >= $" + ix + ")";
			}
			else if (propCondition === 'lt') {
				returnWhere += " " + operator + " ((" + objType + ".data #>> '{" + propName + "}')::int < $" + ix + ")";
			}
			else if (propCondition === 'lte') {
				returnWhere += " " + operator + " ((" + objType + ".data #>> '{" + propName + "}')::int <= $" + ix + ")";
			}
			else if (propCondition === 'between') {
				ixAdd = 1;
				var betParams = propVals[0].split(' ');
				propVals = [];
				var val1 = betParams[0];
				var val2 = betParams[1];
				propVals.push(val1);
				propVals.push(val2);
				returnWhere += " " + operator + " ((" + objType + ".data #>> '{" + propName + "}')::int BETWEEN $" + ix + " AND $" + (ix + 1) + ")";
			}
			else { //exact == default
				if (!isNumber) {
					returnWhere += " " + operator + " (LOWER((" + objType + ".data #>> '{" + propName + "}')::text) = $" + ix + ")";
				}
				else {
					returnWhere += " " + operator + " ((" + objType + ".data #>> '{" + propName + "}')::int = $" + ix + ")";
				}
			}
		}
		return { "whereClause": returnWhere, "parameterVals": propVals, "ixAdd": ixAdd };
	}
	catch (err) {
		return noResObj;
	}
}

function ConvertRelsToJoins(sql, rootModelType, iModels, relates_to_obj_type, relates_to_rel_type, jCallback) {
	try {
		var modelsCopy = iModels.slice(0);
		async.eachSeries(modelsCopy, function (mc, mcCallback) {
			if (mc.obj_type === relates_to_obj_type) {
				//we don't want to join any further than here
				var modelsCopy2 = models.slice(0);
				//join this model as relates to
				async.eachSeries(modelsCopy2, function (mc2, mc2Callback) {
					async.eachSeries(mc2.relationships, function (rel, relCallback) {
						if (rel.relates_to === relates_to_obj_type && rel.linking_table.indexOf(rootModelType) !== -1) {
							var sqlStr = " INNER JOIN " + rel.relates_to + " ON " + rel.relates_to + '.row_id' + "=" + rel.linking_table + ".right_id";
							if (sql.indexOf(sqlStr) === -1 && sqlStr !== undefined) {
								sql.push(sqlStr);
							}

							sqlStr = " INNER JOIN " + rel.linking_table + " ON " + (rel.relates_from === rootModelType ? rootModelType : rel.relates_from) + '.row_id' + "=" + rel.linking_table + ".left_id" +
								((relates_to_rel_type !== null && relates_to_rel_type !== '' && sql.indexOf(relates_to_obj_type) == -1) ? " AND " + rel.linking_table + ".rel_type='" + relates_to_rel_type + "'" : "");
							if (sql.indexOf(sqlStr) === -1 && sqlStr !== undefined) {
								sql.push(sqlStr);
							}
							if (rel.relates_from === rootModelType || rel.relates_to === rootModelType) {
								return relCallback({ "done": true, "sql": sql });
							}
							else {
								return relCallback({ "pending": true, "obj_type": rel.relates_from, "sql": sql });
							}
						}
						else if (rel.relates_from === relates_to_obj_type && rel.relates_from !== rootModelType) {
							var sqlStr2 = " INNER JOIN " + mc.obj_type + " ON " + mc.obj_type + '.row_id' + "=" + rel.linking_table + ".left_id";
							if (sql.indexOf(sqlStr2) === -1) {
								sql.push(sqlStr2);
							}

							sqlStr2 = " INNER JOIN " + rel.linking_table + " ON " + rel.relates_to + '.row_id' + "=" + rel.linking_table + ".right_id" +
								((relates_to_rel_type !== null && relates_to_rel_type !== '' && sql.indexOf(relates_to_obj_type) == -1) ? " AND " + rel.linking_table + ".rel_type='" + relates_to_rel_type + "'" : "");
							if (sql.indexOf(sqlStr2) === -1) {
								sql.push(sqlStr2);
							}
							return relCallback({ "pending": true, "obj_type": rel.relates_from, "sql": sql });
						}
						if (relates_to_obj_type === rootModelType) {
							return relCallback({ "done": true, "sql": sql });
						}
						else {
							relCallback();
						}
					}, function (res) {
						if (res) return mc2Callback(res);
					});
					mc2Callback();
				}, function (res) {
					if (res) return mcCallback(res);
				});
			}
			mcCallback();
		}, function (res) {
			if (res) {
				return jCallback(res);
			}
			else {
				return jCallback({ "done": false, "err": "Related model not found. Model: " + relates_to_obj_type });
			}
		});
	} catch (e) { return jCallback({ "done": true, "err": e, "sql": sql }) }
};

function GenerateSqlJoins(sql, rootModelType, models, relates_to_obj_type, relates_to_rel_type) {

	var deferred = Q.defer();
	var modelsMaster = models.slice(0);
	var modelToFind;
	var sqlArray = "";
	var ixReoccur = 0;
	var prevRelatesToObjType = "";

	var doJoin = function (sql, rootModelType, models, relates_to_obj_type, relates_to_rel_type) {
		ConvertRelsToJoins(sql, rootModelType, models, relates_to_obj_type, relates_to_rel_type,
			function (res) {
				if (res.done) {
					deferred.resolve(res.sql);
				}
				else if (res.pending) {
					//is the next model the root? If so, we are done
					if (res.obj_type === rootModelType) {
						deferred.resolve(sql);
					}
					else {
						//The reoccurance of obj_type indicates that the query is stuck on a 
						//loop where the rel_from and rel_to can't resolve any longer, so abort if > 2
						if (ixReoccur < 2) {
							if (prevRelatesToObjType == res.obj_type) {
								ixReoccur++;
							}
							else {
								prevRelatesToObjType = res.obj_type;
							}
							doJoin(sql, rootModelType, models, res.obj_type, relates_to_rel_type);
						}
						else {
							deferred.resolve(res.sql);
						}
					}
				}
				else if (res.err) {
					deferred.reject(new ErrorObj(500,
						'bsql1001',
						__filename,
						'user',
						'Error parsing joins',
						'ConvertRelsToJoins',
						res.err
					));
				}
			});
	};

	doJoin(sql, rootModelType, models, relates_to_obj_type, relates_to_rel_type);
	return deferred.promise;
}

BackstrapSql.prototype.BuildQuery = function (queryObject, models) {
	var deferred = Q.defer();

	var qrySelect = "";
	var qryJoins = "";
	var qryWhereAppend = " WHERE";
	
	//distinct because in the case of location, mikes house may be both pick up and drop off.
	qrySelect = "SELECT " + queryObject.obj_type + ".data FROM " + queryObject.obj_type;

	var modelsWithAccount = [];
	var ixProps = 0;
	var ixRelProps = queryObject.parameters.length;
	var parameterizedQueryProps = [];

	models.data.models.forEach(function (m) {
		modelsWithAccount.push(m);
	});
	//this is needed to get the matching on account as it currently isn't in the model list
	modelsWithAccount.push({ "obj_type": "bsuser" });
	var sql = [];
	try {
		async.forEach(queryObject.relates_to, function (relTo, relToCallback) {
			GenerateSqlJoins([], queryObject.obj_type, modelsWithAccount, relTo.obj_type, relTo.rel_type)
				.then(function (joins) {
					var exists = false;
					joins.forEach(function (j) {
						if (sql.indexOf(j) !== -1) {
							exists = true;
						}
						else {
							sql.push(j);
							qryJoins = j + " " + qryJoins;
						}
					});

					qryJoins = qryJoins.replace(/,/g, '')
					relTo.parameters.forEach(function (param) {
						ixRelProps++;
						var parse_relatedParam_res = parseQueryParameters(relTo.obj_type, param, relTo.rel_type, ixRelProps);
						ixRelProps = ixRelProps + parse_relatedParam_res.ixAdd;
						qryWhereAppend += parse_relatedParam_res.whereClause;
						parse_relatedParam_res.parameterVals.forEach(function (pv) {
							parameterizedQueryProps.push(pv);
						})
					});
					relToCallback();
				})
				.fail(function (err) {
					deferred.reject(err);
				});
		}, function () {

			//add where clause for any parent obj properties in query. Reset ix props
			queryObject.parameters.forEach(function (objParam) {
				ixProps++;
				var parse_model_param = parseQueryParameters(queryObject.obj_type, objParam, null, ixProps);
				ixProps = ixProps + parse_model_param.ixAdd;
				parse_model_param.parameterVals.forEach(function (pv) {
					parameterizedQueryProps.push(pv);
				})
				qryWhereAppend += parse_model_param.whereClause;
			});

			//finish the select statement
			if (qryWhereAppend.trim().toLowerCase() === "where") {
				qryWhereAppend += " " + queryObject.obj_type + ".data->'is_active' = 'true'";
			}
			else {
				qryWhereAppend += " AND " + queryObject.obj_type + ".data->'is_active' = 'true'";
			}

			qrySelect += qryJoins;
			qrySelect += qryWhereAppend;

			//does if need to be sorted? 
			if (queryObject.orderBy !== undefined && queryObject.orderBy !== null && queryObject.orderBy.length > 0) {
				var ob = queryObject.orderBy.trim().split(" ");
				var obProp = ob[0];
				if (obProp !== undefined || obProp !== null || obProp !== "") {
					var obDir = ob[1];
					if (obDir === undefined || obDir === null || obDir.length === 0) {
						obDir = "ASC";
					}
					obDir = obDir.toUpperCase();
					if (obProp.indexOf(".") === -1 && queryObject.relates_to.length > 0) {
						//can't do an order by without the model and property
					}
					else if (obProp.indexOf(".") === -1) {
						obProp = queryObject.obj_type + "." + obProp + " " + obDir;
					}
					var obPropSplit = obProp.split(".");
					try {
						qrySelect += " ORDER BY " + obPropSplit[0] + ".data #>> '{" + obPropSplit[1] + "}' " + obDir;
					}
					catch (err) { }
				}
			}
			qrySelect = qrySelect.toLowerCase().replace('where and ', 'where ').replace('where or ', 'where ');
			//That should be it, good little query
			deferred.resolve({ "parameterizedQuery": qrySelect, "parameters": parameterizedQueryProps });
		});
	}
	catch (err) {
		deferred.reject(new ErrorObj(500,
			'bsSql1001',
			'backstrapSql.js',
			'BuildQuery',
			'error building sql query',
			'error building sql query',
			err
		))
	}
	return deferred.promise;
};


///Create Backstrap query_object from get request 
BackstrapSql.prototype.BackstrapQueryObject = function (query, callback) {
	try {
		//give the first an "and" clause
		var where = (query.where !== undefined && query.where !== null) ? " and " + query.where.toLowerCase() : "";
		var whereArray = [];
		var operators = [];
		if (where !== "") {
			operators = where.split(/ equals | like | between /g);
			whereArray = where.split(/ and | or /g);
		}
		var strCondition = "equals";
		var relProps = [];

		var query_object = {
			"resolve": query.resolve,
			"obj_type": (query.select !== undefined && query.select !== null ? query.select : ""),
			"parameters": [],
			"relates_to": [],
			"offset": 0,
			"range": 100,
			"orderBy": query.orderBy,
		};

		var ixClause = 0;
		whereClauseLoop:
		for (var whereIdx = 0; whereIdx < whereArray.length; whereIdx++) {
			var w = whereArray[whereIdx];

			if (w.trim().replace(" ", "") !== "") {
				var operator = operators[ixClause];
				if (w.indexOf('and') != -1 || w.indexOf('or') != -1) {
					operator = operator.toLowerCase().indexOf(" and ") !== -1 ? "and" : "or";
				}
				else {
					operator = 'and';
				}
				var toRemove = "";
				var prop = "";
				var val = ""
				var ix = 0;
				var strWhere = w.toLowerCase();
				if (strWhere.indexOf("equals") !== -1) {
					ix = w.indexOf("equals");
					prop = w.substring(0, ix);
					prop.replace(/\s/g, '');
					toRemove = w.substring(0, ix + 6);
					val = w.replace(toRemove, "");
					strCondition = "equals";
				}
				else if (strWhere.indexOf("like") !== -1) {
					ix = w.indexOf("like");
					prop = w.substring(0, ix);
					prop = prop.replace(/\s/g, '')
					toRemove = w.substring(0, ix + 4);
					val = w.replace(toRemove, "");
					strCondition = "like";
				}
				else if (strWhere.indexOf("between") !== -1) {
					ix = w.indexOf("between");
					prop = w.substring(0, ix);
					prop = prop.replace(/\s/g, '')
					toRemove = w.substring(0, ix + 7);
					val = w.replace(toRemove, "");
					strCondition = "between";
				}
				else if (strWhere.indexOf("gte") !== -1) {
					ix = w.indexOf("gte");
					prop = w.substring(0, ix);
					prop = prop.replace(/\s/g, '')
					toRemove = w.substring(0, ix + 3);
					val = w.replace(toRemove, "");
					strCondition = "gte";
				}
				else if (strWhere.indexOf("gt") !== -1) {
					ix = w.indexOf("gt");
					prop = w.substring(0, ix);
					prop = prop.replace(/\s/g, '')
					toRemove = w.substring(0, ix + 2);
					val = w.replace(toRemove, "");
					strCondition = "gt";
				}
				else if (strWhere.indexOf("lte") !== -1) {
					ix = w.indexOf("lte");
					prop = w.substring(0, ix);
					prop = prop.replace(/\s/g, '')
					toRemove = w.substring(0, ix + 3);
					val = w.replace(toRemove, "");
					strCondition = "lte";
				}
				else if (strWhere.indexOf("lt") !== -1) {
					ix = w.indexOf("lt");
					prop = w.substring(0, ix);
					prop = prop.replace(/\s/g, '')
					toRemove = w.substring(0, ix + 2);
					val = w.replace(toRemove, "");
					strCondition = "lt";
				}
				else {
					prop = w;
				}
				val = val.trim();
				prop = prop.trim();
				var whereResult = null;
				var props = prop.split('.'); //SHOULD BE FULLY QUALIFIED				
				if (props.length === 2) {

					var propModel = props[0];
					var propProp = props[1];

					var breakModel = false;

					//IF QUERYING THE ACCOUNT OBJECT, IT WONT BE FOUND IN THE MODELS.JSON SO DO THIS
					if (propModel === 'bsuser') {
						query_object.parameters.push([operator, propProp, val, strCondition]);
					}
					else {
						modelsLoop:
						for (var modelIdx = 0; modelIdx < models.length; modelIdx++) {
							var m = models[modelIdx];

							propertyLoop:
							for (var propertyIdx = 0; propertyIdx < m.properties.length; propertyIdx++) {
								var p = m.properties[propertyIdx];

								if (m.obj_type === propModel && p.name.toLowerCase() === propProp.toLowerCase()) {
									//GREAT WE FOUND THE MODEL AND PROPERTY BUT IS IT PARENT OR REL?
									if (m.obj_type.toLowerCase() === query.select.toLowerCase()) {
										whereResult = { "prop": prop, "type": "mp" }; //mp = MODEL PROP
									}
									else {
										whereResult = { "prop": prop, "type": "rp" }; //rp = REL PROP
									}
									breakModel = true;
									break propertyLoop;
								}
							}

							if (breakModel) {
								break modelsLoop;
							}
						}

						if (whereResult != null) {
							if (whereResult.type === "rp") { //REL PROP
								var objRel = {
									"obj_type": propModel,
									"rel_type": "",
									"parameters": [[operator, propProp, val, strCondition]],
								};
								query_object.relates_to.push(objRel);
							}
							else if (whereResult.type === "mp") { //MODEL PROP
								//its own property
								query_object.parameters.push([operator, propProp, val, strCondition]);
							}
						}
					}
				}
			}
		}
		return query_object;
	}
	catch (err) {
		return query_object;
	}
}


exports.BackstrapSql = BackstrapSql;