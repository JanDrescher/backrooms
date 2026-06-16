import { Color3, PointLight, Vector3, type AbstractMesh } from "@babylonjs/core";
import { StandardMaterial } from "@babylonjs/core";
import { playFlickerBurst } from "../audio/FlickerSound";

export const LAMP_EMISSIVE = new Color3(0.95, 0.92, 0.62);

export class FlickerEffect {
  private readonly normalIntensity: number;
  private disposed  = false;
  private timeoutId: ReturnType<typeof setTimeout> | null = null;

  constructor(
    private readonly lampMesh: AbstractMesh,
    private readonly light:    PointLight,
    private readonly worldPos: Vector3,
  ) {
    this.normalIntensity = light.intensity;
    this.scheduleNext();
  }

  private scheduleNext(): void {
    // Nächstes Ereignis in 6–24 Sekunden
    const delay = 6000 + Math.random() * 18000;
    this.timeoutId = setTimeout(() => this.startEvent(), delay);
  }

  private startEvent(): void {
    if (this.disposed) return;

    // Zufällige Abfolge von [Dauer ms, Lampe an?]
    const steps: Array<[number, boolean]> = [];
    const bursts = 3 + Math.floor(Math.random() * 5);
    for (let i = 0; i < bursts; i++) {
      steps.push([20 + Math.random() * 80,  false]); // aus
      steps.push([15 + Math.random() * 60,  true ]); // an
    }
    steps.push([40 + Math.random() * 80, false]); // letztes Aus
    steps.push([100, true]);                        // stabil An

    this.runStep(steps, 0);
  }

  private runStep(steps: Array<[number, boolean]>, i: number): void {
    if (this.disposed) return;
    if (i >= steps.length) { this.scheduleNext(); return; }

    const [delay, on] = steps[i];
    this.setLampState(on);
    if (!on) playFlickerBurst(
      this.worldPos.x, this.worldPos.y, this.worldPos.z, delay / 1000,
    );
    this.timeoutId = setTimeout(() => this.runStep(steps, i + 1), delay);
  }

  private setLampState(on: boolean): void {
    const mat = this.lampMesh.material as StandardMaterial;
    mat.emissiveColor      = on ? LAMP_EMISSIVE : Color3.Black();
    this.light.intensity   = on ? this.normalIntensity : 0;
  }

  dispose(): void {
    if (this.disposed) return;
    this.disposed = true;
    if (this.timeoutId !== null) clearTimeout(this.timeoutId);
    this.setLampState(true); // Lampe beim Entladen sicher einschalten
  }
}
