import type { Scene, Vector3 } from "@babylonjs/core";

export interface DoorDefinition {
  id: string;
  position: Vector3;   // Mittelpunkt der Türöffnung im Raumkoordinatensystem
  direction: Vector3;  // Normale (wohin die Tür "zeigt")
}

export interface IRoom {
  readonly id: string;
  readonly doors: DoorDefinition[];

  /** Baut die Raumgeometrie in die Szene. */
  load(scene: Scene): Promise<void>;

  /** Räumt alle Meshes des Raums aus der Szene. */
  unload(): void;
}
