import { Vector3 } from "@babylonjs/core";
import { Blueprint } from "../blueprint/Blueprint";
import { realizeBlueprintElements } from "../blueprint/Realizer";
import type { ElementType } from "../blueprint/types";
import type { PlacedRoom } from "./LevelGenerator";

// ── Maze-Grid ────────────────────────────────────────────────────────────────
//
//  Knoten: 8×8 Knotenpunkte im Chunk-Grid, je STEP=4 Chunks voneinander entfernt.
//  Korridor: 3 Chunks lang (STEP-1), 1 Chunk breit — verbindet je zwei Knoten.
//
//  Chunk-Layout:
//    col  0          = Knoten gx=0
//    cols 1–3        = N-S-Korridor oder leer
//    col  4          = Knoten gx=1
//    …
//    col 28          = Knoten gx=7
//
//  Weltkoordinaten-Versatz (→ GlobalFloor -45…+45, -10…+80):
//    BJS X = worldX + S/2 + OX   mit OX=-45
//    BJS Z = -(worldZ + S/2) + OZ mit OZ=80

const GX   = 8;    // Knotenraster Breite (Ost-West)
const GY   = 8;    // Knotenraster Höhe  (Nord-Süd)
const STEP = 4;    // Chunk-Abstand zwischen Knoten-Mittelpunkten
const OX   = -45;  // BJS-Weltversatz X
const OZ   =  80;  // BJS-Weltversatz Z

// Anteil der Nicht-Spanning-Tree-Kanten, der zusätzlich aktiviert wird (Schleifen).
const LOOP_FRACTION = 0.25;

// ── Hilfsfunktionen ───────────────────────────────────────────────────────────

function shuffle<T>(arr: T[]): T[] {
  for (let i = arr.length - 1; i > 0; i--) {
    const j = Math.floor(Math.random() * (i + 1));
    [arr[i], arr[j]] = [arr[j], arr[i]];
  }
  return arr;
}

// ── Phase 1: Labyrinth-Graph ─────────────────────────────────────────────────

interface Node {
  gx: number;
  gy: number;
  id: string;
  degree: number;  // Anzahl aktiver Verbindungen
}

function buildMazeGraph(): { nodes: Node[]; edges: [number, number][] } {
  const N = GX * GY;
  const nodes: Node[] = Array.from({ length: N }, (_, i) => ({
    gx: i % GX, gy: Math.floor(i / GX), id: `n_${i}`, degree: 0,
  }));

  // Alle möglichen Kanten (Horizontal & Vertikal)
  const allEdges: [number, number][] = [];
  for (let gy = 0; gy < GY; gy++) {
    for (let gx = 0; gx < GX; gx++) {
      const i = gy * GX + gx;
      if (gx + 1 < GX) allEdges.push([i, gy * GX + gx + 1]);  // Ost
      if (gy + 1 < GY) allEdges.push([i, (gy + 1) * GX + gx]); // Süd
    }
  }

  // Prim's Algorithmus: Zufälliger Spannbaum
  const inTree = new Set<number>([0]);
  const activeEdges: [number, number][] = [];
  const extraEdges:  [number, number][] = [];

  // Erstmal Spannbaum erstellen
  const edgeKey = (a: number, b: number) => `${Math.min(a, b)}-${Math.max(a, b)}`;
  const usedKeys = new Set<string>();

  while (inTree.size < N) {
    const frontier: [number, number][] = [];
    for (const [a, b] of allEdges) {
      if (inTree.has(a) !== inTree.has(b)) frontier.push([a, b]);
    }
    if (frontier.length === 0) break;
    const [a, b] = frontier[Math.floor(Math.random() * frontier.length)];
    activeEdges.push([a, b]);
    usedKeys.add(edgeKey(a, b));
    nodes[a].degree++;
    nodes[b].degree++;
    inTree.add(a);
    inTree.add(b);
  }

  // Zusätzliche Schleifen (LOOP_FRACTION der Nicht-Spannbaum-Kanten)
  const remaining = shuffle(allEdges.filter(([a, b]) => !usedKeys.has(edgeKey(a, b))));
  const nExtra    = Math.round(remaining.length * LOOP_FRACTION);
  for (let i = 0; i < nExtra; i++) {
    const [a, b] = remaining[i];
    extraEdges.push([a, b]);
    nodes[a].degree++;
    nodes[b].degree++;
  }

  return { nodes, edges: [...activeEdges, ...extraEdges] };
}

