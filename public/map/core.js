/**
 * core.js — Stalker Hunt 3D Map Core:
 * Mountain View Campus + Backrooms Level 0 expansion, Ronaldo & Messi rigged characters,
 * right-hand 3D horror flashlight pointing/aiming, 5-Stalker pack AI, and WebSocket co-op.
 */

import * as THREE from "./vendor/three.module.js";
import { OrbitControls } from "./vendor/OrbitControls.js";
import { GLTFLoader } from "./vendor/GLTFLoader.js";
import {
  WORLD_BOUNDS,
  MAP_ZONES,
  ATMOSPHERE_PRESETS,
  CAMERA_MODES,
  DEMO_ACTIONS,
  DEMO_EVENTS,
  bus,
  state,
} from "./contract.js";
import {
  getOpenWorldTerrainHeight,
  clamp,
} from "./rig/kin.js";
import {
  createMaterialLibrary,
  deplasticizeCampusPropMaterials,
} from "./scenes/materials.js";
import { OpenCampusWorld } from "./scenes/open_campus_world.js";
import {
  BackroomsExpansion,
  BACKROOMS_CEILING_Y,
  BACKROOMS_WARP_ARRIVAL,
} from "./scenes/backrooms_expansion.js";
import { decodeCampusLandmarksV2Glb } from "./assets/glb/campus_landmarks_v2_glb.js";
import { decodeCampusEnvironmentV3Glb } from "./assets/glb/campus_environment_v3_glb.js";
import { decodeTreesV4Glb } from "./assets/glb/trees_v4_glb.js";
import { decodeCampusHorizonArchV5Glb } from "./assets/glb/campus_horizon_arch_v5_glb.js";
import { decodeGradientCanopyV6Glb } from "./assets/glb/gradient_canopy_v6_glb.js";
import { decodePropsAndBridgeV6Glb } from "./assets/glb/props_and_bridge_v6_glb.js";
import {
  configureAAASunShadowsAndAtmosphere,
  applyWorldCohesionShaderHook,
} from "./scenes/v5_postfx_lighting.js";
import { loadCharacters } from "./game/characters.js";
import { MultiplayerClient } from "./game/multiplayer.js";

const EYE_HEIGHT_M = 1.70;
const WALK_SPEED_MPS = 4.6;
const SPRINT_SPEED_MPS = 8.6;
const PLAYER_RADIUS_M = 0.45;
const MOUSE_SENSITIVITY = 0.0022;
const TOUCH_LOOK_SENSITIVITY = 0.0048;
const CAM_TARGET_HEIGHT_M = 1.46;
const CAM_MIN_PITCH = -0.62;
const CAM_MAX_PITCH = 1.02;
const GRAVITY_MPS2 = -19.5;
const JUMP_IMPULSE_MPS = 6.3;

const _backroomsFogColor = new THREE.Color("#29230f");
const _backroomsSkyColor = new THREE.Color("#141108");
const _presetFogColor = new THREE.Color();
const _presetSkyColor = new THREE.Color();
const _camFwdScratch = new THREE.Vector3();
const _camRightScratch = new THREE.Vector3();
const _aimTargetScratch = new THREE.Vector3();
const _aimDirScratch = new THREE.Vector3();
const _handApproxScratch = new THREE.Vector3();

function detectSoftwareWebGLRenderer() {
  try {
    if (typeof document === "undefined") return false;
    const probe = document.createElement("canvas");
    probe.width = 1;
    probe.height = 1;
    const gl =
      probe.getContext("webgl2", { antialias: false }) ||
      probe.getContext("webgl", { antialias: false });
    if (!gl) return false;
    const dbg = gl.getExtension("WEBGL_debug_renderer_info");
    const rendererStr = String(
      (dbg && gl.getParameter(dbg.UNMASKED_RENDERER_WEBGL)) ||
        gl.getParameter(gl.RENDERER) ||
        ""
    );
    const lose = gl.getExtension("WEBGL_lose_context");
    if (lose) lose.loseContext();
    return /SwiftShader|llvmpipe|Software|Basic Render Driver/i.test(rendererStr);
  } catch {
    return false;
  }
}

async function parseInlineGlbScene(loader, decodeFn, slug = "") {
  let raw = null;
  if (
    slug &&
    typeof window !== "undefined" &&
    (window.location?.protocol === "http:" || window.location?.protocol === "https:") &&
    !window.__forceInlineGlb &&
    typeof fetch === "function"
  ) {
    const candidateUrls = [`./assets/glb/${slug}.glb`];
    for (const url of candidateUrls) {
      try {
        const res = await fetch(url, { cache: "force-cache" });
        if (res && res.ok) {
          const buf = await res.arrayBuffer();
          if (
            buf &&
            buf.byteLength >= 16 &&
            new DataView(buf).getUint32(0, true) === 0x46546c67
          ) {
            raw = new Uint8Array(buf);
            break;
          }
        }
      } catch {
        raw = null;
      }
    }
  }

  if (!raw && typeof decodeFn === "function") {
    try {
      raw = await decodeFn();
    } catch {
      return null;
    }
  }
  if (!raw) return null;

  let arrayBuf = null;
  if (raw instanceof ArrayBuffer) {
    arrayBuf = raw;
  } else if (ArrayBuffer.isView(raw) && raw.byteLength > 0) {
    arrayBuf =
      raw.byteOffset === 0 && raw.byteLength === raw.buffer.byteLength
        ? raw.buffer
        : raw.buffer.slice(raw.byteOffset, raw.byteOffset + raw.byteLength);
  }
  if (!arrayBuf || arrayBuf.byteLength < 16) return null;

  return new Promise((resolve) => {
    try {
      loader.parse(
        arrayBuf,
        "",
        (gltf) => resolve(gltf && gltf.scene ? gltf.scene : null),
        () => resolve(null)
      );
    } catch {
      resolve(null);
    }
  });
}

