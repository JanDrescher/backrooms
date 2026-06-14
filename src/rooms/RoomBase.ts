import {
  StandardMaterial,
  Color3,
  type Light,
  type Scene,
  type AbstractMesh,
} from "@babylonjs/core";
import type { IRoom, DoorDefinition } from "./IRoom";

export abstract class RoomBase implements IRoom {
  abstract readonly id: string;
  abstract readonly doors: DoorDefinition[];

  protected meshes: AbstractMesh[] = [];
  protected lights: Light[]        = [];

  async load(scene: Scene): Promise<void> {
    await this.buildGeometry(scene);
  }

  unload(): void {
    for (const m of this.meshes) m.dispose();
    for (const l of this.lights) l.dispose();
    this.meshes = [];
    this.lights = [];
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

  /** Lichtquelle registrieren — wird beim unload() entfernt. */
  protected trackLight<T extends Light>(light: T): T {
    this.lights.push(light);
    return light;
  }

  protected mat(scene: Scene, name: string, color: Color3): StandardMaterial {
    const m = new StandardMaterial(`${this.id}_mat_${name}`, scene);
    m.diffuseColor          = color;
    m.specularColor         = Color3.Black();
    m.maxSimultaneousLights = 6; // HemisphericLight + 4 PointLights + Reserve
    return m;
  }
}
