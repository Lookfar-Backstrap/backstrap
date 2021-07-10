var Q = require('q');
var fs = require('fs');

class Settings {
  constructor() {
    this.port = 3000;
    this.load("./Settings.json");
  }

  load(file) {
    try {
      if(file.substring(0,2) !== './') file = './'+file;
      let data = require(file);
      this.port = process.env.PORT || data.server_port;
      this.api_name = null;
      this.token_header = data.token_header || 'bs_api_token';
      this.timeout_check = data.timeout_check || 15;
      this.timeout = data.timeout || 120;
      this.index_service_call = data.index_service_call || 'index';
      this.access_logging = data.access_logging != null ? data.access_logging : false;
      this.session_logging = data.session_logging != null ? data.session_logging : false;
      this.log_rotation_period = data.log_rotation_period || 90;
      this.server_timeout = data.server_timeout || null;
      this.keep_alive_timeout = data.keep_alive_timeout || null;
      this.headers_timeout = data.headers_timeout || null,
      this.data_service_directory = data.data_service_directory || null;
      this.mail_options = {
        account: data.mail_options.account || null,
        service: data.mail_options.service || null,
        user: data.mail_options.user || null,
        pass: data.mail_options.pass || null,
        api_key: data.mail_options.api_key || null,
        template_directory: data.mail_options.template_directory || "./templates/"
      };
      this.identity = {
        provider: data.identity.provider || "native",
        domain: data.identity.domain || null,
        client_id: data.identity.client_id || null,
        client_secret: data.identity.client_secret || null,
        audience: data.identity.audience || null,
        key_url: data.identity.key_url || null,
        kid: data.identity.kid || null,
        mgmt_client_id: data.identity.mgmt_client_id || null,
        mgmt_client_secret: data.identity.mgmt_client_secret ||null
      };
    }
    catch(e) {
      console.error('Initialization Error - settings.js');
      console.log(e);
    }
  }

  save() {
    var deferred = Q.defer();

    let writeObj = {
      api_name: this.api_name,
      token_header: this.token_header,
      timeout_check: this.timeout_check,
      timeout: this.timeout,
      server_port: this.port,
      index_service_call: this.index_service_call,
      access_logging: this.access_logging,
      session_logging: this.session_logging,
      log_rotation_period: this.log_rotation_period,
      server_timeout: this.server_timeout,
      keep_alive_timeout: this.keep_alive_timeout,
      headers_timeout: this.headers_timeout,
      data_service_directory: this.data_service_directory,
      mail_options: {
        account: this.mail_options.account,
        service: this.mail_options.service,
        user: this.mail_options.user,
        pass: this.mail_options.pass,
        api_key: this.mail_options.api_key,
        template_directory: this.mail_options.template_directory
      },
      identity: {
        provider: this.identity.provider,
        domain: this.identity.domain,
        client_id: this.identity.client_id,
        client_secret: this.identity.client_secret,
        audience: this.identity.audience,
        key_url: this.identity.key_url,
        kid: this.identity.kid,
        mgmt_client_id: this.identity.mgmt_client_id,
        mgmt_client_secret: this.identity.mgmt_client_secret
      }
    }
	
		var fswrite = Q.denodeify(fs.writeFile);
		fswrite(file, JSON.stringify(writeObj, null, 4))
		.then(function(write_res) {
			deferred.resolve(true);
		})
		.fail(function(err) {
			var errorObj = new ErrorObj(500, 
										'se0004', 
										__filename, 
										'save', 
										'external error with fswrite',
										'External error',
										err
										);
			deferred.reject(errorObj);
		});
	
	  return deferred.promise;
  }
}

let instance = new Settings();
exports.Settings = instance;
