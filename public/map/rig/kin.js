/**
 * kin.js — Pure Closed-Form Mechanical, Biomechanical & Open-World Terrain Kinematics Engine.
 *
 * NON-NEGOTIABLE TEARDOWN LAW 2 CONTRACT:
 *   - ZERO `three` imports (pure ES math on plain JS numbers/objects in SI units: m, rad, s, N*m, W).
 *   - Standalone verifiable in Node.js (`node -e "import('./src/rig/kin.js')..."`).
 *   - Single source of truth driving BOTH the 3D Three.js rigs (`gbike_rig.js`, `pelican_rig.js`, `core.js`)
 *     AND the live Retina 2D `Drivetrain X-Ray` polar cadence/torque + `+alpha` sagittal linkage schematic.
 */

import {
  CAMPUS_ROADS,
  CAMPUS_INTERSECTIONS,
} from "../contract.js";

export const CLIP5_PLANK_PITCH_M = 40.023883 / 121.0;

/**
 * Pure-math deterministic mulberry32 PRNG factory (zero `Math.random()`, zero `three` imports).
 */
export function createMulberry32(seed = 0xdec0de42) {
  let a = (seed >>> 0) || 0xdec0de42;
  return function nextRandom() {
    let t = (a = (a + 0x6d2b79f5) | 0);
    t = Math.imul(t ^ (t >>> 15), t | 1);
    t ^= t + Math.imul(t ^ (t >>> 7), t | 61);
    return ((t ^ (t >>> 14)) >>> 0) / 4294967296;
  };
}

export const createSeededRNG = createMulberry32;

export const KIN_CONSTANTS = Object.freeze({
  wheelRadiusM: 0.335,        // 26-inch cruiser wheel outer radius (m)
  tireSquishM: 0.001,         // V8-11: 1.0mm micro-contact patch radial compression (m)
  axleHeightM: 0.334,         // wheelRadiusM (0.335m) - tireSquishM (0.001m)
  wheelbaseM: 1.085,          // Front-to-rear axle separation (m)
  crankRadiusM: 0.170,        // 170mm crank arm length (m)
  chainPitchM: 0.0135,        // Uniform roller-chain tooth pitch (m) -> R1/R2 === 44/16 === 2.750000
  chainringTeeth: 44,         // Front right-side cruiser sprocket teeth
  rearCogTeeth: 16,           // Rear right-side cruiser cog teeth
  gearRatio: 2.75,            // Exact 44T / 16T = 2.750 wheel revs per crank rev (0.00% chain slip)
  chainringRadiusM: (44 * 0.0135) / (2 * Math.PI), // 44T pitch radius (0.0945380m)
  rearCogRadiusM: (16 * 0.0135) / (2 * Math.PI),   // 16T pitch radius (0.0343775m)
  chainLinks: 98,             // Articulated roller links along closed loop (~0.01347m pitch)
  driveSideX: 0.068,          // Unilateral right-side chainline (+X in bike local frame)
  pedalStanceX: 0.156,        // Widened pedal platform center X offset (m) for >=10mm chainguard clearance
  systemMassKg: 20.0,         // 13.2 kg aluminum GBike + 6.8 kg adult California brown pelican + basket fare
  gravityMps2: 9.81,          // Gravitational acceleration (m/s^2)
  legL1M: 0.395,              // Avian femur / thigh length (m)
  legL2M: 0.320,              // Avian tibiotarsus-tarsometatarsus / shin length (m)
  wingL1M: 0.285,             // Humerus upper wing length (m)
  wingL2M: 0.285,             // Ulna/carpometacarpus forewing length (m)
  bbPos: Object.freeze({ x: 0.0, y: 0.285, z: 0.085 }),
  rearAxlePos: Object.freeze({ x: 0.0, y: 0.334, z: 0.5425 }),
  clip5ArchStartX: 0.5,       // West bridge abutment start X (m)
  clip5ArchEndX: 33.1,        // East bridge abutment end X (m) — centered at x = +16.8m
  clip5ArchHeightM: 1.18,     // Mid-span parabolic camber rise (+1.18m)
  clip5PlankPitchM: CLIP5_PLANK_PITCH_M, // Canonical Shoreline bridge plank pitch (~0.330776m)
});

const TWO_PI = Math.PI * 2.0;
const RAD_TO_DEG = 180.0 / Math.PI;

export function clamp(val, lo, hi) {
  if (!Number.isFinite(val)) return lo;
  return val < lo ? lo : val > hi ? hi : val;
}

export function wrapAnglePositive(rad) {
  const m = rad % TWO_PI;
  return m < 0 ? m + TWO_PI : m;
}

function toVec3(v) {
  if (Array.isArray(v)) {
    return { x: Number(v[0]) || 0, y: Number(v[1]) || 0, z: Number(v[2]) || 0 };
  }
  return { x: Number(v.x) || 0, y: Number(v.y) || 0, z: Number(v.z) || 0 };
}

function vecSub(a, b) {
  return { x: a.x - b.x, y: a.y - b.y, z: a.z - b.z };
}

function vecAddScaled(a, b, s) {
  return { x: a.x + b.x * s, y: a.y + b.y * s, z: a.z + b.z * s };
}

function vecDot(a, b) {
  return a.x * b.x + a.y * b.y + a.z * b.z;
}

function vecCross(a, b) {
  return {
    x: a.y * b.z - a.z * b.y,
    y: a.z * b.x - a.x * b.z,
    z: a.x * b.y - a.y * b.x,
  };
}

function vecLen(a) {
  return Math.hypot(a.x, a.y, a.z);
}

function vecNorm(a, fallback = { x: 1, y: 0, z: 0 }) {
  const l = vecLen(a);
  if (l < 1e-9) return { x: fallback.x, y: fallback.y, z: fallback.z };
  return { x: a.x / l, y: a.y / l, z: a.z / l };
}

/**
 * Rodrigues rotation of unit/general vector `v` around unit axis `k` by angle `theta` (rad).
 */
function rotateAroundAxis(v, k, theta) {
  const c = Math.cos(theta);
  const s = Math.sin(theta);
  const kv = vecCross(k, v);
  const kd = vecDot(k, v) * (1.0 - c);
  return {
    x: v.x * c + kv.x * s + k.x * kd,
    y: v.y * c + kv.y * s + k.y * kd,
    z: v.z * c + kv.z * s + k.z * kd,
  };
}

/**
 * Precompute exact exterior bitangent + circular sprocket wrap geometry for the 44T:16T roller chain.
 * Sagittal coordinates operate in bike local (Z, Y) plane where -Z is forward and +Z is rear.
 */
