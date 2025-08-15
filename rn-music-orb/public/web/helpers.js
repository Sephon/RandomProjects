// ---------- Ton -> MIDI & allmänna utils ----------
function nearestMidiTo(pc, aroundMidi = 64) {
  // pc = pitch class: "C", "Eb", "G#"
  let m = Tonal.Note.midi(pc + "4"); // valfri oktav; vi flyttar ändå
  if (m == null) return null;
  while (m < aroundMidi - 7) m += 12;
  while (m > aroundMidi + 7) m -= 12;
  return m;
}

function chordPitchClasses(name, size = 4) {
  const props = Tonal.Chord.get(name);
  if (!props || props.empty) return [];
  return props.notes.slice(0, Math.min(size, props.notes.length)); // ["D","F","A","C"]
}

// Försök prioritera guidetoner (3 & 7) högst i voicingen om de finns
function orderWithGuideTones(name, pcs) {
  const props = Tonal.Chord.get(name);
  if (!props || props.empty) return pcs;
  const tonic = props.tonic || pcs[0] || "C";
  const ints = props.intervals || []; // ex ["1P","3M","5P","7M"]

  const int3 = ints.find(i => i.startsWith("3"));
  const int7 = ints.find(i => i.startsWith("7"));
  const pc3 = int3 ? Tonal.Note.pitchClass(Tonal.Note.transpose(tonic, int3)) : null;
  const pc7 = int7 ? Tonal.Note.pitchClass(Tonal.Note.transpose(tonic, int7)) : null;

  const rest = pcs.filter(pc => pc !== pc3 && pc !== pc7);
  return rest.concat([pc3, pc7].filter(Boolean)); // lägg 3/7 i toppen
}

// Minimal-rörelse (voice leading) nära föregående voicing
function voiceLead(name, prevVoicing, anchor = 64, size = 4) {
  let pcs = chordPitchClasses(name, size);
  pcs = orderWithGuideTones(name, pcs);
  let v = pcs.map(pc => nearestMidiTo(pc, anchor))
             .filter(m => m != null)
             .sort((a,b)=>a-b);

  if (prevVoicing && prevVoicing.length) {
    v = v.map((m,i) => {
      const target = prevVoicing[Math.min(i, prevVoicing.length-1)];
      const candidates = [m-12, m, m+12];
      let best = m, bestDist = Infinity;
      for (const c of candidates) {
        const d = Math.abs(c - target);
        if (d < bestDist) { best = c; bestDist = d; }
      }
      return best;
    }).sort((a,b)=>a-b);
  }
  return v;
}

// ---------- Pads (blockackord) med voice-leading ----------
function makePianoPadsVL(chords, qpm, holdBeats = 4, program = 4 /* EP1 */) {
  const ns = { notes:[], totalTime:0 };
  const beat = 60/qpm;
  let t = 0, prev = null;
  for (const ch of chords) {
    const v = voiceLead(ch, prev, 64, 4); // håll runt E4
    prev = v;
    for (const p of v) {
      const vel = 52 + Math.floor(Math.random()*12);
      const jit = (Math.random()-0.5)*0.01; // ±10ms
      ns.notes.push({ pitch:p, startTime:t+jit, endTime:t+holdBeats*beat,
        velocity:vel, program, isDrum:false });
    }
    t += holdBeats*beat;
  }
  ns.totalTime = t;
  return ns;
}

