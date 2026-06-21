import { MeshBuilder, Color3, Vector3, type Scene } from "@babylonjs/core";
import { RoomBase } from "./RoomBase";
import type { DoorDefinition } from "./IRoom";

const T = 0.2;

/**
 * Minimale Abschlusswand für offene Branch-Durchbrüche in Korridoren.
 * 3m breit, T tief — passt immer, weil ihr AABB kaum mit dem Korridor-AABB überlappt.
 */
export class CapWallRoom extends RoomBase {
  readonly id: string;
  readonly doors: DoorDefinition[];
  readonly spawnPoint = Vector3.Zero();
  readonly halfW = 1.5;   // 3m / 2
  readonly halfD = T / 2; // 0.1m — vernachlässigbar dünn

  private readonly H: number;

  constructor(id: string, H = 2.8) {
    super();
    this.id = id;
    this.H = H;
    // Eintrittspunkt: Südseite der Wandplatte, zeigt in −Z (wird durch computeConnection ausgerichtet)
    this.doors = [{
      id: 'south',
      position:  new Vector3(0, H / 2, -T / 2),
      direction: new Vector3(0, 0, -1),
    }];
  }

  protected async buildGeometry(scene: Scene): Promise<void> {
    const wallH = this.H + T;
    const wallMat = this.mat(scene, 'wall', Color3.White());
    wallMat.diffuseTexture = this.buildWallpaperTexture(
      scene, 'wall',
      wallH / RoomBase.TILE_H,
      3    / RoomBase.TILE_W,
    );

    const mesh = MeshBuilder.CreateBox(`${this.id}_cap`,
      { width: 3, height: wallH, depth: T }, scene);
    mesh.position.y = wallH / 2;
    mesh.material   = wallMat;
    this.track(mesh); // checkCollisions = true: Spieler kann nicht ins Leere
  }
}
