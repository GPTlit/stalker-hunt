/**
 * characters.js — Cristiano Ronaldo (main), Lionel Messi (co-op friend),
 * procedural character-space skeletal animation, right-hand 3D horror flashlight
 * pointing/aiming, and a multi-unit Stalker Pack (Xbot.glb) that hides, stalks,
 * sprints faster than the player, and flash-dashes across the player's path.
 */
import * as THREE from "../vendor/three.module.js";
import { GLTFLoader } from "../vendor/GLTFLoader.js";
import * as SkeletonUtils from "../vendor/SkeletonUtils.js";
import { getOpenWorldTerrainHeight } from "../rig/kin.js";

const HERO_TURN_RATE = 13.0;
const STALKER_COUNT = 5;

const _tmpV1 = new THREE.Vector3();
const _tmpV2 = new THREE.Vector3();
const _tmpV3 = new THREE.Vector3();
const _tmpQ1 = new THREE.Quaternion();
const _tmpQ2 = new THREE.Quaternion();
const _tmpQ3 = new THREE.Quaternion();
const _tmpMat4 = new THREE.Matrix4();
const _upVec = new THREE.Vector3(0, 1, 0);
const _fwdNegZ = new THREE.Vector3(0, 0, -1);

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

function findBone(root, patterns) {
  let found = null;
  root.traverse((o) => {
    if (found || !o.isBone) return;
    for (const pat of patterns) {
      if (pat.test(o.name)) {
        found = o;
        return;
      }
    }
  });
  return found;
}

function computeDirInSpace(fromBone, toBone, fallbackDir, charRoot) {
  if (!fromBone || !toBone) return fallbackDir.clone().normalize();
  fromBone.getWorldPosition(_tmpV1);
  toBone.getWorldPosition(_tmpV2);
  charRoot.worldToLocal(_tmpV1);
  charRoot.worldToLocal(_tmpV2);
  const dir = _tmpV2.clone().sub(_tmpV1);
  if (dir.lengthSq() < 1e-6) return fallbackDir.clone().normalize();
  return dir.normalize();
}

/**
 * Builds the 3D Horror Flashlight assembly (loaded horror_game_flashlight_download_game-ready.glb
 * + glowing lens disc + subtle additive beam cone).
 * Local space convention of returned Group: -Z = beam forward, +Y = top button up.
 */
function createFlashlightAttachment(flashlightGltf, { includeSpot = false } = {}) {
  const holder = new THREE.Group();
  holder.name = "HorrorFlashlightHolder";

  if (flashlightGltf && flashlightGltf.scene) {
    const meshRoot = flashlightGltf.scene.clone(true);
    meshRoot.traverse((o) => {
      if (o.isMesh) {
        o.castShadow = false;
        o.receiveShadow = true;
        o.frustumCulled = false;
      }
    });
    // Raw GLB runs along X from -1 (butt) to +1 (lens), Button_low at +Y.
    // Rotate +90 deg around Y so +X lens points along -Z forward.
    meshRoot.rotation.set(0, Math.PI * 0.5, 0);
    meshRoot.scale.setScalar(0.155);
    meshRoot.position.set(0, 0.015, -0.055);
    holder.add(meshRoot);
  } else {
    const body = new THREE.Mesh(
      new THREE.CylinderGeometry(0.024, 0.02, 0.24, 12),
      new THREE.MeshStandardMaterial({ color: "#1c2026", roughness: 0.45, metalness: 0.75 })
    );
    body.rotation.x = Math.PI * 0.5;
    body.position.set(0, 0, -0.06);
    holder.add(body);
  }

  // Glowing lens cap at front (-Z tip ~ -0.21)
  const lensMat = new THREE.MeshBasicMaterial({
    color: "#fff4d2",
    toneMapped: false,
  });
  const lensMesh = new THREE.Mesh(new THREE.CircleGeometry(0.03, 14), lensMat);
  lensMesh.rotation.y = Math.PI; // face -Z
  lensMesh.position.set(0, 0.015, -0.212);
  holder.add(lensMesh);

  // Volumetric beam cone extending from lens along -Z
  const coneLen = 7.5;
  const coneGeo = new THREE.ConeGeometry(1.55, coneLen, 20, 1, true);
  // Default ConeGeometry tip is at +Y/2, base at -Y/2. Rotate +X 90 deg -> tip at -Z/2? No: +Y -> +Z.
  // Rotate -PI/2 around X -> +Y maps to -Z? Wait: y'=z, z'=-y -> +Y maps to -Z!
  // Wait: if tip is at +Y, -PI/2 puts tip at -Z and base at +Z (backwards!).
  // Rotate +PI/2 around X -> y'=-z, z'=y -> tip(+Y) maps to +Z (origin/lens!), wide base(-Y) maps to -Z (forward)!
  coneGeo.rotateX(Math.PI * 0.5);
  coneGeo.translate(0, 0, -coneLen * 0.5);
  const coneMat = new THREE.MeshBasicMaterial({
    color: "#ffeec8",
    transparent: true,
    opacity: 0.065,
    blending: THREE.AdditiveBlending,
    depthWrite: false,
    side: THREE.DoubleSide,
  });
  const beamCone = new THREE.Mesh(coneGeo, coneMat);
  beamCone.position.set(0, 0.015, -0.22);
  beamCone.renderOrder = 4;
  holder.add(beamCone);

  const lensAnchor = new THREE.Object3D();
  lensAnchor.position.set(0, 0.015, -0.22);
  holder.add(lensAnchor);

  let spot = null;
  let fill = null;
  if (includeSpot) {
    spot = new THREE.SpotLight("#fff1d6", 2.8, 46, Math.PI * 0.18, 0.56, 1.35);
    spot.castShadow = false;
    spot.position.set(0, 0.015, -0.22);
    spot.target.position.set(0, 0.015, -18);
    holder.add(spot);
    holder.add(spot.target);

    fill = new THREE.PointLight("#ffe8c2", 0.32, 7.5, 1.6);
    fill.position.set(0, 0.02, -0.45);
    holder.add(fill);
  }

  return { holder, lensMesh, beamCone, coneMat, lensAnchor, spot, fill };
}

/**
 * Character-space procedural skeletal animator for both Ronaldo (ValveBiped)
 * and Messi (Avatar), plus right-hand Horror Flashlight aiming.
 */
