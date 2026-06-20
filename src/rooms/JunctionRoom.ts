import {
  MeshBuilder,
  StandardMaterial,
  PointLight,
  Color3,
  Vector3,
  type Scene,
} from "@babylonjs/core";
import { RoomBase } from "./RoomBase";
import type { DoorDefinition } from "./IRoom";

const T      = 0.2;
const OPEN_W = 3.0;  // Durchgangsbreite: immer 1 Chunk (3 m)

export type JunctionOpening = "north" | "south" | "east" | "west";

/**
 * Quadratischer Knotenpunkt (Kreuzung, T-Stück, Ecke) mit 2–4 konfigurierbaren Öffnungen.
 * Größe: size m × size m (Vielfaches von 3, z. B. 3, 6, 9).
 * Öffnungen sind immer OPEN_W (3 m) breit, zentriert auf der jeweiligen Wand.
 */
export class JunctionRoom extends RoomBase {
  readonly id: string;
  readonly doors: DoorDefinition[];
  readonly spawnPoint: Vector3;
  readonly halfW: number;
  readonly halfD: number;

  private readonly S: number;
  private readonly H: number;
  private readonly openings: ReadonlySet<JunctionOpening>;

  constructor(id: string, opts: {
    size?: number;             // Kantenlänge in m (Vielfaches von 3); default 3
    H?: number;
    openings: JunctionOpening[];  // mind. 2 Richtungen
  }) {
    super();
    this.id       = id;
    this.S        = opts.size ?? 3;
    this.H        = opts.H   ?? 2.8;
    this.halfW    = this.S / 2 + T;
    this.halfD    = this.S / 2 + T;
    this.openings = new Set(opts.openings);
    this.spawnPoint = new Vector3(0, 0, 0);

    const { S, H } = this;
    this.doors = [];
    // Türpositionen an Außenflächen der Wände (+T über Raumkante)
    if (this.openings.has("north")) this.doors.push({ id: "north", position: new Vector3(0,        H / 2,  S / 2 + T), direction: new Vector3( 0, 0,  1) });
    if (this.openings.has("south")) this.doors.push({ id: "south", position: new Vector3(0,        H / 2, -S / 2 - T), direction: new Vector3( 0, 0, -1) });
    if (this.openings.has("east"))  this.doors.push({ id: "east",  position: new Vector3( S/2 + T, H / 2, 0),          direction: new Vector3( 1, 0,  0) });
    if (this.openings.has("west"))  this.doors.push({ id: "west",  position: new Vector3(-S/2 - T, H / 2, 0),          direction: new Vector3(-1, 0,  0) });
  }

  protected async buildGeometry(scene: Scene): Promise<void> {
    const { S, H } = this;
    const wallH   = H + T;
    const sideLen = S / 2 - OPEN_W / 2;  // Panelbreite links/rechts der Öffnung

    const ceilMat  = this.mat(scene, "ceil",      Color3.White());
    const bsMat    = this.mat(scene, "baseboard", new Color3(0.71, 0.69, 0.42));
    const cornMat  = this.mat(scene, "cornice",   new Color3(0.57, 0.56, 0.48));

    // Z-Wände (N/S): standard UV (U = Breite, V = Höhe)
    const wallMatZ = this.mat(scene, "wall_z", Color3.White());
    wallMatZ.diffuseTexture = this.buildWallpaperTexture(scene, "z",
      S / RoomBase.TILE_W, wallH / RoomBase.TILE_H);

    // X-Wände (E/W): UV-Quirk — bei ±X-Flächen rotieren UV-Achsen (U→Höhe, V→Tiefe)
    const wallMatX = this.mat(scene, "wall_x", Color3.White());
    wallMatX.diffuseTexture = this.buildWallpaperTexture(scene, "x",
      wallH / RoomBase.TILE_H, S / RoomBase.TILE_W);

    // Decke
    const { diffuse: ceilDiff, bump: ceilBump } = this.buildCeilingTileTexture(scene);
    ceilDiff.uScale = S; ceilDiff.vScale = S;
    ceilBump.uScale = S; ceilBump.vScale = S;
    ceilMat.diffuseTexture    = ceilDiff;
    ceilMat.bumpTexture       = ceilBump;
    ceilMat.bumpTexture.level = 0.35;

    const ceil = MeshBuilder.CreateBox(`${this.id}_ceil`,
      { width: S, height: T, depth: S }, scene);
    ceil.position.y = H + T / 2;
    ceil.material   = ceilMat;
    this.track(ceil);

    // 4 Wände — je nach Öffnungsstatus offen oder geschlossen
    this.buildNSWall(scene, "N",  S / 2 + T / 2, wallH, sideLen, wallMatZ, bsMat, cornMat, this.openings.has("north"));
    this.buildNSWall(scene, "S", -S / 2 - T / 2, wallH, sideLen, wallMatZ, bsMat, cornMat, this.openings.has("south"));
    this.buildEWWall(scene, "E",  S / 2 + T / 2, wallH, sideLen, wallMatX, bsMat, cornMat, this.openings.has("east"));
    this.buildEWWall(scene, "W", -S / 2 - T / 2, wallH, sideLen, wallMatX, bsMat, cornMat, this.openings.has("west"));

    this.buildCeilingLamps(scene);
    this.buildRoomLighting(scene);
  }

