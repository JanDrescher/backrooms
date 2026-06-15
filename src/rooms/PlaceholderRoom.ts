import { MeshBuilder, StandardMaterial, PointLight, Color3, Vector3, Animation, TransformNode, type Scene } from "@babylonjs/core";
import { RoomBase } from "./RoomBase";
import type { DoorDefinition } from "./IRoom";

// Unveränderliche Konstruktionsmaße
const T      = 0.2;  // Wandstärke
const DOOR_W = 1.0;  // Türbreite
const DOOR_H = 2.0;  // Türhöhe
const H_MAX  = 3.2;  // Maximale Raumhöhe — Wände immer auf dieser Höhe, verhindert Lücken zu anschließenden Räumen


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
      // Außenfläche der Nordwand (z = -D/2 - T) als Verbindungspunkt
      { id: "north", position: new Vector3(this.doorX, DOOR_H / 2, -this.D / 2 - T), direction: new Vector3(0, 0, -1) },
      { id: "south", position: new Vector3(0, DOOR_H / 2,  this.D / 2), direction: new Vector3(0, 0,  1) },
      { id: "east",  position: new Vector3( this.W / 2, DOOR_H / 2, 0), direction: new Vector3( 1, 0, 0) },
      { id: "west",  position: new Vector3(-this.W / 2, DOOR_H / 2, 0), direction: new Vector3(-1, 0, 0) },
    ];
  }

  protected async buildGeometry(scene: Scene): Promise<void> {
    const { W, D, H, doorX } = this;

    // Abgeleitete Maße
    const wallH  = H_MAX + T; // Wände immer auf Maximalhöhe, Decke (Rahmenbauweise) auf variablem H
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
    wallMatNL.diffuseTexture   = this.buildWallpaperTexture(scene, "nl",    leftW  / RoomBase.TILE_W, wallH / RoomBase.TILE_H);
    wallMatNR.diffuseTexture   = this.buildWallpaperTexture(scene, "nr",    rightW / RoomBase.TILE_W, wallH / RoomBase.TILE_H);
    wallMatS.diffuseTexture    = this.buildWallpaperTexture(scene, "s",     W      / RoomBase.TILE_W, wallH / RoomBase.TILE_H);
    wallMatEW.diffuseTexture   = this.buildWallpaperTexture(scene, "ew",    wallH  / RoomBase.TILE_H, D     / RoomBase.TILE_W);
    wallMatNTop.diffuseTexture = this.buildWallpaperTexture(scene, "n_top", DOOR_W / RoomBase.TILE_W, topH  / RoomBase.TILE_H);

    // Teppich — skaliert auf die gesamte Bodenplatte (W+2T × D+2T), kein Offset nötig
    const carpetTex = this.buildCarpetTexture(scene);
    carpetTex.uScale = (D + 2 * T) / 3;  // U→Z (Tiefe), wie bei der Decke
    carpetTex.vScale = (W + 2 * T) / 3;  // V→X (Breite)
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

    // Boden — bis zur Wandaußenkante, überbrückt die Verbindungslücke
    const floor = MeshBuilder.CreateBox(`${this.id}_floor`,
      { width: W + 2 * T, height: T, depth: D + 2 * T }, scene);
    floor.position.y = -T / 2;
    floor.material   = floorMat;
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
    this.buildFloorGrime(scene, W, D);
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
      H_DIV / RoomBase.TILE_H, 3 / RoomBase.TILE_W);

    // Stubs E/W: ±Z-Flächen sichtbar → kein Quirk
    const matEW = this.mat(scene, "div_ew", Color3.White());
    matEW.diffuseTexture = this.buildWallpaperTexture(scene, "div_ew",
      3 / RoomBase.TILE_W, H_DIV / RoomBase.TILE_H);

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
      interact: (playerPos: Vector3) => {
        isOpen = !isOpen;
        let target = 0;
        if (isOpen) {
          // Vergleich in Weltkoordinaten — wallZ ist lokal, worldOffset.z kompensiert
          const worldWallZ = wallZ + this.worldOffset.z;
          target = playerPos.z > worldWallZ ? Math.PI / 2 : -Math.PI / 2;
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
