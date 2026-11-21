/**
 * ui.js — Minimal HUD & Interactive HiDPI 2D Survey Minimap for Mountain View Campus Map.
 */

import {
  WORLD_BOUNDS,
  CAMPUS_ROADS,
  CAMPUS_BUILDING_BLOCKS,
  MAP_ZONES,
  ATMOSPHERE_PRESETS,
  CAMERA_MODES,
  DEMO_ACTIONS,
  DEMO_EVENTS,
  bus,
  state,
  dispatchAction,
} from "./contract.js";

const MINIMAP_CSS_SIZE = 220;
const MIN_MAP_REDRAW_MS = 40;

const MAP_SPAN_X = WORLD_BOUNDS.maxX - WORLD_BOUNDS.minX;
const MAP_SPAN_Z = WORLD_BOUNDS.maxZ - WORLD_BOUNDS.minZ;
const MAP_SPAN = Math.max(MAP_SPAN_X, MAP_SPAN_Z);
const MAP_CENTER_X = (WORLD_BOUNDS.minX + WORLD_BOUNDS.maxX) * 0.5;
const MAP_CENTER_Z = (WORLD_BOUNDS.minZ + WORLD_BOUNDS.maxZ) * 0.5;

function worldToMinimap(wx, wz, sizeCss) {
  const pad = 10;
  const drawSize = sizeCss - pad * 2;
  const scale = drawSize / MAP_SPAN;
  return {
    x: sizeCss * 0.5 + (wx - MAP_CENTER_X) * scale,
    y: sizeCss * 0.5 + (wz - MAP_CENTER_Z) * scale,
  };
}

function minimapToWorld(mx, my, sizeCss) {
  const pad = 10;
  const drawSize = sizeCss - pad * 2;
  const scale = drawSize / MAP_SPAN;
  return {
    x: MAP_CENTER_X + (mx - sizeCss * 0.5) / scale,
    z: MAP_CENTER_Z + (my - sizeCss * 0.5) / scale,
  };
}

export class CampusMapUI {
  constructor() {
    this.hudZone = document.getElementById("hud-zone");
    this.hudCoords = document.getElementById("hud-coords");
    this.hudAtmo = document.getElementById("hud-atmo");
    this.walkReticle = document.getElementById("walk-reticle");
    this.controlsHint = document.getElementById("controls-hint");

    this.minimapPanel = document.getElementById("minimap-panel");
    this.minimapCanvas = document.getElementById("minimap-canvas");
    this.minimapCtx = this.minimapCanvas ? this.minimapCanvas.getContext("2d") : null;

    this.camButtons = Array.from(document.querySelectorAll("[data-cam-mode]"));
    this.atmoButtons = Array.from(document.querySelectorAll("[data-atmo]"));
    this.zoneButtons = Array.from(document.querySelectorAll("[data-zone]"));

    this.btnFlashlight = document.getElementById("btn-flashlight");
    this.btnMap = document.getElementById("btn-map");
    this.btnCloseMap = document.getElementById("btn-close-map");
    this.btnReset = document.getElementById("btn-reset");
    this.btnHideHud = document.getElementById("btn-hide-hud");

    this._lastCoordsText = "";
    this._lastZoneId = "";
    this._lastAtmoId = "";
    this._lastMapDrawMs = -1000;

    this._bindInteractions();
    this.syncAll();
  }

  _bindInteractions() {
    for (const btn of this.camButtons) {
      btn.addEventListener("click", () => {
        dispatchAction(DEMO_ACTIONS.SET_CAMERA_MODE, btn.getAttribute("data-cam-mode"));
      });
    }

    for (const btn of this.atmoButtons) {
      btn.addEventListener("click", () => {
        dispatchAction(DEMO_ACTIONS.SET_ATMOSPHERE, btn.getAttribute("data-atmo"));
      });
    }

    for (const btn of this.zoneButtons) {
      btn.addEventListener("click", () => {
        dispatchAction(DEMO_ACTIONS.JUMP_ZONE, btn.getAttribute("data-zone"));
      });
    }

    if (this.btnFlashlight) {
      this.btnFlashlight.addEventListener("click", () => {
        dispatchAction(DEMO_ACTIONS.TOGGLE_FLASHLIGHT);
      });
    }

    if (this.btnMap) {
      this.btnMap.addEventListener("click", () => {
        dispatchAction(DEMO_ACTIONS.TOGGLE_MAP);
      });
    }

    if (this.btnCloseMap) {
      this.btnCloseMap.addEventListener("click", () => {
        dispatchAction(DEMO_ACTIONS.TOGGLE_MAP, false);
      });
    }

    if (this.btnReset) {
      this.btnReset.addEventListener("click", () => {
        dispatchAction(DEMO_ACTIONS.RESET);
      });
    }

    if (this.btnHideHud) {
      this.btnHideHud.addEventListener("click", () => {
        dispatchAction(DEMO_ACTIONS.TOGGLE_HUD);
      });
    }

    if (this.minimapCanvas) {
      this.minimapCanvas.addEventListener("click", (e) => {
        const rect = this.minimapCanvas.getBoundingClientRect();
        if (!rect.width || !rect.height) return;
        const mx = ((e.clientX - rect.left) / rect.width) * MINIMAP_CSS_SIZE;
        const my = ((e.clientY - rect.top) / rect.height) * MINIMAP_CSS_SIZE;
        const worldPt = minimapToWorld(mx, my, MINIMAP_CSS_SIZE);
        dispatchAction(DEMO_ACTIONS.TELEPORT_XZ, worldPt);
        this.drawMinimap(true);
      });
    }

    bus.on(DEMO_EVENTS.STATE_CHANGED, () => this.syncAll());
    bus.on(DEMO_EVENTS.ZONE_CHANGED, () => this.syncAll());
  }