export class RiggedPlayerCharacter {
  constructor(charId, gltf, flashlightGltf, opts = {}) {
    this.charId = charId;
    this.isRemote = Boolean(opts.isRemote);
    this.root = new THREE.Group();
    this.root.name = `Character_${charId}${this.isRemote ? "_Remote" : ""}`;

    const cloned = SkeletonUtils.clone(gltf.scene);
    this.modelInner = new THREE.Group();
    this.modelInner.add(cloned);

    // Both Ronaldo and Messi rest poses face +Z; rotate PI around Y so forward is -Z.
    this.modelInner.rotation.y = Math.PI;
    const baseScale = charId === "ronaldo" ? 0.026 : 1.02;
    this.modelInner.scale.setScalar(baseScale);

    this.root.add(this.modelInner);
    this.root.updateMatrixWorld(true);

    // Compute sole grounding offset in rest pose
    const box = new THREE.Box3().setFromObject(this.modelInner);
    if (Number.isFinite(box.min.y) && Math.abs(box.min.y) < 1.5) {
      this.modelInner.position.y -= box.min.y;
    }

    cloned.traverse((o) => {
      if (o.isMesh || o.isSkinnedMesh) {
        o.castShadow = true;
        o.receiveShadow = true;
        o.frustumCulled = false;
      }
    });

    this.root.updateMatrixWorld(true);

    // Map key bones across ValveBiped (Ronaldo) & ReadyPlayerMe/Mixamo (Messi)
    this.bones = {
      hips: findBone(cloned, [/Pelvis/i, /Hips/i]),
      spine: findBone(cloned, [/Bip01_Spine_02/i, /^Spine_02$/i, /Spine$/i]),
      spine1: findBone(cloned, [/Spine1/i]),
      spine2: findBone(cloned, [/Spine2/i, /Spine4/i]),
      head: findBone(cloned, [/Head1/i, /^Head(_|$)/i]),
      lClav: findBone(cloned, [/L_Clavicle/i, /LeftShoulder/i]),
      lArm: findBone(cloned, [/L_UpperArm/i, /LeftArm/i]),
      lFore: findBone(cloned, [/L_Forearm/i, /LeftForeArm_014/i, /LeftForeArm$/i]),
      lHand: findBone(cloned, [/L_Hand/i, /LeftHand_017/i, /LeftHand$/i]),
      rClav: findBone(cloned, [/R_Clavicle/i, /RightShoulder/i]),
      rArm: findBone(cloned, [/R_UpperArm/i, /RightArm/i]),
      rFore: findBone(cloned, [/R_Forearm/i, /RightForeArm_040/i, /RightForeArm$/i]),
      rHand: findBone(cloned, [/R_Hand/i, /RightHand_043/i, /RightHand$/i]),
      lThigh: findBone(cloned, [/L_Thigh/i, /LeftUpLeg/i]),
      lCalf: findBone(cloned, [/L_Calf/i, /LeftLeg/i]),
      lFoot: findBone(cloned, [/L_Foot/i, /LeftFoot/i]),
      rThigh: findBone(cloned, [/R_Thigh/i, /RightUpLeg/i]),
      rCalf: findBone(cloned, [/R_Calf/i, /RightLeg/i]),
      rFoot: findBone(cloned, [/R_Foot/i, /RightFoot/i]),
    };

    // Capture rest pose transforms in charRoot space across all modelInner nodes
    // (including intermediate unposed bones such as Spine1, Clavicle, Neck, ForeArm1/2)
    this.restData = new Map();
    const recordNode = (o) => {
      if (!o || this.restData.has(o)) return;
      const worldQ = new THREE.Quaternion();
      o.getWorldQuaternion(worldQ);
      this.restData.set(o, {
        restLocalQuat: o.quaternion.clone(),
        restWorldQuat: worldQ,
        restLocalPos: o.position.clone(),
      });
    };
    this.modelInner.traverse(recordNode);

    this.hipsScaleInv = this.charId === "ronaldo" ? 1 / 0.026 : 1 / 1.02;
    if (this.bones.hips && this.bones.hips.parent) {
      const hs = new THREE.Vector3();
      this.bones.hips.parent.getWorldScale(hs);
      if (hs.y > 1e-4) this.hipsScaleInv = 1 / hs.y;
    }

    // Rest limb directions in charRoot space (-Z forward, +X right, +Y up)
    this.restDirs = {
      lArm: computeDirInSpace(this.bones.lArm, this.bones.lFore, new THREE.Vector3(-0.9, -0.3, 0), this.root),
      lFore: computeDirInSpace(this.bones.lFore, this.bones.lHand, new THREE.Vector3(-0.7, -0.3, -0.5), this.root),
      rArm: computeDirInSpace(this.bones.rArm, this.bones.rFore, new THREE.Vector3(0.9, -0.3, 0), this.root),
      rFore: computeDirInSpace(this.bones.rFore, this.bones.rHand, new THREE.Vector3(0.7, -0.3, -0.5), this.root),
      lThigh: computeDirInSpace(this.bones.lThigh, this.bones.lCalf, new THREE.Vector3(0, -1, 0), this.root),
      lCalf: computeDirInSpace(this.bones.lCalf, this.bones.lFoot, new THREE.Vector3(0, -1, 0), this.root),
      rThigh: computeDirInSpace(this.bones.rThigh, this.bones.rCalf, new THREE.Vector3(0, -1, 0), this.root),
      rCalf: computeDirInSpace(this.bones.rCalf, this.bones.rFoot, new THREE.Vector3(0, -1, 0), this.root),
    };

    // Attach 3D horror flashlight to right hand (or root fallback)
    this.torch = createFlashlightAttachment(flashlightGltf, { includeSpot: this.isRemote });
    const handParent = this.bones.rHand || this.modelInner;
    handParent.add(this.torch.holder);
    // Normalize holder scale against parent bone world scale
    const handWorldScale = new THREE.Vector3();
    handParent.getWorldScale(handWorldScale);
    if (handWorldScale.x > 1e-4) {
      this.torch.holder.scale.set(
        1 / handWorldScale.x,
        1 / handWorldScale.y,
        1 / handWorldScale.z
      );
    }
    this.torch.holder.position.set(0, 0, 0);

    // Runtime animation state
    this.faceYaw = 0;
    this.walkPhase = 0;
    this.idlePhase = Math.random() * 6.28;
    this.speedBlend = 0;
    this.aimBlend = 0;
    this.worldAimDir = new THREE.Vector3(0, 0, -1);
    this.lensWorldPos = new THREE.Vector3();
    this.lensWorldDir = new THREE.Vector3(0, 0, -1);

    // Scratch targets (zero-GC) — delta quaternions track each posed ancestor's charRoot rotation delta
    this._desiredDir = new THREE.Vector3();
    this._aimCharDir = new THREE.Vector3();
    this._identityQ = new THREE.Quaternion();
    this._boneDeltaQ = new THREE.Quaternion();
    this._hipsDeltaQ = new THREE.Quaternion();
    this._spineDeltaQ = new THREE.Quaternion();
    this._headDeltaQ = new THREE.Quaternion();
    this._lArmDeltaQ = new THREE.Quaternion();
    this._lForeDeltaQ = new THREE.Quaternion();
    this._rArmDeltaQ = new THREE.Quaternion();
    this._rForeDeltaQ = new THREE.Quaternion();
    this._lThighDeltaQ = new THREE.Quaternion();
    this._rThighDeltaQ = new THREE.Quaternion();
  }

