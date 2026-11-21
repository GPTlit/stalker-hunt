/**
 * backrooms_expansion.js — Expands the Mountain View Campus map with the original_backrooms.glb
 * Level 0 complex: physically walkable straight off Canopy Drive (x ~ 51, z ~ 124), plus
 * mysterious No-Clip anomaly breaches in the Campus Courtyard & Woods.
 */
import * as THREE from "../vendor/three.module.js";
import { GLTFLoader } from "../vendor/GLTFLoader.js";

export const BACKROOMS_SCALE = 1.22;
export const BACKROOMS_CEILING_Y = 2.71 * BACKROOMS_SCALE; // ~3.306m

// Wing centers in Campus world coordinates
const WING_A = { x: 48.0, z: 146.0 }; // Entry Hub (North-West wing)
const WING_B = { x: 48.0, z: 176.5 }; // South Wing
const WING_C = { x: 78.7, z: 146.0 }; // East Wing

// Bounds for fast inBackrooms check & camera ceiling clamping
export const BACKROOMS_BOUNDS = Object.freeze({
  minX: 31.5,
  maxX: 95.5,
  minZ: 129.8,
  maxZ: 193.5,
});

// Entrance & exit thresholds
export const BACKROOMS_ENTRY_DOOR = Object.freeze({ x: 51.0, z: 129.0 });
export const BACKROOMS_WARP_ARRIVAL = Object.freeze({ x: 51.0, z: 174.5, yaw: 0.0 });

// No-clip breach points scattered in the campus so wandering around can drop you into the Backrooms
export const BACKROOMS_NOCLIP_ANOMALIES = Object.freeze([
  { id: "noclip_canopy_alcove", label: "Canopy Backroom Seam", x: 0.0, z: 145.8, radius: 1.9 },
  { id: "noclip_courtyard_woods", label: "West Courtyard Rift", x: -94.0, z: -42.0, radius: 2.2 },
  { id: "noclip_east_woods", label: "East Woods Breach", x: 64.0, z: -46.0, radius: 2.2 },
]);

// Collision grid covering Backrooms complex + entrance vestibule
const GRID_MIN_X = 29.0;
const GRID_MAX_X = 97.5;
const GRID_MIN_Z = 122.0;
const GRID_MAX_Z = 195.5;
const CELL_M = 0.42;
const GRID_COLS = Math.ceil((GRID_MAX_X - GRID_MIN_X) / CELL_M);
const GRID_ROWS = Math.ceil((GRID_MAX_Z - GRID_MIN_Z) / CELL_M);

function lerpVertex(a, b, t) {
  return {
    p: [
      a.p[0] + (b.p[0] - a.p[0]) * t,
      a.p[1] + (b.p[1] - a.p[1]) * t,
      a.p[2] + (b.p[2] - a.p[2]) * t,
    ],
    n: [
      a.n[0] + (b.n[0] - a.n[0]) * t,
      a.n[1] + (b.n[1] - a.n[1]) * t,
      a.n[2] + (b.n[2] - a.n[2]) * t,
    ],
    uv: [
      a.uv[0] + (b.uv[0] - a.uv[0]) * t,
      a.uv[1] + (b.uv[1] - a.uv[1]) * t,
    ],
  };
}

/**
 * Splits convex polygon against axis plane `v[axis] = val`.
 * Returns { inside, outside } where `inside` satisfies `(v[axis] - val) * sign >= 0`.
 */
function splitPolyByPlane(poly, axis, val, sign) {
  const inside = [];
  const outside = [];
  const n = poly.length;
  for (let i = 0; i < n; i++) {
    const cur = poly[i];
    const nxt = poly[(i + 1) % n];
    const dCur = (cur.p[axis] - val) * sign;
    const dNxt = (nxt.p[axis] - val) * sign;
    const curIn = dCur >= -1e-5;
    const nxtIn = dNxt >= -1e-5;
    if (curIn) inside.push(cur);
    if (!curIn || dCur <= 1e-5) outside.push(cur);
    if (curIn !== nxtIn) {
      const t = dCur / (dCur - dNxt);
      const mid = lerpVertex(cur, nxt, Math.max(0, Math.min(1, t)));
      inside.push(mid);
      outside.push(mid);
    }
  }
  return { inside, outside };
}

