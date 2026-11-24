// AfterDark cinematic trailer score + sound design. 60 s, 120 BPM, A minor, 48 kHz stereo.
// Every sound effect is placed on the frame its picture event happens (see src/cine/*.tsx).
// Run: node audio/make-music.mjs  → public/music.wav
import { readFileSync, writeFileSync } from 'node:fs';

const TL = JSON.parse(readFileSync(new URL('../src/cine/timeline.json', import.meta.url)));
const SC = TL.scenes;
const at = (id, frames = 0) => SC[id][0] + frames / 30;

const SR = 48000;
const DUR = TL.duration;
const N = SR * DUR;
const STEP = 0.125; // 16th at 120 BPM
const BAR = 2;

let seed = 2024;
const rnd = () => (seed = (seed * 1664525 + 1013904223) >>> 0) / 4294967296;
const noise = () => rnd() * 2 - 1;
const midi = (m) => 440 * 2 ** ((m - 69) / 12);
const clamp = (x, a, b) => Math.max(a, Math.min(b, x));
const lp = (fc) => 1 - Math.exp((-2 * Math.PI * fc) / SR);

const bus = () => ({ L: new Float32Array(N), R: new Float32Array(N) });
const drums = bus();
const bass = bus();
const music = bus();
const sfx = bus();
const verb = bus();

function put(b, t, buf, gain = 1, pan = 0, send = 0) {
  const s0 = Math.round(t * SR);
  const gl = gain * Math.cos(((pan + 1) * Math.PI) / 4);
  const gr = gain * Math.sin(((pan + 1) * Math.PI) / 4);
  for (let i = 0; i < buf.length; i++) {
    const k = s0 + i;
    if (k < 0 || k >= N) continue;
    const v = buf[i];
    b.L[k] += v * gl;
    b.R[k] += v * gr;
    if (send) {
      verb.L[k] += v * gl * send;
      verb.R[k] += v * gr * send;
    }
  }
}
const mk = (len, fn) => {
  const n = Math.max(1, Math.floor(len * SR));
  const o = new Float32Array(n);
  fn(o, n);
  return o;
};

/* ───────── instruments ───────── */
const kick = (len = 0.45, punch = 1) =>
  mk(len, (o, n) => {
    let ph = 0;
    for (let i = 0; i < n; i++) {
      const t = i / SR;
      ph += (2 * Math.PI * (44 + 140 * Math.exp(-t * 30))) / SR;
      o[i] = Math.tanh(Math.sin(ph) * Math.exp(-t * 6) * 1.6 * punch) + (i < 120 ? noise() * 0.4 * (1 - i / 120) : 0);
    }
  });
const snare = (len = 0.3) =>
  mk(len, (o, n) => {
    let y = 0;
    for (let i = 0; i < n; i++) {
      const t = i / SR;
      const z = noise();
      y += 0.5 * (z - y);
      o[i] = (z - y) * Math.exp(-t * 16) * 0.9 + Math.sin(2 * Math.PI * 185 * t) * Math.exp(-t * 28) * 0.5;
    }
  });
const clap = () =>
  mk(0.35, (o, n) => {
    let y = 0;
    for (let i = 0; i < n; i++) {
      const t = i / SR;
      const env = Math.exp(-t * 13) + 0.8 * Math.exp(-((t - 0.011) ** 2) * 12000) + 0.7 * Math.exp(-((t - 0.024) ** 2) * 12000);
      const z = noise();
      y += 0.32 * (z - y);
      o[i] = (z - y) * env * 0.65;
    }
  });
const hat = (open = false) =>
  mk(open ? 0.3 : 0.06, (o, n) => {
    let y = 0;
    for (let i = 0; i < n; i++) {
      const t = i / SR;
      const z = noise();
      y += 0.72 * (z - y);
      o[i] = (z - y) * Math.exp(-t * (open ? 12 : 75)) * 0.5;
    }
  });
const tom = (f0 = 90) =>
  mk(0.5, (o, n) => {
    let ph = 0;
    for (let i = 0; i < n; i++) {
      const t = i / SR;
      ph += (2 * Math.PI * (f0 + f0 * 1.2 * Math.exp(-t * 18))) / SR;
      o[i] = Math.tanh(Math.sin(ph) * 1.4) * Math.exp(-t * 6) * 0.9;
    }
  });
const sawBass = (f, len, cutoff = 800, drive = 1.6) =>
  mk(len, (o, n) => {
    let ph = 0;
    let y = 0;
    for (let i = 0; i < n; i++) {
      const t = i / SR;
      ph = (ph + f / SR) % 1;
      y += lp(cutoff * (0.35 + 0.65 * Math.exp(-t * 9)) + 80) * (ph * 2 - 1 - y);
      const env = Math.min(1, t * 400) * Math.exp(-Math.max(0, t - len * 0.7) * 20);
      o[i] = Math.tanh((y * 1.2 + Math.sin(2 * Math.PI * f * t) * 0.9) * drive) * env * 0.55;
    }
  });