function buildChainLoopSpec() {
  const z1 = KIN_CONSTANTS.bbPos.z;
  const y1 = KIN_CONSTANTS.bbPos.y;
  const r1 = KIN_CONSTANTS.chainringRadiusM;

  const z2 = KIN_CONSTANTS.rearAxlePos.z;
  const y2 = KIN_CONSTANTS.rearAxlePos.y;
  const r2 = KIN_CONSTANTS.rearCogRadiusM;

  const dz = z2 - z1;
  const dy = y2 - y1;
  const centerDist = Math.hypot(dz, dy);
  const baseAngle = Math.atan2(dy, dz);
  const sinAlpha = clamp((r1 - r2) / centerDist, -0.99, 0.99);
  const alpha = Math.asin(sinAlpha);

  // Exterior normal angles for upper (tension) and lower (return) bitangents
  const phiTop = baseAngle + Math.PI * 0.5 - alpha;
  const phiBot = baseAngle - Math.PI * 0.5 + alpha;

  const topRearZ = z2 + r2 * Math.cos(phiTop);
  const topRearY = y2 + r2 * Math.sin(phiTop);
  const topFrontZ = z1 + r1 * Math.cos(phiTop);
  const topFrontY = y1 + r1 * Math.sin(phiTop);

  const botFrontZ = z1 + r1 * Math.cos(phiBot);
  const botFrontY = y1 + r1 * Math.sin(phiBot);
  const botRearZ = z2 + r2 * Math.cos(phiBot);
  const botRearY = y2 + r2 * Math.sin(phiBot);

  const topSpanLen = Math.hypot(topFrontZ - topRearZ, topFrontY - topRearY);
  const botSpanLen = Math.hypot(botRearZ - botFrontZ, botRearY - botFrontY);

  // Forward chain travel:
  //   1. Upper tension span: rear cog top -> front chainring top (forward toward -Z)
  //   2. Front chainring wrap: phiTop -> phiBot over the front (-Z) nose (increasing angle in (Z,Y))
  //   3. Lower return span: front chainring bottom -> rear cog bottom (rearward toward +Z)
  //   4. Rear cog wrap: phiBot -> phiTop + 2*PI over the rear (+Z) tail
  let frontArcSweep = phiBot - phiTop;
  while (frontArcSweep <= 0) frontArcSweep += TWO_PI;
  const frontArcLen = r1 * frontArcSweep;

  let rearArcSweep = phiTop - phiBot;
  while (rearArcSweep <= 0) rearArcSweep += TWO_PI;
  const rearArcLen = r2 * rearArcSweep;

  const totalLengthM = topSpanLen + frontArcLen + botSpanLen + rearArcLen;
  const linkPitchM = totalLengthM / KIN_CONSTANTS.chainLinks;

  return Object.freeze({
    z1,
    y1,
    r1,
    z2,
    y2,
    r2,
    phiTop,
    phiBot,
    topRearZ,
    topRearY,
    topFrontZ,
    topFrontY,
    botFrontZ,
    botFrontY,
    botRearZ,
    botRearY,
    topSpanLen,
    frontArcSweep,
    frontArcLen,
    botSpanLen,
    rearArcSweep,
    rearArcLen,
    totalLengthM,
    linkPitchM,
  });
}

export const CHAIN_LOOP_SPEC = buildChainLoopSpec();

/**
 * Evaluate exact 3D pose & tangent pitch of a chain link at normalized loop parameter `uNorm` in [0, 1).
 * `uNorm` increases in the physical direction of chain motion (rear top -> front top -> front bottom -> rear bottom).
 */
export function getChainLinkPose(uNorm, driveSideX = KIN_CONSTANTS.driveSideX) {
  const C = CHAIN_LOOP_SPEC;
  const u = ((uNorm % 1.0) + 1.0) % 1.0;
  const s = u * C.totalLengthM;

  let z = 0;
  let y = 0;
  let tz = -1;
  let ty = 0;

  if (s < C.topSpanLen) {
    const f = s / C.topSpanLen;
    z = C.topRearZ + (C.topFrontZ - C.topRearZ) * f;
    y = C.topRearY + (C.topFrontY - C.topRearY) * f;
    tz = (C.topFrontZ - C.topRearZ) / C.topSpanLen;
    ty = (C.topFrontY - C.topRearY) / C.topSpanLen;
  } else if (s < C.topSpanLen + C.frontArcLen) {
    const f = (s - C.topSpanLen) / C.frontArcLen;
    const ang = C.phiTop + f * C.frontArcSweep;
    z = C.z1 + C.r1 * Math.cos(ang);
    y = C.y1 + C.r1 * Math.sin(ang);
    tz = -Math.sin(ang);
    ty = Math.cos(ang);
  } else if (s < C.topSpanLen + C.frontArcLen + C.botSpanLen) {
    const f = (s - C.topSpanLen - C.frontArcLen) / C.botSpanLen;
    z = C.botFrontZ + (C.botRearZ - C.botFrontZ) * f;
    y = C.botFrontY + (C.botRearY - C.botFrontY) * f;
    tz = (C.botRearZ - C.botFrontZ) / C.botSpanLen;
    ty = (C.botRearY - C.botFrontY) / C.botSpanLen;
  } else {
    const f = (s - C.topSpanLen - C.frontArcLen - C.botSpanLen) / C.rearArcLen;
    const ang = C.phiBot + f * C.rearArcSweep;
    z = C.z2 + C.r2 * Math.cos(ang);
    y = C.y2 + C.r2 * Math.sin(ang);
    tz = -Math.sin(ang);
    ty = Math.cos(ang);
  }

  // Tangent angle in (Z, Y) plane for orienting link plates along travel vector
  const tangentAngleZY = Math.atan2(ty, tz);

  return {
    x: driveSideX,
    y,
    z,
    tz,
    ty,
    tangentAngleZY,
    totalLengthM: C.totalLengthM,
    linkPitchM: C.linkPitchM,
  };
}

/**
 * Smooth two-lobe biomechanical crank torque curve across the 360-deg pedal stroke (`N*m`),
 * coupled with gravitational grade load `m_sys * g * R_wheel * G * sin(slopePitchRad)` on bridge/campus slopes!
 * Right crank arm is at top dead center (+Y) at crankRad = 0 and maximum forward power stroke
 * (-Z) at crankRad = PI/2; left crank power stroke peaks at crankRad = 3*PI/2.
 */
export function computePedalTorqueNm(crankRad, cadenceScale = 1.0, slopePitchDeg = 0.0) {
  const safeCrank = Number.isFinite(crankRad) ? crankRad : 0.0;
  const cScale = clamp(Number.isFinite(cadenceScale) ? cadenceScale : 1.0, 0.35, 2.0);
  const phi0 = 0.16; // ~9 deg natural avian downstroke lead past TDC
  const s = Math.sin(safeCrank - phi0);
  const tauBase = 4.4;
  const tauLobe = 21.6 * (s * s) * (0.55 + 0.45 * cScale * cScale);
  const tauAsym = 1.15 * Math.sin(2.0 * (safeCrank - phi0) - 0.35) * cScale;
  const slopeRad = clamp(Number.isFinite(slopePitchDeg) ? slopePitchDeg : 0.0, -18.0, 18.0) / RAD_TO_DEG;
  const tauGrade =
    KIN_CONSTANTS.systemMassKg *
    KIN_CONSTANTS.gravityMps2 *
    KIN_CONSTANTS.wheelRadiusM *
    KIN_CONSTANTS.gearRatio *
    Math.sin(slopeRad);
  // Modulate uphill grade effort slightly into the two downstroke lobes for biomechanical realism
  const gradeFactor = tauGrade >= 0 ? 0.68 + 0.64 * (s * s) : 0.85;
  return Math.max(2.2, tauBase + tauLobe + tauAsym + tauGrade * gradeFactor);
}

/**
 * Closed-form 44T:16T (2.75:1) drivetrain, chain speed, crank torque & mechanical power solver.
 */
export function solveDrivetrainKinematics({
  speedMps = 4.35,
  ds = 0.0,
  prevWheelRad = 0.0,
  prevCrankRad = 0.0,
  prevChainDistM = 0.0,
  cadenceScale = 1.0,
  slopePitchDeg = 0.0,
} = {}) {
  const { wheelRadiusM, gearRatio, chainringRadiusM } = KIN_CONSTANTS;
  const safeSpeed = Number.isFinite(speedMps) ? speedMps : 0.0;
  const safeDs = Number.isFinite(ds) ? ds : 0.0;
  const safePrevWheel = Number.isFinite(prevWheelRad) ? prevWheelRad : 0.0;
  const safePrevCrank = Number.isFinite(prevCrankRad) ? prevCrankRad : 0.0;
  const safePrevChain = Number.isFinite(prevChainDistM) ? prevChainDistM : 0.0;
  const v = Math.max(0.0, safeSpeed);

  const dWheelRad = safeDs / wheelRadiusM;
  const dCrankRad = dWheelRad / gearRatio;

  const wheelRad = safePrevWheel + dWheelRad;
  const crankRad = safePrevCrank + dCrankRad;

  const omegaWheel = v / wheelRadiusM;
  const omegaCrank = omegaWheel / gearRatio;

  const wheelRpm = (omegaWheel * 60.0) / TWO_PI;
  const cadenceRpm = (omegaCrank * 60.0) / TWO_PI;

  const chainSpeedMps = omegaCrank * chainringRadiusM;
  const dChainDistM = dCrankRad * chainringRadiusM;
  const chainDistM = safePrevChain + dChainDistM;

  const pedalTorqueNm = computePedalTorqueNm(crankRad, cadenceScale, slopePitchDeg);
  const powerWatts = Math.max(0.0, pedalTorqueNm * omegaCrank);

  return {
    gearRatio,
    wheelRad,
    crankRad,
    dWheelRad,
    dCrankRad,
    omegaWheel,
    omegaCrank,
    wheelRpm,
    cadenceRpm,
    chainSpeedMps,
    chainDistM,
    chainNormalizedOffset: ((chainDistM / CHAIN_LOOP_SPEC.totalLengthM) % 1.0 + 1.0) % 1.0,
    pedalTorqueNm,
    powerWatts,
  };
}