function polyAreaSq3D(poly) {
  if (poly.length < 3) return 0;
  const p0 = poly[0].p;
  let ax = 0, ay = 0, az = 0;
  for (let i = 1; i + 1 < poly.length; i++) {
    const p1 = poly[i].p;
    const p2 = poly[i + 1].p;
    const ux = p1[0] - p0[0], uy = p1[1] - p0[1], uz = p1[2] - p0[2];
    const vx = p2[0] - p0[0], vy = p2[1] - p0[1], vz = p2[2] - p0[2];
    ax += uy * vz - uz * vy;
    ay += uz * vx - ux * vz;
    az += ux * vy - uy * vx;
  }
  return 0.25 * (ax * ax + ay * ay + az * az);
}

function subtractBoxFromPoly(poly, box) {
  const outPolys = [];
  let rem = poly;
  const planes = [
    { axis: 0, val: box.minX, sign: 1 },
    { axis: 0, val: box.maxX, sign: -1 },
    { axis: 1, val: box.minY, sign: 1 },
    { axis: 1, val: box.maxY, sign: -1 },
    { axis: 2, val: box.minZ, sign: 1 },
    { axis: 2, val: box.maxZ, sign: -1 },
  ];
  for (const pl of planes) {
    if (rem.length < 3) break;
    const { inside, outside } = splitPolyByPlane(rem, pl.axis, pl.val, pl.sign);
    if (outside.length >= 3 && polyAreaSq3D(outside) > 1e-8) {
      outPolys.push(outside);
    }
    rem = inside;
  }
  return outPolys;
}

/**
 * Carves rectangular doorway boxes (given in wing-local unscaled coords) out of a mesh's geometry
 * using its local-to-wing matrix, returning a clean new BufferGeometry in mesh local space.
 */
