import { MeshBuilder, StandardMaterial, PointLight, Color3, Vector3, type Scene } from "@babylonjs/core";
import { RoomBase } from "./RoomBase";
import type { DoorDefinition } from "./IRoom";

const T = 0.2; // Wandstärke

export class CorridorRoom extends RoomBase {
  readonly id: string;
  readonly doors: DoorDefinition[];
  readonly spawnPoint: Vector3;
  readonly halfW: number;
  readonly halfD: number;

  private readonly W = 3;
  private readonly D: number;
  private readonly H: number;
  private readonly branchSide: "east" | "west" | "both" | null;
  private readonly branchSegE: number;  // segment-Index für Ostabzweig (E-Wand, +X)
  private readonly branchSegW: number;  // segment-Index für Westabzweig (W-Wand, −X)
  private _closeNorth = false;
  private _closeSouth = false;

  constructor(id: string, opts: {
    D?: number; H?: number;
    branchSide?: "east" | "west" | "both" | null;
    branchSeg?: number;       // einheitlich für beide Seiten (für Kreuzungen)
    branchSegEast?: number;
    branchSegWest?: number;
  } = {}) {
    super();
    this.id = id;

    const depths  = [9, 12, 15] as const;
    this.D = opts.D ?? depths[Math.floor(Math.random() * depths.length)];
    this.H = opts.H ?? 2.8;
    this.halfW = this.W / 2 + T;  // Seitenwände: 1,7 m
    this.halfD = this.D / 2;       // Enden offen

    const numSegs = this.D / 3;

    if (opts.branchSide !== undefined) {
      this.branchSide = opts.branchSide;
      if (opts.branchSide === "both") {
        this.branchSegE = opts.branchSegEast ?? opts.branchSeg ?? 1;
        this.branchSegW = opts.branchSegWest ?? opts.branchSeg ?? 1;
      } else {
        const seg = opts.branchSeg ?? 1;
        this.branchSegE = seg;
        this.branchSegW = seg;
      }
    } else if (numSegs >= 3 && Math.random() < 0.65) {
      const maxIdx = numSegs - 2;  // gültige Segmente: [1 … numSegs-2]
      if (numSegs >= 4 && Math.random() < 0.42) {
        // Langer Korridor: zwei gegenüberliegende Abzweige an verschiedenen Segmenten
        this.branchSide = "both";
        const sA = 1 + Math.floor(Math.random() * maxIdx);
        let   sB = sA;
        while (sB === sA) sB = 1 + Math.floor(Math.random() * maxIdx);
        this.branchSegE = sA;
        this.branchSegW = sB;
      } else {
        this.branchSide = Math.random() < 0.5 ? "east" : "west";
        const seg = 1 + Math.floor(Math.random() * maxIdx);
        this.branchSegE = seg;
        this.branchSegW = seg;
      }
    } else {
      this.branchSide = null;
      this.branchSegE = -1;
      this.branchSegW = -1;
    }

    const sk = Math.floor(Math.random() * numSegs);
    this.spawnPoint = new Vector3(0, 0, -this.D / 2 + 1.5 + sk * 3);

    const { D, H, branchSide, branchSegE, branchSegW } = this;
    this.doors = [
      { id: "north", position: new Vector3(0, H / 2,  D / 2), direction: new Vector3( 0, 0,  1) },
      { id: "south", position: new Vector3(0, H / 2, -D / 2), direction: new Vector3( 0, 0, -1) },
    ];
    // +X = Osten = rechts, −X = Westen = links
    if (branchSide === "east" || branchSide === "both") {
      this.doors.push({ id: "branch_east",
        position:  new Vector3( (this.W / 2 + T), H / 2, -D / 2 + branchSegE * 3 + 1.5),
        direction: new Vector3( 1, 0, 0) });
    }
    if (branchSide === "west" || branchSide === "both") {
      this.doors.push({ id: "branch_west",
        position:  new Vector3(-(this.W / 2 + T), H / 2, -D / 2 + branchSegW * 3 + 1.5),
        direction: new Vector3(-1, 0, 0) });
    }
  }

  protected async buildGeometry(scene: Scene): Promise<void> {
    const { W, D, H } = this;

    const ceilMat  = this.mat(scene, "ceil",      Color3.White());
    const bsMat    = this.mat(scene, "baseboard", new Color3(0.71, 0.69, 0.42));
    const cornMat  = this.mat(scene, "cornice",   new Color3(0.57, 0.56, 0.48));

    const { diffuse: ceilDiff, bump: ceilBump } = this.buildCeilingTileTexture(scene);
    ceilDiff.uScale = D; ceilDiff.vScale = W;
    ceilBump.uScale = D; ceilBump.vScale = W;
    ceilMat.diffuseTexture = ceilDiff;
    ceilMat.bumpTexture    = ceilBump;
    ceilMat.bumpTexture.level = 0.35;

    const ceil = MeshBuilder.CreateBox(`${this.id}_ceil`,
      { width: W, height: T, depth: D }, scene);
    ceil.position.y = H + T / 2;
    ceil.material   = ceilMat;
    this.track(ceil);

    this.buildSideWall(scene, "E",  W / 2 + T / 2,  W / 2, bsMat, cornMat);
    this.buildSideWall(scene, "W", -W / 2 - T / 2, -W / 2, bsMat, cornMat);

    this.buildCeilingLamps(scene);
    this.buildRoomLighting(scene);

    if (this._closeNorth) this.buildEndWall(scene, 'north');
    if (this._closeSouth) this.buildEndWall(scene, 'south');
  }

