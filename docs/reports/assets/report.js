(function () {
  var root = document.documentElement;
  try {
    var saved = localStorage.getItem("flurmap-theme");
    if (saved) root.setAttribute("data-theme", saved);
  } catch (e) {}

  document.addEventListener("DOMContentLoaded", function () {
    var btn = document.querySelector(".theme-toggle");
    if (btn) {
      var label = function () {
        var dark = root.getAttribute("data-theme") === "dark" ||
          (!root.getAttribute("data-theme") && window.matchMedia("(prefers-color-scheme: dark)").matches);
        btn.textContent = dark ? "Hell" : "Dunkel";
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
