const path = require('path');

ErrorObj = function (_status, _err_code, _class, _func, _message, _display_message, _results) {
	var stackObj = {};

	if(_status != null && typeof(_status) === 'number' && _status >= 0 && _status < 600) {
		this.http_status = _status;
	}
	else {
		this.http_status = 500;
	}
	
	if(_err_code != null && (typeof(_err_code) === 'string' || typeof(_err_code) === 'number')) {
		this.err_code = _err_code;
	}
	else {
		this.err_code = '';
	}
  stackObj['err_code'] = _err_code;

	if(_class == null || typeof(_class) !== 'string') {
		_class = 'unspecified';
	}
	else {
		_class = path.basename(_class);
	}
	stackObj['class'] = _class;

	if(_func == null || typeof(_func) !== 'string') {
		_func = 'unspecified';
	}
	stackObj['function'] = _func;

	if(_message != null && typeof(_message) === 'string') {
		this.message = _message;
	}
	else {
		this.message = '';
	}
	stackObj.message = this.message;
	this.stack_trace = [stackObj];
	
	if(_display_message != null && typeof(_display_message) === 'string') {
		this.display_message = _display_message;
	}
	else {
		this.display_message = this.message;
	}

	if(_results != null) {
    if(typeof(_results.AddToError) === 'function') {
      _results.stack_trace.push({'class': _class, 'function': _func, 'message': _message, 'err_code': _err_code});
      this.http_status = _results.http_status;
      this.err_code = _results.err_code;
      this.class = _results.class;
      this.func = _results.func;
      this.message = _results.message;
      this.display_message = _results.display_message;
      this.stack_trace = _results.stack_trace;
    }
    else {
		  this.results = _results;
    }
	}
	else {
		this.results = null;
	}
};

ErrorObj.prototype.AddToError = function(_class, _func, _message, _err_code) {
	if(_class == null) {
		_class = 'unspecified';
	}
	else {
		_class = path.basename(_class);
	}
	if(_func == null) {
		_func = 'unspecified';
	}
	if(_message == null) {
		_message = '';
	}
  if(_err_code == null) {
    _err_code = null;
  }
	
	this.stack_trace.push({'class': _class, 'function': _func, 'message': _message, 'err_code': _err_code});
	return this;
};

ErrorObj.prototype.UpdateError = function(_status, _message, _display_message, _err_code, _results) {
	if(_status !== undefined && _status !== null && typeof(_status) === 'number' && _status >= 0 && _status < 600) {
		this.http_status = _status;
	}
	if(_message !== undefined && _message !== null && typeof(_message) === 'string') {
		this.message = _message;
	}
	if(_display_message !== undefined && _display_message !== null && typeof(_display_message) === 'string') {
		this.display_message = _display_message;
	}
	if(_err_code !== undefined && _err_code !== null && (typeof(_err_code) === 'string' || typeof(_err_code) === 'number')) {
		this.err_code = _err_code;
	}
	if(_results !== undefined && _results !== null) {
		this.results = _results;
	}
	return this;
};

ErrorObj.prototype.setStatus = function(_status) {
	if(_status !== undefined && _status !== null && typeof(_status) === 'number' && _status >= 0 && _status < 600) {
		this.http_status = _status;
	}
}
ErrorObj.prototype.setMessage = function(_message) {
	if(_message !== undefined && _message !== null && typeof(_message) === 'string') {
		this.message = _message;
	}
}
ErrorObj.prototype.setDisplayMessage = function(_display_message) {
	if(_display_message !== undefined && _display_message !== null && typeof(_display_message) === 'string') {
		this.display_message = _display_message;
	}
}
ErrorObj.prototype.setMessages = function(_message, _display_message) {
	if(_message !== undefined && _message !== null && typeof(_message) === 'string') {
		this.message = _message;
	}
	if(_display_message !== undefined && _display_message !== null && typeof(_display_message) === 'string') {
		this.display_message = _display_message;
	}
}
ErrorObj.prototype.setErrCode = function(_err_code) {
	if(_err_code !== undefined && _err_code !== null && (typeof(_err_code) === 'string' || typeof(_err_code) === 'number')) {
		this.err_code = _err_code;
	}
}
ErrorObj.prototype.setResults = function(_results) {
	if(_results !== undefined && _results !== null) {
		this.results = _results;
	}
}
// ==============================================================================
