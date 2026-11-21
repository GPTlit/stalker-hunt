import * as THREE from "../vendor/three.module.js";
import { mergeGeometries } from "../vendor/BufferGeometryUtils.js";
import {
  WORLD_BOUNDS,
  CAMPUS_ROADS,
  CAMPUS_INTERSECTIONS,
  CAMPUS_BUILDING_BLOCKS,
  ATMOSPHERE_PRESETS,
} from "../contract.js";
import {
  createMulberry32,
  getOpenWorldEarthHeight,
  getOpenWorldTerrainHeight,
  getStevensCreekBridgeParam,
} from "../rig/kin.js";
import {
  groundObjectToY,
  createOrganicFoliageGeometry,
  buildBayViewDragonscaleBuilding,
  buildGradientCanopyBuilding,
  buildShorelineAmphitheatre,
} from "./campus_worlds.js";
import {
  createAAAInstancedGrassSystem,
  isCampusGrassAllowedAt,
  buildGraniteCurbCollarRingGeometry,
  auditAndGroundPropsZeroFloat,
  getDefaultCampusSurfaceTopY,
  stevensCreekCenterZ,
  stevensCreekHalfWidthZ,
  OMNI_V5_ENVIRONMENT_TELEMETRY,
} from "./v5_aaa_environment.js";
import * as MaterialsMod from "./materials.js";

/**
 * Builds a crisp interlocking pale silver-grey hexagonal granite paver material (`#B6B4AE`, roughness `0.86`)
 * for the Google Visitor Experience / Gradient Canopy forecourt (`jay_google_visitor_experience_front.png`).
 */
function createVisitorHexPaversMaterialFallback() {
  if (typeof document === "undefined") {
    return new THREE.MeshStandardMaterial({
      name: "Visitor_Hex_Pavers_V6",
      color: "#B6B4AE",
      roughness: 0.86,
      metalness: 0.0,
      envMapIntensity: 0.35,
    });
  }
  const w = 512;
  const h = 512;
  const albC = document.createElement("canvas");
  albC.width = w;
  albC.height = h;
  const aCtx = albC.getContext("2d");
  const img = aCtx.createImageData(w, h);
  const bumpC = document.createElement("canvas");
  bumpC.width = w;
  bumpC.height = h;
  const bCtx = bumpC.getContext("2d");
  const bImg = bCtx.createImageData(w, h);

  const NX = 10;
  const NY = 6;
  const SQRT3 = 1.7320508;
  const cellHash = (ix, iy) => {
    let n = (Math.imul(ix, 374761393) + Math.imul(iy, 668265263) + 0x51a7f3) | 0;
    n = Math.imul(n ^ (n >>> 13), 1274126177);
    return ((n ^ (n >>> 16)) >>> 0) / 4294967296;
  };
  for (let y = 0; y < h; y++) {
    const v = (y / h) * NY * SQRT3;
    for (let x = 0; x < w; x++) {
      const u = (x / w) * NX;
      const iA = Math.round(u);
      const jA = Math.round(v / SQRT3);
      const dxA = u - iA;
      const dyA = v - jA * SQRT3;
      const d2A = dxA * dxA + dyA * dyA;

      const iB = Math.round(u - 0.5);
      const jB = Math.round((v - 0.5 * SQRT3) / SQRT3);
      const dxB = u - (iB + 0.5);
      const dyB = v - (jB + 0.5) * SQRT3;
      const d2B = dxB * dxB + dyB * dyB;

      let lx, ly, cxId, cyId;
      if (d2A <= d2B) {
        lx = Math.abs(dxA);
        ly = Math.abs(dyA);
        cxId = ((iA % NX) + NX) % NX;
        cyId = (((jA * 2) % (NY * 2)) + NY * 2) % (NY * 2);
      } else {
        lx = Math.abs(dxB);
        ly = Math.abs(dyB);
        cxId = ((iB % NX) + NX) % NX;
        cyId = (((jB * 2 + 1) % (NY * 2)) + NY * 2) % (NY * 2);
      }
      const hexDist = Math.max(lx, 0.5 * lx + 0.8660254 * ly);
      const edgeDist = Math.max(0.0, 0.5 - hexDist);
      const hTone = cellHash(cxId, cyId);
      const grain = cellHash(x * 3 + 7, y * 5 + 11);

      let base = 176.0 + hTone * 16.0 + (grain - 0.5) * 14.0;
      let bumpV = 186.0 + (grain - 0.5) * 28.0;
      if (edgeDist < 0.026) {
        const jf = 1.0 - edgeDist / 0.026;
        base = base * (1.0 - 0.68 * jf) + 76.0 * (0.68 * jf);
        bumpV = 48.0 + (1.0 - jf) * 42.0;
      } else if (edgeDist < 0.056) {
        const bf = 1.0 - (edgeDist - 0.026) / 0.030;
        base -= bf * 9.0;
        bumpV -= bf * 34.0;
      }
      const p = (y * w + x) * 4;
      img.data[p] = Math.max(54, Math.min(222, Math.round(base + 1.0)));
      img.data[p + 1] = Math.max(52, Math.min(220, Math.round(base - 0.5)));
      img.data[p + 2] = Math.max(48, Math.min(214, Math.round(base - 5.0)));
      img.data[p + 3] = 255;
      const bv = Math.max(16, Math.min(244, Math.round(bumpV)));
      bImg.data[p] = bv;
      bImg.data[p + 1] = bv;
      bImg.data[p + 2] = bv;
      bImg.data[p + 3] = 255;
    }
  }
  aCtx.putImageData(img, 0, 0);
  bCtx.putImageData(bImg, 0, 0);

  const map = new THREE.CanvasTexture(albC);
  map.wrapS = map.wrapT = THREE.RepeatWrapping;
  map.colorSpace = THREE.SRGBColorSpace;
  map.anisotropy = 8;
  const bumpMap = new THREE.CanvasTexture(bumpC);
  bumpMap.wrapS = bumpMap.wrapT = THREE.RepeatWrapping;
  bumpMap.anisotropy = 8;

  return new THREE.MeshStandardMaterial({
    name: "Visitor_Hex_Pavers_V6",
    color: "#ffffff",
    map,
    bumpMap,
    bumpScale: 0.008,
    roughness: 0.86,
    metalness: 0.0,
    envMapIntensity: 0.36,
  });
}

const _dummy = new THREE.Object3D();
const _mat4 = new THREE.Matrix4();
const _mat4Fade = new THREE.Matrix4();
const _pos = new THREE.Vector3();
const _quat = new THREE.Quaternion();
const _quatCar = new THREE.Quaternion();
const _quatSpin = new THREE.Quaternion();
const _quatSteer = new THREE.Quaternion();
const _axisX = new THREE.Vector3(1, 0, 0);
const _axisY = new THREE.Vector3(0, 1, 0);
const _scale = new THREE.Vector3();
const _euler = new THREE.Euler();
const _color = new THREE.Color();
const _box3Work = new THREE.Box3();
const _v3WorkA = new THREE.Vector3();
const _v3WorkB = new THREE.Vector3();

function createSubPixelRadialMoteTexture(size = 64, corePower = 4.2) {
  const data = new Uint8Array(size * size * 4);
  for (let py = 0; py < size; py++) {
    const ny = ((py + 0.5) / size) * 2.0 - 1.0;
    for (let px = 0; px < size; px++) {
      const nx = ((px + 0.5) / size) * 2.0 - 1.0;
      const r = Math.hypot(nx, ny);
      const idx = (py * size + px) * 4;
      data[idx] = 255;
      data[idx + 1] = 250;
      data[idx + 2] = 238;
      data[idx + 3] = r >= 1.0 ? 0 : Math.round(Math.pow(1.0 - r * r, corePower) * 255);
    }
  }
  const tex = new THREE.DataTexture(data, size, size, THREE.RGBAFormat);
  tex.colorSpace = THREE.SRGBColorSpace;
  tex.minFilter = THREE.LinearFilter;
  tex.magFilter = THREE.LinearFilter;
  tex.generateMipmaps = false;
  tex.needsUpdate = true;
  return tex;
}

/**
 * Safely normalizes attributes (pos, normal, uv) and merges static BufferGeometries
 * into 1 draw call per material across the `480m x 480m` Mountain View Campus.
 */
function mergeCampusStaticGeometries(geoms) {
  if (!geoms || geoms.length === 0) return null;
  const prepared = [];
  let allHaveColor = true;
  for (const raw of geoms) {
    if (!raw) continue;
    const g = raw.index ? raw.toNonIndexed() : raw.clone();
    if (!g.attributes.normal) g.computeVertexNormals();
    const count = g.attributes.position.count;
    if (!g.attributes.uv) {
      g.setAttribute("uv", new THREE.BufferAttribute(new Float32Array(count * 2), 2));
    }
    if (!g.attributes.color) {
      allHaveColor = false;
    }
    for (const key of Object.keys(g.attributes)) {
      if (key !== "position" && key !== "normal" && key !== "uv" && key !== "color") {
        g.deleteAttribute(key);
      }
    }
    prepared.push(g);
  }
  if (prepared.length === 0) return null;
  if (!allHaveColor) {
    for (const g of prepared) {
      if (g.attributes.color) g.deleteAttribute("color");
    }
  }
  const merged = mergeGeometries(prepared, false);
  for (const g of prepared) g.dispose();
  return merged;
}

/**
 * Merges all static child `Mesh` geometries inside a landmark/prop `Group` by
 * `(material.uuid, castShadow, receiveShadow)` so complex sculpted buildings and
 * parked companion bikes render in 4–7 draw calls instead of 60–130!
 */
function bakeStaticGroupByMaterial(group) {
  if (!group || (group.isMesh && group.children.length === 0)) return group;
  group.updateMatrixWorld(true);
  const rootInv = new THREE.Matrix4().copy(group.matrixWorld).invert();
  const buckets = new Map();
  const toRemove = [];

  group.traverse((child) => {
    if (child === group) return;
    if (!child.isMesh || child.isInstancedMesh || !child.geometry || !child.visible) return;
    if (Array.isArray(child.material) || !child.material) return;
    const mat = child.material;

    const hasTexture = Boolean(
      mat.map || mat.normalMap || mat.roughnessMap || mat.metalnessMap || mat.emissiveMap || mat.alphaMap
    );
    const isBrightEmissive = Boolean(
      mat.emissive &&
        (mat.emissiveIntensity ?? 1.0) > 0.22 &&
        mat.emissive.r + mat.emissive.g + mat.emissive.b > 0.12
    );
    const isGlossyFiberglass = (mat.roughness ?? 0.5) < 0.30;
    const canBakeVertexColor =
      !hasTexture &&
      !mat.transparent &&
      !isBrightEmissive &&
      !isGlossyFiberglass &&
      !mat.polygonOffset &&
      Boolean(mat.color) &&
      (mat.isMeshStandardMaterial || mat.isMeshLambertMaterial || mat.isMeshBasicMaterial);

    const isMetallic = (mat.metalness ?? 0.0) >= 0.45;
    const key = canBakeVertexColor
      ? isMetallic
        ? "__VC_METALLIC__"
        : "__VC_DIELECTRIC__"
      : mat.uuid;

    let entry = buckets.get(key);
    if (!entry) {
      entry = {
        isVertexColorBucket: canBakeVertexColor,
        isMetallic,
        mat: canBakeVertexColor ? null : mat,
        roughSum: 0.0,
        metalSum: 0.0,
        weightSum: 0,
        castShadow: Boolean(child.castShadow),
        receiveShadow: Boolean(child.receiveShadow),
        geoms: [],
      };
      buckets.set(key, entry);
    } else {
      if (child.castShadow) entry.castShadow = true;
      if (child.receiveShadow) entry.receiveShadow = true;
    }

    const rawG = child.geometry;
    const g = rawG.index ? rawG.toNonIndexed() : rawG.clone();
    const relMat = new THREE.Matrix4().multiplyMatrices(rootInv, child.matrixWorld);
    g.applyMatrix4(relMat);
    if (!g.attributes.normal) g.computeVertexNormals();
    else g.normalizeNormals();
    if (relMat.determinant() < 0) {
      const pos = g.attributes.position;
      const norm = g.attributes.normal;
      const uv = g.attributes.uv;
      for (let i = 0; i < pos.count; i += 3) {
        for (const attr of [pos, norm, uv]) {
          if (!attr) continue;
          const sz = attr.itemSize;
          for (let c = 0; c < sz; c++) {
            const tmp = attr.array[(i + 1) * sz + c];
            attr.array[(i + 1) * sz + c] = attr.array[(i + 2) * sz + c];
            attr.array[(i + 2) * sz + c] = tmp;
          }
        }
      }
    }

    if (canBakeVertexColor) {
      const vCount = g.attributes.position.count;
      const colArr = new Float32Array(vCount * 3);
      const existingCol = mat.vertexColors ? g.attributes.color : null;
      const cr = mat.color.r;
      const cg = mat.color.g;
      const cb = mat.color.b;
      for (let i = 0; i < vCount; i++) {
        colArr[i * 3] = existingCol ? existingCol.getX(i) * cr : cr;
        colArr[i * 3 + 1] = existingCol ? existingCol.getY(i) * cg : cg;
        colArr[i * 3 + 2] = existingCol ? existingCol.getZ(i) * cb : cb;
      }
      g.setAttribute("color", new THREE.BufferAttribute(colArr, 3));
      entry.roughSum += (mat.roughness ?? 0.5) * vCount;
      entry.metalSum += (mat.metalness ?? 0.05) * vCount;
      entry.weightSum += vCount;
    }

    entry.geoms.push(g);
    toRemove.push(child);
  });

  for (const m of toRemove) {
    if (m.parent) m.parent.remove(m);
  }

  for (const entry of buckets.values()) {
    const merged = mergeCampusStaticGeometries(entry.geoms);
    if (!merged) continue;
    let outMat = entry.mat;
    if (entry.isVertexColorBucket) {
      const w = Math.max(1, entry.weightSum);
      outMat = new THREE.MeshStandardMaterial({
        color: "#ffffff",
        vertexColors: true,
        roughness: THREE.MathUtils.clamp(entry.roughSum / w, 0.16, 0.92),
        metalness: THREE.MathUtils.clamp(entry.metalSum / w, 0.0, 0.94),
      });
    }
    const mesh = new THREE.Mesh(merged, outMat);
    mesh.castShadow = entry.castShadow;
    mesh.receiveShadow = entry.receiveShadow;
    mesh.matrixAutoUpdate = false;
    mesh.updateMatrix();
    group.add(mesh);
  }
  return group;
}

// ============================================================================
// EXACT CARRIAGEWAY SDF, ORTHOGONAL 3.60M CORNER FILLETS & CURBSIDE WAYMO BAYS
// ============================================================================
const CORNER_FILLET_RADIUS = 3.60;

/**
 * Active dark-asphalt carriageway segments (clipped at T-intersections & pedestrian plaza
 * gateways so asphalt and plazas meet cleanly at flush granite headers with 0.000m overlap).
 */
const ACTIVE_ASPHALT_SEGMENTS = [
  { id: "charleston_rd", x1: -195.0, z1: 76.0, x2: 164.0, z2: 76.0, halfW: 7.0 },
  { id: "amphitheatre_pkwy", x1: -195.0, z1: -18.0, x2: 164.0, z2: -18.0, halfW: 7.0 },
  { id: "gradient_driveway", x1: -56.0, z1: 116.0, x2: 56.0, z2: 116.0, halfW: 5.25 },
  { id: "north_creek_connector", x1: -7.0, z1: -86.0, x2: 164.0, z2: -86.0, halfW: 5.75 },
  { id: "shoreline_blvd", x1: 0.0, z1: 121.25, x2: 0.0, z2: -86.0, halfW: 7.0 },
  { id: "west_campus_ave", x1: -118.0, z1: 86.60, x2: -118.0, z2: -11.0, halfW: 6.5 },
];

/**
 * 7 Roadside Pull-Out Bays recessed smoothly into the curb line along major campus avenues.
 */
const CURBSIDE_PULLOUT_BAYS = [
  {
    id: "waymo_parked_canopy",
    roadId: "gradient_driveway",
    x: 33.5,
    z: 122.15,
    yaw: -Math.PI * 0.5, // Facing West along Gradient Canopy Drop-Off
    bayHalfLen: 4.8,
    bayDepth: 2.35,
    roadEdgeCoord: 121.25,
    axis: "x",
    sideSign: 1, // +Z side of gradient_driveway (`z in [121.25, 123.60]`)
  },
  {
    id: "waymo_parked_charleston",
    roadId: "charleston_rd",
    x: -44.0,
    z: 84.05,
    yaw: -Math.PI * 0.5, // Facing West on North side of Charleston Rd
    bayHalfLen: 4.8,
    bayDepth: 2.35,
    roadEdgeCoord: 83.0,
    axis: "x",
    sideSign: 1, // +Z side (`z in [83.0, 85.35]`)
  },
  {
    id: "waymo_parked_android_ave",
    roadId: "west_campus_ave",
    x: -125.55,
    z: 42.0,
    yaw: Math.PI, // Facing South on West side of Googleplex West Ave
    bayHalfLen: 4.8,
    bayDepth: 2.35,
    roadEdgeCoord: -124.5,
    axis: "z",
    sideSign: -1, // -X side (`x in [-126.85, -124.5]`)
  },
  {
    id: "waymo_parked_plex_west",
    roadId: "amphitheatre_pkwy",
    x: -64.0,
    z: -26.05,
    yaw: Math.PI * 0.5, // Facing East on South side of Amphitheatre Pkwy
    bayHalfLen: 4.8,
    bayDepth: 2.35,
    roadEdgeCoord: -25.0,
    axis: "x",
    sideSign: -1, // -Z side (`z in [-27.35, -25.0]`)
  },
  {
    id: "waymo_parked_amphitheatre_east",
    roadId: "amphitheatre_pkwy",
    x: 112.0,
    z: -9.95,
    yaw: -Math.PI * 0.5, // Facing West on North side of Amphitheatre Pkwy
    bayHalfLen: 4.8,
    bayDepth: 2.35,
    roadEdgeCoord: -11.0,
    axis: "x",
    sideSign: 1, // +Z side (`z in [-11.0, -8.65]`)
  },
  {
    id: "waymo_parked_bayview_north",
    roadId: "amphitheatre_pkwy",
    x: 141.5,
    z: -9.95,
    yaw: -Math.PI * 0.5, // Facing West beside Bay View Dragonscale North Plaza
    bayHalfLen: 4.8,
    bayDepth: 2.35,
    roadEdgeCoord: -11.0,
    axis: "x",
    sideSign: 1,
  },
  {
    id: "waymo_parked_bayview_south",
    roadId: "charleston_rd",
    x: 138.0,
    z: 67.95,
    yaw: Math.PI * 0.5, // Facing East beside Bay View Dragonscale South Approach
    bayHalfLen: 4.8,
    bayDepth: 2.35,
    roadEdgeCoord: 69.0,
    axis: "x",
    sideSign: -1,
  },
];

/**
 * Exact orthogonal intersection corners (`R = 3.60m` quarter-circle fillet arcs).
 * Every corner connects vertical curb `|x - ix| = halfWV` smoothly to horizontal curb `|z - iz| = halfWH`.
 */
const INTERSECTION_CORNER_FILLETS = (() => {
  const list = [];
  const addCorners = (ix, iz, halfWV, halfWH, quadrants, hasAda = true) => {
    for (const [sx, sz] of quadrants) {
      list.push({
        ix,
        iz,
        halfWV,
        halfWH,
        sx,
        sz,
        rFillet: CORNER_FILLET_RADIUS,
        cx: ix + sx * (halfWV + CORNER_FILLET_RADIUS),
        cz: iz + sz * (halfWH + CORNER_FILLET_RADIUS),
        hasAda,
      });
    }
  };
  // T-intersection: N Shoreline Blvd (`x=0, halfW=7.0`) meets Gradient Driveway (`z=116, halfW=5.25`) on -Z side
  addCorners(0.0, 116.0, 7.0, 5.25, [[-1, -1], [1, -1]], true);
  // 4-way: N Shoreline Blvd (`x=0, 7.0`) x Charleston Rd (`z=76, 7.0`)
  addCorners(0.0, 76.0, 7.0, 7.0, [[-1, -1], [1, -1], [-1, 1], [1, 1]], true);
  // Charleston Rd (`z=76, 7.0`) x West Campus Ave (`x=-118, 6.5` south + Android Plaza gateway north)
  addCorners(-118.0, 76.0, 6.5, 7.0, [[-1, -1], [1, -1], [-1, 1], [1, 1]], true);
  // 4-way: N Shoreline Blvd (`x=0, 7.0`) x Amphitheatre Pkwy (`z=-18, 7.0`)
  addCorners(0.0, -18.0, 7.0, 7.0, [[-1, -1], [1, -1], [-1, 1], [1, 1]], true);
  // North-side T-intersection ONLY: West Campus Ave (`x=-118, 6.5`) terminates cleanly at Amphitheatre Pkwy (`z=-18, 7.0`)
  addCorners(-118.0, -18.0, 6.5, 7.0, [[-1, 1], [1, 1]], true);
  // East-North L/T-corner ONLY: N Shoreline Blvd (`x=0, 7.0`) meets North Bayshore Trail (`z=-86, 5.75`, `x >= -7`)
  addCorners(0.0, -86.0, 7.0, 5.75, [[1, 1]], true);
  return list;
})();

function sdOrientedSegmentBox(x, z, x1, z1, x2, z2, halfW) {
  const dx = x2 - x1;
  const dz = z2 - z1;
  const len = Math.hypot(dx, dz) || 1.0;
  const fx = dx / len;
  const fz = dz / len;
  const mx = (x1 + x2) * 0.5;
  const mz = (z1 + z2) * 0.5;
  const relX = x - mx;
  const relZ = z - mz;
  const along = Math.abs(relX * fx + relZ * fz) - len * 0.5;
  const perp = Math.abs(-relX * fz + relZ * fx) - halfW;
  const outX = Math.max(along, 0.0);
  const outZ = Math.max(perp, 0.0);
  return Math.hypot(outX, outZ) + Math.min(Math.max(along, perp), 0.0);
}

/**
 * Exact signed distance to the unified dark-asphalt carriageway network (`< 0` inside asphalt,
 * `0` on asphalt/gutter seam, `> 0` outside), including `R = 3.60m` intersection corner fillets
 * and the 5 recessed curbside Waymo pickup bays.
 */
function signedAsphaltClearance(x, z) {
  let minSd = Infinity;
  for (let i = 0; i < ACTIVE_ASPHALT_SEGMENTS.length; i++) {
    const s = ACTIVE_ASPHALT_SEGMENTS[i];
    const d = sdOrientedSegmentBox(x, z, s.x1, s.z1, s.x2, s.z2, s.halfW);
    if (d < minSd) minSd = d;
  }
  // Smooth `R = 3.60m` concave corner fillet spandrels
  for (let i = 0; i < INTERSECTION_CORNER_FILLETS.length; i++) {
    const c = INTERSECTION_CORNER_FILLETS[i];
    const uV = (x - c.ix) * c.sx;
    const uH = (z - c.iz) * c.sz;
    if (
      uV >= c.halfWV - 0.02 &&
      uV <= c.halfWV + c.rFillet + 0.02 &&
      uH >= c.halfWH - 0.02 &&
      uH <= c.halfWH + c.rFillet + 0.02
    ) {
      const r = Math.hypot(x - c.cx, z - c.cz);
      const sdFillet = c.rFillet - r; // `< 0` inside asphalt spandrel (`r > 3.60m`), `> 0` on sidewalk side
      if (sdFillet < minSd) minSd = sdFillet;
    }
  }
  // Roadside pull-out bays
  for (let i = 0; i < CURBSIDE_PULLOUT_BAYS.length; i++) {
    const b = CURBSIDE_PULLOUT_BAYS[i];
    if (b.axis === "x") {
      const bz = b.roadEdgeCoord + b.sideSign * (b.bayDepth * 0.5);
      const d = sdOrientedSegmentBox(
        x,
        z,
        b.x - b.bayHalfLen,
        bz,
        b.x + b.bayHalfLen,
        bz,
        b.bayDepth * 0.5
      );
      if (d < minSd) minSd = d;
    } else {
      const bx = b.roadEdgeCoord + b.sideSign * (b.bayDepth * 0.5);
      const d = sdOrientedSegmentBox(
        x,
        z,
        bx,
        b.z - b.bayHalfLen,
        bx,
        b.z + b.bayHalfLen,
        b.bayDepth * 0.5
      );
      if (d < minSd) minSd = d;
    }
  }
  // Eastern waterfront intersections (`x = 156` at `z = 76, -18, -86`)
  for (const iz of [76.0, -18.0, -86.0]) {
    const rHub = iz === -86.0 ? 8.6 : 9.4;
    const dHub = Math.hypot(x - 156.0, z - iz) - rHub;
    if (dHub < minSd) minSd = dHub;
  }
  // Stevens Creek Bridge north plaza hub `(52, -86)`
  {
    const dBridgeHub = Math.hypot(x - 52.0, z - -86.0) - 8.6;
    if (dBridgeHub < minSd) minSd = dBridgeHub;
  }
  return minSd;
}

/**
 * Signed clearance (`m`) to ANY vehicular/promenade carriageway (`asphalt` + `pavers` + `bridge`),
 * `< 0` inside carriageway, `>= 0` outside carriageway!
 */
function signedCarriagewayClearance(x, z) {
  let minSd = signedAsphaltClearance(x, z);
  for (let i = 0; i < CAMPUS_ROADS.length; i++) {
    const r = CAMPUS_ROADS[i];
    if (
      r.surface === "asphalt" ||
      r.id === "gradient_driveway" ||
      r.id === "googleplex_courtyard_walk"
    ) {
      continue;
    }
    const d = sdOrientedSegmentBox(x, z, r.x1, r.z1, r.x2, r.z2, r.widthM * 0.5);
    if (d < minSd) minSd = d;
  }
  return minSd;
}

/**
 * Subtracts a list of `[cut0, cut1]` 1D intervals from `[minS, maxS]`, returning clean
 * non-overlapping sub-intervals `[a, b]` with `b - a > 0.08m`.
 */
function subtract1DIntervals(minS, maxS, cuts) {
  let spans = [[minS, maxS]];
  for (let i = 0; i < cuts.length; i++) {
    const [c0, c1] = cuts[i];
    if (c1 <= c0) continue;
    const next = [];
    for (let j = 0; j < spans.length; j++) {
      const [a, b] = spans[j];
      if (c1 <= a || c0 >= b) {
        next.push([a, b]);
      } else {
        if (c0 - a > 0.08) next.push([a, c0]);
        if (b - c1 > 0.08) next.push([c1, b]);
      }
    }
    spans = next;
  }
  return spans;
}

/**
 * Builds a terrain-conforming circular/annular plaza disc (`innerR = 0` for full disc)
 * whose vertices hug `getOpenWorldTerrainHeight(wx, wz) + yOffset`, optionally clipping
 * any triangle that intrudes within `minAsphaltClearance` of any asphalt road/crosswalk!
 */
function makeTerrainConformingDisc(
  cx,
  cz,
  outerR,
  rings = 6,
  segs = 36,
  yOffset = 0.007,
  uvScale = 0.24,
  innerR = 0.0,
  recessDisc = null,
  clipFn = null
) {
  const pos = [];
  const uvs = [];
  const indices = [];

  for (let ir = 0; ir <= rings; ir++) {
    const r = innerR + (ir / rings) * (outerR - innerR);
    for (let is = 0; is <= segs; is++) {
      const a = (is / segs) * Math.PI * 2;
      const wx = cx + Math.cos(a) * r;
      const wz = cz + Math.sin(a) * r;
      let wy = getOpenWorldEarthHeight(wx, wz) + yOffset;
      if (recessDisc && Math.hypot(wx - recessDisc.x, wz - recessDisc.z) < recessDisc.r) {
        wy -= 0.035;
      }
      pos.push(wx, wy, wz);
      uvs.push((wx - cx) * uvScale, (wz - cz) * uvScale);

      if (ir < rings && is < segs) {
        const i00 = ir * (segs + 1) + is;
        const i01 = i00 + 1;
        const i10 = (ir + 1) * (segs + 1) + is;
        const i11 = i10 + 1;
        indices.push(i00, i01, i10, i01, i11, i10);
      }
    }
  }

  const finalIndices = [];
  if (clipFn) {
    for (let t = 0; t < indices.length; t += 3) {
      const ia = indices[t];
      const ib = indices[t + 1];
      const ic = indices[t + 2];
      const ax = pos[ia * 3], az = pos[ia * 3 + 2];
      const bx = pos[ib * 3], bz = pos[ib * 3 + 2];
      const gx = pos[ic * 3], gz = pos[ic * 3 + 2];
      const mx = (ax + bx + gx) / 3.0;
      const mz = (az + bz + gz) / 3.0;
      if (clipFn(ax, az) && clipFn(bx, bz) && clipFn(gx, gz) && clipFn(mx, mz)) {
        finalIndices.push(ia, ib, ic);
      }
    }
  }

  const geom = new THREE.BufferGeometry();
  geom.setAttribute("position", new THREE.Float32BufferAttribute(pos, 3));
  geom.setAttribute("uv", new THREE.Float32BufferAttribute(uvs, 2));
  geom.setIndex(clipFn ? finalIndices : indices);
  geom.computeVertexNormals();
  return geom;
}

function makeRoadQuad(
  x1,
  z1,
  x2,
  z2,
  halfWLeft,
  halfWRight,
  y0,
  y1 = y0,
  uvScaleLen = 0.12,
  vOffset = 0.0,
  yRight0 = y0,
  yRight1 = y1
) {
  const dx = x2 - x1;
  const dz = z2 - z1;
  const len = Math.hypot(dx, dz) || 1.0;
  const fx = dx / len;
  const fz = dz / len;
  // Right unit vector in (X, Z) when facing (fx, fz): (-fz, fx)
  const rx = -fz;
  const rz = fx;

  const swap = halfWLeft > halfWRight;
  const wL = swap ? halfWRight : halfWLeft;
  const wR = swap ? halfWLeft : halfWRight;
  const yl0 = swap ? yRight0 : y0;
  const yl1 = swap ? yRight1 : y1;
  const yr0 = swap ? y0 : yRight0;
  const yr1 = swap ? y1 : yRight1;

  const p00 = [x1 + rx * wL, yl0, z1 + rz * wL];
  const p10 = [x1 + rx * wR, yr0, z1 + rz * wR];
  const p01 = [x2 + rx * wL, yl1, z2 + rz * wL];
  const p11 = [x2 + rx * wR, yr1, z2 + rz * wR];

  const geom = new THREE.BufferGeometry();
  // CCW (+Y upward) winding: (p10 - p00) x (p01 - p00) = (-fz, 0, fx) x (fx, 0, fz) = (0, +1, 0)
  const pos = new Float32Array([
    ...p00, ...p10, ...p01,
    ...p10, ...p11, ...p01,
  ]);
  const v0 = vOffset * uvScaleLen;
  const v1 = (vOffset + len) * uvScaleLen;
  const uv = new Float32Array([
    0, v0, 1, v0, 0, v1,
    1, v0, 1, v1, 0, v1,
  ]);
  geom.setAttribute("position", new THREE.BufferAttribute(pos, 3));
  geom.setAttribute("uv", new THREE.BufferAttribute(uv, 2));
  geom.computeVertexNormals();
  return geom;
}

/**
 * Extrudes a 3D beveled Sierra Granite curb segment (`+0.115m` top crown with `45°` top lip
 * chamfer + battered street riser + tucked sidewalk back lip) from `(ax, az)` to `(bx, bz)`.
 * `side > 0` means street/gutter is toward smaller lateral offset (`innerOff < outerOff`);
 * `side < 0` means street/gutter is toward larger lateral offset (`innerOff > outerOff`).
 */
function makeBeveledGraniteCurbSegment(
  ax,
  az,
  bx,
  bz,
  streetOff,
  sidewalkOff,
  baseY0,
  baseY1,
  topY0,
  topY1,
  vOffset = 0.0,
  capStart = false,
  capEnd = false
) {
  const dx = bx - ax;
  const dz = bz - az;
  const len = Math.hypot(dx, dz) || 1.0;
  const fx = dx / len;
  const fz = dz / len;
  const rx = -fz;
  const rz = fx;

  // Profile stations from `u = 0` (street gutter toe) to `u = 1` (back sidewalk edge)
  const prof = [
    { t: 0.00, hFrac: 0.00, u: 0.00 }, // Gutter toe
    { t: 0.16, hFrac: 0.82, u: 0.34 }, // Battered vertical riser top
    { t: 0.34, hFrac: 1.00, u: 0.52 }, // 45-degree beveled chamfer lip
    { t: 1.00, hFrac: 1.00, u: 0.88 }, // Granite crown back edge
    { t: 1.00, hFrac: 0.72, u: 1.00 }, // Tucked back edge inside sidewalk
  ];

  const swapWinding = streetOff > sidewalkOff;
  const v0 = vOffset * 0.45;
  const v1 = (vOffset + len) * 0.45;
  const pos = [];
  const uvs = [];

  const ptAt = (useB, p) => {
    const px = useB ? bx : ax;
    const pz = useB ? bz : az;
    const bY = useB ? baseY1 : baseY0;
    const tY = useB ? topY1 : topY0;
    const off = streetOff + (sidewalkOff - streetOff) * p.t;
    return [px + rx * off, bY + (tY - bY) * p.hFrac, pz + rz * off];
  };

  for (let k = 0; k < prof.length - 1; k++) {
    const pA0 = ptAt(false, prof[k]);
    const pB0 = ptAt(false, prof[k + 1]);
    const pA1 = ptAt(true, prof[k]);
    const pB1 = ptAt(true, prof[k + 1]);
    const uA = prof[k].u;
    const uB = prof[k + 1].u;
    if (!swapWinding) {
      pos.push(...pA0, ...pB0, ...pA1, ...pB0, ...pB1, ...pA1);
      uvs.push(uA, v0, uB, v0, uA, v1, uB, v0, uB, v1, uA, v1);
    } else {
      pos.push(...pB0, ...pA0, ...pB1, ...pA0, ...pA1, ...pB1);
      uvs.push(uB, v0, uA, v0, uB, v1, uA, v0, uA, v1, uB, v1);
    }
  }

  // Optional clean endcaps where a straight curb terminates at a pedestrian threshold
  if (capStart || capEnd) {
    for (const isEnd of [false, true]) {
      if ((!isEnd && !capStart) || (isEnd && !capEnd)) continue;
      const c0 = ptAt(isEnd, { t: 0.0, hFrac: 0.0 });
      const c1 = ptAt(isEnd, { t: 0.22, hFrac: 1.0 });
      const c2 = ptAt(isEnd, { t: 1.0, hFrac: 1.0 });
      const c3 = ptAt(isEnd, { t: 1.0, hFrac: 0.0 });
      const flip = isEnd !== swapWinding;
      if (flip) {
        pos.push(...c0, ...c1, ...c2, ...c0, ...c2, ...c3);
      } else {
        pos.push(...c0, ...c2, ...c1, ...c0, ...c3, ...c2);
      }
      uvs.push(0, 0, 0.3, 0.4, 1, 0.4, 0, 0, 1, 0.4, 1, 0);
    }
  }

  const geom = new THREE.BufferGeometry();
  geom.setAttribute("position", new THREE.Float32BufferAttribute(pos, 3));
  geom.setAttribute("uv", new THREE.Float32BufferAttribute(uvs, 2));
  geom.computeVertexNormals();
  return geom;
}

/**
 * Builds a 6-blade curved 3-segment tapered 3D botanical grass tuft (`0.16m–0.31m` height,
 * `18mm` base -> `1.5mm` pointed tip = `36` triangles per tuft) for GPU-instanced campus lawns.
 */
function createBotanicalGrassTuftGeometry(isSoftwareRenderer = false) {
  const rng = createMulberry32(0x67a55b1d);
  const isCpuCapture = Boolean(
    isSoftwareRenderer ||
      (typeof window !== "undefined" && window.__CAPTURE_UNDERLYING_SWIFTSHADER__)
  );
  const bladeCount = isCpuCapture ? 4 : 6;
  const segs = isCpuCapture ? 2 : 3;
  const pos = [];
  const norm = [];
  const uvs = [];
  const indices = [];

  for (let b = 0; b < bladeCount; b++) {
    const phi = (b / bladeCount) * Math.PI * 2.0 + (rng() - 0.5) * 0.42;
    const rad = 0.018 + rng() * 0.115;
    const rootX = Math.cos(phi) * rad;
    const rootZ = Math.sin(phi) * rad;
    const bladeYaw = phi + (rng() - 0.5) * 0.55;
    const bladeH = 0.16 + rng() * 0.15; // 0.16m .. 0.31m natural botanical variation
    const archOut = (0.052 + rng() * 0.085) * (bladeH / 0.24);
    const baseHalfW = 0.01152; // 1.28x wider (~23mm full width at root)
    const tipHalfW = 0.00096; // 1.9mm pointed tip
    const bladeSeed = (b + 0.5) / bladeCount;

    const dirX = Math.cos(bladeYaw);
    const dirZ = Math.sin(bladeYaw);
    const sideX = -dirZ;
    const sideZ = dirX;

    const baseVert = pos.length / 3;
    for (let s = 0; s <= segs; s++) {
      const t = s / segs;
      const taper =
        t < 0.7
          ? 1.0 - 0.38 * (t / 0.7)
          : Math.max(tipHalfW / baseHalfW, (1.0 - 0.38) * (1.0 - (t - 0.7) / 0.3));
      const hw = Math.max(tipHalfW, baseHalfW * taper);
      const curve = t * t * archOut;
      const vy = bladeH * (t - 0.10 * t * t * t);
      const cx = rootX + dirX * curve;
      const cz = rootZ + dirZ * curve;

      // Subtle V-midrib camber normal tilt so individual blades catch specular sunlight cleanly
      const ny = Math.max(0.28, 0.72 - 0.35 * t);
      const nOut = Math.sqrt(Math.max(0.05, 1.0 - ny * ny));

      for (const lr of [-1, 1]) {
        pos.push(cx + sideX * (lr * hw), vy, cz + sideZ * (lr * hw));
        const nx = dirX * nOut * 0.82 + sideX * (lr * 0.28);
        const nz = dirZ * nOut * 0.82 + sideZ * (lr * 0.28);
        const nLen = Math.hypot(nx, ny, nz) || 1.0;
        norm.push(nx / nLen, ny / nLen, nz / nLen);
        uvs.push(bladeSeed, t);
      }

      if (s < segs) {
        const r0 = baseVert + s * 2;
        const r1 = r0 + 1;
        const r2 = r0 + 2;
        const r3 = r0 + 3;
        indices.push(r0, r1, r2, r1, r3, r2);
      }
    }
  }

  const geom = new THREE.BufferGeometry();
  geom.setAttribute("position", new THREE.Float32BufferAttribute(pos, 3));
  geom.setAttribute("normal", new THREE.Float32BufferAttribute(norm, 3));
  geom.setAttribute("uv", new THREE.Float32BufferAttribute(uvs, 2));
  geom.setIndex(indices);
  return geom;
}

/**
 * Evaluates signed distance to any road carriageway or intersection so sidewalks,
 * trees, and planters never intrude onto intersecting streets!
 */
function isInsideAnyCarriageway(x, z, margin = -0.15) {
  return signedCarriagewayClearance(x, z) < margin;
}

function isInBayViewPond(x, z) {
  return x >= 166.0 && x <= 238.0 && z >= -60.0 && z <= 92.0;
}

function isInStevensCreekWater(x, z) {
  if (x < -265.0 || x > 265.0) return false;
  const cz = stevensCreekCenterZ(x);
  const halfW = stevensCreekHalfWidthZ(x);
  return Math.abs(z - cz) <= halfW + 2.8;
}

/**
 * Analytical Golden-Hour California Sky Dome (`MeshBasic` / lightweight `ShaderMaterial`,
 * `THREE.BackSide` — SwiftShader CPU Fill-Rate Safe!).
 */
function createAnalyticalCampusSkyDome() {
  const geom = new THREE.SphereGeometry(960, 32, 20);
  const mat = new THREE.ShaderMaterial({
    side: THREE.BackSide,
    depthWrite: false,
    fog: false,
    uniforms: {
      uSunDir: { value: new THREE.Vector3(-0.45, 0.35, -0.82).normalize() },
      uSunsetBlend: { value: 0.25 },
      uNightMix: { value: 1.0 },
      uZenithColor: { value: new THREE.Color("#070b14") },
      uHorizonColor: { value: new THREE.Color("#162030") },
      uGlowColor: { value: new THREE.Color("#1c2a40") },
    },
    vertexShader: `
      varying vec3 vDir;
      void main() {
        vDir = normalize(position);
        gl_Position = projectionMatrix * modelViewMatrix * vec4(position, 1.0);
      }
    `,
    fragmentShader: `
      uniform vec3 uSunDir;
      uniform float uSunsetBlend;
      uniform float uNightMix;
      uniform vec3 uZenithColor;
      uniform vec3 uHorizonColor;
      uniform vec3 uGlowColor;
      varying vec3 vDir;

      float hash31(vec3 p) {
        p = fract(p * vec3(443.897, 441.423, 437.195));
        p += dot(p, p.yzx + 19.19);
        return fract((p.x + p.y) * p.z);
      }

      void main() {
        vec3 d = normalize(vDir);
        float h = clamp(d.y, 0.0, 1.0);
        vec3 sky = mix(uHorizonColor, uZenithColor, pow(max(h, 1e-5), 0.56));

        float sunDot = max(dot(d, normalize(uSunDir)), 0.0);
        sky += uGlowColor * pow(max(sunDot, 1e-5), 14.0) * mix(0.28, 0.16, uNightMix);
        float disc = smoothstep(0.9972, 0.9994, sunDot);
        vec3 discCol = mix(vec3(1.0, 0.96, 0.86), vec3(0.76, 0.84, 0.96), uNightMix);
        sky += discCol * disc * mix(0.72, 0.35, uNightMix);

        if (uNightMix > 0.15 && d.y > 0.04) {
          vec3 starCell = floor(d * 240.0);
          float rnd = hash31(starCell);
          if (rnd > 0.9945) {
            vec3 cellCenter = normalize(starCell + 0.5);
            float dist = length(d - cellCenter) * 240.0;
            float starMask = smoothstep(0.32, 0.04, dist) * smoothstep(0.04, 0.28, d.y);
            sky += vec3(0.78, 0.85, 0.98) * starMask * uNightMix * 0.72;
          }
        }

        gl_FragColor = vec4(sky, 1.0);
      }
    `,
  });
  const mesh = new THREE.Mesh(geom, mat);
  mesh.frustumCulled = false;
  mesh.renderOrder = -10;
  return mesh;
}

/**
 * Lightweight animated Fresnel water shader for Bay View Pond, Stevens Creek & SF Bay.
 */
function createCampusWaterMaterial(deepHex = "#184e68", shallowHex = "#3898a8") {
  return new THREE.ShaderMaterial({
    uniforms: {
      uTime: { value: 0 },
      uSunDir: { value: new THREE.Vector3(-0.55, 0.42, -0.72).normalize() },
      uDeep: { value: new THREE.Color(deepHex) },
      uShallow: { value: new THREE.Color(shallowHex) },
    },
    vertexShader: `
      varying vec3 vWorldPos;
      varying vec2 vUvLocal;
      void main() {
        vUvLocal = uv;
        vec4 wp = modelMatrix * vec4(position, 1.0);
        vWorldPos = wp.xyz;
        gl_Position = projectionMatrix * viewMatrix * wp;
      }
    `,
    fragmentShader: `
      uniform float uTime;
      uniform vec3 uSunDir;
      uniform vec3 uDeep;
      uniform vec3 uShallow;
      varying vec3 vWorldPos;
      varying vec2 vUvLocal;
      void main() {
        vec2 p = vWorldPos.xz;
        float r1 = sin(p.x * 1.85 + p.y * 1.15 + uTime * 1.25) * cos(p.y * 2.10 - p.x * 0.85 - uTime * 0.95);
        float r2 = sin(p.x * 4.70 - p.y * 3.90 - uTime * 1.65) * 0.55;
        float r3 = cos(p.x * 9.30 + p.y * 8.10 + uTime * 2.15) * 0.28;
        float rip = r1 + r2 + r3;
        vec3 n = normalize(vec3(rip * 0.011, 1.0, (r1 - r2 + r3) * 0.011));
        vec3 v = normalize(cameraPosition - vWorldPos);
        float fres = pow(max(1.0 - max(dot(n, v), 0.0), 1e-5), 2.75);
        vec3 base = mix(uDeep, uShallow, clamp(0.42 + 0.08 * r1, 0.0, 1.0));
        float sunAlign = clamp(dot(normalize(vec2(-v.x, -v.z)), normalize(uSunDir.xz)) * 0.5 + 0.5, 0.0, 1.0);
        vec3 skyCool = vec3(0.42, 0.56, 0.74);
        vec3 skyWarm = vec3(0.95, 0.75, 0.54);
        vec3 skyRefl = mix(skyCool, skyWarm, 0.38 + 0.52 * sunAlign);
        vec3 col = mix(base, skyRefl, clamp(0.18 + fres * 0.64, 0.0, 0.82));
        vec3 h = normalize(uSunDir + v);
        float spec = pow(max(dot(n, h), 1e-5), 110.0);
        col += vec3(1.0, 0.90, 0.68) * spec * 0.65;
        gl_FragColor = vec4(col, 1.0);
      }
    `,
  });
}

/**
 * Builds a C2-smooth 360-degree multi-harmonic mountain ridgeline ring (`>= 192` azimuth
 * segments x `9` rounded vertical profile rings, zero point-cone pyramid tips!) with
 * baked atmospheric aerial-perspective vertex colors (`VETO-04`).
 */
function buildSmoothMountainRidgeRing({
  radius = 410.0,
  radialSegs = 208,
  vertRings = 9,
  baseY = -3.2,
  phase = 0.0,
  minBayHeight = 3.2,
  baseRangeHeight = 13.5,
  harmonicAmp = 5.2,
  cValleyHex = "#788468",
  cMidSlopeHex = "#ad9974",
  cSunCrestHex = "#d3b88e",
  cBayHazeHex = "#d6c8be",
  cWestGlowHex = "#eed3b4",
  cHorizonHazeHex = "#e3bf9b",
  hazeBlendMin = 0.75,
  hazeBlendMax = 0.88,
}) {
  const vertCount = (radialSegs + 1) * (vertRings + 1);
  const positions = new Float32Array(vertCount * 3);
  const uvs = new Float32Array(vertCount * 2);
  const colors = new Float32Array(vertCount * 3);
  const indices = [];

  const cValley = new THREE.Color(cValleyHex);
  const cMidSlope = new THREE.Color(cMidSlopeHex);
  const cSunCrest = new THREE.Color(cSunCrestHex);
  const cBayHaze = new THREE.Color(cBayHazeHex);
  const cWestGlow = new THREE.Color(cWestGlowHex);
  const cHorizonHaze = new THREE.Color(cHorizonHazeHex);
  const tmpA = new THREE.Color();
  const tmpB = new THREE.Color();
  const tmpHaze = new THREE.Color();

  for (let ia = 0; ia <= radialSegs; ia++) {
    const u = ia / radialSegs;
    const a = u * Math.PI * 2.0;
    const cosA = Math.cos(a);
    const sinA = Math.sin(a);

    // North (`-Z`, `sinA < -0.25`) opens onto San Francisco Bay with gentle low Marin/East Bay hills;
    // South & West (`+Z, -X`) rise into rolling Santa Cruz Mountains; East (`+X`) rises into Diablo Range!
    const bayT = THREE.MathUtils.smoothstep(-sinA, 0.22, 0.82);
    const santaCruzBoost = THREE.MathUtils.smoothstep(sinA * 0.72 - cosA * 0.48, -0.25, 0.85);
    const diabloBoost = THREE.MathUtils.smoothstep(cosA * 0.82 + sinA * 0.25, 0.05, 0.90);

    // Infinitely differentiable multi-harmonic ridge envelope with visible multi-peak relief in 34°-40° lenses!
    const hWave =
      0.34 * Math.sin(2.0 * a + 0.65 + phase) +
      0.28 * Math.cos(3.0 * a - 0.92 + phase * 1.3) +
      0.26 * Math.sin(5.0 * a + 1.74 - phase * 0.8) +
      0.32 * Math.cos(8.0 * a - 0.48 + phase * 1.7) +
      0.24 * Math.sin(13.0 * a + 1.15 + phase * 2.1) +
      0.16 * Math.cos(19.0 * a - 0.72 + phase * 2.6);

    const rangeH =
      baseRangeHeight * (0.76 + 0.44 * santaCruzBoost + 0.36 * diabloBoost) +
      harmonicAmp * hWave;
    const bayHillRelief =
      minBayHeight +
      0.48 * harmonicAmp * (0.55 + 0.45 * Math.sin(5.0 * a + phase) + 0.38 * Math.cos(11.0 * a - phase * 1.4));
    const crestH = THREE.MathUtils.lerp(Math.max(8.0, rangeH), Math.max(4.0, bayHillRelief), bayT * 0.72);

    // Gentle radial undulation of foothill spurs & valleys (`±14m`, C2-smooth)
    const rSpur =
      radius +
      11.0 * Math.cos(3.0 * a + 0.4 + phase) +
      6.5 * Math.sin(6.0 * a - 1.1 - phase);

    const westSunT = THREE.MathUtils.clamp((-cosA * 0.65 - sinA * 0.35) * 0.5 + 0.5, 0.0, 1.0);

    for (let iv = 0; iv <= vertRings; iv++) {
      const v = iv / vertRings;
      const idx = ia * (vertRings + 1) + iv;

      // Smooth S-bell vertical ridge profile: foothill toe closer (`rSpur - 26m`) rising away to rounded crest (`rSpur + 12m`)
      // so inward face normals point cleanly toward the campus AND upward (+Y) toward the sunlit sky!
      const sCurve = v * v * (3.0 - 2.0 * v);
      const crestRoll = v > 0.84 ? Math.pow((v - 0.84) / 0.16, 2.0) * 0.045 : 0.0;
      const wy = baseY + (crestH - baseY) * (sCurve - crestRoll);
      const rLocal = rSpur - 26.0 + 38.0 * Math.pow(v, 0.88);

      positions[idx * 3] = cosA * rLocal;
      positions[idx * 3 + 1] = wy;
      positions[idx * 3 + 2] = sinA * rLocal;

      uvs[idx * 2] = u * 16.0;
      uvs[idx * 2 + 1] = v;

      if (v < 0.52) {
        tmpA.lerpColors(cValley, cMidSlope, v / 0.52);
      } else {
        tmpA.lerpColors(cMidSlope, cSunCrest, (v - 0.52) / 0.48);
      }
      tmpB.lerpColors(tmpA, cWestGlow, westSunT * (0.22 + 0.28 * v));
      tmpB.lerp(cBayHaze, bayT * 0.65);
      // Blend 75%-88% into warm golden-apricot atmospheric horizon haze (zero opaque Play-Doh wall!)
      tmpHaze.lerpColors(cHorizonHaze, cWestGlow, westSunT * 0.58);
      const hazeAmt = THREE.MathUtils.lerp(hazeBlendMax, hazeBlendMin, v);
      tmpB.lerp(tmpHaze, hazeAmt);

      colors[idx * 3] = tmpB.r;
      colors[idx * 3 + 1] = tmpB.g;
      colors[idx * 3 + 2] = tmpB.b;

      if (ia < radialSegs && iv < vertRings) {
        const i00 = idx;
        const i01 = idx + 1;
        const i10 = idx + (vertRings + 1);
        const i11 = i10 + 1;
        indices.push(i00, i10, i01, i01, i10, i11);
      }
    }
  }

  const geom = new THREE.BufferGeometry();
  geom.setAttribute("position", new THREE.BufferAttribute(positions, 3));
  geom.setAttribute("uv", new THREE.BufferAttribute(uvs, 2));
  geom.setAttribute("color", new THREE.BufferAttribute(colors, 3));
  geom.setIndex(indices);
  geom.computeVertexNormals();
  return geom;
}

/**
 * Builds a sculpted 6-tier California Coastal Redwood (`Sequoia sempervirens`) crown
 * with 16-segment scalloped/fluted drooping evergreen boughs and explicit baked
 * multi-tone vertex colors (`VETO-03`: zero black pixels, zero raw 8-gon cones!).
 */
function createSculptedRedwoodCrownGeometry() {
  const tierGeoms = [];
  const tierCount = 6;
  const radialSegs = 16;
  // Ring 0 = closed inner trunk under-collar, Rings 1..6 = drooping scalloped evergreen bough rising to apex!
  const heightSegs = 6;

  // Calibrated multiplier tint ramp over `foliageRedwoodMap` so final shaded needles span
  // `#1b3b1e` deep interior under-bough shadow -> `#386632..#4c8840` sunlit bough tips!
  const cDeepInterior = new THREE.Color("#52864c");
  const cMidBough = new THREE.Color("#9fd493");
  const cSunlitTip = new THREE.Color("#ecf9d2");
  const tmpCol = new THREE.Color();

  for (let t = 0; t < tierCount; t++) {
    const tierFrac = t / (tierCount - 1);
    const rBase = 2.84 * Math.pow(1.0 - tierFrac * 0.72, 0.82);
    const tierH = 3.10 - tierFrac * 0.68;
    const baseY = 3.35 + t * 1.88;
    const tierPhase = t * 1.27 + 0.35;

    const vCount = (radialSegs + 1) * (heightSegs + 1);
    const pos = new Float32Array(vCount * 3);
    const uvs = new Float32Array(vCount * 2);
    const cols = new Float32Array(vCount * 3);
    const indices = [];

    for (let ih = 0; ih <= heightSegs; ih++) {
      const isUnderCollar = ih === 0;
      const vUpper = isUnderCollar ? 0.0 : (ih - 1) / (heightSegs - 1);
      const bellProfile = isUnderCollar
        ? 0.0
        : Math.pow(Math.max(0.0, 1.0 - Math.pow(vUpper, 1.26)), 0.74);

      for (let ir = 0; ir <= radialSegs; ir++) {
        const u = ir / radialSegs;
        const theta = u * Math.PI * 2.0;
        const idx = ih * (radialSegs + 1) + ir;

        // Organic 7-lobe + 5-lobe scalloped/fluted redwood bough sprays
        const lobe7 = Math.cos(7.0 * theta + tierPhase);
        const lobe5 = Math.sin(5.0 * theta - tierPhase * 1.35);
        const flute = 1.0 + (1.0 - vUpper * 0.68) * (0.19 * lobe7 + 0.10 * lobe5);

        let rad;
        let vy;
        if (isUnderCollar) {
          rad = 0.20 * (1.0 - tierFrac * 0.45);
          vy = baseY + 0.14;
        } else if (ih === heightSegs) {
          rad = 0.0;
          vy = baseY + tierH;
        } else {
          rad = Math.max(0.05, rBase * bellProfile * flute);
          const droopY =
            -0.36 *
            Math.pow(1.0 - vUpper, 1.2) *
            (0.52 + 0.48 * lobe7) *
            (1.0 - tierFrac * 0.35);
          vy = baseY + vUpper * tierH + droopY;
        }

        const vx = Math.cos(theta) * rad;
        const vz = Math.sin(theta) * rad;

        pos[idx * 3] = vx;
        pos[idx * 3 + 1] = vy;
        pos[idx * 3 + 2] = vz;

        uvs[idx * 2] = u * 3.0;
        uvs[idx * 2 + 1] = isUnderCollar ? 0.0 : vUpper * 1.5;

        // Multi-tone evergreen vertex shading: deep shaded under-bough -> sunlit outer spray tips
        const outerExposure = isUnderCollar
          ? 0.06 + 0.10 * tierFrac
          : THREE.MathUtils.clamp(
              0.28 + 0.34 * vUpper + 0.20 * tierFrac + 0.24 * Math.max(0.0, lobe7) * (1.0 - vUpper * 0.5),
              0.0,
              1.0
            );
        if (outerExposure < 0.52) {
          tmpCol.lerpColors(cDeepInterior, cMidBough, outerExposure / 0.52);
        } else {
          tmpCol.lerpColors(cMidBough, cSunlitTip, (outerExposure - 0.52) / 0.48);
        }
        cols[idx * 3] = tmpCol.r;
        cols[idx * 3 + 1] = tmpCol.g;
        cols[idx * 3 + 2] = tmpCol.b;

        if (ih < heightSegs && ir < radialSegs) {
          const i00 = idx;
          const i01 = idx + 1;
          const i10 = idx + (radialSegs + 1);
          const i11 = i10 + 1;
          // Outward CCW winding (`dP_h × dP_r` points -Y on under-bough and +radial/+Y on upper bough!)
          indices.push(i00, i10, i01, i01, i10, i11);
        }
      }
    }

    const g = new THREE.BufferGeometry();
    g.setAttribute("position", new THREE.BufferAttribute(pos, 3));
    g.setAttribute("uv", new THREE.BufferAttribute(uvs, 2));
    g.setAttribute("color", new THREE.BufferAttribute(cols, 3));
    g.setIndex(indices);
    g.computeVertexNormals();
    tierGeoms.push(g);
  }

  return mergeCampusStaticGeometries(tierGeoms);
}

export class OpenCampusWorld {
  constructor(materials, seed = 0x51a7c0de) {
    this.materials = materials;
    this.rng = createMulberry32(seed);
    this.root = new THREE.Group();
    this.root.name = "OpenCampusWorld";
    this.isSoftwareRenderer = Boolean(
      (typeof document !== "undefined" &&
        document.documentElement?.classList?.contains("is-software-renderer")) ||
        (typeof window !== "undefined" && window.__CAPTURE_UNDERLYING_SWIFTSHADER__)
    );

    // Dynamic & Atmosphere handles
    this.skyDome = null;
    this.waterMaterials = [];
    this.grassFieldMesh = null;
    this.grassUniforms = null;
    this.lawnMaskTexture = null;
    this._currentAtmosphere = ATMOSPHERE_PRESETS.night;
    this._emissiveScaleFactor = 0.04;
    this._treeFoliageMats = [];
    this._nightEmissives = [];
    this._atmoShaderUniforms = {
      uAtmoTint: { value: new THREE.Color("#223047") },
      uHazeColor: { value: new THREE.Color("#0e1520") },
      uAtmoMix: { value: 0.92 },
    };
    this._buildingCollidersCache = null;

    this.proceduralBuildingsGroup = null;
    this.solarCarportGroup = null;
    this.envV3BuildingsGroup = null;
    this.proceduralStreetFurnitureGroup = null;
    this.envV3PropsGroup = null;
    this.signalPlacements = [];
    this.lampPlacements = [];
    this.benchPlacements = [];
    this.planterPlacements = [];
    this.bikeRackPlacements = [];
    this.triBinPlacements = [];

    this.gradientCanopyFallback = null;
    this.gradientCanopyV2Group = null;
    this.bayViewFallback = null;
    this.bayViewV2Group = null;
    this.shorelineFallback = null;
    this.shorelineV2Group = null;
    this.stevensBridgeV2Group = null;
    this.studioInteriorLight = null;
    this._lastGlobalState = null;

    // V5/V6 Architecture & Botanical handles
    this.v5Grass = null;
    this.archV5Group = null;
    this.archV5PavilionsGroup = null;
    this.archV5BermsGroup = null;
    this.archV5HorizonGroup = null;
    this.distantCrestMesh = null;
    this.foothillsMesh = null;
    this.horizonTreesStaticGroup = null;
    this._botanicalPlacementsAudit = [];
    this._cullForceRebuild = true;
    this._lastCullCamX = NaN;
    this._lastCullCamY = NaN;
    this._lastCullCamZ = NaN;
    this._lastCullFwdX = 0.0;
    this._lastCullFwdY = 0.0;
    this._lastCullFwdZ = -1.0;
    this._lastCullEnclosedInGym = null;
    this._lastCullAllowShadows = null;
    this._lastCullIsTopDown = null;
    this._lastCullFastSw = null;
    this._hadActiveSightlineFade = false;

    this.gymStorefrontFacadeGroup = null;
    this.gradientCanopyV6Group = null;
    this.bayViewV6Group = null;
    this.stevensBridgeV6Group = null;
    this.botanicalKitV6Group = null;
    this.foothillTreesV6Instanced = null;
    this._hasV6Planters = false;

    this.lastOutdoorObstructionCount = 0;
    this.lastOutdoorAvoidanceHiddenCount = 0;
    this._heroPosScratch = { x: 0, y: 0, z: 0 };
    this._grassUpdateOpts = {
      heroPos: this._heroPosScratch,
      stanShockwave: null,
      visible: true,
    };

    this._buildSkyHorizonAndTerrain();
    this._buildRoadSidewalkCrosswalkGrid();
    this._buildCampusBuildingBlocks();
    this._buildGradientCanopyAndFitnessGym();
    this._buildLandmarksAndPavilion();
    this._buildInstancedCampusTreesAndProps();
    this._buildInstanced3DGrassField();
    this.setAtmosphere(ATMOSPHERE_PRESETS.night);
  }

  // ============================================================================
  // 1. CONTIGUOUS TERRAIN HEIGHTFIELD, SKY DOME, HORIZON MOUNTAINS & WATER
  // ============================================================================
  _buildSkyHorizonAndTerrain() {
    this.skyDome = createAnalyticalCampusSkyDome();
    this.root.add(this.skyDome);

    // 2 Continuous C2-Smooth 360-Degree Santa Cruz & Diablo Mountain Ridgeline Rings (chaparral-textured + FogExp2 aerial perspective!)
    const distantCrestGeom = buildSmoothMountainRidgeRing({
      radius: 452.0,
      radialSegs: 240,
      vertRings: 16,
      baseY: -4.5,
      phase: 1.85,
      minBayHeight: 12.5,
      baseRangeHeight: 36.0,
      harmonicAmp: 19.5,
      cValleyHex: "#7180a4",
      cMidSlopeHex: "#8d92b6",
      cSunCrestHex: "#b8a8be",
      cBayHazeHex: "#9aa6c2",
      cWestGlowHex: "#e2be9e",
      cHorizonHazeHex: "#beafc0",
      hazeBlendMin: 0.26,
      hazeBlendMax: 0.48,
    });
    const distantCrestMesh = new THREE.Mesh(
      distantCrestGeom,
      this.materials.horizonDistantRange || this.materials.coastalHillGold
    );
    distantCrestMesh.frustumCulled = false;
    distantCrestMesh.renderOrder = -9;
    distantCrestMesh.matrixAutoUpdate = false;
    distantCrestMesh.updateMatrix();
    this.distantCrestMesh = distantCrestMesh;
    this.root.add(distantCrestMesh);

    const foothillsGeom = buildSmoothMountainRidgeRing({
      radius: 408.0,
      radialSegs: 240,
      vertRings: 16,
      baseY: -3.8,
      phase: 0.25,
      minBayHeight: 6.5,
      baseRangeHeight: 20.5,
      harmonicAmp: 13.5,
      cValleyHex: "#5f7454",
      cMidSlopeHex: "#878b6b",
      cSunCrestHex: "#bca882",
      cBayHazeHex: "#829188",
      cWestGlowHex: "#deba92",
      cHorizonHazeHex: "#b8ae9e",
      hazeBlendMin: 0.14,
      hazeBlendMax: 0.32,
    });
    const foothillsMesh = new THREE.Mesh(
      foothillsGeom,
      this.materials.horizonFoothillsRidge || this.materials.coastalHillGold
    );
    foothillsMesh.frustumCulled = false;
    foothillsMesh.renderOrder = -8;
    foothillsMesh.matrixAutoUpdate = false;
    foothillsMesh.updateMatrix();
    this.foothillsMesh = foothillsMesh;
    this.root.add(foothillsMesh);

    // Contiguous `530m x 470m` Terrain Heightfield (`x in [-265, 265], z in [-260, 210]`)
    const segX = 216;
    const segZ = 216;
    const minX = -265;
    const maxX = 265;
    const minZ = -260;
    const maxZ = 210;

    const vertCount = (segX + 1) * (segZ + 1);
    const positions = new Float32Array(vertCount * 3);
    const uvs = new Float32Array(vertCount * 2);
    const colors = new Float32Array(vertCount * 3);
    const indices = [];

    // Cool-olive botanical vertex modulation over the 1024x1024 multi-layered PBR fescue/clover/soil turf map
    // (ZERO neon CG green and ZERO dry yellow-tan bleach — harmonizes 1:1 with V5 3D grass tufts!).
    const cLawn = new THREE.Color("#cfd8be");
    const cLush = new THREE.Color("#b5c2a0");
    const cMeadow = new THREE.Color("#c2cbb0");
    const cBank = new THREE.Color("#bfa77e");
    const cSubRoad = new THREE.Color("#3b3f46");

    for (let iz = 0; iz <= segZ; iz++) {
      const vz = iz / segZ;
      const wz = minZ + vz * (maxZ - minZ);
      for (let ix = 0; ix <= segX; ix++) {
        const ux = ix / segX;
        const wx = minX + ux * (maxX - minX);
        const idx = iz * (segX + 1) + ix;

        let wy = getOpenWorldEarthHeight(wx, wz);
        const macroPatch =
          0.5 + 0.5 * Math.sin(wx * 0.045 + 0.7) * Math.cos(wz * 0.048 - 0.4);
        _color.copy(cLush).lerp(cLawn, macroPatch);
        let col = _color;

        // Sink terrain cleanly (`-0.12m`) strictly beneath vehicular asphalt carriageways,
        // gym floor & solar lot (keeping all sidewalks, Android Plaza & Stan Courtyard at full lush lawn height!)
        const inGymArea = Math.abs(wx) <= 17.5 && wz >= 113.5 && wz <= 153.5;
        const onCarriageway =
          signedCarriagewayClearance(wx, wz) < 0.25 &&
          Math.hypot(wx - -118.0, wz - 96.0) > 12.5;
        const inSolarLot = Math.abs(wx - -162.0) < 20.0 && Math.abs(wz - 28.0) < 22.0;
        const inShorelineConcourse = Math.hypot(wx - 14.0, wz - -188.0) < 20.8;
        const inAndroidPlaza =
          Math.hypot(wx - -118.0, wz - 96.0) < 8.65 ||
          (Math.abs(wx - -118.0) < 4.35 && wz >= 86.75 && wz <= 93.5);

        if (isInBayViewPond(wx, wz)) {
          const edgeDist = Math.min(wx - 166.0, 238.0 - wx, wz - -60.0, 92.0 - wz);
          wy = -0.58 * Math.min(1.0, edgeDist / 5.5);
          col = cBank;
        } else if (isInStevensCreekWater(wx, wz)) {
          const cz = stevensCreekCenterZ(wx);
          const halfW = stevensCreekHalfWidthZ(wx);
          const distZ = Math.abs(wz - cz);
          if (distZ <= halfW) {
            wy = -0.82 - 0.12 * Math.cos(Math.min(distZ / halfW, 1.0) * Math.PI * 0.5);
          } else {
            const slopeT = Math.max(0.0, 1.0 - (distZ - halfW) / 2.8);
            wy = -0.82 * slopeT * slopeT;
          }
          col = cBank;
        } else if (wz < -226.0) {
          wy = -0.65 * Math.min(1.0, (-226.0 - wz) / 8.0);
          col = cBank;
        } else if (
          inGymArea ||
          onCarriageway ||
          inSolarLot ||
          inShorelineConcourse ||
          inAndroidPlaza
        ) {
          wy -= 0.12;
          col = cSubRoad;
        } else {
          if (wz < -100.0 || wx > 142.0) {
            const blend = THREE.MathUtils.clamp((-95.0 - wz) / 62.0, 0.0, 0.65);
            _color.lerp(cMeadow, blend);
            col = _color;
          }
          // Gentle outer foothill toe transition (`r > 218m`, strictly outside all campus roads/props)
          // so the distant lawn perimeter rolls organically into the `R ~ 274m` Santa Cruz foothill skirt!
          const rOuter = Math.hypot(wx, wz);
          if (rOuter > 218.0 && wz > -216.0) {
            const uToe = THREE.MathUtils.clamp((rOuter - 218.0) / 56.0, 0.0, 1.0);
            const sToe = uToe * uToe * (3.0 - 2.0 * uToe);
            wy += sToe * (2.6 + 0.9 * Math.sin(wx * 0.035 + wz * 0.029));
          }
        }

        positions[idx * 3] = wx;
        positions[idx * 3 + 1] = wy;
        positions[idx * 3 + 2] = wz;

        // High-density `~5.5m` world tile size -> `185 texels/meter` crisp PBR turf detail!
        uvs[idx * 2] = ux * 96.0;
        uvs[idx * 2 + 1] = vz * 85.0;

        colors[idx * 3] = col.r;
        colors[idx * 3 + 1] = col.g;
        colors[idx * 3 + 2] = col.b;

        if (iz < segZ && ix < segX) {
          const a = idx;
          const b = idx + 1;
          const c = idx + (segX + 1);
          const d = c + 1;
          indices.push(a, c, b, b, c, d);
        }
      }
    }

    const terrainGeom = new THREE.BufferGeometry();
    terrainGeom.setAttribute("position", new THREE.BufferAttribute(positions, 3));
    terrainGeom.setAttribute("uv", new THREE.BufferAttribute(uvs, 2));
    terrainGeom.setAttribute("color", new THREE.BufferAttribute(colors, 3));
    terrainGeom.setIndex(indices);
    terrainGeom.computeVertexNormals();
    const globalNormals = terrainGeom.attributes.normal.array;

    const baseTerrainMat =
      this.materials.turfLawnPbr || this.materials.apronGrassLambert;
    const terrainMat = baseTerrainMat.clone();
    terrainMat.color.set("#ffffff");
    terrainMat.vertexColors = true;

    // Partition terrain into 4x4 static spatial chunks (sharing exact pre-computed seam normals)
    // so Three.js frustum-culls ~75% of off-camera campus ground every frame!
    const chunksX = 4;
    const chunksZ = 4;
    for (let czIdx = 0; czIdx < chunksZ; czIdx++) {
      const iz0 = Math.floor((czIdx * segZ) / chunksZ);
      const iz1 = Math.floor(((czIdx + 1) * segZ) / chunksZ);
      const rows = iz1 - iz0;
      for (let cxIdx = 0; cxIdx < chunksX; cxIdx++) {
        const ix0 = Math.floor((cxIdx * segX) / chunksX);
        const ix1 = Math.floor(((cxIdx + 1) * segX) / chunksX);
        const cols = ix1 - ix0;
        const cVerts = (cols + 1) * (rows + 1);
        const cPos = new Float32Array(cVerts * 3);
        const cNorm = new Float32Array(cVerts * 3);
        const cUv = new Float32Array(cVerts * 2);
        const cCol = new Float32Array(cVerts * 3);
        const cIdx = [];

        for (let dz = 0; dz <= rows; dz++) {
          const gz = iz0 + dz;
          for (let dx = 0; dx <= cols; dx++) {
            const gx = ix0 + dx;
            const gIdx = gz * (segX + 1) + gx;
            const lIdx = dz * (cols + 1) + dx;
            cPos[lIdx * 3] = positions[gIdx * 3];
            cPos[lIdx * 3 + 1] = positions[gIdx * 3 + 1];
            cPos[lIdx * 3 + 2] = positions[gIdx * 3 + 2];
            cNorm[lIdx * 3] = globalNormals[gIdx * 3];
            cNorm[lIdx * 3 + 1] = globalNormals[gIdx * 3 + 1];
            cNorm[lIdx * 3 + 2] = globalNormals[gIdx * 3 + 2];
            cUv[lIdx * 2] = uvs[gIdx * 2];
            cUv[lIdx * 2 + 1] = uvs[gIdx * 2 + 1];
            cCol[lIdx * 3] = colors[gIdx * 3];
            cCol[lIdx * 3 + 1] = colors[gIdx * 3 + 1];
            cCol[lIdx * 3 + 2] = colors[gIdx * 3 + 2];

            if (dz < rows && dx < cols) {
              const a = lIdx;
              const b = lIdx + 1;
              const c = lIdx + (cols + 1);
              const d = c + 1;
              cIdx.push(a, c, b, b, c, d);
            }
          }
        }

        const chunkGeom = new THREE.BufferGeometry();
        chunkGeom.setAttribute("position", new THREE.BufferAttribute(cPos, 3));
        chunkGeom.setAttribute("normal", new THREE.BufferAttribute(cNorm, 3));
        chunkGeom.setAttribute("uv", new THREE.BufferAttribute(cUv, 2));
        chunkGeom.setAttribute("color", new THREE.BufferAttribute(cCol, 3));
        chunkGeom.setIndex(cIdx);
        chunkGeom.computeBoundingSphere();

        const terrainChunk = new THREE.Mesh(chunkGeom, terrainMat);
        terrainChunk.receiveShadow = true;
        terrainChunk.matrixAutoUpdate = false;
        terrainChunk.updateMatrix();
        this.root.add(terrainChunk);
      }
    }
    terrainGeom.dispose();

    // V6 Realistic Animated Fresnel Water Bodies (Bay View Pond + Stevens Creek + North SF Bay)
    // + Chiseled Sierra Granite Basin Coping Curbs (kills flat blue paint rectangle!)
    const pondWaterMat =
      typeof MaterialsMod.createRealisticCampusWaterMaterial === "function"
        ? MaterialsMod.createRealisticCampusWaterMaterial({
            sunsetPreset: false,
            rippleScale: 0.17,
            rippleStrength: 0.088,
          })
        : createCampusWaterMaterial("#2C3E3A", "#8FB2CE");
    const sunsetCreekWaterMat =
      typeof MaterialsMod.createRealisticCampusWaterMaterial === "function"
        ? MaterialsMod.createRealisticCampusWaterMaterial({
            sunsetPreset: true,
            rippleScale: 0.20,
            rippleStrength: 0.095,
          })
        : pondWaterMat;
    if (pondWaterMat?.userData) pondWaterMat.userData.isCampusWaterV6 = true;
    if (sunsetCreekWaterMat?.userData) sunsetCreekWaterMat.userData.isCampusWaterV6 = true;
    this.waterMaterials.push(pondWaterMat);
    if (sunsetCreekWaterMat !== pondWaterMat) {
      this.waterMaterials.push(sunsetCreekWaterMat);
    }

    // 1. Bay View Dragonscale Retention Pond (`x in [165, 239], z in [-61, +93]`)
    const pondG = new THREE.PlaneGeometry(74, 154, 12, 24);
    pondG.rotateX(-Math.PI * 0.5);
    pondG.translate(202.0, -0.14, 16.0);
    const pondMesh = new THREE.Mesh(pondG, pondWaterMat);
    pondMesh.name = "Bay_View_Retention_Pond_Water_V6";
    pondMesh.matrixAutoUpdate = false;
    pondMesh.updateMatrix();
    this.root.add(pondMesh);

    // Chiseled Sierra Granite Coping Curb Wall framing the Bay View Retention Basin
    const pondCopingGeoms = [
      // West promenade coping (`x = 164.78, z in [-61.4, +93.4]`)
      new THREE.BoxGeometry(0.56, 0.34, 154.8).translate(164.78, -0.10, 16.0),
      // East pavilion bank coping (`x = 239.22, z in [-61.4, +93.4]`)
      new THREE.BoxGeometry(0.56, 0.34, 154.8).translate(239.22, -0.10, 16.0),
      // South basin coping (`x in [164.5, 239.5], z = 93.22`)
      new THREE.BoxGeometry(75.0, 0.34, 0.56).translate(202.0, -0.10, 93.22),
      // North basin coping (`x in [164.5, 239.5], z = -61.22`)
      new THREE.BoxGeometry(75.0, 0.34, 0.56).translate(202.0, -0.10, -61.22),
    ];
    // Natural stone bank coping blocks flanking the widened Stevens Creek channel (`x in [-44, +114]`)
    const copingSegs = 32;
    for (let s = 0; s < copingSegs; s++) {
      const xA = -44.0 + (s / copingSegs) * 158.0;
      const xB = -44.0 + ((s + 1) / copingSegs) * 158.0;
      const zA = stevensCreekCenterZ(xA);
      const zB = stevensCreekCenterZ(xB);
      const hw = 0.5 * (stevensCreekHalfWidthZ(xA) + stevensCreekHalfWidthZ(xB));
      pondCopingGeoms.push(
        makeRoadQuad(xA, zA, xB, zB, -(hw + 1.45), -(hw + 0.55), -0.08, -0.08, 0.45),
        makeRoadQuad(xA, zA, xB, zB, hw + 0.55, hw + 1.45, -0.08, -0.08, 0.45)
      );
    }
    const mergedCoping = mergeCampusStaticGeometries(pondCopingGeoms);
    if (mergedCoping) {
      const copingMesh = new THREE.Mesh(
        mergedCoping,
        this.materials.graniteCurb || this.materials.concreteSidewalk
      );
      copingMesh.name = "Campus_Water_Basin_Granite_Coping_V6";
      copingMesh.receiveShadow = true;
      copingMesh.castShadow = false;
      copingMesh.matrixAutoUpdate = false;
      copingMesh.updateMatrix();
      this.root.add(copingMesh);
    }

    // 2. Full-Map Continuous Stevens Creek Water Ribbon (`x in [-265, +265]`, widened `±29.2m` under Corten Bridge!)
    //    + Northern SF Bay Shoreline (`z ~ -282`) — ZERO mid-lawn dead-end cutoff!
    const creekAndBayGeoms = [];
    const creekSegs = 92;
    for (let i = 0; i < creekSegs; i++) {
      const xA = -265.0 + (i / creekSegs) * 530.0;
      const xB = -265.0 + ((i + 1) / creekSegs) * 530.0;
      const hw = 0.5 * (stevensCreekHalfWidthZ(xA) + stevensCreekHalfWidthZ(xB)) + 1.35;
      creekAndBayGeoms.push(
        makeRoadQuad(xA, stevensCreekCenterZ(xA), xB, stevensCreekCenterZ(xB), -hw, hw, -0.16)
      );
    }
    const bayG = new THREE.PlaneGeometry(620, 115, 8, 4);
    bayG.rotateX(-Math.PI * 0.5);
    bayG.translate(0.0, -0.18, -282.0);
    creekAndBayGeoms.push(bayG);

    const waterMesh = new THREE.Mesh(
      mergeCampusStaticGeometries(creekAndBayGeoms),
      sunsetCreekWaterMat
    );
    waterMesh.name = "Stevens_Creek_And_Bay_Water_V6";
    waterMesh.matrixAutoUpdate = false;
    waterMesh.updateMatrix();
    this.root.add(waterMesh);
  }

  // ============================================================================
  // 1B. V5 AAA GPU-INSTANCED 3D CURVED GRASS SYSTEM (`132,000` BLADES, `1` DRAW CALL)
  // ============================================================================
  _buildInstanced3DGrassField() {
    this.v5Grass = createAAAInstancedGrassSystem(THREE, {
      maxDrawRadiusM: 96.0,
    });
    this.grassFieldMesh = this.v5Grass.mesh;
    this.grassUniforms = this.v5Grass.uniforms;
    this.lawnMaskTexture = this.v5Grass.lawnMaskTexture;
    this.root.add(this.v5Grass.mesh);
  }

  // ============================================================================
  // 2. AAA PBR ASPHALT ROAD, GUTTER, 3D GRANITE CURB, GRATES & SIDEWALK NETWORK
  // ============================================================================
  _buildRoadSidewalkCrosswalkGrid() {
    const asphaltGeoms = [];
    const gutterGeoms = [];
    const grateGeoms = [];
    const whiteStripeGeoms = [];
    const yellowStripeGeoms = [];
    const sidewalkGeoms = [];
    const curbGeoms = [];
    const paverGeoms = [];
    const ADA_Geoms = [];

    const pushUpwardQuad = (targetArr, p00, p10, p01, p11, u0, v0, u1, v1) => {
      const dx1 = p10[0] - p00[0];
      const dz1 = p10[2] - p00[2];
      const dx2 = p01[0] - p00[0];
      const dz2 = p01[2] - p00[2];
      const crossY = dz1 * dx2 - dx1 * dz2;
      const g = new THREE.BufferGeometry();
      const pos =
        crossY >= 0
          ? new Float32Array([...p00, ...p10, ...p01, ...p10, ...p11, ...p01])
          : new Float32Array([...p00, ...p01, ...p10, ...p10, ...p01, ...p11]);
      const uv =
        crossY >= 0
          ? new Float32Array([u0, v0, u1, v0, u0, v1, u1, v0, u1, v1, u0, v1])
          : new Float32Array([u0, v0, u0, v1, u1, v0, u1, v0, u0, v1, u1, v1]);
      g.setAttribute("position", new THREE.BufferAttribute(pos, 3));
      g.setAttribute("uv", new THREE.BufferAttribute(uv, 2));
      g.computeVertexNormals();
      targetArr.push(g);
    };

    const pushOutwardQuad = (targetArr, p00, p10, p01, p11, u0, v0, u1, v1, outX, outY, outZ) => {
      const ax = p10[0] - p00[0], ay = p10[1] - p00[1], az = p10[2] - p00[2];
      const bx = p01[0] - p00[0], by = p01[1] - p00[1], bz = p01[2] - p00[2];
      const cx = ay * bz - az * by;
      const cy = az * bx - ax * bz;
      const cz = ax * by - ay * bx;
      const dot = cx * outX + cy * outY + cz * outZ;
      const g = new THREE.BufferGeometry();
      const pos =
        dot >= 0
          ? new Float32Array([...p00, ...p10, ...p01, ...p10, ...p11, ...p01])
          : new Float32Array([...p00, ...p01, ...p10, ...p10, ...p01, ...p11]);
      const uv =
        dot >= 0
          ? new Float32Array([u0, v0, u1, v0, u0, v1, u1, v0, u1, v1, u0, v1])
          : new Float32Array([u0, v0, u0, v1, u1, v0, u1, v0, u0, v1, u1, v1]);
      g.setAttribute("position", new THREE.BufferAttribute(pos, 3));
      g.setAttribute("uv", new THREE.BufferAttribute(uv, 2));
      g.computeVertexNormals();
      targetArr.push(g);
    };

    // --------------------------------------------------------------------------
    // A. Edge-to-Edge PBR Dark Asphalt Carriageways (ZERO coplanar overlap!)
    // --------------------------------------------------------------------------
    const ewBoulevards = ACTIVE_ASPHALT_SEGMENTS.filter((s) => Math.abs(s.z1 - s.z2) < 0.01);
    const nsAvenues = ACTIVE_ASPHALT_SEGMENTS.filter((s) => Math.abs(s.x1 - s.x2) < 0.01);

    for (const r of ewBoulevards) {
      asphaltGeoms.push(
        makeRoadQuad(r.x1, r.z1, r.x2, r.z2, -r.halfW, r.halfW, 0.016, 0.016, 1.0 / 14.0)
      );
    }

    for (const r of nsAvenues) {
      const zMin = Math.min(r.z1, r.z2);
      const zMax = Math.max(r.z1, r.z2);
      const cuts = [];
      for (const ew of ewBoulevards) {
        if (r.x1 >= Math.min(ew.x1, ew.x2) - 0.5 && r.x1 <= Math.max(ew.x1, ew.x2) + 0.5) {
          cuts.push([ew.z1 - ew.halfW, ew.z1 + ew.halfW]);
        }
      }
      const spans = subtract1DIntervals(zMin, zMax, cuts);
      for (const [za, zb] of spans) {
        // Orient `-Z -> +Z` or `+Z -> -Z` consistently with `vOffset` so tire wear tracks align seamlessly
        asphaltGeoms.push(
          makeRoadQuad(r.x1, zb, r.x1, za, -r.halfW, r.halfW, 0.016, 0.016, 1.0 / 14.0, zMax - zb)
        );
      }
    }

    // --------------------------------------------------------------------------
    // B. 14-Segment `R = 3.60m` Curved Intersection Corners:
    //    Asphalt Spandrel + 0.32m Concrete Gutter + 3D Beveled Granite Curb +
    //    Rounded Grooved Sidewalk Fan + Grounded Yellow ADA Tactile Mat!
    // --------------------------------------------------------------------------
    const cornerSegs = 14;
    const rAsphalt = CORNER_FILLET_RADIUS; // 3.60m
    const rCurbToe = rAsphalt - 0.32;      // 3.28m (0.32m concrete gutter pan)
    const rCurbBack = rCurbToe - 0.22;     // 3.06m (0.22m 3D beveled Sierra granite curb)

    for (const c of INTERSECTION_CORNER_FILLETS) {
      const { ix, iz, halfWV, halfWH, sx, sz, cx, cz, hasAda } = c;
      const baseE = getOpenWorldEarthHeight(cx, cz);
      const asphaltY = baseE + 0.016;
      const gutterToeY = baseE + 0.013;
      const curbTopY = baseE + 0.115;
      const swY = baseE + 0.094;
      const skirtY = baseE - 0.14;

      const cornerApexX = ix + sx * halfWV;
      const cornerApexZ = iz + sz * halfWH;

      const ptArc = (rad, theta, yVal) => [
        cx - sx * rad * Math.cos(theta),
        yVal,
        cz - sz * rad * Math.sin(theta),
      ];

      for (let s = 0; s < cornerSegs; s++) {
        const th0 = (s / cornerSegs) * (Math.PI * 0.5);
        const th1 = ((s + 1) / cornerSegs) * (Math.PI * 0.5);
        const thMid = 0.5 * (th0 + th1);
        const outX = -sx * Math.cos(thMid);
        const outZ = -sz * Math.sin(thMid);

        // 1. Concave Asphalt Spandrel (`r = 3.60m` arc out to road intersection rectangle edge)
        const rayEdgePt = (theta) => {
          const cosT = Math.cos(theta);
          const sinT = Math.sin(theta);
          // Intersect ray `(cx - sx*t*cosT, cz - sz*t*sinT)` with `x = cornerApexX` or `z = cornerApexZ`
          const tToVert = cosT > 1e-4 ? rAsphalt / cosT : 1e6;
          const tToHoriz = sinT > 1e-4 ? rAsphalt / sinT : 1e6;
          const tEdge = Math.min(tToVert, tToHoriz);
          return [cx - sx * tEdge * cosT, asphaltY, cz - sz * tEdge * sinT];
        };
        const aIn0 = ptArc(rAsphalt, th0, asphaltY);
        const aIn1 = ptArc(rAsphalt, th1, asphaltY);
        const aOut0 = rayEdgePt(th0);
        const aOut1 = rayEdgePt(th1);
        pushUpwardQuad(
          asphaltGeoms,
          aIn0,
          aOut0,
          aIn1,
          aOut1,
          (aIn0[0] - ix) / 14.0,
          (aIn0[2] - iz) / 14.0,
          (aOut1[0] - ix) / 14.0,
          (aOut1[2] - iz) / 14.0
        );

        // 2. Curved 0.32m Concrete Gutter Apron (`r = 3.28m -> 3.60m`)
        pushUpwardQuad(
          gutterGeoms,
          ptArc(rCurbToe, th0, gutterToeY),
          ptArc(rAsphalt, th0, asphaltY),
          ptArc(rCurbToe, th1, gutterToeY),
          ptArc(rAsphalt, th1, asphaltY),
          0.0,
          s * 0.25,
          1.0,
          (s + 1) * 0.25
        );

        // 3. Curved 3D Beveled Sierra Granite Curb (`r = 3.06m -> 3.28m`, +0.115m crown + 45° bevel)
        const rRiserTop = rCurbToe - 0.035;
        const rChamfer = rCurbToe - 0.075;
        const vC0 = s * 0.22;
        const vC1 = (s + 1) * 0.22;
        // Street riser face
        pushOutwardQuad(
          curbGeoms,
          ptArc(rCurbToe, th0, gutterToeY - 0.002),
          ptArc(rRiserTop, th0, curbTopY - 0.018),
          ptArc(rCurbToe, th1, gutterToeY - 0.002),
          ptArc(rRiserTop, th1, curbTopY - 0.018),
          0.0,
          vC0,
          0.35,
          vC1,
          outX,
          0.25,
          outZ
        );
        // 45-degree beveled top lip
        pushOutwardQuad(
          curbGeoms,
          ptArc(rRiserTop, th0, curbTopY - 0.018),
          ptArc(rChamfer, th0, curbTopY),
          ptArc(rRiserTop, th1, curbTopY - 0.018),
          ptArc(rChamfer, th1, curbTopY),
          0.35,
          vC0,
          0.55,
          vC1,
          outX * 0.6,
          0.8,
          outZ * 0.6
        );
        // Flat granite top crown
        pushUpwardQuad(
          curbGeoms,
          ptArc(rCurbBack, th0, curbTopY),
          ptArc(rChamfer, th0, curbTopY),
          ptArc(rCurbBack, th1, curbTopY),
          ptArc(rChamfer, th1, curbTopY),
          0.55,
          vC0,
          0.92,
          vC1
        );
        // Back step tucked cleanly into `+0.094m` concrete sidewalk
        pushOutwardQuad(
          curbGeoms,
          ptArc(rCurbBack, th0, swY - 0.004),
          ptArc(rCurbBack, th0, curbTopY),
          ptArc(rCurbBack, th1, swY - 0.004),
          ptArc(rCurbBack, th1, curbTopY),
          0.92,
          vC0,
          1.0,
          vC1,
          -outX,
          0.2,
          -outZ
        );

        // 4. Rounded Grooved Concrete Sidewalk Corner Fan (`r = 0.00m -> 3.06m` in 2 radial bands)
        const rMidSw = 1.53;
        const pCenter0 = ptArc(0.02, th0, swY);
        const pCenter1 = ptArc(0.02, th1, swY);
        const pMid0 = ptArc(rMidSw, th0, swY);
        const pMid1 = ptArc(rMidSw, th1, swY);
        const pSw0 = ptArc(rCurbBack, th0, swY);
        const pSw1 = ptArc(rCurbBack, th1, swY);

        for (const [q00, q10, q01, q11] of [
          [pCenter0, pMid0, pCenter1, pMid1],
          [pMid0, pSw0, pMid1, pSw1],
        ]) {
          // World-aligned 2.70m UV grid so 1.35m x 1.35m sidewalk control joints continue seamlessly around corners!
          const dxA = q10[0] - q00[0], dzA = q10[2] - q00[2];
          const dxB = q01[0] - q00[0], dzB = q01[2] - q00[2];
          const cross = dzA * dxB - dxA * dzB;
          const g = new THREE.BufferGeometry();
          const verts =
            cross >= 0
              ? [q00, q10, q01, q10, q11, q01]
              : [q00, q01, q10, q10, q01, q11];
          const posArr = new Float32Array(18);
          const uvArr = new Float32Array(12);
          for (let k = 0; k < 6; k++) {
            posArr[k * 3] = verts[k][0];
            posArr[k * 3 + 1] = verts[k][1];
            posArr[k * 3 + 2] = verts[k][2];
            uvArr[k * 2] = verts[k][0] / 2.70;
            uvArr[k * 2 + 1] = verts[k][2] / 2.70;
          }
          g.setAttribute("position", new THREE.BufferAttribute(posArr, 3));
          g.setAttribute("uv", new THREE.BufferAttribute(uvArr, 2));
          g.computeVertexNormals();
          sidewalkGeoms.push(g);
        }
      }

      // Outer corner lawn-edge grounding skirt (`r = 0.36m` back corner drop to `-0.14m`)
      for (const [ax, az, bx, bz, nx, nz] of [
        [cx - sx * 0.36, cz, cx, cz, 0, sz],
        [cx, cz, cx, cz - sz * 0.36, sx, 0],
      ]) {
        pushOutwardQuad(
          curbGeoms,
          [ax, skirtY, az],
          [ax, swY, az],
          [bx, skirtY, bz],
          [bx, swY, bz],
          0,
          0,
          0.3,
          0.3,
          nx,
          0.2,
          nz
        );
      }

      // 5. Yellow Tactile ADA Truncated-Dome Pad ON TOP of the Rounded Concrete Sidewalk (`y = +0.096m`)!
      //    Placed at `r = 2.28m < 3.06m` along the 45° corner bisector so 100% of all 4 pad corners
      //    sit strictly on concrete inside the 3D granite curb — NEVER floating out in the asphalt!
      if (hasAda) {
        const bisec = Math.PI * 0.25;
        const rAda = 2.28;
        const adaX = cx - sx * rAda * Math.cos(bisec);
        const adaZ = cz - sz * rAda * Math.sin(bisec);
        const adaYaw = Math.atan2(-sx, -sz);
        const ada = new THREE.BoxGeometry(1.16, 0.016, 0.70);
        ada.rotateY(adaYaw);
        ada.translate(adaX, swY + 0.008, adaZ);
        ADA_Geoms.push(ada);
      }
    }

    // --------------------------------------------------------------------------
    // C. Continental White Zebra Crosswalks & Crisp White Stop Bars (`0` Green Boxes!)
    // --------------------------------------------------------------------------
    const addCrosswalkBarSet = (cx, cz, alongX, roadWidthM, baseY, stopSideSign = 1) => {
      const halfSpan = roadWidthM * 0.44;
      const barCount = Math.max(5, Math.floor((halfSpan * 2.0) / 1.16));
      for (let b = 0; b < barCount; b++) {
        const lat = -halfSpan + ((b + 0.5) / barCount) * (halfSpan * 2.0);
        const bx = alongX ? cx : cx + lat;
        const bz = alongX ? cz + lat : cz;
        const bar = new THREE.PlaneGeometry(alongX ? 2.55 : 0.52, alongX ? 0.52 : 2.55);
        bar.rotateX(-Math.PI * 0.5);
        bar.translate(bx, baseY + 0.0012, bz);
        whiteStripeGeoms.push(bar);
      }
      // Crisp white 0.40m right-lane stop bar 2.35m upstream of crosswalk
      if (stopSideSign !== 0) {
        const laneSpan = roadWidthM * 0.41;
        const stopOffset = 2.35 * stopSideSign;
        const sx = alongX ? cx + stopOffset : cx + (alongX ? 0 : stopSideSign * (roadWidthM * 0.23));
        const sz = alongX ? cz - stopSideSign * (roadWidthM * 0.23) : cz + stopOffset;
        const stopG = new THREE.PlaneGeometry(alongX ? 0.40 : laneSpan, alongX ? laneSpan : 0.40);
        stopG.rotateX(-Math.PI * 0.5);
        stopG.translate(sx, baseY + 0.0012, sz);
        whiteStripeGeoms.push(stopG);
      }
    };

    // Signalized & major intersection crosswalks aligned cleanly between rounded curb tangent points
    const crosswalkSpecs = [
      // (0, 116) Gradient Driveway T-intersection
      { cx: -9.4, cz: 116.0, alongX: true, w: 10.5, stop: -1 },
      { cx: 9.4, cz: 116.0, alongX: true, w: 10.5, stop: 1 },
      { cx: 0.0, cz: 107.6, alongX: false, w: 14.0, stop: -1 },
      // (0, 76) Shoreline x Charleston 4-way
      { cx: -9.4, cz: 76.0, alongX: true, w: 14.0, stop: -1 },
      { cx: 9.4, cz: 76.0, alongX: true, w: 14.0, stop: 1 },
      { cx: 0.0, cz: 85.4, alongX: false, w: 14.0, stop: 1 },
      { cx: 0.0, cz: 66.6, alongX: false, w: 14.0, stop: -1 },
      // (-118, 76) West Ave / Android Plaza x Charleston
      { cx: -127.0, cz: 76.0, alongX: true, w: 14.0, stop: -1 },
      { cx: -109.0, cz: 76.0, alongX: true, w: 14.0, stop: 1 },
      { cx: -118.0, cz: 66.6, alongX: false, w: 13.0, stop: -1 },
      // (156, 76) Bay View Promenade x Charleston
      { cx: 145.6, cz: 76.0, alongX: true, w: 14.0, stop: -1 },
      // (0, -18) Shoreline x Amphitheatre 4-way
      { cx: -9.4, cz: -18.0, alongX: true, w: 14.0, stop: -1 },
      { cx: 9.4, cz: -18.0, alongX: true, w: 14.0, stop: 1 },
      { cx: 0.0, cz: -8.6, alongX: false, w: 14.0, stop: 1 },
      { cx: 0.0, cz: -27.4, alongX: false, w: 14.0, stop: -1 },
      // (-118, -18) West Ave x Amphitheatre North T-intersection (+ pedestrian gateway on South)
      { cx: -127.0, cz: -18.0, alongX: true, w: 14.0, stop: -1 },
      { cx: -109.0, cz: -18.0, alongX: true, w: 14.0, stop: 1 },
      { cx: -118.0, cz: -8.6, alongX: false, w: 13.0, stop: 1 },
      // (156, -18) Bay View Promenade x Amphitheatre
      { cx: 145.6, cz: -18.0, alongX: true, w: 14.0, stop: -1 },
      // (0, -86) Shoreline x North Bayshore Trail East L/T-intersection
      { cx: 9.4, cz: -86.0, alongX: true, w: 11.5, stop: 1 },
      { cx: 0.0, cz: -77.6, alongX: false, w: 14.0, stop: 1 },
      // (52, -86) Stevens Creek Bridge Crossing
      { cx: 44.0, cz: -86.0, alongX: true, w: 11.5, stop: -1 },
      { cx: 60.0, cz: -86.0, alongX: true, w: 11.5, stop: 1 },
    ];
    for (const cw of crosswalkSpecs) {
      const cy = getOpenWorldEarthHeight(cw.cx, cw.cz) + 0.016;
      addCrosswalkBarSet(cw.cx, cw.cz, cw.alongX, cw.w, cy, cw.stop);
    }

    // --------------------------------------------------------------------------
    // D. Recessed Curbside Pull-Out Bays (Asphalt Pocket + Recessed Curb & Walk)
    // --------------------------------------------------------------------------
    for (const b of CURBSIDE_PULLOUT_BAYS) {
      const totalHalf = b.bayHalfLen + 1.4; // 6.2m total curb cutout with tapered transitions
      const eY = getOpenWorldEarthHeight(b.x, b.z);
      const aY = eY + 0.016;
      const gY = eY + 0.013;
      const cY = eY + 0.115;
      const sY = eY + 0.094;

      if (b.axis === "x") {
        const zEdge = b.roadEdgeCoord;
        const zOuter = zEdge + b.sideSign * b.bayDepth;
        // Asphalt pull-out bay quad
        pushUpwardQuad(
          asphaltGeoms,
          [b.x - totalHalf, aY, zEdge],
          [b.x + totalHalf, aY, zEdge],
          [b.x - b.bayHalfLen, aY, zOuter],
          [b.x + b.bayHalfLen, aY, zOuter],
          0,
          0,
          (totalHalf * 2) / 14.0,
          b.bayDepth / 14.0
        );
        // White dashed pickup-bay boundary line along carriageway edge
        for (let dx = -b.bayHalfLen + 0.6; dx <= b.bayHalfLen - 0.6; dx += 1.6) {
          const dash = new THREE.PlaneGeometry(0.95, 0.12);
          dash.rotateX(-Math.PI * 0.5);
          dash.translate(b.x + dx, aY + 0.0012, zEdge + b.sideSign * 0.08);
          whiteStripeGeoms.push(dash);
        }
        // Recessed gutter + 3D granite curb + 2.30m passenger boarding sidewalk behind bay
        const ax = b.x - totalHalf;
        const bx = b.x + totalHalf;
        const off0 = b.sideSign * b.bayDepth;
        const offGut = b.sideSign * (b.bayDepth + 0.32);
        const offCurb = b.sideSign * (b.bayDepth + 0.54);
        const offSw = b.sideSign * (b.bayDepth + 2.74);
        gutterGeoms.push(makeRoadQuad(ax, zEdge, bx, zEdge, off0, offGut, aY, aY, 0.35, 0, gY, gY));
        curbGeoms.push(
          makeBeveledGraniteCurbSegment(ax, zEdge, bx, zEdge, offGut, offCurb, gY, gY, cY, cY, 0, true, true)
        );
        sidewalkGeoms.push(
          makeRoadQuad(ax, zEdge, bx, zEdge, offCurb, offSw, sY, sY, 1.0 / 2.70, ax)
        );
      } else {
        const xEdge = b.roadEdgeCoord;
        const xOuter = xEdge + b.sideSign * b.bayDepth;
        pushUpwardQuad(
          asphaltGeoms,
          [xEdge, aY, b.z - totalHalf],
          [xEdge, aY, b.z + totalHalf],
          [xOuter, aY, b.z - b.bayHalfLen],
          [xOuter, aY, b.z + b.bayHalfLen],
          0,
          0,
          (totalHalf * 2) / 14.0,
          b.bayDepth / 14.0
        );
        for (let dz = -b.bayHalfLen + 0.6; dz <= b.bayHalfLen - 0.6; dz += 1.6) {
          const dash = new THREE.PlaneGeometry(0.12, 0.95);
          dash.rotateX(-Math.PI * 0.5);
          dash.translate(xEdge + b.sideSign * 0.08, aY + 0.0012, b.z + dz);
          whiteStripeGeoms.push(dash);
        }
        // Along `(xEdge, z - totalHalf) -> (xEdge, z + totalHalf)`: `fx=0, fz=+1 => rx=-1, rz=0`, so `off = -sideSign * d`
        const az = b.z - totalHalf;
        const bz = b.z + totalHalf;
        const sDir = -b.sideSign;
        const off0 = sDir * b.bayDepth;
        const offGut = sDir * (b.bayDepth + 0.32);
        const offCurb = sDir * (b.bayDepth + 0.54);
        const offSw = sDir * (b.bayDepth + 2.74);
        gutterGeoms.push(makeRoadQuad(xEdge, az, xEdge, bz, off0, offGut, aY, aY, 0.35, 0, gY, gY));
        curbGeoms.push(
          makeBeveledGraniteCurbSegment(xEdge, az, xEdge, bz, offGut, offCurb, gY, gY, cY, cY, 0, true, true)
        );
        sidewalkGeoms.push(
          makeRoadQuad(xEdge, az, xEdge, bz, offCurb, offSw, sY, sY, 1.0 / 2.70, az)
        );
      }
    }

    // --------------------------------------------------------------------------
    // E. Road Markings, Paver Promenades (Strictly Clipped Outside Asphalt!),
    //    `1.0m`-Subdivided Gutters, Storm Drain Grates, 3D Granite Curbs & Grooved Sidewalks
    // --------------------------------------------------------------------------
    for (const r of CAMPUS_ROADS) {
      if (r.isArchedBridge) {
        this._buildStevensCreekArchedBridge(r);
        continue;
      }
      if (r.id === "googleplex_courtyard_walk") {
        // Built explicitly as the Stan T-Rex Circular Courtyard Promenade & Lawn Island below!
        continue;
      }

      if (r.surface === "pavers") {
        // Clip paver promenades strictly outside ALL asphalt carriageways (+0.36m flush granite header)
        // so 0.000m of tan paver EVER overlaps dark asphalt or white crosswalks!
        const dx = r.x2 - r.x1;
        const dz = r.z2 - r.z1;
        const len = Math.hypot(dx, dz) || 1.0;
        const halfW = r.widthM * 0.5;
        const stepSize = 1.0;
        const steps = Math.max(8, Math.ceil(len / stepSize));

        let prevInsideAsphalt = false;
        for (let s = 0; s < steps; s++) {
          const s0 = (s / steps) * len;
          const s1 = ((s + 1) / steps) * len;
          const u0 = s / steps;
          const u1 = (s + 1) / steps;
          const ax = r.x1 + dx * u0;
          const az = r.z1 + dz * u0;
          const bx = r.x1 + dx * u1;
          const bz = r.z1 + dz * u1;

          // Skip `shoreline_meadow_path` flat-cross-slope strips once inside the terrain-conforming `R = 25.2m`
          // Shoreline Concourse disc (`(14, -188)`) & circular Docking Medallion (`(14, -178)`) so zero terracotta
          // triangles ever poke through the circular Shoreline granite collar (`[VETO-RTR-01]`).
          if (
            r.id === "shoreline_meadow_path" &&
            (Math.hypot((ax + bx) * 0.5 - 14.0, (az + bz) * 0.5 - -178.0) < 7.5 ||
              Math.hypot((ax + bx) * 0.5 - 14.0, (az + bz) * 0.5 - -188.0) < 24.2)
          ) {
            continue;
          }

          // Reject any 1.0m paver segment if ANY of its 4 corners or midpoint approaches asphalt (`< 0.36m`)
          const rx = -(dz / len);
          const rz = dx / len;
          const minClear = Math.min(
            signedAsphaltClearance(ax + rx * -halfW, az + rz * -halfW),
            signedAsphaltClearance(ax + rx * halfW, az + rz * halfW),
            signedAsphaltClearance(bx + rx * -halfW, bz + rz * -halfW),
            signedAsphaltClearance(bx + rx * halfW, bz + rz * halfW),
            signedAsphaltClearance((ax + bx) * 0.5, (az + bz) * 0.5)
          );

          if (minClear < 0.36) {
            if (!prevInsideAsphalt && minClear > -0.8) {
              // Crisp flush Sierra granite transition header at the exact promenade/asphalt boundary
              const hy = getOpenWorldEarthHeight(ax, az) + 0.018;
              curbGeoms.push(makeRoadQuad(ax, az, bx, bz, -halfW, halfW, hy, hy, 0.35, s0));
            }
            prevInsideAsphalt = true;
            continue;
          }
          prevInsideAsphalt = false;

          const y0 = getOpenWorldEarthHeight(ax, az) + 0.016;
          const y1 = getOpenWorldEarthHeight(bx, bz) + 0.016;
          paverGeoms.push(makeRoadQuad(ax, az, bx, bz, -halfW, halfW, y0, y1, 0.22, s0));

          // Crisp white pedestrian/cyclist lane divider stripe along Bay View Waterfront Promenade (ZERO green strips!)
          if (r.id === "bay_view_promenade") {
            whiteStripeGeoms.push(
              makeRoadQuad(ax, az, bx, bz, -halfW + 2.40, -halfW + 2.54, y0 + 0.0012, y1 + 0.0012, 0.2, s0)
            );
          }
        }

        // Low chiseled Sierra granite seawall coping along east pond edge of Bay View Promenade (`x = 164.35`)
        if (r.id === "bay_view_promenade") {
          const wallCuts = [
            [76.0 - 7.4, 76.0 + 7.4],
            [-18.0 - 7.4, -18.0 + 7.4],
            [-86.0 - 6.2, -86.0 + 6.2],
          ];
          const zSpans = subtract1DIntervals(Math.min(r.z1, r.z2), Math.max(r.z1, r.z2), wallCuts);
          for (const [za, zb] of zSpans) {
            const segL = zb - za;
            const wall = new THREE.BoxGeometry(0.55, 0.36, segL);
            wall.translate(r.x1 + halfW + 0.35, 0.18, (za + zb) * 0.5);
            curbGeoms.push(wall);
          }
        }
        continue;
      }

      // Match active asphalt segment bounds (`shoreline_blvd` ends at `z=121.25`, `west_campus_ave` ends at `z=83.0`)
      const activeSeg = ACTIVE_ASPHALT_SEGMENTS.find((s) => s.id === r.id);
      if (!activeSeg) continue;

      const x1 = activeSeg.x1;
      const z1 = activeSeg.z1;
      const x2 = activeSeg.x2;
      const z2 = activeSeg.z2;
      const dx = x2 - x1;
      const dz = z2 - z1;
      const len = Math.hypot(dx, dz) || 1.0;
      const fx = dx / len;
      const fz = dz / len;
      const rx = -fz;
      const rz = fx;
      const halfW = activeSeg.halfW;
      const bikeW = Math.min(1.65, (halfW * 2.0) * 0.155);
      const sidewalkW = 2.70; // Exact 2 x 1.35m grooved concrete slabs!

      // 1. Thermoplastic Double-Yellow Centerlines & Crisp White Bike/Shoulder Stripes (ZERO green road strips!)
      //    Analytically clipped via `subtract1DIntervals(0, len, paintCuts)` against ALL intersections, hubs,
      //    crosswalks, and upstream `2.35m` stop-bars (+ `0.25m` clean asphalt gap) so longitudinal lines NEVER cross stop-bars!
      const isHorizontal = Math.abs(dz) < 0.01;
      const toRoadS = (wx, wz) => (wx - x1) * fx + (wz - z1) * fz;
      const paintCuts = [];
      const addPaintCutS = (sa, sb) => {
        let a = Math.min(sa, sb);
        let b = Math.max(sa, sb);
        if (a < 2.5) a = 0.0;
        if (b > len - 2.5) b = len;
        if (b > a) paintCuts.push([a, b]);
      };

      const roadStopCentersS = [];
      for (const it of CAMPUS_INTERSECTIONS) {
        const perpD = Math.abs(isHorizontal ? it.z - z1 : it.x - x1);
        if (perpD < halfW + 2.0) {
          const sIt = toRoadS(it.x, it.z);
          roadStopCentersS.push(sIt);
          addPaintCutS(sIt - (it.radiusM + 1.8), sIt + (it.radiusM + 1.8));
          if (sIt >= -2.0 && sIt <= 16.0) addPaintCutS(0.0, sIt + (it.radiusM + 1.8));
          if (sIt >= len - 16.0 && sIt <= len + 2.0) addPaintCutS(sIt - (it.radiusM + 1.8), len);
        }
      }
      for (const [hx, hz, hr] of [
        [156.0, 76.0, 10.6],
        [156.0, -18.0, 10.6],
        [156.0, -86.0, 9.8],
        [52.0, -86.0, 9.6],
        [-118.0, -50.0, 6.4],
      ]) {
        const perpD = Math.abs(isHorizontal ? hz - z1 : hx - x1);
        if (perpD < halfW + 2.0) {
          const sHub = toRoadS(hx, hz);
          roadStopCentersS.push(sHub);
          addPaintCutS(sHub - hr, sHub + hr);
          if (sHub >= -2.0 && sHub <= 14.0) addPaintCutS(0.0, sHub + hr);
          if (sHub >= len - 14.0 && sHub <= len + 2.0) addPaintCutS(sHub - hr, len);
        }
      }
      for (const cw of crosswalkSpecs) {
        if (cw.alongX !== isHorizontal) continue;
        const perpD = Math.abs(isHorizontal ? cw.cz - z1 : cw.cx - x1);
        if (perpD > 1.5) continue;
        const cCoord = isHorizontal ? cw.cx : cw.cz;
        // Stop-bar (`0.40m` wide) is at `cCoord + 2.35 * cw.stop` (outer edge `2.55m`); leave `0.25m` clean gap (`2.80m`)!
        const wMin = cw.stop < 0 ? cCoord - 2.80 : cCoord - 2.00;
        const wMax = cw.stop > 0 ? cCoord + 2.80 : cCoord + 2.00;
        const sA = isHorizontal ? toRoadS(wMin, z1) : toRoadS(x1, wMin);
        const sB = isHorizontal ? toRoadS(wMax, z1) : toRoadS(x1, wMax);
        let cutMin = Math.min(sA, sB);
        let cutMax = Math.max(sA, sB);
        const sCw = 0.5 * (sA + sB);
        for (let cIdx = 0; cIdx < roadStopCentersS.length; cIdx++) {
          const sNear = roadStopCentersS[cIdx];
          if (Math.abs(sNear - sCw) < 16.5) {
            cutMin = Math.min(cutMin, sNear);
            cutMax = Math.max(cutMax, sNear);
          }
        }
        addPaintCutS(cutMin, cutMax);
      }

      const paintSpans = subtract1DIntervals(0.0, len, paintCuts);
      const markStep = 2.0;
      for (const [spanA, spanB] of paintSpans) {
        const spanLen = spanB - spanA;
        if (spanLen < 0.25) continue;
        const markCount = Math.max(1, Math.ceil(spanLen / markStep));
        for (let m = 0; m < markCount; m++) {
          const s0 = spanA + (m / markCount) * spanLen;
          const s1 = spanA + ((m + 1) / markCount) * spanLen;
          const sm = 0.5 * (s0 + s1);
          const mx = x1 + fx * sm;
          const mz = z1 + fz * sm;
          const ax = x1 + fx * s0;
          const az = z1 + fz * s0;
          const bx = x1 + fx * s1;
          const bz = z1 + fz * s1;
          // Road paint strictly <= +0.0015m above +0.016m asphalt (`0.016 + 0.0012 = 0.0172m`) with polygonOffset!
          const markY = getOpenWorldEarthHeight(mx, mz) + 0.0172;

          // Aged thermoplastic double-yellow centerline
          yellowStripeGeoms.push(makeRoadQuad(ax, az, bx, bz, -0.17, -0.05, markY, markY, 0.25, s0));
          yellowStripeGeoms.push(makeRoadQuad(ax, az, bx, bz, 0.05, 0.17, markY, markY, 0.25, s0));

          // Crisp white bike-lane buffer stripe + subtle outer shoulder fog stripe (pure dark asphalt between!)
          for (const side of [-1, 1]) {
            const bikeLine = side * (halfW - bikeW - 0.24);
            whiteStripeGeoms.push(
              makeRoadQuad(ax, az, bx, bz, bikeLine, bikeLine + side * 0.12, markY, markY, 0.25, s0)
            );
            const fogLine = side * (halfW - 0.18);
            whiteStripeGeoms.push(
              makeRoadQuad(ax, az, bx, bz, fogLine - side * 0.08, fogLine, markY, markY, 0.25, s0)
            );
          }
        }
      }

      // 2. Analytically Clipped + `1.0m`-Subdivided Concrete Gutters, Storm Grates, 3D Granite Curbs & Sidewalks
      for (const side of [-1, 1]) {
        // World side sign along perpendicular axis (`+Z/-Z` for horizontal road, `+X/-X` for vertical road)
        const perpWorldX = rx * side;
        const perpWorldZ = rz * side;
        const cuts = [];

        // Project a world `(wx, wz)` point onto road parameter `s in [0, len]`
        const toS = (wx, wz) => (wx - x1) * fx + (wz - z1) * fz;

        // Cut out exact `[ix/iz ± (halfW_perp + 3.60m)]` spans at every curved corner fillet on this side!
        for (const cf of INTERSECTION_CORNER_FILLETS) {
          if (isHorizontal && Math.abs(cf.iz - z1) < 0.1 && Math.sign(perpWorldZ) === cf.sz) {
            const sCenter = toS(cf.ix, z1);
            const cutHalf = cf.halfWV + cf.rFillet;
            cuts.push([cf.sx < 0 ? sCenter - cutHalf : sCenter - cf.halfWV, cf.sx > 0 ? sCenter + cutHalf : sCenter + cf.halfWV]);
          } else if (!isHorizontal && Math.abs(cf.ix - x1) < 0.1 && Math.sign(perpWorldX) === cf.sx) {
            const sCenter = toS(x1, cf.iz);
            const cutHalf = cf.halfWH + cf.rFillet;
            cuts.push([cf.sz < 0 ? sCenter - cutHalf : sCenter - cf.halfWH, cf.sz > 0 ? sCenter + cutHalf : sCenter + cf.halfWH]);
          }
        }

        // Cut out Bay View Waterfront Promenade (`x = 156, halfW = 8.0`) & Stevens Creek Bridge (`(52, -86)`)
        if (isHorizontal) {
          const sProm = toS(156.0, z1);
          cuts.push([sProm - 8.2, sProm + 8.2]);
          if (Math.abs(z1 - -86.0) < 0.1 && perpWorldZ < 0) {
            const sBr = toS(52.0, z1);
            cuts.push([sBr - 5.2, sBr + 5.2]);
          }
          // Open Gradient Canopy Forecourt threshold (`x in [-16.0, +16.0]`) on +Z side of `gradient_driveway`
          if (r.id === "gradient_driveway" && perpWorldZ > 0) {
            cuts.push([toS(-16.0, z1), toS(16.0, z1)]);
          }
          // Open Googleplex Stan T-Rex Courtyard pedestrian gateway (`x in [-123.6, -112.4]`) on -Z side of `amphitheatre_pkwy`
          if (r.id === "amphitheatre_pkwy" && perpWorldZ < 0) {
            cuts.push([toS(-123.6, z1), toS(-112.4, z1)]);
          }
        }

        // Cut out recessed curbside pull-out bays (`±6.2m`) on matching road & side
        for (const wb of CURBSIDE_PULLOUT_BAYS) {
          if (wb.roadId !== r.id) continue;
          const matchSide = isHorizontal
            ? Math.sign(perpWorldZ) === wb.sideSign
            : Math.sign(perpWorldX) === wb.sideSign;
          if (matchSide) {
            const sBay = toS(wb.x, wb.z);
            cuts.push([sBay - (wb.bayHalfLen + 1.4), sBay + (wb.bayHalfLen + 1.4)]);
          }
        }

        const cleanSpans = subtract1DIntervals(0.0, len, cuts);
        for (const [spanA, spanB] of cleanSpans) {
          const spanLen = spanB - spanA;
          const subCount = Math.max(1, Math.ceil(spanLen / 1.0)); // Strict <= 1.0m subdivision!
          for (let k = 0; k < subCount; k++) {
            const s0 = spanA + (k / subCount) * spanLen;
            const s1 = spanA + ((k + 1) / subCount) * spanLen;
            const ax = x1 + fx * s0;
            const az = z1 + fz * s0;
            const bx = x1 + fx * s1;
            const bz = z1 + fz * s1;
            const mx = 0.5 * (ax + bx);
            const mz = 0.5 * (az + bz);

            const gutIn = side * halfW;
            const gutOut = side * (halfW + 0.32);
            const curbOut = side * (halfW + 0.54);
            const swOut = side * (halfW + 0.54 + sidewalkW);
            const skirtOut = side * (halfW + 0.68 + sidewalkW);

            // Strict 4-corner `signedCarriagewayClearance >= 0.05m` assertion on every curb/sidewalk quad!
            const c00 = signedCarriagewayClearance(ax + rx * gutOut, az + rz * gutOut);
            const c10 = signedCarriagewayClearance(ax + rx * swOut, az + rz * swOut);
            const c01 = signedCarriagewayClearance(bx + rx * gutOut, bz + rz * gutOut);
            const c11 = signedCarriagewayClearance(bx + rx * swOut, bz + rz * swOut);
            if (Math.min(c00, c10, c01, c11) < 0.05) continue;

            // Keep Gradient Gym interior clear
            const testSwX = mx + rx * (side * (halfW + 1.8));
            const testSwZ = mz + rz * (side * (halfW + 1.8));
            if (Math.abs(testSwX) <= 13.5 && testSwZ >= 130.5 && testSwZ <= 153.0) continue;

            const e0 = getOpenWorldEarthHeight(ax, az);
            const e1 = getOpenWorldEarthHeight(bx, bz);
            const aY0 = e0 + 0.016, aY1 = e1 + 0.016;
            const gY0 = e0 + 0.013, gY1 = e1 + 0.013;
            const cY0 = e0 + 0.115, cY1 = e1 + 0.115;
            const sY0 = e0 + 0.094, sY1 = e1 + 0.094;
            const skY0 = e0 - 0.14, skY1 = e1 - 0.14;

            // 1. 0.32m Concrete Gutter Pan
            gutterGeoms.push(
              makeRoadQuad(ax, az, bx, bz, gutIn, gutOut, aY0, aY1, 0.35, s0, gY0, gY1)
            );

            // 2. 3D Beveled Sierra Granite Curb (`+0.115m` crown + 45° chamfer)
            curbGeoms.push(
              makeBeveledGraniteCurbSegment(
                ax,
                az,
                bx,
                bz,
                gutOut,
                curbOut,
                gY0 - 0.002,
                gY1 - 0.002,
                cY0,
                cY1,
                s0,
                k === 0,
                k === subCount - 1
              )
            );

            // 3. 2.70m Grooved Concrete Sidewalk (`1.35m x 1.35m` continuous slab UV grid!)
            sidewalkGeoms.push(
              makeRoadQuad(ax, az, bx, bz, curbOut, swOut, sY0, sY1, 1.0 / 2.70, s0)
            );

            // 4. Outer turf-edge sidewalk foundation skirt (zero floating slab edge!)
            curbGeoms.push(
              makeRoadQuad(ax, az, bx, bz, swOut, skirtOut, sY0, sY1, 0.35, s0, skY0, skY1)
            );

            // 5. Recessed Slotted Cast-Iron Storm Drain Grates every ~28m in the gutter pan!
            if (
              k > 2 &&
              k < subCount - 3 &&
              Math.floor(s0) % 28 === 0 &&
              Math.floor(s0) !== Math.floor(s0 - (s1 - s0))
            ) {
              const grateG = new THREE.PlaneGeometry(0.28, 0.56);
              grateG.rotateX(-Math.PI * 0.5);
              grateG.rotateY(Math.atan2(fx, fz));
              grateG.translate(
                mx + rx * (side * (halfW + 0.16)),
                0.5 * (gY0 + gY1) + 0.0025,
                mz + rz * (side * (halfW + 0.16))
              );
              grateGeoms.push(grateG);
            }
          }
        }
      }
    }


    // --------------------------------------------------------------------------
    // G. Strictly Clipped Campus Plazas & Roundabout Collars (`0.000m` Road Overlap!)
    //    V6 FIX (#60 Item 2): Removed the overwide `1B` terrace slab (`x in [+1.05, +15.8], z in [87.2, 106.2]`)
    //    so `shoreline_blvd` (`x in [-7.0m, +7.0m]`) is 100% SYMMETRIC full-width dark-charcoal asphalt with
    //    dead-center double yellow lines (`x = 0.0m`), symmetric bike lanes, and symmetric granite curbs (`|x| = 7.32..7.54m`)!
    // --------------------------------------------------------------------------
    // 1. Google Visitor Experience / Gradient Canopy Interlocking Hexagonal Granite Paver Forecourt (`x in [-24, +28], z in [121.60, 127.00]`)
    //    Starts strictly north of `gradient_driveway` (`z = 121.25`) behind a `0.35m` flush Sierra granite header,
    //    and tapers seamlessly (`0.016m -> 0.003m`) into `Gradient_Canopy_Building_V6`'s `Visitor_Forecourt_HexPavers_Planter_Masts_V6` (`z >= 126.83`, `minY = 0.000m`)!
    curbGeoms.push(makeRoadQuad(-24.0, 121.425, 28.0, 121.425, -0.175, 0.175, 0.022, 0.022, 0.45));
    {
      const hexForecourtGeoms = [];
      const forecourtSteps = 6;
      for (let s = 0; s < forecourtSteps; s++) {
        const uA = s / forecourtSteps;
        const uB = (s + 1) / forecourtSteps;
        const zA = 121.60 + uA * (127.00 - 121.60);
        const zB = 121.60 + uB * (127.00 - 121.60);
        const yA = uA > 0.80 ? THREE.MathUtils.lerp(0.016, 0.003, (uA - 0.80) / 0.20) : 0.016;
        const yB = uB > 0.80 ? THREE.MathUtils.lerp(0.016, 0.003, (uB - 0.80) / 0.20) : 0.016;
        hexForecourtGeoms.push(
          makeRoadQuad(2.0, zA, 2.0, zB, -26.0, 26.0, yA, yB, 1.0 / 2.20, zA)
        );
      }
      const mergedHexForecourt = mergeCampusStaticGeometries(hexForecourtGeoms);
      if (mergedHexForecourt) {
        const hexPaverMat =
          this.materials.visitorHexPavers || createVisitorHexPaversMaterialFallback();
        const hexForecourtMesh = new THREE.Mesh(mergedHexForecourt, hexPaverMat);
        hexForecourtMesh.name = "Visitor_Experience_Hex_Paver_Forecourt_V6";
        hexForecourtMesh.receiveShadow = true;
        hexForecourtMesh.castShadow = false;
        hexForecourtMesh.matrixAutoUpdate = false;
        hexForecourtMesh.updateMatrix();
        this.root.add(hexForecourtMesh);
      }
    }
    // 1C. Bay View Promenade Waymo Drop-Off Beveled Sierra Granite Curb Divider (`x = 159.35, z in [37.0, 46.8]`)
    {
      const bvY0 = getOpenWorldEarthHeight(159.35, 37.0) + 0.018;
      const bvY1 = getOpenWorldEarthHeight(159.35, 46.8) + 0.018;
      curbGeoms.push(
        makeBeveledGraniteCurbSegment(
          159.35,
          37.0,
          159.35,
          46.8,
          -0.24,
          0.24,
          bvY0 - 0.01,
          bvY1 - 0.01,
          bvY0 + 0.105,
          bvY1 + 0.105,
          0.0,
          true,
          true
        )
      );
    }

    // 2. Android Lawn Sculpture Plaza (`(-118, 96)`, full unclipped 360° `R = 8.95m` sandstone disc + straight gateway apron -> ZERO polar sawtooth!)
    //    Flush Sierra granite threshold header across `z in [86.60, 86.95]` between curved curb returns:
    curbGeoms.push(makeRoadQuad(-124.5, 86.775, -111.5, 86.775, -0.175, 0.175, 0.020, 0.020, 0.45));
    paverGeoms.push(
      makeRoadQuad(-118.0, 86.95, -118.0, 93.2, -4.6, 4.6, 0.016, 0.016, 0.25, 0.0)
    );
    // Beveled Sierra granite side curbs flanking the straight `x in [-122.6, -113.4]` South gateway apron (`z = 86.95 -> 88.35`)
    for (const sideS of [-1, 1]) {
      const gx = -118.0 + sideS * 4.6;
      const bY0 = getOpenWorldEarthHeight(gx, 86.95);
      const bY1 = getOpenWorldEarthHeight(gx, 88.35);
      curbGeoms.push(
        makeBeveledGraniteCurbSegment(
          gx,
          86.95,
          gx,
          88.35,
          0.0,
          sideS * 0.42,
          bY0 - 0.04,
          bY1 - 0.04,
          bY0 + 0.036,
          bY1 + 0.036,
          0.0,
          true,
          false
        )
      );
    }
    paverGeoms.push(
      makeTerrainConformingDisc(
        -118.0,
        96.0,
        8.95,
        6,
        64,
        0.016,
        0.24,
        0.0,
        null,
        null
      )
    );
    // Solid 3D chamfered Sierra granite garden curb collar (`R = 8.98m`, open along South approach walkway) grounding Android Plaza flush into turf!
    {
      const androidCollar = new THREE.Mesh(
        buildGraniteCurbCollarRingGeometry(THREE, -118.0, 96.0, 8.98, {
          heightAt: getOpenWorldEarthHeight,
          startThetaRad: -Math.PI * 0.5 + 0.50,
          arcThetaRad: Math.PI * 2.0 - 1.00,
          curbWidthM: 0.34,
          curbHeightM: 0.082,
        }),
        this.materials.graniteCurb || this.materials.concreteCurb
      );
      androidCollar.name = "V5_Android_Lawn_Granite_Collar";
      androidCollar.receiveShadow = true;
      androidCollar.castShadow = false;
      androidCollar.matrixAutoUpdate = false;
      androidCollar.updateMatrix();
      this.root.add(androidCollar);
    }

    // 3. Pedestrian Googleplex Stan T-Rex Courtyard (`x = -118, z = -25 .. -72.5`):
    //    - Flush Sierra granite gateway curb header + architectural pedestrian bollards at `z = -25.0`
    //    - Warm herringbone terracotta/sandstone paver promenade (`z = -25.45 .. -35.8`) splitting into
    //      a circular courtyard ring walk (`R_inner = 13.6m, R_outer = 18.8m` centered at `(-118, -50)`),
    //    - Lush green fescue turf & garden lawn island (`R = 13.6m` around `(-118, -50)`) so Stan T-Rex
    //      AND 100% of all 54 pink lawn flamingos stand on lush green grass + 3D grass blades!
    {
      const gwY = getOpenWorldEarthHeight(-118.0, -25.2) + 0.022;
      // Flush Sierra granite gateway header across `x in [-123.6, -112.4], z in [-25.00, -25.45]`
      curbGeoms.push(
        makeRoadQuad(-123.6, -25.225, -112.4, -25.225, -0.225, 0.225, gwY, gwY, 0.45)
      );
      // Yellow tactile ADA truncated-dome warning pad across gateway center
      const gwAda = new THREE.BoxGeometry(3.2, 0.016, 0.66);
      gwAda.translate(-118.0, gwY + 0.008, -25.85);
      ADA_Geoms.push(gwAda);

      // 4 Architectural Sierra-granite & brushed-steel gateway bollards at `z = -25.25` (leaving 3.2m center bikeway clear!)
      const bollardSteelGeoms = [];
      for (const bx of [-122.4, -119.6, -116.4, -113.6]) {
        const by = getOpenWorldEarthHeight(bx, -25.25);
        const gBase = new THREE.CylinderGeometry(0.18, 0.21, 0.24, 14);
        gBase.translate(bx, by + 0.12, -25.25);
        curbGeoms.push(gBase);
        const sPost = new THREE.CylinderGeometry(0.115, 0.125, 0.72, 14);
        sPost.translate(bx, by + 0.58, -25.25);
        const sCap = new THREE.SphereGeometry(0.115, 14, 8, 0, Math.PI * 2, 0, Math.PI * 0.5);
        sCap.translate(bx, by + 0.94, -25.25);
        bollardSteelGeoms.push(sPost, sCap);
      }
      if (bollardSteelGeoms.length > 0) {
        const bollardMesh = new THREE.Mesh(
          mergeCampusStaticGeometries(bollardSteelGeoms),
          this.materials.steelMullion
        );
        bollardMesh.castShadow = true;
        bollardMesh.receiveShadow = true;
        bollardMesh.matrixAutoUpdate = false;
        bollardMesh.updateMatrix();
        this.root.add(bollardMesh);
      }

      // North herringbone terracotta/sandstone paver promenade (`z = -25.45 -> -35.80`)
      const promSteps = 8;
      for (let s = 0; s < promSteps; s++) {
        const zA = -25.45 + (s / promSteps) * (-35.80 - -25.45);
        const zB = -25.45 + ((s + 1) / promSteps) * (-35.80 - -25.45);
        const yA = getOpenWorldEarthHeight(-118.0, zA) + 0.016;
        const yB = getOpenWorldEarthHeight(-118.0, zB) + 0.016;
        paverGeoms.push(
          makeRoadQuad(-118.0, zA, -118.0, zB, -5.4, 5.4, yA, yB, 0.24, Math.abs(zA + 25.45))
        );
      }

      // Circular Courtyard Paver Walk (`R_inner = 13.6m, R_outer = 18.8m` centered at `(-118.0, -50.0)`)
      paverGeoms.push(
        makeTerrainConformingDisc(
          -118.0,
          -50.0,
          18.8,
          10,
          64,
          0.016,
          0.24,
          13.6,
          null,
          (wx, wz) => wz <= -28.4 && signedAsphaltClearance(wx, wz) >= 3.35
        )
      );

      // South Courtyard Garden Paver Terrace (`z = -64.2 -> -72.5`)
      for (let s = 0; s < 6; s++) {
        const zA = -64.2 + (s / 6) * (-72.5 - -64.2);
        const zB = -64.2 + ((s + 1) / 6) * (-72.5 - -64.2);
        const yA = getOpenWorldEarthHeight(-118.0, zA) + 0.016;
        const yB = getOpenWorldEarthHeight(-118.0, zB) + 0.016;
        paverGeoms.push(
          makeRoadQuad(-118.0, zA, -118.0, zB, -4.8, 4.8, yA, yB, 0.24, Math.abs(zA + 64.2))
        );
      }

      // Low flush Sierra granite garden edging collar (`R = 13.52m..13.78m`) framing the lush `R = 13.6m` Flamingo Lawn Island
      const lawnEdgeSegs = 56;
      for (let i = 0; i < lawnEdgeSegs; i++) {
        const a0 = (i / lawnEdgeSegs) * Math.PI * 2.0;
        const a1 = ((i + 1) / lawnEdgeSegs) * Math.PI * 2.0;
        const ax = -118.0 + Math.cos(a0) * 13.65;
        const az = -50.0 + Math.sin(a0) * 13.65;
        const bx = -118.0 + Math.cos(a1) * 13.65;
        const bz = -50.0 + Math.sin(a1) * 13.65;
        const e0 = getOpenWorldEarthHeight(ax, az);
        const e1 = getOpenWorldEarthHeight(bx, bz);
        curbGeoms.push(
          makeRoadQuad(ax, az, bx, bz, -0.14, 0.14, e0 + 0.024, e1 + 0.024, 0.45, i * 0.6)
        );
      }
      // NOTE: Zero circular granite collar around `(-118, -50)` in V5 so lush lawn grows flush up to Stan's `2.26m x 4.12m` rectangular Sierra granite monument plinth!
    }

    // 4. Shoreline Amphitheatre Concourse (`(14, -188)`), recessed strictly inside `r < 6.36m` underneath the `6.14..6.50m` granite collar!
    paverGeoms.push(
      makeTerrainConformingDisc(14.0, -188.0, 25.2, 56, 112, 0.016, 0.24, 0.0, {
        x: 14.0,
        z: -178.0,
        r: 6.36,
      })
    );

    const addStaticBatch = (geoms, mat, receiveShadow = true, castShadow = false) => {
      const merged = mergeCampusStaticGeometries(geoms);
      if (!merged) return;
      merged.computeBoundingSphere();
      const mesh = new THREE.Mesh(merged, mat);
      mesh.receiveShadow = receiveShadow;
      mesh.castShadow = castShadow;
      mesh.matrixAutoUpdate = false;
      mesh.updateMatrix();
      this.root.add(mesh);
    };

    const prepRoadPaintMat = (m) => {
      if (!m) return m;
      const cm = m.clone();
      cm.polygonOffset = true;
      cm.polygonOffsetFactor = -2;
      cm.polygonOffsetUnits = -2;
      return cm;
    };

    addStaticBatch(asphaltGeoms, this.materials.roadAsphalt || this.materials.asphaltRoad, true, false);
    addStaticBatch(gutterGeoms, this.materials.concreteGutter || this.materials.concreteSidewalk, true, false);
    addStaticBatch(grateGeoms, this.materials.stormGrateIron || this.materials.steelMullion, false, false);
    addStaticBatch(whiteStripeGeoms, prepRoadPaintMat(this.materials.roadStripeWhite), false, false);
    addStaticBatch(yellowStripeGeoms, prepRoadPaintMat(this.materials.roadStripeYellow), false, false);
    addStaticBatch(sidewalkGeoms, this.materials.concreteSidewalk || this.materials.concretePath, true, false);
    addStaticBatch(curbGeoms, this.materials.graniteCurb || this.materials.concreteCurb, true, true);
    addStaticBatch(paverGeoms, this.materials.brickPath, true, false);
    addStaticBatch(ADA_Geoms, this.materials.tactileAdaYellow, true, false);
  }

  /**
   * Sculpted Cambered Corten-Steel & Timber Warren Truss Bridge (`(52, -86) -> (18, -158)`)
   * matching `getStevensCreekBridgeParam` (`1.18 * sin^2(pi * u)`) to `0.00mm`!
   */
  _buildStevensCreekArchedBridge(r) {
    const bridgeGroup = new THREE.Group();
    const dx = r.x2 - r.x1;
    const dz = r.z2 - r.z1;
    const len = Math.hypot(dx, dz);
    const fx = dx / len;
    const fz = dz / len;
    const rx = -fz;
    const rz = fx;
    const halfW = r.widthM * 0.5;
    const segs = 40;

    const plankGeoms = [];
    const cortenGeoms = [];
    const railGeoms = [];
    const concreteGeoms = [];

    // Cambered timber plank deck (`1.18 * sin^2(pi * u)`)
    for (let i = 0; i < segs; i++) {
      const u0 = i / segs;
      const u1 = (i + 1) / segs;
      const x0 = r.x1 + dx * u0;
      const z0 = r.z1 + dz * u0;
      const x1 = r.x1 + dx * u1;
      const z1 = r.z1 + dz * u1;
      const y0 = r.archHeightM * Math.pow(Math.sin(Math.PI * u0), 2) + 0.004;
      const y1 = r.archHeightM * Math.pow(Math.sin(Math.PI * u1), 2) + 0.004;
      plankGeoms.push(makeRoadQuad(x0, z0, x1, z1, -halfW, halfW, y0, y1, 0.55));
    }

    // Twin Corten-Steel Parabolic Warren Truss Side Girders + Cross-Beams + Cyclist Safety Rails
    const yawSeg = Math.atan2(fx, fz);
    for (const side of [-1, 1]) {
      const lat = side * (halfW + 0.24);
      const lowerPts = [];
      const upperPts = [];
      const handPts = [];
      const trussNodes = 16;

      for (let k = 0; k <= trussNodes; k++) {
        const u = k / trussNodes;
        const bx = r.x1 + dx * u + rx * lat;
        const bz = r.z1 + dz * u + rz * lat;
        const deckY = r.archHeightM * Math.pow(Math.sin(Math.PI * u), 2);
        const archH = 1.35 + 1.45 * Math.sin(Math.PI * u);

        lowerPts.push(new THREE.Vector3(bx, deckY - 0.12, bz));
        upperPts.push(new THREE.Vector3(bx, deckY + archH, bz));
        handPts.push(new THREE.Vector3(r.x1 + dx * u + rx * (side * (halfW - 0.08)), deckY + 1.05, r.z1 + dz * u + rz * (side * (halfW - 0.08))));

        // Vertical post
        const postG = new THREE.BoxGeometry(0.14, archH + 0.22, 0.14);
        postG.rotateY(yawSeg);
        postG.translate(bx, deckY + archH * 0.5 - 0.06, bz);
        cortenGeoms.push(postG);

        // Transverse under-deck floor beam (once from side = 1)
        if (side === 1) {
          const beamG = new THREE.BoxGeometry(r.widthM + 0.65, 0.22, 0.18);
          beamG.rotateY(yawSeg);
          beamG.translate(r.x1 + dx * u, deckY - 0.14, r.z1 + dz * u);
          cortenGeoms.push(beamG);
        }
      }

      // Warren diagonal truss struts
      for (let k = 0; k < trussNodes; k++) {
        const pA = k % 2 === 0 ? lowerPts[k] : upperPts[k];
        const pB = k % 2 === 0 ? upperPts[k + 1] : lowerPts[k + 1];
        cortenGeoms.push(
          new THREE.TubeGeometry(new THREE.LineCurve3(pA, pB), 2, 0.065, 6, false)
        );
      }

      cortenGeoms.push(
        new THREE.TubeGeometry(new THREE.CatmullRomCurve3(lowerPts), 32, 0.11, 8, false),
        new THREE.TubeGeometry(new THREE.CatmullRomCurve3(upperPts), 32, 0.12, 8, false)
      );
      railGeoms.push(
        new THREE.TubeGeometry(new THREE.CatmullRomCurve3(handPts), 32, 0.045, 8, false)
      );
    }

    // North & South Concrete Bridge Abutments + Creek Pier Footings grounded deep below `y = -0.7m`
    for (const uAbut of [0.0, 1.0, 0.36, 0.64]) {
      const ax = r.x1 + dx * uAbut;
      const az = r.z1 + dz * uAbut;
      const topY = r.archHeightM * Math.pow(Math.sin(Math.PI * uAbut), 2) - 0.12;
      const h = topY - -0.85;
      const pier = new THREE.BoxGeometry(r.widthM + 1.1, h, uAbut === 0 || uAbut === 1 ? 2.4 : 1.1);
      pier.rotateY(yawSeg);
      pier.translate(ax, -0.85 + h * 0.5, az);
      concreteGeoms.push(pier);
    }

    const addPart = (geoms, mat, cast = true) => {
      const m = mergeCampusStaticGeometries(geoms);
      if (!m) return;
      const mesh = new THREE.Mesh(m, mat);
      mesh.castShadow = cast;
      mesh.receiveShadow = true;
      bridgeGroup.add(mesh);
    };

    addPart(plankGeoms, this.materials.bridgePlanks, true);
    addPart(cortenGeoms, this.materials.cortenTruss, true);
    addPart(railGeoms, this.materials.bridgeRailing, false);
    addPart(concreteGeoms, this.materials.concreteCurb, true);
    bakeStaticGroupByMaterial(bridgeGroup);

    bridgeGroup.matrixAutoUpdate = false;
    bridgeGroup.updateMatrix();
    this.stevensBridgeGroup = bridgeGroup;
    this.root.add(bridgeGroup);
  }

  // ============================================================================
  // 3. DENSE ARCHITECTURAL CAMPUS BLOCKS (`CAMPUS_BUILDING_BLOCKS` + AO APRONS)
  // ============================================================================
  _buildCampusBuildingBlocks() {
    this.proceduralBuildingsGroup = new THREE.Group();
    this.proceduralBuildingsGroup.name = "Procedural_Campus_Buildings";
    this.root.add(this.proceduralBuildingsGroup);

    this.solarCarportGroup = new THREE.Group();
    this.solarCarportGroup.name = "Campus_Solar_Carport";
    this.root.add(this.solarCarportGroup);

    const quadrants = Array.from({ length: 4 }, () => ({
      timberGeoms: [],
      glassGeoms: [],
      glowGeoms: [],
      steelGeoms: [],
      concreteGeoms: [],
      accentGeoms: [[], [], [], []],
    }));

    const solarSteelGeoms = [];
    const solarConcreteGeoms = [];
    const solarPanelGeoms = [];
    const buildingAoGeoms = [];

    for (const b of CAMPUS_BUILDING_BLOCKS) {
      // `bldg_gradient_canopy` and `bldg_bayview_canopy` use their hero sculpted shells!
      if (
        b.id === "bldg_gradient_canopy" ||
        b.id === "bldg_bayview_canopy" ||
        b.id === "bldg_bay_view" ||
        b.style === "dragonscale"
      ) {
        continue;
      }

      // Separate `bldg_north_commons` cleanly east of `bldg_plex_41` (`cx = -32`, clear of `shoreline_blvd` sidewalks!)
      const bx = b.id === "bldg_north_commons" ? -32.0 : (b.cx ?? b.x ?? 0.0);
      const bz = b.cz ?? b.z ?? 0.0;
      const gy = getOpenWorldEarthHeight(bx, bz);
      const baseY = gy + 0.06;
      const sx = b.wx ?? (b.halfX ? b.halfX * 2.0 : 28.0);
      const sz = b.wz ?? (b.halfZ ? b.halfZ * 2.0 : 24.0);
      const h = b.hy ?? b.heightM ?? 12.0;

      if (b.style === "solar_carport") {
        // Paved Solar EV Parking Plaza (`(-162, 28)`) + Angled Butterfly PV Canopies!
        const lotPad = new THREE.BoxGeometry(sx + 2.0, 0.24, sz + 2.0);
        lotPad.translate(bx, gy - 0.04, bz);
        solarConcreteGeoms.push(lotPad);

        const rows = 2;
        for (let rIdx = 0; rIdx < rows; rIdx++) {
          const rz = bz + (rIdx - 0.5) * (sz * 0.52);
          for (let col = -2; col <= 2; col++) {
            const cx = bx + col * (sx * 0.20);
            const post = new THREE.CylinderGeometry(0.18, 0.22, h, 14);
            post.translate(cx, gy + h * 0.5, rz);
            solarSteelGeoms.push(post);

            const beam = new THREE.BoxGeometry(0.24, 0.26, sz * 0.42);
            beam.rotateX(0.14);
            beam.translate(cx, gy + h - 0.1, rz);
            solarSteelGeoms.push(beam);
          }
          const pvDeck = new THREE.BoxGeometry(sx * 0.96, 0.12, sz * 0.44);
          pvDeck.rotateX(0.14);
          pvDeck.translate(bx, gy + h + 0.08, rz);
          solarPanelGeoms.push(pvDeck);
        }
        continue;
      }

      // Soft Contact AO Shadow Apron (`gy + 0.018m`) grounding building plinth to turf/pavement!
      const aoApron = new THREE.PlaneGeometry(sx + 5.6, sz + 5.6);
      aoApron.rotateX(-Math.PI * 0.5);
      aoApron.translate(bx, gy + 0.018, bz);
      buildingAoGeoms.push(aoApron);

      const q = quadrants[(bx >= 0 ? 1 : 0) + (bz >= 0 ? 2 : 0)];
      const {
        timberGeoms,
        glassGeoms,
        glowGeoms,
        steelGeoms,
        concreteGeoms,
        accentGeoms,
      } = q;

      // Grounded architectural concrete plinth (`minY <= gy - 0.12m` -> zero floating!)
      const plinth = new THREE.BoxGeometry(sx + 1.4, 0.56, sz + 1.4);
      plinth.translate(bx, gy + 0.16, bz);
      concreteGeoms.push(plinth);

      if (b.style === "timber") {
        // Warm Mass-Timber Cedar Pavilion with Cantilevered Eaves & Clerestory Monitor
        const coreGlass = new THREE.BoxGeometry(sx * 0.92, h * 0.86, sz * 0.92);
        coreGlass.translate(bx, baseY + h * 0.43, bz);
        glassGeoms.push(coreGlass);

        const roofSlab = new THREE.BoxGeometry(sx * 1.06, 0.62, sz * 1.06);
        roofSlab.translate(bx, baseY + h * 0.88, bz);
        timberGeoms.push(roofSlab);

        const midSoffit = new THREE.BoxGeometry(sx * 1.03, 0.44, sz * 1.03);
        midSoffit.translate(bx, baseY + h * 0.46, bz);
        timberGeoms.push(midSoffit);

        const monitor = new THREE.BoxGeometry(sx * 0.58, h * 0.18, sz * 0.54);
        monitor.translate(bx, baseY + h * 0.98, bz);
        glowGeoms.push(monitor);

        const monitorCap = new THREE.BoxGeometry(sx * 0.64, 0.36, sz * 0.60);
        monitorCap.translate(bx, baseY + h * 1.08, bz);
        timberGeoms.push(monitorCap);

        // Perimeter glulam timber columns grounded on plinth
        const colsX = Math.max(3, Math.round(sx / 7.5));
        const colsZ = Math.max(3, Math.round(sz / 7.5));
        for (let ix = 0; ix <= colsX; ix++) {
          const px = bx - sx * 0.48 + (ix / colsX) * (sx * 0.96);
          for (const sideZ of [-1, 1]) {
            const colG = new THREE.BoxGeometry(0.38, h * 0.88, 0.38);
            colG.translate(px, baseY + h * 0.44, bz + sideZ * (sz * 0.48));
            timberGeoms.push(colG);
          }
        }
        for (let iz = 1; iz < colsZ; iz++) {
          const pz = bz - sz * 0.48 + (iz / colsZ) * (sz * 0.96);
          for (const sideX of [-1, 1]) {
            const colG = new THREE.BoxGeometry(0.38, h * 0.88, 0.38);
            colG.translate(bx + sideX * (sx * 0.48), baseY + h * 0.44, pz);
            timberGeoms.push(colG);
          }
        }
      } else {
        // `glass_modern` & `plex_glass` (Googleplex Bldg 40/41/42 & Tech Hubs)
        const lowerWing = new THREE.BoxGeometry(sx * 0.96, h * 0.64, sz * 0.96);
        lowerWing.translate(bx, baseY + h * 0.32, bz);
        glassGeoms.push(lowerWing);

        const upperSetback = new THREE.BoxGeometry(sx * 0.78, h * 0.36, sz * 0.78);
        upperSetback.translate(bx, baseY + h * 0.80, bz);
        glassGeoms.push(upperSetback);

        // Glowing top clerestory band
        const topGlow = new THREE.BoxGeometry(sx * 0.80, 0.85, sz * 0.80);
        topGlow.translate(bx, baseY + h * 0.94, bz);
        glowGeoms.push(topGlow);

        // Horizontal steel sunshade slabs + rooftop mechanical parapet
        for (const frac of [0.34, 0.64, 0.99]) {
          const wScale = frac > 0.7 ? 0.83 : 1.02;
          const slab = new THREE.BoxGeometry(sx * wScale, 0.38, sz * wScale);
          slab.translate(bx, baseY + h * frac, bz);
          steelGeoms.push(slab);
        }

        // Vertical steel curtain-wall mullions
        const mulCountX = Math.max(4, Math.round(sx / 5.5));
        for (let ix = 0; ix <= mulCountX; ix++) {
          const mx = bx - sx * 0.48 + (ix / mulCountX) * (sx * 0.96);
          for (const sideZ of [-1, 1]) {
            const mG = new THREE.BoxGeometry(0.18, h * 0.64, 0.24);
            mG.translate(mx, baseY + h * 0.32, bz + sideZ * (sz * 0.48));
            steelGeoms.push(mG);
          }
        }

        // Iconic 4-Color Google Sun-Fins on `plex_glass` buildings (`Bldg 40/41/42`)!
        if (b.style === "plex_glass") {
          for (let f = 0; f < 8; f++) {
            const u = (f + 0.5) / 8;
            const finZ = bz - sz * 0.42 + u * (sz * 0.84);
            const faceSign = bx < -120 ? 1 : -1;
            const fin = new THREE.BoxGeometry(1.35, h * 0.52, 0.24);
            fin.translate(bx + faceSign * (sx * 0.49), baseY + h * 0.34, finZ);
            accentGeoms[f % 4].push(fin);
          }
        }
      }
    }

    // Permanent Building Contact AO Shadow Aprons (`1` draw call)
    if (buildingAoGeoms.length > 0 && this.materials.buildingContactShadow) {
      const aoMerged = mergeCampusStaticGeometries(buildingAoGeoms);
      if (aoMerged) {
        aoMerged.computeBoundingSphere();
        const aoMesh = new THREE.Mesh(aoMerged, this.materials.buildingContactShadow);
        aoMesh.renderOrder = 1;
        aoMesh.matrixAutoUpdate = false;
        aoMesh.updateMatrix();
        this.root.add(aoMesh);
      }
    }

    // Solar EV Carport (`this.solarCarportGroup`)
    for (const [geoms, mat, cast] of [
      [solarConcreteGeoms, this.materials.concreteSidewalk || this.materials.concreteCurb, false],
      [solarSteelGeoms, this.materials.steelMullion, true],
      [solarPanelGeoms, this.materials.solarPanelBlue, true],
    ]) {
      const m = mergeCampusStaticGeometries(geoms);
      if (!m) continue;
      m.computeBoundingSphere();
      const mesh = new THREE.Mesh(m, mat);
      mesh.castShadow = cast;
      mesh.receiveShadow = true;
      mesh.matrixAutoUpdate = false;
      mesh.updateMatrix();
      this.solarCarportGroup.add(mesh);
    }

    const addBuildingBatch = (geoms, mat) => {
      const m = mergeCampusStaticGeometries(geoms);
      if (!m) return;
      m.computeBoundingSphere();
      const mesh = new THREE.Mesh(m, mat);
      mesh.castShadow = true;
      mesh.receiveShadow = true;
      mesh.matrixAutoUpdate = false;
      mesh.updateMatrix();
      this.proceduralBuildingsGroup.add(mesh);
    };

    const umbrellaMats = [
      this.materials.umbrellaRed,
      this.materials.umbrellaBlue,
      this.materials.umbrellaGreen,
      this.materials.umbrellaYellow,
    ];

    const allTimber = [];
    const allGlass = [];
    const allGlow = [];
    const allSteel = [];
    const allConc = [];
    const allAccents = [[], [], [], []];
    for (const q of quadrants) {
      allTimber.push(...q.timberGeoms);
      allGlass.push(...q.glassGeoms);
      allGlow.push(...q.glowGeoms);
      allSteel.push(...q.steelGeoms);
      allConc.push(...q.concreteGeoms);
      for (let c = 0; c < 4; c++) allAccents[c].push(...q.accentGeoms[c]);
    }

    addBuildingBatch(allTimber, this.materials.cedarTimber);
    addBuildingBatch(allGlass, this.materials.curtainGlass);
    addBuildingBatch(allGlow, this.materials.clerestoryGlow);
    if (this.materials.curtainGlass) {
      this._nightEmissives.push({
        mat: this.materials.curtainGlass,
        baseIntensity: this.materials.curtainGlass.emissiveIntensity ?? 0.12,
      });
    }
    if (this.materials.clerestoryGlow) {
      this._nightEmissives.push({
        mat: this.materials.clerestoryGlow,
        baseIntensity: this.materials.clerestoryGlow.emissiveIntensity ?? 0.14,
      });
    }

    const solidBldgGroup = new THREE.Group();
    const steelMerged = mergeCampusStaticGeometries(allSteel);
    if (steelMerged) {
      const m = new THREE.Mesh(steelMerged, this.materials.steelMullion);
      m.castShadow = true;
      m.receiveShadow = true;
      solidBldgGroup.add(m);
    }
    const concMerged = mergeCampusStaticGeometries(allConc);
    if (concMerged) {
      const m = new THREE.Mesh(concMerged, this.materials.graniteCurb || this.materials.concreteCurb);
      m.castShadow = false;
      m.receiveShadow = true;
      solidBldgGroup.add(m);
    }
    for (let c = 0; c < 4; c++) {
      const m = mergeCampusStaticGeometries(allAccents[c]);
      if (m) {
        const mesh = new THREE.Mesh(m, umbrellaMats[c]);
        mesh.castShadow = true;
        mesh.receiveShadow = true;
        solidBldgGroup.add(mesh);
      }
    }
    if (solidBldgGroup.children.length > 0) {
      bakeStaticGroupByMaterial(solidBldgGroup);
      solidBldgGroup.traverse((ch) => {
        if (ch.isMesh && ch.geometry) ch.geometry.computeBoundingSphere();
      });
      solidBldgGroup.matrixAutoUpdate = false;
      solidBldgGroup.updateMatrix();
      this.proceduralBuildingsGroup.add(solidBldgGroup);
    }
  }

  // ============================================================================
  // 4. GRADIENT CANOPY PAVILION + OPEN INTERIOR STUDIO SHELL
  // ============================================================================
  _buildGradientCanopyAndFitnessGym() {
    const cfg = { glassPlaneZ: 131.20, canopyCenterX: 0.0, glassHalfW: 2.40, glassH: 3.70 };
    const scaleX = 1.52;
    const scaleY = 1.16;
    const scaleZ = 1.85;
    const glassHalfW = cfg.glassHalfW;
    const glassH = cfg.glassH;
    const localBayHalfW = glassHalfW / scaleX;
    const localBayH = glassH / scaleY;

    const silverDragonscaleMat =
      this.materials.canopySilverDragonscale ||
      (() => {
        const m = (this.materials.dragonscaleTile || this.materials.gradientShell).clone();
        m.name = "V5_Pavilion_SilverDragonscaleShell";
        m.color.set("#cad6dc");
        m.emissive = new THREE.Color("#38444a");
        m.emissiveIntensity = 0.16;
        m.metalness = 0.32;
        m.roughness = 0.30;
        m.envMapIntensity = 0.92;
        return m;
      })();
    this.silverDragonscaleMat = silverDragonscaleMat;

    const palePrecastConcreteMat =
      this.materials.canopyLimestonePier ||
      (() => {
        const m = (this.materials.graniteCurb || this.materials.concreteCurb).clone();
        m.name = "V5_Pavilion_PaleArchitecturalConcrete";
        m.color.set("#dbd6cc");
        m.emissive = new THREE.Color("#33312c");
        m.emissiveIntensity = 0.14;
        m.roughness = 0.66;
        m.metalness = 0.04;
        return m;
      })();

    const warmHoneySoffitMat =
      this.materials.canopyWarmHoneySoffit ||
      (() => {
        const m = (this.materials.cedarTimber || this.materials.champagneDiagridSoffit).clone();
        m.name = "V5_Pavilion_WarmTimberSoffit";
        m.color.set("#b88c5e");
        m.emissive = new THREE.Color("#3d2c1b");
        m.emissiveIntensity = 0.18;
        m.roughness = 0.54;
        return m;
      })();

    const coolCanopyGlassMat =
      this.materials.canopySkyGlass ||
      new THREE.MeshStandardMaterial({
        name: "V5_Pavilion_CanopySilverSlateGlass",
        color: "#7c99ad",
        emissive: "#2b3b47",
        emissiveIntensity: 0.22,
        metalness: 0.24,
        roughness: 0.14,
        envMapIntensity: 0.90,
      });
    const coolCanopyClerestoryMat =
      this.materials.canopyClerestoryGlow ||
      new THREE.MeshStandardMaterial({
        name: "V5_Pavilion_CanopyDaylightAtrium",
        color: "#94aec0",
        emissive: "#344652",
        emissiveIntensity: 0.24,
        metalness: 0.12,
        roughness: 0.28,
      });
    const coolCanopySteelMat =
      this.materials.canopyAnodizedAluminum ||
      new THREE.MeshStandardMaterial({
        name: "V5_Pavilion_CanopyAnodizedAluminum",
        color: "#7b8890",
        emissive: "#1f262a",
        emissiveIntensity: 0.10,
        metalness: 0.48,
        roughness: 0.32,
      });

    for (const cm of [
      silverDragonscaleMat,
      palePrecastConcreteMat,
      warmHoneySoffitMat,
      coolCanopyGlassMat,
      coolCanopyClerestoryMat,
      coolCanopySteelMat,
    ]) {
      if (cm && cm.emissiveIntensity > 0) {
        this._nightEmissives.push({ mat: cm, baseIntensity: cm.emissiveIntensity });
      }
    }

    const canopyMats = {
      ...this.materials,
      gradientShell: silverDragonscaleMat,
      concreteCurb: palePrecastConcreteMat,
      champagneDiagridSoffit: warmHoneySoffitMat,
      curtainGlass: coolCanopyGlassMat,
      clerestoryGlow: coolCanopyClerestoryMat,
      steelMullion: coolCanopySteelMat,
    };

    const canopy = buildGradientCanopyBuilding(canopyMats, {
      openCenterBay: true,
      bayHalfWidth: localBayHalfW,
      bayHeight: localBayH,
    });

    // Fix downward-facing triangle winding on main canopy `soffitLiner` (`campus_worlds.js` cloned `shellGeom` without reversing indices)
    canopy.traverse((ch) => {
      if (ch.isMesh && ch.material === warmHoneySoffitMat && ch.geometry) {
        const sIdx = ch.geometry.getIndex()?.array;
        if (sIdx) {
          for (let k = 0; k < sIdx.length; k += 3) {
            const tmp = sIdx[k + 1];
            sIdx[k + 1] = sIdx[k + 2];
            sIdx[k + 2] = tmp;
          }
          ch.geometry.index.needsUpdate = true;
          ch.geometry.computeVertexNormals();
        }
      }
    });

    // Add Gradient Canopy's iconic forward-sweeping silver-white dragonscale scalloped front eave (`yWorld = 4.10..8.95m`,
    // arching cleanly above the `3.70m` center breakout bay) + slim flared pale limestone funnel piers!
    {
      const browSegX = 56;
      const browSegZ = 16;
      const bPos = [];
      const bUv = [];
      const bInd = [];
      const frontLipPts = [];
      const evalScallopY = (ux, vz) => {
        const scallop = 0.5 + 0.5 * Math.cos(ux * Math.PI * 2.5);
        const centerLift = Math.exp(-ux * ux * 6.0) * 0.28;
        const frontEaveY = 3.52 + scallop * 1.24 + centerLift;
        const riseZ = vz * 2.85 + Math.sin(vz * Math.PI) * 0.54;
        return frontEaveY * (1.0 - 0.16 * vz) + riseZ;
      };
      for (let iz = 0; iz <= browSegZ; iz++) {
        const vz = iz / browSegZ; // 0 = front overhanging lip (`zLocal = +6.45`), 1 = joins main dome (`zLocal = +2.55`)
        const zL = 6.45 - vz * 3.90;
        for (let ix = 0; ix <= browSegX; ix++) {
          const ux = -1.0 + (ix / browSegX) * 2.0;
          const xL = ux * 16.4;
          const yL = evalScallopY(ux, vz);
          bPos.push(xL, yL, zL);
          bUv.push((ux + 1.0) * 6.5, vz * 3.2);
          if (iz === 0) {
            frontLipPts.push(new THREE.Vector3(xL, yL - 0.04, zL));
          }
          if (iz < browSegZ && ix < browSegX) {
            const a = iz * (browSegX + 1) + ix;
            const b = a + 1;
            const c = (iz + 1) * (browSegX + 1) + ix;
            const d = c + 1;
            // `dx > 0` (`a->b`) and `dz < 0` (`a->c`) => `(b - a) x (c - a)` points strictly `+Y` (upward/outward)!
            bInd.push(a, b, c, b, d, c);
          }
        }
      }
      const browGeom = new THREE.BufferGeometry();
      browGeom.setAttribute("position", new THREE.Float32BufferAttribute(bPos, 3));
      browGeom.setAttribute("uv", new THREE.Float32BufferAttribute(bUv, 2));
      browGeom.setIndex(bInd);
      browGeom.computeVertexNormals();
      const browLipGeom = new THREE.TubeGeometry(
        new THREE.CatmullRomCurve3(frontLipPts),
        64,
        0.13,
        10,
        false
      );
      const browTop = new THREE.Mesh(
        mergeCampusStaticGeometries([browGeom, browLipGeom]),
        silverDragonscaleMat
      );
      browTop.castShadow = false;
      browTop.receiveShadow = true;
      canopy.add(browTop);

      const browUnder = browGeom.clone();
      browUnder.translate(0, -0.14, 0);
      // Reverse `+Y` indices to `-Y` downward-facing warm honey timber soffit
      const uIdx = browUnder.getIndex().array;
      for (let k = 0; k < uIdx.length; k += 3) {
        const tmp = uIdx[k + 1];
        uIdx[k + 1] = uIdx[k + 2];
        uIdx[k + 2] = tmp;
      }
      browUnder.computeVertexNormals();
      const browSoffit = new THREE.Mesh(browUnder, warmHoneySoffitMat);
      browSoffit.castShadow = false;
      canopy.add(browSoffit);

      const browPierGeoms = [];
      for (const px of [-15.74, -6.56, 6.56, 15.74]) {
        const ux = px / 16.4;
        const topH = evalScallopY(ux, 0.22) + 0.08;
        const lathePts = [
          new THREE.Vector2(0.26, 0.0),
          new THREE.Vector2(0.22, topH * 0.30),
          new THREE.Vector2(0.25, topH * 0.62),
          new THREE.Vector2(0.36, topH * 0.85),
          new THREE.Vector2(0.52, topH),
        ];
        const pCol = new THREE.LatheGeometry(lathePts, 16);
        pCol.translate(px, 0.0, 5.58);
        const pBench = new THREE.BoxGeometry(1.90, 0.44, 0.72);
        pBench.translate(px, 0.22, 5.82);
        browPierGeoms.push(pCol, pBench);
      }
      const browPiersMesh = new THREE.Mesh(mergeCampusStaticGeometries(browPierGeoms), palePrecastConcreteMat);
      browPiersMesh.castShadow = false;
      browPiersMesh.receiveShadow = true;
      canopy.add(browPiersMesh);
    }
    // Let low-angle golden sunlight stream through the 4x6 storefront mullions across the Spin Studio floor (`(0.76, 141.58)`)!
    canopy.traverse((ch) => {
      if (ch.isMesh && (ch.material === silverDragonscaleMat || ch.material === warmHoneySoffitMat)) {
        ch.castShadow = false;
      }
    });
    canopy.scale.set(scaleX, scaleY, scaleZ);
    canopy.rotation.y = Math.PI;
    canopy.position.set(cfg.canopyCenterX, 0.0, cfg.glassPlaneZ + 3.80 * scaleZ);
    bakeStaticGroupByMaterial(canopy);
    canopy.matrixAutoUpdate = false;
    canopy.updateMatrix();
    this.gradientCanopyFallback = canopy;
    this.root.add(canopy);

    // Permanent Intact Architectural Storefront Curtain-Wall Facade (`V4/V5 Seamless Dark-Bronze Muntin Grid`):
    // Uses the EXACT same `gymArchitecturalGlass` + dark anodized bronze `gymMullionMat` 6-row (`y = 0.70..3.10`) × `~1.20m`
    // muntin grid across BOTH flanking wings AND the breakable center window (`[-2.40, +2.40]`),
    // so the center window looks 100% identical to every adjacent gym window before impact!
    const gymGlassMat =
      this.materials.gymArchitecturalGlass || this.materials.breakableTemperedGlass;
    const gymMullionMat = new THREE.MeshStandardMaterial({
      name: "GymDarkAnodizedBronzeMullion",
      color: "#2b2520",
      metalness: 0.62,
      roughness: 0.36,
      envMapIntensity: 0.78,
    });

    const storefrontGroup = new THREE.Group();
    storefrontGroup.name = "Gym_Permanent_Storefront_Facade";
    const sfGlassGeoms = [];
    const sfMullionGeoms = [];
    const sfCedarGeoms = [];

    const wingInnerX = glassHalfW + 0.04; // 2.44m
    const wingOuterX = 11.02;
    const westTransitionX = -3.28; // Aligns cleanly with inner edge of Gradient Canopy concrete planter wall (`x = -3.35m`)!
    const eastWingW = wingOuterX - wingInnerX; // 8.58m (`+2.44 .. +11.02`)
    const eastWingMidX = (wingInnerX + wingOuterX) * 0.5;
    const westInnerW = Math.abs(westTransitionX) - wingInnerX; // 0.84m (`-3.28 .. -2.44` framing breakable window)
    const westInnerMidX = (-wingInnerX + westTransitionX) * 0.5;
    const westStoreCurtainW = wingOuterX - Math.abs(westTransitionX); // 7.74m (`-11.02 .. -3.28` behind pinwheels!)
    const westStoreCurtainMidX = (-wingOuterX + westTransitionX) * 0.5;
    const lowerGlassBotY = 0.10;
    const lowerGlassTopY = glassH - 0.02; // 3.68m
    const lowerGlassH = lowerGlassTopY - lowerGlassBotY;
    const lowerGlassMidY = (lowerGlassBotY + lowerGlassTopY) * 0.5;
    const transomBotY = glassH + 0.06; // 3.76m
    const transomTopY = 4.92;
    const transomGlassH = transomTopY - transomBotY;
    const transomGlassMidY = (transomBotY + transomTopY) * 0.5;
    const muntinRowYs = [0.70, 1.30, 1.90, 2.50, 3.10];

    // 1A. East Wing (`+2.44 .. +11.02`) + Narrow West Jamb Bay (`-3.28 .. -2.44`): 6-row Spin Studio muntin grid
    sfGlassGeoms.push(
      new THREE.BoxGeometry(eastWingW, lowerGlassH, 0.036).translate(
        eastWingMidX,
        lowerGlassMidY,
        cfg.glassPlaneZ
      ),
      new THREE.BoxGeometry(westInnerW, lowerGlassH, 0.036).translate(
        westInnerMidX,
        lowerGlassMidY,
        cfg.glassPlaneZ
      )
    );
    sfMullionGeoms.push(
      new THREE.BoxGeometry(eastWingW + 0.12, 0.09, 0.16).translate(eastWingMidX, 0.045, cfg.glassPlaneZ),
      new THREE.BoxGeometry(westInnerW + 0.08, 0.09, 0.16).translate(westInnerMidX, 0.045, cfg.glassPlaneZ)
    );
    for (const my of muntinRowYs) {
      sfMullionGeoms.push(
        new THREE.BoxGeometry(eastWingW, 0.052, 0.11).translate(eastWingMidX, my, cfg.glassPlaneZ),
        new THREE.BoxGeometry(westInnerW, 0.052, 0.11).translate(westInnerMidX, my, cfg.glassPlaneZ)
      );
    }
    for (const side of [-1, 1]) {
      // Primary structural portal jamb posts at `x = ±2.445m` framing the breakable center window
      sfMullionGeoms.push(
        new THREE.BoxGeometry(0.105, 4.94, 0.18).translate(
          side * (glassHalfW + 0.045),
          2.47,
          cfg.glassPlaneZ
        )
      );
    }
    for (let m = 1; m <= 6; m++) {
      const mx = wingInnerX + (eastWingW * m) / 7;
      sfMullionGeoms.push(
        new THREE.BoxGeometry(0.062, 4.86, 0.125).translate(mx, 2.47, cfg.glassPlaneZ)
      );
    }
    // East outer corner return jamb pilaster (`x = +10.98`, clear on `2000` vestibule side; ZERO post behind Pinwheel #2 at `-10.56`!)
    sfMullionGeoms.push(
      new THREE.BoxGeometry(0.28, 4.98, 0.72).translate(10.98, 2.49, cfg.glassPlaneZ - 0.10),
      new THREE.BoxGeometry(0.09, 4.94, 0.22).translate(westTransitionX, 2.47, cfg.glassPlaneZ)
    );
    sfCedarGeoms.push(
      new THREE.BoxGeometry(0.46, 4.78, 0.56).translate(10.64, 2.39, cfg.glassPlaneZ + 0.10)
    );

    // 1B. West `Google Store` Curtain-Wall Continuation (`x in [-11.08, -3.28]` behind Pinwheels #1 & #2):
    //     Matches `Visitor_Experience_CurtainWall_And_Wings_V6` (`y = 2.45m` single transom, `1.83m` vertical mullions,
    //     and exterior-only `FrontSide` cool Low-E upper transom + dark retail lower glazing with ZERO warm gym frost!)
    sfMullionGeoms.push(
      new THREE.BoxGeometry(westStoreCurtainW + 0.12, 0.11, 0.22).translate(
        westStoreCurtainMidX - 0.03,
        0.055,
        cfg.glassPlaneZ - 0.02
      ),
      new THREE.BoxGeometry(westStoreCurtainW + 0.12, 0.11, 0.22).translate(
        westStoreCurtainMidX - 0.03,
        2.45,
        cfg.glassPlaneZ - 0.02
      )
    );
    for (const wxm of [-5.11, -6.94, -8.77, -10.60]) {
      sfMullionGeoms.push(
        new THREE.BoxGeometry(0.088, 4.90, 0.21).translate(wxm, 2.48, cfg.glassPlaneZ - 0.02)
      );
    }

    // Upper clerestory glass transom across Spin Studio portal (`x in [-3.28, +11.02], y in [3.76, 4.92]`)
    const studioTransomW = wingOuterX - westTransitionX;
    const studioTransomMidX = (wingOuterX + westTransitionX) * 0.5;
    sfGlassGeoms.push(
      new THREE.BoxGeometry(studioTransomW, transomGlassH, 0.036).translate(
        studioTransomMidX,
        transomGlassMidY,
        cfg.glassPlaneZ
      )
    );
    // Matching upper transom vertical muntins at `x = -1.20, 0.00, +1.20` directly above center bay mullions!
    for (const tx of [-1.20, 0.0, 1.20]) {
      sfMullionGeoms.push(
        new THREE.BoxGeometry(0.062, transomGlassH, 0.125).translate(
          tx,
          transomGlassMidY,
          cfg.glassPlaneZ
        )
      );
    }
    // Structural horizontal transom beam (`x in [-3.28, +11.02]`, `y = 3.725m`) + full-width header cap (`y = 4.94m`)
    sfMullionGeoms.push(
      new THREE.BoxGeometry(studioTransomW + 0.16, 0.105, 0.19).translate(
        studioTransomMidX,
        glassH + 0.025,
        cfg.glassPlaneZ
      ),
      new THREE.BoxGeometry(wingOuterX * 2.0 + 0.28, 0.14, 0.62).translate(
        0.0,
        4.94,
        cfg.glassPlaneZ - 0.12
      )
    );
    // Warm cedar interior soffit closure (`x in [-3.20, +10.80]`)
    sfCedarGeoms.push(
      new THREE.BoxGeometry(14.0, 0.28, 0.54).translate(
        3.80,
        4.70,
        cfg.glassPlaneZ + 0.18
      )
    );

    // Exterior-only (`FrontSide` facing `-Z`) two-band `Google Store` Low-E glazing behind `[-11.08, -3.28]`
    // (100% invisible from inside the Spin Studio via backface culling + `castShadow = false`!)
    const westUpperTransomGeom = new THREE.PlaneGeometry(westStoreCurtainW + 0.10, 2.49);
    westUpperTransomGeom.rotateY(Math.PI);
    westUpperTransomGeom.translate(westStoreCurtainMidX - 0.03, 3.695, cfg.glassPlaneZ + 0.01);
    const westUpperTransomMat = new THREE.MeshStandardMaterial({
      name: "Visitor_GoogleStore_UpperGlazing_V7",
      color: "#4a7597",
      roughness: 0.14,
      metalness: 0.20,
      envMap: this.dayEnvMap || null,
      envMapIntensity: 0.78,
      side: THREE.FrontSide,
    });
    westUpperTransomMat.userData.v7SkipWorldCohesion = true;
    const westUpperTransomMesh = new THREE.Mesh(westUpperTransomGeom, westUpperTransomMat);
    westUpperTransomMesh.castShadow = false;
    westUpperTransomMesh.receiveShadow = false;
    storefrontGroup.add(westUpperTransomMesh);

    const westLowerRetailGeom = new THREE.PlaneGeometry(westStoreCurtainW + 0.10, 2.38);
    westLowerRetailGeom.rotateY(Math.PI);
    westLowerRetailGeom.translate(westStoreCurtainMidX - 0.03, 1.26, cfg.glassPlaneZ + 0.01);
    const westCurtainSpandrelMat = new THREE.MeshStandardMaterial({
      name: "Visitor_GoogleStore_CurtainSpandrel_V7",
      color: "#182633",
      roughness: 0.16,
      metalness: 0.26,
      envMap: this.dayEnvMap || null,
      envMapIntensity: 0.74,
      side: THREE.FrontSide,
    });
    westCurtainSpandrelMat.userData.v7SkipWorldCohesion = true;
    const westCurtainSpandrelMesh = new THREE.Mesh(westLowerRetailGeom, westCurtainSpandrelMat);
    westCurtainSpandrelMesh.castShadow = false;
    westCurtainSpandrelMesh.receiveShadow = false;
    storefrontGroup.add(westCurtainSpandrelMesh);

    const sfGlassMesh = new THREE.Mesh(
      mergeCampusStaticGeometries(sfGlassGeoms),
      gymGlassMat
    );
    const sfMullionMesh = new THREE.Mesh(
      mergeCampusStaticGeometries(sfMullionGeoms),
      gymMullionMat
    );
    sfMullionMesh.castShadow = true;
    sfMullionMesh.receiveShadow = true;
    const sfCedarMesh = new THREE.Mesh(
      mergeCampusStaticGeometries(sfCedarGeoms),
      this.materials.warmWood
    );
    sfCedarMesh.receiveShadow = true;

    storefrontGroup.add(sfGlassMesh, sfMullionMesh, sfCedarMesh);
    storefrontGroup.matrixAutoUpdate = false;
    storefrontGroup.updateMatrix();
    this.gymStorefrontFacadeGroup = storefrontGroup;
    this.root.add(storefrontGroup);

    // Open central South entrance (`x in [-2.40, +2.40], z = 131.20`) allows walking directly inside the empty studio shell.

    // Interior Ground-Floor Luxury Google Spin & Performance Studio (`x in [-10.45, +10.45], y in [0, 4.60], z in [131.25, 148.6]`):
    // Warm honey-maple hardwood studio border + speckled EPDM athletic rubber workout zone + acoustic wood-slat walls!
    const gymGroup = new THREE.Group();
    const gymHardwoodBorder = new THREE.Mesh(
      new THREE.PlaneGeometry(20.9, 17.4),
      this.materials.gymMapleHardwood || this.materials.warmWood
    );
    gymHardwoodBorder.rotation.x = -Math.PI * 0.5;
    gymHardwoodBorder.position.set(0.0, 0.004, 140.0);
    gymHardwoodBorder.receiveShadow = true;
    gymGroup.add(gymHardwoodBorder);

    const gymFloor = new THREE.Mesh(
      new THREE.PlaneGeometry(15.7, 15.2),
      this.materials.gymRubberFloor
    );
    gymFloor.rotation.x = -Math.PI * 0.5;
    gymFloor.position.set(0.0, 0.007, 139.8);
    gymFloor.receiveShadow = true;
    gymGroup.add(gymFloor);

    // Crisp white sprint-lane lines + brushed-brass studio zone inlay guiding the eye straight through the center window!
    const laneGeoms = [];
    for (const lx of [-1.22, 1.22]) {
      const line = new THREE.PlaneGeometry(0.075, 11.8);
      line.rotateX(-Math.PI * 0.5);
      line.translate(lx, 0.009, 137.8);
      laneGeoms.push(line);
    }
    const studioFloorMarkingsMesh = new THREE.Mesh(
      mergeCampusStaticGeometries(laneGeoms),
      this.materials.roadStripeWhite
    );
    gymGroup.add(studioFloorMarkingsMesh);

    // Enclosed Warm Western Red Cedar Acoustic Wood-Slat Rear & Side Walls + Dark Charcoal Felt Backing + Clerestories!
    const gymFeltBackingGeoms = [
      new THREE.BoxGeometry(21.0, 4.55, 0.24).translate(0.0, 2.28, 148.62),
      new THREE.BoxGeometry(0.18, 3.52, 17.3).translate(-10.45, 1.76, 140.0),
      new THREE.BoxGeometry(0.18, 3.52, 17.3).translate(10.45, 1.76, 140.0),
    ];
    const gymCeilingMesh = new THREE.Mesh(
      new THREE.BoxGeometry(21.1, 0.24, 17.4).translate(0.0, 4.56, 140.0),
      this.materials.cedarTimber
    );
    gymCeilingMesh.castShadow = false;
    gymCeilingMesh.receiveShadow = true;
    gymGroup.add(gymCeilingMesh);

    const gymCedarGeoms = [];
    // Architectural vertical cedar acoustic slats along the rear studio wall (`z = 148.45`)
    for (let sx = -10.0; sx <= 10.01; sx += 0.34) {
      gymCedarGeoms.push(
        new THREE.BoxGeometry(0.14, 4.36, 0.08).translate(sx, 2.22, 148.46)
      );
    }
    // Dark smoked architectural studio mirror wall band (`x in [-8.4, +8.4], y in [0.85, 2.80], z = 148.39`)
    const studioMirrorMat = new THREE.MeshStandardMaterial({
      name: "GymStudioSmokedMirrorMat",
      color: "#20262e",
      metalness: 0.86,
      roughness: 0.06,
      envMapIntensity: 0.92,
      transparent: false,
    });
    const studioMirrorMesh = new THREE.Mesh(
      new THREE.BoxGeometry(16.8, 1.95, 0.03),
      studioMirrorMat
    );
    studioMirrorMesh.name = "GymStudioMirrorBand";
    studioMirrorMesh.position.set(0.0, 1.82, 148.39);
    gymGroup.add(studioMirrorMesh);

    const gymGlassGeoms = [];
    const gymGlowGeoms = [];
    const gymBronzeSideMullions = [
      new THREE.BoxGeometry(16.86, 0.055, 0.055).translate(0.0, 0.845, 148.385),
      new THREE.BoxGeometry(16.86, 0.055, 0.055).translate(0.0, 2.795, 148.385),
    ];

    for (const sideX of [-10.36, 10.36]) {
      const inwardSign = sideX < 0 ? 1 : -1;
      // Vertical Western Red Cedar acoustic slats lining West & East Spin Studio walls (`y = 0..3.52m`) + upper clerestory glazing
      for (let sz = 131.8; sz <= 148.1; sz += 0.34) {
        gymCedarGeoms.push(
          new THREE.BoxGeometry(0.08, 3.48, 0.14).translate(sideX + inwardSign * 0.04, 1.74, sz)
        );
      }
      gymBronzeSideMullions.push(
        new THREE.BoxGeometry(0.14, 0.065, 17.2).translate(sideX, 3.52, 140.0)
      );
      gymGlassGeoms.push(new THREE.BoxGeometry(0.05, 0.92, 17.2).translate(sideX, 4.00, 140.0));
      for (let mz = 132.4; mz <= 147.6; mz += 1.90) {
        gymBronzeSideMullions.push(
          new THREE.BoxGeometry(0.14, 0.98, 0.08).translate(sideX, 4.00, mz)
        );
      }
    }
    // 5 Recessed Warm Linear Architectural LED Studio Ceiling Bars + Perimeter Cove Glow
    for (const barX of [-6.4, -3.2, 0.0, 3.2, 6.4]) {
      gymGlowGeoms.push(new THREE.BoxGeometry(0.28, 0.07, 14.4).translate(barX, 4.42, 139.8));
    }
    gymGlowGeoms.push(new THREE.BoxGeometry(17.2, 0.06, 0.10).translate(0.0, 2.84, 148.38));

    const studioGlowMat = this.materials.clerestoryGlow.clone();
    this._nightEmissives.push({
      mat: studioGlowMat,
      baseIntensity: studioGlowMat.emissiveIntensity ?? 0.14,
    });

    gymGroup.add(
      new THREE.Mesh(mergeCampusStaticGeometries(gymFeltBackingGeoms), this.materials.gbikeTireRubber),
      new THREE.Mesh(mergeCampusStaticGeometries(gymCedarGeoms), this.materials.cedarTimber),
      new THREE.Mesh(mergeCampusStaticGeometries(gymBronzeSideMullions), gymMullionMat),
      new THREE.Mesh(mergeCampusStaticGeometries(gymGlassGeoms), gymGlassMat),
      new THREE.Mesh(mergeCampusStaticGeometries(gymGlowGeoms), studioGlowMat)
    );

    // Dim eerie architectural studio light
    this.studioInteriorLight = new THREE.PointLight("#9fb8d8", 0.22, 22.0, 1.5);
    this.studioInteriorLight.position.set(0.0, 3.9, 140.0);
    this.root.add(this.studioInteriorLight);

    this.gymInteriorGroup = gymGroup;
    this.root.add(gymGroup);
  }

  // ============================================================================
  // 5. CAMPUS ARCHITECTURAL LANDMARKS & PLAZA DISCS (MAP-ONLY)
  // ============================================================================
  _buildLandmarksAndPavilion() {
    // --- A. Bay View Dragonscale 3-Tier Canopy (`(202, 24)`) ---
    const bayViewMats = {
      ...this.materials,
      dragonscaleTile: this.silverDragonscaleMat || this.materials.dragonscaleTile,
    };
    const bayView = buildBayViewDragonscaleBuilding(bayViewMats);
    bayView.scale.set(1.42, 1.04, 1.48);
    bayView.rotation.y = -Math.PI * 0.5;
    bayView.position.set(202.0, 0.0, 24.0);
    groundObjectToY(bayView, 0.0, 0.02);
    bakeStaticGroupByMaterial(bayView);
    bayView.matrixAutoUpdate = false;
    bayView.updateMatrix();
    this.bayViewFallback = bayView;
    this.root.add(bayView);

    // --- B. Shoreline Amphitheatre (`(12, -208)`) & Stone Plaza Medallion (`(14, -178)`) ---
    const shoreline = buildShorelineAmphitheatre(this.materials);
    shoreline.traverse((ch) => {
      if (ch.isMesh && ch.material && ch.material.isMeshStandardMaterial) {
        ch.material = ch.material.clone();
        ch.material.emissive = new THREE.Color("#ffb86b");
        ch.material.emissiveIntensity = 0.22 * this._emissiveScaleFactor;
        this._nightEmissives.push({ mat: ch.material, baseIntensity: 0.22 });
      }
    });
    shoreline.scale.setScalar(2.15);
    shoreline.position.set(12.0, 0.22, -208.0);
    groundObjectToY(shoreline, 0.22, 0.02);
    bakeStaticGroupByMaterial(shoreline);
    shoreline.matrixAutoUpdate = false;
    shoreline.updateMatrix();
    this.shorelineFallback = shoreline;
    this.root.add(shoreline);

    const px = 14.0;
    const pz = -178.0;
    const basaltInlayMat =
      this.materials.shorelineBasaltStone ||
      new THREE.MeshStandardMaterial({
        name: "ShorelineHonedBasaltStone",
        color: "#2a2e36",
        roughness: 0.68,
        metalness: 0.08,
        envMapIntensity: 0.55,
        polygonOffset: true,
        polygonOffsetFactor: -2,
        polygonOffsetUnits: -2,
      });

    const granitePlazaMat =
      this.materials.shorelineGraniteRing ||
      (this.materials.graniteCurb || this.materials.concreteCurb).clone();
    if (!this.materials.shorelineGraniteRing) {
      granitePlazaMat.name = "ShorelineBushHammeredGranite";
      granitePlazaMat.color.set("#b6afa3");
      granitePlazaMat.roughness = 0.76;
      granitePlazaMat.metalness = 0.05;
      granitePlazaMat.polygonOffset = true;
      granitePlazaMat.polygonOffsetFactor = -3;
      granitePlazaMat.polygonOffsetUnits = -3;
    }

    const outerBasaltRing = new THREE.Mesh(
      makeTerrainConformingDisc(px, pz, 6.16, 12, 128, 0.0165, 0.22, 3.92),
      basaltInlayMat
    );
    outerBasaltRing.receiveShadow = true;
    outerBasaltRing.matrixAutoUpdate = false;
    outerBasaltRing.updateMatrix();
    this.root.add(outerBasaltRing);

    const midGraniteRing = new THREE.Mesh(
      makeTerrainConformingDisc(px, pz, 3.74, 8, 128, 0.017, 0.25, 2.62),
      granitePlazaMat
    );
    midGraniteRing.receiveShadow = true;
    midGraniteRing.matrixAutoUpdate = false;
    midGraniteRing.updateMatrix();
    this.root.add(midGraniteRing);

    const collarGeoms = [makeTerrainConformingDisc(px, pz, 6.50, 4, 128, 0.020, 0.2, 6.14)];
    {
      const skPos = [];
      const skUv = [];
      const skInd = [];
      const skSegs = 128;
      for (let is = 0; is <= skSegs; is++) {
        const a = (is / skSegs) * Math.PI * 2;
        const wx = px + Math.cos(a) * 6.50;
        const wz = pz + Math.sin(a) * 6.50;
        const topY = getOpenWorldEarthHeight(wx, wz) + 0.020;
        skPos.push(wx, topY, wz, wx, topY - 0.060, wz);
        skUv.push((is / skSegs) * 8.0, 1.0, (is / skSegs) * 8.0, 0.0);
        if (is < skSegs) {
          const b = is * 2;
          skInd.push(b, b + 1, b + 2, b + 2, b + 1, b + 3);
        }
      }
      const skG = new THREE.BufferGeometry();
      skG.setAttribute("position", new THREE.Float32BufferAttribute(skPos, 3));
      skG.setAttribute("uv", new THREE.Float32BufferAttribute(skUv, 2));
      skG.setIndex(skInd);
      skG.computeVertexNormals();
      collarGeoms.push(skG);
    }
    const collarMat = granitePlazaMat.clone();
    const collarRing = new THREE.Mesh(mergeCampusStaticGeometries(collarGeoms), collarMat);
    collarRing.receiveShadow = true;
    collarRing.matrixAutoUpdate = false;
    collarRing.updateMatrix();
    this.root.add(collarRing);

    const innerCore = new THREE.Mesh(
      makeTerrainConformingDisc(px, pz, 2.62, 10, 96, 0.0175, 0.24, 0.0),
      granitePlazaMat
    );
    innerCore.receiveShadow = true;
    innerCore.matrixAutoUpdate = false;
    innerCore.updateMatrix();
    this.root.add(innerCore);

    const centerBasaltInlay = new THREE.Mesh(
      makeTerrainConformingDisc(px, pz, 1.48, 6, 96, 0.0185, 0.24, 0.0),
      basaltInlayMat
    );
    centerBasaltInlay.receiveShadow = true;
    centerBasaltInlay.matrixAutoUpdate = false;
    centerBasaltInlay.updateMatrix();
    this.root.add(centerBasaltInlay);
  }

  // ============================================================================
  // 9. INSTANCED CAMPUS TREES, STREET FURNITURE (`V3`-SWAPPABLE) & PARKED EVs
  // ============================================================================
  _buildInstancedCampusTreesAndProps() {
    // 1. Avenue & Parkland Trees (`110` Deciduous + `65` Coastal Redwoods = ONLY 3 draw calls per quadrant!)
    const trunkGeom = new THREE.CylinderGeometry(0.18, 0.32, 3.8, 10);
    trunkGeom.translate(0, 1.9, 0);

    const decCrownGeoms = [
      createOrganicFoliageGeometry(2.15, 9, 7, 0.2).translate(0, 4.4, 0),
      createOrganicFoliageGeometry(1.55, 8, 6, 1.4).translate(0.9, 5.1, 0.4),
      createOrganicFoliageGeometry(1.45, 8, 6, 2.7).translate(-0.85, 4.9, -0.5),
    ];
    const decCrownMerged = mergeCampusStaticGeometries(decCrownGeoms);

    const redCrownMerged = createSculptedRedwoodCrownGeometry();

    const decTransforms = [];
    const redTransforms = [];

    const tryPlaceTree = (tx, tz, scale, isRedwood = false) => {
      // Keep slow-mo Bay View jump camera sightline (`x in [147, 165], z in [8, 48]`) 100% clear!
      if (tx >= 146.0 && tx <= 166.0 && tz >= 6.0 && tz <= 50.0) return;
      // Keep Shot 7 Stan Courtyard camera-to-Stan sightline (`x in [-124, -88], z in [-52, -22]`) 100% unobstructed!
      if (tx >= -124.0 && tx <= -88.0 && tz >= -52.0 && tz <= -22.0) return;
      // Keep Gradient Canopy forecourt (`|x| < 30, z in [86, 155]`) clear
      if (Math.abs(tx) < 30.0 && tz >= 86.0 && tz <= 155.0) return;
      if (isInBayViewPond(tx, tz) || isInStevensCreekWater(tx, tz) || tz < -218.0) return;
      // Strict clearance outside all carriageways + 3.24m sidewalks + bays
      if (signedCarriagewayClearance(tx, tz) < 4.35) return;
      // Keep Courtyard Lawn Island & circular courtyard paver ring (`R < 19.6m`) + gateway promenade open
      if (Math.hypot(tx - -118.0, tz - -50.0) < 19.6) return;
      if (Math.abs(tx - -118.0) < 7.2 && tz >= -74.0 && tz <= -24.0) return;
      // Keep Solar EV Carport interior bays clear
      if (Math.abs(tx - -162.0) < 18.5 && Math.abs(tz - 28.0) < 19.5) return;

      // Avoid building interiors (including adjusted `cx=-32` for `bldg_north_commons`)
      for (const b of CAMPUS_BUILDING_BLOCKS) {
        const bx = b.id === "bldg_north_commons" ? -32.0 : (b.cx ?? b.x ?? 0.0);
        const bz = b.cz ?? b.z ?? 0.0;
        const hx = b.wx ? b.wx * 0.5 : b.halfX ?? 14.0;
        const hz = b.wz ? b.wz * 0.5 : b.halfZ ?? 12.0;
        if (Math.abs(tx - bx) < hx + 2.8 && Math.abs(tz - bz) < hz + 2.8) return;
      }

      // PRNG-preserving Shoreline Amphitheatre seating bowl & tensile roof clearance (`(12.0, 0.22, -208.0)`):
      // Relocate any tree whose trunk or full crown (`margin >= 6.5m`) overlaps `x in [-20.0, +46.0], z in [-232.0, -183.0]`
      // cleanly behind the terraced seating wall and behind the tensile canopy overhang (relaxing `tz < -218.0` for relocated backdrop trees).
      const shorelineMargin = Math.max(6.5, (isRedwood ? 3.5 : 4.2) * scale);
      if (
        tx >= -20.0 - shorelineMargin &&
        tx <= 46.0 + shorelineMargin &&
        tz >= -232.0 - shorelineMargin &&
        tz <= -183.0
      ) {
        if (tx < 12.0) {
          tx = -26.8;
          tz = -232.4;
        } else if (tx > 46.0) {
          tx = 54.6;
          tz = -230.8;
        } else {
          tx = 45.8;
          tz = -232.8;
        }
      }

      const ty = getOpenWorldEarthHeight(tx, tz);
      const rotY = this.rng() * Math.PI * 2;
      if (isRedwood) {
        redTransforms.push({ x: tx, y: ty, z: tz, s: scale, ry: rotY });
      } else {
        decTransforms.push({ x: tx, y: ty, z: tz, s: scale, ry: rotY });
      }
    };

    // Line active campus avenues & waterfront promenade with lush Coast Live Oaks & Coast Redwoods (`halfW + 5.1m`)
    const treeLinedCorridors = [
      ...ACTIVE_ASPHALT_SEGMENTS.map((s) => ({
        id: s.id,
        x1: s.x1,
        z1: s.z1,
        x2: s.x2,
        z2: s.z2,
        halfW: s.halfW,
      })),
      { id: "bay_view_promenade", x1: 156.0, z1: 90.0, x2: 156.0, z2: -92.0, halfW: 8.0 },
    ];
    for (const r of treeLinedCorridors) {
      const dx = r.x2 - r.x1;
      const dz = r.z2 - r.z1;
      const len = Math.hypot(dx, dz) || 1.0;
      const rx = -(dz / len);
      const rz = dx / len;
      const count = Math.floor(len / 22.0);
      for (let i = 1; i < count; i++) {
        const u = i / count;
        for (const side of [-1, 1]) {
          if (r.id === "bay_view_promenade" && side > 0) continue;
          const lat = side * (r.halfW + 5.1);
          const tx = r.x1 + dx * u + rx * lat;
          const tz = r.z1 + dz * u + rz * lat;
          const isRed = (i + (side > 0 ? 1 : 0)) % 3 === 0;
          tryPlaceTree(tx, tz, 0.85 + this.rng() * 0.35, isRed);
        }
      }
    }

    // Lush Street-End Perimeter Groves of Coast Redwoods & Coast Live Oaks framing West (`x ~ -202..-216`)
    // & East (`x ~ +170..+184` / waterfront shore) ends of Charleston Rd, Amphitheatre Pkwy & North Bayshore!
    const streetEndGroves = [
      // West end of Charleston Rd (`z = 76`, `x = -202..-216`)
      [-202.5, 76.0, 1.18, true], [-206.0, 69.5, 1.08, false], [-206.5, 82.5, 1.14, true],
      [-212.0, 74.0, 1.24, true], [-213.5, 63.5, 1.02, false], [-213.0, 88.0, 1.16, true],
      [-203.0, 61.0, 0.98, false], [-203.5, 91.0, 1.04, false],
      // West end of Amphitheatre Pkwy (`z = -18`, `x = -202..-216`)
      [-202.5, -18.0, 1.20, true], [-206.0, -24.5, 1.06, false], [-206.5, -11.5, 1.15, true],
      [-212.5, -19.5, 1.26, true], [-214.0, -30.0, 1.04, false], [-213.5, -6.5, 1.18, true],
      [-203.0, -33.0, 0.96, false], [-203.5, -3.5, 1.02, false],
      // East end of Charleston Rd & North Pond Headland (`x = 165..184`, `x = 240..248`)
      [165.2, 88.5, 1.12, true], [171.0, 95.0, 1.22, true], [178.0, 96.5, 1.08, false],
      [184.0, 94.0, 1.18, true], [241.0, 76.0, 1.25, true], [243.5, 68.5, 1.10, false],
      [243.0, 83.5, 1.18, true],
      // East end of Amphitheatre Pkwy & South-East Bayshore (`x = 165..184`, `x = 240..248`)
      [165.2, -30.5, 1.06, false], [170.5, -64.5, 1.18, true], [178.0, -66.0, 1.08, false],
      [171.5, -86.0, 1.22, true], [176.5, -79.5, 1.06, false], [177.0, -92.5, 1.16, true],
      [183.5, -85.0, 1.24, true], [241.0, -18.0, 1.24, true], [243.5, -25.0, 1.08, false],
      [243.0, -11.0, 1.16, true],
      // South-West & North-West Stan Courtyard Redwood Spire Cluster (behind Stan's tail) + Low Oak Berm Screen (revealing Santa Cruz Ridgeline on right!)
      [-128.0, -76.5, 1.24, true], [-120.0, -79.5, 1.32, true], [-112.0, -77.0, 1.26, true],
      [-139.0, -72.5, 1.22, true], [-146.5, -78.0, 1.15, false], [-134.5, -85.0, 1.28, true],
      [-124.5, -88.0, 1.22, true], [-103.0, -75.5, 0.82, false], [-94.5, -73.5, 0.80, false],
      [-86.0, -75.0, 0.82, false], [-78.5, -78.0, 0.86, false], [-108.0, -86.5, 0.84, false],
      [-98.5, -88.0, 0.82, false], [-88.0, -90.0, 0.80, false], [-122.0, -102.0, 1.28, true],
      [-136.0, -98.0, 1.16, false], [-150.0, -90.0, 1.26, true], [-158.0, -76.0, 1.18, false],
      [-164.0, -86.0, 1.28, true], [-148.0, -112.0, 1.24, true], [-130.0, -118.0, 1.18, false],
      [-72.0, -96.0, 1.16, true], [-141.0, -34.0, 1.18, true], [-144.0, -26.0, 1.12, false],
      [-15.5, -86.0, 1.18, true], [-21.5, -80.5, 1.04, false], [-21.0, -92.0, 1.12, true],
      // Outer Perimeter Coast Live Oak & Redwood Silhouette Fringe (breaks up distant horizon bands in 04, 05, 06, 08, 09!)
      [212.0, 62.0, 1.24, true], [218.0, 74.0, 1.16, false], [224.0, 86.0, 1.28, true],
      [206.0, 96.0, 1.14, false], [228.0, 102.0, 1.26, true], [216.0, 112.0, 1.18, false],
      [234.0, 52.0, 1.22, true], [236.0, 38.0, 1.15, false], [236.0, 8.0, 1.22, true],
      [-224.0, 98.0, 1.24, true], [-232.0, 84.0, 1.14, false], [-228.0, 48.0, 1.20, true],
      [-152.0, 148.0, 1.22, true], [-136.0, 154.0, 1.16, false], [-118.0, 158.0, 1.26, true],
      [-98.0, 152.0, 1.15, false], [-78.0, 156.0, 1.22, true], [-46.0, 168.0, 1.18, false],
      [48.0, 168.0, 1.22, true], [88.0, 164.0, 1.16, false], [128.0, 158.0, 1.24, true],
      [-156.0, -108.0, 1.22, true], [-142.0, -118.0, 1.14, false], [-92.0, -116.0, 1.20, true],
    ];
    for (const [gx, gz, gs, gRed] of streetEndGroves) {
      tryPlaceTree(gx, gz, gs, gRed);
    }

    // Pond shoreline oaks & parkland groves
    for (let z = -50; z <= 82; z += 18) {
      tryPlaceTree(164.8, z, 1.02, false);
    }
    for (let i = 0; i < 42; i++) {
      const tx = -215 + this.rng() * 430;
      const tz = -205 + this.rng() * 365;
      tryPlaceTree(tx, tz, 0.9 + this.rng() * 0.45, this.rng() > 0.55);
    }

    // Continuous 360° Mid-Distance Perimeter Tree Belt (`R ~ 188-232m`, keeping Shoreline `GEMINI 4 CARBON` & Visitor Forecourt sightlines clear!)
    // Conceals the outer campus lawn-to-foothill transition in stills 04, 05, 06, 08, 09!
    {
      const beltRng = createMulberry32(0x360be17a);
      for (let b = 0; b < 78; b++) {
        const ang = (b / 78) * Math.PI * 2.0 + (beltRng() - 0.5) * 0.05;
        const rad = 190.0 + beltRng() * 40.0;
        const bx = Math.sin(ang) * rad;
        const bz = Math.cos(ang) * rad;
        if (bz > 182.0 || bz < -212.0 || Math.abs(bx) > 234.0) continue;
        // Keep Shoreline Amphitheatre finale monument vista open (`|x| < 38, z < -145`)
        if (Math.abs(bx) < 38.0 && bz < -145.0) continue;
        tryPlaceTree(bx, bz, 1.04 + beltRng() * 0.34, beltRng() > 0.48);
      }
    }

    this.decTreeTransforms = decTransforms;
    this.redTreeTransforms = redTransforms;
    this.proceduralTreesGroup = new THREE.Group();
    this.proceduralTreesGroup.name = "Procedural_Campus_Trees_Fallback";
    this.root.add(this.proceduralTreesGroup);

    // Partition trees into 4 spatial quadrants so camera & shadow frustum cull ~75% of campus trees!
    this.treeQuadrantBatches = [];
    for (let qIdx = 0; qIdx < 4; qIdx++) {
      const wantPosX = (qIdx & 1) !== 0;
      const wantPosZ = (qIdx & 2) !== 0;
      const qDec = decTransforms.filter((t) => (t.x >= 0) === wantPosX && (t.z >= 0) === wantPosZ);
      const qRed = redTransforms.filter((t) => (t.x >= 0) === wantPosX && (t.z >= 0) === wantPosZ);
      const qTotal = qDec.length + qRed.length;
      const shadowCasters = [];

      if (qTotal > 0) {
        const trunksInst = new THREE.InstancedMesh(
          trunkGeom,
          this.materials.redwoodBark,
          qTotal
        );
        trunksInst.castShadow = false;
        let tIdx = 0;
        for (const tr of qDec) {
          _dummy.position.set(tr.x, tr.y, tr.z);
          _dummy.rotation.set(0, tr.ry, 0);
          _dummy.scale.set(tr.s, tr.s, tr.s);
          _dummy.updateMatrix();
          trunksInst.setMatrixAt(tIdx++, _dummy.matrix);
        }
        for (const tr of qRed) {
          _dummy.position.set(tr.x, tr.y, tr.z);
          _dummy.rotation.set(0, tr.ry, 0);
          _dummy.scale.set(tr.s * 1.15, tr.s * 1.55, tr.s * 1.15);
          _dummy.updateMatrix();
          trunksInst.setMatrixAt(tIdx++, _dummy.matrix);
        }
        trunksInst.instanceMatrix.needsUpdate = true;
        trunksInst.computeBoundingSphere();
        this.proceduralTreesGroup.add(trunksInst);
      }

      if (qDec.length > 0) {
        const decInst = new THREE.InstancedMesh(
          decCrownMerged,
          this.materials.foliageDeep,
          qDec.length
        );
        decInst.castShadow = true;
        for (let i = 0; i < qDec.length; i++) {
          const tr = qDec[i];
          _dummy.position.set(tr.x, tr.y, tr.z);
          _dummy.rotation.set(0, tr.ry, 0);
          _dummy.scale.setScalar(tr.s);
          _dummy.updateMatrix();
          decInst.setMatrixAt(i, _dummy.matrix);
        }
        decInst.instanceMatrix.needsUpdate = true;
        decInst.computeBoundingSphere();
        this.proceduralTreesGroup.add(decInst);
        shadowCasters.push(decInst);
      }

      if (qRed.length > 0) {
        const redInst = new THREE.InstancedMesh(
          redCrownMerged,
          this.materials.foliageRedwood,
          qRed.length
        );
        redInst.castShadow = true;
        for (let i = 0; i < qRed.length; i++) {
          const tr = qRed[i];
          _dummy.position.set(tr.x, tr.y, tr.z);
          _dummy.rotation.set(0, tr.ry, 0);
          _dummy.scale.setScalar(tr.s);
          _dummy.updateMatrix();
          redInst.setMatrixAt(i, _dummy.matrix);
        }
        redInst.instanceMatrix.needsUpdate = true;
        redInst.computeBoundingSphere();
        this.proceduralTreesGroup.add(redInst);
        shadowCasters.push(redInst);
      }

      this.treeQuadrantBatches.push({
        wantPosX,
        wantPosZ,
        shadowCasters,
      });
    }

    // 3. Curated Streetscape Furniture Placements (`Campus_Environment_V3` Ready + Procedural Fallbacks!)
    this.proceduralStreetFurnitureGroup = new THREE.Group();
    this.proceduralStreetFurnitureGroup.name = "Procedural_Street_Furniture";
    this.root.add(this.proceduralStreetFurnitureGroup);

    this.signalPlacements = [];
    this.lampPlacements = [];
    this.benchPlacements = [];
    this.planterPlacements = [];
    this.bikeRackPlacements = [];
    this.triBinPlacements = [];

    const propAoGeoms = [];
    const addPropAoPad = (x, y, z, w, d, rotY = 0.0) => {
      const g = new THREE.PlaneGeometry(w, d);
      g.rotateX(-Math.PI * 0.5);
      g.rotateY(rotY);
      g.translate(x, y + 0.004, z);
      propAoGeoms.push(g);
    };

    // A. Signalized Intersection Mast Arms (on outer rounded concrete sidewalk corners, facing carriageway — ZERO signal masts in `z > 105` Visitor Forecourt!)
    const signalIntersections = [
      { ix: 0.0, iz: 76.0, corners: [[-1, -1], [1, 1]] },
      { ix: -118.0, iz: 76.0, corners: [[-1, -1], [1, -1]] },
      { ix: 0.0, iz: -18.0, corners: [[-1, -1], [1, 1]] },
      { ix: -118.0, iz: -18.0, corners: [[-1, 1], [1, 1]] },
      { ix: 0.0, iz: -86.0, corners: [[1, 1]] },
    ];
    for (const si of signalIntersections) {
      for (const [sx, sz] of si.corners) {
        const cf = INTERSECTION_CORNER_FILLETS.find(
          (c) => Math.abs(c.ix - si.ix) < 0.5 && Math.abs(c.iz - si.iz) < 0.5 && c.sx === sx && c.sz === sz
        );
        if (!cf) continue;
        // Place mast base on concrete sidewalk corner (`r = 1.35m` from `(cx, cz)`, well inside `3.06m` curb!)
        const px = cf.cx - sx * 0.95;
        const pz = cf.cz - sz * 0.95;
        const py = getOpenWorldEarthHeight(px, pz) + 0.094;
        // Orient mast so cantilevered arm reaches out over horizontal road (`-sx` direction)
        const rotY = sx > 0 ? -Math.PI * 0.5 : Math.PI * 0.5;
        this.signalPlacements.push({ x: px, y: py, z: pz, rotY, sx, sz });
        addPropAoPad(px, py, pz, 1.1, 1.1, rotY);
      }
    }

    // B. Modern Architectural Campus Streetlamps along Avenues & Waterfront Promenade
    for (const r of ACTIVE_ASPHALT_SEGMENTS) {
      const dx = r.x2 - r.x1;
      const dz = r.z2 - r.z1;
      const len = Math.hypot(dx, dz) || 1.0;
      const fx = dx / len;
      const fz = dz / len;
      const rx = -fz;
      const rz = fx;
      const step = 30.0;
      const count = Math.floor(len / step);
      for (let i = 1; i < count; i++) {
        const s = (i + 0.5) * (len / count);
        for (const side of [-1, 1]) {
          // Place on outer sidewalk edge (`halfW + 3.12m`, grounded on `+0.094m` concrete border)
          const lx = r.x1 + fx * s + rx * (side * (r.halfW + 3.12));
          const lz = r.z1 + fz * s + rz * (side * (r.halfW + 3.12));
          if (signedCarriagewayClearance(lx, lz) < 2.8) continue;
          if (Math.abs(lx) < 28.5 && lz > 118.0 && lz < 160.5) continue;
          if (lx < -143.0 && lz > 84.0) continue;
          let nearCorner = false;
          for (const it of CAMPUS_INTERSECTIONS) {
            if (Math.hypot(lx - it.x, lz - it.z) < 14.5) {
              nearCorner = true;
              break;
            }
          }
          if (nearCorner) continue;
          const ly = getOpenWorldEarthHeight(lx, lz) + 0.094;
          // Face luminaire arm inward toward road centerline (`(-rx * side, -rz * side)`)
          const rotY = Math.atan2(-rx * side, -rz * side);
          this.lampPlacements.push({ x: lx, y: ly, z: lz, rotY });
        }
      }
    }
    // Promenade lamps along west side of Bay View Waterfront
    for (const lz of [96.0, 56.0, 12.0, -42.0, -68.0]) {
      const lx = 147.6;
      const ly = getOpenWorldEarthHeight(lx, lz) + 0.018;
      this.lampPlacements.push({ x: lx, y: ly, z: lz, rotY: Math.PI * 0.5 });
    }

    // C. Benches, Architectural Planters, Hoop Bike Racks & Google 3-Stream Tri-Bins!
    //    (Gradient Canopy Hex-Paver Forecourt `|x| <= 27.2, z in [114.3, 159.5]` kept 100% free of loose clutter!)
    const streetClusters = [
      // Charleston Rd Sidewalks (`z = 76 ± 9.65m`, `yOff = 0.094m`)
      { x: -58.0, z: 66.35, yOff: 0.094, rotY: 0.0, kind: "bench" },
      { x: -54.5, z: 66.35, yOff: 0.094, rotY: 0.0, kind: "planter" },
      { x: -61.2, z: 66.35, yOff: 0.094, rotY: 0.0, kind: "tribins" },
      { x: 64.0, z: 66.35, yOff: 0.094, rotY: 0.0, kind: "bench" },
      { x: 68.0, z: 66.35, yOff: 0.094, rotY: 0.0, kind: "bikerack" },
      { x: 60.5, z: 66.35, yOff: 0.094, rotY: 0.0, kind: "planter" },
      { x: -86.5, z: 85.65, yOff: 0.094, rotY: Math.PI, kind: "bench" },
      { x: -90.0, z: 85.65, yOff: 0.094, rotY: Math.PI, kind: "planter" },
      { x: 42.0, z: 85.65, yOff: 0.094, rotY: Math.PI, kind: "bikerack" },
      { x: 45.2, z: 85.65, yOff: 0.094, rotY: Math.PI, kind: "tribins" },
      // Android Sculpture Plaza Perimeter (`z >= 88.5`, `yOff = 0.016m` — clear of cafe sets & Shot 5 camera track!)
      { x: -103.6, z: 92.5, yOff: 0.016, rotY: -Math.PI * 0.35, kind: "bench" },
      { x: -124.2, z: 88.6, yOff: 0.016, rotY: 0.0, kind: "planter" },
      { x: -104.2, z: 88.6, yOff: 0.016, rotY: 0.0, kind: "planter" },
      { x: -126.4, z: 106.4, yOff: 0.016, rotY: Math.PI * 0.5, kind: "tribins" },
      { x: -103.6, z: 99.5, yOff: 0.016, rotY: -Math.PI * 0.5, kind: "bikerack" },
      // Googleplex Stan Courtyard Outer Ring (`0` benches within `26.0m` of Stan plinth `(-118.0, -50.0)`) & Amphitheatre Pkwy
      { x: -101.2, z: -53.4, yOff: 0.016, rotY: 0.0, kind: "planter" },
      { x: -123.5, z: -33.6, yOff: 0.016, rotY: 0.0, kind: "bikerack" },
      { x: -114.6, z: -66.8, yOff: 0.016, rotY: 0.0, kind: "tribins" },
      { x: -46.0, z: -8.35, yOff: 0.094, rotY: Math.PI, kind: "bench" },
      { x: -42.5, z: -8.35, yOff: 0.094, rotY: Math.PI, kind: "planter" },
      { x: 58.0, z: -27.65, yOff: 0.094, rotY: 0.0, kind: "bench" },
      { x: 61.5, z: -27.65, yOff: 0.094, rotY: 0.0, kind: "bikerack" },
      { x: 54.8, z: -27.65, yOff: 0.094, rotY: 0.0, kind: "tribins" },
      // Bay View Waterfront Promenade & Shoreline Concourse (clear of `Gemini4_Carbon_Monument_V4` & zero duplicate bin at `(149.2, 58.0)`!)
      { x: 162.4, z: 46.0, yOff: 0.016, rotY: -Math.PI * 0.5, kind: "bench" },
      { x: 162.4, z: -4.0, yOff: 0.016, rotY: -Math.PI * 0.5, kind: "bench" },
      { x: 149.2, z: 66.8, yOff: 0.016, rotY: Math.PI * 0.5, kind: "bikerack" },
      { x: 149.2, z: 22.5, yOff: 0.016, rotY: Math.PI * 0.5, kind: "planter" },
      { x: 24.5, z: -182.0, yOff: 0.016, rotY: -Math.PI * 0.65, kind: "bench" },
      { x: 26.5, z: -173.5, yOff: 0.016, rotY: -Math.PI * 0.75, kind: "bench" },
      { x: 22.0, z: -176.0, yOff: 0.016, rotY: 0.0, kind: "planter" },
      { x: 28.0, z: -178.5, yOff: 0.016, rotY: -0.28, kind: "bikerack" },
    ];

    const rawTriBins = [];

    for (const sc of streetClusters) {
      if (sc.yOff < 0.05 && signedAsphaltClearance(sc.x, sc.z) < 0.5) continue;
      const py = getOpenWorldEarthHeight(sc.x, sc.z) + sc.yOff;
      const item = { x: sc.x, y: py, z: sc.z, rotY: sc.rotY };
      if (sc.kind === "bench") {
        if (Math.hypot(sc.x - -118.0, sc.z - -50.0) < 26.0) continue;
        this.benchPlacements.push(item);
      } else if (sc.kind === "planter") {
        this.planterPlacements.push(item);
      } else if (sc.kind === "bikerack") {
        this.bikeRackPlacements.push(item);
      } else if (sc.kind === "tribins") {
        rawTriBins.push({
          ...item,
          aoRotY: sc.rotY,
          aoW: 1.2,
          aoD: 0.75,
        });
      }
    }

    // Global `>= 18.0m` separation filter across ALL `triBinPlacements` (`mk_tribins` + `streetClusters`)!
    for (let i = 0; i < rawTriBins.length; i++) {
      const cand = rawTriBins[i];
      let tooClose = false;
      for (let j = 0; j < this.triBinPlacements.length; j++) {
        const prev = this.triBinPlacements[j];
        if (Math.hypot(cand.x - prev.x, cand.z - prev.z) < 18.0) {
          tooClose = true;
          break;
        }
      }
      if (!tooClose) {
        this.triBinPlacements.push({
          x: cand.x,
          y: cand.y,
          z: cand.z,
          rotY: cand.rotY,
          _aoRotY: cand.aoRotY,
          _aoW: cand.aoW,
          _aoD: cand.aoD,
        });
      }
    }

    // Also deduplicate `planterPlacements` (`>= 2.05m`) BEFORE generating AO shadow pads so V6 batching & AO pads match 1:1!
    const dedupedPlanters = [];
    for (let i = 0; i < this.planterPlacements.length; i++) {
      const p = this.planterPlacements[i];
      if (dedupedPlanters.every((q) => Math.hypot(q.x - p.x, q.z - p.z) >= 2.05)) {
        dedupedPlanters.push(p);
      }
    }
    this.planterPlacements = dedupedPlanters;

    // Emit `propAoGeoms` (`addPropAoPad`) strictly AFTER all deduplication, wall-clearance, and removal filters
    // so ZERO orphan dark AO shadow rectangles ever remain on empty pavement!
    for (const lp of this.lampPlacements) {
      addPropAoPad(lp.x, lp.y, lp.z, 0.85, 0.85, lp.rotY);
    }
    for (const bp of this.benchPlacements) {
      addPropAoPad(bp.x, bp.y, bp.z, 2.1, 0.9, bp.rotY);
    }
    for (const pp of this.planterPlacements) {
      addPropAoPad(pp.x, pp.y, pp.z, 1.30, 1.30, pp.rotY);
    }
    for (const rp of this.bikeRackPlacements) {
      addPropAoPad(rp.x, rp.y, rp.z, 1.8, 1.0, rp.rotY);
    }
    for (const tp of this.triBinPlacements) {
      addPropAoPad(tp.x, tp.y, tp.z, tp._aoW ?? 1.2, tp._aoD ?? 0.75, tp._aoRotY ?? tp.rotY);
    }

    // Permanent Contact AO Shadow Pads underneath all streetscape furniture (`1` draw call)
    if (propAoGeoms.length > 0 && this.materials.buildingContactShadow) {
      const mAo = mergeCampusStaticGeometries(propAoGeoms);
      if (mAo) {
        mAo.computeBoundingSphere();
        const aoM = new THREE.Mesh(mAo, this.materials.buildingContactShadow);
        aoM.renderOrder = 2;
        aoM.matrixAutoUpdate = false;
        aoM.updateMatrix();
        this.root.add(aoM);
      }
    }

    // Build Clean Enhanced Procedural Fallbacks inside `this.proceduralStreetFurnitureGroup`
    // (automatically hidden when `applyCampusEnvironmentV3Glb(envV3Scene)` attaches V3 GLBs!)
    const fbSteelGeoms = [];
    const fbTimberGeoms = [];
    const fbGraniteGeoms = [];
    const fbFoliageGeoms = [];
    const fbGlowGeoms = [];
    const fbBlueGeoms = [];
    const fbGreenGeoms = [];
    const fbDarkGeoms = [];

    for (const s of this.signalPlacements) {
      const gMast = new THREE.CylinderGeometry(0.11, 0.16, 5.8, 12);
      gMast.translate(0, 2.9, 0);
      const gArm = new THREE.CylinderGeometry(0.065, 0.095, 4.4, 10);
      gArm.rotateX(Math.PI * 0.5);
      gArm.translate(0, 5.55, 2.15);
      const gHead = new THREE.BoxGeometry(0.26, 0.92, 0.30);
      gHead.translate(0, 5.18, 3.85);
      for (const g of [gMast, gArm]) {
        g.rotateY(s.rotY);
        g.translate(s.x, s.y, s.z);
        fbSteelGeoms.push(g);
      }
      gHead.rotateY(s.rotY);
      gHead.translate(s.x, s.y, s.z);
      fbDarkGeoms.push(gHead);

      for (const lx of [-0.13, 0.13]) {
        const gLens = new THREE.SphereGeometry(0.085, 8, 8);
        gLens.translate(lx, 4.92, 3.85);
        gLens.rotateY(s.rotY);
        gLens.translate(s.x, s.y, s.z);
        fbGlowGeoms.push(gLens);
      }
    }

    for (const lp of this.lampPlacements) {
      const pole = new THREE.CylinderGeometry(0.065, 0.105, 4.8, 10);
      pole.translate(0, 2.4, 0);
      const arm = new THREE.BoxGeometry(0.09, 0.07, 1.05);
      arm.translate(0, 4.76, 0.46);
      for (const g of [pole, arm]) {
        g.rotateY(lp.rotY);
        g.translate(lp.x, lp.y, lp.z);
        fbSteelGeoms.push(g);
      }
      const led = new THREE.BoxGeometry(0.22, 0.04, 0.46);
      led.translate(0, 4.72, 0.78);
      led.rotateY(lp.rotY);
      led.translate(lp.x, lp.y, lp.z);
      fbGlowGeoms.push(led);
    }

    for (const bn of this.benchPlacements) {
      const seat = new THREE.BoxGeometry(1.76, 0.08, 0.52);
      seat.translate(0, 0.46, 0);
      const back = new THREE.BoxGeometry(1.76, 0.36, 0.07);
      back.rotateX(-0.16);
      back.translate(0, 0.72, -0.22);
      for (const g of [seat, back]) {
        g.rotateY(bn.rotY);
        g.translate(bn.x, bn.y, bn.z);
        fbTimberGeoms.push(g);
      }
      for (const lx of [-0.72, 0.72]) {
        const leg = new THREE.BoxGeometry(0.08, 0.44, 0.48);
        leg.translate(lx, 0.22, 0);
        leg.rotateY(bn.rotY);
        leg.translate(bn.x, bn.y, bn.z);
        fbSteelGeoms.push(leg);
      }
    }

    for (const pl of this.planterPlacements) {
      const tub = new THREE.BoxGeometry(1.06, 0.58, 1.06);
      tub.translate(0, 0.29, 0);
      tub.rotateY(pl.rotY);
      tub.translate(pl.x, pl.y, pl.z);
      fbGraniteGeoms.push(tub);
    }

    for (const br of this.bikeRackPlacements) {
      const rail = new THREE.BoxGeometry(1.48, 0.04, 0.22);
      rail.translate(0, 0.02, 0);
      rail.rotateY(br.rotY);
      rail.translate(br.x, br.y, br.z);
      fbSteelGeoms.push(rail);
      for (const hx of [-0.52, 0.0, 0.52]) {
        const hoop = new THREE.TorusGeometry(0.36, 0.032, 8, 16, Math.PI);
        hoop.rotateY(Math.PI * 0.5);
        hoop.translate(hx, 0.44, 0);
        hoop.rotateY(br.rotY);
        hoop.translate(br.x, br.y, br.z);
        fbSteelGeoms.push(hoop);
      }
    }

    for (const tb of this.triBinPlacements) {
      const body = new THREE.BoxGeometry(0.96, 0.78, 0.46);
      body.translate(0, 0.39, 0);
      body.rotateY(tb.rotY);
      body.translate(tb.x, tb.y, tb.z);
      fbSteelGeoms.push(body);
      const lids = [
        [-0.31, fbBlueGeoms],
        [0.0, fbGreenGeoms],
        [0.31, fbDarkGeoms],
      ];
      for (const [lx, arr] of lids) {
        const lid = new THREE.BoxGeometry(0.28, 0.08, 0.44);
        lid.translate(lx, 0.82, 0);
        lid.rotateY(tb.rotY);
        lid.translate(tb.x, tb.y, tb.z);
        arr.push(lid);
      }
    }

    const addFurnitureBatch = (geoms, mat, cast = true) => {
      const m = mergeCampusStaticGeometries(geoms);
      if (!m) return;
      m.computeBoundingSphere();
      const mesh = new THREE.Mesh(m, mat);
      mesh.castShadow = cast;
      mesh.receiveShadow = true;
      mesh.matrixAutoUpdate = false;
      mesh.updateMatrix();
      this.proceduralStreetFurnitureGroup.add(mesh);
    };

    addFurnitureBatch(fbSteelGeoms, this.materials.steelMullion, true);
    addFurnitureBatch(fbTimberGeoms, this.materials.cedarTimber, true);
    addFurnitureBatch(fbGraniteGeoms, this.materials.graniteCurb || this.materials.concreteCurb, true);
    addFurnitureBatch(fbFoliageGeoms, this.materials.foliageDeep, true);
    addFurnitureBatch(fbGlowGeoms, this.materials.clerestoryGlow, false);
    addFurnitureBatch(fbBlueGeoms, this.materials.umbrellaBlue, false);
    addFurnitureBatch(fbGreenGeoms, this.materials.umbrellaGreen, false);
    addFurnitureBatch(fbDarkGeoms, this.materials.gbikeTireRubber, true);
  }

  // ============================================================================
  // 10. ATTACH VERIFIED BLENDER 5.2 V2 GLB SUITES (`stan` + 4 V2 CAMPUS SUITES)
  // ============================================================================
  attachLandmarkAndGamePropGlbs({
    landmarksV2Scene = null,
    envV3Scene = null,
    campusEnvironmentV3Scene = null,
  } = {}) {
    const clampV2EnvIntensity = (rootObj) => {
      if (!rootObj) return;
      rootObj.traverse((ch) => {
        if (!ch.isMesh) return;
        ch.castShadow = true;
        ch.receiveShadow = true;
        const mats = Array.isArray(ch.material) ? ch.material : [ch.material];
        for (const m of mats) {
          if (m && (m.isMeshStandardMaterial || m.isMeshPhysicalMaterial)) {
            if ((m.metalness ?? 0.0) > 0.12 || (m.roughness ?? 1.0) < 0.35) {
              m.envMapIntensity = Math.min(m.envMapIntensity ?? 1.0, 0.55);
            } else {
              m.envMapIntensity = Math.min(m.envMapIntensity ?? 1.0, 0.68);
            }
          }
        }
      });
    };

    const findInScene = (sceneRoot, names) => {
      if (!sceneRoot) return null;
      const list = Array.isArray(names) ? names : [names];
      for (const nm of list) {
        const exact = sceneRoot.getObjectByName(nm);
        if (exact) return exact;
      }
      for (const nm of list) {
        let hit = null;
        sceneRoot.traverse((n) => {
          if (!hit && n.name && n.name.startsWith(nm)) hit = n;
        });
        if (hit) return hit;
      }
      return null;
    };

    const cloneShowcaseRootAtOrigin = (srcNode) => {
      const clone = srcNode.clone(true);
      clone.position.set(0, 0, 0);
      clone.rotation.set(0, 0, 0);
      clone.scale.set(1, 1, 1);
      clone.traverse((ch) => {
        if (ch.isMesh && ch.material) {
          ch.material = Array.isArray(ch.material)
            ? ch.material.map((m) => (m ? m.clone() : m))
            : ch.material.clone();
        }
      });
      clampV2EnvIntensity(clone);
      return clone;
    };

    // --------------------------------------------------------------------------
    // 1. `campus_landmarks_v2.glb`: Gradient Canopy, Bay View, Shoreline & Bridge
    // --------------------------------------------------------------------------
    if (landmarksV2Scene) {
      if (this.gradientCanopyFallback) {
        this.gradientCanopyFallback.visible = true;
      }
      if (this.bayViewFallback) {
        this.bayViewFallback.visible = true;
      }

      const remapMaterialTexturePixels = (meshRoot, pixelMutatorFn) => {
        const remappedTexByUuid = new Map();
        meshRoot.traverse((ch) => {
          if (!ch.isMesh || !ch.material) return;
          const mats = Array.isArray(ch.material) ? ch.material : [ch.material];
          for (const m of mats) {
            if (!m || !m.map || !m.map.image) continue;
            let nextTex = remappedTexByUuid.get(m.map.uuid);
            if (!nextTex) {
              const img = m.map.image;
              const w = img.width || img.videoWidth || 0;
              const h = img.height || img.videoHeight || 0;
              if (w > 0 && h > 0 && typeof document !== "undefined") {
                const cvs = document.createElement("canvas");
                cvs.width = w;
                cvs.height = h;
                const ctx = cvs.getContext("2d");
                ctx.drawImage(img, 0, 0, w, h);
                const imgData = ctx.getImageData(0, 0, w, h);
                const d = imgData.data;
                let changed = false;
                for (let p = 0; p < d.length; p += 4) {
                  if (pixelMutatorFn(d, p)) changed = true;
                }
                if (changed) {
                  ctx.putImageData(imgData, 0, 0);
                  nextTex = new THREE.CanvasTexture(cvs);
                  nextTex.colorSpace = m.map.colorSpace || THREE.SRGBColorSpace;
                  nextTex.flipY = m.map.flipY;
                  nextTex.wrapS = m.map.wrapS;
                  nextTex.wrapT = m.map.wrapT;
                  nextTex.needsUpdate = true;
                }
              }
              remappedTexByUuid.set(m.map.uuid, nextTex || m.map);
            }
            if (nextTex && nextTex !== m.map) {
              m.map = nextTex;
              m.needsUpdate = true;
            }
          }
        });
      };

      const bowlSrc = findInScene(landmarksV2Scene, [
        "Shoreline_Tensile_Bowl_V2",
        "Shoreline_Amphitheatre_V2",
      ]);
      if (bowlSrc) {
        const bowlClone = cloneShowcaseRootAtOrigin(bowlSrc);
        remapMaterialTexturePixels(bowlClone, (d, p) => {
          if (d[p] < 42 && d[p + 1] < 42 && d[p + 2] < 48) {
            d[p] = 52;
            d[p + 1] = 56;
            d[p + 2] = 70;
            return true;
          }
          return false;
        });
        const scale = this._emissiveScaleFactor ?? 1.0;
        bowlClone.traverse((ch) => {
          if (!ch.isMesh || !ch.material) return;
          const mats = Array.isArray(ch.material) ? ch.material : [ch.material];
          for (const m of mats) {
            if (m && (m.isMeshStandardMaterial || m.isMeshPhysicalMaterial)) {
              m.emissiveMap = null;
              m.emissive = new THREE.Color("#ffd099");
              m.emissiveIntensity = 0.05 * scale;
              m.needsUpdate = true;
              if (this._nightEmissives) {
                this._nightEmissives.push({ mat: m, baseIntensity: 0.05 });
              }
            }
          }
        });
        bowlClone.scale.setScalar(1.12);
        bowlClone.position.set(12.0, 0.22, -208.0);
        bowlClone.updateMatrixWorld(true);
        bowlClone.traverse((ch) => {
          if (!ch.isMesh || !ch.geometry || !ch.geometry.attributes?.position) return;
          const g = ch.geometry.clone();
          const posAttr = g.attributes.position;
          const mw = ch.matrixWorld;
          const invMw = new THREE.Matrix4().copy(mw).invert();
          const v = new THREE.Vector3();
          let touched = false;
          for (let i = 0; i < posAttr.count; i++) {
            v.fromBufferAttribute(posAttr, i).applyMatrix4(mw);
            const inConcourse =
              v.z > -192.0 ||
              (Math.hypot(v.x - 14.0, v.z - -188.0) < 24.4 && v.z > -200.5) ||
              Math.hypot(v.x - 14.0, v.z - -178.0) < 9.5;
            if (inConcourse && v.y < 0.72) {
              const maxAllowedY = getOpenWorldEarthHeight(v.x, v.z) + 0.016 - 0.08;
              if (v.y > maxAllowedY) {
                v.y = maxAllowedY;
                v.applyMatrix4(invMw);
                posAttr.setXYZ(i, v.x, v.y, v.z);
                touched = true;
              }
            }
          }
          if (touched) {
            posAttr.needsUpdate = true;
            g.computeBoundingBox();
            g.computeBoundingSphere();
            ch.geometry = g;
          }
        });
        bowlClone.matrixAutoUpdate = false;
        bowlClone.updateMatrix();
        if (this.shorelineFallback) this.shorelineFallback.visible = false;
        this.shorelineV2Group = bowlClone;
        this.root.add(bowlClone);
      }

      const bridgeSrc = findInScene(landmarksV2Scene, ["Stevens_Creek_Bridge_Arch_V2"]);
      if (bridgeSrc) {
        const brClone = cloneShowcaseRootAtOrigin(bridgeSrc);
        brClone.rotation.y = Math.atan2(34.0, 72.0);
        brClone.position.set(35.0, -0.328, -122.0);
        brClone.matrixAutoUpdate = false;
        brClone.updateMatrix();
        if (this.stevensBridgeGroup) this.stevensBridgeGroup.visible = false;
        this.stevensBridgeV2Group = brClone;
        this.root.add(brClone);
      }
    }

    // --------------------------------------------------------------------------
    // 2. V3 Campus Environment (`Campus_Environment_V3`)
    // --------------------------------------------------------------------------
    const v3EnvSrc = envV3Scene || campusEnvironmentV3Scene;
    if (v3EnvSrc) {
      this.applyCampusEnvironmentV3Glb(v3EnvSrc);
    }

    return true;
  }

  // Map-only mode: Waymo fleet methods removed.

  // ============================================================================
  // 10C. V3 ARCHITECTURAL BUILDINGS & STREETSCAPE FURNITURE (`Campus_Environment_V3`)
  // ============================================================================
  applyCampusEnvironmentV3Glb(envV3Scene) {
    if (!envV3Scene && !this._propsV4Scene) return false;
    if (envV3Scene) this._envV3Scene = envV3Scene;

    const searchRoots = [this._propsV4Scene, this._envV3Scene].filter(Boolean);
    const findEnvNode = (names) => {
      for (const nm of names) {
        for (const sr of searchRoots) {
          const exact = sr.getObjectByName(nm);
          if (exact) return exact;
        }
      }
      for (const nm of names) {
        for (const sr of searchRoots) {
          let hit = null;
          sr.traverse((n) => {
            if (!hit && n !== sr && n.name && n.name.startsWith(nm)) hit = n;
          });
          if (hit) return hit;
        }
      }
      return null;
    };

    const sharedMatClones = new Map();
    const cloneEnvMat = (m, isBotanicalTree = false) => {
      if (!m) return m;
      const cacheKey = `${m.uuid}_${isBotanicalTree ? "tree" : "env"}`;
      if (sharedMatClones.has(cacheKey)) return sharedMatClones.get(cacheKey);
      const cm = m.clone();
      if (cm.isMeshStandardMaterial || cm.isMeshPhysicalMaterial) {
        if (isBotanicalTree || (cm.name && cm.name.includes("Botanical_Trees"))) {
          cm.roughness = 0.78;
          cm.envMapIntensity = 0.45;
        } else {
          cm.envMapIntensity = Math.min(cm.envMapIntensity ?? 1.0, 0.58);
        }
      }
      sharedMatClones.set(cacheKey, cm);
      return cm;
    };

    const extractNormalizedTemplate = (
      srcNode,
      mode = "centered",
      nominalHeightRange = null,
      isBotanicalTree = false
    ) => {
      if (!srcNode) return null;
      const clone = srcNode.clone(true);
      clone.position.set(0, 0, 0);
      clone.rotation.set(0, 0, 0);
      clone.scale.set(1, 1, 1);
      clone.updateMatrixWorld(true);
      const rootInv = new THREE.Matrix4().copy(clone.matrixWorld).invert();

      const items = [];
      const box = new THREE.Box3();
      clone.traverse((ch) => {
        if (!ch.isMesh || !ch.geometry || !ch.material) return;
        const relM = new THREE.Matrix4().multiplyMatrices(rootInv, ch.matrixWorld);
        if (Array.isArray(ch.material)) {
          const groups = ch.geometry.groups || [];
          const baseNonIdx = ch.geometry.index ? ch.geometry.toNonIndexed() : ch.geometry.clone();
          baseNonIdx.applyMatrix4(relM);
          if (groups.length === 0) {
            baseNonIdx.computeBoundingBox();
            if (baseNonIdx.boundingBox) box.union(baseNonIdx.boundingBox);
            items.push({ geom: baseNonIdx, mat: cloneEnvMat(ch.material[0], isBotanicalTree) });
          } else {
            const srcIdx = ch.geometry.index;
            for (const grp of groups) {
              const mSlot = ch.material[grp.materialIndex];
              if (!mSlot || grp.count <= 0) continue;
              const subGeom = new THREE.BufferGeometry();
              for (const attrName of Object.keys(ch.geometry.attributes)) {
                const srcAttr = ch.geometry.attributes[attrName];
                const itemSize = srcAttr.itemSize;
                const outArr = new Float32Array(grp.count * itemSize);
                for (let k = 0; k < grp.count; k++) {
                  const vi = srcIdx ? srcIdx.getX(grp.start + k) : grp.start + k;
                  for (let c = 0; c < itemSize; c++) {
                    outArr[k * itemSize + c] = srcAttr.array[vi * itemSize + c];
                  }
                }
                subGeom.setAttribute(attrName, new THREE.BufferAttribute(outArr, itemSize));
              }
              subGeom.applyMatrix4(relM);
              subGeom.computeBoundingBox();
              if (subGeom.boundingBox) box.union(subGeom.boundingBox);
              items.push({ geom: subGeom, mat: cloneEnvMat(mSlot, isBotanicalTree) });
            }
          }
          return;
        }
        const g = ch.geometry.clone();
        g.applyMatrix4(relM);
        g.computeBoundingBox();
        if (g.boundingBox) box.union(g.boundingBox);
        items.push({ geom: g, mat: cloneEnvMat(ch.material, isBotanicalTree) });
      });
      if (items.length === 0 || box.isEmpty()) return null;

      const minY = box.min.y;
      const rawH = Math.max(0.05, box.max.y - box.min.y);
      let anchorX = 0.5 * (box.min.x + box.max.x);
      let anchorZ = 0.5 * (box.min.z + box.max.z);
      let alignRotY = 0.0;

      if (mode === "cantilever") {
        // Anchor `(0, 0, 0)` to the physical base plate on the sidewalk (`y - minY <= 0.42m`),
        // and rotate cantilevered arm to point along `+Z`!
        let bSumX = 0.0;
        let bSumZ = 0.0;
        let bCnt = 0;
        let tSumX = 0.0;
        let tSumZ = 0.0;
        let tCnt = 0;
        for (const it of items) {
          const pos = it.geom.attributes.position;
          for (let i = 0; i < pos.count; i++) {
            const vx = pos.getX(i);
            const vy = pos.getY(i) - minY;
            const vz = pos.getZ(i);
            if (vy <= Math.min(0.42, rawH * 0.14)) {
              bSumX += vx;
              bSumZ += vz;
              bCnt++;
            } else if (vy >= rawH * 0.65) {
              tSumX += vx;
              tSumZ += vz;
              tCnt++;
            }
          }
        }
        if (bCnt > 0) {
          anchorX = bSumX / bCnt;
          anchorZ = bSumZ / bCnt;
        }
        if (tCnt > 0) {
          const armDX = tSumX / tCnt - anchorX;
          const armDZ = tSumZ / tCnt - anchorZ;
          if (Math.hypot(armDX, armDZ) > 0.16) {
            alignRotY = -Math.atan2(armDX, armDZ);
          }
        }
      } else if (mode === "longX" || mode === "bench") {
        const wX = box.max.x - box.min.x;
        const dZ = box.max.z - box.min.z;
        if (dZ > wX * 1.18) {
          alignRotY = Math.PI * 0.5;
        }
      }

      let uniformScale = 1.0;
      if (nominalHeightRange && nominalHeightRange.length === 2) {
        const [minH, maxH] = nominalHeightRange;
        if (rawH < minH) uniformScale = minH / rawH;
        else if (rawH > maxH) uniformScale = maxH / rawH;
      }

      const normBox = new THREE.Box3();
      const wrap = new THREE.Group();
      for (const it of items) {
        it.geom.translate(-anchorX, -minY, -anchorZ);
        if (Math.abs(alignRotY) > 1e-4) {
          it.geom.rotateY(alignRotY);
        }
        if (Math.abs(uniformScale - 1.0) > 1e-4) {
          it.geom.scale(uniformScale, uniformScale, uniformScale);
        }
        it.geom.computeBoundingBox();
        if (it.geom.boundingBox) normBox.union(it.geom.boundingBox);
        // Preserve smooth Class-A / botanical Blender normals — NEVER overwrite existing GLB normals!
        if (!it.geom.attributes.normal) it.geom.computeVertexNormals();
        else it.geom.normalizeNormals();
        const m = new THREE.Mesh(it.geom, it.mat);
        m.castShadow = true;
        m.receiveShadow = true;
        wrap.add(m);
      }

      // Ensure bench backrest sits at `-Z` so seat faces `+Z` walkway!
      if (mode === "bench") {
        const hNorm = Math.max(0.05, normBox.max.y - normBox.min.y);
        let hiZSum = 0.0;
        let hiCnt = 0;
        for (const ch of wrap.children) {
          const pos = ch.geometry.attributes.position;
          for (let i = 0; i < pos.count; i++) {
            if (pos.getY(i) >= hNorm * 0.62) {
              hiZSum += pos.getZ(i);
              hiCnt++;
            }
          }
        }
        if (hiCnt > 0 && hiZSum / hiCnt > 0.03) {
          normBox.makeEmpty();
          for (const ch of wrap.children) {
            ch.geometry.rotateY(Math.PI);
            ch.geometry.computeBoundingBox();
            if (ch.geometry.boundingBox) normBox.union(ch.geometry.boundingBox);
          }
        }
      }

      bakeStaticGroupByMaterial(wrap);
      const prims = wrap.children
        .filter((c) => c.isMesh && c.geometry && c.material)
        .map((c) => ({ geometry: c.geometry, material: c.material }));

      return prims.length > 0
        ? {
            prims,
            srcW: Math.max(0.1, normBox.max.x - normBox.min.x),
            srcH: Math.max(0.1, normBox.max.y - normBox.min.y),
            srcD: Math.max(0.1, normBox.max.z - normBox.min.z),
          }
        : null;
    };

    // 1. Replace Procedural `CAMPUS_BUILDING_BLOCKS` with `Bldg_MassTimber_Pavilion_V3` & `Bldg_ModernGlass_Wing_V3`
    const timberBldgTpl = extractNormalizedTemplate(
      findEnvNode(["Bldg_MassTimber_Pavilion_V3", "Bldg_MassTimber_Pavilion"]),
      "centered"
    );
    const glassBldgTpl = extractNormalizedTemplate(
      findEnvNode(["Bldg_ModernGlass_Wing_V3", "Bldg_ModernGlass_Wing"]),
      "centered"
    );

    let installedBuildings = false;
    if (timberBldgTpl || glassBldgTpl) {
      if (this.envV3BuildingsGroup && this.envV3BuildingsGroup.parent) {
        this.envV3BuildingsGroup.parent.remove(this.envV3BuildingsGroup);
      }
      const v3BldgRoot = new THREE.Group();
      v3BldgRoot.name = "Campus_Environment_V3_Buildings";

      for (const b of CAMPUS_BUILDING_BLOCKS) {
        if (
          b.id === "bldg_gradient_canopy" ||
          b.id === "bldg_bayview_canopy" ||
          b.id === "bldg_bay_view" ||
          b.style === "dragonscale" ||
          b.style === "solar_carport"
        ) {
          continue;
        }
        const tpl =
          b.style === "timber"
            ? timberBldgTpl || glassBldgTpl
            : glassBldgTpl || timberBldgTpl;
        if (!tpl) continue;

        const bx = b.id === "bldg_north_commons" ? -32.0 : (b.cx ?? b.x ?? 0.0);
        const bz = b.cz ?? b.z ?? 0.0;
        const gy = getOpenWorldEarthHeight(bx, bz);
        const sx = b.wx ?? (b.halfX ? b.halfX * 2.0 : 28.0);
        const sz = b.wz ?? (b.halfZ ? b.halfZ * 2.0 : 24.0);
        const h = b.hy ?? b.heightM ?? 12.0;

        // Align template's longer horizontal axis along `X` (matching all 8 campus setbacks)
        const needQuarterTurn = tpl.srcD > tpl.srcW * 1.05;
        const baseYaw = needQuarterTurn ? Math.PI * 0.5 : 0.0;
        const avenueFlip = bz > 30.0 || (bz < -30.0 && bx < -100.0) ? 0.0 : Math.PI;
        const rotY = baseYaw + avenueFlip;

        const effW = needQuarterTurn ? tpl.srcD : tpl.srcW;
        const effD = needQuarterTurn ? tpl.srcW : tpl.srcD;
        const scaleX = (sx * 0.94) / Math.max(1.0, effW);
        const scaleZ = (sz * 0.94) / Math.max(1.0, effD);
        const scaleY = THREE.MathUtils.clamp(h / Math.max(1.0, tpl.srcH), 0.72, 1.48);

        const blockWrap = new THREE.Group();
        for (const pr of tpl.prims) {
          const m = new THREE.Mesh(pr.geometry.clone(), pr.material);
          m.castShadow = true;
          m.receiveShadow = true;
          blockWrap.add(m);
        }
        blockWrap.scale.set(scaleX, scaleY, scaleZ);
        blockWrap.rotation.y = rotY;
        blockWrap.position.set(bx, gy, bz);
        blockWrap.updateMatrixWorld(true);
        bakeStaticGroupByMaterial(blockWrap);
        blockWrap.traverse((ch) => {
          if (ch.isMesh && ch.geometry) ch.geometry.computeBoundingSphere();
        });
        blockWrap.userData.buildingId = b.id;
        blockWrap.userData.bx = bx;
        blockWrap.userData.bz = bz;
        v3BldgRoot.add(blockWrap);
      }

      if (v3BldgRoot.children.length > 0) {
        v3BldgRoot.matrixAutoUpdate = false;
        v3BldgRoot.updateMatrix();
        this.envV3BuildingsGroup = v3BldgRoot;
        this.root.add(v3BldgRoot);
        if (this.proceduralBuildingsGroup) {
          this.proceduralBuildingsGroup.visible = false;
        }
        installedBuildings = true;
      }
    }

    // 2. GPU-Instance V3 Streetscape Furniture (`Signals`, `Lamps`, `Benches`, `Planters`, `BikeRacks`, `TriBins`)
    const propConfigs = [
      {
        names: ["Traffic_Mast_V4", "Street_Signal_Mast_V3", "Street_Signal_Mast"],
        mode: "cantilever",
        range: [4.2, 7.8],
        placements: this.signalPlacements,
        castShadow: true,
      },
      {
        names: ["Street_Lamp_Modern_V3", "Street_Lamp_Modern"],
        mode: "cantilever",
        range: [3.6, 6.8],
        placements: this.lampPlacements,
        castShadow: true,
      },
      {
        names: ["Campus_Bench_V4", "Campus_Bench_V3", "Campus_Bench"],
        mode: "bench",
        range: [0.65, 1.18],
        placements: this.benchPlacements,
        castShadow: true,
      },
      ...(this._hasV6Planters
        ? []
        : [
            {
              names: ["Campus_Planter_V3", "Campus_Planter"],
              mode: "centered",
              range: [0.55, 1.65],
              placements: this.planterPlacements,
              castShadow: true,
            },
          ]),
      {
        names: ["Campus_Bike_Rack_V4", "Campus_BikeRack_V3", "Campus_BikeRack"],
        mode: "longX",
        range: [0.65, 1.15],
        placements: this.bikeRackPlacements,
        castShadow: false,
      },
      {
        names: ["Campus_TriBin_V3", "Campus_TriBin"],
        mode: "longX",
        range: [0.70, 1.25],
        placements: this.triBinPlacements,
        castShadow: false,
      },
    ];

    let installedPropsCount = 0;
    const v3PropsRoot = new THREE.Group();
    v3PropsRoot.name = "Campus_V3_Furniture_Batches";
    const newPropDynamicBatches = [];

    for (const cfg of propConfigs) {
      if (!cfg.placements || cfg.placements.length === 0) continue;
      const tpl = extractNormalizedTemplate(findEnvNode(cfg.names), cfg.mode, cfg.range);
      if (!tpl) continue;
      installedPropsCount++;

      for (let i = 0; i < cfg.placements.length; i++) {
        const pl = cfg.placements[i];
        if (!pl.mat4) {
          _pos.set(pl.x, pl.y, pl.z);
          _euler.set(0.0, pl.rotY || 0.0, 0.0);
          _quat.setFromEuler(_euler);
          _scale.setScalar(pl.scale || 1.0);
          pl.mat4 = new THREE.Matrix4().compose(_pos, _quat, _scale);
        }
      }

      let baseMeshIndex = 0;
      let lowestMinY = Infinity;
      for (let pIdx = 0; pIdx < tpl.prims.length; pIdx++) {
        const g = tpl.prims[pIdx].geometry;
        if (g && !g.boundingBox) g.computeBoundingBox();
        const minY = g?.boundingBox ? g.boundingBox.min.y : 0.0;
        if (minY < lowestMinY) {
          lowestMinY = minY;
          baseMeshIndex = pIdx;
        }
      }

      const meshes = [];
      for (let pIdx = 0; pIdx < tpl.prims.length; pIdx++) {
        const pr = tpl.prims[pIdx];
        const inst = new THREE.InstancedMesh(pr.geometry, pr.material, cfg.placements.length);
        // Only ground non-cantilevered base meshes (`Traffic_Mast` / `Street_Lamp` cantilever arms extend over asphalt!)
        inst.name =
          cfg.mode !== "cantilever" && pIdx === baseMeshIndex
            ? `${cfg.names[0]}_Base`
            : `${cfg.names[0]}_SubPart_ShadowLinked`;
        inst.castShadow = Boolean(cfg.castShadow) && !this.isSoftwareRenderer;
        inst.receiveShadow = true;
        inst.frustumCulled = false;
        for (let i = 0; i < cfg.placements.length; i++) {
          inst.setMatrixAt(i, cfg.placements[i].mat4);
        }
        inst.instanceMatrix.needsUpdate = true;
        v3PropsRoot.add(inst);
        meshes.push(inst);
      }
      newPropDynamicBatches.push({
        placements: cfg.placements,
        meshes,
        baseMeshIndex,
        mode: cfg.mode,
        castShadow: Boolean(cfg.castShadow) && !this.isSoftwareRenderer,
      });
    }

    if (installedPropsCount > 0) {
      if (this.envV3PropsGroup && this.envV3PropsGroup.parent) {
        this.envV3PropsGroup.parent.remove(this.envV3PropsGroup);
      }
      v3PropsRoot.matrixAutoUpdate = false;
      v3PropsRoot.updateMatrix();
      this.envV3PropsGroup = v3PropsRoot;
      this.propDynamicBatches = newPropDynamicBatches;
      this._cullForceRebuild = true;
      this.root.add(v3PropsRoot);
      if (this.proceduralStreetFurnitureGroup && installedPropsCount >= 4) {
        this.proceduralStreetFurnitureGroup.visible = false;
      }
    }

    // 3. GPU-Instance Blender 5.2 `Tree_CoastLiveOak_V3` & `Tree_CoastRedwood_V3` with Camera View-Cone Compaction!
    const liveOakTpl = extractNormalizedTemplate(
      findEnvNode(["Tree_CoastLiveOak_V3", "Tree_CoastLiveOak"]),
      "centered",
      null,
      true
    );
    const redwoodTpl = extractNormalizedTemplate(
      findEnvNode(["Tree_CoastRedwood_V3", "Tree_CoastRedwood"]),
      "centered",
      null,
      true
    );

    let installedTrees = false;
    if (!this._hasTreesV4 && (liveOakTpl || redwoodTpl) && (this.decTreeTransforms?.length || this.redTreeTransforms?.length)) {
      if (this.envV3TreesGroup && this.envV3TreesGroup.parent) {
        this.envV3TreesGroup.parent.remove(this.envV3TreesGroup);
      }
      const v3TreesRoot = new THREE.Group();
      v3TreesRoot.name = "Campus_Environment_V3_Botanical_Trees";
      const newTreeDynamicBatches = [];

      const buildTreeSpeciesBatch = (sourceTpl, transforms) => {
        if (!sourceTpl || !transforms || transforms.length === 0) return;
        for (let i = 0; i < transforms.length; i++) {
          const tr = transforms[i];
          if (!tr.mat4) {
            _pos.set(tr.x, tr.y, tr.z);
            _euler.set(0.0, tr.ry || 0.0, 0.0);
            _quat.setFromEuler(_euler);
            _scale.setScalar(tr.s || 1.0);
            tr.mat4 = new THREE.Matrix4().compose(_pos, _quat, _scale);
          }
        }
        const meshes = [];
        for (const pr of sourceTpl.prims) {
          const inst = new THREE.InstancedMesh(pr.geometry, pr.material, transforms.length);
          inst.castShadow = !this.isSoftwareRenderer;
          inst.receiveShadow = true;
          inst.frustumCulled = false;
          for (let i = 0; i < transforms.length; i++) {
            inst.setMatrixAt(i, transforms[i].mat4);
          }
          inst.instanceMatrix.needsUpdate = true;
          v3TreesRoot.add(inst);
          meshes.push(inst);
        }
        newTreeDynamicBatches.push({ transforms, meshes });
      };

      buildTreeSpeciesBatch(liveOakTpl || redwoodTpl, this.decTreeTransforms || []);
      buildTreeSpeciesBatch(redwoodTpl || liveOakTpl, this.redTreeTransforms || []);

      if (v3TreesRoot.children.length > 0) {
        v3TreesRoot.matrixAutoUpdate = false;
        v3TreesRoot.updateMatrix();
        this.envV3TreesGroup = v3TreesRoot;
        this.root.add(v3TreesRoot);
        this.treeDynamicBatches = newTreeDynamicBatches;
        this.treeQuadrantBatches = null;
        this._cullForceRebuild = true;
        if (this.proceduralTreesGroup) {
          this.proceduralTreesGroup.visible = false;
        }
        installedTrees = true;
      }
    }

    return installedBuildings || installedPropsCount > 0 || installedTrees;
  }

  // Map-only mode: Finale/Ramp/Statue V4 handlers removed.

  /**
   * Attaches Botanical `trees_v4.glb` (`Tree_CoastLiveOak_V4` & `Tree_CoastRedwood_V4`) with gnarled
   * root flares and dilated RGBA `MASK` branchlet/needle foliage cards across the 480m × 480m campus.
   */
  applyTreesV4Glb(treesV4Scene) {
    if (!treesV4Scene) return false;

    const findTreeNode = (names) => {
      for (const nm of names) {
        const exact = treesV4Scene.getObjectByName(nm);
        if (exact) return exact;
      }
      for (const nm of names) {
        let hit = null;
        treesV4Scene.traverse((n) => {
          if (!hit && n !== treesV4Scene && n.name && n.name.startsWith(nm)) hit = n;
        });
        if (hit) return hit;
      }
      return null;
    };

    const matMap = new Map();
    const prepTreeMat = (m, meshName = "") => {
      if (!m) return m;
      if (matMap.has(m.uuid)) return matMap.get(m.uuid);
      const cm = m.clone();
      const nm = `${cm.name || ""} ${meshName}`;
      const isFoliage =
        /Foliage|Leaf|Crown|Spray|Needle/i.test(nm) ||
        (cm.alphaTest ?? 0) > 0.01 ||
        Boolean(cm.transparent);
      if (cm.isMeshStandardMaterial || cm.isMeshPhysicalMaterial) {
        if (isFoliage) {
          cm.alphaTest = 0.42;
          cm.transparent = false;
          cm.depthWrite = true;
          cm.side = THREE.DoubleSide;
          cm.roughness = 0.68;
          cm.metalness = 0.0;
          cm.envMapIntensity = 0.54;
          cm.emissive = new THREE.Color("#1e3015");
          cm.emissiveIntensity = 0.0;
          if (this._treeFoliageMats) this._treeFoliageMats.push(cm);
        } else {
          cm.roughness = 0.88;
          cm.metalness = 0.0;
          cm.envMapIntensity = 0.42;
        }
        cm.needsUpdate = true;
      }
      matMap.set(m.uuid, cm);
      return cm;
    };

    const extractTreeSpecies = (srcNode) => {
      if (!srcNode) return null;
      const cl = srcNode.clone(true);
      cl.position.set(0, 0, 0);
      cl.rotation.set(0, 0, 0);
      cl.scale.set(1, 1, 1);
      cl.updateMatrixWorld(true);
      const rootInv = new THREE.Matrix4().copy(cl.matrixWorld).invert();
      const box = new THREE.Box3();
      const items = [];
      cl.traverse((ch) => {
        if (!ch.isMesh || !ch.geometry || !ch.material || Array.isArray(ch.material)) return;
        const relM = new THREE.Matrix4().multiplyMatrices(rootInv, ch.matrixWorld);
        const g = ch.geometry.clone();
        g.applyMatrix4(relM);
        g.computeBoundingBox();
        if (g.boundingBox) box.union(g.boundingBox);
        items.push({ geom: g, mat: prepTreeMat(ch.material, ch.name) });
      });
      if (!items.length || box.isEmpty()) return null;

      const anchorX = 0.5 * (box.min.x + box.max.x);
      const anchorZ = 0.5 * (box.min.z + box.max.z);
      const minY = box.min.y;
      const wrap = new THREE.Group();
      for (const it of items) {
        // Embed buttress roots -3.5cm into terrain for seamless grounding on gentle hills
        it.geom.translate(-anchorX, -minY - 0.035, -anchorZ);
        if (!it.geom.attributes.normal) it.geom.computeVertexNormals();
        else it.geom.normalizeNormals();
        wrap.add(new THREE.Mesh(it.geom, it.mat));
      }
      bakeStaticGroupByMaterial(wrap);
      const prims = wrap.children
        .filter((c) => c.isMesh && c.geometry && c.material)
        .map((c) => ({ geometry: c.geometry, material: c.material }));
      return prims.length ? { prims } : null;
    };

    const oakTpl = extractTreeSpecies(findTreeNode(["Tree_CoastLiveOak_V4", "Oak_TrunkAndLimbs_V4"]));
    const redwoodTpl = extractTreeSpecies(findTreeNode(["Tree_CoastRedwood_V4", "Redwood_TrunkAndBoughs_V4"]));
    if (!oakTpl && !redwoodTpl) return false;

    if (this.envV3TreesGroup && this.envV3TreesGroup.parent) {
      this.envV3TreesGroup.parent.remove(this.envV3TreesGroup);
    }
    const v4TreesRoot = new THREE.Group();
    v4TreesRoot.name = "Campus_Arboretum_Container";
    const newTreeDynamicBatches = [];

    const buildBatch = (tpl, transforms, speciesTag) => {
      if (!tpl || !transforms || !transforms.length) return;
      for (let i = 0; i < transforms.length; i++) {
        const tr = transforms[i];
        if (!tr.mat4) {
          _pos.set(tr.x, tr.y, tr.z);
          _euler.set(0.0, tr.ry || 0.0, 0.0);
          _quat.setFromEuler(_euler);
          _scale.setScalar(tr.s || 1.0);
          tr.mat4 = new THREE.Matrix4().compose(_pos, _quat, _scale);
        }
      }
      let baseMeshIndex = 0;
      let lowestMinY = Infinity;
      for (let pIdx = 0; pIdx < tpl.prims.length; pIdx++) {
        const g = tpl.prims[pIdx].geometry;
        if (g && !g.boundingBox) g.computeBoundingBox();
        const minY = g?.boundingBox ? g.boundingBox.min.y : 0.0;
        if (minY < lowestMinY) {
          lowestMinY = minY;
          baseMeshIndex = pIdx;
        }
      }
      const meshes = [];
      const farMeshes = [];
      for (let pIdx = 0; pIdx < tpl.prims.length; pIdx++) {
        const pr = tpl.prims[pIdx];
        const inst = new THREE.InstancedMesh(pr.geometry, pr.material, transforms.length);
        inst.name =
          pIdx === baseMeshIndex
            ? `${speciesTag}_TrunkBase`
            : `${speciesTag}_Canopy_ShadowLinked`;
        inst.castShadow = true;
        inst.receiveShadow = true;
        inst.frustumCulled = false;
        for (let i = 0; i < transforms.length; i++) {
          inst.setMatrixAt(i, transforms[i].mat4);
        }
        inst.instanceMatrix.needsUpdate = true;
        v4TreesRoot.add(inst);
        meshes.push(inst);

        // Paired far-view (>60m outside sun shadow frustum) non-shadow InstancedMesh — saves ~750k wasted shadow-map triangles!
        const farInst = new THREE.InstancedMesh(pr.geometry, pr.material, transforms.length);
        farInst.name = `${speciesTag}_FarView_${pIdx}`;
        farInst.userData.skipGroundingAudit = true;
        farInst.castShadow = false;
        farInst.receiveShadow = false;
        farInst.frustumCulled = false;
        farInst.count = 0;
        farInst.visible = false;
        v4TreesRoot.add(farInst);
        farMeshes.push(farInst);
      }
      newTreeDynamicBatches.push({ transforms, meshes, farMeshes, baseMeshIndex });
    };

    buildBatch(oakTpl || redwoodTpl, this.decTreeTransforms || [], "Tree_CoastLiveOak_V4");
    buildBatch(redwoodTpl || oakTpl, this.redTreeTransforms || [], "Tree_CoastRedwood_V4");

    if (v4TreesRoot.children.length > 0) {
      v4TreesRoot.matrixAutoUpdate = false;
      v4TreesRoot.updateMatrix();
      this.envV3TreesGroup = v4TreesRoot;
      this.root.add(v4TreesRoot);
      this.treeDynamicBatches = newTreeDynamicBatches;
      this.treeQuadrantBatches = null;
      this._cullForceRebuild = true;
      if (this.proceduralTreesGroup) {
        this.proceduralTreesGroup.visible = false;
      }
      this._hasTreesV4 = true;
      return true;
    }
    return false;
  }


  applyCampusHorizonArchV5Glb(archV5Scene) {
    if (!archV5Scene) return false;
    let pavilionProto = null;
    let bermProto = null;
    let ridgeProto = null;
    archV5Scene.traverse((ch) => {
      if (!pavilionProto && ch.name === "Campus_Office_Pavilion_V5") pavilionProto = ch;
      if (!bermProto && ch.name === "Courtyard_Landscape_Berm_V5") bermProto = ch;
      if (!ridgeProto && ch.name === "Santa_Cruz_Ridgeline_Arc_V5") ridgeProto = ch;
    });

    // 1. Replace boxy Googleplex, Android Visitor & Charleston office blocks + seal North-West Stan Courtyard background void!
    if (pavilionProto) {
      if (this.archV5PavilionsGroup) this.root.remove(this.archV5PavilionsGroup);
      const pavGroup = new THREE.Group();
      pavGroup.name = "Campus_V5_Container";

      const replaceIds = new Set([
        "bldg_plex_40",
        "bldg_plex_41",
        "bldg_plex_42",
        "bldg_visitor_timber",
        "bldg_charleston_sw",
        "bldg_charleston_se",
        "bldg_north_commons",
        "bldg_ai_compute_hub",
      ]);
      if (this.envV3BuildingsGroup) {
        for (const ch of this.envV3BuildingsGroup.children) {
          if (replaceIds.has(ch.userData?.buildingId)) {
            ch.userData.replacedByV5 = true;
            ch.visible = false;
          }
        }
      }

      const pavilionSpecs = [
        // Flanking Stan Courtyard (`(-118, -50)`) with 5-bay limestone colonnade & warm-lit 3D parallax rooms (left wing matches Omni Zone 3!)
        { id: "bldg_plex_40", x: -151.0, z: -58.0, sx: 0.86, sy: 1.04, sz: 1.08, rotY: 1.12 },
        { id: "bldg_plex_41", x: -72.0, z: -50.0, sx: 0.70, sy: 1.00, sz: 1.00, rotY: -Math.PI * 0.5 },
        // Courtyard NW Wings framing left & far-right while opening the center-right mountain window (`x = -114..-76`) to `Santa_Cruz_Ridgeline_Arc_V5`!
        { id: "bldg_plex_43_nw_center", x: -146.0, z: -96.0, sx: 0.96, sy: 1.02, sz: 0.98, rotY: 0.48 },
        { id: "bldg_plex_44_nw_east", x: -58.0, z: -88.0, sx: 0.96, sy: 0.98, sz: 0.94, rotY: -0.58 },
        // Android Lawn & Campus Avenue Tech Pavilions (`bldg_visitor_timber` replaces boxy V3 timber block right behind Android Lawn!)
        { id: "bldg_visitor_timber", x: -156.0, z: 104.0, sx: 0.94, sy: 0.92, sz: 0.88, rotY: Math.PI * 0.5 },
        { id: "bldg_plex_42", x: -60.0, z: 12.0, sx: 1.30, sy: 0.97, sz: 0.88, rotY: Math.PI },
        { id: "bldg_charleston_sw", x: -60.0, z: 46.0, sx: 1.38, sy: 0.95, sz: 0.94, rotY: 0.0 },
        { id: "bldg_charleston_se", x: 76.0, z: 46.0, sx: 1.62, sy: 0.98, sz: 0.94, rotY: 0.0 },
        { id: "bldg_north_commons", x: -32.0, z: -54.0, sx: 0.95, sy: 0.88, sz: 0.82, rotY: 0.0 },
        { id: "bldg_ai_compute_hub", x: 76.0, z: 12.0, sx: 1.54, sy: 1.04, sz: 0.94, rotY: Math.PI },
      ];

      // V6 De-Salmonize `Campus_Office_Pavilion`: remap cartoon salmon-peach spandrel texels (`#D9824B`)
      // to architectural warm limestone/travertine (`#B99B82`, roughness `0.80`, metalness `0.02`)!
      const pavilionMatMap = new Map();
      const upgradePavilionMaterial = (m) => {
        if (!m || (!m.isMeshStandardMaterial && !m.isMeshPhysicalMaterial)) return m;
        if (pavilionMatMap.has(m.uuid)) return pavilionMatMap.get(m.uuid);
        const cm = m.clone();
        const isGlass = /Glass/i.test(cm.name || "") || cm.transparent || (cm.roughness ?? 1) < 0.25;
        if (!isGlass) {
          cm.name = "V6_Campus_Pavilion_Limestone_Travertine";
          cm.roughness = Math.max(cm.roughness ?? 0.78, 0.78);
          cm.metalness = Math.min(cm.metalness ?? 0.02, 0.03);
          cm.envMapIntensity = Math.min(cm.envMapIntensity ?? 0.45, 0.42);
          if (cm.map && cm.map.image && typeof document !== "undefined") {
            const img = cm.map.image;
            const w = img.width || img.videoWidth || 0;
            const h = img.height || img.videoHeight || 0;
            if (w > 0 && h > 0) {
              const cvs = document.createElement("canvas");
              cvs.width = w;
              cvs.height = h;
              const ctx = cvs.getContext("2d");
              ctx.drawImage(img, 0, 0, w, h);
              const imData = ctx.getImageData(0, 0, w, h);
              const d = imData.data;
              for (let p = 0; p < d.length; p += 4) {
                const r = d[p];
                const g = d[p + 1];
                const b = d[p + 2];
                // Detect orange/salmon-peach spandrel band and convert to warm limestone/sandstone (#B99B82)
                if (r > 125 && r - b > 36 && r > g * 1.12) {
                  const luma = 0.299 * r + 0.587 * g + 0.114 * b;
                  const scaleL = THREE.MathUtils.clamp(luma / 158.0, 0.55, 1.28);
                  d[p] = Math.min(232, Math.round(185 * scaleL));
                  d[p + 1] = Math.min(220, Math.round(162 * scaleL));
                  d[p + 2] = Math.min(204, Math.round(136 * scaleL));
                }
              }
              ctx.putImageData(imData, 0, 0);
              const nextTex = new THREE.CanvasTexture(cvs);
              nextTex.colorSpace = cm.map.colorSpace || THREE.SRGBColorSpace;
              nextTex.wrapS = cm.map.wrapS;
              nextTex.wrapT = cm.map.wrapT;
              nextTex.flipY = cm.map.flipY;
              nextTex.anisotropy = 8;
              cm.map = nextTex;
            }
          }
        }
        pavilionMatMap.set(m.uuid, cm);
        return cm;
      };

      this._pavilionSpecsV6 = pavilionSpecs;
      for (const sp of pavilionSpecs) {
        const pav = pavilionProto.clone(true);
        pav.name = `Campus_Office_Pavilion_V5_${sp.id}`;
        const gy = getDefaultCampusSurfaceTopY(sp.x, sp.z, "pavilion");
        pav.scale.set(sp.sx, sp.sy, sp.sz);
        pav.rotation.set(0.0, sp.rotY, 0.0);
        pav.position.set(sp.x, gy, sp.z);
        pav.traverse((ch) => {
          if (ch.isMesh) {
            ch.material = Array.isArray(ch.material)
              ? ch.material.map(upgradePavilionMaterial)
              : upgradePavilionMaterial(ch.material);
            ch.castShadow = true;
            ch.receiveShadow = true;
          }
        });
        groundObjectToY(pav, gy, 0.0);
        pav.userData.bx = sp.x;
        pav.userData.bz = sp.z;
        pavGroup.add(pav);
      }
      this.archV5PavilionsGroup = pavGroup;
      this.root.add(pavGroup);
    }

    // 2. Sculpted Landscaped Grassy Earthwork Berms framing Stan Courtyard & Android Lawn
    //    V6 FIX: Replaces `Courtyard_Landscape_Berm_V5` (which baked low-poly tan icosahedron rocks & faceted bushes)
    //    with smooth subdivided turf mounds (`turfLawnPbr`), dressed by `Campus_Botanical_Kit_V6` boulders & shrubs!
    if (bermProto) {
      if (this.archV5BermsGroup) this.root.remove(this.archV5BermsGroup);
      const bermGroup = new THREE.Group();
      bermGroup.name = "Campus_Earthworks_Container";
      const bermSpecs = [
        { x: -136.5, z: -70.5, rotY: 0.52, sx: 1.22, sy: 1.15, sz: 1.15 },
        { x: -120.5, z: -76.8, rotY: 0.08, sx: 1.28, sy: 1.18, sz: 1.18 },
        { x: -102.0, z: -72.0, rotY: -0.32, sx: 1.30, sy: 1.20, sz: 1.20 },
        { x: -86.5, z: -73.5, rotY: -0.46, sx: 1.26, sy: 1.18, sz: 1.18 },
        { x: -143.5, z: -54.0, rotY: 1.38, sx: 1.08, sy: 1.04, sz: 1.05 },
        { x: -91.5, z: -54.0, rotY: -1.38, sx: 1.08, sy: 1.04, sz: 1.05 },
        { x: -142.0, z: 88.0, rotY: Math.PI * 0.5, sx: 1.08, sy: 1.04, sz: 1.06 },
      ];
      this._bermSpecsV6 = bermSpecs;
      const moundBaseGeom = new THREE.SphereGeometry(4.4, 28, 14, 0, Math.PI * 2, 0, Math.PI * 0.5);
      const mPos = moundBaseGeom.attributes.position;
      for (let vi = 0; vi < mPos.count; vi++) {
        const vx = mPos.getX(vi) * 1.52;
        const vy = Math.max(0.0, mPos.getY(vi) * 0.24);
        const vz = mPos.getZ(vi) * 0.88;
        const ripple = 1.0 + 0.08 * Math.sin(vx * 0.48 + vz * 0.62);
        mPos.setXYZ(vi, vx * ripple, vy, vz * ripple);
      }
      moundBaseGeom.computeVertexNormals();
      moundBaseGeom.computeBoundingBox();
      const bermTurfMat = this.materials.turfLawnPbr || this.materials.grassMeadow;

      for (let i = 0; i < bermSpecs.length; i++) {
        const bs = bermSpecs[i];
        const berm = new THREE.Group();
        berm.name = `Courtyard_Landscape_Berm_V6_${i}`;
        const moundMesh = new THREE.Mesh(moundBaseGeom, bermTurfMat);
        moundMesh.name = `Courtyard_Turf_Mound_V6_${i}`;
        moundMesh.castShadow = false;
        moundMesh.receiveShadow = true;
        berm.add(moundMesh);
        const gy = getDefaultCampusSurfaceTopY(bs.x, bs.z, "berm");
        berm.scale.set(bs.sx, bs.sy, bs.sz);
        berm.rotation.set(0.0, bs.rotY, 0.0);
        berm.position.set(bs.x, gy, bs.z);
        groundObjectToY(berm, gy, 0.0);
        berm.userData.bx = bs.x;
        berm.userData.bz = bs.z;
        bermGroup.add(berm);
      }
      this.archV5BermsGroup = bermGroup;
      this.root.add(bermGroup);
    }

    // 3. Full `360°` Panoramic Sculpted Santa Cruz & Diablo Mountain Ridgeline Arc (`Santa_Cruz_Ridgeline_Arc_V5`)
    //    V6 FIX: Kills "Play-Doh Green Hills" (`roughness = 0.96`, `metalness = 0.0`, `envMap = null`) with
    //    world-space California chaparral scrub, sedimentary sandstone strata, ravine AO, coastal blue haze,
    //    AND `Horizon_Foothill_Tree_Silhouettes_V6` (`InstancedMesh` of dark Coast Live Oak & Redwood ridge clusters)!
    if (ridgeProto) {
      if (this.archV5HorizonGroup) this.root.remove(this.archV5HorizonGroup);
      const ridgeGroup = new THREE.Group();
      ridgeGroup.name = "Horizon_Santa_Cruz_Mountains_V5";
      if (this.distantCrestMesh) this.distantCrestMesh.visible = false;
      if (this.foothillsMesh) this.foothillsMesh.visible = false;

      if (!OpenCampusWorld._scRidgeLutPair) {
        const LUT_N = 512;
        const maskData = new Uint8Array(LUT_N * LUT_N * 4);
        const gradData = new Uint8Array(LUT_N * LUT_N * 4);
        const hField = new Float32Array(LUT_N * LUT_N);

        const hashTile = (ix, iy, period, seed) => {
          const px = ((ix % period) + period) % period;
          const py = ((iy % period) + period) % period;
          let h = (Math.imul(px + 37, 374761393) ^ Math.imul(py + 91, 668265263) ^ Math.imul(seed, 1274126177)) >>> 0;
          h = Math.imul(h ^ (h >>> 13), 1274126177) >>> 0;
          return ((h ^ (h >>> 16)) >>> 0) / 4294967295.0;
        };
        const noiseTile = (u, v, period, seed) => {
          const x = u * period;
          const y = v * period;
          const ix = Math.floor(x);
          const iy = Math.floor(y);
          const fx = x - ix;
          const fy = y - iy;
          const ux = fx * fx * (3.0 - 2.0 * fx);
          const uy = fy * fy * (3.0 - 2.0 * fy);
          const a = hashTile(ix, iy, period, seed);
          const b = hashTile(ix + 1, iy, period, seed);
          const c = hashTile(ix, iy + 1, period, seed);
          const d = hashTile(ix + 1, iy + 1, period, seed);
          return (a + (b - a) * ux) + ((c + (d - c) * ux) - (a + (b - a) * ux)) * uy;
        };
        const fbmTile = (u, v, baseCycles, seedBase) => {
          let sum = 0.0;
          let amp = 0.52;
          let cyc = baseCycles;
          for (let o = 0; o < 4; o++) {
            const uOff = u + o * 0.173;
            const vOff = v + o * 0.291;
            sum += amp * noiseTile(uOff, vOff, cyc, seedBase + o * 97);
            cyc *= 2;
            amp *= 0.5;
          }
          return Math.max(0.0, Math.min(1.0, sum));
        };
        const ridgedTile = (u, v, baseCycles, seedBase) => {
          let sum = 0.0;
          let amp = 0.54;
          let cyc = baseCycles;
          for (let o = 0; o < 3; o++) {
            const n = 1.0 - Math.abs(2.0 * noiseTile(u + o * 0.317, v - o * 0.193, cyc, seedBase + o * 131) - 1.0);
            sum += amp * (n * n);
            cyc *= 2;
            amp *= 0.5;
          }
          return Math.max(0.0, Math.min(1.0, sum));
        };

        for (let y = 0; y < LUT_N; y++) {
          const v = y / LUT_N;
          for (let x = 0; x < LUT_N; x++) {
            const u = x / LUT_N;
            // Subtle domain warp across [0,1)^2 so zero axis alignment exists while remaining 100% seamless
            const wx = (noiseTile(u, v, 5, 11) - 0.5) * 0.045;
            const wy = (noiseTile(u, v, 5, 29) - 0.5) * 0.045;
            const uw = u + wx;
            const vw = v + wy;

            const macroPatch = fbmTile(uw, vw, 6, 101);
            const chapClump = fbmTile(uw + 0.13, vw - 0.21, 32, 211);
            const fineScrub = noiseTile(u * 1.0 + wx * 0.5, v * 1.0 + wy * 0.5, 118, 307);
            const canyonRidge = ridgedTile(uw - 0.07, vw + 0.19, 10, 409);
            const canyonFine = ridgedTile(uw * 1.0 + 0.23, vw * 1.0 - 0.17, 24, 613);
            const hummock = fbmTile(uw + 0.29, vw + 0.11, 28, 503);

            const idx = y * LUT_N + x;
            const compositeRidge = Math.max(0.0, Math.min(1.0, canyonRidge * 0.72 + canyonFine * 0.34));
            hField[idx] = compositeRidge * 3.15 + hummock * 1.25 + fineScrub * 0.34;

            const p4 = idx * 4;
            maskData[p4] = Math.round(macroPatch * 255);
            maskData[p4 + 1] = Math.round(chapClump * 255);
            maskData[p4 + 2] = Math.round(fineScrub * 255);
            maskData[p4 + 3] = Math.round(compositeRidge * 255);
          }
        }

        const worldTileM = 320.0;
        const cellM = worldTileM / LUT_N;
        for (let y = 0; y < LUT_N; y++) {
          const ym = (y - 1 + LUT_N) % LUT_N;
          const yp = (y + 1) % LUT_N;
          for (let x = 0; x < LUT_N; x++) {
            const xm = (x - 1 + LUT_N) % LUT_N;
            const xp = (x + 1) % LUT_N;
            const idx = y * LUT_N + x;
            const dHdx = (hField[y * LUT_N + xp] - hField[y * LUT_N + xm]) / (2.0 * cellM);
            const dHdz = (hField[yp * LUT_N + x] - hField[ym * LUT_N + x]) / (2.0 * cellM);
            const p4 = idx * 4;
            gradData[p4] = Math.round(Math.max(0.0, Math.min(1.0, 0.5 + dHdx / 4.2)) * 255);
            gradData[p4 + 1] = Math.round(Math.max(0.0, Math.min(1.0, 0.5 + dHdz / 4.2)) * 255);
            gradData[p4 + 2] = Math.round(Math.max(0.0, Math.min(1.0, hField[idx] / 4.8)) * 255);
            gradData[p4 + 3] = 255;
          }
        }

        const makeLutTex = (arr) => {
          const tex = new THREE.DataTexture(arr, LUT_N, LUT_N, THREE.RGBAFormat);
          tex.wrapS = THREE.RepeatWrapping;
          tex.wrapT = THREE.RepeatWrapping;
          tex.minFilter = THREE.LinearFilter;
          tex.magFilter = THREE.LinearFilter;
          tex.generateMipmaps = false;
          tex.needsUpdate = true;
          return tex;
        };
        OpenCampusWorld._scRidgeLutPair = {
          maskTex: makeLutTex(maskData),
          gradTex: makeLutTex(gradData),
        };
      }

      const { maskTex: scMaskTex, gradTex: scGradTex } = OpenCampusWorld._scRidgeLutPair;
      const tier1MatCache = new Map();
      const tier2MatCache = new Map();
      const getRidgeTierMaterial = (m, isTier2) => {
        if (!m || (!m.isMeshStandardMaterial && !m.isMeshPhysicalMaterial)) return m;
        const cache = isTier2 ? tier2MatCache : tier1MatCache;
        const key = isTier2 ? "tier2" : "tier1";
        if (cache.has(key)) return cache.get(key);
        // Clean world-space triplanar/planar MeshStandardMaterial (`map: null`) so ZERO stretched GLB UV seams ever survive!
        const cm = new THREE.MeshStandardMaterial({
          name: isTier2 ? "V7_Santa_Cruz_Ridgeline_Tier2" : "V7_Santa_Cruz_Ridgeline_Tier1",
          color: "#ffffff",
          roughness: 0.95,
          metalness: 0.0,
          envMap: null,
          envMapIntensity: 0.0,
        });
        cm.userData.v5AerialShaderInstalled = true;
        cm.userData.isCustomRidgeShaderV7 = true;
        cm.userData.scMaskTex = scMaskTex;
        cm.userData.scGradTex = scGradTex;
        cm.userData.isTier2 = Boolean(isTier2);
        cm.customProgramCacheKey = () =>
          isTier2 ? "v7_santa_cruz_chaparral_tier2_lut" : "v7_santa_cruz_chaparral_tier1_lut";
        cm.onBeforeCompile = (shader) => {
          shader.uniforms.uIsTier2 = { value: isTier2 ? 1.0 : 0.0 };
          shader.uniforms.uScMaskTex = { value: scMaskTex };
          shader.uniforms.uScGradTex = { value: scGradTex };
          shader.uniforms.uAtmoTint = this._atmoShaderUniforms.uAtmoTint;
          shader.uniforms.uHazeColor = this._atmoShaderUniforms.uHazeColor;
          shader.uniforms.uAtmoMix = this._atmoShaderUniforms.uAtmoMix;
          shader.vertexShader = shader.vertexShader
            .replace(
              "#include <common>",
              `#include <common>
              varying vec3 vScWorldPos;
              varying vec3 vScWorldNorm;`
            )
            .replace(
              "#include <worldpos_vertex>",
              `#include <worldpos_vertex>
              vec4 scWp = modelMatrix * vec4(transformed, 1.0);
              vScWorldPos = scWp.xyz;
              vScWorldNorm = normalize(mat3(modelMatrix) * objectNormal);`
            );
          shader.fragmentShader = shader.fragmentShader
            .replace(
              "#include <common>",
              `#include <common>
              uniform float uIsTier2;
              uniform sampler2D uScMaskTex;
              uniform sampler2D uScGradTex;
              uniform vec3 uAtmoTint;
              uniform vec3 uHazeColor;
              uniform float uAtmoMix;
              varying vec3 vScWorldPos;
              varying vec3 vScWorldNorm;`
            )
            .replace(
              "#include <map_fragment>",
              `#include <map_fragment>
              float scCanyonSaved = 0.5;
              {
                vec2 wpXZ = vScWorldPos.xz;
                mat2 scRot = mat2(0.80, -0.60, 0.60, 0.80);
                mat2 scRotFine = mat2(0.54, 0.84, -0.84, 0.54);
                vec2 uvPrimary = (wpXZ + vec2(vScWorldPos.y * 0.62, -vScWorldPos.y * 0.41)) * (1.0 / 320.0);
                vec2 uvDetail = (scRot * wpXZ + vec2(-vScWorldPos.y * 0.92, vScWorldPos.y * 0.68)) * (1.0 / 118.0);
                vec2 uvMicro = (scRotFine * wpXZ + vec2(vScWorldPos.y * 1.35, vScWorldPos.y * 0.95)) * (1.0 / 49.0);
                vec4 mA = texture2D(uScMaskTex, uvPrimary);
                vec4 mB = texture2D(uScMaskTex, uvDetail);
                vec4 mC = texture2D(uScMaskTex, uvMicro);

                float macroPatch = mix(mA.r, mB.r, 0.34);
                float chapClump = mix(mix(mA.g, mB.g, 0.48), mC.g, 0.28);
                float fineScrub = mix(mB.b, mC.b, 0.58);
                float canyonRidge = mix(mix(mA.a, mB.a, 0.40), mC.a, 0.22);
                scCanyonSaved = canyonRidge;
                float ravineAO = smoothstep(0.14, 0.76, canyonRidge * 0.82 + macroPatch * 0.24);

                vec3 wN = normalize(vScWorldNorm + 1e-6);
                float steepness = clamp(1.0 - abs(wN.y), 0.0, 1.0);
                float heightFrac = clamp((vScWorldPos.y - 2.0) / (uIsTier2 > 0.5 ? 78.0 : 52.0), 0.0, 1.0);

                vec3 deepOak = vec3(0.032, 0.049, 0.020);
                vec3 chaparralOlive = vec3(0.095, 0.112, 0.064);
                vec3 goldenOat = vec3(0.355, 0.278, 0.124);
                vec3 ochreSandstone = vec3(0.335, 0.242, 0.152);
                vec3 paleStrataLedge = vec3(0.455, 0.365, 0.248);

                float oatMix = smoothstep(0.34, 0.74, macroPatch * 0.62 + heightFrac * 0.36 + ravineAO * 0.22);
                vec3 hillBase = mix(chaparralOlive, goldenOat, oatMix);
                float oakCanopyMask = smoothstep(0.40, 0.70, chapClump * 0.68 + fineScrub * 0.32 + (1.0 - ravineAO) * 0.34);
                hillBase = mix(hillBase, deepOak, oakCanopyMask * 0.88);

                float strataPhase = vScWorldPos.y * 0.22 + wpXZ.x * 0.032 - wpXZ.y * 0.024 + canyonRidge * 5.5 + macroPatch * 3.8;
                float strataCoarse = 0.5 + 0.5 * sin(strataPhase);
                float strataFine = 0.5 + 0.5 * sin(strataPhase * 2.3 - chapClump * 3.6);
                float strataBench = smoothstep(0.58, 0.88, strataCoarse * 0.68 + strataFine * 0.32);
                float rockMask = smoothstep(0.62, 0.86, steepness) * (1.0 - oakCanopyMask);
                vec3 rockCol = mix(ochreSandstone, paleStrataLedge, strataBench);
                hillBase = mix(hillBase, rockCol, rockMask * 0.26);

                hillBase *= mix(0.30, 1.16, ravineAO);
                diffuseColor.rgb = hillBase * uAtmoTint;

                float camDist = length(vScWorldPos.xz - cameraPosition.xz);
                float distHaze = smoothstep(245.0, 540.0, camDist);
                float hazeFactor = uIsTier2 > 0.5
                  ? clamp(0.30 + 0.16 * distHaze - heightFrac * 0.05, 0.24, 0.48)
                  : clamp(0.10 + 0.15 * distHaze - heightFrac * 0.04, 0.07, 0.26);
                vec3 dayCoastalHaze = mix(vec3(0.285, 0.348, 0.372), vec3(0.545, 0.578, 0.565), clamp(heightFrac * 0.85, 0.0, 1.0));
                vec3 coastalHaze = mix(dayCoastalHaze, uHazeColor, clamp(uAtmoMix, 0.0, 1.0));
                diffuseColor.rgb = mix(diffuseColor.rgb, coastalHaze, clamp(hazeFactor + uAtmoMix * 0.18, 0.0, 0.88));
              }`
            )
            .replace(
              "#include <normal_fragment_maps>",
              `#include <normal_fragment_maps>
              {
                vec3 scWn = normalize(vScWorldNorm + vec3(0.0, 1e-5, 0.0));
                mat2 scRotN = mat2(0.80, -0.60, 0.60, 0.80);
                mat2 scRotF = mat2(0.54, 0.84, -0.84, 0.54);
                vec2 uvG1 = (vScWorldPos.xz + vec2(vScWorldPos.y * 0.62, -vScWorldPos.y * 0.41)) * (1.0 / 320.0);
                vec2 uvG2 = (scRotN * vScWorldPos.xz + vec2(-vScWorldPos.y * 0.92, vScWorldPos.y * 0.68)) * (1.0 / 118.0);
                vec2 uvG3 = (scRotF * vScWorldPos.xz + vec2(vScWorldPos.y * 1.35, vScWorldPos.y * 0.95)) * (1.0 / 49.0);
                vec2 g1 = (texture2D(uScGradTex, uvG1).rg - 0.5) * 4.2;
                vec2 g2 = mat2(0.80, 0.60, -0.60, 0.80) * ((texture2D(uScGradTex, uvG2).rg - 0.5) * 4.2);
                vec2 g3 = mat2(0.54, -0.84, 0.84, 0.54) * ((texture2D(uScGradTex, uvG3).rg - 0.5) * 4.2);
                vec2 gXZ = g1 * 0.58 + g2 * 0.48 + g3 * 0.28;
                vec3 gradH = vec3(gXZ.x, 0.0, gXZ.y);
                vec3 surfGrad = gradH - scWn * dot(gradH, scWn);
                float bumpAmp = uIsTier2 > 0.5 ? 3.15 : 4.25;
                vec3 pertWn = normalize(scWn - surfGrad * bumpAmp);
                normal = normalize((viewMatrix * vec4(pertWn, 0.0)).xyz);
              }`
            )
            .replace(
              "#include <roughnessmap_fragment>",
              `#include <roughnessmap_fragment>
              roughnessFactor = 0.95;`
            );
        };
        cm.needsUpdate = true;
        cache.set(key, cm);
        return cm;
      };

      // Full `360°` Two-Tier Sculpted Foothills (`R ~ 282-292m`, front toe `> 252m` strictly behind all campus trees!)
      // + High Santa Cruz & Diablo Skyline (`R ~ 384-398m`, 12 overlapping segments = ZERO horizon gaps & ZERO tree intersections!)
      const ridgeArcSpecs = [
        // Tier 1: Mid-Horizon Foothills (`12` overlapping segments every `30°` at `R = 284-292m` — strictly outside all `<= 244m` perimeter groves!)
        { azDeg: 0, r: 284, sx: 2.66, sy: 1.82, sz: 1.72, y: -0.55 },
        { azDeg: 30, r: 286, sx: 2.66, sy: 1.80, sz: 1.72, y: -0.55 },
        { azDeg: 60, r: 288, sx: 2.68, sy: 1.80, sz: 1.72, y: -0.55 },
        { azDeg: 90, r: 290, sx: 2.68, sy: 1.82, sz: 1.72, y: -0.55 },
        { azDeg: 120, r: 288, sx: 2.66, sy: 1.82, sz: 1.72, y: -0.55 },
        { azDeg: 150, r: 286, sx: 2.66, sy: 1.84, sz: 1.72, y: -0.55 },
        { azDeg: 180, r: 282, sx: 2.66, sy: 1.92, sz: 1.74, y: -0.50 },
        { azDeg: 210, r: 280, sx: 2.68, sy: 1.98, sz: 1.76, y: -0.48 },
        { azDeg: 240, r: 284, sx: 2.68, sy: 1.94, sz: 1.74, y: -0.50 },
        { azDeg: 270, r: 286, sx: 2.66, sy: 1.88, sz: 1.72, y: -0.52 },
        { azDeg: 300, r: 286, sx: 2.66, sy: 1.86, sz: 1.72, y: -0.52 },
        { azDeg: 330, r: 284, sx: 2.66, sy: 1.84, sz: 1.72, y: -0.55 },
        // Tier 2: High Santa Cruz & Diablo Skyline (`12` overlapping segments every `30°` at `R = 384-398m` — zero gaps, natural aspect!)
        { azDeg: 0, r: 390, sx: 3.76, sy: 2.74, sz: 2.54, y: -1.30, tier2: true },
        { azDeg: 30, r: 394, sx: 3.78, sy: 2.76, sz: 2.54, y: -1.30, tier2: true },
        { azDeg: 60, r: 396, sx: 3.80, sy: 2.80, sz: 2.56, y: -1.30, tier2: true },
        { azDeg: 90, r: 396, sx: 3.80, sy: 2.82, sz: 2.56, y: -1.30, tier2: true },
        { azDeg: 120, r: 394, sx: 3.78, sy: 2.78, sz: 2.54, y: -1.30, tier2: true },
        { azDeg: 150, r: 392, sx: 3.76, sy: 2.74, sz: 2.54, y: -1.30, tier2: true },
        { azDeg: 180, r: 386, sx: 3.76, sy: 2.74, sz: 2.54, y: -1.28, tier2: true },
        { azDeg: 210, r: 382, sx: 3.76, sy: 2.82, sz: 2.56, y: -1.25, tier2: true },
        { azDeg: 240, r: 382, sx: 3.78, sy: 2.90, sz: 2.58, y: -1.25, tier2: true },
        { azDeg: 270, r: 386, sx: 3.78, sy: 2.92, sz: 2.58, y: -1.25, tier2: true },
        { azDeg: 300, r: 388, sx: 3.78, sy: 2.84, sz: 2.56, y: -1.26, tier2: true },
        { azDeg: 330, r: 390, sx: 3.76, sy: 2.78, sz: 2.54, y: -1.28, tier2: true },
      ];
      for (let i = 0; i < ridgeArcSpecs.length; i++) {
        const rs = ridgeArcSpecs[i];
        const mx = rs.x !== undefined ? rs.x : Math.sin((rs.azDeg * Math.PI) / 180.0) * rs.r;
        const mz = rs.z !== undefined ? rs.z : Math.cos((rs.azDeg * Math.PI) / 180.0) * rs.r;
        const isTier2 = Boolean(rs.tier2);
        const seg = ridgeProto.clone(true);
        seg.name = `Horizon_Mountain_Segment_${i}`;
        seg.scale.set(rs.sx, rs.sy, rs.sz);
        seg.position.set(mx, rs.y, mz);
        seg.rotation.set(0.0, Math.atan2(-mx, -mz), 0.0);
        seg.userData.mx = mx;
        seg.userData.mz = mz;
        seg.traverse((ch) => {
          if (ch.isMesh) {
            ch.name = `Horizon_Mountain_Mesh_${i}`;
            ch.material = Array.isArray(ch.material)
              ? ch.material.map((m) => getRidgeTierMaterial(m, isTier2))
              : getRidgeTierMaterial(ch.material, isTier2);
            ch.castShadow = false;
            ch.receiveShadow = false;
            if (ch.geometry && !ch.geometry.boundingSphere) {
              ch.geometry.computeBoundingSphere();
            }
            ch.frustumCulled = true;
          }
        });
        ridgeGroup.add(seg);
      }

      // Scatter `Horizon_Foothill_Tree_Silhouettes_V6`: Real Blender 5.2 `Tree_CoastLiveOak_V4` & `Tree_CoastRedwood_V4`
      // groves (with organic multi-lobe Coast Live Oak broadleaf fallback — ZERO sphere+cone onion domes!)
      // rooted deeply into gentle upper/mid Santa Cruz foothill slopes (`wnTmp.y >= 0.72`) with coastal blue aerial haze!
      ridgeGroup.updateMatrixWorld(true);
      {
        const rng = createMulberry32(0x5ca17a06);
        const applyFoothillHazeMat = (() => {
          const cache = new Map();
          return (srcMat, keySuffix) => {
            if (!srcMat) return srcMat;
            if (cache.has(srcMat.uuid)) return cache.get(srcMat.uuid);
            const m = srcMat.clone();
            m.name = `V6_Horizon_Foothill_Tree_Silhouettes_Mat_${keySuffix}`;
            m.roughness = 0.95;
            m.metalness = 0.0;
            m.envMap = null;
            m.envMapIntensity = 0.0;
            if (m.alphaTest && m.alphaTest > 0.01) {
              m.transparent = false;
              m.depthWrite = true;
              m.side = THREE.DoubleSide;
            }
            m.customProgramCacheKey = () => `v6_foothill_tree_haze_${keySuffix}`;
            m.onBeforeCompile = (shader) => {
              shader.uniforms.uAtmoTint = this._atmoShaderUniforms.uAtmoTint;
              shader.uniforms.uHazeColor = this._atmoShaderUniforms.uHazeColor;
              shader.uniforms.uAtmoMix = this._atmoShaderUniforms.uAtmoMix;
              shader.vertexShader = shader.vertexShader
                .replace("#include <common>", `#include <common>\nvarying vec3 vFtWorldPos;`)
                .replace(
                  "#include <worldpos_vertex>",
                  `#include <worldpos_vertex>
                  vec4 ftWp = vec4(transformed, 1.0);
                  #ifdef USE_INSTANCING
                    ftWp = instanceMatrix * ftWp;
                  #endif
                  ftWp = modelMatrix * ftWp;
                  vFtWorldPos = ftWp.xyz;`
                );
              shader.fragmentShader = shader.fragmentShader
                .replace(
                  "#include <common>",
                  `#include <common>
                  uniform vec3 uAtmoTint;
                  uniform vec3 uHazeColor;
                  uniform float uAtmoMix;
                  varying vec3 vFtWorldPos;`
                )
                .replace(
                  "#include <map_fragment>",
                  `#include <map_fragment>
                  {
                    diffuseColor.rgb = diffuseColor.rgb * 0.64 * uAtmoTint;
                    float ftDist = length(vFtWorldPos.xz - cameraPosition.xz);
                    float ftHeightFrac = clamp((vFtWorldPos.y - 2.0) / 52.0, 0.0, 1.0);
                    float ftDistHaze = smoothstep(230.0, 520.0, ftDist);
                    float ftHaze = clamp(0.16 + 0.22 * ftDistHaze - ftHeightFrac * 0.04, 0.12, 0.38);
                    vec3 dayFtHaze = mix(vec3(0.265, 0.345, 0.380), vec3(0.520, 0.585, 0.595), clamp(ftHeightFrac * 0.85, 0.0, 1.0));
                    vec3 ftCoastalHaze = mix(dayFtHaze, uHazeColor, clamp(uAtmoMix, 0.0, 1.0));
                    diffuseColor.rgb = mix(diffuseColor.rgb, ftCoastalHaze, clamp(ftHaze + uAtmoMix * 0.18, 0.0, 0.88));
                  }`
                );
            };
            cache.set(srcMat.uuid, m);
            return m;
          };
        })();

        const oakMatrices = [];
        const redwoodMatrices = [];
        const wpTmp = new THREE.Vector3();
        const wnTmp = new THREE.Vector3();
        const dummyTree = new THREE.Object3D();

        // Collect all Tier 1 mountain meshes (`sIdx < 12`) for 5-ray downward footprint verification (ZERO sky floaters!)
        const tier1RidgeMeshes = [];
        for (let sIdx = 0; sIdx < Math.min(12, ridgeGroup.children.length); sIdx++) {
          ridgeGroup.children[sIdx].updateMatrixWorld(true);
          ridgeGroup.children[sIdx].traverse((m) => {
            if (m.isMesh && m.geometry?.attributes?.position) tier1RidgeMeshes.push(m);
          });
        }
        const treeRaycaster = new THREE.Raycaster();
        const downDir = new THREE.Vector3(0.0, -1.0, 0.0);
        const rayOrig = new THREE.Vector3();
        const footprintOffsets = [
          [1.8, 0.0],
          [-1.8, 0.0],
          [0.0, 1.8],
          [0.0, -1.8],
        ];

        // Place silhouette groves ONLY on Tier 1 foothill benches (`sIdx < 12`, `0` Redwoods on Tier 2!)
        for (let sIdx = 0; sIdx < Math.min(12, ridgeGroup.children.length); sIdx++) {
          const seg = ridgeGroup.children[sIdx];
          const targetPerSeg = 26;
          let meshHit = null;
          seg.traverse((m) => {
            if (!meshHit && m.isMesh && m.geometry?.attributes?.position) meshHit = m;
          });
          if (!meshHit) continue;
          const posAttr = meshHit.geometry.attributes.position;
          const normAttr = meshHit.geometry.attributes.normal;
          const vCount = posAttr.count;
          const nMat = new THREE.Matrix3().getNormalMatrix(meshHit.matrixWorld);
          let placed = 0;
          for (let attempt = 0; attempt < targetPerSeg * 28 && placed < targetPerSeg; attempt++) {
            const vi = Math.floor(rng() * vCount);
            wpTmp.fromBufferAttribute(posAttr, vi).applyMatrix4(meshHit.matrixWorld);
            if (wpTmp.y < 7.5 || wpTmp.y > 33.0) continue;
            const rDist = Math.hypot(wpTmp.x, wpTmp.z);
            if (rDist < 266.0) continue;
            if (normAttr) {
              wnTmp.fromBufferAttribute(normAttr, vi).applyMatrix3(nMat).normalize();
              // Seat strictly on gentle upper/mid ridge benches (`wnTmp.y >= 0.80`) so ZERO trees cling to steep cliffs!
              if (wnTmp.y < 0.80) continue;
            }
            // Exact 5-ray downward surface verification against `Horizon_Mountain_Mesh_*` -> ZERO floating or overhanging trees!
            rayOrig.set(wpTmp.x, wpTmp.y + 40.0, wpTmp.z);
            treeRaycaster.set(rayOrig, downDir);
            const centerHits = treeRaycaster.intersectObjects(tier1RidgeMeshes, false);
            if (centerHits.length === 0) continue;
            const surfY = centerHits[0].point.y;
            if (Math.abs(surfY - wpTmp.y) > 0.30) continue;
            let footprintSolid = true;
            for (let f = 0; f < footprintOffsets.length; f++) {
              rayOrig.set(
                wpTmp.x + footprintOffsets[f][0],
                surfY + 40.0,
                wpTmp.z + footprintOffsets[f][1]
              );
              treeRaycaster.set(rayOrig, downDir);
              const fHits = treeRaycaster.intersectObjects(tier1RidgeMeshes, false);
              if (fHits.length === 0 || fHits[0].point.y < surfY - 1.15) {
                footprintSolid = false;
                break;
              }
            }
            if (!footprintSolid) continue;

            const isRedwood = rng() < 0.22 && surfY < 25.0;
            const sc = 0.30 + rng() * 0.16;
            // Sink trunk `-1.95m * sc` deeply into the verified mountain surface!
            dummyTree.position.set(wpTmp.x, surfY - 1.95 * sc, wpTmp.z);
            dummyTree.rotation.set(0.0, rng() * Math.PI * 2.0, 0.0);
            dummyTree.scale.set(
              sc * (0.94 + rng() * 0.18),
              sc * (isRedwood ? 0.82 + rng() * 0.24 : 0.78 + rng() * 0.22),
              sc * (0.94 + rng() * 0.18)
            );
            dummyTree.updateMatrix();
            if (isRedwood) redwoodMatrices.push(dummyTree.matrix.clone());
            else oakMatrices.push(dummyTree.matrix.clone());
            placed++;
          }
        }

        let primarySilInst = null;
        this.horizonTreeDynamicBatches = [];
        this.horizonTreesStaticGroup = null;
        {
          // PRIORITY 0.3A: Partition distant R=266-360m foothill trees into 8 static azimuthal quadrant
          // `InstancedMesh`es with exact precomputed world `boundingBox` & `boundingSphere` and `frustumCulled = true`!
          // Matrices upload ONCE at creation (`0` per-frame JS matrix loops, `0` per-frame GPU buffer uploads!).
          const allMats = [...oakMatrices, ...redwoodMatrices];
          if (allMats.length > 0) {
            const oakParts = [];
            const pushOakLobe = (rx, ry, rz, ox, oy, oz, hex) => {
              const g = new THREE.SphereGeometry(1.0, 9, 7).toNonIndexed();
              g.scale(rx, ry, rz);
              g.translate(ox, oy, oz);
              const cnt = g.attributes.position.count;
              const cols = new Float32Array(cnt * 3);
              const c = new THREE.Color(hex);
              for (let k = 0; k < cnt; k++) {
                cols[k * 3] = c.r;
                cols[k * 3 + 1] = c.g;
                cols[k * 3 + 2] = c.b;
              }
              g.setAttribute("color", new THREE.BufferAttribute(cols, 3));
              oakParts.push(g);
            };
            pushOakLobe(4.2, 2.1, 3.8, 0.0, 2.8, 0.0, "#25331f");
            pushOakLobe(3.1, 1.8, 2.9, 2.4, 2.3, 1.1, "#2d3c25");
            pushOakLobe(2.9, 1.7, 3.1, -2.3, 2.2, -0.9, "#1f2c1a");
            const fbGeom = mergeGeometries(oakParts, false);
            for (const p of oakParts) p.dispose();
            fbGeom.computeVertexNormals();
            fbGeom.computeBoundingBox();
            const localProtoBox = fbGeom.boundingBox
              ? fbGeom.boundingBox.clone()
              : new THREE.Box3(new THREE.Vector3(-6, -1, -6), new THREE.Vector3(6, 6, 6));
            const fbMat = applyFoothillHazeMat(
              new THREE.MeshStandardMaterial({ vertexColors: true, roughness: 0.96, metalness: 0.0 }),
              "oak_fb"
            );

            const NUM_SECTORS = 8;
            const sectorBuckets = Array.from({ length: NUM_SECTORS }, () => []);
            for (let i = 0; i < allMats.length; i++) {
              const m4 = allMats[i];
              const mx = m4.elements[12];
              const mz = m4.elements[14];
              const ang = Math.atan2(mz, mx) + Math.PI; // [0, 2*PI]
              const sIdx = Math.min(NUM_SECTORS - 1, Math.max(0, Math.floor((ang / (Math.PI * 2.0)) * NUM_SECTORS)));
              sectorBuckets[sIdx].push(m4);
            }

            const horizonStaticGroup = new THREE.Group();
            horizonStaticGroup.name = "Horizon_Foothill_Tree_Quadrants_V9";
            horizonStaticGroup.userData.skipGroundingAudit = true;
            horizonStaticGroup.matrixAutoUpdate = false;
            horizonStaticGroup.updateMatrix();
            ridgeGroup.add(horizonStaticGroup);
            this.horizonTreesStaticGroup = horizonStaticGroup;

            const tmpWorldBox = new THREE.Box3();
            for (let sIdx = 0; sIdx < NUM_SECTORS; sIdx++) {
              const sMats = sectorBuckets[sIdx];
              if (sMats.length === 0) continue;
              const secGeom = fbGeom.clone();
              const secBox = new THREE.Box3();
              const secInst = new THREE.InstancedMesh(secGeom, fbMat, sMats.length);
              secInst.name = "Horizon_Foothill_Tree_Silhouettes_V6";
              secInst.userData.sectorIndex = sIdx;
              secInst.userData.skipGroundingAudit = true;
              secInst.userData.staticHorizonQuadrant = true;
              secInst.castShadow = false;
              secInst.receiveShadow = false;
              secInst.frustumCulled = true;
              secInst.count = sMats.length;

              for (let i = 0; i < sMats.length; i++) {
                secInst.setMatrixAt(i, sMats[i]);
                tmpWorldBox.copy(localProtoBox).applyMatrix4(sMats[i]);
                secBox.union(tmpWorldBox);
              }
              const secSphere = new THREE.Sphere();
              secBox.getBoundingSphere(secSphere);
              secSphere.radius += 1.5;

              secGeom.boundingBox = secBox.clone();
              secGeom.boundingSphere = secSphere.clone();
              secInst.boundingBox = secBox.clone();
              secInst.boundingSphere = secSphere.clone();
              secInst.matrixAutoUpdate = false;
              secInst.updateMatrix();
              secInst.instanceMatrix.needsUpdate = true;

              if (!primarySilInst) primarySilInst = secInst;
              horizonStaticGroup.add(secInst);
              this.horizonTreeDynamicBatches.push({
                sectorIndex: sIdx,
                staticQuadrant: true,
                count: sMats.length,
                boundingBox: secBox,
                boundingSphere: secSphere,
                meshes: [secInst],
              });
            }
            fbGeom.dispose();
          }
        }
        this.foothillTreesV6Instanced = primarySilInst;
      }

      this.archV5HorizonGroup = ridgeGroup;
      if (this.distantCrestMesh) this.distantCrestMesh.visible = false;
      if (this.foothillsMesh) this.foothillsMesh.visible = false;
      this.root.add(ridgeGroup);
    }

    return Boolean(pavilionProto || bermProto || ridgeProto);
  }

  /**
   * V6 Integration (`gradient_canopy_v6_glb.js` from `@blender-canopy-v6`):
   * - Replaces `this.gradientCanopyFallback` with authentic `Gradient_Canopy_Building_V6`
   *   (Google Visitor Experience front entrance: `2000` cedar vestibule, curved silver bullnose canopy fascia,
   *   white steel V-columns & soffit trusses, multi-peaked diamond dragonscale solar roof + smile clerestory windows,
   *   `Google Store` / `Cafe` curtain wall, board-formed planter wall, stainless bollards, and 3 white-mast 4-color origami pinwheels),
   *   preserving the seamless `4x6` breakable Spin Studio bay at `z = 131.20m` (`x in [-2.40, +2.40], y in [0.10, 3.68]`)!
   * - Replaces `this.bayViewFallback` with `Bay_View_Canopy_Pavilion_V6` at `(202, 0, 24)`.
   * - Optionally upgrades `Campus_Office_Pavilion` instances if `Campus_Office_Pavilion_V6` is included.
   */
  applyGradientCanopyV6Glb(canopyV6Scene) {
    if (!canopyV6Scene) return false;
    let gradProto = null;
    let bayProto = null;
    let pavV6Proto = null;
    canopyV6Scene.traverse((ch) => {
      if (!gradProto && /^Gradient_Canopy_Building_V6$/i.test(ch.name || "")) gradProto = ch;
      if (!bayProto && /^Bay_View_Canopy_Pavilion_V6$/i.test(ch.name || "")) bayProto = ch;
      if (!pavV6Proto && /^Campus_Office_Pavilion_V6$/i.test(ch.name || "")) pavV6Proto = ch;
    });
    if (!gradProto) {
      canopyV6Scene.traverse((ch) => {
        if (!gradProto && /Gradient_Canopy/i.test(ch.name || "") && ch !== canopyV6Scene) gradProto = ch;
        if (!bayProto && /Bay_View_Canopy/i.test(ch.name || "") && ch !== canopyV6Scene) bayProto = ch;
      });
    }

    const tuneArchMat = (() => {
      const cache = new Map();
      return (m) => {
        if (!m || (!m.isMeshStandardMaterial && !m.isMeshPhysicalMaterial)) return m;
        if (cache.has(m.uuid)) return cache.get(m.uuid);
        const cm = m.clone();
        cm.envMapIntensity = Math.min(cm.envMapIntensity ?? 0.65, 0.72);
        if (/Visitor_Glazing_And_PoppyMural/i.test(cm.name || "")) {
          cm.userData = cm.userData || {};
          cm.userData.v7SkipWorldCohesion = true;
          if (this.dayEnvMap) cm.envMap = this.dayEnvMap;
          cm.envMapIntensity = 0.78;
          // Preserve exact baked glyph `emissiveMap` from `gradient_canopy_v6_glb.js` for crisp satin-white `Google Store`!
          if (cm.emissiveMap) {
            cm.emissive = new THREE.Color("#ffffff");
            cm.emissiveIntensity = 0.90;
          }
          // Replace the 3 cartoon purple/blue/green 2nd-story daisy decals (`x = 8..642, y = 1717..1908` in 2048 atlas)
          // with clean Low-E sky-reflective curtain-wall glazing + dark anodized pane dividers (`#121` MAJOR-2.3)!
          if (cm.map && cm.map.image && typeof document !== "undefined") {
            const img = cm.map.image;
            const w = img.width || img.videoWidth || 0;
            const h = img.height || img.videoHeight || 0;
            if (w > 0 && h > 0) {
              const cvs = document.createElement("canvas");
              cvs.width = w;
              cvs.height = h;
              const ctx = cvs.getContext("2d");
              ctx.drawImage(img, 0, 0, w, h);
              const sx = w / 2048.0;
              const sy = h / 2048.0;
              const x0 = Math.round(8 * sx);
              const xw = Math.round((642 - 8) * sx);
              const y0 = Math.round(1717 * sy);
              const y1 = Math.round(1908 * sy);
              const grad = ctx.createLinearGradient(0, y0, 0, y1);
              grad.addColorStop(0.0, "rgb(96, 146, 190)");
              grad.addColorStop(1.0, "rgb(50, 84, 116)");
              ctx.fillStyle = grad;
              ctx.fillRect(x0, y0, xw, Math.max(1, y1 - y0));
              ctx.fillStyle = "rgb(26, 28, 30)";
              const divW = Math.max(2, Math.round(4 * sx));
              for (const mx of [116, 232, 348, 464, 580]) {
                ctx.fillRect(Math.round(mx * sx - divW * 0.5), y0, divW, Math.max(1, y1 - y0));
              }
              const cleanMap = new THREE.CanvasTexture(cvs);
              cleanMap.colorSpace = THREE.SRGBColorSpace;
              cleanMap.flipY = cm.map.flipY;
              cleanMap.wrapS = cm.map.wrapS;
              cleanMap.wrapT = cm.map.wrapT;
              cleanMap.anisotropy = cm.map.anisotropy || 4;
              cleanMap.needsUpdate = true;
              cm.map = cleanMap;
            }
          }
        }
        if (cm.emissive && (cm.emissiveIntensity || 0) > 0) {
          this._nightEmissives.push({
            mat: cm,
            baseColorHex: cm.emissive.getHex(),
            baseIntensity: cm.emissiveIntensity,
          });
          cm.emissiveIntensity = cm.emissiveIntensity * this._emissiveScaleFactor;
        }
        cache.set(m.uuid, cm);
        return cm;
      };
    })();

    let installedAny = false;

    if (gradProto) {
      if (this.gradientCanopyV6Group) this.root.remove(this.gradientCanopyV6Group);
      const gClone = gradProto.clone(true);
      gClone.name = "Gradient_Canopy_Building_V6";
      gClone.scale.set(1.0, 1.0, 1.0);
      gClone.rotation.set(0.0, Math.PI, 0.0);
      gClone.position.set(0.0, 0.0, 145.0);
      gClone.updateMatrixWorld(true);

      const toRemovePinwheels = [];
      gClone.traverse((ch) => {
        if (ch !== gClone && /Pinwheel|Origami/i.test(ch.name || "")) {
          toRemovePinwheels.push(ch);
          return;
        }
        if (ch.isMesh) {
          ch.material = Array.isArray(ch.material)
            ? ch.material.map(tuneArchMat)
            : tuneArchMat(ch.material);
          const mb = new THREE.Box3().setFromObject(ch);
          const overlapsSpinStudioRoof =
            mb.max.y > 4.2 && mb.min.x < 8.0 && mb.max.x > -8.0 && mb.min.z < 149.0 && mb.max.z > 130.0;
          ch.castShadow = !overlapsSpinStudioRoof && !this.isSoftwareRenderer;
          ch.receiveShadow = true;
        }
      });
      for (const pwNode of toRemovePinwheels) {
        if (pwNode.parent) pwNode.parent.remove(pwNode);
      }

      if (this.gradientCanopyFallback) {
        this.gradientCanopyFallback.visible = false;
        this.gradientCanopyFallback.userData.replacedByV6 = true;
      }
      if (this.gradientCanopyV2Group) {
        this.gradientCanopyV2Group.visible = false;
        this.gradientCanopyV2Group.userData.replacedByV6 = true;
      }
      gClone.userData.explicitSurfaceY = 0.0;
      gClone.userData.groundAsSingleUnit = true;
      this.gradientCanopyV6Group = gClone;
      this.root.add(gClone);
      installedAny = true;
    }

    if (bayProto) {
      if (this.bayViewV6Group) this.root.remove(this.bayViewV6Group);
      const bayContainer = new THREE.Group();
      bayContainer.name = "Bay_View_Canopy_Pavilion_V6";
      bayContainer.userData.skipGroundingAudit = true;

      const islandMat = this.materials.graniteCurb || this.materials.concreteSidewalk;
      const addBayWing = (wingName, wx, wz, rotY, sc = 1.0) => {
        const bClone = bayProto.clone(true);
        bClone.name = wingName;
        bClone.scale.setScalar(sc);
        bClone.rotation.set(0.0, rotY, 0.0);
        bClone.position.set(wx, 0.0, wz);
        bClone.traverse((ch) => {
          if (ch.isMesh) {
            ch.material = Array.isArray(ch.material)
              ? ch.material.map(tuneArchMat)
              : tuneArchMat(ch.material);
            ch.castShadow = !this.isSoftwareRenderer;
            ch.receiveShadow = true;
          }
        });
        bayContainer.add(bClone);

        const islG = new THREE.BoxGeometry(38.0 * sc, 0.302, 54.0 * sc);
        const islM = new THREE.Mesh(islG, islandMat);
        islM.name = `${wingName}_Waterfront_Terrace_Plinth`;
        islM.position.set(wx, -0.149, wz);
        islM.rotation.y = rotY + Math.PI * 0.5;
        islM.receiveShadow = true;
        islM.castShadow = false;
        bayContainer.add(islM);
      };

      addBayWing("Bay_View_Canopy_Pavilion_V6_Main", 202.0, 38.0, -Math.PI * 0.5, 1.0);
      addBayWing("Bay_View_Canopy_Pavilion_V6_North", 205.0, -20.0, -Math.PI * 0.5, 0.84);

      if (this.bayViewFallback) {
        this.bayViewFallback.visible = false;
        this.bayViewFallback.userData.replacedByV6 = true;
      }
      if (this.bayViewV2Group) {
        this.bayViewV2Group.visible = false;
        this.bayViewV2Group.userData.replacedByV6 = true;
      }
      this.bayViewV6Group = bayContainer;
      this.root.add(bayContainer);
      installedAny = true;
    }

    if (pavV6Proto && this._pavilionSpecsV6?.length) {
      if (this.archV5PavilionsGroup) this.root.remove(this.archV5PavilionsGroup);
      const pavGroup = new THREE.Group();
      pavGroup.name = "Campus_V6_Pavilions_Container";
      for (const sp of this._pavilionSpecsV6) {
        const pav = pavV6Proto.clone(true);
        pav.name = `Campus_Office_Pavilion_V6_${sp.id}`;
        const gy = getDefaultCampusSurfaceTopY(sp.x, sp.z, "pavilion");
        pav.scale.set(sp.sx, sp.sy, sp.sz);
        pav.rotation.set(0.0, sp.rotY, 0.0);
        pav.position.set(sp.x, gy, sp.z);
        pav.traverse((ch) => {
          if (ch.isMesh) {
            ch.material = Array.isArray(ch.material)
              ? ch.material.map(tuneArchMat)
              : tuneArchMat(ch.material);
            ch.castShadow = true;
            ch.receiveShadow = true;
          }
        });
        groundObjectToY(pav, gy, 0.0);
        pav.userData.bx = sp.x;
        pav.userData.bz = sp.z;
        pavGroup.add(pav);
      }
      this.archV5PavilionsGroup = pavGroup;
      this.root.add(pavGroup);
      installedAny = true;
    }

    return installedAny;
  }

  /**
   * V6 Integration (`props_and_bridge_v6_glb.js` from `@blender-props-bridge-v6`):
   * - Replaces all snack carts with `Campus_Snack_Cart_V6`
   * - Replaces Stevens Creek bridge with weathered Corten steel `Stevens_Creek_Bridge_V6` (`t = 61s-63s`, `0.0mm` deck fit)
   * - Replaces all courtyard/patio cone umbrellas with `Campus_Umbrella_Cafe_Set_V6`
   * - Replaces jump ramps with `Campus_Jump_Ramp_V6` (`0.0mm` kinematic deck fit)
   * - Replaces EVERY brown planter box, faceted green bush & low-poly rock with `Campus_Botanical_Kit_V6`
   *   (`Campus_Planter_Box_V6`, `Shrub_Coastal_Cluster_V6`, `Shrub_Manicured_Hedge_V6`, `Ornamental_Grass_Plume_V6`, `Sierra_Granite_Boulder_V6`)!
   */
  applyPropsAndBridgeV6Glb(propsBridgeV6Scene) {
    if (!propsBridgeV6Scene) return false;

    const findV6Node = (patterns) => {
      for (const pat of patterns) {
        let exact = null;
        propsBridgeV6Scene.traverse((n) => {
          if (!exact && n !== propsBridgeV6Scene && n.name === pat) exact = n;
        });
        if (exact) return exact;
      }
      for (const pat of patterns) {
        const re = new RegExp(pat, "i");
        let fuzzy = null;
        propsBridgeV6Scene.traverse((n) => {
          if (!fuzzy && n !== propsBridgeV6Scene && re.test(n.name || "")) fuzzy = n;
        });
        if (fuzzy) return fuzzy;
      }
      return null;
    };

    // `#65` Exact Spec: all 12 root nodes sit at `(0, 0, 0)` with `minY === 0.00000m`!
    // Never recenter XZ by AABB midpoint (which would shift asymmetric props like `Campus_Snack_Cart_V6`'s A-frame chalkboard!).
    const tunedV6Mats = new Map();
    const tuneV6PropMat = (mat) => {
      if (!mat || (!mat.isMeshStandardMaterial && !mat.isMeshPhysicalMaterial)) return mat;
      if (tunedV6Mats.has(mat.uuid)) return tunedV6Mats.get(mat.uuid);
      const cm = mat.clone();
      cm.envMapIntensity = Math.min(cm.envMapIntensity ?? 0.55, 0.62);
      // Preserve crisp `MASK` botanical cutout foliage (`alphaTest >= 0.45`, `DoubleSide`, `depthWrite = true`)
      if ((cm.alphaTest && cm.alphaTest > 0.01) || /Leaf|Foliage|Grass|Plume|Fern|Frond/i.test(cm.name || "")) {
        if (cm.alphaTest > 0.01 || cm.alphaMap || (cm.map && cm.transparent)) {
          cm.alphaTest = Math.max(cm.alphaTest || 0.0, 0.45);
          cm.transparent = false;
          cm.depthWrite = true;
          cm.side = THREE.DoubleSide;
        }
      }
      tunedV6Mats.set(mat.uuid, cm);
      return cm;
    };

    const cloneV6PropDirect = (srcNode) => {
      const c = srcNode.clone(true);
      c.position.set(0.0, 0.0, 0.0);
      c.rotation.set(0.0, 0.0, 0.0);
      c.scale.set(1.0, 1.0, 1.0);
      c.updateMatrixWorld(true);
      const b = new THREE.Box3().setFromObject(c);
      const wrap = new THREE.Group();
      wrap.name = srcNode.name || "V6_Prop";
      // V8 Item 11: NEVER vertically recenter authored `Z = 0.000m` kinematic ramp or bridge decks by `-b.min.y`!
      const preserveAuthoredOriginY =
        /Campus_Wooden_Ramp|Campus_Jump_Ramp|Campus_Landing_Ramp|Landing_Ramp|Stevens_Creek_Bridge|Creek_Bridge|Corten_Bridge/i.test(
          srcNode.name || ""
        );
      if (!preserveAuthoredOriginY && Number.isFinite(b.min.y) && Math.abs(b.min.y) > 1e-5) {
        c.position.y = -b.min.y;
      }
      c.traverse((m) => {
        if (m.isMesh) {
          m.castShadow = !this.isSoftwareRenderer;
          m.receiveShadow = true;
          m.material = Array.isArray(m.material)
            ? m.material.map(tuneV6PropMat)
            : tuneV6PropMat(m.material);
        }
      });
      wrap.add(c);
      wrap.updateMatrixWorld(true);
      return { wrap, size: b.getSize(new THREE.Vector3()), rawBox: b };
    };

    let installedAny = false;

    // 1. Weathered Corten Steel `Stevens_Creek_Bridge_V6` (`(52,-86) -> (18,-158)`)
    const bridgeSrc = findV6Node(["Stevens_Creek_Bridge_V6", "Creek_Bridge_V6", "Corten_Bridge_V6"]);
    if (bridgeSrc) {
      if (this.stevensBridgeV6Group) this.root.remove(this.stevensBridgeV6Group);
      const brClone = bridgeSrc.clone(true);
      brClone.name = "Stevens_Creek_Bridge_V6";
      brClone.scale.set(1.0, 1.0, 1.0);
      brClone.rotation.set(0.0, Math.atan2(34.0, 72.0), 0.0);
      brClone.position.set(35.0, -0.420, -122.0);
      brClone.traverse((m) => {
        if (m.isMesh) {
          m.castShadow = !this.isSoftwareRenderer;
          m.receiveShadow = true;
          m.material = Array.isArray(m.material)
            ? m.material.map(tuneV6PropMat)
            : tuneV6PropMat(m.material);
        }
      });
      brClone.userData.skipGroundingAudit = true;

      if (this.stevensBridgeGroup) {
        this.stevensBridgeGroup.visible = false;
        this.stevensBridgeGroup.userData.replacedByV6 = true;
        if (this.stevensBridgeGroup.parent) this.stevensBridgeGroup.parent.remove(this.stevensBridgeGroup);
      }
      if (this.stevensBridgeV2Group) {
        this.stevensBridgeV2Group.visible = false;
        this.stevensBridgeV2Group.userData.replacedByV6 = true;
        if (this.stevensBridgeV2Group.parent) this.stevensBridgeV2Group.parent.remove(this.stevensBridgeV2Group);
      }
      this.stevensBridgeV6Group = brClone;
      this.root.add(brClone);
      installedAny = true;
    }

    // 2. `Courtyard_Landscape_Berm_V6` across all 7 courtyard earthwork berms
    const bermV6Src = findV6Node(["Courtyard_Landscape_Berm_V6", "Landscape_Berm_V6"]);
    if (bermV6Src && this._bermSpecsV6?.length) {
      if (this.archV5BermsGroup) this.root.remove(this.archV5BermsGroup);
      const bermGroup = new THREE.Group();
      bermGroup.name = "Campus_Berms_V6_Container";
      for (let i = 0; i < this._bermSpecsV6.length; i++) {
        const bs = this._bermSpecsV6[i];
        const { wrap: berm } = cloneV6PropDirect(bermV6Src);
        berm.name = `Courtyard_Landscape_Berm_V6_${i}`;
        const gy = getDefaultCampusSurfaceTopY(bs.x, bs.z, "berm");
        berm.scale.set(0.68 * bs.sx, 0.85 * bs.sy, 0.68 * bs.sz);
        berm.rotation.set(0.0, bs.rotY, 0.0);
        berm.position.set(bs.x, gy, bs.z);
        groundObjectToY(berm, gy, 0.0);
        berm.userData.bx = bs.x;
        berm.userData.bz = bs.z;
        bermGroup.add(berm);
      }
      this.archV5BermsGroup = bermGroup;
      this.root.add(bermGroup);
      installedAny = true;
    }

    // 5. `Campus_Botanical_Kit_V6`: Replace EVERY `Campus_Planter_V3` box/bush + dress berms, forecourt & water banks!
    const planterBoxSrc = findV6Node(["Campus_Planter_Box_V6", "Planter_Box_V6"]);
    const shrubClusterSrc = findV6Node(["Shrub_Coastal_Cluster_V6", "Coastal_Cluster_V6", "Shrub_Cluster_V6"]);
    const hedgeSrc = findV6Node(["Shrub_Manicured_Hedge_V6", "Manicured_Hedge_V6", "Hedge_V6"]);
    const grassPlumeSrc = findV6Node(["Ornamental_Grass_Plume_V6", "Grass_Plume_V6", "Bunchgrass_V6"]);
    const boulderSrcA = findV6Node(["Sierra_Granite_Boulder_V6_A", "Sierra_Granite_Boulder_V6", "Granite_Boulder_V6"]);
    const boulderSrcB = findV6Node(["Sierra_Granite_Boulder_V6_B"]);

    if (planterBoxSrc || shrubClusterSrc || hedgeSrc || grassPlumeSrc || boulderSrcA) {
      if (this.botanicalKitV6Group) this.root.remove(this.botanicalKitV6Group);
      const botGroup = new THREE.Group();
      botGroup.name = "Campus_Botanical_Kit_V6";

      // Remove `Campus_Planter_V3` from `propDynamicBatches` so ZERO brown V3 boxes or faceted green icosahedron bushes render!
      this._hasV6Planters = true;
      if (this.propDynamicBatches) {
        this.propDynamicBatches = this.propDynamicBatches.filter((batch) => {
          const isOldPlanter = batch.meshes?.some((m) => /Campus_Planter/i.test(m.name || ""));
          if (isOldPlanter) {
            for (const m of batch.meshes) {
              m.visible = false;
              m.count = 0;
              if (m.parent) m.parent.remove(m);
            }
          }
          return !isOldPlanter;
        });
      }

      const buildV6InstancedBatch = (
        srcNode,
        batchName,
        placements,
        category = "shrub",
        explicitSurfaceY = null
      ) => {
        if (!srcNode || !placements || placements.length === 0) return;
        const { wrap } = cloneV6PropDirect(srcNode);
        const prims = [];
        wrap.updateMatrixWorld(true);
        wrap.traverse((m) => {
          if (m.isMesh && m.geometry) {
            const g = m.geometry.clone();
            g.applyMatrix4(m.matrixWorld);
            g.computeBoundingBox();
            prims.push({ geometry: g, material: m.material });
          }
        });
        if (prims.length === 0) return;

        let baseIdx = 0;
        let minBottom = Infinity;
        for (let p = 0; p < prims.length; p++) {
          const by = prims[p].geometry.boundingBox?.min?.y ?? 0;
          if (by < minBottom) {
            minBottom = by;
            baseIdx = p;
          }
        }

        const shouldCastV6PropShadow = category === "planter" || category === "boulder";
        const meshes = [];
        for (let p = 0; p < prims.length; p++) {
          const inst = new THREE.InstancedMesh(
            prims[p].geometry,
            prims[p].material,
            placements.length
          );
          inst.name = p === baseIdx ? batchName : `${batchName}_SubPart_ShadowLinked`;
          if (Number.isFinite(explicitSurfaceY)) {
            inst.userData.explicitSurfaceY = explicitSurfaceY;
          }
          inst.castShadow = shouldCastV6PropShadow;
          inst.receiveShadow = true;
          inst.frustumCulled = false;
          for (let i = 0; i < placements.length; i++) {
            const pl = placements[i];
            _pos.set(pl.x, pl.y, pl.z);
            _euler.set(0.0, pl.rotY || 0.0, 0.0);
            _quat.setFromEuler(_euler);
            _scale.set(pl.sx || pl.scale || 1.0, pl.sy || pl.scale || 1.0, pl.sz || pl.scale || 1.0);
            if (!pl.mat4) pl.mat4 = new THREE.Matrix4();
            pl.mat4.compose(_pos, _quat, _scale);
            inst.setMatrixAt(i, pl.mat4);
          }
          inst.instanceMatrix.needsUpdate = true;
          botGroup.add(inst);
          meshes.push(inst);
        }
        if (this.propDynamicBatches) {
          this.propDynamicBatches.push({
            name: batchName,
            category,
            placements,
            meshes,
            baseMeshIndex: baseIdx,
            mode: "centered",
            castShadow: shouldCastV6PropShadow,
          });
          this._cullForceRebuild = true;
        }
      };

      const rngBot = createMulberry32(0x607a21ca);

      // A. Architectural Planter Boxes (`Campus_Planter_Box_V6` — `1.06m` tall, ALREADY planted with shrubs & grasses!)
      //    Includes deduplicated flanking sidewalk planter boxes on BOTH sides of every `Campus_Snack_Cart_V6`!
      if (planterBoxSrc) {
        const planterPls = [];
        for (const p of this.planterPlacements || []) {
          if (planterPls.every((q) => Math.hypot(q.x - p.x, q.z - p.z) >= 2.05)) {
            planterPls.push({
              x: p.x,
              y: getDefaultCampusSurfaceTopY(p.x, p.z, "planter"),
              z: p.z,
              rotY: p.rotY || 0.0,
              scale: 1.0,
            });
          }
        }
        if (planterPls.length > 0) {
          buildV6InstancedBatch(planterBoxSrc, "Campus_Planter_Box_V6", planterPls, "planter");
        }
      }

      // B. Multi-Clump Botanical Shrubs, Manicured Hedges, Ornamental Grass Plumes & Sierra Granite Boulders (`_A` + `_B`)
      //    100% strictly gated on `isCampusGrassAllowedAt(x, z, { minCarriagewayClearanceM: 4.15 })` AND
      //    completely excluded from Stan Courtyard (`rStan <= 19.85` & N/S paver walkways) and Gradient Hex Forecourt!
      const shrubPlacements = [];
      const hedgePlacements = [];
      const plumePlacements = [];
      const boulderPlacementsA = [];
      const boulderPlacementsB = [];
      const botanicalAuditRecords = [];

      const isGroundBotanicalAllowedAt = (x, z) => {
        if (Math.hypot(x + 118.0, z + 50.0) <= 19.85) return false;
        if (Math.abs(x + 118.0) <= 6.2 && z >= -82.0 && z <= -18.0) return false;
        if (Math.abs(x) <= 27.2 && z >= 114.3 && z <= 159.5) return false;
        if (Math.abs(x) < 5.2 && z > 113.5 && z < 136.0) return false;
        return isCampusGrassAllowedAt(x, z, { minCarriagewayClearanceM: 4.15 });
      };

      const pushGroundedBotanical = (arr, x, z, scaleMin, scaleMax, kindLabel = "botanical") => {
        if (!isGroundBotanicalAllowedAt(x, z)) return;
        const sc = scaleMin + rngBot() * (scaleMax - scaleMin);
        const y = getOpenWorldSurfaceForBotanical(x, z);
        const entry = {
          x,
          y,
          z,
          rotY: rngBot() * Math.PI * 2.0,
          sx: sc * (0.92 + rngBot() * 0.18),
          sy: sc * (0.88 + rngBot() * 0.24),
          sz: sc * (0.92 + rngBot() * 0.18),
        };
        arr.push(entry);
        botanicalAuditRecords.push({ x, y, z, kind: kindLabel });
      };
      const getOpenWorldSurfaceForBotanical = (x, z) => getDefaultCampusSurfaceTopY(x, z, "shrub");

      let bIdxToggle = 0;
      const pushBoulder = (x, z, sMin, sMax) => {
        const targetArr = boulderSrcB && (bIdxToggle++ & 1) === 1 ? boulderPlacementsB : boulderPlacementsA;
        pushGroundedBotanical(targetArr, x, z, sMin, sMax, "boulder");
      };

      // 1. Outer Garden Lawn Berms (`rStan > 19.85m` & Android Lawn Berms)
      for (const bs of this._bermSpecsV6 || []) {
        const c = Math.cos(bs.rotY);
        const s = Math.sin(bs.rotY);
        pushBoulder(bs.x + c * 3.8 - s * 1.6, bs.z + s * 3.8 + c * 1.6, 0.85, 1.35);
        pushBoulder(bs.x - c * 3.9 + s * 1.8, bs.z - s * 3.9 - c * 1.8, 0.68, 1.08);
        pushGroundedBotanical(shrubPlacements, bs.x + c * 2.6 + s * 2.2, bs.z + s * 2.6 - c * 2.2, 0.90, 1.30, "shrub");
        pushGroundedBotanical(shrubPlacements, bs.x - c * 2.8 - s * 2.0, bs.z - s * 2.8 + c * 2.0, 0.85, 1.25, "shrub");
        pushGroundedBotanical(plumePlacements, bs.x + c * 4.2, bs.z + s * 4.2, 0.90, 1.35, "grass_plume");
        pushGroundedBotanical(plumePlacements, bs.x - c * 4.1, bs.z - s * 4.1, 0.90, 1.35, "grass_plume");
      }

      // 2. Lawn Beds along Pinwheel Spine & Charleston Blvd (`>= 4.15m` outside carriageways, 0 plants on Gradient Hex Pavers!)
      for (const [vx, vz] of [
        [-11.8, 108.5], [11.8, 108.5], [-11.8, 94.0], [11.8, 90.5],
        [-28.0, 82.5], [-52.0, 82.5], [-78.0, 82.5], [-98.0, 82.5],
        [28.0, 62.5], [58.0, 62.5], [92.0, 62.5], [124.0, 62.5],
      ]) {
        pushGroundedBotanical(shrubPlacements, vx, vz, 0.88, 1.25, "shrub");
        pushGroundedBotanical(plumePlacements, vx + 1.35, vz + 0.45, 0.90, 1.28, "grass_plume");
      }

      // 3. Manicured Hedges flanking Android Lawn North Perimeter (`0` hedges in Stan Courtyard or Gradient Hex Forecourt!)
      for (const [hx, hz, hRot] of [
        [-126.0, 109.2, 0.0], [-110.0, 109.2, 0.0],
      ]) {
        if (isGroundBotanicalAllowedAt(hx, hz)) {
          const hy = getDefaultCampusSurfaceTopY(hx, hz, "hedge");
          hedgePlacements.push({
            x: hx,
            y: hy,
            z: hz,
            rotY: hRot,
            scale: 1.0,
          });
          botanicalAuditRecords.push({ x: hx, y: hy, z: hz, kind: "hedge" });
        }
      }

      // 4. Bay View Lawn Bank & Stevens Creek Riparian Boulders + Reeds (strictly on valid turf banks!)
      for (let pz = -48.0; pz <= 72.0; pz += 14.5) {
        pushBoulder(142.8, pz + (rngBot() - 0.5) * 3.0, 0.72, 1.28);
        pushGroundedBotanical(plumePlacements, 143.2, pz + 2.2, 0.95, 1.42, "grass_plume");
        pushGroundedBotanical(shrubPlacements, 142.2, pz - 2.6, 0.82, 1.18, "shrub");
      }
      for (let cx = -168.0; cx <= 176.0; cx += 9.5) {
        const cz = stevensCreekCenterZ(cx);
        const hw = stevensCreekHalfWidthZ(cx);
        for (const side of [-1, 1]) {
          const bz = cz + side * (hw + 3.2);
          // Keep bridge north/south portals (`(52, -86)` & `(18, -158)`) clear!
          if (Math.hypot(cx - 52.0, bz - -86.0) < 11.5 || Math.hypot(cx - 18.0, bz - -158.0) < 11.5) {
            continue;
          }
          pushBoulder(cx + (rngBot() - 0.5) * 2.2, bz, 0.82, 1.44);
          pushGroundedBotanical(plumePlacements, cx + 1.6, cz + side * (hw + 3.0), 1.0, 1.46, "grass_plume");
          if (Math.abs(cx) < 110.0) {
            pushGroundedBotanical(shrubPlacements, cx - 1.8, cz + side * (hw + 3.8), 0.86, 1.24, "shrub");
          }
        }
      }
      // Zone 4 Foothill / Android Climb Sierra Granite Boulders along lawn edge
      for (const [bx, bz] of [
        [-42.0, 88.2], [-68.0, 88.4], [-92.0, 88.0], [-134.5, 96.5], [-132.0, 106.0],
      ]) {
        pushBoulder(bx, bz, 0.90, 1.48);
        pushGroundedBotanical(plumePlacements, bx + 1.5, bz + 0.6, 0.95, 1.32, "grass_plume");
      }

      this._botanicalPlacementsAudit = botanicalAuditRecords;

      if (shrubPlacements.length > 0) {
        buildV6InstancedBatch(shrubClusterSrc, "Shrub_Coastal_Cluster_V6", shrubPlacements, "shrub");
      }
      if (hedgePlacements.length > 0) {
        buildV6InstancedBatch(hedgeSrc, "Shrub_Manicured_Hedge_V6", hedgePlacements, "hedge");
      }
      if (plumePlacements.length > 0) {
        buildV6InstancedBatch(grassPlumeSrc, "Ornamental_Grass_Plume_V6", plumePlacements, "grass_plume");
      }
      if (boulderPlacementsA.length > 0) {
        buildV6InstancedBatch(boulderSrcA, "Sierra_Granite_Boulder_V6", boulderPlacementsA, "boulder");
      }
      if (boulderPlacementsB && boulderSrcB && boulderPlacementsB.length > 0) {
        buildV6InstancedBatch(boulderSrcB, "Sierra_Granite_Boulder_V6_B", boulderPlacementsB, "boulder");
      }

      this.botanicalKitV6Group = botGroup;
      this.root.add(botGroup);
      installedAny = true;
    }

    return installedAny;
  }

  finalizeV5PropGrounding() {
    if (typeof MaterialsMod.deplasticizeCampusPropMaterials === "function") {
      MaterialsMod.deplasticizeCampusPropMaterials([
        this.proceduralStreetFurnitureGroup,
      ]);
    }

    // 1. Temporarily un-cull all campus zones & restore full InstancedMesh buffers for 0.0mm grounding
    if (this.archV5PavilionsGroup) {
      this.archV5PavilionsGroup.visible = true;
      for (const ch of this.archV5PavilionsGroup.children) ch.visible = true;
    }
    if (this.archV5BermsGroup) {
      this.archV5BermsGroup.visible = true;
      for (const ch of this.archV5BermsGroup.children) ch.visible = true;
    }
    if (this.envV3BuildingsGroup) {
      for (const ch of this.envV3BuildingsGroup.children) {
        ch.visible = !ch.userData?.replacedByV5;
      }
    }
    if (this.gradientCanopyV6Group) this.gradientCanopyV6Group.visible = true;
    if (this.bayViewV6Group) this.bayViewV6Group.visible = true;
    if (this.stevensBridgeV6Group) this.stevensBridgeV6Group.visible = true;
    if (this.botanicalKitV6Group) this.botanicalKitV6Group.visible = true;

    if (this.propDynamicBatches) {
      for (const batch of this.propDynamicBatches) {
        const pls = batch.placements || [];
        for (let m = 0; m < batch.meshes.length; m++) {
          const inst = batch.meshes[m];
          inst.count = pls.length;
          inst.visible = pls.length > 0;
          for (let i = 0; i < pls.length; i++) {
            inst.setMatrixAt(i, pls[i].mat4);
          }
          inst.instanceMatrix.needsUpdate = true;
        }
      }
    }

    if (this.treeDynamicBatches) {
      for (const batch of this.treeDynamicBatches) {
        const trs = batch.transforms || [];
        for (let m = 0; m < batch.meshes.length; m++) {
          const inst = batch.meshes[m];
          inst.count = trs.length;
          inst.visible = trs.length > 0;
          for (let i = 0; i < trs.length; i++) {
            inst.setMatrixAt(i, trs[i].mat4);
          }
          inst.instanceMatrix.needsUpdate = true;
        }
      }
    }

    this.root.updateMatrixWorld(true);
    this.v5GroundingReport = auditAndGroundPropsZeroFloat(THREE, this.root, {
      getSurfaceTopY: getDefaultCampusSurfaceTopY,
      maxFloatMm: 0.5,
      autoSnap: true,
      addContactAO: true,
    });

    // 2. Write 0.0mm-grounded base instance matrices back into `placements[i].mat4` / `transforms[i].mat4` and sibling sub-meshes!
    if (this.propDynamicBatches) {
      for (const batch of this.propDynamicBatches) {
        if (batch.mode === "cantilever") continue;
        const baseIdx = batch.baseMeshIndex ?? 0;
        const baseInst = batch.meshes[baseIdx];
        const pls = batch.placements || [];
        if (!baseInst || pls.length === 0) continue;
        for (let i = 0; i < pls.length; i++) {
          baseInst.getMatrixAt(i, pls[i].mat4);
          for (let m = 0; m < batch.meshes.length; m++) {
            if (m !== baseIdx) batch.meshes[m].setMatrixAt(i, pls[i].mat4);
          }
        }
        for (let m = 0; m < batch.meshes.length; m++) {
          batch.meshes[m].instanceMatrix.needsUpdate = true;
        }
      }
    }

    if (this.treeDynamicBatches) {
      for (const batch of this.treeDynamicBatches) {
        const baseIdx = batch.baseMeshIndex ?? 0;
        const baseInst = batch.meshes[baseIdx];
        const trs = batch.transforms || [];
        if (!baseInst || trs.length === 0) continue;
        for (let i = 0; i < trs.length; i++) {
          baseInst.getMatrixAt(i, trs[i].mat4);
          for (let m = 0; m < batch.meshes.length; m++) {
            if (m !== baseIdx) batch.meshes[m].setMatrixAt(i, trs[i].mat4);
          }
        }
        for (let m = 0; m < batch.meshes.length; m++) {
          batch.meshes[m].instanceMatrix.needsUpdate = true;
        }
      }
    }

    // 2B. Pre-compute zero-GC world AABB / cylinder sightline bounds on all outdoor roadside props & trunks (`t > 9.5s` Section 8B)
    this._outdoorCameraObstacles = [];
    const localUnionBox = new THREE.Box3();
    if (this.propDynamicBatches) {
      for (const batch of this.propDynamicBatches) {
        localUnionBox.makeEmpty();
        for (const inst of batch.meshes || []) {
          if (inst?.geometry) {
            if (!inst.geometry.boundingBox) inst.geometry.computeBoundingBox();
            if (inst.geometry.boundingBox) localUnionBox.union(inst.geometry.boundingBox);
          }
        }
        if (localUnionBox.isEmpty()) continue;
        const pls = batch.placements || [];
        for (let i = 0; i < pls.length; i++) {
          const pl = pls[i];
          _box3Work.copy(localUnionBox).applyMatrix4(pl.mat4);
          const cx = (_box3Work.min.x + _box3Work.max.x) * 0.5;
          const cz = (_box3Work.min.z + _box3Work.max.z) * 0.5;
          const hx = (_box3Work.max.x - _box3Work.min.x) * 0.5;
          const hz = (_box3Work.max.z - _box3Work.min.z) * 0.5;
          const rad = Math.min(2.6, Math.hypot(hx, hz));
          const height = _box3Work.max.y - _box3Work.min.y;
          pl.obsCx = cx;
          pl.obsCz = cz;
          pl.obsMinY = _box3Work.min.y;
          pl.obsMaxY = _box3Work.max.y;
          pl.obsRad = rad;
          if (height >= 0.68 && _box3Work.max.y >= 0.55) {
            this._outdoorCameraObstacles.push({
              x: cx,
              z: cz,
              minY: _box3Work.min.y,
              maxY: _box3Work.max.y,
              radius: Math.min(1.65, rad),
              solidBox: batch.mode !== "cantilever" && height >= 0.85 && height <= 4.2,
            });
          }
        }
      }
    }
    if (this.treeDynamicBatches) {
      for (const batch of this.treeDynamicBatches) {
        const trs = batch.transforms || [];
        for (let i = 0; i < trs.length; i++) {
          const tr = trs[i];
          const gy = getOpenWorldTerrainHeight(tr.x, tr.z);
          tr.obsCx = tr.x;
          tr.obsCz = tr.z;
          tr.obsMinY = gy;
          tr.obsMaxY = gy + 6.5;
          tr.obsRad = 0.58;
          this._outdoorCameraObstacles.push({
            x: tr.x,
            z: tr.z,
            minY: gy,
            maxY: gy + 4.8,
            radius: 0.52,
            solidBox: false,
          });
        }
      }
    }
    const staticShadowRoots = [
      this.archV5BermsGroup,
      this.archV5PavilionsGroup,
      this.stevensBridgeV6Group,
      this.shorelineMonumentGroup,
      this.bayViewV6Group,
    ];
    for (const sr of staticShadowRoots) {
      if (!sr) continue;
      sr.traverse((m) => {
        if (!m.isMesh) return;
        const mLabel = `${m.name || ""} ${m.material?.name || ""}`;
        if (
          m.material?.transparent ||
          m.userData?.noCastShadow ||
          /Dust|Breath|Motes|Shockwave|Steam|Shadow|Decal|Water|Plaque_V7|Blade_V7|SmokedGlass|Horizon|Ridgeline/i.test(
            mLabel
          )
        ) {
          return;
        }
        m.userData = m.userData || {};
        m.userData.v7StaticShadowCaster = true;
        m.layers?.enable?.(1);
      });
    }
    for (const batch of this.propDynamicBatches || []) {
      if (!batch?.castShadow) continue;
      for (const inst of batch.meshes || []) {
        if (!inst || inst.material?.transparent) continue;
        inst.userData = inst.userData || {};
        inst.userData.v7StaticShadowCaster = true;
        inst.layers?.enable?.(1);
      }
    }
    for (const batch of this.treeDynamicBatches || []) {
      for (const inst of batch.meshes || []) {
        if (!inst) continue;
        inst.userData = inst.userData || {};
        inst.userData.v7StaticShadowCaster = true;
        inst.layers?.enable?.(1);
      }
    }

    // 3. Restore active camera/hero sightline culling cleanly
    this._cullForceRebuild = true;
    if (this._lastHeroSnap) {
      this.update(0, this._lastHeroSnap, this._lastGlobalState || {});
    }
    return this.v5GroundingReport;
  }

  /**
   * Zero-GC Outdoor Camera Spring-Arm Clearance Solver (`t > 9.5s` ONLY; called from `core._updateCameraForMode`).
   * Smoothly nudges camera elevation & lateral clearance when a solid roadside utility/tri-bin box,
   * planter, snack cart, or trunk intersects the camera-to-Pelican sightline cone.
   */
  computeOutdoorCameraClearanceOffset(camPos, _lookPos, heroPos, outVec) {
    outVec.set(0, 0, 0);
    const obsList = this._outdoorCameraObstacles;
    if (!obsList || obsList.length === 0) return outVec;

    const ax = camPos.x;
    const ay = camPos.y;
    const az = camPos.z;
    const bx = heroPos.x;
    const by = heroPos.y + 0.72;
    const bz = heroPos.z;
    const abx = bx - ax;
    const aby = by - ay;
    const abz = bz - az;
    const abXZLenSq = abx * abx + abz * abz;
    if (abXZLenSq < 0.25) return outVec;
    const invAbXZLenSq = 1.0 / abXZLenSq;
    const abXZLen = Math.sqrt(abXZLenSq);
    // Camera-right horizontal unit vector `(perpX, perpZ)`
    const perpX = -abz / abXZLen;
    const perpZ = abx / abXZLen;

    let bestLiftY = 0.0;
    let bestLat = 0.0;

    for (let i = 0; i < obsList.length; i++) {
      const ob = obsList[i];
      const dx = ob.x - ax;
      const dz = ob.z - az;
      if (Math.abs(dx) > 16.0 || Math.abs(dz) > 16.0) continue;
      const u = (dx * abx + dz * abz) * invAbXZLenSq;
      if (u < -0.08 || u > 0.90) continue;
      const uClamped = u < 0.0 ? 0.0 : u;
      const rayX = ax + abx * uClamped;
      const rayY = ay + aby * uClamped;
      const rayZ = az + abz * uClamped;
      if (rayY > ob.maxY + 0.55 || rayY < ob.minY - 0.35) continue;

      const clearRad = ob.radius + 0.92;
      const rx = ob.x - rayX;
      const rz = ob.z - rayZ;
      const distXZ = Math.hypot(rx, rz);
      if (distXZ >= clearRad) continue;

      const pen = 1.0 - distXZ / clearRad;
      const smoothPen = pen * pen * (3.0 - 2.0 * pen);
      // Elevate spring arm cleanly above roadside utility/recycling boxes (`+0.38m..+0.88m`)
      const neededLift = ob.solidBox
        ? Math.min(0.88, Math.max(0.36, ob.maxY + 0.34 - rayY)) * smoothPen
        : 0.34 * smoothPen;
      if (neededLift > bestLiftY) bestLiftY = neededLift;

      // Lateral nudge away from the roadside box toward the open street centerline
      const sideDot = rx * perpX + rz * perpZ;
      const pushDir = sideDot >= 0 ? -1.0 : 1.0;
      const latMag = (ob.solidBox ? 0.72 : 0.48) * smoothPen;
      if (Math.abs(latMag) > Math.abs(bestLat)) {
        bestLat = pushDir * latMag;
      }
    }

    outVec.set(perpX * bestLat, bestLiftY, perpZ * bestLat);
    return outVec;
  }

  // ============================================================================
  // 11. PER-FRAME DETERMINISTIC WORLD ANIMATION & STATE SYNC
  // ============================================================================
  _syncGrassFocusFromCamera(cam, snapFallback = null) {
    if (!this.grassUniforms) return;
    let fx = snapFallback && Number.isFinite(snapFallback.x) ? snapFallback.x : 0.0;
    let fz = snapFallback && Number.isFinite(snapFallback.z) ? snapFallback.z : 140.0;

    const activeCam =
      cam ||
      (typeof window !== "undefined" && window.__campusApp && window.__campusApp.camera) ||
      null;

    if (activeCam && activeCam.matrixWorld) {
      const e = activeCam.matrixWorld.elements;
      const camX = e[12];
      const camY = e[13];
      const camZ = e[14];
      const fwdX = -e[8];
      const fwdY = -e[9];
      const fwdZ = -e[10];

      if (Number.isFinite(camX) && Number.isFinite(camZ)) {
        if (camY > 36.0 && snapFallback && Number.isFinite(snapFallback.x)) {
          fx = snapFallback.x;
          fz = snapFallback.z;
        } else {
          const hLen = Math.hypot(fwdX, fwdZ);
          const aheadDist =
            camY > 14.0 && fwdY < -0.28
              ? Math.min(22.0, Math.max(11.5, (camY - 1.5) * 0.58)) * Math.min(1.0, hLen / 0.25)
              : 11.5 * (hLen > 1e-4 ? Math.min(1.0, hLen / 0.20) : 0.0);
          const dirHX = hLen > 1e-4 ? fwdX / hLen : 0.0;
          const dirHZ = hLen > 1e-4 ? fwdZ / hLen : 0.0;
          fx = camX + dirHX * aheadDist;
          fz = camZ + dirHZ * aheadDist;
        }
      }
    }

    const clampedX = THREE.MathUtils.clamp(fx, WORLD_BOUNDS.minX + 4.0, WORLD_BOUNDS.maxX - 4.0);
    const clampedZ = THREE.MathUtils.clamp(fz, WORLD_BOUNDS.minZ + 4.0, WORLD_BOUNDS.maxZ - 4.0);
    this.grassUniforms.uFocusXZ.value.set(clampedX, clampedZ);
  }

  setAtmosphere(preset) {
    if (!preset) return;
    this._currentAtmosphere = preset;
    const isNight = preset.id === "night";
    const isDusk = preset.id === "dusk";
    const emissiveScale = isNight ? 0.04 : isDusk ? 0.35 : 1.0;
    this._emissiveScaleFactor = emissiveScale;

    if (this._atmoShaderUniforms) {
      if (this._atmoShaderUniforms.uAtmoTint?.value) {
        this._atmoShaderUniforms.uAtmoTint.value.set(preset.ridgeTint || preset.fogColor || "#1a2232");
      }
      if (this._atmoShaderUniforms.uHazeColor?.value) {
        this._atmoShaderUniforms.uHazeColor.value.set(preset.fogColor || "#0e1522");
      }
      if (this._atmoShaderUniforms.uAtmoMix) {
        this._atmoShaderUniforms.uAtmoMix.value = isNight ? 0.72 : isDusk ? 0.52 : 0.22;
      }
    }

    if (this.distantCrestMesh?.material?.color) {
      this.distantCrestMesh.material.color.set(preset.ridgeTint || "#1a2232");
    }
    if (this.foothillsMesh?.material?.color) {
      this.foothillsMesh.material.color.set(preset.ridgeTint || "#1a2232");
    }

    if (this.skyDome?.material?.uniforms) {
      const su = this.skyDome.material.uniforms;
      if (su.uZenithColor?.value) su.uZenithColor.value.set(preset.skyZenith || "#070b14");
      if (su.uHorizonColor?.value) su.uHorizonColor.value.set(preset.skyHorizon || "#162030");
      if (su.uGlowColor?.value) {
        su.uGlowColor.value.set(isNight ? "#1c2a40" : isDusk ? "#6e4e5c" : "#dce5ec");
      }
      if (su.uSunDir?.value && Array.isArray(preset.moonDir)) {
        su.uSunDir.value.set(preset.moonDir[0], preset.moonDir[1], preset.moonDir[2]).normalize();
      }
      if (su.uNightMix) su.uNightMix.value = isNight ? 1.0 : isDusk ? 0.35 : 0.0;
      if (su.uSunsetBlend) su.uSunsetBlend.value = isDusk ? 0.9 : 0.25;
    }

    for (const wm of this.waterMaterials || []) {
      const wu = wm?.uniforms;
      if (!wu) continue;
      if (wu.uSkyColor?.value) wu.uSkyColor.value.set(preset.skyZenith || "#070b14");
      if (wu.uSkyReflect?.value) wu.uSkyReflect.value.set(preset.skyHorizon || "#162030");
      if (wu.uHorizonColor?.value) wu.uHorizonColor.value.set(preset.skyHorizon || "#162030");
      if (wu.uDepthColor?.value) wu.uDepthColor.value.set(preset.waterShallow || "#152536");
      if (wu.uShallowColor?.value) wu.uShallowColor.value.set(preset.waterShallow || "#152536");
      if (wu.uShallow?.value) wu.uShallow.value.set(preset.waterShallow || "#152536");
      if (wu.uDeepColor?.value) wu.uDeepColor.value.set(preset.waterDeep || "#07101a");
      if (wu.uDeep?.value) wu.uDeep.value.set(preset.waterDeep || "#07101a");
      if (wu.uGlintColor?.value) {
        wu.uGlintColor.value.set(isNight ? "#5d7aa0" : isDusk ? "#b88a78" : "#d8e6f0");
      }
      if (wu.uMaxFresnel) wu.uMaxFresnel.value = isNight ? 0.42 : isDusk ? 0.56 : 0.72;
      if (wu.uSunDir?.value && Array.isArray(preset.moonDir)) {
        wu.uSunDir.value.set(preset.moonDir[0], preset.moonDir[1], preset.moonDir[2]).normalize();
      }
    }

    const foliageEmissive = isNight ? 0.0 : isDusk ? 0.03 : 0.09;
    for (const fm of this._treeFoliageMats || []) {
      if (fm) fm.emissiveIntensity = foliageEmissive;
    }

    for (const entry of this._nightEmissives || []) {
      if (!entry?.mat) continue;
      entry.mat.emissiveIntensity = (entry.baseIntensity ?? 0.2) * emissiveScale;
    }

    if (this.studioInteriorLight) {
      this.studioInteriorLight.intensity = isNight ? 0.22 : isDusk ? 0.55 : 0.95;
    }
  }

  getBuildingColliders() {
    if (this._buildingCollidersCache) return this._buildingCollidersCache;
    const boxes = [];
    const pad = 0.65;
    for (const b of CAMPUS_BUILDING_BLOCKS) {
      if (b.id === "bldg_bayview_canopy" || b.id === "bldg_gradient_canopy") continue;
      const cx = b.id === "bldg_north_commons" ? -32.0 : (b.cx ?? b.x ?? 0.0);
      const cz = b.cz ?? b.z ?? 0.0;
      const hx = (b.wx ?? 24.0) * 0.5 + pad;
      const hz = (b.wz ?? 20.0) * 0.5 + pad;
      boxes.push({
        id: b.id,
        minX: cx - hx,
        maxX: cx + hx,
        minZ: cz - hz,
        maxZ: cz + hz,
      });
    }
    // Gradient Canopy shell: leave central South doorway (|x| < 2.2 at z ~ 131.2) passable into empty Spin Studio
    boxes.push(
      { id: "grad_west_wing", minX: -19.2, maxX: -2.25, minZ: 129.0, maxZ: 158.8 },
      { id: "grad_east_wing", minX: 2.25, maxX: 19.2, minZ: 129.0, maxZ: 158.8 },
      { id: "grad_back_wall", minX: -19.2, maxX: 19.2, minZ: 148.5, maxZ: 158.8 },
      // East Basin Bay View Canopy pavilion footprint
      { id: "bayview_canopy_body", minX: 181.0, maxX: 223.0, minZ: -6.0, maxZ: 50.0 },
      // Shoreline amphitheatre shell backing
      { id: "shoreline_stage_shell", minX: -18.5, maxX: 42.5, minZ: -229.0, maxZ: -192.0 }
    );
    this._buildingCollidersCache = boxes;
    return boxes;
  }

  syncFromSnapshot(snap, elapsedSec = 0.0, cameraOpt = null) {
    const baseState = this._lastGlobalState || { elapsedTime: elapsedSec };
    const mergedState =
      Number.isFinite(elapsedSec) && baseState.elapsedTime !== elapsedSec
        ? { ...baseState, elapsedTime: elapsedSec }
        : baseState;
    this.update(1 / 60, snap, mergedState, cameraOpt);
  }

  update(dt, snap, globalState = {}, cameraOpt = null) {
    if (!snap) return;
    this._lastHeroSnap = snap;
    this._lastGlobalState = globalState;
    const simTime = globalState.elapsedTime || 0.0;

    // 0. Shadow-Frustum & Camera View-Cone Sightline Culling
    const enclosedInGym = false;
    if (this.grassFieldMesh) {
      this.grassFieldMesh.visible = true;
    }

    const activeCam =
      cameraOpt ||
      (typeof window !== "undefined" && window.__campusApp?.camera) ||
      null;
    let camX = snap.x;
    let camY = (snap.y ?? 0.0) + 1.45;
    let camZ = snap.z;
    let camFwdX = snap.forwardX ?? 0.0;
    let camFwdZ = snap.forwardZ ?? -1.0;
    let camFwd3X = camFwdX;
    let camFwd3Y = 0.0;
    let camFwd3Z = camFwdZ;
    let isTopDownCam = false;
    let topDownRadius = 36.0;
    if (activeCam && activeCam.matrixWorld) {
      const e = activeCam.matrixWorld.elements;
      if (Number.isFinite(e[12]) && Number.isFinite(e[14])) {
        camX = e[12];
        camZ = e[14];
        camY = Number.isFinite(e[13]) ? e[13] : camY;
        const fx = -e[8];
        const fy = -e[9];
        const fz = -e[10];
        isTopDownCam = fy < -0.68 && camY > 18.0;
        topDownRadius = Math.max(32.0, camY * 0.95);
        const fl = Math.hypot(fx, fz);
        if (fl > 1e-4) {
          camFwdX = fx / fl;
          camFwdZ = fz / fl;
        }
        const fl3 = Math.hypot(fx, fy, fz);
        if (fl3 > 1e-4) {
          camFwd3X = fx / fl3;
          camFwd3Y = fy / fl3;
          camFwd3Z = fz / fl3;
        }
      }
    }

    const isOutdoorAvoidanceActive = false;
    const heroRayX = snap.x;
    const heroRayY = (snap.y ?? 0.0) + 0.72;
    const heroRayZ = snap.z;
    const segDx = heroRayX - camX;
    const segDy = heroRayY - camY;
    const segDz = heroRayZ - camZ;
    const segXZLenSq = segDx * segDx + segDz * segDz;
    const canTestSightline = false;
    let fadedForegroundCount = 0;
    let unblockedObstructionCount = 0;

    const evalSightlineClearFactor = () => 1.0;

    const isLowQuality = globalState.qualityTier === "low";
    const inViewCone = (tx, tz, maxDist, closeRad = 28.0, minDot = 0.20) => {
      const dHero = Math.hypot(tx - snap.x, tz - snap.z);
      const dCam = Math.hypot(tx - camX, tz - camZ);
      if (isTopDownCam) {
        return dHero <= topDownRadius || dCam <= topDownRadius;
      }
      const effClose = isLowQuality ? Math.min(closeRad, 14.0) : closeRad;
      const effMax = isLowQuality ? Math.min(maxDist, 110.0) : maxDist;
      const effMinDot = isLowQuality ? Math.max(minDot, 0.35) : minDot;
      if (dCam <= 8.5 || dHero <= effClose * 0.5) return true;
      if (dCam > effMax && dHero > effMax) return false;
      const dot = ((tx - camX) * camFwdX + (tz - camZ) * camFwdZ) / (dCam + 1e-4);
      if (dHero <= effClose && dot >= -0.08) return true;
      return dot >= effMinDot;
    };

    let shadDirX = 0.65772;
    let shadDirZ = 0.75326;
    const activeSun =
      typeof window !== "undefined" && window.__campusApp?.sunLight;
    if (activeSun && activeSun.position) {
      const stx = activeSun.target?.position?.x ?? 0.0;
      const stz = activeSun.target?.position?.z ?? 0.0;
      const sdx = stx - activeSun.position.x;
      const sdz = stz - activeSun.position.z;
      const sdl = Math.hypot(sdx, sdz);
      if (sdl > 1e-4 && Number.isFinite(sdl)) {
        shadDirX = sdx / sdl;
        shadDirZ = sdz / sdl;
      }
    }
    const sweptShadowInCone = (px, pz, maxDist, closeRad = 36.0, minDot = 0.16) =>
      inViewCone(px, pz, maxDist, closeRad, minDot) ||
      inViewCone(px + shadDirX * 16.0, pz + shadDirZ * 16.0, maxDist, closeRad, minDot) ||
      inViewCone(px + shadDirX * 32.0, pz + shadDirZ * 32.0, maxDist, closeRad, minDot) ||
      inViewCone(px + shadDirX * 48.0, pz + shadDirZ * 48.0, maxDist, closeRad, minDot);

    const allowWorldShadows = !isLowQuality;
    const nearBridge = Math.hypot(snap.x - 35.0, snap.z + 122.0) < 80.0;
    const nearShoreline = Math.hypot(snap.x - 14.0, snap.z + 188.0) < 80.0;

    const visBridge = nearBridge || sweptShadowInCone(35.0, -122.0, 200.0, 62.0, 0.04);
    const visBayView = sweptShadowInCone(202.0, 22.0, 255.0, 72.0, -0.05);
    const visShoreline = nearShoreline || sweptShadowInCone(16.0, -198.0, 280.0, 76.0, -0.05);
    const visGradientCanopy = sweptShadowInCone(0.0, 145.6, 220.0, 68.0, -0.02);

    // PRIORITY 0.3A: Static spatial-quadrant horizon trees — ONLY toggle group visibility (`0` per-frame matrix loops/uploads!)
    if (this.horizonTreesStaticGroup) {
      this.horizonTreesStaticGroup.visible = !enclosedInGym;
    }

    // PRIORITY 0.3A: Dirty-Check Gate on `treeDynamicBatches` and `propDynamicBatches`!
    // Recompute `inViewCone` / `sweptShadowInCone` / `evalSightlineClearFactor` and upload `instanceMatrix` ONLY when:
    //   1) camera moves `> 0.35m`, OR
    //   2) camera forward rotates `> 1.2 deg` (`dot < cos(1.2 deg)`), OR
    //   3) `enclosedInGym` or `allowWorldShadows` (or `isTopDownCam` / `_isFast1080pSw`) flips, OR
    //   4) an active foreground sightline fade factor transitions by `> 0.01`, OR
    //   5) `forceRebuild` (`this._cullForceRebuild` / `globalState.forceCullRebuild`) is true!
    const fastSwTrees = Boolean(this._isFast1080pSw);
    const COS_1P2_DEG = 0.99978068; // Math.cos(1.2 * Math.PI / 180)
    const camMoved =
      !Number.isFinite(this._lastCullCamX) ||
      Math.hypot(
        camX - this._lastCullCamX,
        camY - this._lastCullCamY,
        camZ - this._lastCullCamZ
      ) > 0.35;
    const camRotated =
      camFwd3X * this._lastCullFwdX +
        camFwd3Y * this._lastCullFwdY +
        camFwd3Z * this._lastCullFwdZ <
      COS_1P2_DEG;
    const stateFlipped =
      enclosedInGym !== this._lastCullEnclosedInGym ||
      allowWorldShadows !== this._lastCullAllowShadows ||
      isTopDownCam !== this._lastCullIsTopDown ||
      fastSwTrees !== this._lastCullFastSw;
    const forceRebuild = Boolean(this._cullForceRebuild || globalState?.forceCullRebuild);

    let sightlineTransitioning = false;
    if (!camMoved && !camRotated && !stateFlipped && !forceRebuild && (canTestSightline || this._hadActiveSightlineFade)) {
      if (this.treeDynamicBatches) {
        for (let b = 0; b < this.treeDynamicBatches.length && !sightlineTransitioning; b++) {
          const trs = this.treeDynamicBatches[b].transforms;
          for (let i = 0; i < trs.length; i++) {
            const tr = trs[i];
            const prevCf = tr._lastSightCf ?? 1.0;
            if (!canTestSightline && prevCf >= 0.999) continue;
            if (Math.abs((tr.obsCx ?? tr.x) - camX) > 19.0 && prevCf >= 0.999) continue;
            if (Math.abs((tr.obsCz ?? tr.z) - camZ) > 19.0 && prevCf >= 0.999) continue;
            const cf = canTestSightline
              ? evalSightlineClearFactor(
                  tr.obsCx ?? tr.x,
                  tr.obsCz ?? tr.z,
                  tr.obsMinY ?? 0.0,
                  tr.obsMaxY ?? 5.5,
                  tr.obsRad ?? 0.58
                )
              : 1.0;
            if (Math.abs(cf - prevCf) > 0.01) {
              sightlineTransitioning = true;
              break;
            }
          }
        }
      }
      if (!sightlineTransitioning && this.propDynamicBatches) {
        for (let b = 0; b < this.propDynamicBatches.length && !sightlineTransitioning; b++) {
          const pls = this.propDynamicBatches[b].placements;
          for (let i = 0; i < pls.length; i++) {
            const pl = pls[i];
            const prevCf = pl._lastSightCf ?? 1.0;
            if (!canTestSightline && prevCf >= 0.999) continue;
            if (Math.abs((pl.obsCx ?? pl.x) - camX) > 19.0 && prevCf >= 0.999) continue;
            if (Math.abs((pl.obsCz ?? pl.z) - camZ) > 19.0 && prevCf >= 0.999) continue;
            const cf = canTestSightline
              ? evalSightlineClearFactor(
                  pl.obsCx ?? pl.x,
                  pl.obsCz ?? pl.z,
                  pl.obsMinY ?? 0.0,
                  pl.obsMaxY ?? 1.8,
                  pl.obsRad ?? 0.65
                )
              : 1.0;
            if (Math.abs(cf - prevCf) > 0.01) {
              sightlineTransitioning = true;
              break;
            }
          }
        }
      }
    }

    const cullDirty = camMoved || camRotated || stateFlipped || sightlineTransitioning || forceRebuild;
    if (cullDirty) {
      this._cullForceRebuild = false;
      this._lastCullCamX = camX;
      this._lastCullCamY = camY;
      this._lastCullCamZ = camZ;
      this._lastCullFwdX = camFwd3X;
      this._lastCullFwdY = camFwd3Y;
      this._lastCullFwdZ = camFwd3Z;
      this._lastCullEnclosedInGym = enclosedInGym;
      this._lastCullAllowShadows = allowWorldShadows;
      this._lastCullIsTopDown = isTopDownCam;
      this._lastCullFastSw = fastSwTrees;
      let anyActiveFade = false;

      if (this.treeDynamicBatches) {
        const heroShadowRad = fastSwTrees ? 40.0 : 80.0;
        const swSweptMaxRad = 68.0;
        const treeConeMax = fastSwTrees ? 132.0 : 315.0;
        const treeConeClose = fastSwTrees ? 28.0 : 38.0;
        for (const batch of this.treeDynamicBatches) {
          let nearCount = 0;
          let farCount = 0;
          const trs = batch.transforms;
          const hasFar = Array.isArray(batch.farMeshes) && batch.farMeshes.length === batch.meshes.length;
          for (let i = 0; i < trs.length; i++) {
            const tr = trs[i];
            if (enclosedInGym && (tr.z < 72.0 || Math.abs(tr.x) > 54.0)) {
              tr._lastSightCf = 1.0;
              continue;
            }
            const dHeroTree = Math.hypot(tr.x - snap.x, tr.z - snap.z);
            // V8-01: Keep 100% of swept sun-shadow segment (`P + s * (-sunDir)`, `s = 0, 16, 32, 48m`) tree shadow-caster logic intact!
            const castShadowCandidate =
              !enclosedInGym &&
              (dHeroTree <= heroShadowRad ||
                (fastSwTrees
                  ? dHeroTree <= swSweptMaxRad &&
                    sweptShadowInCone(tr.x, tr.z, treeConeMax, treeConeClose, 0.18)
                  : sweptShadowInCone(tr.x, tr.z, 155.0, 42.0, 0.16)));
            const directFarVisible =
              !castShadowCandidate && inViewCone(tr.x, tr.z, treeConeMax, treeConeClose, 0.30);
            if (!castShadowCandidate && !directFarVisible) {
              tr._lastSightCf = 1.0;
              continue;
            }
            if (canTestSightline) {
              const cf = evalSightlineClearFactor(
                tr.obsCx ?? tr.x,
                tr.obsCz ?? tr.z,
                tr.obsMinY ?? 0.0,
                tr.obsMaxY ?? 5.5,
                tr.obsRad ?? 0.58
              );
              tr._lastSightCf = cf;
              if (cf < 0.999) anyActiveFade = true;
              if (cf < 0.35) {
                fadedForegroundCount++;
                continue;
              }
            } else {
              tr._lastSightCf = 1.0;
            }
            const inShadowBox = allowWorldShadows ? castShadowCandidate : true;
            if (inShadowBox || !hasFar) {
              for (let m = 0; m < batch.meshes.length; m++) {
                batch.meshes[m].setMatrixAt(nearCount, tr.mat4);
              }
              nearCount++;
            } else {
              for (let m = 0; m < batch.farMeshes.length; m++) {
                batch.farMeshes[m].setMatrixAt(farCount, tr.mat4);
              }
              farCount++;
            }
          }
          for (let m = 0; m < batch.meshes.length; m++) {
            const inst = batch.meshes[m];
            inst.count = nearCount;
            inst.visible = nearCount > 0;
            inst.castShadow = allowWorldShadows;
            if (nearCount > 0) inst.instanceMatrix.needsUpdate = true;
          }
          if (hasFar) {
            for (let m = 0; m < batch.farMeshes.length; m++) {
              const fInst = batch.farMeshes[m];
              fInst.count = farCount;
              fInst.visible = farCount > 0;
              if (farCount > 0) fInst.instanceMatrix.needsUpdate = true;
            }
          }
        }
      }

      if (this.propDynamicBatches) {
        for (const batch of this.propDynamicBatches) {
          let activeCount = 0;
          const pls = batch.placements;
          if (!enclosedInGym) {
            for (let i = 0; i < pls.length; i++) {
              const pl = pls[i];
              if (!inViewCone(pl.x, pl.z, 195.0, 32.0, 0.28)) {
                pl._lastSightCf = 1.0;
                continue;
              }
              let useMat = pl.mat4;
              if (canTestSightline) {
                const cf = evalSightlineClearFactor(
                  pl.obsCx ?? pl.x,
                  pl.obsCz ?? pl.z,
                  pl.obsMinY ?? 0.0,
                  pl.obsMaxY ?? 1.8,
                  pl.obsRad ?? 0.65
                );
                pl._lastSightCf = cf;
                if (cf < 0.999) anyActiveFade = true;
                if (cf <= 0.08) {
                  fadedForegroundCount++;
                  continue;
                }
                if (cf < 0.995) {
                  fadedForegroundCount++;
                  _mat4Fade.copy(pl.mat4);
                  const me = _mat4Fade.elements;
                  me[0] *= cf;
                  me[1] *= cf;
                  me[2] *= cf;
                  me[4] *= cf;
                  me[5] *= cf;
                  me[6] *= cf;
                  me[8] *= cf;
                  me[9] *= cf;
                  me[10] *= cf;
                  useMat = _mat4Fade;
                }
              } else {
                pl._lastSightCf = 1.0;
              }
              for (let m = 0; m < batch.meshes.length; m++) {
                batch.meshes[m].setMatrixAt(activeCount, useMat);
              }
              activeCount++;
            }
          }
          for (let m = 0; m < batch.meshes.length; m++) {
            const inst = batch.meshes[m];
            inst.count = activeCount;
            inst.visible = activeCount > 0;
            inst.castShadow = allowWorldShadows && batch.castShadow;
            if (activeCount > 0) inst.instanceMatrix.needsUpdate = true;
          }
        }
      }
      this._hadActiveSightlineFade = anyActiveFade;
      this._lastBatchFadedCount = fadedForegroundCount;
    } else {
      fadedForegroundCount = this._lastBatchFadedCount || 0;
    }
    if (this.envV3BuildingsGroup) {
      for (const ch of this.envV3BuildingsGroup.children) {
        if (ch.userData?.replacedByV5) {
          ch.visible = false;
          continue;
        }
        const bx = ch.userData?.bx ?? 0.0;
        const bz = ch.userData?.bz ?? 0.0;
        const visB =
          (!enclosedInGym || bz > 60.0) &&
          (Math.hypot(bx - snap.x, bz - snap.z) <= 74.0 || inViewCone(bx, bz, 235.0, 62.0, -0.05));
        ch.visible = visB;
      }
    }
    if (this.archV5PavilionsGroup) {
      for (const ch of this.archV5PavilionsGroup.children) {
        const bx = ch.userData?.bx ?? 0.0;
        const bz = ch.userData?.bz ?? 0.0;
        const visPav =
          (!enclosedInGym || bz > 60.0) &&
          (Math.hypot(bx - snap.x, bz - snap.z) <= 76.0 || inViewCone(bx, bz, 245.0, 64.0, -0.08));
        ch.visible = visPav;
        if (ch.userData._lastCastShadow !== allowWorldShadows) {
          ch.userData._lastCastShadow = allowWorldShadows;
          ch.traverse((m) => {
            if (m.isMesh) m.castShadow = allowWorldShadows;
          });
        }
      }
    }
    if (this.archV5BermsGroup) {
      this.archV5BermsGroup.visible = !enclosedInGym;
      if (!enclosedInGym) {
        for (const berm of this.archV5BermsGroup.children) {
          const bx = berm.userData?.bx ?? 0.0;
          const bz = berm.userData?.bz ?? 0.0;
          berm.visible =
            Math.hypot(bx - snap.x, bz - snap.z) <= 72.0 ||
            inViewCone(bx, bz, 220.0, 48.0, 0.10);
          if (berm.userData._lastCastShadow !== allowWorldShadows) {
            berm.userData._lastCastShadow = allowWorldShadows;
            berm.traverse((m) => {
              if (m.isMesh) m.castShadow = allowWorldShadows;
            });
          }
        }
      }
    }
    if (this.archV5HorizonGroup) {
      const showHorizon = !(enclosedInGym && camFwdZ > 0.35);
      for (const seg of this.archV5HorizonGroup.children) {
        if (seg.isInstancedMesh) continue;
        if (seg.userData?.mx !== undefined && seg.userData?.mz !== undefined) {
          if (!showHorizon) {
            seg.visible = false;
          } else if (isTopDownCam) {
            seg.visible = false;
          } else {
            const mdx = seg.userData.mx - camX;
            const mdz = seg.userData.mz - camZ;
            const md = Math.hypot(mdx, mdz) + 1e-4;
            seg.visible = (mdx * camFwdX + mdz * camFwdZ) / md >= 0.28;
          }
        } else {
          seg.visible = showHorizon;
        }
      }
    }
    this.lastOutdoorAvoidanceHiddenCount = fadedForegroundCount;
    this.lastFadedForegroundPropCount = fadedForegroundCount;
    this.lastOutdoorObstructionCount = unblockedObstructionCount;

    if (this.gradientCanopyV6Group) {
      this.gradientCanopyV6Group.visible = visGradientCanopy;
      if (this.gradientCanopyFallback) this.gradientCanopyFallback.visible = false;
      if (this.gradientCanopyV2Group) this.gradientCanopyV2Group.visible = false;
    } else {
      if (this.gradientCanopyFallback && !this.gradientCanopyV2Group) {
        this.gradientCanopyFallback.visible = visGradientCanopy;
      }
      if (this.gradientCanopyV2Group) {
        this.gradientCanopyV2Group.visible = visGradientCanopy;
      }
    }
    if (this.bayViewV6Group) {
      this.bayViewV6Group.visible = visBayView;
      if (this.bayViewFallback) this.bayViewFallback.visible = false;
      if (this.bayViewV2Group) this.bayViewV2Group.visible = false;
    } else {
      if (this.bayViewFallback) {
        this.bayViewFallback.visible = visBayView;
      }
      if (this.bayViewV2Group) {
        this.bayViewV2Group.visible = visBayView;
      }
    }
    if (this.shorelineV2Group) {
      this.shorelineV2Group.visible = visShoreline;
    }
    if (this.shorelineMonumentGroup) {
      this.shorelineMonumentGroup.visible = visShoreline;
      const wantMonCast = allowWorldShadows && nearShoreline;
      if (this.shorelineMonumentGroup.userData._lastCastShadow !== wantMonCast) {
        this.shorelineMonumentGroup.userData._lastCastShadow = wantMonCast;
        this.shorelineMonumentGroup.traverse((ch) => {
          if (ch.isMesh && !ch.material?.transparent) ch.castShadow = wantMonCast;
        });
      }
    }
    if (this.stevensBridgeV6Group) {
      this.stevensBridgeV6Group.visible = visBridge;
      if (this.stevensBridgeGroup) this.stevensBridgeGroup.visible = false;
      if (this.stevensBridgeV2Group) this.stevensBridgeV2Group.visible = false;
      const wantBrCast = allowWorldShadows && nearBridge;
      if (this.stevensBridgeV6Group.userData._lastCastShadow !== wantBrCast) {
        this.stevensBridgeV6Group.userData._lastCastShadow = wantBrCast;
        this.stevensBridgeV6Group.traverse((ch) => {
          if (ch.isMesh && !ch.material?.transparent) ch.castShadow = wantBrCast;
        });
      }
    } else {
      if (this.stevensBridgeGroup && !this.stevensBridgeV2Group) {
        this.stevensBridgeGroup.visible = visBridge;
        for (const ch of this.stevensBridgeGroup.children) {
          if (ch.isMesh) ch.castShadow = allowWorldShadows && nearBridge;
        }
      }
      if (this.stevensBridgeV2Group) {
        this.stevensBridgeV2Group.visible = visBridge;
        for (const ch of this.stevensBridgeV2Group.children) {
          if (ch.isMesh) ch.castShadow = allowWorldShadows && nearBridge;
        }
      }
    }

    if (this.skyDome && this.skyDome.material?.uniforms?.uSunsetBlend) {
      const atmoId = this._currentAtmosphere?.id || "night";
      this.skyDome.material.uniforms.uSunsetBlend.value = atmoId === "dusk" ? 0.9 : 0.25;
    }

    if (this.v5Grass) {
      const guo = this._grassUpdateOpts;
      guo.stanShockwave = null;
      guo.visible = true;
      this.v5Grass.update(simTime, guo);
    }

    // 2. Animated Fresnel Water
    for (const wm of this.waterMaterials) {
      if (typeof wm.updateWaterTime === "function") {
        wm.updateWaterTime(simTime);
      } else if (wm.uniforms?.uTime) {
        wm.uniforms.uTime.value = simTime;
      }
    }
  }

  /**
   * Campus-Wide `Box3` Clearance & Hardscape Hygiene Audit.
   */
  verifyCampusPropClearances() {
    this.root.updateMatrixWorld(true);
    const violations = [];
    const tmpBox = new THREE.Box3();
    const childBox = new THREE.Box3();

    const isReplacedFallback = (obj) => {
      let cur = obj;
      while (cur && cur !== this.root) {
        if (cur.userData?.replacedByV5 || cur.userData?.replacedByV6) return true;
        cur = cur.parent;
      }
      return false;
    };

    // 1. Gather structural `Box3` obstacles (buildings, canopies, Shoreline amphitheatre, Corten bridge)
    const structures = [];
    const pushStructuralGroupBoxes = (grp, labelPrefix) => {
      if (!grp || isReplacedFallback(grp)) return;
      grp.updateMatrixWorld(true);
      grp.traverse((m) => {
        if (!m.isMesh || !m.geometry || isReplacedFallback(m)) return;
        const mName = `${m.name || ""} ${m.parent?.name || ""}`;
        if (/HexPavers|Concourse|Medallion|Shadow|AO|Water|Grass|Lawn|Apron|Plaza_Disc/i.test(mName)) {
          return;
        }
        if (!m.geometry.boundingBox) m.geometry.computeBoundingBox();
        if (!m.geometry.boundingBox) return;
        tmpBox.copy(m.geometry.boundingBox).applyMatrix4(m.matrixWorld);
        if (!Number.isFinite(tmpBox.min.x) || tmpBox.max.y - tmpBox.min.y <= 0.38) return;
        structures.push({
          name: `${labelPrefix}:${m.name || "mesh"}`,
          minX: tmpBox.min.x,
          maxX: tmpBox.max.x,
          minY: tmpBox.min.y,
          maxY: tmpBox.max.y,
          minZ: tmpBox.min.z,
          maxZ: tmpBox.max.z,
        });
      });
    };

    pushStructuralGroupBoxes(this.gradientCanopyV6Group || this.gradientCanopyFallback, "GradientCanopy");
    pushStructuralGroupBoxes(this.bayViewV6Group || this.bayViewFallback, "BayViewCanopy");
    pushStructuralGroupBoxes(this.archV5PavilionsGroup, "OfficePavilionV6");
    if (this.envV3BuildingsGroup) {
      for (const ch of this.envV3BuildingsGroup.children) {
        if (!ch.userData?.replacedByV5) pushStructuralGroupBoxes(ch, `CampusBldg:${ch.name || "bldg"}`);
      }
    }
    if (this.shorelineV2Group) {
      pushStructuralGroupBoxes(this.shorelineV2Group, "Shoreline");
    } else if (this.shorelineFallback) {
      structures.push({
        name: "Shoreline:StageAndBowl",
        minX: -18.5,
        maxX: 42.5,
        minY: 0.22,
        maxY: 26.0,
        minZ: -228.0,
        maxZ: -186.15,
      });
    }
    pushStructuralGroupBoxes(this.shorelineMonumentGroup, "ShorelineMonument");
    pushStructuralGroupBoxes(this.stevensBridgeV6Group || this.stevensBridgeGroup, "StevensCreekBridge");

    if (structures.length === 0) {
      for (const b of CAMPUS_BUILDING_BLOCKS) {
        const bx = b.id === "bldg_north_commons" ? -32.0 : (b.cx ?? b.x ?? 0.0);
        const bz = b.cz ?? b.z ?? 0.0;
        const hx = (b.wx ?? 28.0) * 0.5;
        const hz = (b.wz ?? 24.0) * 0.5;
        structures.push({
          name: `FallbackBldg:${b.id}`,
          minX: bx - hx,
          maxX: bx + hx,
          minY: 0.0,
          maxY: b.hy ?? 12.0,
          minZ: bz - hz,
          maxZ: bz + hz,
        });
      }
      structures.push({
        name: "GradientCanopy:Facade",
        minX: -19.2,
        maxX: 19.2,
        minY: 0.0,
        maxY: 11.5,
        minZ: 128.8,
        maxZ: 158.5,
      });
    }

    // 2. Gather ALL placed audited streetscape props across the 480m x 480m campus
    const props = [];
    const batchProtoBox = new THREE.Box3();
    let usedDynamicFurnitureBatches = false;
    for (const batch of this.propDynamicBatches || []) {
      const bIdent = `${batch.name || ""} ${batch.category || ""} ${batch.meshes?.[0]?.name || ""}`;
      if (/Shrub|Hedge|Plume|Boulder|Planter_Wall/i.test(bIdent)) continue;
      let kind = null;
      if (/Bench/i.test(bIdent)) kind = "bench";
      else if (/Planter/i.test(bIdent)) kind = "planter";
      else if (/Bike_?Rack|BikeRack/i.test(bIdent)) kind = "bikerack";
      else if (/Trash|TriBin/i.test(bIdent)) kind = "tribins";
      else if (/Lamp/i.test(bIdent)) kind = "lamp";
      if (!kind && batch.placements === this.benchPlacements) kind = "bench";
      if (!kind && batch.placements === this.planterPlacements) kind = "planter";
      if (!kind && batch.placements === this.bikeRackPlacements) kind = "bikerack";
      if (!kind && batch.placements === this.triBinPlacements) kind = "tribins";
      if (!kind && batch.placements === this.lampPlacements) kind = "lamp";
      if (!kind) continue;

      batchProtoBox.makeEmpty();
      for (const inst of batch.meshes || []) {
        if (inst?.geometry) {
          if (!inst.geometry.boundingBox) inst.geometry.computeBoundingBox();
          if (inst.geometry.boundingBox) batchProtoBox.union(inst.geometry.boundingBox);
        }
      }
      if (batchProtoBox.isEmpty()) continue;
      usedDynamicFurnitureBatches = true;
      const pls = batch.placements || [];
      for (let i = 0; i < pls.length; i++) {
        const pl = pls[i];
        if (!pl.mat4) continue;
        tmpBox.copy(batchProtoBox).applyMatrix4(pl.mat4);
        props.push({
          name: `${kind}_${i}`,
          kind,
          cx: 0.5 * (tmpBox.min.x + tmpBox.max.x),
          cz: 0.5 * (tmpBox.min.z + tmpBox.max.z),
          minX: tmpBox.min.x,
          maxX: tmpBox.max.x,
          minY: tmpBox.min.y,
          maxY: tmpBox.max.y,
          minZ: tmpBox.min.z,
          maxZ: tmpBox.max.z,
        });
      }
    }

    if (!usedDynamicFurnitureBatches) {
      const pushAnalyticList = (list, kind, hx, hz, h) => {
        for (let i = 0; i < (list || []).length; i++) {
          const p = list[i];
          const c = Math.abs(Math.cos(p.rotY || 0));
          const s = Math.abs(Math.sin(p.rotY || 0));
          const ex = c * hx + s * hz;
          const ez = s * hx + c * hz;
          props.push({
            name: `${kind}_${i}`,
            kind,
            cx: p.x,
            cz: p.z,
            minX: p.x - ex,
            maxX: p.x + ex,
            minY: p.y ?? 0.0,
            maxY: (p.y ?? 0.0) + h,
            minZ: p.z - ez,
            maxZ: p.z + ez,
          });
        }
      };
      pushAnalyticList(this.benchPlacements, "bench", 0.98, 0.36, 0.85);
      pushAnalyticList(this.planterPlacements, "planter", 0.62, 0.62, 1.06);
      pushAnalyticList(this.bikeRackPlacements, "bikerack", 0.85, 0.42, 0.88);
      pushAnalyticList(this.triBinPlacements, "tribins", 0.58, 0.34, 0.98);
      pushAnalyticList(this.lampPlacements, "lamp", 0.35, 0.35, 5.20);
    }

    let minClearanceM = Infinity;
    for (let i = 0; i < props.length; i++) {
      const p = props[i];
      for (let j = 0; j < structures.length; j++) {
        const s = structures[j];
        const dx = Math.max(0.0, p.minX - s.maxX, s.minX - p.maxX);
        const dz = Math.max(0.0, p.minZ - s.maxZ, s.minZ - p.maxZ);
        const distXZ = Math.hypot(dx, dz);
        if (distXZ < minClearanceM) minClearanceM = distXZ;
        if (distXZ < 0.75) {
          violations.push({
            type: "structure_clearance",
            prop: p.name,
            structure: s.name,
            clearanceM: Number(distXZ.toFixed(3)),
            x: Number(p.cx.toFixed(2)),
            z: Number(p.cz.toFixed(2)),
          });
        }
      }
    }

    for (let i = 0; i < props.length; i++) {
      const a = props[i];
      for (let j = i + 1; j < props.length; j++) {
        const b = props[j];
        const dx = Math.max(0.0, a.minX - b.maxX, b.minX - a.maxX);
        const dz = Math.max(0.0, a.minZ - b.maxZ, b.minZ - a.maxZ);
        const distXZ = Math.hypot(dx, dz);
        if (distXZ < 0.15) {
          violations.push({
            type: "prop_overlap",
            propA: a.name,
            propB: b.name,
            clearanceM: Number(distXZ.toFixed(3)),
            x: Number(a.cx.toFixed(2)),
            z: Number(a.cz.toFixed(2)),
          });
        }
      }
    }

    return {
      ok: violations.length === 0,
      totalPropsChecked: props.length,
      minClearanceM: Number((Number.isFinite(minClearanceM) ? minClearanceM : 0).toFixed(3)),
      violations,
    };
  }
}
