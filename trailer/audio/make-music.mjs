// Procedural soundtrack for the AfterDark trailer. 120 BPM, A minor, 60 s, stereo 44.1 kHz.
// Section boundaries are bar lines (2 s) so every visual cut lands on the beat.
// Run: node audio/make-music.mjs  → public/music.wav
import { writeFileSync } from 'node:fs';

const SR = 44100;
const DUR = 60;
const N = SR * DUR;
const BPM = 120;
const STEP = 60 / BPM / 4; // 16th = 0.125 s
const BAR = STEP * 16; // 2 s

// ── tiny seeded RNG so every render is identical ──
let seed = 1337;
const rnd = () => ((seed = (seed * 1664525 + 1013904223) >>> 0) / 4294967296);
const noise = () => rnd() * 2 - 1;

const mkBus = () => ({ L: new Float32Array(N), R: new Float32Array(N) });
const drums = mkBus();
const bass = mkBus();
const music = mkBus();
const fx = mkBus();
const verb = mkBus(); // reverb send

const midi = (m) => 440 * 2 ** ((m - 69) / 12);
const clamp = (x, a, b) => Math.max(a, Math.min(b, x));

function put(bus, t, buf, gain = 1, pan = 0, send = 0) {
  const start = Math.round(t * SR);
  const gl = gain * Math.cos(((pan + 1) * Math.PI) / 4);
  const gr = gain * Math.sin(((pan + 1) * Math.PI) / 4);
  for (let i = 0; i < buf.length; i++) {
    const k = start + i;
    if (k < 0 || k >= N) continue;
    bus.L[k] += buf[i] * gl;
    bus.R[k] += buf[i] * gr;
    if (send) {
      verb.L[k] += buf[i] * gl * send;
      verb.R[k] += buf[i] * gr * send;
    }
  }
}
const lpCoef = (fc) => 1 - Math.exp((-2 * Math.PI * fc) / SR);

