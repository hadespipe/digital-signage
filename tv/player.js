/* Shared by classic webOS scripts and Vite's side-effect import. ES2019 syntax. */
(function (root) {
  var signage = (root.Signage = root.Signage || {});
  signage.createPlayer = function (options) {
    var transport = options.transport,
      view = options.view,
      clock = options.clock || root;
    var running = false,
      generation = 0,
      lifecycle = 0,
      active = [],
      index = 0,
      key = null;
    var pollTimer,
      slideTimer,
      commitTimer,
      slideRevision = 0,
      pollController,
      loadController,
      polling = false;
    var pendingKey = null,
      cancelPending = null,
      known = false;
    function release(items) {
      items.forEach(function (item) {
        item.release();
      });
    }
    function bounded(work, controller) {
      return new Promise(function (resolve, reject) {
        var timer = clock.setTimeout(function () {
          controller.abort();
          reject(new Error("Playback request timed out"));
        }, 4500);
        work.then(
          function (value) {
            clock.clearTimeout(timer);
            resolve(value);
          },
          function (error) {
            clock.clearTimeout(timer);
            reject(error);
          },
        );
        controller.signal.addEventListener("abort", function () {
          clock.clearTimeout(timer);
          reject(new Error("Playback request aborted"));
        });
      });
    }
    function cancelSlide() {
      slideRevision++;
      clock.clearTimeout(slideTimer);
      clock.clearTimeout(commitTimer);
    }
    function slide() {
      if (!running || active.length < 2) return;
      var revision = slideRevision,
        next = (index + 1) % active.length;
      slideTimer = clock.setTimeout(function () {
        if (running && revision === slideRevision)
          view.beginTransition(active[next].url, 300);
      }, 1700);
      commitTimer = clock.setTimeout(function () {
        if (!running || revision !== slideRevision) return;
        index = next;
        view.showImage(active[index].url);
        slide();
      }, 2000);
    }
    function validate(value) {
      if (
        !value ||
        !Number.isInteger(value.version) ||
        !Array.isArray(value.images) ||
        value.images.length > 5
      )
        throw new Error("Invalid playlist");
      var ids = {};
      value.images.forEach(function (image) {
        if (
          !image ||
          typeof image.id !== "string" ||
          !/^[a-zA-Z0-9_-]+$/.test(image.id) ||
          image.path !== "/api/images/" + image.id ||
          ids[image.id]
        )
          throw new Error("Invalid image path");
        ids[image.id] = true;
      });
      return JSON.stringify(value.images);
    }
    function update(manifest) {
      var nextKey = validate(manifest);
      if (nextKey === pendingKey || nextKey === key) {
        // A return to the active set also cancels a now obsolete candidate.
        if (nextKey === key && pendingKey !== null) {
          generation++;
          cancelPending();
          pendingKey = null;
        }
        return;
      }
      generation++;
      if (cancelPending) cancelPending();
      var current = generation,
        loaded = [],
        discarded = false;
      loadController = new AbortController();
      var controller = loadController;
      cancelPending = function () {
        discarded = true;
        controller.abort();
        release(loaded);
        loaded = [];
      };
      pendingKey = nextKey;
      var downloads = manifest.images.map(function (image) {
        return bounded(
          transport
            .loadImage(image.path, controller.signal)
            .then(function (item) {
              if (discarded || !running || current !== generation) {
                item.release();
                throw new Error("Stale image");
              }
              loaded.push(item);
              return item;
            }),
          controller,
        );
      });
      Promise.all(downloads)
        .then(function (items) {
          if (!running || current !== generation || discarded) return;
          cancelSlide();
          view.clear();
          var previous = active;
          active = items;
          loaded = [];
          index = 0;
          key = nextKey;
          pendingKey = null;
          cancelPending = null;
          known = true;
          if (active.length) view.showImage(active[0].url);
          else view.showEmpty();
          release(previous);
          slide();
        })
        .catch(function () {
          if (current !== generation) return;
          cancelPending();
          cancelPending = null;
          pendingKey = null;
          if (!known && running) view.showError();
        });
    }
    function poll() {
      if (!running) return;
      pollTimer = clock.setTimeout(poll, 5000);
      if (polling) return;
      polling = true;
      var cycle = lifecycle;
      pollController = new AbortController();
      bounded(transport.getPlaylist(pollController.signal), pollController)
        .then(function (manifest) {
          if (running && cycle === lifecycle) update(manifest);
        })
        .catch(function () {
          if (!known && running && cycle === lifecycle) view.showError();
        })
        .then(function () {
          if (cycle === lifecycle) polling = false;
        });
    }
    return {
      start: function () {
        if (!running) {
          running = true;
          poll();
        }
      },
      stop: function () {
        running = false;
        lifecycle++;
        polling = false;
        generation++;
        clock.clearTimeout(pollTimer);
        cancelSlide();
        view.clear();
        if (pollController) pollController.abort();
        if (cancelPending) cancelPending();
        cancelPending = null;
        pendingKey = null;
        release(active);
        active = [];
        key = null;
        known = false;
      },
    };
  };
})(globalThis);
