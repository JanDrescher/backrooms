import { MeshBuilder, StandardMaterial, PointLight, Color3, Vector3, Animation, TransformNode, type Scene } from "@babylonjs/core";
import { RoomBase } from "./RoomBase";
import type { DoorDefinition } from "./IRoom";
import { playDoorSound } from "../audio/DoorSound";

const T      = 0.2;
const DOOR_W = 1.0;
const DOOR_H = 2.0;
const H_MAX  = 3.2;

export type DoorWall = "north" | "south" | "east" | "west";

export class PlaceholderRoom extends RoomBase {
  readonly id: string;
  readonly doors: DoorDefinition[];
  readonly spawnPoint: Vector3;

  private readonly W: number;
  private readonly D: number;
  private readonly H: number;
  private readonly doorWall:     DoorWall;
  private readonly doorOff:      number;   // kanonischer X-Offset des Türzentrums
  private readonly pivotLocalPos: Vector3; // Pivot-Position im Raumraum
  private readonly pivotRotY:    number;   // Pivot-Rotation
  private readonly outwardDir:   Vector3;  // Ausgehende Raumrichtung der Tür-Wand

  constructor(id: string, width = 6, depth = 6, height = 2.8, doorWall: DoorWall = "north") {
    super();
    this.id       = id;
    this.W        = width;
    this.D        = depth;
    this.H        = height;
    this.doorWall = doorWall;

    const wallLen = (doorWall === "north" || doorWall === "south") ? width : depth;
    const segIdx  = Math.floor(Math.random() * (wallLen / 3));
    this.doorOff  = -wallLen / 2 + 1.5 + segIdx * 3;

    switch (doorWall) {
      case "north":
        this.pivotLocalPos = new Vector3(0, 0, -depth / 2 - T);
        this.pivotRotY     = 0;
        this.outwardDir    = new Vector3(0, 0, -1);
        break;
      case "south":
        this.pivotLocalPos = new Vector3(0, 0, depth / 2 + T);
        this.pivotRotY     = Math.PI;
        this.outwardDir    = new Vector3(0, 0, 1);
        break;
      case "east": // visuell rechts = −X-Wand
        this.pivotLocalPos = new Vector3(-width / 2 - T, 0, 0);
        this.pivotRotY     = Math.PI / 2;   // BJS rotY(π/2): canonical-Z → room-X (outward)
        this.outwardDir    = new Vector3(-1, 0, 0);
        break;
      default:    // "west" = visuell links = +X-Wand
        this.pivotLocalPos = new Vector3(width / 2 + T, 0, 0);
        this.pivotRotY     = -Math.PI / 2;  // BJS rotY(-π/2): canonical-Z → room+X (outward)
        this.outwardDir    = new Vector3(1, 0, 0);
        break;
    }

    // Türposition in Raumkoordinaten (Außenfläche der Tür-Wand).
    // BJS rotation.y(a) = RoomBase.rotY(v, -a), daher negatives Vorzeichen.
    const doorRoomPos = this.pivotLocalPos.add(
      RoomBase.rotY(new Vector3(this.doorOff, DOOR_H / 2, 0), -this.pivotRotY),
    );

    const si = Math.floor(Math.random() * (width  / 3));
    const sk = Math.floor(Math.random() * (depth  / 3));
    this.spawnPoint = new Vector3(
      -width / 2 + 1.5 + si * 3,
      0,
      -depth / 2 + 1.5 + sk * 3,
    );

    this.doors = [
      { id: "north", position: doorWall === "north" ? doorRoomPos.clone() : new Vector3(0, DOOR_H / 2, -depth / 2 - T), direction: new Vector3(0, 0, -1) },
      { id: "south", position: doorWall === "south" ? doorRoomPos.clone() : new Vector3(0, DOOR_H / 2,  depth / 2 + T), direction: new Vector3(0, 0,  1) },
      { id: "east",  position: doorWall === "east"  ? doorRoomPos.clone() : new Vector3(-width / 2 - T, DOOR_H / 2, 0), direction: new Vector3(-1, 0, 0) },
      { id: "west",  position: doorWall === "west"  ? doorRoomPos.clone() : new Vector3( width / 2 + T, DOOR_H / 2, 0), direction: new Vector3( 1, 0, 0) },
    ];
  }