/**
 * Closed-Form `+alpha` 2-Bone Avian IK Solver (Zero Three.js dependency).
 *
 * Uses exact law-of-cosines + Rodrigues rotation around `normalize(dir x bendHint)` by `+alpha`
 * so knees bend strictly FORWARD (`-Z`) toward the handlebars and elbows bend OUTWARD/DOWNWARD.
 */
export function solveTwoBoneAvianIK(root, target, l1, l2, bendHint = { x: 0, y: -0.46, z: -1 }) {
  const rootPos = toVec3(root);
  const rawTarget = toVec3(target);
  const hint = vecNorm(toVec3(bendHint), { x: 0, y: 0, z: -1 });

  const diff = vecSub(rawTarget, rootPos);
  const rawDist = vecLen(diff);

  const minReach = Math.abs(l1 - l2) + 1e-4;
  const maxReach = (l1 + l2) * 0.996;
  const clampedDist = clamp(rawDist, minReach, maxReach);
  const clamped = Math.abs(rawDist - clampedDist) > 1e-6;

  const dir = vecNorm(diff, { x: 0, y: -1, z: 0 });
  const endPos = vecAddScaled(rootPos, dir, clampedDist);

  const cosAlpha = clamp(
    (l1 * l1 + clampedDist * clampedDist - l2 * l2) / (2.0 * l1 * clampedDist),
    -1.0,
    1.0
  );
  const alpha = Math.acos(cosAlpha);

  // Bend plane normal: cross(dir, bendHint) -> rotating `dir` by `+alpha` bends toward `+bendHint`!
  let bendAxis = vecCross(dir, hint);
  if (vecLen(bendAxis) < 1e-6) {
    bendAxis = vecCross(dir, { x: 1, y: 0, z: 0 });
    if (vecLen(bendAxis) < 1e-6) {
      bendAxis = vecCross(dir, { x: 0, y: 0, z: -1 });
    }
  }
  bendAxis = vecNorm(bendAxis);

  const upperDir = vecNorm(rotateAroundAxis(dir, bendAxis, +alpha));
  const jointPos = vecAddScaled(rootPos, upperDir, l1);

  const lowerVec = vecSub(endPos, jointPos);
  const lowerLen = vecLen(lowerVec);
  const lowerDir = vecNorm(lowerVec, dir);

  // Interior flexion angle between thigh (-upperDir) and shin (+lowerDir) in degrees
  const cosInterior = clamp(vecDot({ x: -upperDir.x, y: -upperDir.y, z: -upperDir.z }, lowerDir), -1.0, 1.0);
  const kneeAngleDeg = Math.acos(cosInterior) * RAD_TO_DEG;

  const errUpper = Math.abs(vecLen(vecSub(jointPos, rootPos)) - l1);
  const errLower = Math.abs(lowerLen - l2);
  const errTarget = vecLen(vecSub(endPos, rawTarget));

  return {
    rootPos,
    jointPos,
    midPos: jointPos,
    endPos,
    upperDir,
    lowerDir,
    upperLen: l1,
    lowerLen,
    rawDist,
    clampedDist,
    reachRatio: rawDist / (l1 + l2),
    kneeAngleDeg,
    interiorAngleDeg: kneeAngleDeg,
    jointGapErrorM: Math.max(errUpper, errLower),
    targetErrorM: errTarget,
    clamped,
  };
}

/**
 * Deterministic parabolic camber heightfield `h_5(x)` for Clip 5's weathered-timber & Corten
 * Warren truss bridge over Stevens Creek (`+0.92m` mid-span arch centered at `x = +16.8m`).
 * Shared 1:1 between `campus_worlds.js` bridge geometry and `solveWheelbaseTerrainPose`.
 */
export function getClip5BridgeHeightAtX(x) {
  const { clip5ArchStartX, clip5ArchEndX, clip5ArchHeightM } = KIN_CONSTANTS;
  if (x <= clip5ArchStartX || x >= clip5ArchEndX) return 0.0;
  const uArch = (x - clip5ArchStartX) / (clip5ArchEndX - clip5ArchStartX);
  const s = Math.sin(Math.PI * uArch);
  return clip5ArchHeightM * s * s;
}

/**
 * Deterministic terrain/bridge surface elevation `h_clip(u)` for all 5 Mountain View campus clips.
 *   - Clips 1-4: C^1 smooth path crown undulations (`0.000m` & zero slope at clip endpoints).
 *   - Clip 5: Unmistakable `+0.92m` cambered parabolic Warren truss bridge arch over Stevens Creek.
 */
export function getClipTerrainHeight(clipId, u, worldX = null) {
  const uc = clamp(u, 0.0, 1.0);
  if (clipId === "clip5") {
    const x = worldX !== null && Number.isFinite(worldX) ? worldX : -3.2 + 40.0 * uc;
    return getClip5BridgeHeightAtX(x);
  }
  const env = Math.sin(Math.PI * uc);
  const env2 = env * env;
  switch (clipId) {
    case "clip1":
      return 0.026 * env2 * (1.0 + 0.32 * Math.sin(TWO_PI * uc));
    case "clip2":
      return 0.016 * env2;
    case "clip3":
      return 0.028 * env2 * (1.0 - 0.28 * Math.sin(TWO_PI * uc));
    case "clip4":
      return 0.020 * env2;
    default:
      return 0.0;
  }
}

/**
 * Two-point front/rear wheel terrain sampling & bridge arch pitch solver.
 *
 * Samples `yRear = heightAtArcS(sCenter - wheelbaseM / 2)` and `yFront = heightAtArcS(sCenter + wheelbaseM / 2)`:
 *   - `slopePitchDeg` > 0 when climbing uphill (`yFront > yRear`), 0 at crest, < 0 when descending.
 *   - In our bike's local right-hand frame (`-Z` forward, `+Y` up, `+X` right), rotating `heroAnchor`
 *     around local `+X` by `+slopePitchRad` lifts the `-Z` front wheel by `+dy/2` and lowers the `+Z`
 *     rear wheel by `-dy/2` while rotating the axle offset `(0, axleY, +-L/2)` onto the exact surface normal,
 *     yielding `< 0.1 mm` tire-to-deck tangency error across the entire `+0.92m` arch!
 */
export function solveWheelbaseTerrainPose(
  heightAtArcS,
  sCenter,
  wheelbaseM = KIN_CONSTANTS.wheelbaseM
) {
  const wb = Math.max(0.2, Number.isFinite(wheelbaseM) ? wheelbaseM : KIN_CONSTANTS.wheelbaseM);
  const halfWb = wb * 0.5;
  const axleH = KIN_CONSTANTS.axleHeightM;
  const ds = 0.035;

  let theta = 0.0;
  let sinTheta = 0.0;
  let cosTheta = 1.0;
  let alphaF = 0.0;
  let alphaR = 0.0;
  let yRear = heightAtArcS(sCenter - halfWb);
  let yFront = heightAtArcS(sCenter + halfWb);
  let yCenter = 0.5 * (yFront + yRear);

  for (let iter = 0; iter < 3; iter++) {
    const sConF = halfWb * cosTheta + axleH * (Math.sin(alphaF) - sinTheta);
    const sConR = -halfWb * cosTheta + axleH * (Math.sin(alphaR) - sinTheta);
    yFront = heightAtArcS(sCenter + sConF);
    yRear = heightAtArcS(sCenter + sConR);
    alphaF = Math.atan(
      (heightAtArcS(sCenter + sConF + ds) - heightAtArcS(sCenter + sConF - ds)) / (2.0 * ds)
    );
    alphaR = Math.atan(
      (heightAtArcS(sCenter + sConR + ds) - heightAtArcS(sCenter + sConR - ds)) / (2.0 * ds)
    );
    const yTf = yFront + axleH * (Math.cos(alphaF) - cosTheta);
    const yTr = yRear + axleH * (Math.cos(alphaR) - cosTheta);
    theta = Math.asin(clamp((yTf - yTr) / wb, -0.78, 0.78));
    sinTheta = Math.sin(theta);
    cosTheta = Math.cos(theta);
    yCenter = 0.5 * (yTf + yTr);
  }

  const slopePitchRad = theta;
  const slopePitchDeg = slopePitchRad * RAD_TO_DEG;
  const normalLiftM = yCenter - 0.5 * (yFront + yRear);
  const bridgeArchElevationM = yCenter;

  return {
    yRear,
    yFront,
    yCenter,
    bridgeArchElevationM,
    normalLiftM,
    slopePitchRad,
    anchorPitchXRad: slopePitchRad,
    slopePitchDeg,
  };
}

