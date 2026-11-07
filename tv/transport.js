(function (root) {
  var signage = (root.Signage = root.Signage || {});
  signage.createTransport = function (options) {
    var base = options.baseUrl || "";
    function request(path, signal) {
      return fetch(base + path, {
        signal: signal,
        credentials: options.token ? "omit" : "same-origin",
        headers: options.token
          ? { Authorization: "Bearer " + options.token }
          : {},
      }).then(function (response) {
        if (!response.ok)
          throw new Error("Request failed (" + response.status + ")");
        return response;
      });
    }
    return {
      getPlaylist: function (signal) {
        return request("/api/playlist", signal).then(function (response) {
          return response.json();
        });
      },
      loadImage: function (path, signal) {
        if (!/^\/api\/images\/[a-zA-Z0-9_-]+$/.test(path))
          return Promise.reject(new Error("Invalid image path"));
        return request(path, signal)
          .then(function (response) {
            return response.blob();
          })
          .then(function (blob) {
            return new Promise(function (resolve, reject) {
              var url = URL.createObjectURL(blob),
                image = new Image(),
                released = false;
              function release() {
                if (!released) {
                  released = true;
                  URL.revokeObjectURL(url);
                  image.src = "";
                }
              }
              function cleanup() {
                image.onload = null;
                image.onerror = null;
                if (signal) signal.removeEventListener("abort", abort);
              }
              function abort() {
                cleanup();
                release();
                reject(new Error("Image aborted"));
              }
              image.onload = function () {
                cleanup();
                resolve({ url: url, release: release });
              };
              image.onerror = function () {
                cleanup();
                release();
                reject(new Error("Image decode failed"));
              };
              if (signal) {
                if (signal.aborted) {
                  abort();
                  return;
                }
                signal.addEventListener("abort", abort);
              }
              image.src = url;
            });
          });
      },
    };
  };
})(globalThis);