const pluck = (f, len = 0.3, bright = 1) =>
  mk(len, (o, n) => {
    let a = rnd();
    let b = rnd();
    let y = 0;
    for (let i = 0; i < n; i++) {
      const t = i / SR;
      a = (a + (f * 1.004) / SR) % 1;
      b = (b + (f * 0.996) / SR) % 1;
      y += lp((500 + 5200 * Math.exp(-t * 12)) * bright) * ((a < 0.5 ? 0.5 : -0.5) + (b * 2 - 1) * 0.6 - y);
      o[i] = y * Math.exp(-t * 10) * Math.min(1, t * 800) * 0.5;
    }
  });
const pad = (chord, len, cutoff = 1400, level = 0.16) =>
  mk(len, (o, n) => {
    const fr = chord.flatMap((m) => [0.993, 1, 1.007].map((d) => midi(m) * d));
    const ph = fr.map(() => rnd());
    let y = 0;
    for (let i = 0; i < n; i++) {
      const t = i / SR;
      let s = 0;
      for (let k = 0; k < fr.length; k++) {
        ph[k] = (ph[k] + fr[k] / SR) % 1;
        s += ph[k] * 2 - 1;
      }
      y += lp(cutoff * (0.7 + 0.3 * Math.sin(t * 0.9))) * (s / (fr.length / 1.6) - y);
      o[i] = y * Math.min(1, t * 1.5) * Math.min(1, (len - t) * 2) * level;
    }
  });
const supersaw = (chord, len, level = 0.2, open = 3800) =>
  mk(len, (o, n) => {
    const fr = chord.flatMap((m) => [-0.013, -0.006, 0, 0.006, 0.013].map((d) => midi(m) * (1 + d)));
    const ph = fr.map(() => rnd());
    let y = 0;
    for (let i = 0; i < n; i++) {
      const t = i / SR;
      let s = 0;
      for (let k = 0; k < fr.length; k++) {
        ph[k] = (ph[k] + fr[k] / SR) % 1;
        s += ph[k] * 2 - 1;
      }
      y += lp(open * (0.45 + 0.55 * Math.exp(-t * 3)) + 500) * (s / (fr.length / 1.8) - y);
      o[i] = y * Math.min(1, t * 90) * Math.exp(-Math.max(0, t - (len - 0.12)) * 30) * level;
    }
  });
/** The trailer "braam": detuned brass-like stack with a filter swell. */
const braam = (root, len = 3, level = 0.5, dark = false) =>
  mk(len, (o, n) => {
    const notes = dark ? [root, root + 6, root + 12] : [root, root + 7, root + 12];
    const fr = notes.flatMap((m) => [-0.01, 0, 0.01].map((d) => midi(m) * (1 + d)));
    const ph = fr.map(() => rnd());
    let y = 0;
    let y2 = 0;
    for (let i = 0; i < n; i++) {
      const t = i / SR;
      let s = 0;
      for (let k = 0; k < fr.length; k++) {
        ph[k] = (ph[k] + fr[k] / SR) % 1;
        s += ph[k] * 2 - 1;
      }
      s /= fr.length / 2;
      const fc = 140 + 1700 * Math.min(1, t / 0.22) * Math.exp(-Math.max(0, t - 0.22) * 1.4);
      y += lp(fc) * (s - y);
      y2 += lp(fc * 1.3) * (y - y2);
      const sub = Math.sin(2 * Math.PI * midi(root - 12) * t) * 0.8;
      const env = Math.min(1, t / 0.05) * Math.exp(-t * (1.6 / len)) * Math.min(1, (len - t) * 3);
      o[i] = Math.tanh((y2 * 1.8 + sub) * 1.6) * env * level;
    }
  });
const impact = (len = 2.6, level = 1) =>
  mk(len, (o, n) => {
    let ph = 0;
    let y = 0;
    for (let i = 0; i < n; i++) {
      const t = i / SR;
      ph += (2 * Math.PI * (32 + 95 * Math.exp(-t * 13))) / SR;
      y += lp(2600 * Math.exp(-t * 3) + 110) * (noise() - y);
      o[i] = (Math.sin(ph) * Math.exp(-t * 1.8) + y * Math.exp(-t * 5) * 0.8) * Math.min(1, t * 900) * level;
    }
  });
const crash = (len = 2.2, level = 0.55) =>
  mk(len, (o, n) => {
    let y = 0;
    for (let i = 0; i < n; i++) {
      const z = noise();
      y += 0.45 * (z - y);
      o[i] = (z - y) * Math.exp((-i / SR) * 2.4) * level;
    }
  });