  protected async buildGeometry(scene: Scene): Promise<void> {
    const { W, D, H, doorWall, doorOff } = this;

    const wallH   = H_MAX + T;
    const wallLen = (doorWall === "north" || doorWall === "south") ? W : D;
    const leftW   = doorOff + wallLen / 2 - DOOR_W / 2;
    const rightW  = wallLen / 2 - doorOff - DOOR_W / 2;
    const topH    = wallH - DOOR_H;
    const wallCZ  = T / 2; // Wandmitte in kanonischem Z

    // ── Materialien ──────────────────────────────────────────────────────────
    const floorMat     = this.mat(scene, "floor",     Color3.White());
    const ceilMat      = this.mat(scene, "ceil",      Color3.White());
    const frameMat     = this.mat(scene, "frame",     new Color3(0.42, 0.37, 0.16));
    const baseboardMat = this.mat(scene, "baseboard", new Color3(0.71, 0.69, 0.42));
    const corniceMat   = this.mat(scene, "cornice",   new Color3(0.57, 0.56, 0.48));

    // Tür-Wand-Panele (kanonisch Z-Fläche, kein UV-Quirk)
    const wallMatDL = this.mat(scene, "wall_dl", Color3.White());
    const wallMatDR = this.mat(scene, "wall_dr", Color3.White());
    const wallMatDT = this.mat(scene, "wall_dt", Color3.White());
    wallMatDL.diffuseTexture = this.buildWallpaperTexture(scene, "dl", leftW  / RoomBase.TILE_W, wallH / RoomBase.TILE_H);
    wallMatDR.diffuseTexture = this.buildWallpaperTexture(scene, "dr", rightW / RoomBase.TILE_W, wallH / RoomBase.TILE_H);
    wallMatDT.diffuseTexture = this.buildWallpaperTexture(scene, "dt", DOOR_W / RoomBase.TILE_W, topH  / RoomBase.TILE_H);

    // Vollwände: ±Z (Nord/Süd) standard; ±X (Ost/West) mit UV-Quirk
    const wallMatZ = this.mat(scene, "wall_z", Color3.White());
    wallMatZ.diffuseTexture = this.buildWallpaperTexture(scene, "z", W / RoomBase.TILE_W, wallH / RoomBase.TILE_H);
    const wallMatX = this.mat(scene, "wall_x", Color3.White());
    wallMatX.diffuseTexture = this.buildWallpaperTexture(scene, "x", wallH / RoomBase.TILE_H, D / RoomBase.TILE_W);

    // ── Teppich ───────────────────────────────────────────────────────────────
    const carpetTex = this.buildCarpetTexture(scene);
    carpetTex.uScale = (D + 2 * T) / 3;
    carpetTex.vScale = (W + 2 * T) / 3;
    floorMat.diffuseTexture = carpetTex;

    // ── Deckenplatten ─────────────────────────────────────────────────────────
    const { diffuse: ceilDiff, bump: ceilBump } = this.buildCeilingTileTexture(scene);
    ceilDiff.uScale = D; ceilDiff.vScale = W;
    ceilBump.uScale = D; ceilBump.vScale = W;
    ceilMat.diffuseTexture = ceilDiff;
    ceilMat.bumpTexture    = ceilBump;
    ceilMat.bumpTexture.level = 0.35;

    // ── Boden und Decke ───────────────────────────────────────────────────────
    const floor = MeshBuilder.CreateBox(`${this.id}_floor`,
      { width: W + 2 * T, height: T, depth: D + 2 * T }, scene);
    floor.position.y = -T / 2;
    floor.material   = floorMat;
    this.track(floor);

    const ceil = MeshBuilder.CreateBox(`${this.id}_ceil`,
      { width: W, height: T, depth: D }, scene);
    ceil.position.y = H + T / 2;
    ceil.material   = ceilMat;
    this.track(ceil);

    // ── Vollwände (3 von 4, Tür-Wand wird via Pivot aufgebaut) ───────────────
    for (const sw of [
      { name: "N",  skip: doorWall === "north", pos: new Vector3(0,            wallH / 2, -D / 2 - T / 2), w: W, d: T, mat: wallMatZ },
      { name: "S",  skip: doorWall === "south", pos: new Vector3(0,            wallH / 2,  D / 2 + T / 2), w: W, d: T, mat: wallMatZ },
      { name: "CE", skip: doorWall === "west",  pos: new Vector3( W/2 + T/2, wallH / 2, 0),               w: T, d: D, mat: wallMatX },
      { name: "CW", skip: doorWall === "east",  pos: new Vector3(-W/2 - T/2, wallH / 2, 0),               w: T, d: D, mat: wallMatX },
    ] as Array<{ name: string; skip: boolean; pos: Vector3; w: number; d: number; mat: StandardMaterial }>) {
      if (sw.skip) continue;
      const mesh = MeshBuilder.CreateBox(`${this.id}_wall_${sw.name}`,
        { width: sw.w, height: wallH, depth: sw.d }, scene);
      mesh.position = sw.pos;
      mesh.material = sw.mat;
      this.track(mesh);
    }

    // ── Tür-Wand via Pivot ────────────────────────────────────────────────────
    const doorPivot = new TransformNode(`${this.id}_door_pivot`, scene);
    doorPivot.position   = this.pivotLocalPos.clone();
    doorPivot.rotation.y = this.pivotRotY;
    this.trackNode(doorPivot);

    if (leftW > 0) {
      const wL = MeshBuilder.CreateBox(`${this.id}_wall_dL`,
        { width: leftW, height: wallH, depth: T }, scene);
      wL.parent   = doorPivot;
      wL.position = new Vector3(-wallLen / 2 + leftW / 2, wallH / 2, wallCZ);
      wL.material = wallMatDL;
      this.track(wL);
    }
    if (rightW > 0) {
      const wR = MeshBuilder.CreateBox(`${this.id}_wall_dR`,
        { width: rightW, height: wallH, depth: T }, scene);
      wR.parent   = doorPivot;
      wR.position = new Vector3(wallLen / 2 - rightW / 2, wallH / 2, wallCZ);
      wR.material = wallMatDR;
      this.track(wR);
    }
    const wT = MeshBuilder.CreateBox(`${this.id}_wall_dT`,
      { width: DOOR_W, height: topH, depth: T }, scene);
    wT.parent   = doorPivot;
    wT.position = new Vector3(doorOff, DOOR_H + topH / 2, wallCZ);
    wT.material = wallMatDT;
    this.track(wT);

    this.buildDoorFrame(scene, doorPivot, wallCZ, frameMat);
    this.buildDoor(scene, doorPivot, wallCZ);
    this.buildBaseboards(scene, doorPivot, wallLen, leftW, rightW, baseboardMat);
    this.buildCornice(scene, corniceMat);
    this.buildFloorGrime(scene, W, D);
    this.buildCeilingLamps(scene);
    this.buildRoomLighting(scene);
    this.buildDividers(scene);
  }

