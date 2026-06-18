export type ElementType = 'placeholder' | 'corridor' | 'junction';
export type CardinalDir  = 'N' | 'S' | 'E' | 'W';

/** Rechteck im Chunk-Grid (Einheit: Chunks, nicht Meter). */
export interface GridRect {
  col:  number;   // linke Spalte (0-basiert)
  row:  number;   // obere Zeile  (0-basiert)
  cols: number;   // Breite in Chunks
  rows: number;   // Höhe  in Chunks
}

/**
 * Eine Öffnung (Tür bei Räumen, Durchbruch bei Korridoren) auf einer Wand.
 *
 * offset = Chunk-Index entlang der Wand, gezählt von der NW-Ecke:
 *   N / S-Wand:  0 = Westende … cols-1 = Ostende
 *   E / W-Wand:  0 = Nordende … rows-1 = Südende
 */
export interface Opening {
  dir:    CardinalDir;
  offset: number;
}

export interface PlacedElement {
  id:       string;
  type:     ElementType;
  rect:     GridRect;
  openings: Opening[];
}

/** Ausgabe von Blueprint.realize() — bereit für die 3D-Umsetzung. */
export interface RealizedElement {
  id:       string;
  type:     ElementType;
  /** BJS-Weltkoordinate der NW-Ecke (col * CHUNK_SIZE). */
  worldX:   number;
  /** BJS-Weltkoordinate der NW-Ecke (row * CHUNK_SIZE). */
  worldZ:   number;
  cols:     number;
  rows:     number;
  openings: Opening[];
}

export interface ValidationError {
  message: string;
}
