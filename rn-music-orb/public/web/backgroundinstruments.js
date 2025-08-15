// --- Helpers för ton→MIDI (enkel parser) ---
const MIDI_BASE = { // C3=48 (lagom för bas)
  'C':48,'C#':49,'Db':49,'D':50,'D#':51,'Eb':51,'E':52,'F':53,'F#':54,'Gb':54,
  'G':55,'G#':56,'Ab':56,'A':57,'A#':58,'Bb':58,'B':59
};
function chordRootToMidi(ch){ // "Dm" -> "D", "Bdim" -> "B", "A" -> "A"
  const m = ch.match(/^[A-G](?:#|b)?/); return m ? m[0] : 'C';
}
function toMidiBass(root){ return MIDI_BASE[root] ?? 48; } // i C3-området
function fifthOf(root){ // +7 halvtoner
  const names=['C','C#','D','D#','E','F','F#','G','G#','A','A#','B'];
  const idx = names.indexOf(root.replace('b','#')); // enkel enharmonisk
  return names[(idx+7)%12];
}

// --- Bygg en enkel basgång (root på 1, fifth på 3) per ackordtakt ---
function makeBassSeq(chordProgression, qpm){
  const ns = { notes:[], totalTime:0 };
  const q = 60/qpm; // kvart i sekunder
  let t = 0;
  for (const ch of chordProgression){
    const rootName = chordRootToMidi(ch);
    const rMidi = toMidiBass(rootName);
    const fMidi = toMidiBass(fifthOf(rootName));
    // slag 1 (root)
    ns.notes.push({ pitch:rMidi, startTime:t+0*q, endTime:t+1*q, velocity:90, program:33, isDrum:false });
    // slag 3 (fifth)
    ns.notes.push({ pitch:fMidi, startTime:t+2*q, endTime:t+3*q, velocity:85, program:33, isDrum:false });
    t += 4*q; // nästa takt
  }
  ns.totalTime = t;
  return ns;
}

// --- Hi-hat åttondelar (Closed HH = MIDI 42) över hela längden ---
function makeHihat(totalTime, qpm){
  const ns = { notes:[], totalTime };
  const eighth = 60/qpm/2;
  for (let t=0; t<totalTime; t+=eighth){
    ns.notes.push({ pitch:42, startTime:t, endTime:t+0.001, velocity:60, isDrum:true }); // kort tick
  }
  return ns;
}

// --- Merge flera NoteSequences till en ---
function mergeSequences(...seqs){
  const out = { notes:[], totalTime:0 };
  for (const s of seqs){
    if (!s) continue;
    out.notes.push(...s.notes);
    out.totalTime = Math.max(out.totalTime || 0, s.totalTime || 0);
  }
  return out;
}