  private buildDoorFrame(scene: Scene, doorPivot: TransformNode, wallCZ: number, mat: StandardMaterial): void {
    const frameT = 0.05;
    const frameD = T + 0.08;
    const doff   = this.doorOff;

    for (const [sfx, bx] of [
      ["L", doff - DOOR_W / 2 + frameT / 2],
      ["R", doff + DOOR_W / 2 - frameT / 2],
    ] as [string, number][]) {
      const f = MeshBuilder.CreateBox(`${this.id}_frame_${sfx}`,
        { width: frameT, height: DOOR_H, depth: frameD }, scene);
      f.parent   = doorPivot;
      f.position = new Vector3(bx, DOOR_H / 2, wallCZ);
      f.material = mat;
      this.prop(f);
    }
    const fT = MeshBuilder.CreateBox(`${this.id}_frame_T`,
      { width: DOOR_W - frameT * 2, height: frameT, depth: frameD }, scene);
    fT.parent   = doorPivot;
    fT.position = new Vector3(doff, DOOR_H - frameT / 2, wallCZ);
    fT.material = mat;
    this.prop(fT);
  }

  private buildDoor(scene: Scene, doorPivot: TransformNode, wallCZ: number): void {
    const THICK  = 0.04;
    const frameT = 0.05;
    const doff   = this.doorOff;
    const panelW = DOOR_W - 2 * frameT;
    const panelH = DOOR_H - frameT;

    const hinge = new TransformNode(`${this.id}_door_hinge`, scene);
    hinge.parent   = doorPivot;
    hinge.position = new Vector3(doff - DOOR_W / 2 + frameT, 0, wallCZ);
    this.trackNode(hinge);

    const panelMat = this.mat(scene, "door_panel", new Color3(0.50, 0.50, 0.50));
    const panel = MeshBuilder.CreateBox(`${this.id}_door_panel`,
      { width: panelW, height: panelH, depth: THICK }, scene);
    panel.parent   = hinge;
    panel.position = new Vector3(panelW / 2, panelH / 2, 0);
    panel.material = panelMat;
    this.track(panel);

    const handleMat = this.mat(scene, "door_handle", new Color3(0.42, 0.38, 0.24));
    const localHX = panelW - 0.13;
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

    // Interactable: kanonisch (doff, DOOR_H/2, -0.5) = Außenseite (Korridor)
    const interactRoomLocal = this.pivotLocalPos.add(
      RoomBase.rotY(new Vector3(doff, DOOR_H / 2, -0.5), -this.pivotRotY),
    );

    let isOpen = false;
    const interactable = {
      position: interactRoomLocal,
      interactRange: 2.0,
      interact: (playerPos: Vector3) => {
        playDoorSound(interactable.position.x, interactable.position.y, interactable.position.z);
        isOpen = !isOpen;
        let target = 0;
        if (isOpen) {
          const worldPivotX = this.worldOffset.x + this.pivotLocalPos.x;
          const worldPivotZ = this.worldOffset.z + this.pivotLocalPos.z;
          const diff = new Vector3(playerPos.x - worldPivotX, 0, playerPos.z - worldPivotZ);
          // dot > 0: Spieler außen → Tür in Raum schwingen (BJS -π/2 = kanonisch +Z = inward)
          target = Vector3.Dot(diff, this.outwardDir) > 0 ? -Math.PI / 2 : Math.PI / 2;
        }
        Animation.CreateAndStartAnimation(
          "doorSwing", hinge, "rotation.y",
          60, 30,
          hinge.rotation.y, target,
          Animation.ANIMATIONLOOPMODE_CONSTANT,
        );
      },
    };
    this.interactables.push(interactable);
  }

