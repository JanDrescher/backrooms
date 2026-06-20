import { Game } from "./engine/Game";
import { generateLevelFromBlueprint } from "./world/BlueprintGenerator";

const canvas  = document.getElementById("renderCanvas") as HTMLCanvasElement;
const overlay = document.getElementById("overlay") as HTMLDivElement;
const game    = new Game(canvas);

async function loadLevel(): Promise<void> {
  game.clearRooms();
  const rooms = generateLevelFromBlueprint(1);
  const start = rooms.find(r => r.isStart)!;
  for (const pr of rooms)
    await game.addRoom(pr.room, pr.offset, pr.rotation);
  game.setupGlobalFloor();
  game.spawnAt(start.room);
}

overlay.addEventListener("click", async () => {
  overlay.style.display = "none";
  await canvas.requestPointerLock();
  game.focusCanvas();
  await loadLevel();
});

document.addEventListener("pointerlockchange", () => {
  if (!document.pointerLockElement) overlay.style.display = "flex";
});
