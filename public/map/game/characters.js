/**
 * characters.js — Third-person hero (Soldier.glb) and the Watcher stalker (Xbot.glb).
 * The Watcher hides near trees, watches the player from afar, and runs into the
 * woods once the player looks straight at him or gets too close.
 */
import * as THREE from "../vendor/three.module.js";
import { GLTFLoader } from "../vendor/GLTFLoader.js";
import { getOpenWorldTerrainHeight } from "../rig/kin.js";

// Hero feel
export const HERO_MODEL_YAW_OFFSET = 0; // Soldier.glb faces -Z
const HERO_TURN_RATE = 12.0;

// Watcher tuning
const WATCH_MIN_M = 20;
const WATCH_MAX_M = 38;
const TOO_CLOSE_M = 11;
const SEEN_CONE_RAD = (16 * Math.PI) / 180;
const SEEN_TRIGGER_S = 0.35;
const FLEE_SPEED_MPS = 8.5;
const FLEE_DURATION_S = 4.5;
const RELOCATE_AFTER_S = 22;

function loadGlb(url) {
  return new Promise((resolve) => {
    new GLTFLoader().load(url, resolve, undefined, (err) => {
      console.warn("[characters] failed to load", url, err);
      resolve(null);
    });
  });
}

function wrapAngle(a) {
  while (a > Math.PI) a -= Math.PI * 2;
  while (a < -Math.PI) a += Math.PI * 2;
  return a;
}

class Animated {
  constructor(gltf, aliases) {
    this.root = gltf.scene;
    this.mixer = new THREE.AnimationMixer(this.root);
    this.actions = {};
    for (const [key, name] of Object.entries(aliases)) {
      const clip = gltf.animations.find((c) => c.name === name);
      if (clip) this.actions[key] = this.mixer.clipAction(clip);
    }
    this.current = null;
    this.root.traverse((o) => {
      if (o.isMesh) {
        o.castShadow = true;
        o.frustumCulled = false;
      }
    });
  }
  play(key, fade = 0.25) {
    if (this.current === key) return;
    const next = this.actions[key];
    if (!next) return;
    const prev = this.current ? this.actions[this.current] : null;
    next.reset().setEffectiveWeight(1).fadeIn(fade).play();
    if (prev) prev.fadeOut(fade);
    this.current = key;
  }
  update(dt) {
    this.mixer.update(dt);
  }
}

export class Hero {
  constructor(anim) {
    this.anim = anim;
    this.root = anim.root;
    this.faceYaw = 0;
    anim.play("idle", 0);
  }
  /** x,z: world; vx,vz: velocity; sprint bool */
  update(dt, x, z, vx, vz, sprint) {
    const y = getOpenWorldTerrainHeight(x, z);
    this.root.position.set(x, y, z);
    const speed = Math.hypot(vx, vz);
    if (speed > 0.3) {
      const target = Math.atan2(-vx, -vz);
      this.faceYaw += wrapAngle(target - this.faceYaw) * (1 - Math.exp(-HERO_TURN_RATE * dt));
    }
    this.root.rotation.y = this.faceYaw + HERO_MODEL_YAW_OFFSET;
    if (speed < 0.3) this.anim.play("idle");
    else if (sprint && speed > 5.5) this.anim.play("run");
    else this.anim.play("walk");
    const walkAct = this.anim.actions.walk;
    if (walkAct) walkAct.timeScale = Math.max(0.6, Math.min(1.4, speed / 3.2));
    this.anim.update(dt);
  }
}

export class Watcher {
  constructor(anim, { trees, resolveCollisions }) {
    this.anim = anim;
    this.root = anim.root;
    this.trees = trees;
    this.resolveCollisions = resolveCollisions;
    this.mode = "hidden"; // hidden | watch | flee
    this.timer = 0;
    this.seenTimer = 0;
    this.x = 0;
    this.z = 0;
    this.fleeDirX = 0;
    this.fleeDirZ = 0;
    this.root.visible = false;
    this._tmp = new THREE.Vector3();
    this._frustum = new THREE.Frustum();
    this._mat = new THREE.Matrix4();
    this.respawnDelay = 6;
  }

  _inView(camera, x, y, z) {
    this._mat.multiplyMatrices(camera.projectionMatrix, camera.matrixWorldInverse);
    this._frustum.setFromProjectionMatrix(this._mat);
    this._tmp.set(x, y, z);
    return this._frustum.containsPoint(this._tmp);
  }