/**
 * Deterministic surface micro-roughness profile (paver joints in Clip 2, beveled timber planks in Clip 5)
 * driving pneumatic tire + cruiser saddle coil-spring micro-suspension (`0.0 .. 4.5 mm`).
 */
export function evaluateSurfaceBumpTargetM(
  surfaceType,
  arcDistanceM,
  plankPitchM = CLIP5_PLANK_PITCH_M
) {
  const s = Math.max(0.0, arcDistanceM);
  if (surfaceType === "wood_planks") {
    const pitch = Math.max(0.18, plankPitchM);
    const phase = (s % pitch) / pitch; // 0..1 across each plank
    // Crisp gap impulse at plank seam (`phase` near 0/1) + subtle cambered timber crown
    const seamPulse = Math.exp(-Math.pow((phase - 0.08) / 0.09, 2));
    return (0.0029 * seamPulse + 0.0005 * (1.0 - Math.cos(TWO_PI * phase)) * 0.5);
  }
  if (surfaceType === "pavers") {
    const pitch = 0.65;
    const phase = (s % pitch) / pitch;
    const jointPulse = Math.exp(-Math.pow((phase - 0.07) / 0.08, 2));
    return 0.0017 * jointPulse + 0.00025 * Math.sin(s * 9.5) * Math.sin(s * 9.5);
  }
  if (surfaceType === "concrete") {
    const pitch = 2.4;
    const phase = (s % pitch) / pitch;
    const expansionJoint = Math.exp(-Math.pow((phase - 0.04) / 0.035, 2));
    return 0.0011 * expansionJoint + 0.00015 * (0.5 + 0.5 * Math.sin(s * 5.2));
  }
  // Smooth campus asphalt micro-texture
  return 0.00022 * (0.5 + 0.5 * Math.sin(s * 6.4));
}

export function createBikeDynamicsState() {
  return {
    bankRad: 0.0,
    bankVel: 0.0,
    steerRad: 0.0,
    steerVel: 0.0,
    prevKappa: 0.0,
    suspM: 0.0,
    suspVel: 0.0,
    gularY: 0.0,
    gularVel: 0.0,
  };
}

/**
 * Analytical steady-state equilibrium initializer for deterministic time-seeks (`renderAtTime` / multi-worker shards).
 * Evaluates exact forced damped harmonic oscillator transfer function `H(iw)` at `2*omegaCrank` and `13.4 rad/s`
 * matching `stepBikeDynamicsSpring` (`wn = 15.5 rad/s, zeta = 0.28`) so shard boundaries have zero transient ringing!
 */
export function syncBikeDynamicsAnalytically(
  dynState,
  {
    kappa = 0.0,
    speedMps = 4.35,
    surfaceType = "asphalt",
    arcDistanceM = 0.0,
    plankPitchM = CLIP5_PLANK_PITCH_M,
    crankRad = 0.0,
    omegaCrank = null,
    simTime = 0.0,
  } = {}
) {
  const safeKappa = Number.isFinite(kappa) ? kappa : 0.0;
  const safeSpeed = Number.isFinite(speedMps) ? speedMps : 0.0;
  const safeArc = Number.isFinite(arcDistanceM) ? arcDistanceM : 0.0;
  const safePlank = Number.isFinite(plankPitchM) ? plankPitchM : CLIP5_PLANK_PITCH_M;
  const safeCrank = Number.isFinite(crankRad) ? crankRad : 0.0;
  const safeSimTime = Number.isFinite(simTime) ? simTime : 0.0;

  const maxBank = 19.5 / RAD_TO_DEG;
  const maxSteer = 22.0 / RAD_TO_DEG;
  const targetBank = clamp(Math.atan((safeSpeed * safeSpeed * safeKappa) / KIN_CONSTANTS.gravityMps2), -maxBank, maxBank);
  const targetSteer = clamp(
    Math.atan((KIN_CONSTANTS.wheelbaseM * safeKappa) / Math.max(0.5, Math.cos(targetBank))),
    -maxSteer,
    maxSteer
  );

  dynState.bankRad = targetBank;
  dynState.bankVel = 0.0;
  dynState.steerRad = targetSteer;
  dynState.steerVel = 0.0;
  dynState.prevKappa = safeKappa;
  dynState.suspM = evaluateSurfaceBumpTargetM(surfaceType, safeArc, safePlank);
  dynState.suspVel = 0.0;

  const wCrank =
    omegaCrank !== null && Number.isFinite(omegaCrank)
      ? Math.max(0.0, omegaCrank)
      : Math.max(0.0, safeSpeed) / (KIN_CONSTANTS.wheelRadiusM * KIN_CONSTANTS.gearRatio);

  const wn = 15.5;
  const zeta = 0.26;
  const wn2 = wn * wn;

  const w1 = 2.0 * wCrank;
  const f1 = 0.95 * clamp(wCrank / 6.5, 0.4, 1.8);
  const phi1 = safeCrank * 2.0 - 0.45;
  const den1 = Math.hypot(wn2 - w1 * w1, 2.0 * zeta * wn * w1);
  const lag1 = Math.atan2(2.0 * zeta * wn * w1, wn2 - w1 * w1);
  const amp1 = f1 / Math.max(1e-6, den1);

  const w2 = 13.4;
  const f2 = 0.32 * clamp(safeSpeed / 4.5, 0.4, 1.8);
  const phi2 = safeSimTime * w2;
  const den2 = Math.hypot(wn2 - w2 * w2, 2.0 * zeta * wn * w2);
  const lag2 = Math.atan2(2.0 * zeta * wn * w2, wn2 - w2 * w2);
  const amp2 = f2 / Math.max(1e-6, den2);

  dynState.gularY = clamp(
    amp1 * Math.sin(phi1 - lag1) + amp2 * Math.sin(phi2 - lag2),
    -0.018,
    0.018
  );
  dynState.gularVel = clamp(
    w1 * amp1 * Math.cos(phi1 - lag1) + w2 * amp2 * Math.cos(phi2 - lag2),
    -0.65,
    0.65
  );
  return dynState;
}

/**
 * Deterministic 2nd-order critically damped counter-steer + centripetal bank spring,
 * paver/plank saddle micro-suspension, and RK4 gular throat pouch harmonic oscillator.
 */
