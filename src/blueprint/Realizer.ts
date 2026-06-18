import { Vector3 } from "@babylonjs/core";
import type { RealizedElement, CardinalDir, ElementType } from "./types";
import { PlaceholderRoom, type DoorWall } from "../rooms/PlaceholderRoom";
import { CorridorRoom } from "../rooms/CorridorRoom";
import type { IRoom } from "../rooms/IRoom";

const CHUNK  = 3;   // Meter pro Chunk
const T_WALL = 0.2; // Wandstärke (identisch zu PlaceholderRoom/CorridorRoom T)

export interface RoomConfig {
  room:      IRoom;
  offset:    Vector3;
  rotationY: number;
}

/**
 * Übersetzt einen validierten Blueprint (RealizedElement[]) in Rauminstanzen
 * mit Weltkoordinaten.
 *
 * Koordinaten-Konvention (BJS Left-Handed, +Z = Nord, +X = Ost):
 *   Blueprint col+ (Papier-Ost)  →  BJS +X (visuell rechts = Ost)
 *   Blueprint row+ (Papier-Süd)  →  BJS −Z (visuell tiefer  = Süd)
 */
export function realizeBlueprintElements(elements: RealizedElement[]): RoomConfig[] {
  return elements.map(el => {
    switch (el.type) {
      case 'placeholder': return realizePlaceholder(el);
      case 'corridor':    return realizeCorridor(el);
      case 'junction':    return realizeJunction(el);
    }
  });
}

// ─── Wand-Versatz ────────────────────────────────────────────────────────────
//
// Wände ragen T über die Chunk-Grenze hinaus.  Für jede Öffnung, hinter der
// eine physische Wand sitzt, wird das Element um T von der Grenze weggerückt,
// damit Außenfläche = Chunk-Grenze (kein Durchdringen).
//
// Korridor-ENDEN sind offen (keine Wand) → kein Versatz.
// Korridor-SEITENabzweige haben Seitenwände  → Versatz nötig.
//
// Richtung im BJS-Weltkoordinatensystem (+X = Ost, +Z = Nord):
//   'N' → offene Nordwand (+Z); Boden-Nordende an Chunk-Grenze → Δz −T
//   'S' → offene Südwand (−Z); Boden-Südende  an Chunk-Grenze → Δz +T
//   'E' → weg von +X = Δx −T   'W' → weg von −X = Δx +T

function wallShift(
  openings: { dir: CardinalDir }[],
  type:     ElementType,
): { dx: number; dz: number } {
  // Nur PlaceholderRooms/Junctions haben Vollwände die T aus dem Chunk-Bereich ragen.
  // Korridore haben offene Enden — dort entsteht kein echter Raumdurchdrang.
  if (type !== 'placeholder' && type !== 'junction') return { dx: 0, dz: 0 };

  let dx = 0, dz = 0;
  for (const o of openings) {
    switch (o.dir) {
      case 'N': dz -= T_WALL; break;
      case 'S': dz += T_WALL; break;
      case 'E': dx -= T_WALL; break;
      case 'W': dx += T_WALL; break;
    }
  }
  return { dx, dz };
}

// ─── Raumtypen ────────────────────────────────────────────────────────────────

function realizePlaceholder(el: RealizedElement): RoomConfig {
  const W = el.cols * CHUNK;
  const D = el.rows * CHUNK;

  if (el.openings.length > 1)
    throw new Error(`Realizer: '${el.id}' hat ${el.openings.length} Öffnungen — Placeholder unterstützt nur 1`);

  const opening    = el.openings[0];
  const doorWall   = opening ? dirToDoorWall(opening.dir) : 'north';
  const doorSegIdx = opening
    ? adjustedSegIdx(opening.dir, opening.offset, el.cols, el.rows)
    : undefined;

  const { dx, dz } = wallShift(el.openings, el.type);
  return {
    room:      new PlaceholderRoom(el.id, W, D, 2.8, doorWall, doorSegIdx),
    offset:    new Vector3(el.worldX + W / 2 + dx, 0, -(el.worldZ + D / 2) + dz),
    rotationY: 0,
  };
}