  _pickHideSpot(px, pz, camera) {
    const candidates = [];
    for (const t of this.trees) {
      const d = Math.hypot(t.x - px, t.z - pz);
      if (d < WATCH_MIN_M || d > WATCH_MAX_M) continue;
      // hide on the far side of the trunk, a step to the side so he peeks out
      const ux = (t.x - px) / d;
      const uz = (t.z - pz) / d;
      const side = Math.random() < 0.5 ? -1 : 1;
      const hx = t.x + ux * 1.3 - uz * 0.9 * side;
      const hz = t.z + uz * 1.3 + ux * 0.9 * side;
      if (this._inView(camera, hx, getOpenWorldTerrainHeight(hx, hz) + 1, hz)) continue;
      candidates.push({ x: hx, z: hz });
    }
    if (candidates.length === 0) {
      // open ground fallback: somewhere behind the player
      const fwd = camera.getWorldDirection(this._tmp);
      const ang = Math.atan2(-fwd.x, -fwd.z) + (Math.random() - 0.5) * 2.2;
      const r = WATCH_MIN_M + Math.random() * (WATCH_MAX_M - WATCH_MIN_M);
      return this.resolveCollisions(px + Math.sin(ang) * r, pz + Math.cos(ang) * r);
    }
    return candidates[Math.floor(Math.random() * candidates.length)];
  }

  update(dt, px, pz, camera) {
    this.timer += dt;
    const dx = px - this.x;
    const dz = pz - this.z;
    const dist = Math.hypot(dx, dz);

    if (this.mode === "hidden") {
      this.root.visible = false;
      if (this.timer > this.respawnDelay) {
        const spot = this._pickHideSpot(px, pz, camera);
        this.x = spot.x;
        this.z = spot.z;
        this.mode = "watch";
        this.timer = 0;
        this.seenTimer = 0;
        this.anim.play("idle", 0);
      }
    } else if (this.mode === "watch") {
      this.root.visible = true;
      this.anim.play("idle");
      // stare at the player
      this.root.rotation.y = Math.atan2(dx, dz);
      const headY = getOpenWorldTerrainHeight(this.x, this.z) + 1.5;
      const fwd = camera.getWorldDirection(this._tmp).clone();
      const toW = new THREE.Vector3(this.x - camera.position.x, headY - camera.position.y, this.z - camera.position.z);
      const angle = fwd.angleTo(toW);
      const looking = angle < SEEN_CONE_RAD && toW.length() < 70;
      this.seenTimer = looking ? this.seenTimer + dt : Math.max(0, this.seenTimer - dt * 0.5);
      if (this.seenTimer > SEEN_TRIGGER_S || dist < TOO_CLOSE_M) {
        this.mode = "flee";
        this.timer = 0;
        const len = dist || 1;
        // run away from the player, veering into the woods
        const veer = (Math.random() - 0.5) * 0.9;
        const ax = -dx / len;
        const az = -dz / len;
        this.fleeDirX = ax * Math.cos(veer) - az * Math.sin(veer);
        this.fleeDirZ = ax * Math.sin(veer) + az * Math.cos(veer);
      } else if (this.timer > RELOCATE_AFTER_S && !this._inView(camera, this.x, headY, this.z)) {
        this.mode = "hidden";
        this.timer = 0;
        this.respawnDelay = 1.5;
      }
    } else if (this.mode === "flee") {
      this.anim.play("run", 0.15);
      const nx = this.x + this.fleeDirX * FLEE_SPEED_MPS * dt;
      const nz = this.z + this.fleeDirZ * FLEE_SPEED_MPS * dt;
      const r = this.resolveCollisions(nx, nz);
      this.x = r.x;
      this.z = r.z;
      this.root.rotation.y = Math.atan2(this.fleeDirX, this.fleeDirZ);
      if (this.timer > FLEE_DURATION_S) {
        this.mode = "hidden";
        this.timer = 0;
        this.respawnDelay = 8 + Math.random() * 10;
      }
    }

    this.root.position.set(this.x, getOpenWorldTerrainHeight(this.x, this.z), this.z);
    this.anim.update(dt);
  }
}

function makeWatcherLook(root) {
  const skin = new THREE.MeshStandardMaterial({ color: "#0b0b0d", roughness: 0.85, metalness: 0.05 });
  let head = null;
  root.traverse((o) => {
    if (o.isMesh || o.isSkinnedMesh) o.material = skin;
    if (o.isBone && /Head$/i.test(o.name) && !head) head = o;
  });
  if (head) {
    const eyeMat = new THREE.MeshBasicMaterial({ color: "#ff2a1a", fog: false });
    const eyeGeo = new THREE.SphereGeometry(2.2, 8, 6); // bone space is in cm
    for (const sx of [-4.2, 4.2]) {
      const eye = new THREE.Mesh(eyeGeo, eyeMat);
      eye.position.set(sx, 10, 9);
      head.add(eye);
    }
  }
  root.scale.setScalar(1.08);
}

export async function loadCharacters(scene, opts) {
  const [heroGltf, watcherGltf] = await Promise.all([
    loadGlb("./assets/chars/soldier.glb"),
    loadGlb("./assets/chars/xbot.glb"),
  ]);
  let hero = null;
  let watcher = null;
  if (heroGltf) {
    hero = new Hero(new Animated(heroGltf, { idle: "Idle", walk: "Walk", run: "Run" }));
    scene.add(hero.root);
  }
  if (watcherGltf) {
    makeWatcherLook(watcherGltf.scene);
    watcher = new Watcher(new Animated(watcherGltf, { idle: "idle", walk: "walk", run: "run" }), opts);
    scene.add(watcher.root);
  }
  return { hero, watcher };
}
