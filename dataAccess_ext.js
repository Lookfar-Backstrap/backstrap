var Q = require('q');
var dataAccess;

var DataAccessExtension = function(da, dbConfig) {	
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