  /**
   * Computes bone.quaternion in charRoot space given its nearest posed ancestor's delta rotation
   * (ancestorDeltaQ) and the desired delta rotation (deltaCharQ) for this bone, preserving exact
   * rest orientations across any unposed intermediate bones (e.g., Spine1, Clavicle, Neck, roll bones).
   */
  _poseBoneDelta(bone, ancestorDeltaQ, deltaCharQ, outDeltaQ) {
    if (!bone) {
      outDeltaQ.copy(ancestorDeltaQ);
      return;
    }
    const rd = this.restData.get(bone);
    if (!rd) {
      outDeltaQ.copy(ancestorDeltaQ);
      return;
    }
    const parentRd = bone.parent ? this.restData.get(bone.parent) : null;
    if (parentRd) {
      // Actual parent world quat in charRoot = ancestorDeltaQ * parentRd.restWorldQuat
      _tmpQ3.multiplyQuaternions(ancestorDeltaQ, parentRd.restWorldQuat);
    } else {
      _tmpQ3.copy(ancestorDeltaQ);
    }
    // targetWorldQ = deltaCharQ * rd.restWorldQuat
    _tmpQ2.multiplyQuaternions(deltaCharQ, rd.restWorldQuat);
    // localQ = inv(parentActualWorldQ) * targetWorldQ
    _tmpQ3.invert().multiply(_tmpQ2);
    bone.quaternion.copy(_tmpQ3);
    outDeltaQ.copy(deltaCharQ);
  }

  /**
   * Orients a limb bone so its restDir aligns to targetCharDir (in charRoot space),
   * optionally pre-multiplied by an extra twist quaternion in charRoot space.
   */
  _poseLimbToward(bone, restDir, targetCharDir, ancestorDeltaQ, outDeltaQ, extraTwistQ = null) {
    if (!bone) {
      outDeltaQ.copy(ancestorDeltaQ);
      return;
    }
    _tmpV3.copy(targetCharDir).normalize();
    _tmpQ1.setFromUnitVectors(restDir, _tmpV3);
    if (extraTwistQ) {
      _tmpQ1.premultiply(extraTwistQ);
    }
    this._poseBoneDelta(bone, ancestorDeltaQ, _tmpQ1, outDeltaQ);
  }