function carveDoorwaysFromGeometry(geometry, meshToWingMat, wingToMeshMat, boxes) {
  const posAttr = geometry.getAttribute("position");
  if (!posAttr) return geometry;
  const normAttr = geometry.getAttribute("normal");
  const uvAttr = geometry.getAttribute("uv");
  const idx = geometry.getIndex();
  const triCount = idx ? Math.floor(idx.count / 3) : Math.floor(posAttr.count / 3);

  const outPos = [];
  const outNorm = [];
  const outUv = [];

  const tmpP = new THREE.Vector3();
  const tmpN = new THREE.Vector3();
  const normMat = new THREE.Matrix3().getNormalMatrix(meshToWingMat);
  const invNormMat = new THREE.Matrix3().getNormalMatrix(wingToMeshMat);

  const readVert = (vi) => {
    tmpP.fromBufferAttribute(posAttr, vi).applyMatrix4(meshToWingMat);
    if (normAttr) {
      tmpN.fromBufferAttribute(normAttr, vi).applyMatrix3(normMat).normalize();
    } else {
      tmpN.set(0, 1, 0);
    }
    const u = uvAttr ? uvAttr.getX(vi) : 0;
    const v = uvAttr ? uvAttr.getY(vi) : 0;
    return { p: [tmpP.x, tmpP.y, tmpP.z], n: [tmpN.x, tmpN.y, tmpN.z], uv: [u, v] };
  };

  const emitVert = (v) => {
    tmpP.set(v.p[0], v.p[1], v.p[2]).applyMatrix4(wingToMeshMat);
    tmpN.set(v.n[0], v.n[1], v.n[2]).applyMatrix3(invNormMat).normalize();
    outPos.push(tmpP.x, tmpP.y, tmpP.z);
    outNorm.push(tmpN.x, tmpN.y, tmpN.z);
    outUv.push(v.uv[0], v.uv[1]);
  };

  const EPS = 1e-3;
  for (let t = 0; t < triCount; t++) {
    const i0 = idx ? idx.getX(t * 3) : t * 3;
    const i1 = idx ? idx.getX(t * 3 + 1) : t * 3 + 1;
    const i2 = idx ? idx.getX(t * 3 + 2) : t * 3 + 2;

    let polys = [[readVert(i0), readVert(i1), readVert(i2)]];
    for (const box of boxes) {
      const nextPolys = [];
      for (const poly of polys) {
        if (poly.length < 3) continue;
        let minX = Infinity, maxX = -Infinity;
        let minY = Infinity, maxY = -Infinity;
        let minZ = Infinity, maxZ = -Infinity;
        for (const v of poly) {
          if (v.p[0] < minX) minX = v.p[0];
          if (v.p[0] > maxX) maxX = v.p[0];
          if (v.p[1] < minY) minY = v.p[1];
          if (v.p[1] > maxY) maxY = v.p[1];
          if (v.p[2] < minZ) minZ = v.p[2];
          if (v.p[2] > maxZ) maxZ = v.p[2];
        }
        if (
          maxX <= box.minX + EPS || minX >= box.maxX - EPS ||
          maxY <= box.minY + EPS || minY >= box.maxY - EPS ||
          maxZ <= box.minZ + EPS || minZ >= box.maxZ - EPS
        ) {
          nextPolys.push(poly);
        } else {
          const pieces = subtractBoxFromPoly(poly, box);
          for (const piece of pieces) nextPolys.push(piece);
        }
      }
      polys = nextPolys;
    }

    for (const poly of polys) {
      for (let k = 1; k + 1 < poly.length; k++) {
        emitVert(poly[0]);
        emitVert(poly[k]);
        emitVert(poly[k + 1]);
      }
    }
  }

  const outGeo = new THREE.BufferGeometry();
  outGeo.setAttribute("position", new THREE.Float32BufferAttribute(outPos, 3));
  outGeo.setAttribute("normal", new THREE.Float32BufferAttribute(outNorm, 3));
  if (uvAttr) outGeo.setAttribute("uv", new THREE.Float32BufferAttribute(outUv, 2));
  outGeo.computeBoundingBox();
  outGeo.computeBoundingSphere();
  return outGeo;
}

function upgradeBackroomsMaterials(root) {
  const matCache = new Map();
  root.traverse((obj) => {
    if (!obj.isMesh || !obj.material) return;
    obj.castShadow = false;
    obj.receiveShadow = true;

    const convertOne = (mat) => {
      if (!mat) return mat;
      if (matCache.has(mat.uuid)) return matCache.get(mat.uuid);
      const name = String(mat.name || "");
      const isCeilingLight = /ceiling_lights/i.test(name);
      const isCarpet = /carpet/i.test(name);
      const next = new THREE.MeshStandardMaterial({
        name: mat.name,
        color: mat.color ? mat.color.clone() : new THREE.Color("#ffffff"),
        map: mat.map || null,
        roughness: isCarpet ? 0.96 : isCeilingLight ? 0.35 : 0.88,
        metalness: isCeilingLight ? 0.08 : 0.03,
        emissive: isCeilingLight ? new THREE.Color("#e8d47c") : new THREE.Color("#000000"),
        emissiveMap: isCeilingLight ? mat.map || null : null,
        emissiveIntensity: isCeilingLight ? 0.65 : 0.0,
        side: THREE.DoubleSide,
      });
      if (next.map) {
        next.map.colorSpace = THREE.SRGBColorSpace;
        next.map.anisotropy = 4;
      }
      matCache.set(mat.uuid, next);
      return next;
    };

    if (Array.isArray(obj.material)) {
      obj.material = obj.material.map(convertOne);
    } else {
      obj.material = convertOne(obj.material);
    }
  });
}

