(function () {
  var secciones = document.querySelectorAll("main section[id]");
  var enlaces = document.querySelectorAll(".nav-lista a[href^='#']");

  function limpiarActivo() {
    enlaces.forEach(function (a) {
      a.classList.remove("is-active");
    });
  }

  function activarPorId(id) {
    limpiarActivo();
    enlaces.forEach(function (a) {
      if (a.getAttribute("href") === id) {
        a.classList.add("is-active");
      }
    });
  }

  enlaces.forEach(function (a) {
    a.addEventListener("click", function () {
      var href = a.getAttribute("href");
      if (href && href.charAt(0) === "#") {
        activarPorId(href);
      }
    });
  });

  if (!("IntersectionObserver" in window) || secciones.length === 0) {
    if (enlaces.length) enlaces[0].classList.add("is-active");
    return;
  }

  var visibles = new Map();

  var obs = new IntersectionObserver(
    function (entries) {
      entries.forEach(function (entry) {
        var id = "#" + entry.target.id;
        if (entry.isIntersecting && entry.intersectionRatio > 0) {
          visibles.set(id, entry.intersectionRatio);
        } else {
          visibles.delete(id);
        }
      });

      if (visibles.size === 0) return;

      var mejor = null;
      var mejorRatio = 0;
      visibles.forEach(function (ratio, id) {
        if (ratio > mejorRatio) {
          mejorRatio = ratio;
          mejor = id;
        }
      });

      if (mejor) activarPorId(mejor);
    },
    { root: null, rootMargin: "-20% 0px -55% 0px", threshold: [0, 0.1, 0.25, 0.5, 0.75, 1] }
  );

  secciones.forEach(function (sec) {
    obs.observe(sec);
  });

  function syncHash() {
    var h = window.location.hash;
    if (h && document.querySelector("section" + h)) {
      activarPorId(h);
    } else {
      activarPorId("#" + secciones[0].id);
    }
  }

  syncHash();
  window.addEventListener("hashchange", syncHash);
})();
