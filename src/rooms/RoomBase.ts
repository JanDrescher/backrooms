import {
  MeshBuilder,
  StandardMaterial,
  DynamicTexture,
  Texture,
  Color3,
  Vector3,
  TransformNode,
  PointLight,
  type Light,
  type Scene,
  type AbstractMesh,
} from "@babylonjs/core";
import type { IRoom, DoorDefinition } from "./IRoom";
import type { IInteractable } from "../engine/IInteractable";
import { NeonHum } from "../audio/NeonHum";
import { FlickerEffect } from "../effects/FlickerLamp";

export abstract class RoomBase implements IRoom {
  abstract readonly id: string;
  abstract readonly doors: DoorDefinition[];
  abstract readonly spawnPoint: Vector3;

  readonly interactables: IInteractable[]  = [];
  worldOffset: Vector3                     = Vector3.Zero();
  protected meshes:       AbstractMesh[]   = [];
  protected lights:       Light[]          = [];
  protected nodes:        TransformNode[]  = [];
  protected humLocalPos:     Vector3 | null      = null;
  protected flickerLocalPos: Vector3 | null      = null;
  protected flickerLampMesh: AbstractMesh | null = null;
  private   neonHum:         NeonHum | null      = null;
  private   flickerEffect:   FlickerEffect | null = null;

  // Physikalische Kachelgröße Wandtapete — geteilt von allen Raumtypen
  protected static readonly TILE_W = 0.175; // m horizontal
  protected static readonly TILE_H = 0.386; // m vertikal

  async load(scene: Scene, worldOffset = Vector3.Zero(), rotationY = 0): Promise<void> {
    this.worldOffset = worldOffset;
    await this.buildGeometry(scene);

    // Pivot-TransformNode für Rotation + Versatz aller Meshes/Nodes.
    // Babylon.js wendet seine eigene Rotationskonvention intern an —
    // kein manuelles mesh.rotation.y nötig.
    const pivot = new TransformNode(`${this.id}_pivot`, scene);
    pivot.rotation.y = rotationY;
    pivot.position   = worldOffset.clone();
    this.nodes.push(pivot);

    for (const m of this.meshes) if (!m.parent) m.parent = pivot;
    for (const n of this.nodes)  if (n !== pivot && !n.parent) n.parent = pivot;

    // Türen, Lichter, Interactables, SpawnPoint manuell transformieren
    // (keine Babylon-Szenenobjekte mit Parent-Transform-Unterstützung)
    if (rotationY !== 0) {
      for (const l of this.lights)        if (l instanceof PointLight) l.position = RoomBase.rotY(l.position, rotationY);
      for (const i of this.interactables) i.position = RoomBase.rotY(i.position, rotationY);
      for (const d of this.doors)         { d.position = RoomBase.rotY(d.position, rotationY); d.direction = RoomBase.rotY(d.direction, rotationY); }
      const rsp = RoomBase.rotY(this.spawnPoint, rotationY);
      this.spawnPoint.x = rsp.x;
      this.spawnPoint.z = rsp.z;
    }
    if (worldOffset.x !== 0 || worldOffset.y !== 0 || worldOffset.z !== 0) {
      for (const l of this.lights)        if (l instanceof PointLight) l.position.addInPlace(worldOffset);
      for (const i of this.interactables) i.position.addInPlace(worldOffset);
      for (const d of this.doors)         d.position.addInPlace(worldOffset);
    }

    // PointLichter auf Raum-eigene Meshes beschränken — hält maxSimultaneousLights klein,
    // egal wie viele Räume im Komplex existieren.
    for (const l of this.lights) {
      if (l instanceof PointLight) l.includedOnlyMeshes = [...this.meshes];
    }

    // NeonHum: Brumm-Quelle an einer Lampe (Weltkoordinaten nach Rotation + Offset)
    if (this.humLocalPos) {
      let wp = this.humLocalPos.clone();
      if (rotationY !== 0) wp = RoomBase.rotY(wp, rotationY);
      wp.addInPlace(worldOffset);
      this.neonHum = new NeonHum(wp.x, wp.y, wp.z);
      this.neonHum.start();
    }

    // FlickerEffect: flackernde Lampe + nächstgelegenes PointLight
    if (this.flickerLampMesh && this.flickerLocalPos) {
      let wp = this.flickerLocalPos.clone();
      if (rotationY !== 0) wp = RoomBase.rotY(wp, rotationY);
      wp.addInPlace(worldOffset);

      let nearest: PointLight | null = null;
      let nearestDist = Infinity;
      for (const l of this.lights) {
        if (l instanceof PointLight) {
          const d = Vector3.Distance(l.position, wp);
          if (d < nearestDist) { nearestDist = d; nearest = l; }
        }
      }
      if (nearest) this.flickerEffect = new FlickerEffect(this.flickerLampMesh, nearest, wp);
    }
  }