function rasterizeWallSegment(grid, a, b, c) {
  const minY = Math.min(a.y, b.y, c.y);
  const maxY = Math.max(a.y, b.y, c.y);
  if (maxY < 0.35 || minY > 2.4 || maxY - minY < 0.25) return;

  // Sample triangle densely enough so no 0.42m cell is skipped
  const ab = a.distanceTo(b);
  const bc = b.distanceTo(c);
  const ca = c.distanceTo(a);
  const maxEdge = Math.max(ab, bc, ca);
  const steps = Math.min(64, Math.max(4, Math.ceil(maxEdge / 0.24)));

  const pt = new THREE.Vector3();
  for (let u = 0; u <= steps; u++) {
    for (let v = 0; v <= steps - u; v++) {
      const w = steps - u - v;
      pt.set(0, 0, 0)
        .addScaledVector(a, u / steps)
        .addScaledVector(b, v / steps)
        .addScaledVector(c, w / steps);
      if (pt.y < 0.28 || pt.y > 2.35) continue;
      const gx = Math.floor((pt.x - GRID_MIN_X) / CELL_M);
      const gz = Math.floor((pt.z - GRID_MIN_Z) / CELL_M);
      if (gx >= 0 && gx < GRID_COLS && gz >= 0 && gz < GRID_ROWS) {
        grid[gz * GRID_COLS + gx] = 1;
      }
    }
  }
}

function buildCampusEntryVestibule(backroomsMats) {
  const group = new THREE.Group();
  group.name = "BackroomsCampusVestibule";

  // Industrial concrete + glowing yellow Backrooms threshold at (x = 51, z = 123..131)
  const concreteMat = new THREE.MeshStandardMaterial({
    color: "#22262e",
    roughness: 0.92,
    metalness: 0.08,
  });
  const wallMat = new THREE.MeshStandardMaterial({
    color: "#bdb072",
    roughness: 0.88,
    metalness: 0.03,
  });
  const carpetMat = new THREE.MeshStandardMaterial({
    color: "#7a6e44",
    roughness: 0.96,
    metalness: 0.02,
  });
  const signMat = new THREE.MeshStandardMaterial({
    color: "#f5e393",
    emissive: new THREE.Color("#f0d76c"),
    emissiveIntensity: 1.15,
    roughness: 0.3,
  });

  // Ground path leading from Canopy Drive (z=116) into the open doorway (z=130.8)
  const path = new THREE.Mesh(new THREE.BoxGeometry(5.6, 0.04, 15.4), concreteMat);
  path.position.set(51.0, 0.015, 123.5);
  path.receiveShadow = true;
  group.add(path);

  const innerFloor = new THREE.Mesh(new THREE.BoxGeometry(4.8, 0.03, 7.6), carpetMat);
  innerFloor.position.set(51.0, 0.018, 127.6);
  innerFloor.receiveShadow = true;
  group.add(innerFloor);

  // Side walls of the vestibule (z = 124.0..131.2, leaving x = 48.6..53.4 wide open!)
  const wallH = BACKROOMS_CEILING_Y;
  for (const sx of [48.1, 53.9]) {
    const sideOuter = new THREE.Mesh(new THREE.BoxGeometry(0.6, wallH + 0.35, 7.2), concreteMat);
    sideOuter.position.set(sx, (wallH + 0.35) * 0.5, 127.6);
    sideOuter.castShadow = true;
    sideOuter.receiveShadow = true;
    group.add(sideOuter);

    const innerPaper = new THREE.Mesh(new THREE.BoxGeometry(0.08, wallH - 0.1, 7.0), wallMat);
    innerPaper.position.set(sx + (sx < 51 ? 0.32 : -0.32), (wallH - 0.1) * 0.5, 127.6);
    innerPaper.receiveShadow = true;
    group.add(innerPaper);
  }

  // Roof + doorway header
  const roof = new THREE.Mesh(new THREE.BoxGeometry(6.6, 0.36, 7.5), concreteMat);
  roof.position.set(51.0, wallH + 0.18, 127.6);
  roof.castShadow = true;
  roof.receiveShadow = true;
  group.add(roof);

  // Glowing fluorescent strip inside the vestibule spilling warm yellow light onto Campus
  const lightStrip = new THREE.Mesh(new THREE.BoxGeometry(2.6, 0.06, 0.45), signMat);
  lightStrip.position.set(51.0, wallH - 0.05, 125.6);
  group.add(lightStrip);

  const doorSign = new THREE.Mesh(new THREE.BoxGeometry(2.8, 0.28, 0.14), signMat);
  doorSign.position.set(51.0, wallH - 0.22, 124.0);
  group.add(doorSign);

  const entryLight = new THREE.PointLight("#f3df8a", 3.4, 24.0, 1.5);
  entryLight.position.set(51.0, wallH - 0.3, 125.8);
  group.add(entryLight);

  return { group, entryLight, lightStrip, signMat };
}

