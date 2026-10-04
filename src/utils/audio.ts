export interface Soundboard {
  muted: () => boolean;
  setMuted: (muted: boolean) => void;
  toggle: () => boolean;
  unlock: () => void;
  dice: () => void;
  step: () => void;
  capture: () => void;
  six: (delay?: number) => void;
  arrive: () => void;
  win: () => void;
  click: () => void;
}

export function createSoundboard(): Soundboard {
  let ctx: AudioContext | null = null;
  let muted = false;
  if (typeof window !== "undefined") {
    muted = window.localStorage.getItem("manch-muted") === "1";
  }

  function ac(): AudioContext | null {
    if (muted || typeof window === "undefined") return null;
    const Ctx = window.AudioContext || (window as unknown as { webkitAudioContext?: typeof AudioContext }).webkitAudioContext;
    if (!Ctx) return null;
    if (!ctx) ctx = new Ctx();
    if (ctx.state === "suspended") void ctx.resume();
    return ctx;
  }

  function tone(freq: number, dur: number, type: OscillatorType, gain = 0.08, slideTo?: number, delay = 0) {
    const audio = ac();
    if (!audio) return;
    const t = audio.currentTime + delay;
    const osc = audio.createOscillator();
    const amp = audio.createGain();
    osc.type = type;
    osc.frequency.setValueAtTime(freq, t);
    if (slideTo) osc.frequency.exponentialRampToValueAtTime(Math.max(40, slideTo), t + dur);
    amp.gain.setValueAtTime(gain, t);
    amp.gain.exponentialRampToValueAtTime(0.0001, t + dur);
    osc.connect(amp);
    amp.connect(audio.destination);
    osc.start(t);
    osc.stop(t + dur + 0.02);
  }

  function clack(when: number, loud: number, bright: number) {
    const audio = ac();
    if (!audio) return;
    const t = audio.currentTime + when;
    const dur = 0.016;
    const length = Math.max(1, Math.floor(audio.sampleRate * dur));
    const buffer = audio.createBuffer(1, length, audio.sampleRate);
    const data = buffer.getChannelData(0);
    for (let i = 0; i < length; i++) {
      const env = Math.exp(-i / (audio.sampleRate * 0.0022));
      data[i] = (Math.random() * 2 - 1) * env;
    }
    const src = audio.createBufferSource();
    src.buffer = buffer;
    const body = audio.createBiquadFilter();
    body.type = "bandpass";
    body.frequency.value = 700 + bright * 1600;
    body.Q.value = 1.4;
    const amp = audio.createGain();
    amp.gain.setValueAtTime(loud, t);
    amp.gain.exponentialRampToValueAtTime(0.0001, t + 0.045);
    src.connect(body);
    body.connect(amp);
    amp.connect(audio.destination);
    src.start(t);
    src.stop(t + 0.05);

    const knock = audio.createOscillator();
    const knockAmp = audio.createGain();
    knock.type = "triangle";
    knock.frequency.setValueAtTime(180 + bright * 70, t);
    knock.frequency.exponentialRampToValueAtTime(60, t + 0.04);
    knockAmp.gain.setValueAtTime(loud * 0.55, t);
    knockAmp.gain.exponentialRampToValueAtTime(0.0001, t + 0.05);
    knock.connect(knockAmp);
    knockAmp.connect(audio.destination);
    knock.start(t);
    knock.stop(t + 0.055);
  }

  return {
    muted: () => muted,
    setMuted: (value) => {
      muted = value;
      window.localStorage.setItem("manch-muted", value ? "1" : "0");
    },
    toggle: () => {
      muted = !muted;
      window.localStorage.setItem("manch-muted", muted ? "1" : "0");
      return muted;
    },
    unlock: () => {
      ac();
    },
    dice: () => {
      const hits = [0, 0.045, 0.09, 0.15, 0.22, 0.31, 0.42, 0.55, 0.7];
      hits.forEach((when, index) => {
        const last = index === hits.length - 1;
        const fade = 1 - index / hits.length;
        clack(when, last ? 0.28 : 0.08 + fade * 0.16, last ? 0.15 : Math.random());
      });
    },
    step: () => tone(640, 0.07, "sine", 0.05, 880),
    capture: () => {
      tone(220, 0.22, "sawtooth", 0.05, 70);
      tone(140, 0.18, "square", 0.03, 60, 0.02);
    },
    six: (delay = 0) => {
      [523, 659, 784].forEach((freq, i) => tone(freq, 0.12, "triangle", 0.06, undefined, delay + i * 0.07));
    },
    arrive: () => {
      [392, 523, 659, 784, 1046].forEach((freq, i) => tone(freq, 0.16, "triangle", 0.07, undefined, i * 0.09));
    },
    win: () => {
      [523, 659, 784, 1046].forEach((freq, i) => tone(freq, 0.22, "triangle", 0.07, undefined, i * 0.12));
    },
    click: () => tone(880, 0.04, "sine", 0.03),
  };
}
