import { MeshBuilder, StandardMaterial, DynamicTexture, Texture, PointLight, Color3, Vector3, Animation, TransformNode, type Scene } from "@babylonjs/core";
import { RoomBase } from "./RoomBase";
import type { DoorDefinition } from "./IRoom";

// Unveränderliche Konstruktionsmaße
const T      = 0.2;  // Wandstärke
const DOOR_W = 1.0;  // Türbreite
const DOOR_H = 2.0;  // Türhöhe

// Physikalische Kachelgröße für Wandtapete — konstant über alle Raumgrößen
// E/W-Flächen haben rotierte UV-Achsen (U→Höhe, V→Tiefe), daher tauschen
// die Werte für diese Wände die Rollen.
const TILE_W = 0.175; // m pro Kachel horizontal
const TILE_H = 0.386; // m pro Kachel vertikal

export class PlaceholderRoom extends RoomBase {
  readonly id: string;
  readonly doors: DoorDefinition[];
  readonly spawnPoint: Vector3;

  private readonly W: number; // Breite  (Vielfaches von 3)
  private readonly D: number; // Tiefe   (Vielfaches von 3)
  private readonly H: number; // Höhe
  private readonly doorX: number; // X-Mitte der Türöffnung (Segment-Zentrum)

  constructor(id: string, width = 6, depth = 6, height = 2.8, doorSegment = 0) {
    super();
    this.id = id;
    this.W  = width;
    this.D  = depth;
    this.H  = height;
    this.doorX = -width / 2 + 1.5 + doorSegment * 3;
    // Zufälliges Segmentzentrum — Segmentzentren sind immer säulenfrei
    const si = Math.floor(Math.random() * (width  / 3));
    const sk = Math.floor(Math.random() * (depth / 3));
    this.spawnPoint = new Vector3(
      -width / 2 + 1.5 + si * 3,
      0,
      -depth / 2 + 1.5 + sk * 3,
    );

    this.doors = [
      { id: "north", position: new Vector3(this.doorX, DOOR_H / 2, -this.D / 2), direction: new Vector3(0, 0, -1) },
      { id: "south", position: new Vector3(0, DOOR_H / 2,  this.D / 2), direction: new Vector3(0, 0,  1) },
      { id: "east",  position: new Vector3( this.W / 2, DOOR_H / 2, 0), direction: new Vector3( 1, 0, 0) },
      { id: "west",  position: new Vector3(-this.W / 2, DOOR_H / 2, 0), direction: new Vector3(-1, 0, 0) },
    ];
  }

