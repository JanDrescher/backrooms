import { Vector3 } from "@babylonjs/core";
import { Game } from "./engine/Game";
import { PlaceholderRoom } from "./rooms/PlaceholderRoom";
import { CorridorRoom } from "./rooms/CorridorRoom";
import { computeConnection } from "./world/LevelBuilder";

const canvas  = document.getElementById("renderCanvas") as HTMLCanvasElement;
const overlay = document.getElementById("overlay") as HTMLDivElement;
const game    = new Game(canvas);

overlay.addEventListener("click", async () => {
  overlay.style.display = "none";
  await canvas.requestPointerLock();
  game.focusCanvas();
  game.clearRooms();

  // ── Komplex-Layout ────────────────────────────────────────────────
  //
  //   [P0]  Startroom (6×6)
  //     |
  //   [C1]  N-S Korridor, Ostabzweigung bei Segment 1
  //     |  \
  //   [C2]  [C3] O-W Korridor (nach Osten)
  //     |         \
  //   [P2]       [P1] Endraum (6×6)
  //
  // ─────────────────────────────────────────────────────────────────

  const p0 = new PlaceholderRoom("p0", 6, 6, 2.8, "north");
  await game.addRoom(p0);

  const c1 = new CorridorRoom("c1", { D: 9, H: 2.8, branchSide: "east", branchSeg: 1 });
  const { offset: c1Off, rotation: c1Rot } = computeConnection(
    p0.doors.find(d => d.id === "north")!,
    c1.doors.find(d => d.id === "south")!,
  );
  await game.addRoom(c1, c1Off, c1Rot);

  const c2 = new CorridorRoom("c2", { D: 9, H: 2.8, branchSide: null });
  const { offset: c2Off, rotation: c2Rot } = computeConnection(
    c1.doors.find(d => d.id === "north")!,
    c2.doors.find(d => d.id === "south")!,
  );
  await game.addRoom(c2, c2Off, c2Rot);

  // P2: Südtür → kein Rotation nötig
  const p2 = new PlaceholderRoom("p2", 6, 6, 2.8, "south");
  const { offset: p2Off, rotation: p2Rot } = computeConnection(
    c2.doors.find(d => d.id === "north")!,
    p2.doors.find(d => d.id === "south")!,
  );
  await game.addRoom(p2, p2Off, p2Rot);

  const c3 = new CorridorRoom("c3", { D: 9, H: 2.8, branchSide: null });
  const { offset: c3Off, rotation: c3Rot } = computeConnection(
    c1.doors.find(d => d.id === "branch_east")!,
    c3.doors.find(d => d.id === "south")!,
  );
  await game.addRoom(c3, c3Off, c3Rot);

  // P1: Westtür (visuell links = +X-Wand) → kein Rotation nötig
  const p1 = new PlaceholderRoom("p1", 6, 6, 2.8, "west");
  const { offset: p1Off, rotation: p1Rot } = computeConnection(
    c3.doors.find(d => d.id === "north")!,
    p1.doors.find(d => d.id === "west")!,
  );
  await game.addRoom(p1, p1Off, p1Rot);

  game.spawnAt(p0);
});

document.addEventListener("pointerlockchange", () => {
  if (!document.pointerLockElement) overlay.style.display = "flex";
});
