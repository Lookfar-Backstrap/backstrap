// ===============================================================================
// UTILITY FUNCTIONS
// ===============================================================================
const util = require('util');
const path = require('path');
const fs = require('fs');

var nodemailer = require('nodemailer');
var smtpTransport = require('nodemailer-smtp-transport');
const nodemailerSendgrid = require('nodemailer-sendgrid');

const crypto = require('crypto');

var UtilitiesExtension = require('./utilities_ext.js');

class Utilities {
  constructor() {
    this.dataAccess = null;
    this.settings = null;
    this.eventLog = null;
    this.errorLog = null;
    this.sessionLog = null;
    this.extension = {};
    this.mailTransport = null;
  }

  init(s) {
    this.settings = s;

    let mailAuth = {};
    let mo = this.settings.mail_options;
    if(mo) {
      if(mo.user) mailAuth.user = mo.user;
      if(mo.pass) mailAuth.pass = mo.pass;
      if(mo.api_key) mailAuth.api_key = mo.api_key;
    
      var options = {};

      if (mo.service){

        // SEND GRID WANTS ONLY THE API KEY IN THE AUTH FIELD IF AVAILABLE
        if(mo.service.toLowerCase() === 'sendgrid' && mailAuth.api_key) {if([])
          this.mailTransport = nodemailer.createTransport(nodemailerSendgrid({apiKey:mailAuth.api_key}));
        }
        else {
          options = {
            service: mo.service,
            auth: mailAuth
          }
          if(mo.port) options.port = mo.port;
          if(mo.tls) options.tls = mo.tls

          this.mailTransport = nodemailer.createTransport(smtpTransport(options));
        }
      }
      else {
        options = {
          host: mo.host,
          port: mo.port,
          auth: mailAuth
        }
        if(mo.tls) options.tls = mo.tls;      

        this.mailTransport = nodemailer.createTransport(smtpTransport(options));
      } 
    }
  }

  async getHash(alg, data, length) {
    if(alg == null) alg = 'sha256';
    var h = crypto.createHash(alg);

    let byteCount = length || 10;
    if(data == null) data = crypto.randomBytes(byteCount);
    h.update(data);

    var digest = h.digest('hex');
    if(length != null) digest = digest.substring(0, length);
    Promise.resolve(digest);
  }

  setDataAccess(da) {
    this.dataAccess = da;
    if(this.extension !== undefined && this.extension !== null) {
      this.extension = new UtilitiesExtension(this);
    }
  }

  setLogs(evl, erl, sesl) {
    this.eventLog = evl;
    this.errorLog = erl;
    this.sessionLog = sesl;
  }

  async validateUsername(newUsername, existingUsername) {
    return new Promise((resolve, reject) => {
      if (newUsername === existingUsername) {
        resolve();
      }
      else {
        this.dataAccess.getUserByUserName(newUsername)
        .then((userFound) => {
          var errorObj = new ErrorObj(400,
            'u0053',
            __filename,
            'validateUsername',
            'a user already exists with the username provided'
          );
          reject(errorObj);
        })
        .catch((err) => {
          resolve();
        });
      }
    });
  }

  async validateEmail(newEmail, existingEmail) {
    return new Promise((resolve, reject) => {
      if (newEmail === existingEmail) {
        resolve();
      }
      else {
        this.dataAccess.getUserByEmail(newEmail)
        .then((userFound) => {
          var errorObj = new ErrorObj(400,
            'u0054',
            __filename,
            'bsuser',
            'a bsuser already exists with the email provided'
          );
  
          reject(errorObj);
        })
        .catch((err) => {
  
          if (err.err_code == 'da2001') {
            // THERE WERE MULTIPLE ACCOUNTS FOUND WITH THIS EMAIL
            // IN A PREVIOUS VERSION OF BS ACCOUNTS WERE ABLE TO SHARE EMAILS
            var errorObj = new ErrorObj(400,
              'u0055',
              __filename,
              'bsuser',
              'a bsuser already exists with the email provided',
              err
            );
  
            reject(errorObj);
          }
          else {
            resolve();
          }
        });
      }
    });
  }

  async getUserFromApiToken (apiTkn) {
    return new Promise((resolve, reject) => {
      this.dataAccess.getSession(null, apiTkn)
      .then((sessionObj) => {
        if(sessionObj.anonymous) {
          return {'username': 'anonymous'};
        }
        else {
          return this.dataAccess.getUserBySession(sessionObj.id);
        }
      })
      .then((userObj) => {
        resolve(userObj);
      })
      .catch((err) => {
        // ADD LOGGING HERE?
        if (err !== undefined && err !== null && typeof (err.AddToError) === 'function') {
          reject(err.AddToError(__filename, 'getUserFromApiToken'));
        }
        else {
          var errorObj = new ErrorObj(500,
            'u1001',
            __filename,
            'getUserFromApiToken',
            'error getting user from api token',
            'Error getting user from api token',
            err
          );
          reject(errorObj);
        }
      });
    });
  }