  private buildSideWall(
    scene:   Scene,
    side:    string,
    wallX:   number,
    innerX:  number,
    bsMat:   StandardMaterial,
    cornMat: StandardMaterial,
  ): void {
    const { D, H, branchSide, branchSegE, branchSegW } = this;
    const wallH  = H + T;
    const BS_H   = 0.10, BS_D  = 0.04;
    const CORN_H = 0.08, CORN_D = 0.04;
    const bsX   = innerX > 0 ? innerX - BS_D   / 2 : innerX + BS_D   / 2;
    const cornX = innerX > 0 ? innerX - CORN_D / 2 : innerX + CORN_D / 2;

    // E-Wand (+X) = Ostabzweig; W-Wand (−X) = Westabzweig
    const isEastBranch = branchSide === "east" || branchSide === "both";
    const isWestBranch = branchSide === "west" || branchSide === "both";
    const hasBranch = (side === "E" && isEastBranch) || (side === "W" && isWestBranch);
    const branchSeg = side === "E" ? branchSegE : branchSegW;

    const buildPanel = (panelId: string, depth: number, cz: number) => {
      const wallMat = this.mat(scene, `wall_${panelId}`, Color3.White());
      wallMat.diffuseTexture = this.buildWallpaperTexture(
        scene, `wall_${panelId}`,
        wallH / RoomBase.TILE_H,
        depth / RoomBase.TILE_W,
      );
      const wall = MeshBuilder.CreateBox(`${this.id}_wall_${panelId}`,
        { width: T, height: wallH, depth }, scene);
      wall.position = new Vector3(wallX, wallH / 2, cz);
      wall.material = wallMat;
      this.track(wall);

      const bs = MeshBuilder.CreateBox(`${this.id}_bs_${panelId}`,
        { width: BS_D, height: BS_H, depth }, scene);
      bs.position = new Vector3(bsX, BS_H / 2, cz);
      bs.material = bsMat;
      this.prop(bs);

      const corn = MeshBuilder.CreateBox(`${this.id}_corn_${panelId}`,
        { width: CORN_D, height: CORN_H, depth }, scene);
      corn.position = new Vector3(cornX, H - CORN_H / 2, cz);
      corn.material = cornMat;
      this.prop(corn);
    };

    if (!hasBranch) {
      buildPanel(side, D, 0);
    } else {
      const leftLen  = branchSeg * 3;
      const rightLen = D - (branchSeg + 1) * 3;
      if (leftLen > 0) buildPanel(`${side}_L`, leftLen, -D / 2 + leftLen / 2);
      if (rightLen > 0) buildPanel(`${side}_R`, rightLen, D / 2 - rightLen / 2);

      const sturzZ = -D / 2 + branchSeg * 3 + 1.5;
      const sturz = MeshBuilder.CreateBox(`${this.id}_sturz_${side}`,
        { width: T, height: T, depth: 3 }, scene);
      sturz.position = new Vector3(wallX, H + T / 2, sturzZ);
      sturz.material = bsMat;
      this.prop(sturz);

      for (const [tag, jambZ, signZ] of [
        ["jS", sturzZ - 1.5, +1],
        ["jN", sturzZ + 1.5, -1],
      ] as const) {
        const sign  = innerX > 0 ? 1 : -1;
        const bsJX  = wallX - sign * BS_D   / 2;
        const cornJX = wallX - sign * CORN_D / 2;

        const bsJ = MeshBuilder.CreateBox(`${this.id}_bs_${side}_${tag}`,
          { width: T + BS_D, height: BS_H, depth: BS_D }, scene);
        bsJ.position = new Vector3(bsJX, BS_H / 2, jambZ + signZ * BS_D / 2);
        bsJ.material = bsMat;
        this.prop(bsJ);

        const cornJ = MeshBuilder.CreateBox(`${this.id}_corn_${side}_${tag}`,
          { width: T + CORN_D, height: CORN_H, depth: CORN_D }, scene);
        cornJ.position = new Vector3(cornJX, H - CORN_H / 2, jambZ + signZ * CORN_D / 2);
        cornJ.material = cornMat;
        this.prop(cornJ);
      }
    }
  }

  closeNorth(): void { this._closeNorth = true; }
  closeSouth(): void { this._closeSouth = true; }

