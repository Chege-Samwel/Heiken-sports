/* ==========================================================================
   StreamSports99 — API Docs (vanilla JS, no dependencies)
   ========================================================================== */
(function () {
  "use strict";

  var API_BASE = "https://api.cdnlivetv.is/api/v1/";
  var QUERY = "?user=cdnlivetv&plan=free";

  /* ------------------------------------------------------------------
   * Data: the 26 free endpoints
   * ------------------------------------------------------------------ */
  var ENDPOINTS = [
    { name: "API Channels", desc: "All available streaming channels", path: "channels/" },
    { name: "API All Sports", desc: "Events from all sports categories", path: "events/sports/" },
    { name: "API Soccer", desc: "Soccer/Football events worldwide", path: "events/sports/soccer/" },
    { name: "API Cricket", desc: "Cricket events worldwide", path: "events/sports/cricket/" },
    { name: "API Winter Sports", desc: "Winter sports events", path: "events/sports/winter-sports/" },
    { name: "API Golf", desc: "Golf tournaments and events", path: "events/sports/golf/" },
    { name: "API NCAA", desc: "NCAA college sports events", path: "events/sports/ncaa/" },
    { name: "API NCAAW", desc: "NCAA women's sports events", path: "events/sports/ncaaw/" },
    { name: "API Tennis", desc: "Tennis tournaments and matches", path: "events/sports/tennis/" },
    { name: "API Volleyball", desc: "Volleyball events worldwide", path: "events/sports/volleyball/" },
    { name: "API Cycling", desc: "Cycling races and events", path: "events/sports/cycling/" },
    { name: "API Badminton", desc: "Badminton tournaments and matches", path: "events/sports/badminton/" },
    { name: "API Horse Racing", desc: "Horse racing events", path: "events/sports/horse-racing/" },
    { name: "API Basketball", desc: "Basketball events worldwide", path: "events/sports/basketball/" },
    { name: "API Darts", desc: "Darts tournaments and events", path: "events/sports/darts/" },
    { name: "API Futsal", desc: "Futsal events worldwide", path: "events/sports/futsal/" },
    { name: "API Handball", desc: "Handball events worldwide", path: "events/sports/handball/" },
    { name: "API Hockey", desc: "Hockey events worldwide", path: "events/sports/hockey/" },
    { name: "API Motorsport", desc: "Motorsport races and events", path: "events/sports/motorsport/" },
    { name: "API NFL", desc: "American Football (NFL) events", path: "events/sports/nfl/" },
    { name: "API NBA", desc: "Basketball (NBA) events", path: "events/sports/nba/" },
    { name: "API NHL", desc: "Ice Hockey (NHL) events", path: "events/sports/nhl/" },
    { name: "API MLB", desc: "Baseball (MLB) events", path: "events/sports/mlb/" },
    { name: "API UFC", desc: "UFC fighting events", path: "events/sports/ufc/" },
    { name: "API WWE", desc: "WWE wrestling events", path: "events/sports/wwe/" },
    { name: "API MMA", desc: "MMA fighting events", path: "events/sports/mma/" }
  ];

  var JSON_FORMAT_A = [
    "{",
    '  "gameID": "XJY5jnxw",',
    '  "homeTeam": "Fulham",',
    '  "awayTeam": "Southampton",',
    '  "homeTeamIMG": "https://api.cdnlivetv.is/api/v1/team/images/43.png",',
    '  "awayTeamIMG": "https://api.cdnlivetv.is/api/v1/team/images/45.png",',
    '  "time": "12:00",',
    '  "tournament": "FA Cup",',
    '  "country": "England",',
    '  "countryIMG": "https://flagcdn.com/w40/gb-eng.png",',
    '  "status": "live",',
    '  "start": "2026-03-08 12:00",',
    '  "end": "2026-03-08 14:39",',
    '  "channels": [',
    "    {",
    '      "channel_name": "Sky Sports",',
    '      "channel_code": "sky-sports",',
    '      "url": "https://cdnlivetv.is/api/v1/...",',
    '      "image": "https://api.cdnlivetv.is/api/v1/channel/...",',
    '      "viewers": "1200"',
    "    }",
    "  ]",
    "}"
  ].join("\n");

  var JSON_FORMAT_B = [
    "{",
    '  "gameID": "tiSyEVp5",',
    '  "event": "ATP/WTA 1000: Indian Wells",',
    '  "eventIMG": "https://api.cdnlivetv.is/api/v1/team/event.png",',
    '  "time": "03:00",',
    '  "tournament": "Tennis",',
    '  "country": "World",',
    '  "countryIMG": "https://i.ibb.co/V0wcngL7/world-b7d16db.png",',
    '  "status": "upcoming",',
    '  "start": "2026-03-09 03:00",',
    '  "end": "2026-03-09 07:00",',
    '  "channels": [',
    "    {",
    '      "channel_name": "Tennis Channel",',
    '      "channel_code": "tennis-ch",',
    '      "url": "https://cdnlivetv.is/api/v1/...",',
    '      "image": "https://api.cdnlivetv.is/api/v1/channel/...",',
    '      "viewers": "450"',
    "    }",
    "  ]",
    "}"
  ].join("\n");

  /* ------------------------------------------------------------------
   * Helpers
   * ------------------------------------------------------------------ */
  function $(sel, ctx) { return (ctx || document).querySelector(sel); }
  function $all(sel, ctx) { return Array.prototype.slice.call((ctx || document).querySelectorAll(sel)); }

  function escapeHtml(s) {
    return String(s).replace(/&/g, "&amp;").replace(/</g, "&lt;").replace(/>/g, "&gt;").replace(/"/g, "&quot;");
  }

  /* Quotes must survive escaping so the tokenizer can match JSON strings. */
  function escapeHtmlLight(s) {
    return String(s).replace(/&/g, "&amp;").replace(/</g, "&lt;").replace(/>/g, "&gt;");
  }

  var toastTimer = null;
  function toast(msg) {
    var el = $("#toast");
    if (!el) return;
    el.innerHTML = msg;
    el.classList.add("show");
    clearTimeout(toastTimer);
    toastTimer = setTimeout(function () { el.classList.remove("show"); }, 2600);
  }

  function copyText(text, done) {
    function fallback() {
      var ta = document.createElement("textarea");
      ta.value = text;
      ta.style.cssText = "position:fixed;opacity:0;pointer-events:none";
      document.body.appendChild(ta);
      ta.select();
      try { document.execCommand("copy"); } catch (e) { /* noop */ }
      document.body.removeChild(ta);
      if (done) done();
    }
    if (navigator.clipboard && navigator.clipboard.writeText) {
      navigator.clipboard.writeText(text).then(function () { if (done) done(); }, fallback);
    } else {
      fallback();
    }
  }

  function flashButton(btn) {
    btn.classList.add("copied");
    setTimeout(function () { btn.classList.remove("copied"); }, 1400);
  }

  /* ------------------------------------------------------------------
   * JSON syntax highlighting (single pass)
   * ------------------------------------------------------------------ */
  function highlightJson(src) {
    var escaped = escapeHtmlLight(src);
    return escaped.replace(
      /("(?:[^"\\]|\\.)*")(\s*:)?|\b(true|false)\b|\bnull\b|(-?\d+(?:\.\d+)?)/g,
      function (match, str, colon, bool, num) {
        if (str !== undefined && str !== null) {
          if (colon) return '<span class="tok-key">' + str + "</span>" + colon;
          return '<span class="tok-str">' + str + "</span>";
        }
        if (bool) return '<span class="tok-bool">' + bool + "</span>";
        if (num) return '<span class="tok-num">' + num + "</span>";
        return match;
      }
    );
  }

  /* ------------------------------------------------------------------
   * Render endpoint cards
   * ------------------------------------------------------------------ */
  function endpointUrl(ep) { return API_BASE + ep.path + QUERY; }

  function renderEndpoints() {
    var grid = $("#endpointGrid");
    if (!grid) return;

    var html = ENDPOINTS.map(function (ep, i) {
      var n = i + 1;
      var url = endpointUrl(ep);
      return (
        '<article class="endpoint-card" id="ep-' + n + '" data-search="' +
        escapeHtml((ep.name + " " + ep.desc + " " + ep.path).toLowerCase()) + '">' +
        '  <div class="ep-head">' +
        '    <span class="ep-num">' + n + "</span>" +
        '    <h3 class="ep-name">' + escapeHtml(ep.name) + "</h3>" +
        '    <a class="ep-open" href="' + url + '" target="_blank" rel="noopener" title="Open endpoint">Open' +
        '      <svg viewBox="0 0 24 24" width="12" height="12" fill="none" stroke="currentColor" stroke-width="2.4" stroke-linecap="round" stroke-linejoin="round" aria-hidden="true"><path d="M7 17L17 7"/><path d="M8 7h9v9"/></svg>' +
        "    </a>" +
        "  </div>" +
        '  <p class="ep-desc">' + escapeHtml(ep.desc) + "</p>" +
        '  <div class="ep-url">' +
        '    <code title="' + escapeHtml(url) + '">' + escapeHtml(url) + "</code>" +
        '    <button class="icon-btn" data-copy="' + escapeHtml(url) + '" aria-label="Copy endpoint URL">' +
        '      <svg viewBox="0 0 24 24" width="13" height="13" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round" aria-hidden="true"><rect x="9" y="9" width="13" height="13" rx="2"/><path d="M5 15H4a2 2 0 0 1-2-2V4a2 2 0 0 1 2-2h9a2 2 0 0 1 2 2v1"/></svg>' +
        "    </button>" +
        "  </div>" +
        "</article>"
      );
    }).join("");

    grid.innerHTML = html;
  }

  /* ------------------------------------------------------------------
   * Endpoint filter
   * ------------------------------------------------------------------ */
  function initFilter() {
    var input = $("#endpointFilter");
    var clearBtn = $("#filterClear");
    var countEl = $("#filterCount");
    var emptyEl = $("#endpointEmpty");
    var grid = $("#endpointGrid");
    if (!input || !grid) return;

    function apply() {
      var q = input.value.trim().toLowerCase();
      var visible = 0;
      $all(".endpoint-card", grid).forEach(function (card) {
        var match = !q || card.getAttribute("data-search").indexOf(q) !== -1;
        card.style.display = match ? "" : "none";
        if (match) visible++;
      });
      if (countEl) {
        countEl.textContent = q
          ? "Showing " + visible + " of " + ENDPOINTS.length + " endpoints"
          : "Showing all " + ENDPOINTS.length + " endpoints";
      }
      if (emptyEl) emptyEl.hidden = visible !== 0;
    }

    input.addEventListener("input", apply);
    if (clearBtn) {
      clearBtn.addEventListener("click", function () {
        input.value = "";
        apply();
        input.focus();
      });
    }
    apply();
  }

  /* ------------------------------------------------------------------
   * Render JSON examples
   * ------------------------------------------------------------------ */
  function renderJsonExamples() {
    var a = $("#jsonA code");
    var b = $("#jsonB code");
    if (a) a.innerHTML = highlightJson(JSON_FORMAT_A);
    if (b) b.innerHTML = highlightJson(JSON_FORMAT_B);
  }

  /* ------------------------------------------------------------------
   * Global copy handling (event delegation)
   * ------------------------------------------------------------------ */
  document.addEventListener("click", function (e) {
    var copyBtn = e.target.closest ? e.target.closest("[data-copy]") : null;
    if (copyBtn) {
      var value = copyBtn.getAttribute("data-copy");
      var targetId = copyBtn.getAttribute("data-copy-target");
      if (!value && targetId) {
        var src = $("#" + targetId);
        value = src ? src.textContent : "";
      }
      copyText(value, function () {
        flashButton(copyBtn);
        toast("Copied to clipboard");
      });
      return;
    }

    var demoAd = e.target.closest ? e.target.closest("[data-demo-ad]") : null;
    if (demoAd) {
      toast("Demo ad placement — Musiqly is not part of this build");
    }
  });

  /* ------------------------------------------------------------------
   * Unbuilt pages -> toast
   * ------------------------------------------------------------------ */
  $all("[data-page]").forEach(function (link) {
    link.addEventListener("click", function (e) {
      e.preventDefault();
      var page = link.getAttribute("data-page");
      toast("<strong>" + escapeHtml(page) + "</strong> isn’t part of this build — this is the API Docs page.");
    });
  });

  /* ------------------------------------------------------------------
   * Announcement dismiss
   * ------------------------------------------------------------------ */
  (function initAnnounce() {
    var bar = $("#announce");
    var close = $("#announceClose");
    if (!bar || !close) return;
    try {
      if (localStorage.getItem("ss99-announce-dismissed") === "1") bar.classList.add("hidden");
    } catch (e) { /* private mode */ }
    close.addEventListener("click", function () {
      bar.classList.add("hidden");
      try { localStorage.setItem("ss99-announce-dismissed", "1"); } catch (e) { /* noop */ }
    });
  })();

  /* ------------------------------------------------------------------
   * Header: mobile nav + scroll shadow
   * ------------------------------------------------------------------ */
  (function initHeader() {
    var header = $("#siteHeader");
    var toggle = $("#navToggle");
    var nav = $("#mainNav");

    window.addEventListener("scroll", function () {
      if (header) header.classList.toggle("scrolled", window.scrollY > 8);
    }, { passive: true });

    if (toggle && nav) {
      toggle.addEventListener("click", function () {
        var open = nav.classList.toggle("open");
        toggle.setAttribute("aria-expanded", open ? "true" : "false");
      });
      nav.addEventListener("click", function (e) {
        if (e.target.closest("a")) {
          nav.classList.remove("open");
          toggle.setAttribute("aria-expanded", "false");
        }
      });
    }
  })();

  /* ------------------------------------------------------------------
   * Sportsbar arrows
   * ------------------------------------------------------------------ */
  (function initSportsbar() {
    var track = $("#sportsbarTrack");
    var left = $("#sbLeft");
    var right = $("#sbRight");
    if (!track || !left || !right) return;

    function update() {
      var max = track.scrollWidth - track.clientWidth;
      left.classList.toggle("visible", track.scrollLeft > 24);
      right.classList.toggle("visible", track.scrollLeft < max - 24);
    }
    left.addEventListener("click", function () { track.scrollBy({ left: -260, behavior: "smooth" }); });
    right.addEventListener("click", function () { track.scrollBy({ left: 260, behavior: "smooth" }); });
    track.addEventListener("scroll", update, { passive: true });
    window.addEventListener("resize", update);
    update();
  })();

  /* ------------------------------------------------------------------
   * Back to top
   * ------------------------------------------------------------------ */
  (function initBackToTop() {
    var btn = $("#backToTop");
    if (!btn) return;
    window.addEventListener("scroll", function () {
      btn.classList.toggle("visible", window.scrollY > 620);
    }, { passive: true });
    btn.addEventListener("click", function () {
      window.scrollTo({ top: 0, behavior: "smooth" });
    });
  })();

  /* ------------------------------------------------------------------
   * Keyboard shortcuts modal
   * ------------------------------------------------------------------ */
  var shortcuts = (function initShortcuts() {
    var overlay = $("#shortcutsModal");
    var openBtn = $("#shortcutsOpen");
    var closeBtn = $("#shortcutsClose");

    function open() {
      if (!overlay) return;
      overlay.classList.add("open");
      overlay.setAttribute("aria-hidden", "false");
      if (closeBtn) closeBtn.focus();
    }
    function close() {
      if (!overlay) return;
      overlay.classList.remove("open");
      overlay.setAttribute("aria-hidden", "true");
      if (openBtn) openBtn.focus();
    }

    if (openBtn) openBtn.addEventListener("click", open);
    if (closeBtn) closeBtn.addEventListener("click", close);
    if (overlay) {
      overlay.addEventListener("click", function (e) {
        if (e.target === overlay) close();
      });
    }
    return { open: open, close: close, isOpen: function () { return overlay && overlay.classList.contains("open"); } };
  })();

  /* ------------------------------------------------------------------
   * Global keyboard handler
   * ------------------------------------------------------------------ */
  document.addEventListener("keydown", function (e) {
    var tag = (e.target.tagName || "").toLowerCase();
    var typing = tag === "input" || tag === "textarea" || tag === "select" || e.target.isContentEditable;

    if (e.key === "Escape") {
      if (shortcuts.isOpen()) { shortcuts.close(); return; }
      var filter = $("#endpointFilter");
      if (filter && filter.value) { filter.value = ""; filter.dispatchEvent(new Event("input")); }
      return;
    }

    if (typing || e.metaKey || e.ctrlKey || e.altKey) return;

    switch (e.key) {
      case "/":
        e.preventDefault();
        var f = $("#endpointFilter");
        if (f) {
          f.focus();
          f.select();
        }
        break;
      case "?":
        e.preventDefault();
        if (shortcuts.isOpen()) shortcuts.close(); else shortcuts.open();
        break;
      case "t":
      case "T":
        window.scrollTo({ top: 0, behavior: "smooth" });
        break;
      case "e":
      case "E":
        smoothScrollTo("#endpoints");
        break;
      case "f":
      case "F":
        smoothScrollTo("#formats");
        break;
      case "c":
      case "C":
        smoothScrollTo("#support");
        break;
      case "p":
      case "P":
        smoothScrollTo("#player");
        break;
    }
  });

  function smoothScrollTo(sel) {
    var el = $(sel);
    if (el) el.scrollIntoView({ behavior: "smooth", block: "start" });
  }

  /* ------------------------------------------------------------------
   * Footer year
   * ------------------------------------------------------------------ */
  (function initYear() {
    var y = $("#year");
    if (y) y.textContent = String(new Date().getFullYear());
  })();

  /* ------------------------------------------------------------------
   * Boot
   * ------------------------------------------------------------------ */
  renderEndpoints();
  initFilter();
  renderJsonExamples();
})();
