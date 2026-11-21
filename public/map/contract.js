/**
 * contract.js — Mountain View 3D Campus Horror Map Contract.
 *
 * Coordinate & Heading Convention (Right-Handed Three.js Y-Up):
 *   - `X` axis: West (`-X`) <-> East (`+X`, Bay View Basin)
 *   - `Z` axis: North (`-Z`, Stevens Creek & Shoreline) <-> South (`+Z`, Gradient Canopy)
 *   - `headingYaw` (rad): `0` = North (`-Z`), `+PI/2` = East (`+X`), `-PI/2` = West (`-X`), `PI` = South (`+Z`).
 */

export const WORLD_BOUNDS = Object.freeze({
  minX: -235,
  maxX: 235,
  minZ: -235,
  maxZ: 185,
});

export const CAMPUS_ROADS = Object.freeze([
  { id: "charleston_rd", x1: -195, z1: 76, x2: 164, z2: 76, widthM: 14.0, bikeLane: true, surface: "asphalt", name: "Charleston Rd" },
  { id: "amphitheatre_pkwy", x1: -195, z1: -18, x2: 164, z2: -18, widthM: 14.0, bikeLane: true, surface: "asphalt", name: "Amphitheatre Pkwy" },
  { id: "gradient_driveway", x1: -56, z1: 116, x2: 56, z2: 116, widthM: 10.5, bikeLane: false, surface: "concrete", name: "Canopy Drive" },
  { id: "north_creek_connector", x1: 0, z1: -86, x2: 164, z2: -86, widthM: 11.5, bikeLane: true, surface: "asphalt", name: "North Bayshore Trail" },
  { id: "shoreline_blvd", x1: 0, z1: 121.25, x2: 0, z2: -86, widthM: 14.0, bikeLane: true, surface: "asphalt", name: "N Shoreline Blvd" },
  { id: "west_campus_ave", x1: -118, z1: 86.6, x2: -118, z2: -18, widthM: 13.0, bikeLane: true, surface: "asphalt", name: "West Campus Ave" },
  { id: "googleplex_courtyard_walk", x1: -118, z1: -18, x2: -118, z2: -72, widthM: 9.0, bikeLane: false, surface: "pavers", name: "West Courtyard Walk" },
  { id: "bay_view_promenade", x1: 156, z1: 112, x2: 156, z2: -86, widthM: 16.0, bikeLane: false, surface: "pavers", name: "Waterfront Promenade" },
  { id: "stevens_creek_bridge", x1: 52, z1: -86, x2: 18, z2: -158, widthM: 6.2, bikeLane: false, surface: "wood_planks", isArchedBridge: true, archHeightM: 1.18, name: "Creek Truss Bridge" },
  { id: "shoreline_meadow_path", x1: 18, z1: -158, x2: 12, z2: -190, widthM: 9.5, bikeLane: false, surface: "pavers", name: "North Esplanade" },
]);

export const CAMPUS_INTERSECTIONS = Object.freeze([
  { x: 0, z: 116, radiusM: 9.0, hasCrosswalk: true },
  { x: 0, z: 76, radiusM: 10.0, hasCrosswalk: true, hasTrafficLight: true },
  { x: -118, z: 76, radiusM: 10.0, hasCrosswalk: true, hasTrafficLight: true },
  { x: 156, z: 76, radiusM: 10.0, hasCrosswalk: true, hasTrafficLight: true },
  { x: 0, z: -18, radiusM: 10.0, hasCrosswalk: true, hasTrafficLight: true },
  { x: -118, z: -18, radiusM: 10.0, hasCrosswalk: true, hasTrafficLight: true },
  { x: 156, z: -18, radiusM: 10.0, hasCrosswalk: true, hasTrafficLight: true },
  { x: 0, z: -86, radiusM: 9.0, hasCrosswalk: true },
  { x: 52, z: -86, radiusM: 9.0, hasCrosswalk: true },
  { x: 156, z: -86, radiusM: 9.0, hasCrosswalk: true },
]);

