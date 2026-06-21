import {
  Color3,
  DynamicTexture,
  MeshBuilder,
  StandardMaterial,
  Texture,
  Vector3,
  type AbstractMesh,
  type Scene,
} from "@babylonjs/core";

const T      = 0.2;
const MAP_W  = 90;   // -45 … +45
const MAP_D  = 90;   // -45 … +45
const MAP_CX = 0;
const MAP_CZ = 0;

function buildCarpetTexture(scene: Scene): DynamicTexture {
  const SIZE = 512;
  const TILE = 32;
  const tex  = new DynamicTexture("global_carpet", { width: SIZE, height: SIZE }, scene, true);
  const ctx  = tex.getContext() as CanvasRenderingContext2D;
  const cols = SIZE / TILE;

  ctx.fillStyle = "#989460";
  ctx.fillRect(0, 0, SIZE, SIZE);

  for (let i = 0; i < cols; i++) {
    for (let j = 0; j < cols; j++) {
      const x = i * TILE, y = j * TILE;
      ctx.fillStyle = (i + j) % 2 === 0 ? "#a29e6a" : "#8c8858";
      ctx.fillRect(x + 1, y + 1, TILE - 2, TILE - 2);
      const cx = x + TILE / 2, cy = y + TILE / 2, r = TILE * 0.30;
      ctx.fillStyle = "#a09c64";
      ctx.beginPath();
      ctx.moveTo(cx, cy - r); ctx.lineTo(cx + r, cy);
      ctx.lineTo(cx, cy + r); ctx.lineTo(cx - r, cy);
      ctx.closePath(); ctx.fill();
      ctx.fillStyle = "#747060";
      ctx.beginPath();
      ctx.arc(cx, cy, r * 0.35, 0, Math.PI * 2);
      ctx.fill();
    }
  }

  tex.update();
  tex.wrapU = Texture.WRAP_ADDRESSMODE;
  tex.wrapV = Texture.WRAP_ADDRESSMODE;
  return tex;
}

function buildGrimeOverlay(scene: Scene, id: string, size: number): AbstractMesh {
  const SIZE   = 512;
  // Stain-Inhalt bleibt in der inneren 65% — Alpha fällt vor der Mesh-Kante auf 0
  const MARGIN = SIZE * 0.175;
  const INNER  = SIZE - 2 * MARGIN;

  const tex  = new DynamicTexture(`global_grime_${id}`, { width: SIZE, height: SIZE }, scene, false);
  tex.hasAlpha = true;
  const ctx  = tex.getContext() as CanvasRenderingContext2D;
  ctx.clearRect(0, 0, SIZE, SIZE);

  // Weiche Hintergrund-Verfärbungen (nur im inneren Bereich)
  for (let i = 0; i < 5; i++) {
    const cx  = MARGIN + Math.random() * INNER;
    const cy  = MARGIN + Math.random() * INNER;
    const r   = INNER * (0.25 + Math.random() * 0.25);
    const a   = 0.03 + Math.random() * 0.04;
    const rgb = Math.random() < 0.75 ? '22,18,6' : '200,192,130';
    const g   = ctx.createRadialGradient(cx, cy, 0, cx, cy, r);
    g.addColorStop(0, `rgba(${rgb},${a})`);
    g.addColorStop(1, `rgba(${rgb},0)`);
    ctx.fillStyle = g;
    ctx.beginPath(); ctx.arc(cx, cy, r, 0, Math.PI * 2); ctx.fill();
  }

  // Poly-Flecken mit vielen Kontrollpunkten für organische Kurven
  const stainPos: Array<{ x: number; y: number }> = [];
  const MIN_DIST = INNER * 0.35;
  for (let i = 0; i < 2; i++) {
    let cx = 0, cy = 0, tries = 0;
    do {
      cx = MARGIN + INNER * (0.2 + Math.random() * 0.6);
      cy = MARGIN + INNER * (0.2 + Math.random() * 0.6);
      tries++;
    } while (tries < 50 && stainPos.some(p => Math.hypot(p.x - cx, p.y - cy) < MIN_DIST));
    stainPos.push({ x: cx, y: cy });

    const r    = INNER * (0.15 + Math.random() * 0.18);
    const a    = 0.07 + Math.random() * 0.07;
    const nPts = 14 + Math.floor(Math.random() * 5);  // 14–18 Punkte → glatte organische Form
    const pts  = Array.from({ length: nPts }, (_, k) => {
      const theta = (k / nPts) * Math.PI * 2 + (Math.random() - 0.5) * (Math.PI / nPts);
      const rad   = r * (0.60 + Math.random() * 0.40);
      return { x: cx + Math.cos(theta) * rad, y: cy + Math.sin(theta) * rad };
    });
    ctx.beginPath();
    ctx.moveTo((pts[nPts - 1].x + pts[0].x) / 2, (pts[nPts - 1].y + pts[0].y) / 2);
    for (let k = 0; k < nPts; k++) {
      const cur = pts[k], next = pts[(k + 1) % nPts];
      ctx.quadraticCurveTo(cur.x, cur.y, (cur.x + next.x) / 2, (cur.y + next.y) / 2);
    }
    ctx.closePath();
    const g = ctx.createRadialGradient(cx, cy, 0, cx, cy, r * 1.2);
    g.addColorStop(0,   `rgba(12,10,3,${a})`);
    g.addColorStop(0.7, `rgba(12,10,3,${a * 0.3})`);
    g.addColorStop(1,   `rgba(12,10,3,0)`);
    ctx.fillStyle = g;
    ctx.fill();
  }

  tex.update();

  const mat = new StandardMaterial(`global_mat_grime_${id}`, scene);
  mat.diffuseTexture             = tex;
  mat.useAlphaFromDiffuseTexture = true;
  mat.specularColor              = Color3.Black();
  mat.maxSimultaneousLights      = 6;

  const mesh = MeshBuilder.CreateBox(`global_grime_mesh_${id}`,
    { width: size, height: 0.001, depth: size }, scene);
  mesh.material = mat;
  return mesh;
}

export function buildGlobalFloor(scene: Scene): AbstractMesh[] {
  const meshes: AbstractMesh[] = [];

  const carpetTex = buildCarpetTexture(scene);
  carpetTex.uScale = MAP_D / 3;  // 30 Kacheln à 3 m
  carpetTex.vScale = MAP_W / 3;

  const floorMat = new StandardMaterial("global_floor_mat", scene);
  floorMat.diffuseTexture      = carpetTex;
  floorMat.specularColor       = Color3.Black();
  floorMat.maxSimultaneousLights = 6;

  const floor = MeshBuilder.CreateBox("global_floor",
    { width: MAP_W, height: T, depth: MAP_D }, scene);
  floor.position        = new Vector3(MAP_CX, -T / 2, MAP_CZ);
  floor.material        = floorMat;
  floor.checkCollisions = true;
  meshes.push(floor);

  // Viele kleine quadratische Overlays — organische Flecken-Dichte wie per Raum,
  // zufällig rotiert damit keine Achsenausrichtung sichtbar wird
  for (let i = 0; i < 80; i++) {
    const size  = 9 + Math.random() * 7;  // 9–16 m, immer quadratisch
    const gx    = (Math.random() - 0.5) * (MAP_W - 4);
    const gz    = MAP_CZ + (Math.random() - 0.5) * (MAP_D - 4);
    const grime = buildGrimeOverlay(scene, String(i), size);
    grime.position   = new Vector3(gx, 0.006 + i * 0.00006, gz);
    grime.rotation.y = Math.random() * Math.PI * 2;
    meshes.push(grime);
  }

  return meshes;
}