const riser = (len, from = 200, to = 10000, level = 0.5) =>
  mk(len, (o, n) => {
    let y = 0;
    let ph = 0;
    for (let i = 0; i < n; i++) {
      const p = i / n;
      y += lp(from * (to / from) ** (p * p)) * (noise() - y);
      ph += (2 * Math.PI * (110 + 1500 * p * p)) / SR;
      o[i] = (y * 3 + Math.sin(ph) * 0.16 * p) * (0.1 + 0.9 * p ** 1.7) * level;
    }
  });
const reverseCrash = (len, level = 0.6) =>
  mk(len, (o, n) => {
    let y = 0;
    for (let i = 0; i < n; i++) {
      const z = noise();
      y += 0.5 * (z - y);
      o[i] = (z - y) * (i / n) ** 3 * level;
    }
  });
const whoosh = (len = 0.7, level = 0.5, up = true) =>
  mk(len, (o, n) => {
    let y = 0;
    for (let i = 0; i < n; i++) {
      const p = i / n;
      const shape = Math.sin(Math.PI * (up ? p ** 0.8 : 1 - (1 - p) ** 0.8)) ** 1.5;
      y += lp(300 + 7000 * shape) * (noise() - y);
      o[i] = y * 3 * shape * level;
    }
  });
const downSweep = (len, level = 0.6) =>
  mk(len, (o, n) => {
    let y = 0;
    for (let i = 0; i < n; i++) {
      const p = i / n;
      y += lp(7000 * (90 / 7000) ** p) * (noise() - y);
      o[i] = y * 3 * (1 - p) ** 1.5 * Math.min(1, i / 200) * level;
    }
  });
const tick = (f = 1800, level = 0.4, len = 0.05) =>
  mk(len, (o, n) => {
    for (let i = 0; i < n; i++) o[i] = Math.sin((2 * Math.PI * f * i) / SR) * Math.exp((-i / SR) * 110) * level;
  });
const heartbeat = (level = 1) => {
  const thump = (f) =>
    mk(0.32, (o, n) => {
      let ph = 0;
      for (let i = 0; i < n; i++) {
        const t = i / SR;
        ph += (2 * Math.PI * (f + 45 * Math.exp(-t * 30))) / SR;
        o[i] = Math.tanh(Math.sin(ph) * 1.5) * Math.exp(-t * 11) * level;
      }
    });
  return [thump(50), thump(44)];
};
const chime = (f, len = 1.2, level = 0.3) =>
  mk(len, (o, n) => {
    for (let i = 0; i < n; i++) {
      const t = i / SR;
      o[i] = (Math.sin(2 * Math.PI * f * t) + 0.4 * Math.sin(2 * Math.PI * f * 2.76 * t) * Math.exp(-t * 6) + 0.25 * Math.sin(2 * Math.PI * f * 5.4 * t) * Math.exp(-t * 10)) * Math.exp(-t * 3.2) * Math.min(1, t * 2000) * level;
    }
  });
const zap = (level = 0.35) =>
  mk(0.16, (o, n) => {
    let ph = 0;
    let y = 0;
    for (let i = 0; i < n; i++) {
      const t = i / SR;
      ph += (2 * Math.PI * (3200 * Math.exp(-t * 25) + 300)) / SR;
      const z = noise();
      y += 0.6 * (z - y);
      o[i] = (Math.sign(Math.sin(ph)) * 0.35 + (z - y) * 0.5) * Math.exp(-t * 26) * level;
    }
  });
const click = (level = 0.3, f = 2400) =>
  mk(0.03, (o, n) => {
    let y = 0;
    for (let i = 0; i < n; i++) {
      const z = noise();
      y += 0.8 * (z - y);
      o[i] = ((z - y) * 0.7 + Math.sin((2 * Math.PI * f * i) / SR) * 0.4) * Math.exp((-i / SR) * 220) * level;
    }
  });
const plop = (level = 0.5) =>
  mk(0.22, (o, n) => {
    let ph = 0;
    for (let i = 0; i < n; i++) {
      const t = i / SR;
      ph += (2 * Math.PI * (150 + 650 * Math.exp(-t * 22))) / SR;
      o[i] = Math.sin(ph) * Math.exp(-t * 14) * level;
    }
  });
const boing = (level = 0.4) =>
  mk(0.75, (o, n) => {
    let ph = 0;
    for (let i = 0; i < n; i++) {
      const t = i / SR;
      const f = 240 + 420 * Math.sin(Math.min(1, t / 0.5) * Math.PI) + 18 * Math.sin(2 * Math.PI * 14 * t);
      ph += (2 * Math.PI * f) / SR;
      o[i] = (Math.sin(ph) * 0.8 + Math.sign(Math.sin(ph)) * 0.15) * Math.exp(-t * 3.2) * Math.min(1, t * 400) * level;
    }
  });