export const CAMPUS_BUILDING_BLOCKS = Object.freeze([
  { id: "bldg_visitor_timber", name: "West Timber Annex", cx: -156, cz: 104, wx: 34, wz: 22, hy: 9.5, style: "timber" },
  { id: "bldg_charleston_sw", name: "Charleston West Hall", cx: -60, cz: 46, wx: 52, wz: 24, hy: 12.5, style: "glass_modern" },
  { id: "bldg_charleston_se", name: "Charleston East Hall", cx: 76, cz: 46, wx: 64, wz: 24, hy: 13.0, style: "glass_modern" },
  { id: "bldg_plex_40", name: "Quad Wing 40", cx: -162, cz: -52, wx: 38, wz: 26, hy: 14.0, style: "plex_glass" },
  { id: "bldg_plex_41", name: "Quad Wing 41", cx: -74, cz: -52, wx: 36, wz: 24, hy: 13.5, style: "plex_glass" },
  { id: "bldg_plex_42", name: "Quad Wing 42", cx: -60, cz: 12, wx: 48, wz: 22, hy: 13.0, style: "plex_glass" },
  { id: "bldg_ai_compute_hub", name: "North Annex", cx: 76, cz: 12, wx: 58, wz: 24, hy: 14.5, style: "timber" },
  { id: "bldg_bayview_canopy", name: "East Basin Canopy", cx: 202, cz: 22, wx: 42, wz: 56, hy: 13.0, style: "dragonscale" },
  { id: "bldg_solar_carport_w", name: "West Solar Structure", cx: -162, cz: 28, wx: 32, wz: 36, hy: 5.4, style: "solar_carport" },
  { id: "bldg_north_commons", name: "North Commons", cx: -32, cz: -54, wx: 34, wz: 20, hy: 11.5, style: "timber" },
]);

export const MAP_ZONES = Object.freeze([
  { id: "canopy", label: "Canopy", fullName: "South Canopy Forecourt", x: 0.0, z: 118.0, yaw: 0.0 },
  { id: "west_lawn", label: "West Lawn", fullName: "West Lawn Circle", x: -118.0, z: 96.0, yaw: Math.PI },
  { id: "courtyard", label: "Courtyard", fullName: "West Courtyard", x: -118.0, z: -42.0, yaw: Math.PI },
  { id: "waterfront", label: "Waterfront", fullName: "East Basin Promenade", x: 156.0, z: 22.0, yaw: Math.PI * 0.5 },
  { id: "shoreline", label: "Shoreline", fullName: "North Amphitheatre", x: 14.0, z: -172.0, yaw: 0.0 },
]);

export const ATMOSPHERE_PRESETS = Object.freeze({
  night: {
    id: "night",
    label: "Night",
    skyZenith: "#070b14",
    skyHorizon: "#162030",
    fogColor: "#0e1522",
    fogDensity: 0.0115,
    moonDir: [-0.45, 0.52, -0.72],
    dirColor: "#9fb8e0",
    dirIntensity: 1.05,
    hemiSky: "#2a3b5c",
    hemiGround: "#12161e",
    hemiIntensity: 0.42,
    exposure: 0.92,
    ridgeTint: "#1a2232",
    ridgeEmissive: "#070b14",
    waterDeep: "#07101a",
    waterShallow: "#152536",
  },
  dusk: {
    id: "dusk",
    label: "Dusk",
    skyZenith: "#1c2540",
    skyHorizon: "#4b4158",
    fogColor: "#2d2a3a",
    fogDensity: 0.0068,
    moonDir: [-0.62, 0.26, -0.74],
    dirColor: "#c99a86",
    dirIntensity: 1.45,
    hemiSky: "#4c4e6b",
    hemiGround: "#262228",
    hemiIntensity: 0.58,
    exposure: 0.96,
    ridgeTint: "#3f3848",
    ridgeEmissive: "#15121d",
    waterDeep: "#0f1c2b",
    waterShallow: "#2b3b4e",
  },
  day: {
    id: "day",
    label: "Day",
    skyZenith: "#607d94",
    skyHorizon: "#b9c4c8",
    fogColor: "#a9b5ba",
    fogDensity: 0.0022,
    moonDir: [-0.58, 0.46, -0.68],
    dirColor: "#f6ecd8",
    dirIntensity: 2.35,
    hemiSky: "#8ea8be",
    hemiGround: "#585249",
    hemiIntensity: 0.92,
    exposure: 1.0,
    ridgeTint: "#8a94a2",
    ridgeEmissive: "#1f242c",
    waterDeep: "#183e52",
    waterShallow: "#3b7688",
  },
});

export const CAMERA_MODES = Object.freeze({
  WALK: "walk",
  ORBIT: "orbit",
});

export const DEMO_ACTIONS = Object.freeze({
  SET_CAMERA_MODE: "SET_CAMERA_MODE",
  TOGGLE_FLASHLIGHT: "TOGGLE_FLASHLIGHT",
  SET_ATMOSPHERE: "SET_ATMOSPHERE",
  JUMP_ZONE: "JUMP_ZONE",
  TELEPORT_XZ: "TELEPORT_XZ",
  TOGGLE_MAP: "TOGGLE_MAP",
  TOGGLE_HUD: "TOGGLE_HUD",
  RESET: "RESET",
});

export const DEMO_EVENTS = Object.freeze({
  READY: "READY",
  STATE_CHANGED: "STATE_CHANGED",
  ZONE_CHANGED: "ZONE_CHANGED",
});

