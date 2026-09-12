/* ==========================================================================
   StreamSports99 — Stream Player Demo
   Custom controls + buffering strategy for API stream playback.
   HLS via vendored hls.js (MSE) with native HLS/MP4 fallback.
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

  var HlsRef     = typeof Hls !== "undefined" ? Hls : null;
  var MSE_OK     = !!(HlsRef && HlsRef.isSupported && HlsRef.isSupported());
  var NATIVE_HLS = !!(video.canPlayType && video.canPlayType("application/vnd.apple.mpegurl"));

  /* ------------------------------------------------------------------
   * Demo streams (public test feeds)
   * ------------------------------------------------------------------ */
  var DEMO_STREAMS = [
    { name: "Mux Test Stream",  meta: "VOD · multi-bitrate HLS",     url: "https://test-streams.mux.dev/x36xhzz/x36xhzz.m3u8", kind: "hls", live: false },
    { name: "Tears of Steel",   meta: "VOD · adaptive HLS",          url: "https://demo.unified-streaming.com/k8s/features/stable/video/tears-of-steel/tears-of-steel.ism/.m3u8", kind: "hls", live: false },
    { name: "Big Buck Bunny",   meta: "VOD · MP4 (native)",          url: "https://storage.googleapis.com/gtv-videos-bucket/sample/BigBuckBunny.mp4", kind: "mp4", live: false },
    { name: "Apple LL-HLS",     meta: "LIVE · low-latency HLS",      url: "https://ll-hls-test-apple.akamaized.net/llhls1/multi.m3u8", kind: "hls", live: true },
    { name: "Akamai Live Test", meta: "LIVE · 24/7 HLS",             url: "https://cph-p2p-msl.akamaized.net/hls/live/2000341/test/master.m3u8", kind: "hls", live: true }
  ];

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

    if (kind === "hls") {
      if (MSE_OK) {
        attachHls(url);                 /* playback starts on MANIFEST_PARSED */
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

  function attachHls(url) {
    var p = PROFILES[profile];
    var cfg = {
      enableWorker: true,
      lowLatencyMode: false,          /* favour throughput & stability over latency */
      maxBufferLength: p.maxBufferLength,
      maxMaxBufferLength: p.maxMaxBufferLength,
      maxBufferSize: 120 * 1000 * 1000,
      backBufferLength: p.backBufferLength,
      liveSyncDurationCount: 3,       /* sit ~3 segments behind the live edge */
      liveDurationInfinity: true,
      startLevel: -1,                 /* let ABR pick the start level */
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
  }

  function playWithFallback() {
    var p = video.play();
    if (p && p.catch) {
      p.catch(function () {
        /* Autoplay blocked — retry muted, offer unmute pill */
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
  });
  video.addEventListener("canplay", hideSpinner);
  video.addEventListener("waiting", function () { showSpinner("Buffering…"); });
  video.addEventListener("pause", function () {
    setState("paused");
    hideSpinner();
    stage.classList.remove("controls-hidden");
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
          if (S.stallTicks >= 4) {          /* ~2s frozen */
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
        video.currentTime = video.currentTime + 0.1;  /* nudge */
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
    if (!video.paused && menu.hidden) stage.classList.add("controls-hidden");
  });

  /* ------------------------------------------------------------------
   * Controls: buttons
   * ------------------------------------------------------------------ */
  function togglePlay() {
    if (video.paused) {
      if (!S.url) { selectStream(0); return; }
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

  /* Click surface: toggle play (ignore clicks on UI) */
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
   * Stream list / custom URL / profiles
   * ------------------------------------------------------------------ */
  function renderStreamList() {
    streamList.innerHTML = DEMO_STREAMS.map(function (s, i) {
      return '<button class="stream-item' + (i === 0 ? " active" : "") + '" data-i="' + i + '">' +
        '<span class="si-main"><strong>' + escapeHtml(s.name) + "</strong><small>" + escapeHtml(s.meta) + "</small></span>" +
        '<span class="si-badge' + (s.live ? " si-live" : "") + '">' + (s.live ? "LIVE" : s.kind.toUpperCase()) + "</span>" +
        "</button>";
    }).join("");
  }

  function selectStream(i) {
    var s = DEMO_STREAMS[i];
    if (!s) return;
    $all(".stream-item").forEach(function (b) {
      b.classList.toggle("active", parseInt(b.getAttribute("data-i"), 10) === i);
    });
    loadStream(s.url, s.kind, s.name);
  }

  streamList.addEventListener("click", function (e) {
    var btn = e.target.closest("[data-i]");
    if (btn) selectStream(parseInt(btn.getAttribute("data-i"), 10));
  });

  posterBtn.addEventListener("click", function () {
    if (stage.getAttribute("data-state") === "error" && S.url) {
      posterTitle.textContent = "Stream Player";
      posterSub.textContent = "Pick a demo stream or paste an API stream URL to start";
      loadStream(S.url, S.kind, S.name);
    } else {
      selectStream(0);
    }
  });

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
    });
  });

  /* ------------------------------------------------------------------
   * Init
   * ------------------------------------------------------------------ */
  setState("idle");
  renderStreamList();
  buildSpeedMenu();
  var v = parseFloat(null);
  try { v = parseFloat(localStorage.getItem("ss99-vol")); } catch (e) { /* noop */ }
  if (isNaN(v)) v = 1;
  video.volume = Math.min(1, Math.max(0, v));
  syncVolUI();
  syncPlayIcon();
  updateEngineNote();
  if (!(video.requestPictureInPicture && document.pictureInPictureEnabled)) {
    btnPip.style.display = "none";
  }
})();