// ── Phase 2: Blueprint ────────────────────────────────────────────────────────

function buildBlueprint(nodes: Node[], edges: [number, number][]): Blueprint {
  const bp = new Blueprint();

  // Knoten platzieren (1×1 Chunk = 3m×3m Kreuzung oder Sackgasse)
  for (const node of nodes) {
    const col  = node.gx * STEP;
    const row  = node.gy * STEP;
    const type: ElementType = node.degree <= 1 ? 'placeholder' : 'junction';
    bp.place(node.id, type, col, row, 1, 1);
  }

  // Korridore zwischen Knoten, je einmal pro Kante
  const placed = new Set<string>();
  for (const [ai, bi] of edges) {
    const key = `${Math.min(ai, bi)}-${Math.max(ai, bi)}`;
    if (placed.has(key)) continue;
    placed.add(key);

    const a = nodes[ai], b = nodes[bi];
    const corrId = `c_${key}`;

    if (a.gx === b.gx) {
      // N-S-Korridor (gleiche Spalte)
      const topNode = a.gy < b.gy ? a : b;
      const botNode = a.gy < b.gy ? b : a;
      const col = topNode.gx * STEP;
      const row = topNode.gy * STEP + 1;
      bp.place(corrId, 'corridor', col, row, 1, STEP - 1);
      bp.connect(topNode.id, corrId);
      bp.connect(corrId, botNode.id);
    } else {
      // E-W-Korridor (gleiche Zeile)
      const leftNode  = a.gx < b.gx ? a : b;
      const rightNode = a.gx < b.gx ? b : a;
      const col = leftNode.gx * STEP + 1;
      const row = leftNode.gy * STEP;
      bp.place(corrId, 'corridor', col, row, STEP - 1, 1);
      bp.connect(leftNode.id, corrId);
      bp.connect(corrId, rightNode.id);
    }
  }

  return bp;
}

// ── Phase 3: PlacedRoom[] ─────────────────────────────────────────────────────

export function generateLevelFromBlueprint(_levelNumber: number): PlacedRoom[] {
  const { nodes, edges } = buildMazeGraph();
  const bp               = buildBlueprint(nodes, edges);

  const errors = bp.validate();
  if (errors.length > 0) {
    console.error('Blueprint-Fehler:', errors.map(e => e.message));
    return [];
  }

  const realized = bp.realize();
  const configs  = realizeBlueprintElements(realized, OX, OZ);

  // Start: am nächsten zur Weltmitte (gx=3,gy=3 ≈ Mitte des Rasters)
  const startGx = Math.floor(GX / 2) - 1;
  const startGy = Math.floor(GY / 2) - 1;
  const startNodeId = nodes.find(n => n.gx === startGx && n.gy === startGy)?.id ?? nodes[0].id;

  // Exit: am weitesten vom Startknoten entfernt (BFS auf Knoten-Graph)
  const exitNodeId = findFarthestNode(nodes, edges, startNodeId);

  // Konvertieren zu PlacedRoom[]
  const placed: PlacedRoom[] = configs.map(cfg => {
    const id = cfg.room.id;
    return {
      room:     cfg.room,
      offset:   cfg.offset,
      rotation: cfg.rotationY,
      isStart:  id === startNodeId,
      isExit:   id === exitNodeId,
    };
  });

  return placed;
}

// ── BFS: Farthest-Node ────────────────────────────────────────────────────────

function findFarthestNode(nodes: Node[], edges: [number, number][], startId: string): string {
  const idx = nodes.findIndex(n => n.id === startId);
  if (idx < 0) return nodes[nodes.length - 1].id;

  // Adjazenzliste nur aus Knoten (keine Korridore)
  const adj = new Map<number, number[]>();
  for (let i = 0; i < nodes.length; i++) adj.set(i, []);
  for (const [a, b] of edges) {
    adj.get(a)!.push(b);
    adj.get(b)!.push(a);
  }

  const dist = new Array(nodes.length).fill(-1);
  dist[idx]  = 0;
  const queue = [idx];
  let farthest = idx;

  while (queue.length > 0) {
    const cur = queue.shift()!;
    for (const nb of adj.get(cur)!) {
      if (dist[nb] < 0) {
        dist[nb] = dist[cur] + 1;
        queue.push(nb);
        if (dist[nb] > dist[farthest]) farthest = nb;
      }
    }
  }

  return nodes[farthest].id;
}
