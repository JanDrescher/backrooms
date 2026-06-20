import {
  Engine,
  Scene,
  HemisphericLight,
  Vector3,
  Color3,
  UniversalCamera,
  type AbstractMesh,
} from "@babylonjs/core";
import type { IInteractable } from "./IInteractable";
import type { IRoom } from "../rooms/IRoom";
import { updateAudioListener } from "../audio/NeonHum";
import { buildGlobalFloor } from "../world/GlobalFloor";

// Augenhöhe in Metern
const EYE_HEIGHT = 1.7;
// Spieler-Kapsel: Radius 0.35 m, halbe Höhe 0.85 m (= 1.7 m gesamt)
const CAPSULE_R  = 0.35;
const CAPSULE_HH = EYE_HEIGHT / 2;

export class Game {
  private engine: Engine;
  private scene: Scene;
  private camera!: UniversalCamera;
  private rooms: IRoom[] = [];
  private floorMeshes: AbstractMesh[] = [];

  constructor(canvas: HTMLCanvasElement) {
    this.engine = new Engine(canvas, true, { preserveDrawingBuffer: true });
    this.scene  = new Scene(this.engine);
    this.scene.collisionsEnabled = true;
    this.setupLighting();
    this.setupCamera(canvas);
    this.engine.runRenderLoop(() => this.scene.render());
    window.addEventListener("resize", () => this.engine.resize());
  }

  private setupLighting(): void {
    // Minimales Umgebungslicht — verhindert absolute Schwärze in Ecken
    const ambient = new HemisphericLight("ambient", new Vector3(0, 1, 0), this.scene);
    // Starkes Ambient für gleichmäßige Grundausleuchtung —
    // Punktlichter an den Lampen sind nur für den lokalen Leucht-Effekt zuständig
    ambient.intensity   = 0.80;
    ambient.diffuse     = new Color3(0.75, 0.70, 0.38);
    ambient.groundColor = new Color3(0.60, 0.56, 0.30);
  }

  private setupCamera(canvas: HTMLCanvasElement): void {
    canvas.tabIndex = 0;

    this.camera = new UniversalCamera("fpCam", new Vector3(0, EYE_HEIGHT, 0), this.scene);
    this.camera.setTarget(new Vector3(0, EYE_HEIGHT, -1));

    this.camera.keysUp    = [87]; // W
    this.camera.keysDown  = [83]; // S
    this.camera.keysLeft  = [65]; // A
    this.camera.keysRight = [68]; // D

    this.camera.speed              = 1.0;
    this.camera.angularSensibility = 2000;
    this.camera.inertia            = 0;
    this.camera.minZ               = 0.1;

    // Kollisions-Kapsel: Mittelpunkt liegt bei Augenhöhe,
    // Offset verschiebt die Kapsel nach unten, damit Füße auf y=0 stehen
    this.camera.checkCollisions = true;
    this.camera.ellipsoid       = new Vector3(CAPSULE_R, CAPSULE_HH, CAPSULE_R);

    this.camera.attachControl(canvas, true);

    // Y-Position nach jedem Frame einrasten — kein applyGravity nötig
    this.scene.registerAfterRender(() => {
      this.camera.position.y = EYE_HEIGHT;
      // Spatial-Audio-Listener synchron zur Kamera halten
      const p = this.camera.position;
      const t = this.camera.target;
      const dx = t.x - p.x, dy = t.y - p.y, dz = t.z - p.z;
      const len = Math.sqrt(dx * dx + dy * dy + dz * dz) || 1;
      updateAudioListener(p.x, p.y, p.z, dx / len, dy / len, dz / len);
    });

    window.addEventListener("keydown", (e) => {
      if (e.code === "KeyE") this.tryInteract();
    });
  }

  private tryInteract(): void {
    const pos = this.camera.position;
    let nearest: IInteractable | null = null;
    let nearestDist = Infinity;
    for (const room of this.rooms) {
      for (const i of room.interactables) {
        const d = Vector3.Distance(pos, i.position);
        if (d <= i.interactRange && d < nearestDist) {
          nearest = i;
          nearestDist = d;
        }
      }
    }
    nearest?.interact(pos);
  }

  focusCanvas(): void {
    (this.engine.getRenderingCanvas() as HTMLCanvasElement).focus();
  }

  /** Alle Räume und den globalen Boden aus der Szene entfernen. */
  clearRooms(): void {
    for (const r of this.rooms) r.unload();
    this.rooms = [];
    for (const m of this.floorMeshes) m.dispose();
    this.floorMeshes = [];
  }

  /** Globalen Komplex-Boden erstellen (nach dem Laden aller Räume aufrufen). */
  setupGlobalFloor(): void {
    for (const m of this.floorMeshes) m.dispose();
    this.floorMeshes = buildGlobalFloor(this.scene);
  }

  /** Raum in die Szene laden (ohne bestehende Räume zu entfernen). */
  async addRoom(room: IRoom, worldOffset = Vector3.Zero(), rotationY = 0): Promise<void> {
    await room.load(this.scene, worldOffset, rotationY);
    this.rooms.push(room);
  }

  /** Kamera im Spawnpunkt eines bereits geladenen Raums positionieren. */
  spawnAt(room: IRoom): void {
    const sp = room.spawnPoint;
    const wo = room.worldOffset;
    this.camera.position = new Vector3(sp.x + wo.x, EYE_HEIGHT, sp.z + wo.z);
    this.camera.setTarget(new Vector3(sp.x + wo.x, EYE_HEIGHT, sp.z + wo.z - 1));
  }

  /** Shortcut: einzelnen Raum am Ursprung laden und darin spawnen. */
  async loadRoom(room: IRoom): Promise<void> {
    this.clearRooms();
    await this.addRoom(room, Vector3.Zero());
    this.spawnAt(room);
  }

  getScene(): Scene {
    return this.scene;
  }

}
