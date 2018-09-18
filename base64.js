
exports.validate = function(stringData) {
	var isValid = false;
	var remainder = stringData.length % 4;
	switch(remainder) {
		case 0:
			// DIVISIBLE BY 4.  EITHER PADDED OR LENGTH WAS PERFECT.
			var base64only = /^[a-zA-Z0-9\/\+]*={0,2}$/;
			isValid = base64only.test(stringData);
			break;
		case 1:
			// ERROR
			isValid = false;
			break;
		case 2:
		case 3:
			var base64only = /^[a-zA-Z0-9\/\+]*$/;
			isValid = base64only.test(stringData);
			break;
		default:
			isValid = false;
	}

	return isValid;
}

exports.decode = function(base64data) {
	var cursor = 0;
	var plainText = '';
	while(cursor < base64data.length) {
		var segLength = 4;
		if(base64data.length - cursor < 4) {
			segLength = base64data.length - cursor;
		}

		var currentSegment = base64data.substring(cursor, cursor+segLength);
		
		plainText += decodeBytes(currentSegment);

		cursor += segLength;
	}
	return plainText;
}

function decodeBytes(inputString) {
	switch(inputString.length) {
		case 4:
			// DIVISIBLE BY 4.  EITHER PADDED OR LENGTH WAS PERFECT.
			var noPadding = /^[a-zA-Z0-9\/\+]{4}$/;
			var singlePadding = /^[a-zA-Z0-9\/\+]{3}=$/;
			var doublePadding = /^[a-zA-Z0-9\/\+]{2}==$/;

			if(noPadding.test(inputString)) {
				var codes = base64CodesFromString(inputString);
				var decodedBytes = [];

				var result = 0;
				result |= codes[0] << 2 | (codes[1] >> 4);
				decodedBytes.push(result);

				result = 0;
				result |= (codes[1] & 15) << 4 | (codes[2] >> 2);
				decodedBytes.push(result);

				result = 0;
				result |= (codes[2] & 3) << 6 | codes[3];
				decodedBytes.push(result);

				return asciiStringFromCodes(decodedBytes);
			}
			else if(singlePadding.test(inputString)) {
				var cleanInput = inputString.substring(0, inputString.length-1);
				var decodedBytes = [];
				var codes = base64CodesFromString(cleanInput);

				var result = 0;
				result |= codes[0] << 2 | (codes[1] >>4);
				decodedBytes.push(result);

				result = 0;
				result |= (codes[1] & 15) << 4 | (codes[2] >> 2);
				decodedBytes.push(result);

				return asciiStringFromCodes(decodedBytes);
			}
			else if(doublePadding.test(inputString)) {
				var cleanInput = inputString.substring(0, inputString.length-2);
				var decodedBytes = [];
				var codes = base64CodesFromString(cleanInput);

				var result = 0;
				result |= codes[0] << 2 | (codes[1] >>4);
				decodedBytes.push(result);

				return asciiStringFromCodes(decodedBytes);
			}
			else {
				return {'success': false, 'message': 'Invalid base64'};
			}
			break;
		case 3:
			var base64only = /^[a-zA-Z0-9\/\+]*$/;
			if(base64only.test(inputString)) {
				var decodedBytes = [];
				var codes = base64CodesFromString(inputString);

				var result = 0;
				result |= codes[0] << 2 | (codes[1] >>4);
				decodedBytes.push(result);

				result = 0;
				result |= (codes[1] & 15) << 4 | (codes[2] >> 2);
				decodedBytes.push(result);

				return asciiStringFromCodes(decodedBytes);
			}
			else {
				return {'success': false, 'message': 'Invalid base64'};
			}
			break;
		case 2:
			var base64only = /^[a-zA-Z0-9\/\+]*$/;
			if(base64only.test(inputString)) {
				var decodedBytes = [];
				var codes = base64CodesFromString(inputString);

				var result = 0;
				result |= codes[0] << 2 | (codes[1] >>4);
				decodedBytes.push(result);

				return asciiStringFromCodes(decodedBytes);
			}
			else {
				return {'success': false, 'message': 'Invalid base64'};
			}
			break;
		case 1:
			return {'success': false, 'message': 'decodeBytes() takes strings 2-4 characters in length'};
			break;
		default:
			return {'success': false, 'message': 'decodeBytes() takes strings 2-4 characters in length'};
	}
}

