import { MeshBuilder, StandardMaterial, PointLight, Color3, Vector3, type Scene } from "@babylonjs/core";
import { RoomBase } from "./RoomBase";
import type { DoorDefinition } from "./IRoom";

const T = 0.2; // Wandstärke

export class CorridorRoom extends RoomBase {
  readonly id: string;
  readonly doors: DoorDefinition[];
  readonly spawnPoint: Vector3;

  private readonly W = 3;
  private readonly D: number;
  private readonly H = 2.8;
  private readonly branchSide: "east" | "west" | null;
  private readonly branchSeg: number;

  constructor(id: string) {
    super();
    this.id = id;

    const depths = [9, 12, 15] as const;
    this.D = depths[Math.floor(Math.random() * depths.length)];

    if (this.D >= 12 && Math.random() < 0.6) {
      this.branchSide = Math.random() < 0.5 ? "east" : "west";
      const numSegs = this.D / 3;
      this.branchSeg = 1 + Math.floor(Math.random() * (numSegs - 2));
    } else {
      this.branchSide = null;
      this.branchSeg  = -1;
    }

    const sk = Math.floor(Math.random() * (this.D / 3));
    this.spawnPoint = new Vector3(0, 0, -this.D / 2 + 1.5 + sk * 3);

    const { D, H, branchSide, branchSeg } = this;
    this.doors = [
      { id: "north", position: new Vector3(0, H / 2, -D / 2), direction: new Vector3( 0, 0, -1) },
      { id: "south", position: new Vector3(0, H / 2,  D / 2), direction: new Vector3( 0, 0,  1) },
    ];
    if (branchSide === "east") {
      this.doors.push({ id: "branch_east",
        position:  new Vector3( this.W / 2, H / 2, -D / 2 + branchSeg * 3 + 1.5),
        direction: new Vector3( 1, 0, 0) });
    } else if (branchSide === "west") {
      this.doors.push({ id: "branch_west",
        position:  new Vector3(-this.W / 2, H / 2, -D / 2 + branchSeg * 3 + 1.5),
        direction: new Vector3(-1, 0, 0) });
    }
  }

  protected async buildGeometry(scene: Scene): Promise<void> {
    const { W, D, H } = this;

    const floorMat = this.mat(scene, "floor",     Color3.White());
    const ceilMat  = this.mat(scene, "ceil",      Color3.White());
    const bsMat    = this.mat(scene, "baseboard", new Color3(0.71, 0.69, 0.42));
    const cornMat  = this.mat(scene, "cornice",   new Color3(0.57, 0.56, 0.48));

    // Teppich — skaliert auf die gesamte Bodenplatte (W+2T × D), kein Offset nötig
    const carpetTex = this.buildCarpetTexture(scene);
    carpetTex.uScale = D / 3;             // U→Z (Tiefe), wie bei der Decke
    carpetTex.vScale = (W + 2 * T) / 3;  // V→X (Breite)
    floorMat.diffuseTexture = carpetTex;

    // Deckenplatten — U→Tiefe, V→Breite (−Y-Fläche: Achsen getauscht)
    const { diffuse: ceilDiff, bump: ceilBump } = this.buildCeilingTileTexture(scene);
    ceilDiff.uScale = D;
    ceilDiff.vScale = W;
    ceilBump.uScale = D;
    ceilBump.vScale = W;
    ceilMat.diffuseTexture = ceilDiff;
    ceilMat.bumpTexture    = ceilBump;
    ceilMat.bumpTexture.level = 0.35;

    // Boden — W+2T breit (reicht unter die E/W-Wände)
    const floor = MeshBuilder.CreateBox(`${this.id}_floor`,
      { width: W + 2 * T, height: T, depth: D }, scene);
    floor.position.y = -T / 2;
    floor.material   = floorMat;
    this.track(floor);

    const ceil = MeshBuilder.CreateBox(`${this.id}_ceil`,
      { width: W, height: T, depth: D }, scene);
    ceil.position.y = H + T / 2;
    ceil.material   = ceilMat;
    this.track(ceil);

    // E/W-Seitenwände
    this.buildSideWall(scene, "E",  W / 2 + T / 2,  W / 2, bsMat, cornMat);
    this.buildSideWall(scene, "W", -W / 2 - T / 2, -W / 2, bsMat, cornMat);

    this.buildFloorGrime(scene, W, D);
    this.buildCeilingLamps(scene);
    this.buildRoomLighting(scene);
  }

  private buildSideWall(
    scene:   Scene,
    side:    string,
    wallX:   number, // Wandzentrum X
    innerX:  number, // Wandinnenfläche X (für Leisten)
    bsMat:   StandardMaterial,
    cornMat: StandardMaterial,
  ): void {
    const { D, H, branchSide, branchSeg } = this;
    const wallH  = H + T;
    const BS_H   = 0.10, BS_D  = 0.04;
    const CORN_H = 0.08, CORN_D = 0.04;
    // Leisten sitzen an der Innenfläche, ragen ins Rauminnere
    const bsX   = innerX > 0 ? innerX - BS_D   / 2 : innerX + BS_D   / 2;
    const cornX = innerX > 0 ? innerX - CORN_D / 2 : innerX + CORN_D / 2;

    const hasBranch = (side === "E" && branchSide === "east")
                   || (side === "W" && branchSide === "west");

    const buildPanel = (panelId: string, depth: number, cz: number) => {
      // ±X-Flächen: UV-Quirk — U→Höhe, V→Tiefe
      const wallMat = this.mat(scene, `wall_${panelId}`, Color3.White());
      wallMat.diffuseTexture = this.buildWallpaperTexture(
        scene, `wall_${panelId}`,
        wallH / RoomBase.TILE_H,   // uScale = Höhenachse
        depth / RoomBase.TILE_W,   // vScale = Tiefenachse
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
      if (leftLen > 0) {
        buildPanel(`${side}_L`, leftLen, -D / 2 + leftLen / 2);
      }
      if (rightLen > 0) {
        buildPanel(`${side}_R`, rightLen, D / 2 - rightLen / 2);
      }

      // Sturz — schließt die T-hohe Deckenlücke über dem Wanddurchbruch
      const sturzZ = -D / 2 + branchSeg * 3 + 1.5;
      const sturz = MeshBuilder.CreateBox(`${this.id}_sturz_${side}`,
        { width: T, height: T, depth: 3 }, scene);
      sturz.position = new Vector3(wallX, H + T / 2, sturzZ);
      sturz.material = bsMat;
      this.prop(sturz);
    }
  }

  private buildCeilingLamps(scene: Scene): void {
    const { D, H } = this;
    const LAMP_W = 0.6, LAMP_D = 0.6, LAMP_T = 0.04;

    const lampMat = new StandardMaterial(`${this.id}_mat_lamp`, scene);
    lampMat.emissiveColor   = new Color3(0.95, 0.92, 0.62);
    lampMat.disableLighting = true;

    const rimMat = this.mat(scene, "lamp_rim", new Color3(0.18, 0.17, 0.14));

    for (let iz = 0; iz < D / 3; iz++) {
      const pz = -D / 2 + 1.5 + iz * 3;

      const panel = MeshBuilder.CreateBox(`${this.id}_lamp_panel_${iz}`,
        { width: LAMP_W, height: LAMP_T, depth: LAMP_D }, scene);
      panel.position = new Vector3(0, H - LAMP_T / 2, pz);
      panel.material = lampMat;
      this.prop(panel);

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