  protected async buildGeometry(scene: Scene): Promise<void> {
    const { W, D, H, doorX } = this;

    // Abgeleitete Maße
    const wallH  = H + T;
    const leftW  = doorX + W / 2 - DOOR_W / 2; // Wandpanel links der Tür
    const rightW = W / 2 - doorX - DOOR_W / 2;  // Wandpanel rechts der Tür
    const topH   = wallH - DOOR_H;
    const northZ = -D / 2 - T / 2;

    // Materialien — maxSimultaneousLights=5: HemisphericLight + 4 Raum-PointLights
    const floorMat     = this.mat(scene, "floor",     Color3.White());
    const ceilMat      = this.mat(scene, "ceil",      Color3.White());
    const wallMatNL    = this.mat(scene, "wall_nl",   Color3.White());
    const wallMatNR    = this.mat(scene, "wall_nr",   Color3.White());
    const wallMatS     = this.mat(scene, "wall_s",    Color3.White());
    const wallMatEW    = this.mat(scene, "wall_ew",   Color3.White());
    const wallMatNTop  = this.mat(scene, "wall_n_top",Color3.White());
    const frameMat     = this.mat(scene, "frame",     new Color3(0.42, 0.37, 0.16));
    const baseboardMat = this.mat(scene, "baseboard", new Color3(0.71, 0.69, 0.42));
    const corniceMat   = this.mat(scene, "cornice",   new Color3(0.57, 0.56, 0.48));

    for (const m of [floorMat, ceilMat, wallMatNL, wallMatNR, wallMatS, wallMatEW, wallMatNTop, frameMat, baseboardMat, corniceMat]) {
      m.maxSimultaneousLights = 5;
    }

    // Tapeten — physikalisch identische Kachelgröße auf allen Wänden
    wallMatNL.diffuseTexture   = this.buildWallpaperTexture(scene, "nl",    leftW  / TILE_W, wallH / TILE_H);
    wallMatNR.diffuseTexture   = this.buildWallpaperTexture(scene, "nr",    rightW / TILE_W, wallH / TILE_H);
    wallMatS.diffuseTexture    = this.buildWallpaperTexture(scene, "s",     W      / TILE_W, wallH / TILE_H);
    wallMatEW.diffuseTexture   = this.buildWallpaperTexture(scene, "ew",    wallH  / TILE_H, D     / TILE_W);
    wallMatNTop.diffuseTexture = this.buildWallpaperTexture(scene, "n_top", DOOR_W / TILE_W, topH  / TILE_H);

    // Teppich
    const carpetTex = this.buildCarpetTexture(scene);
    carpetTex.uScale = W / 2; // 2m pro Kachel
    carpetTex.vScale = D / 2;
    floorMat.diffuseTexture = carpetTex;

    // Deckenplatten — 1 Kachel pro Meter, Skala aus Raumgröße
    // Unterseite der Box (-Y-Fläche): U→Z (Tiefe), V→X (Breite) — Achsen getauscht
    const { diffuse: ceilDiff, bump: ceilBump } = this.buildCeilingTileTexture(scene);
    ceilDiff.uScale = D;
    ceilDiff.vScale = W;
    ceilBump.uScale = D;
    ceilBump.vScale = W;
    ceilMat.diffuseTexture = ceilDiff;
    ceilMat.bumpTexture    = ceilBump;
    ceilMat.bumpTexture.level = 0.35;

    // Boden
    const floor = MeshBuilder.CreateBox(`${this.id}_floor`,
      { width: W + 2 * T, height: T, depth: D + 2 * T }, scene);
    floor.position.y = -T / 2;
    floor.material = floorMat;
    this.track(floor);

    // Decke
    const ceil = MeshBuilder.CreateBox(`${this.id}_ceil`,
      { width: W, height: T, depth: D }, scene);
    ceil.position.y = H + T / 2;
    ceil.material = ceilMat;
    this.track(ceil);

    // Vollwände (Süd, Ost, West)
    for (const s of [
      { name: "south", pos: new Vector3(0,             wallH / 2,  D / 2 + T / 2), w: W, d: T, mat: wallMatS  },
      { name: "east",  pos: new Vector3( W / 2 + T / 2, wallH / 2, 0),             w: T, d: D, mat: wallMatEW },
      { name: "west",  pos: new Vector3(-W / 2 - T / 2, wallH / 2, 0),             w: T, d: D, mat: wallMatEW },
    ] as Array<{ name: string; pos: Vector3; w: number; d: number; mat: StandardMaterial }>) {
      const mesh = MeshBuilder.CreateBox(`${this.id}_wall_${s.name}`,
        { width: s.w, height: wallH, depth: s.d }, scene);
      mesh.position = s.pos;
      mesh.material = s.mat;
      this.track(mesh);
    }

    // Nordwand mit Türöffnung (3 Segmente, Tür bei doorX)
    const northLeft = MeshBuilder.CreateBox(`${this.id}_wall_north_L`,
      { width: leftW, height: wallH, depth: T }, scene);
    northLeft.position = new Vector3(-W / 2 + leftW / 2, wallH / 2, northZ);
    northLeft.material = wallMatNL;
    this.track(northLeft);

    const northRight = MeshBuilder.CreateBox(`${this.id}_wall_north_R`,
      { width: rightW, height: wallH, depth: T }, scene);
    northRight.position = new Vector3(W / 2 - rightW / 2, wallH / 2, northZ);
    northRight.material = wallMatNR;
    this.track(northRight);

    const northTop = MeshBuilder.CreateBox(`${this.id}_wall_north_T`,
      { width: DOOR_W, height: topH, depth: T }, scene);
    northTop.position = new Vector3(doorX, DOOR_H + topH / 2, northZ);
    northTop.material = wallMatNTop;
    this.track(northTop);

    this.buildDoorFrame(scene, northZ, frameMat);
    this.buildDoor(scene, northZ);
    this.buildBaseboards(scene, baseboardMat);
    this.buildCornice(scene, corniceMat);
    this.buildFloorGrime(scene);
    this.buildCeilingLamps(scene);
    this.buildRoomLighting(scene);
    this.buildDividers(scene);
  }

