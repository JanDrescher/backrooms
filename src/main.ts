import { Game } from "./engine/Game";
import { generateLevelFromBlueprint } from "./world/BlueprintGenerator";
import { Minimap } from "./ui/Minimap";

const canvas        = document.getElementById("renderCanvas") as HTMLCanvasElement;
const minimapCanvas = document.getElementById("minimap")       as HTMLCanvasElement;
const overlay       = document.getElementById("overlay")       as HTMLDivElement;

const game    = new Game(canvas);
const minimap = new Minimap(minimapCanvas);

// Minimap jeden Frame aktualisieren
const cam = game.getCamera();
game.getScene().registerAfterRender(() => {
  const t = cam.getTarget();
  minimap.update(cam.position.x, cam.position.z, t.x, t.z);
});

async function loadLevel(): Promise<void> {
  game.clearRooms();
  const { rooms, mapData, connections } = generateLevelFromBlueprint(1);
  const start = rooms.find(r => r.isStart)!;
  for (const pr of rooms)
    await game.addRoom(pr.room, pr.offset, pr.rotation);
  game.setupGlobalFloor();
  game.spawnAt(start.room);
  minimap.setMapData(mapData, connections);
  minimapCanvas.style.display = 'block';
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