// ── instruments (return mono Float32Array) ──
function kick(len = 0.42) {
  const n = Math.floor(len * SR);
  const o = new Float32Array(n);
  let ph = 0;
  for (let i = 0; i < n; i++) {
    const t = i / SR;
    const f = 42 + 130 * Math.exp(-t * 32);
    ph += (2 * Math.PI * f) / SR;
    o[i] = Math.sin(ph) * Math.exp(-t * 6.5) + (i < 90 ? noise() * 0.5 * (1 - i / 90) : 0);
  }
  return o;
}
function snare(len = 0.32, tone = 190) {
  const n = Math.floor(len * SR);
  const o = new Float32Array(n);
  let lp = 0;
  for (let i = 0; i < n; i++) {
    const t = i / SR;
    const nz = noise();
    lp += 0.55 * (nz - lp);
    o[i] = ((nz - lp) * 0.9 * Math.exp(-t * 17) + Math.sin(2 * Math.PI * tone * t) * 0.5 * Math.exp(-t * 30)) * 0.9;
  }
  return o;
}
function clap() {
  const n = Math.floor(0.32 * SR);
  const o = new Float32Array(n);
  let lp = 0;
  for (let i = 0; i < n; i++) {
    const t = i / SR;
    const env = Math.exp(-t * 14) + 0.7 * Math.exp(-((t - 0.012) ** 2) * 9000) + 0.6 * Math.exp(-((t - 0.026) ** 2) * 9000);
    const nz = noise();
    lp += 0.35 * (nz - lp);
    o[i] = (nz - lp) * env * 0.6;
  }
  return o;
}
function hat(open = false) {
  const len = open ? 0.28 : 0.07;
  const n = Math.floor(len * SR);
  const o = new Float32Array(n);
  let lp = 0;
  for (let i = 0; i < n; i++) {
    const t = i / SR;
    const nz = noise();
    lp += 0.7 * (nz - lp);
    o[i] = (nz - lp) * Math.exp(-t * (open ? 13 : 70)) * 0.5;
  }
  return o;
}
function sawBass(freq, len, cutoff = 700, drive = 1.4, accent = 1) {
  const n = Math.floor(len * SR);
  const o = new Float32Array(n);
  let ph = 0;
  let y = 0;
  let sub = 0;
  for (let i = 0; i < n; i++) {
    const t = i / SR;
    ph = (ph + freq / SR) % 1;
    const saw = ph * 2 - 1;
    const fc = cutoff * (0.35 + 0.65 * Math.exp(-t * 9)) * accent + 90;
    y += lpCoef(fc) * (saw - y);
    sub = Math.sin(2 * Math.PI * freq * t);
    const env = Math.min(1, t * 400) * Math.exp(-Math.max(0, t - len * 0.65) * 18);
    o[i] = Math.tanh((y * 1.2 + sub * 0.9) * drive) * env * 0.55;
  }
  return o;
}
function pluck(freq, len = 0.28, bright = 1) {
  const n = Math.floor(len * SR);
  const o = new Float32Array(n);
  let y = 0;
  const p1 = rnd();
  let a = p1;
  let b = p1 * 0.5;
  for (let i = 0; i < n; i++) {
    const t = i / SR;
    a = (a + (freq * 1.004) / SR) % 1;
    b = (b + (freq * 0.996) / SR) % 1;
    const sq = a < 0.5 ? 1 : -1;
    const sw = b * 2 - 1;
    const fc = (500 + 5200 * Math.exp(-t * 12)) * bright;
    y += lpCoef(fc) * ((sq * 0.5 + sw * 0.6) - y);
    o[i] = y * Math.exp(-t * 11) * Math.min(1, t * 800) * 0.5;
  }
  return o;
}
function lead(freq, len, vib = 0.004) {
  const n = Math.floor(len * SR);
  const o = new Float32Array(n);
  let y = 0;
  let ph1 = 0;
  let ph2 = 0;
  for (let i = 0; i < n; i++) {
    const t = i / SR;
    const f = freq * (1 + vib * Math.sin(2 * Math.PI * 5.5 * t) * Math.min(1, t * 4));
    ph1 = (ph1 + (f * 1.006) / SR) % 1;
    ph2 = (ph2 + (f * 0.994) / SR) % 1;
    const raw = (ph1 * 2 - 1) * 0.5 + (ph2 * 2 - 1) * 0.5;
    y += lpCoef(2600 + 1800 * Math.exp(-t * 6)) * (raw - y);
    const env = Math.min(1, t * 90) * Math.exp(-Math.max(0, t - (len - 0.08)) * 40) * (0.85 + 0.15 * Math.exp(-t * 3));
    o[i] = y * env * 0.4;
  }
  return o;
}
function pad(chord, len, cutoff = 1400, level = 0.16) {
  const n = Math.floor(len * SR);
  const o = new Float32Array(n);
  const phs = chord.flatMap((m) => [0, 0, 0].map(() => rnd()));
  const frs = chord.flatMap((m) => [midi(m) * 0.994, midi(m), midi(m) * 1.006]);
  let y = 0;
  for (let i = 0; i < n; i++) {
    const t = i / SR;
    let s = 0;
    for (let k = 0; k < frs.length; k++) {
      phs[k] = (phs[k] + frs[k] / SR) % 1;
      s += phs[k] * 2 - 1;
    }
    s /= frs.length / 1.6;
    y += lpCoef(cutoff * (0.6 + 0.4 * Math.sin(t * 0.8))) * (s - y);
    const env = Math.min(1, t * 2.5) * Math.min(1, (len - t) * 2.5);
    o[i] = y * env * level;
  }
  return o;
}
function supersaw(chord, len, level = 0.2) {
  const n = Math.floor(len * SR);
  const o = new Float32Array(n);
  const det = [-0.012, -0.006, 0, 0.006, 0.012];
  const frs = chord.flatMap((m) => det.map((d) => midi(m) * (1 + d)));
  const phs = frs.map(() => rnd());
  let y = 0;
  for (let i = 0; i < n; i++) {
    const t = i / SR;
    let s = 0;
    for (let k = 0; k < frs.length; k++) {
      phs[k] = (phs[k] + frs[k] / SR) % 1;
      s += phs[k] * 2 - 1;
    }
    s /= frs.length / 1.8;
    y += lpCoef(3800 * (0.5 + 0.5 * Math.exp(-t * 4)) + 600) * (s - y);
    const env = Math.min(1, t * 120) * Math.exp(-Math.max(0, t - (len - 0.1)) * 30);
    o[i] = y * env * level;
  }
  return o;
}
function riser(len, from = 200, to = 9000, level = 0.5) {
  const n = Math.floor(len * SR);
  const o = new Float32Array(n);
  let y = 0;
  let y2 = 0;
  let ph = 0;
  for (let i = 0; i < n; i++) {
    const p = i / n;
    const fc = from * (to / from) ** (p * p);
    y += lpCoef(fc) * (noise() - y);
    y2 += lpCoef(fc * 1.5) * (y - y2);
    ph += (2 * Math.PI * (120 + 1400 * p * p)) / SR;
    o[i] = (y * 3.2 + Math.sin(ph) * 0.18 * p) * (0.15 + 0.85 * p ** 1.6) * level;
  }
  return o;
}
function downSweep(len, from = 7000, to = 120, level = 0.5) {
  const n = Math.floor(len * SR);
  const o = new Float32Array(n);
  let y = 0;
  for (let i = 0; i < n; i++) {
    const p = i / n;
    const fc = from * (to / from) ** p;
    y += lpCoef(fc) * (noise() - y);
    o[i] = y * 3 * (1 - p) ** 1.5 * Math.min(1, i / 200) * level;
  }
  return o;
}
function impact(len = 2.4, level = 1) {
  const n = Math.floor(len * SR);
  const o = new Float32Array(n);
  let ph = 0;
  let y = 0;
  for (let i = 0; i < n; i++) {
    const t = i / SR;
    ph += (2 * Math.PI * (34 + 90 * Math.exp(-t * 14))) / SR;
    y += lpCoef(2400 * Math.exp(-t * 3) + 120) * (noise() - y);
    o[i] = (Math.sin(ph) * Math.exp(-t * 1.9) * 0.9 + y * Math.exp(-t * 5) * 0.8) * Math.min(1, t * 900) * level;
  }
  return o;
}
function reverseCrash(len, level = 0.6) {
  const n = Math.floor(len * SR);
  const o = new Float32Array(n);
  let lp = 0;
  for (let i = 0; i < n; i++) {
    const p = i / n;
    const nz = noise();
    lp += 0.5 * (nz - lp);
    o[i] = (nz - lp) * p ** 3 * level;
  }
  return o;
}
function crash(len = 1.8, level = 0.6) {
  const n = Math.floor(len * SR);
  const o = new Float32Array(n);
  let lp = 0;
  for (let i = 0; i < n; i++) {
    const t = i / SR;
    const nz = noise();
    lp += 0.45 * (nz - lp);
    o[i] = (nz - lp) * Math.exp(-t * 2.6) * level;
  }
  return o;
}
function heartbeat(level = 0.9) {
  const mk = (len, f) => {
    const n = Math.floor(len * SR);
    const o = new Float32Array(n);
    let ph = 0;
    for (let i = 0; i < n; i++) {
      const t = i / SR;
      ph += (2 * Math.PI * (f + 40 * Math.exp(-t * 30))) / SR;
      o[i] = Math.sin(ph) * Math.exp(-t * 12) * level;
    }
    return o;
  };
  return [mk(0.3, 48), mk(0.3, 42)];
}
function siren(len, level = 0.28) {
  const n = Math.floor(len * SR);
  const o = new Float32Array(n);
  let ph = 0;
  let y = 0;
  for (let i = 0; i < n; i++) {
    const t = i / SR;
    const f = 760 + 220 * Math.sin(2 * Math.PI * 1.0 * t) + 120 * Math.sin(2 * Math.PI * 4 * t) * 0;
    ph = (ph + f / SR) % 1;
    const sq = ph < 0.5 ? 1 : -1;
    y += lpCoef(2400) * (sq - y);
    o[i] = y * level * Math.min(1, t * 20) * Math.min(1, (len - t) * 8);
  }
  return o;
}
function tick(f = 1800, level = 0.4) {
  const n = Math.floor(0.05 * SR);
  const o = new Float32Array(n);
  for (let i = 0; i < n; i++) {
    const t = i / SR;
    o[i] = Math.sin(2 * Math.PI * f * t) * Math.exp(-t * 120) * level;
  }
  return o;
}
function glitch(len = 0.5, level = 0.5) {
  const n = Math.floor(len * SR);
  const o = new Float32Array(n);
  let hold = 0;
  let cnt = 0;
  const f = () => 40 + Math.floor(rnd() * 500);
  let seg = f();
  for (let i = 0; i < n; i++) {
    if (cnt++ >= seg) {
      hold = Math.sin((i / SR) * 2 * Math.PI * (200 + rnd() * 2400)) > 0 ? 1 : -1;
      if (rnd() < 0.3) hold = noise();
      seg = f();
      cnt = 0;
    }
    const g = Math.floor(i / (SR * 0.045)) % 3 === 2 ? 0 : 1;
    o[i] = hold * g * level * (1 - i / n);
  }
  return o;
}
function whoosh(len = 0.9, level = 0.5) {
  const n = Math.floor(len * SR);
  const o = new Float32Array(n);
  let y = 0;
  for (let i = 0; i < n; i++) {
    const p = i / n;
    const fc = 300 + 7000 * Math.sin(Math.PI * p) ** 1.5;
    y += lpCoef(fc) * (noise() - y);
    o[i] = y * 3 * Math.sin(Math.PI * p) ** 1.6 * level;
  }
  return o;
}
function stab(freq, len = 0.5, level = 0.4) {
  const n = Math.floor(len * SR);
  const o = new Float32Array(n);
  let p1 = 0;
  let p2 = 0;
  let y = 0;
  for (let i = 0; i < n; i++) {
    const t = i / SR;
    p1 = (p1 + freq / SR) % 1;
    p2 = (p2 + (freq * 1.5 * 1.003) / SR) % 1;
    const raw = (p1 * 2 - 1) + 0.6 * (p2 < 0.5 ? 1 : -1);
    y += lpCoef(1800 * Math.exp(-t * 7) + 250) * (raw - y);
    o[i] = Math.tanh(y * 2.2) * Math.exp(-t * 8) * level;
  }
  return o;
}