  // Rotiert einen Vektor um die Y-Achse (LH: x'=x·c−z·s, z'=x·s+z·c)
  protected static rotY(v: Vector3, a: number): Vector3 {
    const c = Math.cos(a), s = Math.sin(a);
    return new Vector3(v.x * c - v.z * s, v.y, v.x * s + v.z * c);
  }

  unload(): void {
    this.neonHum?.stop();
    this.neonHum = null;
    this.flickerEffect?.dispose();
    this.flickerEffect = null;
    for (const m of this.meshes) m.dispose();
    for (const l of this.lights) l.dispose();
    for (const n of this.nodes)  n.dispose();
    this.meshes = [];
    this.lights = [];
    this.nodes  = [];
  }

  protected abstract buildGeometry(scene: Scene): Promise<void>;

  /** Kollisions-Mesh registrieren. */
  protected track<T extends AbstractMesh>(mesh: T): T {
    mesh.checkCollisions = true;
    this.meshes.push(mesh);
    return mesh;
  }

  /** Dekoratives Mesh registrieren (keine Kollision). */
  protected prop<T extends AbstractMesh>(mesh: T): T {
    this.meshes.push(mesh);
    return mesh;
  }

  /** TransformNode registrieren — wird beim unload() entfernt. */
  protected trackNode<T extends TransformNode>(node: T): T {
    this.nodes.push(node);
    return node;
  }

  /** Lichtquelle registrieren — wird beim unload() entfernt. */
  protected trackLight<T extends Light>(light: T): T {
    this.lights.push(light);
    return light;
  }

  protected mat(scene: Scene, name: string, color: Color3): StandardMaterial {
    const m = new StandardMaterial(`${this.id}_mat_${name}`, scene);
    m.diffuseColor          = color;
    m.specularColor         = Color3.Black();
    m.maxSimultaneousLights = 6;
    return m;
  }

  // ── Gemeinsame Textur-Builder ────────────────────────────────────────────

  protected buildWallpaperTexture(scene: Scene, id: string, uScale: number, vScale: number): DynamicTexture {
    const SIZE = 256;
    const HALF = SIZE / 2;
    const tex  = new DynamicTexture(`${this.id}_wallpaper_${id}`, { width: SIZE, height: SIZE }, scene, true);
    const ctx  = tex.getContext() as CanvasRenderingContext2D;

    ctx.fillStyle = '#cac67e';
    ctx.fillRect(0, 0, SIZE, SIZE);

    for (let i = 0; i < 3000; i++) {
      const x = Math.random() * SIZE;
      const y = Math.random() * SIZE;
      const v = 192 + Math.floor(Math.random() * 18);
      ctx.fillStyle = `rgba(${v},${Math.floor(v * 0.96)},${Math.floor(v * 0.62)},0.25)`;
      ctx.fillRect(Math.floor(x), Math.floor(y), 1, 1);
    }

    const r = HALF - 6;
    const diamond = (cx: number, cy: number) => {
      ctx.beginPath();
      ctx.moveTo(cx,     cy - r);
      ctx.lineTo(cx + r, cy    );
      ctx.lineTo(cx,     cy + r);
      ctx.lineTo(cx - r, cy    );
      ctx.closePath();
    };
    ctx.strokeStyle = '#a8a462';
    ctx.lineWidth   = 1.2;
    diamond(HALF, HALF); ctx.stroke();
    diamond(0,    0   ); ctx.stroke();
    diamond(SIZE, 0   ); ctx.stroke();
    diamond(0,    SIZE); ctx.stroke();
    diamond(SIZE, SIZE); ctx.stroke();

    const innerR = 14;
    const dot = (cx: number, cy: number) => {
      ctx.beginPath();
      ctx.moveTo(cx,          cy - innerR);
      ctx.lineTo(cx + innerR, cy         );
      ctx.lineTo(cx,          cy + innerR);
      ctx.lineTo(cx - innerR, cy         );
      ctx.closePath();
      ctx.stroke();
    };
    ctx.strokeStyle = '#b0ac6a';
    ctx.lineWidth   = 0.8;
    dot(HALF, HALF);
    dot(HALF, 0   ); dot(HALF, SIZE);
    dot(0,    HALF); dot(SIZE, HALF);

    tex.update();
    tex.wrapU  = Texture.WRAP_ADDRESSMODE;
    tex.wrapV  = Texture.WRAP_ADDRESSMODE;
    tex.uScale = uScale;
    tex.vScale = vScale;
    return tex;
  }