  private buildBaseboards(
    scene:     Scene,
    doorPivot: TransformNode,
    wallLen:   number,
    leftW:     number,
    rightW:    number,
    mat:       StandardMaterial,
  ): void {
    const { W, D, doorWall } = this;
    const BS_H     = 0.10;
    const BS_D     = 0.04;
    const bsInnerZ = T + BS_D / 2; // Innenfläche der Wand + Hälfte der Leistentiefe

    // Vollwand-Leisten (3 Wände)
    for (const b of [
      { s: "N",  skip: doorWall === "north", pos: new Vector3(0,              BS_H/2, -D/2 + BS_D/2), w: W,    d: BS_D },
      { s: "S",  skip: doorWall === "south", pos: new Vector3(0,              BS_H/2,  D/2 - BS_D/2), w: W,    d: BS_D },
      { s: "CE", skip: doorWall === "west",  pos: new Vector3( W/2 - BS_D/2, BS_H/2, 0),              w: BS_D, d: D    },
      { s: "CW", skip: doorWall === "east",  pos: new Vector3(-W/2 + BS_D/2, BS_H/2, 0),              w: BS_D, d: D    },
    ] as Array<{ s: string; skip: boolean; pos: Vector3; w: number; d: number }>) {
      if (b.skip) continue;
      const mesh = MeshBuilder.CreateBox(`${this.id}_baseboard_${b.s}`,
        { width: b.w, height: BS_H, depth: b.d }, scene);
      mesh.position = b.pos;
      mesh.material = mat;
      this.prop(mesh);
    }

    // Tür-Wand-Leisten L und R (Kinder von doorPivot, kanonischer Raum)
    if (leftW > 0) {
      const bL = MeshBuilder.CreateBox(`${this.id}_baseboard_DL`,
        { width: leftW, height: BS_H, depth: BS_D }, scene);
      bL.parent   = doorPivot;
      bL.position = new Vector3(-wallLen / 2 + leftW / 2, BS_H / 2, bsInnerZ);
      bL.material = mat;
      this.prop(bL);
    }
    if (rightW > 0) {
      const bR = MeshBuilder.CreateBox(`${this.id}_baseboard_DR`,
        { width: rightW, height: BS_H, depth: BS_D }, scene);
      bR.parent   = doorPivot;
      bR.position = new Vector3(wallLen / 2 - rightW / 2, BS_H / 2, bsInnerZ);
      bR.material = mat;
      this.prop(bR);
    }
  }