  private buildDividers(scene: Scene): void {
    const { W, D, H } = this;
    if (W <= 6 && D <= 6) return;

    const COL_S = 0.30;      // Säulenquerschnitt
    const H_DIV = H * 0.65;  // Stubhöhe
    const T_DIV = 0.15;      // Stubstärke
    const sectX = W / 3;
    const sectZ = D / 3;

    const BS_H = 0.10, BS_D = 0.04;

    const colMat  = this.mat(scene, "div_col",      new Color3(0.71, 0.69, 0.42));
    const bsMat   = this.mat(scene, "div_baseboard", new Color3(0.71, 0.69, 0.42));
    const cnMat   = this.mat(scene, "div_cornice",   new Color3(0.57, 0.56, 0.48));

    // Stubs N/S: ±X-Flächen sichtbar → UV-Quirk (U→Höhe, V→Tiefe)
    const matNS = this.mat(scene, "div_ns", Color3.White());
    matNS.diffuseTexture = this.buildWallpaperTexture(scene, "div_ns",
      H_DIV / TILE_H, 3 / TILE_W);

    // Stubs E/W: ±Z-Flächen sichtbar → kein Quirk
    const matEW = this.mat(scene, "div_ew", Color3.White());
    matEW.diffuseTexture = this.buildWallpaperTexture(scene, "div_ew",
      3 / TILE_W, H_DIV / TILE_H);

    for (const m of [colMat, bsMat, cnMat, matNS, matEW])
      m.maxSimultaneousLights = 5;

    for (let ix = 1; ix < sectX; ix++) {
      for (let iz = 1; iz < sectZ; iz++) {
        const colX = -W / 2 + ix * 3;
        const colZ = -D / 2 + iz * 3;

        // Säule (volle Raumhöhe)
        const col = MeshBuilder.CreateBox(`${this.id}_col_${ix}_${iz}`,
          { width: COL_S, height: H, depth: COL_S }, scene);
        col.position = new Vector3(colX, H / 2, colZ);
        col.material = colMat;
        this.track(col);

        // Scheuerleiste um Säule (N/S mit Eckstücken, damit kein Spalt)
        for (const b of [
          { s: 'bN', p: new Vector3(colX, BS_H/2, colZ-COL_S/2-BS_D/2), w: COL_S+2*BS_D, h: BS_H, d: BS_D },
          { s: 'bS', p: new Vector3(colX, BS_H/2, colZ+COL_S/2+BS_D/2), w: COL_S+2*BS_D, h: BS_H, d: BS_D },
          { s: 'bW', p: new Vector3(colX-COL_S/2-BS_D/2, BS_H/2, colZ), w: BS_D, h: BS_H, d: COL_S },
          { s: 'bE', p: new Vector3(colX+COL_S/2+BS_D/2, BS_H/2, colZ), w: BS_D, h: BS_H, d: COL_S },
        ]) {
          const m = MeshBuilder.CreateBox(`${this.id}_col_${b.s}_${ix}_${iz}`,
            { width: b.w, height: b.h, depth: b.d }, scene);
          m.position = b.p; m.material = bsMat; this.prop(m);
        }

        // Deckenleiste um Säule (N/S mit Eckstücken)
        const cY = H - 0.02;
        for (const c of [
          { s: 'cN', p: new Vector3(colX, cY, colZ-COL_S/2-0.02), w: COL_S+0.08, h: 0.04, d: 0.04 },
          { s: 'cS', p: new Vector3(colX, cY, colZ+COL_S/2+0.02), w: COL_S+0.08, h: 0.04, d: 0.04 },
          { s: 'cW', p: new Vector3(colX-COL_S/2-0.02, cY, colZ), w: 0.04, h: 0.04, d: COL_S },
          { s: 'cE', p: new Vector3(colX+COL_S/2+0.02, cY, colZ), w: 0.04, h: 0.04, d: COL_S },
        ]) {
          const m = MeshBuilder.CreateBox(`${this.id}_col_${c.s}_${ix}_${iz}`,
            { width: c.w, height: c.h, depth: c.d }, scene);
          m.position = c.p; m.material = cnMat; this.prop(m);
        }

        // Stub: 0 oder 1 pro Säule, nur wenn Außenwand ≤3.5m entfernt
        if (Math.random() > 0.6) continue;
        const distN = colZ + D / 2;
        const distS = D / 2 - colZ;
        const distW = colX + W / 2;
        const distE = W / 2 - colX;
        const minDist = Math.min(distN, distS, distW, distE);
        if (minDist > 3.5) continue;

        const cands: Array<'N' | 'S' | 'W' | 'E'> = [];
        if (distN <= minDist + 0.01) cands.push('N');
        if (distS <= minDist + 0.01) cands.push('S');
        if (distW <= minDist + 0.01) cands.push('W');
        if (distE <= minDist + 0.01) cands.push('E');
        const dir = cands[Math.floor(Math.random() * cands.length)];

        if (dir === 'N' || dir === 'S') {
          const toWall  = dir === 'N' ? distN : distS;
          const stubLen = toWall - COL_S / 2;
          const signZ   = dir === 'N' ? -1 : 1;
          const stubCZ  = colZ + signZ * (COL_S / 2 + stubLen / 2);

          const stub = MeshBuilder.CreateBox(`${this.id}_stub_${ix}_${iz}`,
            { width: T_DIV, height: H_DIV, depth: stubLen }, scene);
          stub.position = new Vector3(colX, H_DIV / 2, stubCZ);
          stub.material = matNS;
          this.track(stub);

          // Scheuerleiste an den langen ±X-Seiten des Stubs
          for (const [sx, ss] of [[-1, 'W'], [1, 'E']] as [number, string][]) {
            const bx = colX + sx * (T_DIV / 2 + BS_D / 2);
            const bm = MeshBuilder.CreateBox(`${this.id}_stub_bs_${ix}_${iz}_${ss}`,
              { width: BS_D, height: BS_H, depth: stubLen }, scene);
            bm.position = new Vector3(bx, BS_H / 2, stubCZ);
            bm.material = bsMat; this.prop(bm);
          }
        } else {
          const toWall  = dir === 'W' ? distW : distE;
          const stubLen = toWall - COL_S / 2;
          const signX   = dir === 'W' ? -1 : 1;
          const stubCX  = colX + signX * (COL_S / 2 + stubLen / 2);

          const stub = MeshBuilder.CreateBox(`${this.id}_stub_${ix}_${iz}`,
            { width: stubLen, height: H_DIV, depth: T_DIV }, scene);
          stub.position = new Vector3(stubCX, H_DIV / 2, colZ);
          stub.material = matEW;
          this.track(stub);

          // Scheuerleiste an den langen ±Z-Seiten des Stubs
          for (const [sz, ss] of [[-1, 'N'], [1, 'S']] as [number, string][]) {
            const bz = colZ + sz * (T_DIV / 2 + BS_D / 2);
            const bm = MeshBuilder.CreateBox(`${this.id}_stub_bs_${ix}_${iz}_${ss}`,
              { width: stubLen, height: BS_H, depth: BS_D }, scene);
            bm.position = new Vector3(stubCX, BS_H / 2, bz);
            bm.material = bsMat; this.prop(bm);
          }
        }
      }
    }
  }