  protected buildCeilingTileTexture(scene: Scene): { diffuse: DynamicTexture; bump: DynamicTexture } {
    const SIZE   = 256;
    const GROOVE = 5;

    const diffuse = new DynamicTexture(`${this.id}_ceil_diff`, { width: SIZE, height: SIZE }, scene, true);
    const dCtx    = diffuse.getContext() as CanvasRenderingContext2D;
    dCtx.fillStyle = '#e2deb0';
    dCtx.fillRect(0, 0, SIZE, SIZE);
    for (let i = 0; i < 4000; i++) {
      const x = Math.random() * SIZE;
      const y = Math.random() * SIZE;
      const v = 200 + Math.floor(Math.random() * 18);
      dCtx.fillStyle = `rgb(${Math.floor(v * 0.98)},${Math.floor(v * 0.96)},${Math.floor(v * 0.68)})`;
      dCtx.fillRect(Math.floor(x), Math.floor(y), 2, 2);
    }
    dCtx.fillStyle = '#beba88';
    dCtx.fillRect(0,             0,             GROOVE, SIZE);
    dCtx.fillRect(SIZE - GROOVE, 0,             GROOVE, SIZE);
    dCtx.fillRect(0,             0,             SIZE,   GROOVE);
    dCtx.fillRect(0,             SIZE - GROOVE, SIZE,   GROOVE);
    diffuse.update();
    diffuse.wrapU = Texture.WRAP_ADDRESSMODE;
    diffuse.wrapV = Texture.WRAP_ADDRESSMODE;

    const bump = new DynamicTexture(`${this.id}_ceil_bump`, { width: SIZE, height: SIZE }, scene, true);
    const bCtx = bump.getContext() as CanvasRenderingContext2D;
    bCtx.fillStyle = 'rgb(128,128,255)';
    bCtx.fillRect(0, 0, SIZE, SIZE);
    const G = GROOVE + 6;
    for (const e of [
      { gx0:0,      gy0:0, gx1:G,    gy1:0,    rx:0,      ry:0,      rw:G,    rh:SIZE, from:'rgb(172,128,210)', to:'rgb(128,128,255)' },
      { gx0:SIZE-G, gy0:0, gx1:SIZE, gy1:0,    rx:SIZE-G, ry:0,      rw:G,    rh:SIZE, from:'rgb(128,128,255)', to:'rgb(84,128,210)'  },
      { gx0:0,      gy0:0, gx1:0,    gy1:G,    rx:0,      ry:0,      rw:SIZE, rh:G,    from:'rgb(128,172,210)', to:'rgb(128,128,255)' },
      { gx0:0, gy0:SIZE-G, gx1:0,    gy1:SIZE, rx:0,      ry:SIZE-G, rw:SIZE, rh:G,    from:'rgb(128,128,255)', to:'rgb(128,84,210)'  },
    ]) {
      const g = bCtx.createLinearGradient(e.gx0, e.gy0, e.gx1, e.gy1);
      g.addColorStop(0, e.from);
      g.addColorStop(1, e.to);
      bCtx.fillStyle = g;
      bCtx.fillRect(e.rx, e.ry, e.rw, e.rh);
    }
    bump.update();
    bump.wrapU = Texture.WRAP_ADDRESSMODE;
    bump.wrapV = Texture.WRAP_ADDRESSMODE;

    return { diffuse, bump };
  }

