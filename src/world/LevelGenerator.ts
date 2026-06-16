import { Vector3 } from "@babylonjs/core";
import { PlaceholderRoom, type DoorWall } from "../rooms/PlaceholderRoom";
import { CorridorRoom } from "../rooms/CorridorRoom";
import type { IRoom, DoorDefinition } from "../rooms/IRoom";
import { computeConnection } from "./LevelBuilder";

export interface PlacedRoom {
  room:     IRoom;
  offset:   Vector3;
  rotation: number;
  isStart:  boolean;
  isExit:   boolean;
}

// ── Hilfsfunktionen ──────────────────────────────────────────────────────────

function rotY(v: Vector3, a: number): Vector3 {
  const c = Math.cos(a), s = Math.sin(a);
  return new Vector3(v.x * c - v.z * s, v.y, v.x * s + v.z * c);
}

function worldDoor(door: DoorDefinition, offset: Vector3, rotation: number): DoorDefinition {
  return {
    id:        door.id,
    position:  rotY(door.position, rotation).addInPlace(offset.clone()),
    direction: rotY(door.direction, rotation),
  };
}

function pick<T>(arr: readonly T[]): T {
  return arr[Math.floor(Math.random() * arr.length)];
}

function rnd(min: number, max: number): number {
  return min + Math.floor(Math.random() * (max - min + 1));
}

/**
 * Leitet die doorWall ab, die computeConnection rotation=0 liefert —
 * damit liegt Tür-Geometrie und Tür-Logik immer an derselben Stelle.
 */
function doorWallForAnchor(anchorDir: Vector3): DoorWall {
  const nx = Math.round(anchorDir.x);
  const nz = Math.round(anchorDir.z);
  if (nz < 0) return "south";
  if (nz > 0) return "north";
  if (nx < 0) return "west";
  return "east";
}

// ── Level-Parameter ──────────────────────────────────────────────────────────

interface LevelParams {
  spineLength: number;
  branchDepth: number;
  corridorDs:  readonly number[];
  roomSizes:   readonly number[];
}

function levelParams(level: number): LevelParams {
  const l = Math.max(1, level);
  return {
    spineLength: rnd(2 + l, 3 + l * 2),
    branchDepth: rnd(1, Math.min(1 + Math.floor(l / 2), 3)),
    corridorDs:  [9, 12, 15] as const,
    roomSizes:   l < 4 ? [6, 9] : [6, 9, 12],
  };
}

// ── Generator ────────────────────────────────────────────────────────────────

const ROOM_HEIGHTS = [2.5, 2.8, 3.0, 3.2] as const;

