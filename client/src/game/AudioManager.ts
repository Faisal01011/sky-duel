export class AudioManager {
  private ctx: AudioContext | null = null;
  private enabled = true;
  private masterGain: GainNode | null = null;
  private engineOsc: OscillatorNode | null = null;
  private engineGain: GainNode | null = null;

  constructor() {
    const resume = () => {
      if (!this.ctx) {
        try {
          this.ctx = new (window.AudioContext || (window as any).webkitAudioContext)();
          this.masterGain = this.ctx.createGain();
          this.masterGain.gain.value = 0.35;
          this.masterGain.connect(this.ctx.destination);
        } catch { this.enabled = false; }
      }
      if (this.ctx?.state === "suspended") this.ctx.resume();
      window.removeEventListener("click", resume);
      window.removeEventListener("keydown", resume);
    };
    window.addEventListener("click", resume);
    window.addEventListener("keydown", resume);
  }

  private ensureCtx(): AudioContext | null {
    if (!this.ctx) {
      try {
        this.ctx = new (window.AudioContext || (window as any).webkitAudioContext)();
        this.masterGain = this.ctx.createGain();
        this.masterGain.gain.value = 0.35;
        this.masterGain.connect(this.ctx.destination);
      } catch { return null; }
    }
    if (this.ctx.state === "suspended") this.ctx.resume();
    return this.ctx;
  }

  play(soundId: string) {
    if (!this.enabled) return;
    const ctx = this.ensureCtx();
    if (!ctx || !this.masterGain) return;

    const now = ctx.currentTime;
    const osc = ctx.createOscillator();
    const gain = ctx.createGain();
    const filter = ctx.createBiquadFilter();
    filter.type = "lowpass";
    osc.connect(filter);
    filter.connect(gain);
    gain.connect(this.masterGain);

    switch (soundId) {
      case "shoot": {
        osc.type = "square";
        osc.frequency.setValueAtTime(620, now);
        osc.frequency.exponentialRampToValueAtTime(120, now + 0.08);
        gain.gain.setValueAtTime(0.5, now);
        gain.gain.exponentialRampToValueAtTime(0.01, now + 0.12);
        filter.frequency.setValueAtTime(3000, now);
        osc.start(now);
        osc.stop(now + 0.13);
        break;
      }
      case "hit": {
        osc.type = "triangle";
        osc.frequency.setValueAtTime(180, now);
        osc.frequency.linearRampToValueAtTime(60, now + 0.14);
        gain.gain.setValueAtTime(0.45, now);
        gain.gain.exponentialRampToValueAtTime(0.01, now + 0.18);
        osc.start(now);
        osc.stop(now + 0.19);
        // noise burst
        this.playNoise(0.12, 0.25);
        break;
      }
      case "explosion": {
        osc.type = "sawtooth";
        osc.frequency.setValueAtTime(120, now);
        osc.frequency.exponentialRampToValueAtTime(18, now + 0.45);
        gain.gain.setValueAtTime(0.75, now);
        gain.gain.exponentialRampToValueAtTime(0.01, now + 0.5);
        filter.frequency.setValueAtTime(800, now);
        filter.frequency.linearRampToValueAtTime(120, now + 0.45);
        osc.start(now);
        osc.stop(now + 0.52);
        this.playNoise(0.4, 0.5);
        break;
      }
      case "engine": {
        // continuous engine tone handled separately
        break;
      }
      default: {
        osc.type = "sine";
        osc.frequency.setValueAtTime(440, now);
        gain.gain.setValueAtTime(0.3, now);
        gain.gain.exponentialRampToValueAtTime(0.01, now + 0.12);
        osc.start(now);
        osc.stop(now + 0.13);
      }
    }
  }

  private playNoise(duration = 0.2, volume = 0.3) {
    const ctx = this.ensureCtx();
    if (!ctx || !this.masterGain) return;
    const len = Math.floor(ctx.sampleRate * duration);
    const buffer = ctx.createBuffer(1, len, ctx.sampleRate);
    const data = buffer.getChannelData(0);
    for (let i = 0; i < len; i++) data[i] = (Math.random() * 2 - 1) * (1 - i / len);
    const src = ctx.createBufferSource();
    src.buffer = buffer;
    const g = ctx.createGain();
    g.gain.setValueAtTime(volume, ctx.currentTime);
    g.gain.exponentialRampToValueAtTime(0.01, ctx.currentTime + duration);
    src.connect(g);
    g.connect(this.masterGain);
    src.start();
  }

  stop(_soundId: string) {
    // placeholder for compatibility
  }

  setEngineIntensity(intensity: number) {
    // 0..1 maps to pitch/volume
    const ctx = this.ensureCtx();
    if (!ctx || !this.enabled) return;
    if (!this.engineOsc) {
      try {
        this.engineOsc = ctx.createOscillator();
        this.engineGain = ctx.createGain();
        this.engineGain.gain.value = 0;
        const filt = ctx.createBiquadFilter();
        filt.type = "lowpass";
        filt.frequency.value = 600;
        this.engineOsc.type = "sawtooth";
        this.engineOsc.connect(filt);
        filt.connect(this.engineGain);
        this.engineGain.connect(this.masterGain!);
        this.engineOsc.start();
      } catch { return; }
    }
    if (this.engineOsc && this.engineGain) {
      const now = ctx.currentTime;
      this.engineOsc.frequency.linearRampToValueAtTime(40 + intensity * 60, now + 0.08);
      this.engineGain.gain.linearRampToValueAtTime(0.04 + intensity * 0.08, now + 0.08);
    }
  }

  setMuted(muted: boolean) {
    if (this.masterGain) this.masterGain.gain.value = muted ? 0 : 0.35;
  }
}