  private buildNSWall(
    scene: Scene, side: string, cz: number, wallH: number, sideLen: number,
    mat: StandardMaterial, bsMat: StandardMaterial, cornMat: StandardMaterial, open: boolean,
  ): void {
    const { S, H } = this;
    const BS_H = 0.10, BS_D = 0.04, CH = 0.04;
    const sign = cz > 0 ? 1 : -1;
    const bsZ  = sign * (S / 2 - BS_D / 2);
    const cnZ  = sign * (S / 2 - CH  / 2);

    if (!open) {
      const m = MeshBuilder.CreateBox(`${this.id}_wall_${side}`,
        { width: S, height: wallH, depth: T }, scene);
      m.position = new Vector3(0, wallH / 2, cz);
      m.material = mat;
      this.track(m);

      const bs = MeshBuilder.CreateBox(`${this.id}_bs_${side}`,
        { width: S, height: BS_H, depth: BS_D }, scene);
      bs.position = new Vector3(0, BS_H / 2, bsZ);
      bs.material = bsMat;
      this.prop(bs);

      const cn = MeshBuilder.CreateBox(`${this.id}_cn_${side}`,
        { width: S, height: CH, depth: CH }, scene);
      cn.position = new Vector3(0, H - CH / 2, cnZ);
      cn.material = cornMat;
      this.prop(cn);
    } else if (sideLen > 0) {
      // Zwei Seitenpanele links und rechts der Öffnung
      for (const [sfx, px] of [
        [`${side}L`, -(OPEN_W / 2 + sideLen / 2)],
        [`${side}R`,  (OPEN_W / 2 + sideLen / 2)],
      ] as [string, number][]) {
        const m = MeshBuilder.CreateBox(`${this.id}_wall_${sfx}`,
          { width: sideLen, height: wallH, depth: T }, scene);
        m.position = new Vector3(px, wallH / 2, cz);
        m.material = mat;
        this.track(m);

        const bs = MeshBuilder.CreateBox(`${this.id}_bs_${sfx}`,
          { width: sideLen, height: BS_H, depth: BS_D }, scene);
        bs.position = new Vector3(px, BS_H / 2, bsZ);
        bs.material = bsMat;
        this.prop(bs);

        const cn = MeshBuilder.CreateBox(`${this.id}_cn_${sfx}`,
          { width: sideLen, height: CH, depth: CH }, scene);
        cn.position = new Vector3(px, H - CH / 2, cnZ);
        cn.material = cornMat;
        this.prop(cn);
      }
      // Sturz über Öffnung (füllt H … H+T)
      const sz = MeshBuilder.CreateBox(`${this.id}_sturz_${side}`,
        { width: OPEN_W, height: T, depth: T }, scene);
      sz.position = new Vector3(0, H + T / 2, cz);
      sz.material = bsMat;
      this.prop(sz);
    }
    // sideLen === 0 → Öffnung füllt komplette Wandbreite, keine Geometrie nötig
  }