  /**
   * Updates character position, yaw, skeletal stride/aim animation, and 3D flashlight beam.
   */
  update(dt, opts) {
    const {
      x,
      y,
      z,
      vx,
      vz,
      lookYaw,
      lookPitch,
      sprint,
      flashlightOn,
      aiming,
    } = opts;

    this.root.position.set(x, y, z);

    const speed = Math.hypot(vx, vz);
    const desiredAim = flashlightOn || aiming ? 1 : 0;
    this.aimBlend += (desiredAim - this.aimBlend) * (1 - Math.exp(-12 * dt));
    this.speedBlend += (Math.min(1, speed / 6.5) - this.speedBlend) * (1 - Math.exp(-10 * dt));

    // Character faces movement direction when running around, or turns toward camera look when aiming/shining torch
    let targetYaw = this.faceYaw;
    if (aiming) {
      targetYaw = lookYaw;
    } else if (speed > 0.35) {
      const moveYaw = Math.atan2(-vx, -vz);
      if (flashlightOn) {
        // Blend slightly toward lookYaw if strafing/walking forward with torch on
        const diff = Math.abs(wrapAngle(lookYaw - moveYaw));
        targetYaw = diff < 1.35 ? lookYaw : moveYaw;
      } else {
        targetYaw = moveYaw;
      }
    } else if (flashlightOn) {
      const diff = wrapAngle(lookYaw - this.faceYaw);
      if (Math.abs(diff) > 0.55) {
        targetYaw = lookYaw - Math.sign(diff) * 0.55;
      }
    }
    this.faceYaw += wrapAngle(targetYaw - this.faceYaw) * (1 - Math.exp(-HERO_TURN_RATE * dt));
    this.root.rotation.y = this.faceYaw;

    // Advance walk / idle gait cycle
    this.idlePhase += dt * 2.1;
    if (speed > 0.25) {
      const freq = sprint ? 11.2 : 7.6;
      this.walkPhase += dt * freq * Math.max(0.55, Math.min(1.4, speed / 4.6));
    }

    const amp = this.speedBlend;
    const s = Math.sin(this.walkPhase);
    const c = Math.cos(this.walkPhase);
    const doubleBob = Math.abs(s);

    // Ancestor delta starts at identity in charRoot space
    this._identityQ.identity();

    // Hips subtle vertical bounce + forward sprint lean + yaw twist
    if (this.bones.hips) {
      const rd = this.restData.get(this.bones.hips);
      const bobM = amp * 0.036 * doubleBob + (1 - amp) * 0.008 * Math.sin(this.idlePhase);
      this.bones.hips.position.copy(rd.restLocalPos);
      this.bones.hips.position.y += bobM * this.hipsScaleInv;
    }

    const leanForward = amp * (sprint ? -0.14 : -0.06);
    const hipTwist = amp * s * 0.07;
    _tmpQ1.setFromEuler(new THREE.Euler(leanForward, hipTwist, 0, "YXZ"));
    this._poseBoneDelta(this.bones.hips, this._identityQ, _tmpQ1, this._hipsDeltaQ);

    // Spine / upper torso turns smoothly toward camera lookYaw + breath + counter-twist
    const aimYawLocal = wrapAngle(lookYaw - this.faceYaw);
    const clampedTorsoYaw = THREE.MathUtils.clamp(aimYawLocal, -0.95, 0.95) * this.aimBlend;
    const clampedPitch = THREE.MathUtils.clamp(-lookPitch, -0.65, 0.65) * this.aimBlend;
    const breathPitch = (1 - amp) * 0.025 * Math.sin(this.idlePhase);

    _tmpQ1.setFromEuler(
      new THREE.Euler(
        leanForward * 0.5 + breathPitch + clampedPitch * 0.25,
        clampedTorsoYaw * 0.55 - amp * s * 0.09,
        0,
        "YXZ"
      )
    );
    this._poseBoneDelta(this.bones.spine2 || this.bones.spine, this._hipsDeltaQ, _tmpQ1, this._spineDeltaQ);

    // Head looks toward lookYaw / lookPitch
    _tmpQ1.setFromEuler(
      new THREE.Euler(
        THREE.MathUtils.clamp(-lookPitch, -0.7, 0.7) * 0.65,
        THREE.MathUtils.clamp(aimYawLocal, -1.1, 1.1) * 0.75,
        0,
        "YXZ"
      )
    );
    this._poseBoneDelta(this.bones.head, this._spineDeltaQ, _tmpQ1, this._headDeltaQ);

    // Legs (in charRoot space: -Z is forward, +Y is up, so leg forward swing -> z < 0, y < 0)
    const strideAngle = amp * (sprint ? 0.82 : 0.52);
    const lHipPitch = s * strideAngle;
    const rHipPitch = -s * strideAngle;
    const lKneeBend = amp * Math.max(0, -c * 0.85 + 0.18);
    const rKneeBend = amp * Math.max(0, c * 0.85 + 0.18);

    // Left Leg
    this._desiredDir.set(-0.04, -Math.cos(lHipPitch), -Math.sin(lHipPitch) - 0.04);
    this._poseLimbToward(this.bones.lThigh, this.restDirs.lThigh, this._desiredDir, this._hipsDeltaQ, this._lThighDeltaQ);
    const lCalfAngle = lHipPitch - lKneeBend;
    this._desiredDir.set(-0.02, -Math.cos(lCalfAngle), -Math.sin(lCalfAngle));
    this._poseLimbToward(this.bones.lCalf, this.restDirs.lCalf, this._desiredDir, this._lThighDeltaQ, this._boneDeltaQ);

    // Right Leg
    this._desiredDir.set(0.04, -Math.cos(rHipPitch), -Math.sin(rHipPitch) - 0.04);
    this._poseLimbToward(this.bones.rThigh, this.restDirs.rThigh, this._desiredDir, this._hipsDeltaQ, this._rThighDeltaQ);
    const rCalfAngle = rHipPitch - rKneeBend;
    this._desiredDir.set(0.02, -Math.cos(rCalfAngle), -Math.sin(rCalfAngle));
    this._poseLimbToward(this.bones.rCalf, this.restDirs.rCalf, this._desiredDir, this._rThighDeltaQ, this._boneDeltaQ);

    // Left Arm (natural arm down + opposite stride swing)
    const lArmSwing = -s * amp * (sprint ? 0.78 : 0.48);
    this._desiredDir.set(-0.18, -0.95 + Math.abs(lArmSwing) * 0.15, -Math.sin(lArmSwing) * 0.75 - 0.08);
    this._poseLimbToward(this.bones.lArm, this.restDirs.lArm, this._desiredDir, this._spineDeltaQ, this._lArmDeltaQ);
    const lElbowFlex = 0.24 + amp * (sprint ? 0.65 : 0.25) + Math.max(0, -s) * amp * 0.35;
    this._desiredDir.set(-0.1, -Math.cos(lArmSwing + lElbowFlex), -Math.sin(lArmSwing + lElbowFlex) - 0.18);
    this._poseLimbToward(this.bones.lFore, this.restDirs.lFore, this._desiredDir, this._lArmDeltaQ, this._lForeDeltaQ);

    // Right Arm + Forearm + Hand aiming the Horror Flashlight!
    const cp = Math.cos(lookPitch);
    if (opts.worldAimDir) {
      this.worldAimDir.copy(opts.worldAimDir).normalize();
    } else {
      this.worldAimDir.set(-Math.sin(lookYaw) * cp, -Math.sin(lookPitch), -Math.cos(lookYaw) * cp).normalize();
    }
    // Transform worldAimDir into charRoot local space (rotate by -faceYaw around Y)
    this._aimCharDir.copy(this.worldAimDir).applyAxisAngle(_upVec, -this.faceYaw).normalize();

    if (this.aimBlend > 0.05) {
      const ab = this.aimBlend;
      const idleSwing = s * amp * 0.22;
      const raiseBoost = aiming ? 0.22 : 0.0;
      this._desiredDir.set(
        0.24 + this._aimCharDir.x * 0.35,
        THREE.MathUtils.lerp(-0.92, -0.44 + raiseBoost + this._aimCharDir.y * 0.55, ab),
        THREE.MathUtils.lerp(-0.15 - idleSwing, -0.78 + this._aimCharDir.z * 0.15, ab)
      );
      this._poseLimbToward(this.bones.rArm, this.restDirs.rArm, this._desiredDir, this._spineDeltaQ, this._rArmDeltaQ);

      this._desiredDir.set(
        this._aimCharDir.x * 0.82 - 0.10,
        THREE.MathUtils.lerp(-0.82, this._aimCharDir.y * 0.85 + 0.14 + raiseBoost * 0.4, ab),
        THREE.MathUtils.lerp(-0.35 - idleSwing, this._aimCharDir.z - 0.15, ab)
      );
      this._poseLimbToward(this.bones.rFore, this.restDirs.rFore, this._desiredDir, this._rArmDeltaQ, this._rForeDeltaQ);
    } else {
      const rArmSwing = s * amp * (sprint ? 0.78 : 0.48);
      this._desiredDir.set(0.18, -0.95, -Math.sin(rArmSwing) * 0.75 - 0.08);
      this._poseLimbToward(this.bones.rArm, this.restDirs.rArm, this._desiredDir, this._spineDeltaQ, this._rArmDeltaQ);
      this._desiredDir.set(0.1, -0.82, -Math.sin(rArmSwing) * 0.75 - 0.32);
      this._poseLimbToward(this.bones.rFore, this.restDirs.rFore, this._desiredDir, this._rArmDeltaQ, this._rForeDeltaQ);
    }

    // Orient right hand & 3D Horror Flashlight directly along worldAimDir when active
    if (this.bones.rHand) {
      this.root.updateMatrixWorld(true);
      this.bones.rHand.getWorldQuaternion(_tmpQ1);
      // Target world quaternion for torchHolder (-Z forward, +Y up):
      // lookAt matrix points +Z from target->eye, so -Z points toward eye->target = +worldAimDir.
      if (this.aimBlend > 0.15) {
        _tmpV1.copy(this.worldAimDir);
      } else {
        // Hanging downward-forward casually at hip when flashlight is off
        _tmpV1.set(-Math.sin(this.faceYaw) * 0.35, -0.92, -Math.cos(this.faceYaw) * 0.35).normalize();
      }
      _tmpMat4.lookAt(_tmpV2.set(0, 0, 0), _tmpV1, _upVec);
      _tmpQ2.setFromRotationMatrix(_tmpMat4);
      // torchHolder.quaternion = inv(rHandWorldQuat) * targetWorldQuat
      this.torch.holder.quaternion.copy(_tmpQ1).invert().multiply(_tmpQ2);
    }

    // Update flashlight lens glow, beam cone & remote SpotLight visibility
    this.torch.lensMesh.visible = Boolean(flashlightOn);
    this.torch.beamCone.visible = Boolean(flashlightOn);
    if (this.torch.coneMat) {
      this.torch.coneMat.opacity = aiming ? 0.11 : 0.055;
      this.torch.beamCone.scale.set(aiming ? 0.75 : 1.0, aiming ? 0.75 : 1.0, aiming ? 1.25 : 1.0);
    }
    if (this.torch.spot) {
      this.torch.spot.visible = Boolean(flashlightOn);
      this.torch.spot.intensity = aiming ? 4.2 : 2.8;
      this.torch.spot.angle = aiming ? Math.PI * 0.13 : Math.PI * 0.18;
    }
    if (this.torch.fill) {
      this.torch.fill.visible = Boolean(flashlightOn);
    }

    // Export world-space lens origin and direction for core.js primary SpotLight sync
    this.root.updateMatrixWorld(true);
    this.torch.lensAnchor.getWorldPosition(this.lensWorldPos);
    this.torch.holder.getWorldQuaternion(_tmpQ1);
    this.lensWorldDir.copy(_fwdNegZ).applyQuaternion(_tmpQ1).normalize();
  }
}