class EventBus {
  constructor() {
    this._listeners = new Map();
  }
  on(event, fn) {
    if (!this._listeners.has(event)) this._listeners.set(event, new Set());
    this._listeners.get(event).add(fn);
    return () => this.off(event, fn);
  }
  off(event, fn) {
    const s = this._listeners.get(event);
    if (s) s.delete(fn);
  }
  emit(event, payload) {
    const s = this._listeners.get(event);
    if (!s) return;
    for (const fn of s) {
      try {
        fn(payload);
      } catch (err) {
        console.error(`[contract] Listener error on ${event}:`, err);
      }
    }
  }
}

export const bus = new EventBus();

export const state = {
  ready: false,
  loadProgress: 0,
  loadStage: "Initializing terrain…",
  cameraMode: CAMERA_MODES.WALK,
  flashlightOn: true,
  atmosphere: "night",
  mapExpanded: false,
  hudHidden: false,
  pointerLocked: false,
  activeZone: "canopy",
  playerPos: { x: 0.0, y: 1.72, z: 118.0 },
  playerYaw: 0.0,
  playerPitch: -0.02,
  playerSpeedMps: 0.0,
  isMoving: false,
  isSprinting: false,
  qualityTier: "high",
  isSoftwareRenderer: false,
  fps: 60,
};

export function normalizeStateKey(rawKey) {
  return String(rawKey || "")
    .trim()
    .toLowerCase()
    .replace(/[\s-]+/g, "_");
}

export function parseInitialUrlFlags() {
  if (typeof window === "undefined") return {};
  try {
    const p = new URLSearchParams(window.location.search || "");
    const atmo = p.get("atmosphere");
    const cam = p.get("camera");
    const zone = p.get("zone");
    return {
      hudHidden: p.get("hud") === "0" || p.get("clean") === "1",
      atmosphere: atmo && ATMOSPHERE_PRESETS[atmo] ? atmo : null,
      cameraMode: cam === "orbit" ? CAMERA_MODES.ORBIT : cam === "walk" ? CAMERA_MODES.WALK : null,
      zone: zone || null,
    };
  } catch {
    return {};
  }
}

export function dispatchAction(action, payload = null) {
  switch (action) {
    case DEMO_ACTIONS.SET_CAMERA_MODE: {
      const next = payload === CAMERA_MODES.ORBIT ? CAMERA_MODES.ORBIT : CAMERA_MODES.WALK;
      state.cameraMode = next;
      bus.emit(DEMO_EVENTS.STATE_CHANGED, { action, state });
      return next;
    }
    case DEMO_ACTIONS.TOGGLE_FLASHLIGHT: {
      state.flashlightOn = typeof payload === "boolean" ? payload : !state.flashlightOn;
      bus.emit(DEMO_EVENTS.STATE_CHANGED, { action, state });
      return state.flashlightOn;
    }
    case DEMO_ACTIONS.SET_ATMOSPHERE: {
      const key = ATMOSPHERE_PRESETS[payload] ? payload : "night";
      state.atmosphere = key;
      if (key === "night" && payload === "night") state.flashlightOn = true;
      bus.emit(DEMO_EVENTS.STATE_CHANGED, { action, state });
      return key;
    }
    case DEMO_ACTIONS.JUMP_ZONE: {
      const zObj = MAP_ZONES.find((z) => z.id === payload) || MAP_ZONES[0];
      state.activeZone = zObj.id;
      bus.emit(DEMO_EVENTS.ZONE_CHANGED, zObj);
      bus.emit(DEMO_EVENTS.STATE_CHANGED, { action, payload: zObj, state });
      return zObj;
    }
    case DEMO_ACTIONS.TELEPORT_XZ: {
      if (payload && Number.isFinite(payload.x) && Number.isFinite(payload.z)) {
        bus.emit(DEMO_ACTIONS.TELEPORT_XZ, payload);
      }
      return payload;
    }
    case DEMO_ACTIONS.TOGGLE_MAP: {
      state.mapExpanded = typeof payload === "boolean" ? payload : !state.mapExpanded;
      bus.emit(DEMO_EVENTS.STATE_CHANGED, { action, state });
      return state.mapExpanded;
    }
    case DEMO_ACTIONS.TOGGLE_HUD: {
      state.hudHidden = typeof payload === "boolean" ? payload : !state.hudHidden;
      bus.emit(DEMO_EVENTS.STATE_CHANGED, { action, state });
      return state.hudHidden;
    }
    case DEMO_ACTIONS.RESET: {
      state.activeZone = "canopy";
      bus.emit(DEMO_ACTIONS.RESET, payload);
      bus.emit(DEMO_EVENTS.STATE_CHANGED, { action, state });
      return true;
    }
    default:
      return null;
  }
}

if (typeof window !== "undefined") {
  window.__campusContract = {
    state,
    bus,
    dispatchAction,
    MAP_ZONES,
    ATMOSPHERE_PRESETS,
    DEMO_ACTIONS,
  };
}