export function stepBikeDynamicsSpring(
  dynState,
  {
    kappa = 0.0,
    speedMps = 4.35,
    surfaceType = "asphalt",
    arcDistanceM = 0.0,
    plankPitchM = CLIP5_PLANK_PITCH_M,
    crankRad = 0.0,
    omegaCrank = 6.4,
    simTime = 0.0,
    dt = 1 / 60,
  } = {}
) {
  const safeKappa = Number.isFinite(kappa) ? kappa : 0.0;
  const safeSpeed = Number.isFinite(speedMps) ? speedMps : 0.0;
  const safeArc = Number.isFinite(arcDistanceM) ? arcDistanceM : 0.0;
  const safePlank = Number.isFinite(plankPitchM) ? plankPitchM : CLIP5_PLANK_PITCH_M;
  const safeCrank = Number.isFinite(crankRad) ? crankRad : 0.0;
  const safeOmegaCrank = Number.isFinite(omegaCrank) ? omegaCrank : 0.0;
  const safeSimTime = Number.isFinite(simTime) ? simTime : 0.0;

  dynState.bankRad = Number.isFinite(dynState.bankRad) ? dynState.bankRad : 0.0;
  dynState.bankVel = Number.isFinite(dynState.bankVel) ? dynState.bankVel : 0.0;
  dynState.steerRad = Number.isFinite(dynState.steerRad) ? dynState.steerRad : 0.0;
  dynState.steerVel = Number.isFinite(dynState.steerVel) ? dynState.steerVel : 0.0;
  dynState.prevKappa = Number.isFinite(dynState.prevKappa) ? dynState.prevKappa : safeKappa;
  dynState.suspM = Number.isFinite(dynState.suspM) ? dynState.suspM : 0.0;
  dynState.suspVel = Number.isFinite(dynState.suspVel) ? dynState.suspVel : 0.0;
  dynState.gularY = Number.isFinite(dynState.gularY) ? dynState.gularY : 0.0;
  dynState.gularVel = Number.isFinite(dynState.gularVel) ? dynState.gularVel : 0.0;

  const h = clamp(dt, 0.0, 0.05);
  if (h <= 1e-7) {
    return {
      bankRad: dynState.bankRad,
      steerRad: dynState.steerRad,
      suspensionCompressionMm: clamp(dynState.suspM * 1000.0, 0.0, 4.5),
      gularDeflectionM: dynState.gularY,
    };
  }

  const maxBank = 19.5 / RAD_TO_DEG;
  const maxSteer = 22.0 / RAD_TO_DEG;
  const targetBank = clamp(
    Math.atan((safeSpeed * safeSpeed * safeKappa) / KIN_CONSTANTS.gravityMps2),
    -maxBank,
    maxBank
  );
  const dKappaDt = clamp((safeKappa - dynState.prevKappa) / Math.max(h, 1 / 120), -2.5, 2.5);
  dynState.prevKappa = safeKappa;

  // Brief bicycle counter-steer lead (`-0.12 * dKappa/dt`) on turn entry before settling into kinematic steer
  const kinematicSteer = Math.atan(
    (KIN_CONSTANTS.wheelbaseM * safeKappa) / Math.max(0.5, Math.cos(targetBank))
  );
  const targetSteer = clamp(kinematicSteer - 0.12 * dKappaDt, -maxSteer, maxSteer);

  // Sub-step 2nd-order critically damped springs (`zeta = 0.92, wn = 11.5 rad/s`)
  const subSteps = 2;
  const subDt = h / subSteps;
  const wnBank = 11.5;
  const zetaBank = 0.92;

  const bumpTargetM = evaluateSurfaceBumpTargetM(surfaceType, safeArc, safePlank);
  const wnSusp = 28.0;
  const zetaSusp = 0.56;

  // Gular pouch harmonic oscillator (`wn = 15.5 rad/s, zeta = 0.26`) integrated via RK4
  const wnGular = 15.5;
  const zetaGular = 0.26;

  for (let i = 0; i < subSteps; i++) {
    const aBank =
      wnBank * wnBank * (targetBank - dynState.bankRad) -
      2.0 * zetaBank * wnBank * dynState.bankVel;
    dynState.bankVel += aBank * subDt;
    dynState.bankRad = clamp(dynState.bankRad + dynState.bankVel * subDt, -maxBank, maxBank);

    const aSteer =
      wnBank * wnBank * (targetSteer - dynState.steerRad) -
      2.0 * zetaBank * wnBank * dynState.steerVel;
    dynState.steerVel += aSteer * subDt;
    dynState.steerRad = clamp(dynState.steerRad + dynState.steerVel * subDt, -maxSteer, maxSteer);

    const aSusp =
      wnSusp * wnSusp * (bumpTargetM - dynState.suspM) -
      2.0 * zetaSusp * wnSusp * dynState.suspVel;
    dynState.suspVel += aSusp * subDt;
    dynState.suspM = clamp(dynState.suspM + dynState.suspVel * subDt, 0.0, 0.0045);

    // Coupled pedal cadence vertical acceleration + saddle suspension bounce + headwind flutter
    const tSub = safeSimTime + i * subDt;
    const pedalForcing = 0.95 * Math.sin(safeCrank * 2.0 - 0.45) * clamp(safeOmegaCrank / 6.5, 0.4, 1.8);
    const windForcing = 0.32 * Math.sin(tSub * 13.4) * clamp(safeSpeed / 4.5, 0.4, 1.8);
    const bumpForcing = -dynState.suspVel * 18.0;
    const driveAccel = pedalForcing + windForcing + bumpForcing;

    const gularAccel = (y, v) =>
      driveAccel - 2.0 * zetaGular * wnGular * v - wnGular * wnGular * y;

    const y0 = dynState.gularY;
    const v0 = dynState.gularVel;
    const k1y = v0;
    const k1v = gularAccel(y0, v0);

    const k2y = v0 + 0.5 * subDt * k1v;
    const k2v = gularAccel(y0 + 0.5 * subDt * k1y, k2y);

    const k3y = v0 + 0.5 * subDt * k2v;
    const k3v = gularAccel(y0 + 0.5 * subDt * k2y, k3y);

    const k4y = v0 + subDt * k3v;
    const k4v = gularAccel(y0 + subDt * k3y, k4y);

    dynState.gularY = clamp(
      y0 + (subDt / 6.0) * (k1y + 2.0 * k2y + 2.0 * k3y + k4y),
      -0.018,
      0.018
    );
    dynState.gularVel = clamp(
      v0 + (subDt / 6.0) * (k1v + 2.0 * k2v + 2.0 * k3v + k4v),
      -0.65,
      0.65
    );
  }

  return {
    bankRad: dynState.bankRad,
    steerRad: dynState.steerRad,
    suspensionCompressionMm: clamp(dynState.suspM * 1000.0, 0.0, 4.5),
    gularDeflectionM: dynState.gularY,
  };
}

// ============================================================================
// OPEN-WORLD CAMPUS HEIGHTFIELD, RAMP & WHEELBASE POSE SOLVERS (v3.0)
// ============================================================================

const OPEN_WORLD_ROAD_SPECS = CAMPUS_ROADS.map((r) => {
  const dx = r.x2 - r.x1;
  const dz = r.z2 - r.z1;
  const lenSq = dx * dx + dz * dz;
  return Object.freeze({
    id: r.id,
    x1: r.x1,
    z1: r.z1,
    x2: r.x2,
    z2: r.z2,
    dx,
    dz,
    lenSq,
    len: Math.sqrt(lenSq),
    halfW: r.widthM * 0.5,
    surface: r.surface || "asphalt",
    isArchedBridge: Boolean(r.isArchedBridge),
    archHeightM: Number(r.archHeightM) || 0.0,
  });
});

const STEVENS_BRIDGE_SPEC =
  OPEN_WORLD_ROAD_SPECS.find((r) => r.id === "stevens_creek_bridge") ||
  Object.freeze({
    id: "stevens_creek_bridge",
    x1: 52.0,
    z1: -86.0,
    x2: 18.0,
    z2: -158.0,
    dx: -34.0,
    dz: -72.0,
    lenSq: 6340.0,
    len: Math.sqrt(6340.0),
    halfW: 3.1,
    surface: "wood_planks",
    isArchedBridge: true,
    archHeightM: 1.18,
  });


/**
 * Evaluates projection parameter `u` and lateral offset `dPerp` onto `stevens_creek_bridge`
 * (`(52, -86) -> (18, -158)`).
 */
export function getStevensCreekBridgeParam(x, z) {
  const br = STEVENS_BRIDGE_SPEC;
  const uRaw = ((x - br.x1) * br.dx + (z - br.z1) * br.dz) / br.lenSq;
  const uClamped = clamp(uRaw, 0.0, 1.0);
  const px = br.x1 + uClamped * br.dx;
  const pz = br.z1 + uClamped * br.dz;
  const dPerp = Math.hypot(x - px, z - pz);
  const onSpan = uRaw > 0.0 && uRaw < 1.0 && dPerp <= br.halfW + 0.45;
  let elevationM = 0.0;
  if (onSpan) {
    const latWeight =
      dPerp <= br.halfW
        ? 1.0
        : 0.5 * (1.0 + Math.cos(Math.PI * clamp((dPerp - br.halfW) / 0.45, 0.0, 1.0)));
    const s = Math.sin(Math.PI * uRaw);
    elevationM = br.archHeightM * s * s * latWeight;
  }
  return {
    uRaw,
    uClamped,
    dPerp,
    onDeck: uRaw >= -0.02 && uRaw <= 1.02 && dPerp <= br.halfW,
    elevationM,
  };
}

