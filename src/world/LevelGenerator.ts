import { Vector3 } from "@babylonjs/core";
import { PlaceholderRoom, type DoorWall } from "../rooms/PlaceholderRoom";
import { CorridorRoom } from "../rooms/CorridorRoom";
import type { IRoom, DoorDefinition } from "../rooms/IRoom";
import { computeConnection } from "./LevelBuilder";

// ── AABB ─────────────────────────────────────────────────────────────────────

type AABB = { minX: number; maxX: number; minZ: number; maxZ: number };

const MAP: AABB = { minX: -45, maxX: 45, minZ: -10, maxZ: 80 };

function roomAABB(room: IRoom, offset: Vector3, rotation: number): AABB {
  const isOdd = Math.round(rotation / (Math.PI / 2)) % 2 !== 0;
  const hx    = isOdd ? room.halfD : room.halfW;
  const hz    = isOdd ? room.halfW : room.halfD;
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

// ── Typen ─────────────────────────────────────────────────────────────────────

export interface PlacedRoom {
  room:     IRoom;
  offset:   Vector3;
  rotation: number;
  isStart:  boolean;
  isExit:   boolean;
}

// ── Hilfsfunktionen ───────────────────────────────────────────────────────────

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

function shuffle<T>(arr: T[]): T[] {
  for (let i = arr.length - 1; i > 0; i--) {
    const j = Math.floor(Math.random() * (i + 1));
    [arr[i], arr[j]] = [arr[j], arr[i]];
  }
  return arr;
}

function doorWallForAnchor(anchorDir: Vector3): DoorWall {
  const nx = Math.round(anchorDir.x);
  const nz = Math.round(anchorDir.z);
  if (nz < 0) return "north";
  if (nz > 0) return "south";
  if (nx > 0) return "west";
  return "east";
}

// ── Konstanten ────────────────────────────────────────────────────────────────

const LEVEL_H      = 2.8;
const CORRIDOR_DS  = [9, 9, 9, 12, 12] as const;
const ROOM_SIZES   = [6, 6, 9, 9, 12] as const;
const ROOM_HEIGHTS = [2.5, 2.8, 3.0, 3.2] as const;

// ── Generator ─────────────────────────────────────────────────────────────────

export function generateLevel(_levelNumber: number): PlacedRoom[] {
  const placed:      PlacedRoom[] = [];
  const placedAABBs: AABB[]       = [];
  let   n = 0;
  const uid = (p: string) => `${p}${n++}`;

  const tryAdd = (pr: PlacedRoom): boolean => {
    const aabb = roomAABB(pr.room, pr.offset, pr.rotation);
    if (!inBounds(aabb) || overlapsAny(aabb, placedAABBs)) return false;
    placed.push(pr);
    placedAABBs.push(aabb);
    return true;
  };

  // Terminalen Raum an einer offenen Verbindung platzieren.
  // Garantiert immer einen Abschluss — nie ein offenes Korridorende.
  const placeRoom = (anchor: DoorDefinition, isExit = false): void => {
    const dw = doorWallForAnchor(anchor.direction);
    const room = new PlaceholderRoom(uid("p"), pick(ROOM_SIZES), pick(ROOM_SIZES), pick(ROOM_HEIGHTS), dw);
    const { offset, rotation } = computeConnection(anchor, room.doors.find(d => d.id === dw)!);
    tryAdd({ room, offset, rotation, isStart: false, isExit });
  };

  // ── Startraum ────────────────────────────────────────────────────────────
  const startRoom = new PlaceholderRoom(uid("p"), 9, 9, 2.8, "north");
  if (!tryAdd({ room: startRoom, offset: Vector3.Zero(), rotation: 0, isStart: true, isExit: false }))
    return placed;

  // ── DFS-Stack ─────────────────────────────────────────────────────────────
  // Jeder Eintrag ist eine offene Verbindung + verbleibende Korridorschritte.
  // Branches erhalten einen NEUEN (frischen) Tiefenzähler → eigenständige Pfade.
  // Alle Pfade enden garantiert in einem Raum.
  interface StackItem { anchor: DoorDefinition; stepsLeft: number }

  const stack: StackItem[] = [
    {
      anchor:    worldDoor(startRoom.doors.find(d => d.id === "north")!, Vector3.Zero(), 0),
      stepsLeft: 8,
    },
  ];

  while (stack.length > 0) {
    const { anchor, stepsLeft } = stack.pop()!;

    // Tiefe erschöpft → Raum als Abschluss
    if (stepsLeft <= 0) {
      placeRoom(anchor);
      continue;
    }

    const D       = pick(CORRIDOR_DS);
    const numSegs = D / 3;
    const maxSeg  = numSegs - 1;

    // Abzweig-Strategie: häufig "both" für Netzdichte
    const r = Math.random();
    const branchSide: "east" | "west" | "both" | null =
      r < 0.50 ? "both"  :
      r < 0.75 ? (Math.random() < 0.5 ? "east" : "west") :
      null;

    const corridor = new CorridorRoom(uid("c"), {
      D, H: LEVEL_H, branchSide,
      branchSeg:     rnd(0, maxSeg),
      branchSegEast: rnd(0, maxSeg),
      branchSegWest: rnd(0, maxSeg),
    });

    const { offset, rotation } = computeConnection(anchor, corridor.doors.find(d => d.id === "south")!);

    if (tryAdd({ room: corridor, offset, rotation, isStart: false, isExit: false })) {
      // Alle Folge-Verbindungen sammeln
      const next: StackItem[] = [
        // Nord-Ende: Pfad läuft weiter (Tiefe -1)
        {
          anchor:    worldDoor(corridor.doors.find(d => d.id === "north")!, offset, rotation),
          stepsLeft: stepsLeft - 1,
        },
      ];
      // Jeder Abzweig startet einen frischen Pfad (unabhängige Tiefe)
      for (const door of corridor.doors) {
        if (door.id.startsWith("branch_")) {
          next.push({
            anchor:    worldDoor(door, offset, rotation),
            stepsLeft: rnd(3, 7),
          });
        }
      }
      // Mischen → organische Reihenfolge, kein deterministisches Muster
      shuffle(next);
      for (const item of next) stack.push(item);
    } else {
      // Korridor passt nicht → sofortiger Raumabschluss
      placeRoom(anchor);
    }
  }

  // Exit markieren (letzter PlaceholderRoom)
  for (let i = placed.length - 1; i >= 0; i--) {
    if (!placed[i].isStart && placed[i].room instanceof PlaceholderRoom) {
      placed[i] = { ...placed[i], isExit: true };
      break;
    }
  }

  return placed;
}