// ── arrangement ──
const SECTIONS = [
  ['intro', 0, 6],
  ['title', 6, 10],
  ['setup', 10, 18],
  ['roles', 18, 26],
  ['crew', 26, 34],
  ['imposter', 34, 44],
  ['meeting', 44, 50],
  ['final', 50, 56],
  ['outro', 56, 60],
];
const sec = (t) => SECTIONS.find(([, a, b]) => t >= a && t < b)?.[0];

const CHORDS_LIGHT = [
  [57, 60, 64], // Am
  [53, 57, 60], // F
  [60, 64, 67], // C
  [55, 59, 62], // G
];
const CHORDS_DARK = [
  [57, 60, 64], // Am
  [58, 62, 65], // Bb
  [57, 60, 64], // Am
  [52, 56, 59], // E
];
const ROOTS_LIGHT = [33, 29, 36, 31]; // A1 F1 C2 G1
const ROOTS_DARK = [33, 34, 33, 28];

const kickTimes = [];
const addKick = (t, g = 1) => {
  put(drums, t, kick(), g);
  kickTimes.push(t);
};

// intro: heartbeat, drone, riser, snare roll, reverse crash, vox-ish glitches on each text slam
{
  const [h1, h2] = heartbeat(1.0);
  for (let b = 0; b < 8; b++) {
    const t0 = 0.2 + b * 0.75;
    if (t0 > 4.9) break;
    put(drums, t0, h1, 0.6 + b * 0.04);
    put(drums, t0 + 0.2, h2, 0.45 + b * 0.04);
  }
  put(music, 0, pad([45, 52, 57], 6.2, 500, 0.4), 1, 0, 0.5);
  put(fx, 0, riser(6, 150, 11000, 0.8), 1, 0, 0.2);
  // text slams at 0.5 / 2.0 / 3.5
  for (const [t, g] of [[0.5, 0.7], [2.0, 0.8], [3.5, 1.0]]) {
    put(fx, t, impact(1.6, g * 0.8), 1, 0, 0.3);
    put(fx, t, glitch(0.22, 0.25), 1, 0.3);
  }
  put(fx, 3.5, glitch(0.7, 0.35), 1, -0.3);
  // snare roll 4 → 6
  let t = 4.0;
  let gap = 0.25;
  let k = 0;
  while (t < 5.95) {
    put(drums, t, snare(0.2), 0.35 + (t - 4) * 0.28, (k % 2 ? 0.2 : -0.2));
    t += gap;
    k++;
    if (t > 4.5) gap = 0.125;
    if (t > 5.25) gap = 0.0625;
  }
  put(fx, 6 - 1.5, reverseCrash(1.5, 0.8), 1, 0, 0.3);
}