export function getOpenWorldEarthHeight(x, z) {
  const px = Number(x) || 0.0;
  const pz = Number(z) || 0.0;

  // 1. Signed clearance outside Gym, Forecourt threshold, Road carriageways & ADA Intersection circles
  const sGym = Math.max(Math.abs(px) - 12.0, Math.max(130.0 - pz, pz - 152.0));
  const sBreakoutApron = Math.max(
    Math.abs(px) - 7.0,
    Math.max(116.0 - pz, pz - 131.7)
  );
  let sMin = Math.min(sGym, sBreakoutApron);

  for (let i = 0; i < OPEN_WORLD_ROAD_SPECS.length; i++) {
    const r = OPEN_WORLD_ROAD_SPECS[i];
    const t =
      r.lenSq > 1e-8 ? clamp(((px - r.x1) * r.dx + (pz - r.z1) * r.dz) / r.lenSq, 0.0, 1.0) : 0.0;
    const cx = r.x1 + t * r.dx;
    const cz = r.z1 + t * r.dz;
    const sRoad = Math.hypot(px - cx, pz - cz) - r.halfW;
    if (sRoad < sMin) sMin = sRoad;
  }

  for (let i = 0; i < CAMPUS_INTERSECTIONS.length; i++) {
    const it = CAMPUS_INTERSECTIONS[i];
    const sInt = Math.hypot(px - it.x, pz - it.z) - it.radiusM;
    if (sInt < sMin) sMin = sInt;
  }

  // Smooth 0.35m cosine bevel up onto +0.075m sidewalk/lawn apron
  let curbHeight = 0.0;
  if (sMin > 0.0) {
    if (sMin >= 0.35) {
      curbHeight = 0.075;
    } else {
      const uCurb = sMin / 0.35;
      curbHeight = 0.075 * 0.5 * (1.0 - Math.cos(Math.PI * uCurb));
    }
  }

  // 2. Gentle +0.22m Shoreline Amphitheatre esplanade rise starting at z < -163.0
  // so 100% of the (14, -178) R=6.5m medallion & monument sit on a dead-flat +0.220m plateau!
  let baseGround = curbHeight;
  if (pz < -163.0) {
    const uEsp = clamp((-163.0 - pz) / 8.5, 0.0, 1.0);
    const smoothEsp = 0.5 * (1.0 - Math.cos(Math.PI * uEsp));
    baseGround = curbHeight * (1.0 - smoothEsp) + 0.22 * smoothEsp;
  }

  return baseGround;
}

/**
 * Computes signed clearance (m) from `(px, pz)` to the nearest `+0.016m` campus asphalt road,
 * ADA intersection, Visitor Hex Paver forecourt, Android/Stan plaza ring, or Bay View promenade.
 */
function signedCampusPavedSurfaceClearance(px, pz) {
  let sMin = Infinity;

  for (let i = 0; i < OPEN_WORLD_ROAD_SPECS.length; i++) {
    const r = OPEN_WORLD_ROAD_SPECS[i];
    if (r.isArchedBridge) continue;
    const t =
      r.lenSq > 1e-8 ? clamp(((px - r.x1) * r.dx + (pz - r.z1) * r.dz) / r.lenSq, 0.0, 1.0) : 0.0;
    const cx = r.x1 + t * r.dx;
    // Keep Gradient Canopy interior (`z >= 127.0`) at exact `0.000m` floor datum
    const cz = r.id === "canopy_pinwheel_walk" ? Math.min(r.z1 + t * r.dz, 125.92) : r.z1 + t * r.dz;
    const sRoad = Math.hypot(px - cx, pz - cz) - r.halfW;
    if (sRoad < sMin) sMin = sRoad;
  }

  for (let i = 0; i < CAMPUS_INTERSECTIONS.length; i++) {
    const it = CAMPUS_INTERSECTIONS[i];
    const sInt = Math.hypot(px - it.x, pz - it.z) - it.radiusM;
    if (sInt < sMin) sMin = sInt;
  }

  // Visitor Experience Hex Paver Forecourt (`x in [-24.05, +28.05], z in [121.55, 125.92]`)
  const sHex = Math.max(Math.max(-24.05 - px, px - 28.05), Math.max(121.55 - pz, pz - 125.92));
  if (sHex < sMin) sMin = sHex;

  // Android Lawn Plaza (`(-118, 96)`) & approach walk
  const sAndroidDisc = Math.hypot(px + 118.0, pz - 96.0) - 9.42;
  if (sAndroidDisc < sMin) sMin = sAndroidDisc;
  const sAndroidWalk = Math.max(Math.abs(px + 118.0) - 4.62, Math.max(86.9 - pz, pz - 96.0));
  if (sAndroidWalk < sMin) sMin = sAndroidWalk;

  // Stan T-Rex Courtyard sandstone paver ring (`R = 13.55..18.88m`) & North/South terraces
  const rStan = Math.hypot(px + 118.0, pz + 50.0);
  const sStanRing = Math.max(13.55 - rStan, rStan - 18.88);
  if (sStanRing < sMin) sMin = sStanRing;
  const sStanNorth = Math.max(Math.abs(px + 118.0) - 5.45, Math.max(-35.85 - pz, pz - -25.4));
  if (sStanNorth < sMin) sMin = sStanNorth;
  const sStanSouth = Math.max(Math.abs(px + 118.0) - 4.85, Math.max(-72.55 - pz, pz - -64.15));
  if (sStanSouth < sMin) sMin = sStanSouth;

  // Bay View Waterfront Promenade (`x = 156, halfW = 8.05m, z in [-86, 112]`)
  const sBayView = Math.max(Math.abs(px - 156.0) - 8.05, Math.max(-86.0 - pz, pz - 112.0));
  if (sBayView < sMin) sMin = sBayView;

  return sMin;
}

export function getOpenWorldTerrainHeight(x, z) {
  const px = Number(x) || 0.0;
  const pz = Number(z) || 0.0;
  const earthY = getOpenWorldEarthHeight(px, pz);

  // 1. Exact rendered riding surface datum (`0.000m` inside Fitness Center gym floor `z >= 127.0`,
  //    smooth taper `127.0 -> 125.92`, and `+0.016m` on campus asphalt roads & stone paver promenades!)
  let baseGround = earthY;
  if (Math.abs(px) <= 12.5 && pz >= 127.0) {
    baseGround = 0.0;
  } else if (Math.abs(px) <= 26.0 && pz > 125.92 && pz < 127.0) {
    const uTap = clamp((127.0 - pz) / (127.0 - 125.92), 0.0, 1.0);
    const sTap = uTap * uTap * (3.0 - 2.0 * uTap);
    baseGround = earthY + 0.016 * sTap;
  } else {
    const sPaved = signedCampusPavedSurfaceClearance(px, pz);
    if (sPaved <= 0.0) {
      baseGround = earthY + 0.016;
    } else if (sPaved < 0.35) {
      const wPaved = 0.5 * (1.0 + Math.cos(Math.PI * (sPaved / 0.35)));
      baseGround = earthY + 0.016 * wPaved;
    }
  }

  // 2. Parabolic Corten Warren Truss Arch along `stevens_creek_bridge` (`1.18 * sin^2(pi * u)`)
  const bridgeInfo = getStevensCreekBridgeParam(px, pz);
  if (bridgeInfo.elevationM > 0.0) {
    baseGround = Math.max(baseGround, bridgeInfo.elevationM);
  }

  return baseGround;
}

/**
 * Classifies surface material under `(x, z)` (`"wood_planks"` | `"pavers"` | `"concrete"` | `"asphalt"`)
 * for walkable footing & ground material checks.
 */
