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
  g.gain.setValueAtTime(0.85, t);
  g.gain.exponentialRampToValueAtTime(0.001, t + 0.025);

  src.connect(bpf); bpf.connect(g); g.connect(out);
  src.start(t);
}

// Klacken des Türriegels am Schließblech — metallisch
function frameImpact(ctx: AudioContext, out: AudioNode, t: number): void {
  // Zwei leicht verstimmte Sinustöne → metallisches Nachklingen (kein Sweep)
  for (const [freq, amp, decay] of [
    [920,  0.22, 0.045],
    [1280, 0.18, 0.038],
  ] as [number, number, number][]) {
    const osc = ctx.createOscillator();
    osc.type = "sine";
    osc.frequency.value = freq;
    const g = ctx.createGain();
    g.gain.setValueAtTime(amp, t);
    g.gain.exponentialRampToValueAtTime(0.001, t + decay);
    osc.connect(g); g.connect(out);
    osc.start(t); osc.stop(t + decay + 0.005);
  }

  // Kurzer Hochfrequenz-Transient für den Aufprallmoment
  const src  = ctx.createBufferSource();
  src.buffer = noiseBuffer(ctx, 0.016);
  const hpf  = ctx.createBiquadFilter();
  hpf.type = "highpass"; hpf.frequency.value = 3500;
  const ng = ctx.createGain();
  ng.gain.setValueAtTime(0.4, t);
  ng.gain.exponentialRampToValueAtTime(0.001, t + 0.016);
  src.connect(hpf); hpf.connect(ng); ng.connect(out);
  src.start(t);
}

export function playDoorSound(x: number, y: number, z: number): void {
  const ctx = getCtx();
  if (ctx.state === "suspended") ctx.resume();

  const panner = ctx.createPanner();
  panner.panningModel    = "HRTF";
  panner.distanceModel   = "inverse";
  panner.refDistance     = 1.0;
  panner.maxDistance     = 18;
  panner.rolloffFactor   = 2.0;
  panner.positionX.value = x;
  panner.positionY.value = y;
  panner.positionZ.value = z;
  panner.connect(ctx.destination);

  const now = ctx.currentTime;
  handleClick(ctx, panner, now);
  // frameImpact(ctx, panner, now + 0.10);

  setTimeout(() => panner.disconnect(), 400);
}
