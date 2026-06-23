import { MeshBuilder, StandardMaterial, Color3, Vector3, type Scene, type AbstractMesh, type TransformNode } from "@babylonjs/core";

export interface DeskMeshes {
  collision: AbstractMesh[];  // Tischplatte + Unterschrank-Körper → track()
  props:     AbstractMesh[];  // Beine, Schubladen, Griffe       → prop()
}

const DW    = 1.6;   // Breite (entlang Wand)
const DD    = 0.8;   // Tiefe (ins Zimmer)
const DH    = 0.75;  // Höhe Tischplatte Oberkante
const TOP_T = 0.04;
const LEG_S = 0.06;
const LEG_H = DH - TOP_T;

// Unterschrank
const PW = 0.42;  // Breite
const PH = LEG_H; // Höhe = unter der Tischplatte

export { DW as DESK_W, DD as DESK_D };

function buildPedestal(
  scene: Scene,
  parent: TransformNode,
  id: string,
  px: number,
  topMat: StandardMaterial,
  handleMat: StandardMaterial,
): { body: AbstractMesh; props: AbstractMesh[] } {
  const props: AbstractMesh[] = [];

  const body = MeshBuilder.CreateBox(`${id}_ped_body`,
    { width: PW, height: PH, depth: DD }, scene);
  body.parent   = parent;
  body.position = new Vector3(px, PH / 2, 0);
  body.material = topMat;

  // 3 Schubladen — Außenkante bündig zur Pedestal-/Tischplattenoberkante
  const GAP      = 0.012;
  const FACE_T   = 0.018;
  const MARGIN_X = 0.018;  // nur innerer Einzug
  const drawerH  = (PH - 4 * GAP) / 3;
  const faceZ    = -DD / 2 - FACE_T / 2;  // leicht vorstehend an der Front
  const innerDir = px < 0 ? 1 : -1;       // Richtung zur Raummitte
  const drawerX  = px + innerDir * MARGIN_X / 2;
  const drawerW  = PW - MARGIN_X;

  for (let d = 0; d < 3; d++) {
    const dy = GAP + drawerH / 2 + d * (drawerH + GAP);

    const front = MeshBuilder.CreateBox(`${id}_drw_front_${d}`,
      { width: drawerW, height: drawerH - GAP, depth: FACE_T }, scene);
    front.parent   = parent;
    front.position = new Vector3(drawerX, dy, faceZ);
    front.material = topMat;
    props.push(front);

    const grip = MeshBuilder.CreateBox(`${id}_drw_grip_${d}`,
      { width: 0.10, height: 0.016, depth: 0.014 }, scene);
    grip.parent   = parent;
    grip.position = new Vector3(drawerX, dy, faceZ - FACE_T / 2 - 0.007);
    grip.material = handleMat;
    props.push(grip);
  }

  return { body, props };
}

export function buildDesk(scene: Scene, parent: TransformNode, id: string): DeskMeshes {
  const topMat = new StandardMaterial(`${id}_desk_top_mat`, scene);
  topMat.diffuseColor  = new Color3(0.66, 0.54, 0.42);
  topMat.specularColor = Color3.Black();
  topMat.maxSimultaneousLights = 6;

  const legMat = new StandardMaterial(`${id}_desk_leg_mat`, scene);
  legMat.diffuseColor  = new Color3(0.42, 0.42, 0.42);
  legMat.specularColor = Color3.Black();
  legMat.maxSimultaneousLights = 6;

  // Tischplatte
  const top = MeshBuilder.CreateBox(`${id}_desk_top`,
    { width: DW, height: TOP_T, depth: DD }, scene);
  top.parent   = parent;
  top.position = new Vector3(0, DH - TOP_T / 2, 0);
  top.material = topMat;

  // Unterschrank auf zufälliger Seite; Beine nur auf der anderen Seite
  const pedSide = Math.random() < 0.5 ? 'left' : 'right';
  const pedX    = pedSide === 'left' ? -(DW / 2 - PW / 2) : (DW / 2 - PW / 2);
  const { body: pedBody, props: pedProps } = buildPedestal(scene, parent, id, pedX, topMat, legMat);

  // Beine nur auf der freien Seite
  const legSideX = pedSide === 'left' ? DW / 2 - LEG_S / 2 : -(DW / 2 - LEG_S / 2);
  const legProps: AbstractMesh[] = [];
  for (const [lz, sfx] of [
    [ DD / 2 - LEG_S / 2, 'b'],
    [-DD / 2 + LEG_S / 2, 'f'],
  ] as [number, string][]) {
    const leg = MeshBuilder.CreateBox(`${id}_desk_leg_${sfx}`,
      { width: LEG_S, height: LEG_H, depth: LEG_S }, scene);
    leg.parent   = parent;
    leg.position = new Vector3(legSideX, LEG_H / 2, lz);
    leg.material = legMat;
    legProps.push(leg);
  }

  return {
    collision: [top, pedBody],
    props:     [...legProps, ...pedProps],
  };
}
