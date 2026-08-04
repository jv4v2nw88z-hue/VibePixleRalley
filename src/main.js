import './style.css';

(function(){
'use strict';
/* =========================================================================
   RALLY PIXEL — data: cars, upgrades, tires, stages, persistence
   ========================================================================= */

var SAVE_KEY = 'rallypixel.save.v1';

var clamp = function(v,a,b){ return v<a?a:(v>b?b:v); };
var lerp  = function(a,b,t){ return a+(b-a)*t; };
var TAU = Math.PI*2;

/* deterministic hash-based PRNG (so scenery/track are identical every run) */
function rnd2(x,y,salt){
  var h = (x*374761393 + y*668265263 + (salt||0)*2147483647) | 0;
  h = (h ^ (h>>13)) * 1274126177;
  h = (h ^ (h>>16)) >>> 0;
  return h / 4294967296;
}
function mulberry(seed){
  var t = seed >>> 0;
  return function(){
    t += 0x6D2B79F5;
    var r = Math.imul(t ^ (t>>>15), 1 | t);
    r ^= r + Math.imul(r ^ (r>>>7), 61 | r);
    return ((r ^ (r>>>14)) >>> 0) / 4294967296;
  };
}

/* ---------------------------------------------------------------- surfaces */
var SURFACES = {
  tarmac:{ name:'TARMAC', grip:1.34, roll:0.34, color:'#3b3d40', color2:'#45484b', dust:'#7d7f82', edge:'#d8d8d2' },
  gravel:{ name:'GRAVEL', grip:1.00, roll:0.60, color:'#7d6647', color2:'#8d7451', dust:'#c2a97e', edge:'#a08a63' },
  snow:  { name:'SNOW',   grip:0.74, roll:0.72, color:'#d5e2ee', color2:'#c3d4e4', dust:'#ffffff', edge:'#9fb4c8' },
  ice:   { name:'ICE',    grip:0.46, roll:0.26, color:'#a9cbe0', color2:'#bcd9ea', dust:'#e6f4ff', edge:'#87aec6' },
  mud:   { name:'MUD',    grip:0.80, roll:0.95, color:'#54452f', color2:'#5f4f36', dust:'#8a7350', edge:'#6b5940' }
};
/* off-track surface per stage theme */
var OFFTRACK = {
  forest:{ name:'GRASS', grip:0.62, roll:2.30, color:'#2f4023', dust:'#4d6b32' },
  mountain:{ name:'DIRT', grip:0.66, roll:2.10, color:'#4a4a45', dust:'#7a7a70' },
  snowpass:{ name:'DEEP SNOW', grip:0.55, roll:2.70, color:'#e9f2fa', dust:'#ffffff' }
};

/* ---------------------------------------------------------------- cars */
var CARS = [
  { id:'hatch', name:'KESTREL 1.6 GTI', cls:'GROUP N', price:0,
    topSpeed:300, accel:190, handling:36, gripBase:1.00, sprite:'hatch',
    paint:'#d8452f', blurb:'Cheap, light, honest. A proper starter rally hatch.' },
  { id:'rally', name:'FALCON RS EVO', cls:'GROUP A', price:5200,
    topSpeed:392, accel:268, handling:52, gripBase:1.12, sprite:'rally',
    paint:'#1f6fd0', blurb:'Turbo four, real diff, made for loose surfaces.' },
  { id:'wrc',   name:'VANTOR WRC-X', cls:'WRC', price:16500,
    topSpeed:472, accel:344, handling:66, gripBase:1.26, sprite:'wrc',
    paint:'#f0f0e6', blurb:'Full works machine. Punishing, fast, glorious.' }
];
function carDef(id){ for(var i=0;i<CARS.length;i++){ if(CARS[i].id===id) return CARS[i]; } return CARS[0]; }

/* ---------------------------------------------------------------- upgrades */
var UPGRADES = [
  { id:'engine', name:'ENGINE',   max:3, base:900,  desc:'Bigger cams and a gas-flowed head. Top speed + acceleration.' },
  { id:'turbo',  name:'TURBO',    max:3, base:1150, desc:'More boost, more shove out of slow corners.' },
  { id:'susp',   name:'SUSPENSION',max:3,base:800,  desc:'Longer travel dampers. Handling and mechanical grip.' },
  { id:'trans',  name:'GEARBOX',  max:3, base:700,  desc:'Closer ratios, faster shifts. Acceleration + top speed.' },
  { id:'weight', name:'WEIGHT RED.',max:3,base:1000,desc:'Strip the interior, lexan glass. Helps everything a little.' }
];
function upgradeCost(up, level, carIdx){
  return Math.round(up.base * Math.pow(1.75, level) * (1 + carIdx*0.55));
}

/* ---------------------------------------------------------------- tires */
var TIRES = [
  { id:'all',    name:'ALL-TERRAIN', mul:{tarmac:1.00,gravel:1.00,snow:1.00,ice:1.00,mud:1.00}, base:600,
    desc:'Jack of all trades, master of none.' },
  { id:'gravel', name:'GRAVEL',      mul:{tarmac:0.84,gravel:1.17,snow:0.94,ice:0.86,mud:1.12}, base:750,
    desc:'Chunky blocks. Superb on loose, vague on tarmac.' },
  { id:'tarmac', name:'TARMAC SLICK',mul:{tarmac:1.20,gravel:0.79,snow:0.68,ice:0.62,mud:0.74}, base:750,
    desc:'Sticky compound. Deadly quick on sealed roads.' },
  { id:'snow',   name:'STUDDED SNOW',mul:{tarmac:0.76,gravel:0.90,snow:1.24,ice:1.42,mud:0.95}, base:850,
    desc:'Steel studs bite ice and packed snow.' }
];
function tireDef(id){ for(var i=0;i<TIRES.length;i++){ if(TIRES[i].id===id) return TIRES[i]; } return TIRES[0]; }
function tireCost(t, level, carIdx){ return Math.round(t.base * Math.pow(1.7, level) * (1 + carIdx*0.4)); }

/* ------------------------------------------------------------ gear tuning */
var GEAR_FINAL_MIN = 0.80, GEAR_FINAL_MAX = 1.20;
var GEAR_SPREAD_MIN = 0.80, GEAR_SPREAD_MAX = 1.25;
var GEAR_STEP = 0.05;
function gearingOf(carId){
  var g = save.cars[carId] && save.cars[carId].gearing;
  return { final: g && typeof g.final==='number' ? g.final : 1,
           spread: g && typeof g.spread==='number' ? g.spread : 1 };
}
function gearingIsStock(carId){
  var g = gearingOf(carId);
  return Math.abs(g.final-1) < 1e-6 && Math.abs(g.spread-1) < 1e-6;
}

/* ---------------------------------------------------------------- liveries */
var LIVERIES = [
  { id:0, name:'PLAIN' },
  { id:1, name:'STRIPES' },
  { id:2, name:'RALLY #7' },
  { id:3, name:'CHEVRON' }
];
var PAINTS = ['#d8452f','#e8892b','#f2d02c','#4fae3f','#1f6fd0','#7b3fbf','#f0f0e6','#2b2f33','#0e8f86','#c9367f'];
var ACCENTS = { '#d8452f':'#ffffff','#e8892b':'#20242a','#f2d02c':'#20242a','#4fae3f':'#ffffff','#1f6fd0':'#ffd23f',
                '#7b3fbf':'#ffffff','#f0f0e6':'#1f6fd0','#2b2f33':'#ffb432','#0e8f86':'#ffffff','#c9367f':'#ffffff' };

/* ---------------------------------------------------------------- stages
   Segment format: { len:units, r:radius (0 = straight, + = right, - = left),
                     s:surface id (optional, defaults to stage surface),
                     note:'text' (optional extra pacenote), w:width override }   */
var STAGES = [
  {
    id:'s1', name:'PINE HOLLOW', theme:'forest', surface:'gravel', width:132,
    country:'FOREST GRAVEL · 9.1 KM', refSpeed:178, payout:620, sky:'#2f4023',
    req:null,
    segs:[
      {len:420,r:0},{len:330,r:-380},{len:240,r:0},{len:300,r:420},{len:200,r:0,note:'CREST'},
      {len:360,r:-260},{len:180,r:0},{len:300,r:230},{len:260,r:0},
      {len:280,r:-150,note:'TIGHTENS'},{len:150,r:0},{len:420,r:0,s:'mud',note:'MUD PATCH'},
      {len:340,r:320},{len:200,r:0},{len:300,r:-300},{len:520,r:0,note:'FLAT OUT'},
      {len:260,r:120,note:'HAIRPIN RIGHT'},{len:180,r:0},{len:300,r:-340},{len:240,r:0},
      {len:280,r:260},{len:220,r:-240},{len:400,r:0},{len:300,r:-420},{len:250,r:0},
      {len:290,r:200},{len:180,r:0,note:'CAUTION ROCKS'},{len:330,r:-190},{len:240,r:0},
      {len:300,r:300},{len:520,r:0}
    ]
  },
  {
    id:'s2', name:'COL DE GRANITE', theme:'mountain', surface:'tarmac', width:120,
    country:'MOUNTAIN TARMAC · 9.5 KM', refSpeed:168, payout:1100, sky:'#3a3a36',
    req:{ handling:44, label:'HANDLING 44+' },
    segs:[
      {len:480,r:0},{len:300,r:300},{len:200,r:0},{len:250,r:-115,note:'HAIRPIN LEFT'},
      {len:180,r:0},{len:260,r:125,note:'HAIRPIN RIGHT'},{len:220,r:0},{len:340,r:-360},
      {len:300,r:0},{len:280,r:170},{len:160,r:0},{len:300,r:-200},
      {len:380,r:0,s:'gravel',note:'GRAVEL CUT'},{len:260,r:230},{len:200,r:0},
      {len:250,r:-120,note:'HAIRPIN LEFT'},{len:160,r:0},{len:600,r:0,note:'FLAT OUT'},
      {len:300,r:400},{len:240,r:0},{len:260,r:-135,note:'HAIRPIN LEFT'},{len:200,r:0},
      {len:320,r:210},{len:180,r:0},{len:300,r:-260},{len:220,r:0,note:'CREST'},
      {len:280,r:150},{len:200,r:0},{len:340,r:-300},{len:260,r:0},
      {len:250,r:130,note:'HAIRPIN RIGHT'},{len:200,r:0},{len:300,r:-330},{len:520,r:0}
    ]
  },
  {
    id:'s3', name:'VITKULL PASS', theme:'snowpass', surface:'snow', width:146,
    country:'SNOW PASS · 11.8 KM', refSpeed:225, payout:1800, sky:'#dbe8f4',
    req:{ handling:58, topSpeed:170, label:'HANDLING 58+ · 170 KM/H+' },
    segs:[
      {len:520,r:0},{len:400,r:-450},{len:300,r:0},{len:360,r:380},{len:280,r:0,note:'CREST'},
      {len:420,r:0,s:'ice',note:'ICE! CAUTION'},{len:320,r:-280},{len:240,r:0},
      {len:380,r:250},{len:300,r:0},{len:340,r:-200,note:'TIGHTENS'},{len:220,r:0},
      {len:500,r:0,note:'FLAT OUT'},{len:300,r:160},{len:260,r:0},
      {len:380,r:0,s:'ice',note:'ICE! CAUTION'},{len:340,r:-320},{len:280,r:0},
      {len:300,r:140,note:'HAIRPIN RIGHT'},{len:220,r:0},{len:400,r:-380},{len:320,r:0},
      {len:360,r:290},{len:240,r:0},{len:320,r:-160,note:'TIGHTENS'},{len:280,r:0},
      {len:420,r:0,s:'ice'},{len:360,r:330},{len:260,r:0},{len:340,r:-240},
      {len:300,r:0,note:'CAUTION BANKS'},{len:380,r:210},{len:260,r:0},{len:340,r:-300},{len:560,r:0}
    ]
  }
];
function stageDef(id){ for(var i=0;i<STAGES.length;i++){ if(STAGES[i].id===id) return STAGES[i]; } return STAGES[0]; }

/* ---------------------------------------------------------------- save */
var save = null;

function freshCarSave(def){
  return {
    owned: def.price===0,
    paint: def.paint,
    livery: 0,
    up: { engine:0, turbo:0, susp:0, trans:0, weight:0 },
    tires: { all:1, gravel:0, tarmac:0, snow:0 },
    fitted: 'all',
    gearing: { final:1, spread:1 }            /* stock ratios */
  };
}
function freshSave(){
  var s = { v:1, money:1200, current:'hatch', cars:{}, stages:{}, settings:{ control:'buttons', audio:true, autoGas:false, tiltSens:1, transmission:'auto' } };
  for(var i=0;i<CARS.length;i++) s.cars[CARS[i].id] = freshCarSave(CARS[i]);
  for(var j=0;j<STAGES.length;j++) s.stages[STAGES[j].id] = { best:null, done:false };
  return s;
}
function loadSave(){
  var s = null;
  try{ var raw = localStorage.getItem(SAVE_KEY); if(raw) s = JSON.parse(raw); }catch(e){ s = null; }
  var fresh = freshSave();
  if(!s || s.v !== 1){ save = fresh; return; }
  /* merge defensively so old saves never crash the game */
  save = fresh;
  if(typeof s.money === 'number') save.money = s.money;
  if(s.current && save.cars[s.current]) save.current = s.current;
  for(var id in save.cars){
    var src = s.cars && s.cars[id]; if(!src) continue;
    var dst = save.cars[id];
    if(typeof src.owned === 'boolean') dst.owned = src.owned || dst.owned;
    if(typeof src.paint === 'string') dst.paint = src.paint;
    if(typeof src.livery === 'number') dst.livery = clamp(src.livery|0,0,LIVERIES.length-1);
    if(src.up) for(var k in dst.up){ if(typeof src.up[k]==='number') dst.up[k] = clamp(src.up[k]|0,0,3); }
    if(src.tires) for(var t in dst.tires){ if(typeof src.tires[t]==='number') dst.tires[t] = clamp(src.tires[t]|0,0,3); }
    if(src.fitted && dst.tires[src.fitted] > 0) dst.fitted = src.fitted;
    /* saves written before gear tuning existed simply keep stock ratios */
    if(src.gearing){
      if(typeof src.gearing.final === 'number')  dst.gearing.final  = clamp(src.gearing.final,  GEAR_FINAL_MIN, GEAR_FINAL_MAX);
      if(typeof src.gearing.spread === 'number') dst.gearing.spread = clamp(src.gearing.spread, GEAR_SPREAD_MIN, GEAR_SPREAD_MAX);
    }
  }
  for(var sid in save.stages){
    var ss = s.stages && s.stages[sid]; if(!ss) continue;
    if(typeof ss.best === 'number') save.stages[sid].best = ss.best;
    if(typeof ss.done === 'boolean') save.stages[sid].done = ss.done;
  }
  if(s.settings){
    if(s.settings.control==='tilt'||s.settings.control==='buttons') save.settings.control = s.settings.control;
    if(typeof s.settings.audio === 'boolean') save.settings.audio = s.settings.audio;
    if(typeof s.settings.autoGas === 'boolean') save.settings.autoGas = s.settings.autoGas;
    if(typeof s.settings.tiltSens === 'number') save.settings.tiltSens = clamp(s.settings.tiltSens,0.5,2);
    /* saves written before manual existed simply stay on automatic */
    if(s.settings.transmission === 'manual' || s.settings.transmission === 'auto')
      save.settings.transmission = s.settings.transmission;
  }
}
function persist(){
  try{ localStorage.setItem(SAVE_KEY, JSON.stringify(save)); }catch(e){}
}
function curCarSave(){ return save.cars[save.current]; }
function curCarDef(){ return carDef(save.current); }
function carIndex(id){ for(var i=0;i<CARS.length;i++) if(CARS[i].id===id) return i; return 0; }

/* ------------------------------------------------------- shop preview
   Tapping something in the garage equips it as a preview instead of buying
   it: a shadow copy of that car's save entry with the one item already
   applied. Nothing reaches `save` — or localStorage — until PURCHASE is
   confirmed, so CANCEL and backing out of the garage both just drop the
   copy and the car snaps back to its last paid-for state.

     { kind, item, carId, current, cs, cost, name, note }

   `cs` is the shadow car entry and `current` is which car would be in use,
   which is how an unowned car can stand in the bay before it is bought.
   Because the preview IS the post-purchase state, committing is a straight
   hand-over of the copy — the preview and the thing you pay for can never
   drift apart. */
var preview = null;

function cloneCarSave(cs){ return JSON.parse(JSON.stringify(cs)); }

/* the car the garage should show — previewed if there is one, else in use */
function shopCarId(){ return preview ? preview.current : save.current; }
/* a car's entry as the garage should show it, preview folded in */
function shopCarSave(carId){
  return (preview && preview.carId === carId) ? preview.cs : save.cars[carId];
}
function isPreviewing(kind, item){
  return !!preview && preview.kind === kind && preview.item === item;
}
function previewAffordable(){ return !preview || save.money >= preview.cost; }

/* ---------------------------------------------------------------- stats
   `csOverride` lets the garage cost out a shop preview without touching the
   save. Everything that gates progression calls this with one argument, so
   gating always reads the paid-for car. */
function computeStats(carId, csOverride){
  var def = carDef(carId), cs = csOverride || save.cars[carId], u = cs.up;
  var topSpeed = def.topSpeed * (1 + 0.050*u.engine + 0.060*u.turbo + 0.035*u.trans + 0.022*u.weight);
  var accel    = def.accel    * (1 + 0.075*u.engine + 0.105*u.turbo + 0.075*u.trans + 0.065*u.weight);
  var handling = def.handling * (1 + 0.105*u.susp + 0.048*u.weight);
  var tire = tireDef(cs.fitted);
  var tlvl = cs.tires[cs.fitted] || 1;
  var tmul = 1 + 0.055*(tlvl-1);
  var gripBase = def.gripBase * (1 + 0.040*u.susp);
  var grip = {};
  for(var k in tire.mul) grip[k] = gripBase * tire.mul[k] * tmul;
  return {
    topSpeed: topSpeed, accel: accel, handling: handling,
    kmh: Math.round(topSpeed*0.42),
    accelScore: Math.round(accel/4.6),
    handlingScore: Math.round(handling),
    grip: grip,
    gripScore: function(s){ return Math.round((grip[s]||1)*62); },
    tire: tire, tireLvl: tlvl
  };
}
function bestOwnedStats(){ return computeStats(save.current); }

function stageUnlocked(st){
  if(!st.req) return true;
  var s = computeStats(save.current);
  if(st.req.handling && s.handlingScore < st.req.handling) return false;
  if(st.req.topSpeed && s.kmh < st.req.topSpeed) return false;
  return true;
}
function targetTime(st){ return st.len ? st.len / st.refSpeed : 60; }

function fmtTime(t){
  if(t==null || !isFinite(t)) return '--:--.--';
  var neg = t<0; t = Math.abs(t);
  var m = Math.floor(t/60), s = t-m*60;
  return (neg?'-':'') + m + ':' + (s<10?'0':'') + s.toFixed(2);
}
function fmtDelta(d){
  var s = (d>=0?'+':'-') + Math.abs(d).toFixed(2);
  return s;
}
function fmtMoney(n){ return 'CR ' + Math.round(n).toLocaleString('en-US'); }
/* =========================================================================
   TRACK BUILDER — walks the segment list into a centreline of nodes,
   then scatters scenery, hazards and pacenotes along it.
   ========================================================================= */

var NODE_STEP = 10;              /* world units between centreline nodes */

function buildTrack(st){
  var nodes = [];                /* {x,y,a,s,hw,d} */
  var x = 0, y = 0, a = 0, d = 0;
  var segIndex = [];             /* per-node segment id, for note placement */
  var segStarts = [];            /* distance at which each segment starts */

  for(var i=0;i<st.segs.length;i++){
    var sg = st.segs[i];
    segStarts.push(d);
    var surf = sg.s || st.surface;
    var hw = (sg.w || st.width)/2;
    /* tight corners open out a little so hairpins stay driveable */
    if(sg.r && Math.abs(sg.r) < 230) hw *= 1 + (230 - Math.abs(sg.r))/230 * 0.50;
    var curv = sg.r ? (1/sg.r) : 0;
    var walked = 0;
    while(walked < sg.len){
      nodes.push({ x:x, y:y, a:a, s:surf, hw:hw, d:d, seg:i });
      var step = Math.min(NODE_STEP, sg.len - walked);
      /* widen slightly through hairpins so they stay drivable */
      a += curv * step;
      x += Math.sin(a) * step;
      y -= Math.cos(a) * step;
      walked += step; d += step;
    }
  }
  nodes.push({ x:x, y:y, a:a, s:st.surface, hw:st.width/2, d:d, seg:st.segs.length-1 });

  /* smooth the half-widths so the road flares gradually into the hairpins */
  for(var pass=0;pass<8;pass++){
    var prev = nodes[0].hw;
    for(var k=1;k<nodes.length-1;k++){
      var cur = nodes[k].hw;
      nodes[k].hw = (prev + cur*2 + nodes[k+1].hw)/4;
      prev = cur;
    }
  }

  var track = {
    stage: st, nodes: nodes, len: d, segStarts: segStarts,
    theme: st.theme, off: OFFTRACK[st.theme]
  };

  buildPacenotes(track);
  buildScenery(track);
  track.targetTime = d / st.refSpeed;
  return track;
}

/* ------------------------------------------------------------- pacenotes */
function noteForRadius(r){
  var ar = Math.abs(r);
  if(ar >= 380) return { sev:1, word:'EASY' };
  if(ar >= 260) return { sev:2, word:'MEDIUM' };
  if(ar >= 180) return { sev:3, word:'SHARP' };
  if(ar >= 140) return { sev:4, word:'VERY SHARP' };
  return { sev:5, word:'HAIRPIN' };
}
function buildPacenotes(track){
  var st = track.stage, notes = [];
  var LEAD = 165;                /* how far ahead of the corner it is called */
  for(var i=0;i<st.segs.length;i++){
    var sg = st.segs[i], at = track.segStarts[i];
    if(sg.r){
      var n = noteForRadius(sg.r);
      var dir = sg.r > 0 ? 'RIGHT' : 'LEFT';
      notes.push({
        d: Math.max(30, at - LEAD),
        text: (n.sev>=5 ? 'HAIRPIN ' + dir : n.word + ' ' + dir),
        dir: sg.r > 0 ? 1 : -1, sev: n.sev, warn: n.sev>=4
      });
    }
    if(sg.note){
      notes.push({
        d: Math.max(20, at - LEAD - 30),
        text: sg.note, dir: 0, sev: 0,
        warn: /CAUTION|ICE|TIGHT|JUMP|ROCK|BANK|MUD/.test(sg.note)
      });
    }
  }
  notes.sort(function(p,q){ return p.d - q.d; });
  /* stop two notes landing on top of each other */
  for(var j=1;j<notes.length;j++){
    if(notes[j].d - notes[j-1].d < 70) notes[j].d = notes[j-1].d + 70;
  }
  track.notes = notes;
}

/* ------------------------------------------------------------- scenery */
/* Types: 0 tree, 1 rock, 2 barrier post, 3 snow bank/pole, 4 bush/stump    */
function buildScenery(track){
  var st = track.stage, nodes = track.nodes;
  var rand = mulberry(st.id.charCodeAt(1)*9871 + 4242);
  var props = [];                /* {x,y,r,type,size,node,solid} */
  var buckets = {};              /* node index -> props that can be hit */

  var isMountain = st.theme==='mountain';
  var isSnow = st.theme==='snowpass';

  for(var i=2;i<nodes.length-2;i+=1){
    var nd = nodes[i];
    var nx = Math.cos(nd.a), ny = Math.sin(nd.a);   /* right-hand normal */

    /* guardrails / snow poles lining the verge, both sides, evenly spaced.
       They sit clear of the road itself so only a real mistake reaches them. */
    if((isMountain && i%5===0) || (isSnow && i%10===0)){
      for(var sgn=-1;sgn<=1;sgn+=2){
        var off = nd.hw + (isMountain ? 34 : 32);
        props.push(mkProp(nd.x+nx*off*sgn, nd.y+ny*off*sgn, isMountain?2:3,
                          isMountain?7:6, i, true, rand()));
      }
    }

    /* loose rocks / stumps just off the racing line — genuine hazards */
    if(rand() < 0.055){
      var side = rand()<0.5 ? -1 : 1;
      var lat = nd.hw + 28 + rand()*30;
      props.push(mkProp(nd.x+nx*lat*side, nd.y+ny*lat*side, isSnow?3:1,
                        9+rand()*7, i, true, rand()));
    }

    /* Loose ground decoration: grass tufts and small stones scattered well
       out into the field, as on the reference. Explicitly non-solid, so they
       never reach the collision buckets and cannot change a run. */
    if(rand() < 0.55){
      var gs = rand()<0.5 ? -1 : 1;
      var glat = nd.hw + 6 + rand()*210;
      props.push(mkProp(nd.x+nx*glat*gs, nd.y+ny*glat*gs, 5,
                        7+rand()*7, i, false, rand()));
    }
    if(rand() < 0.10){
      var rs = rand()<0.5 ? -1 : 1;
      var rlat = nd.hw + 40 + rand()*180;
      props.push(mkProp(nd.x+nx*rlat*rs, nd.y+ny*rlat*rs, 1,
                        6+rand()*6, i, false, rand()));
    }

    /* the treeline / verge decoration */
    var density = isMountain ? 0.55 : 1.0;
    if(rand() < density){
      var n2 = Math.floor(1 + rand()*2);
      for(var t=0;t<n2;t++){
        var s2 = rand()<0.5 ? -1 : 1;
        var lat2 = nd.hw + 44 + rand()*160;
        var type = isSnow ? (rand()<0.72?0:4) : (isMountain ? (rand()<0.45?1:0) : (rand()<0.78?0:4));
        var size = type===0 ? 17+rand()*15 : 9+rand()*8;
        var solid = lat2 < nd.hw + 96;   /* only the near ones can be clipped */
        props.push(mkProp(nd.x+nx*lat2*s2, nd.y+ny*lat2*s2, type, size, i, solid, rand()));
      }
    }
  }

  for(var p=0;p<props.length;p++){
    var pr = props[p];
    if(!pr.solid) continue;
    var b = pr.node;
    if(!buckets[b]) buckets[b] = [];
    buckets[b].push(pr);
  }
  track.props = props;
  track.buckets = buckets;

  /* spatial index of props by node for fast draw culling */
  var byNode = [];
  for(var q=0;q<props.length;q++){
    var idx = props[q].node;
    if(!byNode[idx]) byNode[idx] = [];
    byNode[idx].push(props[q]);
  }
  track.byNode = byNode;
}
function mkProp(x,y,type,size,node,solid,seed){
  return { x:x, y:y, type:type, size:size, node:node, solid:solid, seed:seed,
           r: type===0 ? size*0.42 : size*0.55, hit:0 };
}

/* --------------------------------------------------- position on track */
/* Returns lateral offset, surface, tangent and distance along the stage.  */
function trackQuery(track, x, y, hintNode){
  var nodes = track.nodes;
  var lo = Math.max(0, (hintNode|0) - 14), hi = Math.min(nodes.length-2, (hintNode|0) + 60);
  if(hintNode == null){ lo = 0; hi = nodes.length-2; }
  var best = lo, bestD = Infinity, bestT = 0;
  for(var i=lo;i<=hi;i++){
    var a = nodes[i], b = nodes[i+1];
    var dx = b.x-a.x, dy = b.y-a.y;
    var L2 = dx*dx+dy*dy; if(L2 < 1e-6) continue;
    var t = ((x-a.x)*dx + (y-a.y)*dy) / L2;
    t = t<0?0:(t>1?1:t);
    var px = a.x + dx*t, py = a.y + dy*t;
    var dd = (x-px)*(x-px) + (y-py)*(y-py);
    if(dd < bestD){ bestD = dd; best = i; bestT = t; }
  }
  var n0 = nodes[best], n1 = nodes[best+1];
  var ang = n0.a + angDiff(n1.a, n0.a) * bestT;
  var nx = Math.cos(ang), ny = Math.sin(ang);
  var cx = n0.x + (n1.x-n0.x)*bestT, cy = n0.y + (n1.y-n0.y)*bestT;
  var lateral = (x-cx)*nx + (y-cy)*ny;
  var hw = lerp(n0.hw, n1.hw, bestT);
  return {
    node: best, t: bestT, lateral: lateral, hw: hw, ang: ang,
    d: n0.d + (n1.d-n0.d)*bestT,
    surface: Math.abs(lateral) > hw ? null : n0.s,
    onTrack: Math.abs(lateral) <= hw
  };
}
function angDiff(a,b){
  var d = (a-b) % TAU;
  if(d > Math.PI) d -= TAU;
  if(d < -Math.PI) d += TAU;
  return d;
}
/* =========================================================================
   PIXEL SPRITES — everything is drawn with canvas primitives, so there are
   still no external asset files.

   Each car has TWO sprite sets:

     1. TOP-DOWN  — a flat character map, used for in-race rendering. Kept
        deliberately simple: it is only ever seen small and rotating.

     2. SIDE VIEW — built from independent, individually swappable layers
        (chassis / wheels / hood / livery / glass / trim). A later pass can
        replace one layer — say WHEEL_STYLES.rally or SIDE_LAYERS.hood —
        or nudge opts.rideHeight, without touching any of the others.

   Top-down legend:
     B body      H body highlight   S shaded body panel   D dark trim
     G glass     K black            T tyre                C chrome
     Y headlight R taillight        W white               . transparent
   ========================================================================= */

var CAR_SPRITES = {
  /* KESTREL 1.6 GTI — narrow track, tall glasshouse, short overhangs */
  hatch: [
    '................',
    '....KKKKKKKK....',
    '...KYYKKKKYYK...',
    '...CBBBBBBBBC...',
    '..TBBBBBBBBBBT..',
    '..TBBBHHHHBBBT..',
    '..TBBBHHHHBBBT..',
    '..TBBBBBBBBBBT..',
    '...BBBBBBBBBB...',
    '...BSSSSSSSSB...',
    '...BGGGGGGGGB...',
    '...BGGGGGGGGB...',
    '..DBGGGGGGGGBD..',
    '...BBBBBBBBBB...',
    '...BBBBBBBBBB...',
    '...BBBBBBBBBB...',
    '...BBBBBBBBBB...',
    '...BGGGGGGGGB...',
    '...BGGGGGGGGB...',
    '...BSSSSSSSSB...',
    '..TBBBBBBBBBBT..',
    '..TBBBBBBBBBBT..',
    '..TBBBBBBBBBBT..',
    '...BBBBBBBBBB...',
    '...CBBBBBBBBC...',
    '...KRRKKKKRRK...',
    '....KKKKKKKK....',
    '................'
  ],
  /* FALCON RS EVO — wider track, bonnet vents, boot spoiler */
  rally: [
    '................',
    '...KKKKKKKKKK...',
    '..KYYKKKKKKYYK..',
    '..CBBBBBBBBBBC..',
    '.TTBBBBBBBBBBTT.',
    '.TTBBBSSSSBBBTT.',
    '.TTBBBSSSSBBBTT.',
    '.TTBBBBBBBBBBTT.',
    '..BBBBBBBBBBBB..',
    '..BSSSSSSSSSSB..',
    '..BGGGGGGGGGGB..',
    '..BGGGGGGGGGGB..',
    '.DBBGGGGGGGGBBD.',
    '..BBBBBBBBBBBB..',
    '..BBBHHHHHHBBB..',
    '..BBBHHHHHHBBB..',
    '..BBBBBBBBBBBB..',
    '..BGGGGGGGGGGB..',
    '..BGGGGGGGGGGB..',
    '..BSSSSSSSSSSB..',
    '.TTBBBBBBBBBBTT.',
    '.TTBBBBBBBBBBTT.',
    '.TTBBBBBBBBBBTT.',
    '..BBBBBBBBBBBB..',
    '..CBBBBBBBBBBC..',
    '..KRRKKKKKKRRK..',
    '.SSSSSSSSSSSSSS.',
    '.SS..........SS.'
  ],
  /* VANTOR WRC-X — box arches, roof scoop, full-width wing */
  wrc: [
    '..KKKKKKKKKKKK..',
    '.KKKKKKKKKKKKKK.',
    '.KYYKKSSSSKKYYK.',
    '.CBBBBBBBBBBBBC.',
    'TTBBBBBBBBBBBBTT',
    'TTBBBBDDDDBBBBTT',
    'TTBBBBDDDDBBBBTT',
    'TTBBBBBBBBBBBBTT',
    '.BBBBBBBBBBBBBB.',
    '.BSSSSSSSSSSSSB.',
    'BBBGGGGGGGGGGBBB',
    'BBBGGGGGGGGGGBBB',
    'DBBBGGGGGGGGBBBD',
    'BBBBBBBBBBBBBBBB',
    'BBBBBBDDDDBBBBBB',
    'BBBBBBDDDDBBBBBB',
    'BBBBBBBBBBBBBBBB',
    'BBBGGGGGGGGGGBBB',
    '.BBGGGGGGGGGGBB.',
    '.BSSSSSSSSSSSSB.',
    'TTBBBBBBBBBBBBTT',
    'TTBBBBBBBBBBBBTT',
    'TTBBBBBBBBBBBBTT',
    '.BBBBBBBBBBBBBB.',
    '.CBBBBBBBBBBBBC.',
    '.KRRKKKKKKKKRRK.',
    'SSSSSSSSSSSSSSSS',
    'SS...SSSSSS...SS'
  ]
};

function shade(hex, amt){
  var c = hex.replace('#','');
  if(c.length===3) c = c[0]+c[0]+c[1]+c[1]+c[2]+c[2];
  var r = parseInt(c.substr(0,2),16), g = parseInt(c.substr(2,2),16), b = parseInt(c.substr(4,2),16);
  r = clamp(Math.round(r + 255*amt),0,255);
  g = clamp(Math.round(g + 255*amt),0,255);
  b = clamp(Math.round(b + 255*amt),0,255);
  return 'rgb('+r+','+g+','+b+')';
}

/* One palette derived from the chosen paint, shared by both sprite sets. */
function carPalette(paint, damageTier){
  return {
    body:   paint,
    lite:   shade(paint, 0.07),
    hi:     shade(paint, 0.15),
    /* the roof and bonnet crown take the same left-to-right rake the flanks
       do, so a highlight panel reads as a surface turning into the light
       rather than as a flat sticker laid on the shell */
    hiLite: shade(paint, 0.21),
    hiDark: shade(paint, 0.09),
    dark:   shade(paint,-0.11),
    darker: shade(paint,-0.22),
    deep:   shade(paint,-0.44),
    accent: ACCENTS[paint] || '#ffffff',
    glass:      damageTier>=1 ? '#3d454c' : '#1b2026',
    glassLite:  damageTier>=1 ? '#59636c' : '#2b343d',
    tyre:'#141516', tyreLite:'#31353a',
    chrome:'#b9bec4', chromeDark:'#767b82',
    lamp:'#ffe9a8', tail:'#e8352a', black:'#171a1c', white:'#f2f2ea'
  };
}

/* livery predicates operate in top-down sprite-pixel space */
function liveryColorAt(livery, px, py, w, h, accent){
  var mid = w/2 - 0.5;
  if(livery===1){                                   /* twin bonnet-to-boot stripes */
    var d = Math.abs(px - mid);
    if(d >= 1 && d <= 2.5) return accent;
  } else if(livery===2){                            /* rally #7 — side panels + door roundel */
    if(px <= 3 || px >= w-4) return accent;
    if(py >= 12 && py <= 16 && (px <= 5 || px >= w-6)) return accent;
  } else if(livery===3){                            /* chevron */
    var k = Math.abs(px - mid);
    var band = py - k*1.25;
    if(band > 2.5 && band < 5.5) return accent;
    if(band > 11 && band < 14) return accent;
    if(band > 19.5 && band < 22.5) return accent;
  }
  return null;
}

/* =========================================================================
   TOP-DOWN CAR

   Drawn as vector geometry rather than a character map. The reference car is
   a continuous-tone render at the picture's own resolution — smooth curved
   flanks, a specular streak down the bonnet, panel gaps a pixel wide — and
   no character grid coarse enough to hand-author reaches that. The terrain
   around it stays chunky, which is exactly how the reference reads: blocky
   world, smooth car.

   Everything is expressed in a 16 x 28 unit box, so the driving footprint is
   the one the physics has always used. The bitmap is rasterised at four
   times the requested scale and drawn down, and it is built once per
   car/paint/livery/damage combination, so none of this costs a frame.
   ========================================================================= */
var CAR_UNIT_W = 16, CAR_UNIT_H = 28, CAR_OVERSAMPLE = 4;

/* Body silhouette: nose at the top, waisted through the middle, drawn as one
   closed path so it can be reused as a clip for everything laid over it. */
function carBodyPath(g, o){
  var W = CAR_UNIT_W, mid = W/2;
  var n = o.noseHalf, f = o.frontHalf, wst = o.waistHalf, rr = o.rearHalf, t = o.tailHalf;
  var r = 0.7;
  g.beginPath();
  /* blunt nose: the reference front is a squared-off bumper with rounded
     corners, not the bullet a single curve to a point gives */
  g.moveTo(mid - n + r, 0.55);
  g.lineTo(mid + n - r, 0.55);
  g.quadraticCurveTo(mid + n, 0.55, mid + n + 0.12, 1.15);
  g.bezierCurveTo(mid + f*0.97, 2.8,  mid + f, 4.3,   mid + f,   6.4);
  g.bezierCurveTo(mid + f,      9.8,  mid + wst, 12.4, mid + wst, 15.0);
  g.bezierCurveTo(mid + wst,   17.8,  mid + rr, 19.8, mid + rr,  22.6);
  g.bezierCurveTo(mid + rr,    25.2,  mid + t*1.04, 26.7, mid + t, 27.15);
  g.quadraticCurveTo(mid + t, 27.45, mid + t - r, 27.45);
  g.lineTo(mid - t + r, 27.45);
  g.quadraticCurveTo(mid - t, 27.45, mid - t, 27.15);
  g.bezierCurveTo(mid - t*1.04, 26.7, mid - rr, 25.2, mid - rr,  22.6);
  g.bezierCurveTo(mid - rr,    19.8,  mid - wst, 17.8, mid - wst, 15.0);
  g.bezierCurveTo(mid - wst,   12.4,  mid - f,  9.8,  mid - f,   6.4);
  g.bezierCurveTo(mid - f,      4.3,  mid - f*0.97, 2.8, mid - n - 0.12, 1.15);
  g.quadraticCurveTo(mid - n, 0.55, mid - n + r, 0.55);
  g.closePath();
}

/* A glasshouse pane: narrower at the end furthest from the roof, with a
   rounded corner treatment, so windscreen and backlight share one shape. */
function carPane(g, y0, y1, hw0, hw1, r){
  var mid = CAR_UNIT_W/2;
  roundQuad(g, mid - hw0, y0, mid + hw0, y0, mid + hw1, y1, mid - hw1, y1, r);
}
function roundQuad(g, x1,y1, x2,y2, x3,y3, x4,y4, r){
  g.beginPath();
  g.moveTo(x1 + r, y1);
  g.lineTo(x2 - r, y2); g.quadraticCurveTo(x2, y2, x2 + (x3-x2)*0.12, y2 + (y3-y2)*0.12);
  g.lineTo(x3 - (x3-x2)*0.12, y3 - (y3-y2)*0.12); g.quadraticCurveTo(x3, y3, x3 - r, y3);
  g.lineTo(x4 + r, y4); g.quadraticCurveTo(x4, y4, x4 - (x4-x1)*0.12, y4 - (y4-y1)*0.12);
  g.lineTo(x1 + (x4-x1)*0.12, y1 + (y4-y1)*0.12); g.quadraticCurveTo(x1, y1, x1 + r, y1);
  g.closePath();
}

/* Per-car proportions. Same footprint, different stance. */
var CAR_SHAPES = {
  hatch: { noseHalf:5.1, frontHalf:5.9, waistHalf:5.7, rearHalf:5.9, tailHalf:4.9,
           screenY:8.6, screenH:3.4, roofH:5.0, backH:3.8, wing:0, arch:0.0 },
  rally: { noseHalf:5.5, frontHalf:6.3, waistHalf:6.0, rearHalf:6.3, tailHalf:5.2,
           screenY:8.9, screenH:3.3, roofH:5.2, backH:3.6, wing:1, arch:0.35 },
  wrc:   { noseHalf:5.9, frontHalf:6.8, waistHalf:6.5, rearHalf:6.8, tailHalf:5.7,
           screenY:9.1, screenH:3.2, roofH:5.4, backH:3.4, wing:2, arch:0.7 }
};

function renderCarSprite(carId, paint, livery, damageTier, scale){
  scale = scale || 2;
  var o = CAR_SHAPES[carDef(carId).sprite] || CAR_SHAPES.hatch;
  var W = CAR_UNIT_W, H = CAR_UNIT_H, mid = W/2;
  var S = scale*CAR_OVERSAMPLE;
  var cv = document.createElement('canvas');
  cv.width = Math.round(W*S); cv.height = Math.round(H*S);
  var g = cv.getContext('2d');
  g.setTransform(S,0,0,S,0,0);
  var c = carPalette(paint, damageTier);
  var i;

  /* ---- wheels, laid under the body so only the tread shoulder shows ---- */
  var aw = 1.55 + o.arch*0.6, ah = 4.0;
  var wheelYs = [6.0, 19.4];
  for(i=0;i<2;i++){
    for(var sgn=-1; sgn<=1; sgn+=2){
      var wx = mid + sgn*(o.frontHalf - 0.15) - (sgn < 0 ? aw : 0);
      roundPath(g, wx, wheelYs[i], aw, ah, 0.55);
      g.fillStyle = c.tyre; g.fill();
      g.fillStyle = c.tyreLite;
      g.fillRect(wx + (sgn < 0 ? 0.22 : aw - 0.5), wheelYs[i] + 0.35, 0.28, ah - 0.7);
    }
  }

  /* ---- body ---- */
  carBodyPath(g, o);
  var body = g.createLinearGradient(mid - o.frontHalf, 0, mid + o.frontHalf, 0);
  body.addColorStop(0.00, c.hi);
  body.addColorStop(0.07, c.lite);
  body.addColorStop(0.30, c.body);
  body.addColorStop(0.74, c.dark);
  body.addColorStop(1.00, c.darker);
  g.fillStyle = body; g.fill();

  g.save();
  carBodyPath(g, o); g.clip();

  /* front and rear valances read as a darker plane than the panels */
  var nose = g.createLinearGradient(0, 0, 0, 3.0);
  nose.addColorStop(0, c.black); nose.addColorStop(1, 'rgba(0,0,0,0)');
  g.fillStyle = nose; g.fillRect(0, 0, W, 3.0);
  var tail = g.createLinearGradient(0, H - 3.2, 0, H);
  tail.addColorStop(0, 'rgba(0,0,0,0)'); tail.addColorStop(1, c.black);
  g.fillStyle = tail; g.fillRect(0, H - 3.2, W, 3.2);
  /* bumper seams, the panel gap the reference shows front and rear */
  g.fillStyle = 'rgba(0,0,0,.55)';
  g.fillRect(0, 2.55, W, 0.22);
  g.fillRect(0, H - 3.15, W, 0.22);

  /* bonnet: a long specular streak just left of the crown, as on the
     reference, plus a soft crown highlight down the middle */
  var crown = g.createLinearGradient(mid - 2.6, 0, mid + 2.2, 0);
  crown.addColorStop(0.00, 'rgba(255,255,255,0)');
  crown.addColorStop(0.42, 'rgba(255,255,255,.16)');
  crown.addColorStop(1.00, 'rgba(255,255,255,0)');
  g.fillStyle = crown; g.fillRect(mid - 2.6, 2.2, 4.8, o.screenY - 2.2);
  g.fillStyle = 'rgba(255,255,255,.30)';
  g.fillRect(mid - 1.9, 2.8, 0.26, o.screenY - 3.8);

  /* the rim light that runs the whole left flank */
  g.save();
  g.lineWidth = 0.34; g.strokeStyle = 'rgba(255,255,255,.22)';
  carBodyPath(g, o); g.stroke();
  g.restore();

  /* ---- glasshouse ---- */
  var sy = o.screenY, sh = o.screenH, ry = sy + sh + o.roofH;
  g.fillStyle = c.black;                                 /* surround */
  carPane(g, sy - 0.30, sy + sh + 0.30, o.waistHalf - 0.55, o.waistHalf - 0.30, 0.5);
  g.fill();
  carPane(g, ry - 0.30, ry + o.backH + 0.30, o.waistHalf - 0.35, o.waistHalf - 0.75, 0.5);
  g.fill();
  g.fillStyle = c.glass;
  carPane(g, sy, sy + sh, o.waistHalf - 1.25, o.waistHalf - 0.95, 0.45);
  g.fill();
  carPane(g, ry, ry + o.backH, o.waistHalf - 1.05, o.waistHalf - 1.45, 0.45);
  g.fill();
  g.fillStyle = c.glassLite;                             /* reflection streak */
  carPane(g, sy + 0.25, sy + sh - 0.25, o.waistHalf - 1.15, o.waistHalf - 2.55, 0.3);
  g.fill();
  carPane(g, ry + 0.25, ry + o.backH - 0.25, o.waistHalf - 0.95, o.waistHalf - 2.35, 0.3);
  g.fill();

  /* roof: brighter than the flanks, with the reference's two vent bars */
  var roofG = g.createLinearGradient(mid - o.waistHalf, 0, mid + o.waistHalf, 0);
  roofG.addColorStop(0.00, c.hiLite);
  roofG.addColorStop(0.22, c.hi);
  roofG.addColorStop(0.66, c.body);
  roofG.addColorStop(1.00, c.dark);
  roundPath(g, mid - o.waistHalf + 0.55, sy + sh, (o.waistHalf - 0.55)*2, o.roofH, 0.5);
  g.fillStyle = roofG; g.fill();
  g.fillStyle = 'rgba(10,12,15,.88)';
  for(i=0;i<2;i++)
    roundPath(g, mid - 1.55, sy + sh + 1.15 + i*2.0, 3.1, 0.72, 0.28), g.fill();

  /* ---- lamps ---- */
  for(i=-1;i<=1;i+=2){
    roundPath(g, mid + i*3.55 - (i<0?1.9:0), 1.15, 1.9, 1.15, 0.34);
    g.fillStyle = c.lamp; g.fill();
    roundPath(g, mid + i*3.55 - (i<0?1.9:0), 1.15, 1.9, 0.42, 0.2);
    g.fillStyle = 'rgba(255,255,255,.55)'; g.fill();
    roundPath(g, mid + i*3.45 - (i<0?1.9:0), H - 2.45, 1.9, 1.05, 0.3);
    g.fillStyle = c.tail; g.fill();
    roundPath(g, mid + i*3.45 - (i<0?1.9:0), H - 2.45, 1.9, 0.36, 0.18);
    g.fillStyle = 'rgba(255,190,180,.5)'; g.fill();
  }
  roundPath(g, mid - 1.5, H - 1.5, 3.0, 0.72, 0.16);     /* plate */
  g.fillStyle = c.white; g.fill();

  if(o.wing){                                            /* boot spoiler */
    roundPath(g, mid - o.rearHalf + 0.4, H - 5.4, (o.rearHalf - 0.4)*2, 0.85, 0.3);
    g.fillStyle = c.darker; g.fill();
    g.fillStyle = 'rgba(255,255,255,.22)';
    g.fillRect(mid - o.rearHalf + 0.6, H - 5.4, (o.rearHalf - 0.6)*2, 0.24);
  }

  drawTopLivery(g, livery, c, o);
  g.restore();

  /* ---- mirrors, outside the body clip ---- */
  for(i=-1;i<=1;i+=2){
    var mx = mid + i*(o.waistHalf + 0.05);
    roundPath(g, i < 0 ? mx - 1.25 : mx, sy + 0.35, 1.25, 0.9, 0.28);
    g.fillStyle = c.black; g.fill();
    g.fillStyle = 'rgba(255,255,255,.28)';
    g.fillRect(i < 0 ? mx - 1.25 : mx, sy + 0.35, 1.25, 0.26);
  }

  /* ---- damage ---- */
  if(damageTier >= 1){
    g.save(); carBodyPath(g, o); g.clip();
    g.strokeStyle = 'rgba(226,236,246,.85)'; g.lineWidth = 0.16;
    g.beginPath();
    g.moveTo(mid - 2.2, sy + 0.4);
    g.lineTo(mid + 0.3, sy + sh*0.55);
    g.lineTo(mid - 0.9, sy + sh - 0.3);
    g.moveTo(mid + 0.3, sy + sh*0.55);
    g.lineTo(mid + 2.4, sy + sh*0.4);
    g.stroke();
    g.restore();
  }
  if(damageTier >= 2){
    g.save(); carBodyPath(g, o); g.clip();
    g.fillStyle = 'rgba(28,24,20,.62)';
    roundPath(g, mid - o.frontHalf + 0.2, 3.4, 2.2, 3.0, 0.6); g.fill();
    roundPath(g, mid + o.rearHalf - 2.6, 21.0, 2.4, 3.2, 0.6); g.fill();
    g.fillStyle = 'rgba(0,0,0,.45)';
    roundPath(g, mid - 2.0, 1.6, 3.4, 1.6, 0.4); g.fill();
    g.restore();
  }

  return { canvas:cv, w:W*scale, h:H*scale, scale:scale, pw:W, ph:H };
}

/* Liveries in body units, clipped to the shell by the caller. */
function drawTopLivery(g, livery, c, o){
  var mid = CAR_UNIT_W/2, H = CAR_UNIT_H, i;
  g.fillStyle = c.accent;
  if(livery === 1){                                      /* twin stripes */
    g.fillRect(mid - 1.5, 0, 1.05, H);
    g.fillRect(mid + 0.45, 0, 1.05, H);
  } else if(livery === 2){                               /* rally panels */
    g.fillRect(mid - o.frontHalf - 0.5, 6.0, 1.5, 16.0);
    g.fillRect(mid + o.frontHalf - 1.0, 6.0, 1.5, 16.0);
    for(i=-1;i<=1;i+=2){
      g.beginPath();
      g.arc(mid + i*(o.waistHalf - 1.1), 15.0, 1.5, 0, TAU);
      g.fill();
    }
  } else if(livery === 3){                               /* chevrons */
    for(i=0;i<3;i++){
      var yy = 3.0 + i*8.0;
      g.beginPath();
      g.moveTo(mid, yy);
      g.lineTo(mid + o.frontHalf, yy + 2.6);
      g.lineTo(mid + o.frontHalf, yy + 4.2);
      g.lineTo(mid, yy + 1.6);
      g.lineTo(mid - o.frontHalf, yy + 4.2);
      g.lineTo(mid - o.frontHalf, yy + 2.6);
      g.closePath(); g.fill();
    }
  }
}

var spriteCache = {};
function getCarSprite(carId, paint, livery, damageTier, scale){
  var key = carId+'|'+paint+'|'+livery+'|'+damageTier+'|'+scale;
  if(!spriteCache[key]) spriteCache[key] = renderCarSprite(carId,paint,livery,damageTier,scale);
  return spriteCache[key];
}

/* =========================================================================
   SIDE VIEW — modular, layered, nose to the right.

   Geometry lives in CAR_SIDE as a pixel grid: a roofline profile, a sill,
   wheel positions and a few named regions. Layers read that spec, so a part
   can be swapped without anything else being redrawn:

     SIDE_LAYERS.<name>   whole layers (chassis, wheels, hood, livery, ...)
     WHEEL_STYLES.<name>  wheel designs        -> opts.wheels
     HOOD_PARTS.<name>    bonnet furniture     -> opts.hood  (turbo scoop etc.)
     TRIM_PARTS.<name>    small removable bits -> opts.trim  (array)
     opts.rideHeight      lifts the body off the wheels, wheels stay planted
   ========================================================================= */

var CAR_SIDE = {
  hatch: {
    gw:60, gh:32, ground:28, x0:3, x1:56, sill:23, belt:14,
    wheels:[ {cx:14, axleY:22, r:6, archR:7}, {cx:45, axleY:22, r:6, archR:7} ],
    top:[ [3,19],[4,16],[6,13],[11,8],[17,6],[31,6],[37,9],[47,12],[52,14],[55,16],[56,18] ],
    windows:[ {x:12,y:8,w:9,h:5,rakeL:0.9,rakeR:0},
              {x:23,y:8,w:11,h:5,rakeL:0,rakeR:0.7} ],
    shuts:[22, 35],
    hood:{ x0:38, x1:52, y:11 },
    spoiler:null,
    trim:['lights','handle','mirror','exhaust'],
    wheelStyle:'steel'
  },
  rally: {
    gw:68, gh:32, ground:28, x0:3, x1:64, sill:23, belt:14,
    wheels:[ {cx:16, axleY:22, r:6, archR:7}, {cx:52, axleY:22, r:6, archR:7} ],
    top:[ [3,18],[4,15],[7,12],[14,8],[20,6],[36,6],[42,9],[54,12],[60,14],[63,16],[64,18] ],
    windows:[ {x:15,y:8,w:10,h:5,rakeL:0.8,rakeR:0},
              {x:27,y:8,w:12,h:5,rakeL:0,rakeR:0.7} ],
    shuts:[26, 40],
    hood:{ x0:43, x1:58, y:11 },
    spoiler:{ x:5, w:11, h:2, standX:11, standH:4 },
    trim:['lights','handle','mirror','exhaust','splitter','spoiler'],
    wheelStyle:'alloy'
  },
  wrc: {
    gw:72, gh:32, ground:28, x0:2, x1:69, sill:22, belt:13,
    wheels:[ {cx:17, axleY:21, r:7, archR:8}, {cx:55, axleY:21, r:7, archR:8} ],
    top:[ [2,17],[3,14],[6,11],[15,7],[22,5],[40,5],[46,8],[58,11],[65,13],[68,15],[69,17] ],
    windows:[ {x:17,y:7,w:11,h:5,rakeL:0.8,rakeR:0},
              {x:30,y:7,w:13,h:5,rakeL:0,rakeR:0.7} ],
    shuts:[29, 44],
    hood:{ x0:47, x1:62, y:10 },
    spoiler:{ x:4, w:14, h:2, standX:13, standH:5 },
    trim:['lights','handle','mirror','exhaust','splitter','spoiler'],
    wheelStyle:'rallyWheel'
  }
};

/* linear roofline profile, rounded to whole pixels so edges stair-step */
function sideProfileY(pts, x){
  if(x <= pts[0][0]) return pts[0][1];
  for(var i=1;i<pts.length;i++){
    if(x <= pts[i][0]){
      var a = pts[i-1], b = pts[i];
      var t = (b[0]===a[0]) ? 0 : (x-a[0])/(b[0]-a[0]);
      return Math.round(a[1] + (b[1]-a[1])*t);
    }
  }
  return pts[pts.length-1][1];
}

function buildSideModel(spec, o, sg){
  var prof = [];
  for(var x=spec.x0;x<=spec.x1;x++) prof[x] = sideProfileY(spec.top, x);
  return {
    spec: spec, opts: o, colors: carPalette(o.paint, o.damage>=1?1:0),
    dy: -(o.rideHeight||0),                     /* chassis Y-offset: suspension */
    topAt: function(x){ return prof[x]; },
    bottomAt: function(x){                      /* sill, cut away by wheel arches */
      var b = spec.sill;
      for(var i=0;i<spec.wheels.length;i++){
        var w = spec.wheels[i], dx = x - w.cx;
        var t = w.archR*w.archR - dx*dx;
        if(t > 0){
          var y = w.axleY - Math.round(Math.sqrt(t));
          if(y < b) b = y;
        }
      }
      return b;
    },
    px: function(x,y,w,h,col){
      sg.fillStyle = col;
      sg.fillRect(Math.round(x), Math.round(y), Math.max(1,Math.round(w)), Math.max(1,Math.round(h)));
    },
    disc: function(cx,cy,r,col){
      for(var dy=-r; dy<=r; dy++){
        var dx = Math.floor(Math.sqrt(Math.max(0, r*r - dy*dy)) + 0.5);
        if(dx>0) this.px(cx-dx, cy+dy, dx*2+1, 1, col);
      }
    }
  };
}

/* --------------------------------------------------- round-shape helpers
   Everything circular in the side view (tyres, rims, turbo housings) is
   plotted from angles so the stair-stepping stays consistent. Canvas Y
   grows downward, so PI..1.5PI is the upper-left quadrant — the lit side. */
function ringPx(m, cx, cy, ang, rad, col, w, h){
  m.px(cx + Math.round(Math.cos(ang)*rad),
       cy + Math.round(Math.sin(ang)*rad), w||1, h||1, col);
}
function arcRun(m, cx, cy, rad, a0, a1, steps, col){
  for(var i=0;i<=steps;i++) ringPx(m, cx, cy, a0 + (a1-a0)*(i/steps), rad, col);
}
var LIT_A0 = Math.PI*1.08, LIT_A1 = Math.PI*1.56;         /* upper-left, lit  */
var SHD_A0 = Math.PI*0.10, SHD_A1 = Math.PI*0.56;         /* lower-right, dark */

/* ---------------------------------------------------- wheels (swappable)
   A wheel is a tread (the compound fitted) plus a rim (how much has been
   spent on tyres). WHEEL_STYLES stays as whole-wheel presets so anything
   selecting via opts.wheels keeps working.

   Treads share one carcass — black outer wall, rubber inner, a sheen on the
   lit side and a shadow opposite — then lay their own block pattern over it,
   so a compound reads by its texture and not just by its tint. */
function tyreCarcass(m, w, rubber, sheen, shadow){
  m.disc(w.cx, w.axleY, w.r,   m.colors.black);
  m.disc(w.cx, w.axleY, w.r-1, rubber);
  arcRun(m, w.cx, w.axleY, w.r-1, LIT_A0, LIT_A1, 12, sheen);
  arcRun(m, w.cx, w.axleY, w.r-1, SHD_A0, SHD_A1, 12, shadow);
  arcRun(m, w.cx, w.axleY, w.r-2, LIT_A0+0.4, LIT_A1-0.4, 6, sheen);
}
/* repeated marks around the circumference — the tread blocks */
function treadBlocks(m, w, n, rad, col, bw, bh, phase){
  for(var a=0;a<n;a++)
    ringPx(m, w.cx, w.axleY, a*TAU/n + (phase||0), rad, col, bw||1, bh||1);
}

var WHEEL_TREADS = {
  all: function(g, m, w){                                 /* mild all-terrain */
    tyreCarcass(m, w, '#2b3037', '#464e57', '#16191d');
    treadBlocks(m, w, 12, w.r-1, '#12151a');              /* fine block edges */
    treadBlocks(m, w, 12, w.r-1, '#3c434c', 1, 1, TAU/24);
    m.disc(w.cx, w.axleY, w.r-3, '#22262b');              /* sidewall step */
  },
  gravel: function(g, m, w){                              /* chunky, dust-stained */
    tyreCarcass(m, w, '#3b3428', '#5c5140', '#1e1a14');
    treadBlocks(m, w, 8, w.r-1, '#7a684a', 2, 2);         /* big shoulder lugs */
    treadBlocks(m, w, 8, w.r-2, '#100e0b', 1, 1, TAU/16); /* gaps between them */
    m.disc(w.cx, w.axleY, w.r-3, '#2c2820');
    arcRun(m, w.cx, w.axleY, w.r-3, LIT_A0, LIT_A1, 6, '#4a4234');
  },
  tarmac: function(g, m, w){                              /* slick and glossy */
    tyreCarcass(m, w, '#15181c', '#5a626b', '#0b0d10');
    treadBlocks(m, w, 16, w.r-1, '#0a0c0e');              /* fine cut grooves */
    arcRun(m, w.cx, w.axleY, w.r-2, Math.PI*1.18, Math.PI*1.44, 5, '#828a94');
    m.disc(w.cx, w.axleY, w.r-3, '#1a1e23');
  },
  snow: function(g, m, w){                                /* studded, cold cast */
    tyreCarcass(m, w, '#262f39', '#48586a', '#12171d');
    treadBlocks(m, w, 10, w.r-1, m.colors.chrome);        /* steel studs */
    treadBlocks(m, w, 10, w.r-2, '#0f1318', 1, 1, TAU/20);/* siping */
    m.disc(w.cx, w.axleY, w.r-3, '#1e252d');
  }
};

/* ------------------------------------------------------------ rim helpers
   Race rims take the car's accent, except when that accent is near-white —
   a white rim on a light car vanishes, so those fall back to rally gold. */
function rimLipColor(accent){
  var c = accent.replace('#','');
  if(c.length===3) c = c[0]+c[0]+c[1]+c[1]+c[2]+c[2];
  var lum = (parseInt(c.substr(0,2),16)*0.30 + parseInt(c.substr(2,2),16)*0.59
           + parseInt(c.substr(4,2),16)*0.11) / 255;
  return lum > 0.72 ? '#d9a02c' : accent;
}

function rimSpokes(m, w, n, r0, r1, col, phase){
  for(var a=0;a<n;a++){
    var th = a*TAU/n + (phase||0);
    for(var t=r0;t<=r1;t+=0.5)
      ringPx(m, w.cx, w.axleY, th, t, col);
  }
}
function rimShine(m, w, rad, hi, lo){                     /* the metallic catch */
  arcRun(m, w.cx, w.axleY, rad, LIT_A0, LIT_A1, 8, hi);
  arcRun(m, w.cx, w.axleY, rad, SHD_A0, SHD_A1, 8, lo);
}
function rimHub(m, w, cap, boss){
  m.px(w.cx-1, w.axleY-1, 2, 2, cap);
  m.px(w.cx-1, w.axleY-1, 1, 1, boss);
}

var WHEEL_RIMS = {
  steel: function(g, m, w){                               /* pressed steel, hub cap */
    var c = m.colors, f = w.r-3;
    m.disc(w.cx, w.axleY, f+1, '#31363c');                /* bead lip */
    m.disc(w.cx, w.axleY, f, '#6e757d');                  /* dished face */
    for(var a=0;a<4;a++) ringPx(m, w.cx, w.axleY, a*TAU/4+TAU/8, f, '#2a2f34');
    rimShine(m, w, f, '#b6bdc4', '#4b5157');
    rimHub(m, w, c.chrome, '#eef1f4');
  },
  alloy: function(g, m, w){                               /* five polished spokes */
    var c = m.colors, f = w.r-3;
    m.disc(w.cx, w.axleY, f+1, '#3a4046');
    m.disc(w.cx, w.axleY, f, '#2f343a');                  /* dark between spokes */
    rimSpokes(m, w, 5, 2, f, '#a2aab2', -Math.PI/2);  /* tips only: gaps show */
    rimShine(m, w, f+1, '#c9d0d7', '#41474d');
    rimHub(m, w, c.chromeDark, c.chrome);
  },
  sport: function(g, m, w){                               /* dark mesh, machined lip */
    var c = m.colors, f = w.r-3;
    m.disc(w.cx, w.axleY, f+1, '#9aa2ab');                /* machined outer lip */
    m.disc(w.cx, w.axleY, f, '#23272c');
    rimSpokes(m, w, 6, f-1, f, '#8e969f', TAU/12);  /* short mesh spokes */
    rimSpokes(m, w, 3, 2, f-1, '#6d747c', -Math.PI/2);
    rimShine(m, w, f+1, '#e4e9ee', '#4b5158');
    rimHub(m, w, '#1b1e22', c.chromeDark);
  },
  race: function(g, m, w){                                /* coloured lip, centre lock */
    var c = m.colors, f = w.r-3, lip = rimLipColor(c.accent);
    m.disc(w.cx, w.axleY, f+1, shade(lip, -0.18));        /* painted rim lip */
    arcRun(m, w.cx, w.axleY, f+1, LIT_A0, LIT_A1, 8, lip);
    m.disc(w.cx, w.axleY, f, '#2b3036');
    rimSpokes(m, w, 5, 2, f, '#b2b9c1', -Math.PI/2);
    rimShine(m, w, f, '#dfe6ec', '#3f454b');              /* inside the painted lip */
    rimHub(m, w, c.accent, '#f4f6f8');
  }
};

var WHEEL_STYLES = {
  steel:      function(g, m, w){ WHEEL_TREADS.all(g,m,w);    WHEEL_RIMS.steel(g,m,w); },
  alloy:      function(g, m, w){ WHEEL_TREADS.all(g,m,w);    WHEEL_RIMS.alloy(g,m,w); },
  rallyWheel: function(g, m, w){ WHEEL_TREADS.gravel(g,m,w); WHEEL_RIMS.race(g,m,w);  }
};

function drawSideWheels(g, m){
  var o = m.opts, ws = m.spec.wheels, i;
  if(o.tread || o.rim){                                   /* composed from parts */
    var tread = WHEEL_TREADS[o.tread] || WHEEL_TREADS.all;
    var rim   = WHEEL_RIMS[o.rim]     || WHEEL_RIMS.steel;
    for(i=0;i<ws.length;i++){ tread(g, m, ws[i], i); rim(g, m, ws[i], i); }
  } else {                                                /* whole-wheel preset */
    var style = WHEEL_STYLES[o.wheels] || WHEEL_STYLES.steel;
    for(i=0;i<ws.length;i++) style(g, m, ws[i], i);
  }
}

/* Inner wheel arches, drawn under the wheels. They give the arch gap a dark
   well to read against, so raising or dropping the body is obvious instead
   of just letting the backdrop show through. */
function drawSideWells(g, m){
  var s = m.spec, dy = m.dy;
  for(var i=0;i<s.wheels.length;i++){
    var w = s.wheels[i], R = w.archR;
    for(var dx=-R;dx<=R;dx++){
      var t = R*R - dx*dx; if(t <= 0) continue;
      var xx = w.cx + dx;
      if(xx < s.x0 || xx > s.x1) continue;
      var y = w.axleY - Math.round(Math.sqrt(t)) + dy;
      if(w.axleY > y) m.px(xx, y, 1, w.axleY - y + 1, '#0b0d0f');
    }
  }
}

/* ------------------------------------------------------------- chassis
   Shading is light-source consistent: the sun sits above and slightly
   behind, so every column runs bright along the top edge, holds body
   colour through the doors, and falls away through the lower flank into a
   near-black rocker. The shoulder crease above the belt line catches a
   second highlight, which is what gives the flank its 16-bit roundness. */
function shadeEnd(m, x, k){                              /* wash a column darker */
  var t = m.topAt(x), b = m.bottomAt(x);
  if(b - t < 1) return;
  m.px(x, t+m.dy, 1, b-t, 'rgba(10,12,16,'+(0.16*k).toFixed(3)+')');
}
function bodyBandColor(m, y, top, bot){
  var c = m.colors, s = m.spec, h = bot - top;
  if(y === top)   return c.hi;                           /* roof / bonnet catch */
  if(y === top+1) return h > 4 ? c.lite : c.body;
  if(h > 6){
    if(y === bot-1) return c.deep;                       /* sill in shadow */
    if(y === bot-2) return c.darker;                     /* rocker */
    if(y === bot-3) return c.dark;                       /* lower flank falls off */
  } else if(h > 2 && y === bot-1) return c.darker;
  if(y === s.belt)   return c.dark;                      /* shoulder crease */
  if(y === s.belt-1) return c.lite;                      /* light along the crease */
  return c.body;
}
function drawSideChassis(g, m){
  var s = m.spec, c = m.colors, dy = m.dy, x, y;
  /* 1px dark silhouette so the car reads against any backdrop */
  for(x=s.x0-1;x<=s.x1+1;x++){
    var ox = clamp(x, s.x0, s.x1);
    var ot = m.topAt(ox), ob = m.bottomAt(ox);
    if(ob - ot < 1) continue;
    m.px(x, ot+dy-1, 1, (ob-ot)+2, c.black);
  }
  for(x=s.x0;x<=s.x1;x++){
    var top = m.topAt(x), bot = m.bottomAt(x);
    if(bot - top < 1) continue;
    for(y=top;y<bot;y++) m.px(x, y+dy, 1, 1, bodyBandColor(m, y, top, bot));
  }
  /* nose and tail turn away from the light, so both ends darken off */
  for(x=s.x0;x<=s.x0+2;x++) shadeEnd(m, x, (s.x0+3-x)/4);
  for(x=s.x1-2;x<=s.x1;x++) shadeEnd(m, x, (x-s.x1+3)/4);
  /* panel shut lines — only below the glass, so they read as door gaps */
  for(var k=0;k<s.shuts.length;k++){
    var sx = s.shuts[k], t = Math.max(s.belt-1, m.topAt(sx)+1), b = m.bottomAt(sx);
    if(b - t > 2) m.px(sx, t+dy, 1, b-t-2, c.dark);
  }
  /* wheel arch lips */
  for(var i=0;i<s.wheels.length;i++){
    var w = s.wheels[i];
    for(var dx=-w.archR;dx<=w.archR;dx++){
      var tt = w.archR*w.archR - dx*dx; if(tt <= 0) continue;
      var xx = w.cx + dx;
      if(xx < s.x0 || xx > s.x1) continue;
      var y = w.axleY - Math.round(Math.sqrt(tt));
      if(y - 1 > m.topAt(xx)) m.px(xx, y+dy-1, 1, 1, c.darker);
    }
  }
  /* bumpers, darker than the flanks */
  m.px(s.x0, m.topAt(s.x0)+dy, 2, m.bottomAt(s.x0)-m.topAt(s.x0), c.darker);
  m.px(s.x1-1, m.topAt(s.x1)+dy, 2, m.bottomAt(s.x1)-m.topAt(s.x1), c.darker);
}

/* --------------------------------------------------------------- glass */
function drawSideGlass(g, m){
  var s = m.spec, c = m.colors, dy = m.dy;
  /* "strip the interior, lexan glass" — so at higher weight tiers it is */
  var gMain = m.opts.lexan ? '#9db2c0' : c.glass;
  var gLite = m.opts.lexan ? '#c0d2dc' : c.glassLite;
  for(var i=0;i<s.windows.length;i++){
    var w = s.windows[i];
    for(var r=0;r<w.h;r++){
      var l  = w.x + Math.round((w.rakeL||0)*(w.h-1-r));
      var rr = w.x + w.w - Math.round((w.rakeR||0)*(w.h-1-r));
      if(rr <= l) continue;
      m.px(l, w.y+r+dy, rr-l, 1, r===0 ? gLite : gMain);
    }
  }
}

/* ------------------------------- hood / engine bay (turbo scoop goes here)
   The four tiers are meant to read as hardware, not as silhouettes: a bare
   bonnet, then louvres, then a moulded scoop with a real intake mouth, and
   finally an exposed turbo housing plumbed to a front-mount intercooler. */

/* front-mount intercooler sitting behind the bumper opening */
function drawIntercooler(m, x0, y0, wdt){
  var c = m.colors;
  m.px(x0, y0, wdt, 1, c.chrome);                         /* top tank, lit */
  m.px(x0, y0+1, wdt, 3, '#3a4046');                      /* core shadow box */
  for(var i=0;i<wdt;i++)                                  /* alternating fins */
    m.px(x0+i, y0+1, 1, 3, (i%2) ? '#8e969f' : '#565d65');
  m.px(x0, y0+4, wdt, 1, c.chromeDark);                   /* bottom tank */
  m.px(x0, y0, 1, 5, '#2b3036');                          /* end tank, shaded */
  m.px(x0+wdt-1, y0, 1, 5, '#a8b0b8');                    /* end tank, lit */
}
/* charge pipe following the bonnet line, with a highlight along its top */
function drawChargePipe(m, xa, xb, drop){
  var c = m.colors, dy = m.dy;
  for(var x=xa;x<=xb;x++){
    var t = m.topAt(x) + dy + drop;
    m.px(x, t, 1, 2, c.chromeDark);
    m.px(x, t, 1, 1, c.chrome);
  }
}

var HOOD_PARTS = {
  stock: function(g, m){
    var h = m.spec.hood, c = m.colors, dy = m.dy;
    m.px(h.x0, m.topAt(h.x0)+dy+1, 1, 2, c.darker);      /* bonnet shut line */
    for(var x=h.x0+2;x<=h.x1-1;x++)                      /* pressed swage line */
      m.px(x, m.topAt(x)+dy+2, 1, 1, c.dark);
  },
  vents: function(g, m){                                  /* louvred bonnet */
    var h = m.spec.hood, c = m.colors, dy = m.dy;
    HOOD_PARTS.stock(g, m);
    for(var i=0;i<3;i++){
      var x = h.x0 + 4 + i*3, t = m.topAt(x)+dy;
      m.px(x, t+1, 2, 1, c.deep);                         /* slot cut into the panel */
      m.px(x, t+2, 2, 1, c.darker);                       /* shadow under the louvre */
      m.px(x+2, t+1, 1, 1, c.hi);                         /* raised lip catches light */
    }
  },
  scoop: function(g, m){                                  /* moulded bonnet scoop */
    var h = m.spec.hood, c = m.colors, dy = m.dy;
    HOOD_PARTS.stock(g, m);
    var x0 = h.x0 + 3, wdt = 7, x;
    for(x=x0;x<x0+wdt;x++){
      var t = m.topAt(x) + dy;
      var rise = (x < x0+2) ? 2 : 3;                      /* ramps up off the panel */
      m.px(x, t-rise, 1, rise, c.dark);                   /* scoop flank in shadow */
      m.px(x, t-rise, 1, 1, c.lite);                      /* moulding catches light */
      m.px(x, t-rise+1, 1, 1, c.body);
    }
    var fx = x0 + wdt - 3, ft = m.topAt(fx) + dy;
    m.px(fx, ft-4, 3, 1, c.hi);                           /* lip above the mouth */
    m.px(fx, ft-3, 3, 3, c.black);                        /* intake mouth */
    m.px(fx+1, ft-2, 2, 1, '#2a3036');                    /* depth inside the mouth */
    m.px(fx-1, ft-3, 1, 3, c.darker);                     /* mouth cheek */
  },
  turbo: function(g, m){                                  /* exposed turbo + FMIC */
    var h = m.spec.hood, c = m.colors, dy = m.dy, s = m.spec;
    HOOD_PARTS.stock(g, m);

    /* cut-out in the bonnet with the compressor housing standing proud */
    var tx = h.x0 + Math.round((h.x1-h.x0)*0.52), ty = m.topAt(tx) + dy;
    m.px(tx-3, ty+1, 7, 2, c.deep);                       /* opening, in shadow */
    m.px(tx-3, ty, 7, 1, c.darker);                       /* folded panel edge */
    m.disc(tx, ty, 2, '#22272c');                         /* housing shadow */
    m.disc(tx, ty-1, 2, '#7d858e');                       /* snail body */
    arcRun(m, tx, ty-1, 2, LIT_A0, LIT_A1, 6, '#d2d9e0'); /* polished highlight */
    arcRun(m, tx, ty-1, 2, SHD_A0, SHD_A1, 6, '#3d434a');
    m.px(tx, ty-1, 1, 1, '#2b3036');                      /* compressor centre */
    m.px(tx-3, ty-1, 2, 2, '#5b636b');                    /* turbine inlet snout */
    m.px(tx-3, ty-1, 2, 1, '#9aa2ab');
    m.px(tx+2, ty-3, 2, 2, '#8e969f');                    /* wastegate can */
    m.px(tx+2, ty-3, 1, 1, '#cfd6dd');

    /* charge pipe running down the wing to the front-mount cooler, which
       sits in the bumper opening ahead of the front arch */
    var fw = s.wheels[s.wheels.length-1];
    var nx = fw.cx + fw.archR + 1, wdt = Math.max(3, s.x1 - nx);
    drawChargePipe(m, tx+3, s.x1-2, 2);
    var icY = s.sill + dy - 5;
    m.px(nx-1, icY-1, 2, 2, c.chromeDark);                /* elbow into the cooler */
    m.px(nx-1, icY-1, 2, 1, c.chrome);
    drawIntercooler(m, nx, icY, wdt);
  }
};
function drawSideHood(g, m){
  var fn = HOOD_PARTS[m.opts.hood] || HOOD_PARTS.stock;
  fn(g, m);
}

/* -------------------------------------------------------------- livery */
function sideLiveryHit(lv, x, y, m){
  var s = m.spec;
  if(lv===1){                                             /* twin flank stripes */
    return (y === s.belt+2 || y === s.belt+4);
  }
  if(lv===2){                                             /* door blade + roundel */
    var d0 = s.shuts[0], d1 = s.shuts[1];
    if(x > d0-9 && x < d1+2 && y >= s.belt+1 && y <= s.belt+3) return true;
    var rx = d0 - 4, ry = s.belt + 6;                     /* number roundel */
    if(Math.abs(x-rx) + Math.abs(y-ry)*1.6 < 4) return true;
    return false;
  }
  if(lv===3){                                             /* chevron */
    return ((x*0.6 + y) % 14) < 3;
  }
  return false;
}
function drawSideLivery(g, m){
  var lv = m.opts.livery|0;
  if(!lv) return;
  var s = m.spec, dy = m.dy, acc = m.colors.accent;
  for(var x=s.x0+2;x<=s.x1-2;x++){
    var top = m.topAt(x), bot = m.bottomAt(x);
    for(var y=top+1;y<bot-1;y++){
      if(sideLiveryHit(lv, x, y, m)) m.px(x, y+dy, 1, 1, acc);
    }
  }
}

/* --------------------------------------------- trim (individually removable) */
var TRIM_PARTS = {
  lights: function(g, m){
    var s = m.spec, c = m.colors, dy = m.dy;
    var fx = s.x1-4, rx = s.x0+1;
    m.px(fx, m.topAt(fx)+1+dy, 3, 2, c.lamp);
    m.px(rx, m.topAt(rx)+1+dy, 2, 2, c.tail);
  },
  handle: function(g, m){
    var s = m.spec;
    m.px(s.shuts[0]+3, s.belt+2+m.dy, 3, 1, m.colors.chrome);
  },
  mirror: function(g, m){
    var s = m.spec, c = m.colors, dy = m.dy;
    var w = s.windows[s.windows.length-1];
    var mx = w.x + w.w, my = w.y + w.h - 1;
    m.px(mx, my+dy, 2, 2, c.darker);
    m.px(mx, my+dy, 1, 1, c.dark);
  },
  exhaust: function(g, m){
    var s = m.spec, c = m.colors, y = m.bottomAt(s.x0+1)-2+m.dy;
    m.px(s.x0+1, y, 3, 2, c.chromeDark);
    m.px(s.x0+1, y, 3, 1, c.chrome);                      /* lit top of the tip */
    m.px(s.x0+1, y+1, 1, 1, '#0e1114');                   /* dark tail pipe mouth */
  },
  exhaustBig: function(g, m){                             /* engine tier: bigger system */
    var s = m.spec, c = m.colors, y = m.bottomAt(s.x0+1)-3+m.dy;
    m.px(s.x0+1, y+1, 5, 1, '#3b3f44');                   /* back box under the valance */
    m.px(s.x0, y, 4, 3, c.chromeDark);                    /* twin tips */
    m.px(s.x0, y, 4, 1, c.chrome);
    m.px(s.x0, y+1, 1, 1, '#0e1114');
    m.px(s.x0, y+2, 1, 1, '#0e1114');
    m.px(s.x0+3, y+1, 1, 2, '#7f878f');                   /* heat-stained shoulder */
  },
  splitter: function(g, m){                               /* front lip */
    var s = m.spec, c = m.colors, x = s.x1-7;
    m.px(x, m.bottomAt(x)-1+m.dy, 8, 2, c.deep);
    m.px(x, m.bottomAt(x)-1+m.dy, 8, 1, c.darker);        /* top face catches light */
  },
  spoiler: function(g, m){
    var t = m.spec.spoiler; if(!t) return;
    var c = m.colors, dy = m.dy;
    var deck = m.topAt(t.standX);                         /* stands reach the deck */
    var y = deck - t.standH;
    m.px(t.x, y+dy, t.w, t.h, c.deep);                    /* blade */
    m.px(t.x, y+dy, t.w, 1, c.dark);                      /* lit top edge */
    m.px(t.standX, y+dy+t.h, 2, deck-(y+t.h)+1, c.deep);
    var xo = t.x + 1;                                     /* outer stand */
    m.px(xo, y+dy+t.h, 2, Math.max(1, m.topAt(xo)-(y+t.h)+1), c.deep);
  },

  /* ---- cues left behind when weight reduction takes a part off. A deleted
     part never just vanishes: what is left is the blanking plate and the
     patch of paint the part had been shading. */
  mirrorGone: function(g, m){
    var s = m.spec, c = m.colors, dy = m.dy;
    var w = s.windows[s.windows.length-1];
    var mx = w.x + w.w, my = w.y + w.h - 1;
    m.px(mx, my+dy, 2, 1, c.darker);                      /* blanking plate */
    m.px(mx, my+dy-1, 2, 1, c.lite);                      /* unfaded paint above it */
  },
  handleGone: function(g, m){
    var s = m.spec, c = m.colors;
    m.px(s.shuts[0]+3, s.belt+2+m.dy, 3, 1, c.dark);      /* filled recess */
    m.px(s.shuts[0]+3, s.belt+1+m.dy, 3, 1, c.lite);      /* shadow line gone lighter */
  },
  spoilerGone: function(g, m){
    var t = m.spec.spoiler; if(!t) return;
    var c = m.colors, dy = m.dy;
    var xo = t.x + 1;
    m.px(t.standX, m.topAt(t.standX)+dy, 2, 1, c.deep);   /* capped mounting holes */
    m.px(xo, m.topAt(xo)+dy, 2, 1, c.deep);
    for(var x=t.x;x<t.x+t.w;x++)                          /* paint the blade masked */
      m.px(x, m.topAt(x)+dy+1, 1, 1, c.lite);
  }
};
function drawSideTrim(g, m){
  var list = m.opts.trim || [];
  for(var i=0;i<list.length;i++){
    var fn = TRIM_PARTS[list[i]];
    if(fn) fn(g, m);
  }
}

/* ----------------------------------------------- body kit (top tiers only)
   Small additions that only appear once a category is maxed, so a finished
   car has a shape a stock one does not: flared arches, a skirt joining
   them, and a bigger wing on the deck. */
var KIT_PARTS = {
  fenders: function(g, m){                                /* flared wheel arches */
    var s = m.spec, c = m.colors, dy = m.dy;
    for(var i=0;i<s.wheels.length;i++){
      var w = s.wheels[i], R = w.archR + 1;
      for(var dx=-R;dx<=R;dx++){
        var t = R*R - dx*dx; if(t <= 0) continue;
        var xx = w.cx + dx;
        if(xx < s.x0 || xx > s.x1) continue;
        var y = w.axleY - Math.round(Math.sqrt(t));
        if(y > s.sill-3) continue;                        /* stop short of the sill */
        m.px(xx, y+dy, 1, 2, c.dark);                     /* flare face */
        m.px(xx, y+dy, 1, 1, c.body);                     /* lit crown of the flare */
        m.px(xx, y+dy+2, 1, 1, 'rgba(0,0,0,.5)');         /* shadow it casts inside */
      }
    }
  },
  skirt: function(g, m){                                  /* side skirt joining the arches */
    var s = m.spec, c = m.colors, dy = m.dy;
    var a = s.wheels[0], b = s.wheels[s.wheels.length-1];
    var xa = a.cx + a.archR - 1, xb = b.cx - b.archR + 1;
    if(xb - xa < 3) return;
    m.px(xa, s.sill+dy, xb-xa, 1, c.darker);              /* skirt top face */
    m.px(xa+1, s.sill+dy+1, xb-xa-2, 1, c.deep);          /* drops below the rocker */
    m.px(xa+1, s.sill+dy+2, xb-xa-2, 1, 'rgba(0,0,0,.45)');
  },
  wing: function(g, m){                                   /* taller blade, end plate */
    var s = m.spec, t = s.spoiler, c = m.colors, dy = m.dy;
    if(!t){                                               /* no wing mount: ducktail */
      for(var x=s.x0+1;x<=s.x0+7;x++){
        var top = m.topAt(x) + dy;
        m.px(x, top-2, 1, 2, c.dark);
        m.px(x, top-2, 1, 1, c.hi);
      }
      m.px(s.x0+1, m.topAt(s.x0+1)+dy-2, 1, 3, c.deep);
      return;
    }
    var deck = m.topAt(t.standX), y = deck - t.standH - 2; /* sits higher than stock */
    y = Math.max(y, 3 - dy);                              /* but never off the top */
    var wdt = t.w + 2;
    m.px(t.x-1, y+dy, wdt, t.h+1, c.deep);                /* blade */
    m.px(t.x-1, y+dy, wdt, 1, c.hi);                      /* lit leading edge */
    m.px(t.x-1, y+dy+t.h+1, wdt, 1, 'rgba(0,0,0,.4)');
    m.px(t.x-1, y+dy-2, 1, t.h+4, c.darker);              /* end plate */
    m.px(t.x-1, y+dy-2, 1, 1, c.dark);
    m.px(t.standX, y+dy+t.h+1, 2, deck-(y+t.h)+1, c.deep);
    var xo = t.x + 1;
    m.px(xo, y+dy+t.h+1, 2, Math.max(1, m.topAt(xo)-(y+t.h)+1), c.deep);
  }
};
function drawSideKit(g, m){
  var list = m.opts.kit || [];
  for(var i=0;i<list.length;i++){
    var fn = KIT_PARTS[list[i]];
    if(fn) fn(g, m);
  }
}

function drawSideShadow(g, m){
  var s = m.spec;
  m.px(s.x0+4, s.ground+1, s.x1-s.x0-7, 1, 'rgba(0,0,0,.26)');
  m.px(s.x0+8, s.ground+2, s.x1-s.x0-15, 1, 'rgba(0,0,0,.14)');
}

/* Layer table and draw order — either can be re-pointed by a later pass. */
var SIDE_LAYERS = {
  shadow:  drawSideShadow,
  wells:   drawSideWells,
  wheels:  drawSideWheels,
  chassis: drawSideChassis,
  hood:    drawSideHood,
  livery:  drawSideLivery,
  glass:   drawSideGlass,
  kit:     drawSideKit,
  trim:    drawSideTrim
};
var SIDE_LAYER_ORDER = ['shadow','wells','wheels','chassis','hood','livery','glass','kit','trim'];

/* Returns {canvas, w, h, pw, ph, spec, opts} — a side-on car facing RIGHT. */
function renderCarSide(carId, opts){
  var def = carDef(carId), spec = CAR_SIDE[def.sprite];
  opts = opts || {};
  var o = {
    paint:      opts.paint || def.paint,
    livery:     opts.livery || 0,
    scale:      opts.scale || 4,
    rideHeight: opts.rideHeight || 0,
    wheels:     opts.wheels || spec.wheelStyle,
    tread:      opts.tread || null,
    rim:        opts.rim || null,
    lexan:      !!opts.lexan,
    hood:       opts.hood || 'stock',
    trim:       opts.trim || spec.trim,
    kit:        opts.kit || [],
    damage:     opts.damage || 0
  };

  /* draw at 1:1 into a tiny canvas, then blow it up with smoothing off, so
     every edge lands on a whole pixel the way hand-drawn sprite work does */
  var small = document.createElement('canvas');
  small.width = spec.gw; small.height = spec.gh;
  var sg = small.getContext('2d');
  var m = buildSideModel(spec, o, sg);
  for(var i=0;i<SIDE_LAYER_ORDER.length;i++){
    var fn = SIDE_LAYERS[SIDE_LAYER_ORDER[i]];
    if(fn) fn(sg, m);
  }

  var cv = document.createElement('canvas');
  cv.width = spec.gw*o.scale; cv.height = spec.gh*o.scale;
  var g = cv.getContext('2d');
  g.imageSmoothingEnabled = false;
  g.drawImage(small, 0, 0, cv.width, cv.height);
  return { canvas:cv, w:cv.width, h:cv.height, scale:o.scale, pw:spec.gw, ph:spec.gh, spec:spec, opts:o };
}

/* ---------------------------------------------------------------------
   Upgrade reflection — turns a car's equipped upgrades into side-view
   sprite options. Presentational only: nothing here feeds back into
   stats, pricing or handling, it just picks which layers get drawn.
     suspension -> chassis ride height: stock sits tall on its springs, each
                   tier drops it until the arches tuck over the tyres
     turbo      -> bonnet furniture, up to an exposed turbo plumbed to a
                   front-mount intercooler
     tyres      -> tread from the fitted compound, rim from the tier bought
     engine     -> exhaust system
     weight     -> trim comes off, heaviest items first, leaving blanking
                   plates and unfaded paint behind
     maxed tiers add body kit pieces on top of all that
   --------------------------------------------------------------------- */
var TURBO_HOODS = ['stock','vents','scoop','turbo'];
var TYRE_RIMS   = ['steel','alloy','sport','race'];       /* by tyre tier 0..3 */
var STRIP_ORDER = [null, 'mirror', 'handle', 'spoiler'];  /* by weight tier */
var STRIP_SCARS = { mirror:'mirrorGone', handle:'handleGone', spoiler:'spoilerGone' };
var SUSP_RIDE   = [3, 2, 1, -1];      /* +ve lifts the body off the wheels */

function carSideOpts(carId, extra){
  /* shopCarSave, not save.cars, so an unpaid shop preview shows on the car
     through this same renderer — there is no second preview sprite path */
  var def = carDef(carId), cs = shopCarSave(carId), u = cs.up;
  var spec = CAR_SIDE[def.sprite];
  var tyreLvl = clamp(cs.tires[cs.fitted]|0, 0, 3);
  var susp = clamp(u.susp, 0, 3), turbo = clamp(u.turbo, 0, 3), weight = clamp(u.weight, 0, 3);

  var stripped = {};
  for(var w=1; w<=weight; w++) stripped[STRIP_ORDER[w]] = true;
  var trim = [], part;
  for(var i=0;i<spec.trim.length;i++){
    part = spec.trim[i];
    if(stripped[part]){                                   /* removed, but it shows */
      if(part === 'spoiler' && turbo >= 3) continue;      /* the wing takes its place */
      if(STRIP_SCARS[part]) trim.push(STRIP_SCARS[part]);
      continue;
    }
    if(part === 'exhaust' && u.engine >= 2) part = 'exhaustBig';
    trim.push(part);
  }

  var kit = [];
  if(tyreLvl >= 3) kit.push('fenders');                   /* widest rubber needs arches */
  if(susp >= 3)    kit.push('skirt');
  if(turbo >= 3)   kit.push('wing');                      /* the aero the boost needs */

  var o = {
    paint:      cs.paint,
    livery:     cs.livery,
    rideHeight: SUSP_RIDE[susp],
    hood:       TURBO_HOODS[turbo],
    tread:      cs.fitted,
    rim:        TYRE_RIMS[tyreLvl],
    lexan:      weight >= 2,
    trim:       trim,
    kit:        kit
  };
  if(extra) for(var k in extra) o[k] = extra[k];
  return o;
}

var sideCache = {}, sideCacheN = 0;
function getCarSide(carId, opts){
  opts = opts || {};
  var key = [carId, opts.paint, opts.livery|0, opts.scale|0, opts.rideHeight|0,
             opts.wheels, opts.tread, opts.rim, opts.hood, opts.lexan?1:0,
             (opts.trim||[]).join(','), (opts.kit||[]).join(','), opts.damage|0].join('|');
  if(!sideCache[key]){
    if(sideCacheN > 80){ sideCache = {}; sideCacheN = 0; }   /* keep it bounded */
    sideCache[key] = renderCarSide(carId, opts);
    sideCacheN++;
  }
  return sideCache[key];
}

/* --------------------------------------------------------- scenery draw */
/* Foliage on the reference is voxel massing, not a flat stack of concentric
   squares: each bush is a handful of cubes at different sizes and offsets,
   each with a lit top face, a shaded front face and a bright catch on the
   sunward corner, over a soft shadow that scales with the canopy. */
var FOLIAGE = {
  forest:   [['#2b5418','#3f7a24','#58a032','#79c94a'],
             ['#244914','#376c1f','#4d8f2b','#6bb840']],
  mountain: [['#27431c','#3a6128','#4e7d34','#6a9c48'],
             ['#213a17','#325423','#446e2e','#5d8a3f']],
  snowpass: [['#1d3a26','#2f5c3e','#6f9c86','#dceaf4'],
             ['#183120','#284f35','#628d78','#cfe2ef']]
};
function drawCube(g, x, y, w, h, pal, lit){
  var side = Math.max(1, h*0.26);
  g.fillStyle = pal[1]; g.fillRect(x, y + h - side, w, side);      /* front face */
  g.fillStyle = pal[0]; g.fillRect(x + w - side*0.7, y, side*0.7, h); /* shaded flank */
  g.fillStyle = pal[2]; g.fillRect(x, y, w - side*0.7, h - side);  /* top face */
  if(lit){
    g.fillStyle = pal[3];
    g.fillRect(x + w*0.13, y + h*0.12, w*0.32, h*0.26);
  }
}

/* A canopy is several cubes sharing one palette, so it is drawn face by face
   across the whole cluster rather than cube by cube: four fillStyle changes
   per bush instead of four per cube. */
function drawCubeCluster(g, cubes, pal){
  var i, c, side, face;
  for(face=0; face<4; face++){
    g.fillStyle = pal[face === 0 ? 1 : face === 1 ? 0 : face === 2 ? 2 : 3];
    g.beginPath();
    for(i=0;i<cubes.length;i++){
      c = cubes[i]; side = Math.max(1, c[3]*0.26);
      if(face === 0)      g.rect(c[0], c[1] + c[3] - side, c[2], side);
      else if(face === 1) g.rect(c[0] + c[2] - side*0.7, c[1], side*0.7, c[3]);
      else if(face === 2) g.rect(c[0], c[1], c[2] - side*0.7, c[3] - side);
      else if(c[4])       g.rect(c[0] + c[2]*0.13, c[1] + c[3]*0.12,
                                 c[2]*0.32, c[3]*0.26);
    }
    g.fill();
  }
}

function drawProp(g, p, theme){
  var s = p.size, v = p.seed;
  g.save();
  g.translate(p.x, p.y);

  if(p.type === 0 || p.type === 4){                 /* canopy / bush */
    var sets = FOLIAGE[theme] || FOLIAGE.forest;
    var pal = sets[v < 0.5 ? 0 : 1];
    /* shadow: softer and shorter than the old hard square, and it grows
       with the canopy instead of being a fixed fraction of it */
    var so = s*0.20;
    g.fillStyle = 'rgba(12,20,8,.30)';
    g.fillRect(-s*0.44 + so, -s*0.38 + so*1.2, s*0.92, s*0.82);
    g.fillStyle = 'rgba(12,20,8,.22)';
    g.fillRect(-s*0.52 + so, -s*0.46 + so*1.2, s*1.08, s*0.98);

    if(p.type === 0){
      g.fillStyle = theme === 'snowpass' ? '#4a3a2c' : '#3b2a1c';
      g.fillRect(-s*0.08, s*0.16, s*0.16, s*0.30);  /* trunk */
    }
    /* three or four cubes, biggest first so the smaller ones read as growth */
    var n = p.type === 0 ? (v < 0.55 ? 4 : 3) : (v < 0.5 ? 3 : 2);
    var k, r1, r2, r3, cw, cx, cy, cubes = [];
    for(k=0;k<n;k++){
      r1 = rnd2(p.node, k, 71); r2 = rnd2(p.node, k, 83); r3 = rnd2(p.node, k, 97);
      cw = s*(k === 0 ? 0.78 : 0.34 + r3*0.30);
      cx = k === 0 ? -cw/2 : (r1 - 0.5)*s*0.86 - cw/2;
      cy = k === 0 ? -cw*0.62 : (r2 - 0.5)*s*0.74 - cw*0.5;
      cubes.push([cx, cy, cw, cw*0.90, k === 0 || r3 > 0.45]);
    }
    drawCubeCluster(g, cubes, pal);
  } else if(p.type === 1){                          /* rock */
    g.fillStyle = 'rgba(12,16,10,.30)';
    g.fillRect(-s*0.42 + s*0.18, -s*0.34 + s*0.22, s*0.90, s*0.76);
    drawCube(g, -s*0.46, -s*0.42, s*0.92, s*0.84,
             ['#4e5158','#5d6169','#7f858d','#9aa1a9'], v > 0.4);
  } else if(p.type === 2){                          /* guardrail post */
    g.fillStyle = 'rgba(0,0,0,.28)';
    g.fillRect(-s*0.5 + s*0.16, -s*0.28 + s*0.18, s, s*0.6);
    drawCube(g, -s*0.5, -s*0.3, s, s*0.6, ['#5f646a','#767c83','#aeb5bc','#d6dce2'], true);
  } else if(p.type === 3){                          /* snow pole */
    g.fillStyle = 'rgba(20,32,44,.20)';
    g.fillRect(-s*0.28 + s*0.16, -s*0.28 + s*0.2, s*0.6, s*0.7);
    g.fillStyle = '#c9d6e2'; g.fillRect(-s*0.3, -s*0.4, s*0.6, s*0.8);
    g.fillStyle = '#f6fbff'; g.fillRect(-s*0.3, -s*0.4, s*0.38, s*0.8);
    g.fillStyle = '#e0483a'; g.fillRect(-s*0.3, -s*0.4, s*0.6, s*0.26);
  } else {                                          /* grass tuft */
    var tg = theme === 'snowpass' ? ['#cfe0ee','#eef6fc']
           : theme === 'mountain' ? ['#4a6030','#6a8442'] : ['#4d7a2a','#76b23e'];
    var b, bx, by, bh;
    for(b=0;b<5;b++){
      bx = (rnd2(p.node, b, 41) - 0.5)*s*0.9;
      by = (rnd2(p.node, b, 53) - 0.5)*s*0.5;
      bh = s*(0.28 + rnd2(p.node, b, 67)*0.34);
      g.fillStyle = b & 1 ? tg[0] : tg[1];
      g.fillRect(bx, by - bh, Math.max(1, s*0.13), bh);
    }
  }
  g.restore();
}
/* =========================================================================
   ENGINE — canvas, input, physics, camera, rendering, race loop
   ========================================================================= */

/* on-track car length in world units — held constant so sprite-grid
   changes stay purely visual and never alter the driving footprint */
var CAR_WORLD_LEN = 72;

var cv = document.getElementById('game');
var ctx = cv.getContext('2d', { alpha:false });
var view = { w:0, h:0, dpr:1 };

function resize(){
  var dpr = Math.min(window.devicePixelRatio || 1, 2);
  var w = window.innerWidth, h = window.innerHeight;
  view.w = w; view.h = h; view.dpr = dpr;
  cv.width = Math.round(w*dpr); cv.height = Math.round(h*dpr);
  ctx.setTransform(dpr,0,0,dpr,0,0);
  ctx.imageSmoothingEnabled = false;
}
window.addEventListener('resize', function(){ resize(); if(race) resetHudControls(); });
window.addEventListener('orientationchange', function(){ setTimeout(resize, 250); });

/* ----------------------------------------------------------------- input */
var input = { left:false, right:false, gas:false, hbrake:false, steer:0, tiltRaw:0, tiltZero:0, tiltOn:false };

function bindPad(el, key){
  var on = function(e){ e.preventDefault(); input[key] = true; el.classList.add('act'); audioKick(); };
  var off = function(e){ if(e) e.preventDefault(); input[key] = false; el.classList.remove('act'); };
  el.addEventListener('touchstart', on, {passive:false});
  el.addEventListener('touchend', off, {passive:false});
  el.addEventListener('touchcancel', off, {passive:false});
  el.addEventListener('mousedown', on);
  el.addEventListener('mouseup', off);
  el.addEventListener('mouseleave', off);
}
bindPad(document.getElementById('p-left'),'left');
bindPad(document.getElementById('p-right'),'right');
bindPad(document.getElementById('p-gas'),'gas');
bindPad(document.getElementById('p-hbrake'),'hbrake');

/* the shift pads are taps, not holds, so they get their own binding */
function bindTap(el, fn){
  var fire = function(e){
    e.preventDefault();
    el.classList.add('act');
    setTimeout(function(){ el.classList.remove('act'); }, 90);
    audioKick(); fn();
  };
  el.addEventListener('touchstart', fire, {passive:false});
  el.addEventListener('mousedown', fire);
}
/* the paddle shifters are the real control; they call straight into the
   Pass 3 gearbox and no-op in automatic, where they render dimmed */
bindTap(document.getElementById('p-shiftup'), function(){ hudCtl.padUp = 1; shiftUp(); });
bindTap(document.getElementById('p-shiftdn'), function(){ hudCtl.padDn = 1; shiftDown(); });

document.addEventListener('keydown', function(e){
  if(e.repeat) return;
  if(e.key==='e'||e.key==='E'||e.key==='x'||e.key==='X'){ shiftUp(); return; }
  if(e.key==='q'||e.key==='Q'||e.key==='z'||e.key==='Z'){ shiftDown(); return; }
  if(e.key==='ArrowLeft'||e.key==='a'||e.key==='A') input.left = true;
  else if(e.key==='ArrowRight'||e.key==='d'||e.key==='D') input.right = true;
  else if(e.key==='ArrowUp'||e.key==='w'||e.key==='W'||e.key===' ') { input.gas = true; e.preventDefault(); }
  else if(e.key==='ArrowDown'||e.key==='s'||e.key==='S'||e.key==='Shift') input.hbrake = true;
  else if(e.key==='Escape'||e.key==='p'||e.key==='P'){ if(race && race.state!=='done') togglePause(); }
});
document.addEventListener('keyup', function(e){
  if(e.key==='ArrowLeft'||e.key==='a'||e.key==='A') input.left = false;
  else if(e.key==='ArrowRight'||e.key==='d'||e.key==='D') input.right = false;
  else if(e.key==='ArrowUp'||e.key==='w'||e.key==='W'||e.key===' ') input.gas = false;
  else if(e.key==='ArrowDown'||e.key==='s'||e.key==='S'||e.key==='Shift') input.hbrake = false;
});

/* tilt steering ------------------------------------------------------- */
function orientationHandler(e){
  if(e.beta == null && e.gamma == null) return;
  var ang = 0;
  try{ ang = (screen.orientation && screen.orientation.angle) || window.orientation || 0; }catch(err){ ang = window.orientation || 0; }
  var v;
  if(ang === 90) v = e.beta;
  else if(ang === -90 || ang === 270) v = -e.beta;
  else v = e.gamma;              /* portrait fallback */
  if(v == null) v = 0;
  input.tiltRaw = v;
}
function enableTilt(cb){
  var DOE = window.DeviceOrientationEvent;
  if(!DOE){ if(cb) cb(false); return; }
  if(typeof DOE.requestPermission === 'function'){
    DOE.requestPermission().then(function(res){
      if(res === 'granted'){ window.addEventListener('deviceorientation', orientationHandler); input.tiltOn = true; if(cb) cb(true); }
      else if(cb) cb(false);
    }).catch(function(){ if(cb) cb(false); });
  } else {
    window.addEventListener('deviceorientation', orientationHandler);
    input.tiltOn = true;
    if(cb) cb(true);
  }
}
function calibrateTilt(){ input.tiltZero = input.tiltRaw; }

/* ------------------------------------------------------------------ audio
   The engine is three layered oscillators rather than one thin tone:

     sub    square  at f/2        the rumble you feel
     body   sawtooth at f         the main note, rich in harmonics so it
                                  survives a phone speaker's bass rolloff
     whine  sawtooth at f*3.02    mechanical/gear whine, rises with load

   sub+body run through a resonant lowpass that opens with revs, which is
   what turns a flat drone into a growl. On top of that sits induction
   noise (bandpass, tracks the fundamental) and the existing tyre noise.

   Gain staging: engineBus -> engineGain (per-frame level) -> shiftGain
   (only ever touched by the shift cut) -> tone filter -> master. Keeping
   the shift cut on its own node stops it fighting the per-frame ramps.
   ---------------------------------------------------------------------- */
var actx = null, masterGain = null;
var oscSub = null, oscBody = null, oscWhine = null;
var whineGain = null, engineGain = null, shiftGain = null, toneFilter = null;
var noiseSrc = null, noiseBuf = null, noiseGain = null, indGain = null, indFilter = null;

function audioKick(){
  if(!save.settings.audio) return;
  if(actx){ if(actx.state==='suspended') actx.resume(); return; }
  try{
    var AC = window.AudioContext || window.webkitAudioContext;
    if(!AC) return;
    actx = new AC();
    masterGain = actx.createGain(); masterGain.gain.value = 0.5;
    masterGain.connect(actx.destination);

    /* --- engine tone chain --- */
    toneFilter = actx.createBiquadFilter();
    toneFilter.type = 'lowpass'; toneFilter.frequency.value = 500; toneFilter.Q.value = 3.2;
    toneFilter.connect(masterGain);

    shiftGain = actx.createGain(); shiftGain.gain.value = 1;
    shiftGain.connect(toneFilter);

    engineGain = actx.createGain(); engineGain.gain.value = 0;
    engineGain.connect(shiftGain);

    oscBody = actx.createOscillator(); oscBody.type = 'sawtooth'; oscBody.frequency.value = 60;
    oscBody.connect(engineGain);

    oscSub = actx.createOscillator(); oscSub.type = 'square'; oscSub.frequency.value = 30;
    var subGain = actx.createGain(); subGain.gain.value = 0.55;
    oscSub.connect(subGain); subGain.connect(engineGain);

    oscWhine = actx.createOscillator(); oscWhine.type = 'sawtooth'; oscWhine.frequency.value = 180;
    whineGain = actx.createGain(); whineGain.gain.value = 0.08;
    oscWhine.connect(whineGain); whineGain.connect(engineGain);

    oscBody.start(); oscSub.start(); oscWhine.start();

    /* --- noise: one buffer, fanned out to induction and tyre chains --- */
    var len = actx.sampleRate*2;
    noiseBuf = actx.createBuffer(1, len, actx.sampleRate);
    var dat = noiseBuf.getChannelData(0);
    for(var i=0;i<len;i++) dat[i] = (Math.random()*2-1)*0.5;
    noiseSrc = actx.createBufferSource(); noiseSrc.buffer = noiseBuf; noiseSrc.loop = true;

    indFilter = actx.createBiquadFilter();
    indFilter.type = 'bandpass'; indFilter.frequency.value = 600; indFilter.Q.value = 1.1;
    indGain = actx.createGain(); indGain.gain.value = 0;
    noiseSrc.connect(indFilter); indFilter.connect(indGain); indGain.connect(masterGain);

    var tyreFilter = actx.createBiquadFilter();
    tyreFilter.type = 'bandpass'; tyreFilter.frequency.value = 900; tyreFilter.Q.value = 0.7;
    noiseGain = actx.createGain(); noiseGain.gain.value = 0;
    noiseSrc.connect(tyreFilter); tyreFilter.connect(noiseGain); noiseGain.connect(masterGain);

    noiseSrc.start();
  }catch(e){ actx = null; }
}

/* rpm is 0..1+ of redline, load is 0..1 throttle */
function audioEngine(rpm, load, slip, running){
  if(!actx || !save.settings.audio){
    if(engineGain) engineGain.gain.value = 0;
    if(noiseGain) noiseGain.gain.value = 0;
    if(indGain) indGain.gain.value = 0;
    return;
  }
  var r = clamp(rpm, 0, 1.25);
  var f = 48 + r*178;                       /* fundamental, ~48..270 Hz */
  var t = actx.currentTime;
  try{
    oscBody.frequency.setTargetAtTime(f, t, 0.035);
    oscSub.frequency.setTargetAtTime(f*0.5, t, 0.035);
    oscWhine.frequency.setTargetAtTime(f*3.02, t, 0.035);
    /* filter opens with revs — flat drone at idle, growl at the top */
    toneFilter.frequency.setTargetAtTime(260 + r*r*2600, t, 0.05);
    whineGain.gain.setTargetAtTime(0.05 + load*0.11 + r*0.05, t, 0.06);
    /* volume rises with both throttle and revs, weighted to revs */
    engineGain.gain.setTargetAtTime(running ? (0.045 + load*0.075 + r*r*0.055) : 0, t, 0.07);
    indFilter.frequency.setTargetAtTime(380 + r*1500, t, 0.05);
    indGain.gain.setTargetAtTime(running ? load*(0.018 + r*0.030) : 0, t, 0.06);
    noiseGain.gain.setTargetAtTime(running ? Math.min(0.16, slip*0.16) : 0, t, 0.06);
  }catch(e){}
}

/* punchy gear change: a hard cut in the engine plus a mechanical clunk */
function audioShift(up){
  if(!actx || !save.settings.audio) return;
  var t = actx.currentTime;
  try{
    shiftGain.gain.cancelScheduledValues(t);
    shiftGain.gain.setValueAtTime(shiftGain.gain.value, t);
    shiftGain.gain.linearRampToValueAtTime(0.14, t + 0.014);
    shiftGain.gain.linearRampToValueAtTime(1.0,  t + (up ? 0.14 : 0.11));

    /* clunk: a short noise burst through a low bandpass */
    var src = actx.createBufferSource();
    src.buffer = noiseBuf;
    var bp = actx.createBiquadFilter();
    bp.type = 'bandpass'; bp.frequency.value = up ? 300 : 240; bp.Q.value = 1.6;
    var cg = actx.createGain();
    cg.gain.setValueAtTime(0.0001, t);
    cg.gain.exponentialRampToValueAtTime(0.34, t + 0.007);
    cg.gain.exponentialRampToValueAtTime(0.0001, t + 0.10);
    src.connect(bp); bp.connect(cg); cg.connect(masterGain);
    src.start(t, Math.random()*1.5, 0.14); src.stop(t + 0.14);

    /* and a low mechanical thunk so it lands with some weight */
    var o = actx.createOscillator(), og = actx.createGain();
    o.type = 'triangle';
    o.frequency.setValueAtTime(up ? 150 : 120, t);
    o.frequency.exponentialRampToValueAtTime(58, t + 0.09);
    og.gain.setValueAtTime(0.20, t);
    og.gain.exponentialRampToValueAtTime(0.0006, t + 0.11);
    o.connect(og); og.connect(masterGain);
    o.start(t); o.stop(t + 0.12);
  }catch(e){}
}
function audioThud(power){
  if(!actx || !save.settings.audio) return;
  try{
    var o = actx.createOscillator(), g = actx.createGain();
    o.type = 'square'; o.frequency.setValueAtTime(150, actx.currentTime);
    o.frequency.exponentialRampToValueAtTime(45, actx.currentTime+0.18);
    g.gain.setValueAtTime(Math.min(0.5, 0.12+power*0.35), actx.currentTime);
    g.gain.exponentialRampToValueAtTime(0.001, actx.currentTime+0.25);
    o.connect(g); g.connect(masterGain); o.start(); o.stop(actx.currentTime+0.26);
  }catch(e){}
}
function audioBeep(freq, dur){
  if(!actx || !save.settings.audio) return;
  try{
    var o = actx.createOscillator(), g = actx.createGain();
    o.type = 'square'; o.frequency.value = freq;
    g.gain.setValueAtTime(0.13, actx.currentTime);
    g.gain.exponentialRampToValueAtTime(0.001, actx.currentTime+dur);
    o.connect(g); g.connect(masterGain); o.start(); o.stop(actx.currentTime+dur+0.02);
  }catch(e){}
}
function audioStopAll(){ audioEngine(0,0,0,false); }

/* =========================================================================
   HUD — INSTRUMENT CLUSTER AND CONTROLS

   The cluster is one canvas sitting in the middle of the dash: pedal bay,
   analog tachometer, gear panel with a shift bar and warning lamps, and an
   analog speedometer with a digital readout. Everything is canvas-drawn —
   no asset files anywhere in the game.

   Cost control: the parts that never change (panel shell, dial faces with
   their ticks, numbers and redline arc, the pedal floor) are painted once
   into an offscreen bitmap at device resolution and blitted as a single
   image each frame. Only the needles, digits, gear, bar, lamps and pedal
   plates are re-drawn live, so a frame is one drawImage plus a few dozen
   primitives. The paddles and the handbrake keep their own small canvases
   and still only repaint when their animation actually moves.
   ========================================================================= */

var hudCtl = { gas:0, brake:0, hb:0, padUp:0, padDn:0,
               drawnHb:-1, drawnUp:-1, drawnDn:-1, drawnMode:null,
               drawnL:null, drawnR:null };

var HUDC = {
  steel:'#9aa2a8', steelHi:'#c6ccd1', steelLo:'#5c6167',
  dark:'#20262a', black:'#12161a', rubber:'#2b3036', rubberHi:'#3c434a',
  amber:'#ffb432', amberLo:'#a8721a', green:'#7ef08a', red:'#ff5a4a',
  dim:'#575e63', dimLo:'#3a4045',
  /* instrument faces — near-black glass under a chrome bezel, with bright
     white/periwinkle numbering for contrast at a glance */
  bezelHi:'#eef3f8', bezel:'#7d8894', bezelLo:'#333b44',
  tick:'#ffffff', tickDim:'rgba(196,212,234,.62)', tickRed:'#c2392c',
  numSpd:'#f4f8ff', numTach:'#bcccff',
  needle:'#ff3b2f', needleHot:'#ff6f52', needleSpd:'#ff3b2f',
  lcd:'#05070a', lcdOn:'#f2f7ff', lampOff:'#39423a'
};

function roundPath(g,x,y,w,h,r){
  r = Math.min(r, w/2, h/2);
  g.beginPath();
  g.moveTo(x+r,y);
  g.lineTo(x+w-r,y); g.quadraticCurveTo(x+w,y,x+w,y+r);
  g.lineTo(x+w,y+h-r); g.quadraticCurveTo(x+w,y+h,x+w-r,y+h);
  g.lineTo(x+r,y+h); g.quadraticCurveTo(x,y+h,x,y+h-r);
  g.lineTo(x,y+r); g.quadraticCurveTo(x,y,x+r,y);
  g.closePath();
}
function hudFont(g, size, weight){
  g.font = (weight||'bold') + ' ' + size.toFixed(1) +
           'px ui-monospace,"SF Mono",Menlo,Consolas,monospace';
}
/* Instrument lettering is a grotesque, not the monospace the rest of the UI
   uses. Monospaced digits sit on a fixed advance, which on a dial rim reads
   as loose and mechanical — every reference instrument sets its numerals in
   a tight bold sans, so the dials get their own stack. */
function dialFont(g, size, weight){
  g.font = (weight||'bold') + ' ' + size.toFixed(1) +
           'px system-ui,-apple-system,"Helvetica Neue",Helvetica,Arial,sans-serif';
}

/* =========================================================================
   GAUGE CLUSTER
   ========================================================================= */

/* Dial sweep: 135deg (bottom-left) clockwise through 270deg to 45deg
   (bottom-right), the layout every road-car instrument uses. */
var DIAL_A0 = Math.PI*0.75, DIAL_SWEEP = Math.PI*1.5;
function dialAngle(v, min, max){ return DIAL_A0 + DIAL_SWEEP*clamp((v-min)/(max-min),0,1); }

/* The tacho reads in thousands of rpm. race.rpm is a fraction of redline,
   so redline sits exactly where the red band starts and the dial runs on to
   8 — the same 1.0 threshold the gearbox and the shift bar use.

   Scaled to 6.5 of 8 rather than the old 7 of 9. On the old numbers the top
   fifth of the sweep was unreachable: nothing could ever drive the needle
   past 7 of a 9 dial short of an overrev, so a whole quadrant of the face
   was dead. At 6.5 of 8 the needle uses the dial the way the reference
   does, and the overrev still has somewhere to go. */
var TACH_MAX = 8, TACH_RED = 6.5, TACH_SCALE = 6.5;

var cluster = {
  cv:null, g:null, base:null, L:null, key:'',
  S:1, W:0, H:0, kmhMax:240,
  nRpm:0, nKmh:0, nBoost:0, heat:0
};

/* Sizing.

   The dash is one full-width moulding running to the bottom edge of the
   screen, not a binnacle floating over it, so the layout is a grid across
   the whole viewport rather than a strip of columns.

   How tall it gets is a trade. This is a chase cam: the car is drawn below
   the camera's focal point by however far the camera is looking ahead, so
   every pixel the dash grows is a pixel of road the player loses. The 3:2
   reference gives the chassis 42% of the picture, which a wide phone cannot
   spare — but nor does it need to, because on a wide screen the same
   instruments spread sideways instead of stacking. So the share falls off
   with the aspect ratio and the art direction survives at either end. */
var CLUSTER_BOTTOM = 0;                       /* the chassis reaches the edge */

/* Safe-area insets. A notched phone in landscape hands back a good 40px on
   one side and a home-indicator strip along the bottom; the chassis fills
   into both, but nothing readable is allowed to sit in them. Read off a
   probe rather than assumed, and only ever called when the viewport changes. */
var safeProbe = null;
function safeInsets(){
  if(!safeProbe){
    safeProbe = document.createElement('div');
    safeProbe.style.cssText = 'position:fixed;top:0;left:0;width:0;height:0;' +
      'visibility:hidden;pointer-events:none;' +
      'padding-left:env(safe-area-inset-left);padding-right:env(safe-area-inset-right);' +
      'padding-bottom:env(safe-area-inset-bottom);';
    document.body.appendChild(safeProbe);
  }
  var cs = getComputedStyle(safeProbe);
  var l = parseFloat(cs.paddingLeft) || 0, r = parseFloat(cs.paddingRight) || 0;
  return { l:l, r:r, x:l+r, b:parseFloat(cs.paddingBottom) || 0 };
}

function clusterLayout(){
  var vw = Math.round(view.w || window.innerWidth || 800);
  var vh = Math.round(view.h || window.innerHeight || 400);
  var si = safeInsets();
  var frac = clamp(0.62/(vw/Math.max(1,vh)), 0.25, 0.42);
  var dashH = Math.round(vh*frac);
  var L = { W:vw, H:dashH + si.b, dashH:dashH, si:si };

  var pad  = Math.max(3, Math.round(dashH*0.045));
  L.pad = pad;
  L.railH = Math.max(5, Math.round(dashH*0.105));    /* sculpted top rail */
  L.botH  = Math.max(15, Math.round(dashH*0.255));   /* indicator / status band */
  L.faceY = L.railH;
  L.botY  = dashH - L.botH;
  var midH = L.botY - L.faceY - pad;

  /* The dial diameter drives every other measurement. It wants the full
     depth of the instrument band, but on a narrow screen the row of groups
     binds first: pedals + gear + tacho + stack + boost + speedo across the
     middle is 3.87D, the left wing 0.93D and the right wing 1.45D. That is
     6.25D before the gaps between the three groups, so 6.55D with them. */
  var usable = vw - si.x - 2*pad;
  var D = Math.max(30, Math.min(Math.floor(midH*0.98), Math.floor(usable/6.55)));
  L.D = D; L.R = D/2;
  L.dialY = L.faceY + pad + midH/2;
  var gap = Math.max(2, Math.round(D*0.10));
  L.gap = gap;

  /* ---- centre island, left to right ---- */
  L.pedW   = Math.max(7,  Math.round(D*0.16));       /* narrowed pedal telltale */
  L.gearW  = Math.max(10, Math.round(D*0.21));       /* P R N 1 2 strip */
  L.stackW = Math.max(16, Math.round(D*0.50));       /* SHIFT + digital readout */
  L.boostD = Math.max(14, Math.round(D*0.50));
  var islandW = L.pedW + L.gearW + 2*D + L.stackW + L.boostD + 5*gap;
  var x = Math.round(si.l + (vw - si.x - islandW)/2);
  L.islandX = x; L.islandW = islandW;
  L.pedX  = x;                       x += L.pedW  + gap;
  L.gearX = x;                       x += L.gearW + gap;
  L.tachX = x + D/2;                 x += D       + gap;
  L.stackX = x;                      x += L.stackW + gap;
  L.spdX  = x + D/2;                 x += D       + gap;
  L.boostX = x + L.boostD/2;

  /* pedal telltale and gear strip share the dial's vertical extent */
  L.colY = Math.round(L.dialY - D/2);
  L.colH = D;

  /* centre stack: the shift module over the digital readout, as on the
     reference, with the boost dial sitting low and outboard of the speedo */
  L.shiftY = L.colY;
  L.shiftH = Math.round(L.colH*0.58);
  L.readY  = L.colY + Math.round(L.colH*0.66);
  L.readH  = L.colH - Math.round(L.colH*0.66);
  L.boostR = L.boostD/2;
  L.boostY = L.dialY + Math.round(D*0.16);

  /* gear gate: the game's own ratios, N through top, one cell each */
  L.gearCells = TOP_GEAR + 1;
  L.gearFrameY = L.colY + Math.max(4, Math.round(D*0.10));   /* caption above */
  L.gearFrameH = L.colH - (L.gearFrameY - L.colY);
  L.ps = Math.max(1, Math.floor(L.pedW/9));          /* pedal-art pixel size */
  L.pgw = Math.floor(L.pedW/L.ps); L.pgh = Math.floor(L.colH/L.ps);

  /* ---- left wing: LED pip row over the two steering pads ---- */
  L.pipH = Math.max(5, Math.round(D*0.13));
  L.pipY = L.faceY + Math.max(2, Math.round(pad*0.6));
  L.padW = Math.max(20, Math.round(D*0.43));
  L.padH2 = Math.max(22, dashH - (L.pipY + L.pipH + pad) - pad);
  L.padY = L.pipY + L.pipH + pad;
  L.padLX = si.l + pad;
  L.padRX = L.padLX + L.padW + Math.max(3, Math.round(gap*0.7));
  L.pipX = L.padLX + Math.max(2, Math.round(D*0.06));
  L.pipW = Math.max(20, Math.round(L.padW*1.30));

  /* ---- right wing: lever gate and throttle over the status boxes ---- */
  var rx = vw - si.r - pad;
  L.statY = L.botY - Math.round(D*0.12);
  L.statH = Math.max(13, dashH - pad - L.statY);
  L.statW = Math.min(Math.round(D*1.62), Math.round((vw - si.x)*0.34));
  L.statX = rx - L.statW;
  var upperH = Math.max(18, L.statY - L.faceY - L.railH - pad - Math.max(2, Math.round(pad*0.6)));
  L.gasW  = Math.max(30, Math.round(D*0.62));
  L.gateW = Math.max(26, Math.round(D*0.66));
  L.upperY = L.faceY + L.railH + Math.max(2, Math.round(pad*0.6));
  L.upperH = upperH;
  L.gasX  = rx - L.gasW;
  L.gateX = L.gasX - Math.max(3, Math.round(gap*0.7)) - L.gateW;

  /* ---- indicator strip: centred under the island, so it reads as part of
     the binnacle rather than as a trough running the width of the car ---- */
  var lo = L.padRX + L.padW + gap, hi = L.gateX - gap;
  L.indW = clamp(Math.round(D*2.3), 40, Math.max(40, hi - lo));
  L.indX = clamp(Math.round(L.islandX + islandW/2 - L.indW/2), lo, hi - L.indW);
  L.indY = L.botY;
  L.indH = Math.max(10, dashH - pad - L.botY);

  /* ---- paddles: mounted on the top rail, flanking the dials.
     Never further inboard than a thumb's reach from the edge, so a wide
     screen keeps them where they can actually be hit while steering. */
  L.padlW = Math.max(18, Math.round(D*0.40));
  L.padlH = Math.max(28, Math.round(D*0.78));
  L.padlY = L.faceY + Math.round(L.railH*1.1) - L.padlH;
  var reach = Math.round((vw - si.x)*0.30);
  L.padlLX = Math.min(Math.round(L.islandX - L.padlW*0.35), si.l + reach);
  L.padlRX = Math.max(Math.round(L.islandX + islandW - L.padlW*0.65),
                      vw - si.r - reach - L.padlW);
  return L;
}

/* How much of the screen bottom the dash band occupies, so the chase camera
   can keep the car clear of it. Mirrors the CSS that positions the panel. */
function clusterBandH(){
  return (cluster.H || clusterLayout().H) + CLUSTER_BOTTOM;
}

/* =========================================================================
   DASH CHASSIS

   The moulding every instrument is set into. One material rule runs through
   the whole thing: a faceted plate with 45deg corners, a lit top edge, a
   charcoal face graded downwards and a shaded foot. Wells invert it — dark
   along the top, lit along the bottom — so a recess reads as cut into the
   moulding rather than sat on top of it.

   All of it is painted once into the cached base bitmap, including the cast
   grain, so the per-frame cost of the chassis is zero.
   ========================================================================= */
var DASH = {
  railHi:'#949ba1', railTop:'#575d63', railMid:'#41474d', railLo:'#2a2f34',
  faceTop:'#2c3034', faceMid:'#22262a', faceBot:'#14171a',
  wellTop:'#04060a', wellBot:'#191d22',
  seam:'#080a0c', seamHi:'#4e555c',
  edgeHi:'#7b838a', edgeLo:'#0c0f12',
  screw:'#767e85', screwLo:'#141719',
  vent:'#090b0d', ventHi:'#3a4046'
};

/* faceted panel outline: a rect with its corners cut at 45deg */
function facetPath(g, x, y, w, h, c){
  c = Math.min(c, w/2, h/2);
  g.beginPath();
  g.moveTo(x+c, y);     g.lineTo(x+w-c, y);   g.lineTo(x+w, y+c);
  g.lineTo(x+w, y+h-c); g.lineTo(x+w-c, y+h); g.lineTo(x+c, y+h);
  g.lineTo(x, y+h-c);   g.lineTo(x, y+c);     g.closePath();
}

/* A plate sitting proud of the moulding. */
function dashPlate(g, x, y, w, h, c, top, bot){
  var lg = g.createLinearGradient(0, y, 0, y+h);
  lg.addColorStop(0, top || DASH.faceTop);
  lg.addColorStop(1, bot || DASH.faceBot);
  facetPath(g, x, y, w, h, c); g.fillStyle = lg; g.fill();
  g.save(); facetPath(g, x, y, w, h, c); g.clip();
  g.fillStyle = DASH.edgeHi; g.fillRect(x, y, w, 1);          /* lit top edge */
  g.fillStyle = DASH.edgeLo; g.fillRect(x, y+h-1, w, 1);      /* shaded foot */
  g.restore();
}

/* A well cut into the moulding: the lighting flips, so the top lip is in
   shadow and the bottom lip catches. */
function dashWell(g, x, y, w, h, c, depth){
  var lg = g.createLinearGradient(0, y, 0, y+h);
  lg.addColorStop(0, DASH.wellTop);
  lg.addColorStop(1, DASH.wellBot);
  facetPath(g, x, y, w, h, c); g.fillStyle = lg; g.fill();
  g.save(); facetPath(g, x, y, w, h, c); g.clip();
  var d = depth || 1;
  g.fillStyle = 'rgba(0,0,0,.85)';        g.fillRect(x, y, w, d+0.5);
  g.fillStyle = 'rgba(0,0,0,.60)';        g.fillRect(x, y, d, h);
  g.fillStyle = 'rgba(176,190,204,.42)';  g.fillRect(x, y+h-d, w, d);
  g.fillStyle = 'rgba(140,154,168,.20)';  g.fillRect(x+w-d, y, d, h);
  g.restore();
  facetPath(g, x, y, w, h, c);
  g.lineWidth = 1; g.strokeStyle = 'rgba(8,10,12,.85)'; g.stroke();
}

/* A bright machined surround, the way the steering pads and the lever gate
   are framed on the reference. Drawn as a plate with a well inside it. */
function dashBezel(g, x, y, w, h, c, rim){
  rim = rim || Math.max(2.5, Math.min(w,h)*0.09);
  var lg = g.createLinearGradient(0, y, 0, y+h);
  lg.addColorStop(0.00, '#b9c0c6');
  lg.addColorStop(0.18, '#868e95');
  lg.addColorStop(0.55, '#4d545b');
  lg.addColorStop(1.00, '#2a2f34');
  facetPath(g, x, y, w, h, c); g.fillStyle = lg; g.fill();
  g.save(); facetPath(g, x, y, w, h, c); g.clip();
  g.fillStyle = 'rgba(255,255,255,.55)'; g.fillRect(x, y, w, 1);
  g.restore();
  dashWell(g, x+rim, y+rim, w-2*rim, h-2*rim, Math.max(1, c-rim*0.7), 1);
}

/* Panel seam: a scored groove with a lit lower lip, the join between two
   mouldings. Horizontal only — every seam on the reference runs across. */
function dashSeam(g, x, y, w){
  g.fillStyle = DASH.seam;   g.fillRect(x, y, w, 1);
  g.fillStyle = DASH.seamHi; g.fillRect(x, y+1, w, 1);
}

/* Moulded louvre vent. A shallow recess with a stack of slots cut into it,
   each slot dark at the top and catching light on the blade below it. This
   is what fills the plain panel between a wing and the centre island on a
   wide screen, so it has to read as deliberate moulding, not as a gap. */
function dashVent(g, x, y, w, h){
  var pitch = 3, i, sy;
  var n = Math.max(2, Math.floor((h - 2)/pitch));
  var vh = n*pitch + 2;
  y = Math.round(y + (h - vh)/2);
  dashWell(g, x, y, w, vh, 2, 1);
  for(i=0;i<n;i++){
    sy = y + 1 + i*pitch;
    g.fillStyle = DASH.vent;   g.fillRect(x+2, sy, w-4, pitch-1);
    g.fillStyle = DASH.ventHi; g.fillRect(x+2, sy+pitch-1, w-4, 1);
  }
  dashScrew(g, x + 2.5, y - 2.5, 1.4);
  dashScrew(g, x + w - 2.5, y - 2.5, 1.4);
}

/* Fastener head, countersunk. */
function dashScrew(g, cx, cy, r){
  g.beginPath(); g.arc(cx, cy, r, 0, TAU);
  g.fillStyle = DASH.screwLo; g.fill();
  g.beginPath(); g.arc(cx-r*0.16, cy-r*0.16, r*0.72, 0, TAU);
  g.fillStyle = DASH.screw; g.fill();
  g.fillStyle = 'rgba(0,0,0,.6)';
  g.fillRect(cx-r*0.66, cy-r*0.16, r*1.32, Math.max(0.7, r*0.30));
}

/* Cast grain. Fine speckle over the moulding so the big flat panels read as
   a textured plastic rather than a gradient. Deterministic, and painted once
   into the cached bitmap, so it costs nothing per frame. */
function dashGrain(g, x, y, w, h, n, seed){
  /* mulberry, not rnd2: rnd2 hashes a 2D coordinate and is only well mixed
     across a plane. Walking it with a running counter puts the samples on a
     lattice, which shows up as a web of thin diagonals across every panel
     instead of speckle. */
  var rand = mulberry(seed*2654435761 + 17), i, gx, gy;
  for(i=0;i<n;i++){
    gx = x + rand()*w;
    gy = y + rand()*h;
    g.fillStyle = rand() < 0.55 ? 'rgba(255,255,255,.030)' : 'rgba(0,0,0,.085)';
    g.fillRect(gx|0, gy|0, 1, 1);
  }
}

/* The outline of the moulding itself: a stepped rail that crowns over the
   dials and shoulders down to the wings, chamfered at every change of
   level the way the reference is faceted. Returns nothing; leaves a path. */
function dashShellPath(g, L, dy){
  var W = L.W, H = L.H;
  dy = dy || 0;
  var crown = dy, shoulder = Math.round(L.railH*0.55) + dy, wing = L.railH + dy;
  var cx0 = L.islandX - L.gap*2, cx1 = L.islandX + L.islandW + L.gap*2;
  var sx0 = Math.max(0, cx0 - L.railH*1.6), sx1 = Math.min(W, cx1 + L.railH*1.6);
  var ch = L.railH*0.9;                          /* chamfer run */
  g.beginPath();
  g.moveTo(0, H);
  g.lineTo(0, wing);
  g.lineTo(sx0 - ch, wing);
  g.lineTo(sx0, shoulder);                       /* step up to the shoulder */
  g.lineTo(cx0 - ch, shoulder);
  g.lineTo(cx0, crown);                          /* step up to the crown */
  g.lineTo(cx1, crown);
  g.lineTo(cx1 + ch, shoulder);
  g.lineTo(sx1, shoulder);
  g.lineTo(sx1 + ch, wing);
  g.lineTo(W, wing);
  g.lineTo(W, H);
  g.closePath();
}

/* --------------------------------------------------------- static face
   Both dials are this one function. The reference draws them as a matched
   pair — same double-ring chrome bezel, same tick geometry, same numeral
   weight and radius — and only the scale, the caption and the redline
   differ, so everything below is expressed as a fraction of the face
   radius and driven off the options object.

   Note on the reference: its dial numerals are garbled (the tacho reads
   0 1 2 4 5 5 ? 7 8, with two fives and a question mark where 3 and 6
   belong). Those are artefacts of the mockup, not a design; the geometry,
   weight and placement are matched, the sequence is drawn correctly. */
function drawDialFace(g, cx, cy, R, o){
  var i, v, a, maj, r0, r1, red;

  /* --- mounting shoulder: the dark ring the bezel is pressed into --- */
  g.beginPath(); g.arc(cx,cy,R,0,TAU); g.fillStyle = '#15181b'; g.fill();

  /* --- bezel. On the mains it is polished steel, which reads as a sweep of
     light around the circumference rather than a flat tint: bright where the
     sky catches it at the top left, falling away through the middle, then
     picking up a second, weaker lobe at the bottom right as the surface
     turns back up. The auxiliary dial is a dark moulded ring instead, the
     way the reference distinguishes it from the pair. --- */
  var bezR = R*0.972, faceR = R*0.830;
  var bez = g.createLinearGradient(cx - R*0.78, cy - R*0.86, cx + R*0.70, cy + R*0.84);
  if(o.small){
    bez.addColorStop(0.00, '#6f767d');
    bez.addColorStop(0.16, '#484f56');
    bez.addColorStop(0.45, '#23282d');
    bez.addColorStop(0.72, '#3b424a');
    bez.addColorStop(1.00, '#14181c');
  } else {
    bez.addColorStop(0.00, '#ffffff');
    bez.addColorStop(0.11, '#e8eef4');
    bez.addColorStop(0.27, '#aeb8c2');
    bez.addColorStop(0.44, '#69737e');
    bez.addColorStop(0.58, '#3d454e');
    bez.addColorStop(0.74, '#9aa5b0');
    bez.addColorStop(0.88, '#5d6772');
    bez.addColorStop(1.00, '#2b3138');
  }
  g.beginPath(); g.arc(cx,cy,bezR,0,TAU); g.fillStyle = bez; g.fill();

  /* hard catch just inside the outer edge, and the dark inner shoulder the
     face sits down inside */
  g.beginPath(); g.arc(cx,cy,bezR - Math.max(0.5, R*0.014), Math.PI*1.03, Math.PI*1.80);
  g.lineWidth = Math.max(0.6, R*0.020);
  g.strokeStyle = o.small ? 'rgba(214,224,234,.42)' : 'rgba(255,255,255,.80)';
  g.stroke();
  g.beginPath(); g.arc(cx,cy,R*0.868,0,TAU);
  g.lineWidth = Math.max(0.8, R*0.045); g.strokeStyle = '#0a0d10'; g.stroke();

  /* --- face: near black, lifted very slightly toward the top left --- */
  var face = g.createRadialGradient(cx - R*0.28, cy - R*0.34, R*0.04, cx, cy, R*0.98);
  face.addColorStop(0.00, '#191d22');
  face.addColorStop(0.46, '#0d1013');
  face.addColorStop(1.00, '#050709');
  g.beginPath(); g.arc(cx,cy,faceR,0,TAU); g.fillStyle = face; g.fill();

  var fr = faceR;
  var a0 = dialAngle(o.min,o.min,o.max), a1 = dialAngle(o.max,o.min,o.max);

  /* hairline between the numerals and the tick band. The auxiliary dial has
     none — at that size it would read as clutter. */
  if(!o.small){
    g.beginPath(); g.arc(cx,cy,fr*0.855, a0, a1);
    g.lineWidth = Math.max(0.5, fr*0.012); g.strokeStyle = 'rgba(190,202,216,.30)'; g.stroke();
  }

  /* --- ticks. Minor every o.minor, major every o.major, and the major is
     both longer and heavier so the scale reads at a glance. --- */
  var steps = Math.round((o.max-o.min)/o.minor);
  var perMaj = Math.round(o.major/o.minor);
  var majR0 = fr*0.870, minR0 = fr*0.905, tickR1 = fr*0.975;

  /* how many numerals the rim can actually carry without them touching */
  var every = o.labelEvery || 1;
  var numSize = Math.max(4.2, fr*(o.small ? 0.225 : 0.185));
  dialFont(g, numSize);
  var widest = g.measureText(String(Math.round(o.max))).width;
  var numR = Math.min(fr*(o.small ? 0.660 : 0.755), majR0 - fr*0.030 - widest/2);
  var arcPer = Math.abs(a1-a0)/((o.max-o.min)/o.major) * numR;
  while(arcPer*every < widest*1.12) every++;

  for(i=0;i<=steps;i++){
    v = o.min + i*o.minor;
    maj = (i % perMaj) === 0;
    red = o.redFrom != null && v >= o.redFrom - 1e-6;
    a = dialAngle(v,o.min,o.max);
    r0 = maj ? majR0 : minR0;
    r1 = tickR1;
    if(red){
      /* The redline is a run of heavy blocks set outside the tick band and
         running up to the bezel, not a painted arc under it. */
      g.beginPath();
      g.moveTo(cx+Math.cos(a)*fr*0.955, cy+Math.sin(a)*fr*0.955);
      g.lineTo(cx+Math.cos(a)*fr*1.082, cy+Math.sin(a)*fr*1.082);
      g.lineWidth = Math.max(1.8, fr*0.078);
      g.lineCap = 'butt'; g.strokeStyle = '#e2180d'; g.stroke();
      /* the majors still get their white tick under the red */
      if(!maj) continue;
    }
    g.beginPath();
    g.moveTo(cx+Math.cos(a)*r0, cy+Math.sin(a)*r0);
    g.lineTo(cx+Math.cos(a)*r1, cy+Math.sin(a)*r1);
    g.lineWidth = maj ? Math.max(1.2, fr*0.042) : Math.max(0.5, fr*0.017);
    g.strokeStyle = maj ? '#ffffff' : 'rgba(226,234,244,.72)';
    g.stroke();

    if(maj && ((i/perMaj) % every) === 0){
      dialFont(g, numSize);
      g.fillStyle = '#ffffff';
      g.textAlign = 'center'; g.textBaseline = 'middle';
      g.fillText(String(Math.round(v)), cx+Math.cos(a)*numR, cy+Math.sin(a)*numR);
    }
  }

  /* --- captions --- */
  g.textAlign = 'center'; g.textBaseline = 'middle';
  if(o.label){
    dialFont(g, Math.max(4, fr*(o.small ? 0.235 : 0.185)));
    g.fillStyle = '#ffffff';
    g.fillText(o.label, cx, cy - fr*(o.small ? 0.330 : 0.300));
  }
  if(o.sub && !(o.small && fr < 16)){
    dialFont(g, Math.max(3.5, fr*(o.small ? 0.180 : 0.140)));
    g.fillStyle = o.small ? '#ffffff' : '#8b9096';
    g.fillText(o.sub, cx, cy + (o.small ? fr*0.585 : fr*0.272));
  }

  /* --- glass: a soft sheen off the top left of the cover --- */
  g.save();
  g.beginPath(); g.arc(cx, cy, fr, 0, TAU); g.clip();
  var gl = g.createRadialGradient(cx - fr*0.38, cy - fr*0.48, fr*0.04,
                                  cx - fr*0.20, cy - fr*0.26, fr*1.10);
  gl.addColorStop(0.00, 'rgba(255,255,255,.115)');
  gl.addColorStop(0.42, 'rgba(255,255,255,.038)');
  gl.addColorStop(1.00, 'rgba(255,255,255,0)');
  g.fillStyle = gl; g.fillRect(cx - fr, cy - fr, fr*2, fr*2);
  g.restore();
}

/* Everything that never moves, painted once at device resolution.

   This is the whole chassis: the stepped rail, the cast grain, every seam,
   vent and fastener, the wells the instruments drop into, and the static
   part of the instruments themselves. A frame is one blit of this bitmap
   plus the handful of live primitives in drawCluster. */
function buildClusterBase(L, S){
  var c = document.createElement('canvas');
  c.width = L.W*S; c.height = L.H*S;
  var g = c.getContext('2d');
  g.setTransform(S,0,0,S,0,0);
  var i, x;

  /* ---- the moulding ----
     The rail is a separate plate sitting on the face, not a gradient at the
     top of one. It gets its depth from a second copy of the shell profile
     dropped by the rail thickness: fill the whole shell with the rail's
     colour, then lay the face over the dropped copy, and what survives is a
     band of rail that follows every step and chamfer of the crown. */
  g.save();
  dashShellPath(g, L); g.clip();

  var rail = g.createLinearGradient(0, 0, 0, L.railH*1.6);
  rail.addColorStop(0.00, DASH.railTop);
  rail.addColorStop(0.62, DASH.railMid);
  rail.addColorStop(1.00, DASH.railLo);
  g.fillStyle = rail; g.fillRect(0, 0, L.W, L.H);

  var face = g.createLinearGradient(0, L.faceY, 0, L.H);
  face.addColorStop(0.00, DASH.faceTop);
  face.addColorStop(0.58, DASH.faceMid);
  face.addColorStop(1.00, DASH.faceBot);
  dashShellPath(g, L, L.railH);
  g.fillStyle = face; g.fill();

  dashGrain(g, 0, 0, L.W, L.H, Math.round(L.W*L.H*0.022), 3);

  /* the seam above the bottom band, and a second one across the plain
     panels so a wide dash does not read as one undivided slab */
  dashSeam(g, 0, L.botY - Math.max(2, Math.round(L.pad*0.6)), L.W);

  /* moulded louvres in the plain panel between each wing and the island */
  var ventY = L.faceY + L.railH + Math.max(3, Math.round(L.pad*1.2));
  var ventH = Math.max(6, Math.round(L.botY - ventY - L.pad));
  var gapL0 = L.padLX + 2*L.padW + L.gap*2, gapL1 = L.padlLX - L.gap;
  var gapR0 = L.padlRX + L.padlW + L.gap,   gapR1 = L.gateX - L.gap;
  var ventFit = function(a, b){
    var wv = clamp(Math.round((b-a)*0.70), Math.round(L.D*0.45), Math.round(L.D*1.8));
    if(b - a < wv*1.15) return;
    dashVent(g, Math.round((a+b)/2 - wv/2), ventY, wv, ventH);
  };
  ventFit(gapL0, gapL1);
  ventFit(gapR0, gapR1);

  g.restore();

  /* the rail's own foot: a scored groove with a lit lip, following the
     profile, so the rail reads as a plate laid over the face */
  g.save();
  dashShellPath(g, L); g.clip();
  dashShellPath(g, L, L.railH);
  g.lineWidth = 2; g.strokeStyle = 'rgba(6,8,10,.85)'; g.stroke();
  dashShellPath(g, L, L.railH + 1.5);
  g.lineWidth = 1; g.strokeStyle = 'rgba(126,138,150,.45)'; g.stroke();
  var sd = Math.max(3, Math.round(L.railH*0.55));
  for(i=0;i<sd;i++){
    dashShellPath(g, L, L.railH + 2.5 + i);
    g.lineWidth = 1.4;
    g.strokeStyle = 'rgba(0,0,0,' + (0.26*(1 - i/sd)).toFixed(3) + ')';
    g.stroke();
  }
  g.restore();

  /* the lit crown along the whole stepped top edge, drawn outside the clip
     so it is not shaved in half by it */
  g.save();
  dashShellPath(g, L);
  g.lineWidth = 2.5; g.strokeStyle = DASH.railHi; g.stroke();
  g.lineWidth = 1;   g.strokeStyle = 'rgba(230,238,244,.65)'; g.stroke();
  g.restore();

  /* fasteners along the rail, one pair per wing plus the island shoulders */
  var sr = Math.max(1, Math.round(L.railH*0.17));
  var sy = Math.round(L.railH*1.5);              /* mid-band of the wing rail */
  var scrX = [L.padLX + L.pipW + sr*3, L.W - L.si.r - L.pad - sr*2,
              L.islandX - L.gap*3, L.islandX + L.islandW + L.gap*3];
  for(i=0;i<scrX.length;i++){
    if(scrX[i] > sr*2 && scrX[i] < L.W - sr*2) dashScrew(g, scrX[i], sy, sr);
  }

  /* ---- wells the instruments and controls drop into ---- */
  var fc = Math.max(2, Math.round(L.D*0.09));
  dashWell(g, L.pedX - 1, L.colY - 1, L.pedW + 2, L.colH + 2, Math.max(1, fc*0.5));
  dashWell(g, L.indX, L.indY, L.indW, L.indH, fc);
  dashBezel(g, L.gateX, L.upperY, L.gateW, L.upperH, fc);
  dashBezel(g, L.gasX,  L.upperY, L.gasW,  L.upperH, fc);
  dashBezel(g, L.padLX, L.padY, L.padW, L.padH2, fc);
  dashBezel(g, L.padRX, L.padY, L.padW, L.padH2, fc);
  dashWell(g, L.pipX, L.pipY, L.pipW, L.pipH, Math.max(1, L.pipH*0.28));

  drawPedalBayBase(g, L);

  /* Both dials label every major and let drawDialFace thin them only if the
     rim genuinely cannot carry them, rather than giving up at a fixed size.
     Five minors to a major on each, as on the reference. */
  drawDialFace(g, L.tachX, L.dialY, L.R, {
    min:0, max:TACH_MAX, major:1, minor:0.2, redFrom:TACH_RED,
    label:'RPM', sub:'x1000'
  });
  drawDialFace(g, L.spdX, L.dialY, L.R, {
    min:0, max:cluster.kmhMax, major:20, minor:4,
    label:'KMH'
  });

  drawDialFace(g, L.boostX, L.boostY, L.boostR, {
    min:0, max:20, major:10, minor:2.5,
    label:'BOOST', sub:'PSI', small:true
  });

  drawGearStripBase(g, L);
  drawShiftModuleBase(g, L);
  drawReadoutBase(g, L);
  drawIndicatorBase(g, L);
  drawStatusBase(g, L);

  return c;
}

/* ------------------------------------------------------ gear gate
   The reference stacks P R N 1 2 in a framed gate with the engaged
   position lit amber and a detent knob riding alongside. This box has no
   park and no reverse, so the gate carries the ratios the car actually
   has: neutral and the six forward gears. A faceplate that cannot show
   fifth would be a prettier instrument and a lying one. */
function gearCellRect(L, i){
  var inset = Math.max(1, Math.round(L.gearW*0.10));
  var h = (L.gearFrameH - inset*2) / L.gearCells;
  return { x: L.gearX + inset, y: L.gearFrameY + inset + i*h,
           w: L.gearW - inset*2, h: h };
}
function drawGearStripBase(g, L){
  var i, r, fc = Math.max(1.5, L.gearW*0.20);
  dialFont(g, Math.max(4, L.gearW*0.40));
  g.fillStyle = '#e6ebf1'; g.textAlign = 'center'; g.textBaseline = 'bottom';
  g.fillText('GEAR', L.gearX + L.gearW/2, L.gearFrameY - Math.max(1, L.gearW*0.10));

  dashWell(g, L.gearX, L.gearFrameY, L.gearW, L.gearFrameH, fc, 1);
  for(i=0;i<L.gearCells;i++){
    r = gearCellRect(L, i);
    var lg = g.createLinearGradient(0, r.y, 0, r.y + r.h);
    lg.addColorStop(0, '#262b31'); lg.addColorStop(1, '#191d22');
    roundPath(g, r.x, r.y + 0.5, r.w, r.h - 1, Math.max(0.8, r.h*0.14));
    g.fillStyle = lg; g.fill();
    g.fillStyle = 'rgba(150,164,180,.28)';
    g.fillRect(r.x + r.w*0.10, r.y + 0.5, r.w*0.80, 0.7);
  }
}

/* ------------------------------------------------- shift light module */
function shiftParts(L){
  var pad = Math.max(1, Math.round(L.stackW*0.06));
  var hdrH = Math.max(4, Math.round(L.shiftH*0.26));
  var triH = Math.max(4, Math.round(L.shiftH*0.36));
  return {
    pad: pad, hdrH: hdrH, triH: triH,
    hdrY: L.shiftY + pad,
    triY: L.shiftY + pad + hdrH + pad,
    barY: L.shiftY + pad + hdrH + pad + triH + pad,
    barH: Math.max(3, L.shiftH - (pad*4 + hdrH + triH)),
    x: L.stackX + pad, w: L.stackW - pad*2
  };
}
function drawShiftModuleBase(g, L){
  var p = shiftParts(L), fc = Math.max(1.5, L.stackW*0.10);
  dashPlate(g, L.stackX, L.shiftY, L.stackW, L.shiftH, fc, '#2a2f35', '#14181c');
  dashScrew(g, L.stackX + fc*0.7, L.shiftY + fc*0.7, Math.max(0.8, L.stackW*0.035));

  dashWell(g, p.x, p.hdrY, p.w, p.hdrH, Math.max(1, fc*0.5), 1);
  dialFont(g, Math.max(3.6, p.hdrH*0.66));
  g.fillStyle = '#ffffff'; g.textAlign = 'center'; g.textBaseline = 'middle';
  g.fillText('SHIFT', L.stackX + L.stackW/2, p.hdrY + p.hdrH*0.54);

  dashWell(g, p.x, p.triY, p.w, p.triH, Math.max(1, fc*0.5), 1);
  g.fillStyle = 'rgba(120,134,150,.35)';                 /* cell divider */
  g.fillRect(L.stackX + L.stackW/2 - 0.35, p.triY + 1, 0.7, p.triH - 2);

  dashWell(g, p.x, p.barY, p.w, p.barH, Math.max(1, fc*0.4), 1);
}

/* =========================================================================
   INDICATOR STRIP AND STATUS BOXES

   Glyphs are drawn as vector paths in a unit box so they scale with the
   chassis. Everything static lives in the cached bitmap; only the turn
   arrows, the parking-brake lamp and the throttle meter change per frame.
   ========================================================================= */

function glyphArrow(g, x, y, w, h, right){
  var m = h*0.30, sx = right ? x : x + w, dx = right ? 1 : -1;
  g.beginPath();
  g.moveTo(sx + dx*w,        y + h*0.50);
  g.lineTo(sx + dx*w*0.52,   y);
  g.lineTo(sx + dx*w*0.52,   y + h*0.50 - m/2);
  g.lineTo(sx,               y + h*0.50 - m/2);
  g.lineTo(sx,               y + h*0.50 + m/2);
  g.lineTo(sx + dx*w*0.52,   y + h*0.50 + m/2);
  g.lineTo(sx + dx*w*0.52,   y + h);
  g.closePath(); g.fill();
}

/* low beam: a lamp body with the beam raked away to the left */
function glyphHeadlight(g, x, y, w, h){
  var bx = x + w*0.42, bw = w*0.58, i;
  g.beginPath();
  g.moveTo(bx, y);
  g.lineTo(bx + bw*0.42, y);
  g.quadraticCurveTo(bx + bw, y + h*0.14, bx + bw, y + h*0.50);
  g.quadraticCurveTo(bx + bw, y + h*0.86, bx + bw*0.42, y + h);
  g.lineTo(bx, y + h);
  g.closePath();
  g.lineWidth = Math.max(0.8, h*0.13); g.lineJoin = 'round';
  g.stroke();
  for(i=0;i<4;i++){
    var ly = y + h*0.17 + i*h*0.22;
    g.beginPath();
    g.moveTo(x, ly); g.lineTo(x + w*0.30 - i*w*0.045, ly);
    g.lineWidth = Math.max(0.7, h*0.11); g.lineCap = 'butt';
    g.stroke();
  }
}

/* belted occupant: seat, torso, head, and the sash across it */
function glyphBelt(g, x, y, w, h){
  g.beginPath();                                        /* head */
  g.arc(x + w*0.44, y + h*0.14, Math.max(0.8, h*0.13), 0, TAU);
  g.fill();
  g.beginPath();                                        /* torso */
  g.moveTo(x + w*0.30, y + h*0.66);
  g.lineTo(x + w*0.30, y + h*0.36);
  g.quadraticCurveTo(x + w*0.44, y + h*0.26, x + w*0.58, y + h*0.36);
  g.lineTo(x + w*0.58, y + h*0.66);
  g.closePath(); g.fill();
  g.beginPath();                                        /* thighs */
  g.moveTo(x + w*0.26, y + h*0.70);
  g.lineTo(x + w*0.72, y + h*0.70);
  g.lineTo(x + w*0.72, y + h*0.84);
  g.lineTo(x + w*0.26, y + h*0.84);
  g.closePath(); g.fill();
  g.beginPath();                                        /* seat back */
  g.moveTo(x + w*0.16, y + h*0.86);
  g.lineTo(x + w*0.30, y + h*0.86);
  g.lineTo(x + w*0.30, y + h*1.00);
  g.lineTo(x + w*0.16, y + h*1.00);
  g.closePath(); g.fill();
  g.beginPath();                                        /* sash */
  g.moveTo(x + w*0.18, y + h*0.86);
  g.lineTo(x + w*0.86, y + h*0.24);
  g.lineWidth = Math.max(0.9, h*0.11); g.lineCap = 'butt'; g.stroke();
}

/* parking brake: a P in a disc, flanked by the pad brackets */
function glyphBrake(g, x, y, w, h){
  var cx = x + w/2, cy = y + h/2, r = Math.min(w,h)*0.34;
  g.lineWidth = Math.max(0.8, h*0.10);
  g.beginPath(); g.arc(cx, cy, r, 0, TAU); g.stroke();
  g.beginPath(); g.arc(cx, cy, r*1.52, Math.PI*0.72, Math.PI*1.28); g.stroke();
  g.beginPath(); g.arc(cx, cy, r*1.52, Math.PI*-0.28, Math.PI*0.28); g.stroke();
  g.beginPath(); g.arc(cx, cy, r*1.92, Math.PI*0.80, Math.PI*1.20); g.stroke();
  g.beginPath(); g.arc(cx, cy, r*1.92, Math.PI*-0.20, Math.PI*0.20); g.stroke();
  dialFont(g, Math.max(3, r*1.35));
  g.textAlign = 'center'; g.textBaseline = 'middle';
  g.fillText('P', cx, cy + r*0.06);
}

/* traction: a car seen head on, over two skid tracks */
function glyphTraction(g, x, y, w, h){
  var bg = g.fillStyle;
  var cw = w*0.76, ch = h*0.58, cx = x + (w - cw)/2, cy = y;
  g.beginPath();                                        /* roof flaring into the body */
  g.moveTo(cx + cw*0.24, cy + ch*0.04);
  g.quadraticCurveTo(cx + cw*0.50, cy - ch*0.04, cx + cw*0.76, cy + ch*0.04);
  g.lineTo(cx + cw*0.88, cy + ch*0.38);
  g.quadraticCurveTo(cx + cw, cy + ch*0.42, cx + cw, cy + ch*0.54);
  g.lineTo(cx + cw, cy + ch*0.88);
  g.quadraticCurveTo(cx + cw, cy + ch, cx + cw*0.86, cy + ch);
  g.lineTo(cx + cw*0.14, cy + ch);
  g.quadraticCurveTo(cx, cy + ch, cx, cy + ch*0.88);
  g.lineTo(cx, cy + ch*0.54);
  g.quadraticCurveTo(cx, cy + ch*0.42, cx + cw*0.12, cy + ch*0.38);
  g.closePath(); g.fill();
  roundPath(g, cx - cw*0.12, cy + ch*0.44, cw*0.14, ch*0.13, ch*0.05);
  g.fill();                                             /* mirrors */
  roundPath(g, cx + cw*0.98, cy + ch*0.44, cw*0.14, ch*0.13, ch*0.05);
  g.fill();
  g.save();                                             /* lights and grille */
  g.globalCompositeOperation = 'destination-out';
  roundPath(g, cx + cw*0.09, cy + ch*0.55, cw*0.24, ch*0.15, ch*0.05); g.fill();
  roundPath(g, cx + cw*0.67, cy + ch*0.55, cw*0.24, ch*0.15, ch*0.05); g.fill();
  roundPath(g, cx + cw*0.36, cy + ch*0.78, cw*0.28, ch*0.12, ch*0.04); g.fill();
  g.restore();
  g.fillStyle = bg; g.strokeStyle = bg;

  var i, k, sx, sy, step = h*0.13, amp = w*0.15;        /* skid tracks */
  g.lineWidth = Math.max(1, h*0.080); g.lineJoin = 'miter'; g.lineCap = 'butt';
  for(i=0;i<2;i++){
    sx = x + w*(i ? 0.56 : 0.14);
    sy = y + h*0.62;
    g.beginPath();
    g.moveTo(sx + amp, sy);
    for(k=1;k<=3;k++) g.lineTo(sx + (k % 2 ? 0 : amp), sy + k*step);
    g.stroke();
  }
}

/* differential: four wheels on axles into a centre spine */
function glyphDiff(g, x, y, w, h, col, dark){
  var i, j, wx, wy, ww = w*0.17, wh = h*0.30;
  var cxm = x + w/2;
  g.strokeStyle = col; g.lineWidth = Math.max(0.9, w*0.05);
  g.beginPath();                                        /* spine and axles */
  g.moveTo(cxm, y + h*0.18); g.lineTo(cxm, y + h*0.82);
  g.moveTo(x + w*0.22, y + h*0.18); g.lineTo(x + w*0.78, y + h*0.18);
  g.moveTo(x + w*0.22, y + h*0.82); g.lineTo(x + w*0.78, y + h*0.82);
  g.stroke();
  for(i=0;i<2;i++) for(j=0;j<2;j++){                    /* wheels */
    wx = x + (j ? w - ww : 0);
    wy = y + (i ? h - wh : 0);
    roundPath(g, wx, wy, ww, wh, ww*0.35);
    g.fillStyle = col; g.fill();
    g.fillStyle = dark;
    g.fillRect(wx + ww*0.30, wy + wh*0.22, ww*0.40, wh*0.56);
  }
  roundPath(g, cxm - w*0.09, y + h*0.12, w*0.18, h*0.12, w*0.04);
  g.fillStyle = col; g.fill();
  roundPath(g, cxm - w*0.09, y + h*0.76, w*0.18, h*0.12, w*0.04);
  g.fillStyle = col; g.fill();
}

/* throttle: a raked pedal beside a level meter */
function glyphPedal(g, x, y, w, h, col, dark){
  g.save();
  g.translate(x, y);
  g.transform(1, 0, -0.26, 1, w*0.24, 0);
  roundPath(g, 0, 0, w*0.84, h, w*0.16);
  g.fillStyle = col; g.fill();
  roundPath(g, w*0.11, h*0.07, w*0.62, h*0.86, w*0.11);
  g.fillStyle = dark; g.fill();
  var i, n = 4;
  g.fillStyle = col;
  for(i=0;i<n;i++)
    g.fillRect(w*0.20, h*(0.16 + i*0.20), w*0.44, Math.max(0.6, h*0.045));
  g.restore();
}

/* --------------------------------------------------- indicator strip */
function indParts(L){
  var h = L.indH, iy = L.indY;
  var aw = Math.max(5, h*0.66), ah = h*0.52;
  var hw = Math.max(6, h*0.80), hh = h*0.50;
  var pw = Math.max(14, L.indW*0.44), ph = h*0.80;
  var px = L.indX + L.indW*0.50 - pw*0.42;
  return {
    ay: iy + (h - ah)/2, aw: aw, ah: ah,
    lax: L.indX + L.indW*0.045,
    rax: L.indX + L.indW*0.955 - aw,
    hx: L.indX + L.indW*0.215, hy: iy + (h - hh)/2, hw: hw, hh: hh,
    px: px, py: iy + (h - ph)/2, pw: pw, ph: ph,
    cw: (pw - Math.max(1, pw*0.02))/2
  };
}
function drawIndicatorBase(g, L){
  var p = indParts(L), i;
  /* the two lamps that sit in a housing of their own, backlit warm */
  dashPlate(g, p.px, p.py, p.pw, p.ph, Math.max(1.5, p.ph*0.16), '#4a5058', '#22272c');
  for(i=0;i<2;i++){
    var cx = p.px + Math.max(1, p.pw*0.02)/2 + i*(p.cw + Math.max(1, p.pw*0.02));
    var inset = Math.max(1, p.ph*0.09);
    var lg = g.createLinearGradient(0, p.py, 0, p.py + p.ph);
    lg.addColorStop(0, '#4a1a13'); lg.addColorStop(1, '#2a0f0b');
    roundPath(g, cx + inset*0.4, p.py + inset, p.cw - inset*0.8, p.ph - inset*2, inset*0.5);
    g.fillStyle = lg; g.fill();
  }
}

/* ------------------------------------------------------- status boxes */
function statBox(L, i){
  var gap = Math.max(1.5, L.statW*0.022);
  var w = (L.statW - gap*2)/3;
  return { x: L.statX + i*(w + gap), y: L.statY, w: w, h: L.statH };
}
function drawStatusBase(g, L){
  /* TRACTION and DIFF report how the car is built, so they are static for
     the run; only THROTTLE moves, and that is drawn live. */
  var cs = curCarSave(), i;
  var names = ['TRACTION', 'DIFF', 'THROTTLE'];
  var levels = [cs.up.susp, cs.up.trans, 0];
  for(i=0;i<3;i++){
    var b = statBox(L, i), fc = Math.max(1.5, b.w*0.10);
    dashPlate(g, b.x, b.y, b.w, b.h, fc, '#333941', '#171b20');
    facetPath(g, b.x + 0.5, b.y + 0.5, b.w - 1, b.h - 1, fc);
    g.lineWidth = 1; g.strokeStyle = 'rgba(150,164,180,.34)'; g.stroke();
    dashScrew(g, b.x + fc*0.75, b.y + fc*0.75, Math.max(0.7, b.w*0.030));
    dashScrew(g, b.x + b.w - fc*0.75, b.y + fc*0.75, Math.max(0.7, b.w*0.030));

    /* the caption sets the box: shrink it until it fits rather than let it
       run over the border, since TRACTION and THROTTLE are long words */
    var capH = Math.max(3.2, b.h*0.21);
    dialFont(g, capH);
    var capW = g.measureText(names[i]).width, room = b.w*0.84;
    if(capW > room){ capH *= room/capW; dialFont(g, Math.max(3, capH)); }
    g.fillStyle = '#ffffff'; g.textAlign = 'center'; g.textBaseline = 'middle';
    g.fillText(names[i], b.x + b.w/2, b.y + b.h*0.18);
    g.fillStyle = 'rgba(150,166,182,.34)';
    g.fillRect(b.x + b.w*0.07, b.y + b.h*0.31, b.w*0.86, 0.8);

    var isz = Math.min(b.w*0.62, b.h*0.41);
    var ix = b.x + (b.w - isz)/2, iy = b.y + b.h*0.36, iw = isz, ih = isz;
    if(i === 0){
      g.fillStyle = '#3fc41f'; g.strokeStyle = '#3fc41f';
      glyphTraction(g, ix, iy, iw, ih);
    } else if(i === 1){
      glyphDiff(g, ix, iy, iw, ih, '#9aa2ab', '#3a4048');
    }
    if(i < 2) drawSegBar(g, b, clamp(levels[i] + 1, 1, 4)/4);
  }
}
/* the four-cell meter along the foot of a status box */
function drawSegBar(g, b, frac){
  var n = 4, gap = Math.max(0.8, b.w*0.030);
  var bx = b.x + b.w*0.10, bw = b.w*0.80;
  var sw = (bw - gap*(n-1))/n, sh = Math.max(1.6, b.h*0.11);
  var by = b.y + b.h - sh - Math.max(1.5, b.h*0.10), i;
  for(i=0;i<n;i++){
    var live = clamp(frac*n - i, 0, 1);
    var sx = bx + i*(sw+gap);
    roundPath(g, sx, by, sw, sh, sh*0.28);
    g.fillStyle = '#16301a'; g.fill();
    if(live <= 0.02) continue;
    roundPath(g, sx, by, Math.max(sh*0.6, sw*live), sh, sh*0.28);
    g.fillStyle = '#3fc41f'; g.fill();
  }
}

/* ------------------------------------------------------ digital readout */
function drawReadoutBase(g, L){
  var fc = Math.max(1.5, L.stackW*0.10);
  var capH = Math.max(3.4, L.readH*0.30);
  dashPlate(g, L.stackX, L.readY, L.stackW, L.readH, fc, '#2a2f35', '#14181c');
  dashWell(g, L.stackX + Math.max(1, L.stackW*0.06), L.readY + Math.max(1, L.readH*0.10),
           L.stackW - Math.max(2, L.stackW*0.12), L.readH*0.56, Math.max(1, fc*0.5), 1);
  dialFont(g, capH);
  g.fillStyle = '#ffffff'; g.textAlign = 'center'; g.textBaseline = 'middle';
  g.fillText('KMH', L.stackX + L.stackW/2, L.readY + L.readH*0.82);
}

/* --------------------------------------------------- pedal travel strip
   The reference dash has no footwell, and on a full-width chassis there is
   no room for one — but a touch player has no other way to see what the
   throttle and brake are actually doing, so it survives as a narrow pair of
   slotted travel gauges cut into the moulding. Brake left, throttle right.
   The slots and their scale notches are static; the plates move. */
function pedalSlots(L){
  var inset = Math.max(1, Math.round(L.pedW*0.10));
  var w = Math.max(2, Math.round((L.pedW - inset*3)/2));
  return [
    { x:L.pedX + inset,         w:w, hi:'#e0705f', lo:'#5e241d', led:HUDC.red },
    { x:L.pedX + inset*2 + w,   w:w, hi:'#7fd08c', lo:'#1e4a26', led:HUDC.green }
  ];
}

function drawPedalBayBase(g, L){
  var slots = pedalSlots(L), i, k, n;
  var y0 = L.colY + Math.round(L.colH*0.30);
  var h  = L.colH - Math.round(L.colH*0.30) - Math.max(2, Math.round(L.colH*0.06));
  for(i=0;i<slots.length;i++){
    var s = slots[i];
    g.fillStyle = '#04060a';
    g.fillRect(s.x, y0, s.w, h);
    g.fillStyle = 'rgba(0,0,0,.70)';  g.fillRect(s.x, y0, s.w, 1);
    g.fillStyle = 'rgba(150,164,180,.24)'; g.fillRect(s.x, y0+h-1, s.w, 1);
    /* travel notches down the outer side of the slot */
    n = Math.max(3, Math.round(h/Math.max(3, L.D*0.12)));
    for(k=1;k<n;k++){
      g.fillStyle = 'rgba(150,168,190,.26)';
      g.fillRect(s.x + (i ? s.w-1 : 0), Math.round(y0 + h*k/n), 1, 1);
    }
  }
}

function drawPedalPlates(g, L, gasV, brakeV){
  var slots = pedalSlots(L);
  var vals = [brakeV, gasV];
  var y0 = L.colY + Math.round(L.colH*0.30);
  var h  = L.colH - Math.round(L.colH*0.30) - Math.max(2, Math.round(L.colH*0.06));
  var ph = Math.max(3, Math.round(h*0.24));
  var travel = h - ph - 2;
  for(var i=0;i<slots.length;i++){
    var s = slots[i], v = clamp(vals[i],0,1), on = v > 0.4;
    var py = Math.round(y0 + 1 + v*travel);
    /* the travelled part of the slot lights up behind the plate */
    if(v > 0.04){
      g.fillStyle = on ? s.lo : '#2a3038';
      g.fillRect(s.x, y0+1, s.w, py - y0 - 1);
    }
    g.fillStyle = '#05070a'; g.fillRect(s.x, py-1, s.w, ph+2);
    g.fillStyle = on ? s.hi : '#c2ccd6'; g.fillRect(s.x, py, s.w, ph);
    g.fillStyle = on ? '#ffffff' : '#e8eef4'; g.fillRect(s.x, py, s.w, 1);
    g.fillStyle = on ? s.lo : '#5b6670'; g.fillRect(s.x, py+ph-1, s.w, 1);
    if(s.w >= 3){                                       /* centre score line */
      g.fillStyle = on ? s.lo : '#8a94a0';
      g.fillRect(s.x + ((s.w/2)|0), py+1, 1, ph-2);
    }
  }
}

/* =========================================================================
   CENTRE STACK — shift module, digital readout, gear strip

   These are the instruments that sit between and beside the dials. Their
   frames are static and live in the cached bitmap; only the lit states are
   redrawn per frame.
   ========================================================================= */

/* Seven-segment glyphs, a..g clockwise from the top bar then the middle.
   Drawn as mitred bars so they read as a real LCD rather than a font. */
var SEG7 = {
  '0':'abcdef', '1':'bc',    '2':'abged', '3':'abgcd', '4':'fgbc',
  '5':'afgcd',  '6':'afgedc','7':'abc',   '8':'abcdefg','9':'abfgcd',
  '-':'g',      ' ':''
};
/* one mitred segment, appended to whatever path the caller has open */
function segBar(g, x, y, w, h, horiz){
  var t = horiz ? h : w, m = t/2;
  g.moveTo(horiz ? x+m : x, horiz ? y : y+m);
  if(horiz){
    g.lineTo(x+w-m, y); g.lineTo(x+w, y+m);
    g.lineTo(x+w-m, y+h); g.lineTo(x+m, y+h); g.lineTo(x, y+m);
  } else {
    g.lineTo(x+m, y); g.lineTo(x+w, y+m);
    g.lineTo(x+w, y+h-m); g.lineTo(x+m, y+h); g.lineTo(x, y+h-m);
  }
  g.closePath();
}
/* appends one digit's lit (or unlit) segments to the caller's path, so a
   whole readout is two fills rather than one per segment */
function sevenSegPath(g, ch, x, y, w, h, wantOn){
  var t = Math.max(1, h*0.155);                 /* segment thickness */
  var gp = t*0.22;                              /* gap between segments */
  var mid = y + h/2, iw = w - t, ih = (h - t)/2;
  var lit = SEG7[ch] || '';
  var seg = {
    a:[x+t/2+gp,        y,               iw-2*gp, t, true ],
    b:[x+w-t,           y+t/2+gp,        t,       ih-2*gp, false],
    c:[x+w-t,           mid+t/2+gp,      t,       ih-2*gp, false],
    d:[x+t/2+gp,        y+h-t,           iw-2*gp, t, true ],
    e:[x,               mid+t/2+gp,      t,       ih-2*gp, false],
    f:[x,               y+t/2+gp,        t,       ih-2*gp, false],
    g:[x+t/2+gp,        mid-t/2,         iw-2*gp, t, true ]
  };
  for(var k in seg){
    var s = seg[k];
    if((lit.indexOf(k) >= 0) !== wantOn) continue;
    segBar(g, s[0], s[1], s[2], s[3], s[4]);
  }
}
/* how wide a seven-segment run of n digits is for a given box height */
function segRunW(n, h){ return n*h*0.62 + (n-1)*h*0.13; }

function drawSevenSegRun(g, txt, cx, cy, h, on, off){
  var n = txt.length, w = h*0.62, gap = h*0.13;
  var x = cx - segRunW(n, h)/2, i, pass;
  for(pass=0; pass<2; pass++){
    g.beginPath();
    for(i=0;i<n;i++) sevenSegPath(g, txt[i], x + i*(w+gap), cy - h/2, w, h, pass === 1);
    g.fillStyle = pass === 1 ? on : off;
    g.fill();
  }
}

/* ------------------------------------------------------------- needles */
/* A single tapered blade: widest at the hub, running out to a point just
   short of the tick ring, with a soft shadow dropped down and to the right
   so it reads as sitting above the dial face rather than printed on it.
   No counterweight tail — the reference has none, and at this size a tail
   only muddies the hub. The pivot is a domed black cap carrying a bright
   boss in the needle's own colour. */
function drawNeedle(g, cx, cy, R, ang, col){
  var fr = R*0.830;
  var w0 = Math.max(0.9, fr*0.056);                     /* width at the hub */
  var tip = fr*0.805;
  var i;

  for(i=0;i<2;i++){                                     /* shadow, then blade */
    g.save();
    if(i === 0){ g.translate(cx + fr*0.030, cy + fr*0.038); }
    else       { g.translate(cx, cy); }
    g.rotate(ang);
    g.beginPath();
    g.moveTo(-fr*0.085,  w0*0.86);
    g.lineTo( tip,       w0*0.16);
    g.lineTo( tip + fr*0.020, 0);
    g.lineTo( tip,      -w0*0.16);
    g.lineTo(-fr*0.085, -w0*0.86);
    g.closePath();
    g.fillStyle = i === 0 ? 'rgba(0,0,0,.45)' : col;
    g.fill();
    if(i === 1){                                        /* lit upper flank */
      g.beginPath();
      g.moveTo(-fr*0.085, -w0*0.86);
      g.lineTo( tip,      -w0*0.16);
      g.lineTo( tip,      -w0*0.02);
      g.lineTo(-fr*0.085, -w0*0.34);
      g.closePath();
      g.fillStyle = 'rgba(255,255,255,.30)'; g.fill();
    }
    g.restore();
  }

  /* domed pivot cap */
  var hr = fr*0.165;
  g.beginPath(); g.arc(cx + fr*0.020, cy + fr*0.026, hr, 0, TAU);
  g.fillStyle = 'rgba(0,0,0,.45)'; g.fill();
  g.beginPath(); g.arc(cx, cy, hr, 0, TAU);
  g.fillStyle = '#080a0c'; g.fill();
  g.beginPath(); g.arc(cx - hr*0.10, cy - hr*0.12, hr*0.80, 0, TAU);
  g.fillStyle = '#20252a'; g.fill();
  g.beginPath(); g.arc(cx - hr*0.24, cy - hr*0.26, hr*0.46, 0, TAU);
  g.fillStyle = '#3d444b'; g.fill();
  g.beginPath(); g.arc(cx, cy, hr*0.46, 0, TAU);
  g.fillStyle = col; g.fill();
}

/* --------------------------------------------------------- warning lamps
   Cosmetic dash atmosphere: they take a hint from the drive (a cooked
   engine, a battered car, the lever pulled) but nothing reads them back. */
function drawLamp(g, x, y, sz, kind, on, col){
  var cx = x + sz/2, cy = y + sz/2;
  roundPath(g, x, y, sz, sz, 2);
  g.fillStyle = on ? 'rgba(255,120,60,.10)' : '#080c07'; g.fill();
  g.lineWidth = 1; g.strokeStyle = on ? 'rgba(255,180,50,.55)' : 'rgba(60,74,56,.85)'; g.stroke();
  var ink = on ? col : HUDC.lampOff;
  g.fillStyle = ink; g.strokeStyle = ink;

  if(kind === 'temp'){                                  /* coolant thermometer */
    g.lineWidth = Math.max(1, sz*0.09);
    g.beginPath(); g.arc(cx, cy + sz*0.20, sz*0.16, 0, TAU); g.fill();
    g.fillRect(cx - sz*0.07, cy - sz*0.30, sz*0.14, sz*0.44);
    g.fillRect(cx + sz*0.12, cy - sz*0.20, sz*0.14, sz*0.07);
    g.fillRect(cx + sz*0.12, cy - sz*0.02, sz*0.14, sz*0.07);
    g.beginPath();                                      /* fluid waves */
    g.moveTo(x + sz*0.14, y + sz*0.86); g.lineTo(x + sz*0.86, y + sz*0.86);
    g.stroke();
  } else if(kind === 'engine'){                         /* check engine block */
    g.fillRect(cx - sz*0.28, cy - sz*0.06, sz*0.50, sz*0.26);
    g.fillRect(cx - sz*0.14, cy - sz*0.22, sz*0.26, sz*0.18);
    g.fillRect(cx + sz*0.20, cy - sz*0.02, sz*0.14, sz*0.18);
    g.fillRect(cx - sz*0.36, cy + sz*0.02, sz*0.10, sz*0.12);
    g.fillRect(cx - sz*0.06, cy - sz*0.34, sz*0.10, sz*0.12);
  } else {                                              /* brake / lever lamp */
    g.lineWidth = Math.max(1, sz*0.09);
    g.beginPath(); g.arc(cx, cy, sz*0.28, 0, TAU); g.stroke();
    g.fillRect(cx - sz*0.04, cy - sz*0.17, sz*0.08, sz*0.20);
    g.fillRect(cx - sz*0.04, cy + sz*0.09, sz*0.08, sz*0.08);
    g.beginPath();                                      /* motion arcs */
    g.arc(cx, cy, sz*0.42, Math.PI*0.72, Math.PI*1.28); g.stroke();
    g.beginPath();
    g.arc(cx, cy, sz*0.42, Math.PI*-0.28, Math.PI*0.28); g.stroke();
  }
}

/* The touch controls are DOM elements so they stay real tap targets, but
   they are part of the same moulding as everything else — so the chassis
   layout, not the stylesheet, decides where they sit and how big they are.
   Published as custom properties and consumed by a handful of CSS rules. */
function applyDashLayout(L){
  var s = document.documentElement.style, i;
  /* the controls are positioned from the bottom of the screen, the layout
     measures from the top of the dash canvas — so every y flips through the
     canvas height, safe-area foot included */
  var up = function(y, h){ return L.H - y - h; };
  var vars = {
    'dash-h': L.H,
    'pad-l-x': L.padLX, 'pad-r-x': L.padRX, 'pad-y': up(L.padY, L.padH2),
    'pad-w': L.padW, 'pad-h': L.padH2,
    'gas-x': L.gasX, 'gate-x': L.gateX, 'upper-y': up(L.upperY, L.upperH),
    'gas-w': L.gasW, 'gate-w': L.gateW, 'upper-h': L.upperH,
    'padl-l-x': L.padlLX, 'padl-r-x': L.padlRX,
    'padl-y': up(L.padlY, L.padlH), 'padl-w': L.padlW, 'padl-h': L.padlH,
    'dash-label': Math.max(8, Math.round(L.D*0.15))
  };
  for(i in vars) s.setProperty('--' + i, Math.round(vars[i]) + 'px');
}

/* -------------------------------------------------------- live cluster */
function ensureCluster(){
  var el = document.getElementById('cluster-cv');
  if(!el) return false;
  var S = Math.max(1, Math.round(Math.min(window.devicePixelRatio || 1, 2)));
  /* keyed on the viewport, not on the layout, so the common case costs a
     string compare rather than a fresh layout object every frame */
  var key = Math.round(view.w)+'x'+Math.round(view.h)+'@'+S+'/'+cluster.kmhMax;
  if(key !== cluster.key || cluster.cv !== el || !cluster.base){
    var L = clusterLayout();
    cluster.cv = el; cluster.L = L; cluster.S = S; cluster.W = L.W; cluster.H = L.H;
    el.width = L.W*S; el.height = L.H*S;
    el.style.width = L.W+'px'; el.style.height = L.H+'px';
    cluster.g = el.getContext('2d');
    cluster.base = buildClusterBase(L, S);
    cluster.key = key;
    applyDashLayout(L);
  }
  cluster.g.setTransform(S,0,0,S,0,0);
  cluster.g.imageSmoothingEnabled = false;
  return true;
}

function drawCluster(r){
  if(!ensureCluster()) return;
  var L = cluster.L, g = cluster.g, i;
  g.clearRect(0,0,L.W,L.H);
  g.drawImage(cluster.base, 0, 0, L.W, L.H);

  drawPedalPlates(g, L, hudCtl.gas, hudCtl.brake);

  /* ---- tachometer ---- */
  var rpm = cluster.nRpm;
  var hot = rpm >= 1.0;
  drawNeedle(g, L.tachX, L.dialY, L.R,
             dialAngle(clamp(rpm*TACH_SCALE,0,TACH_MAX), 0, TACH_MAX),
             hot ? HUDC.needleHot : HUDC.needle);

  /* ---- speedometer + digital readout ---- */
  var kmh = cluster.nKmh;
  drawNeedle(g, L.spdX, L.dialY, L.R,
             dialAngle(clamp(kmh,0,cluster.kmhMax), 0, cluster.kmhMax),
             HUDC.needleSpd);
  /* ---- boost. Nothing in the physics models manifold pressure — turbo is
     an upgrade level that scales torque — so the needle is a display-only
     expression of how hard the engine is working through whatever turbo is
     fitted. Nothing reads it back. ---- */
  drawNeedle(g, L.boostX, L.boostY, L.boostR,
             dialAngle(clamp(cluster.nBoost, 0, 20), 0, 20), HUDC.needle);

  /* ---- digital readout, seven-segment as on the reference ---- */
  var segH = L.readH*0.42;
  drawSevenSegRun(g, String(Math.round(Math.max(0,kmh))),
                  L.stackX + L.stackW/2, L.readY + L.readH*0.38,
                  segH, '#eef4fb', 'rgba(120,140,166,.13)');

  /* ---- gear gate ---- */
  var spd = r ? Math.abs(r.car.fwd) : 0;
  var gearIdx = spd < 2 ? 0 : clamp(r ? r.gear : 1, 1, TOP_GEAR);
  var flash = r && r.perfectFlash > 0;
  dialFont(g, Math.max(3.6, gearCellRect(L,0).h*0.72));
  g.textAlign = 'center'; g.textBaseline = 'middle';
  for(i=0;i<L.gearCells;i++){
    var cr = gearCellRect(L, i), sel = i === gearIdx;
    g.fillStyle = sel ? (flash ? HUDC.green : (hot ? HUDC.red : '#f0a41c')) : '#9ba3ab';
    g.fillText(i === 0 ? 'N' : String(i), cr.x + cr.w/2, cr.y + cr.h*0.54);
  }
  /* the detent knob rides alongside the engaged position */
  var kr = gearCellRect(L, gearIdx);
  var kw = Math.max(2, L.gearW*0.34), kh = Math.max(1.5, kr.h*0.46);
  var kx = L.gearX + L.gearW - kw*0.34, ky = kr.y + kr.h/2 - kh/2;
  roundPath(g, kx, ky, kw, kh, kh*0.35);
  var kg = g.createLinearGradient(0, ky, 0, ky+kh);
  kg.addColorStop(0,'#9aa3ac'); kg.addColorStop(0.45,'#4b535b'); kg.addColorStop(1,'#14181c');
  g.fillStyle = kg; g.fill();
  g.fillStyle = 'rgba(226,234,242,.75)'; g.fillRect(kx + kw*0.12, ky, kw*0.76, 0.7);

  /* ---- shift module: paddle tell-tales over the shift-light bar ---- */
  var p = shiftParts(L);
  var tw = (p.w - 1)/2;
  drawAuxTri(g, p.x, p.triY, tw, p.triH, false, hudCtl.padDn > 0.15);
  drawAuxTri(g, p.x + tw + 1, p.triY, tw, p.triH, true, hudCtl.padUp > 0.15);

  var frac = clamp(rpm/1.12, 0, 1);
  var segs = 4, sgap = Math.max(0.8, p.w*0.030);
  var sw = (p.w - 2 - (segs-1)*sgap)/segs;
  for(i=0;i<segs;i++){
    var live = clamp(frac*segs - i, 0, 1);
    if(live <= 0.02) continue;
    var sx = p.x + 1 + i*(sw+sgap), sy = p.barY + 1, sh = p.barH - 2;
    var rr = Math.max(0.6, sh*0.20);
    roundPath(g, sx, sy, sw, sh, rr);
    g.fillStyle = i < segs-1 ? '#2f8f16' : '#8f2a12'; g.fill();
    roundPath(g, sx, sy, Math.max(rr*2, sw*live), sh, rr);
    g.fillStyle = i < segs-1 ? '#4fd41f' : '#ff4a2a'; g.fill();
    roundPath(g, sx, sy, Math.max(rr*2, sw*live), Math.max(1.2, sh*0.34), rr*0.6);
    g.fillStyle = 'rgba(226,255,210,.42)'; g.fill();
  }

  /* ---- indicator strip ---- */
  var ip = indParts(L);
  g.fillStyle = input.left  ? '#ffb432' : '#8d949c';
  glyphArrow(g, ip.lax, ip.ay, ip.aw, ip.ah, false);
  g.fillStyle = input.right ? '#ffb432' : '#8d949c';
  glyphArrow(g, ip.rax, ip.ay, ip.aw, ip.ah, true);
  g.strokeStyle = '#2fd41a'; g.fillStyle = '#2fd41a';
  glyphHeadlight(g, ip.hx, ip.hy, ip.hw, ip.hh);
  var gi = Math.max(1, ip.pw*0.02)/2;
  var gin = Math.max(1, ip.ph*0.20);
  g.fillStyle = '#ee2a18'; g.strokeStyle = '#ee2a18';
  glyphBelt(g, ip.px + gi + ip.cw*0.30, ip.py + gin, ip.cw*0.46, ip.ph - gin*2);
  var brakeOn = hudCtl.hb > 0.4;
  g.fillStyle = brakeOn ? '#ff5a48' : '#ee2a18';
  g.strokeStyle = brakeOn ? '#ff5a48' : '#ee2a18';
  glyphBrake(g, ip.px + gi + ip.cw*1.28, ip.py + gin, ip.cw*0.46, ip.ph - gin*2);

  /* ---- throttle box: the only status meter that moves ---- */
  var tb = statBox(L, 2);
  var tsz = Math.min(tb.w*0.62, tb.h*0.41);
  var tix = tb.x + (tb.w - tsz)/2, tiy = tb.y + tb.h*0.36;
  var tiw = tsz, tih = tsz;
  glyphPedal(g, tix + tiw*0.52, tiy, tiw*0.48, tih, '#aab2bb', '#31373e');
  var bars = 3, bgap = Math.max(0.8, tiw*0.05);
  var bw2 = (tiw*0.46 - bgap*(bars-1))/bars;
  for(i=0;i<bars;i++){
    var lv = clamp(hudCtl.gas*bars - i, 0, 1);
    var bx2 = tix + i*(bw2+bgap);
    g.fillStyle = '#16301a'; g.fillRect(bx2, tiy, bw2, tih*0.86);
    if(lv <= 0.02) continue;
    g.fillStyle = '#3fc41f';
    g.fillRect(bx2, tiy + tih*0.86*(1-lv), bw2, tih*0.86*lv);
  }

  /* ---- LED pip row over the steering pads ---- */
  var pipN = 5, pipInset = Math.max(2, Math.round(L.pipH*0.22));
  var pipGap = Math.max(1, Math.round(L.pipH*0.26));
  var pipW = (L.pipW - pipInset*2 - (pipN-1)*pipGap)/pipN;
  var lit = Math.round(clamp(rpm, 0, 1)*pipN);
  for(i=0;i<pipN;i++){
    var on = i < lit;
    var px0 = L.pipX + pipInset + i*(pipW+pipGap), py0 = L.pipY + pipInset;
    var ph2 = L.pipH - pipInset*2;
    g.fillStyle = on ? '#3f9c1d' : '#132a17';
    g.fillRect(px0, py0, pipW, ph2);
    g.fillStyle = on ? '#5ad42a' : '#16301a';        /* domed lens */
    g.fillRect(px0+0.5, py0+0.5, pipW-1, ph2-1.5);
    g.fillStyle = on ? 'rgba(212,255,190,.80)' : 'rgba(96,128,96,.22)';
    g.fillRect(px0+0.5, py0+0.5, pipW-1, Math.max(0.6, ph2*0.22));
    g.fillStyle = 'rgba(0,0,0,.55)';
    g.fillRect(px0, py0+ph2-1, pipW, 1);
  }
}

/* the pair of little blue triangles above the knob, which wink when the
   matching paddle is tapped — the reference's shift tell-tales */
function drawAuxTri(g, x, y, w, h, up, lit){
  if(lit){ g.fillStyle = 'rgba(90,140,255,.22)'; g.fillRect(x, y, w, h); }
  var m = Math.min(w*0.34, h*0.30), cx = x + w/2, cy = y + h/2;
  g.beginPath();
  if(up){ g.moveTo(cx, cy - m); g.lineTo(cx + m*1.15, cy + m*0.72); g.lineTo(cx - m*1.15, cy + m*0.72); }
  else  { g.moveTo(cx, cy + m); g.lineTo(cx + m*1.15, cy - m*0.72); g.lineTo(cx - m*1.15, cy - m*0.72); }
  g.closePath();
  g.fillStyle = lit ? '#5aa0ff' : '#2b6bd0'; g.fill();
  g.beginPath();
  if(up){ g.moveTo(cx, cy - m); g.lineTo(cx + m*0.55, cy + m*0.05); g.lineTo(cx - m*0.55, cy + m*0.05); }
  else  { g.moveTo(cx, cy + m); g.lineTo(cx + m*0.55, cy - m*0.05); g.lineTo(cx - m*0.55, cy - m*0.05); }
  g.closePath();
  g.fillStyle = lit ? '#a8ccff' : '#4f8fe8'; g.fill();
}

/* A smooth-coordinate surface for a control that is mounted in the chassis.
   The bay's bezel is already painted into the cached dash bitmap, so these
   only ever draw the moving face and leave their margins transparent. */
function hudSurface(cv, w, h){
  var dpr = Math.min(window.devicePixelRatio || 1, 2);
  var S = Math.max(1, Math.round(dpr));
  w = Math.max(1, Math.round(w)); h = Math.max(1, Math.round(h));
  if(cv.width !== w*S || cv.height !== h*S){
    cv.width = w*S; cv.height = h*S;
    cv.style.width = w+'px'; cv.style.height = h+'px';
  }
  var g = cv.getContext('2d');
  g.setTransform(S,0,0,S,0,0);
  g.clearRect(0,0,w,h);
  return g;
}

/* ------------------------------------------------- steering rockers
   Where the reference carries its NOS button, Rally Pixel needs its
   steering instead, so the arrows take the same treatment as the pads on
   the reference: a dark moulded plate carrying a grey arrowhead, dropped
   into the bezel the chassis already cut for it. */
function drawSteer(id, right, pressed){
  var cv = document.getElementById(id);
  if(!cv) return;
  var L = cluster.L || clusterLayout();
  var W = L.padW, H = L.padH2;
  var g = hudSurface(cv, W, H);
  var rim = Math.max(1.5, Math.min(W,H)*0.08);
  var x = rim, y = rim + (pressed ? 1 : 0), w = W - rim*2, h = H - rim*2 - 1;
  var c = Math.max(1.5, Math.min(w,h)*0.16);

  var lg = g.createLinearGradient(0, y, 0, y+h);
  if(pressed){ lg.addColorStop(0,'#e0a733'); lg.addColorStop(1,'#a56910'); }
  else       { lg.addColorStop(0,'#3a3f45'); lg.addColorStop(1,'#22262b'); }
  facetPath(g, x, y, w, h, c); g.fillStyle = lg; g.fill();
  g.save(); facetPath(g, x, y, w, h, c); g.clip();
  dashGrain(g, x, y, w, h, Math.round(w*h*0.05), 11);
  g.fillStyle = pressed ? 'rgba(255,226,160,.9)' : 'rgba(139,150,163,.75)';
  g.fillRect(x, y, w, 1);
  g.fillStyle = 'rgba(0,0,0,.6)'; g.fillRect(x, y+h-1, w, 1);
  g.restore();

  /* solid arrowhead pointing outboard */
  var ah = Math.max(6, h*0.30), aw = ah*0.62;
  var acx = x + w/2 + (right ? -aw*0.25 : aw*0.25), acy = y + h/2;
  g.beginPath();
  if(right){ g.moveTo(acx + aw/2, acy); g.lineTo(acx - aw/2, acy - ah/2); g.lineTo(acx - aw/2, acy + ah/2); }
  else     { g.moveTo(acx - aw/2, acy); g.lineTo(acx + aw/2, acy - ah/2); g.lineTo(acx + aw/2, acy + ah/2); }
  g.closePath();
  g.fillStyle = pressed ? '#2a1c00' : '#9aa3ad'; g.fill();
}

/* ------------------------------------------------------ handbrake lever
   A gated lever, the way the reference mounts its shifter: a slot cut
   across the bay floor and a machined rod that swings along it. The rod
   travels right as the lever comes on, so the gate reads at a glance. */
function drawHandbrake(v){
  var cv = document.getElementById('hbrake-cv');
  if(!cv) return;
  var L = cluster.L || clusterLayout();
  var W = L.gateW, H = L.upperH;
  var g = hudSurface(cv, W, H);
  var on = v > 0.5;
  var rim = Math.max(1.5, Math.min(W,H)*0.08);
  var m = Math.min(W, H);
  var sy = H*0.60, sh = Math.max(3, m*0.24);
  var sx = rim + W*0.09, sw = W - rim*2 - W*0.18;

  /* the slot */
  roundPath(g, sx, sy - sh/2, sw, sh, sh/2);
  g.fillStyle = '#04060a'; g.fill();
  g.save(); roundPath(g, sx, sy - sh/2, sw, sh, sh/2); g.clip();
  g.fillStyle = 'rgba(0,0,0,.8)'; g.fillRect(sx, sy - sh/2, sw, 1);
  g.restore();

  /* the rod: pivots at the foot of the slot and rakes back as it comes on */
  var t = clamp(v,0,1);
  var bx = sx + sw*(0.20 + t*0.62), by = sy;
  var tipX = bx + W*0.16*t + W*0.04, tipY = rim + H*0.12;
  var rw = Math.max(3, m*0.21);
  g.save();
  g.translate(bx, by);
  g.rotate(Math.atan2(tipX-bx, by-tipY));
  var len = Math.hypot(tipX-bx, by-tipY);
  var rod = g.createLinearGradient(-rw/2, 0, rw/2, 0);
  rod.addColorStop(0.00, '#8b939b');
  rod.addColorStop(0.28, on ? '#6b5a2a' : '#4c545c');
  rod.addColorStop(0.70, '#262b31');
  rod.addColorStop(1.00, '#0e1114');
  roundPath(g, -rw/2, -len, rw, len + rw*0.6, rw*0.45);
  g.fillStyle = rod; g.fill();
  g.beginPath(); g.arc(0, -len + rw*0.5, rw*0.52, 0, TAU);   /* domed cap */
  g.fillStyle = on ? '#d8a63c' : '#7f878f'; g.fill();
  g.beginPath(); g.arc(-rw*0.14, -len + rw*0.36, rw*0.28, 0, TAU);
  g.fillStyle = on ? '#ffdd93' : '#b3bbc2'; g.fill();
  g.restore();

  /* pivot boot */
  g.beginPath(); g.ellipse(bx, by + sh*0.06, rw*0.62, sh*0.40, 0, 0, TAU);
  g.fillStyle = '#1b2025'; g.fill();
}

/* --------------------------------------------------------- shift paddles
   Cast blades in the reference's style: a dark raked plate with a bright
   machined edge along its outer side, a mounting bracket at the inboard
   foot where it bolts to the rail, and a large stamped +/- centred on the
   face. The rake runs outward, so the pair frames the dials. */
function drawPaddle(id, up, press, active){
  var cv = document.getElementById(id);
  if(!cv) return;
  var L = cluster.L || clusterLayout();
  var W = L.padlW, H = L.padlH;
  var g = hudSurface(cv, W, H);
  var down = press > 0.5;
  var drop = down ? Math.max(1, H*0.02) : 0;
  var sgn = up ? 1 : -1;                       /* +1 leans right, -1 leans left */
  var y0 = H*0.02, y1 = H*0.985;

  /* Mounting post at the inboard foot, where the blade bolts through the
     rail. Its own casting, with its own chamfer catching the light. */
  var brW = W*0.40, brH = H*0.48;
  var brX = up ? 0 : W - brW, brY = H - brH;
  g.beginPath();
  g.moveTo(brX + brW*0.22, brY);
  g.lineTo(brX + brW,      brY + brH*0.16);
  g.lineTo(brX + brW,      brY + brH);
  g.lineTo(brX,            brY + brH);
  g.lineTo(brX,            brY + brH*0.20);
  g.closePath();
  var bg = g.createLinearGradient(brX, brY, brX + brW, brY + brH);
  bg.addColorStop(0.00,'#3d434a'); bg.addColorStop(0.45,'#22262b'); bg.addColorStop(1.00,'#0d1014');
  g.fillStyle = bg; g.fill();
  g.beginPath();
  g.moveTo(brX + 0.4,      brY + brH*0.20);
  g.lineTo(brX + brW*0.22, brY + 0.4);
  g.lineTo(brX + brW,      brY + brH*0.16);
  g.lineWidth = Math.max(1, W*0.050); g.lineJoin = 'round'; g.lineCap = 'butt';
  g.strokeStyle = '#b9c1c9'; g.stroke();

  /* The blade itself: a bowed casting, wider at the foot, leaning outboard
     at the tip. Both long edges are curved — on the reference it is clearly
     a pressing, not a flat slab. */
  g.save();
  g.translate(0, drop);
  var topC = W/2 + sgn*W*0.17, botC = W/2 + sgn*W*0.06;
  var topW = W*0.50, botW = W*0.56;
  var bow  = sgn*W*0.10;
  var tl = topC - topW/2, tr = topC + topW/2;
  var bl = botC - botW/2, br = botC + botW/2;
  var blade = function(){
    g.beginPath();
    g.moveTo(tl, y0);
    g.lineTo(tr, y0);
    g.quadraticCurveTo((tr+br)/2 + bow, (y0+y1)/2, br, y1);
    g.lineTo(bl, y1);
    g.quadraticCurveTo((tl+bl)/2 + bow, (y0+y1)/2, tl, y0);
    g.closePath();
  };
  blade();
  var bl2 = g.createLinearGradient(tl, 0, br, 0);
  if(down){
    bl2.addColorStop(0.00,'#ffe0a4'); bl2.addColorStop(0.35,'#e2a53c'); bl2.addColorStop(1.00,'#8a6416');
  } else {
    bl2.addColorStop(0.00,'#3a4046'); bl2.addColorStop(0.34,'#24282d'); bl2.addColorStop(1.00,'#0f1215');
  }
  g.fillStyle = bl2; g.fill();
  g.save(); blade(); g.clip();
  dashGrain(g, 0, 0, W, H, Math.round(W*H*0.07), 17);
  g.restore();

  /* Machined chamfer: an L across the top and down the left flank. The key
     light is up and to the left for the whole dash, so both blades catch it
     on the same side rather than mirroring. */
  g.lineWidth = Math.max(1, W*0.055); g.lineJoin = 'round'; g.lineCap = 'butt';
  g.beginPath();
  g.moveTo(tr, y0); g.lineTo(tl, y0);
  g.quadraticCurveTo((tl+bl)/2 + bow, (y0+y1)/2, bl, y1);
  g.strokeStyle = down ? 'rgba(255,240,200,.95)' : 'rgba(206,215,224,.92)';
  g.stroke();
  g.beginPath();
  g.moveTo(tr, y0);
  g.quadraticCurveTo((tr+br)/2 + bow, (y0+y1)/2, br, y1);
  g.lineWidth = Math.max(0.8, W*0.035);
  g.strokeStyle = 'rgba(3,5,7,.9)'; g.stroke();

  /* stamped +/- on the face */
  var gl = Math.max(5, W*0.40), gw = Math.max(1.6, W*0.115);
  var gcx = (topC + botC)/2, gcy = H*0.50;
  g.fillStyle = 'rgba(0,0,0,.55)';
  g.fillRect(gcx - gl/2 + gw*0.22, gcy - gw/2 + gw*0.22, gl, gw);
  if(up) g.fillRect(gcx - gw/2 + gw*0.22, gcy - gl/2 + gw*0.22, gw, gl);
  g.fillStyle = down ? '#3a2a06' : (active ? '#f2f6fa' : '#aeb6bf');
  g.fillRect(gcx - gl/2, gcy - gw/2, gl, gw);
  if(up) g.fillRect(gcx - gw/2, gcy - gl/2, gw, gl);
  g.restore();
}

/* ------------------------------------------------------------- per frame */
function updateHudControls(dt){
  /* mirror exactly what the physics treats as throttle and brake */
  var gasOn   = save.settings.autoGas ? !input.hbrake : input.gas;
  var brakeOn = input.hbrake;
  var k = 1 - Math.pow(0.0004, dt);
  hudCtl.gas   += ((gasOn?1:0)   - hudCtl.gas)*k;
  hudCtl.brake += ((brakeOn?1:0) - hudCtl.brake)*k;
  hudCtl.hb    += ((brakeOn?1:0) - hudCtl.hb)*k;
  hudCtl.padUp = Math.max(0, hudCtl.padUp - dt*4.5);
  hudCtl.padDn = Math.max(0, hudCtl.padDn - dt*4.5);

  /* Needles chase the live values with a short mechanical lag — fast
     enough to be accurate, damped enough not to twitch. Nothing here
     feeds back into the physics; it is all readout. */
  if(race){
    var kmh = Math.abs(race.car.fwd)*0.42;
    cluster.nRpm += (race.rpm - cluster.nRpm) * clamp(dt*20, 0, 1);
    cluster.nKmh += (kmh      - cluster.nKmh) * clamp(dt*14, 0, 1);
    var turbo = (curCarSave().up.turbo || 0);
    var boost = clamp(race.rpm, 0, 1.2) * hudCtl.gas * (3.5 + turbo*5.2);
    cluster.nBoost += (boost - cluster.nBoost) * clamp(dt*9, 0, 1);
    var heating = race.rpm > 0.98 ? 1 : (race.rpm > 0.86 ? 0.35 : 0);
    cluster.heat = clamp(cluster.heat + (heating ? dt*0.30*heating : -dt*0.20), 0, 1);
    drawCluster(race);
  }

  /* the smaller surfaces repaint only on a visible change */
  var q = function(v){ return Math.round(v*12); };
  if(q(hudCtl.hb) !== hudCtl.drawnHb){
    hudCtl.drawnHb = q(hudCtl.hb);
    drawHandbrake(hudCtl.hb);
  }
  var manual = save.settings.transmission === 'manual';
  if(q(hudCtl.padUp) !== hudCtl.drawnUp || hudCtl.drawnMode !== manual){
    hudCtl.drawnUp = q(hudCtl.padUp);
    drawPaddle('pad-up-cv', true, hudCtl.padUp, manual);
  }
  if(q(hudCtl.padDn) !== hudCtl.drawnDn || hudCtl.drawnMode !== manual){
    hudCtl.drawnDn = q(hudCtl.padDn);
    drawPaddle('pad-dn-cv', false, hudCtl.padDn, manual);
  }
  hudCtl.drawnMode = manual;

  /* the steering rockers are on/off, so they only ever repaint on a press */
  if(input.left !== hudCtl.drawnL){
    hudCtl.drawnL = input.left;
    drawSteer('steer-l-cv', false, input.left);
  }
  if(input.right !== hudCtl.drawnR){
    hudCtl.drawnR = input.right;
    drawSteer('steer-r-cv', true, input.right);
  }
}

/* force a full repaint, e.g. when a race starts or the viewport changes */
function resetHudControls(){
  hudCtl.gas = hudCtl.brake = hudCtl.hb = hudCtl.padUp = hudCtl.padDn = 0;
  hudCtl.drawnHb = -1;
  hudCtl.drawnUp = hudCtl.drawnDn = -1; hudCtl.drawnMode = null;
  hudCtl.drawnL = hudCtl.drawnR = null;
  drawSteer('steer-l-cv', false, false);
  drawSteer('steer-r-cv', true, false);
  cluster.nRpm = cluster.nKmh = cluster.nBoost = cluster.heat = 0;
  /* size the speedo to the car actually being driven, rounded up to a
     whole major division so the numbering stays tidy */
  if(race) cluster.kmhMax = Math.max(120, Math.ceil(race.stats.kmh*1.08/40)*40);
  cluster.key = '';                                     /* force a face rebuild */
  drawCluster(race);
  var manual = save.settings.transmission === 'manual';
  drawHandbrake(0);
  drawPaddle('pad-up-cv', true, 0, manual);
  drawPaddle('pad-dn-cv', false, 0, manual);
  document.getElementById('p-shiftup').classList.toggle('auto', !manual);
  document.getElementById('p-shiftdn').classList.toggle('auto', !manual);
}

/* ------------------------------------------------------------- gearbox
   Six speeds. GEAR_SPANS is the fraction of the car's top speed reached at
   the redline in each gear, so engine revs are speed/(top*span) — revs fall
   on an upshift and climb on a downshift, the way they should.

   The spans are exactly the bands the automatic box has always used, so
   AUTOMATIC is unchanged: it picks the same gear at the same speed as
   before and always makes full torque (torque = 1). Only MANUAL asks the
   torque curve what the current gear is worth.
   ---------------------------------------------------------------------- */
var GEAR_SPANS = [1/6, 2/6, 3/6, 4/6, 5/6, 1.0];      /* stock reference */
var TOP_GEAR = GEAR_SPANS.length;

/* A car's actual spans, after any tuning. `final` scales the whole set, so
   it alone decides where top gear runs out; `spread` bunches the lower
   gears (>1) or stretches them (<1). Both at 1 reproduces GEAR_SPANS
   exactly, so an untuned car is bit-identical to before. */
function carSpans(carId){
  var g = gearingOf(carId), out = [];
  for(var i=0;i<TOP_GEAR;i++)
    out.push(g.final * Math.pow((i+1)/TOP_GEAR, g.spread));
  return out;
}

/* Torque multiplier for a given fraction of redline. Lugging below the
   power band and hanging off the limiter above it both cost real drive.
   Lugging means being in too high a gear for the speed, which is not
   possible in first, so first is exempt from the low-rev penalty. */
function gearTorque(rpm, gear){
  if(gear <= 1 && rpm < 0.55) return 1.00;
  if(rpm < 0.30) return 0.42 + (rpm/0.30)*0.50;                          /* lugging  0.42 -> 0.92 */
  if(rpm < 0.55) return 0.92 + (rpm-0.30)/0.25*0.08;                     /*          0.92 -> 1.00 */
  if(rpm < 0.90) return 1.00 + Math.sin((rpm-0.55)/0.35*Math.PI)*0.03;   /* on the cam, peak 1.03 */
  if(rpm < 1.02) return 1.00 - (rpm-0.90)/0.12*0.14;                     /*          1.00 -> 0.86 */
  if(rpm < 1.15) return 0.86 - (rpm-1.02)/0.13*0.56;                     /* over-rev 0.86 -> 0.30 */
  return 0.06;                                                           /* against the limiter */
}

/* The one place race.gear is allowed to change. */
function setGear(r, g, manual){
  g = clamp(g, 1, TOP_GEAR);
  if(g === r.gear) return false;
  var up = g > r.gear, prev = r.rpm;
  if(manual && !up){
    /* refuse a downshift that would bounce the engine off the limiter */
    var frac = Math.abs(r.car.fwd) / Math.max(1, r.stats.topSpeed);
    if(frac / r.spans[g-1] > 1.14){ audioBeep(150, 0.07); return false; }
  }
  r.gear = g;
  if(manual){
    r.shiftT = 0.07;                                   /* drive interrupted */
    if(up && prev >= 0.80 && prev <= 1.06){            /* shifted on the cam */
      r.perfectT = 0.85; r.perfectFlash = 0.85;
    }
  }
  audioShift(up);
  return true;
}

function updateGearbox(r, spd, topSpeed, dt){
  var manual = save.settings.transmission === 'manual';
  var frac = topSpeed > 0 ? spd/topSpeed : 0;

  if(!manual){
    var want = 1;
    while(want < TOP_GEAR && frac > r.spans[want-1]) want++;
    if(want !== r.gear) setGear(r, want, false);
  }

  var hi = r.spans[r.gear-1];
  var rpm = hi > 0 ? frac/hi : 0;
  if(spd < 4) rpm = Math.max(rpm, 0.11);               /* idle */
  r.rpm = clamp(rpm, 0, 1.35);

  r.shiftT     = Math.max(0, r.shiftT - dt);
  r.perfectT   = Math.max(0, r.perfectT - dt);
  r.perfectFlash = Math.max(0, r.perfectFlash - dt);

  /* shorter gearing multiplies torque at the wheels, taller gearing divides
     it. Exactly 1 on stock ratios, so untuned cars are unaffected. */
  var ratio = GEAR_SPANS[r.gear-1] / r.spans[r.gear-1];

  if(!manual){ r.torque = ratio; return; }             /* automatic: stock => 1 */

  var tq = gearTorque(r.rpm, r.gear) * ratio;
  if(r.shiftT > 0) tq *= 0.35;
  if(r.perfectT > 0) tq *= 1.14;                       /* reward for a clean change */
  r.torque = tq;
}

/* ---- public shift triggers ------------------------------------------------
   The dedicated paddle-shifter UI in a later pass wires straight to these.
   Nothing outside the gearbox should touch race.gear.                       */
function shiftUp(){
  if(!race || race.state === 'done' || paused) return false;
  if(save.settings.transmission !== 'manual') return false;
  return setGear(race, race.gear + 1, true);
}
function shiftDown(){
  if(!race || race.state === 'done' || paused) return false;
  if(save.settings.transmission !== 'manual') return false;
  return setGear(race, race.gear - 1, true);
}

/* ------------------------------------------------------------------ race */
var race = null;
var paused = false;

function startRace(stageId){
  var st = stageDef(stageId);
  var track = buildTrack(st);
  var stats = computeStats(save.current);
  var cs = curCarSave();
  var n0 = track.nodes[0];
  race = {
    stage: st, track: track, stats: stats,
    car: {
      x:n0.x, y:n0.y, a:n0.a, vx:0, vy:0, fwd:0, lat:0,
      node:0, steer:0, damage:0, wheelSpin:0, stuck:0
    },
    sprites: [
      getCarSprite(save.current, cs.paint, cs.livery, 0, 3),
      getCarSprite(save.current, cs.paint, cs.livery, 1, 3),
      getCarSprite(save.current, cs.paint, cs.livery, 2, 3)
    ],
    gear:1, rpm:0, torque:1, shiftT:0, perfectT:0, perfectFlash:0,
    spans: carSpans(save.current), finalDrive: gearingOf(save.current).final,
    t:0, state:'countdown', countdown:3.2, collisions:0, hardHits:0,
    noteIdx:0, note:null, noteTimer:0,
    particles:[], skids:[], shake:0,
    camX:n0.x, camY:n0.y, camA:n0.a, camZoom:1,
    surface: st.surface, offtrack:false, progress:0,
    splitIdx:0, best: save.stages[st.id].best,
    finishTime:0
  };
  paused = false;
  document.getElementById('h-stage').textContent = st.name;
  document.getElementById('t-target').textContent = 'TGT ' + fmtTime(track.targetTime);
  showScreen(null);
  document.getElementById('hud').classList.remove('hidden');
  document.getElementById('controls').classList.remove('hidden');
  document.getElementById('tilt-bar').classList.toggle('hidden', save.settings.control !== 'tilt');
  document.getElementById('p-gas').classList.toggle('hidden', save.settings.autoGas);
  resetHudControls();
  audioKick();
  bigMsg('3');
}

/* --------------------------------------------------------- physics step */
function stepRace(dt){
  var r = race, c = r.car, S = r.stats;

  /* ---- countdown ---- */
  if(r.state==='countdown'){
    var before = Math.ceil(r.countdown);
    r.countdown -= dt;
    var after = Math.ceil(r.countdown);
    if(after !== before){
      if(after===2){ bigMsg('2'); audioBeep(520,0.12); }
      else if(after===1){ bigMsg('1'); audioBeep(520,0.12); }
      else if(after<=0){ bigMsg('GO!'); audioBeep(900,0.3); }
    }
    if(r.countdown<=0){ r.state='run'; setTimeout(function(){ bigMsg(''); }, 500); }
  } else if(r.state==='run'){
    r.t += dt;
  }

  var driving = (r.state==='run');

  /* ---- steering input ---- */
  var target = 0;
  if(save.settings.control==='tilt' && input.tiltOn){
    var tv = (input.tiltRaw - input.tiltZero) * save.settings.tiltSens;
    var dz = 3;
    if(Math.abs(tv) < dz) tv = 0; else tv = tv - Math.sign(tv)*dz;
    target = clamp(tv/22, -1, 1);
    document.getElementById('tilt-ind').style.left = (50 + target*46) + '%';
  } else {
    if(input.left) target -= 1;
    if(input.right) target += 1;
  }
  var rate = (Math.abs(target) > Math.abs(c.steer)) ? 5.2 : 8.0;
  c.steer += clamp(target - c.steer, -rate*dt, rate*dt);

  /* ---- where are we ---- */
  var q = trackQuery(r.track, c.x, c.y, c.node);
  c.node = q.node;
  var offtrack = !q.onTrack;
  var surfId = offtrack ? null : q.surface;
  var surf = offtrack ? r.track.off : SURFACES[surfId];
  r.surface = offtrack ? r.track.off.name : SURFACES[surfId].name;
  r.offtrack = offtrack;
  var gripMul = offtrack ? (S.grip.gravel||1)*0.85 : (S.grip[surfId] || 1);
  var grip = surf.grip * gripMul;
  var roll = surf.roll;

  /* ---- longitudinal ---- */
  var dirX = Math.sin(c.a), dirY = -Math.cos(c.a);
  var rgtX = Math.cos(c.a), rgtY = Math.sin(c.a);
  c.fwd = c.vx*dirX + c.vy*dirY;
  c.lat = c.vx*rgtX + c.vy*rgtY;

  var dmgPenalty = 1 - Math.min(0.20, c.damage/100*0.20);
  var topSpeed = S.topSpeed * dmgPenalty * (offtrack ? 0.62 : 1);
  var accel = S.accel * dmgPenalty;

  var gas = driving && (save.settings.autoGas ? !input.hbrake : input.gas);
  var hb = driving && input.hbrake;

  updateGearbox(r, Math.abs(c.fwd), topSpeed, dt);

  if(gas && !hb){
    /* the power curve runs out above the rated top speed, so rolling
       resistance settles the car right around its quoted figure */
    /* top gear redlines at finalDrive x the car's rated speed, so taller
       gearing raises the ceiling and shorter gearing lowers it */
    var head = 1 - c.fwd/(topSpeed*r.finalDrive*1.35);
    if(head < 0) head = 0;
    c.fwd += accel * head * dt * (offtrack ? 0.70 : 1) * r.torque;
    c.wheelSpin = clamp(c.wheelSpin + (1.2 - grip)*dt*2.2, 0, 1);
  } else {
    c.wheelSpin *= Math.pow(0.05, dt);
  }
  if(hb){
    /* handbrake: locks the rears — big slowdown, and the tail comes round */
    if(c.fwd > 0) c.fwd = Math.max(0, c.fwd - 300*dt);
    else if(driving && c.fwd > -70) c.fwd -= 70*dt;   /* reverse, to recover */
  }
  /* rolling resistance + aero */
  c.fwd -= c.fwd * roll * 0.30 * dt;
  c.fwd -= c.fwd * Math.abs(c.fwd) * 0.00022 * dt;
  /* sliding sideways scrubs speed — the rally trade-off */
  if(Math.abs(c.fwd) > 1){
    var scrub = Math.abs(c.lat) * 0.55 * dt;
    c.fwd -= Math.min(Math.abs(c.fwd), scrub) * Math.sign(c.fwd);
  }
  if(!driving && r.state==='countdown'){ c.fwd *= Math.pow(0.02, dt); }

  /* ---- steering / yaw ---- */
  var spd = Math.abs(c.fwd);
  var speedFrac = clamp(spd/260, 0, 1.4);
  var grab = clamp(spd/45, 0, 1);
  var handFactor = S.handling/46;
  /* how hard the fronts can bite depends on the surface and the tyres —
     this is what makes ice feel like ice and gravel tyres worth buying */
  var bite = clamp(0.52 + 0.48*grip, 0.48, 1.32);
  var yawRate = c.steer * 2.05 * handFactor * bite * grab / (1 + spd/430);
  if(hb) yawRate *= 1.62;
  if(offtrack) yawRate *= 0.72;
  c.a += yawRate * dt * (c.fwd < -1 ? -1 : 1);

  /* ---- lateral grip / drift ---- */
  var latGrip = grip * (hb ? 0.26 : 1) * (1 - c.wheelSpin*0.28);
  var latK = 4.4 * latGrip;
  c.lat *= Math.exp(-latK*dt);
  /* the car is pushed sideways as it rotates — that is what makes the slide */
  c.lat -= yawRate * c.fwd * dt * (1.0 - Math.min(0.55, latGrip*0.32));

  /* limit total slide so it never becomes uncontrollable */
  if(Math.abs(c.lat) > 240) c.lat = 240*Math.sign(c.lat);

  /* recompose */
  dirX = Math.sin(c.a); dirY = -Math.cos(c.a);
  rgtX = Math.cos(c.a); rgtY = Math.sin(c.a);
  c.vx = dirX*c.fwd + rgtX*c.lat;
  c.vy = dirY*c.fwd + rgtY*c.lat;
  c.x += c.vx*dt; c.y += c.vy*dt;

  /* ---- off-track soft wall a long way out, so you can't leave the world ---- */
  if(Math.abs(q.lateral) > q.hw + 420){
    var nx = Math.cos(q.ang), ny = Math.sin(q.ang);
    var over = Math.abs(q.lateral) - (q.hw + 420);
    var sgn = Math.sign(q.lateral);
    c.x -= nx*over*sgn; c.y -= ny*over*sgn;
    c.fwd *= 0.55; c.lat *= 0.2;
  }

  /* ---- collisions ---- */
  checkCollisions(r, dt);

  /* ---- beached in a ditch? drop back onto the road, the lost time is
         punishment enough in a time trial ---- */
  if(offtrack && Math.abs(c.fwd) < 34) c.stuck += dt;
  else if(Math.abs(q.lateral) > q.hw + 190) c.stuck += dt*0.8;
  else c.stuck = Math.max(0, c.stuck - dt*1.6);
  if(driving && c.stuck > 2.2) respawn(r, q);

  /* ---- particles, skids ---- */
  var slip = Math.min(1, (Math.abs(c.lat)/95 + c.wheelSpin*0.5));
  spawnEffects(r, dt, slip, surf, offtrack);

  /* ---- pacenotes ---- */
  while(r.noteIdx < r.track.notes.length && q.d >= r.track.notes[r.noteIdx].d){
    showNote(r.track.notes[r.noteIdx]);
    r.noteIdx++;
  }
  if(r.noteTimer > 0){
    r.noteTimer -= dt;
    if(r.noteTimer<=0) document.getElementById('hud-note').classList.remove('show');
  }

  /* ---- splits ---- */
  r.progress = clamp(q.d / r.track.len, 0, 1);
  if(driving){
    var nextSplit = (r.splitIdx+1)*0.25;
    if(r.progress >= nextSplit && r.splitIdx < 3){
      r.splitIdx++;
      var expect = r.track.targetTime * nextSplit;
      showSplit(r.t - expect);
    }
  }

  /* ---- camera ---- */
  var look = clamp(spd*0.32, 0, 125);
  var tx = c.x + dirX*look, ty = c.y + dirY*look;
  var k = 1 - Math.pow(0.0025, dt);
  r.camX = lerp(r.camX, tx, k);
  r.camY = lerp(r.camY, ty, k);
  r.camA += angDiff(c.a, r.camA) * (1 - Math.pow(0.0009, dt));
  var wantZoom = 1 - clamp(spd/S.topSpeed,0,1)*0.18;
  r.camZoom = lerp(r.camZoom, wantZoom, 1-Math.pow(0.06,dt));
  if(r.shake > 0) r.shake = Math.max(0, r.shake - dt*2.6);

  /* ---- audio ---- */
  audioEngine(r.rpm, gas?1:0.25, slip*(spd>25?1:0), driving || r.state==='countdown');

  /* ---- finish ---- */
  if(driving && q.d >= r.track.len - 24){
    r.state = 'done'; r.finishTime = r.t;
    bigMsg('FINISH');
    audioBeep(760,0.4);
    setTimeout(finishRace, 900);
  }

  updateHUD(r);
}

function respawn(r, q){
  var c = r.car, nodes = r.track.nodes;
  var nd = nodes[Math.min(nodes.length-1, q.node)];
  c.x = nd.x; c.y = nd.y; c.a = nd.a;
  c.fwd = 48; c.lat = 0;
  c.vx = Math.sin(nd.a)*48; c.vy = -Math.cos(nd.a)*48;
  c.stuck = 0; c.steer = 0;
  r.gear = 1; r.shiftT = 0; r.perfectT = 0;
  r.camX = nd.x; r.camY = nd.y; r.camA = nd.a;
  r.recoveries = (r.recoveries||0) + 1;
  bigMsg('RECOVERED');
  if(bigTimer) clearTimeout(bigTimer);
  bigTimer = setTimeout(function(){ bigMsg(''); }, 1000);
  audioBeep(300, 0.2);
}

function checkCollisions(r, dt){
  var c = r.car, b = r.track.buckets;
  var CR = 16;
  for(var i=c.node-4;i<=c.node+5;i++){
    var arr = b[i]; if(!arr) continue;
    for(var j=0;j<arr.length;j++){
      var p = arr[j];
      if(p.hit > 0){ p.hit -= dt; }
      var dx = c.x-p.x, dy = c.y-p.y;
      var rr = p.r + CR;
      var d2 = dx*dx+dy*dy;
      if(d2 >= rr*rr || d2 < 1e-4) continue;
      var d = Math.sqrt(d2);
      var nx = dx/d, ny = dy/d;
      c.x = p.x + nx*rr; c.y = p.y + ny*rr;
      var vn = c.vx*nx + c.vy*ny;
      if(vn < 0){
        var impact = -vn;
        c.vx -= nx*vn*1.55; c.vy -= ny*vn*1.55;
        var loss = clamp(impact/240, 0, 1);
        var dirX = Math.sin(c.a), dirY = -Math.cos(c.a);
        var rgtX = Math.cos(c.a), rgtY = Math.sin(c.a);
        c.fwd = (c.vx*dirX + c.vy*dirY) * (1 - 0.55*loss);
        c.lat = (c.vx*rgtX + c.vy*rgtY) * 0.5;
        c.vx = dirX*c.fwd + rgtX*c.lat;
        c.vy = dirY*c.fwd + rgtY*c.lat;
        if(p.hit <= 0 && impact > 34){
          r.collisions++;
          if(impact > 110) r.hardHits++;
          c.damage = clamp(c.damage + impact*0.055, 0, 100);
          r.shake = clamp(0.35 + impact/300, 0, 1.1);
          audioThud(clamp(impact/240,0,1));
          for(var k=0;k<8;k++) r.particles.push({
            x:c.x, y:c.y, vx:(Math.random()-0.5)*140, vy:(Math.random()-0.5)*140,
            life:0.5, max:0.5, size:3+Math.random()*3, col:'#d8c79a', kind:'debris'
          });
          p.hit = 0.7;
        }
      }
    }
  }
}

function spawnEffects(r, dt, slip, surf, offtrack){
  var c = r.car, spd = Math.abs(c.fwd);
  r.dustAcc = (r.dustAcc||0) + dt;
  var rate = (slip>0.24 || offtrack) && spd > 30 ? 0.018 : 0.09;
  if(spd > 12 && r.dustAcc > rate){
    r.dustAcc = 0;
    var back = -30, side = 15;
    var dirX = Math.sin(c.a), dirY = -Math.cos(c.a);
    var rgtX = Math.cos(c.a), rgtY = Math.sin(c.a);
    for(var s=-1;s<=1;s+=2){
      var px = c.x + dirX*back + rgtX*side*s;
      var py = c.y + dirY*back + rgtY*side*s;
      r.particles.push({
        x:px, y:py,
        vx:-dirX*spd*0.16 + (Math.random()-0.5)*45,
        vy:-dirY*spd*0.16 + (Math.random()-0.5)*45,
        life:0.55+Math.random()*0.4, max:0.95,
        size:4+Math.random()*6+slip*6, col:surf.dust, kind:'dust'
      });
    }
    if(slip > 0.3 && !offtrack){
      r.skids.push({ x:c.x - Math.sin(c.a)*28 + Math.cos(c.a)*15, y:c.y + Math.cos(c.a)*28 + Math.sin(c.a)*15, a:c.a, al:Math.min(0.5,slip*0.5) });
      r.skids.push({ x:c.x - Math.sin(c.a)*28 - Math.cos(c.a)*15, y:c.y + Math.cos(c.a)*28 - Math.sin(c.a)*15, a:c.a, al:Math.min(0.5,slip*0.5) });
      if(r.skids.length > 900) r.skids.splice(0, 200);
    }
  }
  /* engine smoke when damaged */
  if(c.damage > 48){
    r.smokeAcc = (r.smokeAcc||0) + dt;
    if(r.smokeAcc > (c.damage>78 ? 0.045 : 0.1)){
      r.smokeAcc = 0;
      r.particles.push({
        x:c.x + Math.sin(c.a)*24, y:c.y - Math.cos(c.a)*24,
        vx:(Math.random()-0.5)*24, vy:(Math.random()-0.5)*24 - 12,
        life:1.1, max:1.1, size:7+Math.random()*7,
        col: c.damage>78 ? '#3a3a3a' : '#8d8d8d', kind:'smoke'
      });
    }
  }
  for(var i=r.particles.length-1;i>=0;i--){
    var p = r.particles[i];
    p.life -= dt;
    if(p.life<=0){ r.particles.splice(i,1); continue; }
    p.x += p.vx*dt; p.y += p.vy*dt;
    p.vx *= Math.pow(0.12,dt); p.vy *= Math.pow(0.12,dt);
    if(p.kind==='smoke'){ p.size += dt*13; }
  }
}

/* --------------------------------------------------------------- render */
function renderRace(){
  var r = race, c = r.car;
  var g = ctx;
  var W = view.w, H = view.h;
  var theme = r.track.theme;
  var off = r.track.off;

  g.fillStyle = off.color;
  g.fillRect(0,0,W,H);

  var scale = (H/470) / r.camZoom;
  var shakeX = 0, shakeY = 0;
  if(r.shake>0){ shakeX = (Math.random()-0.5)*r.shake*16; shakeY = (Math.random()-0.5)*r.shake*16; }

  /* Framing. The camera aims at a point ahead of the car, so the car is
     drawn that far behind the focal point — down the screen — and the
     faster you go the lower it rides. Left at a fixed 0.62 it disappears
     under the dash. So: work out where the car will actually land (the same
     rotation the transform below applies), and lift the focal point only as
     far as it takes to keep it above the panel, never past 0.48 so the road
     ahead stays open. At low speed this is exactly the old framing. */
  var focal = H*0.62;
  var dxc = c.x - r.camX, dyc = c.y - r.camY;
  var carDrop = (dyc*Math.cos(r.camA) - dxc*Math.sin(r.camA)) * scale;
  var deck = H - clusterBandH() - CAR_WORLD_LEN*scale*0.55;   /* dash top, less the car */
  if(focal + carDrop > deck) focal = clamp(deck - carDrop, H*0.44, H*0.62);

  g.save();
  g.translate(W/2 + shakeX, focal + shakeY);
  g.scale(scale, scale);
  g.rotate(-r.camA);
  g.translate(-r.camX, -r.camY);

  var viewR = Math.sqrt(W*W + H*H)/2/scale + 90;

  drawGroundDetail(g, r, viewR, theme);
  drawRoad(g, r, viewR);
  drawSkids(g, r, viewR);
  drawParticles(g, r, false);
  drawProps(g, r, viewR, theme);
  drawCar(g, r);
  drawParticles(g, r, true);

  g.restore();

  drawMinimap(g, r, W, H);
}

/* =========================================================================
   GROUND

   The reference floor is a dense mottled carpet, not a sparse scatter: fine
   grain at a few units across, over broader patches, over a base. Drawing
   that per frame is impossible — the old version already gave up and drew
   nothing at all once the visible cell count passed 1400, so a wide viewport
   at low zoom went flat with no fallback.

   So it is baked once into a seamless tile and laid down as a pattern: one
   fillRect a frame instead of up to 1400 alpha-switched rects, and it can be
   as dense as the reference without costing anything. Blobs near an edge are
   repeated at the eight neighbouring offsets so the tile joins invisibly.
   ========================================================================= */
var GROUND_TONES = {
  forest:   { base:'#2c3d1e',
              broad:['#26351a','#334823','#1f2c16'],
              fine: ['#3a5124','#213017','#425c28','#1a2612'] },
  mountain: { base:'#47473f',
              broad:['#3f3f38','#515149','#383830'],
              fine: ['#585850','#3a3a33','#61615a','#33332d'] },
  snowpass: { base:'#e6f0f8',
              broad:['#dae6f1','#f2f8fd','#cfdeeb'],
              fine: ['#ffffff','#d3e1ee','#f7fbfe','#c6d7e6'] }
};
var GROUND_TILE = 160, groundPatCache = {};

function groundPattern(g, theme){
  if(groundPatCache[theme]) return groundPatCache[theme];
  var t = GROUND_TONES[theme] || GROUND_TONES.forest;
  var T = GROUND_TILE;
  var c = document.createElement('canvas');
  c.width = T; c.height = T;
  var q = c.getContext('2d');
  q.fillStyle = t.base; q.fillRect(0,0,T,T);

  var rand = mulberry(theme.charCodeAt(0)*7919 + 31);
  var put = function(x, y, w, h, col){
    q.fillStyle = col;
    for(var dx=-1; dx<=1; dx++) for(var dy=-1; dy<=1; dy++)
      q.fillRect(x + dx*T, y + dy*T, w, h);
  };
  var i, w, h;
  for(i=0;i<70;i++){                       /* broad patches */
    w = 16 + rand()*40; h = 12 + rand()*32;
    put(rand()*T, rand()*T, w, h, t.broad[(rand()*t.broad.length)|0]);
  }
  for(i=0;i<900;i++){                      /* fine grain */
    w = 2 + rand()*5; h = 2 + rand()*4;
    put(rand()*T, rand()*T, w, h, t.fine[(rand()*t.fine.length)|0]);
  }
  groundPatCache[theme] = g.createPattern(c, 'repeat');
  return groundPatCache[theme];
}

function drawGroundDetail(g, r, viewR, theme){
  g.fillStyle = groundPattern(g, theme);
  g.fillRect(r.camX - viewR, r.camY - viewR, viewR*2, viewR*2);
}

function drawRoad(g, r, viewR){
  var nodes = r.track.nodes;
  /* The camera aims ahead of the car, so very little road is ever visible
     behind it. Detailing sixty nodes back was work thrown away. */
  var lo = Math.max(0, r.car.node - 22);
  var hi = Math.min(nodes.length-1, r.car.node + Math.ceil(viewR/NODE_STEP) + 24);

  /* Edge treatment. The reference has no hard line where the road stops: a
     darker gravel shoulder runs outside the driving surface, and grass
     breaks over the boundary in clumps. The old single 3.5px stroke read as
     a drawn outline rather than as ground meeting ground. */
  var band = function(i, end, out, col){
    var k, nd, nx, ny;
    g.beginPath();
    for(k=i;k<=end;k++){
      nd = nodes[k]; nx = Math.cos(nd.a); ny = Math.sin(nd.a);
      if(k===i) g.moveTo(nd.x - nx*(nd.hw+out), nd.y - ny*(nd.hw+out));
      else      g.lineTo(nd.x - nx*(nd.hw+out), nd.y - ny*(nd.hw+out));
    }
    for(k=end;k>=i;k--){
      nd = nodes[k]; nx = Math.cos(nd.a); ny = Math.sin(nd.a);
      g.lineTo(nd.x + nx*(nd.hw+out), nd.y + ny*(nd.hw+out));
    }
    g.closePath();
    g.fillStyle = col; g.fill();
  };

  var i = lo;
  while(i < hi){
    var surfId = nodes[i].s;
    var j = i;
    while(j < hi && nodes[j+1] && nodes[j+1].s === surfId) j++;
    var end = Math.min(hi, j+1);
    var S = SURFACES[surfId];

    band(i, end, 15, shade(S.color, -0.10));      /* outer shoulder */
    band(i, end, 6,  shade(S.color, -0.045));     /* inner shoulder */
    band(i, end, 0,  S.color);                    /* driving surface */

    /* Surface detail. Every fleck used to set fillStyle itself, and two of
       those styles were built by shade() inside the loop — a string parse
       and a concat per rect, thousands a frame. The colours are hoisted out
       of the run and each is laid down as one batched path instead. */
    var t, nd3, nxx, nyy, q, lat, sz, b, m, cnt, u;
    var gt = GROUND_TONES[r.track.stage.theme] || GROUND_TONES.forest;
    var cRut = shade(S.color, -0.035), cDeep = shade(S.color, -0.07);
    var cShoul = shade(S.color, -0.085);
    var lanes = [
      { col:S.edge,    p:[] }, { col:S.color2, p:[] }, { col:cDeep,  p:[] },
      { col:cShoul,    p:[] },
      { col:gt.broad[0], p:[] }, { col:gt.broad[1], p:[] }, { col:gt.broad[2], p:[] },
      { col:gt.fine[0],  p:[] }, { col:gt.fine[1],  p:[] },
      { col:gt.fine[2],  p:[] }, { col:gt.fine[3],  p:[] }
    ];
    var push = function(k, x, y, w, h){ lanes[k].p.push(x, y, w, h); };

    g.fillStyle = cRut;                            /* ruts, one path */
    g.beginPath();
    for(t=i;t<end;t++){
      nd3 = nodes[t]; nxx = Math.cos(nd3.a); nyy = Math.sin(nd3.a);
      for(q=-1;q<=1;q+=2){
        lat = q*nd3.hw*(0.30 + rnd2(t,q,37)*0.10);
        g.rect(nd3.x + nxx*lat - nd3.hw*0.09, nd3.y + nyy*lat - 2,
               nd3.hw*0.18, NODE_STEP + 4);
      }
    }
    g.fill();

    for(t=i;t<end;t++){
      nd3 = nodes[t]; nxx = Math.cos(nd3.a); nyy = Math.sin(nd3.a);
      for(q=0;q<5;q++){                            /* surface grain */
        lat = (rnd2(t,q,3)*2-1)*nd3.hw*0.97;
        sz = 2 + rnd2(t,q,5)*9;
        push(rnd2(t,q,11) < 0.38 ? 0 : (rnd2(t,q,13) < 0.5 ? 1 : 2),
             nd3.x + nxx*lat, nd3.y + nyy*lat, sz, sz);
      }
      for(q=-1;q<=1;q+=2){
        for(b=0;b<6;b++){                          /* boundary interleave */
          u = rnd2(t,q*11+b,59);
          lat = q*(nd3.hw - 8 + u*46);
          sz = 3 + rnd2(t,q*11+b,61)*8;
          push(u < 0.42 ? 3
             : (u < 0.58 ? 4 + ((rnd2(t,b,71)*3)|0)
                         : 7 + ((rnd2(t,b,73)*4)|0)),
               nd3.x + nxx*lat, nd3.y + nyy*lat, sz, sz*0.9);
        }
        cnt = (rnd2(t,q,17)*4.2)|0;                /* grass clumps over the edge */
        for(m=0;m<cnt;m++){
          lat = q*(nd3.hw - 9 + rnd2(t,q*7+m,19)*30);
          sz = 3 + rnd2(t,q*7+m,23)*10;
          push(7 + ((rnd2(t,q*7+m,29)*4)|0),
               nd3.x + nxx*lat + (rnd2(t,m,31)-0.5)*10,
               nd3.y + nyy*lat + (rnd2(t,m,43)-0.5)*10, sz, sz*0.85);
        }
      }
    }
    for(q=0;q<lanes.length;q++){
      var pts = lanes[q].p;
      if(!pts.length) continue;
      g.fillStyle = lanes[q].col;
      g.beginPath();
      for(m=0;m<pts.length;m+=4) g.rect(pts[m], pts[m+1], pts[m+2], pts[m+3]);
      g.fill();
    }

    i = end;
  }

  drawBanner(g, nodes[0], '#f2f2ea', '#20242a');
  drawBanner(g, nodes[nodes.length-1], '#f2f2ea', '#20242a');
}

function drawBanner(g, nd, ca, cb){
  var nx = Math.cos(nd.a), ny = Math.sin(nd.a);
  var dx = Math.sin(nd.a), dy = -Math.cos(nd.a);
  var n = 10, w = nd.hw*2/n, depth = 16;
  for(var i=0;i<n;i++){
    var lat = -nd.hw + i*w;
    for(var k=0;k<2;k++){
      g.fillStyle = ((i+k)%2===0) ? ca : cb;
      var bx = nd.x + nx*lat + dx*(k*depth/2);
      var by = nd.y + ny*lat + dy*(k*depth/2);
      g.save(); g.translate(bx,by); g.rotate(nd.a);
      g.fillRect(0, -depth/2, w+0.6, depth/2+0.6);
      g.restore();
    }
  }
}

function drawSkids(g, r, viewR){
  g.fillStyle = 'rgba(24,20,16,.30)';
  for(var i=0;i<r.skids.length;i++){
    var s = r.skids[i];
    if(Math.abs(s.x-r.camX) > viewR || Math.abs(s.y-r.camY) > viewR) continue;
    g.save(); g.translate(s.x,s.y); g.rotate(s.a);
    g.globalAlpha = s.al;
    g.fillRect(-3.5, -5, 7, 10);
    g.restore();
  }
  g.globalAlpha = 1;
}

function drawParticles(g, r, above){
  for(var i=0;i<r.particles.length;i++){
    var p = r.particles[i];
    var isSmoke = p.kind==='smoke';
    if(isSmoke !== above) continue;
    var a = p.life/p.max;
    g.globalAlpha = clamp(a*(isSmoke?0.55:0.7),0,1);
    g.fillStyle = p.col;
    g.fillRect(p.x-p.size/2, p.y-p.size/2, p.size, p.size);
  }
  g.globalAlpha = 1;
}

function drawProps(g, r, viewR, theme){
  var byNode = r.track.byNode;
  var lo = Math.max(0, r.car.node - 50);
  var hi = Math.min(byNode.length-1, r.car.node + Math.ceil(viewR/NODE_STEP) + 20);
  for(var i=lo;i<=hi;i++){
    var arr = byNode[i]; if(!arr) continue;
    for(var j=0;j<arr.length;j++){
      var p = arr[j];
      if(Math.abs(p.x-r.camX) > viewR+40 || Math.abs(p.y-r.camY) > viewR+40) continue;
      drawProp(g, p, theme);
    }
  }
}

function drawCar(g, r){
  var c = r.car;
  var tier = c.damage>72 ? 2 : (c.damage>34 ? 1 : 0);
  var sp = r.sprites[tier];
  /* the car occupies a fixed footprint in world units, so redrawing the
     sprite on a different pixel grid never changes how big it drives */
  var wh = CAR_WORLD_LEN, ww = wh * sp.pw / sp.ph;

  /* Shadow. The silhouette rotates with the body, but the offset that throws
     it must not: the sun is fixed in the world, not bolted to the roof. It
     used to be filled inside the rotate, so the light source spun with the
     car and was only ever right when the car pointed due north. Three
     stacked passes give the soft edge the reference has. */
  var sx = wh*0.085, sy = wh*0.115, k;
  for(k=2;k>=0;k--){
    g.save();
    g.translate(c.x + sx, c.y + sy);
    g.rotate(c.a);
    var sp2 = 1 + k*0.055;
    roundPath(g, -ww/2*sp2, -wh/2*sp2, ww*sp2, wh*sp2, wh*0.10);
    g.fillStyle = 'rgba(0,0,0,' + (0.13 + (2-k)*0.055).toFixed(3) + ')';
    g.fill();
    g.restore();
  }

  g.save();
  g.translate(c.x, c.y);
  g.rotate(c.a);
  /* the shell is vector art against chunky terrain, exactly as the reference
     reads, so it is the one thing in the world drawn with smoothing on */
  g.imageSmoothingEnabled = true;
  g.drawImage(sp.canvas, -ww/2, -wh/2, ww, wh);
  g.imageSmoothingEnabled = false;
  g.restore();
}

function drawMinimap(g, r, W, H){
  var nodes = r.track.nodes;
  var mw = clamp(Math.round(Math.min(W*0.19, H*0.30)), 84, 190), mh = mw;
  var pad = Math.max(6, Math.round(mw*0.07));
  var top = Math.round(H*0.055) + 34;
  var x0 = W - mw - pad - 8, y0 = top;
  if(!r.mapBox){
    var minx=1e9,maxx=-1e9,miny=1e9,maxy=-1e9;
    for(var i=0;i<nodes.length;i+=4){
      if(nodes[i].x<minx)minx=nodes[i].x; if(nodes[i].x>maxx)maxx=nodes[i].x;
      if(nodes[i].y<miny)miny=nodes[i].y; if(nodes[i].y>maxy)maxy=nodes[i].y;
    }
    r.mapBox = {minx:minx,maxx:maxx,miny:miny,maxy:maxy};
  }
  var bb = r.mapBox;
  var sx = mw/Math.max(1,(bb.maxx-bb.minx)), sy = mh/Math.max(1,(bb.maxy-bb.miny));
  var s = Math.min(sx,sy)*0.84;
  var ox = x0 + mw/2 - ((bb.minx+bb.maxx)/2)*s;
  var oy = y0 + mh/2 - ((bb.miny+bb.maxy)/2)*s;

  g.save();
  /* same glass-behind-a-cool-grey-bezel treatment as the DOM overlays */
  var rr = Math.max(5, mw*0.055);
  roundPath(g, x0 - pad, y0 - pad, mw + pad*2, mh + pad*2, rr);
  g.fillStyle = 'rgba(8,10,9,.86)'; g.fill();
  g.lineWidth = 2; g.strokeStyle = 'rgba(152,166,178,.60)'; g.stroke();

  g.strokeStyle = 'rgba(226,234,240,.88)';
  g.lineWidth = Math.max(1, mw*0.014);
  g.lineJoin = 'round'; g.lineCap = 'round';
  g.beginPath();
  for(var k=0;k<nodes.length;k+=6){
    var px = ox+nodes[k].x*s, py = oy+nodes[k].y*s;
    if(k===0) g.moveTo(px,py); else g.lineTo(px,py);
  }
  g.stroke();
  var cr = Math.max(2.5, mw*0.035);
  g.fillStyle = '#f0a41c';
  g.fillRect(ox+r.car.x*s-cr, oy+r.car.y*s-cr, cr*2, cr*2);
  g.restore();
}

/* ------------------------------------------------------------------ HUD */
/* the DOM half of the HUD — speed, revs and gear all live on the canvas
   cluster now, which paints itself from updateHudControls each frame */
function updateHUD(r){
  r = r || race;
  document.getElementById('t-time').textContent = fmtTime(r.state==='countdown'?0:r.t);
  document.getElementById('h-prog').style.width = (r.progress*100).toFixed(1)+'%';
  document.getElementById('h-dmg').style.width = r.car.damage.toFixed(0)+'%';
  document.getElementById('h-surf').textContent = r.surface;
}
var bigTimer = null;
function bigMsg(txt){
  var el = document.getElementById('big-msg');
  el.textContent = txt;
  el.classList.toggle('show', !!txt);
}
function showNote(n){
  var el = document.getElementById('hud-note');
  var arrows = { '-1':'↖', '0':'⚠', '1':'↗' };
  document.getElementById('n-arrow').textContent = n.sev>=5 ? (n.dir<0?'↰':'↱') : arrows[String(n.dir)];
  document.getElementById('n-text').textContent = n.text;
  el.classList.toggle('warn', !!n.warn);
  el.classList.add('show');
  race.noteTimer = 2.4;
  audioBeep(n.warn?420:640, 0.07);
}
function showSplit(delta){
  var el = document.getElementById('hud-split');
  el.textContent = fmtDelta(delta);
  el.style.color = delta <= 0 ? 'var(--green)' : 'var(--red)';
  el.classList.add('show');
  setTimeout(function(){ el.classList.remove('show'); }, 2200);
}

/* --------------------------------------------------------------- loop */
var lastT = 0;
function frame(ts){
  requestAnimationFrame(frame);
  var dt = lastT ? (ts-lastT)/1000 : 0.016;
  lastT = ts;
  if(dt > 0.05) dt = 0.05;
  if(race && !paused){
    updateHudControls(dt);
    if(race.state !== 'done') stepRace(dt);
    else { race.shake = Math.max(0, race.shake - dt*2); spawnEffects(race,dt,0,SURFACES[race.stage.surface],false); }
    renderRace();
  } else if(!race){
    if(currentScreen === 'garage') drawGarageScene(dt);
    else if(currentScreen === 'lot') drawLotScene(dt);
    else {
      ctx.fillStyle = '#10150e';
      ctx.fillRect(0,0,view.w,view.h);
    }
  }
}
/* =========================================================================
   SCENES — canvas-drawn backdrops for the garage and the parking lot.

   Both are painted once into a small offscreen canvas at chunky "scene
   pixel" resolution, then blitted up with smoothing off, so they sit at the
   same pixel density as the car sprites. Only the small animated bits (light
   flicker, dust, lamp glow) are redrawn per frame, which keeps these screens
   as cheap as the dark fill they replaced.
   ========================================================================= */

var sceneCache = {};

/* one scene pixel, in CSS px — also the scale the side-view car is drawn at */
function scenePx(){ return clamp(Math.round(view.h/96), 3, 6); }

function sceneLayer(key, w, h, paint){
  var c = sceneCache[key];
  if(!c || c.width !== w || c.height !== h){
    c = document.createElement('canvas');
    c.width = w; c.height = h;
    paint(c.getContext('2d'), w, h);
    sceneCache[key] = c;
  }
  return c;
}
/* rounded fill helper, so everything lands on whole scene pixels */
function R(g,x,y,w,h,col){
  g.fillStyle = col;
  g.fillRect(Math.round(x), Math.round(y), Math.max(1,Math.round(w)), Math.max(1,Math.round(h)));
}

/* ------------------------------------------------------ garage interior */
function paintGarage(g, w, h){
  var floor = Math.round(h*0.66);

  /* --- back wall: corrugated steel with a mid rail --- */
  R(g,0,0,w,floor,'#2b3331');
  for(var x=0;x<w;x+=4) R(g,x,0,2,floor,'#303937');
  R(g,0,0,w,Math.round(h*0.06),'#202725');
  R(g,0,Math.round(h*0.40),w,2,'#232a28');
  R(g,0,floor-3,w,3,'#1b2120');

  /* --- overhead strip lights --- */
  var lights = [0.17,0.45,0.74];
  for(var i=0;i<lights.length;i++){
    var lx = Math.round(w*lights[i]), ly = Math.round(h*0.07);
    R(g,lx-11,ly-2,22,2,'#6a7370');
    R(g,lx-10,ly,20,2,'#fff6d8');
    R(g,lx-10,ly+2,20,1,'#c9b98c');
    /* soft cone down the wall */
    var grd = g.createLinearGradient(0,ly,0,floor);
    grd.addColorStop(0,'rgba(255,244,206,.16)');
    grd.addColorStop(1,'rgba(255,244,206,0)');
    g.fillStyle = grd;
    g.beginPath();
    g.moveTo(lx-10,ly+3); g.lineTo(lx+10,ly+3);
    g.lineTo(lx+26,floor); g.lineTo(lx-26,floor);
    g.closePath(); g.fill();
  }

  /* --- pegboard with tools, left of the bay --- */
  var px0 = Math.round(w*0.03), py0 = Math.round(h*0.16);
  var pw = Math.round(w*0.17), ph = Math.round(h*0.26);
  R(g,px0-1,py0-1,pw+2,ph+2,'#3d3326');
  R(g,px0,py0,pw,ph,'#6d5c40');
  for(var hx=px0+2;hx<px0+pw-1;hx+=3)
    for(var hy=py0+2;hy<py0+ph-1;hy+=3) R(g,hx,hy,1,1,'#4a3f2c');
  /* spanners, hammer, wrench */
  R(g,px0+3,py0+3,2,9,'#c2c7cd');  R(g,px0+2,py0+3,4,2,'#c2c7cd');
  R(g,px0+8,py0+3,2,8,'#aab0b6');  R(g,px0+7,py0+10,4,2,'#aab0b6');
  R(g,px0+13,py0+4,2,7,'#8a6a3f'); R(g,px0+12,py0+3,4,3,'#6f757b');
  R(g,px0+18,py0+3,2,10,'#c2c7cd');R(g,px0+17,py0+12,4,2,'#c2c7cd');
  R(g,px0+3,py0+16,10,2,'#9aa0a6');
  R(g,px0+15,py0+16,6,2,'#9aa0a6');

  /* --- workshop sign --- */
  var sx = Math.round(w*0.24), sy = Math.round(h*0.17);
  R(g,sx,sy,Math.round(w*0.10),Math.round(h*0.09),'#1d2422');
  R(g,sx+1,sy+1,Math.round(w*0.10)-2,Math.round(h*0.09)-2,'#8a5f1a');
  R(g,sx+2,sy+2,Math.round(w*0.10)-4,2,'#ffb432');
  R(g,sx+2,sy+6,Math.round(w*0.10)-7,1,'#ffb432');
  R(g,sx+2,sy+8,Math.round(w*0.10)-5,1,'#d99a24');

  /* --- tyre stack --- */
  var tx = Math.round(w*0.375);
  for(var t=0;t<3;t++){
    var ty = floor - 5 - t*4;
    R(g,tx,ty,13,4,'#191b1d');
    R(g,tx+1,ty+1,11,2,'#242729');
    R(g,tx+4,ty+1,5,2,'#3a3e42');
  }

  /* --- workbench + clutter (mostly behind the UI panel) --- */
  var bx = Math.round(w*0.50), bw = Math.round(w*0.32);
  var by = floor - Math.round(h*0.17);
  R(g,bx,by,bw,3,'#7d6845');
  R(g,bx,by+3,bw,2,'#5c4c32');
  R(g,bx+2,by+5,3,floor-by-5,'#3a3430');
  R(g,bx+bw-5,by+5,3,floor-by-5,'#3a3430');
  R(g,bx+6,by-6,10,6,'#b0392c');           /* toolbox */
  R(g,bx+6,by-6,10,2,'#cf4a3a');
  R(g,bx+10,by-8,2,2,'#6f757b');
  R(g,bx+20,by-5,4,5,'#3f6d4a');           /* oil cans */
  R(g,bx+25,by-4,3,4,'#8a5f1a');
  R(g,bx+31,by-7,6,7,'#5a6168');           /* jack */
  R(g,bx+40,by-4,9,4,'#46504a');

  /* --- roller shutter, far right --- */
  var rx = Math.round(w*0.86);
  R(g,rx,Math.round(h*0.10),w-rx,floor-Math.round(h*0.10),'#3c4348');
  for(var ry=Math.round(h*0.10);ry<floor;ry+=3) R(g,rx,ry,w-rx,1,'#2f353a');
  R(g,rx-2,Math.round(h*0.10),2,floor-Math.round(h*0.10),'#232829');

  /* --- floor --- */
  R(g,0,floor,w,h-floor,'#3a3d3c');
  R(g,0,floor,w,2,'#464a48');
  for(var fy=floor+4;fy<h;fy+=5) R(g,0,fy,w,1,'#343736');

  /* service bay: painted outline under the car */
  var bay0 = Math.round(w*0.04), bay1 = Math.round(w*0.44);
  R(g,bay0,floor,bay1-bay0,h-floor-1,'#414544');
  R(g,bay0,floor,bay1-bay0,1,'#c9b98c');
  R(g,bay0,h-2,bay1-bay0,1,'#c9b98c');
  R(g,bay0,floor,1,h-floor-1,'#c9b98c');
  R(g,bay1-1,floor,1,h-floor-1,'#c9b98c');

  /* oil stains, cracks, drain */
  R(g,Math.round(w*0.30),floor+7,7,3,'#2a2c2b');
  R(g,Math.round(w*0.32),floor+6,3,1,'#2a2c2b');
  R(g,Math.round(w*0.09),h-6,5,2,'#2d2f2e');
  R(g,Math.round(w*0.60),floor+9,9,3,'#2f3231');
  R(g,Math.round(w*0.72),floor+5,12,1,'#333635');
  var dx = Math.round(w*0.49);
  R(g,dx,floor+8,7,4,'#2b2e2d');
  for(var d=0;d<3;d++) R(g,dx+1+d*2,floor+9,1,2,'#4a4e4d');
}

/* ------------------------------------------------------ parking lot */
function paintLot(g, w, h){
  var horizon = Math.round(h*0.42);

  /* --- dusk sky in chunky bands --- */
  var bands = ['#26324a','#31405a','#455169','#6a6273','#96707a','#c4886d','#e0a173'];
  var bh = Math.ceil(horizon/bands.length);
  for(var i=0;i<bands.length;i++) R(g,0,i*bh,w,bh+1,bands[i]);

  /* stars in the upper band */
  for(var s=0;s<26;s++){
    var sx = Math.round(rnd2(s,3,21)*w), sy = Math.round(rnd2(s,7,22)*horizon*0.5);
    R(g,sx,sy,1,1,'rgba(255,255,255,.5)');
  }

  /* --- distant ridge + treeline --- */
  for(var x=0;x<w;x++){
    var ridge = horizon - 4 - Math.round(Math.sin(x*0.06)*2 + rnd2(x,1,9)*2);
    R(g,x,ridge,1,horizon-ridge,'#2b3a3c');
  }
  for(var tx=0;tx<w;tx+=2){
    var th = 3 + Math.round(rnd2(tx,2,11)*4);
    R(g,tx,horizon-th,2,th,'#1d2b23');
  }
  R(g,0,horizon-1,w,2,'#16201b');

  /* --- garage building on the left --- */
  var bw = Math.round(w*0.30), by = Math.round(h*0.12);
  R(g,0,by,bw,horizon-by+3,'#4a4741');
  R(g,0,by,bw,3,'#5d5951');                     /* roof lip */
  R(g,0,by+3,bw,1,'#33312d');
  for(var wy=by+6;wy<horizon;wy+=6) R(g,0,wy,bw,1,'#403d38');
  /* lit sign */
  R(g,Math.round(bw*0.16),by+6,Math.round(bw*0.62),8,'#1d2422');
  R(g,Math.round(bw*0.16)+1,by+7,Math.round(bw*0.62)-2,6,'#8a5f1a');
  R(g,Math.round(bw*0.16)+2,by+8,Math.round(bw*0.62)-4,2,'#ffb432');
  R(g,Math.round(bw*0.16)+2,by+11,Math.round(bw*0.62)-8,1,'#ffd487');
  /* shutter door */
  var dx0 = Math.round(bw*0.20), dw = Math.round(bw*0.55), dy0 = by+18;
  R(g,dx0,dy0,dw,horizon-dy0+3,'#33383c');
  for(var dy=dy0;dy<horizon+3;dy+=3) R(g,dx0,dy,dw,1,'#282c30');
  R(g,dx0-1,dy0,1,horizon-dy0+3,'#22262a');
  R(g,dx0+dw,dy0,1,horizon-dy0+3,'#22262a');
  /* doorway spill on the ground */
  R(g,dx0,horizon+3,dw,3,'rgba(255,200,110,.16)');

  /* --- fence across the back --- */
  for(var fx=bw+3;fx<w;fx+=5) R(g,fx,horizon-7,1,7,'#4c5257');
  R(g,bw+3,horizon-6,w-bw-3,1,'#565c61');
  R(g,bw+3,horizon-3,w-bw-3,1,'#565c61');

  /* --- lamp posts --- */
  var posts = [0.52,0.86];
  for(var pI=0;pI<posts.length;pI++){
    var lx = Math.round(w*posts[pI]);
    R(g,lx,Math.round(h*0.10),2,horizon-Math.round(h*0.10)+2,'#3c4247');
    R(g,lx-3,Math.round(h*0.10),8,3,'#4c5257');
    R(g,lx-2,Math.round(h*0.10)+2,6,2,'#fff2c6');
    var lg = g.createRadialGradient(lx+1,Math.round(h*0.10)+3,1,lx+1,Math.round(h*0.10)+3,Math.round(h*0.22));
    lg.addColorStop(0,'rgba(255,238,190,.20)');
    lg.addColorStop(1,'rgba(255,238,190,0)');
    g.fillStyle = lg;
    g.fillRect(lx-Math.round(h*0.22), Math.round(h*0.10), Math.round(h*0.44), Math.round(h*0.44));
  }

  /* --- kerb, then asphalt --- */
  R(g,0,horizon+3,w,3,'#5a5f55');
  R(g,0,horizon+6,w,h-horizon-6,'#34383b');
  R(g,0,horizon+6,w,1,'#3d4245');
  /* tarmac grain */
  for(var q=0;q<160;q++){
    var gx = Math.round(rnd2(q,5,31)*w), gy = horizon+7+Math.round(rnd2(q,9,32)*(h-horizon-8));
    R(g,gx,gy,1,1, rnd2(q,11,33) < 0.5 ? '#3a3e41' : '#2e3235');
  }
  /* parking bay lines, splayed slightly for perspective */
  var lotTop = horizon+9, lotBot = h-2;
  for(var b=0;b<=3;b++){
    var f = b/3;
    var xt = Math.round(w*(0.050 + f*0.300));
    var xb = Math.round(w*(0.006 + f*0.329));
    for(var yy=lotTop;yy<=lotBot;yy++){
      var t2 = (yy-lotTop)/(lotBot-lotTop);
      R(g, Math.round(xt+(xb-xt)*t2), yy, 1, 1, 'rgba(214,206,178,.55)');
    }
  }
  R(g,0,lotTop-1,w,1,'rgba(214,206,178,.35)');
  /* puddles */
  R(g,Math.round(w*0.20),h-7,10,3,'rgba(120,150,170,.22)');
  R(g,Math.round(w*0.66),h-5,7,2,'rgba(120,150,170,.18)');
}

/* --------------------------------------------------------- scene draw */
var sceneT = 0;

function drawSceneBackdrop(kind, paint){
  var W = view.w, H = view.h, px = scenePx();
  var sw = Math.ceil(W/px), sh = Math.ceil(H/px);
  var bg = sceneLayer(kind+'|'+sw+'x'+sh, sw, sh, paint);
  ctx.imageSmoothingEnabled = false;
  ctx.drawImage(bg, 0, 0, sw*px, sh*px);
  return { px:px, sw:sw, sh:sh };
}

/* the car stands in the service bay, on the painted floor */
function garageCarBox(){
  var px = scenePx(), sh = Math.ceil(view.h/px);
  var def = carDef(shopCarId()), spec = CAR_SIDE[def.sprite];
  var floorPx = Math.round(sh*0.66)*px;
  var w = spec.gw*px, h = spec.gh*px;
  var cx = Math.round(view.w*0.235);
  return { x: Math.round((cx - w/2)/px)*px, y: floorPx - spec.ground*px,
           w: w, h: h, px: px, spec: spec };
}

function drawGarageScene(dt){
  var s = drawSceneBackdrop('garage', paintGarage);
  sceneT += dt;

  /* the car itself, from the Pass 1 side-view sprite. Sprites are cached by
     their option key, so a preview costs one render on the tap and nothing
     per frame after that. */
  var box = garageCarBox();
  var carId = shopCarId();
  var sp = getCarSide(carId, carSideOpts(carId, { scale:box.px }));
  ctx.drawImage(sp.canvas, box.x, box.y);

  /* strip light flicker over the bay, and slow dust in the light */
  var flick = 0.05 + 0.035*Math.sin(sceneT*2.1) + (Math.random()<0.02 ? 0.05 : 0);
  ctx.fillStyle = 'rgba(255,244,206,'+flick.toFixed(3)+')';
  ctx.fillRect(0, 0, view.w*0.5, view.h*0.72);
  for(var i=0;i<16;i++){
    var dxp = (rnd2(i,1,41)*view.w*0.55 + sceneT*(6+rnd2(i,2,42)*10)) % (view.w*0.55);
    var dyp = (rnd2(i,3,43)*view.h*0.55 + Math.sin(sceneT*0.6+i)*7) % (view.h*0.6);
    ctx.fillStyle = 'rgba(255,246,214,.30)';
    ctx.fillRect(Math.round(dxp), Math.round(dyp+view.h*0.06), 2, 2);
  }
}

function drawLotScene(dt){
  drawSceneBackdrop('lot', paintLot);
  sceneT += dt;
  /* lamp shimmer */
  var a = 0.03 + 0.02*Math.sin(sceneT*1.6);
  ctx.fillStyle = 'rgba(255,226,170,'+a.toFixed(3)+')';
  ctx.fillRect(0, 0, view.w, view.h);
}

/* =========================================================================
   UI — screens, stage select, garage, parking lot, settings, results
   ========================================================================= */

var SCREENS = ['menu','stages','garage','lot','settings','results'];
var currentScreen = 'menu';

var screenTimers = {};
function showScreen(name){
  /* leaving the garage at all — BACK, parking lot, starting a stage — counts
     as cancelling: the preview is dropped and nothing was ever charged */
  if(name !== 'garage') clearPreview();
  for(var i=0;i<SCREENS.length;i++){
    var id = SCREENS[i], el = document.getElementById('screen-'+id);
    clearTimeout(screenTimers[id]);
    if(id === name){
      el.classList.remove('hidden');
      void el.offsetWidth;                 /* commit the un-hide before fading in */
      el.classList.add('on');
    } else if(!el.classList.contains('hidden')){
      el.classList.remove('on');
      screenTimers[id] = setTimeout(function(e){
        return function(){ e.classList.add('hidden'); };
      }(el), 200);
    }
  }
  currentScreen = name;
  var racing = (name === null);
  document.getElementById('hud').classList.toggle('hidden', !racing);
  document.getElementById('controls').classList.toggle('hidden', !racing);
  if(name && name !== 'results'){
    if(race){ race = null; audioStopAll(); }
    paused = false;
    document.getElementById('pause-overlay').classList.add('hidden');
  }
  if(name==='menu') renderMenu();
  if(name==='stages') renderStages();
  if(name==='garage') renderGarage();
  if(name==='lot') renderLot();
  if(name==='settings') renderSettings();
}

function refreshMoney(){
  var m = fmtMoney(save.money);
  document.getElementById('menu-money').textContent = m;
  document.getElementById('stages-money').textContent = m;
  document.getElementById('garage-money').textContent = m;
  document.getElementById('lot-money').textContent = m;
}

/* ------------------------------------------------------------- menu */
function renderMenu(){
  refreshMoney();
  var cs = curCarSave();
  var sp = getCarSprite(save.current, cs.paint, cs.livery, 0, 4);
  var mc = document.getElementById('menu-car');
  var g = mc.getContext('2d');
  g.imageSmoothingEnabled = true;
  g.clearRect(0,0,mc.width,mc.height);
  g.drawImage(sp.canvas, (mc.width-sp.w)/2, (mc.height-sp.h)/2, sp.w, sp.h);
}

/* ------------------------------------------------------------- stages */
function quickLine(st){
  var pts = [], x=0,y=0,a=0;
  for(var i=0;i<st.segs.length;i++){
    var sg = st.segs[i], curv = sg.r?1/sg.r:0, walked=0;
    while(walked < sg.len){
      var step = Math.min(24, sg.len-walked);
      a += curv*step; x += Math.sin(a)*step; y -= Math.cos(a)*step;
      walked += step;
      pts.push([x,y]);
    }
  }
  return pts;
}
function drawStageThumb(canvas, st){
  var g = canvas.getContext('2d');
  var W = canvas.width, H = canvas.height;
  var bg = st.theme==='forest' ? '#2f4023' : (st.theme==='mountain' ? '#43433e' : '#dbe8f4');
  g.fillStyle = bg; g.fillRect(0,0,W,H);
  var pts = quickLine(st);
  var minx=1e9,maxx=-1e9,miny=1e9,maxy=-1e9;
  for(var i=0;i<pts.length;i++){
    if(pts[i][0]<minx)minx=pts[i][0]; if(pts[i][0]>maxx)maxx=pts[i][0];
    if(pts[i][1]<miny)miny=pts[i][1]; if(pts[i][1]>maxy)maxy=pts[i][1];
  }
  var s = Math.min(W/Math.max(1,maxx-minx), H/Math.max(1,maxy-miny))*0.82;
  var ox = W/2 - ((minx+maxx)/2)*s, oy = H/2 - ((miny+maxy)/2)*s;
  g.lineWidth = Math.max(2, 3*s*40);
  g.lineWidth = 4;
  g.lineJoin = 'round'; g.lineCap = 'round';
  g.strokeStyle = SURFACES[st.surface].color;
  g.beginPath();
  for(var k=0;k<pts.length;k++){
    var px = ox+pts[k][0]*s, py = oy+pts[k][1]*s;
    if(k===0) g.moveTo(px,py); else g.lineTo(px,py);
  }
  g.stroke();
  g.fillStyle = '#ffb432';
  g.fillRect(ox+pts[0][0]*s-3, oy+pts[0][1]*s-3, 6, 6);
}

function renderStages(){
  refreshMoney();
  var list = document.getElementById('stage-list');
  list.innerHTML = '';
  for(var i=0;i<STAGES.length;i++){
    (function(st){
      var unlocked = stageUnlocked(st);
      var rec = save.stages[st.id];
      var card = document.createElement('div');
      card.className = 'card stage-card' + (unlocked?'':' locked');
      var cvs = document.createElement('canvas');
      cvs.className = 'thumb'; cvs.width = 200; cvs.height = 120;
      card.appendChild(cvs);
      var tgt = targetTime(st);
      var body = document.createElement('div');
      body.innerHTML =
        '<h3>'+st.name+'</h3>'+
        '<div class="meta">'+st.country+'<br>'+
        'SURFACE <b>'+SURFACES[st.surface].name+'</b><br>'+
        'TARGET <b>'+fmtTime(tgt)+'</b><br>'+
        'BEST <b>'+(rec.best!=null?fmtTime(rec.best):'--:--.--')+'</b><br>'+
        'PAYOUT <b>'+fmtMoney(st.payout)+'</b></div>';
      card.appendChild(body);
      var foot = document.createElement('div');
      foot.className = 'row';
      foot.style.marginTop = 'auto';
      if(unlocked){
        var b = document.createElement('button');
        b.className = 'btn primary small'; b.textContent = 'START';
        b.onclick = function(){ startRace(st.id); };
        foot.appendChild(b);
      } else {
        var lockTag = document.createElement('span');
        lockTag.className = 'tag lock';
        lockTag.textContent = 'LOCKED';
        foot.appendChild(lockTag);
        var req = document.createElement('span');
        req.className = 'meta';
        req.style.fontSize = '9px';
        req.textContent = 'NEEDS ' + st.req.label;
        foot.appendChild(req);
      }
      card.appendChild(foot);
      list.appendChild(card);
      drawStageThumb(cvs, st);
    })(STAGES[i]);
  }
}

/* ------------------------------------------------------------- garage */
var garageTab = 'upgrades';

/* --------------------------------------------------- preview lifecycle */

/* Equip a shop item as an unpaid preview. Only one runs at a time, so
   picking something else silently drops the previous one — still no charge. */
function startPreview(pv){
  preview = pv;
  audioBeep(620, 0.05);
  renderGarage();
}
/* drop the preview without a sound — used when the screen changes under us */
function clearPreview(){ preview = null; }

function cancelPreview(){
  if(!preview) return;
  preview = null;
  audioBeep(330, 0.07);
  renderGarage();
}

/* The preview already IS the post-purchase car entry, so buying is a
   hand-over plus the debit. This is the only place the garage writes. */
function commitPreview(){
  if(!preview) return;
  if(save.money < preview.cost) return;        /* can't afford: nothing happens */
  var pv = preview;
  preview = null;
  save.money -= pv.cost;
  save.cars[pv.carId] = pv.cs;
  save.current = pv.current;
  persist();
  audioBeep(940, 0.14);
  renderGarage();
}

/* Free, instantly reversible actions — fitting tyres, taking another car
   out, gear ratios — drop any preview first, so a pending purchase can
   never be committed on top of a car entry that moved underneath it. */
function shopAction(fn){
  return function(e){
    if(e && e.stopPropagation) e.stopPropagation();
    clearPreview();
    fn();
  };
}

function previewUpgrade(up){
  var carId = save.current, real = save.cars[carId], lvl = real.up[up.id];
  if(lvl >= up.max) return;
  var cs = cloneCarSave(real);
  cs.up[up.id] = lvl + 1;
  startPreview({
    kind:'upgrade', item:up.id, carId:carId, current:carId, cs:cs,
    cost: upgradeCost(up, lvl, carIndex(carId)),          /* unchanged pricing */
    name: up.name + ' → T' + (lvl+1),
    note: up.desc
  });
}

function previewTire(t){
  var carId = save.current, real = save.cars[carId], lvl = real.tires[t.id];
  if(lvl >= 3) return;
  var cs = cloneCarSave(real);
  cs.tires[t.id] = lvl + 1;
  if(cs.tires[t.id] === 1) cs.fitted = t.id;              /* as buying does */
  startPreview({
    kind:'tire', item:t.id, carId:carId, current:carId, cs:cs,
    cost: tireCost(t, lvl, carIndex(carId)),
    name: t.name + ' → T' + (lvl+1),
    note: lvl===0 ? t.desc + ' Fitted on purchase.' : t.desc
  });
}

function previewPaint(col){
  var carId = save.current, real = save.cars[carId];
  if(real.paint === col){ clearPreview(); renderGarage(); return; }
  var cs = cloneCarSave(real);
  cs.paint = col;
  startPreview({
    kind:'paint', item:col, carId:carId, current:carId, cs:cs, cost:0,
    name:'RESPRAY', note:'A fresh coat, on the house. Applied to the sprite you drive.'
  });
}

function previewLivery(lv){
  var carId = save.current, real = save.cars[carId];
  if(real.livery === lv.id){ clearPreview(); renderGarage(); return; }
  var cs = cloneCarSave(real);
  cs.livery = lv.id;
  startPreview({
    kind:'livery', item:lv.id, carId:carId, current:carId, cs:cs, cost:0,
    name:'LIVERY → ' + lv.name, note:'Decals are free. Try a few before you settle.'
  });
}

function previewCar(def){
  var real = save.cars[def.id];
  if(real.owned) return;
  var cs = cloneCarSave(real);
  cs.owned = true;
  startPreview({
    kind:'car', item:def.id, carId:def.id, current:def.id, cs:cs,
    cost: def.price, name: def.name, note: def.blurb + ' Starts stock.'
  });
}

/* the bar under the bay: what is being previewed, what it costs, and the
   two ways out of it */
function renderPreviewBar(){
  var bar = document.getElementById('preview-bar');
  if(!preview){ bar.classList.add('hidden'); bar.classList.remove('short'); return; }
  var afford = previewAffordable();
  bar.classList.remove('hidden');
  bar.classList.toggle('short', !afford);
  document.getElementById('pv-name').textContent = preview.name;
  document.getElementById('pv-note').textContent = preview.note || '';
  document.getElementById('pv-cost').textContent = preview.cost > 0 ? fmtMoney(preview.cost) : 'FREE';
  var foot = document.getElementById('pv-after');
  foot.textContent = afford
    ? 'BALANCE AFTER ' + fmtMoney(save.money - preview.cost)
    : 'NOT ENOUGH CREDITS · ' + fmtMoney(preview.cost - save.money) + ' SHORT';
  var buy = document.getElementById('pv-buy');
  buy.disabled = !afford;
  buy.classList.toggle('primary', afford);
  buy.textContent = !afford ? 'CAN’T AFFORD' : (preview.cost > 0 ? 'PURCHASE' : 'APPLY');
}

function statRow(label, val, pct, green, delta){
  var d = '';
  if(delta){
    var up = delta > 0;
    d = '<i class="dl'+(up?'':' dn')+'">'+(up?'+':'−')+Math.abs(delta)+'</i>';
  }
  return '<div class="stat"><span class="lab">'+label+'</span>'+
         '<span class="bar"><i class="'+(green?'g':'')+'" style="width:'+clamp(pct,0,100)+'%"></i></span>'+
         '<span class="val">'+val+d+'</span></div>';
}
function renderGarage(){
  refreshMoney();
  var carId = shopCarId(), def = carDef(carId), cs = shopCarSave(carId);
  var s = computeStats(carId, cs);
  /* what the preview would change, against the same car as it is paid for.
     A car preview has no like-for-like baseline, so it shows plain stats. */
  var b = (preview && preview.kind !== 'car') ? computeStats(carId, save.cars[carId]) : null;
  var dl = function(get){ return b ? get(s) - get(b) : 0; };

  var nameEl = document.getElementById('car-name');
  nameEl.textContent = def.name + '  ·  ' + def.cls + ' ';
  if(preview){
    var tag = document.createElement('span');
    tag.className = 'pv-tag';
    tag.textContent = 'PREVIEW';
    nameEl.appendChild(tag);
  }

  document.getElementById('car-stats').innerHTML =
    statRow('SPEED', s.kmh+' KM/H', s.kmh/240*100, false, dl(function(x){ return x.kmh; })) +
    statRow('ACCEL', s.accelScore, s.accelScore, false, dl(function(x){ return x.accelScore; })) +
    statRow('HANDLING', s.handlingScore, s.handlingScore, false, dl(function(x){ return x.handlingScore; })) +
    statRow('G/GRAVEL', s.gripScore('gravel'), s.gripScore('gravel'), true, dl(function(x){ return x.gripScore('gravel'); })) +
    statRow('G/TARMAC', s.gripScore('tarmac'), s.gripScore('tarmac'), true, dl(function(x){ return x.gripScore('tarmac'); })) +
    statRow('G/SNOW', s.gripScore('snow'), s.gripScore('snow'), true, dl(function(x){ return x.gripScore('snow'); })) +
    '<div class="stat" style="margin-top:3px"><span class="lab">TYRES</span><span style="color:var(--text)">'+s.tire.name+' T'+s.tireLvl+'</span></div>';

  var tabs = document.querySelectorAll('#tabs .tab');
  for(var i=0;i<tabs.length;i++) tabs[i].classList.toggle('active', tabs[i].getAttribute('data-tab')===garageTab);

  var body = document.getElementById('tab-body');
  body.innerHTML = '';
  if(garageTab==='upgrades') renderUpgrades(body);
  else if(garageTab==='tires') renderTires(body);
  else if(garageTab==='paint') renderPaint(body);
  else renderCars(body);
  renderPreviewBar();
}

function pips(level, max){
  var h = '<span class="pips">';
  for(var i=0;i<max;i++) h += '<span class="pip'+(i<level?' on':'')+'"></span>';
  return h + '</span>';
}
function renderUpgrades(body){
  var carId = shopCarId(), real = save.cars[carId], cs = shopCarSave(carId), ci = carIndex(carId);
  for(var i=0;i<UPGRADES.length;i++){
    (function(up){
      var lvl = real.up[up.id];              /* paid-for level: sets the price */
      var shown = cs.up[up.id];              /* previewed level: sets the pips */
      var on = isPreviewing('upgrade', up.id);
      var maxed = lvl >= up.max;
      var row = document.createElement('div');
      row.className = 'up-row' + (maxed ? '' : ' shoppable') + (on ? ' pv' : '');
      var cost = upgradeCost(up, lvl, ci);
      row.innerHTML = '<span class="up-name">'+up.name+'</span>' + pips(shown, up.max) +
                      '<span class="up-desc">'+up.desc+'</span>';
      var btn = document.createElement('button');
      btn.className = 'btn small';
      if(maxed){ btn.textContent = 'MAX'; btn.disabled = true; }
      else {
        var tap = function(e){ if(e && e.stopPropagation) e.stopPropagation(); previewUpgrade(up); };
        if(on){ btn.textContent = 'FITTED'; btn.classList.add('pv'); }
        else {
          btn.textContent = fmtMoney(cost);
          /* still tappable when it is out of reach — you can look at it,
             the PURCHASE button in the bar is what locks out */
          if(save.money < cost) btn.classList.add('cant'); else btn.classList.add('primary');
        }
        btn.onclick = tap;
        row.onclick = tap;
      }
      row.appendChild(btn);
      body.appendChild(row);
    })(UPGRADES[i]);
  }
  renderGearing(body);

  var hint = document.createElement('div');
  hint.className = 'up-desc';
  hint.style.padding = '8px';
  hint.textContent = 'Tap an upgrade to fit it on the car and see it before you pay. Stage 2 needs handling 44+. Stage 3 needs handling 58+ and 170 km/h+. Upgrades apply to the currently selected car only.';
  body.appendChild(hint);
}

/* --------------------------------------------------- gear ratio tuning
   Steppers for final drive and gear spread, plus a reset. Purely a
   gearbox setting: it does not touch the upgrade tree, prices, or the
   stats used for stage gating. */
function renderGearing(body){
  /* ratios are a free setting, written straight to the save, so this reads
     the real entry — the steppers cancel any preview before they write */
  var carId = shopCarId(), cs = save.cars[carId], st = computeStats(carId, shopCarSave(carId));

  var head = document.createElement('div');
  head.className = 'up-row gear-head';
  head.innerHTML = '<span class="up-name">GEARING</span>' +
    '<span class="up-desc">Shorter gearing pulls harder out of corners but runs out of road sooner. ' +
    'Taller gearing does the opposite. Both transmission modes follow whatever you set here.</span>';
  body.appendChild(head);

  function stepper(label, key, min, max, desc, fmt){
    var row = document.createElement('div');
    row.className = 'up-row';
    var val = cs.gearing[key];
    row.innerHTML = '<span class="up-name">' + label + '</span>';

    var wrap = document.createElement('div');
    wrap.className = 'gear-step';
    var minus = document.createElement('button');
    minus.className = 'btn small'; minus.textContent = '\u2212';
    minus.disabled = val <= min + 1e-6;
    var read = document.createElement('span');
    read.className = 'gear-val'; read.textContent = fmt(val);
    var plus = document.createElement('button');
    plus.className = 'btn small'; plus.textContent = '+';
    plus.disabled = val >= max - 1e-6;
    var bump = function(d){
      return shopAction(function(){
        cs.gearing[key] = Math.round(clamp(cs.gearing[key] + d, min, max) * 100) / 100;
        persist(); audioBeep(700, 0.05); renderGarage();
      });
    };
    minus.onclick = bump(-GEAR_STEP);
    plus.onclick = bump(GEAR_STEP);
    wrap.appendChild(minus); wrap.appendChild(read); wrap.appendChild(plus);
    row.appendChild(wrap);

    var d = document.createElement('span');
    d.className = 'up-desc'; d.innerHTML = desc;
    row.appendChild(d);
    body.appendChild(row);
  }

  stepper('FINAL DRIVE', 'final', GEAR_FINAL_MIN, GEAR_FINAL_MAX,
    'Scales every ratio. Sets how fast top gear will pull.',
    function(v){ return v.toFixed(2) + 'x'; });
  stepper('SPREAD', 'spread', GEAR_SPREAD_MIN, GEAR_SPREAD_MAX,
    'Above 1.00 stacks the lower gears close together for launch. Below 1.00 spaces them out.',
    function(v){ return v.toFixed(2); });

  /* what the current ratios actually give you */
  var spans = carSpans(carId);
  var topKmh = Math.round(st.topSpeed * cs.gearing.final * 0.42);
  var firstKmh = Math.round(st.topSpeed * spans[0] * 0.42);
  var out = document.createElement('div');
  out.className = 'up-row';
  out.innerHTML = '<span class="up-name">AT REDLINE</span>' +
    '<span class="up-desc">1st runs to <b>' + firstKmh + ' KM/H</b>, top gear to <b>' + topKmh + ' KM/H</b>. ' +
    (gearingIsStock(carId) ? 'Currently stock.' : 'Tuned away from stock.') + '</span>';
  var reset = document.createElement('button');
  reset.className = 'btn small';
  reset.textContent = 'RESET';
  reset.disabled = gearingIsStock(carId);
  if(!reset.disabled) reset.classList.add('primary');
  reset.onclick = shopAction(function(){
    cs.gearing = { final:1, spread:1 };
    persist(); audioBeep(520, 0.09); renderGarage();
  });
  out.appendChild(reset);
  body.appendChild(out);
}

function renderTires(body){
  var carId = shopCarId(), real = save.cars[carId], cs = shopCarSave(carId), ci = carIndex(carId);
  for(var i=0;i<TIRES.length;i++){
    (function(t){
      var lvl = real.tires[t.id];            /* paid-for tier: sets the price */
      var shown = cs.tires[t.id];            /* previewed tier: sets the pips */
      var on = isPreviewing('tire', t.id);
      var row = document.createElement('div');
      row.className = 'up-row' + (lvl<3 ? ' shoppable' : '') + (on ? ' pv' : '');
      row.innerHTML = '<span class="up-name">'+t.name+'</span>' + pips(shown,3) +
        '<span class="up-desc">'+t.desc+'<br>GRAVEL '+t.mul.gravel.toFixed(2)+
        ' · TARMAC '+t.mul.tarmac.toFixed(2)+' · SNOW '+t.mul.snow.toFixed(2)+'</span>';
      if(lvl>0){                             /* only paid-for rubber can be fitted */
        var fit = document.createElement('button');
        fit.className = 'btn small' + (cs.fitted===t.id ? ' primary' : '');
        fit.textContent = cs.fitted===t.id ? 'FITTED' : 'FIT';
        fit.disabled = cs.fitted===t.id;
        fit.onclick = shopAction(function(){
          real.fitted = t.id; persist(); audioBeep(700,0.08); renderGarage();
        });
        row.appendChild(fit);
      }
      var buy = document.createElement('button');
      buy.className = 'btn small';
      if(lvl>=3){ buy.textContent = 'MAX'; buy.disabled = true; }
      else {
        var cost = tireCost(t, lvl, ci);
        var tap = function(e){ if(e && e.stopPropagation) e.stopPropagation(); previewTire(t); };
        if(on){ buy.textContent = 'FITTED'; buy.classList.add('pv'); }
        else {
          buy.textContent = (lvl===0?'BUY ':'') + fmtMoney(cost);
          if(save.money < cost) buy.classList.add('cant'); else buy.classList.add('primary');
        }
        buy.onclick = tap;
        row.onclick = tap;
      }
      row.appendChild(buy);
      body.appendChild(row);
    })(TIRES[i]);
  }

  var hint = document.createElement('div');
  hint.className = 'up-desc';
  hint.style.padding = '8px';
  hint.textContent = 'Tap a compound to see the tread and rims on the car before you pay. FIT is free and swaps between the tyres you already own.';
  body.appendChild(hint);
}

function renderPaint(body){
  var cs = shopCarSave(shopCarId());
  var wrap = document.createElement('div');
  wrap.style.padding = '8px';
  wrap.innerHTML = '<div class="up-name" style="width:auto;margin-bottom:6px">PAINT</div>';
  var sw = document.createElement('div');
  sw.className = 'swatches';
  for(var i=0;i<PAINTS.length;i++){
    (function(col){
      var d = document.createElement('div');
      /* 'sel' follows the preview, so the swatch matches the car in the bay */
      d.className = 'sw' + (cs.paint===col?' sel':'') + (isPreviewing('paint',col)?' pv':'');
      d.style.background = col;
      d.onclick = function(){ previewPaint(col); };
      sw.appendChild(d);
    })(PAINTS[i]);
  }
  wrap.appendChild(sw);
  var lt = document.createElement('div');
  lt.className = 'up-name';
  lt.style.cssText = 'width:auto;margin:12px 0 6px';
  lt.textContent = 'LIVERY';
  wrap.appendChild(lt);
  var ll = document.createElement('div');
  ll.className = 'livery-list';
  for(var j=0;j<LIVERIES.length;j++){
    (function(lv){
      var b = document.createElement('button');
      b.className = 'btn small' + (cs.livery===lv.id?' primary':'') + (isPreviewing('livery',lv.id)?' pv':'');
      b.textContent = lv.name;
      b.onclick = function(){ previewLivery(lv); };
      ll.appendChild(b);
    })(LIVERIES[j]);
  }
  wrap.appendChild(ll);
  var hint = document.createElement('div');
  hint.className = 'up-desc';
  hint.style.marginTop = '10px';
  hint.textContent = 'Paint and decals are free, but they still go on as a preview — try them on the car, then APPLY to keep it or CANCEL to go back.';
  wrap.appendChild(hint);
  body.appendChild(wrap);
}

function renderCars(body){
  for(var i=0;i<CARS.length;i++){
    (function(def, idx){
      var real = save.cars[def.id];          /* ownership is never previewed */
      var cs = shopCarSave(def.id);          /* but the sprite follows one */
      var on = isPreviewing('car', def.id);
      var row = document.createElement('div');
      row.className = 'car-row' + (!real.owned ? ' shoppable' : '') + (on ? ' pv' : '');
      var cvs = document.createElement('canvas');
      cvs.width = 40; cvs.height = 70;
      cvs.style.width = '40px'; cvs.style.height = '70px';
      row.appendChild(cvs);
      var info = document.createElement('div');
      info.className = 'info';
      var st = computeStats(def.id);
      info.innerHTML = '<b>'+def.name+'</b> <span class="tag">'+def.cls+'</span>'+
        '<div>'+def.blurb+'</div>'+
        '<div>SPEED '+st.kmh+' KM/H · ACCEL '+st.accelScore+' · HANDLING '+st.handlingScore+'</div>';
      row.appendChild(info);
      var btn = document.createElement('button');
      btn.className = 'btn small';
      if(!real.owned){
        var tap = function(e){ if(e && e.stopPropagation) e.stopPropagation(); previewCar(def); };
        if(on){ btn.textContent = 'IN THE BAY'; btn.classList.add('pv'); }
        else {
          btn.textContent = fmtMoney(def.price);
          if(save.money < def.price) btn.classList.add('cant'); else btn.classList.add('primary');
        }
        btn.onclick = tap;
        row.onclick = tap;
      } else if(save.current === def.id){
        btn.textContent = 'IN USE'; btn.disabled = true;
      } else {
        btn.textContent = 'SELECT'; btn.classList.add('primary');
        btn.onclick = shopAction(function(){
          save.current = def.id; persist(); audioBeep(760,0.08); renderGarage();
        });
      }
      row.appendChild(btn);
      body.appendChild(row);
      var g = cvs.getContext('2d');
      g.imageSmoothingEnabled = true;
      var sp = getCarSprite(def.id, cs.paint, cs.livery, 0, 2);
      g.drawImage(sp.canvas, (cvs.width-sp.w)/2, (cvs.height-sp.h)/2, sp.w, sp.h);
    })(CARS[i], i);
  }
}

/* ---------------------------------------------------------- parking lot */
function renderLot(){
  refreshMoney();
  var list = document.getElementById('lot-list');
  list.innerHTML = '';
  for(var i=0;i<CARS.length;i++){
    (function(def){
      var cs = save.cars[def.id];
      var spec = CAR_SIDE[def.sprite];

      if(!cs.owned){                                   /* an empty bay to fill */
        var bay = document.createElement('div');
        bay.className = 'lot-bay';
        bay.innerHTML = '<div class="nm">EMPTY BAY</div>' +
                        '<div class="st">' + def.name + '<br>' + fmtMoney(def.price) + ' &middot; BUY IN GARAGE</div>';
        list.appendChild(bay);
        return;
      }

      var card = document.createElement('div');
      card.className = 'lot-car' + (save.current === def.id ? ' sel' : '');

      var avail = Math.max(70, view.w*0.30 - 18);
      var sc = clamp(Math.floor(avail / spec.gw), 2, 5);
      var sp = getCarSide(def.id, carSideOpts(def.id, { scale:sc }));
      var cvs = document.createElement('canvas');
      cvs.width = sp.w; cvs.height = sp.h;
      cvs.style.width = sp.w+'px'; cvs.style.height = sp.h+'px';
      var g = cvs.getContext('2d');
      g.imageSmoothingEnabled = false;
      g.drawImage(sp.canvas, 0, 0);
      card.appendChild(cvs);

      var nm = document.createElement('div');
      nm.className = 'nm'; nm.textContent = def.name;
      var st = document.createElement('div');
      st.className = 'st';
      st.textContent = save.current === def.id ? '\u2605 IN USE' : 'TAP TO TAKE OUT';
      card.appendChild(nm); card.appendChild(st);

      card.onclick = function(){
        if(save.current === def.id) return;
        save.current = def.id;                         /* same switch the garage uses */
        persist();
        audioBeep(760, 0.09);
        renderLot();
      };
      list.appendChild(card);
    })(CARS[i]);
  }
}

/* ------------------------------------------------------------- settings */
function renderSettings(){
  var b = document.getElementById('settings-body');
  b.innerHTML = '';

  b.appendChild(segRow('CONTROL SCHEME',
    'Buttons is the default. Tilt uses the phone gyroscope for steering; gas and handbrake stay on screen.',
    [['buttons','BUTTONS'],['tilt','TILT']], save.settings.control, function(v){
      if(v==='tilt'){
        enableTilt(function(ok){
          if(ok){ save.settings.control = 'tilt'; calibrateTilt(); }
          else { save.settings.control = 'buttons'; alert('Motion access was not granted, staying on buttons.'); }
          persist(); renderSettings();
        });
      } else { save.settings.control = 'buttons'; persist(); renderSettings(); }
    }));

  if(save.settings.control==='tilt'){
    var cal = document.createElement('div');
    cal.className = 'set-row';
    cal.innerHTML = '<div class="lab">TILT<div class="hint">Hold the phone how you want to drive, then calibrate. Sensitivity '+save.settings.tiltSens.toFixed(1)+'x</div></div>';
    var wrap = document.createElement('div'); wrap.className = 'row';
    var cb = document.createElement('button'); cb.className='btn small primary'; cb.textContent='CALIBRATE';
    cb.onclick = function(){ calibrateTilt(); audioBeep(760,0.1); };
    var minus = document.createElement('button'); minus.className='btn small'; minus.textContent='-';
    minus.onclick = function(){ save.settings.tiltSens = clamp(save.settings.tiltSens-0.1,0.5,2); persist(); renderSettings(); };
    var plus = document.createElement('button'); plus.className='btn small'; plus.textContent='+';
    plus.onclick = function(){ save.settings.tiltSens = clamp(save.settings.tiltSens+0.1,0.5,2); persist(); renderSettings(); };
    wrap.appendChild(minus); wrap.appendChild(plus); wrap.appendChild(cb);
    cal.appendChild(wrap);
    b.appendChild(cal);
  }

  b.appendChild(segRow('TRANSMISSION',
    'Automatic changes gear for you. Manual makes you shift: revs matter, ' +
    'a clean change on the power band pays, lugging or bouncing off the limiter costs you drive. ' +
    'On screen use the UP / DN pads; on a keyboard use E and Q.',
    [['auto','AUTOMATIC'],['manual','MANUAL']], save.settings.transmission, function(v){
      save.settings.transmission = v; persist(); renderSettings();
    }));

  b.appendChild(segRow('THROTTLE',
    'Auto throttle holds the gas for you so you only steer and brake.',
    [['manual','GAS BUTTON'],['auto','AUTO']], save.settings.autoGas?'auto':'manual', function(v){
      save.settings.autoGas = (v==='auto'); persist(); renderSettings();
    }));

  b.appendChild(segRow('AUDIO',
    'Engine, tyre and impact sound effects.',
    [['on','ON'],['off','OFF']], save.settings.audio?'on':'off', function(v){
      save.settings.audio = (v==='on');
      if(!save.settings.audio) audioStopAll(); else audioKick();
      persist(); renderSettings();
    }));

  var reset = document.createElement('div');
  reset.className = 'set-row';
  reset.innerHTML = '<div class="lab">SAVE DATA<div class="hint">Credits, cars, upgrades, best times and settings are stored in this browser.</div></div>';
  var rb = document.createElement('button');
  rb.className = 'btn small';
  rb.textContent = 'RESET ALL';
  rb.onclick = function(){
    if(confirm('Erase all progress and start again?')){
      save = freshSave(); persist(); spriteCache = {}; renderSettings(); refreshMoney();
      alert('Save data cleared.');
    }
  };
  reset.appendChild(rb);
  b.appendChild(reset);

  var about = document.createElement('div');
  about.className = 'set-row';
  about.innerHTML = '<div class="hint">RALLY PIXEL — keyboard: arrows / WASD to steer and accelerate, SHIFT or DOWN for handbrake, E / Q to change gear in manual, ESC to pause.</div>';
  b.appendChild(about);
}
function segRow(label, hint, opts, value, onPick){
  var row = document.createElement('div');
  row.className = 'set-row';
  var lab = document.createElement('div');
  lab.className = 'lab';
  lab.innerHTML = label + '<div class="hint">'+hint+'</div>';
  row.appendChild(lab);
  var seg = document.createElement('div');
  seg.className = 'seg';
  for(var i=0;i<opts.length;i++){
    (function(o){
      var btn = document.createElement('button');
      btn.textContent = o[1];
      if(value === o[0]) btn.className = 'on';
      btn.onclick = function(){ audioKick(); onPick(o[0]); };
      seg.appendChild(btn);
    })(opts[i]);
  }
  row.appendChild(seg);
  return row;
}

/* ------------------------------------------------------------- results */
function finishRace(){
  var r = race;
  if(!r || r.state !== 'done') return;      /* quit or restarted during the run-out */
  var st = r.stage, rec = save.stages[st.id];
  var time = r.finishTime, tgt = r.track.targetTime;
  var perf = clamp(2 - time/tgt, 0, 1.6);
  var cleanF = clamp(1 - r.collisions*0.045 - r.hardHits*0.03, 0, 1);
  var base = Math.round(st.payout*0.40);
  var pace = Math.round(st.payout*0.60*perf);
  var clean = Math.round(st.payout*0.35*cleanF);
  var tbonus = time <= tgt ? Math.round(st.payout*0.40) : 0;
  var first = !rec.done ? Math.round(st.payout*1.20) : 0;
  var total = base + pace + clean + tbonus + first;

  var isBest = rec.best == null || time < rec.best;
  if(isBest) rec.best = time;
  rec.done = true;
  save.money += total;
  persist();

  var rows = document.getElementById('res-rows');
  rows.innerHTML =
    line('TIME', fmtTime(time) + (isBest ? '  ★ BEST' : '')) +
    line('TARGET', fmtTime(tgt)) +
    line('DELTA', fmtDelta(time-tgt)) +
    line('COLLISIONS', String(r.collisions)) +
    line('DAMAGE', Math.round(r.car.damage) + '%') +
    '<div style="height:6px"></div>' +
    line('FINISH FEE', fmtMoney(base)) +
    line('PACE BONUS', fmtMoney(pace)) +
    line('CLEAN RUN', fmtMoney(clean)) +
    (tbonus ? line('TARGET BEATEN', fmtMoney(tbonus)) : '') +
    (first ? line('FIRST CLEAR', fmtMoney(first)) : '') +
    '<div class="res-line total"><span>PAYOUT</span><span>'+fmtMoney(total)+'</span></div>';

  document.getElementById('res-title').textContent = time <= tgt ? 'TARGET BEATEN' : 'STAGE COMPLETE';

  var bts = document.getElementById('res-buttons');
  bts.innerHTML = '';
  bts.appendChild(mkBtn('RETRY','primary', function(){ startRace(st.id); }));
  bts.appendChild(mkBtn('GARAGE','', function(){ showScreen('garage'); }));
  bts.appendChild(mkBtn('STAGES','', function(){ showScreen('stages'); }));
  bts.appendChild(mkBtn('MENU','', function(){ showScreen('menu'); }));

  race = null;
  audioStopAll();
  showScreen('results');
  audioBeep(880,0.18);
  setTimeout(function(){ audioBeep(1180,0.28); }, 160);
}
function line(a,b){ return '<div class="res-line"><span>'+a+'</span><span>'+b+'</span></div>'; }
function mkBtn(text, cls, fn){
  var b = document.createElement('button');
  b.className = 'btn ' + cls;
  b.textContent = text;
  b.onclick = fn;
  return b;
}

/* ------------------------------------------------------------- pause */
function togglePause(){
  if(!race) return;
  paused = !paused;
  document.getElementById('pause-overlay').classList.toggle('hidden', !paused);
  if(paused) audioStopAll();
}
document.getElementById('pause-resume').onclick = function(){ togglePause(); };
document.getElementById('pause-restart').onclick = function(){
  var id = race.stage.id;
  paused = false;
  document.getElementById('pause-overlay').classList.add('hidden');
  startRace(id);
};
document.getElementById('pause-quit').onclick = function(){
  paused = false;
  document.getElementById('pause-overlay').classList.add('hidden');
  race = null; audioStopAll();
  showScreen('stages');
};
(function(){
  var pb = document.getElementById('p-pause');
  var tap = function(e){ e.preventDefault(); togglePause(); };
  pb.addEventListener('touchstart', tap, {passive:false});
  pb.addEventListener('click', function(e){ e.preventDefault(); if(!('ontouchstart' in window)) togglePause(); });
})();

/* ------------------------------------------------------------- wiring */
var navs = document.querySelectorAll('[data-go]');
for(var n=0;n<navs.length;n++){
  (function(el){
    el.addEventListener('click', function(){ audioKick(); showScreen(el.getAttribute('data-go')); });
  })(navs[n]);
}
var tabEls = document.querySelectorAll('#tabs .tab');
for(var t=0;t<tabEls.length;t++){
  (function(el){
    el.addEventListener('click', function(){
      /* leaving a category is backing out of whatever was being previewed */
      clearPreview();
      garageTab = el.getAttribute('data-tab'); audioKick(); renderGarage();
    });
  })(tabEls[t]);
}
document.getElementById('pv-buy').addEventListener('click', function(){ commitPreview(); });
document.getElementById('pv-cancel').addEventListener('click', function(){ cancelPreview(); });
document.addEventListener('touchstart', function(){ audioKick(); }, {passive:true, once:true});
document.addEventListener('gesturestart', function(e){ e.preventDefault(); });
document.addEventListener('dblclick', function(e){ e.preventDefault(); });

/* ------------------------------------------------------------- boot */
function boot(){
  loadSave();
  for(var i=0;i<STAGES.length;i++){
    var L = 0;
    for(var j=0;j<STAGES[i].segs.length;j++) L += STAGES[i].segs[j].len;
    STAGES[i].len = L;
  }
  resize();
  if(save.settings.control === 'tilt' && window.DeviceOrientationEvent &&
     typeof window.DeviceOrientationEvent.requestPermission !== 'function'){
    enableTilt();
  }
  showScreen('menu');
  requestAnimationFrame(frame);
}
boot();

})();