const alert = (level = 0.25) =>
  mk(0.36, (o, n) => {
    for (let i = 0; i < n; i++) {
      const t = i / SR;
      const f = t < 0.16 ? 880 : 660;
      const g = t < 0.15 || (t > 0.18 && t < 0.34) ? 1 : 0;
      o[i] = Math.sign(Math.sin(2 * Math.PI * f * t)) * 0.5 * g * level;
    }
  });
const siren = (len, level = 0.28) =>
  mk(len, (o, n) => {
    let ph = 0;
    let y = 0;
    for (let i = 0; i < n; i++) {
      const t = i / SR;
      ph = (ph + (720 + 240 * Math.sin(2 * Math.PI * 1.1 * t)) / SR) % 1;
      y += lp(2600) * ((ph < 0.5 ? 1 : -1) - y);
      o[i] = y * level * Math.min(1, t * 15) * Math.min(1, (len - t) * 4);
    }
  });
const glitch = (len = 0.5, level = 0.5) =>
  mk(len, (o, n) => {
    let hold = 0;
    let cnt = 0;
    let seg = 60;
    for (let i = 0; i < n; i++) {
      if (cnt++ >= seg) {
        hold = rnd() < 0.35 ? noise() : Math.sign(Math.sin(i * (0.02 + rnd() * 0.3)));
        seg = 30 + Math.floor(rnd() * 600);
        cnt = 0;
      }
      const gate = Math.floor(i / (SR * 0.04)) % 3 === 2 ? 0 : 1;
      o[i] = hold * gate * level * (1 - i / n);
    }
  });
const stab = (f, len = 0.5, level = 0.4) =>
  mk(len, (o, n) => {
    let p1 = 0;
    let p2 = 0;
    let y = 0;
    for (let i = 0; i < n; i++) {
      const t = i / SR;
      p1 = (p1 + f / SR) % 1;
      p2 = (p2 + (f * 1.5 * 1.003) / SR) % 1;
      y += lp(1800 * Math.exp(-t * 7) + 250) * (p1 * 2 - 1 + 0.6 * (p2 < 0.5 ? 1 : -1) - y);
      o[i] = Math.tanh(y * 2.2) * Math.exp(-t * 8) * level;
    }
  });
const shimmer = (t0, notes, gap = 0.06, level = 0.3, pan = 0) => notes.forEach((m, i) => put(music, t0 + i * gap, pluck(midi(m), 0.6, 1.4), level, pan + (i % 2 ? 0.3 : -0.3), 0.6));

/* ───────── harmony ───────── */
const LIGHT = { chords: [[57, 60, 64], [53, 57, 60], [60, 64, 67], [55, 59, 62]], roots: [33, 29, 36, 31] };
const DARK = { chords: [[57, 60, 64], [58, 62, 65], [57, 60, 64], [52, 56, 59]], roots: [33, 34, 33, 28] };
const kicks = [];
const K = (t, g = 1, punch = 1) => {
  put(drums, t, kick(0.45, punch), g);
  kicks.push(t);
};

/** A groove between t0 and t1 (bar-aligned). */
function groove(t0, t1, { dark = false, hats = true, arp = true, stabs = false, saws = false, half = false, bassOn = true, clapOn = true } = {}) {
  const H = dark ? DARK : LIGHT;
  for (let t = t0; t < t1 - 1e-6; t += STEP) {
    const s = Math.round(t / STEP);
    const st = s % 16;
    const bar = Math.floor(t / BAR) % 4;
    const ch = H.chords[bar];
    const root = H.roots[bar];
    if (half ? st === 0 || st === 10 : st % 4 === 0) K(t, 1);
    if (clapOn && (half ? st === 8 : st === 4 || st === 12)) {
      put(drums, t, clap(), 0.75, 0.05, 0.18);
      put(drums, t, snare(0.25), 0.3);
    }
    if (hats) {
      if (st % 4 === 2) put(drums, t, hat(true), 0.38, 0.3);
      if (st % 2 === 1) put(drums, t, hat(false), 0.3, -0.25);
    }
    if (bassOn) {
      const pat = dark ? [0, 3, 6, 8, 10, 11, 14] : [0, 3, 6, 8, 11, 14];
      if (pat.includes(st)) put(bass, t, sawBass(midi(root + (st === 11 || st === 14 ? 12 : 0)), dark ? STEP * 1.7 : STEP * 2.3, dark ? 1100 : 820, dark ? 2.8 : 1.6), 1);
    }
    if (arp) {
      const idx = [0, 2, 1, 2, 0, 2, 1, 2, 0, 2, 1, 2, 0, 2, 3, 2][st];
      const note = idx === 3 ? ch[0] + 24 : ch[idx] + 12;
      put(music, t, pluck(midi(note), STEP * 2.2, dark ? 0.7 : 1), 0.75, ((st % 4) - 1.5) * 0.35, 0.28);
    }
    if (st === 0) put(music, t, pad(ch.map((m) => m + 12), BAR * 1.02, dark ? 900 : 1500, 0.15), 1, 0, 0.45);
    if (stabs && (st === 2 || st === 7 || st === 13)) put(music, t, stab(midi(ch[0] + 12), STEP * 3, 0.4), 1, st === 7 ? 0.4 : -0.4, 0.3);
    if (saws && (st === 0 || st === 6 || st === 10)) put(music, t, supersaw(ch.map((m) => m + 12), STEP * 2.6, 0.2), 1, 0, 0.35);
  }
}
const hit = (t, level = 1, withCrash = true) => {
  put(sfx, t, impact(2.6, level), 1, 0, 0.35);
  if (withCrash) put(sfx, t, crash(2.2, 0.5 * level), 1, 0, 0.3);
};
const roll = (t0, t1, from = 0.3, to = 0.8) => {
  let t = t0;
  let gap = 0.25;
  let k = 0;
  while (t < t1 - 0.02) {
    put(drums, t, snare(0.2), from + ((t - t0) / (t1 - t0)) * (to - from), k % 2 ? 0.2 : -0.2);
    t += gap;
    k++;
    if (t > t0 + (t1 - t0) * 0.4) gap = 0.125;
    if (t > t0 + (t1 - t0) * 0.75) gap = 0.0625;
  }
};

