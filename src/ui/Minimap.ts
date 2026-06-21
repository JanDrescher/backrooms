import type { MinimapRoom, MinimapConnection } from '../world/BlueprintGenerator';

const MAP_PX  = 300;
const PADDING = 8;

export class Minimap {
  private readonly ctx: CanvasRenderingContext2D;
  private rooms:       MinimapRoom[]       = [];
  private connections: MinimapConnection[] = [];
  private minX = 0; private maxX = 1;
  private minZ = 0; private maxZ = 1;
  private scale = 1;

  constructor(private readonly canvas: HTMLCanvasElement) {
    this.ctx     = canvas.getContext('2d')!;
    canvas.width = canvas.height = MAP_PX;
  }

  setMapData(rooms: MinimapRoom[], connections: MinimapConnection[] = []): void {
    this.rooms       = rooms;
    this.connections = connections;
    if (rooms.length === 0) return;

    let minX = Infinity, maxX = -Infinity, minZ = Infinity, maxZ = -Infinity;
    for (const r of rooms) {
      const odd = Math.abs(Math.round(r.rotY / (Math.PI / 2))) % 2 !== 0;
      const hw  = (odd ? r.localD : r.localW) / 2;
      const hd  = (odd ? r.localW : r.localD) / 2;
      minX = Math.min(minX, r.cx - hw);
      maxX = Math.max(maxX, r.cx + hw);
      minZ = Math.min(minZ, r.cz - hd);
      maxZ = Math.max(maxZ, r.cz + hd);
    }
    const margin = 4;
    this.minX = minX - margin; this.maxX = maxX + margin;
    this.minZ = minZ - margin; this.maxZ = maxZ + margin;
    const span = Math.max(this.maxX - this.minX, this.maxZ - this.minZ);
    this.scale = (MAP_PX - PADDING * 2) / span;
  }

  update(bjsX: number, bjsZ: number, tgX: number, tgZ: number): void {
    if (this.rooms.length === 0) return;

    const { ctx, canvas, scale, minX, maxZ } = this;
    const W = canvas.width, H = canvas.height;

    ctx.clearRect(0, 0, W, H);

    // 180°-Drehung: Süd oben (Spieler läuft bei Start nach oben)
    ctx.save();
    ctx.translate(W, H);
    ctx.rotate(Math.PI);

    // Hintergrund
    ctx.fillStyle = 'rgba(3,3,2,0.80)';
    rrect(ctx, 0, 0, W, H, 5);
    ctx.fill();

    // Räume — Chunk-Raster zeichnen
    const gap = Math.max(0.8, scale * 0.08);

    for (const r of this.rooms) {
      const odd    = Math.abs(Math.round(r.rotY / (Math.PI / 2))) % 2 !== 0;
      const worldW = odd ? r.localD : r.localW;
      const worldD = odd ? r.localW : r.localD;
      const cols   = Math.max(1, Math.round(worldW / 3));
      const rows   = Math.max(1, Math.round(worldD / 3));

      ctx.fillStyle   = r.type === 'corridor' ? '#362a10' : '#56431c';
      ctx.strokeStyle = '#8a6b2a';
      ctx.lineWidth   = 0.6;

      for (let c = 0; c < cols; c++) {
        for (let ro = 0; ro < rows; ro++) {
          const wx0 = r.cx - worldW / 2 + c * 3;
          const wz1 = r.cz - worldD / 2 + (ro + 1) * 3;  // nördliche Kante des Chunks
          const px  = PADDING + (wx0 - minX) * scale + gap / 2;
          const py  = PADDING + (maxZ - wz1) * scale + gap / 2;
          const cs  = 3 * scale - gap;
          ctx.fillRect(px, py, cs, cs);
          ctx.strokeRect(px + 0.3, py + 0.3, cs - 0.6, cs - 0.6);
        }
      }
    }

    // Verbindungspunkte (Türen / Durchbrüche)
    ctx.fillStyle = '#f0d060';
    const dotR = Math.max(1.5, scale * 0.8);
    for (const c of this.connections) {
      const cx2 = PADDING + (c.x - minX) * scale;
      const cy2 = PADDING + (maxZ - c.z) * scale;
      ctx.beginPath();
      ctx.arc(cx2, cy2, dotR, 0, Math.PI * 2);
      ctx.fill();
    }

    // Rahmen
    ctx.strokeStyle = '#5a4820';
    ctx.lineWidth   = 1;
    rrect(ctx, 0.5, 0.5, W - 1, H - 1, 5);
    ctx.stroke();

    // Spielerposition
    const ppx = PADDING + (bjsX - minX) * scale;
    const ppy = PADDING + (maxZ - bjsZ) * scale;

    // Blickrichtung: +X = Ost = rechts im Canvas, +Z = Nord = oben im Canvas (−Y)
    const dxBJS = tgX - bjsX;
    const dzBJS = tgZ - bjsZ;
    const dlen  = Math.hypot(dxBJS, dzBJS) || 1;
    const arLen = Math.max(5, scale * 4);
    const canDX = (dxBJS / dlen) * arLen;
    const canDY = -(dzBJS / dlen) * arLen;

    // Chevron-Pfeil
    const angle   = Math.atan2(canDY, canDX);
    const tipLen  = Math.max(5, scale * 3.5);
    const backLen = tipLen * 0.62;
    const spread  = 0.80;
    const notch   = tipLen * 0.20;

    const tipX = ppx + Math.cos(angle) * tipLen;
    const tipY = ppy + Math.sin(angle) * tipLen;
    const lX   = ppx + Math.cos(angle + Math.PI - spread) * backLen;
    const lY   = ppy + Math.sin(angle + Math.PI - spread) * backLen;
    const rX   = ppx + Math.cos(angle + Math.PI + spread) * backLen;
    const rY   = ppy + Math.sin(angle + Math.PI + spread) * backLen;
    const nX   = ppx - Math.cos(angle) * notch;
    const nY   = ppy - Math.sin(angle) * notch;

    ctx.beginPath();
    ctx.moveTo(tipX, tipY);
    ctx.lineTo(lX, lY);
    ctx.lineTo(nX, nY);
    ctx.lineTo(rX, rY);
    ctx.closePath();
    ctx.fillStyle   = '#fff8d0';
    ctx.fill();
    ctx.strokeStyle = 'rgba(0,0,0,0.4)';
    ctx.lineWidth   = 0.8;
    ctx.stroke();

    ctx.restore();
  }
}

function rrect(ctx: CanvasRenderingContext2D, x: number, y: number, w: number, h: number, r: number): void {
  ctx.beginPath();
  ctx.moveTo(x + r, y);
  ctx.lineTo(x + w - r, y);
  ctx.quadraticCurveTo(x + w, y,     x + w, y + r);
  ctx.lineTo(x + w, y + h - r);
  ctx.quadraticCurveTo(x + w, y + h, x + w - r, y + h);
  ctx.lineTo(x + r, y + h);
  ctx.quadraticCurveTo(x,     y + h, x,     y + h - r);
  ctx.lineTo(x, y + r);
  ctx.quadraticCurveTo(x,     y,     x + r, y);
  ctx.closePath();
}
