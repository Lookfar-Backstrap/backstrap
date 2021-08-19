// ===============================================================================
// ANALYTICS WEB SERVICE CALLS v1.0.0
// ===============================================================================
class Analytics {
  constructor(da, utils, ac, sr, st) {
    this.dataAccess = da;
    this.utilities = utils;
    this.accessControl = ac;
    this.serviceRegistration = sr;
    this.settings = st;

    this.get = {};
    this.post = {
      event: this.#event.bind(this)
    };
    this.patch = {};
    this.put = {};
    this.delete = {};
  }

  #event(req, callback) {
    return new Promise((resolve, reject) => {
      var eventDescriptor = req.body.event_descriptor;
      var tkn = req.headers[this.settings.token_header];

      this.utilities.logEvent(tkn, eventDescriptor)
      .then((logEvent_res) => {
        resolve({success: true});
      })
      .catch((err) => {
        reject(err);
      })
    });
	}
}

module.exports = Analytics;