/* ═════════ ACT 1 — 0–12 s ═════════ */
put(music, 0, pad([45, 52, 57], 12.2, 380, 0.42), 1, 0, 0.55);
put(bass, 0, mk(12, (o, n) => { for (let i = 0; i < n; i++) { const t = i / SR; o[i] = Math.sin(2 * Math.PI * 55 * t) * 0.25 * Math.min(1, t / 3) * Math.min(1, (12 - t) * 2); } }), 1);
put(sfx, 0, riser(4, 300, 6000, 0.22), 1, 0, 0.4);
[0.5, 1.1, 1.6, 2.2, 2.6, 3.1, 3.5].forEach((t, i) => put(music, t, pluck(midi([81, 84, 88, 86, 84, 91, 88][i]), 0.9, 1.5), 0.28, i % 2 ? 0.5 : -0.5, 0.7));
for (let t = 0.5; t < 9; t += 0.5) put(sfx, t, tick(t % 1 === 0 ? 1500 : 1200, 0.12), 1, 0.4);
// 4.0 — EIGHT PLAYERS
put(music, at('card1'), braam(33, 2.4, 0.55), 1, 0, 0.5);
hit(at('card1'), 0.7, false);
// 5.5 — the lineup: beam whoosh and the two red visors
put(sfx, at('lineup'), whoosh(2.0, 0.35), 1, -0.4, 0.3);
put(sfx, 6.27, glitch(0.18, 0.28), 1, -0.4);
put(sfx, 6.27, stab(midi(45), 0.6, 0.45), 1, -0.3, 0.4);
put(sfx, 6.53, glitch(0.18, 0.28), 1, 0.3);
put(sfx, 6.53, stab(midi(46), 0.6, 0.45), 1, 0.3, 0.4);
{
  const [a, b] = heartbeat(0.8);
  for (let t = 5.6; t < 7.4; t += 0.9) {
    put(drums, t, a, 0.6);
    put(drums, t + 0.22, b, 0.45);
  }
}
// 7.5 — TWO OF THEM ARE LYING
put(music, at('card2'), braam(34, 2.2, 0.62, true), 1, 0, 0.5);
hit(at('card2'), 0.85, false);
put(sfx, at('card2'), glitch(0.3, 0.25), 1);
// 9.0 — press and hold
{
  const [a, b] = heartbeat(1);
  let t = 9.0;
  let gap = 0.75;
  while (t < 11.6) {
    put(drums, t, a, 0.7);
    put(drums, t + gap * 0.28, b, 0.5);
    t += gap;
    gap = Math.max(0.32, gap * 0.82);
  }
}
put(music, 9.0, mk(1.0, (o, n) => { let ph = 0; for (let i = 0; i < n; i++) { const t = i / SR; ph += (2 * Math.PI * (300 + 500 * (t / 1.0) ** 2)) / SR; o[i] = Math.sin(ph) * 0.12 * (t / 1.0); } }), 1, 0, 0.5);
put(music, at('reveal', 30), supersaw([69, 72, 76, 81], 0.9, 0.22, 5200), 1, -0.2, 0.6);
shimmer(at('reveal', 30), [81, 84, 88, 93], 0.05, 0.25, -0.3);
put(sfx, at('reveal', 30), whoosh(0.5, 0.35), 1, -0.3);
put(sfx, at('reveal', 52), whoosh(0.35, 0.5), 1, 0.4);
put(music, at('reveal', 52), braam(34, 1.4, 0.55, true), 1, 0.2, 0.4);
put(sfx, at('reveal', 52), impact(1.4, 0.7), 1, 0.2, 0.3);
put(sfx, 10.8, riser(1.15, 200, 12000, 0.75), 1, 0, 0.2);
roll(11.0, 11.92, 0.25, 0.8);
put(sfx, 12 - 1.2, reverseCrash(1.18, 0.75), 1);