// per-step beat engine
for (let s = 0; s < Math.floor(DUR / STEP); s++) {
  const t = s * STEP;
  const name = sec(t);
  if (!name || name === 'intro') continue;
  const bar = Math.floor(t / BAR);
  const stepInBar = s % 16;
  const barIdx = bar % 4;
  const dark = name === 'imposter';
  const chords = dark ? CHORDS_DARK : CHORDS_LIGHT;
  const roots = dark ? ROOTS_DARK : ROOTS_LIGHT;
  const chord = chords[barIdx];
  const root = roots[barIdx];
  const secStart = SECTIONS.find(([n]) => n === name)[1];
  const secBar = Math.floor((t - secStart) / BAR);
  const sub = (t - secStart) / BAR;

  const full = ['title', 'setup', 'crew', 'imposter', 'final'].includes(name);
  const tense = name === 'roles';
  const kickOn = full || (tense && secBar >= 0);

  // kick: four on the floor
  if (kickOn && stepInBar % 4 === 0) addKick(t, tense ? 0.8 : 1);
  // clap/snare on 2 & 4
  if ((full || (tense && secBar >= 2)) && (stepInBar === 4 || stepInBar === 12)) {
    put(drums, t, clap(), 0.7, 0.05, 0.15);
    if (name !== 'title') put(drums, t, snare(0.25), 0.28);
  }
  // hats
  if (full || tense) {
    if (stepInBar % 4 === 2) put(drums, t, hat(true), 0.4, 0.3);
    if (name !== 'title' && stepInBar % 2 === 1) put(drums, t, hat(false), 0.28 + (stepInBar % 4 === 3 ? 0.1 : 0), -0.25);
    if (name === 'final' && stepInBar % 2 === 0) put(drums, t, hat(false), 0.22, 0.25);
  }
  // bass
  if (full || tense) {
    const pat = dark ? [0, 3, 6, 8, 10, 11, 14] : [0, 3, 6, 8, 11, 14];
    if (pat.includes(stepInBar)) {
      const oct = stepInBar === 11 || stepInBar === 14 ? 12 : 0;
      const len = dark ? STEP * 1.7 : STEP * 2.4;
      put(bass, t, sawBass(midi(root + oct), len, dark ? 1100 : 800, dark ? 2.6 : 1.5, stepInBar === 0 ? 1.4 : 1), tense ? 0.7 : 1);
    }
  }
  // arp pluck
  const arpOn = (name === 'setup') || name === 'crew' || name === 'final' || (name === 'title' && secBar >= 1) || (name === 'roles' && secBar >= 1) || dark;
  if (arpOn) {
    const idx = [0, 2, 1, 2, 0, 2, 1, 2, 0, 2, 1, 2, 0, 2, 3, 2][stepInBar];
    const note = idx === 3 ? chord[0] + 24 : chord[idx] + 12;
    const g = dark ? 0.7 : 0.8;
    put(music, t, pluck(midi(note), STEP * 2.2, dark ? 0.7 : 1), g, ((stepInBar % 4) - 1.5) * 0.35, 0.28);
  }
  // pad
  if (stepInBar === 0 && name !== 'intro') {
    const quiet = name === 'meeting' ? 0.7 : 1;
    put(music, t, pad(chord.map((m) => m + 12), BAR * 1.02, dark ? 900 : 1500, tense ? 0.2 : 0.16 * quiet), 1, 0, 0.45);
  }
  // supersaw stabs on the offbeat of final + crew drop
  if ((name === 'final' || (name === 'crew' && secBar >= 2)) && (stepInBar === 0 || stepInBar === 6 || stepInBar === 10)) {
    put(music, t, supersaw(chord.map((m) => m + 12), STEP * 2.6, 0.22), 1, 0, 0.35);
  }
  // dark stab
  if (dark && (stepInBar === 2 || stepInBar === 7 || stepInBar === 13)) {
    put(music, t, stab(midi(chord[0] + 12), STEP * 3, 0.42), 1, stepInBar === 7 ? 0.4 : -0.4, 0.3);
  }
}

