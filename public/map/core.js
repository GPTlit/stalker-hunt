/**
 * core.js — Mountain View 3D Campus Horror Map Explorer.
 * Preserves only the 3D campus map, lighting atmospheres (Night/Dusk/Day),
 * camera-mounted flashlight, first-person walk + orbit modes, and 6 map GLBs.
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

const EYE_HEIGHT_M = 1.70;
const WALK_SPEED_MPS = 4.6;
const SPRINT_SPEED_MPS = 8.6;
const PLAYER_RADIUS_M = 0.45;
const MAX_PITCH_RAD = (78 * Math.PI) / 180;
const MOUSE_SENSITIVITY = 0.0022;

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
    this._velX = 0;
    this._velZ = 0;
    this._bobPhase = 0;
    this._elapsedSec = 0;
    this._lastZoneCheckSec = -10;
    this._isDraggingLook = false;
    this._lastDragX = 0;
    this._lastDragY = 0;

    this.input = {
      forward: false,
      backward: false,
      left: false,
      right: false,
      sprint: false,
    };

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

    // Sync initial frame 0 camera and world state immediately
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

    this.camera = new THREE.PerspectiveCamera(62, w / h, 0.15, 1300);
    this.camera.rotation.order = "YXZ";

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

    // Camera-attached horror exploration flashlight (SpotLight + close bounce PointLight)
    this.flashlight = new THREE.SpotLight(
      "#fff1d6",
      4.2,
      62,
      Math.PI * 0.19,
      0.52,
      1.35
    );
    this.flashlight.position.set(0.14, -0.10, -0.05);
    this.flashlight.target.position.set(0.0, -0.12, -16.0);
    this.flashlight.castShadow = false;
    this.camera.add(this.flashlight);
    this.camera.add(this.flashlight.target);

    this.flashlightFill = new THREE.PointLight("#ffe8c2", 0.42, 10.5, 1.6);
    this.flashlightFill.position.set(0.0, 0.0, -0.45);
    this.camera.add(this.flashlightFill);

    this.scene.add(this.camera);

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
    bus.on(DEMO_ACTIONS.SET_CAMERA_MODE, () => {
      this.setCameraMode(state.cameraMode);
    });
    bus.on(DEMO_ACTIONS.TOGGLE_FLASHLIGHT, () => {
      this.setFlashlight(state.flashlightOn);
    });
    bus.on(DEMO_ACTIONS.SET_ATMOSPHERE, () => {
      this.applyAtmosphere(state.atmosphere);
      this.setFlashlight(state.flashlightOn);
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

    // Pointer lock & drag fallback for first-person look in Walk mode
    this.canvas.addEventListener("pointerdown", (e) => {
      if (state.cameraMode !== CAMERA_MODES.WALK || e.button !== 0) return;
      this._isDraggingLook = true;
      this._lastDragX = e.clientX;
      this._lastDragY = e.clientY;
      if (
        document.pointerLockElement !== this.canvas &&
        typeof this.canvas.requestPointerLock === "function"
      ) {
        try {
          const maybePromise = this.canvas.requestPointerLock();
          if (maybePromise && typeof maybePromise.catch === "function") {
            maybePromise.catch(() => {});
          }
        } catch {
          // Iframe / headless environments stay usable via drag-to-look fallback
        }
      }
    });

    window.addEventListener("pointermove", (e) => {
      if (state.cameraMode !== CAMERA_MODES.WALK) return;
      if (document.pointerLockElement === this.canvas) {
        const dx = clamp(e.movementX || 0, -140, 140);
        const dy = clamp(e.movementY || 0, -140, 140);
        this.playerYaw -= dx * MOUSE_SENSITIVITY;
        this.playerPitch = clamp(
          this.playerPitch - dy * MOUSE_SENSITIVITY,
          -MAX_PITCH_RAD,
          MAX_PITCH_RAD
        );
      } else if (this._isDraggingLook) {
        const dx = clamp(e.clientX - this._lastDragX, -140, 140);
        const dy = clamp(e.clientY - this._lastDragY, -140, 140);
        this._lastDragX = e.clientX;
        this._lastDragY = e.clientY;
        this.playerYaw -= dx * MOUSE_SENSITIVITY * 1.2;
        this.playerPitch = clamp(
          this.playerPitch - dy * MOUSE_SENSITIVITY * 1.2,
          -MAX_PITCH_RAD,
          MAX_PITCH_RAD
        );
      }
    });

    window.addEventListener("pointerup", () => {
      this._isDraggingLook = false;
    });
    window.addEventListener("pointercancel", () => {
      this._isDraggingLook = false;
    });

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
    this._reportPreload(38, "Decoding Canopy & Horizon ridges…");
    await this._yieldFrame();

    const [archV5Scene, canopyV6Scene, propsBridgeV6Scene] = await Promise.all([
      parseInlineGlbScene(loader, decodeCampusHorizonArchV5Glb, "campus_horizon_arch_v5"),
      parseInlineGlbScene(loader, decodeGradientCanopyV6Glb, "gradient_canopy_v6"),
      parseInlineGlbScene(loader, decodePropsAndBridgeV6Glb, "props_and_bridge_v6"),
    ]);
    this._reportPreload(62, "Assembling buildings, foliage & bridge…");
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
    this._reportPreload(78, "Decoding campus surface textures…");

    const waitFn = (typeof window !== "undefined" && window.__nativeSetTimeout) || setTimeout;
    if (this.materials?.readyPromise) {
      await Promise.race([
        this.materials.readyPromise.catch(() => {}),
        new Promise((r) => waitFn(r, 8000)),
      ]);
    }

    // Re-apply active atmosphere preset so newly attached GLB emissives & ridge shaders sync cleanly
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

    this._reportPreload(90, "Compiling shaders & shadows…");
    await this._yieldFrame();

    this.scene.updateMatrixWorld(true);
    this.camera.updateMatrixWorld(true);
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
  }

  setFlashlight(enabled) {
    const on = Boolean(enabled);
    state.flashlightOn = on;
    if (this.flashlight) {
      this.flashlight.visible = on;
    }
    if (this.flashlightFill) {
      this.flashlightFill.visible = on;
    }
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

    if (this.flashlight) {
      this.flashlight.intensity = preset.id === "night" ? 4.4 : preset.id === "dusk" ? 3.2 : 1.6;
    }
    if (this.flashlightFill) {
      this.flashlightFill.intensity = preset.id === "night" ? 0.44 : preset.id === "dusk" ? 0.28 : 0.12;
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
    this.playerPitch = -0.02;
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

  _resolveCollisions(x, z) {
    let rx = clamp(x, WORLD_BOUNDS.minX + 1.5, WORLD_BOUNDS.maxX - 1.5);
    let rz = clamp(z, WORLD_BOUNDS.minZ + 1.5, WORLD_BOUNDS.maxZ - 1.5);
    const colliders = this.world?.getBuildingColliders?.();
    if (!colliders || colliders.length === 0) {
      return { x: rx, z: rz };
    }

    const r = PLAYER_RADIUS_M;
    for (let i = 0; i < colliders.length; i++) {
      const box = colliders[i];
      const minX = box.minX - r;
      const maxX = box.maxX + r;
      const minZ = box.minZ - r;
      const maxZ = box.maxZ + r;
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
    return { x: rx, z: rz };
  }

  _stepWalk(dt) {
    const moveFwd = (this.input.forward ? 1 : 0) - (this.input.backward ? 1 : 0);
    const moveRight = (this.input.right ? 1 : 0) - (this.input.left ? 1 : 0);
    const isMovingInput = moveFwd !== 0 || moveRight !== 0;

    let targetVx = 0;
    let targetVz = 0;
    const speedLimit = this.input.sprint ? SPRINT_SPEED_MPS : WALK_SPEED_MPS;

    if (isMovingInput) {
      const sinY = Math.sin(this.playerYaw);
      const cosY = Math.cos(this.playerYaw);
      // Forward vector for yaw=0 is (0, -1); Right vector is (1, 0)
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
    state.isSprinting = this.input.sprint && state.isMoving;

    if (speed > 0.005) {
      const nextX = this.playerX + this._velX * dt;
      const slideX = this._resolveCollisions(nextX, this.playerZ);
      this.playerX = slideX.x;

      const nextZ = this.playerZ + this._velZ * dt;
      const slideZ = this._resolveCollisions(this.playerX, nextZ);
      this.playerZ = slideZ.z;
    }

    this._syncWalkCamera(dt, speed);
  }

  _syncWalkCamera(dt, speed = 0) {
    const groundY = getOpenWorldTerrainHeight(this.playerX, this.playerZ);
    let bobOffset = 0;
    if (speed > 0.25 && dt > 0) {
      const bobRate = this.input.sprint ? 12.5 : 8.5;
      this._bobPhase += dt * bobRate;
      const amp = Math.min(1.0, speed / WALK_SPEED_MPS) * (this.input.sprint ? 0.042 : 0.026);
      bobOffset = Math.sin(this._bobPhase) * amp;
    }
    const eyeY = groundY + EYE_HEIGHT_M + bobOffset;

    this.camera.position.set(this.playerX, eyeY, this.playerZ);
    this.camera.rotation.set(this.playerPitch, this.playerYaw, 0, "YXZ");

    state.playerPos.x = this.playerX;
    state.playerPos.y = eyeY;
    state.playerPos.z = this.playerZ;
    state.playerYaw = this.playerYaw;
    state.playerPitch = this.playerPitch;
  }

  _updateNearestZone() {
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

    if (this.v5Lighting?.updateFrame) {
      const fo = this._lightingFrameOpts;
      fo.enclosedGym = Math.abs(this.playerX) < 18.0 && this.playerZ > 131.2;
      fo.sequenceTime = this._elapsedSec;
      fo.isSoftwareRenderer = this.isSoftwareRenderer;
      fo.enforceGoldenHourPalette = false;
      fo.sunDir = this._activeDirVec;
      fo.sunIntensity = this._activePreset.dirIntensity;
      fo.forceStaticRebuild = forceStaticRebuild;
      this.v5Lighting.updateFrame(snap, this.camera, fo);
    }
  }

  advanceFrame(dt) {
    if (this._glContextLost) return;
    const safeDt = Math.min(Math.max(Number(dt) || 0, 0), 0.08);
    this._elapsedSec += safeDt;

    if (state.cameraMode === CAMERA_MODES.ORBIT) {
      this.orbitControls.update();
      state.playerSpeedMps = 0;
      state.isMoving = false;
      state.isSprinting = false;
    } else {
      this._stepWalk(safeDt);
    }

    if (this._elapsedSec - this._lastZoneCheckSec >= 0.25) {
      this._lastZoneCheckSec = this._elapsedSec;
      this._updateNearestZone();
    }

    this._updateWorldAndLighting(safeDt, false);
    this.renderer.render(this.scene, this.camera);
  }
}

export const DemoCore = CampusMapApp;