/* ═════════ ACT 2 — crew 12–20 s ═════════ */
hit(12.0, 1.2);
put(music, 12.0, braam(33, 1.6, 0.4), 1, 0, 0.4);
groove(12, 20, { saws: true });
for (let i = 0; i < 12; i++) put(sfx, at('scatter', 18 + i * 2.4 + 8), plop(0.22), 1, (i % 5) * 0.4 - 0.8, 0.3);
put(sfx, at('navigate') - 0.25, whoosh(0.5, 0.35), 1, 0.4);
put(sfx, at('navigate', 20), chime(1318, 0.8, 0.22), 1, 0.3, 0.4);
put(sfx, at('navigate', 48), chime(1568, 0.8, 0.2), 1, 0.3, 0.4);
put(sfx, at('navigate', 52), click(0.4), 1, 0.4);
// games
for (let g = 0; g < 4; g++) {
  const t0 = at('games') + g;
  put(sfx, t0 - 0.12, whoosh(0.3, 0.45, false), 1, g % 2 ? 0.5 : -0.5);
  put(sfx, t0 + 21 / 30, chime([1046, 1174, 1318, 1568][g], 1.0, 0.26), 1, 0.2, 0.5);
  put(sfx, t0 + 21 / 30, chime([1568, 1760, 1976, 2349][g], 0.8, 0.14), 1, -0.2, 0.5);
}
for (let i = 0; i < 4; i++) put(sfx, at('games', 2 + i * 4.5 + 7), zap(0.3), 1, -0.3 + i * 0.2);
[9, 13, 17].forEach((fr) => put(sfx, at('games', 30 + fr), click(0.5, 1800), 1, 0.2));
put(sfx, at('games', 30 + 19), plop(0.3), 1, 0);
[0, 1, 2, 3, 4].forEach((k) => put(sfx, at('games', 60 + 2 + k * 4), tick([880, 988, 1108, 1318, 1480][k], 0.22, 0.14), 1, (k - 2) * 0.25, 0.4));
[3, 9, 15].forEach((fr) => put(sfx, at('games', 90 + fr), click(0.4, 900), 1, 0.1));

/* ═════════ ACT 2 — imposter 20–32 s ═════════ */
put(sfx, 19.75, reverseCrash(0.55, 0.6), 1);
put(sfx, at('visor', 9), impact(2.4, 1.15), 1, 0, 0.4);
put(music, at('visor', 9), braam(33, 2.0, 0.6, true), 1, 0, 0.5);
put(sfx, at('visor', 9), downSweep(1.2, 0.5), 1, 0, 0.3);
groove(20.5, 21, { dark: true, arp: false, clapOn: false, hats: false });
groove(21, 32, { dark: true, stabs: true, half: false });
{
  const [a, b] = heartbeat(1.1);
  [6, 24, 42, 58].forEach((fr) => {
    put(drums, at('infect', fr), a, 0.75);
    put(drums, at('infect', fr) + 0.2, b, 0.55);
  });
}
for (let i = 0; i < 18; i++) put(sfx, at('infect', 26) + i * (34 / 30 / 18), tick(1200 + i * 60, 0.16), 1, i % 2 ? 0.35 : -0.35);
put(sfx, at('infect', 60), chime(1975, 1.4, 0.24), 1, 0, 0.6);
put(sfx, at('infect', 60), impact(1.6, 0.6), 1, 0, 0.3);
shimmer(at('infect', 60), [88, 91, 95, 100], 0.04, 0.18, 0.3);
put(sfx, at('boxes', 8), glitch(0.3, 0.4), 1);
put(sfx, at('boxes', 8), impact(1.2, 0.6), 1);
put(sfx, at('boxes', 11), alert(0.22), 1, 0.2, 0.3);
// jam: kill the music for half a second
const JAM = at('jam', 9);
put(sfx, JAM, glitch(0.55, 0.6), 1, 0, 0.2);
put(sfx, JAM, impact(2.0, 1.1), 1, 0, 0.3);
put(sfx, JAM, downSweep(0.7, 0.8), 1);
put(sfx, at('fake', 6 + 7), plop(0.5), 1, 0, 0.4);
put(sfx, at('fake', 6 + 7), stab(midi(57), 0.4, 0.3), 1, 0, 0.4);
put(sfx, at('fake', 28), boing(0.45), 1, 0, 0.3);
put(sfx, at('fake', 28), impact(1.0, 0.45), 1);
[0.12, 0.22, 0.32, 0.42].forEach((d, i) => put(sfx, at('fake', 28) + 0.25 + d, tick(700 + (i % 2) * 180, 0.12, 0.08), 1, i % 2 ? 0.3 : -0.3));
put(sfx, at('camo', 16), click(0.45), 1, 0.4);
put(sfx, at('camo', 18), whoosh(0.7, 0.4), 1, 0.3, 0.4);
shimmer(at('camo', 20), [76, 79, 83, 88, 91], 0.05, 0.22, 0.2);
[4, 11, 18].forEach((fr, i) => {
  put(sfx, at('escalate', fr), impact(1.0, 0.55 + i * 0.15), 1, 0, 0.2);
  put(sfx, at('escalate', fr), glitch(0.16, 0.3), 1);
});
put(sfx, 31.0, riser(1.0, 300, 12000, 0.7), 1);
roll(31.0, 31.92, 0.3, 0.85);