function realizeCorridor(el: RealizedElement): RoomConfig {
  const isNS = el.cols === 1;

  if (isNS) {
    // ── N-S-Korridor ──────────────────────────────────────────────────────────
    const D = el.rows * CHUNK;
    const branchE = el.openings.find(o => o.dir === 'E');
    const branchW = el.openings.find(o => o.dir === 'W');

    const { dx, dz } = wallShift(el.openings, el.type);
    return {
      room: new CorridorRoom(el.id, {
        D,
        branchSide:    branchSideNS(branchE, branchW),
        branchSegEast: branchE ? el.rows - 1 - branchE.offset : undefined,
        branchSegWest: branchW ? el.rows - 1 - branchW.offset : undefined,
      }),
      offset:    new Vector3(el.worldX + CHUNK / 2 + dx, 0, -(el.worldZ + D / 2) + dz),
      rotationY: 0,
    };
  } else {
    // ── E-W-Korridor (rows=1, rotiert um +π/2) ───────────────────────────────
    // Nach Rotation +π/2 und Z-Negierung (+Z = Nord):
    //   CorridorRoom-Nordende (lokal +Z) → Welt +X (= Blueprint-'E'-Ende, Ost)
    //   CorridorRoom-Südende  (lokal −Z) → Welt −X (= Blueprint-'W'-Ende, West)
    //   Branch 'N' → CorridorRoom "west" (local −X → nach Rot. Welt +Z = Nord)
    //   Branch 'S' → CorridorRoom "east" (local +X → nach Rot. Welt −Z = Süd)
    const D = el.cols * CHUNK;
    const branchN = el.openings.find(o => o.dir === 'N');
    const branchS = el.openings.find(o => o.dir === 'S');

    const { dx, dz } = wallShift(el.openings, el.type);
    return {
      room: new CorridorRoom(el.id, {
        D,
        branchSide:    branchSideEW(branchN, branchS),
        branchSegEast: branchS?.offset,
        branchSegWest: branchN?.offset,
      }),
      offset:    new Vector3(el.worldX + D / 2 + dx, 0, -(el.worldZ + CHUNK / 2) + dz),
      rotationY: Math.PI / 2,
    };
  }
}

function realizeJunction(el: RealizedElement): RoomConfig {
  const W = el.cols * CHUNK;
  const D = el.rows * CHUNK;
  const opening = el.openings[0];
  const doorSegIdx = opening
    ? adjustedSegIdx(opening.dir, opening.offset, el.cols, el.rows)
    : undefined;
  const { dx, dz } = wallShift(el.openings, el.type);
  return {
    room:      new PlaceholderRoom(el.id, W, D, 2.8,
                 opening ? dirToDoorWall(opening.dir) : 'north',
                 doorSegIdx),
    offset:    new Vector3(el.worldX + W / 2 + dx, 0, -(el.worldZ + D / 2) + dz),
    rotationY: 0,
  };
}

// ─── Hilfsfunktionen ─────────────────────────────────────────────────────────

const DIR_TO_DOORWALL: Record<CardinalDir, DoorWall> = {
  N: 'north', S: 'south', E: 'east', W: 'west',
};

function dirToDoorWall(dir: CardinalDir): DoorWall {
  return DIR_TO_DOORWALL[dir];
}

/**
 * Korrigiert den Blueprint-Offset zum PlaceholderRoom-doorSegIdx.
 *
 * Mit korrekter BJS-X-Konvention (+X = Ost) und den neuen Pivot-Rotationen:
 *
 *  'N' (pivotRotY=π):    Pivot kehrt X um → flip mit cols
 *  'S' (pivotRotY=0):    kanonisch-X → lokal-X → kein flip
 *  'E' (pivotRotY=−π/2): Z-Negierung kehrt Z-Richtung um → flip mit rows
 *  'W' (pivotRotY=+π/2): Z-Negierung + Pivot heben sich auf → kein flip
 */
function adjustedSegIdx(
  dir: CardinalDir, offset: number, cols: number, rows: number,
): number {
  switch (dir) {
    case 'N': return (cols - 1) - offset;
    case 'E': return (rows - 1) - offset;
    default:  return offset; // 'S' und 'W': kein flip
  }
}

type Opening = { offset: number };

function branchSideNS(
  east: Opening | undefined,
  west: Opening | undefined,
): "east" | "west" | "both" | null {
  if (east && west) return "both";
  if (east)         return "east";
  if (west)         return "west";
  return null;
}

function branchSideEW(
  north: Opening | undefined,
  south: Opening | undefined,
): "east" | "west" | "both" | null {
  if (north && south) return "both";
  if (north)          return "west";  // 'N' → CorridorRoom "west" (local −X → Welt +Z = Nord)
  if (south)          return "east";  // 'S' → CorridorRoom "east" (local +X → Welt −Z = Süd)
  return null;
}
