import type {
  CardinalDir, ElementType, GridRect,
  PlacedElement, RealizedElement, ValidationError,
} from './types';

const CHUNK_SIZE = 3; // Meter pro Chunk

export class Blueprint {
  private readonly elements = new Map<string, PlacedElement>();

  /**
   * Element ins Chunk-Grid einzeichnen.
   * Wirft einen Fehler wenn die ID bereits vergeben ist.
   * Gibt `this` zurück → fluent chaining.
   */
  place(id: string, type: ElementType, col: number, row: number, cols: number, rows: number): this {
    if (this.elements.has(id))
      throw new Error(`Blueprint: '${id}' ist bereits platziert`);
    this.elements.set(id, { id, type, rect: { col, row, cols, rows }, openings: [] });
    return this;
  }

  /**
   * Zwei Elemente über ihre gemeinsame Chunk-Kante verbinden.
   * Jedes Element erhält eine Opening auf der entsprechenden Wand.
   * Wirft einen Fehler wenn die Elemente keine gemeinsame Kante haben.
   */
  connect(idA: string, idB: string): this {
    const a = this.elements.get(idA);
    const b = this.elements.get(idB);
    if (!a) throw new Error(`Blueprint.connect: unbekanntes Element '${idA}'`);
    if (!b) throw new Error(`Blueprint.connect: unbekanntes Element '${idB}'`);

    const edge = findSharedEdge(a.rect, b.rect);
    if (!edge)
      throw new Error(`Blueprint.connect: '${idA}' und '${idB}' teilen keine Chunk-Kante`);

    a.openings.push({ dir: edge.dirA, offset: edge.offsetA });
    b.openings.push({ dir: edge.dirB, offset: edge.offsetB });
    return this;
  }

  /**
   * Prüft das Blueprint auf Konsistenz.
   * Gibt alle Fehler zurück (leeres Array = valide).
   */
  validate(): ValidationError[] {
    const errors: ValidationError[] = [];
    const occupied = new Map<string, string>(); // "col,row" → Element-ID

    for (const el of this.elements.values()) {
      const { col, row, cols, rows } = el.rect;
      for (let c = col; c < col + cols; c++) {
        for (let r = row; r < row + rows; r++) {
          const key = `${c},${r}`;
          const owner = occupied.get(key);
          if (owner) {
            errors.push({ message: `Chunk (${c},${r}) doppelt belegt: '${owner}' und '${el.id}'` });
          } else {
            occupied.set(key, el.id);
          }
        }
      }
    }
    return errors;
  }

  /**
   * Validiert und konvertiert das Grid in Weltkoordinaten.
   * Wirft wenn das Blueprint nicht konsistent ist.
   * Erst dann darf die 3D-Umsetzung beginnen.
   */
  realize(): RealizedElement[] {
    const errors = this.validate();
    if (errors.length > 0)
      throw new Error('Blueprint nicht valide:\n' + errors.map(e => '  ' + e.message).join('\n'));

    return [...this.elements.values()].map(el => ({
      id:       el.id,
      type:     el.type,
      worldX:   el.rect.col * CHUNK_SIZE,
      worldZ:   el.rect.row * CHUNK_SIZE,
      cols:     el.rect.cols,
      rows:     el.rect.rows,
      openings: [...el.openings],
    }));
  }
}

// ─── Hilfsfunktionen ─────────────────────────────────────────────────────────

interface EdgeResult {
  dirA:    CardinalDir;
  dirB:    CardinalDir;
  offsetA: number;
  offsetB: number;
}

function findSharedEdge(a: GridRect, b: GridRect): EdgeResult | null {
  // A-Ost trifft B-West
  if (a.col + a.cols === b.col) {
    const seg = rowOverlap(a, b);
    if (seg) return { dirA: 'E', dirB: 'W', offsetA: seg.mid - a.row, offsetB: seg.mid - b.row };
  }
  // A-West trifft B-Ost
  if (b.col + b.cols === a.col) {
    const seg = rowOverlap(a, b);
    if (seg) return { dirA: 'W', dirB: 'E', offsetA: seg.mid - a.row, offsetB: seg.mid - b.row };
  }
  // A-Süd trifft B-Nord
  if (a.row + a.rows === b.row) {
    const seg = colOverlap(a, b);
    if (seg) return { dirA: 'S', dirB: 'N', offsetA: seg.mid - a.col, offsetB: seg.mid - b.col };
  }
  // A-Nord trifft B-Süd
  if (b.row + b.rows === a.row) {
    const seg = colOverlap(a, b);
    if (seg) return { dirA: 'N', dirB: 'S', offsetA: seg.mid - a.col, offsetB: seg.mid - b.col };
  }
  return null;
}

function rowOverlap(a: GridRect, b: GridRect) {
  const start = Math.max(a.row, b.row);
  const end   = Math.min(a.row + a.rows, b.row + b.rows);
  return end > start ? { mid: Math.floor((start + end) / 2) } : null;
}

function colOverlap(a: GridRect, b: GridRect) {
  const start = Math.max(a.col, b.col);
  const end   = Math.min(a.col + a.cols, b.col + b.cols);
  return end > start ? { mid: Math.floor((start + end) / 2) } : null;
}
