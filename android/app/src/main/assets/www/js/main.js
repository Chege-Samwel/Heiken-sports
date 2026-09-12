/* ==========================================================================
   StreamSports99 — minimal chrome JS (vanilla, no deps)
   Keeps TV compat + header + sportsbar scroll. No endpoint docs.
   ========================================================================== */
(function () {
  "use strict";

  /* Polyfills */
  if (!String.prototype.padStart) {
    String.prototype.padStart = function (len, pad) {
      var s = String(this);
      pad = pad !== undefined ? String(pad) : " ";
      while (s.length < len) s = pad + s;
      return s.slice(0, Math.max(len, s.length));
    };
  }
  if (!Element.prototype.closest) {
    Element.prototype.closest = function (sel) {
      var el = this;
      while (el && el.nodeType === 1) {
        if (el.matches && el.matches(sel)) return el;
        el = el.parentElement || el.parentNode;
      }
      return null;
    };
  }

  var UA = navigator.userAgent || "";
  var IS_TV = /\b(tv|leanback|bravia|aft[btmls]|netcast|web0?s|hbbtv|crkey|gdtv)\b|smart\s*tv|android\s+tv|google\s+tv/i.test(UA) ||
              (/(android)/i.test(UA) && !/mobile/i.test(UA) && (navigator.maxTouchPoints || 0) === 0 && window.screen && screen.width >= 960);

  function flexGapSupported() {
    try {
      var d = document.createElement("div");
      d.style.cssText = "display:-webkit-flex;display:flex;gap:8px;position:absolute;visibility:hidden;";
      d.innerHTML = "<div style=\"width:10px;height:1px\"></div><div style=\"width:10px;height:1px\"></div>";
      document.body.appendChild(d);
      var kids = d.children;
      var ok = kids.length === 2 && (kids[1].offsetLeft - kids[0].offsetLeft) > 10;
      document.body.removeChild(d);
      return ok;
    } catch (e) { return true; }
  }
  function cssVarsSupported() {
    try { var d = document.createElement("div"); d.style.color = "var(--ss99-test)"; return d.style.color.indexOf("var(") !== -1; } catch (e) { return true; }
  }
  (function applyCompatClasses() {
    var root = document.documentElement;
    var classes = [];
    if (IS_TV) classes.push("tv");
    if (!flexGapSupported()) classes.push("no-flexgap");
    var gridOK = false;
    try { gridOK = !!(window.CSS && CSS.supports && CSS.supports("display", "grid")); } catch (e) { gridOK = false; }
    if (!gridOK) classes.push("no-grid");
    if (!cssVarsSupported()) classes.push("no-cssvars");
    if (classes.length && root.classList) root.className += (root.className ? " " : "") + classes.join(" ");
    window.SS99_TV = IS_TV;
  })();

  /* D-pad spatial nav — TV only */
  (function initSpatialNav() {
    if (!IS_TV) return;
    var SELECTOR = 'a[href], button:not([disabled]), input:not([type="hidden"]), select, [tabindex="0"]';
    var DIRS = { ArrowUp: "up", ArrowDown: "down", ArrowLeft: "left", ArrowRight: "right" };
    function focusables() {
      var out = []; var els = document.querySelectorAll(SELECTOR);
      for (var i = 0; i < els.length; i++) { var el = els[i]; if (el.offsetParent !== null || el === document.body) out.push(el); }
      return out;
    }
    function center(el) { var r = el.getBoundingClientRect(); return { x: r.left + r.width/2, y: r.top + r.height/2, w: r.width, h: r.height }; }
    function pick(cands, from, dir) {
      var best = null, bestScore = Infinity;
      for (var i = 0; i < cands.length; i++) {
        var el = cands[i]; if (el === from) continue;
        var c = center(el); var dx = c.x - from.x, dy = c.y - from.y, primary, secondary;
        if (dir === "left") { primary = -dx; secondary = Math.abs(dy); }
        else if (dir === "right") { primary = dx; secondary = Math.abs(dy); }
        else if (dir === "up") { primary = -dy; secondary = Math.abs(dx); }
        else { primary = dy; secondary = Math.abs(dx); }
        if (primary < 12) continue;
        var overlap = false;
        if ((dir === "left" || dir === "right") && c.y + c.h/2 >= from.y - from.h/2 && c.y - c.h/2 <= from.y + from.h/2) overlap = true;
        if ((dir === "up" || dir === "down") && c.x + c.w/2 >= from.x - from.w/2 && c.x - c.w/2 <= from.x + from.w/2) overlap = true;
        var score = primary + secondary * (overlap ? 0.4 : 2.2);
        if (score < bestScore) { bestScore = score; best = el; }
      }
      return best;
    }
    document.addEventListener("keydown", function (e) {
      var dir = DIRS[e.key]; if (!dir) return;
      var t = e.target, tag = t && t.tagName ? t.tagName.toLowerCase() : "";
      if (tag === "input") {
        var type = (t.getAttribute("type") || "text").toLowerCase();
        if (type === "range" || type === "url" || type === "text" || type === "search") {
          if (type !== "range" && (dir === "up" || dir === "down")) {} else return;
        }
      }
      if (t && t.classList && (t.classList.contains("player-stage") || t.id === "demoVideo")) return;
      var focused = document.activeElement && document.activeElement !== document.body ? document.activeElement : null;
      if (!focused) {
        var cands0 = focusables(), bestEl = null, bestD = Infinity, mid = { x: window.innerWidth/2, y: window.innerHeight/2 };
        for (var j=0;j<cands0.length;j++) { var cc = center(cands0[j]); var d = Math.abs(cc.x-mid.x)+Math.abs(cc.y-mid.y); if (d<bestD){bestD=d; bestEl=cands0[j];} }
        if (bestEl) { e.preventDefault(); bestEl.focus(); }
        return;
      }
      var target = pick(focusables(), center(focused), dir);
      if (target) { e.preventDefault(); target.focus(); try { target.scrollIntoView(false); } catch(err){ target.scrollIntoView(); } }
    });
  })();

  function $(sel, ctx) { return (ctx || document).querySelector(sel); }
  function $all(sel, ctx) { return Array.prototype.slice.call((ctx || document).querySelectorAll(sel)); }
  function escapeHtml(s){ return String(s).replace(/&/g,"&amp;").replace(/</g,"&lt;").replace(/>/g,"&gt;").replace(/"/g,"&quot;"); }
  var toastTimer = null;
  function toast(msg){
    var el=$("#toast"); if(!el) return;
    el.innerHTML=msg; el.classList.add("show");
    clearTimeout(toastTimer); toastTimer=setTimeout(function(){ el.classList.remove("show"); },2600);
  }
  // expose for player.js
  window.SS99_toast = toast;

  // Unbuilt pages -> toast
  $all("[data-page]").forEach(function (link){
    link.addEventListener("click", function(e){
      e.preventDefault();
      var page = link.getAttribute("data-page");
      toast("<strong>"+escapeHtml(page)+"</strong> isn’t part of this build — channels only.");
    });
  });

  // Header: scroll shadow + mobile nav
  (function initHeader(){
    var header=$("#siteHeader"), toggle=$("#navToggle"), nav=$("#mainNav");
    window.addEventListener("scroll", function(){ if(header) header.classList.toggle("scrolled", window.scrollY>8); }, {passive:true});
    if(toggle&&nav){
      toggle.addEventListener("click", function(){
        var open=nav.classList.toggle("open");
        toggle.setAttribute("aria-expanded", open?"true":"false");
      });
      nav.addEventListener("click", function(e){
        if(e.target.closest("a")){
          nav.classList.remove("open");
          toggle.setAttribute("aria-expanded","false");
        }
      });
    }
  })();

  // Sportsbar arrows — horizontal scroll helper
  (function initSportsbar(){
    var track=$("#sportsbarTrack"), left=$("#sbLeft"), right=$("#sbRight");
    if(!track||!left||!right) return;
    function update(){
      var max=track.scrollWidth - track.clientWidth;
      left.classList.toggle("visible", track.scrollLeft > 24);
      right.classList.toggle("visible", track.scrollLeft < max - 24);
    }
    left.addEventListener("click", function(){ track.scrollLeft-=260; });
    right.addEventListener("click", function(){ track.scrollLeft+=260; });
    track.addEventListener("scroll", update, {passive:true});
    window.addEventListener("resize", update);
    update();
  })();

  // Footer year
  (function initYear(){ var y=$("#year"); if(y) y.textContent=String(new Date().getFullYear()); })();

  // Generic copy handler (if any [data-copy] present — currently none, kept for compat)
  document.addEventListener("click", function(e){
    var copyBtn = e.target.closest ? e.target.closest("[data-copy]") : null;
    if(copyBtn){
      var value=copyBtn.getAttribute("data-copy");
      if(navigator.clipboard && navigator.clipboard.writeText){
        navigator.clipboard.writeText(value).then(function(){ toast("Copied to clipboard"); });
      } else {
        var ta=document.createElement("textarea"); ta.value=value; ta.style.cssText="position:fixed;opacity:0";
        document.body.appendChild(ta); ta.select(); try{document.execCommand("copy");}catch(err){} document.body.removeChild(ta);
        toast("Copied to clipboard");
      }
    }
  });
})();
