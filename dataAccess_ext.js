class DataAccessExtension {
  constructor(da) {
    this.dataAccess = da;
  }

//SAMPLE QUERY
// SomeQuery() {
//  return new Promise(async (resolve, reject) => {
// 	  var qry = "SELECT * FROM person WHERE person.id = $1";
// 	  var qry_params = [1];
//    try {
// 	    let person_res = await this.dataAccess.ExecutePostgresQuery(qry, qry_params, null);
// 		  //do something with person
//      resolve(person_res);
//    }
//    catch(err) {
//      reject(err);
//    }
//  })
// }
}



module.exports = DataAccessExtension;