let _ctx: AudioContext | null = null;

export function getCtx(): AudioContext {
  if (!_ctx) {
    _ctx = new AudioContext();
    // Browser-Autoplay-Policy: AudioContext startet "suspended" ohne User-Gesture.
    // Beim ersten Click oder Keydown entsperren.
    const unlock = () => {
      if (_ctx && _ctx.state === "suspended") _ctx.resume();
      window.removeEventListener("click",   unlock);
      window.removeEventListener("keydown", unlock);
    };
    window.addEventListener("click",   unlock);
    window.addEventListener("keydown", unlock);
  }
  return _ctx;
}

export function updateAudioListener(
  px: number, py: number, pz: number,
  fx: number, fy: number, fz: number,
): void {
  if (!_ctx) return;
  const l = _ctx.listener;
  if (l.positionX !== undefined) {
    l.positionX.value = px; l.positionY.value = py; l.positionZ.value = pz;
    l.forwardX.value  = fx; l.forwardY.value  = fy; l.forwardZ.value  = fz;
    l.upX.value = 0; l.upY.value = 1; l.upZ.value = 0;
  } else {
    (l as any).setPosition(px, py, pz);
    (l as any).setOrientation(fx, fy, fz, 0, 1, 0);
  }
}