// lead melody (crew + final)
const MOTIF = [
  [[0, 76, 3], [4, 72, 2], [6, 74, 2], [8, 76, 4]],
  [[0, 77, 3], [4, 81, 2], [8, 79, 2], [10, 77, 2], [12, 76, 4]],
  [[0, 79, 3], [4, 76, 2], [6, 79, 2], [8, 84, 4]],
  [[0, 83, 2], [2, 81, 2], [4, 79, 4], [8, 74, 4]],
];
function playLead(from, to, oct = 0, level = 1) {
  for (let t = from; t < to - 1e-6; t += BAR) {
    const bar = Math.floor(t / BAR) % 4;
    for (const [st, m, len] of MOTIF[bar]) {
      put(music, t + st * STEP, lead(midi(m + oct), len * STEP, 0.004), level, 0.1, 0.4);
    }
  }
}
playLead(26, 34, 0, 0.9);
playLead(50, 56, 0, 1);
playLead(18 + 4, 26, -12, 0.55); // roles: low, restrained in the second half
// the dark section: a descending minor-second motif
for (let t = 36; t < 44; t += BAR) {
  const b = Math.floor(t / BAR) % 4;
  const notes = b === 0 ? [81, 80, 81] : b === 1 ? [82, 81, 82] : b === 2 ? [81, 80, 81] : [80, 76, 71];
  notes.forEach((m, i) => put(music, t + i * 4 * STEP, lead(midi(m), 3.4 * STEP, 0.006), 0.55, -0.2, 0.55));
}