export class CampusMapApp {
  constructor(canvas, options = {}) {
    this.canvas = canvas;
    this.onPreloadProgress =
      typeof options.onPreloadProgress === "function" ? options.onPreloadProgress : null;
    this.onPreloadComplete =
      typeof options.onPreloadComplete === "function" ? options.onPreloadComplete : null;

    this.isSoftwareRenderer = detectSoftwareWebGLRenderer();
    state.isSoftwareRenderer = this.isSoftwareRenderer;
    state.qualityTier = this.isSoftwareRenderer ? "medium" : "high";
    if (this.isSoftwareRenderer && typeof document !== "undefined") {
      document.documentElement.classList.add("is-software-renderer");
    }

    this._glContextLost = false;
    this._activePreset = ATMOSPHERE_PRESETS[state.atmosphere] || ATMOSPHERE_PRESETS.night;
    this._activeDirVec = new THREE.Vector3(-0.45, 0.52, -0.72).normalize();

    // Player Walk State (Right-handed Y-up: yaw=0 looks North toward -Z)
    this.playerX = state.playerPos.x;
    this.playerZ = state.playerPos.z;
    this.playerYaw = state.playerYaw;
    this.playerPitch = state.playerPitch;
    this._posY = 0; // vertical offset above ground
    this._velY = 0;
    this._grounded = true;
    this._velX = 0;
    this._velZ = 0;
    this._sprinting = false;
    this._elapsedSec = 0;
    this._lastZoneCheckSec = -10;
    this._isDraggingLook = false;
    this._lastDragX = 0;
    this._lastDragY = 0;
    this._backroomsBlend = 0;
    this._camDistCurrent = 3.85;
    this._camRightCurrent = 0.42;
    this._alertClearTimer = 0;

    this.input = {
      forward: false,
      backward: false,
      left: false,
      right: false,
      sprint: false,
    };
    this.analog = { x: 0, y: 0 };
    this._lookPointerId = null;

    this.characters = null;
    this.backrooms = new BackroomsExpansion();
    this._initMultiplayer();

    // Zero-GC reusable scratch records
    this._worldSnap = {
      x: 0,
      y: 0,
      z: 118,
      forwardX: 0,
      forwardZ: -1,
      groundY: 0,
      sequenceTime: 0,
      elapsedTime: 0,
    };
    this._lightingFrameOpts = {
      enclosedGym: false,
      sequenceTime: 0,
      isSoftwareRenderer: this.isSoftwareRenderer,
      enforceGoldenHourPalette: false,
      sunDir: this._activeDirVec,
      sunIntensity: this._activePreset.dirIntensity,
      forceStaticRebuild: false,
    };

    this._initRendererSceneAndLights();
    this._initWorld();
    this._bindBusAndPointerControls();

    this._syncWalkCamera(0);
    this._updateWorldAndLighting(0, true);

    if (typeof window !== "undefined") {
      window.__campusApp = this;
    }

    this.readyPromise = this._loadMapAssets().catch((err) => {
      console.warn("[CampusMap] Asset load completed with warnings:", err);
      return false;
    });
  }

  _initMultiplayer() {
    const syncRosterToState = (info) => {
      state.coopConnected = Boolean(info.connected);
      state.roomId = info.roomId || state.roomId;
      state.coopIsHost = Boolean(info.isHost);
      state.coopPlayers = Array.isArray(info.players) ? info.players : [];
      if (info.character && (info.character === "ronaldo" || info.character === "messi")) {
        state.localCharacter = info.character;
        if (this.characters) {
          this.characters.setLocalCharacter(info.character);
        }
      }
      if (this.characters) {
        this.characters.syncRemoteRoster(state.coopPlayers, info.playerId);
      }
      bus.emit(DEMO_EVENTS.STATE_CHANGED, { action: "COOP_ROSTER", state });
    };

    this.multiplayer = new MultiplayerClient({
      onWelcome: (info) => {
        syncRosterToState(info);
        this._setAlert(
          `JOINED ROOM ${info.roomId} AS ${info.character === "messi" ? "MESSI" : "RONALDO"}`,
          3.5
        );
      },
      onRosterChange: (info) => {
        syncRosterToState(info);
      },
      onRemotePlayerState: (playerId, character, st) => {
        if (this.characters) {
          this.characters.applyRemoteState(playerId, character, st);
        }
        const entry = state.coopPlayers.find((p) => p.id === playerId);
        if (entry) entry.state = st;
      },
    });
  }

  joinCoopRoom(roomId, preferredChar = state.localCharacter) {
    state.roomId = String(roomId || "CAMPUS")
      .trim()
      .toUpperCase()
      .replace(/[^A-Z0-9_-]/g, "")
      .slice(0, 16) || "CAMPUS";
    this.multiplayer.join(state.roomId, preferredChar);
    bus.emit(DEMO_EVENTS.STATE_CHANGED, { action: "COOP_JOINING", state });
  }

  leaveCoopRoom() {
    this.multiplayer.leave();
    if (this.characters) {
      this.characters.syncRemoteRoster([], null);
    }
    state.coopConnected = false;
    state.coopIsHost = true;
    state.coopPlayers = [];
    bus.emit(DEMO_EVENTS.STATE_CHANGED, { action: "COOP_LEFT", state });
  }

  _setAlert(msg, durationSec = 3.5) {
    state.stalkerAlert = msg;
    this._alertClearTimer = durationSec;
    bus.emit(DEMO_EVENTS.STATE_CHANGED, { action: "ALERT", state });
  }

  _reportPreload(pct, stage) {
    const safePct = Math.max(0, Math.min(100, Math.round(Number(pct) || 0)));
    state.loadProgress = safePct;
    if (stage) state.loadStage = stage;
    if (this.onPreloadProgress) {
      try {
        this.onPreloadProgress({ pct: safePct, stage: state.loadStage });
      } catch {
        // Ignore progress listener error
      }
    }
  }

  _yieldFrame() {
    const wait = (typeof window !== "undefined" && window.__nativeSetTimeout) || setTimeout;
    return new Promise((resolve) => {
      if (typeof requestAnimationFrame === "function") {
        let settled = false;
        const done = () => {
          if (settled) return;
          settled = true;
          resolve();
        };
        requestAnimationFrame(done);
        wait(done, 18);
      } else {
        wait(resolve, 0);
      }
    });
  }