  private buildWallpaperTexture(scene: Scene, id: string, uScale: number, vScale: number): DynamicTexture {
    const SIZE = 256;
    const HALF = SIZE / 2;
    const tex  = new DynamicTexture(`${this.id}_wallpaper_${id}`, { width: SIZE, height: SIZE }, scene, true);
    const ctx  = tex.getContext() as CanvasRenderingContext2D;

    ctx.fillStyle = '#cac67e';
    ctx.fillRect(0, 0, SIZE, SIZE);

    for (let i = 0; i < 3000; i++) {
      const x = Math.random() * SIZE;
      const y = Math.random() * SIZE;
      const v = 192 + Math.floor(Math.random() * 18);
      ctx.fillStyle = `rgba(${v},${Math.floor(v * 0.96)},${Math.floor(v * 0.62)},0.25)`;
      ctx.fillRect(Math.floor(x), Math.floor(y), 1, 1);
    }

    const r = HALF - 6;
    const diamond = (cx: number, cy: number) => {
      ctx.beginPath();
      ctx.moveTo(cx,     cy - r);
      ctx.lineTo(cx + r, cy    );
      ctx.lineTo(cx,     cy + r);
      ctx.lineTo(cx - r, cy    );
      ctx.closePath();
    };
    ctx.strokeStyle = '#a8a462';
    ctx.lineWidth   = 1.2;
    diamond(HALF, HALF); ctx.stroke();
    diamond(0,    0   ); ctx.stroke();
    diamond(SIZE, 0   ); ctx.stroke();
    diamond(0,    SIZE); ctx.stroke();
    diamond(SIZE, SIZE); ctx.stroke();

    const innerR = 14;
    const dot = (cx: number, cy: number) => {
      ctx.beginPath();
      ctx.moveTo(cx,          cy - innerR);
      ctx.lineTo(cx + innerR, cy         );
      ctx.lineTo(cx,          cy + innerR);
      ctx.lineTo(cx - innerR, cy         );
      ctx.closePath();
      ctx.stroke();
    };
    ctx.strokeStyle = '#b0ac6a';
    ctx.lineWidth   = 0.8;
    dot(HALF, HALF);
    dot(HALF, 0   ); dot(HALF, SIZE);
    dot(0,    HALF); dot(SIZE, HALF);

    tex.update();
    tex.wrapU  = Texture.WRAP_ADDRESSMODE;
    tex.wrapV  = Texture.WRAP_ADDRESSMODE;
    tex.uScale = uScale;
    tex.vScale = vScale;
    return tex;
  }