/**
 * Multi-Stalker Pack: 5 Stalkers spanning Campus & Backrooms.
 * - Faster than the player (flee: 15.5 m/s, flash_dash: 21 m/s vs player sprint 8.6 m/s)
 * - Hides behind trees / Backrooms corners and watches you
 * - Periodically sprints right across in front of your view (`flash_dash`) so you see it streak by!
 */
export class StalkerPack {
  constructor(xbotGltf, { trees, resolveCollisions, backrooms }) {
    this.trees = trees || [];
    this.resolveCollisions = resolveCollisions;
    this.backrooms = backrooms || null;
    this.stalkers = [];
    this._tmp = new THREE.Vector3();
    this._tmp2 = new THREE.Vector3();
    this._frustum = new THREE.Frustum();
    this._mat = new THREE.Matrix4();
    this._dashCooldown = 3.5;

    if (!xbotGltf) return;

    const skin = new THREE.MeshStandardMaterial({
      color: "#090a0d",
      roughness: 0.88,
      metalness: 0.06,
    });
    const eyeMat = new THREE.MeshBasicMaterial({ color: "#ff2318", fog: false });
    const eyeGeo = new THREE.SphereGeometry(2.3, 8, 6);

    for (let i = 0; i < STALKER_COUNT; i++) {
      const cloned = SkeletonUtils.clone(xbotGltf.scene);
      let head = null;
      cloned.traverse((o) => {
        if (o.isMesh || o.isSkinnedMesh) {
          o.material = skin;
          o.castShadow = true;
          o.frustumCulled = false;
        }
        if (o.isBone && /Head$/i.test(o.name) && !head) head = o;
      });
      if (head) {
        for (const sx of [-4.2, 4.2]) {
          const eye = new THREE.Mesh(eyeGeo, eyeMat);
          eye.position.set(sx, 10, 9);
          head.add(eye);
        }
      }
      const heightScale = 1.04 + (i % 3) * 0.06;
      cloned.scale.setScalar(heightScale);

      const mixer = new THREE.AnimationMixer(cloned);
      const actions = {};
      for (const key of ["idle", "walk", "run"]) {
        const clip = xbotGltf.animations.find((c) => c.name === key);
        if (clip) actions[key] = mixer.clipAction(clip);
      }

      const unit = {
        id: i,
        realm: i >= 3 ? "backrooms" : "campus",
        root: cloned,
        mixer,
        actions,
        currentAnim: null,
        mode: "hidden", // hidden | watch | hide_peek | stalk | flash_dash | flee
        x: 0,
        z: 145,
        yaw: 0,
        dirX: 0,
        dirZ: -1,
        timer: 0,
        seenTimer: 0,
        respawnDelay: 1.5 + i * 2.1,
        visible: false,
      };
      this._playAnim(unit, "idle", 0);
      unit.root.visible = false;
      this.stalkers.push(unit);
    }
  }

  _playAnim(unit, key, fade = 0.2) {
    if (unit.currentAnim === key) return;
    const next = unit.actions[key];
    if (!next) return;
    const prev = unit.currentAnim ? unit.actions[unit.currentAnim] : null;
    next.reset().setEffectiveWeight(1).fadeIn(fade).play();
    if (prev) prev.fadeOut(fade);
    unit.currentAnim = key;
  }

