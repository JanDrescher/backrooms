import type { Vector3 } from "@babylonjs/core";

export interface IInteractable {
  readonly position: Vector3;     // Weltposition für Näherungsprüfung
  readonly interactRange: number; // Reichweite in Metern
  interact(playerPos: Vector3): void;
}
