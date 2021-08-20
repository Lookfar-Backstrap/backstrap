class DataAccessExtension {
  constructor(da) {
    this.dataAccess = da;
  }

//SAMPLE QUERY
// SomeQuery() {
//  return new Promise((resolve, reject) => {
// 	  var qry = "SELECT * FROM person WHERE person.id = $1";
// 	  var qry_params = [1];
// 	  this.dataAccess.ExecutePostgresQuery(qry, qry_params, null)
// 	  .then((person_res) => {
// 		  //do something with person
//      resolve(person_res);
// 	  })
//    .catch((err) => {
//      reject(err);
//    })
//  })
// }
}



module.exports = DataAccessExtension;