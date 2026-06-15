import { Vector3 } from "@babylonjs/core";
import { Game } from "./engine/Game";
import { PlaceholderRoom } from "./rooms/PlaceholderRoom";
import { CorridorRoom } from "./rooms/CorridorRoom";

const canvas  = document.getElementById("renderCanvas") as HTMLCanvasElement;
const overlay = document.getElementById("overlay") as HTMLDivElement;
const game    = new Game(canvas);

overlay.addEventListener("click", async () => {
  overlay.style.display = "none";
  await canvas.requestPointerLock();
  game.focusCanvas();

  game.clearRooms();

  // Startrum: PlaceholderRoom am Weltursrpung
  const sizes   = [6, 9, 12];
  const heights = [2.5, 2.8, 3.0, 3.2];
  const w = sizes[Math.floor(Math.random() * sizes.length)];
  const d = sizes[Math.floor(Math.random() * sizes.length)];
  const h = heights[Math.floor(Math.random() * heights.length)];
  const placeholder = new PlaceholderRoom("room_placeholder", w, d, h);
  await game.addRoom(placeholder, Vector3.Zero());

  // CorridorRoom anschließen: dessen "south"-Öffnung deckt sich mit
  // der "north"-Tür des Placeholders (Positionen jetzt in Weltkoordinaten)
  const corridor = new CorridorRoom("corridor_1");
  const northDoor = placeholder.doors.find(dd => dd.id === "north")!;
  const southDoor = corridor.doors.find(dd => dd.id === "south")!;
  // Placeholder ist am Ursprung → northDoor.position ist bereits Weltkoord.
  const corridorOffset = new Vector3(
    northDoor.position.x - southDoor.position.x,
    0,
    northDoor.position.z - southDoor.position.z,
  );
  await game.addRoom(corridor, corridorOffset);

  // Spieler im PlaceholderRoom spawnen
  game.spawnAt(placeholder);

  console.log(
    `PlaceholderRoom ${w}×${d}×${h}m | ` +
    `CorridorRoom offset z=${corridorOffset.z.toFixed(2)}`
  );
});

document.addEventListener("pointerlockchange", () => {
  if (!document.pointerLockElement) {
    overlay.style.display = "flex";
  }
});
