import { Vector3 } from "@babylonjs/core";
import { PlaceholderRoom, type DoorWall } from "../rooms/PlaceholderRoom";
import { CorridorRoom } from "../rooms/CorridorRoom";
import type { IRoom, DoorDefinition } from "../rooms/IRoom";
import { computeConnection } from "./LevelBuilder";

// ── Kollisions- und Bounds-Prüfung (10×10 Chunks = 30×30 m) ────────────────

type AABB = { minX: number; maxX: number; minZ: number; maxZ: number };

// 30×30 Chunks = 90×90 m; Spine wächst nach +Z, daher südlich etwas Puffer
const MAP: AABB = { minX: -45, maxX: 45, minZ: -10, maxZ: 80 };

function roomAABB(room: IRoom, offset: Vector3, rotation: number): AABB {
  // Rotation ist immer ein Vielfaches von π/2; ungerade Vielfache tauschen X↔Z
  const isOdd = Math.round(rotation / (Math.PI / 2)) % 2 !== 0;
  const hx = isOdd ? room.halfD : room.halfW;
  const hz = isOdd ? room.halfW : room.halfD;
  return { minX: offset.x - hx, maxX: offset.x + hx, minZ: offset.z - hz, maxZ: offset.z + hz };
}

function inBounds(a: AABB): boolean {
  return a.minX >= MAP.minX && a.maxX <= MAP.maxX
      && a.minZ >= MAP.minZ && a.maxZ <= MAP.maxZ;
}

function overlapsAny(a: AABB, others: AABB[], margin = 0.05): boolean {
  return others.some(b =>
    a.minX + margin < b.maxX && a.maxX - margin > b.minX &&
    a.minZ + margin < b.maxZ && a.maxZ - margin > b.minZ,
  );
}

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
  if (nz < 0) return "north";
  if (nz > 0) return "south";
  if (nx > 0) return "west";
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
  const p      = levelParams(levelNumber);
  const levelH = 2.8;

  const placed:      PlacedRoom[] = [];
  const placedAABBs: AABB[]       = [];
  let n = 0;
  const uid = (prefix: string) => `${prefix}${n++}`;

  // Raum/Korridor hinzufügen — gibt false zurück wenn außerhalb Bounds oder Kollision
  const tryAdd = (pr: PlacedRoom): boolean => {
    const aabb = roomAABB(pr.room, pr.offset, pr.rotation);
    if (!inBounds(aabb) || overlapsAny(aabb, placedAABBs)) return false;
    placed.push(pr);
    placedAABBs.push(aabb);
    return true;
  };

  const makePlaceholder = (anchor: DoorDefinition, id: string, isStart: boolean, isExit: boolean): PlacedRoom | null => {
    const W  = pick(p.roomSizes);
    const D  = pick(p.roomSizes);
    const H  = pick(ROOM_HEIGHTS);
    const dw = isStart ? "north" : doorWallForAnchor(anchor.direction);
    const room = new PlaceholderRoom(id, W, D, H, dw);
    const doorId = isStart ? "north" : dw;
    const { offset, rotation } = isStart
      ? { offset: Vector3.Zero(), rotation: 0 }
      : computeConnection(anchor, room.doors.find(d => d.id === doorId)!);
    const entry: PlacedRoom = { room, offset, rotation, isStart, isExit };
    return tryAdd(entry) ? entry : null;
  };

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
    if (!tryAdd({ room: junc, offset: jOff, rotation: jRot, isStart: false, isExit: false })) return;

    for (const dId of ["north", "branch_east", "branch_west"] as const) {
      const exitAnchor = worldDoor(junc.doors.find(d => d.id === dId)!, jOff, jRot);
      makePlaceholder(exitAnchor, uid(`j_${dId}`), false, false);
    }
  };

  // ── Start-Raum ─────────────────────────────────────────────────────────
  const dummyAnchor: DoorDefinition = { id: "", position: Vector3.Zero(), direction: new Vector3(0, 0, -1) };
  const startEntry = makePlaceholder(dummyAnchor, uid("p"), true, false);
  if (!startEntry) return placed;

  let anchor = worldDoor(startEntry.room.doors.find(d => d.id === "north")!, Vector3.Zero(), 0);
  const pendingBranches: DoorDefinition[] = [];

  // ── Hauptgang ──────────────────────────────────────────────────────────
  for (let i = 0; i < p.spineLength; i++) {
    const D = pick(p.corridorDs);
    const corridor = new CorridorRoom(uid("c"), { D, H: levelH });
    const { offset, rotation } = computeConnection(anchor, corridor.doors.find(d => d.id === "south")!);
    const pr: PlacedRoom = { room: corridor, offset, rotation, isStart: false, isExit: false };
    if (!tryAdd(pr)) break;  // Spine endet hier — außerhalb Bounds oder Kollision

    for (const door of corridor.doors) {
      if (door.id.startsWith("branch_")) {
        pendingBranches.push(worldDoor(door, offset, rotation));
      }
    }
    anchor = worldDoor(corridor.doors.find(d => d.id === "north")!, offset, rotation);
  }

  // ── Exit-Raum ──────────────────────────────────────────────────────────
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
      if (!tryAdd({ room: bc, offset: bOff, rotation: bRot, isStart: false, isExit: false })) break;

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