/* ═════════ ACT 3 — meeting 32–44 s ═════════ */
const PRESS = at('alarm', 10);
put(sfx, PRESS - 0.05, click(0.6, 600), 1);
hit(PRESS, 1.25);
put(music, PRESS, braam(33, 2.4, 0.6, true), 1, 0, 0.5);
put(sfx, PRESS, siren(34 - PRESS, 0.26), 1, 0, 0.3);
// converge: driving toms
for (let t = 34; t < 36 - 1e-6; t += STEP) {
  const st = Math.round(t / STEP) % 16;
  if (st % 4 === 0) K(t, 0.9);
  if ([2, 6, 10, 14].includes(st)) put(drums, t, tom(st % 8 === 2 ? 110 : 82), 0.6, st % 8 === 2 ? -0.35 : 0.35, 0.2);
  if (st % 2 === 0) put(bass, t, sawBass(midi(33), STEP * 1.6, 600, 2), 0.8);
  if (st === 0) put(music, t, pad([57, 60, 64], 2, 1200, 0.16), 1, 0, 0.5);
}
// accuse: tense ostinato + whooshes + vote ticks
for (let t = 36; t < 39 - 1e-6; t += STEP) {
  const st = Math.round(t / STEP) % 16;
  put(music, t, pluck(midi(st % 2 ? 70 : 69), STEP * 1.6, 0.8 + (t - 36) * 0.15), 1.0, st % 2 ? 0.3 : -0.3, 0.3);
  if (st % 2 === 0) put(bass, t, sawBass(midi(33), STEP * 1.5, 300 + (t - 36) * 220, 1.8), 0.75);
  if (st % 8 === 0) put(drums, t, heartbeat(0.9)[0], 0.55);
  if (st === 0) put(music, t, pad([57, 60, 63], 2.05, 700 + (t - 36) * 300, 0.2), 1, 0, 0.5);
}
[4, 12, 20, 28].forEach((fr, i) => put(sfx, at('accuse', fr), whoosh(0.3, 0.3), 1, i % 2 ? 0.5 : -0.5));
[40, 44, 48, 52, 54, 58, 61, 64].forEach((fr, i) => put(sfx, at('accuse', fr + 6), tick(1000 + i * 70, 0.24, 0.07), 1, (i % 4) * 0.3 - 0.45));
put(sfx, at('accuse', 72), impact(1.6, 0.6), 1, 0, 0.3);
// eject
put(music, 39.0, pad([45, 52], 3.0, 300, 0.35), 1, 0, 0.5);
const L1 = at('eject', 15);
hit(L1, 1.1, false);
for (let i = 0; i < 22; i++) put(sfx, L1 + i * (14 / 30 / 22), click(0.22, 3000), 1, (i % 3) * 0.2 - 0.2);
put(sfx, at('eject', 26), riser(1.2, 2000, 9000, 0.25), 1, 0.4, 0.5);
put(sfx, at('eject', 60), glitch(0.35, 0.4), 1);
put(music, at('eject', 60), braam(34, 1.8, 0.5, true), 1, 0, 0.5);
// breath
put(music, 42.0, pad([45, 52, 57, 60], 2.2, 600, 0.3), 1, 0, 0.6);
{
  const [a, b] = heartbeat(0.9);
  [42.2, 43.0].forEach((t) => {
    put(drums, t, a, 0.6);
    put(drums, t + 0.22, b, 0.45);
  });
}
put(sfx, 42.6, riser(1.4, 200, 12000, 0.55), 1);
put(sfx, 44 - 0.8, reverseCrash(0.78, 0.6), 1);