// --- Randomized arpeggio with contours, octave drift & humanize ---
// Requires: Tonal loaded, and your existing voiceLead(name, prev, anchor, size)
function makePianoArpVar(chords, qpm, {
  program = 0,              // Acoustic Grand; change if you prefer EP
  notesPerBar = 8,          // 8th-notes in 4/4
  octaveSpan = 1,           // how many octaves above top voice we may reach (0..2)
  stepProb = 0.7,           // chance to move to adjacent chord tone vs leap
  leapMax = 2,              // max leap (in chord-tone index steps) when leaping
  swingProp = 0.58,         // 0.5=r straight, 0.58–0.64 = swing feel
  jitterMs = 8,             // ± start jitter in ms
  velBase = 62, velHuman = 12
} = {}) {
  const eighth = 60 / qpm / 2;
  const ns = { notes:[], totalTime: 0 };
  let t = 0, prevVoicing = null;

  // helpers
  const rand = (n) => Math.floor(Math.random()*n);
  const pick = (arr) => arr[rand(arr.length)];
  const clamp = (v, lo, hi) => Math.max(lo, Math.min(hi, v));

  // available bar contours
  const CONTOURS = ['UP','DOWN','UPDOWN','ALBERTI','WALK'];

  for (const ch of chords) {
    // 1) get a smooth chord voicing near E4 (you already have voiceLead)
    const base = voiceLead(ch, prevVoicing, 64, 4);     // triad/7th around E4
    prevVoicing = base;
    if (!base.length) { t += 4 * (60/qpm); continue; }

    // 2) build chord-tone pool across octaves (so we can go higher/lower)
    //    start at the lowest tone of current voicing
    const low = base[0];
    const pool = [];
    for (let oct = -1; oct <= octaveSpan; oct++) {
      for (const p of base) pool.push(p + 12*oct);
    }
    pool.sort((a,b)=>a-b);

    // 3) choose a contour for this bar
    const contour = pick(CONTOURS);

    // 4) generate the 8th-note line for the bar
    //    find a start index near the middle of pool
    let idx = clamp(Math.floor(pool.length/2) + rand(2) - 1, 0, pool.length-1);
    const seq = [];

    const albertiOrder = [0, 3, 1, 3]; // low, high, mid, high (repeat)  (low–high–mid–high) 
    // (we’ll map these to base[0..] then to nearest from pool)
    const albertiPitches = (() => {
      const order = albertiOrder.map(i => base[clamp(i, 0, base.length-1)]);
      // project each to nearest in pool
      return order.map(p => pool.reduce((best, x) => Math.abs(x-p) < Math.abs(best-p) ? x : best, pool[0]));
    })();

    for (let k=0; k<notesPerBar; k++){
      let pitch;
      switch (contour) {
        case 'UP':
          idx = clamp(idx+1, 0, pool.length-1);
          pitch = pool[idx];
          break;
        case 'DOWN':
          idx = clamp(idx-1, 0, pool.length-1);
          pitch = pool[idx];
          break;
        case 'UPDOWN': {
          // go up for half bar, then down
          const goingUp = k < notesPerBar/2;
          idx = clamp(idx + (goingUp ? 1 : -1), 0, pool.length-1);
          pitch = pool[idx];
          break;
        }
        case 'ALBERTI': {
          // map 0..7 to 0..3 repeating
          const p = albertiPitches[k % albertiPitches.length];
          // small octave drift every other bar-slot
          const drift = (k % 4 === 2) ? 12 * (Math.random() < 0.3 ? 1 : 0) : 0;
          pitch = p + drift;
          break;
        }
        default: { // 'WALK' — random walk with step/leap
          if (Math.random() < stepProb) {
            idx += (Math.random() < 0.5 ? -1 : 1);
          } else {
            idx += (Math.random() < 0.5 ? -1 : 1) * (1 + rand(leapMax));
          }
          idx = clamp(idx, 0, pool.length-1);
          pitch = pool[idx];
          break;
        }
      }

      // swing: delay every 2nd 8th a bit
      const isEven8th = (k % 2) === 1;
      const swing = isEven8th ? (eighth * swingProp - eighth * 0.5) : 0;
      const jitter = (Math.random()-0.5) * (jitterMs/1000);

      const vel = clamp(velBase + Math.floor((Math.random()-0.5)*2*velHuman) + (k===0?6:0), 40, 100);
      ns.notes.push({
        pitch,
        startTime: t + k*eighth + swing + jitter,
        endTime:   t + (k+1)*eighth + jitter*0.6,
        velocity:  vel,
        program,
        isDrum: false
      });
    }

    t += 4 * (60/qpm); // one bar advance
  }

  ns.totalTime = t;
  return ns;
}