  _initRendererSceneAndLights() {
    const w = Math.max(1, this.canvas.clientWidth || window.innerWidth || 1280);
    const h = Math.max(1, this.canvas.clientHeight || window.innerHeight || 720);

    this.renderer = new THREE.WebGLRenderer({
      canvas: this.canvas,
      antialias: !this.isSoftwareRenderer,
      powerPreference: this.isSoftwareRenderer ? "default" : "high-performance",
      preserveDrawingBuffer: false,
    });
    const maxDpr = this.isSoftwareRenderer ? 1.0 : 2.0;
    this.renderer.setPixelRatio(Math.min(window.devicePixelRatio || 1, maxDpr));
    this.renderer.setSize(w, h, false);
    this.renderer.outputColorSpace = THREE.SRGBColorSpace;
    this.renderer.toneMapping = THREE.ACESFilmicToneMapping;
    this.renderer.toneMappingExposure = this._activePreset.exposure;
    this.renderer.shadowMap.enabled = true;
    this.renderer.shadowMap.type = THREE.PCFSoftShadowMap;

    this.canvas.addEventListener("webglcontextlost", (e) => {
      e.preventDefault();
      this._glContextLost = true;
    });
    this.canvas.addEventListener("webglcontextrestored", () => {
      this._glContextLost = false;
    });

    this.scene = new THREE.Scene();
    this.scene.background = new THREE.Color(this._activePreset.skyZenith);
    this.scene.fog = new THREE.FogExp2(
      this._activePreset.fogColor,
      this._activePreset.fogDensity
    );

    this.camera = new THREE.PerspectiveCamera(62, w / h, 0.14, 1300);
    this.camera.rotation.order = "YXZ";
    this.scene.add(this.camera);

    // Primary Moon / Sun directional shadow caster
    this.dirLight = new THREE.DirectionalLight(
      this._activePreset.dirColor,
      this._activePreset.dirIntensity
    );
    this.dirLight.castShadow = true;
    const shadowSize = this.isSoftwareRenderer ? 1024 : 2048;
    this.dirLight.shadow.mapSize.set(shadowSize, shadowSize);
    this.dirLight.position.set(-45, 52, -72);
    this.scene.add(this.dirLight);
    this.scene.add(this.dirLight.target);

    this.hemiLight = new THREE.HemisphereLight(
      this._activePreset.hemiSky,
      this._activePreset.hemiGround,
      this._activePreset.hemiIntensity
    );
    this.scene.add(this.hemiLight);

    // Real scene SpotLight + close bounce PointLight synced to character's 3D held horror flashlight
    this.flashlight = new THREE.SpotLight(
      "#fff1d6",
      4.8,
      68,
      Math.PI * 0.19,
      0.52,
      1.32
    );
    this.flashlight.castShadow = false;
    this.scene.add(this.flashlight);
    this.scene.add(this.flashlight.target);

    this.flashlightFill = new THREE.PointLight("#ffe8c2", 0.52, 11.5, 1.55);
    this.scene.add(this.flashlightFill);

    // OrbitControls (inactive during Walk mode, toggled via Tab or HUD)
    this.orbitControls = new OrbitControls(this.camera, this.canvas);
    this.orbitControls.enableDamping = true;
    this.orbitControls.dampingFactor = 0.07;
    this.orbitControls.maxPolarAngle = Math.PI * 0.492;
    this.orbitControls.minDistance = 2.0;
    this.orbitControls.maxDistance = 320.0;
    this.orbitControls.enabled = false;
  }

  _initWorld() {
    this.materials = createMaterialLibrary();
    this.world = new OpenCampusWorld(this.materials, 0x51a7c0de);
    this.scene.add(this.world.root);

    const shadowMapSize = this.isSoftwareRenderer ? 1024 : 2048;
    this.v5Lighting = configureAAASunShadowsAndAtmosphere(
      THREE,
      this.renderer,
      this.scene,
      this.dirLight,
      {
        hemiLight: this.hemiLight,
        camera: this.camera,
        isSoftwareRenderer: this.isSoftwareRenderer,
        staticShadowMapSize: shadowMapSize,
        shadowMapSize,
        halfExtentM: 64.0,
        dynamicShadowMapSize: this.isSoftwareRenderer ? 512 : 1024,
        dynamicHalfExtentM: 10.5,
        enableHorizonGlow: false,
        enableOpticsOverlay: false,
        bakeEnvironment: false,
        enableSpinStudioWindowLight: false,
        enableSpinStudioSunbeams: false,
        enableHorizonAerialPerspective: false,
      }
    );

    this.applyAtmosphere(state.atmosphere);
    this.setFlashlight(state.flashlightOn);
  }

  _bindBusAndPointerControls() {
    bus.on(DEMO_EVENTS.STATE_CHANGED, (evt) => {
      const action = evt && evt.action;
      if (action === DEMO_ACTIONS.SET_CAMERA_MODE) {
        this.setCameraMode(state.cameraMode);
      } else if (action === DEMO_ACTIONS.TOGGLE_FLASHLIGHT) {
        this.setFlashlight(state.flashlightOn);
      } else if (action === DEMO_ACTIONS.SET_ATMOSPHERE) {
        this.applyAtmosphere(state.atmosphere);
        this.setFlashlight(state.flashlightOn);
      } else if (action === DEMO_ACTIONS.SET_CHARACTER) {
        if (this.multiplayer?.connected) {
          this.multiplayer.swapCharacter();
        } else if (this.characters) {
          this.characters.setLocalCharacter(state.localCharacter);
        }
      }
    });
    bus.on(DEMO_EVENTS.ZONE_CHANGED, (zone) => {
      if (zone) {
        this.teleportTo(zone.x, zone.z, zone.yaw);
      }
    });
    bus.on(DEMO_ACTIONS.TELEPORT_XZ, (pt) => {
      if (pt) {
        this.teleportTo(pt.x, pt.z, this.playerYaw);
      }
    });
    bus.on(DEMO_ACTIONS.RESET, () => {
      this.resetSpawn();
    });

    this.canvas.style.touchAction = "none";
    this.canvas.addEventListener("contextmenu", (e) => {
      if (state.cameraMode === CAMERA_MODES.WALK) e.preventDefault();
    });
    this.canvas.addEventListener("pointerdown", (e) => {
      if (state.cameraMode !== CAMERA_MODES.WALK) return;
      if (e.pointerType === "mouse" && e.button === 2) {
        state.aiming = true;
        bus.emit(DEMO_EVENTS.STATE_CHANGED, { action: DEMO_ACTIONS.TOGGLE_AIM, state });
        return;
      }
      if (e.pointerType === "mouse" && e.button !== 0) return;
      if (this._lookPointerId !== null) return;
      this._lookPointerId = e.pointerId;
      this._isDraggingLook = true;
      this._lastDragX = e.clientX;
      this._lastDragY = e.clientY;
      if (
        e.pointerType === "mouse" &&
        document.pointerLockElement !== this.canvas &&
        typeof this.canvas.requestPointerLock === "function"
      ) {
        try {
          const maybePromise = this.canvas.requestPointerLock();
          if (maybePromise && typeof maybePromise.catch === "function") maybePromise.catch(() => {});
        } catch {
          // drag fallback
        }
      }
    });

    window.addEventListener("pointermove", (e) => {
      if (state.cameraMode !== CAMERA_MODES.WALK) return;
      if (document.pointerLockElement === this.canvas && e.pointerType === "mouse") {
        const dx = clamp(e.movementX || 0, -140, 140);
        const dy = clamp(e.movementY || 0, -140, 140);
        this._applyLook(dx * MOUSE_SENSITIVITY, dy * MOUSE_SENSITIVITY);
      } else if (this._isDraggingLook && e.pointerId === this._lookPointerId) {
        const dx = clamp(e.clientX - this._lastDragX, -140, 140);
        const dy = clamp(e.clientY - this._lastDragY, -140, 140);
        this._lastDragX = e.clientX;
        this._lastDragY = e.clientY;
        this._applyLook(dx * TOUCH_LOOK_SENSITIVITY, dy * TOUCH_LOOK_SENSITIVITY);
      }
    });

    const endLook = (e) => {
      if (e.pointerType === "mouse" && e.button === 2 && state.aiming) {
        state.aiming = false;
        bus.emit(DEMO_EVENTS.STATE_CHANGED, { action: DEMO_ACTIONS.TOGGLE_AIM, state });
      }
      if (e.pointerId === this._lookPointerId) {
        this._isDraggingLook = false;
        this._lookPointerId = null;
      }
    };
    window.addEventListener("pointerup", endLook);
    window.addEventListener("pointercancel", endLook);

    document.addEventListener("pointerlockchange", () => {
      const locked = document.pointerLockElement === this.canvas;
      if (state.pointerLocked !== locked) {
        state.pointerLocked = locked;
        bus.emit(DEMO_EVENTS.STATE_CHANGED, { action: "POINTER_LOCK", state });
      }
    });
  }

