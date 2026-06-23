import { getCtx } from "./audioContext";

function noiseBuffer(ctx: AudioContext, seconds: number): AudioBuffer {
  const len  = Math.ceil(ctx.sampleRate * seconds);
  const buf  = ctx.createBuffer(1, len, ctx.sampleRate);
  const data = buf.getChannelData(0);
  for (let i = 0; i < len; i++) data[i] = Math.random() * 2 - 1;
  return buf;
}

// Klick der Türklinke — kurzer metallischer Transient
function handleClick(ctx: AudioContext, out: AudioNode, t: number): void {
  const src  = ctx.createBufferSource();
  src.buffer = noiseBuffer(ctx, 0.025);

  const bpf  = ctx.createBiquadFilter();
  bpf.type = "bandpass"; bpf.frequency.value = 2800; bpf.Q.value = 3.5;

  const g = ctx.createGain();
  g.gain.setValueAtTime(1.3, t);
  g.gain.exponentialRampToValueAtTime(0.001, t + 0.025);

  src.connect(bpf); bpf.connect(g); g.connect(out);
  src.start(t);
}

// Dumpfes Einrasten der Tür im Rahmen — Körperschall, kein Ton
function frameImpact(ctx: AudioContext, out: AudioNode, t: number): void {
  // Tieffrequenter Wums (Tür trifft Rahmen)
  const thud = ctx.createBufferSource();
  thud.buffer = noiseBuffer(ctx, 0.07);
  const bpf = ctx.createBiquadFilter();
  bpf.type = "bandpass"; bpf.frequency.value = 160; bpf.Q.value = 1.2;
  const tg = ctx.createGain();
  tg.gain.setValueAtTime(0.55, t);
  tg.gain.exponentialRampToValueAtTime(0.001, t + 0.07);
  thud.connect(bpf); bpf.connect(tg); tg.connect(out);
  thud.start(t);

  // Kurzer Hochfrequenz-Transient für den Aufprallmoment
  const snap = ctx.createBufferSource();
  snap.buffer = noiseBuffer(ctx, 0.014);
  const hpf = ctx.createBiquadFilter();
  hpf.type = "highpass"; hpf.frequency.value = 3500;
  const sg = ctx.createGain();
  sg.gain.setValueAtTime(0.45, t);
  sg.gain.exponentialRampToValueAtTime(0.001, t + 0.014);
  snap.connect(hpf); hpf.connect(sg); sg.connect(out);
  snap.start(t);
}

export function playDoorSound(x: number, y: number, z: number): void {
  const ctx = getCtx();

  const panner = ctx.createPanner();
  panner.panningModel    = "HRTF";
  panner.distanceModel   = "inverse";
  panner.refDistance     = 1.0;
  panner.maxDistance     = 18;
  panner.rolloffFactor   = 1.4;
  panner.positionX.value = x;
  panner.positionY.value = y;
  panner.positionZ.value = z;
  panner.connect(ctx.destination);

  const now = ctx.currentTime;
  handleClick(ctx, panner, now);
  frameImpact(ctx, panner, now + 0.10);

  setTimeout(() => panner.disconnect(), 400);
}
