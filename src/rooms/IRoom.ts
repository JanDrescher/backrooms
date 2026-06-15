import type { Scene, Vector3 } from "@babylonjs/core";
import type { IInteractable } from "../engine/IInteractable";

export interface DoorDefinition {
  id: string;
  position: Vector3;   // Mittelpunkt der Türöffnung im Raumkoordinatensystem
  direction: Vector3;  // Normale (wohin die Tür "zeigt")
}

export interface IRoom {
  readonly id: string;
  readonly doors: DoorDefinition[];
  readonly spawnPoint: Vector3;
  readonly interactables: IInteractable[];

  /** Baut die Raumgeometrie in die Szene. */
  load(scene: Scene): Promise<void>;

  /** Räumt alle Meshes des Raums aus der Szene. */
  unload(): void;
}