  private buildCornice(scene: Scene, mat: StandardMaterial): void {
    const { W, D, H } = this;
    const CH = 0.04, CD = 0.04;
    const cy = H - CH / 2;

    for (const c of [
      { s: "N",  pos: new Vector3(0,              cy, -D/2 + CD/2), w: W,  d: CD },
      { s: "S",  pos: new Vector3(0,              cy,  D/2 - CD/2), w: W,  d: CD },
      { s: "CE", pos: new Vector3( W/2 - CD/2, cy, 0),              w: CD, d: D  },
      { s: "CW", pos: new Vector3(-W/2 + CD/2, cy, 0),              w: CD, d: D  },
    ] as Array<{ s: string; pos: Vector3; w: number; d: number }>) {
      const mesh = MeshBuilder.CreateBox(`${this.id}_cornice_${c.s}`,
        { width: c.w, height: CH, depth: c.d }, scene);
      mesh.position = c.pos;
      mesh.material = mat;
      this.prop(mesh);
    }
  }

  private buildDividers(scene: Scene): void {
    const { W, D, H } = this;
    if (W <= 6 && D <= 6) return;

    const COL_S = 0.30;
    const H_DIV = H * 0.65;
    const T_DIV = 0.15;
    const sectX = W / 3;
    const sectZ = D / 3;
    const BS_H = 0.10, BS_D = 0.04;

    const colMat = this.mat(scene, "div_col",      new Color3(0.71, 0.69, 0.42));
    const bsMat  = this.mat(scene, "div_baseboard", new Color3(0.71, 0.69, 0.42));
    const cnMat  = this.mat(scene, "div_cornice",   new Color3(0.57, 0.56, 0.48));

    const matNS = this.mat(scene, "div_ns", Color3.White());
    matNS.diffuseTexture = this.buildWallpaperTexture(scene, "div_ns",
      H_DIV / RoomBase.TILE_H, 3 / RoomBase.TILE_W);
    const matEW = this.mat(scene, "div_ew", Color3.White());
    matEW.diffuseTexture = this.buildWallpaperTexture(scene, "div_ew",
      3 / RoomBase.TILE_W, H_DIV / RoomBase.TILE_H);

    for (const m of [colMat, bsMat, cnMat, matNS, matEW])
      m.maxSimultaneousLights = 6;

    for (let ix = 1; ix < sectX; ix++) {
      for (let iz = 1; iz < sectZ; iz++) {
        const colX = -W / 2 + ix * 3;
        const colZ = -D / 2 + iz * 3;

        const col = MeshBuilder.CreateBox(`${this.id}_col_${ix}_${iz}`,
          { width: COL_S, height: H, depth: COL_S }, scene);
        col.position = new Vector3(colX, H / 2, colZ);
        col.material = colMat;
        this.track(col);

        for (const b of [
          { s: "bN", p: new Vector3(colX, BS_H/2, colZ-COL_S/2-BS_D/2), w: COL_S+2*BS_D, h: BS_H, d: BS_D },
          { s: "bS", p: new Vector3(colX, BS_H/2, colZ+COL_S/2+BS_D/2), w: COL_S+2*BS_D, h: BS_H, d: BS_D },
          { s: "bW", p: new Vector3(colX-COL_S/2-BS_D/2, BS_H/2, colZ), w: BS_D, h: BS_H, d: COL_S },
          { s: "bE", p: new Vector3(colX+COL_S/2+BS_D/2, BS_H/2, colZ), w: BS_D, h: BS_H, d: COL_S },
        ]) {
          const m = MeshBuilder.CreateBox(`${this.id}_col_${b.s}_${ix}_${iz}`,
            { width: b.w, height: b.h, depth: b.d }, scene);
          m.position = b.p; m.material = bsMat; this.prop(m);
        }

        const cY = H - 0.02;
        for (const c of [
          { s: "cN", p: new Vector3(colX, cY, colZ-COL_S/2-0.02), w: COL_S+0.08, h: 0.04, d: 0.04 },
          { s: "cS", p: new Vector3(colX, cY, colZ+COL_S/2+0.02), w: COL_S+0.08, h: 0.04, d: 0.04 },
          { s: "cW", p: new Vector3(colX-COL_S/2-0.02, cY, colZ), w: 0.04, h: 0.04, d: COL_S },
          { s: "cE", p: new Vector3(colX+COL_S/2+0.02, cY, colZ), w: 0.04, h: 0.04, d: COL_S },
        ]) {
          const m = MeshBuilder.CreateBox(`${this.id}_col_${c.s}_${ix}_${iz}`,
            { width: c.w, height: c.h, depth: c.d }, scene);
          m.position = c.p; m.material = cnMat; this.prop(m);
        }

        if (Math.random() > 0.6) continue;
        const distN = colZ + D / 2;
        const distS = D / 2 - colZ;
        const distW = colX + W / 2;
        const distE = W / 2 - colX;
        const minDist = Math.min(distN, distS, distW, distE);
        if (minDist > 3.5) continue;

        const cands: Array<"N" | "S" | "W" | "E"> = [];
        if (distN <= minDist + 0.01) cands.push("N");
        if (distS <= minDist + 0.01) cands.push("S");
        if (distW <= minDist + 0.01) cands.push("W");
        if (distE <= minDist + 0.01) cands.push("E");
        const dir = cands[Math.floor(Math.random() * cands.length)];

        if (dir === "N" || dir === "S") {
          const toWall  = dir === "N" ? distN : distS;
          const stubLen = toWall - COL_S / 2;
          const signZ   = dir === "N" ? -1 : 1;
          const stubCZ  = colZ + signZ * (COL_S / 2 + stubLen / 2);
          const stub = MeshBuilder.CreateBox(`${this.id}_stub_${ix}_${iz}`,
            { width: T_DIV, height: H_DIV, depth: stubLen }, scene);
          stub.position = new Vector3(colX, H_DIV / 2, stubCZ);
          stub.material = matNS;
          this.track(stub);
          for (const [sx, ss] of [[-1, "W"], [1, "E"]] as [number, string][]) {
            const bm = MeshBuilder.CreateBox(`${this.id}_stub_bs_${ix}_${iz}_${ss}`,
              { width: BS_D, height: BS_H, depth: stubLen }, scene);
            bm.position = new Vector3(colX + sx * (T_DIV / 2 + BS_D / 2), BS_H / 2, stubCZ);
            bm.material = bsMat; this.prop(bm);
          }
        } else {
          const toWall  = dir === "W" ? distW : distE;
          const stubLen = toWall - COL_S / 2;
          const signX   = dir === "W" ? -1 : 1;
          const stubCX  = colX + signX * (COL_S / 2 + stubLen / 2);
          const stub = MeshBuilder.CreateBox(`${this.id}_stub_${ix}_${iz}`,
            { width: stubLen, height: H_DIV, depth: T_DIV }, scene);
          stub.position = new Vector3(stubCX, H_DIV / 2, colZ);
          stub.material = matEW;
          this.track(stub);
          for (const [sz, ss] of [[-1, "N"], [1, "S"]] as [number, string][]) {
            const bm = MeshBuilder.CreateBox(`${this.id}_stub_bs_${ix}_${iz}_${ss}`,
              { width: stubLen, height: BS_H, depth: BS_D }, scene);
            bm.position = new Vector3(stubCX, BS_H / 2, colZ + sz * (T_DIV / 2 + BS_D / 2));
            bm.material = bsMat; this.prop(bm);
          }
        }
      }
    }
  }

