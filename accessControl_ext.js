var Q = require('q');

class AccessControlExtension {
  constructor(ac){
    this.accessControl = ac;
    this.utilities = ac.utilities;
    this.settings = ac.settings;
  }


}

var instance
module.exports = AccessControlExtension;