  async _loadMapAssets() {
    const loader = new GLTFLoader();
    this._reportPreload(8, "Decoding campus landmarks & terrain…");
    await this._yieldFrame();

    const [landmarksV2Scene, envV3Scene, treesV4Scene] = await Promise.all([
      parseInlineGlbScene(loader, decodeCampusLandmarksV2Glb, "campus_landmarks_v2"),
      parseInlineGlbScene(loader, decodeCampusEnvironmentV3Glb, "campus_environment_v3"),
      parseInlineGlbScene(loader, decodeTreesV4Glb, "trees_v4"),
    ]);
    this._reportPreload(36, "Decoding Canopy & Horizon ridges…");
    await this._yieldFrame();

    const [archV5Scene, canopyV6Scene, propsBridgeV6Scene] = await Promise.all([
      parseInlineGlbScene(loader, decodeCampusHorizonArchV5Glb, "campus_horizon_arch_v5"),
      parseInlineGlbScene(loader, decodeGradientCanopyV6Glb, "gradient_canopy_v6"),
      parseInlineGlbScene(loader, decodePropsAndBridgeV6Glb, "props_and_bridge_v6"),
    ]);
    this._reportPreload(58, "Assembling buildings, foliage & bridge…");
    await this._yieldFrame();

    if (typeof deplasticizeCampusPropMaterials === "function" && envV3Scene) {
      deplasticizeCampusPropMaterials(envV3Scene);
    }

    if (landmarksV2Scene || envV3Scene) {
      this.world.attachLandmarkAndGamePropGlbs({ landmarksV2Scene, envV3Scene });
    }
    if (treesV4Scene) {
      this.world.applyTreesV4Glb?.(treesV4Scene);
    }
    if (envV3Scene) {
      this.world.applyCampusEnvironmentV3Glb?.(envV3Scene);
    }
    if (archV5Scene) {
      this.world.applyCampusHorizonArchV5Glb?.(archV5Scene);
    }
    if (canopyV6Scene) {
      this.world.applyGradientCanopyV6Glb?.(canopyV6Scene);
    }
    if (propsBridgeV6Scene) {
      this.world.applyPropsAndBridgeV6Glb?.(propsBridgeV6Scene);
    }

    this.world.finalizeV5PropGrounding?.();
    this._reportPreload(72, "Constructing Backrooms Level 0 expansion…");

    try {
      await this.backrooms.load(this.scene);
    } catch (err) {
      console.warn("[CampusMap] Backrooms load warning:", err);
    }

    this._reportPreload(82, "Decoding Ronaldo, Messi, Torch & Stalker pack…");

    const waitFn = (typeof window !== "undefined" && window.__nativeSetTimeout) || setTimeout;
    if (this.materials?.readyPromise) {
      await Promise.race([
        this.materials.readyPromise.catch(() => {}),
        new Promise((r) => waitFn(r, 8000)),
      ]);
    }

    this.applyAtmosphere(state.atmosphere);

    if (typeof applyWorldCohesionShaderHook === "function" && this.world?.root) {
      const seenMats = new Set();
      this.world.root.traverse((obj) => {
        if (!obj.isMesh || !obj.material) return;
        const mats = Array.isArray(obj.material) ? obj.material : [obj.material];
        for (const m of mats) {
          if (!m || seenMats.has(m.uuid)) continue;
          seenMats.add(m.uuid);
          if (
            (!m.isMeshStandardMaterial && !m.isMeshPhysicalMaterial) ||
            m.userData?.v7SkipWorldCohesion ||
            m.userData?.isCustomRidgeShaderV7 ||
            m.userData?.isRefractiveGlassV7 ||
            m.userData?.v5AerialShaderInstalled ||
            m.userData?.isCampusWaterV6
          ) {
            continue;
          }
          applyWorldCohesionShaderHook(m, this.isSoftwareRenderer);
        }
      });
    }

    try {
      const trees = [...(this.world.decTreeTransforms || []), ...(this.world.redTreeTransforms || [])];
      this.characters = await loadCharacters(this.scene, {
        trees,
        backrooms: this.backrooms,
        initialCharacter: state.localCharacter,
        resolveCollisions: (x, z) => this._resolveCollisions(x, z),
      });
      if (this.multiplayer?.connected && state.coopPlayers.length > 0) {
        this.characters.syncRemoteRoster(state.coopPlayers, this.multiplayer.playerId);
      }
    } catch (err) {
      console.warn("[CampusMap] character load failed", err);
    }

    this._reportPreload(92, "Compiling shaders & shadows…");
    await this._yieldFrame();

    this.scene.updateMatrixWorld(true);
    this.camera.updateMatrixWorld(true);
    if (this.characters) {
      const groundY = getOpenWorldTerrainHeight(this.playerX, this.playerZ);
      this.camera.getWorldDirection(_camFwdScratch);
      this.characters.update(
        0,
        {
          x: this.playerX,
          y: groundY + this._posY,
          z: this.playerZ,
          vx: 0,
          vz: 0,
          lookYaw: this.playerYaw,
          lookPitch: this.playerPitch,
          worldAimDir: _camFwdScratch,
          sprint: false,
          flashlightOn: state.flashlightOn,
          aiming: state.aiming,
          camera: this.camera,
          inBackrooms: state.inBackrooms,
        },
        { isHost: true, incomingStalkers: null }
      );
      this._syncFlashlightRig();
    }
    this._updateWorldAndLighting(0, true);
    try {
      this.renderer.compile(this.scene, this.camera);
    } catch {
      // Non-fatal fallback on restricted drivers
    }
    this.renderer.render(this.scene, this.camera);

    this._reportPreload(100, "Map ready");
    state.ready = true;
    if (typeof window !== "undefined") {
      window.__DEMO_READY__ = true;
    }
    if (this.onPreloadComplete) {
      try {
        this.onPreloadComplete();
      } catch {
        // Ignore listener error
      }
    }
    bus.emit(DEMO_EVENTS.READY, { state });
    return true;
  }