// section transition FX
const hit = (t, level = 1, crashToo = true) => {
  put(fx, t, impact(2.6, level), 1, 0, 0.35);
  if (crashToo) put(fx, t, crash(2.0, 0.55 * level), 1, 0, 0.3);
};
hit(6.0, 1.15);
put(fx, 9.0, whoosh(1.0, 0.45), 1, 0, 0.2);
hit(10.0, 0.7);
put(fx, 9.0, reverseCrash(1.0, 0.5), 1);
for (const [t, w] of [[14, 0.6], [18, 0.5], [26, 0.6], [34, 0.6], [44, 0.5], [50, 0.7]]) {
  put(fx, t - 0.7, whoosh(0.9, w), 1, 0, 0.25);
}
hit(18.0, 0.8, false);
hit(26.0, 0.9);
put(fx, 34 - 1.0, reverseCrash(1.0, 0.7), 1);
put(fx, 34, downSweep(1.6, 8000, 100, 0.7), 1, 0, 0.3);
hit(34.0, 1.1);
// jam glitch + mute window at 39.0–39.5 (SYSTEMS JAMMED)
put(fx, 39.0, glitch(0.55, 0.55), 1, 0, 0.2);
put(fx, 39.0, downSweep(0.6, 3000, 80, 0.8), 1);
hit(39.5, 0.8, false);
// infection channel ticks (imposter), 36 → 39: rising ticks
for (let i = 0; i < 24; i++) put(fx, 35.2 + i * 0.125 + (i * i) * 0.0005, tick(1400 + i * 55, 0.25), 1, i % 2 ? 0.4 : -0.4);

// meeting: alarm, then ticking clock + riser
put(fx, 44, siren(3.0, 0.3), 1, 0, 0.25);
put(fx, 44, impact(2.4, 1.0), 1, 0, 0.3);
for (let t = 46.5; t < 50; t += 0.5) put(fx, t, tick(t % 1 === 0 ? 2200 : 1700, 0.22), 1, 0.3);
put(fx, 46.0, riser(4.0, 180, 12000, 0.85), 1, 0, 0.2);
{
  let t = 48.0;
  let gap = 0.25;
  let k = 0;
  while (t < 49.95) {
    put(drums, t, snare(0.2), 0.3 + (t - 48) * 0.3, k % 2 ? 0.2 : -0.2);
    t += gap;
    k++;
    if (t > 48.75) gap = 0.125;
    if (t > 49.5) gap = 0.0625;
  }
  put(fx, 50 - 1.2, reverseCrash(1.2, 0.8), 1);
}
// meeting: kick-less, heartbeat pulse
{
  const [h1, h2] = heartbeat(0.9);
  for (let t = 44.2; t < 48; t += 0.75) {
    put(drums, t, h1, 0.5);
    put(drums, t + 0.2, h2, 0.38);
  }
}
hit(50.0, 1.25);
// results flips: subtle ticks
for (let i = 0; i < 8; i++) put(fx, 51.5 + i * 0.25, tick(900 + i * 140, 0.28), 1, (i % 4) * 0.5 - 0.7);
// outro
hit(56.0, 1.2);
put(music, 56, supersaw([57, 60, 64, 69], 3.6, 0.25), 1, 0, 0.6);
put(music, 56, pad([45, 52, 57, 64], 4.0, 1800, 0.22), 1, 0, 0.6);
put(bass, 56, sawBass(midi(33), 3.2, 600, 1.4), 1);
addKick(56.0, 1.1);
for (let i = 0; i < 6; i++) put(fx, 57.5 + i * 0.5, tick(2600 - i * 120, 0.1), 1, 0.4);

