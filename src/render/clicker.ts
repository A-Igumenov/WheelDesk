// Wheel click sound, synthesised once so no audio asset is needed and the
// sound is identical on every OS. Will move into the Rust audio engine later
// so it shares the output device and latency with music playback.
export class Clicker {
  private ctx: AudioContext | null = null;
  private buffer: AudioBuffer | null = null;

  tick(): void {
    try {
      if (!this.ctx) {
        this.ctx = new AudioContext();
        this.buffer = makeClick(this.ctx);
      }
      if (this.ctx.state === "suspended") void this.ctx.resume();
      const src = this.ctx.createBufferSource();
      src.buffer = this.buffer;
      const gain = this.ctx.createGain();
      gain.gain.value = 0.35;
      src.connect(gain).connect(this.ctx.destination);
      src.start();
    } catch {
      /* audio unavailable: stay silent */
    }
  }
}

function makeClick(ctx: AudioContext): AudioBuffer {
  const len = Math.round(ctx.sampleRate * 0.006);
  const buf = ctx.createBuffer(1, len, ctx.sampleRate);
  const data = buf.getChannelData(0);
  for (let i = 0; i < len; i++) {
    const env = Math.exp(-i / (len / 6));
    // Short decaying burst with alternating sign: a dry, high "tick".
    data[i] = (i % 2 === 0 ? 1 : -1) * env * (0.6 + 0.4 * Math.random());
  }
  return buf;
}

/** Alarm sound: a two-tone beep every second until stopped. */
export class AlarmTone {
  private ctx: AudioContext | null = null;
  private timer: number | undefined;

  start(): void {
    if (this.timer !== undefined) return;
    try {
      this.ctx ??= new AudioContext();
      if (this.ctx.state === "suspended") void this.ctx.resume();
    } catch {
      return;
    }
    const ring = () => {
      const ac = this.ctx!;
      for (const [freq, at] of [[880, 0], [1175, 0.18], [880, 0.36]] as const) {
        const o = ac.createOscillator();
        const g = ac.createGain();
        o.type = "square";
        o.frequency.value = freq;
        const t0 = ac.currentTime + at;
        g.gain.setValueAtTime(0.0001, t0);
        g.gain.exponentialRampToValueAtTime(0.12, t0 + 0.01);
        g.gain.exponentialRampToValueAtTime(0.0001, t0 + 0.15);
        o.connect(g).connect(ac.destination);
        o.start(t0);
        o.stop(t0 + 0.16);
      }
    };
    ring();
    this.timer = window.setInterval(ring, 1000);
  }

  stop(): void {
    window.clearInterval(this.timer);
    this.timer = undefined;
  }
}