function buildAnomalyPortal(anomaly) {
  const g = new THREE.Group();
  g.name = `BackroomsAnomaly_${anomaly.id}`;
  g.position.set(anomaly.x, 0, anomaly.z);

  const frameMat = new THREE.MeshStandardMaterial({
    color: "#2a2518",
    roughness: 0.85,
    metalness: 0.2,
  });
  const portalMat = new THREE.MeshBasicMaterial({
    color: "#e6d06a",
    transparent: true,
    opacity: 0.52,
    side: THREE.DoubleSide,
  });

  const leftPost = new THREE.Mesh(new THREE.BoxGeometry(0.26, 2.9, 0.26), frameMat);
  leftPost.position.set(-1.15, 1.45, 0);
  const rightPost = new THREE.Mesh(new THREE.BoxGeometry(0.26, 2.9, 0.26), frameMat);
  rightPost.position.set(1.15, 1.45, 0);
  const header = new THREE.Mesh(new THREE.BoxGeometry(2.56, 0.28, 0.3), frameMat);
  header.position.set(0, 2.95, 0);
  const veil = new THREE.Mesh(new THREE.PlaneGeometry(2.04, 2.8), portalMat);
  veil.position.set(0, 1.4, 0);

  const glow = new THREE.PointLight("#edd672", 2.2, 15.0, 1.6);
  glow.position.set(0, 1.8, 0.6);

  g.add(leftPost, rightPost, header, veil, glow);
  return { group: g, veil, portalMat, glow };
}

export class BackroomsExpansion {
  constructor() {
    this.root = new THREE.Group();
    this.root.name = "BackroomsLevel0Expansion";
    this.grid = new Uint8Array(GRID_COLS * GRID_ROWS);
    this.ready = false;
    this.flickerLights = [];
    this.anomalies = [];
    this._noclipCooldown = 0;
  }

