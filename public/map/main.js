/**
 * main.js — Entrypoint for Mountain View 3D Campus Horror Map Explorer.
 */

import { CampusMapApp } from "./core.js";
import { CampusMapUI } from "./ui.js";
import {
  ATMOSPHERE_PRESETS,
  CAMERA_MODES,
  DEMO_ACTIONS,
  state,
  dispatchAction,
  parseInitialUrlFlags,
} from "./contract.js";

function updatePreloaderDom(pct, stage) {
  const fill = document.getElementById("preloader-bar-fill");
  const pctEl = document.getElementById("preloader-pct");
  const stageEl = document.getElementById("preloader-stage");
  const safePct = Math.max(0, Math.min(100, Math.round(Number(pct) || 0)));
  if (fill) fill.style.width = `${safePct}%`;
  if (pctEl) pctEl.textContent = `${safePct}%`;
  if (stage && stageEl) stageEl.textContent = stage;
}

function dismissPreloader() {
  const preloader = document.getElementById("campus-preloader");
  if (!preloader) return;
  let settled = false;
  const finish = () => {
    if (settled) return;
    settled = true;
    preloader.removeEventListener("transitionend", onEnd);
    preloader.style.display = "none";
    preloader.setAttribute("aria-hidden", "true");
  };
  const onEnd = (e) => {
    if (!e || e.target === preloader) finish();
  };
  preloader.addEventListener("transitionend", onEnd);
  void preloader.offsetWidth;
  preloader.classList.add("is-fading-out");
  setTimeout(finish, 340);
}

function boot() {
  const flags = parseInitialUrlFlags();
  if (flags.hudHidden) state.hudHidden = true;
  if (flags.atmosphere && ATMOSPHERE_PRESETS[flags.atmosphere]) {
    state.atmosphere = flags.atmosphere;
    state.flashlightOn = flags.atmosphere === "night";
  }
  if (flags.cameraMode) {
    state.cameraMode = flags.cameraMode;
  }

  const canvas = document.getElementById("stage-canvas");
  if (!canvas) return;

  const ui = new CampusMapUI();
  let app = null;

  try {
    app = new CampusMapApp(canvas, {
      onPreloadProgress: ({ pct, stage }) => updatePreloaderDom(pct, stage),
      onPreloadComplete: () => {
        updatePreloaderDom(100, "Map ready");
        dismissPreloader();
      },
    });
  } catch (err) {
    console.error("[CampusMap] WebGL2 initialization failed:", err);
    updatePreloaderDom(100, "WebGL2 is unavailable on this browser or device.");
    return;
  }

  if (flags.zone) {
    dispatchAction(DEMO_ACTIONS.JUMP_ZONE, flags.zone);
  }
  if (flags.cameraMode) {
    dispatchAction(DEMO_ACTIONS.SET_CAMERA_MODE, flags.cameraMode);
  }
  ui.syncAll();

  const keysDown = new Set();
  const syncAppMovementInputs = () => {
    app.setInputState({
      forward: keysDown.has("KeyW") || keysDown.has("ArrowUp"),
      backward: keysDown.has("KeyS") || keysDown.has("ArrowDown"),
      left: keysDown.has("KeyA") || keysDown.has("ArrowLeft"),
      right: keysDown.has("KeyD") || keysDown.has("ArrowRight"),
      sprint: keysDown.has("ShiftLeft") || keysDown.has("ShiftRight"),
    });
  };

  window.addEventListener("keydown", (e) => {
    if (e.metaKey || e.ctrlKey || e.altKey) return;
    const tag = e.target?.tagName ? e.target.tagName.toLowerCase() : "";
    if (tag === "input" || tag === "textarea" || tag === "select") return;

    const code = e.code;
    if (
      code === "KeyW" ||
      code === "KeyA" ||
      code === "KeyS" ||
      code === "KeyD" ||
      code === "ArrowUp" ||
      code === "ArrowDown" ||
      code === "ArrowLeft" ||
      code === "ArrowRight" ||
      code === "ShiftLeft" ||
      code === "ShiftRight"
    ) {
      if (code.startsWith("Arrow")) e.preventDefault();
      keysDown.add(code);
      syncAppMovementInputs();
      return;
    }

    if (e.repeat) return;

    if (code === "Tab") {
      e.preventDefault();
      const nextCam =
        state.cameraMode === CAMERA_MODES.WALK ? CAMERA_MODES.ORBIT : CAMERA_MODES.WALK;
      dispatchAction(DEMO_ACTIONS.SET_CAMERA_MODE, nextCam);
    } else if (code === "KeyF") {
      dispatchAction(DEMO_ACTIONS.TOGGLE_FLASHLIGHT);
    } else if (code === "KeyM") {
      dispatchAction(DEMO_ACTIONS.TOGGLE_MAP);
    } else if (code === "KeyH") {
      dispatchAction(DEMO_ACTIONS.TOGGLE_HUD);
    } else if (code === "KeyR") {
      dispatchAction(DEMO_ACTIONS.RESET);
    } else if (code === "Digit1") {
      dispatchAction(DEMO_ACTIONS.SET_ATMOSPHERE, "night");
    } else if (code === "Digit2") {
      dispatchAction(DEMO_ACTIONS.SET_ATMOSPHERE, "dusk");
    } else if (code === "Digit3") {
      dispatchAction(DEMO_ACTIONS.SET_ATMOSPHERE, "day");
    }
  });

  window.addEventListener("keyup", (e) => {
    if (keysDown.delete(e.code)) {
      syncAppMovementInputs();
    }
  });

  window.addEventListener("blur", () => {
    keysDown.clear();
    app.clearInputs();
  });

  window.addEventListener("resize", () => {
    app.resize();
  });

  let rafId = null;
  let lastMs = null;

  const tick = (nowMs) => {
    if (document.hidden) {
      rafId = null;
      lastMs = null;
      return;
    }
    if (lastMs === null) lastMs = nowMs;
    const dt = Math.min(Math.max((nowMs - lastMs) / 1000, 0), 0.1);
    lastMs = nowMs;

    app.advanceFrame(dt);
    ui.updateLiveTelemetry(false);
    rafId = requestAnimationFrame(tick);
  };

  document.addEventListener("visibilitychange", () => {
    if (document.hidden) {
      keysDown.clear();
      app.clearInputs();
      if (rafId !== null) {
        cancelAnimationFrame(rafId);
        rafId = null;
      }
      lastMs = null;
    } else if (rafId === null) {
      lastMs = null;
      rafId = requestAnimationFrame(tick);
    }
  });

  app.readyPromise.finally(() => {
    if (!document.hidden && rafId === null) {
      rafId = requestAnimationFrame(tick);
    }
  });
}

if (document.readyState === "loading") {
  window.addEventListener("DOMContentLoaded", boot, { once: true });
} else {
  boot();
}