exports.encode = function(stringData) {
	var cursor = 0;
	var base64Text = '';
	while(cursor < stringData.length) {
		var segLength = 3;
		if(stringData.length - cursor < 3) {
			segLength = stringData.length - cursor;
		}

		var currentSegment = stringData.substring(cursor, cursor+segLength);
		
		base64Text += encodeBytes(currentSegment);

		cursor += segLength;
	}
	return base64Text;
}

function encodeBytes(inputString) {
	var asciiCharCodes = asciiCodesFromString(inputString);
	var base64CharCodes = [];
	var returnString = '';
	if(inputString.length === 3) {
		var result = 0;
		result |= asciiCharCodes[0] >> 2;
		base64CharCodes.push(result);

		result = 0;
		result |= ((asciiCharCodes[0] & 3) << 4) | (asciiCharCodes[1] >> 4);
		base64CharCodes.push(result);

		result = 0;
		result |= ((asciiCharCodes[1] & 15) << 2) | (asciiCharCodes[2] >> 6);
		base64CharCodes.push(result);

		result = 0;
		result |= (asciiCharCodes[2] & 63);
		base64CharCodes.push(result);

		returnString = base64StringFromCodes(base64CharCodes);
	}
	else if(inputString.length === 2) {
		var result = 0;
		result |= asciiCharCodes[0] >> 2;
		base64CharCodes.push(result);

		result = 0;
		result |= ((asciiCharCodes[0] & 3) << 4) | (asciiCharCodes[1] >> 4);
		base64CharCodes.push(result);

		result = 0;
		result |= (asciiCharCodes[1] & 15) << 2;
		base64CharCodes.push(result);

		returnString = base64StringFromCodes(base64CharCodes);
		returnString += '=';
	}
	else if(inputString.length === 1) {
		var result = 0;
		result |= asciiCharCodes[0] >> 2;
		base64CharCodes.push(result);

		result = 0;
		result |= (asciiCharCodes[0] & 3) << 4;
		base64CharCodes.push(result);

		returnString = base64StringFromCodes(base64CharCodes);
		returnString += '==';
	}
	else {
		return {'success': false, 'message': 'encodeBytes() takes a string of 1-3 chars'};
	}

	return returnString;
}

function asciiCodesFromString(inputString) {
	var charCodes = [];
	for(var idx = 0; idx < inputString.length; idx++) {
		charCodes.push(inputString.charCodeAt(idx));
	}
	return charCodes;
}

function asciiStringFromCodes(inputCodes) {
	var resultString = '';
	for(var idx = 0; idx < inputCodes.length; idx++) {
		resultString += String.fromCharCode(inputCodes[idx]);
	}
	return resultString;
}

function base64CodesFromString(inputString) {
	var mapping = ['A','B','C','D','E','F','G','H','I','J','K','L','M','N','O','P','Q','R','S','T','U','V','W','X','Y','Z',
					'a','b','c','d','e','f','g','h','i','j','k','l','m','n','o','p','q','r','s','t','u','v','w','x','y','z',
					'0','1','2','3','4','5','6','7','8','9','+','/'];
	var charCodes = [];
	for(var idx = 0; idx < inputString.length; idx++) {
		charCodes.push(mapping.indexOf(inputString.charAt(idx)));
	}
	return charCodes;
}

function base64StringFromCodes(inputCodes) {
	var mapping = ['A','B','C','D','E','F','G','H','I','J','K','L','M','N','O','P','Q','R','S','T','U','V','W','X','Y','Z',
					'a','b','c','d','e','f','g','h','i','j','k','l','m','n','o','p','q','r','s','t','u','v','w','x','y','z',
					'0','1','2','3','4','5','6','7','8','9','+','/'];
	var resultString = '';
	for(var idx = 0; idx < inputCodes.length; idx++) {
		resultString += mapping[inputCodes[idx]];
	}
	return resultString;
}