// ── sidechain ──
const duck = new Float32Array(N).fill(1);
for (const kt of kickTimes) {
  const s0 = Math.round(kt * SR);
  for (let i = 0; i < SR * 0.35 && s0 + i < N; i++) {
    const t = i / SR;
    const d = 1 - 0.72 * Math.exp(-t * 9) * Math.min(1, t * 220 + 0.15);
    if (d < duck[s0 + i]) duck[s0 + i] = d;
  }
}

// ── reverb (Schroeder) on the send ──
function reverb(inp, delays, fb = 0.78) {
  const out = new Float32Array(N);
  for (const d of delays) {
    const buf = new Float32Array(d);
    let idx = 0;
    let lp = 0;
    for (let i = 0; i < N; i++) {
      const y = buf[idx];
      lp += 0.35 * (y - lp);
      buf[idx] = inp[i] + lp * fb;
      idx = (idx + 1) % d;
      out[i] += y * 0.28;
    }
  }
  // two allpass
  for (const d of [225, 556]) {
    const buf = new Float32Array(d);
    let idx = 0;
    for (let i = 0; i < N; i++) {
      const y = buf[idx];
      const x = out[i];
      buf[idx] = x + y * 0.5;
      out[i] = y - x * 0.5;
      idx = (idx + 1) % d;
    }
  }
  return out;
}
const vl = reverb(verb.L, [1557, 1617, 1491, 1422]);
const vr = reverb(verb.R, [1580, 1640, 1514, 1445]);

// ── master ──
const outL = new Float32Array(N);
const outR = new Float32Array(N);
const muteWin = (t) => (t >= 39.0 && t < 39.5 ? 0.04 : 1);
for (let i = 0; i < N; i++) {
  const t = i / SR;
  const d = duck[i];
  const m = muteWin(t);
  // roles: tense — low-pass the music slightly via lower gain; meeting: muffled by lower level
  const secName = sec(t);
  const musicGain = secName === 'meeting' ? 0.55 : 1;
  let l = drums.L[i] * 0.95 + bass.L[i] * d * 0.95 + music.L[i] * d * 0.8 * musicGain + fx.L[i] * 0.95 + vl[i] * 0.55;
  let r = drums.R[i] * 0.95 + bass.R[i] * d * 0.95 + music.R[i] * d * 0.8 * musicGain + fx.R[i] * 0.95 + vr[i] * 0.55;
  const fxOnly = fx.L[i];
  l = l * m + (m < 1 ? fxOnly * 0.9 : 0);
  r = r * m + (m < 1 ? fx.R[i] * 0.9 : 0);
  // fade in/out
  const fade = Math.min(1, t / 0.15) * Math.min(1, (DUR - t) / 1.2);
  outL[i] = Math.tanh(l * 1.05) * fade;
  outR[i] = Math.tanh(r * 1.05) * fade;
}
let peak = 0;
for (let i = 0; i < N; i++) peak = Math.max(peak, Math.abs(outL[i]), Math.abs(outR[i]));
const norm = 0.89 / peak;

// 16-bit stereo WAV
const data = Buffer.alloc(N * 4);
for (let i = 0; i < N; i++) {
  data.writeInt16LE(Math.round(clamp(outL[i] * norm, -1, 1) * 32767), i * 4);
  data.writeInt16LE(Math.round(clamp(outR[i] * norm, -1, 1) * 32767), i * 4 + 2);
}
const hdr = Buffer.alloc(44);
hdr.write('RIFF', 0);
hdr.writeUInt32LE(36 + data.length, 4);
hdr.write('WAVEfmt ', 8);
hdr.writeUInt32LE(16, 16);
hdr.writeUInt16LE(1, 20);
hdr.writeUInt16LE(2, 22);
hdr.writeUInt32LE(SR, 24);
hdr.writeUInt32LE(SR * 4, 28);
hdr.writeUInt16LE(4, 32);
hdr.writeUInt16LE(16, 34);
hdr.write('data', 36);
hdr.writeUInt32LE(data.length, 40);
writeFileSync(new URL('../public/music.wav', import.meta.url), Buffer.concat([hdr, data]));
console.log('wrote music.wav, peak', peak.toFixed(2));
