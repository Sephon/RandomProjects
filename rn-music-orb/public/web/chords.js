// minimal, lägg i din <script> (kräver bara vanlig JS)
const KEYS = ['C','G','D','A','E','F','Bb','Eb','Ab']; // utöka om du vill

const DIATONIC = {
  // dur: I ii iii IV V vi vii°
  major: ['I','ii','iii','IV','V','vi','vii°']
};

// funktionell etikett
const FUNCTION = { T: ['I','vi'], PD: ['ii','IV'], D: ['V','vii°'] };

// mappning romersk→ faktiska ackord i vald tonart (förenklad, bara maj/min/°)
function buildKeyChords(tonic) {
  // enkla mönster för C-dur; för andra tonarter kan du använda en tabell
  const C = ['C','Dm','Em','F','G','Am','Bdim'];
  // snabb och ful men funkar om du börjar i C; (tips: använd tonal.js om du vill all keys snyggt)
  if (tonic !== 'C') return transposeFromC(tonic, C); // implementera eller håll dig i C först
  return {
    I:'C',   ii:'Dm', iii:'Em', IV:'F', V:'G', vi:'Am', 'vii°':'Bdim'
  };
}

// viktad slump från en lista
function pickWeighted(options) {
  const sum = options.reduce((a,o)=>a+o.w,0);
  let r = Math.random()*sum;
  for (const o of options){ r -= o.w; if (r<=0) return o.v; }
  return options[options.length-1].v;
}

function nextByFunction(prevFn){
  // sannolikheter: T->(PD|D), PD->D, D->T, (lite chans till T->T)
  const table = {
    'T':  [{v:'PD', w:0.6},{v:'D', w:0.3},{v:'T', w:0.1}],
    'PD': [{v:'D',  w:0.8},{v:'T', w:0.2}],
    'D':  [{v:'T',  w:0.9},{v:'PD',w:0.1}]
  };
  return pickWeighted(table[prevFn]);
}

function pickChordInFunction(fn){
  const pool = FUNCTION[fn];
  return pool[Math.floor(Math.random()*pool.length)];
}

function maybeSecondaryDominant(targetRoman){
  // med liten sannolikhet, ersätt med V/target (bara om target har en dominant)
  if (Math.random()<0.25 && ['ii','iii','IV','V','vi'].includes(targetRoman)) {
    return `V/${targetRoman}`; // markera, hanteras senare vid utskrivning
  }
  return null;
}

function generateProgression({key='C', qpm=100, bars=8}={}){
  const chords = buildKeyChords(key);
  const romans = []; // romerska i utdata
  let fn = 'T';

  for (let bar=1; bar<=bars; bar++){
    // bygg fraser om 4 takter, lägg cadence i slutet
    if (bar%4===0){
      // cadence: 70% V–I, 20% IV–I, 10% V–vi (deceptive)
      const cad = pickWeighted([
        {v:['V','I'], w:0.7},
        {v:['IV','I'], w:0.2},
        {v:['V','vi'], w:0.1}
      ]);
      romans.push(cad[0]);
      // sista takten ersätts av målet nästa varv:
      if (bar!==bars) romans.push(cad[1]); // skjuter in extra takt som upplösning
      fn = 'T';
      continue;
    }
    // normal takt
    const nextFn = nextByFunction(fn);
    const roman = pickChordInFunction(nextFn);
    // ev. secondary dominant mot kommande PD/D-mål
    const sd = maybeSecondaryDominant(roman);
    if (sd) romans.push(sd);
    romans.push(roman);
    fn = nextFn;
  }

  // rensa längden om vi blev en takt extra pga cadence-inskjut
  while (romans.length>bars) romans.pop();

  // översätt romerska till namn, enkel V/ii etc (bara i C i denna mini)
  const out = romans.map(r=>{
    if (r.startsWith('V/')){
      const tgt = r.split('/')[1]; // t.ex. 'ii'
      // dominant till target: i C → V/ii = A (A-C#-E) → skriv 'A' (utan 7:a för enkelhet)
      const targetRoot = { 'ii':'D', 'iii':'E', 'IV':'F', 'V':'G', 'vi':'A' }[tgt] || 'G';
      const dom = { 'D':'A', 'E':'B', 'F':'C', 'G':'D', 'A':'E' }[targetRoot]; // V av target
      return dom; // dur
    }
    return chords[r]; // diatoniskt ackordnamn
  });

  return { key, qpm, romans, chords: out };
}

// TODO: implementera transposeFromC om du vill andra tonarter.
// för start: håll 'key: "C"' så fungerar allt direkt.