  _inView(camera, x, y, z) {
    this._mat.multiplyMatrices(camera.projectionMatrix, camera.matrixWorldInverse);
    this._frustum.setFromProjectionMatrix(this._mat);
    this._tmp.set(x, y, z);
    return this._frustum.containsPoint(this._tmp);
  }

  _pickSpotForUnit(unit, px, pz, camera, inBackrooms) {
    if (inBackrooms && this.backrooms?.ready && (unit.realm === "backrooms" || unit.id % 2 === 0)) {
      const pt = this.backrooms.pickOpenPoint(px, pz);
      return { x: pt.x, z: pt.z };
    }
    const candidates = [];
    for (let i = 0; i < this.trees.length; i++) {
      const t = this.trees[i];
      const d = Math.hypot(t.x - px, t.z - pz);
      if (d < 17 || d > 40) continue;
      const ux = (t.x - px) / d;
      const uz = (t.z - pz) / d;
      const side = Math.random() < 0.5 ? -1 : 1;
      const hx = t.x + ux * 1.25 - uz * 0.85 * side;
      const hz = t.z + uz * 1.25 + ux * 0.85 * side;
      if (this._inView(camera, hx, getOpenWorldTerrainHeight(hx, hz) + 1.2, hz)) continue;
      candidates.push({ x: hx, z: hz });
    }
    if (candidates.length > 0) {
      return candidates[Math.floor(Math.random() * candidates.length)];
    }
    const fwd = camera.getWorldDirection(this._tmp);
    const ang = Math.atan2(-fwd.x, -fwd.z) + (Math.random() - 0.5) * 2.4;
    const r = 18 + Math.random() * 18;
    return this.resolveCollisions(px + Math.sin(ang) * r, pz + Math.cos(ang) * r);
  }

  _triggerFlashDash(unit, px, pz, lookYaw, inBackrooms) {
    // Spawn just off left or right side of a point 8..13m directly in front of player!
    const fwdX = -Math.sin(lookYaw);
    const fwdZ = -Math.cos(lookYaw);
    const rightX = Math.cos(lookYaw);
    const rightZ = -Math.sin(lookYaw);

    const aheadDist = inBackrooms ? 7.5 + Math.random() * 3.5 : 9.5 + Math.random() * 5.0;
    const halfSpan = inBackrooms ? 5.5 : 10.5;
    const sideSign = Math.random() < 0.5 ? 1 : -1;

    const startRawX = px + fwdX * aheadDist + rightX * halfSpan * sideSign;
    const startRawZ = pz + fwdZ * aheadDist + rightZ * halfSpan * sideSign;
    const startResolved = this.resolveCollisions(startRawX, startRawZ);

    unit.x = startResolved.x;
    unit.z = startResolved.z;
    unit.dirX = -rightX * sideSign;
    unit.dirZ = -rightZ * sideSign;
    unit.yaw = Math.atan2(unit.dirX, unit.dirZ);
    unit.mode = "flash_dash";
    unit.timer = 0;
    unit.seenTimer = 0;
    unit.root.visible = true;
    this._playAnim(unit, "run", 0.05);
    if (unit.actions.run) unit.actions.run.timeScale = 2.15;
  }