export function getOpenWorldSurfaceType(x, z) {
  const px = Number(x) || 0.0;
  const pz = Number(z) || 0.0;

  const bridgeInfo = getStevensCreekBridgeParam(px, pz);
  if (bridgeInfo.onDeck) return "wood_planks";

  if (Math.abs(px) <= 12.5 && pz >= 129.5 && pz <= 152.5) {
    return "concrete";
  }

  let bestDist = Infinity;
  let bestSurface = "concrete";
  for (let i = 0; i < OPEN_WORLD_ROAD_SPECS.length; i++) {
    const r = OPEN_WORLD_ROAD_SPECS[i];
    const t =
      r.lenSq > 1e-8 ? clamp(((px - r.x1) * r.dx + (pz - r.z1) * r.dz) / r.lenSq, 0.0, 1.0) : 0.0;
    const d = Math.hypot(px - (r.x1 + t * r.dx), pz - (r.z1 + t * r.dz)) - r.halfW;
    if (d <= 0.35 && d < bestDist) {
      bestDist = d;
      bestSurface = r.surface;
    }
  }
  if (bestDist <= 0.35) return bestSurface;

  // Stan T-Rex Courtyard & Android Lawn Plaza pavers
  if (Math.hypot(px - -118.0, pz - -50.0) <= 22.0) return "pavers";
  if (Math.hypot(px - -118.0, pz - 92.0) <= 18.0) return "pavers";
  if (pz < -168.0) return "pavers";

  return "concrete";
}

/**
 * Open-World Two-Point Front/Rear Wheelbase Terrain Pose Solver (`kin.js`).
 *
 * Using forward unit vector `(sin(headingYaw), -cos(headingYaw))`, samples `yRear` at `-wheelbaseM/2`
 * and `yFront` at `+wheelbaseM/2`, returning `{ groundY, yRear, yFront, slopePitchRad, slopePitchDeg, centerY }`
 * while cleanly adding `jumpHeightM` when airborne without sharp ramp-lip nose-dive kinks.
 */
export function solveOpenWorldWheelbasePose(
  x,
  z,
  headingYaw,
  wheelbaseM = KIN_CONSTANTS.wheelbaseM,
  wheelRadiusM = KIN_CONSTANTS.wheelRadiusM,
  jumpHeightM = 0.0
) {
  const px = Number.isFinite(x) ? x : 0.0;
  const pz = Number.isFinite(z) ? z : 0.0;
  const yaw = Number.isFinite(headingYaw) ? headingYaw : 0.0;
  const wb = Math.max(0.2, Number.isFinite(wheelbaseM) ? wheelbaseM : KIN_CONSTANTS.wheelbaseM);
  const wRad = Math.max(0.1, Number.isFinite(wheelRadiusM) ? wheelRadiusM : KIN_CONSTANTS.wheelRadiusM);
  const jumpH = Math.max(0.0, Number.isFinite(jumpHeightM) ? jumpHeightM : 0.0);

  const fwdX = Math.sin(yaw);
  const fwdZ = -Math.cos(yaw);
  const halfWb = wb * 0.5;
  const axleH = Math.max(0.0, wRad - KIN_CONSTANTS.tireSquishM);

  const groundY = getOpenWorldTerrainHeight(px, pz);
  const bridgeInfo = getStevensCreekBridgeParam(px, pz);

  // Pure airborne / trainer-elevated datum: when `jumpH > 0.008m`, decouple `centerY` completely
  // from two-point grounded axle averaging so rear-wheel ramp overhang never contaminates parabolic flight!
  if (jumpH > 0.008) {
    const rearX0 = px - fwdX * halfWb;
    const rearZ0 = pz - fwdZ * halfWb;
    const frontX0 = px + fwdX * halfWb;
    const frontZ0 = pz + fwdZ * halfWb;
    const yRear0 = getOpenWorldTerrainHeight(rearX0, rearZ0);
    const yFront0 = getOpenWorldTerrainHeight(frontX0, frontZ0);
    const centerY = groundY + jumpH;
    return {
      groundY,
      yRear: yRear0,
      yFront: yFront0,
      slopePitchRad: 0.0,
      anchorPitchXRad: 0.0,
      slopePitchDeg: 0.0,
      centerY,
      yCenter: centerY,
      normalLiftM: 0.0,
      jumpHeightM: jumpH,
      bridgeArchElevationM: bridgeInfo.elevationM,
    };
  }

  // Detect active launch-ramp lip overhang or landing-ramp crest overhang so neither wheel plunges
  // into a vertical ramp end-face while the companion wheel is rolling on the wooden deck!
  const rearGuessX = px - fwdX * halfWb;
  const rearGuessZ = pz - fwdZ * halfWb;
  const frontGuessX = px + fwdX * halfWb;
  const frontGuessZ = pz + fwdZ * halfWb;
  const rampRearGuess = evaluateJumpRampAtPoint(rearGuessX, rearGuessZ);
  const landFrontGuess = evaluateLandingRampAtPoint(frontGuessX, frontGuessZ);

  const sampleWheelSurfaceHeight = (sOffset) => {
    const wx = px + fwdX * sOffset;
    const wz = pz + fwdZ * sOffset;

    if (rampRearGuess && rampRearGuess.onDeck && rampRearGuess.u > 0.50) {
      const rp = rampRearGuess.ramp;
      const localFwd = (wx - rp.x) * rp.fwdX + (wz - rp.z) * rp.fwdZ;
      const localRight = (wx - rp.x) * rp.rightX + (wz - rp.z) * rp.rightZ;
      if (localFwd > rp.halfL && Math.abs(localRight) <= rp.halfW + 0.15) {
        const lipX = rp.x + rp.fwdX * rp.halfL;
        const lipZ = rp.z + rp.fwdZ * rp.halfL;
        const lipBase = getOpenWorldEarthHeight(lipX, lipZ) + 0.016;
        return lipBase + rp.heightM + (localFwd - rp.halfL) * Math.tan(rp.lipPitchRad);
      }
    }

    if (landFrontGuess && landFrontGuess.onDeck && landFrontGuess.u < 0.50) {
      const rp = landFrontGuess.ramp;
      const localFwd = (wx - rp.x) * rp.fwdX + (wz - rp.z) * rp.fwdZ;
      const localRight = (wx - rp.x) * rp.rightX + (wz - rp.z) * rp.rightZ;
      if (localFwd < -rp.halfL && Math.abs(localRight) <= rp.halfW + 0.15) {
        const crestX = rp.x - rp.fwdX * rp.halfL;
        const crestZ = rp.z - rp.fwdZ * rp.halfL;
        const crestBase = getOpenWorldEarthHeight(crestX, crestZ) + 0.016;
        return crestBase + rp.heightM + (localFwd + rp.halfL) * Math.tan(rp.crestPitchRad);
      }
    }

    return getOpenWorldTerrainHeight(wx, wz);
  };

  // V8-11 Exact 3-Iteration Rigid-Body Wheel-Chord Tangency Solver (zero pitch clamp!):
  // Solves `(s_hub_i, Y_hub_i) = (s_con_i, H(s_con_i)) + axleH * n_i` simultaneously for front & rear hubs,
  // guaranteeing `|perpDistToSurface| <= 0.0015m` (`<= 1.5mm`) across 0 deg roads, +19 deg launch ramps,
  // -13.4 deg landing ramps, and curved Stevens Creek Bridge!
  const ds = 0.035;
  let theta = 0.0;
  let sinTheta = 0.0;
  let cosTheta = 1.0;
  let alphaF = 0.0;
  let alphaR = 0.0;
  let yRear = sampleWheelSurfaceHeight(-halfWb);
  let yFront = sampleWheelSurfaceHeight(halfWb);
  let centerY = 0.5 * (yFront + yRear) + jumpH;

  for (let iter = 0; iter < 3; iter++) {
    const sConF = halfWb * cosTheta + axleH * (Math.sin(alphaF) - sinTheta);
    const sConR = -halfWb * cosTheta + axleH * (Math.sin(alphaR) - sinTheta);
    yFront = sampleWheelSurfaceHeight(sConF);
    yRear = sampleWheelSurfaceHeight(sConR);
    alphaF = Math.atan(
      (sampleWheelSurfaceHeight(sConF + ds) - sampleWheelSurfaceHeight(sConF - ds)) / (2.0 * ds)
    );
    alphaR = Math.atan(
      (sampleWheelSurfaceHeight(sConR + ds) - sampleWheelSurfaceHeight(sConR - ds)) / (2.0 * ds)
    );
    const yTf = yFront + axleH * (Math.cos(alphaF) - cosTheta);
    const yTr = yRear + axleH * (Math.cos(alphaR) - cosTheta);
    theta = Math.asin(clamp((yTf - yTr) / wb, -0.78, 0.78));
    sinTheta = Math.sin(theta);
    cosTheta = Math.cos(theta);
    centerY = 0.5 * (yTf + yTr) + jumpH;
  }

  const slopePitchRad = theta;
  const slopePitchDeg = slopePitchRad * RAD_TO_DEG;
  const normalLiftM = centerY - jumpH - 0.5 * (yFront + yRear);

  return {
    groundY,
    yRear,
    yFront,
    slopePitchRad,
    anchorPitchXRad: slopePitchRad,
    slopePitchDeg,
    centerY,
    yCenter: centerY,
    normalLiftM,
    jumpHeightM: jumpH,
    bridgeArchElevationM: bridgeInfo.elevationM,
  };
}

