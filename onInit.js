module.exports = {
  run: (dataAccess, utilities, accessControl, serviceRegistration, settings) => {
    // RUN ANY INITIALIZATION CODE
    accessControl.createUser('api', null, null, {id: 11})
    .then((res) => {
      console.log(res);
    })
    .fail((err) => {
      console.log(err);
    })
  }
}