  /**
   * Updates all Stalkers locally (when solo or room host).
   * Returns an alert string if a flash-dash or close sighting just happened.
   */
  update(dt, px, pz, lookYaw, camera, inBackrooms) {
    if (this.stalkers.length === 0) return "";
    let alertEvent = "";
    this._dashCooldown = Math.max(0, this._dashCooldown - dt);

    const fwd = camera.getWorldDirection(this._tmp);

    for (let i = 0; i < this.stalkers.length; i++) {
      const u = this.stalkers[i];
      u.timer += dt;

      // Ensure at least half the pack follows player between Campus and Backrooms
      if (u.mode === "hidden") {
        u.root.visible = false;
        if (u.timer > u.respawnDelay) {
          // Chance to perform a terrifying fast dash right across front of player!
          if (this._dashCooldown <= 0 && Math.random() < 0.42) {
            this._dashCooldown = 7.5 + Math.random() * 5.0;
            this._triggerFlashDash(u, px, pz, lookYaw, inBackrooms);
            alertEvent = "stalker_dash";
          } else {
            const spot = this._pickSpotForUnit(u, px, pz, camera, inBackrooms);
            u.x = spot.x;
            u.z = spot.z;
            u.mode = Math.random() < 0.45 ? "hide_peek" : "watch";
            u.timer = 0;
            u.seenTimer = 0;
            u.root.visible = true;
            this._playAnim(u, "idle", 0.15);
            if (u.actions.idle) u.actions.idle.timeScale = 1.0;
          }
        }
      } else if (u.mode === "watch" || u.mode === "hide_peek") {
        u.root.visible = true;
        const dx = px - u.x;
        const dz = pz - u.z;
        const dist = Math.hypot(dx, dz) || 1;
        u.yaw = Math.atan2(dx, dz);
        u.root.rotation.y = u.yaw;

        const headY = getOpenWorldTerrainHeight(u.x, u.z) + 1.5;
        this._tmp2.set(u.x - camera.position.x, headY - camera.position.y, u.z - camera.position.z);
        const toDist = this._tmp2.length();
        const angle = fwd.angleTo(this._tmp2);
        const looking = angle < 0.31 && toDist < 68;

        u.seenTimer = looking ? u.seenTimer + dt : Math.max(0, u.seenTimer - dt * 0.4);

        if (u.seenTimer > 0.30 || dist < 10.5) {
          // Either sprint across or sprint away at 15.5 m/s (way faster than player!)
          if (this._dashCooldown <= 0 && dist > 11 && dist < 24 && Math.random() < 0.35) {
            this._dashCooldown = 8.0 + Math.random() * 5.0;
            const perpSign = Math.random() < 0.5 ? 1 : -1;
            const ux = dx / dist;
            const uz = dz / dist;
            u.dirX = (-uz * perpSign + ux * 0.25);
            u.dirZ = (ux * perpSign + uz * 0.25);
            const dLen = Math.hypot(u.dirX, u.dirZ) || 1;
            u.dirX /= dLen;
            u.dirZ /= dLen;
            u.mode = "flash_dash";
            u.timer = 0;
            this._playAnim(u, "run", 0.06);
            if (u.actions.run) u.actions.run.timeScale = 2.1;
            alertEvent = "stalker_dash";
          } else {
            u.mode = "flee";
            u.timer = 0;
            const veer = (Math.random() - 0.5) * 0.85;
            const ax = -dx / dist;
            const az = -dz / dist;
            u.dirX = ax * Math.cos(veer) - az * Math.sin(veer);
            u.dirZ = ax * Math.sin(veer) + az * Math.cos(veer);
            this._playAnim(u, "run", 0.08);
            if (u.actions.run) u.actions.run.timeScale = 1.75;
            alertEvent = alertEvent || "stalker_seen";
          }
        } else if (!looking && u.mode === "watch" && u.timer > 3.2 && dist > 14.5) {
          // Creep closer while player isn't looking!
          u.mode = "stalk";
          u.timer = 0;
          this._playAnim(u, "walk", 0.2);
          if (u.actions.walk) u.actions.walk.timeScale = 1.5;
        } else if (u.timer > 18.0 && !this._inView(camera, u.x, headY, u.z)) {
          u.mode = "hidden";
          u.timer = 0;
          u.respawnDelay = 1.5 + Math.random() * 3.0;
        }
      } else if (u.mode === "stalk") {
        u.root.visible = true;
        const dx = px - u.x;
        const dz = pz - u.z;
        const dist = Math.hypot(dx, dz) || 1;
        u.yaw = Math.atan2(dx, dz);
        u.root.rotation.y = u.yaw;

        const headY = getOpenWorldTerrainHeight(u.x, u.z) + 1.5;
        this._tmp2.set(u.x - camera.position.x, headY - camera.position.y, u.z - camera.position.z);
        const angle = fwd.angleTo(this._tmp2);
        if (angle < 0.34 && this._tmp2.length() < 60) {
          // Caught stalking -> super-fast flee or dash!
          u.mode = "flee";
          u.timer = 0;
          u.dirX = -dx / dist;
          u.dirZ = -dz / dist;
          this._playAnim(u, "run", 0.08);
          if (u.actions.run) u.actions.run.timeScale = 1.8;
          alertEvent = alertEvent || "stalker_seen";
        } else {
          const creepSpeed = 7.4;
          const r = this.resolveCollisions(
            u.x + (dx / dist) * creepSpeed * dt,
            u.z + (dz / dist) * creepSpeed * dt
          );
          u.x = r.x;
          u.z = r.z;
          if (dist < 11.5 || u.timer > 6.5) {
            u.mode = "hide_peek";
            u.timer = 0;
            this._playAnim(u, "idle", 0.15);
          }
        }
      } else if (u.mode === "flash_dash") {
        u.root.visible = true;
        this._playAnim(u, "run", 0.05);
        const dashSpeed = inBackrooms ? 17.5 : 21.5;
        const r = this.resolveCollisions(
          u.x + u.dirX * dashSpeed * dt,
          u.z + u.dirZ * dashSpeed * dt
        );
        u.x = r.x;
        u.z = r.z;
        u.yaw = Math.atan2(u.dirX, u.dirZ);
        u.root.rotation.y = u.yaw;
        if (u.timer > 1.35) {
          u.mode = "hidden";
          u.timer = 0;
          u.respawnDelay = 4.0 + Math.random() * 6.0;
        }
      } else if (u.mode === "flee") {
        u.root.visible = true;
        this._playAnim(u, "run", 0.08);
        const fleeSpeed = 15.8; // strictly faster than player sprint (8.6 m/s)
        const r = this.resolveCollisions(
          u.x + u.dirX * fleeSpeed * dt,
          u.z + u.dirZ * fleeSpeed * dt
        );
        u.x = r.x;
        u.z = r.z;
        u.yaw = Math.atan2(u.dirX, u.dirZ);
        u.root.rotation.y = u.yaw;
        if (u.timer > 3.2) {
          u.mode = "hidden";
          u.timer = 0;
          u.respawnDelay = 4.5 + Math.random() * 7.0;
        }
      }

      u.visible = u.root.visible;
      u.root.position.set(u.x, getOpenWorldTerrainHeight(u.x, u.z), u.z);
      u.mixer.update(dt);
    }

    return alertEvent;
  }

  serializeForNetwork() {
    return this.stalkers.map((u) => ({
      id: u.id,
      x: Math.round(u.x * 100) / 100,
      z: Math.round(u.z * 100) / 100,
      yaw: Math.round(u.yaw * 1000) / 1000,
      mode: u.mode,
      visible: u.root.visible,
    }));
  }

  applyNetworkState(dt, list) {
    if (!Array.isArray(list)) return;
    const blend = 1 - Math.exp(-16 * dt);
    for (let i = 0; i < this.stalkers.length && i < list.length; i++) {
      const u = this.stalkers[i];
      const net = list[i];
      if (!net) continue;
      if (!u.root.visible && net.visible) {
        u.x = Number(net.x) || 0;
        u.z = Number(net.z) || 0;
      } else {
        u.x += ((Number(net.x) || 0) - u.x) * blend;
        u.z += ((Number(net.z) || 0) - u.z) * blend;
      }
      u.yaw = Number(net.yaw) || 0;
      u.mode = String(net.mode || "hidden");
      u.root.visible = Boolean(net.visible);
      u.visible = u.root.visible;
      u.root.position.set(u.x, getOpenWorldTerrainHeight(u.x, u.z), u.z);
      u.root.rotation.y = u.yaw;
      if (u.mode === "flash_dash" || u.mode === "flee") {
        this._playAnim(u, "run", 0.08);
        if (u.actions.run) u.actions.run.timeScale = u.mode === "flash_dash" ? 2.1 : 1.75;
      } else if (u.mode === "stalk") {
        this._playAnim(u, "walk", 0.15);
      } else {
        this._playAnim(u, "idle", 0.15);
      }
      u.mixer.update(dt);
    }
  }

  getActivePositions() {
    const out = [];
    for (let i = 0; i < this.stalkers.length; i++) {
      const u = this.stalkers[i];
      if (u.root.visible) {
        out.push({ x: u.x, z: u.z, mode: u.mode });
      }
    }
    return out;
  }
}