  _applyLook(dYaw, dPitch) {
    this.playerYaw -= dYaw;
    this.playerPitch = clamp(this.playerPitch + dPitch, CAM_MIN_PITCH, CAM_MAX_PITCH);
  }

  jump() {
    if (state.cameraMode !== CAMERA_MODES.WALK) return;
    if (this._grounded) {
      this._velY = JUMP_IMPULSE_MPS;
      this._grounded = false;
    }
  }

  /** Analog joystick: x = right (-1..1), y = forward (-1..1). */
  setAnalog(x, y) {
    this.analog.x = clamp(Number(x) || 0, -1, 1);
    this.analog.y = clamp(Number(y) || 0, -1, 1);
  }

  setInputState(patch) {
    if (!patch) return;
    if (patch.forward !== undefined) this.input.forward = Boolean(patch.forward);
    if (patch.backward !== undefined) this.input.backward = Boolean(patch.backward);
    if (patch.left !== undefined) this.input.left = Boolean(patch.left);
    if (patch.right !== undefined) this.input.right = Boolean(patch.right);
    if (patch.sprint !== undefined) this.input.sprint = Boolean(patch.sprint);
  }

  clearInputs() {
    this.input.forward = false;
    this.input.backward = false;
    this.input.left = false;
    this.input.right = false;
    this.input.sprint = false;
    this._isDraggingLook = false;
    this._lookPointerId = null;
    this.analog.x = 0;
    this.analog.y = 0;
    if (state.aiming) {
      state.aiming = false;
      bus.emit(DEMO_EVENTS.STATE_CHANGED, { action: DEMO_ACTIONS.TOGGLE_AIM, state });
    }
  }

  setFlashlight(enabled) {
    const on = Boolean(enabled);
    state.flashlightOn = on;
    if (this.flashlight) this.flashlight.visible = on;
    if (this.flashlightFill) this.flashlightFill.visible = on;
  }

  applyAtmosphere(presetId) {
    const preset = ATMOSPHERE_PRESETS[presetId] || ATMOSPHERE_PRESETS.night;
    this._activePreset = preset;
    state.atmosphere = preset.id;

    if (Array.isArray(preset.moonDir)) {
      this._activeDirVec.set(preset.moonDir[0], preset.moonDir[1], preset.moonDir[2]).normalize();
    }

    if (this.scene) {
      if (this.scene.background && this.scene.background.isColor) {
        this.scene.background.set(preset.skyZenith);
      }
      if (this.scene.fog && this.scene.fog.isFogExp2) {
        this.scene.fog.color.set(preset.fogColor);
        this.scene.fog.density = preset.fogDensity;
      }
    }

    if (this.dirLight) {
      this.dirLight.color.set(preset.dirColor);
      this.dirLight.intensity = preset.dirIntensity;
    }

    if (this.hemiLight) {
      this.hemiLight.color.set(preset.hemiSky);
      this.hemiLight.groundColor.set(preset.hemiGround);
      this.hemiLight.intensity = preset.hemiIntensity;
    }

    if (this.renderer) {
      this.renderer.toneMappingExposure = preset.exposure;
    }

    if (this.world && typeof this.world.setAtmosphere === "function") {
      this.world.setAtmosphere(preset);
    }
  }

  setCameraMode(mode) {
    const next = mode === CAMERA_MODES.ORBIT ? CAMERA_MODES.ORBIT : CAMERA_MODES.WALK;
    state.cameraMode = next;

    if (next === CAMERA_MODES.ORBIT) {
      if (typeof document !== "undefined" && document.pointerLockElement === this.canvas) {
        try {
          document.exitPointerLock?.();
        } catch {
          // Ignore exitPointerLock rejection
        }
      }
      this._isDraggingLook = false;
      const groundY = getOpenWorldTerrainHeight(this.playerX, this.playerZ);
      this.orbitControls.target.set(this.playerX, groundY + 1.5, this.playerZ);
      const backX = Math.sin(this.playerYaw) * 32.0;
      const backZ = Math.cos(this.playerYaw) * 32.0;
      this.camera.position.set(this.playerX + backX, groundY + 22.0, this.playerZ + backZ);
      this.camera.lookAt(this.orbitControls.target);
      this.orbitControls.enabled = true;
      this.orbitControls.update();
    } else {
      this.orbitControls.enabled = false;
      this._syncWalkCamera(0);
    }
  }