  syncAll() {
    const zoneObj = MAP_ZONES.find((z) => z.id === state.activeZone) || MAP_ZONES[0];
    if (this.hudZone && this._lastZoneId !== zoneObj.id) {
      this._lastZoneId = zoneObj.id;
      this.hudZone.textContent = zoneObj.fullName;
      for (const btn of this.zoneButtons) {
        btn.classList.toggle("is-active", btn.getAttribute("data-zone") === zoneObj.id);
      }
    }

    const preset = ATMOSPHERE_PRESETS[state.atmosphere] || ATMOSPHERE_PRESETS.night;
    if (this.hudAtmo && this._lastAtmoId !== preset.id) {
      this._lastAtmoId = preset.id;
      this.hudAtmo.textContent = preset.label;
      for (const btn of this.atmoButtons) {
        btn.classList.toggle("is-active", btn.getAttribute("data-atmo") === preset.id);
      }
    }

    for (const btn of this.camButtons) {
      btn.classList.toggle("is-active", btn.getAttribute("data-cam-mode") === state.cameraMode);
    }

    if (this.btnFlashlight) {
      this.btnFlashlight.classList.toggle("is-active", Boolean(state.flashlightOn));
    }

    if (this.btnMap) {
      this.btnMap.classList.toggle("is-active", Boolean(state.mapExpanded));
    }

    if (this.minimapPanel) {
      this.minimapPanel.classList.toggle("is-open", Boolean(state.mapExpanded));
    }

    if (this.walkReticle) {
      this.walkReticle.classList.toggle("is-hidden", state.cameraMode !== CAMERA_MODES.WALK);
    }

    if (this.controlsHint) {
      this.controlsHint.classList.toggle("is-locked", Boolean(state.pointerLocked));
      this.controlsHint.style.display = state.cameraMode === CAMERA_MODES.ORBIT ? "none" : "";
    }

    document.documentElement.classList.toggle("hud-hidden", Boolean(state.hudHidden));
    document.body.classList.toggle("hud-hidden", Boolean(state.hudHidden));

    this.updateLiveTelemetry(true);
  }

  updateLiveTelemetry(forceMapRedraw = false) {
    const rx = Math.round(state.playerPos.x);
    const rz = Math.round(state.playerPos.z);
    const coordStr = `${rx}, ${rz}`;
    if (this.hudCoords && coordStr !== this._lastCoordsText) {
      this._lastCoordsText = coordStr;
      this.hudCoords.textContent = coordStr;
    }

    const zoneObj = MAP_ZONES.find((z) => z.id === state.activeZone) || MAP_ZONES[0];
    if (this.hudZone && this._lastZoneId !== zoneObj.id) {
      this._lastZoneId = zoneObj.id;
      this.hudZone.textContent = zoneObj.fullName;
      for (const btn of this.zoneButtons) {
        btn.classList.toggle("is-active", btn.getAttribute("data-zone") === zoneObj.id);
      }
    }

    if (state.mapExpanded) {
      this.drawMinimap(forceMapRedraw);
    }
  }

