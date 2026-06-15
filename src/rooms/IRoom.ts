import type { Scene, Vector3 } from "@babylonjs/core";
import type { IInteractable } from "../engine/IInteractable";

export interface DoorDefinition {
  id: string;
  position: Vector3;   // Nach load(): Weltposition; davor: Raumlokal
  direction: Vector3;  // Richtungs-Normale (wohin die Tür zeigt)
}

export interface IRoom {
  readonly id: string;
  readonly doors: DoorDefinition[];
  readonly spawnPoint: Vector3;
  readonly interactables: IInteractable[];
  readonly worldOffset: Vector3;

  /** Baut die Raumgeometrie in die Szene, optional mit Weltversatz. */
  load(scene: Scene, worldOffset?: Vector3): Promise<void>;

  /** Räumt alle Meshes des Raums aus der Szene. */
  unload(): void;
}