  teleportTo(x, z, yaw = this.playerYaw) {
    const safeX = clamp(Number(x) || 0, WORLD_BOUNDS.minX + 2, WORLD_BOUNDS.maxX - 2);
    const safeZ = clamp(Number(z) || 0, WORLD_BOUNDS.minZ + 2, WORLD_BOUNDS.maxZ - 2);
    const resolved = this._resolveCollisions(safeX, safeZ);
    this.playerX = resolved.x;
    this.playerZ = resolved.z;
    this._posY = 0;
    this._velY = 0;
    this._grounded = true;
    if (Number.isFinite(yaw)) {
      this.playerYaw = yaw;
    }
    this._velX = 0;
    this._velZ = 0;
    const groundY = getOpenWorldTerrainHeight(this.playerX, this.playerZ);
    state.playerPos.x = this.playerX;
    state.playerPos.y = groundY + EYE_HEIGHT_M;
    state.playerPos.z = this.playerZ;
    state.playerYaw = this.playerYaw;

    if (state.cameraMode === CAMERA_MODES.ORBIT) {
      this.orbitControls.target.set(this.playerX, groundY + 1.5, this.playerZ);
      this.camera.position.set(this.playerX + 26, groundY + 20, this.playerZ + 28);
      this.orbitControls.update();
    } else {
      this._syncWalkCamera(0);
    }
    this._updateNearestZone();
  }

  resetSpawn() {
    const spawn = MAP_ZONES[0];
    this.playerPitch = 0.18;
    this.teleportTo(spawn.x, spawn.z, spawn.yaw);
    state.activeZone = spawn.id;
  }

  resize() {
    if (!this.canvas || !this.renderer || !this.camera) return;
    const w = Math.max(1, this.canvas.clientWidth || window.innerWidth || 1280);
    const h = Math.max(1, this.canvas.clientHeight || window.innerHeight || 720);
    const maxDpr = this.isSoftwareRenderer ? 1.0 : 2.0;
    this.renderer.setPixelRatio(Math.min(window.devicePixelRatio || 1, maxDpr));
    this.renderer.setSize(w, h, false);
    this.camera.aspect = w / h;
    this.camera.updateProjectionMatrix();
  }

  _resolveCollisions(x, z, radius = PLAYER_RADIUS_M) {
    let rx = clamp(x, WORLD_BOUNDS.minX + 1.5, WORLD_BOUNDS.maxX - 1.5);
    let rz = clamp(z, WORLD_BOUNDS.minZ + 1.5, WORLD_BOUNDS.maxZ - 1.5);

    const colliders = this.world?.getBuildingColliders?.();
    if (colliders && colliders.length > 0) {
      for (let i = 0; i < colliders.length; i++) {
        const box = colliders[i];
        const minX = box.minX - radius;
        const maxX = box.maxX + radius;
        const minZ = box.minZ - radius;
        const maxZ = box.maxZ + radius;
        if (rx > minX && rx < maxX && rz > minZ && rz < maxZ) {
          const dxLeft = rx - minX;
          const dxRight = maxX - rx;
          const dzTop = rz - minZ;
          const dzBot = maxZ - rz;
          const minPen = Math.min(dxLeft, dxRight, dzTop, dzBot);
          if (minPen === dxLeft) rx = minX;
          else if (minPen === dxRight) rx = maxX;
          else if (minPen === dzTop) rz = minZ;
          else rz = maxZ;
        }
      }
    }

    if (this.backrooms && this.backrooms.ready) {
      const br = this.backrooms.resolveCollisions(rx, rz, radius);
      rx = br.x;
      rz = br.z;
    }

    return { x: rx, z: rz };
  }

  _stepWalk(dt) {
    const moveFwd = clamp((this.input.forward ? 1 : 0) - (this.input.backward ? 1 : 0) + this.analog.y, -1, 1);
    const moveRight = clamp((this.input.right ? 1 : 0) - (this.input.left ? 1 : 0) + this.analog.x, -1, 1);
    const stick = Math.min(1, Math.hypot(moveFwd, moveRight));
    const isMovingInput = stick > 0.08;
    const stickSprint = Math.hypot(this.analog.x, this.analog.y) > 0.92;

    let targetVx = 0;
    let targetVz = 0;
    const sprinting = (this.input.sprint || stickSprint) && !state.aiming;
    this._sprinting = sprinting;
    const speedLimit =
      (sprinting ? SPRINT_SPEED_MPS : state.aiming ? 3.2 : WALK_SPEED_MPS) *
      (this.input.sprint ? 1 : Math.max(stick, 0.35));

    if (isMovingInput) {
      const sinY = Math.sin(this.playerYaw);
      const cosY = Math.cos(this.playerYaw);
      const fwdX = -sinY;
      const fwdZ = -cosY;
      const rightX = cosY;
      const rightZ = -sinY;

      let dirX = fwdX * moveFwd + rightX * moveRight;
      let dirZ = fwdZ * moveFwd + rightZ * moveRight;
      const len = Math.hypot(dirX, dirZ) || 1;
      dirX /= len;
      dirZ /= len;
      targetVx = dirX * speedLimit;
      targetVz = dirZ * speedLimit;
    }

    const blend = 1.0 - Math.exp(-15.0 * dt);
    this._velX += (targetVx - this._velX) * blend;
    this._velZ += (targetVz - this._velZ) * blend;

    const speed = Math.hypot(this._velX, this._velZ);
    state.playerSpeedMps = speed;
    state.isMoving = speed > 0.15;
    state.isSprinting = sprinting && state.isMoving;

    if (speed > 0.005) {
      const nextX = this.playerX + this._velX * dt;
      const slideX = this._resolveCollisions(nextX, this.playerZ);
      this.playerX = slideX.x;

      const nextZ = this.playerZ + this._velZ * dt;
      const slideZ = this._resolveCollisions(this.playerX, nextZ);
      this.playerZ = slideZ.z;
    }

    // Vertical jump & gravity
    if (!this._grounded || this._velY !== 0) {
      this._velY += GRAVITY_MPS2 * dt;
      this._posY += this._velY * dt;
      if (state.inBackrooms && this._posY > BACKROOMS_CEILING_Y - 1.95) {
        this._posY = BACKROOMS_CEILING_Y - 1.95;
        if (this._velY > 0) this._velY = 0;
      }
      if (this._posY <= 0) {
        this._posY = 0;
        this._velY = 0;
        this._grounded = true;
      }
    }

    this._syncWalkCamera(dt);
  }

