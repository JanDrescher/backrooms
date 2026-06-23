import { Vector3 } from "@babylonjs/core";
import { PlaceholderRoom, type DoorWall } from "../rooms/PlaceholderRoom";
import { CorridorRoom } from "../rooms/CorridorRoom";
import { CapWallRoom } from "../rooms/CapWallRoom";
import { computeConnection } from "./LevelBuilder";
import type { DoorDefinition } from "../rooms/IRoom";
import type { PlacedRoom } from "./LevelGenerator";

// ── Minimap-Daten ────────────────────────────────────────────────────────────

export interface MinimapRoom {
  type:   'placeholder' | 'corridor' | 'capwall';
  cx:     number;   // BJS-Weltmittelpunkt X
  cz:     number;   // BJS-Weltmittelpunkt Z
  localW: number;   // intrinsische Breite (X-Achse vor Rotation), in Metern
  localD: number;   // intrinsische Tiefe  (Z-Achse vor Rotation), in Metern
  rotY:   number;   // Rotation um Y-Achse (Radiant)
}

export interface MinimapConnection {
  x: number;   // Weltposition des Verbindungspunkts
  z: number;
}

export interface LevelData {
  rooms:       PlacedRoom[];
  mapData:     MinimapRoom[];
  connections: MinimapConnection[];
}

// ── AABB / Bounds-Check ───────────────────────────────────────────────────────

interface AABB { minX: number; maxX: number; minZ: number; maxZ: number; }

// Grenzen des spielbaren Bereichs (GlobalFloor-Ausdehnung)
const MAP: AABB = { minX: -30, maxX: 30, minZ: -30, maxZ: 30 };

function roomAABB(room: { halfW: number; halfD: number }, offset: Vector3, rotation: number): AABB {
  const odd = Math.round(rotation / (Math.PI / 2)) % 2 !== 0;
  const hx  = odd ? room.halfD : room.halfW;
  const hz  = odd ? room.halfW : room.halfD;
  return { minX: offset.x - hx, maxX: offset.x + hx, minZ: offset.z - hz, maxZ: offset.z + hz };
}

function inBounds(a: AABB): boolean {
  return a.minX >= MAP.minX && a.maxX <= MAP.maxX
      && a.minZ >= MAP.minZ && a.maxZ <= MAP.maxZ;
}

function overlaps(a: AABB, b: AABB, margin = 0.05): boolean {
  return a.minX + margin < b.maxX && a.maxX - margin > b.minX
      && a.minZ + margin < b.maxZ && a.maxZ - margin > b.minZ;
}

// ── Hilfsfunktionen ───────────────────────────────────────────────────────────

function pick<T>(arr: readonly T[]): T {
  return arr[Math.floor(Math.random() * arr.length)];
}

/** Lokale Tür → Weltkoordinaten nach Offset + BJS-LH-Rotation. */
function worldDoor(door: DoorDefinition, offset: Vector3, rotY: number): DoorDefinition {
  const c = Math.cos(rotY), s = Math.sin(rotY);
  const p = door.position;
  const d = door.direction;
  return {
    id:        door.id,
    position:  new Vector3(p.x * c + p.z * s + offset.x, p.y, -p.x * s + p.z * c + offset.z),
    direction: new Vector3(d.x * c + d.z * s, d.y, -d.x * s + d.z * c),
  };
}

/**
 * Welche PlaceholderRoom-Wand soll der eingehenden Verbindung gegenüberliegen?
 * anchor.direction zeigt HERAUS aus dem Vorgänger-Raum/-Gang.
 * Der neue Raum muss ihn mit der gegenüberliegenden Tür empfangen.
 */
function doorWallForAnchor(dir: Vector3): DoorWall {
  const nx = Math.round(dir.x), nz = Math.round(dir.z);
  if (nz > 0) return 'south';
  if (nz < 0) return 'north';
  if (nx > 0) return 'west';
  return 'east';
}

// ── Raum-Parameter ────────────────────────────────────────────────────────────

const ROOM_WIDTHS:  readonly number[] = [6, 6, 9, 9, 9, 12];
const ROOM_DEPTHS:  readonly number[] = [6, 9, 9, 9, 12, 12];
const ROOM_HEIGHTS: readonly number[] = [2.5, 2.8, 2.8, 3.0, 3.2];
const CORR_DEPTHS:  readonly number[] = [9, 9, 9, 12, 12, 15];  // 3–5 Chunks

// Fallback-Größen für Sackgassen wenn große Räume nicht passen
const FALLBACK_SIZES: readonly [number, number][] = [[3, 6], [6, 3], [3, 3]];

const MAX_ROOMS = 35;
const MIN_ROOMS = 10;

// ── Generator ─────────────────────────────────────────────────────────────────

