import { getCtx } from "./audioContext";
export { updateAudioListener } from "./audioContext";

export class NeonHum {
  private readonly panner:     PannerNode;
  private readonly masterGain: GainNode;
  private nodes:    AudioNode[] = [];
  private started   = false;
  private disposed  = false;

  constructor(x: number, y: number, z: number) {
    const ctx = getCtx();

    this.panner = ctx.createPanner();
    this.panner.panningModel    = "HRTF";
    this.panner.distanceModel   = "inverse";
    this.panner.refDistance     = 1.5;
    this.panner.maxDistance     = 12;
    this.panner.rolloffFactor   = 3.5;
    this.panner.positionX.value = x;
    this.panner.positionY.value = y;
    this.panner.positionZ.value = z;

    this.masterGain = ctx.createGain();
    this.masterGain.gain.value = 0;
    this.masterGain.connect(this.panner);
    this.panner.connect(ctx.destination);
  }

  start(): void {
    if (this.started || this.disposed) return;
    this.started = true;
    const ctx = getCtx();
    if (ctx.state === "suspended") ctx.resume();

    // Leicht zufällige Grundfrequenz pro Raum (49–51 Hz)
    const base = 50 + (Math.random() - 0.5) * 2;

    // Grundton + Obertöne
    for (const [mult, amp] of [
      [1, 0.40], [2, 0.25], [3, 0.12], [4, 0.05],
    ] as [number, number][]) {
      const osc = ctx.createOscillator();
      osc.type = "sine";
      osc.frequency.value = base * mult;
      const g = ctx.createGain();
      g.gain.value = amp;
      osc.connect(g); g.connect(this.masterGain);
      osc.start();
      this.nodes.push(osc, g);
    }

    // Gefiltertes Rauschen → "Fry"-Anteil
    const bufLen = ctx.sampleRate * 2;
    const buf    = ctx.createBuffer(1, bufLen, ctx.sampleRate);
    const data   = buf.getChannelData(0);
    for (let i = 0; i < bufLen; i++) data[i] = Math.random() * 2 - 1;
    const noise = ctx.createBufferSource();
    noise.buffer = buf;
    noise.loop   = true;
    const bpf = ctx.createBiquadFilter();
    bpf.type = "bandpass"; bpf.frequency.value = 120; bpf.Q.value = 0.8;
    const ng = ctx.createGain(); ng.gain.value = 0.08;
    noise.connect(bpf); bpf.connect(ng); ng.connect(this.masterGain);
    noise.start();
    this.nodes.push(noise, bpf, ng);

    // LFO → leichtes Amplitudenflimmern
    const lfo = ctx.createOscillator();
    lfo.type = "sine";
    lfo.frequency.value = 0.27 + Math.random() * 0.08;
    const lg = ctx.createGain(); lg.gain.value = 0.03;
    lfo.connect(lg); lg.connect(this.masterGain.gain);
    lfo.start();
    this.nodes.push(lfo, lg);

    this.masterGain.gain.setValueAtTime(0, ctx.currentTime);
    this.masterGain.gain.linearRampToValueAtTime(0.07, ctx.currentTime + 1.5);
  }

  stop(fadeDuration = 1.0): void {
    if (!this.started || this.disposed) return;
    const ctx = getCtx();
    this.masterGain.gain.cancelScheduledValues(ctx.currentTime);
    this.masterGain.gain.setValueAtTime(this.masterGain.gain.value, ctx.currentTime);
    this.masterGain.gain.linearRampToValueAtTime(0, ctx.currentTime + fadeDuration);
    setTimeout(() => this.dispose(), (fadeDuration + 0.2) * 1000);
  }

  dispose(): void {
    if (this.disposed) return;
    this.disposed = true;
    for (const n of this.nodes) {
      try {
        if (n instanceof OscillatorNode || n instanceof AudioBufferSourceNode)
          (n as OscillatorNode).stop();
        n.disconnect();
      } catch { /* bereits gestoppt */ }
    }
    try { this.masterGain.disconnect(); this.panner.disconnect(); } catch { /**/ }
    this.nodes = [];
  }
}
