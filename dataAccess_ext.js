var Q = require('q');

class DataAccessExtension {
  constructor(da) {
    this.dataAccess = da;
  }

  //SAMPLE QUERY
// SomeQuery() {
// 	var qry = "SELECT * FROM person WHERE person.id = $1";
// 	var qry_params = [1];
// 	this.dataAccess.ExecutePostgresQuery(qry, qry_params, null)
// 	.then(function(person_res){
// 		//do something with person
// 	});
// }
}



module.exports = DataAccessExtension;