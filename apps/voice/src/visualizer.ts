// A radial, audio-reactive visualizer for the voice call, in the manner of LiveKit's Agents UI and
// Pipecat's CircularWaveform: bars around a ring whose motion tells the user what the agent is doing.
//   connecting  a short arc sweeps the ring
//   idle        the ring breathes
//   listening   bars follow the microphone spectrum
//   thinking    a pulse travels around the ring
//   speaking    bars follow the agent's voice, and the ring turns
// Bars alternate orange and cream, like the strips of the Yaatal mark.

export type VisualState = "connecting" | "idle" | "listening" | "thinking" | "speaking";

/**
 * Real audio levels, tapped from the voice client's Web Audio graph. The client connects its playback
 * buffers to the audio destination and its microphone source to a worklet; teeing those connections
 * into analysers gives the visualizer the actual spectrum of each side without touching the client.
 * Must be installed before the client creates its AudioContext.
 */
export const taps: { mic: AnalyserNode | null; voice: AnalyserNode | null } = { mic: null, voice: null };

export function installAudioTaps(): void {
  if (typeof AudioNode === "undefined" || (AudioNode.prototype as { __yaatalTap?: boolean }).__yaatalTap) return;
  const connect = AudioNode.prototype.connect as (this: AudioNode, ...args: unknown[]) => unknown;
  const analyserFor = (node: AudioNode, side: "mic" | "voice") => {
    const current = taps[side];
    if (current && current.context === node.context) return current;
    const analyser = node.context.createAnalyser();
    analyser.fftSize = 128;
    analyser.smoothingTimeConstant = 0.72;
    // A silent sink keeps the analyser pulled by the graph in every browser.
    const sink = node.context.createGain();
    sink.gain.value = 0;
    connect.call(analyser, sink);
    connect.call(sink, node.context.destination);
    taps[side] = analyser;
    return analyser;
  };
  AudioNode.prototype.connect = function (this: AudioNode, ...args: unknown[]) {
    const result = connect.apply(this, args);
    try {
      if (this instanceof AudioBufferSourceNode) connect.call(this, analyserFor(this, "voice"));
      else if (this instanceof MediaStreamAudioSourceNode) connect.call(this, analyserFor(this, "mic"));
    } catch {
      // Visual only: never let the tap break audio.
    }
    return result;
  } as typeof AudioNode.prototype.connect;
  (AudioNode.prototype as { __yaatalTap?: boolean }).__yaatalTap = true;
}

const BARS = 72;

export function startVisualizer(
  canvas: HTMLCanvasElement,
  getState: () => VisualState,
  getLevel: () => number,
): () => void {
  const context = canvas.getContext("2d");
  if (!context) return () => {};
  const still = matchMedia("(prefers-reduced-motion: reduce)").matches;
  const bins = new Uint8Array(64);
  const heights = new Float32Array(BARS);
  let angle = 0;
  let frame = 0;
  let last = performance.now();

  const spectrum = (analyser: AnalyserNode | null, fallback: number): ((i: number) => number) => {
    if (analyser) {
      analyser.getByteFrequencyData(bins);
      // Speech lives in the lower bins: mirror them around the ring so both halves move alike.
      return i => {
        const half = BARS / 2;
        const k = i < half ? i : BARS - 1 - i;
        return bins[Math.min(bins.length - 1, 2 + Math.floor((k / half) * 30))]! / 255;
      };
    }
    return i => fallback * (0.55 + 0.45 * Math.sin(i * 1.7 + performance.now() / 140));
  };

  const draw = (now: number) => {
    const dt = Math.min(0.05, (now - last) / 1000);
    last = now;
    const size = canvas.clientWidth;
    const ratio = Math.min(2, devicePixelRatio || 1);
    if (canvas.width !== Math.round(size * ratio)) {
      canvas.width = canvas.height = Math.round(size * ratio);
    }
    context.setTransform(ratio, 0, 0, ratio, 0, 0);
    context.clearRect(0, 0, size, size);

    const state = getState();
    const t = now / 1000;
    const level = getLevel();
    const source =
      state === "speaking" ? spectrum(taps.voice, 0.6) :
      state === "listening" ? spectrum(taps.mic, Math.min(1, level * 5)) : null;

    let energy = 0;
    for (let i = 0; i < BARS; i++) {
      const phase = i / BARS;
      let target: number;
      if (source) target = 0.08 + 0.92 * source(i);
      else if (state === "thinking") {
        const head = (t * 0.55) % 1;
        const gap = Math.min(Math.abs(phase - head), 1 - Math.abs(phase - head));
        target = 0.1 + 0.75 * Math.exp(-(gap * gap) / 0.004);
      } else if (state === "connecting") {
        const head = (t * 0.9) % 1;
        const gap = (phase - head + 1) % 1;
        target = gap < 0.18 ? 0.12 + 0.45 * (1 - gap / 0.18) : 0.06;
      } else target = 0.1 + 0.06 * Math.sin(t * 1.6 + phase * Math.PI * 4);
      if (still) target = source ? target : 0.12;
      heights[i]! += (target - heights[i]!) * Math.min(1, dt * 14);
      energy += heights[i]!;
    }
    energy /= BARS;
    if (!still) angle += dt * (state === "speaking" ? 0.25 + energy * 1.6 : state === "listening" ? 0.08 : 0.03);

    const center = size / 2;
    const inner = size * 0.29;
    const span = size * 0.17;
    const styles = getComputedStyle(canvas);
    const colorA = styles.getPropertyValue("--viz-a").trim() || "#e85a25";
    const colorB = styles.getPropertyValue("--viz-b").trim() || "#f3dcc0";
    context.lineCap = "round";
    context.lineWidth = Math.max(2, size * 0.011);
    for (let i = 0; i < BARS; i++) {
      const a = angle + (i / BARS) * Math.PI * 2;
      const h = heights[i]! * span;
      const cos = Math.cos(a), sin = Math.sin(a);
      context.strokeStyle = i % 2 ? colorB : colorA;
      context.globalAlpha = 0.35 + 0.65 * Math.min(1, heights[i]! * 1.4);
      context.beginPath();
      context.moveTo(center + cos * inner, center + sin * inner);
      context.lineTo(center + cos * (inner + h), center + sin * (inner + h));
      context.stroke();
    }
    context.globalAlpha = 1;
    // A soft halo that swells with the voice.
    const halo = context.createRadialGradient(center, center, inner * 0.7, center, center, inner + span);
    halo.addColorStop(0, "rgba(0,0,0,0)");
    halo.addColorStop(1, colorA);
    context.globalAlpha = Math.min(0.35, energy * 0.45);
    context.fillStyle = halo;
    context.beginPath();
    context.arc(center, center, inner + span, 0, Math.PI * 2);
    context.fill();
    context.globalAlpha = 1;

    frame = requestAnimationFrame(draw);
  };
  frame = requestAnimationFrame(draw);
  return () => cancelAnimationFrame(frame);
}
