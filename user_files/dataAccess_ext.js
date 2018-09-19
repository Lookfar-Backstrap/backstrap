var Q = require('q');
const { Pool } = require('pg')
var pool;
var dataAccess;
var models;

var DataAccessExtension = function(da, dbConfig, mdls) {	
	models = mdls;
	dataAccess = da;	
}

//SAMPLE QUERY
// DataAccessExtension.prototype.SomeQuery = function(){
// 	var qry = "SELECT * FROM person WHERE person.id = $1";
// 	var qry_params = [1];
// 	dataAccess.ExecutePostgresQuery(qry, qry_params, null)
// 	.then(function(person_res){
// 		//do something with person
// 	});
// };

module.exports = DataAccessExtension;