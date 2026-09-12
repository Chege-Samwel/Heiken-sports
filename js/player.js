/* ==========================================================================
   StreamSports99 — Stream Player Demo
   Custom controls + buffering strategy for API stream playback.
   HLS via vendored hls.js (MSE) with native HLS/MP4 fallback.
   Added: API channel pull, iframe embed support, click-to-play polish.
   ========================================================================== */
(function () {
  "use strict";

  function $(sel, ctx) { return (ctx || document).querySelector(sel); }
  function $all(sel, ctx) { return Array.prototype.slice.call((ctx || document).querySelectorAll(sel)); }
  function escapeHtml(s) {
    return String(s).replace(/&/g, "&amp;").replace(/</g, "&lt;").replace(/>/g, "&gt;").replace(/"/g, "&quot;");
  }

  /* ------------------------------------------------------------------
   * Elements
   * ------------------------------------------------------------------ */
  var stage = $("#playerStage");
  var video = $("#demoVideo");
  if (!stage || !video) return;

  var poster      = $("#playerPoster");
  var posterBtn   = $("#posterPlay");
  var posterTitle = $("#posterTitle");
  var posterSub   = $("#posterSub");
  var spinner     = $("#playerSpinner");
  var spinLabel   = $("#spinnerLabel");
  var seek        = $("#seekRange");
  var playedEl    = $("#pcPlayed");
  var bufsEl      = $("#pcBufs");
  var thumbEl     = $("#pcThumb");
  var pcProgress  = $("#pcProgress");
  var btnPlay     = $("#btnPlay");
  var iconPlay    = $("#iconPlay");
  var iconPause   = $("#iconPause");
  var btnMute     = $("#btnMute");
  var iconVol     = $("#iconVol");
  var iconMuted   = $("#iconMuted");
  var volRange    = $("#volRange");
  var timeEl      = $("#pcTime");
  var liveBadge   = $("#pcLive");
  var btnGoLive   = $("#btnGoLive");
  var bufPill     = $("#bufferPill");
  var btnGear     = $("#btnSettings");
  var menu        = $("#playerMenu");
  var qualityGroup = $("#qualityGroup");
  var qualityList  = $("#qualityList");
  var speedGroup   = $("#speedGroup");
  var speedList    = $("#speedList");
  var btnStats    = $("#btnStats");
  var statsBox    = $("#playerStats");
  var statsList   = $("#statsList");
  var statsClose  = $("#statsClose");
  var btnPip      = $("#btnPip");
  var btnFs       = $("#btnFs");
  var iconExpand  = $("#iconExpand");
  var iconCompress = $("#iconCompress");
  var engineNote  = $("#engineNote");
  var streamList  = $("#streamList");
  var urlInput    = $("#streamUrl");
  var loadBtn     = $("#loadUrlBtn");
  var unmutePill  = $("#unmutePill");
  var unmuteBtn   = $("#unmuteBtn");

  // New UI elements (may be absent before embed patch — guard all uses)
  var apiList     = $("#apiStreamList");
  var apiStatus   = $("#apiStatus");
  var apiRefresh  = $("#apiRefresh");
  var embedCodeEl = $("#embedCode");
  var copyEmbedBtn= $("#copyEmbedBtn");
  var embedAutoplay = $("#embedAutoplay");
  var embedPreviewBtn = $("#embedPreviewBtn");

  var HlsRef     = typeof Hls !== "undefined" ? Hls : null;
  var MSE_OK     = !!(HlsRef && HlsRef.isSupported && HlsRef.isSupported());
  var NATIVE_HLS = !!(video.canPlayType && video.canPlayType("application/vnd.apple.mpegurl"));

  /* ------------------------------------------------------------------
   * URL query helpers — embed / autoplay / stream params
   * ------------------------------------------------------------------ */
  function qsParam(name) {
    try {
      var sp = new URLSearchParams(window.location.search);
      return sp.get(name);
    } catch (e) { return null; }
  }
  var EMBED_MODE = (function () {
    var v = qsParam("embed");
    return v === "1" || v === "true" || v === "player" || v === "yes" || qsParam("embedMode")==="1";
  })();
  var EMBED_STREAM = qsParam("stream") || qsParam("src") || qsParam("url") || qsParam("channel");
  var QS_AUTOPLAY = qsParam("autoplay");
  var QS_MUTED = qsParam("muted");
  var QS_CHANNEL = qsParam("channel") || qsParam("channel_code");

  // If any iframe param present, we also consider embed-like behaviour for autoplay
  var IS_IFRAMED = (function(){ try { return window.self !== window.top; } catch(e){ return false; } })();

  /* ------------------------------------------------------------------
   * Demo streams (public test feeds) — fallback when API unavailable
   * ------------------------------------------------------------------ */
  var DEMO_STREAMS = [
    { name: "Mux Test Stream",  meta: "VOD · multi-bitrate HLS",     url: "https://test-streams.mux.dev/x36xhzz/x36xhzz.m3u8", kind: "hls", live: false },
    { name: "Tears of Steel",   meta: "VOD · adaptive HLS",          url: "https://demo.unified-streaming.com/k8s/features/stable/video/tears-of-steel/tears-of-steel.ism/.m3u8", kind: "hls", live: false },
    { name: "Big Buck Bunny",   meta: "VOD · MP4 (native)",          url: "https://storage.googleapis.com/gtv-videos-bucket/sample/BigBuckBunny.mp4", kind: "mp4", live: false },
    { name: "Apple LL-HLS",     meta: "LIVE · low-latency HLS",      url: "https://ll-hls-test-apple.akamaized.net/llhls1/multi.m3u8", kind: "hls", live: true },
    { name: "Akamai Live Test", meta: "LIVE · 24/7 HLS",             url: "https://cph-p2p-msl.akamaized.net/hls/live/2000341/test/master.m3u8", kind: "hls", live: true }
  ];

  /* ------------------------------------------------------------------
   * API channels — pulled from cdnlivetv.is at runtime
   * ------------------------------------------------------------------ */
  var API_BASE = "https://api.cdnlivetv.is/api/v1/";
  var API_QUERY = "?user=cdnlivetv&plan=free";
  var API_CHANNELS = []; // {name, meta, url, kind, live, image, channel_code}
  var API_STATUS = "idle"; // idle|loading|ok|empty|error
  var ALL_STREAMS = DEMO_STREAMS.slice(); // merged list (API first, then demo)

  function apiUrl(path) { return API_BASE + path + API_QUERY; }

  function normalizeApiItem(raw) {
    // Handles several shapes:
    //  - channel object: {channel_name, channel_code, image, streams: [{stream_url}]}
    //  - event object with homeTeam/awayTeam + channels[]
    //  - event object with event/eventIMG + channels[]
    //  - flat channel with url/stream_url
    try {
      // If it's an event with channels array, pick its first playable stream
      if (raw && raw.channels && Array.isArray(raw.channels) && raw.channels.length) {
        var ch = raw.channels[0];
        var streamUrl = ch.stream_url || ch.url || ch.link || ch.href || ch.src || "";
        // Some channel entries use image field for playable HLS url (rare) — guard
        if (!streamUrl && ch.image && /\.m3u8/i.test(ch.image)) streamUrl = ch.image;
        if (!streamUrl) {
          // Try nested streams
          if (ch.streams && ch.streams[0]) streamUrl = ch.streams[0].stream_url || ch.streams[0].url || "";
        }
        if (!streamUrl) return null;
        var evName = raw.homeTeam ? (raw.homeTeam + " vs " + raw.awayTeam)
                   : raw.event ? raw.event
                   : (raw.tournament ? raw.tournament : (ch.channel_name || ch.name || "Live event"));
        var meta = raw.tournament ? (raw.tournament + " · LIVE") : (ch.channel_name ? ch.channel_name + " · LIVE" : "LIVE · HLS");
        var kind = /\.m3u8/i.test(streamUrl) ? "hls" : /\.mp4/i.test(streamUrl) ? "mp4" : "hls";
        return { name: evName, meta: meta, url: streamUrl, kind: kind, live: true, image: ch.image || raw.homeTeamIMG || raw.eventIMG || "", channel_code: ch.channel_code || "" };
      }
      // Flat channel
      var name = raw.channel_name || raw.name || raw.title || raw.channel || "Channel";
      var code = raw.channel_code || raw.code || raw.id || "";
      var image = raw.image || raw.logo || raw.img || "";
      var url = raw.stream_url || raw.url || raw.link || raw.href || raw.src || "";
      if (!url && raw.streams && raw.streams[0]) url = raw.streams[0].stream_url || raw.streams[0].url || "";
      if (!url) return null;
      var isHls = /\.m3u8(\?|#|$)/i.test(url);
      var isMp4 = /\.mp4(\?|#|$)/i.test(url);
      var k = isHls ? "hls" : isMp4 ? "mp4" : "hls";
      return { name: name, meta: (code ? code + " · " : "") + (k === "hls" ? "LIVE · HLS" : "LIVE · MP4"), url: url, kind: k, live: true, image: image, channel_code: code };
    } catch (e) { return null; }
  }

  function extractChannelsFromJson(json) {
    var out = [];
    if (!json) return out;
    // Unwrap common envelopes: {data: [...]}, {channels: [...]}, {events: [...]}, {result: [...]}
    var arr = null;
    if (Array.isArray(json)) arr = json;
    else if (Array.isArray(json.data)) arr = json.data;
    else if (Array.isArray(json.channels)) arr = json.channels;
    else if (Array.isArray(json.events)) arr = json.events;
    else if (Array.isArray(json.result)) arr = json.result;
    else if (json.data && Array.isArray(json.data.channels)) arr = json.data.channels;
    else if (json.data && Array.isArray(json.data.events)) arr = json.data.events;
    else {
      // Single object that itself contains channels
      if (json.channels || json.homeTeam || json.event) arr = [json];
      else {
        // Try to find first array value in object
        for (var k in json) if (json.hasOwnProperty(k) && Array.isArray(json[k])) { arr = json[k]; break; }
      }
    }
    if (!arr) return out;
    for (var i = 0; i < arr.length; i++) {
      var n = normalizeApiItem(arr[i]);
      if (n && n.url) out.push(n);
      // If raw item is an event with many channels, also expand all channels not just first
      if (arr[i] && arr[i].channels && arr[i].channels.length > 1) {
        for (var c = 1; c < arr[i].channels.length; c++) {
          var ch2 = arr[i].channels[c];
          var u2 = ch2.stream_url || ch2.url || "";
          if (u2) {
            var evName2 = arr[i].homeTeam ? (arr[i].homeTeam + " vs " + arr[i].awayTeam) : (arr[i].event || ch2.channel_name || "Channel");
            out.push({ name: evName2 + " ("+ (ch2.channel_name||"ch "+(c+1)) +")", meta: (ch2.channel_name||"LIVE") + " · HLS", url: u2, kind: /\.m3u8/i.test(u2)?"hls":"mp4", live: true, image: ch2.image||"", channel_code: ch2.channel_code||"" });
          }
        }
      }
      if (out.length >= 30) break; // cap
    }
    return out;
  }

  function fetchWithTimeout(url, ms) {
    ms = ms || 7000;
    return new Promise(function (resolve, reject) {
      var timer = setTimeout(function () { reject(new Error("timeout")); }, ms);
      fetch(url, { mode: "cors", cache: "no-store" }).then(function (r) {
        clearTimeout(timer);
        if (!r.ok) reject(new Error("http "+r.status));
        else r.json().then(resolve).catch(reject);
      }).catch(function (e) { clearTimeout(timer); reject(e); });
    });
  }

  function fetchApiChannels() {
    if (!apiList) {
      // If new UI not present (old index.html), still fetch to populate streamList merge
      apiStatus = null;
    }
    API_STATUS = "loading";
    if (apiStatus) apiStatus.textContent = "Loading channels from API…";
    if (apiList) apiList.innerHTML = '<div class="api-loading"><span class="spin-ring" style="width:18px;height:18px;border-width:2px;display:inline-block;vertical-align:middle"></span> Fetching cdnlivetv.is…</div>';
    // Try channels first, then a more general sports events endpoint
    var endpoints = [
      apiUrl("channels/"),
      apiUrl("events/sports/"),
      apiUrl("events/sports/soccer/")
    ];
    var attempt = 0;
    function tryNext(lastErr) {
      if (attempt >= endpoints.length) {
        API_STATUS = "error";
        var msg = "API unreachable — showing demo streams. Paste any stream URL from the endpoints above.";
        if (apiStatus) apiStatus.textContent = msg;
        if (apiList) apiList.innerHTML = '<div class="api-empty">Couldn’t reach the API (' + escapeHtml(String(lastErr||"network")) + '). Demo streams are available below.</div>';
        // Keep demo streams
        ALL_STREAMS = DEMO_STREAMS.slice();
        renderStreamList();
        renderApiList(); // will show empty state
        return;
      }
      var url = endpoints[attempt++];
      if (apiStatus) apiStatus.textContent = "Loading from " + url.replace(API_BASE,"") + "…";
      fetchWithTimeout(url, 7000).then(function (json) {
        var channels = extractChannelsFromJson(json);
        if (!channels.length) {
          // Try next endpoint
          tryNext("empty");
          return;
        }
        API_CHANNELS = channels;
        API_STATUS = "ok";
        if (apiStatus) apiStatus.textContent = "Loaded " + channels.length + " live channels from API";
        // Merge: API channels first, then demo (dedup by url)
        var seen = {};
        var merged = [];
        for (var i=0;i<channels.length;i++){ var u=channels[i].url; if(!seen[u]){seen[u]=1; merged.push(channels[i]);}}
        for (var j=0;j<DEMO_STREAMS.length;j++){ var du=DEMO_STREAMS[j].url; if(!seen[du]){ seen[du]=1; merged.push(DEMO_STREAMS[j]);}}
        ALL_STREAMS = merged;
        renderStreamList();
        renderApiList();
        // If user passed ?channel= code, auto-select that channel
        if (QS_CHANNEL) {
          for (var k=0;k<API_CHANNELS.length;k++){
            if (API_CHANNELS[k].channel_code && API_CHANNELS[k].channel_code.toLowerCase()===QS_CHANNEL.toLowerCase()) {
              selectStreamByUrl(API_CHANNELS[k].url, API_CHANNELS[k].kind, API_CHANNELS[k].name);
              break;
            }
          }
        }
      }).catch(function (err) {
        tryNext(err && err.message ? err.message : err);
      });
    }
    tryNext();
  }

  function renderApiList() {
    if (!apiList) return;
    if (!API_CHANNELS.length) {
      if (API_STATUS === "loading") {
        apiList.innerHTML = '<div class="api-loading">Loading…</div>';
      } else if (API_STATUS === "error") {
        // already set above
      } else {
        apiList.innerHTML = '<div class="api-empty">No API channels yet — try <button class="link-btn" id="apiRetryInline">retry</button> or use demo streams.</div>';
        var retryInline = $("#apiRetryInline");
        if (retryInline) retryInline.addEventListener("click", fetchApiChannels);
      }
      return;
    }
    var html = "";
    for (var i = 0; i < API_CHANNELS.length; i++) {
      var c = API_CHANNELS[i];
      var idx = -1;
      // find index in ALL_STREAMS
      for (var j=0;j<ALL_STREAMS.length;j++) if (ALL_STREAMS[j].url===c.url) { idx=j; break; }
      html += '<button class="stream-item api-item' + (ALL_STREAMS[idx] && S.url===ALL_STREAMS[idx].url ? ' active' : '') + '" data-api-i="'+i+'" data-all-i="'+idx+'" title="'+escapeHtml(c.url)+'">'
            + '<span class="si-main"><strong>' + escapeHtml(c.name) + '</strong><small>' + escapeHtml(c.meta) + '</small></span>'
            + '<span class="si-badge si-live">LIVE</span>'
            + '</button>';
    }
    apiList.innerHTML = html;
  }

  var PROFILES = {
    smooth:   { label: "Smooth · 120s buffer", maxBufferLength: 120, maxMaxBufferLength: 300, backBufferLength: 90 },
    balanced: { label: "Balanced · 60s buffer", maxBufferLength: 60,  maxMaxBufferLength: 180, backBufferLength: 60 },
    saver:    { label: "Data saver · 24s buffer", maxBufferLength: 24, maxMaxBufferLength: 60, backBufferLength: 30 }
  };
  var profile = "smooth";
  var SPEEDS = [0.5, 0.75, 1, 1.25, 1.5, 2];

  /* ------------------------------------------------------------------
   * State
   * ------------------------------------------------------------------ */
  var S = {
    hls: null, engine: "—", url: null, kind: null, name: "—",
    isLive: false, netRetries: 0, mediaRetries: 0,
    lastLevel: -1, seeking: false,
    hideTimer: null, tickTimer: null, lastTime: -1, stallTicks: 0, stalls: 0
  };

  /* ------------------------------------------------------------------
   * Small helpers
   * ------------------------------------------------------------------ */
  var toastTimer = null;
  function toastP(msg) {
    var t = $("#toast");
    if (!t) return;
    t.textContent = msg;
    t.classList.add("show");
    clearTimeout(toastTimer);
    toastTimer = setTimeout(function () { t.classList.remove("show"); }, 2400);
  }

  function fmtTime(t) {
    if (!isFinite(t) || t < 0) return "0:00";
    t = Math.floor(t);
    var h = Math.floor(t / 3600);
    var m = Math.floor((t % 3600) / 60);
    var s = t % 60;
    var ss = String(s).padStart(2, "0");
    return h ? h + ":" + String(m).padStart(2, "0") + ":" + ss : m + ":" + ss;
  }

  function duration() { return isFinite(video.duration) ? video.duration : 0; }

  function bufferAhead() {
    var b = video.buffered, t = video.currentTime;
    for (var i = 0; i < b.length; i++) {
      if (b.start(i) <= t && b.end(i) >= t) return b.end(i) - t;
    }
    return 0;
  }

  function backBuffer() {
    var b = video.buffered, t = video.currentTime;
    for (var i = 0; i < b.length; i++) {
      if (b.start(i) <= t && b.end(i) >= t) return t - b.start(i);
    }
    return 0;
  }

  function liveEdge() {
    if (S.hls && S.hls.liveSyncPosition != null) return S.hls.liveSyncPosition;
    var sk = video.seekable;
    if (sk && sk.length) return sk.end(sk.length - 1);
    return video.duration || 0;
  }

  function behindLive() {
    if (!S.isLive) return 0;
    return Math.max(0, liveEdge() - video.currentTime);
  }

  function showSpinner(label) {
    spinLabel.textContent = label || "Buffering…";
    spinner.hidden = false;
  }
  function hideSpinner() { spinner.hidden = true; }

  function setState(st) {
    stage.setAttribute("data-state", st);
    poster.hidden = !(st === "idle" || st === "error");
  }

  function updateEngineNote() {
    var engine = S.engine !== "—"
      ? S.engine
      : (MSE_OK ? "hls.js ready" : NATIVE_HLS ? "native HLS" : "native video");
    engineNote.innerHTML =
      '<span><strong>Engine:</strong> ' + escapeHtml(engine) + "</span>" +
      '<span><strong>Buffer target:</strong> ' + PROFILES[profile].maxBufferLength + "s</span>" +
      '<span><strong>Quality:</strong> adaptive</span>';
  }

  /* ------------------------------------------------------------------
   * Embed helpers
   * ------------------------------------------------------------------ */
  function applyEmbedMode() {
    if (!EMBED_MODE && !IS_IFRAMED) return;
    // In embed mode we add a class so CSS can hide chrome
    if (EMBED_MODE) document.documentElement.classList.add("embed-mode");
    if (IS_IFRAMED) document.documentElement.classList.add("is-iframed");
    // Try to hide surrounding UI when embed param set
    if (EMBED_MODE) {
      // Hide announce, header, sportsbar, hero etc. — CSS handles most,
      // but ensure player is scrolled into view
      try {
        var el = $("#player");
        if (el) setTimeout(function(){ el.scrollIntoView({block:"start"}); }, 50);
      } catch(e){}
    }
  }

  function buildEmbedUrl(streamUrl) {
    var base = window.location.origin + window.location.pathname;
    var u = streamUrl || S.url || (ALL_STREAMS[0] && ALL_STREAMS[0].url) || "";
    var params = "embed=1&stream=" + encodeURIComponent(u);
    if (embedAutoplay && embedAutoplay.checked) params += "&autoplay=1";
    else if (QS_AUTOPLAY==="1" || IS_IFRAMED) params += "&autoplay=1";
    return base + "?" + params + "#player";
  }

  function buildEmbedCode() {
    var src = buildEmbedUrl(S.url);
    var title = escapeHtml(S.name || "StreamSports99 Player");
    return '<iframe src="' + escapeHtml(src) + '" width="960" height="540" frameborder="0" allowfullscreen allow="autoplay; fullscreen; picture-in-picture" title="' + title + '" loading="lazy" referrerpolicy="no-referrer-when-downgrade"></iframe>';
  }

  function updateEmbedCode() {
    if (!embedCodeEl) return;
    var code = buildEmbedCode();
    // textarea should show decoded entities for easy copy
    embedCodeEl.value = code.replace(/&amp;/g, "&");
    // Also update a live preview link if present
    if (embedPreviewBtn) {
      embedPreviewBtn.setAttribute("data-embed-src", buildEmbedUrl(S.url));
    }
  }

  function copyEmbedCode() {
    if (!embedCodeEl) return;
    var val = embedCodeEl.value;
    if (navigator.clipboard && navigator.clipboard.writeText) {
      navigator.clipboard.writeText(val).then(function(){ toastP("Embed code copied"); }).catch(function(){ fallbackCopy(val); });
    } else fallbackCopy(val);
  }
  function fallbackCopy(val){
    try {
      embedCodeEl.focus(); embedCodeEl.select();
      document.execCommand("copy");
      toastP("Embed code copied");
    } catch(e){ toastP("Copy failed — select and copy manually"); }
  }

  /* PostMessage API for parent pages to control the iframe */
  window.addEventListener("message", function (e) {
    var d = e.data;
    if (!d || typeof d !== "object") return;
    if (d.type === "ss99:load" && d.url) {
      var k = /\.m3u8/i.test(d.url) ? "hls" : /\.mp4/i.test(d.url) ? "mp4" : "hls";
      var n = d.name || "Embedded stream";
      loadStream(d.url, k, n);
      if (d.autoplay !== false) playWithFallback();
    } else if (d.type === "ss99:play") {
      playWithFallback();
    } else if (d.type === "ss99:pause") {
      video.pause();
    } else if (d.type === "ss99:seek" && typeof d.time === "number") {
      video.currentTime = d.time;
    } else if (d.type === "ss99:volume" && typeof d.volume === "number") {
      setVolume(d.volume);
    }
  });

  /* ------------------------------------------------------------------
   * Engine lifecycle
   * ------------------------------------------------------------------ */
  function destroyEngine() {
    if (S.hls) {
      try { S.hls.destroy(); } catch (e) { /* noop */ }
      S.hls = null;
    }
    video.removeAttribute("src");
    try { video.load(); } catch (e) { /* noop */ }
    S.engine = "—";
    S.isLive = false;
  }

  function loadStream(url, kind, name) {
    S.url = url;
    S.kind = kind;
    S.name = name || url;
    S.netRetries = 0;
    S.mediaRetries = 0;
    S.isLive = false;
    S.lastLevel = -1;

    destroyEngine();
    setState("loading");
    poster.hidden = true;
    showSpinner("Loading stream…");
    closeMenu();
    updateEmbedCode();
    // Reflect in URL without reloading (helps sharing/embed)
    try {
      var sp = new URLSearchParams(window.location.search);
      // Only update stream param if not in embed mode to avoid history spam? Keep it.
      if (url && !EMBED_MODE) {
        // keep other params, just set stream for deep-linking
        // Don't pushState too aggressively — replaceState
        sp.set("stream", url);
        var newQs = sp.toString() ? "?" + sp.toString() : "";
        history.replaceState(null, "", window.location.pathname + newQs + window.location.hash);
      }
    } catch(e){}

    // Notify parent if iframed
    try {
      if (IS_IFRAMED) parent.postMessage({type:"ss99:loading", url:url, name:name}, "*");
    } catch(e){}

    if (kind === "hls") {
      if (MSE_OK) {
        attachHls(url);
      } else if (NATIVE_HLS) {
        attachNative(url, "native HLS");
        playWithFallback();
      } else {
        fatal("This browser cannot play HLS streams. Try Chrome, Edge, Firefox or Safari.");
        return;
      }
    } else {
      attachNative(url, "native video");
      playWithFallback();
    }
  }

  function selectStreamByUrl(url, kind, name){
    // highlight matching item in both lists, then load
    $all(".stream-item").forEach(function(b){ b.classList.remove("active"); });
    // try to find matching all-index
    for (var i=0;i<ALL_STREAMS.length;i++) if(ALL_STREAMS[i].url===url){ 
      var el = streamList.querySelector('[data-i="'+i+'"]');
      if(el) el.classList.add("active");
      var apiIdx = -1;
      for(var j=0;j<API_CHANNELS.length;j++) if(API_CHANNELS[j].url===url){ apiIdx=j; break; }
      if(apiIdx>=0){
        var apiEl = apiList && apiList.querySelector('[data-api-i="'+apiIdx+'"]');
        if(apiEl) apiEl.classList.add("active");
      }
      break;
    }
    loadStream(url, kind || "hls", name);
  }

  function attachHls(url) {
    var p = PROFILES[profile];
    var cfg = {
      enableWorker: true,
      lowLatencyMode: false,
      maxBufferLength: p.maxBufferLength,
      maxMaxBufferLength: p.maxMaxBufferLength,
      maxBufferSize: 120 * 1000 * 1000,
      backBufferLength: p.backBufferLength,
      liveSyncDurationCount: 3,
      liveDurationInfinity: true,
      startLevel: -1,
      abrEwmaDefaultEstimate: 1500000,
      capLevelToPlayerSize: true,
      startFragPrefetch: true,
      fragLoadingMaxRetry: 8,
      fragLoadingRetryDelay: 800,
      fragLoadingMaxRetryTimeout: 16000,
      manifestLoadingMaxRetry: 4,
      manifestLoadingRetryDelay: 800,
      manifestLoadingMaxRetryTimeout: 16000,
      levelLoadingMaxRetry: 4
    };

    var hls = new HlsRef(cfg);
    S.hls = hls;
    S.engine = "hls.js " + (HlsRef.version || "");

    hls.on(HlsRef.Events.MANIFEST_PARSED, function () {
      buildQualityMenu();
      syncLiveUI();
      playWithFallback();
    });
    hls.on(HlsRef.Events.LEVEL_LOADED, function (e, d) {
      if (d && d.details && d.details.live) S.isLive = true;
      syncLiveUI();
    });
    hls.on(HlsRef.Events.LEVEL_SWITCHED, function (e, d) {
      S.lastLevel = d.level;
      if (!statsBox.hidden) renderStats();
    });
    hls.on(HlsRef.Events.ERROR, onHlsError);

    hls.loadSource(url);
    hls.attachMedia(video);
    updateEngineNote();
  }

  function attachNative(url, engineLabel) {
    S.engine = engineLabel;
    video.src = url;
    updateEngineNote();
  }

  function onHlsError(e, data) {
    if (!data || !data.fatal) return;
    var d = data.details || "";

    if (data.type === HlsRef.ErrorTypes.NETWORK_ERROR) {
      if (S.netRetries < 5) {
        S.netRetries++;
        var wait = Math.min(8000, 600 * Math.pow(2, S.netRetries));
        showSpinner("Reconnecting… attempt " + S.netRetries + "/5");
        setTimeout(function () {
          if (S.hls) S.hls.startLoad();
        }, wait);
      } else {
        fatal("Network error — stream unavailable (" + d + ").");
      }
    } else if (data.type === HlsRef.ErrorTypes.MEDIA_ERROR) {
      if (S.mediaRetries < 2) {
        S.mediaRetries++;
        showSpinner("Recovering…");
        S.hls.recoverMediaError();
      } else if (S.mediaRetries < 3) {
        S.mediaRetries++;
        showSpinner("Recovering…");
        S.hls.swapAudioCodec();
        S.hls.recoverMediaError();
      } else {
        fatal("Media error — cannot decode stream (" + d + ").");
      }
    } else {
      fatal("Playback error: " + d);
    }
  }

  function fatal(msg) {
    destroyEngine();
    hideSpinner();
    setState("error");
    posterTitle.textContent = "Playback error";
    posterSub.textContent = msg;
    try { if(IS_IFRAMED) parent.postMessage({type:"ss99:error", message:msg}, "*"); } catch(e){}
  }

  function playWithFallback() {
    var p = video.play();
    if (p && p.catch) {
      p.catch(function () {
        video.muted = true;
        syncVolUI();
        var p2 = video.play();
        if (p2 && p2.then) {
          p2.then(function () {
            if (video.muted) unmutePill.hidden = false;
          }).catch(function () { setState("paused"); });
        }
      });
    }
  }

  /* ------------------------------------------------------------------
   * Video element events
   * ------------------------------------------------------------------ */
  video.addEventListener("loadedmetadata", function () {
    if (!isFinite(video.duration)) S.isLive = true;
    syncLiveUI();
  });
  video.addEventListener("playing", function () {
    setState("playing");
    hideSpinner();
    startTicker();
    showControls();
    try { if(IS_IFRAMED) parent.postMessage({type:"ss99:playing", url:S.url}, "*"); } catch(e){}
  });
  video.addEventListener("canplay", hideSpinner);
  video.addEventListener("waiting", function () { showSpinner("Buffering…"); });
  video.addEventListener("pause", function () {
    setState("paused");
    hideSpinner();
    stage.classList.remove("controls-hidden");
    try { if(IS_IFRAMED) parent.postMessage({type:"ss99:paused", url:S.url}, "*"); } catch(e){}
  });
  video.addEventListener("ended", function () { setState("paused"); });
  video.addEventListener("play", syncPlayIcon);
  video.addEventListener("pause", syncPlayIcon);
  video.addEventListener("volumechange", syncVolUI);
  video.addEventListener("timeupdate", onTimeUpdate);
  video.addEventListener("progress", renderBufs);
  video.addEventListener("error", function () {
    if (!S.url || !video.error) return;
    if (S.kind !== "hls" || !MSE_OK) fatal("Could not load the stream (network or unsupported format).");
  });

  function syncPlayIcon() {
    iconPlay.style.display = video.paused ? "" : "none";
    iconPause.style.display = video.paused ? "none" : "";
    btnPlay.setAttribute("aria-label", video.paused ? "Play" : "Pause");
  }

  function onTimeUpdate() {
    if (S.isLive) {
      btnGoLive.hidden = behindLive() <= 8;
      btnGoLive.classList.toggle("behind", behindLive() > 8);
      return;
    }
    if (S.seeking) return;
    var d = duration();
    var pct = d ? (video.currentTime / d) * 100 : 0;
    seek.value = String(Math.round((d ? video.currentTime / d : 0) * 1000));
    playedEl.style.width = pct + "%";
    thumbEl.style.left = pct + "%";
    timeEl.textContent = fmtTime(video.currentTime) + " / " + fmtTime(d);
  }

  function renderBufs() {
    var d = duration();
    if (!d) { bufsEl.innerHTML = ""; return; }
    var html = "";
    var b = video.buffered;
    for (var i = 0; i < b.length; i++) {
      var l = (b.start(i) / d) * 100;
      var w = Math.max(0, ((b.end(i) - b.start(i)) / d) * 100);
      html += '<span class="pc-buf-range" style="left:' + l.toFixed(2) + "%;width:" + w.toFixed(2) + '%"></span>';
    }
    bufsEl.innerHTML = html;
  }

  function syncLiveUI() {
    var live = S.isLive;
    liveBadge.hidden = !live;
    pcProgress.style.visibility = live ? "hidden" : "visible";
    timeEl.style.display = live ? "none" : "";
    speedGroup.style.display = live ? "none" : "";
    btnGoLive.hidden = !live || behindLive() <= 8;
    if (live) btnGoLive.classList.toggle("behind", behindLive() > 8);
  }

  /* ------------------------------------------------------------------
   * Ticker: buffer pill, stall watchdog, stats refresh (500ms)
   * ------------------------------------------------------------------ */
  function startTicker() {
    if (S.tickTimer) return;
    S.tickTimer = setInterval(function () {
      if (!video.paused && !video.ended) {
        if (Math.abs(video.currentTime - S.lastTime) < 0.01) {
          S.stallTicks++;
          if (S.stallTicks >= 4) {
            handleStall();
            S.stallTicks = 0;
          }
        } else {
          S.stallTicks = 0;
        }
        S.lastTime = video.currentTime;
      }
      updateBufPill();
      if (!statsBox.hidden) renderStats();
    }, 500);
  }

  function handleStall() {
    S.stalls++;
    showSpinner("Recovering…");
    if (S.hls) {
      if (S.isLive) {
        var target = S.hls.liveSyncPosition;
        if (target != null) video.currentTime = target;
      } else {
        video.currentTime = video.currentTime + 0.1;
      }
      S.hls.startLoad();
    } else if (S.isLive) {
      goLive();
    } else {
      var t = video.currentTime;
      try { video.load(); video.currentTime = t; playWithFallback(); } catch (e) { /* noop */ }
    }
  }

  function updateBufPill() {
    if (!S.url || video.readyState === 0) {
      bufPill.textContent = "—";
      bufPill.className = "pc-bufferpill";
      bufPill.title = "Forward buffer";
      return;
    }
    var b = bufferAhead();
    bufPill.textContent = b >= 90 ? (b / 60).toFixed(1) + "m" : Math.round(b) + "s";
    bufPill.className = "pc-bufferpill " + (b >= 20 ? "good" : b >= 5 ? "warn" : "low");
    bufPill.title = "Forward buffer: " + b.toFixed(1) + "s";
  }

  /* ------------------------------------------------------------------
   * Controls: show / hide
   * ------------------------------------------------------------------ */
  function showControls() {
    stage.classList.remove("controls-hidden");
    scheduleHide();
  }
  function scheduleHide() {
    if (window.SS99_TV) return;
    clearTimeout(S.hideTimer);
    S.hideTimer = setTimeout(function () {
      if (!video.paused && !video.ended && menu.hidden) {
        stage.classList.add("controls-hidden");
      }
    }, 2800);
  }
  stage.addEventListener("mousemove", showControls);
  stage.addEventListener("touchstart", showControls, { passive: true });
  stage.addEventListener("mouseleave", function () {
    if (window.SS99_TV) return;
    if (!video.paused && menu.hidden) stage.classList.add("controls-hidden");
  });

  /* ------------------------------------------------------------------
   * Controls: buttons
   * ------------------------------------------------------------------ */
  function togglePlay() {
    if (video.paused) {
      if (!S.url) {
        // click-to-play: load first available stream (API or demo)
        if (ALL_STREAMS && ALL_STREAMS[0]) selectStream(0);
        else selectStream(0);
        return;
      }
      playWithFallback();
    } else {
      video.pause();
    }
  }

  function setVolume(v) {
    video.volume = Math.min(1, Math.max(0, v));
    if (v > 0) video.muted = false;
    try { localStorage.setItem("ss99-vol", String(video.volume)); } catch (e) { /* noop */ }
    syncVolUI();
  }

  function syncVolUI() {
    volRange.value = String(Math.round((video.muted ? 0 : video.volume) * 100));
    var silent = video.muted || video.volume === 0;
    iconVol.style.display = silent ? "none" : "";
    iconMuted.style.display = silent ? "" : "none";
    btnMute.setAttribute("aria-label", silent ? "Unmute" : "Mute");
    if (!silent) unmutePill.hidden = true;
  }

  function goLive() {
    var target = null;
    if (S.hls && S.hls.liveSyncPosition != null) target = S.hls.liveSyncPosition;
    var sk = video.seekable;
    if (target == null && sk && sk.length) target = sk.end(sk.length - 1) - 1.5;
    if (target != null) video.currentTime = Math.max(0, target);
    btnGoLive.hidden = true;
    playWithFallback();
  }

  function toggleFs() {
    var fsEl = document.fullscreenElement || document.webkitFullscreenElement;
    if (fsEl) {
      (document.exitFullscreen || document.webkitExitFullscreen).call(document);
    } else if (stage.requestFullscreen) {
      stage.requestFullscreen().catch(function () {});
    } else if (stage.webkitRequestFullscreen) {
      stage.webkitRequestFullscreen();
    }
  }

  function syncFsIcon() {
    var fs = !!(document.fullscreenElement || document.webkitFullscreenElement);
    iconExpand.style.display = fs ? "none" : "";
    iconCompress.style.display = fs ? "" : "none";
  }

  function togglePip() {
    if (document.pictureInPictureElement) {
      if (document.exitPictureInPicture) document.exitPictureInPicture().catch(function () {});
    } else if (video.requestPictureInPicture && document.pictureInPictureEnabled) {
      video.requestPictureInPicture().catch(function () { toastP("Picture-in-picture unavailable for this stream"); });
    } else {
      toastP("Picture-in-picture not supported here");
    }
  }

  btnPlay.addEventListener("click", togglePlay);
  btnMute.addEventListener("click", function () { video.muted = !video.muted; syncVolUI(); });
  volRange.addEventListener("input", function () { setVolume(volRange.value / 100); });
  btnGoLive.addEventListener("click", goLive);
  btnPip.addEventListener("click", togglePip);
  btnFs.addEventListener("click", toggleFs);
  ["fullscreenchange", "webkitfullscreenchange"].forEach(function (ev) {
    document.addEventListener(ev, syncFsIcon);
  });

  unmuteBtn.addEventListener("click", function () {
    video.muted = false;
    if (video.volume === 0) setVolume(0.8);
    syncVolUI();
    unmutePill.hidden = true;
  });

  /* Seek bar (VOD) */
  seek.addEventListener("input", function () {
    S.seeking = true;
    var d = duration();
    var pct = seek.value / 1000;
    playedEl.style.width = pct * 100 + "%";
    thumbEl.style.left = pct * 100 + "%";
    if (d) timeEl.textContent = fmtTime(pct * d) + " / " + fmtTime(d);
  });
  seek.addEventListener("change", function () {
    var d = duration();
    if (d) video.currentTime = (seek.value / 1000) * d;
    S.seeking = false;
  });

  /* Click surface: toggle play (ignore clicks on UI) — plus poster click-to-play */
  // Poster is always click-to-play: clicking poster or its button starts playback
  function posterClickHandler(e) {
    e.preventDefault();
    e.stopPropagation();
    if (stage.getAttribute("data-state") === "error" && S.url) {
      posterTitle.textContent = "Stream Player";
      posterSub.textContent = "Pick a stream or paste an API stream URL to start";
      loadStream(S.url, S.kind, S.name);
    } else if (!S.url) {
      selectStream(0);
    } else if (video.paused) {
      playWithFallback();
    } else {
      // if already playing but poster still visible (idle), load first
      selectStream(0);
    }
  }
  poster.addEventListener("click", posterClickHandler);
  posterBtn.addEventListener("click", posterClickHandler);
  // Make poster keyboard accessible
  poster.setAttribute("tabindex", "0");
  poster.addEventListener("keydown", function(e){
    if(e.key==="Enter"||e.key===" "){ e.preventDefault(); posterClickHandler(e); }
  });

  stage.addEventListener("click", function (e) {
    if (e.target.closest(".player-controls, .player-menu, .player-stats, .player-poster, .player-unmute")) return;
    togglePlay();
  });
  stage.addEventListener("dblclick", function (e) {
    if (e.target.closest(".player-controls, .player-menu, .player-stats, .player-poster, .player-unmute")) return;
    toggleFs();
  });

  /* ------------------------------------------------------------------
   * Settings menu (quality + speed)
   * ------------------------------------------------------------------ */
  function closeMenu() { menu.hidden = true; }

  function buildQualityMenu() {
    if (!S.hls || !S.hls.levels || !S.hls.levels.length) {
      qualityGroup.style.display = "none";
      return;
    }
    qualityGroup.style.display = "";
    var levels = S.hls.levels;
    var html = '<button class="pm-opt' + (S.hls.autoLevelEnabled ? " active" : "") + '" data-level="-1">' +
      '<span>Auto (adaptive)</span><span class="pm-check">' + (S.hls.autoLevelEnabled ? "✓" : "") + "</span></button>";
    for (var i = 0; i < levels.length; i++) {
      var l = levels[i];
      var h = l.height || (l.attrs && l.attrs.RESOLUTION ? l.attrs.RESOLUTION.height : 0);
      var label = h ? h + "p" : "Level " + (i + 1);
      if (l.bitrate) label += " · " + (l.bitrate / 1e6).toFixed(1) + " Mbps";
      var active = !S.hls.autoLevelEnabled && S.hls.currentLevel === i;
      html += '<button class="pm-opt' + (active ? " active" : "") + '" data-level="' + i + '">' +
        "<span>" + escapeHtml(label) + '</span><span class="pm-check">' + (active ? "✓" : "") + "</span></button>";
    }
    qualityList.innerHTML = html;
  }

  function buildSpeedMenu() {
    var html = "";
    for (var i = 0; i < SPEEDS.length; i++) {
      var active = Math.abs(video.playbackRate - SPEEDS[i]) < 0.01;
      html += '<button class="pm-opt' + (active ? " active" : "") + '" data-speed="' + SPEEDS[i] + '">' +
        "<span>" + (SPEEDS[i] === 1 ? "Normal" : SPEEDS[i] + "×") + '</span><span class="pm-check">' + (active ? "✓" : "") + "</span></button>";
    }
    speedList.innerHTML = html;
  }

  qualityList.addEventListener("click", function (e) {
    var btn = e.target.closest("[data-level]");
    if (!btn || !S.hls) return;
    var level = parseInt(btn.getAttribute("data-level"), 10);
    S.hls.currentLevel = level;
    buildQualityMenu();
    toastP(level === -1 ? "Quality: Auto (adaptive)" : "Quality locked: level " + level);
  });

  speedList.addEventListener("click", function (e) {
    var btn = e.target.closest("[data-speed]");
    if (!btn) return;
    video.playbackRate = parseFloat(btn.getAttribute("data-speed"));
    buildSpeedMenu();
  });

  btnGear.addEventListener("click", function (e) {
    e.stopPropagation();
    menu.hidden = !menu.hidden;
    if (!menu.hidden) {
      buildQualityMenu();
      buildSpeedMenu();
      showControls();
    }
  });

  document.addEventListener("click", function (e) {
    if (!menu.hidden && !menu.contains(e.target) && !btnGear.contains(e.target)) closeMenu();
  });

  /* ------------------------------------------------------------------
   * Stats overlay
   * ------------------------------------------------------------------ */
  function toggleStats() {
    statsBox.hidden = !statsBox.hidden;
    if (!statsBox.hidden) renderStats();
  }

  function renderStats() {
    if (statsBox.hidden) return;
    var q = (typeof video.getVideoPlaybackQuality === "function" && video.getVideoPlaybackQuality()) || {};
    var lvl = null;
    if (S.hls && S.hls.levels && S.lastLevel >= 0 && S.hls.levels[S.lastLevel]) lvl = S.hls.levels[S.lastLevel];
    var state = video.error ? "Error" : video.paused ? "Paused" : video.readyState < 3 ? "Buffering" : "Playing";

    var rows = [
      ["State", state],
      ["Stream", S.name !== "—" && S.name.length < 34 ? S.name : (S.url ? "custom" : "—")],
      ["Engine", S.engine],
      ["Resolution", video.videoWidth ? video.videoWidth + "×" + video.videoHeight : "—"],
      ["Bitrate", lvl && lvl.bitrate ? (lvl.bitrate / 1e6).toFixed(2) + " Mbps" : "—"],
      ["Buffer ahead", bufferAhead().toFixed(1) + "s"],
      ["Back buffer", backBuffer().toFixed(1) + "s"],
      ["Dropped frames", q.droppedVideoFrames != null ? q.droppedVideoFrames + " / " + (q.totalVideoFrames || 0) : "—"]
    ];
    if (S.isLive) rows.push(["Live latency", behindLive().toFixed(1) + "s"]);
    rows.push(["Network retries", String(S.netRetries)]);
    rows.push(["Stall recoveries", String(S.stalls)]);

    statsList.innerHTML = rows.map(function (r) {
      return "<dt>" + escapeHtml(r[0]) + "</dt><dd>" + escapeHtml(r[1]) + "</dd>";
    }).join("");
  }

  btnStats.addEventListener("click", function (e) {
    e.stopPropagation();
    toggleStats();
  });
  statsClose.addEventListener("click", function () { statsBox.hidden = true; });

  /* ------------------------------------------------------------------
   * Keyboard (player focused)
   * ------------------------------------------------------------------ */
  stage.addEventListener("keydown", function (e) {
    var k = e.key;
    if (k === " " || k === "k" || k === "K") {
      e.preventDefault(); togglePlay();
    } else if (k === "ArrowRight" && !S.isLive) {
      e.preventDefault(); video.currentTime = Math.min(duration(), video.currentTime + 10);
    } else if (k === "ArrowLeft" && !S.isLive) {
      e.preventDefault(); video.currentTime = Math.max(0, video.currentTime - 10);
    } else if (k === "ArrowUp") {
      e.preventDefault(); setVolume((video.muted ? 0 : video.volume) + 0.05);
    } else if (k === "ArrowDown") {
      e.preventDefault(); setVolume((video.muted ? 0 : video.volume) - 0.05);
    } else if (k === "m" || k === "M") {
      video.muted = !video.muted; syncVolUI();
    } else if (k === "f" || k === "F") {
      toggleFs();
    } else if (k === "i" || k === "I") {
      toggleStats();
    } else if (k === "Escape") {
      closeMenu();
      return;
    } else {
      return;
    }
    e.stopPropagation();
  });

  /* ------------------------------------------------------------------
   * Stream list / custom URL / profiles  — now unified (API + demo)
   * ------------------------------------------------------------------ */
  function renderStreamList() {
    // ALL_STREAMS is the merged API+demo list; render demo section as "Demo & fallback"
    // If API channels loaded, they appear first via apiList; demo list shows remaining
    // For backward compat, streamList shows ALL_STREAMS
    streamList.innerHTML = ALL_STREAMS.map(function (s, i) {
      var isActive = S.url ? (S.url === s.url) : (i === 0);
      // Add click-to-play affordance: data-i + tabindex + role
      return '<button class="stream-item' + (isActive ? " active" : "") + '" data-i="' + i + '" tabindex="0" role="button" aria-label="Play ' + escapeHtml(s.name) + '">' +
        '<span class="si-main"><strong>' + escapeHtml(s.name) + "</strong><small>" + escapeHtml(s.meta) + "</small></span>" +
        '<span class="si-badge' + (s.live ? " si-live" : "") + '">' + (s.live ? "LIVE" : s.kind.toUpperCase()) + "</span>" +
        "</button>";
    }).join("");
    // Sync API list active states too
    if (apiList) renderApiList();
    updateEmbedCode();
  }

  function selectStream(i) {
    var s = ALL_STREAMS[i];
    if (!s) return;
    $all(".stream-item").forEach(function (b) {
      b.classList.toggle("active", parseInt(b.getAttribute("data-i"), 10) === i || parseInt(b.getAttribute("data-api-i"),10)===i || parseInt(b.getAttribute("data-all-i"),10)===i);
    });
    // Also sync api items
    if (apiList) {
      $all(".api-item", apiList).forEach(function(b){
        var ai = parseInt(b.getAttribute("data-api-i"),10);
        var allI = parseInt(b.getAttribute("data-all-i"),10);
        b.classList.toggle("active", allI===i || (API_CHANNELS[ai] && API_CHANNELS[ai].url===s.url));
      });
    }
    loadStream(s.url, s.kind, s.name);
  }

  streamList.addEventListener("click", function (e) {
    var btn = e.target.closest("[data-i]");
    if (btn) selectStream(parseInt(btn.getAttribute("data-i"), 10));
  });
  streamList.addEventListener("keydown", function(e){
    if(e.key==="Enter"||e.key===" "){
      var btn = e.target.closest("[data-i]");
      if(btn){ e.preventDefault(); selectStream(parseInt(btn.getAttribute("data-i"),10)); }
    }
  });
  if (apiList) {
    apiList.addEventListener("click", function(e){
      var btn = e.target.closest("[data-api-i]");
      if(btn){
        var idx = parseInt(btn.getAttribute("data-all-i"),10);
        if(!isNaN(idx) && idx>=0) selectStream(idx);
        else {
          var ai = parseInt(btn.getAttribute("data-api-i"),10);
          var ch = API_CHANNELS[ai];
          if(ch) selectStreamByUrl(ch.url, ch.kind, ch.name);
        }
      }
    });
    apiList.addEventListener("keydown", function(e){
      if(e.key==="Enter"||e.key===" "){
        var btn = e.target.closest("[data-api-i]");
        if(btn){ e.preventDefault(); btn.click(); }
      }
    });
  }
  if (apiRefresh) apiRefresh.addEventListener("click", fetchApiChannels);

  function loadFromInput() {
    var u = (urlInput.value || "").trim();
    if (!u) { toastP("Paste a stream URL first"); return; }
    if (!/^https?:\/\//i.test(u)) { toastP("URL must start with http:// or https://"); return; }
    var kind = /\.m3u8(\?|#|$)/i.test(u) ? "hls" : "mp4";
    $all(".stream-item").forEach(function (b) { b.classList.remove("active"); });
    loadStream(u, kind, "Custom stream");
  }

  loadBtn.addEventListener("click", loadFromInput);
  urlInput.addEventListener("keydown", function (e) {
    if (e.key === "Enter") loadFromInput();
  });

  // Embed code copy handlers
  if (copyEmbedBtn) copyEmbedBtn.addEventListener("click", copyEmbedCode);
  if (embedAutoplay) embedAutoplay.addEventListener("change", updateEmbedCode);
  if (embedCodeEl) {
    embedCodeEl.addEventListener("focus", function(){ this.select(); });
    embedCodeEl.addEventListener("click", function(){ this.select(); });
  }
  if (embedPreviewBtn) embedPreviewBtn.addEventListener("click", function(){
    var src = buildEmbedUrl(S.url);
    window.open(src, "_blank");
  });

  function markActiveProfile() {
    $all('input[name="bufProfile"]').forEach(function (radio) {
      var label = radio.parentNode;
      if (label && label.classList) label.classList.toggle("active", radio.checked);
    });
  }
  $all('input[name="bufProfile"]').forEach(function (radio) {
    radio.addEventListener("change", function () {
      profile = radio.value;
      var p = PROFILES[profile];
      if (S.hls) {
        S.hls.config.maxBufferLength = p.maxBufferLength;
        S.hls.config.maxMaxBufferLength = p.maxMaxBufferLength;
        S.hls.config.backBufferLength = p.backBufferLength;
      }
      toastP("Buffer profile: " + p.label);
      updateEngineNote();
      markActiveProfile();
    });
  });

  /* ------------------------------------------------------------------
   * Init
   * ------------------------------------------------------------------ */
  applyEmbedMode();
  setState("idle");
  renderStreamList();
  buildSpeedMenu();
  markActiveProfile();
  var v = parseFloat(null);
  try { v = parseFloat(localStorage.getItem("ss99-vol")); } catch (e) { /* noop */ }
  if (isNaN(v)) v = 1;
  // If embed autoplay requested or iframed, start muted autoplay
  if (QS_AUTOPLAY==="1" || (EMBED_MODE && QS_AUTOPLAY!=="0") || (IS_IFRAMED && EMBED_STREAM)) {
    video.muted = QS_MUTED==="0" ? false : true;
  }
  video.volume = Math.min(1, Math.max(0, v));
  syncVolUI();
  syncPlayIcon();
  updateEngineNote();
  updateEmbedCode();
  if (!(video.requestPictureInPicture && document.pictureInPictureEnabled)) {
    btnPip.style.display = "none";
  }

  // Kick off API channel pull (non-blocking, merges into list when ready)
  fetchApiChannels();

  // If ?stream= param present, load it immediately (deep-link / embed use-case)
  if (EMBED_STREAM) {
    var ekind = /\.m3u8/i.test(EMBED_STREAM) ? "hls" : /\.mp4/i.test(EMBED_STREAM) ? "mp4" : "hls";
    var ename = QS_CHANNEL ? ("Channel " + QS_CHANNEL) : "Embedded stream";
    // Delay slightly to allow fetch to start, but load requested stream right away
    setTimeout(function(){
      // If EMBED_STREAM looks like a channel code not a URL, try to resolve via API later
      if (!/^https?:\/\//i.test(EMBED_STREAM) && API_CHANNELS.length) {
        for (var i=0;i<API_CHANNELS.length;i++) if(API_CHANNELS[i].channel_code===EMBED_STREAM){ EMBED_STREAM=API_CHANNELS[i].url; ekind=API_CHANNELS[i].kind; ename=API_CHANNELS[i].name; break; }
      }
      if (/^https?:\/\//i.test(EMBED_STREAM)) {
        loadStream(EMBED_STREAM, ekind, ename);
        if (QS_AUTOPLAY==="1" || EMBED_MODE || IS_IFRAMED) playWithFallback();
      }
    }, 350);
    // Also retry after API load (in case stream was a channel code)
    var _apiPoll = setInterval(function(){
      if (API_STATUS==="ok" && EMBED_STREAM && !/^https?:\/\//i.test(EMBED_STREAM)) {
        for(var k=0;k<API_CHANNELS.length;k++) if(API_CHANNELS[k].channel_code===EMBED_STREAM){
          clearInterval(_apiPoll);
          loadStream(API_CHANNELS[k].url, API_CHANNELS[k].kind, API_CHANNELS[k].name);
          break;
        }
      }
      if(API_STATUS==="ok"||API_STATUS==="error") clearInterval(_apiPoll);
    }, 1000);
    setTimeout(function(){ clearInterval(_apiPoll); }, 12000);
  } else if (QS_CHANNEL && !EMBED_STREAM) {
    // ?channel=CODE without stream — will be handled after API fetch (see fetchApiChannels)
  }

  // Expose minimal API for debugging / external control
  window.SS99_PLAYER = {
    load: loadStream,
    select: selectStream,
    getState: function(){ return S; },
    getAllStreams: function(){ return ALL_STREAMS; },
    getApiChannels: function(){ return API_CHANNELS; },
    refreshChannels: fetchApiChannels
  };
})();