  drawMinimap(force = false) {
    if (!this.minimapCanvas || !this.minimapCtx) return;
    const now = typeof performance !== "undefined" ? performance.now() : Date.now();
    if (!force && now - this._lastMapDrawMs < MIN_MAP_REDRAW_MS) return;
    this._lastMapDrawMs = now;

    const dpr = Math.min(window.devicePixelRatio || 1, 2);
    const targetPx = Math.round(MINIMAP_CSS_SIZE * dpr);
    if (this.minimapCanvas.width !== targetPx || this.minimapCanvas.height !== targetPx) {
      this.minimapCanvas.width = targetPx;
      this.minimapCanvas.height = targetPx;
    }

    const ctx = this.minimapCtx;
    ctx.setTransform(dpr, 0, 0, dpr, 0, 0);

    // 1. Background
    ctx.fillStyle = "#080b10";
    ctx.fillRect(0, 0, MINIMAP_CSS_SIZE, MINIMAP_CSS_SIZE);

    // 2. Water bodies (SF Bay northern basin, Retention Pond, Stevens Creek)
    ctx.fillStyle = "#102033";
    const pondTL = worldToMinimap(166, -60, MINIMAP_CSS_SIZE);
    const pondBR = worldToMinimap(235, 92, MINIMAP_CSS_SIZE);
    ctx.fillRect(pondTL.x, pondTL.y, pondBR.x - pondTL.x, pondBR.y - pondTL.y);

    const bayTL = worldToMinimap(-235, -235, MINIMAP_CSS_SIZE);
    const bayBR = worldToMinimap(235, -196, MINIMAP_CSS_SIZE);
    ctx.fillRect(bayTL.x, bayTL.y, bayBR.x - bayTL.x, bayBR.y - bayTL.y);

    ctx.strokeStyle = "#162d47";
    ctx.lineWidth = 6;
    ctx.beginPath();
    const creekW = worldToMinimap(-235, -118, MINIMAP_CSS_SIZE);
    const creekM = worldToMinimap(25, -124, MINIMAP_CSS_SIZE);
    const creekE = worldToMinimap(235, -108, MINIMAP_CSS_SIZE);
    ctx.moveTo(creekW.x, creekW.y);
    ctx.quadraticCurveTo(creekM.x, creekM.y, creekE.x, creekE.y);
    ctx.stroke();

    // 3. Campus Roads
    const pad = 10;
    const scale = (MINIMAP_CSS_SIZE - pad * 2) / MAP_SPAN;
    ctx.lineCap = "round";
    for (let i = 0; i < CAMPUS_ROADS.length; i++) {
      const r = CAMPUS_ROADS[i];
      const p1 = worldToMinimap(r.x1, r.z1, MINIMAP_CSS_SIZE);
      const p2 = worldToMinimap(r.x2, r.z2, MINIMAP_CSS_SIZE);
      ctx.strokeStyle = r.isArchedBridge ? "#785c43" : "#252f3d";
      ctx.lineWidth = Math.max(1.8, r.widthM * scale);
      ctx.beginPath();
      ctx.moveTo(p1.x, p1.y);
      ctx.lineTo(p2.x, p2.y);
      ctx.stroke();
    }

    // 4. Campus Buildings
    ctx.fillStyle = "#1b2432";
    ctx.strokeStyle = "rgba(148, 163, 184, 0.25)";
    ctx.lineWidth = 1;
    for (let i = 0; i < CAMPUS_BUILDING_BLOCKS.length; i++) {
      const b = CAMPUS_BUILDING_BLOCKS[i];
      const cx = b.id === "bldg_north_commons" ? -32 : (b.cx ?? 0);
      const cz = b.cz ?? 0;
      const p = worldToMinimap(cx - b.wx * 0.5, cz - b.wz * 0.5, MINIMAP_CSS_SIZE);
      const bw = b.wx * scale;
      const bh = b.wz * scale;
      ctx.fillRect(p.x, p.y, bw, bh);
      ctx.strokeRect(p.x, p.y, bw, bh);
    }

    // Gradient Canopy & Shoreline amphitheatre silhouettes
    const canopyTL = worldToMinimap(-19, 129, MINIMAP_CSS_SIZE);
    ctx.fillRect(canopyTL.x, canopyTL.y, 38 * scale, 29 * scale);
    ctx.strokeRect(canopyTL.x, canopyTL.y, 38 * scale, 29 * scale);

    const shoreCenter = worldToMinimap(12, -206, MINIMAP_CSS_SIZE);
    ctx.beginPath();
    ctx.arc(shoreCenter.x, shoreCenter.y, 24 * scale, 0, Math.PI, false);
    ctx.fill();
    ctx.stroke();

    // 5. Zone markers
    for (let i = 0; i < MAP_ZONES.length; i++) {
      const z = MAP_ZONES[i];
      const zp = worldToMinimap(z.x, z.z, MINIMAP_CSS_SIZE);
      const isActive = z.id === state.activeZone;
      ctx.fillStyle = isActive ? "#7DD3FC" : "rgba(148, 163, 184, 0.55)";
      ctx.beginPath();
      ctx.arc(zp.x, zp.y, isActive ? 3.2 : 2.1, 0, Math.PI * 2);
      ctx.fill();
    }

    // 6. Player position + FOV cone
    const pp = worldToMinimap(state.playerPos.x, state.playerPos.z, MINIMAP_CSS_SIZE);
    const fwdX = -Math.sin(state.playerYaw);
    const fwdY = -Math.cos(state.playerYaw);
    const headingAngle = Math.atan2(fwdY, fwdX);

    ctx.fillStyle = "rgba(125, 211, 252, 0.22)";
    ctx.beginPath();
    ctx.moveTo(pp.x, pp.y);
    ctx.arc(pp.x, pp.y, 18, headingAngle - 0.45, headingAngle + 0.45);
    ctx.closePath();
    ctx.fill();

    ctx.fillStyle = "#F8FAFC";
    ctx.strokeStyle = "#080b10";
    ctx.lineWidth = 1.5;
    ctx.beginPath();
    ctx.arc(pp.x, pp.y, 3.6, 0, Math.PI * 2);
    ctx.fill();
    ctx.stroke();
  }
}

export function initUI() {
  return new CampusMapUI();
}