  _syncWalkCamera(dt) {
    const inBackrooms = this.backrooms?.isInsideBackrooms?.(this.playerX, this.playerZ) || false;
    const inVestibule =
      this.playerX >= 47.0 && this.playerX <= 55.0 && this.playerZ >= 123.5 && this.playerZ <= 132.0;
    const tightEnclosure = inBackrooms || inVestibule;

    const targetDist = state.aiming ? (tightEnclosure ? 1.65 : 2.35) : tightEnclosure ? 2.15 : 3.85;
    const targetRight = state.aiming ? 0.54 : tightEnclosure ? 0.34 : 0.42;
    const camLerp = dt > 0 ? 1 - Math.exp(-12 * dt) : 1;
    this._camDistCurrent += (targetDist - this._camDistCurrent) * camLerp;
    this._camRightCurrent += (targetRight - this._camRightCurrent) * camLerp;

    const targetFov = state.aiming ? 53 : 62;
    if (Math.abs(this.camera.fov - targetFov) > 0.05) {
      this.camera.fov += (targetFov - this.camera.fov) * camLerp;
      this.camera.updateProjectionMatrix();
    }

    const groundY = getOpenWorldTerrainHeight(this.playerX, this.playerZ);
    const rightX = Math.cos(this.playerYaw);
    const rightZ = -Math.sin(this.playerYaw);

    const tx = this.playerX + rightX * this._camRightCurrent;
    const ty = groundY + this._posY + CAM_TARGET_HEIGHT_M;
    const tz = this.playerZ + rightZ * this._camRightCurrent;

    const effectivePitch = tightEnclosure
      ? clamp(this.playerPitch, -0.45, 0.55)
      : this.playerPitch;
    const cp = Math.cos(effectivePitch);

    let cx = tx + Math.sin(this.playerYaw) * cp * this._camDistCurrent;
    let cz = tz + Math.cos(this.playerYaw) * cp * this._camDistCurrent;
    let cy = ty + Math.sin(effectivePitch) * this._camDistCurrent + 0.28;

    // Prevent camera from clipping through Backrooms walls
    if (this.backrooms?.ready && tightEnclosure) {
      for (let step = 1; step <= 6; step++) {
        const u = step / 6;
        const sx = tx + (cx - tx) * u;
        const sz = tz + (cz - tz) * u;
        const res = this.backrooms.resolveCollisions(sx, sz, 0.28);
        if (Math.hypot(res.x - sx, res.z - sz) > 0.06) {
          const safeU = Math.max(0.22, (step - 1) / 6);
          cx = tx + (cx - tx) * safeU;
          cz = tz + (cz - tz) * safeU;
          cy = ty + (cy - ty) * safeU;
          break;
        }
      }
      if (cy > BACKROOMS_CEILING_Y - 0.28) {
        cy = BACKROOMS_CEILING_Y - 0.28;
      }
    }

    const camGround = getOpenWorldTerrainHeight(cx, cz) + 0.35;
    if (cy < camGround) cy = camGround;

    this.camera.position.set(cx, cy, cz);
    this.camera.lookAt(tx, ty, tz);

    state.playerPos.x = this.playerX;
    state.playerPos.y = groundY + this._posY + EYE_HEIGHT_M;
    state.playerPos.z = this.playerZ;
    state.playerYaw = this.playerYaw;
    state.playerPitch = this.playerPitch;
  }

  _updateNearestZone() {
    if (state.inBackrooms) {
      state.activeZone = "backrooms";
      return;
    }
    let bestId = state.activeZone;
    let bestDistSq = Infinity;
    for (let i = 0; i < MAP_ZONES.length; i++) {
      const z = MAP_ZONES[i];
      const dx = this.playerX - z.x;
      const dz = this.playerZ - z.z;
      const d2 = dx * dx + dz * dz;
      if (d2 < bestDistSq) {
        bestDistSq = d2;
        bestId = z.id;
      }
    }
    state.activeZone = bestId;
  }

  _syncFlashlightRig() {
    if (!this.flashlight || !this.flashlightFill) return;
    const isBackrooms = state.inBackrooms;
    const baseSpot =
      this._activePreset.id === "night"
        ? 4.8
        : this._activePreset.id === "dusk"
          ? 3.5
          : 1.8;
    const baseFill =
      this._activePreset.id === "night"
        ? 0.52
        : this._activePreset.id === "dusk"
          ? 0.34
          : 0.14;

    const aimMult = state.aiming ? 1.42 : 1.0;
    const brMult = isBackrooms ? 1.25 : 1.0;
    this.flashlight.intensity = baseSpot * aimMult * brMult;
    this.flashlight.angle = state.aiming ? Math.PI * 0.13 : Math.PI * 0.19;
    this.flashlight.distance = state.aiming ? 84 : 68;
    this.flashlightFill.intensity = baseFill * brMult;

    if (state.cameraMode === CAMERA_MODES.WALK && this.characters?.localHero) {
      const hero = this.characters.localHero;
      this.flashlight.position.copy(hero.lensWorldPos);
      this.flashlight.target.position
        .copy(hero.lensWorldPos)
        .addScaledVector(hero.lensWorldDir, 24.0);
      this.flashlight.target.updateMatrixWorld();
      this.flashlightFill.position
        .copy(hero.lensWorldPos)
        .addScaledVector(hero.lensWorldDir, 0.45);
    } else {
      this.camera.getWorldDirection(_camFwdScratch);
      this.flashlight.position.copy(this.camera.position);
      this.flashlight.target.position
        .copy(this.camera.position)
        .addScaledVector(_camFwdScratch, 24.0);
      this.flashlight.target.updateMatrixWorld();
      this.flashlightFill.position
        .copy(this.camera.position)
        .addScaledVector(_camFwdScratch, 0.45);
    }
  }