  async copyFile(file_to_copy, destination_path){
    return new Promise((resolve, reject) => {
      try {
        fs.createReadStream(file_to_copy).pipe(fs.createWriteStream(destination_path));
        resolve({ 'success': true });
      }
      catch (err) {
        var errorObj = new ErrorObj(500,
          'u0002',
          __filename,
          'copyFile',
          'error with fs.createReadStream',
          'External error',
          err
        );
        reject(errorObj);
      }
    });
  }

  async writeToFile(file_path, strData, isBinary) {
    return new Promise((resolve, reject) => {
      let binaryArg = isBinary ? 'binary' : null;
  
      fs.writeFile(file_path, strData, binaryArg,
        function (write_err) {
          if (write_err) {
            var errorObj = new ErrorObj(500,
              'u0005',
              __filename,
              'writeToFile',
              'error with fs.writeToFile',
              'External error',
              write_err
            );
            reject(errorObj);
          }
          else {
            resolve(true);
          }
        }
      );
    });
  }

  async writeErrorToLog(errObj) {
    return new Promise((resolve, reject) => {
      let logEntry = JSON.stringify(errObj)+'\n';
  
      var writeToLog = util.promisify(errorLog.write);
      writeToLog(logEntry)
      .then((write_res) => {
        resolve();
      })
      .catch((write_err) => {
        reject(write_err);
      });
    });
  }

  async sendMail(send_to, sbj, bdy, html_bdy) {
    return new Promise((resolve, reject) => {
      var mailOptions = {
        from: this.settings.mail_options.account,
        to: send_to,
        subject: sbj
      };
      if(bdy) mailOptions.text = bdy;
      if(html_bdy) mailOptions.html = html_bdy;
    
      this.mailTransport.sendMail(mailOptions, function (email_err, email_res) {
        if (!email_err) {
          resolve(email_res);
        }
        else {
          var errorObj = new ErrorObj(500,
            'u0009',
            __filename,
            'sendMail',
            'error with mailTransport.sendMail',
            'External error',
            email_err
          );
          reject(errorObj);
        }
      });
    });
  }

  async sendMailTemplate(send_to, sbj, template_name, args) {
    return new Promise((resolve, reject) => {
      if (template_name === undefined || template_name === null) {
        template_name = 'default';
      }
    
      if (args === undefined || args === null) {
        args = {};
      }
    
      var templatePath = path.resolve(__dirname, this.settings.mail_options.template_directory + template_name);
      var txtPath = templatePath + '.txt';
      var htmlPath = templatePath + '.html';
    
      var foundTxt = true;
      var foundHtml = true;
      try {
        fs.accessSync(txtPath);
      }
      catch (e) {
        foundTxt = false;
      }
    
      try {
        fs.accessSync(htmlPath);
      }
      catch (e) {
        foundHtml = false;
      }
    
      var txtBody = '';
      var htmlBody = '';
    
      if (foundTxt && foundHtml) {
        fs.readFile(txtPath, 'utf8', function (txt_err, txt_data) {
          if (!txt_err) {
            txtBody = this.#replaceTemplateValues(txt_data, args)
            fs.readFile(htmlPath, 'utf8', function (html_err, html_data) {
              if (!html_err) {
                htmlBody = this.#replaceTemplateValues(html_data, args);
    
                var mailOptions = {
                  from: this.settings.mail_options.account,
                  to: send_to,
                  subject: sbj,
                  text: txtBody,
                  html: htmlBody
                };
                this.mailTransport.sendMail(mailOptions, function (email_err, email_res) {
                  if (!email_err) {
                    resolve(email_res);
                  }
                  else {
                    var errorObj = new ErrorObj(500,
                      'u0011',
                      __filename,
                      'sendMailTemplate',
                      'error with mailTransport.sendMail',
                      'External error',
                      email_err
                    );
                    reject(errorObj);
                  }
                });
              }
              else {
                // SOMETHING WENT WRONG WHILE READING THE HTML TEMPLATE
                var errorObj = new ErrorObj(500,
                  'u0012',
                  __filename,
                  'sendMailTemplate',
                  'error reading html template',
                  'There was a problem getting the html template for this email',
                  html_err
                );
                reject(errorObj);
              }
            });
          }
          else {
            // SOMETHING WENT WRONG WHILE READING THE TXT TEMPLATE
            var errorObj = new ErrorObj(500,
              'u0013',
              __filename,
              'sendMailTemplate',
              'error reading text template',
              'There was a problem getting the text template for this email',
              txt_err
            );
            reject(errorObj);
          }
        });
      }
      else if (foundTxt) {
        fs.readFile(txtPath, 'utf8', function (txt_err, txt_data) {
          if (!txt_err) {
            txtBody = this.#replaceTemplateValues(txt_data, args);
            var mailOptions = {
              from: this.settings.mail_options.account,
              to: send_to,
              subject: sbj,
              text: txtBody
            };
            this.mailTransport.sendMail(mailOptions, function (email_err, email_res) {
              if (!email_err) {
                resolve(email_res);
              }
              else {
                var errorObj = new ErrorObj(500,
                  'u0014',
                  __filename,
                  'sendMailTemplate',
                  'error with mailTransport.sendMail',
                  'External error',
                  email_err
                );
                reject(errorObj);
              }
            });
          }
          else {
            // SOMETHING WENT WRONG WHILE READING THE TXT TEMPLATE
            var errorObj = new ErrorObj(500,
              'u0015',
              __filename,
              'sendMailTemplate',
              'error reading text template',
              'There was a problem getting the text template for this email',
              txt_err
            );
            reject(errorObj);
          }
        });
      }
      else if (foundHtml) {
        fs.readFile(htmlPath, 'utf8', function (html_err, html_data) {
          if (!html_err) {
            htmlBody = this.#replaceTemplateValues(html_data, args);
            var mailOptions = {
              from: this.settings.mail_options.account,
              to: send_to,
              subject: sbj,
              html: htmlBody
            };
            this.mailTransport.sendMail(mailOptions, function (email_err, email_res) {
              if (!email_err) {
                resolve(email_res);
              }
              else {
                var errorObj = new ErrorObj(500,
                  'u0016',
                  __filename,
                  'sendMailTemplate',
                  'error with mailTransport.sendMail',
                  'External error',
                  email_err
                );
                reject(errorObj);
              }
            });
          }
          else {
            // SOMETHING WENT WRONG WHILE READING THE HTML TEMPLATE
            var errorObj = new ErrorObj(500,
              'u0017',
              __filename,
              'sendMailTemplate',
              'error reading html template',
              'There was a problem getting the html template for this email',
              html_err
            );
            reject(errorObj);
          }
        });
      }
      else {
        // WE COULDN'T FIND THIS TEMPLATE.
        var errorObj = new ErrorObj(500,
                                    'u0018',
                                    __filename,
                                    'sendMailTemplate',
                                    'no template found',
                                    'There was a problem locating the template file.',
                                    {template: template_name}
                                  );
        reject(errorObj);
      }
    });
  }