  private buildCeilingTileTexture(scene: Scene): { diffuse: DynamicTexture; bump: DynamicTexture } {
    const SIZE   = 256;
    const GROOVE = 5;

    const diffuse = new DynamicTexture(`${this.id}_ceil_diff`, { width: SIZE, height: SIZE }, scene, true);
    const dCtx    = diffuse.getContext() as CanvasRenderingContext2D;
    dCtx.fillStyle = '#e2deb0';
    dCtx.fillRect(0, 0, SIZE, SIZE);
    for (let i = 0; i < 4000; i++) {
      const x = Math.random() * SIZE;
      const y = Math.random() * SIZE;
      const v = 200 + Math.floor(Math.random() * 18);
      dCtx.fillStyle = `rgb(${Math.floor(v * 0.98)},${Math.floor(v * 0.96)},${Math.floor(v * 0.68)})`;
      dCtx.fillRect(Math.floor(x), Math.floor(y), 2, 2);
    }
    dCtx.fillStyle = '#beba88';
    dCtx.fillRect(0,             0,             GROOVE, SIZE);
    dCtx.fillRect(SIZE - GROOVE, 0,             GROOVE, SIZE);
    dCtx.fillRect(0,             0,             SIZE,   GROOVE);
    dCtx.fillRect(0,             SIZE - GROOVE, SIZE,   GROOVE);
    diffuse.update();
    diffuse.wrapU = Texture.WRAP_ADDRESSMODE;
    diffuse.wrapV = Texture.WRAP_ADDRESSMODE;

    const bump = new DynamicTexture(`${this.id}_ceil_bump`, { width: SIZE, height: SIZE }, scene, true);
    const bCtx = bump.getContext() as CanvasRenderingContext2D;
    bCtx.fillStyle = 'rgb(128,128,255)';
    bCtx.fillRect(0, 0, SIZE, SIZE);
    const G = GROOVE + 6;
    for (const e of [
      { gx0:0,      gy0:0, gx1:G,    gy1:0,    rx:0,      ry:0,      rw:G,    rh:SIZE, from:'rgb(172,128,210)', to:'rgb(128,128,255)' },
      { gx0:SIZE-G, gy0:0, gx1:SIZE, gy1:0,    rx:SIZE-G, ry:0,      rw:G,    rh:SIZE, from:'rgb(128,128,255)', to:'rgb(84,128,210)'  },
      { gx0:0,      gy0:0, gx1:0,    gy1:G,    rx:0,      ry:0,      rw:SIZE, rh:G,    from:'rgb(128,172,210)', to:'rgb(128,128,255)' },
      { gx0:0, gy0:SIZE-G, gx1:0,    gy1:SIZE, rx:0,      ry:SIZE-G, rw:SIZE, rh:G,    from:'rgb(128,128,255)', to:'rgb(128,84,210)'  },
    ]) {
      const g = bCtx.createLinearGradient(e.gx0, e.gy0, e.gx1, e.gy1);
      g.addColorStop(0, e.from);
      g.addColorStop(1, e.to);
      bCtx.fillStyle = g;
      bCtx.fillRect(e.rx, e.ry, e.rw, e.rh);
    }
    bump.update();
    bump.wrapU = Texture.WRAP_ADDRESSMODE;
    bump.wrapV = Texture.WRAP_ADDRESSMODE;

    return { diffuse, bump };
  }

  private buildCarpetTexture(scene: Scene): DynamicTexture {
    const SIZE = 512;
    const TILE = 32;
    const tex  = new DynamicTexture(`${this.id}_carpet`, { width: SIZE, height: SIZE }, scene, true);
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
    // uScale/vScale werden in buildGeometry gesetzt
    return tex;
  }

  private buildCeilingLamps(scene: Scene): void {
    const { W, D, H } = this;
    const LAMP_W = 0.8, LAMP_D = 0.8, LAMP_T = 0.04;

    const lampMat = new StandardMaterial(`${this.id}_mat_lamp`, scene);
    lampMat.emissiveColor   = new Color3(0.95, 0.92, 0.62);
    lampMat.disableLighting = true;

    const rimMat = this.mat(scene, "lamp_rim", new Color3(0.18, 0.17, 0.14));
    rimMat.maxSimultaneousLights = 5;

    // Raster: eine Leuchte pro 3×3m-Sektion, mittig (nur visuelle Panels, kein PointLight)
    for (let ix = 0; ix < W / 3; ix++) {
      for (let iz = 0; iz < D / 3; iz++) {
        const px = -W / 2 + 1.5 + ix * 3;
        const pz = -D / 2 + 1.5 + iz * 3;
        const idx = ix * (D / 3) + iz;

        const panel = MeshBuilder.CreateBox(`${this.id}_lamp_panel_${idx}`,
          { width: LAMP_W, height: LAMP_T, depth: LAMP_D }, scene);
        panel.position = new Vector3(px, H - LAMP_T / 2, pz);
        panel.material = lampMat;
        this.prop(panel);

        const rimT = 0.025, rimH = 0.05;
        for (const r of [
          { s: "N", p: new Vector3(px, H - rimH / 2, pz - LAMP_D / 2 - rimT / 2), w: LAMP_W + rimT * 2, d: rimT },
          { s: "S", p: new Vector3(px, H - rimH / 2, pz + LAMP_D / 2 + rimT / 2), w: LAMP_W + rimT * 2, d: rimT },
          { s: "E", p: new Vector3(px + LAMP_W / 2 + rimT / 2, H - rimH / 2, pz), w: rimT, d: LAMP_D },
          { s: "W", p: new Vector3(px - LAMP_W / 2 - rimT / 2, H - rimH / 2, pz), w: rimT, d: LAMP_D },
        ]) {
          const rim = MeshBuilder.CreateBox(`${this.id}_lamp_rim_${idx}_${r.s}`,
            { width: r.w, height: rimH, depth: r.d }, scene);
          rim.position = r.p;
          rim.material = rimMat;
          this.prop(rim);
        }
      }
    }
  }

