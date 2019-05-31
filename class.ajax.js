/*
@version:     3.1.0
@builddate:   2016-11-02
@author:      Andrew Real <theoriginalrealdealAtgmailDotcom>
@usage:       (var = ) new ajax({"source": string, "param": string, "method": string, "headers": {"header": "value"}, "success": function, "fail": function});
@description:
  3.1 --  Added errorPrefix and authErrorPrefix checks (disabled by default for now whilst testing), more comments to help implementation (hopefully), added misc section
  3.0 --  Cleaned, added header support, added abort support (var [ajax]().abort(callback_func))
  2.5 --  Cleaned, added message if it takes over (this.defaults.timeout) seconds
  2.0 --  Cleaned, now a self-contained method that may run several requests at once
  1.0 --  Initial write
@misc:
  [1] headers --  requires ECMA5+ browser to validate completely; may work with older browsers but type checking is disabled
*/

var ajax = function() {
  this.version = [3,1,0];         //  array containing current version
  this.isLoaded = false;          //  should not be changed. becomes true when XMLHttpRequest object is created
  this.isRunning = false;         //  prevents multiple requests with the same object
  this.timeRequest = false;       //  timeout request
  this.errorPrefix = "!";         //  if response begins with this, send response to fail callback instead of success
  this.authErrorPrefix = "@@";    //  if response begins with this, and forceErrorCheck = true, redirect to URL contained in authLogout
  this.forceErrorCheck = true;   //  if true, examine response for error prefixes
  this.authLogout = "YOUR_SIGNOUT_URL_HERE?message=" + encodeURIComponent("You must be signed in to view this content");  
                                  //  [above] url to redirect to if forceErrorCheck = true and response starts with authErrorPrefix

  this.defaults = {               //  default properties, can be modified
    "method": "POST",             //  default method, POST and GET supported
    "voidfunc": function() {
      void(0);                    //  empty function, because success and fail require some sort of callback; if success or fail are missing this is used instead
    },
    "timeout": 5000,              //  how long, in ms, before a notice should be sent saying the request is taking longer than usual
    "timeoutfunc": function() {   //  function used when alerting the user that the request is taking longer than usual
      cleverUI.failBox("The request is taking longer than it should.");
    },
    "headers": null               //  default headers, used if headers are not specified
  };

  this.boot = function() {
    //  creates XMLHttpRequest which is stored as this.Ajax
    this.Ajax = null;
    if (window.XMLHttpRequest) {
      this.Ajax = new XMLHttpRequest();
      this.isLoaded = true;
    } else if (window.ActiveXObject) {
      this.Ajax = new ActiveXObject("MSXML2.XMLHTTP.3.0");
      this.isLoaded = true;
    } else {
      this.Ajax = false;
    }
  };

  this.throwError = function(obj) {
    //  handles errors, usage: throwError("Error String") or throwError({"message": "Error String", "critical": boolean, "num": string or int})
    if (typeof obj === "string") {
      if (typeof window.console != "undefined") {
        window.console.log("Ajax error:", obj);
      } else {
        alert("Ajax error:\n" + obj);
      }
    } else if (typeof obj.message != "undefined" && typeof obj.message === "string") {
      var message = typeof obj.message != "undefined" && typeof obj.message === "string" ? obj.message : "unspecified error";
      var critical = typeof obj.critical != "undefined" && typeof obj.critical === "boolean" ? obj.critical : true;
      var num = typeof obj.num != "undefined" && (typeof obj.num === "string" || typeof obj.num === "number") ? obj.num : "undefined error";
      if (typeof window.console != "undefined") {
        window.console.log("Ajax error:", message, "Error ID: " + num);
      } else {
        alert("Ajax error:\nError ID: " + num + "\n\n" + message);
      }
      if (critical) {
        throw new Error(message);
      }
    }
  };

  this.abort = function(callback) {
    //  stops request; if callback is provided it is called, otherwise fail is called
    if (this.Ajax && this.Ajax.isRunning) {
      this.Ajax.abort();
      this.isRunning = false;
    }
    if (typeof callback !== "undefined" && typeof callback  === "function") {
      callback("Request Aborted");
    } else {
      fail("Request Aborted");
    }
  };

  this.prep = function(str) {
    //  used to define properties for the request, then send it
    if (!this.Ajax) {
      try {
        this.boot();
      } catch(er) {
        this.throwError({"critical": true, "message": "Unable to create AJAX request - not supported", "num": 1});
        return false;
      }
    };

    this.validHeaders = function(h_obj) {
      //  requires ECMA5+ for Object.keys(); if ECMA5+ not present, only validates constructor and not length. Note [1]
      if (typeof Object.keys === "undefined") {
        return typeof h_obj === "undefined" || h_obj === null ? false : h_obj.constructor === {}.constructor;
      }
      return typeof h_obj === "undefined" || h_obj === null ? false : h_obj.constructor === {}.constructor && Object.keys(h_obj).length > 0;
    };

    var undef;
    var success = typeof str.success != typeof undef && typeof str.success === "function" ? str.success : this.defaults.voidfunc;
    var fail = typeof str.fail != typeof undef && typeof str.fail === "function" ? str.fail : this.defaults.voidfunc;
    var source = typeof str.source != typeof undef && typeof str.source === "string" ? str.source : null;
    var param = typeof str.param != typeof undef && typeof str.param === "string" ? str.param : null;
    var method = typeof str.method != typeof undef && typeof str.method === "string" ? str.method : this.defaults.method;
    var headers = typeof str.headers != typeof undef && typeof str.headers === "object" && this.validHeaders(str.headers) ? str.headers : this.defaults.headers;
    var self = this;

    if (method.toUpperCase() == "GET" && param !== null) {
      //  ex: source = "page.php", param = "go=home", source becomes "page.php?go=home"
      //  ex: source = "page.php?debug=1", param = "go=home", source becomes "page.php?debug=1&go=home"
      source = source + (source.indexOf("?") === -1 ? "?" : "&") + param;
      param = null;
    }

    if (source === null) {
      //  placed below the above check in case source is same page 
      //  and shorthanded (source=null, param="debug=1") to create ("?param=1") which is allowed
      this.throwError({"critical": true, "message": "Variable 'source' missing!", "num": 2});
      return false;
    }

    this.isRunning = true;
    this.Ajax.open(method, source, true);


    if (headers) {
      //  set headers here if requested
      for (var h_prop in headers) {
        this.Ajax.setRequestHeader(h_prop, headers[h_prop]);
      }
    }

    this.Ajax.onreadystatechange = function() {
      if (this.readyState == 4 && this.status == 200) {
        //  server reply: success
        self.isRunning = false;
        clearTimeout(self.timeRequest);
        if (self.forceErrorCheck === true && typeof this.responseText === "string" && this.responseText.length > 0) {
          if (this.responseText.substring(0, self.errorPrefix.length) == self.errorPrefix) {
            fail(this.responseText);
            return false;

          } else if (this.responseText.substring(0, self.authErrorPrefix.length) == self.authErrorPrefix) {
            location.href = self.authLogout;
            return false;

          } else {
            success(this.responseText);
          }
        } else {
          success(this.responseText);
          return true;
        }

      } else if (this.readyState == 4 && this.status == 404) {
        //  server reply: not found
        self.isRunning = false;
        clearTimeout(self.timeRequest);
        fail(this.responseText);
        return false;

      } else if (this.readyState == 4 && this.status == 500) {
        //  server reply: server error
        self.isRunning = false;
        clearTimeout(self.timeRequest);
        fail("Server error 500 reported");
        return false;

      } else {
        try {
          var resp = this.status.substring(1, 0);
          if (resp == 3 || resp == 4 || resp == 5) {
            //  responses beginning with 3/4/5 (3xx/4xx/5xx) indicate server has finished and returned an error response of some form
            self.isRunning = false;
            clearTimeout(self.timeRequest);
            fail(this.responseText);
            return false;
          }
        } catch(e) {

        }
      }
    };

    this.Ajax.setRequestHeader('Content-Type', 'application/x-www-form-urlencoded; charset=UTF-8');
    if (param === null) {
      this.Ajax.send();
    } else {
      this.Ajax.send(param);
    }

    //  sets timeout in the event the request takes longer than usual
    this.timeRequest = setTimeout(this.defaults.timeoutfunc, this.defaults.timeout);
    return this;
  };
};

try {
  window.mods.load({"title": "ajax", "type": (typeof ajax), "container": ajax, "dependencies": []});
} catch(er) {

}
