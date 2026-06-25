import { MeshBuilder, StandardMaterial, Color3, Vector3, type Scene, type AbstractMesh, type TransformNode } from "@babylonjs/core";

export interface CabinetMeshes {
  collision: AbstractMesh[];
  props:     AbstractMesh[];
}

const CAB_W   = 0.84;   // Breite
const CAB_D   = 0.42;   // Tiefe
const CAB_H   = 1.46;   // Gesamthöhe
const BOT_H   = 0.54;   // Unterer Bereich (Schubladen)
const SHELF_T = 0.022;  // Trennboden-Dicke
const FACE_T  = 0.016;  // Türen/Schubladen-Frontstärke
const GAP     = 0.010;  // Spalt zwischen Fronten

export { CAB_W as CABINET_W, CAB_D as CABINET_D };

export function buildCabinet(scene: Scene, parent: TransformNode, id: string): CabinetMeshes {
  const bodyMat = new StandardMaterial(`${id}_cab_body_mat`, scene);
  bodyMat.diffuseColor        = new Color3(0.66, 0.54, 0.42);
  bodyMat.specularColor       = Color3.Black();
  bodyMat.maxSimultaneousLights = 6;

  const handleMat = new StandardMaterial(`${id}_cab_handle_mat`, scene);
  handleMat.diffuseColor        = new Color3(0.42, 0.42, 0.42);
  handleMat.specularColor       = Color3.Black();
  handleMat.maxSimultaneousLights = 6;

  const props: AbstractMesh[] = [];

  // ── Korpus (ganzer Schrank als ein Quader) ───────────────────────────────
  const body = MeshBuilder.CreateBox(`${id}_cab_body`,
    { width: CAB_W, height: CAB_H, depth: CAB_D }, scene);
  body.parent   = parent;
  body.position = new Vector3(0, CAB_H / 2, 0);
  body.material = bodyMat;

  // ── Trennboden zwischen Schubladen und Türen ─────────────────────────────
  const shelf = MeshBuilder.CreateBox(`${id}_cab_shelf`,
    { width: CAB_W - 0.004, height: SHELF_T, depth: CAB_D - 0.004 }, scene);
  shelf.parent   = parent;
  shelf.position = new Vector3(0, BOT_H + SHELF_T / 2, 0);
  shelf.material = bodyMat;
  props.push(shelf);

  // ── Schubladen (unten, 2 oder 3) ─────────────────────────────────────────
  const numDrawers = Math.random() < 0.5 ? 3 : 2;
  const drawerArea = BOT_H - GAP;
  const drawerH    = (drawerArea - (numDrawers + 1) * GAP) / numDrawers;
  const frontZ     = -(CAB_D / 2 + FACE_T / 2);
  const drawerW    = CAB_W - 2 * GAP;

  for (let i = 0; i < numDrawers; i++) {
    const dy = GAP + drawerH / 2 + i * (drawerH + GAP);

    const front = MeshBuilder.CreateBox(`${id}_cab_drw_${i}`,
      { width: drawerW, height: drawerH - GAP, depth: FACE_T }, scene);
    front.parent   = parent;
    front.position = new Vector3(0, dy, frontZ);
    front.material = bodyMat;
    props.push(front);

    const grip = MeshBuilder.CreateBox(`${id}_cab_drw_grip_${i}`,
      { width: 0.12, height: 0.014, depth: 0.012 }, scene);
    grip.parent   = parent;
    grip.position = new Vector3(0, dy, frontZ - FACE_T / 2 - 0.006);
    grip.material = handleMat;
    props.push(grip);
  }

  // ── Türen (oben, 2 nebeneinander) ────────────────────────────────────────
  const TOP_H   = CAB_H - BOT_H - SHELF_T;
  const doorW   = (CAB_W - 3 * GAP) / 2;
  const doorH   = TOP_H - 2 * GAP;
  const doorY   = BOT_H + SHELF_T + GAP + doorH / 2;
  const doorXL  = -(GAP / 2 + doorW / 2);
  const doorXR  =   GAP / 2 + doorW / 2;

  for (const [sfx, dx] of [['L', doorXL], ['R', doorXR]] as [string, number][]) {
    const door = MeshBuilder.CreateBox(`${id}_cab_door_${sfx}`,
      { width: doorW, height: doorH, depth: FACE_T }, scene);
    door.parent   = parent;
    door.position = new Vector3(dx, doorY, frontZ);
    door.material = bodyMat;
    props.push(door);

    // Griff am inneren Rand jeder Tür
    const gripX = sfx === 'L' ? dx + doorW / 2 - 0.06 : dx - doorW / 2 + 0.06;
    const grip  = MeshBuilder.CreateBox(`${id}_cab_door_grip_${sfx}`,
      { width: 0.014, height: 0.10, depth: 0.012 }, scene);
    grip.parent   = parent;
    grip.position = new Vector3(gripX, doorY, frontZ - FACE_T / 2 - 0.006);
    grip.material = handleMat;
    props.push(grip);
  }

  // ── Abschlussleiste oben ─────────────────────────────────────────────────
  const top = MeshBuilder.CreateBox(`${id}_cab_top`,
    { width: CAB_W + 0.02, height: 0.018, depth: CAB_D + 0.02 }, scene);
  top.parent   = parent;
  top.position = new Vector3(0, CAB_H + 0.009, 0);
  top.material = bodyMat;
  props.push(top);

  return { collision: [body], props };
}