  private buildCeilingLamps(scene: Scene): void {
    const { W, D, H } = this;
    const LAMP_W = 0.8, LAMP_D = 0.8, LAMP_T = 0.04;
    this.humLocalPos = new Vector3(-W / 2 + 1.5, H - LAMP_T / 2, -D / 2 + 1.5);

    const lampMat = new StandardMaterial(`${this.id}_mat_lamp`, scene);
    lampMat.emissiveColor   = new Color3(0.95, 0.92, 0.62);
    lampMat.disableLighting = true;

    const rimMat = this.mat(scene, "lamp_rim", new Color3(0.18, 0.17, 0.14));
    rimMat.maxSimultaneousLights = 6;

    const hasFlicker  = Math.random() < 0.20;
    const flickerIx   = Math.floor(Math.random() * (W / 3));
    const flickerIz   = Math.floor(Math.random() * (D / 3));

    for (let ix = 0; ix < W / 3; ix++) {
      for (let iz = 0; iz < D / 3; iz++) {
        const px  = -W / 2 + 1.5 + ix * 3;
        const pz  = -D / 2 + 1.5 + iz * 3;
        const idx = ix * (D / 3) + iz;
        const isFlicker = hasFlicker && ix === flickerIx && iz === flickerIz;

        let mat = lampMat;
        if (isFlicker) {
          mat = new StandardMaterial(`${this.id}_mat_flicker`, scene);
          mat.emissiveColor   = new Color3(0.95, 0.92, 0.62);
          mat.disableLighting = true;
        }

        const panel = MeshBuilder.CreateBox(`${this.id}_lamp_panel_${idx}`,
          { width: LAMP_W, height: LAMP_T, depth: LAMP_D }, scene);
        panel.position = new Vector3(px, H - LAMP_T / 2, pz);
        panel.material = mat;
        this.prop(panel);

        if (isFlicker) {
          this.flickerLampMesh = panel;
          this.flickerLocalPos = new Vector3(px, H - LAMP_T / 2, pz);
        }

        const rimT = 0.025, rimH = 0.05;
        for (const r of [
          { s: "N", p: new Vector3(px,             H - rimH/2, pz - LAMP_D/2 - rimT/2), w: LAMP_W + rimT*2, d: rimT   },
          { s: "S", p: new Vector3(px,             H - rimH/2, pz + LAMP_D/2 + rimT/2), w: LAMP_W + rimT*2, d: rimT   },
          { s: "E", p: new Vector3(px + LAMP_W/2 + rimT/2, H - rimH/2, pz),             w: rimT,            d: LAMP_D },
          { s: "W", p: new Vector3(px - LAMP_W/2 - rimT/2, H - rimH/2, pz),             w: rimT,            d: LAMP_D },
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
}
