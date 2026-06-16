import { getCtx } from "./audioContext";

export function playFlickerBurst(x: number, y: number, z: number, duration: number): void {
  const ctx = getCtx();
  if (ctx.state === "suspended") ctx.resume();

  const dur = Math.max(0.015, duration);
  const now = ctx.currentTime;

  const panner = ctx.createPanner();
  panner.panningModel    = "HRTF";
  panner.distanceModel   = "inverse";
  panner.refDistance     = 1.5;
  panner.maxDistance     = 12;
  panner.rolloffFactor   = 3.0;
  panner.positionX.value = x;
  panner.positionY.value = y;
  panner.positionZ.value = z;
  panner.connect(ctx.destination);

  // Rauschquelle
  const bufLen = Math.ceil(ctx.sampleRate * (dur + 0.01));
  const buf    = ctx.createBuffer(1, bufLen, ctx.sampleRate);
  const data   = buf.getChannelData(0);
  for (let i = 0; i < bufLen; i++) data[i] = Math.random() * 2 - 1;
  const src = ctx.createBufferSource();
  src.buffer = buf;

  // Elektrisches Summen: Bandpass um Netzfrequenz
  const bpf = ctx.createBiquadFilter();
  bpf.type = "bandpass"; bpf.frequency.value = 120; bpf.Q.value = 1.8;

  // Hochfrequentes Sizzle (parallel)
  const hpf = ctx.createBiquadFilter();
  hpf.type = "highpass"; hpf.frequency.value = 2500;

  const mainGain   = ctx.createGain(); mainGain.gain.value   = 0.28;
  const sizzleGain = ctx.createGain(); sizzleGain.gain.value = 0.06;

  // Square-LFO (~40 Hz) → "rrrr"-Rattern
  const lfo = ctx.createOscillator();
  lfo.type = "square";
  lfo.frequency.value = 38 + Math.random() * 16;
  const lfoGain = ctx.createGain(); lfoGain.gain.value = 0.35;
  lfo.connect(lfoGain); lfoGain.connect(mainGain.gain);

  src.connect(bpf);  bpf.connect(mainGain);   mainGain.connect(panner);
  src.connect(hpf);  hpf.connect(sizzleGain); sizzleGain.connect(panner);

  lfo.start(now); lfo.stop(now + dur + 0.005);
  src.start(now); src.stop(now + dur + 0.005);

  setTimeout(() => panner.disconnect(), (dur + 0.1) * 1000);
}