export class CharacterSystem {
  constructor(scene, assets, opts) {
    this.scene = scene;
    this.assets = assets;
    this.opts = opts;
    this.localCharId = opts.initialCharacter === "messi" ? "messi" : "ronaldo";

    // Build local playable characters (Ronaldo + Messi) so switching is instant
    this.localRigMap = new Map();
    if (assets.ronaldoGltf) {
      const rig = new RiggedPlayerCharacter("ronaldo", assets.ronaldoGltf, assets.flashlightGltf, {
        isRemote: false,
      });
      rig.root.visible = false;
      scene.add(rig.root);
      this.localRigMap.set("ronaldo", rig);
    }
    if (assets.messiGltf) {
      const rig = new RiggedPlayerCharacter("messi", assets.messiGltf, assets.flashlightGltf, {
        isRemote: false,
      });
      rig.root.visible = false;
      scene.add(rig.root);
      this.localRigMap.set("messi", rig);
    }

    this.localHero =
      this.localRigMap.get(this.localCharId) ||
      this.localRigMap.get("ronaldo") ||
      this.localRigMap.get("messi") ||
      null;
    if (this.localHero) this.localHero.root.visible = true;

    // Remote co-op players keyed by playerId
    this.remotePlayers = new Map();

    // Stalker pack
    this.stalkerPack = new StalkerPack(assets.xbotGltf, opts);
    for (const s of this.stalkerPack.stalkers) {
      scene.add(s.root);
    }
  }

  setLocalCharacter(charId) {
    const id = charId === "messi" ? "messi" : "ronaldo";
    if (!this.localRigMap.has(id)) return;
    this.localCharId = id;
    for (const [key, rig] of this.localRigMap.entries()) {
      rig.root.visible = key === id;
    }
    this.localHero = this.localRigMap.get(id);
  }

  _ensureRemoteRig(playerId, character) {
    const charId = character === "messi" ? "messi" : "ronaldo";
    const existing = this.remotePlayers.get(playerId);
    if (existing && existing.charId === charId) return existing;

    if (existing) {
      this.scene.remove(existing.rig.root);
    }

    const gltf = charId === "messi" ? this.assets.messiGltf : this.assets.ronaldoGltf;
    if (!gltf) return null;
    const rig = new RiggedPlayerCharacter(charId, gltf, this.assets.flashlightGltf, {
      isRemote: true,
    });
    this.scene.add(rig.root);
    const rec = {
      playerId,
      charId,
      rig,
      x: 0,
      y: 0,
      z: 118,
      yaw: 0,
      pitch: 0.18,
      vx: 0,
      vz: 0,
      sprint: false,
      flashlightOn: true,
      aiming: false,
      targetX: 0,
      targetY: 0,
      targetZ: 118,
      targetYaw: 0,
      targetPitch: 0.18,
      initialized: false,
    };
    this.remotePlayers.set(playerId, rec);
    return rec;
  }

  syncRemoteRoster(players, localPlayerId) {
    const activeIds = new Set();
    for (const p of players || []) {
      if (!p || p.id === localPlayerId) continue;
      activeIds.add(p.id);
      const rec = this._ensureRemoteRig(p.id, p.character);
      if (rec && p.state) {
        this.applyRemoteState(p.id, p.character, p.state);
      }
    }
    for (const [pid, rec] of this.remotePlayers.entries()) {
      if (!activeIds.has(pid)) {
        this.scene.remove(rec.rig.root);
        this.remotePlayers.delete(pid);
      }
    }
  }

  applyRemoteState(playerId, character, st) {
    if (!st) return;
    const rec = this._ensureRemoteRig(playerId, character);
    if (!rec) return;
    rec.targetX = Number(st.x) || 0;
    rec.targetY = Number(st.y) || 0;
    rec.targetZ = Number(st.z) || 0;
    rec.targetYaw = Number(st.yaw) || 0;
    rec.targetPitch = Number(st.pitch) || 0;
    rec.vx = Number(st.vx) || 0;
    rec.vz = Number(st.vz) || 0;
    rec.sprint = Boolean(st.sprint);
    rec.flashlightOn = Boolean(st.flashlightOn);
    rec.aiming = Boolean(st.aiming);
    if (!rec.initialized) {
      rec.x = rec.targetX;
      rec.y = rec.targetY;
      rec.z = rec.targetZ;
      rec.yaw = rec.targetYaw;
      rec.pitch = rec.targetPitch;
      rec.initialized = true;
    }
  }

  update(dt, localOpts, { isHost, incomingStalkers }) {
    if (this.localHero) {
      this.localHero.update(dt, localOpts);
    }

    const blend = 1 - Math.exp(-15 * dt);
    for (const rec of this.remotePlayers.values()) {
      rec.x += (rec.targetX - rec.x) * blend;
      rec.y += (rec.targetY - rec.y) * blend;
      rec.z += (rec.targetZ - rec.z) * blend;
      rec.yaw += wrapAngle(rec.targetYaw - rec.yaw) * blend;
      rec.pitch += (rec.targetPitch - rec.pitch) * blend;
      rec.rig.update(dt, {
        x: rec.x,
        y: rec.y,
        z: rec.z,
        vx: rec.vx,
        vz: rec.vz,
        lookYaw: rec.yaw,
        lookPitch: rec.pitch,
        sprint: rec.sprint,
        flashlightOn: rec.flashlightOn,
        aiming: rec.aiming,
      });
    }

    let stalkerAlert = "";
    if (!isHost && Array.isArray(incomingStalkers) && incomingStalkers.length > 0) {
      this.stalkerPack.applyNetworkState(dt, incomingStalkers);
    } else {
      stalkerAlert = this.stalkerPack.update(
        dt,
        localOpts.x,
        localOpts.z,
        localOpts.lookYaw,
        localOpts.camera,
        localOpts.inBackrooms
      );
    }

    return { stalkerAlert };
  }
}

export async function loadCharacters(scene, opts) {
  const [ronaldoGltf, messiGltf, flashlightGltf, xbotGltf] = await Promise.all([
    loadGlb("../models/cristiano_ronaldo_al_nassr.glb"),
    loadGlb("../models/model_messi.glb"),
    loadGlb("../models/horror_game_flashlight_download_game-ready.glb"),
    loadGlb("./assets/chars/xbot.glb"),
  ]);

  return new CharacterSystem(
    scene,
    { ronaldoGltf, messiGltf, flashlightGltf, xbotGltf },
    opts
  );
}