  async load(scene) {
    const loader = new GLTFLoader();
    const gltf = await new Promise((resolve) => {
      loader.load("../models/original_backrooms.glb", resolve, undefined, (err) => {
        console.warn("[Backrooms] Failed to load original_backrooms.glb:", err);
        resolve(null);
      });
    });

    if (!gltf || !gltf.scene) {
      scene.add(this.root);
      return false;
    }

    const template = gltf.scene;
    upgradeBackroomsMaterials(template);
    template.updateMatrixWorld(true);

    // Helper: instantiate one Backrooms wing with given unscaled local doorway cutouts
    const buildWing = (centerX, centerZ, doorwayBoxes) => {
      const wing = template.clone(true);
      wing.position.set(centerX, 0, centerZ);
      wing.scale.setScalar(BACKROOMS_SCALE);
      wing.updateMatrixWorld(true);

      const wingInvMat = new THREE.Matrix4().copy(wing.matrixWorld).invert();

      // Carve doorway boxes out of wall/skirting/wallpaper meshes
      wing.traverse((obj) => {
        if (!obj.isMesh) return;
        const isWall =
          obj.material && /wall|piece1|br_2|skirting|wallpaper/i.test(String(obj.material.name || ""));
        if (!isWall || doorwayBoxes.length === 0) return;

        obj.updateMatrixWorld(true);
        // wingInvMat already undoes wing translation & BACKROOMS_SCALE, mapping directly to unscaled wing space
        const meshToWing = new THREE.Matrix4().multiplyMatrices(wingInvMat, obj.matrixWorld);
        const wingToMesh = new THREE.Matrix4().copy(meshToWing).invert();
        obj.geometry = carveDoorwaysFromGeometry(obj.geometry, meshToWing, wingToMesh, doorwayBoxes);
      });

      this.root.add(wing);
      wing.updateMatrixWorld(true);

      // Rasterize carved walls into the 2D collision grid
      const a = new THREE.Vector3();
      const b = new THREE.Vector3();
      const c = new THREE.Vector3();
      wing.traverse((obj) => {
        if (!obj.isMesh || !obj.geometry) return;
        const matName = String(obj.material?.name || "");
        if (/carpet|ceiling|vent/i.test(matName)) return;
        const pos = obj.geometry.getAttribute("position");
        if (!pos) return;
        const idx = obj.geometry.getIndex();
        const tris = idx ? Math.floor(idx.count / 3) : Math.floor(pos.count / 3);
        const mw = obj.matrixWorld;
        for (let t = 0; t < tris; t++) {
          const i0 = idx ? idx.getX(t * 3) : t * 3;
          const i1 = idx ? idx.getX(t * 3 + 1) : t * 3 + 1;
          const i2 = idx ? idx.getX(t * 3 + 2) : t * 3 + 2;
          a.fromBufferAttribute(pos, i0).applyMatrix4(mw);
          b.fromBufferAttribute(pos, i1).applyMatrix4(mw);
          c.fromBufferAttribute(pos, i2).applyMatrix4(mw);
          rasterizeWallSegment(this.grid, a, b, c);
        }
      });
    };

    // Wing A (Entry Hub): open North campus entrance (local x=+0.4..+4.4, z<-11.5),
    // open South passage into Wing B (local x=+0.4..+4.4, z>+11.5 AND Piece1_2 x=-7.2..-1.7, z>+11.5),
    // open East passage into Wing C (local x>+11.8, z=-5.8..-1.2)
    buildWing(WING_A.x, WING_A.z, [
      { minX: 0.4, maxX: 4.5, minY: -0.2, maxY: 2.65, minZ: -13.5, maxZ: -11.5 }, // Campus Entry
      { minX: 0.4, maxX: 4.5, minY: -0.2, maxY: 2.65, minZ: 11.5, maxZ: 13.5 },   // To Wing B
      { minX: -7.1, maxX: -1.6, minY: -0.2, maxY: 2.65, minZ: 11.5, maxZ: 15.6 }, // Piece1_2 open tunnel to Wing B
      { minX: 11.5, maxX: 13.8, minY: -0.2, maxY: 2.65, minZ: -5.8, maxZ: -1.4 }, // To Wing C
    ]);

    // Wing B (South Wing): open North doorways matching Wing A's South doorways
    buildWing(WING_B.x, WING_B.z, [
      { minX: 0.4, maxX: 4.5, minY: -0.2, maxY: 2.65, minZ: -13.5, maxZ: -11.5 },
      { minX: -7.1, maxX: -1.6, minY: -0.2, maxY: 2.65, minZ: -13.5, maxZ: -11.5 },
    ]);

    // Wing C (East Wing): open West doorway matching Wing A's East doorway
    buildWing(WING_C.x, WING_C.z, [
      { minX: -13.5, maxX: -11.5, minY: -0.2, maxY: 2.65, minZ: -5.8, maxZ: -1.4 },
    ]);

    // Stamp vestibule side walls into collision grid (`x = 48.1` and `x = 53.9`, `z = 124..131`)
    this._stampBoxCollider(47.7, 48.5, 123.8, 131.2);
    this._stampBoxCollider(53.5, 54.3, 123.8, 131.2);
    // Clear entrance corridor explicitly so player never snags walking in/out
    this._clearBoxCollider(48.8, 53.2, 123.0, 134.5);

    // Campus Entrance Vestibule
    const vest = buildCampusEntryVestibule();
    this.root.add(vest.group);
    this.flickerLights.push({ light: vest.entryLight, base: 3.4, phase: 0.3, speed: 7.5 });

    // Dim eerie fluorescent Backrooms ceiling lights inside the 3 wings
    const lightSpots = [
      [WING_A.x + 2.6, WING_A.z - 6.0, 2.4],
      [WING_A.x - 4.5, WING_A.z + 5.0, 1.8],
      [WING_B.x + 2.0, WING_B.z - 4.0, 2.0],
      [WING_B.x - 5.0, WING_B.z + 6.0, 1.5],
      [WING_C.x - 4.0, WING_C.z - 3.5, 2.0],
      [WING_C.x + 6.0, WING_C.z + 4.0, 1.6],
    ];
    for (let i = 0; i < lightSpots.length; i++) {
      const [lx, lz, intensity] = lightSpots[i];
      const pl = new THREE.PointLight("#e8d984", intensity, 22.0, 1.6);
      pl.position.set(lx, BACKROOMS_CEILING_Y - 0.35, lz);
      this.root.add(pl);
      this.flickerLights.push({ light: pl, base: intensity, phase: i * 1.9, speed: 5.5 + i * 1.4 });
    }

    // No-clip breach portals scattered on the campus
    for (let i = 0; i < BACKROOMS_NOCLIP_ANOMALIES.length; i++) {
      const a = BACKROOMS_NOCLIP_ANOMALIES[i];
      const portal = buildAnomalyPortal(a);
      this.root.add(portal.group);
      this.anomalies.push({ ...a, ...portal });
    }

    scene.add(this.root);
    this.ready = true;
    return true;
  }