  private buildRoomLighting(scene: Scene): void {
    const { W, D, H } = this;
    // 4 PointLights an den Quadrantenzentren — sorgen für Varianz unabhängig von Lampenzahl
    // Range skaliert mit dem Raum damit auch bei großen Räumen die Wände erreicht werden
    const range = Math.max(W, D) * 0.75;
    const lx = W / 4, lz = D / 4;
    const lightY = H * 0.85;

    for (const [qx, qz, intensity] of [
      [-lx, -lz, 0.45],
      [ lx, -lz, 0.38],
      [-lx,  lz, 0.40],
      [ lx,  lz, 0.43],
    ] as [number, number, number][]) {
      const light = new PointLight(`${this.id}_ql_${qx}_${qz}`,
        new Vector3(qx, lightY, qz), scene);
      light.intensity = intensity;
      light.diffuse   = new Color3(0.96, 0.91, 0.60);
      light.specular  = Color3.Black();
      light.range     = range;
      this.trackLight(light);
    }
  }

  private buildFloorGrimeTexture(scene: Scene): DynamicTexture {
    const SIZE = 512;
    const tex  = new DynamicTexture(`${this.id}_floor_grime`, { width: SIZE, height: SIZE }, scene, false);
    tex.hasAlpha = true;
    const ctx  = tex.getContext() as CanvasRenderingContext2D;
    ctx.clearRect(0, 0, SIZE, SIZE);

    for (let i = 0; i < 7; i++) {
      const cx = Math.random() * SIZE, cy = Math.random() * SIZE;
      const r  = SIZE * (0.38 + Math.random() * 0.30);
      const a  = 0.03 + Math.random() * 0.05;
      const rgb = Math.random() < 0.75 ? '22,18,6' : '200,192,130';
      const g  = ctx.createRadialGradient(cx, cy, 0, cx, cy, r);
      g.addColorStop(0, `rgba(${rgb},${a})`);
      g.addColorStop(1, `rgba(${rgb},0)`);
      ctx.fillStyle = g;
      ctx.beginPath(); ctx.arc(cx, cy, r, 0, Math.PI * 2); ctx.fill();
    }

    const stainPos: Array<{ x: number; y: number }> = [];
    const MIN_DIST = SIZE * 0.30;
    for (let i = 0; i < 3; i++) {
      let cx = 0, cy = 0, tries = 0;
      do {
        cx = SIZE * Math.random();
        cy = SIZE * Math.random();
        tries++;
      } while (tries < 50 && stainPos.some(p => Math.hypot(p.x - cx, p.y - cy) < MIN_DIST));
      stainPos.push({ x: cx, y: cy });

      const r    = SIZE * (0.28 + Math.random() * 0.32);
      const a    = 0.08 + Math.random() * 0.08;
      const nPts = 7 + Math.floor(Math.random() * 4);
      const pts  = Array.from({ length: nPts }, (_, k) => {
        const theta = (k / nPts) * Math.PI * 2 + (Math.random() - 0.5) * (Math.PI / nPts) * 1.5;
        const rad   = r * (0.55 + Math.random() * 0.45);
        return { x: cx + Math.cos(theta) * rad, y: cy + Math.sin(theta) * rad };
      });
      ctx.beginPath();
      ctx.moveTo((pts[nPts - 1].x + pts[0].x) / 2, (pts[nPts - 1].y + pts[0].y) / 2);
      for (let k = 0; k < nPts; k++) {
        const cur = pts[k], next = pts[(k + 1) % nPts];
        ctx.quadraticCurveTo(cur.x, cur.y, (cur.x + next.x) / 2, (cur.y + next.y) / 2);
      }
      ctx.closePath();
      const g = ctx.createRadialGradient(cx, cy, 0, cx, cy, r);
      g.addColorStop(0, `rgba(12,10,3,${a})`);
      g.addColorStop(1, `rgba(12,10,3,0)`);
      ctx.fillStyle = g;
      ctx.fill();
    }

    tex.update();
    tex.wrapU = Texture.WRAP_ADDRESSMODE;
    tex.wrapV = Texture.WRAP_ADDRESSMODE;
    tex.uScale = 1;
    tex.vScale = 1;
    return tex;
  }

