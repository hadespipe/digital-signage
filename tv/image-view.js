/* Shared DOM rendering for TV and preview; timing belongs to the player. */
(function (root) {
  var signage = (root.Signage = root.Signage || {});
  signage.createImageView = function (base, incoming) {
    var motion = root.matchMedia("(prefers-reduced-motion: reduce)"),
      revision = 0,
      frame = null;
    function cancelIncoming() {
      revision++;
      if (frame !== null) root.cancelAnimationFrame(frame);
      frame = null;
      incoming.onload = null;
      incoming.hidden = true;
      incoming.style.transition = "none";
      incoming.style.opacity = "0";
      incoming.removeAttribute("src");
    }
    function roles() {
      base.setAttribute("data-slide", "base");
      base.alt = "Display image";
      base.removeAttribute("aria-hidden");
      base.style.transition = "none";
      base.style.opacity = "1";
      incoming.setAttribute("data-slide", "incoming");
      incoming.alt = "";
      incoming.setAttribute("aria-hidden", "true");
    }
    function clear() {
      cancelIncoming();
      base.hidden = true;
      base.removeAttribute("src");
    }
    function preferenceChanged() {
      if (motion.matches) cancelIncoming();
    }
    roles();
    clear();
    motion.addListener(preferenceChanged);
    return {
      showImage: function (url) {
        if (incoming.getAttribute("src") === url && incoming.complete && incoming.naturalWidth) {
          var previous = base,
            id = base.id;
          base = incoming;
          incoming = previous;
          base.id = incoming.id;
          incoming.id = id;
          roles();
        } else base.src = url;
        base.hidden = false;
        cancelIncoming();
      },
      beginTransition: function (url, durationMs) {
        cancelIncoming();
        if (motion.matches) return;
        var current = revision;
        function ready() {
          if (current !== revision || motion.matches) return;
          incoming.onload = null;
          incoming.hidden = false;
          frame = root.requestAnimationFrame(function () {
            frame = root.requestAnimationFrame(function () {
              frame = null;
              if (current !== revision) return;
              incoming.style.transition = "opacity " + durationMs + "ms linear";
              incoming.style.opacity = "1";
            });
          });
        }
        incoming.onload = ready;
        incoming.src = url;
        if (incoming.complete && incoming.naturalWidth) ready();
      },
      clear: clear,
      dispose: function () {
        clear();
        motion.removeListener(preferenceChanged);
      },
    };
  };
})(globalThis);
