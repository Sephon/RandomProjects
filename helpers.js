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

// ---------- Arpeggio-komp (valfritt) ----------
function makePianoArp(chords, qpm, pattern = [0,1,2,3], program = 0 /* Grand */){
  const ns = { notes:[], totalTime:0 };
  const eighth = 60/qpm/2;
  let t = 0, prev = null;
  for (const ch of chords){
    const v = voiceLead(ch, prev, 64, 3); // triad
    prev = v;
    if (!v.length){ t += 8*eighth; continue; }
    const ext = [...v, v[0]+12]; // lägg oktaven för "1-3-5-8"
    for (let k=0;k<8;k++){
      const idx = pattern[k % pattern.length];
      const p = ext[Math.min(idx, ext.length-1)];
      const vel = 58 + Math.floor(Math.random()*12);
      const jit = (Math.random()-0.5)*0.01;
      ns.notes.push({ pitch:p, startTime:t+jit, endTime:t+0.9*eighth,
        velocity:vel, program, isDrum:false });
      t += eighth;
    }
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