  private buildFloorGrime(scene: Scene): void {
    const { W, D } = this;
    const mat = new StandardMaterial(`${this.id}_mat_floor_grime`, scene);
    mat.diffuseTexture = this.buildFloorGrimeTexture(scene);
    mat.useAlphaFromDiffuseTexture = true;
    mat.specularColor = Color3.Black();
    mat.maxSimultaneousLights = 5;
    const mesh = MeshBuilder.CreateBox(`${this.id}_floor_grime`,
      { width: W, height: 0.001, depth: D }, scene);
    mesh.position.y = 0.006;
    mesh.material   = mat;
    this.prop(mesh);
  }

  private buildBaseboards(scene: Scene, mat: StandardMaterial): void {
    const { W, D, doorX } = this;
    const BS_H   = 0.10;
    const BS_D   = 0.04;
    const leftW  = doorX + W / 2 - DOOR_W / 2;
    const rightW = W / 2 - doorX - DOOR_W / 2;

    for (const b of [
      { s: "S",  pos: new Vector3(0,                    BS_H / 2,  D / 2 - BS_D / 2), w: W,      d: BS_D },
      { s: "E",  pos: new Vector3( W / 2 - BS_D / 2,   BS_H / 2,  0),                 w: BS_D,   d: D    },
      { s: "W",  pos: new Vector3(-W / 2 + BS_D / 2,   BS_H / 2,  0),                 w: BS_D,   d: D    },
      { s: "NL", pos: new Vector3(-W / 2 + leftW / 2,  BS_H / 2, -D / 2 + BS_D / 2), w: leftW,  d: BS_D },
      { s: "NR", pos: new Vector3( W / 2 - rightW / 2, BS_H / 2, -D / 2 + BS_D / 2), w: rightW, d: BS_D },
    ] as Array<{ s: string; pos: Vector3; w: number; d: number }>) {
      const mesh = MeshBuilder.CreateBox(`${this.id}_baseboard_${b.s}`,
        { width: b.w, height: BS_H, depth: b.d }, scene);
      mesh.position = b.pos;
      mesh.material = mat;
      this.prop(mesh);
    }
  }

  private buildCornice(scene: Scene, mat: StandardMaterial): void {
    const { W, D, H } = this;
    const CH = 0.04, CD = 0.04;
    const cy = H - CH / 2;

    for (const b of [
      { s: 'S', pos: new Vector3(0,               cy,  D / 2 - CD / 2), w: W,  d: CD },
      { s: 'E', pos: new Vector3( W / 2 - CD / 2, cy,  0),              w: CD, d: D  },
      { s: 'W', pos: new Vector3(-W / 2 + CD / 2, cy,  0),              w: CD, d: D  },
      { s: 'N', pos: new Vector3(0,               cy, -D / 2 + CD / 2), w: W,  d: CD },
    ] as Array<{ s: string; pos: Vector3; w: number; d: number }>) {
      const mesh = MeshBuilder.CreateBox(`${this.id}_cornice_${b.s}`,
        { width: b.w, height: CH, depth: b.d }, scene);
      mesh.position = b.pos;
      mesh.material = mat;
      this.prop(mesh);
    }
  }

