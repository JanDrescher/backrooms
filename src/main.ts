import { Game } from "./engine/Game";
import { generateLevel } from "./world/LevelGenerator";

const canvas  = document.getElementById("renderCanvas") as HTMLCanvasElement;
const overlay = document.getElementById("overlay") as HTMLDivElement;
const game    = new Game(canvas);

async function loadLevel(): Promise<void> {
  game.clearRooms();
  const rooms = generateLevel(1);
  const start = rooms.find(r => r.isStart)!;
  for (const pr of rooms)
    await game.addRoom(pr.room, pr.offset, pr.rotation);
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
