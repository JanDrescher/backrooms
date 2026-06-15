import {
  Engine,
  Scene,
  HemisphericLight,
  Vector3,
  Color3,
  UniversalCamera,
} from "@babylonjs/core";
import type { IInteractable } from "./IInteractable";
import type { IRoom } from "../rooms/IRoom";

// Augenhöhe in Metern
const EYE_HEIGHT = 1.7;
// Spieler-Kapsel: Radius 0.35 m, halbe Höhe 0.85 m (= 1.7 m gesamt)
const CAPSULE_R  = 0.35;
const CAPSULE_HH = EYE_HEIGHT / 2;

export class Game {
  private engine: Engine;
  private scene: Scene;
  private camera!: UniversalCamera;
  private currentRoom: IRoom | null = null;

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

    this.camera.speed              = 0.5;
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
    });

    window.addEventListener("keydown", (e) => {
      if (e.code === "KeyE") this.tryInteract();
    });
  }

  private tryInteract(): void {
    const interactables = this.currentRoom?.interactables ?? [];
    const pos = this.camera.position;
    let nearest: IInteractable | null = null;
    let nearestDist = Infinity;
    for (const i of interactables) {
      const d = Vector3.Distance(pos, i.position);
      if (d <= i.interactRange && d < nearestDist) {
        nearest = i;
        nearestDist = d;
      }
    }
    nearest?.interact(pos);
  }

  focusCanvas(): void {
    (this.engine.getRenderingCanvas() as HTMLCanvasElement).focus();
  }

  async loadRoom(room: IRoom): Promise<void> {
    if (this.currentRoom) this.currentRoom.unload();
    this.currentRoom = room;
    await room.load(this.scene);
    const sp = room.spawnPoint;
    this.camera.position = new Vector3(sp.x, EYE_HEIGHT, sp.z);
    this.camera.setTarget(new Vector3(sp.x, EYE_HEIGHT, sp.z - 1));
  }

  getScene(): Scene {
    return this.scene;
  }
}
