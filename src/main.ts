import { Game } from "./engine/Game";
import { Blueprint } from "./blueprint/Blueprint";
import { realizeBlueprintElements } from "./blueprint/Realizer";

const canvas  = document.getElementById("renderCanvas") as HTMLCanvasElement;
const overlay = document.getElementById("overlay") as HTMLDivElement;
const game    = new Game(canvas);

//  Komplex-Layout (1 Einheit = 1 Chunk = 3 m × 3 m):
//
//  col:  0  1  2  3  4  5  6  7
//  row 0:       [R3][R3]
//  row 1:       [R3][R3]
//  row 2:       [C1]            [R2][R2]
//  row 3:       [C1][C2][C2][C2][R2][R2]
//  row 4:       [C1]
//  row 5:       [C1]
//  row 6:    [R1][R1]
//  row 7:    [R1][R1]
//  row 8:    [R1][R1]
//
//  Verbindungen (Öffnungen):
//  R3 Süd ↔ C1 Nord  |  C1 Ost (Abzweig) ↔ C2 West  |  C2 Ost ↔ R2 West  |  C1 Süd ↔ R1 Nord

const blueprint = new Blueprint()
  .place('R3', 'placeholder', 2, 0, 2, 2)   // 2×2 oben
  .place('C1', 'corridor',    2, 2, 1, 4)   // 1×4 vertikal
  .place('C2', 'corridor',    3, 3, 3, 1)   // 3×1 horizontal
  .place('R2', 'placeholder', 6, 2, 2, 2)   // 2×2 rechts
  .place('R1', 'placeholder', 1, 6, 2, 3)   // 2×3 unten-links
  .connect('R3', 'C1')
  .connect('C1', 'C2')
  .connect('C2', 'R2')
  .connect('C1', 'R1');

async function loadComplex(): Promise<void> {
  game.clearRooms();
  const configs = realizeBlueprintElements(blueprint.realize());
  const c2 = configs.find(c => c.room.id === 'C2');
  if (c2) c2.offset.x -= 0.2; // C2: 0,2 m nach Westen (BJS −X) wegen C1-Ostwand
  for (const cfg of configs)
    await game.addRoom(cfg.room, cfg.offset, cfg.rotationY);
  const start = configs.find(c => c.room.id === 'R3')!;
  game.spawnAt(start.room);
}

overlay.addEventListener("click", async () => {
  overlay.style.display = "none";
  await canvas.requestPointerLock();
  game.focusCanvas();
  await loadComplex();
});

document.addEventListener("pointerlockchange", () => {
  if (!document.pointerLockElement) overlay.style.display = "flex";
});