/* ═════════ FINALE — montage 44–49.5, title 50–60 ═════════ */
hit(44.0, 1.0);
groove(44, 49.5, { saws: true, stabs: false });
for (let k = 1; k < 11; k++) put(sfx, 44 + k * 0.5, impact(0.6, 0.35), 1, 0, 0.15);
put(sfx, 47.5, riser(2.0, 200, 12000, 0.7), 1);
roll(48.5, 49.45, 0.35, 0.9);
put(sfx, 50 - 0.9, reverseCrash(0.88, 0.8), 1);
// 50.0 — the title
hit(50.0, 1.4);
put(music, 50.0, braam(33, 4.5, 0.75), 1, 0, 0.6);
put(music, 50.0, supersaw([57, 64, 69, 72, 76], 5.1, 0.22, 3000), 1, 0, 0.7);
put(music, 50.0, pad([45, 52, 57, 60, 64], 5.3, 1800, 0.3), 1, 0, 0.7);
for (let t = 50.5; t < 54.9; t += 0.25) put(drums, t, hat(false), 0.22, t % 0.5 ? 0.3 : -0.3);
K(50.0, 1.2, 1.3);
for (let t = 51; t < 55; t += 1) {
  K(t, 0.9);
  if (t % 2 === 1) put(drums, t + 0.5, clap(), 0.6, 0, 0.3);
}
shimmer(at('logo', 44), [76, 81, 84, 88, 93], 0.07, 0.22, 0);
// 55 — call to action: lighter
put(music, 54.8, pad([57, 60, 64, 69], 5.2, 1600, 0.3), 1, 0, 0.7);
for (let t = 55; t < 59.2; t += 0.5) put(bass, t, sawBass(midi(33), 0.42, 380, 1.4), 0.55 * Math.min(1, (59.4 - t) / 1.5));
for (let t = 55; t < 59.5; t += STEP * 2) {
  const st = Math.round(t / STEP) % 16;
  const notes = [69, 72, 76, 79, 81, 79, 76, 72];
  put(music, t, pluck(midi(notes[(st / 2) % 8] + 12), STEP * 3, 1.1), 0.6 * Math.min(1, (59.6 - t) / 1.5), (st % 4) * 0.3 - 0.45, 0.6);
}
put(sfx, at('logo', 166), impact(1.6, 0.45), 1, 0, 0.4);

/* ───────── sidechain, reverb, master ───────── */
const duck = new Float32Array(N).fill(1);
for (const kt of kicks) {
  const s0 = Math.round(kt * SR);
  for (let i = 0; i < SR * 0.33 && s0 + i < N; i++) {
    const t = i / SR;
    const d = 1 - 0.7 * Math.exp(-t * 9) * Math.min(1, t * 220 + 0.2);
    if (d < duck[s0 + i]) duck[s0 + i] = d;
  }
}
function reverb(inp, delays, fb = 0.8) {
  const out = new Float32Array(N);
  for (const d of delays) {
    const b = new Float32Array(d);
    let idx = 0;
    let y = 0;
    for (let i = 0; i < N; i++) {
      const v = b[idx];
      y += 0.33 * (v - y);
      b[idx] = inp[i] + y * fb;
      idx = (idx + 1) % d;
      out[i] += v * 0.25;
    }
  }
  for (const d of [241, 601]) {
    const b = new Float32Array(d);
    let idx = 0;
    for (let i = 0; i < N; i++) {
      const v = b[idx];
      const x = out[i];
      b[idx] = x + v * 0.5;
      out[i] = v - x * 0.5;
      idx = (idx + 1) % d;
    }
  }
  return out;
}
const vl = reverb(verb.L, [1693, 1759, 1621, 1546, 1867]);
const vr = reverb(verb.R, [1718, 1783, 1646, 1571, 1891]);

const jamMute = (t) => (t >= JAM && t < JAM + 0.5 ? 0.03 : 1);
const silence = (t) => {
  // breath before the reveal drop, the ejection, and the title
  if (t >= 11.93 && t < 12.0) return 0.15;
  if (t >= 39.0 && t < at('eject', 15)) return 0.25;
  if (t >= 49.5 && t < 50.0) return 0.2;
  return 1;
};
const outL = new Float32Array(N);
const outR = new Float32Array(N);
for (let i = 0; i < N; i++) {
  const t = i / SR;
  const d = duck[i];
  const m = jamMute(t) * silence(t);
  const musicGain = t >= 36 && t < 39 ? 0.8 : 1;
  let l = (drums.L[i] * 0.95 + bass.L[i] * d + music.L[i] * d * 0.8 * musicGain) * m + sfx.L[i] * 0.95 + vl[i] * 0.5;
  let r = (drums.R[i] * 0.95 + bass.R[i] * d + music.R[i] * d * 0.8 * musicGain) * m + sfx.R[i] * 0.95 + vr[i] * 0.5;
  const fade = Math.min(1, t / 0.05) * Math.min(1, (DUR - t) / 1.0);
  outL[i] = Math.tanh(l * 1.1) * fade;
  outR[i] = Math.tanh(r * 1.1) * fade;
}
let peak = 0;
for (let i = 0; i < N; i++) peak = Math.max(peak, Math.abs(outL[i]), Math.abs(outR[i]));
const norm = 0.891 / peak;
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
console.log('wrote music.wav; peak before normalise', peak.toFixed(2));