  private buildDoor(scene: Scene, wallZ: number): void {
    const THICK  = 0.04;
    const frameT = 0.05;
    const dx     = this.doorX;
    const panelW = DOOR_W - 2 * frameT;   // bündig zwischen den Zargen-Innenflächen
    const panelH = DOOR_H - frameT;       // bündig zwischen Boden und Sturz-Unterkante

    // Hinge-Pivot exakt an der Innenkante der linken Zarge
    const hinge = new TransformNode(`${this.id}_door_hinge`, scene);
    hinge.position = new Vector3(dx - DOOR_W / 2 + frameT, 0, wallZ);
    this.trackNode(hinge);

    const panelMat = this.mat(scene, 'door_panel', new Color3(0.50, 0.50, 0.50));
    const panel = MeshBuilder.CreateBox(`${this.id}_door_panel`,
      { width: panelW, height: panelH, depth: THICK }, scene);
    panel.parent   = hinge;
    panel.position = new Vector3(panelW / 2, panelH / 2, 0);
    panel.material = panelMat;
    this.track(panel);

    const handleMat = this.mat(scene, 'door_handle', new Color3(0.42, 0.38, 0.24));
    const localHX = panelW - 0.13; // 0.13m vom rechten Rand (relativ zum Hinge)
    const faceZ   = THICK / 2;
    const HY      = 1.05;

    const plate = MeshBuilder.CreateBox(`${this.id}_door_plate`,
      { width: 0.038, height: 0.16, depth: 0.007 }, scene);
    plate.parent   = hinge;
    plate.position = new Vector3(localHX, HY, faceZ + 0.0035);
    plate.material = handleMat;
    this.prop(plate);

    const ARM_D = 0.020, GRIP_W = 0.10, BEND_R = 0.018, TUBE_R = 0.007;
    const HH  = HY + 0.038;
    const bcX = localHX - BEND_R;
    const bcZ = faceZ + 0.007 + ARM_D;
    const path: Vector3[] = [];
    path.push(new Vector3(localHX, HH, faceZ + 0.007));
    path.push(new Vector3(localHX, HH, bcZ));
    for (let i = 1; i <= 10; i++) {
      const a = (i / 10) * (Math.PI / 2);
      path.push(new Vector3(bcX + BEND_R * Math.cos(a), HH, bcZ + BEND_R * Math.sin(a)));
    }
    path.push(new Vector3(bcX - GRIP_W, HH, bcZ + BEND_R));
    const tube = MeshBuilder.CreateTube(`${this.id}_door_handle`,
      { path, radius: TUBE_R, tessellation: 10, cap: 3 }, scene);
    tube.parent   = hinge;
    tube.material = handleMat;
    this.prop(tube);

    // Rückseite: Platte und Klinke gespiegelt (z negiert)
    const plateB = MeshBuilder.CreateBox(`${this.id}_door_plate_b`,
      { width: 0.038, height: 0.16, depth: 0.007 }, scene);
    plateB.parent   = hinge;
    plateB.position = new Vector3(localHX, HY, -(faceZ + 0.0035));
    plateB.material = handleMat;
    this.prop(plateB);

    const pathB = path.map(v => new Vector3(v.x, v.y, -v.z));
    const tubeB = MeshBuilder.CreateTube(`${this.id}_door_handle_b`,
      { path: pathB, radius: TUBE_R, tessellation: 10, cap: 3 }, scene);
    tubeB.parent   = hinge;
    tubeB.material = handleMat;
    this.prop(tubeB);

    // Tür als Interactable registrieren
    let isOpen = false;
    this.interactables.push({
      position: new Vector3(dx, DOOR_H / 2, wallZ + 0.5),
      interactRange: 2.0,
      interact(playerPos) {
        isOpen = !isOpen;
        // Beim Öffnen: Tür schwingt vom Spieler weg
        // rotation.y = -π/2 → Panel in +z (Rauminneres), +π/2 → Panel in -z (Außenseite)
        let target = 0;
        if (isOpen) {
          target = playerPos.z > wallZ ? Math.PI / 2 : -Math.PI / 2;
        }
        Animation.CreateAndStartAnimation(
          'doorSwing', hinge, 'rotation.y',
          60, 20,
          hinge.rotation.y, target,
          Animation.ANIMATIONLOOPMODE_CONSTANT,
        );
      },
    });
  }

  private buildDoorFrame(scene: Scene, wallZ: number, mat: StandardMaterial): void {
    const frameT = 0.05;
    const frameD = T + 0.08;
    const dx     = this.doorX;

    const fL = MeshBuilder.CreateBox(`${this.id}_frame_L`,
      { width: frameT, height: DOOR_H, depth: frameD }, scene);
    fL.position = new Vector3(dx - DOOR_W / 2 + frameT / 2, DOOR_H / 2, wallZ);
    fL.material = mat;
    this.prop(fL);

    const fR = MeshBuilder.CreateBox(`${this.id}_frame_R`,
      { width: frameT, height: DOOR_H, depth: frameD }, scene);
    fR.position = new Vector3(dx + DOOR_W / 2 - frameT / 2, DOOR_H / 2, wallZ);
    fR.material = mat;
    this.prop(fR);

    const fT = MeshBuilder.CreateBox(`${this.id}_frame_T`,
      { width: DOOR_W - frameT * 2, height: frameT, depth: frameD }, scene);
    fT.position = new Vector3(dx, DOOR_H - frameT / 2, wallZ);
    fT.material = mat;
    this.prop(fT);
  }
}
