var ApiClient = (function () {

  function ApiClient(url) {
    this.url = url;
    this.idToken = null;
  }

  ApiClient.prototype.setIdToken = function (token) {
    this.idToken = token;
  };

  ApiClient.prototype.call = function (action, params) {
    var self = this;
    return new Promise(function (resolve, reject) {
      var cb = 'c' + Date.now() + '_' + Math.random().toString(36).slice(2, 8);
      var q = new URLSearchParams();
      q.set('callback', cb);
      q.set('action', action);
      q.set('token', self.idToken || '');
      if (params) {
        for (var key in params) {
          if (params.hasOwnProperty(key)) {
            q.set(key, typeof params[key] === 'object' ? JSON.stringify(params[key]) : String(params[key]));
          }
        }
      }
      window[cb] = function (res) {
        delete window[cb];
        var s = document.getElementById('_jsonp_' + cb);
        if (s) s.parentNode.removeChild(s);
        if (res.error) reject(new Error(res.error));
        else resolve(res.data);
      };
      var s = document.createElement('script');
      s.id = '_jsonp_' + cb;
      s.src = self.url + '?' + q.toString();
      s.onerror = function () { reject(new Error('Network error')); };
      document.body.appendChild(s);
    });
  };

  return ApiClient;
})();
