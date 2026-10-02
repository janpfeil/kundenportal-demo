(function () {
  var root = document.documentElement;
  try {
    var saved = localStorage.getItem("flurmap-theme");
    if (saved) root.setAttribute("data-theme", saved);
  } catch (e) {}

  var ICON = '<svg viewBox="0 0 24 24" width="18" height="18" fill="none" stroke="currentColor" ' +
    'stroke-width="1.75" stroke-linecap="round" stroke-linejoin="round" aria-hidden="true">';
  var SUN = ICON + '<circle cx="12" cy="12" r="4"/><path d="M12 2.5v2M12 19.5v2M2.5 12h2M19.5 12h2' +
    'M5.3 5.3l1.4 1.4M17.3 17.3l1.4 1.4M5.3 18.7l1.4-1.4M17.3 6.7l1.4-1.4"/></svg>';
  var MOON = ICON + '<path d="M20 14.5A8 8 0 1 1 9.5 4a6.5 6.5 0 0 0 10.5 10.5z"/></svg>';

  document.addEventListener("DOMContentLoaded", function () {
    var btn = document.querySelector(".theme-toggle");
    if (btn) {
      var label = function () {
        var dark = root.getAttribute("data-theme") === "dark" ||
          (!root.getAttribute("data-theme") && window.matchMedia("(prefers-color-scheme: dark)").matches);
        // The icon shows what a click switches to: the moon in light mode, the sun in dark.
        var next = dark ? "Helles Design" : "Dunkles Design";
        btn.innerHTML = dark ? SUN : MOON;
        btn.setAttribute("aria-label", next);
        btn.title = next;
        return dark;
      };
      label();
      btn.addEventListener("click", function () {
        var next = label() ? "light" : "dark";
        root.setAttribute("data-theme", next);
        try { localStorage.setItem("flurmap-theme", next); } catch (e) {}
        label();
      });
    }

    var tip = document.createElement("div");
    tip.className = "tooltip";
    tip.setAttribute("role", "status");
    document.body.appendChild(tip);
    var show = function (el, x, y) {
      tip.textContent = el.getAttribute("data-tip");
      tip.style.display = "block";
      var w = tip.offsetWidth, h = tip.offsetHeight;
      var left = Math.min(x + 14, window.innerWidth - w - 8);
      var top = y + 16 + h > window.innerHeight ? y - h - 10 : y + 16;
      tip.style.left = Math.max(8, left) + "px";
      tip.style.top = Math.max(8, top) + "px";
    };
    document.querySelectorAll("[data-tip]").forEach(function (el) {
      el.addEventListener("mousemove", function (ev) { show(el, ev.clientX, ev.clientY); });
      el.addEventListener("mouseleave", function () { tip.style.display = "none"; });
      el.addEventListener("focus", function () {
        var r = el.getBoundingClientRect();
        show(el, r.left + r.width / 2, r.top + r.height / 2);
      });
      el.addEventListener("blur", function () { tip.style.display = "none"; });
    });
  });
})();