  #replaceTemplateValues(template, args) {
    var updatedTemplate = template;
    for(var key in args){
      updatedTemplate = updatedTemplate.replace('{{' + key + '}}', args[key]);
    }
    return updatedTemplate;
  }

  #createUID() {
    var tKey = crypto.randomBytes(12).toString('hex');
    var date = new Date();
    var dateKey = new Date(date.getFullYear(), date.getMonth(), date.getDay(), date.getHours(), date.getMinutes(), date.getSeconds(), date.getMilliseconds());
    var token = crypto.createHash("md5").update(tKey + dateKey).digest('hex');
    return token;
  }

  getUID(sync) {
    if(sync == null || sync === false) {
      Promise.resolve(this.#createUID());
    }
    else {
      return this.#createUID();
    }
  }

  async logEvent(tkn, eventDescriptor) {
    var loggedEvent = {
      'token': tkn,
      'event_data': eventDescriptor
    };
    let logEntry = JSON.stringify(loggedEvent)+'\n';
    this.eventLog.write(logEntry, () => {
      Promise.resolve();
    });
  }

  async invalidateSession(sessionObj) {
    return new Promise((resolve, reject) => {
      this.dataAccess.DeleteSessions([sessionObj.id])
      .then(() => {
        if(this.settings.session_logging === true) {
          let dsObj = {
            session_id: sessionObj.id,
            token: sessionObj.token,
            user_id: sessionObj.user_id,
            started_at: sessionObj.started_at,
            ended_at: new Date()
          }
          var logEntry = JSON.stringify(dsObj)+'\n';
          sessionLog.write(logEntry);
        }
    
        resolve();
      })
      .catch((err) => {
        reject(err.AddToError(__filename, 'invalidateSession'));
      });
    });
  }

  htmlify(obj, idx) {
    if(idx === undefined || idx === null || typeof(idx) !== 'number') {
      idx = 0;
    }
  
    var pList = Object.getOwnPropertyNames(obj);
    var indentString = '';
    for(var iIdx = 0; iIdx < idx; iIdx++) {
      indentString += '&nbsp;&nbsp;&nbsp;&nbsp;';
    }
  
    var newHtmlString = '';
    for(var pIdx = 0; pIdx < pList.length; pIdx++) {
      var propName = pList[pIdx];
      if(typeof(obj[propName]) !== 'object') {
          newHtmlString += indentString + propName + ': ' + obj[propName] + '<br />';
      }
      else if(obj[propName] !== undefined && obj[propName] !== null) {
        newHtmlString += indentString + propName + ':<br />';
        var nextIdx = idx+1;
        newHtmlString += this.htmlify(obj[propName], nextIdx);
      }
      else {
        newHtmlString += indentString + propName + ':  null' + '<br />';
      }
    }
  
    if(idx === 0) {
      newHtmlString = '<div>' + newHtmlString + '</div>';
    }
  
    return newHtmlString;
  }
}

const instance = new Utilities();
module.exports = instance;