  private buildEWWall(
    scene: Scene, side: string, cx: number, wallH: number, sideLen: number,
    mat: StandardMaterial, bsMat: StandardMaterial, cornMat: StandardMaterial, open: boolean,
  ): void {
    const { S, H } = this;
    const BS_H = 0.10, BS_D = 0.04, CH = 0.04;
    const sign = cx > 0 ? 1 : -1;
    const bsX  = sign * (S / 2 - BS_D / 2);
    const cnX  = sign * (S / 2 - CH  / 2);

    if (!open) {
      const m = MeshBuilder.CreateBox(`${this.id}_wall_${side}`,
        { width: T, height: wallH, depth: S }, scene);
      m.position = new Vector3(cx, wallH / 2, 0);
      m.material = mat;
      this.track(m);

      const bs = MeshBuilder.CreateBox(`${this.id}_bs_${side}`,
        { width: BS_D, height: BS_H, depth: S }, scene);
      bs.position = new Vector3(bsX, BS_H / 2, 0);
      bs.material = bsMat;
      this.prop(bs);

      const cn = MeshBuilder.CreateBox(`${this.id}_cn_${side}`,
        { width: CH, height: CH, depth: S }, scene);
      cn.position = new Vector3(cnX, H - CH / 2, 0);
      cn.material = cornMat;
      this.prop(cn);
    } else if (sideLen > 0) {
      for (const [sfx, pz] of [
        [`${side}L`, -(OPEN_W / 2 + sideLen / 2)],
        [`${side}R`,  (OPEN_W / 2 + sideLen / 2)],
      ] as [string, number][]) {
        const m = MeshBuilder.CreateBox(`${this.id}_wall_${sfx}`,
          { width: T, height: wallH, depth: sideLen }, scene);
        m.position = new Vector3(cx, wallH / 2, pz);
        m.material = mat;
        this.track(m);

        const bs = MeshBuilder.CreateBox(`${this.id}_bs_${sfx}`,
          { width: BS_D, height: BS_H, depth: sideLen }, scene);
        bs.position = new Vector3(bsX, BS_H / 2, pz);
        bs.material = bsMat;
        this.prop(bs);

        const cn = MeshBuilder.CreateBox(`${this.id}_cn_${sfx}`,
          { width: CH, height: CH, depth: sideLen }, scene);
        cn.position = new Vector3(cnX, H - CH / 2, pz);
        cn.material = cornMat;
        this.prop(cn);
      }
      const sz = MeshBuilder.CreateBox(`${this.id}_sturz_${side}`,
        { width: T, height: T, depth: OPEN_W }, scene);
      sz.position = new Vector3(cx, H + T / 2, 0);
      sz.material = bsMat;
      this.prop(sz);
    }
  }

  private buildCeilingLamps(scene: Scene): void {
    const { S, H } = this;
    const LAMP_W = 0.6, LAMP_D = 0.6, LAMP_T = 0.04;
    const nGrid  = Math.round(S / 3);

    this.humLocalPos = new Vector3(0, H - LAMP_T / 2, 0);

    const lampMat = new StandardMaterial(`${this.id}_mat_lamp`, scene);
    lampMat.emissiveColor   = new Color3(0.95, 0.92, 0.62);
    lampMat.disableLighting = true;

    const rimMat = this.mat(scene, "lamp_rim", new Color3(0.18, 0.17, 0.14));

    const hasFlicker = Math.random() < 0.20;
    const flickerIdx = Math.floor(Math.random() * (nGrid * nGrid));

    let idx = 0;
    for (let ix = 0; ix < nGrid; ix++) {
      for (let iz = 0; iz < nGrid; iz++, idx++) {
        const px = -S / 2 + 1.5 + ix * 3;
        const pz = -S / 2 + 1.5 + iz * 3;
        const isFlicker = hasFlicker && idx === flickerIdx;

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
          { s: "N", p: new Vector3(px,                  H - rimH / 2, pz - LAMP_D / 2 - rimT / 2), w: LAMP_W + rimT * 2, d: rimT   },
          { s: "S", p: new Vector3(px,                  H - rimH / 2, pz + LAMP_D / 2 + rimT / 2), w: LAMP_W + rimT * 2, d: rimT   },
          { s: "E", p: new Vector3(px + LAMP_W / 2 + rimT / 2, H - rimH / 2, pz),                  w: rimT,              d: LAMP_D },
          { s: "W", p: new Vector3(px - LAMP_W / 2 - rimT / 2, H - rimH / 2, pz),                  w: rimT,              d: LAMP_D },
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
    const { S, H } = this;
    const nGrid = Math.round(S / 3);

    for (let ix = 0; ix < nGrid; ix++) {
      for (let iz = 0; iz < nGrid; iz++) {
        const px = -S / 2 + 1.5 + ix * 3;
        const pz = -S / 2 + 1.5 + iz * 3;
        const light = new PointLight(`${this.id}_pl_${ix}_${iz}`,
          new Vector3(px, H * 0.85, pz), scene);
        light.intensity = 0.42;
        light.diffuse   = new Color3(0.96, 0.91, 0.60);
        light.specular  = Color3.Black();
        light.range     = 6;
        this.trackLight(light);
      }
    }
  }
}