// ---------- Bas + Hi-hat + Merge (som vi hade tidigare) ----------
const MIDI_BASE = {'C':48,'C#':49,'Db':49,'D':50,'D#':51,'Eb':51,'E':52,'F':53,'F#':54,'Gb':54,'G':55,'G#':56,'Ab':56,'A':57,'A#':58,'Bb':58,'B':59};
function chordRootToMidi(ch){ const m = ch.match(/^[A-G](?:#|b)?/); return m ? m[0] : 'C'; }
function toMidiBass(root){ return MIDI_BASE[root] ?? 48; }
function fifthOf(root){ const names=['C','C#','D','D#','E','F','F#','G','G#','A','A#','B']; const i=names.indexOf(root.replace('b','#')); return names[(i+7)%12]; }

function makeBassSeq(chordProgression, qpm){
  const ns = { notes:[], totalTime:0 }, q = 60/qpm; let t = 0;
  for (const ch of chordProgression){
    const r = chordRootToMidi(ch), f = fifthOf(r);
    const rMidi = toMidiBass(r), fMidi = toMidiBass(f);
    ns.notes.push({ pitch:rMidi, startTime:t+0*q, endTime:t+1*q, velocity:90, program:33, isDrum:false });
    ns.notes.push({ pitch:fMidi, startTime:t+2*q, endTime:t+3*q, velocity:85, program:33, isDrum:false });
    t += 4*q;
  }
  ns.totalTime = t; return ns;
}

function makeHihat(totalTime, qpm){
  const ns = { notes:[], totalTime }, eighth = 60/qpm/2;
  for (let t=0; t<totalTime; t+=eighth){
    ns.notes.push({ pitch:42, startTime:t, endTime:t+0.001, velocity:60, isDrum:true });
  }
  return ns;
}

function mergeSequences(...seqs){
  const out = { notes:[], totalTime:0 };
  for (const s of seqs){
    if (!s) continue;
    out.notes.push(...s.notes);
    out.totalTime = Math.max(out.totalTime || 0, s.totalTime || 0);
  }
  return out;
}


// --- Gitarr-strum över ackorden ---
// strokePattern: array av 'D' (down) eller 'U' (up) per kvartslag i en takt.
// ex: ['D','-','U','-'] = strum på 1 och 3, vila på 2 och 4.
function makeGuitarStrumSeq(chords, qpm, {
  program = 24,          // 24=GM25 Nylon, 25=Steel, 26=Jazz, 27=Clean
  strings = 4,           // hur många toner ur voicingen (3–6)
  strokePattern = ['D','-','U','-'], // per beat i 4/4
  spreadMsDown = 22,     // hur brett (ms) ett downstroke sprids över strängar
  spreadMsUp   = 18,     // hur brett (ms) ett upstroke sprids
  humanVel = 10,         // ±velocity-variation
  anchor = 64            // voicing runt E4
} = {}) {
  const ns = { notes:[], totalTime:0 };
  const beat = 60 / qpm;
  let t = 0;
  let prev = null;

  for (const ch of chords) {
    // 1 takt per ackord → ta en voicing nära föregående
    const fullVoicing = voiceLead(ch, prev, anchor, 6) // max 6 toner
      .slice(-Math.max(3, Math.min(strings, 6)));      // ta topp-”strängar” (3–6)
    prev = fullVoicing;

    // bygg eventuella strokes över 4 slag (kvartar)
    for (let b = 0; b < 4; b++) {
      const st = strokePattern[b];
      if (st === '-' || !fullVoicing.length) { t += beat; continue; }

      const isDown = st === 'D';
      const order = isDown ? fullVoicing.slice().sort((a,b)=>a-b)  // lågt → högt
                           : fullVoicing.slice().sort((a,b)=>b-a); // högt → lågt
      const spread = (isDown ? spreadMsDown : spreadMsUp) / 1000; // till sek
      const perString = order.length > 1 ? spread / (order.length - 1) : 0;

      // gör själva strummet: lägg små tidsförskjutningar för varje "sträng"
      order.forEach((p, i) => {
        const startJitter = (Math.random()-0.5) * 0.008; // ±8 ms
        const v = 62 + Math.floor((Math.random()-0.5) * 2 * humanVel);
        const start = t + i * perString + startJitter;
        const end   = t + beat * 0.95 + startJitter;     // håll nästan hela slaget
        ns.notes.push({ pitch: p, startTime: start, endTime: end,
                        velocity: Math.max(40, Math.min(100, v)),
                        program, isDrum: false });
      });

      t += beat;
    }
  }
  ns.totalTime = t;
  return ns;
}