  protected buildCarpetTexture(scene: Scene): DynamicTexture {
    const SIZE = 512;
    const TILE = 32;
    const tex  = new DynamicTexture(`${this.id}_carpet`, { width: SIZE, height: SIZE }, scene, true);
    const ctx  = tex.getContext() as CanvasRenderingContext2D;
    const cols = SIZE / TILE;

    ctx.fillStyle = "#989460";
    ctx.fillRect(0, 0, SIZE, SIZE);

    for (let i = 0; i < cols; i++) {
      for (let j = 0; j < cols; j++) {
        const x = i * TILE, y = j * TILE;
        ctx.fillStyle = (i + j) % 2 === 0 ? "#a29e6a" : "#8c8858";
        ctx.fillRect(x + 1, y + 1, TILE - 2, TILE - 2);
        const cx = x + TILE / 2, cy = y + TILE / 2, r = TILE * 0.30;
        ctx.fillStyle = "#a09c64";
        ctx.beginPath();
        ctx.moveTo(cx, cy - r); ctx.lineTo(cx + r, cy);
        ctx.lineTo(cx, cy + r); ctx.lineTo(cx - r, cy);
        ctx.closePath(); ctx.fill();
        ctx.fillStyle = "#747060";
        ctx.beginPath();
        ctx.arc(cx, cy, r * 0.35, 0, Math.PI * 2);
        ctx.fill();
      }
    }

    tex.update();
    tex.wrapU = Texture.WRAP_ADDRESSMODE;
    tex.wrapV = Texture.WRAP_ADDRESSMODE;
    return tex;
  }

  protected buildFloorGrime(scene: Scene, width: number, depth: number): void {
    const SIZE = 512;
    const tex  = new DynamicTexture(`${this.id}_floor_grime`, { width: SIZE, height: SIZE }, scene, false);
    tex.hasAlpha = true;
    const ctx  = tex.getContext() as CanvasRenderingContext2D;
    ctx.clearRect(0, 0, SIZE, SIZE);

    for (let i = 0; i < 7; i++) {
      const cx = Math.random() * SIZE, cy = Math.random() * SIZE;
      const r  = SIZE * (0.38 + Math.random() * 0.30);
      const a  = 0.03 + Math.random() * 0.05;
      const rgb = Math.random() < 0.75 ? '22,18,6' : '200,192,130';
      const g  = ctx.createRadialGradient(cx, cy, 0, cx, cy, r);
      g.addColorStop(0, `rgba(${rgb},${a})`);
      g.addColorStop(1, `rgba(${rgb},0)`);
      ctx.fillStyle = g;
      ctx.beginPath(); ctx.arc(cx, cy, r, 0, Math.PI * 2); ctx.fill();
    }

    const stainPos: Array<{ x: number; y: number }> = [];
    const MIN_DIST = SIZE * 0.30;
    for (let i = 0; i < 3; i++) {
      let cx = 0, cy = 0, tries = 0;
      do {
        cx = SIZE * Math.random();
        cy = SIZE * Math.random();
        tries++;
      } while (tries < 50 && stainPos.some(p => Math.hypot(p.x - cx, p.y - cy) < MIN_DIST));
      stainPos.push({ x: cx, y: cy });

      const r    = SIZE * (0.28 + Math.random() * 0.32);
      const a    = 0.08 + Math.random() * 0.08;
      const nPts = 7 + Math.floor(Math.random() * 4);
      const pts  = Array.from({ length: nPts }, (_, k) => {
        const theta = (k / nPts) * Math.PI * 2 + (Math.random() - 0.5) * (Math.PI / nPts) * 1.5;
        const rad   = r * (0.55 + Math.random() * 0.45);
        return { x: cx + Math.cos(theta) * rad, y: cy + Math.sin(theta) * rad };
      });
      ctx.beginPath();
      ctx.moveTo((pts[nPts - 1].x + pts[0].x) / 2, (pts[nPts - 1].y + pts[0].y) / 2);
      for (let k = 0; k < nPts; k++) {
        const cur = pts[k], next = pts[(k + 1) % nPts];
        ctx.quadraticCurveTo(cur.x, cur.y, (cur.x + next.x) / 2, (cur.y + next.y) / 2);
      }
      ctx.closePath();
      const g = ctx.createRadialGradient(cx, cy, 0, cx, cy, r);
      g.addColorStop(0, `rgba(12,10,3,${a})`);
      g.addColorStop(1, `rgba(12,10,3,0)`);
      ctx.fillStyle = g;
      ctx.fill();
    }

    tex.update();

    const mat = new StandardMaterial(`${this.id}_mat_floor_grime`, scene);
    mat.diffuseTexture = tex;
    mat.useAlphaFromDiffuseTexture = true;
    mat.specularColor = Color3.Black();
    mat.maxSimultaneousLights = 6;

    const mesh = MeshBuilder.CreateBox(`${this.id}_floor_grime`,
      { width, height: 0.001, depth }, scene);
    mesh.position.y = 0.006;
    mesh.material   = mat;
    this.prop(mesh);
  }
}
