import { Vector3 } from "@babylonjs/core";
import type { DoorDefinition } from "../rooms/IRoom";

/**
 * Berechnet worldOffset und rotationY, um einen neuen Raum über seine
 * entryDoor an eine bereits platzierte targetDoor anzuschließen.
 *
 * targetDoor  — Tür des platzierten Raums (Weltkoordinaten, nach dessen load())
 * entryDoor   — Eintrittstür des neuen Raums (Lokalkoordinaten, vor dessen load())
 */
export function computeConnection(
  targetDoor: DoorDefinition,
  entryDoor:  DoorDefinition,
): { offset: Vector3; rotation: number } {
  // Neue Tür soll der Ziel-Tür entgegenzeigen
  const desired  = targetDoor.direction.scale(-1);

  // Babylon.js ist linkshändig: LH-Rotation CCW im XZ, daher Vorzeichen umkehren
  const rotation = -(Math.atan2(desired.x, desired.z) - Math.atan2(entryDoor.direction.x, entryDoor.direction.z));

  // Eintrittsposition nach LH-Rotation (x'=x·c−z·s, z'=x·s+z·c)
  const c = Math.cos(rotation), s = Math.sin(rotation);
  const rx = entryDoor.position.x * c - entryDoor.position.z * s;
  const rz = entryDoor.position.x * s + entryDoor.position.z * c;

  const offset = new Vector3(
    targetDoor.position.x - rx,
    0,
    targetDoor.position.z - rz,
  );

  return { offset, rotation };
}