  private buildEndWall(scene: Scene, side: 'north' | 'south'): void {
    const { W, D, H } = this;
    const WALL_H = H + T;
    const BS_H = 0.10, BS_D = 0.04;
    const CN_H = 0.08, CN_D = 0.04;
    const sign  = side === 'north' ? 1 : -1;

    const wallMat = this.mat(scene, `wall_${side}`, Color3.White());
    wallMat.diffuseTexture = this.buildWallpaperTexture(
      scene, `wall_${side}`, W / RoomBase.TILE_W, WALL_H / RoomBase.TILE_H);
    const wall = MeshBuilder.CreateBox(`${this.id}_wall_${side}`,
      { width: W, height: WALL_H, depth: T }, scene);
    wall.position = new Vector3(0, WALL_H / 2, sign * (D / 2 + T / 2));
    wall.material = wallMat;
    this.track(wall);

    const bsMat = this.mat(scene, `bs_${side}`, new Color3(0.71, 0.69, 0.42));
    const bs = MeshBuilder.CreateBox(`${this.id}_bs_${side}`,
      { width: W, height: BS_H, depth: BS_D }, scene);
    bs.position = new Vector3(0, BS_H / 2, sign * (D / 2 - BS_D / 2));
    bs.material = bsMat;
    this.prop(bs);

    const cornMat = this.mat(scene, `corn_${side}`, new Color3(0.57, 0.56, 0.48));
    const cn = MeshBuilder.CreateBox(`${this.id}_cn_${side}`,
      { width: W, height: CN_H, depth: CN_D }, scene);
    cn.position = new Vector3(0, H - CN_H / 2, sign * (D / 2 - CN_D / 2));
    cn.material = cornMat;
    this.prop(cn);
  }

  private buildCeilingLamps(scene: Scene): void {
    const { D, H } = this;
    const LAMP_W = 0.6, LAMP_D = 0.6, LAMP_T = 0.04;
    const midIz = Math.floor(D / 3 / 2);
    this.humLocalPos = new Vector3(0, H - LAMP_T / 2, -D / 2 + 1.5 + midIz * 3);

    const lampMat = new StandardMaterial(`${this.id}_mat_lamp`, scene);
    lampMat.emissiveColor   = new Color3(0.95, 0.92, 0.62);
    lampMat.disableLighting = true;

    const rimMat = this.mat(scene, "lamp_rim", new Color3(0.18, 0.17, 0.14));

    const hasFlicker  = Math.random() < 0.20;
    const flickerIz   = Math.floor(Math.random() * (D / 3));

    for (let iz = 0; iz < D / 3; iz++) {
      const pz = -D / 2 + 1.5 + iz * 3;
      const isFlicker = hasFlicker && iz === flickerIz;

      let mat = lampMat;
      if (isFlicker) {
        mat = new StandardMaterial(`${this.id}_mat_flicker`, scene);
        mat.emissiveColor   = new Color3(0.95, 0.92, 0.62);
        mat.disableLighting = true;
      }

      const panel = MeshBuilder.CreateBox(`${this.id}_lamp_panel_${iz}`,
        { width: LAMP_W, height: LAMP_T, depth: LAMP_D }, scene);
      panel.position = new Vector3(0, H - LAMP_T / 2, pz);
      panel.material = mat;
      this.prop(panel);

      if (isFlicker) {
        this.flickerLampMesh = panel;
        this.flickerLocalPos = new Vector3(0, H - LAMP_T / 2, pz);
      }

      const rimT = 0.025, rimH = 0.05;
      for (const r of [
        { s: "N", p: new Vector3(0,                       H - rimH / 2, pz - LAMP_D / 2 - rimT / 2), w: LAMP_W + rimT * 2, d: rimT   },
        { s: "S", p: new Vector3(0,                       H - rimH / 2, pz + LAMP_D / 2 + rimT / 2), w: LAMP_W + rimT * 2, d: rimT   },
        { s: "E", p: new Vector3( LAMP_W / 2 + rimT / 2, H - rimH / 2, pz),                          w: rimT,              d: LAMP_D  },
        { s: "W", p: new Vector3(-LAMP_W / 2 - rimT / 2, H - rimH / 2, pz),                          w: rimT,              d: LAMP_D  },
      ]) {
        const rim = MeshBuilder.CreateBox(`${this.id}_lamp_rim_${iz}_${r.s}`,
          { width: r.w, height: rimH, depth: r.d }, scene);
        rim.position = r.p;
        rim.material = rimMat;
        this.prop(rim);
      }
    }
  }

  private buildRoomLighting(scene: Scene): void {
    const { D, H } = this;
    for (let iz = 0; iz < D / 3; iz++) {
      const pz    = -D / 2 + 1.5 + iz * 3;
      const light = new PointLight(`${this.id}_pl_${iz}`,
        new Vector3(0, H * 0.85, pz), scene);
      light.intensity = 0.40;
      light.diffuse   = new Color3(0.96, 0.91, 0.60);
      light.specular  = Color3.Black();
      light.range     = 6;
      this.trackLight(light);
    }
  }
}
