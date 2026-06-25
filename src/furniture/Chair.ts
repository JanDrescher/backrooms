import { MeshBuilder, StandardMaterial, Color3, Vector3, type Scene, type AbstractMesh, type TransformNode } from "@babylonjs/core";

export interface ChairMeshes {
  collision: AbstractMesh[];  // Sitzfläche + Rückenlehne → track()
  props:     AbstractMesh[];  // Beine                    → prop()
}

const CW    = 0.46;   // Sitzfläche Breite
const CD    = 0.44;   // Sitzfläche Tiefe
const SH    = 0.46;   // Sitzhöhe Oberkante
const ST    = 0.05;   // Sitzpolster Dicke
const BW    = 0.42;   // Rückenlehne Breite
const BH    = 0.46;   // Rückenlehne Höhe
const BT    = 0.05;   // Rückenlehne Dicke
const LEG_S = 0.045;
const LEG_H = SH - ST;

export { CD as CHAIR_D, CW as CHAIR_W };

export function buildChair(scene: Scene, parent: TransformNode, id: string): ChairMeshes {
  const seatMat = new StandardMaterial(`${id}_ch_seat_mat`, scene);
  seatMat.diffuseColor        = new Color3(0.52, 0.49, 0.41);
  seatMat.specularColor       = Color3.Black();
  seatMat.maxSimultaneousLights = 6;

  const frameMat = new StandardMaterial(`${id}_ch_frame_mat`, scene);
  frameMat.diffuseColor        = new Color3(0.28, 0.28, 0.28);
  frameMat.specularColor       = Color3.Black();
  frameMat.maxSimultaneousLights = 6;

  // Sitzfläche
  const seat = MeshBuilder.CreateBox(`${id}_ch_seat`,
    { width: CW, height: ST, depth: CD }, scene);
  seat.parent   = parent;
  seat.position = new Vector3(0, SH - ST / 2, 0);
  seat.material = seatMat;

  // Rückenlehne — leicht nach hinten geneigt (+Z = Vorderseite des Stuhls)
  const back = MeshBuilder.CreateBox(`${id}_ch_back`,
    { width: BW, height: BH, depth: BT }, scene);
  back.parent    = parent;
  back.position  = new Vector3(0, SH + BH / 2 - ST * 0.5, -CD / 2 + BT / 2);
  back.rotation.x = -0.10;
  back.material  = seatMat;

  // 4 Beine
  const legPositions: [number, number][] = [
    [ CW / 2 - LEG_S / 2,  CD / 2 - LEG_S / 2],
    [-CW / 2 + LEG_S / 2,  CD / 2 - LEG_S / 2],
    [ CW / 2 - LEG_S / 2, -CD / 2 + LEG_S / 2],
    [-CW / 2 + LEG_S / 2, -CD / 2 + LEG_S / 2],
  ];

  const legs: AbstractMesh[] = legPositions.map(([lx, lz]) => {
    const leg = MeshBuilder.CreateBox(`${id}_ch_leg_${lx.toFixed(2)}_${lz.toFixed(2)}`,
      { width: LEG_S, height: LEG_H, depth: LEG_S }, scene);
    leg.parent   = parent;
    leg.position = new Vector3(lx, LEG_H / 2, lz);
    leg.material = frameMat;
    return leg;
  });

  return { collision: [seat, back], props: legs };
}
