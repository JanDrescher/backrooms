import { MeshBuilder, StandardMaterial, PointLight, Color3, Vector3, type Scene } from "@babylonjs/core";
import { RoomBase } from "./RoomBase";
import type { DoorDefinition } from "./IRoom";

const T = 0.2;
const W = 3;    // 1 Chunk breit — passend zum Korridor
const D = 1;    // 1/3 Chunk tief — zwei gegenüber liegende Nischen passen in 1 Chunk
const H = 2.8;  // Korridor-Höhe

export class CapWallRoom extends RoomBase {
  readonly id: string;
  readonly doors: DoorDefinition[];
  readonly spawnPoint = Vector3.Zero();
  readonly halfW = W / 2;
  readonly halfD = D / 2;       // 1.0m — AABB beginnt exakt am Korridorende, tryAdd() gelingt immer

  constructor(id: string) {
    super();
    this.id = id;
    this.doors = [{
      id:        'south',
      position:  new Vector3(0, H / 2, -D / 2),
      direction: new Vector3(0, 0, -1),
    }];
  }

  protected async buildGeometry(scene: Scene): Promise<void> {
    const WALL_H = H + T;
    const BS_H = 0.10, BS_D = 0.04;
    const CN_H = 0.08, CN_D = 0.04;

    // ── Materialien ──────────────────────────────────────────────────────────
    const bsMat   = this.mat(scene, 'baseboard', new Color3(0.71, 0.69, 0.42));
    const cornMat = this.mat(scene, 'cornice',   new Color3(0.57, 0.56, 0.48));
    const ceilMat = this.mat(scene, 'ceil',      Color3.White());

    const { diffuse: ceilDiff, bump: ceilBump } = this.buildCeilingTileTexture(scene);
    ceilDiff.uScale = D; ceilDiff.vScale = W;
    ceilBump.uScale = D; ceilBump.vScale = W;
    ceilMat.diffuseTexture = ceilDiff;
    ceilMat.bumpTexture    = ceilBump;
    ceilMat.bumpTexture.level = 0.35;

    // ── Decke ────────────────────────────────────────────────────────────────
    const ceil = MeshBuilder.CreateBox(`${this.id}_ceil`,
      { width: W, height: T, depth: D }, scene);
    ceil.position.y = H + T / 2;
    ceil.material   = ceilMat;
    this.track(ceil);

    // ── Wände als Planes (Hinterwand + links + rechts) ───────────────────────
    // Alle Planes mit normalem UV (kein Quirk), Normal zeigt ins Rauminnere.
    const wallConfigs = [
      { name: 'B', x: 0,     z:  D/2, rotY: 0,              pw: W, uSc: W / RoomBase.TILE_W, vSc: WALL_H / RoomBase.TILE_H },
      { name: 'L', x: -W/2,  z:  0,   rotY: -Math.PI / 2,  pw: D, uSc: D / RoomBase.TILE_W, vSc: WALL_H / RoomBase.TILE_H },
      { name: 'R', x:  W/2,  z:  0,   rotY:  Math.PI / 2,  pw: D, uSc: D / RoomBase.TILE_W, vSc: WALL_H / RoomBase.TILE_H },
    ];
    for (const c of wallConfigs) {
      const mat = this.mat(scene, `wall_${c.name}`, Color3.White());
      mat.diffuseTexture = this.buildWallpaperTexture(scene, `wall_${c.name}`, c.uSc, c.vSc);
      const plane = MeshBuilder.CreatePlane(`${this.id}_wall_${c.name}`,
        { width: c.pw, height: WALL_H }, scene);
      plane.position  = new Vector3(c.x, WALL_H / 2, c.z);
      plane.rotation.y = c.rotY;
      plane.material  = mat;
      this.track(plane);
    }

    // ── Scheuerleisten (3 Wände) ─────────────────────────────────────────────
    for (const b of [
      { s: 'B', p: new Vector3(0,             BS_H/2, D/2 - BS_D/2), w: W,    d: BS_D },
      { s: 'L', p: new Vector3(-W/2 + BS_D/2, BS_H/2, 0),            w: BS_D, d: D    },
      { s: 'R', p: new Vector3( W/2 - BS_D/2, BS_H/2, 0),            w: BS_D, d: D    },
    ]) {
      const m = MeshBuilder.CreateBox(`${this.id}_bs_${b.s}`,
        { width: b.w, height: BS_H, depth: b.d }, scene);
      m.position = b.p;
      m.material = bsMat;
      this.prop(m);
    }

    // ── Deckenleisten (3 Wände) ──────────────────────────────────────────────
    for (const c of [
      { s: 'B', p: new Vector3(0,             H - CN_H/2, D/2 - CN_D/2), w: W,    d: CN_D },
      { s: 'L', p: new Vector3(-W/2 + CN_D/2, H - CN_H/2, 0),            w: CN_D, d: D    },
      { s: 'R', p: new Vector3( W/2 - CN_D/2, H - CN_H/2, 0),            w: CN_D, d: D    },
    ]) {
      const m = MeshBuilder.CreateBox(`${this.id}_corn_${c.s}`,
        { width: c.w, height: CN_H, depth: c.d }, scene);
      m.position = c.p;
      m.material = cornMat;
      this.prop(m);
    }

    // ── Deckenlampe (hinten, mittig an der Hinterwand) ───────────────────────
    const LAMP_W = 0.6, LAMP_D = 0.6, LAMP_T = 0.04;
    const lampZ = D / 2 - LAMP_D / 2 - 0.2;  // nahe Hinterwand, kleiner Abstand
    this.humLocalPos = new Vector3(0, H - LAMP_T / 2, lampZ);

    const lampMat = new StandardMaterial(`${this.id}_mat_lamp`, scene);
    lampMat.emissiveColor       = new Color3(0.95, 0.92, 0.62);
    lampMat.disableLighting     = true;
    lampMat.maxSimultaneousLights = 6;

    const panel = MeshBuilder.CreateBox(`${this.id}_lamp_panel`,
      { width: LAMP_W, height: LAMP_T, depth: LAMP_D }, scene);
    panel.position = new Vector3(0, H - LAMP_T / 2, lampZ);
    panel.material = lampMat;
    this.prop(panel);

    const rimMat = this.mat(scene, 'lamp_rim', new Color3(0.18, 0.17, 0.14));
    const rimT = 0.025, rimH = 0.05;
    for (const r of [
      { s: 'N', p: new Vector3(0,                H - rimH/2, lampZ - LAMP_D/2 - rimT/2), w: LAMP_W + rimT*2, d: rimT   },
      { s: 'S', p: new Vector3(0,                H - rimH/2, lampZ + LAMP_D/2 + rimT/2), w: LAMP_W + rimT*2, d: rimT   },
      { s: 'E', p: new Vector3( LAMP_W/2+rimT/2, H - rimH/2, lampZ),                     w: rimT,            d: LAMP_D },
      { s: 'W', p: new Vector3(-LAMP_W/2-rimT/2, H - rimH/2, lampZ),                     w: rimT,            d: LAMP_D },
    ]) {
      const rim = MeshBuilder.CreateBox(`${this.id}_lamp_rim_${r.s}`,
        { width: r.w, height: rimH, depth: r.d }, scene);
      rim.position = r.p;
      rim.material = rimMat;
      this.prop(rim);
    }

    // ── Punktlicht (wie Korridor, nahe Lampe) ────────────────────────────────
    const light = new PointLight(`${this.id}_pl`,
      new Vector3(0, H * 0.85, lampZ), scene);
    light.intensity = 0.40;
    light.diffuse   = new Color3(0.96, 0.91, 0.60);
    light.specular  = Color3.Black();
    light.range     = 6.5;
    this.trackLight(light);
  }
}