  _updateWorldAndLighting(dt, forceStaticRebuild = false) {
    const snap = this._worldSnap;
    const groundY = getOpenWorldTerrainHeight(this.playerX, this.playerZ);
    const fwdX = -Math.sin(this.playerYaw);
    const fwdZ = -Math.cos(this.playerYaw);

    snap.x = this.playerX;
    snap.y = groundY;
    snap.z = this.playerZ;
    snap.forwardX = fwdX;
    snap.forwardZ = fwdZ;
    snap.groundY = groundY;
    snap.sequenceTime = this._elapsedSec;
    snap.elapsedTime = this._elapsedSec;

    this.world.update(dt, snap, snap, this.camera);

    // Blend fog & background smoothly when inside the Backrooms Level 0 complex
    const targetBr = state.inBackrooms ? 1.0 : 0.0;
    const fogLerp = dt > 0 ? 1 - Math.exp(-5.0 * dt) : 1.0;
    this._backroomsBlend += (targetBr - this._backroomsBlend) * fogLerp;

    if (this.scene?.fog?.isFogExp2 && this.scene?.background?.isColor) {
      _presetFogColor.set(this._activePreset.fogColor);
      _presetSkyColor.set(this._activePreset.skyZenith);
      this.scene.fog.color.copy(_presetFogColor).lerp(_backroomsFogColor, this._backroomsBlend);
      this.scene.fog.density = THREE.MathUtils.lerp(
        this._activePreset.fogDensity,
        0.048,
        this._backroomsBlend
      );
      this.scene.background.copy(_presetSkyColor).lerp(_backroomsSkyColor, this._backroomsBlend);
    }

    if (this.v5Lighting?.updateFrame) {
      const fo = this._lightingFrameOpts;
      fo.enclosedGym = (Math.abs(this.playerX) < 18.0 && this.playerZ > 131.2) || state.inBackrooms;
      fo.sequenceTime = this._elapsedSec;
      fo.isSoftwareRenderer = this.isSoftwareRenderer;
      fo.enforceGoldenHourPalette = false;
      fo.sunDir = this._activeDirVec;
      fo.sunIntensity = this._activePreset.dirIntensity * (1.0 - 0.85 * this._backroomsBlend);
      fo.forceStaticRebuild = forceStaticRebuild;
      this.v5Lighting.updateFrame(snap, this.camera, fo);
    }
  }

  advanceFrame(dt) {
    if (this._glContextLost) return;
    const safeDt = Math.min(Math.max(Number(dt) || 0, 0), 0.08);
    this._elapsedSec += safeDt;

    if (this._alertClearTimer > 0) {
      this._alertClearTimer -= safeDt;
      if (this._alertClearTimer <= 0 && state.stalkerAlert) {
        state.stalkerAlert = "";
        bus.emit(DEMO_EVENTS.STATE_CHANGED, { action: "ALERT_CLEAR", state });
      }
    }

    if (state.cameraMode === CAMERA_MODES.ORBIT) {
      this.orbitControls.update();
      state.playerSpeedMps = 0;
      state.isMoving = false;
      state.isSprinting = false;
    } else {
      this._stepWalk(safeDt);
    }

    // Track Backrooms realm transitions & check No-Clip anomalies
    const nowInBackrooms = this.backrooms?.isInsideBackrooms?.(this.playerX, this.playerZ) || false;
    if (nowInBackrooms !== state.inBackrooms) {
      state.inBackrooms = nowInBackrooms;
      this._updateNearestZone();
      if (nowInBackrooms && !state.stalkerAlert) {
        this._setAlert("LEVEL 0 · THE BACKROOMS", 2.8);
      }
      bus.emit(DEMO_EVENTS.STATE_CHANGED, { action: "REALM_CHANGE", state });
    }

    if (this.backrooms?.ready) {
      const anomaly = this.backrooms.update(safeDt, this._elapsedSec, this.playerX, this.playerZ);
      if (anomaly) {
        this.teleportTo(
          BACKROOMS_WARP_ARRIVAL.x,
          BACKROOMS_WARP_ARRIVAL.z,
          BACKROOMS_WARP_ARRIVAL.yaw
        );
        state.inBackrooms = true;
        this._updateNearestZone();
        this._setAlert("NO-CLIPPED INTO THE BACKROOMS · FIND THE NORTH EXIT", 4.5);
      }
    }

    if (this._elapsedSec - this._lastZoneCheckSec >= 0.25) {
      this._lastZoneCheckSec = this._elapsedSec;
      this._updateNearestZone();
    }

    // Compute world aim direction from camera reticle target so character torch shines where player looks
    this.camera.updateMatrixWorld();
    this.camera.getWorldDirection(_camFwdScratch);
    _camRightScratch.set(Math.cos(this.playerYaw), 0, -Math.sin(this.playerYaw));
    const groundY = getOpenWorldTerrainHeight(this.playerX, this.playerZ);
    _handApproxScratch.set(
      this.playerX + _camRightScratch.x * 0.22,
      groundY + this._posY + 1.32,
      this.playerZ + _camRightScratch.z * 0.22
    );
    _aimTargetScratch.copy(this.camera.position).addScaledVector(_camFwdScratch, 22.0);
    _aimDirScratch.copy(_aimTargetScratch).sub(_handApproxScratch).normalize();

    if (this.characters) {
      const charRes = this.characters.update(
        safeDt,
        {
          x: this.playerX,
          y: groundY + this._posY,
          z: this.playerZ,
          vx: this._velX,
          vz: this._velZ,
          lookYaw: this.playerYaw,
          lookPitch: this.playerPitch,
          worldAimDir: _aimDirScratch,
          sprint: this._sprinting,
          flashlightOn: state.flashlightOn,
          aiming: state.aiming,
          camera: this.camera,
          inBackrooms: state.inBackrooms,
        },
        {
          isHost: !this.multiplayer?.connected || this.multiplayer.isHost,
          incomingStalkers: this.multiplayer?.incomingStalkers,
        }
      );

      if (charRes?.stalkerAlert === "stalker_dash" && !state.stalkerAlert) {
        this._setAlert("SOMETHING JUST SPRINTED PAST YOU", 2.4);
      }

      if (this.multiplayer?.connected) {
        this.multiplayer.sendPlayerState({
          x: this.playerX,
          y: groundY + this._posY,
          z: this.playerZ,
          yaw: this.playerYaw,
          pitch: this.playerPitch,
          vx: this._velX,
          vz: this._velZ,
          sprint: this._sprinting,
          flashlightOn: state.flashlightOn,
          aiming: state.aiming,
          inBackrooms: state.inBackrooms,
        });
        if (this.multiplayer.isHost) {
          this.multiplayer.sendStalkers(this.characters.stalkerPack.serializeForNetwork());
        }
      }
    }

    this._syncFlashlightRig();
    this._updateWorldAndLighting(safeDt, false);
    this.renderer.render(this.scene, this.camera);
  }
}

export const DemoCore = CampusMapApp;
