/**
 * hank-webos.js — LG webOS TV adapter for Hank
 * Handles LG Magic Remote input, hardware video integration, and TV lifecycle.
 */
(function() {
  'use strict';

  // Mark TV environment for Hank plugin
  window.__hankWebOS = true;
  window.__dxbiTv = { torrentDownloads: false, platform: "webos" };

  try {
    var rawUA = navigator.userAgent || "";
    if (rawUA.indexOf("dxbi-tv/") === -1) {
      Object.defineProperty(navigator, "userAgent", {
        get: function() { return rawUA + " dxbi-tv/2.35.1 (LG webOS)"; },
        configurable: true
      });
    }
  } catch (_) {}

  // webOS Remote Keycodes
  var KEY_BACK = 461;
  var KEY_ENTER = 13;
  var KEY_LEFT = 37, KEY_UP = 38, KEY_RIGHT = 39, KEY_DOWN = 40;
  var KEY_PLAY = 415, KEY_PAUSE = 19, KEY_STOP = 413;
  var KEY_REWIND = 412, KEY_FAST_FORWARD = 417;
  var KEY_RED = 403, KEY_GREEN = 404, KEY_YELLOW = 405, KEY_BLUE = 406;

  // Handle LG Magic Remote Back button
  function handleBack(e) {
    // 1. Close any open Hank modals or sheets first
    var modal = document.querySelector(".dxe-modal, .dxtv-sheet, [role='dialog'], .modal-container");
    if (modal) {
      var closeBtn = modal.querySelector("[data-act='close'], [data-close], [data-dismiss], .close-button-container-cmxAp");
      if (closeBtn) {
        closeBtn.click();
        e.preventDefault();
        e.stopPropagation();
        return;
      }
      modal.remove();
      e.preventDefault();
      e.stopPropagation();
      return;
    }

    // 2. If in player route, go back
    var hash = location.hash || "";
    if (hash.indexOf("#/player") === 0) {
      var playerBack = document.querySelector('[class*="player-container"] [class*="back-button"], .dx-player-back, button[title*="Back"]');
      if (playerBack) {
        playerBack.click();
      } else {
        history.back();
      }
      e.preventDefault();
      e.stopPropagation();
      return;
    }

    // 3. If in a sub-route (e.g. #/metadetails, #/settings), navigate back
    if (hash && hash !== "#/" && hash !== "#/board" && hash !== "#/home") {
      history.back();
      e.preventDefault();
      e.stopPropagation();
      return;
    }

    // 4. At root page: exit the webOS app cleanly
    e.preventDefault();
    e.stopPropagation();

    if (window.webOS && typeof window.webOS.platformBack === "function") {
      window.webOS.platformBack();
      return;
    }
    if (window.PalmSystem && typeof window.PalmSystem.platformBack === "function") {
      window.PalmSystem.platformBack();
      return;
    }

    try {
      window.close();
    } catch (_) {}
  }

  // Handle Remote media keys for active video
  function handleMedia(code, e) {
    var video = document.querySelector("video");
    if (!video) return;

    if (code === KEY_PLAY) {
      video.play().catch(function() {});
      e.preventDefault();
    } else if (code === KEY_PAUSE) {
      video.pause();
      e.preventDefault();
    } else if (code === KEY_STOP) {
      video.pause();
      history.back();
      e.preventDefault();
    } else if (code === KEY_REWIND) {
      video.currentTime = Math.max(0, video.currentTime - 10);
      e.preventDefault();
    } else if (code === KEY_FAST_FORWARD) {
      video.currentTime = Math.min(video.duration || Infinity, video.currentTime + 10);
      e.preventDefault();
    }
  }

  // Global key listener on capture phase
  window.addEventListener("keydown", function(e) {
    var code = e.keyCode || e.which;

    if (code === KEY_BACK) {
      handleBack(e);
      return;
    }

    if (code === KEY_PLAY || code === KEY_PAUSE || code === KEY_STOP || code === KEY_REWIND || code === KEY_FAST_FORWARD) {
      handleMedia(code, e);
      return;
    }
  }, true);

  // Restore focus on window visibility change (e.g. TV input switch or power on)
  document.addEventListener("visibilitychange", function() {
    if (!document.hidden) {
      var focused = document.activeElement;
      if (!focused || focused === document.body) {
        var firstTarget = document.querySelector('[tabindex="0"], button, a, [class*="poster-container"]');
        if (firstTarget) firstTarget.focus();
      }
    }
  });

  console.info("[Hank webOS] Adapter initialized for LG webOS TV");
})();