export function generateLevel(levelNumber: number): PlacedRoom[] {
  const p       = levelParams(levelNumber);
  const levelH  = pick(ROOM_HEIGHTS);  // alle Korridore teilen exakt eine Höhe

  const placed: PlacedRoom[] = [];
  let n = 0;
  const uid = (prefix: string) => `${prefix}${n++}`;

  // PlaceholderRoom — jeder bekommt seine eigene zufällige Höhe
  const makePlaceholder = (anchor: DoorDefinition, id: string, isStart: boolean, isExit: boolean): PlacedRoom => {
    const W  = pick(p.roomSizes);
    const D  = pick(p.roomSizes);
    const H  = pick(ROOM_HEIGHTS);       // unabhängig von levelH
    const dw = isStart ? "north" : doorWallForAnchor(anchor.direction);
    const room = new PlaceholderRoom(id, W, D, H, dw);
    const doorId = isStart ? "north" : dw;
    const { offset, rotation } = isStart
      ? { offset: Vector3.Zero(), rotation: 0 }
      : computeConnection(anchor, room.doors.find(d => d.id === doorId)!);
    const entry: PlacedRoom = { room, offset, rotation, isStart, isExit };
    placed.push(entry);
    return entry;
  };

  /**
   * Platziert am Korridor-Ende entweder einen PlaceholderRoom (55%)
   * oder einen Junction-Korridor (45%) mit drei weiteren Ausgängen.
   * Der Junction-Korridor läuft quer (branchSide="both" am gleichen Segment)
   * und erschafft so ein Kreuz- oder T-Stück.
   */
  const makeTerminal = (anchor: DoorDefinition, id: string): void => {
    if (Math.random() < 0.55) {
      makePlaceholder(anchor, id, false, false);
      return;
    }
    const jD   = pick([9, 12] as const);
    const jSeg = rnd(1, Math.max(1, Math.floor(jD / 3) - 1));
    const junc = new CorridorRoom(uid("jc"), {
      D: jD, H: levelH, branchSide: "both",
      branchSegEast: jSeg, branchSegWest: jSeg,
    });
    const { offset: jOff, rotation: jRot } = computeConnection(
      anchor, junc.doors.find(d => d.id === "south")!,
    );
    placed.push({ room: junc, offset: jOff, rotation: jRot, isStart: false, isExit: false });

    // Nord-, Ost- und Westausgang des Junction-Korridors je ein Placeholder
    for (const dId of ["north", "branch_east", "branch_west"] as const) {
      const exitAnchor = worldDoor(junc.doors.find(d => d.id === dId)!, jOff, jRot);
      makePlaceholder(exitAnchor, uid(`j_${dId}`), false, false);
    }
  };

  // ── Start-Raum ─────────────────────────────────────────────────────────
  const dummyAnchor: DoorDefinition = { id: "", position: Vector3.Zero(), direction: new Vector3(0, 0, -1) };
  const startEntry = makePlaceholder(dummyAnchor, uid("p"), true, false);
  let anchor = worldDoor(startEntry.room.doors.find(d => d.id === "north")!, Vector3.Zero(), 0);

  const pendingBranches: DoorDefinition[] = [];

  // ── Hauptgang ──────────────────────────────────────────────────────────
  for (let i = 0; i < p.spineLength; i++) {
    const D = pick(p.corridorDs);
    const corridor = new CorridorRoom(uid("c"), { D, H: levelH });
    const { offset, rotation } = computeConnection(anchor, corridor.doors.find(d => d.id === "south")!);
    placed.push({ room: corridor, offset, rotation, isStart: false, isExit: false });

    // Alle branch_*-Türen dieses Korridors als ausstehende Äste merken
    for (const door of corridor.doors) {
      if (door.id.startsWith("branch_")) {
        pendingBranches.push(worldDoor(door, offset, rotation));
      }
    }

    anchor = worldDoor(corridor.doors.find(d => d.id === "north")!, offset, rotation);
  }

  // ── Exit-Raum (Haupt-Korridorende) ────────────────────────────────────
  makePlaceholder(anchor, uid("exit"), false, true);

  // ── Seitenäste ─────────────────────────────────────────────────────────
  for (const branchStart of pendingBranches) {
    let branchAnchor = branchStart;

    for (let b = 0; b < p.branchDepth; b++) {
      const D  = pick(p.corridorDs);
      const bc = new CorridorRoom(uid("bc"), { D, H: levelH });
      const { offset: bOff, rotation: bRot } = computeConnection(
        branchAnchor, bc.doors.find(d => d.id === "south")!,
      );
      placed.push({ room: bc, offset: bOff, rotation: bRot, isStart: false, isExit: false });

      // Sub-Abzweige im Ast-Korridor → direkt Placeholder (keine weitere Tiefe)
      for (const door of bc.doors) {
        if (door.id.startsWith("branch_")) {
          makePlaceholder(worldDoor(door, bOff, bRot), uid("sbp"), false, false);
        }
      }

      branchAnchor = worldDoor(bc.doors.find(d => d.id === "north")!, bOff, bRot);
    }

    makeTerminal(branchAnchor, uid("pt"));
  }

  return placed;
}