  _stampBoxCollider(minX, maxX, minZ, maxZ) {
    const gx0 = Math.max(0, Math.floor((minX - GRID_MIN_X) / CELL_M));
    const gx1 = Math.min(GRID_COLS - 1, Math.floor((maxX - GRID_MIN_X) / CELL_M));
    const gz0 = Math.max(0, Math.floor((minZ - GRID_MIN_Z) / CELL_M));
    const gz1 = Math.min(GRID_ROWS - 1, Math.floor((maxZ - GRID_MIN_Z) / CELL_M));
    for (let gz = gz0; gz <= gz1; gz++) {
      for (let gx = gx0; gx <= gx1; gx++) {
        this.grid[gz * GRID_COLS + gx] = 1;
      }
    }
  }

  _clearBoxCollider(minX, maxX, minZ, maxZ) {
    const gx0 = Math.max(0, Math.floor((minX - GRID_MIN_X) / CELL_M));
    const gx1 = Math.min(GRID_COLS - 1, Math.floor((maxX - GRID_MIN_X) / CELL_M));
    const gz0 = Math.max(0, Math.floor((minZ - GRID_MIN_Z) / CELL_M));
    const gz1 = Math.min(GRID_ROWS - 1, Math.floor((maxZ - GRID_MIN_Z) / CELL_M));
    for (let gz = gz0; gz <= gz1; gz++) {
      for (let gx = gx0; gx <= gx1; gx++) {
        this.grid[gz * GRID_COLS + gx] = 0;
      }
    }
  }

  isInsideBackrooms(x, z) {
    return (
      x >= BACKROOMS_BOUNDS.minX &&
      x <= BACKROOMS_BOUNDS.maxX &&
      z >= BACKROOMS_BOUNDS.minZ &&
      z <= BACKROOMS_BOUNDS.maxZ
    );
  }

