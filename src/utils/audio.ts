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

  function diceHit(when: number, loud: number, toneHz: number) {
    const audio = ac();
    if (!audio) return;
    const t = audio.currentTime + when;
    const dur = 0.04;
    const length = Math.max(1, Math.floor(audio.sampleRate * dur));
    const buffer = audio.createBuffer(1, length, audio.sampleRate);
    const data = buffer.getChannelData(0);
    for (let i = 0; i < length; i++) {
      const env = Math.pow(1 - i / length, 1.7);
      data[i] = (Math.random() * 2 - 1) * env;
    }
    const src = audio.createBufferSource();
    src.buffer = buffer;
    const band = audio.createBiquadFilter();
    band.type = "bandpass";
    band.frequency.setValueAtTime(toneHz, t);
    band.Q.value = 0.85;
    const amp = audio.createGain();
    amp.gain.setValueAtTime(loud, t);
    amp.gain.exponentialRampToValueAtTime(0.0001, t + 0.045);
    src.connect(band);
    band.connect(amp);
    amp.connect(audio.destination);
    src.start(t);
    src.stop(t + 0.05);

    const body = audio.createOscillator();
    const bodyAmp = audio.createGain();
    body.type = "sine";
    body.frequency.setValueAtTime(Math.max(160, toneHz * 0.18), t);
    body.frequency.exponentialRampToValueAtTime(110, t + 0.035);
    bodyAmp.gain.setValueAtTime(loud * 0.35, t);
    bodyAmp.gain.exponentialRampToValueAtTime(0.0001, t + 0.04);
    body.connect(bodyAmp);
    bodyAmp.connect(audio.destination);
    body.start(t);
    body.stop(t + 0.045);
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
      const hits: Array<[number, number, number]> = [
        [0, 0.07, 1680],
        [0.055, 0.05, 1320],
        [0.11, 0.036, 1040],
        [0.18, 0.024, 860],
        [0.27, 0.016, 720],
      ];
      hits.forEach(([when, loud, toneHz]) => {
        const jitter = (Math.random() - 0.5) * 0.014;
        diceHit(Math.max(0, when + jitter), loud, toneHz * (0.94 + Math.random() * 0.1));
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