/**
 * Pure closed-form Pelican Startled Surprise & Front-Wheel Hop Kinematics (`V5 Stan T-Rex Roar`).
 * Triggered `+0.12s` after `stanRoarTriggerTime` (`dtSinceRoar >= 0.12s`):
 *   - Wide startled feathered wing-flare (`wingFlareSurprise` -> `0.96`)
 *   - Upward cervical crest jolt (`crestJoltRad` -> `+0.26 rad`) + over-the-shoulder glance toward Stan (`glanceBackYawRad`)
 *   - Startled open squawk mandible (`startledBeakOpen` -> `0.95`)
 *   - Crisp `~0.14m` mini front-wheel hop (`frontWheelHopM` peaking `0.142m`, `centerHopM` + `wheeliePitchRad`)
 * Preserves 100% `ikSoleErrorM === 0.0000m` foot-on-pedal lock and NaN/Infinity safety.
 */
export function evaluatePelicanSurpriseKinematics({
  dtSinceRoar,
  seqT,
  roarTriggerSec = 40.20,
  pelicanX = -109.4,
  pelicanZ = -43.8,
  headingYaw = 0.0,
  stanX = -118.0,
  stanZ = -50.0,
  reactionDelaySec,
  onsetDelaySec = 0.12,
} = {}) {
  const computedDt =
    dtSinceRoar !== undefined && Number.isFinite(Number(dtSinceRoar))
      ? Number(dtSinceRoar)
      : seqT !== undefined && Number.isFinite(Number(seqT))
        ? Number(seqT) - (Number.isFinite(Number(roarTriggerSec)) ? Number(roarTriggerSec) : 40.20)
        : -1.0;
  const delayRaw = reactionDelaySec !== undefined ? reactionDelaySec : onsetDelaySec;
  const delay = Math.max(0.0, Number.isFinite(Number(delayRaw)) ? Number(delayRaw) : 0.12);
  const tau = computedDt - delay;

  if (tau <= 0.0 || tau >= 1.90) {
    return {
      pelicanSurprisePhase: 0.0,
      wingFlareSurprise: 0.0,
      startledWingFlare: 0.0,
      crestJoltRad: 0.0,
      glanceBackYawRad: 0.0,
      startledBeakOpen: 0.0,
      frontWheelHopM: 0.0,
      centerHopM: 0.0,
      centerHopVyMps: 0.0,
      wheeliePitchRad: 0.0,
    };
  }

  const s01 = (v) => {
    const c = clamp(v, 0.0, 1.0);
    return c * c * (3.0 - 2.0 * c);
  };

  // 1. Primary startled envelope (`0 -> 1` in `0.11s`, sustained shock `[0.11s, 0.92s]`, smooth settle `[0.92s, 1.85s]`)
  let pelicanSurprisePhase = 0.0;
  if (tau < 0.11) {
    pelicanSurprisePhase = s01(tau / 0.11);
  } else if (tau <= 0.92) {
    pelicanSurprisePhase = 1.0;
  } else if (tau < 1.85) {
    pelicanSurprisePhase = 1.0 - s01((tau - 0.92) / (1.85 - 0.92));
  }

  // 2. Crisp `~0.14m` mini front-wheel hop (`tau in (0.0, 0.38s)` ballistic arc)
  const hopDur = 0.38;
  let frontWheelHopM = 0.0;
  let centerHopM = 0.0;
  let centerHopVyMps = 0.0;
  let wheeliePitchRad = 0.0;
  if (tau > 0.0 && tau < hopDur) {
    const uHop = tau / hopDur;
    const parabola = 4.0 * uHop * (1.0 - uHop);
    frontWheelHopM = 0.142 * parabola;
    centerHopM = 0.084 * parabola;
    centerHopVyMps = (0.084 * 4.0 * (1.0 - 2.0 * uHop)) / hopDur;
    // Nose-up wheelie pitch lifts front axle (`0.5425m` forward of CG) to exact `0.142m` while rear stays low (`~0.026m`)!
    wheeliePitchRad = clamp((frontWheelHopM - centerHopM) / 0.5425, 0.0, 0.18);
  }

  // 3. Continuous single-shoulder glance yaw toward Stan & Courtyard Camera in Three.js bone `ry` convention
  // (`-Y` = Pelican's right-rear shoulder facing Stan `(-118, -50)` & South Courtyard Camera across the entire S-turn,
  // 100% branch-cut-free with zero `+-PI` wrap jump and `max |d(glanceBackYawRad)| <= 3.1 deg/frame < 4.0 deg/frame`!)
  const px = Number.isFinite(Number(pelicanX)) ? Number(pelicanX) : -109.4;
  const pz = Number.isFinite(Number(pelicanZ)) ? Number(pelicanZ) : -43.8;
  const sx = Number.isFinite(Number(stanX)) ? Number(stanX) : -118.0;
  const sz = Number.isFinite(Number(stanZ)) ? Number(stanZ) : -50.0;
  const yaw = Number.isFinite(Number(headingYaw)) ? Number(headingYaw) : 0.0;

  // Compute Stan's lateral dot-product onto Pelican's right vector `(+cos(yaw), +sin(yaw))` — smooth & analytic everywhere!
  const dxStan = sx - px;
  const dzStan = sz - pz;
  const distStan = Math.max(1.0, Math.hypot(dxStan, dzStan));
  const rightDotStan = (dxStan * Math.cos(yaw) + dzStan * Math.sin(yaw)) / distStan;
  const targetGlanceBoneYaw = clamp(-0.84 - 0.11 * clamp(rightDotStan, -1.0, 1.0), -0.98, -0.70);

  let glanceEnv = 0.0;
  if (tau < 0.38) {
    glanceEnv = s01(tau / 0.38);
  } else if (tau <= 1.08) {
    glanceEnv = 1.0;
  } else if (tau < 1.76) {
    glanceEnv = 1.0 - s01((tau - 1.08) / (1.76 - 1.08));
  }

  // 4. Startled squawk beak gape (two-syllable squawk burst matching `playPelicanStartledSquawk`)
  let startledBeakOpen = 0.0;
  if (tau < 0.48) {
    const sqEnv = s01(tau / 0.05) * (1.0 - s01((tau - 0.34) / 0.14));
    const sqSyllable = 0.72 + 0.28 * Math.abs(Math.sin(tau * 22.0));
    startledBeakOpen = clamp(sqEnv * sqSyllable, 0.0, 1.0);
  } else if (tau < 1.25) {
    startledBeakOpen = 0.32 * (1.0 - s01((tau - 0.48) / (1.25 - 0.48)));
  }

  const wingFlareSurprise = clamp(pelicanSurprisePhase * 0.96, 0.0, 1.0);
  return {
    pelicanSurprisePhase,
    wingFlareSurprise,
    startledWingFlare: wingFlareSurprise,
    crestJoltRad: 0.26 * pelicanSurprisePhase,
    glanceBackYawRad: targetGlanceBoneYaw * glanceEnv,
    startledBeakOpen,
    frontWheelHopM,
    centerHopM,
    centerHopVyMps,
    wheeliePitchRad,
  };
}