function tryGenerate(): LevelData {
  const placed:      PlacedRoom[]         = [];
  const aabbs:       AABB[]               = [];
  const mapData:     MinimapRoom[]         = [];
  const connections: MinimapConnection[]   = [];
  let   uid = 0;

  const tryAdd = (pr: PlacedRoom, mroom: MinimapRoom): boolean => {
    const aabb = roomAABB(pr.room, pr.offset, pr.rotation);
    if (!inBounds(aabb) || aabbs.some(b => overlaps(aabb, b))) return false;
    placed.push(pr);
    aabbs.push(aabb);
    mapData.push(mroom);
    return true;
  };

  // ── Start-Raum ────────────────────────────────────────────────────────────
  const sW = pick(ROOM_WIDTHS), sD = pick(ROOM_DEPTHS), sH = pick(ROOM_HEIGHTS);
  const startRoom = new PlaceholderRoom(`p${uid++}`, sW, sD, sH, 'north');
  tryAdd(
    { room: startRoom, offset: Vector3.Zero(), rotation: 0, isStart: true, isExit: false },
    { type: 'placeholder', cx: 0, cz: 0, localW: sW, localD: sD, rotY: 0 },
  );

  // ── Pfad-Stack ────────────────────────────────────────────────────────────
  interface StackItem {
    anchor:          DoorDefinition;
    stepsLeft:       number;
    isBranch:        boolean;
    sourceCorridor?: CorridorRoom;
    sourceDoorId?:   'north' | 'south' | 'branch_east' | 'branch_west';
  }

  const stack: StackItem[] = [{
    anchor:    worldDoor(startRoom.doors[0], Vector3.Zero(), 0),
    stepsLeft: 4,
    isBranch:  false,
  }];

  // Sackgasse platzieren — versucht normale Größen, dann Fallbacks
  const placeDeadEnd = (
    anchor:          DoorDefinition,
    isBranch        = false,
    sourceCorridor?: CorridorRoom,
    sourceDoorId?:   'north' | 'south' | 'branch_east' | 'branch_west',
  ): void => {
    const dw = doorWallForAnchor(anchor.direction);
    const H  = pick(ROOM_HEIGHTS);

    const tryRoom = (W: number, D: number): boolean => {
      const room      = new PlaceholderRoom(`p${uid++}`, W, D, H, dw);
      const entryDoor = room.doors.find(d => d.id === dw)!;
      const { offset, rotation } = computeConnection(anchor, entryDoor);
      if (!tryAdd(
        { room, offset, rotation, isStart: false, isExit: false },
        { type: 'placeholder', cx: offset.x, cz: offset.z, localW: W, localD: D, rotY: rotation },
      )) return false;
      connections.push({ x: anchor.position.x, z: anchor.position.z });
      return true;
    };

    for (let i = 0; i < 6; i++) {
      if (tryRoom(pick(ROOM_WIDTHS), pick(ROOM_DEPTHS))) return;
    }
    for (const [W, D] of FALLBACK_SIZES) {
      if (tryRoom(W, D)) return;
    }

    // Letzter Ausweg
    if (!isBranch && sourceCorridor && sourceDoorId) {
      // Korridor-Hauptpfad-Ende: Stirnwand im Korridor selbst einbauen
      if (sourceDoorId === 'north') sourceCorridor.closeNorth();
      else                          sourceCorridor.closeSouth();
      return;
    }

    // Seitlicher Abzweig: Nische setzen
    const cap     = new CapWallRoom(`cap${uid++}`);
    const capDoor = cap.doors[0];
    const { offset: capOff, rotation: capRot } = computeConnection(anchor, capDoor);
    const capPlaced = tryAdd(
      { room: cap, offset: capOff, rotation: capRot, isStart: false, isExit: false },
      { type: 'capwall', cx: capOff.x, cz: capOff.z, localW: 3, localD: 1, rotY: capRot },
    );
    if (!capPlaced && sourceCorridor) {
      // Auch Nische passt nicht (Raum-Geometrie blockiert den Abzweig) → Öffnung schließen
      if (sourceDoorId === 'branch_east') sourceCorridor.closeBranchEast();
      else if (sourceDoorId === 'branch_west') sourceCorridor.closeBranchWest();
    }
  };

  while (stack.length > 0 && placed.length < MAX_ROOMS) {
    const { anchor, stepsLeft, isBranch, sourceCorridor, sourceDoorId } = stack.pop()!;

    if (stepsLeft <= 0) {
      placeDeadEnd(anchor, isBranch, sourceCorridor, sourceDoorId);
      continue;
    }

    // Korridor platzieren — Raum entscheidet seine eigenen Parameter
    const D        = pick(CORR_DEPTHS);
    const corridor = new CorridorRoom(`c${uid++}`, { D });
    const south    = corridor.doors.find(d => d.id === 'south')!;
    const { offset, rotation } = computeConnection(anchor, south);

    if (tryAdd(
      { room: corridor, offset, rotation, isStart: false, isExit: false },
      { type: 'corridor', cx: offset.x, cz: offset.z, localW: 3, localD: D, rotY: rotation },
    )) {
      // Eintrittspunkt aufzeichnen (Süd-Durchbruch)
      connections.push({ x: anchor.position.x, z: anchor.position.z });

      // Nord-Ende: Pfad weiterführen
      const north = worldDoor(corridor.doors.find(d => d.id === 'north')!, offset, rotation);
      stack.push({ anchor: north, stepsLeft: stepsLeft - 1, isBranch: false,
                   sourceCorridor: corridor, sourceDoorId: 'north' });

      // Abzweige: frische Tiefe
      for (const door of corridor.doors) {
        if (door.id.startsWith('branch_')) {
          stack.push({
            anchor:         worldDoor(door, offset, rotation),
            stepsLeft:      pick([2, 2, 3, 4]),
            isBranch:       true,
            sourceCorridor: corridor,
            sourceDoorId:   door.id as 'branch_east' | 'branch_west',
          });
        }
      }
    } else {
      // Korridor passt nicht → direkt Sackgasse
      placeDeadEnd(anchor, isBranch, sourceCorridor, sourceDoorId);
    }
  }

  // Alle verbleibenden offenen Enden schließen
  while (stack.length > 0) {
    const { anchor, isBranch, sourceCorridor, sourceDoorId } = stack.pop()!;
    placeDeadEnd(anchor, isBranch, sourceCorridor, sourceDoorId);
  }

  return { rooms: placed, mapData, connections };
}

export function generateLevelFromBlueprint(_level: number): LevelData {
  let result: LevelData;
  do { result = tryGenerate(); } while (result.rooms.length < MIN_ROOMS);
  return result;
}
