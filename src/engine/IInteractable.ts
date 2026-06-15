import type { Vector3 } from "@babylonjs/core";

export interface IInteractable {
  position: Vector3;              // Weltposition für Näherungsprüfung (mutable für worldOffset)
  readonly interactRange: number;
  interact(playerPos: Vector3): void;
}