  resolveCollisions(x, z, radius = 0.42) {
    if (
      x < GRID_MIN_X - radius ||
      x > GRID_MAX_X + radius ||
      z < GRID_MIN_Z - radius ||
      z > GRID_MAX_Z + radius
    ) {
      return { x, z };
    }
    let rx = x;
    let rz = z;
    // Two relaxation passes against occupied 0.42m wall cells
    for (let pass = 0; pass < 2; pass++) {
      const gx0 = Math.max(0, Math.floor((rx - radius - GRID_MIN_X) / CELL_M));
      const gx1 = Math.min(GRID_COLS - 1, Math.floor((rx + radius - GRID_MIN_X) / CELL_M));
      const gz0 = Math.max(0, Math.floor((rz - radius - GRID_MIN_Z) / CELL_M));
      const gz1 = Math.min(GRID_ROWS - 1, Math.floor((rz + radius - GRID_MIN_Z) / CELL_M));
      for (let gz = gz0; gz <= gz1; gz++) {
        const cMinZ = GRID_MIN_Z + gz * CELL_M;
        const cMaxZ = cMinZ + CELL_M;
        for (let gx = gx0; gx <= gx1; gx++) {
          if (this.grid[gz * GRID_COLS + gx] === 0) continue;
          const cMinX = GRID_MIN_X + gx * CELL_M;
          const cMaxX = cMinX + CELL_M;
          const closestX = Math.max(cMinX, Math.min(rx, cMaxX));
          const closestZ = Math.max(cMinZ, Math.min(rz, cMaxZ));
          const dx = rx - closestX;
          const dz = rz - closestZ;
          const distSq = dx * dx + dz * dz;
          if (distSq < radius * radius) {
            const dist = Math.sqrt(distSq);
            if (dist > 1e-5) {
              const push = radius - dist;
              rx += (dx / dist) * push;
              rz += (dz / dist) * push;
            } else {
              // Deep inside cell: push toward cell exterior
              const cx = (cMinX + cMaxX) * 0.5;
              const cz = (cMinZ + cMaxZ) * 0.5;
              if (Math.abs(rx - cx) > Math.abs(rz - cz)) {
                rx += rx >= cx ? radius : -radius;
              } else {
                rz += rz >= cz ? radius : -radius;
              }
            }
          }
        }
      }
    }
    return { x: rx, z: rz };
  }

  /**
   * Returns an open walkable Backrooms point for stalker spawning/teleporting.
   */
  pickOpenPoint(nearX, nearZ) {
    const spots = [
      { x: WING_A.x + 2.5, z: WING_A.z - 5.5 },
      { x: WING_A.x - 4.0, z: WING_A.z + 3.0 },
      { x: WING_A.x + 8.5, z: WING_A.z - 3.5 },
      { x: WING_B.x + 2.0, z: WING_B.z - 5.0 },
      { x: WING_B.x - 4.5, z: WING_B.z + 4.5 },
      { x: WING_C.x - 4.5, z: WING_C.z - 3.5 },
      { x: WING_C.x + 5.5, z: WING_C.z + 3.5 },
    ];
    let best = spots[0];
    let bestScore = -Infinity;
    for (const s of spots) {
      const d = Math.hypot(s.x - nearX, s.z - nearZ);
      if (d < 8.0) continue;
      const score = -Math.abs(d - 16.0) + Math.random() * 6.0;
      if (score > bestScore) {
        bestScore = score;
        best = s;
      }
    }
    return best;
  }

  update(dt, elapsedSec, px, pz) {
    if (this._noclipCooldown > 0) this._noclipCooldown = Math.max(0, this._noclipCooldown - dt);

    // Subtle fluorescent buzz/flicker
    for (let i = 0; i < this.flickerLights.length; i++) {
      const f = this.flickerLights[i];
      const wave =
        0.88 +
        0.08 * Math.sin(elapsedSec * f.speed + f.phase) +
        (Math.sin(elapsedSec * 23.0 + f.phase * 3.1) > 0.94 ? -0.35 : 0);
      f.light.intensity = Math.max(0.2, f.base * wave);
    }

    // Pulse anomaly portals & check if player wandered into a No-Clip rift
    let triggeredNoclip = null;
    for (let i = 0; i < this.anomalies.length; i++) {
      const a = this.anomalies[i];
      const pulse = 0.4 + 0.2 * Math.sin(elapsedSec * 3.4 + i);
      a.portalMat.opacity = pulse;
      a.glow.intensity = 1.6 + 0.8 * Math.sin(elapsedSec * 5.2 + i);
      // Face anomaly toward center campus slightly
      if (this._noclipCooldown <= 0 && Math.hypot(px - a.x, pz - a.z) < a.radius) {
        triggeredNoclip = a;
        this._noclipCooldown = 4.0;
      }
    }
    return triggeredNoclip;
  }
}
