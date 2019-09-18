var fs = require('fs-extra'),
  through2 = require('through2'),
  request = require('request');

function _isEmptyObject(obj) {
  for (var key in obj) {
    if (Object.prototype.hasOwnProperty.call(obj, key)) {
      return false;
    }
  }
  return true;
}

function _isEmptyString(str) {
  return !(str && str.toString().trim() !== '');
}

function _logError(...arg) {
  console.error(...arg);
}

function _logDebug(...arg) {
  console.log(...arg);
}

function _encodeToBase64(stringToEncode) {
  return new Buffer(stringToEncode.toString()).toString("base64");
}

function _generateResponseFormatObject(statusCode, responseMessage, responseData) {
  return {
    "status": statusCode,
    "message": responseMessage,
    "response_data": responseData
  };
}

function _timestamps(addFactor) {
  if (addFactor === undefined)
    addFactor = 0;

  let now = new Date(),
    currentUTCTimeInMilliSecs = now.getTime(); // getTime already returns UTC timestamp

  return currentUTCTimeInMilliSecs + addFactor;
}

function _replaceFileNameSpecialCharacters(str) {
    return str
        .replace(/([\\/:*?"'<>|\*])/g, '_') // replace matched characters with underscore(_)
        .trim();
//        .replace(/^(\s*)([\W\w]*)(\b\s*$)/g, '$2'); // trim the string to remove any whitespace at the beginning or the end.
}

function _downloadRemotefileHttpReq(reqMethod, reqUrl, reqData, callback, uploadPath, customFileNameToUse,
  basicAuthCredentials, isPostJSON, dataToSentThroughHeader, isReturnResponseHeadersInSuccess) {
  _logDebug('@#$#@$@$@# downloadRemotefileHttpReq', reqMethod, reqUrl, reqData, uploadPath, customFileNameToUse);
  var options = {
    url: reqUrl,
    method: reqMethod,
    headers: {}
  };

  if (!_isEmptyObject(basicAuthCredentials)) {
    options.headers["Authorization"] = "Basic " + _encodeToBase64(basicAuthCredentials.username + ":" + basicAuthCredentials.password);
  }

  if (!_isEmptyObject(dataToSentThroughHeader)) {
    for (var key in dataToSentThroughHeader) {
      options.headers[key] = dataToSentThroughHeader[key];
    }
  }

  if (reqMethod == 'GET') {
    options.qs = reqData;
  } else {
    if (isPostJSON != undefined && isPostJSON == true) {
      options.json = reqData;
    } else {
      options.form = reqData;
    }
  }

  var apiResponse = _generateResponseFormatObject(200, "Success", []);
  var req = request(options);
  req.on('error', function(e) {
    // Handle connection errors
    _logError('connection error', e);

    apiResponse.status = 500;
    apiResponse.message = 'Connection error';
    apiResponse.response_data = e;

    callback(apiResponse);
  });
  var bufferedResponse = req.pipe(through2(function(chunk, enc, through2callback) {
    this.push(chunk);
    through2callback();
  }));
  req.on('response', function(res, data) {
    // _logDebug('$$$$$$$$$ connector response', options.url, res.statusCode);
    if (res.statusCode === 200) {

      try {
        var contentDisposition = res.headers['content-disposition'];
        var match = contentDisposition && contentDisposition.match(/(filename=|filename\*='')(.*)$/);
        var filename = match && match[2] || (_timestamps() + '_default-filename.out');
        var baseDownloadFolder = "./" + ((!_isEmptyString(uploadPath)) ? uploadPath.trim() : '');

        fs.ensureDirSync(baseDownloadFolder); // dir has now been created, including the directory it is to be placed in

        if (!_isEmptyString(customFileNameToUse)) {
          filename = customFileNameToUse.trim();
        }

        filename = _replaceFileNameSpecialCharacters(filename);

        var fileNameWithPath = baseDownloadFolder + filename;
        var dest = fs.createWriteStream(fileNameWithPath);

        dest.on('error', function(e) {
          // Handle write errors
          _logError(e);

          apiResponse.status = 500;
          apiResponse.message = 'Error while creating file';
          apiResponse.response_data = e;

          callback(apiResponse);
        });

        dest.on('finish', function() {
          // The file has been downloaded
          _logDebug('Downloaded ' + filename);

          apiResponse.status = 200;
          apiResponse.message = 'Document downloaded successfully';
          apiResponse.response_data = {
            file_details: {
              file_name: filename,
              file_path: fileNameWithPath,
              base_folder: baseDownloadFolder
            }
          };

          if (isReturnResponseHeadersInSuccess) {
            // response header values are returned as string
            apiResponse.response_data.response_headers = res.headers;
          }

          callback(apiResponse);

        });

        bufferedResponse.pipe(dest);

      } catch (e) {
        // Handle request errors
        _logError('request errors', e);

        apiResponse.status = 500;
        apiResponse.message = 'Some error occurred while downloading file';
        apiResponse.response_data = e;

        callback(apiResponse);
      }
    }
    else {
      // Handle HTTP server errors
      var respBody = '';
      apiResponse.status = res.statusCode;

      bufferedResponse.on('data', function(data) {
        respBody = data.toString();
      });

      bufferedResponse.on('end', function(data) {
        try {
          _logDebug('HTTP server error data', respBody, typeof respBody);
          var jsonFormat = JSON.parse(respBody);
          apiResponse.message = jsonFormat.message;
          if (jsonFormat.response_data != undefined)
            apiResponse.response_data = jsonFormat.response_data;
        } catch (ex) {
          //                    apiResponse.status = 500;
          apiResponse.message = respBody;
        }

        callback(apiResponse);
      });
      _logError('HTTP server errors', res.statusCode);
    }
  });
};

let requestMethod = "GET",
  requestURL = "<REMOTE_URL>",
  requestData = {};

_downloadRemotefileHttpReq(requestMethod, requestURL, requestData, function(response){
  _logDebug("response", response);
}, "downloads/", "sample_" + _timestamps() + ".txt");
