import { Game } from "./engine/Game";
import { PlaceholderRoom } from "./rooms/PlaceholderRoom";

const canvas  = document.getElementById("renderCanvas") as HTMLCanvasElement;
const overlay = document.getElementById("overlay") as HTMLDivElement;
const game    = new Game(canvas);

overlay.addEventListener("click", async () => {
  overlay.style.display = "none";

  await canvas.requestPointerLock();
  game.focusCanvas(); // Keyboard-Events auf den Canvas lenken

  const sizes   = [6, 9, 12];
  const heights = [2.5, 2.8, 3.0, 3.2];
  const w = sizes[Math.floor(Math.random() * sizes.length)];
  const d = sizes[Math.floor(Math.random() * sizes.length)];
  const h = heights[Math.floor(Math.random() * heights.length)];
  console.log(`Room: ${w}×${d}×${h}m`);
  const room = new PlaceholderRoom("room_placeholder", w, d, h);
  await game.loadRoom(room);
});

document.addEventListener("pointerlockchange", () => {
  if (!document.pointerLockElement) {
    overlay.style.display = "flex";
  }
});
