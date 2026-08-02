import './style.css';

(function(){
'use strict';
/* =========================================================================
   RALLY PIXEL - data: cars, upgrades, tires, stages, persistence
   ========================================================================= */

var SAVE_KEY = 'rallypixel.save.v1';

var clamp = function(v,a,b){ return v<a?a:(v>b?b:v); };
var lerp  = function(a,b,t){ return a+(b-a)*t; };
var TAU = Math.PI*2;

/* Deterministic hash-based PRNG, so scenery and surfaces are identical
   every run. The multiplies go through Math.imul: a plain `*` on a 32-bit
   hash overflows 2^53 and silently drops the low bits, which correlates the
   output with its inputs — the road mottle came out banked down one side of
   the ribbon and the grain tile grew diagonal streaks. */
function rnd2(x,y,salt){
  var h = (Math.imul(x|0, 374761393) + Math.imul(y|0, 668265263) +
           Math.imul(salt|0, 1442695041)) | 0;
  h = Math.imul(h ^ (h >>> 13), 1274126177);
  h = (h ^ (h >>> 16)) >>> 0;
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
  gravel:{ name:'GRAVEL', grip:1.00, roll:0.60, color:'#725730', color2:'#8a6c44', grit:'#8f7a5c', dust:'#c2a97e', edge:'#54401f' },
  snow:  { name:'SNOW',   grip:0.74, roll:0.72, color:'#d5e2ee', color2:'#c3d4e4', dust:'#ffffff', edge:'#9fb4c8' },
  ice:   { name:'ICE',    grip:0.46, roll:0.26, color:'#a9cbe0', color2:'#bcd9ea', dust:'#e6f4ff', edge:'#87aec6' },
  mud:   { name:'MUD',    grip:0.80, roll:0.95, color:'#4c3d28', color2:'#5f4f36', grit:'#6c5c44', dust:'#8a7350', edge:'#3b2f1e' }
};
/* off-track surface per stage theme */
var OFFTRACK = {
  forest:{ name:'GRASS', grip:0.62, roll:2.30, color:'#2b4413', dust:'#4d7822' },
  mountain:{ name:'DIRT', grip:0.66, roll:2.10, color:'#4a4a45', dust:'#7a7a70' },
  snowpass:{ name:'DEEP SNOW', grip:0.55, roll:2.70, color:'#e9f2fa', dust:'#ffffff' }
};

/* ---------------------------------------------------------------- cars */
var CARS = [
  { id:'hatch', name:'KESTREL 1.6 GTI', cls:'GROUP N', price:0,
    topSpeed:300, accel:190, handling:36, gripBase:1.00, sprite:'hatch',
    paint:'#c02a1d', blurb:'Cheap, light, honest. A proper starter rally hatch.' },
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
var PAINTS = ['#c02a1d','#e8892b','#f2d02c','#4fae3f','#1f6fd0','#7b3fbf','#f0f0e6','#2b2f33','#0e8f86','#c9367f'];
var ACCENTS = { '#c02a1d':'#ffffff','#e8892b':'#20242a','#f2d02c':'#20242a','#4fae3f':'#ffffff','#1f6fd0':'#ffd23f',
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
  var s = { v:1, money:1200, current:'hatch', cars:{}, stages:{}, settings:{ control:'buttons', audio:true, units:'mph', tiltSens:1, transmission:'auto' } };
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
    /* saves written before the unit toggle existed default to MPH */
    if(s.settings.units === 'mph' || s.settings.units === 'kph') save.settings.units = s.settings.units;
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
   applied. Nothing reaches `save` - or localStorage - until PURCHASE is
   confirmed, so CANCEL and backing out of the garage both just drop the
   copy and the car snaps back to its last paid-for state.

     { kind, item, carId, current, cs, cost, name, note }

   `cs` is the shadow car entry and `current` is which car would be in use,
   which is how an unowned car can stand in the bay before it is bought.
   Because the preview IS the post-purchase state, committing is a straight
   hand-over of the copy - the preview and the thing you pay for can never
   drift apart. */
var preview = null;

function cloneCarSave(cs){ return JSON.parse(JSON.stringify(cs)); }

/* the car the garage should show - previewed if there is one, else in use */
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
   TRACK BUILDER - walks the segment list into a centreline of nodes,
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

    /* loose rocks / stumps just off the racing line - genuine hazards */
    if(rand() < 0.055){
      var side = rand()<0.5 ? -1 : 1;
      var lat = nd.hw + 28 + rand()*30;
      props.push(mkProp(nd.x+nx*lat*side, nd.y+ny*lat*side, isSnow?3:1,
                        9+rand()*7, i, true, rand()));
    }

    /* The treeline. The reference's verge is not evenly speckled — the
       growth crowds into a band a road-width or so off the edge and thins
       out beyond it, which is what gives the stage its corridor. So the
       lateral offset is biased towards the verge and several clumps go
       down per node. */
    /* The reference's verge is not wall-to-wall foliage: its bushes stand
       clear of each other with grass between, roughly one clump every
       couple of nodes per side. Packing one onto every node turns the
       treeline into a green mat and loses the shape of every bush in it. */
    var density = isMountain ? 0.55 : 0.95;
    if(rand() < density){
      var n2 = Math.floor(1 + rand()*2);
      for(var t=0;t<n2;t++){
        var s2 = rand()<0.5 ? -1 : 1;
        var bias = rand(); bias *= bias;             /* crowd towards the edge */
        var lat2 = nd.hw + 22 + bias*175;
        var type = isSnow ? (rand()<0.72?0:4) : (isMountain ? (rand()<0.45?1:0) : (rand()<0.90?0:4));
        /* Measured off the reference: its bright top faces run about
           sixteen screen pixels across at the median and rarely past
           fifty, which lands a clump here between twenty and forty-five. */
        var size = type===0 ? 27+rand()*24 : 11+rand()*9;
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
   PIXEL SPRITES - everything is drawn with canvas primitives, so there are
   still no external asset files.

   Each car has TWO sprite sets:

     1. TOP-DOWN  - a flat character map, used for in-race rendering. Kept
        deliberately simple: it is only ever seen small and rotating.

     2. SIDE VIEW - built from independent, individually swappable layers
        (chassis / wheels / hood / livery / glass / trim). A later pass can
        replace one layer - say WHEEL_STYLES.rally or SIDE_LAYERS.hood -
        or nudge opts.rideHeight, without touching any of the others.

   Top-down legend:
     B body      H body highlight   S shaded body panel   D dark trim
     G glass     K black            T tyre                C chrome
     Y headlight R taillight        W white               . transparent
   ========================================================================= */

var CAR_SPRITES = {
  /* KESTREL 1.6 GTI - narrow track, tall glasshouse, short overhangs */
  hatch: [
    '............................',
    '............................',
    '...........SSSSSS...........',
    '.........SSSSSSSSSS.........',
    '........CCCCCCCCCCCC........',
    '.......YYBBBBBBBBBBYY.......',
    '......BBBBBBBBBBBBBBBB......',
    '....TTBBBBBBBBBBBBBBBBTT....',
    '...TTBBBBBBBBBBBBBBBBBBTT...',
    '...TTBBBBBHHHHHHHHBBBBBTT...',
    '...TTBBBBBHHHHHHHHBBBBBTT...',
    '...TTBBBBBHHHHHHHHBBBBBTT...',
    '...TTBBBBBHHHHHHHHBBBBBTT...',
    '.....BBBBBHHHHHHHHBBBBB.....',
    '.....BBBBBBBBBBBBBBBBBB.....',
    '.....BSSSSSSSSSSSSSSSSB.....',
    '.....BBBggggggggggggBBB.....',
    '.....DBBggggggggggggBBD.....',
    '.....DBBGGGGGGGGGGGGBBD.....',
    '.....BBBGGGGGGGGGGGGBBB.....',
    '.....BBBGGGGGGGGGGGGBBB.....',
    '.....BBBBHHHHHHHHHHBBBB.....',
    '.....BBBBHHHHHHHHHHBBBB.....',
    '.....BBBBHHHHHHHHHHBBBB.....',
    '.....BBBBHHHHHHHHHHBBBB.....',
    '.....BBBBHHHHHHHHHHBBBB.....',
    '.....BBBggggggggggggBBB.....',
    '.....BBBggggggggggggBBB.....',
    '.....BBBGGGGGGGGGGGGBBB.....',
    '.....BBBGGGGGGGGGGGGBBB.....',
    '.....BSSSSSSSSSSSSSSSSB.....',
    '...TTBBBBBBBBBBBBBBBBBBTT...',
    '...TTBBBBBBBBBBBBBBBBBBTT...',
    '...TTBBBBBBBBBBBBBBBBBBTT...',
    '...TTBBBBBBBBBBBBBBBBBBTT...',
    '....TTBBBBBBBBBBBBBBBBTT....',
    '......CCCCCCCCCCCCCCCC......',
    '.......RRBBBBBBBBBBRR.......',
    '........SSSSSSSSSSSS........',
    '...........SSSSSS...........',
    '............................',
    '............................'
  ],
  /* FALCON RS EVO - wider track, bonnet vents, boot spoiler */
  rally: [
    '............................',
    '............................',
    '..........SSSSSSS...........',
    '.........SSSSSSSSSS.........',
    '........CCCCCCCCCCCCC.......',
    '......YYBBBBBBBBBBBBYY......',
    '...TTBBBBBBBBBBBBBBBBBBTT...',
    '...TTBBBBBBBBBBBBBBBBBBTT...',
    '..TTBBBBBBBBBBBBBBBBBBBBTT..',
    '..TTBBBBBBSSSSSSSSSBBBBBTT..',
    '..TTBBBBBBSSSSSSSSSBBBBBTT..',
    '..TTBBBBBBSSSSSSSSSBBBBBTT..',
    '..TTBBBBBBSSSSSSSSSBBBBBTT..',
    '....BBBBBBSSSSSSSSSBBBBB....',
    '....BBBBBBBBBBBBBBBBBBBB....',
    '....BSSSSSSSSSSSSSSSSSSB....',
    '....BBBggggggggggggggBBB....',
    '....DBBggggggggggggggBBD....',
    '....DBBGGGGGGGGGGGGGGBBD....',
    '....BBBGGGGGGGGGGGGGGBBB....',
    '....BBBGGGGGGGGGGGGGGBBB....',
    '....BBBBHHHHHHHHHHHBBBBB....',
    '....BBBBHHHHHHHHHHHBBBBB....',
    '....BBBBHHHHHHHHHHHBBBBB....',
    '....BBBBHHHHHHHHHHHBBBBB....',
    '....BBBBHHHHHHHHHHHBBBBB....',
    '....BBBggggggggggggggBBB....',
    '....BBBggggggggggggggBBB....',
    '....BBBGGGGGGGGGGGGGGBBB....',
    '....BBBGGGGGGGGGGGGGGBBB....',
    '..TTBSSSSSSSSSSSSSSSSSSBTT..',
    '..TTBBBBBBBBBBBBBBBBBBBBTT..',
    '..TTBBBBBBBBBBBBBBBBBBBBTT..',
    '..TTBBBBBBBBBBBBBBBBBBBBTT..',
    '...TTBBBBBBBBBBBBBBBBBBTT...',
    '...TTBBBBBBBBBBBBBBBBBBTT...',
    '.....CCCCCCCCCCCCCCCCCC.....',
    '.......RRBBBBBBBBBBRR.......',
    '........SSSSSSSSSSSS........',
    '..........SSSSSSS...........',
    '............................',
    '............................'
  ],
  /* VULCAN WRC - widest track, full aero, roof scoop and diffuser */
  wrc: [
    '............................',
    '............................',
    '..........SSSSSSSS..........',
    '.........SSSSSSSSSS.........',
    '.......CCCCCCCCCCCCCC.......',
    '......YYBBBBBBBBBBBBYY......',
    '...TTBBBBBBBBBBBBBBBBBBTT...',
    '..TTBBBBBBBBBBBBBBBBBBBBTT..',
    '..TTBBBBBBBBBBBBBBBBBBBBTT..',
    '.TTBBBBBBDDDDDDDDDDBBBBBBTT.',
    '.TTBBBBBBDDDDDDDDDDBBBBBBTT.',
    '.TTBBBBBBDDDDDDDDDDBBBBBBTT.',
    '.TTBBBBBBDDDDDDDDDDBBBBBBTT.',
    '.TTBBBBBBDDDDDDDDDDBBBBBBTT.',
    '...BBBBBBBBBBBBBBBBBBBBBB...',
    '...BSSSSSSSSSSSSSSSSSSSSB...',
    '...BBBggggggggggggggggBBB...',
    '...DBBggggggggggggggggBBD...',
    '...DBBGGGGGGGGGGGGGGGGBBD...',
    '...BBBGGGGGGGGGGGGGGGGBBB...',
    '...BBBGGGGGGGGGGGGGGGGBBB...',
    '...BBBBBDDDDDDDDDDDDBBBBB...',
    '...BBBBBDDDDDDDDDDDDBBBBB...',
    '...BBBBBDDDDDDDDDDDDBBBBB...',
    '...BBBBBDDDDDDDDDDDDBBBBB...',
    '...BBBBBDDDDDDDDDDDDBBBBB...',
    '...BBBggggggggggggggggBBB...',
    '...BBBggggggggggggggggBBB...',
    '...BBBGGGGGGGGGGGGGGGGBBB...',
    '.TTBBBGGGGGGGGGGGGGGGGBBBTT.',
    '.TTBSSSSSSSSSSSSSSSSSSSSBTT.',
    '.TTBBBBBBBBBBBBBBBBBBBBBBTT.',
    '.TTBBBBBBBBBBBBBBBBBBBBBBTT.',
    '..TTBBBBBBBBBBBBBBBBBBBBTT..',
    '..TTBBBBBBBBBBBBBBBBBBBBTT..',
    '..TTBBBBBBBBBBBBBBBBBBBBTT..',
    '.....CCCCCCCCCCCCCCCCCC.....',
    '......RRBBBBBBBBBBBBRR......',
    '.......SSSSSSSSSSSSSS.......',
    '..........SSSSSSSS..........',
    '............................',
    '............................'
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
    lite:   shade(paint, 0.055),
    hi:     shade(paint, 0.13),
    dark:   shade(paint,-0.15),
    darker: shade(paint,-0.28),
    deep:   shade(paint,-0.44),
    accent: ACCENTS[paint] || '#ffffff',
    glass:      damageTier>=1 ? '#5c6a72' : '#14191c',
    glassLite:  damageTier>=1 ? '#78868e' : '#26313a',
    tyre:'#141516', tyreLite:'#26292c',
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
  } else if(livery===2){                            /* rally #7 - side panels + door roundel */
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

/* Returns {canvas, w, h, scale} - a top-down car pointing UP (-Y). */
function renderCarSprite(carId, paint, livery, damageTier, scale){
  var map = CAR_SPRITES[carDef(carId).sprite];
  var h = map.length, w = map[0].length;
  scale = scale || 2;
  var cv = document.createElement('canvas');
  cv.width = w*scale; cv.height = h*scale;
  var g = cv.getContext('2d');
  g.imageSmoothingEnabled = false;
  var c = carPalette(paint, damageTier);

  for(var y=0;y<h;y++){
    var row = map[y];
    for(var x=0;x<w;x++){
      var ch = row[x];
      if(ch === '.') continue;
      var col = null;
      if(ch==='B' || ch==='H'){
        col = liveryColorAt(livery,x,y,w,h,c.accent);
        if(!col){
          /* Light from the top left, modelled across the car's width rather
             than in a couple of edge columns: the flanks roll away, so the
             near side catches and the far side falls into shade. Flat paint
             from nose to tail is what makes a top-down car read as a
             rectangle with a stripe on it. */
          var t = x/(w-1);
          col = ch==='H' ? c.lite
              : t < 0.22 ? c.lite
              : t < 0.58 ? c.body
              : t < 0.80 ? c.dark
              : c.darker;
        }
      }
      else if(ch==='S') col = c.darker;
      else if(ch==='D') col = c.deep;
      else if(ch==='G') col = c.glass;
      /* the top of a screen catches the sky; the rest stays black. Two rows
         of reflection is all it takes to stop the glass reading as a hole
         cut in the roof. */
      else if(ch==='g') col = c.glassLite;
      else if(ch==='K') col = c.black;
      else if(ch==='T') col = c.tyre;
      else if(ch==='C') col = c.chromeDark;
      else if(ch==='Y') col = c.lamp;
      else if(ch==='R') col = c.tail;
      else if(ch==='W') col = c.white;
      g.fillStyle = col;
      g.fillRect(x*scale, y*scale, scale, scale);
    }
  }

  /* damage: cracked screen, then dents & scorch */
  var R = function(fx, fy, fw, fh){                 /* grid fractions, so the
     dents land in the same place whatever the sprite map's resolution is */
    g.fillRect(Math.round(fx*w)*scale, Math.round(fy*h)*scale,
               Math.max(1, Math.round(fw*w))*scale, Math.max(1, Math.round(fh*h))*scale);
  };
  if(damageTier>=1){                                 /* cracked screen */
    g.fillStyle = 'rgba(20,24,28,.85)';
    var cx0 = Math.floor(w/2)*scale;
    for(var i=0;i<7;i++)
      g.fillRect(cx0 - Math.round((i-3)*0.9)*scale,
                 Math.round(h*0.42 + i*0.35)*scale, scale, scale);
  }
  if(damageTier>=2){                                 /* dents and scorch */
    g.fillStyle = 'rgba(30,26,22,.72)';
    R(0.11, 0.20, 0.07, 0.07);
    R(0.82, 0.66, 0.07, 0.07);
    R(0.18, 0.76, 0.11, 0.03);
    g.fillStyle = 'rgba(0,0,0,.5)';
    R(0.22, 0.10, 0.11, 0.05);
  }
  /* The shadow is the car's own silhouette, not a rectangle behind it — a
     hard box offset under the sprite is the single loudest tell that a
     top-down car has been stuck onto the road rather than parked on it. */
  var sh = document.createElement('canvas');
  sh.width = cv.width; sh.height = cv.height;
  var sg = sh.getContext('2d');
  sg.imageSmoothingEnabled = false;
  sg.drawImage(cv, 0, 0);
  sg.globalCompositeOperation = 'source-in';
  sg.fillStyle = '#000000';
  sg.fillRect(0, 0, sh.width, sh.height);

  return { canvas:cv, shadow:sh, w:cv.width, h:cv.height, scale:scale, pw:w, ph:h };
}

var spriteCache = {};
function getCarSprite(carId, paint, livery, damageTier, scale){
  var key = carId+'|'+paint+'|'+livery+'|'+damageTier+'|'+scale;
  if(!spriteCache[key]) spriteCache[key] = renderCarSprite(carId,paint,livery,damageTier,scale);
  return spriteCache[key];
}

/* =========================================================================
   SIDE VIEW - modular, layered, nose to the right.

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
   grows downward, so PI..1.5PI is the upper-left quadrant - the lit side. */
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

   Treads share one carcass - black outer wall, rubber inner, a sheen on the
   lit side and a shadow opposite - then lay their own block pattern over it,
   so a compound reads by its texture and not just by its tint. */
function tyreCarcass(m, w, rubber, sheen, shadow){
  m.disc(w.cx, w.axleY, w.r,   m.colors.black);
  m.disc(w.cx, w.axleY, w.r-1, rubber);
  arcRun(m, w.cx, w.axleY, w.r-1, LIT_A0, LIT_A1, 12, sheen);
  arcRun(m, w.cx, w.axleY, w.r-1, SHD_A0, SHD_A1, 12, shadow);
  arcRun(m, w.cx, w.axleY, w.r-2, LIT_A0+0.4, LIT_A1-0.4, 6, sheen);
}
/* repeated marks around the circumference - the tread blocks */
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
   Race rims take the car's accent, except when that accent is near-white -
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
  /* panel shut lines - only below the glass, so they read as door gaps */
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
  /* "strip the interior, lexan glass" - so at higher weight tiers it is */
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

/* Layer table and draw order - either can be re-pointed by a later pass. */
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

/* Returns {canvas, w, h, pw, ph, spec, opts} - a side-on car facing RIGHT. */
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
   Upgrade reflection - turns a car's equipped upgrades into side-view
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
     through this same renderer - there is no second preview sprite path */
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
/* ------------------------------------------------------------- canopies
   From above, the reference's roadside growth is not a symmetric tree
   rosette: it is a heap of chunky blocks, each one a bright lit top face
   with a darker face falling away to the south east and a small pale
   catch of light in its top left corner. Several of those overlapping is
   what gives the treeline its volume, so that is what this builds — a
   handful of cubes at deterministic offsets, painted back to front so the
   near ones overlap the far ones the way stacked foliage does. */
var CANOPY_PAL = {
  forest:  { sh:'#0a1706', dk:'#16290b', side:'#2b4610', tp:'#486a15', hi:'#53791c',
             rim:'#5f8526', sp:'#729428', spHi:'#84aa33', speck:'#182b0a' },
  mountain:{ sh:'#0c1a0a', dk:'#1a2c12', side:'#31461f', tp:'#4a6a2e', hi:'#557a34',
             rim:'#688a45', sp:'#7d9c58', spHi:'#94b06c', speck:'#1c2c12' },
  snowpass:{ sh:'#0f1c18', dk:'#1c332b', side:'#365a4c', tp:'#6e948c', hi:'#84a89f',
             rim:'#a7c4bd', sp:'#d4e5ee', spHi:'#ffffff', speck:'#24403a' }
};
/* One bush, the way the reference draws it: a cube seen from just above the
   horizon, so it shows a big lit top face and a short dark front face. On
   the top face sits a second, brighter tier set back into the near corner,
   which throws its own little hook of shade — that motif is what makes the
   reference's foliage read as leaves rather than as boxes. */
function drawBlock(g, pal, x, y, w, lit){
  var ht = w*0.76, hs = w*0.22;
  g.fillStyle = pal.dk;                              /* cast into the clump */
  g.fillRect(x + w*0.10, y + ht*0.14, w, ht+hs);
  g.fillStyle = pal.side;                            /* the front face */
  g.fillRect(x, y + ht, w, hs);
  g.fillStyle = lit ? pal.hi : pal.tp;               /* the lit top */
  g.fillRect(x, y, w, ht);
  g.fillStyle = pal.rim;                             /* rim along top and left */
  g.fillRect(x, y, w, Math.max(1, w*0.045));
  g.fillRect(x, y, Math.max(1, w*0.045), ht);
  /* the raised tier, and the hook of shade under its near corner */
  var tw = w*0.30, tx = x + w*0.15, ty = y + ht*0.12;
  g.fillStyle = pal.side;
  g.fillRect(tx + tw*0.22, ty + tw*0.24, tw, tw*0.92);
  g.fillStyle = pal.sp;
  g.fillRect(tx, ty, tw, tw*0.86);
  g.fillStyle = pal.spHi;
  g.fillRect(tx, ty, tw*0.72, tw*0.30);
}

function drawCanopy(g, s, seed, theme){
  var pal = CANOPY_PAL[theme] || CANOPY_PAL.forest;
  var sd = Math.round(seed*997);
  var i, a, b, c;

  /* The clump sits in a pool of deep shade. The reference's treeline is
     almost black between the bushes, and that separation is what stops a
     bank of foliage collapsing into one flat green mass. */
  for(i=0;i<4;i++){
    a = rnd2(sd, i, 71); b = rnd2(sd, i, 73); c = rnd2(sd, i, 79);
    var uw = s*(0.46 + c*0.44);
    g.fillStyle = i & 1 ? pal.sh : pal.dk;
    g.fillRect((a-0.5)*s*0.90 - uw/2, (b-0.5)*s*0.90 - uw/2, uw, uw*0.84);
  }
  g.fillStyle = 'rgba(0,0,0,.34)';
  g.fillRect(-s*0.30 + s*0.18, -s*0.30 + s*0.26, s*0.74, s*0.70);

  var n = 2 + Math.floor(rnd2(sd, 3, 53)*2);
  var blocks = [];
  for(i=0;i<n;i++){
    a = rnd2(sd, i, 59); b = rnd2(sd, i, 61); c = rnd2(sd, i, 67);
    blocks.push({ x:(a-0.5)*s*0.52, y:(b-0.5)*s*0.52, w:s*(0.50+c*0.24),
                  lit: rnd2(sd, i, 83) > 0.55 });
  }
  blocks.sort(function(p,q){ return p.y - q.y; });   /* back to front */
  for(i=0;i<blocks.length;i++)
    drawBlock(g, pal, blocks[i].x - blocks[i].w/2, blocks[i].y - blocks[i].w/2,
              blocks[i].w, blocks[i].lit);
}

function drawProp(g, p, theme){
  var s = p.size;
  g.save();
  g.translate(p.x, p.y);
  if(p.type===0){                                   /* canopy, seen from above */
    drawCanopy(g, s, p.seed, theme);
  } else if(p.type===1){                            /* rock */
    g.fillStyle = 'rgba(0,0,0,.30)';
    g.fillRect(-s*0.45+2, -s*0.4+3, s*0.95, s*0.85);
    g.fillStyle = '#6b6b66';
    g.fillRect(-s*0.5, -s*0.45, s, s*0.9);
    g.fillStyle = '#87877f';
    g.fillRect(-s*0.4, -s*0.38, s*0.55, s*0.5);
    g.fillStyle = '#4d4d49';
    g.fillRect(-s*0.1, 0, s*0.55, s*0.42);
  } else if(p.type===2){                            /* guardrail post */
    g.fillStyle = 'rgba(0,0,0,.3)';
    g.fillRect(-s*0.5+2, -s*0.3+2, s, s*0.6);
    g.fillStyle = '#b9bcc0';
    g.fillRect(-s*0.5, -s*0.3, s, s*0.6);
    g.fillStyle = '#75797d';
    g.fillRect(-s*0.5, s*0.1, s, s*0.2);
  } else if(p.type===3){                            /* snow bank marker pole */
    g.fillStyle = 'rgba(0,0,0,.18)';
    g.fillRect(-s*0.3+2, -s*0.3+2, s*0.6, s*0.7);
    g.fillStyle = '#f4f8fb';
    g.fillRect(-s*0.3, -s*0.4, s*0.6, s*0.8);
    g.fillStyle = '#e0483a';
    g.fillRect(-s*0.3, -s*0.4, s*0.6, s*0.26);
  } else {                                          /* bush / stump */
    g.fillStyle = 'rgba(0,0,0,.22)';
    g.fillRect(-s*0.45+2, -s*0.35+2, s*0.9, s*0.7);
    g.fillStyle = theme==='snowpass' ? '#dfe9f2' : (theme==='mountain' ? '#4e5a3d' : '#3c5a2a');
    g.fillRect(-s*0.5, -s*0.4, s, s*0.8);
    g.fillStyle = theme==='snowpass' ? '#ffffff' : '#4d7135';
    g.fillRect(-s*0.3, -s*0.3, s*0.5, s*0.45);
  }
  g.restore();
}
/* =========================================================================
   ENGINE - canvas, input, physics, camera, rendering, race loop
   ========================================================================= */

/* on-track car length in world units - held constant so sprite-grid
   changes stay purely visual and never alter the driving footprint */
var CAR_WORLD_LEN = 76;

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

/* ----------------------------------------------------------------- input
   The throttle drives itself, so the only things a player touches are the
   two steering arrows, the two paddles and the handbrake. Every pointer on
   the dash goes through the router in the HUD section below, which owns the
   hit boxes, the fat-finger padding and the drag-between-controls handover. */
var input = { left:false, right:false, hbrake:false, steer:0, tiltRaw:0, tiltZero:0, tiltOn:false };

(function bindDashPointers(){
  var el = document.getElementById('dash-cv');
  var mouseDown = false;
  el.addEventListener('touchstart', function(e){
    e.preventDefault();
    for(var i=0;i<e.changedTouches.length;i++){
      var t = e.changedTouches[i];
      routeDown('t'+t.identifier, t.clientX, t.clientY);
    }
  }, {passive:false});
  el.addEventListener('touchmove', function(e){
    e.preventDefault();
    for(var i=0;i<e.changedTouches.length;i++){
      var t = e.changedTouches[i];
      routeMove('t'+t.identifier, t.clientX, t.clientY);
    }
  }, {passive:false});
  var end = function(e){
    e.preventDefault();
    for(var i=0;i<e.changedTouches.length;i++) routeUp('t'+e.changedTouches[i].identifier);
  };
  el.addEventListener('touchend', end, {passive:false});
  el.addEventListener('touchcancel', end, {passive:false});

  el.addEventListener('mousedown', function(e){ mouseDown = true; routeDown('m', e.clientX, e.clientY); });
  window.addEventListener('mousemove', function(e){ if(mouseDown) routeMove('m', e.clientX, e.clientY); });
  window.addEventListener('mouseup', function(){ mouseDown = false; routeUp('m'); });
  window.addEventListener('blur', function(){ mouseDown = false; releaseAllControls(); });
})();

document.addEventListener('keydown', function(e){
  if(e.repeat) return;
  if(e.key==='e'||e.key==='E'||e.key==='x'||e.key==='X'){ hudCtl.padUp = 1; shiftUp(); return; }
  if(e.key==='q'||e.key==='Q'||e.key==='z'||e.key==='Z'){ hudCtl.padDn = 1; shiftDown(); return; }
  if(e.key==='ArrowLeft'||e.key==='a'||e.key==='A') input.left = true;
  else if(e.key==='ArrowRight'||e.key==='d'||e.key==='D') input.right = true;
  else if(e.key==='ArrowDown'||e.key==='s'||e.key==='S'||e.key==='Shift'||e.key===' '){ input.hbrake = true; e.preventDefault(); }
  else if(e.key==='Escape'||e.key==='p'||e.key==='P'){ if(race && race.state!=='done') togglePause(); }
});
document.addEventListener('keyup', function(e){
  if(e.key==='ArrowLeft'||e.key==='a'||e.key==='A') input.left = false;
  else if(e.key==='ArrowRight'||e.key==='d'||e.key==='D') input.right = false;
  else if(e.key==='ArrowDown'||e.key==='s'||e.key==='S'||e.key==='Shift'||e.key===' ') input.hbrake = false;
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
    /* filter opens with revs - flat drone at idle, growl at the top */
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
   HUD - DASHBOARD

   The world above the dash is pixel art. The dash is not, and the reference
   is emphatic about it: moulded plastic photographed head on, with smooth
   bezels, soft bevels, a fine speckle in the mouldings and small crisp
   lettering. So this half of the screen is drawn with real curves at device
   resolution while the road above it stays on its chunky grid — the same
   split the reference has, and the reason its instruments read at a glance
   where a pixel grid would smear them.

   Everything is laid out against a nominal 300 x 78 unit design grid taken
   off the reference, with the raised centre binnacle standing 13 units
   proud of the outer wings. Spare width on a long phone opens the two
   terraces rather than stretching the art, so the three banks — steering to
   the left edge, the binnacle to the middle, lever and status panels to the
   right edge — always sit where a thumb expects them.

   Cost control: everything static (moulding, dial faces, panel shells,
   lettering) is painted once into an offscreen bitmap and blitted each
   frame. Only the needles, lamps, digits and the controls that move are
   redrawn.
   ========================================================================= */

/* Colours sampled off the reference. The plastic is a neutral charcoal that
   warms very slightly towards the top face, not the blue-grey it is easy to
   drift into, and the instrument glass is nearly black. */
var DC = {
  faceHi:'#2e3335', face:'#23282a', faceLo:'#171a1c', deep:'#0b0d0e',
  lip:'#767d80', lipLo:'#3d4245', seam:'#050708',
  recess:'#141719', recessLo:'#0a0c0d',
  steel:'#a9afb2', steelHi:'#e6ebee', steelLo:'#61686b', steelDk:'#2c3133',
  glass:'#090b0c', glassHi:'#1b1e20',
  tick:'#f2f6f8', tickDim:'#c8d0d3',
  num:'#ffffff', numDim:'#aeb5b8',
  needle:'#df2f21', needleHi:'#ff6a52', hub:'#1d2123',
  amber:'#ffab26', amberLo:'#7a5410',
  green:'#61ca1d', greenHi:'#a6f76a', greenLo:'#2f6a12', greenDim:'#16240e',
  red:'#e33a2a', redLo:'#7d1d15', redPanel:'#25100c', redEdge:'#4a1a13',
  blue:'#2f7fd8', blueHi:'#63b0ff',
  grey:'#8d9497', greyLo:'#565c5f', greyDim:'#2a2f31', label:'#c9d0d3'
};

/* ------------------------------------------------------------- geometry */
function rrPath(g, x, y, w, h, r){
  r = Math.min(r, w/2, h/2);
  g.beginPath();
  g.moveTo(x+r, y);
  g.arcTo(x+w, y,   x+w, y+h, r);
  g.arcTo(x+w, y+h, x,   y+h, r);
  g.arcTo(x,   y+h, x,   y,   r);
  g.arcTo(x,   y,   x+w, y,   r);
  g.closePath();
}
/* The mouldings on the reference are not rounded, they are chamfered: the
   corners are cut off at 45 degrees, which is what an injection-moulded
   fascia actually looks like. */
function chamferPath(g, x, y, w, h, c){
  c = Math.min(c, w/2, h/2);
  g.beginPath();
  g.moveTo(x+c, y);       g.lineTo(x+w-c, y);
  g.lineTo(x+w, y+c);     g.lineTo(x+w, y+h-c);
  g.lineTo(x+w-c, y+h);   g.lineTo(x+c, y+h);
  g.lineTo(x, y+h-c);     g.lineTo(x, y+c);
  g.closePath();
}
function polyPath(g, pts){
  g.beginPath();
  g.moveTo(pts[0][0], pts[0][1]);
  for(var i=1;i<pts.length;i++) g.lineTo(pts[i][0], pts[i][1]);
  g.closePath();
}
function vGrad(g, y0, y1, stops){
  var lg = g.createLinearGradient(0, y0, 0, y1), i;
  for(i=0;i<stops.length;i++) lg.addColorStop(stops[i][0], stops[i][1]);
  return lg;
}

/* A recessed well: dark fill, a shadow under its top lip and a hint of
   light catching the bottom edge, so it reads as cut into the fascia. */
function well(g, x, y, w, h, c, fill){
  chamferPath(g, x, y, w, h, c);
  g.fillStyle = fill || DC.recessLo; g.fill();
  g.lineWidth = Math.max(1, h*0.05);
  g.strokeStyle = 'rgba(0,0,0,.55)';
  g.stroke();
  g.save(); chamferPath(g, x, y, w, h, c); g.clip();
  g.fillStyle = 'rgba(0,0,0,.45)'; g.fillRect(x, y, w, Math.max(1, h*0.10));
  g.fillStyle = 'rgba(190,205,210,.10)';
  g.fillRect(x, y+h-Math.max(1, h*0.07), w, Math.max(1, h*0.07));
  g.restore();
}
/* A pad standing proud of the fascia: lit along the top, shaded at the foot
   and sitting on its own cast shadow. */
function pad(g, x, y, w, h, c, top, bot){
  g.save();
  g.fillStyle = 'rgba(0,0,0,.45)';
  chamferPath(g, x, y+h*0.06, w, h, c); g.fill();
  g.restore();
  chamferPath(g, x, y, w, h, c);
  g.fillStyle = vGrad(g, y, y+h, [[0, top||DC.faceHi],[1, bot||DC.faceLo]]);
  g.fill();
  g.lineWidth = Math.max(1, h*0.04);
  g.strokeStyle = 'rgba(190,200,205,.22)'; g.stroke();
}

/* ------------------------------------------------------------ lettering
   One place decides how the dash speaks. The reference letters a plain
   grotesque in caps, tight but never touching, so that is what this is. */
function dashFont(g, size, weight){
  g.font = (weight||'700') + ' ' + Math.max(4, size).toFixed(1) +
           'px "Helvetica Neue",Helvetica,Arial,"Liberation Sans",sans-serif';
}
/* Draw centred on x, with y as the visual middle of the caps. Canvas puts
   the alphabetic baseline where we would rather have the cap centre, and
   every label on this dash is caps only, so correct for it once here. */
function capText(g, s, x, y, size, col, weight, track){
  dashFont(g, size, weight);
  if(track != null && 'letterSpacing' in g) g.letterSpacing = track.toFixed(2)+'px';
  g.fillStyle = col;
  g.textAlign = 'center';
  g.textBaseline = 'alphabetic';
  g.fillText(s, x, y + size*0.355);
  if('letterSpacing' in g) g.letterSpacing = '0px';
}
/* the same, shrunk until it fits a given width — panel captions are the
   one place the design genuinely runs out of room */
function capTextFit(g, s, x, y, size, w, col, weight, track){
  var sz = size;
  dashFont(g, sz, weight);
  if(track != null && 'letterSpacing' in g) g.letterSpacing = track.toFixed(2)+'px';
  while(g.measureText(s).width > w && sz > 4){
    sz -= 0.4; dashFont(g, sz, weight);
  }
  if('letterSpacing' in g) g.letterSpacing = '0px';
  capText(g, s, x, y, sz, col, weight, track);
  return sz;
}

/* --------------------------------------------------------------- speckle
   The fascia has a fine grain in it. One small tile, generated once from
   the deterministic hash the rest of the game uses, tiled as a pattern. */
var grainTile = null;
function grainPattern(g){
  if(!grainTile){
    var n = 64;
    grainTile = document.createElement('canvas');
    grainTile.width = grainTile.height = n;
    var tg = grainTile.getContext('2d');
    var img = tg.createImageData(n, n);
    for(var y=0;y<n;y++) for(var x=0;x<n;x++){
      var i = (y*n+x)*4, v = rnd2(x, y, 71);
      var lit = v > 0.82, dark = v < 0.20;
      img.data[i] = img.data[i+1] = img.data[i+2] = lit ? 255 : 0;
      img.data[i+3] = lit ? 26 : (dark ? 34 : 0);
    }
    tg.putImageData(img, 0, 0);
  }
  return g.createPattern(grainTile, 'repeat');
}

/* =========================================================================
   LAYOUT
   ========================================================================= */

var DASH_FRAC = 0.40;
/* the design grid: 300 across, 78 down from the wing tops, the binnacle 13
   proud of them and the paddles reaching 32 above */
var NW = 300, NH = 78, NTOP = 32, NRISE = 13;

var dash = { cv:null, g:null, base:null, L:null, key:'', S:1,
             nRpm:0, nSpd:0, nBoost:0 };

function dashLayout(){
  var vw = view.w || window.innerWidth || 800;
  var vh = view.h || window.innerHeight || 400;
  /* whichever axis runs out first sets the scale; on anything wider than
     the design needs, the surplus goes into the two terraces */
  var U = Math.min(vh*DASH_FRAC/NH, vw/NW);
  var extra = Math.max(0, vw - NW*U);
  var CX = vw/2;

  /* Three anchor groups. L walks out to the left edge, R to the right, C
     stays on the centreline; the flat terraces between them absorb the
     difference, so no art is ever stretched. */
  var off = { L:-extra/2, C:0, R:extra/2 };
  var X = function(nx, grp){ return CX + (nx - NW/2)*U + off[grp||'C']; };
  var Y = function(ny){ return (ny + NTOP)*U; };
  var u = function(n){ return n*U; };

  var L = {
    U:U, PX:1, u:u, X:X, Y:Y, vw:vw, vh:vh,
    W:vw, CH:(NH+NTOP)*U, top:NTOP*U, extra:extra,
    originX:0, originY:vh - (NH+NTOP)*U
  };

  /* the fascia's top edge, as a run of (x, y, group) vertices: wing, chamfer
     up to the terrace, terrace, chamfer up to the binnacle, and back down */
  L.contour = [
    [  0,   0,  'L'], [ 42,   0,  'L'], [ 57, -4.5,'L'],
    [ 92, -4.5,'C'], [105, -13, 'C'],
    [195, -13, 'C'], [208, -4.5,'C'],
    [243, -4.5,'R'], [258,  0,  'R'], [NW,  0,  'R']
  ];

  /* ------------------------------------------------------- left bank */
  L.led    = { x:X(13.4,'L'), y:Y(6.2), w:u(25.7), h:u(5.1), n:5 };
  L.steerL = { x:X(7.9,'L'),  y:Y(15),  w:u(22),   h:u(45.7) };
  L.steerR = { x:X(32,'L'),   y:Y(15),  w:u(21.7), h:u(45.7) };
  L.leftBay= { x:X(4,'L'),    y:Y(3.4), w:u(53.6), h:u(59) };

  /* ---------------------------------------------------- centre bank */
  L.R      = u(28.6);
  L.dialY  = Y(19.7);
  L.tachX  = X(108);
  L.spdX   = X(190);
  L.gear   = { x:X(61), y:Y(16.8), w:u(12.2), h:u(33.6), rows:5,
               capY:Y(13.2), capH:u(5) };
  L.stack  = { x:X(135.5), w:u(27),
               topY:  Y(0.6),  topH:u(20.4),
               shiftY:Y(1),    shiftH:u(6.6),
               chevY: Y(9.8),  chevH:u(4.8),
               segY:  Y(16),   segH:u(4.2),
               boxY:  Y(23.6), boxH:u(21.9) };
  L.padL   = { x:X(59.4), y:Y(-30), w:u(18.7), h:u(42) };
  L.padR   = { x:X(223.4), y:Y(-30), w:u(18.7), h:u(42) };
  L.strip  = { x:X(60.5), y:Y(55.3), w:X(221.7)-X(60.5), h:u(18.5) };

  /* ------------------------------------------------------ right bank */
  /* the boost gauge belongs to the binnacle, not the right bank: it has to
     stay tucked under the speedo's shoulder however wide the screen gets */
  L.boost  = { x:X(231.6), y:Y(35), r:u(13.4) };
  L.hb     = { x:X(252.3,'R'), y:Y(19.5), w:u(42), h:u(24.1),
               rise:u(21), slotOff:u(9.4), slotH:u(6.3) };
  var sw = u(21.5), sg = u(1.4);
  L.stat   = { y:Y(50.4), h:u(24.4), w:sw, gap:sg,
               x0:X(227.3,'R'), x1:X(227.3,'R')+sw+sg, x2:X(227.3,'R')+2*(sw+sg) };
  return L;
}

/* How much of the screen bottom the fascia claims, so the chase camera can
   keep the car clear of it. The paddles are allowed to overlap the road. */
function dashBandH(){
  var L = dash.L || dashLayout();
  return (NH + NRISE)*L.U + 4;
}

/* =========================================================================
   DIALS
   ========================================================================= */

/* 135 degrees round through the bottom to 45, the sweep every road
   instrument uses. Shared by the tacho, the speedo and the boost gauge. */
var DIAL_A0 = Math.PI*0.75, DIAL_SWEEP = Math.PI*1.5;
function dialAngle(v, min, max){ return DIAL_A0 + DIAL_SWEEP*clamp((v-min)/(max-min),0,1); }

/* The tacho reads in thousands of rpm. race.rpm is a fraction of redline,
   so redline lands exactly on the 7 and the dial runs on to 8. */
var TACH_MAX = 8, TACH_RED = 7, TACH_SCALE = 7;
var BOOST_MAX = 20;

/* --- units ------------------------------------------------------------ */
/* One place decides what the speedometer means, so the analog face and the
   digital readout can never disagree. */
function speedUnits(){
  var mph = save.settings.units !== 'kph';
  return mph ? { label:'MPH', conv:0.621371, step:20, minor:5 }
             : { label:'KPH', conv:1,        step:40, minor:10 };
}
function speedMax(){ return save.settings.units !== 'kph' ? 160 : 260; }

/* The bezel is a turned metal ring, and a turned ring does not shade like a
   sphere: it picks the light up twice as it comes round, once on the upper
   left and again on the right, and goes almost black where it turns away at
   the bottom. This is that sweep sampled off the reference at 20 degree
   steps, walked round as short stroked arcs. */
var BEZEL_SWEEP = [
  0x74,0x80,0x66,0x22,0x18,0x16,0x18,0x55,0x63,0x5e,0x70,0x8c,0x86,0x6a,0x3e,0x22,0x6e,0x8a
];
function bezelRing(g, cx, cy, r, w){
  var n = BEZEL_SWEEP.length, i, a0, a1, t, c0, c1, v;
  g.lineWidth = w;
  for(i=0;i<n;i++){
    a0 = i/n*TAU; a1 = (i+1)/n*TAU;
    c0 = BEZEL_SWEEP[i]; c1 = BEZEL_SWEEP[(i+1)%n];
    /* two passes per step so the seam between samples disappears */
    for(t=0;t<2;t++){
      v = Math.round(c0 + (c1-c0)*(t+0.5)/2);
      g.beginPath();
      g.arc(cx, cy, r, a0+(a1-a0)*t/2 - 0.004, a0+(a1-a0)*(t+1)/2 + 0.004);
      g.strokeStyle = 'rgb('+v+','+(v+1)+','+(v+1)+')';
      g.stroke();
    }
  }
}

function drawDialFace(g, cx, cy, R, o){
  var i, v, a, maj, red, r0, r1, s;

  /* --- rim: a black edge, the turned ring, then the dark inner shoulder */
  g.beginPath(); g.arc(cx, cy, R, 0, TAU);
  g.fillStyle = '#000000'; g.fill();
  var bw = R*0.058;
  bezelRing(g, cx, cy, R - bw*0.6 - R*0.010, bw);
  /* the crisp catch of light along the outer edge where the ring rolls over */
  g.beginPath(); g.arc(cx, cy, R - R*0.014, Math.PI*1.03, Math.PI*1.86);
  g.lineWidth = Math.max(0.8, R*0.013);
  g.strokeStyle = 'rgba(236,243,246,.50)'; g.stroke();
  g.beginPath(); g.arc(cx, cy, R - bw*1.2 - R*0.010, 0, TAU);
  g.fillStyle = '#0b0e0f'; g.fill();

  /* --- matte black face, lifting very slightly through the middle --- */
  var fr = R*0.925;
  var fg = g.createRadialGradient(cx, cy-R*0.08, R*0.05, cx, cy, fr);
  fg.addColorStop(0.00, '#14181a');
  fg.addColorStop(0.55, '#0d1011');
  fg.addColorStop(1.00, DC.glass);
  g.beginPath(); g.arc(cx, cy, fr, 0, TAU); g.fillStyle = fg; g.fill();

  /* --- tick geometry. Everything hangs off the outer tick radius, so the
     ticks, the redline and the numbering can never drift apart. The
     proportions are the reference's: ticks right out at the rim, numbers
     well inside them, and a wide clear band of black between. --- */
  var t1     = R*0.90;
  var majLen = R*(o.small ? 0.13 : 0.066);
  var minLen = R*(o.small ? 0.07 : 0.050);
  var majW   = Math.max(1, R*(o.small ? 0.034 : 0.019));
  var minW   = Math.max(0.6, R*(o.small ? 0.015 : 0.0095));
  var numSz  = o.numSize != null ? o.numSize : R*0.125;
  var rn     = R*(o.small ? 0.65 : 0.67);              /* numbering ring */

  /* the redline, as the reference paints it: short thick bars stepped
     along the rim rather than one smooth band */
  if(o.redFrom != null){
    var ra0 = dialAngle(o.redFrom, o.min, o.max), ra1 = dialAngle(o.max, o.min, o.max);
    var bars = Math.max(8, Math.round((ra1-ra0)*t1/(R*0.030)));
    g.strokeStyle = DC.red; g.lineCap = 'butt';
    g.lineWidth = Math.max(1.6, R*0.026);
    for(i=0;i<bars;i++){
      a = ra0 + (ra1-ra0)*(i+0.5)/bars;
      g.beginPath();
      g.moveTo(cx+Math.cos(a)*(t1-R*0.085), cy+Math.sin(a)*(t1-R*0.085));
      g.lineTo(cx+Math.cos(a)*(t1+R*0.012), cy+Math.sin(a)*(t1+R*0.012));
      g.stroke();
    }
  }

  var steps = Math.round((o.max-o.min)/o.minor);
  var majEvery = Math.round(o.major/o.minor);
  var labEvery = majEvery*(o.labelEvery||1);
  g.lineCap = 'butt';
  for(i=0;i<=steps;i++){
    v = o.min + i*o.minor;
    maj = (i % majEvery) === 0;
    red = o.redFrom != null && v >= o.redFrom - 1e-6;
    a = dialAngle(v, o.min, o.max);
    if(red && !maj) continue;
    r1 = red ? t1 - R*0.095 : t1;
    r0 = r1 - (maj ? majLen*0.65 : minLen);
    g.beginPath();
    g.moveTo(cx+Math.cos(a)*r0, cy+Math.sin(a)*r0);
    g.lineTo(cx+Math.cos(a)*r1, cy+Math.sin(a)*r1);
    g.lineWidth = maj ? majW : minW;
    g.strokeStyle = red ? DC.red : (maj ? DC.tick : DC.tickDim);
    g.stroke();

    /* the numbers stay white right through the redline — it is the band
       that warns, not the numbering, and that is how the reference reads */
    if(maj && (i % labEvery) === 0 && o.numbers !== false){
      s = String(Math.round(v));
      capText(g, s, cx+Math.cos(a)*rn, cy+Math.sin(a)*rn, numSz, DC.num, '400');
    }
  }

  /* captions ride the centreline, clear of the numbering ring both sides */
  if(o.label) capText(g, o.label, cx, cy - R*(o.small?0.16:0.255),
                      R*(o.small?0.22:0.122), o.small ? DC.num : DC.label, '600', R*0.008);
  if(o.sub)   capText(g, o.sub,   cx, cy + R*(o.small?0.71:0.42),
                      R*(o.small?0.19:0.094), o.small ? DC.num : DC.numDim, '500');

  /* one crescent of reflected light across the top left of the glass */
  var gl = g.createLinearGradient(cx-fr*0.8, cy-fr*0.9, cx+fr*0.4, cy+fr*0.6);
  gl.addColorStop(0.00, 'rgba(215,232,255,.13)');
  gl.addColorStop(0.55, 'rgba(215,232,255,.03)');
  gl.addColorStop(1.00, 'rgba(215,232,255,0)');
  g.beginPath(); g.arc(cx, cy, fr*0.86, Math.PI*0.94, Math.PI*1.72);
  g.lineWidth = fr*0.26; g.strokeStyle = gl; g.stroke();
}

/* A straight tapered pointer with a short counterweight, on a turned hub. */
function drawNeedle(g, cx, cy, R, ang, col){
  var len = R*0.78, tail = R*0.055;
  var w0 = Math.max(1.2, R*0.042), w1 = Math.max(0.6, R*0.013);
  g.save();
  g.translate(cx, cy); g.rotate(ang);
  g.beginPath();
  g.moveTo(-tail, -w0*0.75); g.lineTo(-tail, w0*0.75);
  g.lineTo(0, w0); g.lineTo(len, w1); g.lineTo(len, -w1); g.lineTo(0, -w0);
  g.closePath();
  g.fillStyle = col; g.fill();
  g.beginPath();                                     /* lit upper flank */
  g.moveTo(0, -w0); g.lineTo(len, -w1);
  g.lineTo(len, -w1*0.1); g.lineTo(0, -w0*0.35);
  g.closePath();
  g.fillStyle = 'rgba(255,255,255,.30)'; g.fill();
  g.restore();

  var hr = R*0.068;
  var hg = g.createLinearGradient(cx-hr, cy-hr, cx+hr, cy+hr);
  hg.addColorStop(0, '#3d4446'); hg.addColorStop(0.5, DC.hub); hg.addColorStop(1, '#090c0d');
  g.beginPath(); g.arc(cx, cy, hr, 0, TAU); g.fillStyle = hg; g.fill();
  g.beginPath(); g.arc(cx, cy, hr*0.92, Math.PI*1.10, Math.PI*1.75);
  g.lineWidth = Math.max(0.7, hr*0.22); g.strokeStyle = 'rgba(215,228,232,.30)'; g.stroke();
}

/* =========================================================================
   STATIC ART
   ========================================================================= */

function buildDashBase(L, S){
  var c = document.createElement('canvas');
  c.width = Math.ceil(L.W*S); c.height = Math.ceil(L.CH*S);
  var g = c.getContext('2d');
  g.setTransform(S, 0, 0, S, 0, 0);
  var u = L.u, X = L.X, Y = L.Y, i, x, y;

  /* ------------------------------------------------------ the fascia -- */
  var top = [], bot = [];
  for(i=0;i<L.contour.length;i++){
    var v = L.contour[i];
    top.push([ X(v[0], v[2]), Y(v[1]) ]);
  }
  /* close the shape down the sides and along the screen's bottom edge */
  bot = [ [L.W, L.CH], [0, L.CH] ];
  var shape = top.concat(bot);

  g.save();
  polyPath(g, shape); g.clip();
  /* The fascia is far darker than it looks: what reads as grey is the lit
     top lip and the panel edges, not the moulding, which falls away to
     nearly black within a few units of the top. */
  g.fillStyle = vGrad(g, Y(-NRISE), L.CH, [
    [0.00, '#3a4143'], [0.05, DC.faceHi], [0.14, '#202426'],
    [0.34, '#181c1d'], [0.70, '#121516'], [1.00, '#08090a']
  ]);
  g.fillRect(0, 0, L.W, L.CH);
  /* horizontal moulding seams: a dark cut with a lit lip under it */
  var seams = [ Y(24), Y(48.5) ];
  for(i=0;i<seams.length;i++){
    g.fillStyle = 'rgba(0,0,0,.50)'; g.fillRect(0, seams[i], L.W, Math.max(1, u(0.5)));
    g.fillStyle = 'rgba(190,205,210,.07)';
    g.fillRect(0, seams[i]+Math.max(1, u(0.5)), L.W, Math.max(1, u(0.35)));
  }
  /* vertical splits where the mouldings bolt together */
  var splits = [ X(59), X(219) ];
  for(i=0;i<splits.length;i++){
    g.fillStyle = 'rgba(0,0,0,.45)';
    g.fillRect(splits[i], Y(-2), Math.max(1, u(0.4)), L.CH);
    g.fillStyle = 'rgba(190,205,210,.06)';
    g.fillRect(splits[i]+Math.max(1, u(0.4)), Y(-2), Math.max(1, u(0.3)), L.CH);
  }
  g.fillStyle = grainPattern(g); g.fillRect(0, 0, L.W, L.CH);   /* the grain */
  /* the fascia falls away into shadow at the very bottom of the screen */
  g.fillStyle = vGrad(g, L.CH-u(10), L.CH, [
    [0,'rgba(0,0,0,0)'], [1,'rgba(0,0,0,.55)']
  ]);
  g.fillRect(0, L.CH-u(10), L.W, u(10));
  g.restore();

  /* the lit top lip, and a soft inner shoulder just under it */
  g.beginPath();
  g.moveTo(top[0][0], top[0][1]);
  for(i=1;i<top.length;i++) g.lineTo(top[i][0], top[i][1]);
  g.lineWidth = Math.max(1.4, u(0.9)); g.strokeStyle = DC.lip; g.stroke();
  g.save();
  g.translate(0, Math.max(1.4, u(1.1)));
  g.beginPath();
  g.moveTo(top[0][0], top[0][1]);
  for(i=1;i<top.length;i++) g.lineTo(top[i][0], top[i][1]);
  g.lineWidth = Math.max(1, u(0.7)); g.strokeStyle = 'rgba(0,0,0,.45)'; g.stroke();
  g.restore();

  /* ---------------------------------------------------- left bank ----- */
  /* The steering bay is a raised shelf, not a hole: it stands proud of the
     fascia so the moulding seams run behind it rather than across the keys. */
  var LB = L.leftBay;
  pad(g, LB.x, LB.y, LB.w, LB.h, u(5), '#232729', '#131617');
  /* the five tell-tales, in a slot with cast dividers */
  var lb = L.led, cw = lb.w/lb.n;
  well(g, lb.x-u(1.6), lb.y-u(1.4), lb.w+u(3.2), lb.h+u(2.8), u(1.4), '#0d0f10');
  for(i=1;i<lb.n;i++){
    g.fillStyle = 'rgba(0,0,0,.65)';
    g.fillRect(lb.x + i*cw - u(0.35), lb.y, Math.max(1, u(0.7)), lb.h);
  }
  /* the two steering keys: a bright cast frame around a dark textured pad */
  drawKeyFrame(g, L.steerL, u);
  drawKeyFrame(g, L.steerR, u);

  /* ------------------------------------------------- gear selector ---- */
  var G = L.gear;
  capText(g, 'GEAR', G.x+G.w/2, G.capY, u(3.7), DC.label, '500', L.U*0.10);
  rrPath(g, G.x, G.y, G.w, G.h, u(1.8));
  g.fillStyle = vGrad(g, G.y, G.y+G.h, [[0,'#2e3335'],[1,'#1c2022']]);
  g.fill();
  g.lineWidth = Math.max(1, u(0.55)); g.strokeStyle = 'rgba(170,182,186,.42)'; g.stroke();
  for(i=1;i<G.rows;i++){                              /* row separators */
    y = G.y + G.h*i/G.rows;
    g.fillStyle = 'rgba(0,0,0,.45)'; g.fillRect(G.x+u(0.8), y, G.w-u(1.6), Math.max(1, u(0.4)));
    g.fillStyle = 'rgba(205,215,218,.16)';
    g.fillRect(G.x+u(0.8), y+Math.max(1, u(0.4)), G.w-u(1.6), Math.max(1, u(0.3)));
  }

  /* ------------------------------------------------------ instruments - */
  drawDialFace(g, L.tachX, L.dialY, L.R, {
    min:0, max:TACH_MAX, major:1, minor:0.2, redFrom:TACH_RED,
    label:'RPM', sub:'x1000'
  });
  var un = speedUnits(), smax = speedMax();
  drawDialFace(g, L.spdX, L.dialY, L.R, {
    min:0, max:smax, major:un.step, minor:un.minor, label:un.label,
    numSize: L.R*0.113
  });
  drawDialFace(g, L.boost.x, L.boost.y, L.boost.r, {
    min:0, max:BOOST_MAX, major:10, minor:5, small:true,
    label:'BOOST', sub:'PSI', numSize:L.boost.r*0.24
  });

  /* ----------------------------------------------------- centre stack - */
  /* One housing carries the shift prompt, the two up-arrows and the rev
     segments; the readout gets a second one under it, as on the reference. */
  var K = L.stack;
  stackHousing(g, K.x, K.topY, K.w, K.topH, u);
  capText(g, 'SHIFT', K.x+K.w/2, K.shiftY+K.shiftH/2, K.shiftH*0.60, DC.label, '500', L.U*0.12);
  g.fillStyle = 'rgba(150,165,170,.20)';
  g.fillRect(K.x+u(1.6), K.shiftY+K.shiftH, K.w-u(3.2), Math.max(1, u(0.4)));
  well(g, K.x+u(1.8), K.segY, K.w-u(3.6), K.segH, u(0.8), '#0c0e0f');

  stackHousing(g, K.x, K.boxY, K.w, K.boxH, u);
  well(g, K.x+u(2), K.boxY+u(2), K.w-u(4), K.boxH-u(9.5), u(1), '#000000');
  capText(g, un.label, K.x+K.w/2, K.boxY+K.boxH-u(4.4), u(4), DC.numDim, '500', L.U*0.10);

  /* ------------------------------------------------------ shifter ----- */
  var B = L.hb;
  pad(g, B.x, B.y, B.w, B.h, u(4), '#2c3133', '#1a1e20');
  chamferPath(g, B.x+u(2.6), B.y+u(2.6), B.w-u(5.2), B.h-u(5.2), u(3));
  g.fillStyle = vGrad(g, B.y, B.y+B.h, [[0,'#22272a'],[1,'#171b1d']]);
  g.fill();
  g.lineWidth = Math.max(1, u(0.6)); g.strokeStyle = 'rgba(0,0,0,.55)'; g.stroke();
  g.save(); chamferPath(g, B.x+u(2.6), B.y+u(2.6), B.w-u(5.2), B.h-u(5.2), u(3)); g.clip();
  g.fillStyle = grainPattern(g); g.fillRect(B.x, B.y, B.w, B.h);
  g.restore();
  /* the gate the lever runs in, cut straight through the plate */
  rrPath(g, B.x+u(6), B.y+B.slotOff, B.w-u(12), B.slotH, B.slotH*0.28);
  g.fillStyle = '#000000'; g.fill();
  g.lineWidth = Math.max(1, u(0.5)); g.strokeStyle = 'rgba(160,175,180,.14)'; g.stroke();

  /* ------------------------------------------------- indicator strip -- */
  var T = L.strip;
  pad(g, T.x, T.y, T.w, T.h, u(5), '#1e2224', '#101314');
  g.save(); chamferPath(g, T.x, T.y, T.w, T.h, u(5)); g.clip();
  g.fillStyle = grainPattern(g); g.fillRect(T.x, T.y, T.w, T.h);
  g.restore();
  /* the two red tell-tale panels get their own recessed tiles */
  var sl = T.w/5;
  for(i=2;i<=3;i++){
    var pw = sl*0.84, pxx = T.x + sl*(i+0.5) - pw/2;
    well(g, pxx, T.y+T.h*0.14, pw, T.h*0.72, u(1.4), DC.redPanel);
    chamferPath(g, pxx, T.y+T.h*0.14, pw, T.h*0.72, u(1.4));
    g.lineWidth = Math.max(1, u(0.4)); g.strokeStyle = DC.redEdge; g.stroke();
  }

  /* ---------------------------------------------------- status tiles -- */
  var names = ['TRACTION','DIFF','THROTTLE'];
  var xs = [L.stat.x0, L.stat.x1, L.stat.x2];
  for(i=0;i<3;i++){
    var sx = xs[i], sy = L.stat.y, sw = L.stat.w, sh = L.stat.h;
    pad(g, sx, sy, sw, sh, u(1.4), '#252a2c', '#121617');
    well(g, sx+u(1.2), sy+u(7.4), sw-u(2.4), sh-u(8.6), u(1.0), '#0b0d0e');
    capTextFit(g, names[i], sx+sw/2, sy+u(4.3), u(3.3), sw-u(6.5), DC.label, '500', 0);
  }
  var icy = L.stat.y + L.stat.h*0.55;
  drawTractionIcon(g, xs[0]+L.stat.w/2,  icy, L.U);
  drawDiffIcon(g,     xs[1]+L.stat.w/2,  icy, L.U);
  drawPedalIcon(g,    xs[2]+L.stat.w*0.73, icy+L.U*0.6, L.U);
  return c;
}

/* The centre stack's housings: a shallow chamfered box, barely proud of the
   fascia, outlined in a thin lit edge rather than a heavy bevel. */
function stackHousing(g, x, y, w, h, u){
  chamferPath(g, x, y, w, h, u(2));
  g.fillStyle = vGrad(g, y, y+h, [[0,'#1b1f21'],[1,'#0e1112']]);
  g.fill();
  g.lineWidth = Math.max(1, u(0.5));
  g.strokeStyle = 'rgba(170,185,190,.30)';
  g.stroke();
}

/* The readout is a real seven-segment display, ghost segments and all —
   the reference's giveaway that it is an LCD and not just a number. */
var SEG_ON = [
  0x77,0x24,0x5D,0x6D,0x2E,0x6B,0x7B,0x25,0x7F,0x6F   /* 0-9, bits A..G */
];
function sevenSeg(g, s, cx, cy, h, on, off){
  var w = h*0.60, t = h*0.145, gap = h*0.070;
  var total = s.length*w + (s.length-1)*gap;
  var x0 = cx - total/2, i, k, d, bits;
  for(i=0;i<s.length;i++){
    d = s.charCodeAt(i)-48;
    bits = (d >= 0 && d <= 9) ? SEG_ON[d] : 0;
    var x = x0 + i*(w+gap), y = cy - h/2;
    /* A F B G E C D, each a flattened hexagon so the ends mitre together */
    var segs = [
      [x+t*0.5, y, w-t, t, 1],                     /* A top */
      [x, y+t*0.5, t, h/2-t*0.75, 0],              /* F upper left */
      [x+w-t, y+t*0.5, t, h/2-t*0.75, 0],          /* B upper right */
      [x+t*0.5, y+h/2-t/2, w-t, t, 1],             /* G middle */
      [x, y+h/2+t*0.25, t, h/2-t*0.75, 0],         /* E lower left */
      [x+w-t, y+h/2+t*0.25, t, h/2-t*0.75, 0],     /* C lower right */
      [x+t*0.5, y+h-t, w-t, t, 1]                  /* D bottom */
    ];
    for(k=0;k<7;k++){
      var q = segs[k], lit = (bits >> (6-k)) & 1;
      if(!lit && !off) continue;
      g.beginPath();
      if(q[4]){                                    /* horizontal */
        g.moveTo(q[0]-t*0.5, q[1]+t*0.5); g.lineTo(q[0], q[1]);
        g.lineTo(q[0]+q[2], q[1]); g.lineTo(q[0]+q[2]+t*0.5, q[1]+t*0.5);
        g.lineTo(q[0]+q[2], q[1]+t); g.lineTo(q[0], q[1]+t);
      } else {                                     /* vertical */
        g.moveTo(q[0]+t*0.5, q[1]-t*0.5); g.lineTo(q[0]+t, q[1]);
        g.lineTo(q[0]+t, q[1]+q[3]); g.lineTo(q[0]+t*0.5, q[1]+q[3]+t*0.5);
        g.lineTo(q[0], q[1]+q[3]); g.lineTo(q[0], q[1]);
      }
      g.closePath();
      g.fillStyle = lit ? on : off;
      g.fill();
    }
  }
}

/* the cast frame around a steering key — bright on the top left, dark at
   the foot, exactly the double bevel the reference gives them */
function drawKeyFrame(g, K, u){
  var c = u(4.5);
  /* the shadow the key drops into its bay */
  chamferPath(g, K.x-u(2.4), K.y-u(2.4), K.w+u(4.8), K.h+u(4.8), c+u(1.6));
  g.fillStyle = 'rgba(0,0,0,.62)'; g.fill();
  /* A cast rim, chamfered the way an injection-moulded surround is, bright
     where the light lands and dark underneath — and with a groove cut
     inside it, which is what the reference's keys are read by. */
  var fg = g.createLinearGradient(K.x, K.y, K.x+K.w*0.6, K.y+K.h);
  fg.addColorStop(0.00, '#cfd4ce');
  fg.addColorStop(0.20, '#8d938e');
  fg.addColorStop(0.52, '#4a504e');
  fg.addColorStop(0.80, '#767c79');
  fg.addColorStop(1.00, '#2e3435');
  chamferPath(g, K.x, K.y, K.w, K.h, c);
  g.fillStyle = fg; g.fill();
  g.lineWidth = Math.max(1, u(0.45)); g.strokeStyle = 'rgba(0,0,0,.6)'; g.stroke();
  chamferPath(g, K.x+u(1.5), K.y+u(1.5), K.w-u(3), K.h-u(3), c-u(1));
  g.lineWidth = Math.max(1, u(0.8)); g.strokeStyle = 'rgba(8,11,12,.85)'; g.stroke();
  chamferPath(g, K.x+u(2.4), K.y+u(2.4), K.w-u(4.8), K.h-u(4.8), c-u(1.6));
  g.lineWidth = Math.max(1, u(0.45)); g.strokeStyle = 'rgba(190,198,194,.35)'; g.stroke();
}

/* --------------------------------------------------- status tile icons */
/* A car seen from behind over two skid trails: the traction tell-tale. */
function drawTractionIcon(g, cx, cy, U){
  var w = U*6.2, h = U*4.2;
  var x = cx-w/2, y = cy-U*5.0;
  /* the car, seen from behind: a filled body under an outlined greenhouse,
     which is what makes it read as a car and not a blob at this size */
  /* The reference etches the car rather than filling it: a trapezoid
     greenhouse on a squarer body, with the tile's own black showing between
     them — a solid green lozenge reads as a blob at this size. */
  /* The lamp every car uses: an arched roof drawn in outline sitting on a
     solid body, with a mirror stub each side and two stubby legs under it —
     then a pair of Z-shaped skid marks that never cross each other. */
  g.strokeStyle = DC.green; g.fillStyle = DC.green;
  g.lineWidth = Math.max(1.2, U*0.75); g.lineJoin = 'round'; g.lineCap = 'butt';
  g.beginPath();                                       /* the greenhouse */
  g.moveTo(x+w*0.20, y+h*0.46);
  g.lineTo(x+w*0.26, y+h*0.14);
  g.quadraticCurveTo(x+w*0.28, y+h*0.04, x+w*0.40, y+h*0.04);
  g.lineTo(x+w*0.60, y+h*0.04);
  g.quadraticCurveTo(x+w*0.72, y+h*0.04, x+w*0.74, y+h*0.14);
  g.lineTo(x+w*0.80, y+h*0.46);
  g.stroke();
  rrPath(g, x+w*0.08, y+h*0.42, w*0.84, h*0.42, h*0.10);
  g.fill();                                            /* the solid body */
  g.fillRect(x,          y+h*0.46, w*0.10, h*0.16);    /* the mirror stubs */
  g.fillRect(x+w*0.90,   y+h*0.46, w*0.10, h*0.16);
  g.fillRect(x+w*0.16,   y+h*0.82, w*0.14, h*0.20);    /* the legs */
  g.fillRect(x+w*0.70,   y+h*0.82, w*0.14, h*0.20);
  g.fillStyle = '#0b0d0e';                             /* two dark windows */
  g.fillRect(x+w*0.20, y+h*0.52, w*0.16, h*0.16);
  g.fillRect(x+w*0.64, y+h*0.52, w*0.16, h*0.16);

  g.strokeStyle = DC.green;
  g.lineWidth = Math.max(1.3, U*1.05); g.lineJoin = 'miter'; g.lineCap = 'butt';
  var i, sx, sg, yy = y+h*1.24;
  for(i=0;i<2;i++){
    sg = i ? 1 : -1; sx = cx + sg*w*0.40;
    g.beginPath();
    g.moveTo(sx + sg*U*1.0, yy);
    g.lineTo(sx - sg*U*0.9, yy+U*1.7);
    g.lineTo(sx + sg*U*0.9, yy+U*3.3);
    g.lineTo(sx - sg*U*1.0, yy+U*4.9);
    g.stroke();
  }
}
/* Four hubs, two axles and a centre diff: the drivetrain schematic. */
function drawDiffIcon(g, cx, cy, U){
  var w = U*9.6, h = U*8.4;
  var x = cx-w/2, y = cy-h/2;
  var hw = U*2.0, hh = U*3.0;
  var lx = x+hw/2, rx = x+w-hw/2, ty = y+hh/2, by = y+h-hh/2;
  g.strokeStyle = DC.grey; g.lineWidth = Math.max(1.2, U*0.8); g.lineCap = 'butt';
  g.beginPath();
  g.moveTo(lx, ty); g.lineTo(rx, ty);                  /* front axle */
  g.moveTo(lx, by); g.lineTo(rx, by);                  /* rear axle */
  g.moveTo(cx, ty); g.lineTo(cx, by);                  /* prop shaft */
  g.stroke();
  g.fillStyle = DC.steel;                              /* the centre diff */
  g.beginPath(); g.arc(cx, cy, U*1.0, 0, TAU); g.fill();
  g.fillStyle = '#0b0d0e';
  g.beginPath(); g.arc(cx, cy, U*0.38, 0, TAU); g.fill();
  g.fillStyle = DC.grey;                               /* the four hubs */
  var i, px, py;
  for(i=0;i<4;i++){
    px = (i & 1) ? rx : lx; py = (i & 2) ? by : ty;
    rrPath(g, px-hw/2, py-hh/2, hw, hh, U*0.7); g.fill();
    g.fillStyle = 'rgba(255,255,255,.22)';
    g.fillRect(px-hw/2, py-hh/2, hw, U*0.6);
    g.fillStyle = DC.grey;
  }
}
/* A hinged throttle pedal on its floor mount, raked as it is on the car. */
function drawPedalIcon(g, cx, cy, U){
  var w = U*5.2, h = U*11.0;
  var x = cx-w/2, y = cy-h/2;
  g.save();
  g.translate(cx, cy); g.rotate(0.20); g.translate(-cx, -cy);
  rrPath(g, x, y, w, h, U*1.0);
  g.fillStyle = vGrad(g, y, y+h, [[0,'#c2c9cc'],[0.45,'#7c8386'],[1,'#3e4446']]);
  g.fill();
  g.lineWidth = Math.max(1, U*0.55); g.strokeStyle = '#0b0d0e'; g.stroke();
  rrPath(g, x+U*0.8, y+U*0.9, w-U*1.6, h-U*1.8, U*0.6);
  g.lineWidth = Math.max(1, U*0.45); g.strokeStyle = 'rgba(0,0,0,.35)'; g.stroke();
  g.fillStyle = 'rgba(0,0,0,.30)';
  for(var i=y+U*2.0; i<y+h-U*1.2; i+=U*1.9)
    g.fillRect(x+U*1.1, i, w-U*2.2, Math.max(1, U*0.55));
  g.restore();
}

/* =========================================================================
   CONTROLS THAT MOVE
   ========================================================================= */

var hudCtl = { hb:0, padUp:0, padDn:0 };

/* Each keeps its own bitmap and only repaints when its state changes, so a
   frame costs three blits rather than three full re-renders. */
var dashArt = {};
function artPiece(name, key, w, h, S, paint){
  var a = dashArt[name];
  w = Math.ceil(w); h = Math.ceil(h);
  if(!a || a.key !== key || a.w !== w || a.h !== h || a.S !== S){
    var c = document.createElement('canvas');
    c.width = Math.max(1, Math.ceil(w*S)); c.height = Math.max(1, Math.ceil(h*S));
    var g = c.getContext('2d');
    g.setTransform(S, 0, 0, S, 0, 0);
    paint(g, w, h);
    a = dashArt[name] = { key:key, w:w, h:h, S:S, cv:c };
  }
  return a.cv;
}
function blitArt(g, cv, x, y, S){
  g.drawImage(cv, 0, 0, cv.width, cv.height,
              x, y, cv.width/S, cv.height/S);
}

/* -------------------------------------------------- steering key face */
function drawKeyFace(g, w, h, right, pressed){
  var U = h/45.7;
  var d = pressed ? U*0.9 : 0;
  var m = U*3.4, r = U*3.2;
  chamferPath(g, m, m+d, w-2*m, h-2*m-d*0.5, r);
  g.fillStyle = vGrad(g, m, h-m, pressed ? [[0,'#2f3639'],[1,'#181d1f']]
                                         : [[0,'#1b2022'],[1,'#0c1011']]);
  g.fill();
  g.save(); chamferPath(g, m, m+d, w-2*m, h-2*m-d*0.5, r); g.clip();
  g.fillStyle = grainPattern(g); g.fillRect(0, 0, w, h);
  g.fillStyle = 'rgba(0,0,0,.40)'; g.fillRect(0, m+d, w, U*1.6);
  g.restore();
  g.lineWidth = Math.max(1, U*0.5); g.strokeStyle = 'rgba(0,0,0,.55)'; g.stroke();

  /* a soft grey triangle pointing outboard, the way the reference draws it */
  var s = w*0.195, cx = w/2 + (right ? s*0.10 : -s*0.10), cy = h/2 + d;
  g.beginPath();
  if(right){ g.moveTo(cx+s, cy); g.lineTo(cx-s*0.78, cy-s*1.02); g.lineTo(cx-s*0.78, cy+s*1.02); }
  else     { g.moveTo(cx-s, cy); g.lineTo(cx+s*0.78, cy-s*1.02); g.lineTo(cx+s*0.78, cy+s*1.02); }
  g.closePath();
  g.fillStyle = pressed ? '#dfe5e7' : '#8b9295'; g.fill();
}

/* -------------------------------------------------------- shift paddle
   A cast blade raked outward, wide at the top and tapering into a stalk
   that runs down behind the binnacle. Left is marked minus, right plus. */
function drawPaddle(g, w, h, up, press, active){
  var down = press > 0.4;
  var lean = w*0.22 * (up ? 1 : -1);
  var bladeH = h*0.74;
  var x0 = up ? w*0.10 : w*0.90, sgn = up ? 1 : -1;
  /* four corners: outboard-top, inboard-top, inboard-bottom, outboard-bottom */
  var pts = [
    [x0 - sgn*w*0.02 + lean, h*0.02],
    [x0 + sgn*w*0.80 + lean, h*0.10],
    [x0 + sgn*w*0.62,        bladeH],
    [x0 + sgn*w*0.10,        bladeH*0.98]
  ];
  var mid = (pts[2][0]+pts[3][0])/2;

  /* the stalk, drawn first so the blade caps it */
  g.fillStyle = '#15191a';
  g.fillRect(mid - w*0.16, bladeH - h*0.04, w*0.32, h - bladeH + h*0.04);
  g.fillStyle = '#2a2f31';
  g.fillRect(mid - w*0.12, bladeH - h*0.04, w*0.24, h - bladeH + h*0.04);

  g.save();
  g.shadowColor = 'rgba(0,0,0,.6)'; g.shadowBlur = w*0.18; g.shadowOffsetY = w*0.08;
  polyPath(g, pts);
  g.fillStyle = down ? '#e0a52c'
                     : (active ? vGrad(g, 0, bladeH, [[0,'#3b4144'],[0.55,'#272c2e'],[1,'#191d1f']])
                               : vGrad(g, 0, bladeH, [[0,'#33383a'],[1,'#181c1e']]));
  g.fill();
  g.restore();
  g.lineWidth = Math.max(1, w*0.035);
  g.strokeStyle = down ? '#ffd487' : 'rgba(180,192,196,.30)';
  g.stroke();
  /* a lit edge down the outboard flank */
  g.beginPath();
  g.moveTo(pts[0][0], pts[0][1]); g.lineTo(pts[3][0], pts[3][1]);
  g.lineWidth = Math.max(1, w*0.055);
  g.strokeStyle = down ? '#fff0c8' : 'rgba(210,222,226,.34)';
  g.stroke();

  /* the stamped marking, low on the blade and carried out with the rake */
  var mx = (pts[2][0]+pts[3][0])/2 + lean*0.2, my = bladeH*0.70;
  var mw = w*0.34, mt = Math.max(1.4, w*0.10);
  g.fillStyle = down ? '#4a3708' : (active ? '#dfe6e9' : '#9aa1a4');
  g.fillRect(mx-mw/2, my-mt/2, mw, mt);
  if(!up) g.fillRect(mx-mt/2, my-mw/2, mt, mw);
}

/* ------------------------------------------------------------- shifter
   A gated lever: a turned barrel rising out of the gate on a collar,
   raked back at rest and pulled upright as the handbrake goes on. */
function drawShifter(g, w, h, v, gateY){
  var px0 = w*0.50, py0 = gateY;
  var ang = (72 - v*16) * Math.PI/180;
  var dx = Math.cos(ang), dy = -Math.sin(ang);
  var len = gateY - h*0.30;
  var on = v > 0.5;
  var tx = px0 + dx*len, ty = py0 + dy*len;
  /* A proper gear lever is a thick barrel, not a wand: the reference's is a
     quarter of the gate plate across, with a turned highlight down one
     flank and a domed cap on top. */
  var aw = w*0.105;
  var nx = -dy, ny = dx;                       /* the barrel's across vector */

  g.save();
  /* the collar the barrel turns in, sitting down in the gate */
  g.beginPath();
  g.ellipse(px0, py0, aw*1.35, aw*0.62, 0, 0, TAU);
  g.fillStyle = '#202527'; g.fill();
  g.lineWidth = Math.max(1, w*0.008); g.strokeStyle = 'rgba(180,192,196,.28)'; g.stroke();

  g.shadowColor = 'rgba(0,0,0,.55)'; g.shadowBlur = w*0.05; g.shadowOffsetX = w*0.015;
  /* the barrel, shaded across its width so it reads as round */
  var bg = g.createLinearGradient(px0-nx*aw, py0-ny*aw, px0+nx*aw, py0+ny*aw);
  bg.addColorStop(0.00, '#07090a');
  bg.addColorStop(0.28, on ? '#3f3720' : '#242a2c');
  bg.addColorStop(0.46, on ? '#8a7440' : '#4e5457');
  bg.addColorStop(0.64, on ? '#332d18' : '#1b2022');
  bg.addColorStop(1.00, '#050708');
  g.beginPath(); g.lineCap = 'round';
  g.moveTo(px0, py0); g.lineTo(tx, ty);
  g.lineWidth = aw*2; g.strokeStyle = bg; g.stroke();
  g.restore();
  /* the machined grip rings up the shaft */
  g.save();
  g.beginPath(); g.lineCap = 'round';
  g.moveTo(px0, py0); g.lineTo(tx, ty);
  g.lineWidth = aw*2; g.strokeStyle = 'rgba(0,0,0,0)'; g.stroke();
  g.clip();
  g.strokeStyle = 'rgba(0,0,0,.55)'; g.lineWidth = Math.max(1, w*0.012);
  for(var i=0.12;i<0.96;i+=0.075){
    var mx = px0 + dx*len*i, my = py0 + dy*len*i;
    g.beginPath();
    g.moveTo(mx-nx*aw, my-ny*aw); g.lineTo(mx+nx*aw, my+ny*aw);
    g.stroke();
  }
  g.restore();
  /* the domed cap */
  g.beginPath(); g.ellipse(tx, ty, aw*1.02, aw*0.80, ang, 0, TAU);
  var kg = g.createLinearGradient(tx-nx*aw, ty-ny*aw, tx+nx*aw, ty+ny*aw);
  kg.addColorStop(0, '#6b7274');
  kg.addColorStop(0.38, on ? '#ffd487' : '#d6dcde');
  kg.addColorStop(0.72, on ? '#8a7440' : '#767d7f');
  kg.addColorStop(1, '#2a3032');
  g.fillStyle = kg; g.fill();
  g.lineWidth = Math.max(1, w*0.008); g.strokeStyle = 'rgba(0,0,0,.5)'; g.stroke();
}

/* ---------------------------------------------------- indicator glyphs */
function glyphArrow(g, cx, cy, s, right, col){
  g.beginPath();
  if(right){
    g.moveTo(cx+s, cy);
    g.lineTo(cx+s*0.10, cy-s*0.72); g.lineTo(cx+s*0.10, cy-s*0.30);
    g.lineTo(cx-s,      cy-s*0.30); g.lineTo(cx-s,      cy+s*0.30);
    g.lineTo(cx+s*0.10, cy+s*0.30); g.lineTo(cx+s*0.10, cy+s*0.72);
  } else {
    g.moveTo(cx-s, cy);
    g.lineTo(cx-s*0.10, cy-s*0.72); g.lineTo(cx-s*0.10, cy-s*0.30);
    g.lineTo(cx+s,      cy-s*0.30); g.lineTo(cx+s,      cy+s*0.30);
    g.lineTo(cx-s*0.10, cy+s*0.30); g.lineTo(cx-s*0.10, cy+s*0.72);
  }
  g.closePath();
  g.fillStyle = col; g.fill();
}
/* The headlamp tell-tale: a D-shaped bowl on the right throwing its beams
   out to the left, which is the way round every dashboard draws it. */
function glyphHeadlight(g, cx, cy, s, col){
  g.strokeStyle = col; g.lineCap = 'butt'; g.lineJoin = 'miter';
  g.lineWidth = Math.max(1.3, s*0.17);
  g.beginPath();                                   /* the bowl */
  g.moveTo(cx+s*0.16, cy-s*0.80);
  g.lineTo(cx+s*0.16, cy+s*0.80);
  g.arc(cx+s*0.16, cy, s*0.80, Math.PI/2, -Math.PI/2, true);
  g.closePath();
  g.stroke();
  var i;                                           /* four beams, running out */
  for(i=0;i<4;i++){
    g.beginPath();
    g.moveTo(cx-s*1.10, cy-s*0.62+i*s*0.41);
    g.lineTo(cx-s*0.16, cy-s*0.62+i*s*0.41);
    g.stroke();
  }
}
/* Belted occupant: a solid seated figure with the sash strapped over it.
   The strap is cut back out of the body in the panel's own colour, which is
   how the reference reads as a belt rather than a scratch. */
function glyphBelt(g, cx, cy, s, col, bg){
  g.fillStyle = col;
  g.beginPath();                                   /* the head */
  g.arc(cx-s*0.06, cy-s*0.74, s*0.27, 0, TAU); g.fill();
  g.beginPath();                                   /* the torso */
  g.moveTo(cx-s*0.50, cy+s*0.30);
  g.quadraticCurveTo(cx-s*0.50, cy-s*0.36, cx-s*0.04, cy-s*0.36);
  g.quadraticCurveTo(cx+s*0.44, cy-s*0.36, cx+s*0.44, cy+s*0.30);
  g.closePath(); g.fill();
  g.beginPath();                                   /* the two legs */
  g.moveTo(cx-s*0.36, cy+s*0.34); g.lineTo(cx-s*0.02, cy+s*0.34);
  g.lineTo(cx-s*0.20, cy+s*0.92); g.lineTo(cx-s*0.46, cy+s*0.92);
  g.closePath(); g.fill();
  g.beginPath();
  g.moveTo(cx+s*0.06, cy+s*0.34); g.lineTo(cx+s*0.34, cy+s*0.34);
  g.lineTo(cx+s*0.40, cy+s*0.92); g.lineTo(cx+s*0.16, cy+s*0.92);
  g.closePath(); g.fill();

  g.lineCap = 'butt';
  g.strokeStyle = bg || '#25100c';                 /* the gap the strap sits in */
  g.lineWidth = Math.max(2, s*0.34);
  g.beginPath();
  g.moveTo(cx+s*0.52, cy-s*0.86); g.lineTo(cx-s*0.34, cy+s*0.20);
  g.stroke();
  g.beginPath();
  g.moveTo(cx-s*0.34, cy+s*0.20); g.lineTo(cx+s*0.56, cy+s*0.26);
  g.stroke();
  g.strokeStyle = col;                             /* the strap itself */
  g.lineWidth = Math.max(1.2, s*0.17);
  g.beginPath();
  g.moveTo(cx+s*0.50, cy-s*0.84); g.lineTo(cx-s*0.30, cy+s*0.18);
  g.stroke();
  g.beginPath();
  g.moveTo(cx-s*0.30, cy+s*0.18); g.lineTo(cx+s*0.54, cy+s*0.24);
  g.stroke();
}
/* Parking brake: a circled P inside a broken ring. */
function glyphPark(g, cx, cy, s, col){
  g.strokeStyle = col; g.lineWidth = Math.max(1.2, s*0.15);
  g.beginPath(); g.arc(cx, cy, s, Math.PI*0.10, Math.PI*0.90); g.stroke();
  g.beginPath(); g.arc(cx, cy, s, Math.PI*1.10, Math.PI*1.90); g.stroke();
  g.beginPath(); g.arc(cx, cy, s*0.62, 0, TAU); g.stroke();
  capText(g, 'P', cx, cy, s*0.92, col, '700');
}

/* =========================================================================
   FRAME
   ========================================================================= */

function ensureDash(){
  var el = document.getElementById('dash-cv');
  if(!el) return false;
  var S = Math.min(window.devicePixelRatio || 1, 3);
  var key = Math.round(view.w)+'x'+Math.round(view.h)+'@'+S.toFixed(2)+'/'+
            save.settings.units+'/'+Math.round(speedMax());
  if(key !== dash.key || dash.cv !== el || !dash.base){
    var L = dashLayout();
    dash.cv = el; dash.L = L; dash.S = S;
    el.width = Math.ceil(L.W*S); el.height = Math.ceil(L.CH*S);
    el.style.width = L.W+'px';
    el.style.height = L.CH+'px';
    el.style.left = '0px';
    dash.g = el.getContext('2d');
    dash.base = buildDashBase(L, S);
    dash.key = key;
    dashArt = {};
    layoutHitBoxes(L);
    document.documentElement.style.setProperty('--dash-h', ((NH+NRISE)*L.U)+'px');
  }
  dash.g.setTransform(dash.S, 0, 0, dash.S, 0, 0);
  return true;
}

function drawDash(r){
  if(!ensureDash()) return;
  var L = dash.L, S = dash.S, g = dash.g, u = L.u, i, x, y;
  g.clearRect(0, 0, L.W, L.CH);
  g.drawImage(dash.base, 0, 0, dash.base.width, dash.base.height, 0, 0, L.W, L.CH);

  var spd = r ? Math.abs(r.car.fwd) : 0;
  var thr = r ? r.throttle : 0;
  var un  = speedUnits();
  var rpm = dash.nRpm;

  /* ---------------------------------------------------- steering keys - */
  var kl = artPiece('steerL', input.left?1:0, L.steerL.w, L.steerL.h, S, function(gg,w,h){
    drawKeyFace(gg, w, h, false, input.left);
  });
  blitArt(g, kl, L.steerL.x, L.steerL.y, S);
  var kr = artPiece('steerR', input.right?1:0, L.steerR.w, L.steerR.h, S, function(gg,w,h){
    drawKeyFace(gg, w, h, true, input.right);
  });
  blitArt(g, kr, L.steerR.x, L.steerR.y, S);

  /* ------------------------------------------------------- tell-tales - */
  /* Five ignition tell-tales. They come on with the car and stay on, which
     is what the reference shows and what a lamp row on a fascia does; the
     rightmost one blinks out under a shift prompt so the row still says
     something. */
  var lb = L.led, cw = lb.w/lb.n;
  for(i=0;i<lb.n;i++){
    x = lb.x + i*cw + cw*0.17;
    var on = !(i === lb.n-1 && rpm > 0.93);
    var lw = cw*0.66, lh = lb.h*0.74, ly = lb.y + lb.h*0.13;
    rrPath(g, x, ly, lw, lh, lb.h*0.12);
    g.fillStyle = on ? DC.greenLo : DC.greenDim; g.fill();     /* the lens rim */
    if(on){
      rrPath(g, x+lw*0.16, ly+lh*0.14, lw*0.68, lh*0.72, lb.h*0.08);
      g.fillStyle = DC.green; g.fill();
      rrPath(g, x+lw*0.22, ly+lh*0.20, lw*0.46, lh*0.26, lb.h*0.06);
      g.fillStyle = DC.greenHi; g.fill();
    }
  }

  /* ---------------------------------------------------- gear selector - */
  /* The selector reads out in the letter, not in a highlight: the chosen
     row goes amber and a small cast tab rides out of the slot beside it. */
  var G = L.gear, rows = gearRows(r), rh = G.h/G.rows;
  for(i=0;i<rows.length;i++){
    y = G.y + i*rh;
    capText(g, rows[i].t, G.x+G.w*0.5, y+rh*0.5, rh*0.68,
            rows[i].on ? DC.amber : '#b6bcbe', rows[i].on ? '700' : '500');
    if(rows[i].on){
      rrPath(g, G.x+G.w-u(0.6), y+rh*0.26, u(3.2), rh*0.48, u(0.7));
      g.fillStyle = vGrad(g, y, y+rh, [[0,'#b0b6b8'],[1,'#565c5e']]); g.fill();
      g.lineWidth = Math.max(1, u(0.35)); g.strokeStyle = 'rgba(0,0,0,.55)'; g.stroke();
    }
  }

  /* ------------------------------------------------------- instruments */
  drawNeedle(g, L.tachX, L.dialY, L.R,
             dialAngle(clamp(rpm*TACH_SCALE, 0, TACH_MAX), 0, TACH_MAX),
             rpm >= 1 ? DC.needleHi : DC.needle);
  var shown = dash.nSpd * un.conv, smax = speedMax();
  drawNeedle(g, L.spdX, L.dialY, L.R,
             dialAngle(clamp(shown, 0, smax), 0, smax), DC.needle);
  drawNeedle(g, L.boost.x, L.boost.y, L.boost.r,
             dialAngle(clamp(dash.nBoost, 0, BOOST_MAX), 0, BOOST_MAX), DC.needle);

  /* ------------------------------------------------------ centre stack */
  var K = L.stack;
  var wantUp = r && rpm > 0.93;
  var lit2 = wantUp || hudCtl.padUp > 0.15;
  var chW = K.w*0.21, chGap = K.w*0.14;
  for(i=0;i<2;i++){
    x = K.x + K.w/2 - chW - chGap/2 + i*(chW+chGap);
    g.beginPath();
    g.moveTo(x+chW/2, K.chevY);
    g.lineTo(x+chW,   K.chevY+K.chevH);
    g.lineTo(x,       K.chevY+K.chevH);
    g.closePath();
    g.fillStyle = lit2 ? DC.blueHi : DC.blue; g.fill();
  }
  /* the segment row under them tracks revs */
  var segN = 5, segW = (K.w-u(2.4)-(segN-1)*u(0.9))/segN;
  var segLit = Math.round(clamp(rpm/1.08,0,1)*segN);
  for(i=0;i<segN;i++){
    x = K.x + u(1.2) + i*(segW+u(0.9));
    rrPath(g, x, K.segY+u(0.9), segW, K.segH-u(1.8), u(0.5));
    g.fillStyle = i < segLit
      ? (i < segN-2 ? DC.green : (i < segN-1 ? DC.amber : DC.red))
      : '#20262a';
    g.fill();
  }
  /* the digital readout: the same number the analog face is pointing at */
  var txt = String(Math.round(Math.max(0, shown)));
  var digH = K.boxH*0.27;
  if(txt.length > 2) digH *= 2/txt.length;
  sevenSeg(g, txt, K.x+K.w/2, K.boxY+u(2)+(K.boxH-u(9.5))/2, digH,
           DC.num, 'rgba(210,225,230,.055)');

  /* ---------------------------------------------------------- shifter - */
  var B = L.hb;
  var hbq = Math.round(hudCtl.hb*8);
  var art = artPiece('hb', hbq, B.w, B.h+B.rise, S, function(gg,w,h){
    drawShifter(gg, w, h, hbq/8, B.rise + B.slotOff + B.slotH*0.5);
  });
  blitArt(g, art, B.x, B.y-B.rise, S);

  /* -------------------------------------------------- indicator strip - */
  var T = L.strip, sl = T.w/5, sy = T.y + T.h*0.5;
  var gs = T.h*0.30;
  var sxAt = function(n){ return T.x + sl*(n+0.5); };
  glyphArrow(g, sxAt(0), sy, gs*1.15, false, input.left ? DC.amber : DC.grey);
  glyphHeadlight(g, sxAt(1), sy, gs, DC.green);
  glyphBelt(g, sxAt(2), sy, gs*1.05, DC.red, DC.redPanel);
  glyphPark(g, sxAt(3), sy, gs*0.95, hudCtl.hb > 0.4 ? '#ff6a58' : DC.red);
  glyphArrow(g, sxAt(4), sy, gs*1.15, true, input.right ? DC.amber : DC.grey);

  /* ------------------------------------------------------ status bars -
     Every tile carries the same row of segments: how much grip is left, how
     evenly the drive is going down, and how far the auto-throttle has the
     pedal. All three are readouts, nothing here feeds the physics. */
  var slip = r ? clamp(Math.abs(r.car.lat)/95 + r.car.wheelSpin*0.5, 0, 1) : 0;
  var vals = [1-slip, r ? clamp(1-Math.abs(r.car.steer)*0.45, 0, 1) : 1, thr];
  var xs = [L.stat.x0, L.stat.x1, L.stat.x2];
  var bn = 4, bgap = u(0.9);
  var bw = (L.stat.w - u(4.8) - (bn-1)*bgap)/bn;
  var bh = u(2.6), by = L.stat.y + L.stat.h - bh - u(2.4);
  for(i=0;i<3;i++){
    var nlit = Math.round(clamp(vals[i],0,1)*bn);
    for(var b=0;b<bn;b++){
      x = xs[i] + u(2.4) + b*(bw+bgap);
      rrPath(g, x, by, bw, bh, u(0.4));
      g.fillStyle = b < nlit ? DC.green : DC.greenDim; g.fill();
    }
  }
  /* the THROTTLE tile's three tall bars, standing beside its pedal */
  var tgap = u(0.8), tn = 3;
  var tw = (L.stat.w*0.44 - (tn-1)*tgap)/tn;
  var tx = L.stat.x2 + u(3.0);
  var tTop = L.stat.y + u(9.4), tBot = by - u(1.4);
  for(i=0;i<tn;i++){
    /* each bar fills from the bottom, so the block reads as a level */
    var full = tBot - tTop;
    var fill = clamp(thr*tn - i, 0, 1)*full;
    g.fillStyle = DC.greenDim;
    g.fillRect(tx + i*(tw+tgap), tTop, tw, full);
    if(fill > 0){
      g.fillStyle = DC.green;
      g.fillRect(tx + i*(tw+tgap), tBot-fill, tw, fill);
    }
  }

  /* ---------------------------------------------------------- paddles - */
  var manual = save.settings.transmission === 'manual';
  var pu = artPiece('padU', Math.round(hudCtl.padUp*4)+'/'+(manual?1:0),
                    L.padR.w, L.padR.h, S, function(gg,w,h){
    drawPaddle(gg, w, h, false, hudCtl.padUp, manual);
  });
  blitArt(g, pu, L.padR.x, L.padR.y, S);
  var pd = artPiece('padD', Math.round(hudCtl.padDn*4)+'/'+(manual?1:0),
                    L.padL.w, L.padL.h, S, function(gg,w,h){
    drawPaddle(gg, w, h, true, hudCtl.padDn, manual);
  });
  blitArt(g, pd, L.padL.x, L.padL.y, S);
}


/* The five-row selector from the mockup. P, R and N are real states; the
   two numeric rows are a moving window on the gearbox, so a six-speed car
   still reads out of a five-row column. */
function gearRows(r){
  var g = r ? r.gear : 1;
  var fwd = r ? r.car.fwd : 0;
  var stopped = !r || r.state === 'countdown' || r.state === 'done';
  var park = stopped && Math.abs(fwd) < 2;
  var rev = fwd < -1;
  var neutral = !park && !rev && Math.abs(fwd) < 2;
  var lo = clamp(g, 1, TOP_GEAR-1);
  return [
    { t:'P', on:park },
    { t:'R', on:rev },
    { t:'N', on:neutral },
    { t:String(lo),   on:!park && !rev && !neutral && g === lo },
    { t:String(lo+1), on:!park && !rev && !neutral && g === lo+1 }
  ];
}

/* --------------------------------------------------------- per frame -- */
function updateHudControls(dt){
  var k = 1 - Math.pow(0.0004, dt);
  hudCtl.hb += ((input.hbrake ? 1 : 0) - hudCtl.hb)*k;
  hudCtl.padUp = Math.max(0, hudCtl.padUp - dt*4.5);
  hudCtl.padDn = Math.max(0, hudCtl.padDn - dt*4.5);

  /* Needles chase the live values with a short mechanical lag: quick
     enough to be accurate, damped enough not to twitch. Nothing here
     feeds back into the physics, it is all readout. */
  if(race){
    var kmh = Math.abs(race.car.fwd)*0.42;
    dash.nRpm += (race.rpm - dash.nRpm) * clamp(dt*20, 0, 1);
    dash.nSpd += (kmh      - dash.nSpd) * clamp(dt*14, 0, 1);
    /* boost follows revs under load and bleeds off the moment it is shut */
    var wantB = BOOST_MAX * clamp(race.rpm*1.05, 0, 1) * race.throttle;
    dash.nBoost += (wantB - dash.nBoost) * clamp(dt*(wantB > dash.nBoost ? 4 : 9), 0, 1);
  }
  drawDash(race);
}

/* force a full repaint, e.g. when a race starts or the viewport changes */
function resetHudControls(){
  hudCtl.hb = hudCtl.padUp = hudCtl.padDn = 0;
  dash.nRpm = dash.nSpd = dash.nBoost = 0;
  dash.key = '';
  dashArt = {};
  drawDash(race);
}

/* =========================================================================
   TOUCH ROUTING

   Only three things on the dash are interactive: the two steering arrows,
   the two paddles and the handbrake. Their hit boxes are worked out from
   the same layout the art is drawn with and grown by HIT_PAD, and one
   router owns every pointer, so a thumb sliding from one control to the
   next hands over without being lifted.
   ========================================================================= */

/* Fat-finger padding: how many CSS pixels every dash control's hit box is
   grown by on all sides. The art stays where the mockup puts it, the
   target around it is deliberately larger than the art. */
var HIT_PAD = 16;

var hitBoxes = [];
function layoutHitBoxes(L){
  var ox = L.originX, oy = L.originY;
  var box = function(id, kind, rect, extra){
    return { id:id, kind:kind, key:extra,
             x: ox + rect.x, y: oy + rect.y,
             w: rect.w, h: rect.h };
  };
  hitBoxes = [
    box('left',  'hold', L.steerL, 'left'),
    box('right', 'hold', L.steerR, 'right'),
    box('padDn', 'tap',  L.padL),
    box('padUp', 'tap',  L.padR),
    /* the lever's target covers the arm and the slot it stands in */
    box('hbrake','hold', { x:L.hb.x, y:L.hb.y-L.hb.rise, w:L.hb.w, h:L.hb.h+L.hb.rise }, 'hbrake')
  ];
}
function hitAt(x, y){
  for(var i=0;i<hitBoxes.length;i++){
    var b = hitBoxes[i];
    if(x >= b.x-HIT_PAD && x <= b.x+b.w+HIT_PAD &&
       y >= b.y-HIT_PAD && y <= b.y+b.h+HIT_PAD) return b;
  }
  return null;
}
function hitById(id){
  for(var i=0;i<hitBoxes.length;i++) if(hitBoxes[i].id === id) return hitBoxes[i];
  return null;
}

var holdCount = { left:0, right:0, hbrake:0 };
function ctlEnter(b){
  if(b.kind === 'hold'){
    holdCount[b.key] = (holdCount[b.key]||0) + 1;
    input[b.key] = true;
    audioKick();
  } else {
    audioKick();
    if(b.id === 'padUp'){ hudCtl.padUp = 1; shiftUp(); }
    else { hudCtl.padDn = 1; shiftDown(); }
  }
}
function ctlLeave(b){
  if(!b || b.kind !== 'hold') return;
  holdCount[b.key] = Math.max(0, (holdCount[b.key]||0) - 1);
  if(!holdCount[b.key]) input[b.key] = false;
}

var pointerCtl = {};
function routeDown(id, x, y){
  var b = hitAt(x,y);
  pointerCtl[id] = b ? b.id : null;
  if(b) ctlEnter(b);
}
function routeMove(id, x, y){
  if(!(id in pointerCtl)) return;
  var b = hitAt(x,y);
  var now = b ? b.id : null;
  if(now === pointerCtl[id]) return;
  ctlLeave(hitById(pointerCtl[id]));
  pointerCtl[id] = now;
  if(b) ctlEnter(b);
}
function routeUp(id){
  if(!(id in pointerCtl)) return;
  ctlLeave(hitById(pointerCtl[id]));
  delete pointerCtl[id];
}
function releaseAllControls(){
  for(var p in pointerCtl) if(pointerCtl.hasOwnProperty(p)) routeUp(p);
  holdCount.left = holdCount.right = holdCount.hbrake = 0;
  input.left = input.right = input.hbrake = false;
}

/* ------------------------------------------------------------- gearbox
   Six speeds. GEAR_SPANS is the fraction of the car's top speed reached at
   the redline in each gear, so engine revs are speed/(top*span) - revs fall
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

/* ---------------------------------------------------------- auto-throttle
   The car drives itself. The throttle opens as the countdown ends and
   stays open for the rest of the stage; the only things that shut it are
   the handbrake and a crash recovery, and it opens again on its own as
   soon as they let go. These are the knobs for how that feels. */
var AUTO_THROTTLE_LEVEL   = 1.00;   /* how far the pedal ends up going down */
var AUTO_THROTTLE_RAMP    = 1.60;   /* per second, closed to fully open     */
var AUTO_THROTTLE_RELEASE = 6.00;   /* per second, lifting off for the lever */

/* Where the throttle wants to be this frame, and how fast it may get there. */
function autoThrottleTarget(r){
  if(r.state !== 'run') return 0;
  if(input.hbrake) return 0;
  if(r.car.stuck > 1.4) return 0;   /* beached: no point spinning the wheels */
  return AUTO_THROTTLE_LEVEL;
}
function updateAutoThrottle(r, dt){
  var want = autoThrottleTarget(r);
  var rate = want > r.throttle ? AUTO_THROTTLE_RAMP : AUTO_THROTTLE_RELEASE;
  r.throttle = clamp(r.throttle + clamp(want - r.throttle, -rate*dt, rate*dt), 0, 1);
}

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
    gear:1, rpm:0, torque:1, shiftT:0, perfectT:0, perfectFlash:0, throttle:0,
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
  releaseAllControls();
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

  updateAutoThrottle(r, dt);
  var thr = r.throttle;
  var gas = driving && thr > 0.02;
  var hb = driving && input.hbrake;

  updateGearbox(r, Math.abs(c.fwd), topSpeed, dt);

  if(gas && !hb){
    /* the power curve runs out above the rated top speed, so rolling
       resistance settles the car right around its quoted figure */
    /* top gear redlines at finalDrive x the car's rated speed, so taller
       gearing raises the ceiling and shorter gearing lowers it */
    var head = 1 - c.fwd/(topSpeed*r.finalDrive*1.35);
    if(head < 0) head = 0;
    c.fwd += accel * head * dt * (offtrack ? 0.70 : 1) * r.torque * thr;
    c.wheelSpin = clamp(c.wheelSpin + (1.2 - grip)*dt*2.2*thr, 0, 1);
  } else {
    c.wheelSpin *= Math.pow(0.05, dt);
  }
  if(hb){
    /* handbrake: locks the rears - big slowdown, and the tail comes round */
    if(c.fwd > 0) c.fwd = Math.max(0, c.fwd - 300*dt);
    else if(driving && c.fwd > -70) c.fwd -= 70*dt;   /* reverse, to recover */
  }
  /* rolling resistance + aero */
  c.fwd -= c.fwd * roll * 0.30 * dt;
  c.fwd -= c.fwd * Math.abs(c.fwd) * 0.00022 * dt;
  /* sliding sideways scrubs speed - the rally trade-off */
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
  /* how hard the fronts can bite depends on the surface and the tyres -
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
  /* the car is pushed sideways as it rotates - that is what makes the slide */
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
  audioEngine(r.rpm, 0.25 + thr*0.75, slip*(spd>25?1:0), driving || r.state==='countdown');

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
  /* the throttle winds itself back up from a standstill after a recovery */
  r.throttle = 0;
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
     drawn that far behind the focal point - down the screen - and the
     faster you go the lower it rides. Left at a fixed 0.62 it disappears
     under the dash. So: work out where the car will actually land (the same
     rotation the transform below applies), and lift the focal point only as
     far as it takes to keep it clear of the dash, never past 0.30 so the
     road ahead stays open. The band we clear includes the raised gauge
     housing, so the car is never cut into by the binnacle either. */
  var focal = H*0.62;
  var dxc = c.x - r.camX, dyc = c.y - r.camY;
  var carDrop = (dyc*Math.cos(r.camA) - dxc*Math.sin(r.camA)) * scale;
  var carHalf = CAR_WORLD_LEN*scale*0.55;
  /* The reference leaves a clear margin of road between the car's tail and
     the top of the binnacle rather than parking it on the moulding, so the
     deck is pulled up a further slice of the frame. */
  var deck = H - dashBandH() - carHalf - H*0.075;
  if(focal + carDrop > deck) focal = clamp(deck - carDrop, H*0.30, H*0.62);

  /* park the countdown and the big messages just above the car's roof */
  var msgBottom = Math.round(H - (focal + carDrop) + carHalf + 10);
  if(msgBottom !== r.msgBottom){
    r.msgBottom = msgBottom;
    document.documentElement.style.setProperty('--msg-bottom', msgBottom+'px');
  }

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

/* --------------------------------------------------------------- ground
   The verge is a fine, dense grain — a few square units per cell, not the
   big soft blotches it is tempting to scatter. Painting it per cell every
   frame across a whole viewport is thousands of rects, so it is baked once
   into a tile and laid down as a pattern. The tile is deliberately large
   and carries its own tufts and stones, so the repeat never announces
   itself at the zoom the game is actually played at. */
/* Sampled off the reference. Its verge is far darker than it looks at a
   glance — a hair over a tenth luminance — and its variation is fine and
   many-toned rather than two colours in big patches, which is what lets the
   foliage read against it at all. */
var GROUND_PAL = {
  forest:  { base:'#1e330f',
             grain:['#132207','#1a2e0d','#22360f','#2a4212','#345016','#0f1c05','#25390f','#3b5c1b'],
             tuft:['#3f6a1a','#4e8221'], stone:['#5b5f52','#787c6d'] },
  mountain:{ base:'#43433e',
             grain:['#3c3c37','#4a4a44','#35352f','#4f4f49','#313129','#52524b'],
             tuft:['#54583d','#656949'], stone:['#75756b','#8f8f85'] },
  snowpass:{ base:'#e4eef8',
             grain:['#eef5fb','#d9e5f0','#f7fbff','#cfdcea','#e8f1f9','#dde9f4'],
             tuft:['#cfe0ef','#e4eef8'], stone:['#a8b6c4','#c3ced9'] }
};
var GROUND_TILE = 258, GROUND_CELL = 3;
var groundTiles = {};
function groundPattern(g, theme){
  var t = groundTiles[theme];
  if(!t){
    var pal = GROUND_PAL[theme] || GROUND_PAL.forest;
    var c = document.createElement('canvas');
    c.width = c.height = GROUND_TILE;
    var tg = c.getContext('2d');
    tg.fillStyle = pal.base;
    tg.fillRect(0, 0, GROUND_TILE, GROUND_TILE);
    var n = GROUND_TILE/GROUND_CELL, x, y, v;
    for(y=0;y<n;y++) for(x=0;x<n;x++){
      v = rnd2(x, y, 31);
      if(v > 0.78) continue;                        /* leave some base showing */
      tg.fillStyle = pal.grain[Math.floor(rnd2(x,y,37)*pal.grain.length)];
      tg.fillRect(x*GROUND_CELL, y*GROUND_CELL, GROUND_CELL, GROUND_CELL);
    }
    /* Tufts and stones. The reference's verge is thick with little sprigs —
       they are half of what makes it read as grass rather than a texture —
       so they go down often, in two sizes, with the odd stone between. */
    for(y=0;y<n;y+=3) for(x=0;x<n;x+=3){
      v = rnd2(x, y, 41);
      var px = x*GROUND_CELL, py = y*GROUND_CELL, k = GROUND_CELL;
      if(v > 0.945){
        var big = v > 0.982;
        tg.fillStyle = 'rgba(0,0,0,.22)';
        tg.fillRect(px+k, py+(big?4:3)*k, k*2, k);
        tg.fillStyle = pal.tuft[big ? 1 : 0];
        tg.fillRect(px,     py+k,   k, k*2);
        tg.fillRect(px+k,   py,     k, k*(big?4:3));
        tg.fillRect(px+2*k, py+k,   k, k*2);
        if(big){ tg.fillRect(px-k, py+2*k, k, k*2); tg.fillRect(px+3*k, py+2*k, k, k*2); }
      } else if(v > 0.978){
        tg.fillStyle = 'rgba(0,0,0,.34)';
        tg.fillRect(px+k, py+2*k, k*3, k*2);
        tg.fillStyle = pal.stone[0];
        tg.fillRect(px, py+k, k*3, k*2);
        tg.fillStyle = pal.stone[1];
        tg.fillRect(px, py+k, k*2, k);
      }
    }
    t = groundTiles[theme] = c;
  }
  return g.createPattern(t, 'repeat');
}

function drawGroundDetail(g, r, viewR, theme){
  var x0 = Math.floor((r.camX-viewR)/GROUND_TILE)*GROUND_TILE;
  var y0 = Math.floor((r.camY-viewR)/GROUND_TILE)*GROUND_TILE;
  var w = Math.ceil((r.camX+viewR - x0)/GROUND_TILE+1)*GROUND_TILE;
  var h = Math.ceil((r.camY+viewR - y0)/GROUND_TILE+1)*GROUND_TILE;
  g.save();
  g.translate(x0, y0);
  g.fillStyle = groundPattern(g, theme);
  g.fillRect(0, 0, w, h);
  g.restore();
}

/* The stones and scuffs a loose surface is made of: a ramp either side of
   the base colour, cached per surface because it is rebuilt every frame. */
var mottleCache = {};
function ROAD_MOTTLE(S){
  var m = mottleCache[S.name];
  if(!m){
    /* A loose surface is stones, not paint: as well as the ramp either side
       of the base colour there are pale grit and dark wet patches, which is
       what gives the reference's dirt its pebbled look rather than a wash. */
    m = mottleCache[S.name] = [
      S.color2, shade(S.color,-0.045), shade(S.color, 0.045), shade(S.color,-0.085),
      shade(S.color, 0.080), shade(S.color,-0.125), S.color, shade(S.color,-0.020),
      S.grit || shade(S.color, 0.095), shade(S.color,-0.140), shade(S.color, 0.150),
      S.color2, shade(S.color, 0.060), shade(S.color,-0.060),
      S.grit || shade(S.color, 0.130), shade(S.color,-0.200),
      S.grit || shade(S.color, 0.150), shade(S.color, 0.100)
    ];
  }
  return m;
}

/* The stage does not begin at the start line: the road runs on behind it and
   past the flying finish, the way it does in the reference. Both ends get a
   straight apron carried on from the end node's heading and width. */
function drawApron(g, nd, S, dir){
  var nx = Math.cos(nd.a), ny = Math.sin(nd.a);
  var dx = Math.sin(nd.a)*dir, dy = -Math.cos(nd.a)*dir;
  var len = 260;
  g.beginPath();
  g.moveTo(nd.x - nx*nd.hw, nd.y - ny*nd.hw);
  g.lineTo(nd.x + nx*nd.hw, nd.y + ny*nd.hw);
  g.lineTo(nd.x + nx*nd.hw + dx*len, nd.y + ny*nd.hw + dy*len);
  g.lineTo(nd.x - nx*nd.hw + dx*len, nd.y - ny*nd.hw + dy*len);
  g.closePath();
  g.fillStyle = S.color; g.fill();
  g.save(); g.clip();
  var mot = ROAD_MOTTLE(S);
  for(var t=0;t<26;t++){
    for(var q=0;q<64;q++){
      var lat = (rnd2(t,q,3)*2-1)*nd.hw;
      var run = rnd2(t,q,13)*len;
      var sz = 1.5 + rnd2(t,q,5)*3.2;
      g.fillStyle = mot[Math.floor(rnd2(t,q,23)*mot.length)];
      g.fillRect(nd.x + nx*lat + dx*run - sz/2, nd.y + ny*lat + dy*run - sz/2, sz, sz);
    }
  }
  g.restore();
}

function drawRoad(g, r, viewR){
  var nodes = r.track.nodes;
  var lo = Math.max(0, r.car.node - 60);
  var hi = Math.min(nodes.length-1, r.car.node + Math.ceil(viewR/NODE_STEP) + 24);
  if(lo === 0) drawApron(g, nodes[0], SURFACES[nodes[0].s], -1);
  if(hi === nodes.length-1)
    drawApron(g, nodes[hi], SURFACES[nodes[hi].s], 1);

  /* group consecutive nodes sharing a surface into one polygon */
  var i = lo;
  while(i < hi){
    var surfId = nodes[i].s;
    var j = i;
    while(j < hi && nodes[j+1] && nodes[j+1].s === surfId) j++;
    var end = Math.min(hi, j+1);
    var S = SURFACES[surfId];
    g.beginPath();
    for(var k=i;k<=end;k++){
      var nd = nodes[k], nx = Math.cos(nd.a), ny = Math.sin(nd.a);
      var x = nd.x - nx*nd.hw, y = nd.y - ny*nd.hw;
      if(k===i) g.moveTo(x,y); else g.lineTo(x,y);
    }
    for(var m=end;m>=i;m--){
      var nd2 = nodes[m], nx2 = Math.cos(nd2.a), ny2 = Math.sin(nd2.a);
      g.lineTo(nd2.x + nx2*nd2.hw, nd2.y + ny2*nd2.hw);
    }
    g.closePath();
    g.fillStyle = S.color;
    g.fill();

    /* Surface mottle. The reference's dirt is worked over heavily — light
       and dark patches at the same fine grain as the grass, dense enough
       that no two stretches of road look alike. Clipped to the ribbon so
       nothing spills onto the verge. */
    g.save();
    g.clip();
    var mot = ROAD_MOTTLE(S);
    for(var t=i;t<end;t++){
      var nd3 = nodes[t];
      var nxx = Math.cos(nd3.a), nyy = Math.sin(nd3.a);
      var dxx = Math.sin(nd3.a), dyy = -Math.cos(nd3.a);
      for(var q=0;q<64;q++){
        var lat = (rnd2(t,q,3)*2-1)*nd3.hw;
        var run = (rnd2(t,q,17)-0.5)*NODE_STEP;
        var sz = 1.5 + rnd2(t,q,5)*3.2;
        g.fillStyle = mot[Math.floor(rnd2(t,q,23)*mot.length)];
        g.fillRect(nd3.x + nxx*lat + dxx*run - sz/2,
                   nd3.y + nyy*lat + dyy*run - sz/2, sz, sz);
      }
    }
    /* the verge creeps in along both edges, greying the surface out */
    g.fillStyle = 'rgba(38,58,18,.34)';
    for(var f=i;f<end;f++){
      var nd7 = nodes[f], fx = Math.cos(nd7.a), fy = Math.sin(nd7.a);
      for(var fs=-1;fs<=1;fs+=2){
        var fl = fs*(nd7.hw - 5 - rnd2(f,fs+1,11)*7), fz = 5 + rnd2(f,fs+1,19)*8;
        g.fillRect(nd7.x + fx*fl - fz/2, nd7.y + fy*fl - fz/2, fz, fz);
      }
    }
    g.restore();

    /* Edges. Not a drawn line — a scatter of the surface spilling out into
       the verge and the verge biting back in, so the boundary is ragged
       the way a gravel stage's is. */
    for(var e=i;e<=end;e++){
      var n4 = nodes[e], ax = Math.cos(n4.a), ay = Math.sin(n4.a);
      for(var sd=-1;sd<=1;sd+=2){
        for(var b=0;b<2;b++){
          var sq = b*2 + (sd > 0 ? 1 : 0);
          var jt = (rnd2(e, sq, 29) - 0.42)*13;
          var bs = 3 + rnd2(e, sq, 43)*6;
          var ex = n4.x + ax*sd*(n4.hw + jt), ey = n4.y + ay*sd*(n4.hw + jt);
          g.fillStyle = jt > 0 ? S.edge : shade(S.color, -0.055);
          g.fillRect(ex - bs/2, ey - bs/2, bs, bs);
        }
      }
    }
    i = end;
  }

  drawBanner(g, nodes[0], '#d9d9d1', '#171818');
  drawBanner(g, nodes[nodes.length-1], '#d9d9d1', '#171818');
}

/* Two rows of square checks, laid across the road and no wider than it —
   the reference's line stops dead at the verge on both sides. */
function drawBanner(g, nd, ca, cb){
  var nx = Math.cos(nd.a), ny = Math.sin(nd.a);
  var dx = Math.sin(nd.a), dy = -Math.cos(nd.a);
  var n = 8, w = nd.hw*2/n;
  for(var i=0;i<n;i++){
    var lat = -nd.hw + i*w;
    for(var k=0;k<2;k++){
      g.fillStyle = ((i+k)%2===0) ? ca : cb;
      var bx = nd.x + nx*lat + dx*(k*w - w*2.15);
      var by = nd.y + ny*lat + dy*(k*w - w*2.15);
      g.save(); g.translate(bx,by); g.rotate(nd.a);
      g.fillRect(0, 0, w+0.6, w+0.6);
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
  g.save();
  g.translate(c.x, c.y);
  g.rotate(c.a);
  /* The sun is off to the left in the reference, so the car throws its own
     silhouette out to the right and a touch behind. */
  g.globalAlpha = 0.42;
  g.drawImage(sp.shadow, -ww/2 + ww*0.20, -wh/2 + wh*0.035, ww*1.02, wh*1.02);
  g.globalAlpha = 1;
  g.drawImage(sp.canvas, -ww/2, -wh/2, ww, wh);
  g.restore();
}

/* the world canvas has no rounded-rect helper of its own; the dash's one is
   defined further down the file, so keep a small local copy here */
function roundRectPath(g, x, y, w, h, r){
  r = Math.min(r, w/2, h/2);
  g.beginPath();
  g.moveTo(x+r, y);
  g.arcTo(x+w, y,   x+w, y+h, r);
  g.arcTo(x+w, y+h, x,   y+h, r);
  g.arcTo(x,   y+h, x,   y,   r);
  g.arcTo(x,   y,   x+w, y,   r);
  g.closePath();
}

function drawMinimap(g, r, W, H){
  var nodes = r.track.nodes;
  /* Sized off the viewport height, like every other overlay panel, so the
     map holds the fifth of the frame the reference gives it whatever the
     aspect. It sits under the pause button, hard against the right edge. */
  var pad = H*0.016;
  var mw = H*0.196, mh = mw;
  var x0 = W - mw - pad - H*0.016, y0 = H*0.085 + pad;
  /* fit whole track */
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
  var s = Math.min(sx,sy)*0.88;
  var ox = x0 + mw/2 - ((bb.minx+bb.maxx)/2)*s;
  var oy = y0 + mh/2 - ((bb.miny+bb.maxy)/2)*s;
  g.save();
  var br = H*0.010;                                  /* matches the DOM panels */
  roundRectPath(g, x0-pad, y0-pad, mw+2*pad, mh+2*pad, br);
  g.fillStyle = '#050b06'; g.fill();
  g.strokeStyle = '#3a4139'; g.lineWidth = Math.max(1.4, H*0.0029); g.stroke();
  g.globalAlpha = 0.88;
  g.strokeStyle = '#c9d3c2'; g.lineWidth = Math.max(1.4, H*0.0032);
  g.lineJoin = 'round'; g.lineCap = 'round';
  g.beginPath();
  for(var k=0;k<nodes.length;k+=6){
    var px = ox+nodes[k].x*s, py = oy+nodes[k].y*s;
    if(k===0) g.moveTo(px,py); else g.lineTo(px,py);
  }
  g.stroke();
  g.globalAlpha = 1;
  g.fillStyle = '#ffb432';
  var mk = Math.max(4, H*0.016);
  g.fillRect(ox+r.car.x*s-mk/2, oy+r.car.y*s-mk/2, mk, mk);
  g.restore();
}

/* ------------------------------------------------------------------ HUD */
/* the DOM half of the HUD - speed, revs and gear all live on the canvas
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
   SCENES - canvas-drawn backdrops for the garage and the parking lot.

   Both are painted once into a small offscreen canvas at chunky "scene
   pixel" resolution, then blitted up with smoothing off, so they sit at the
   same pixel density as the car sprites. Only the small animated bits (light
   flicker, dust, lamp glow) are redrawn per frame, which keeps these screens
   as cheap as the dark fill they replaced.
   ========================================================================= */

var sceneCache = {};

/* one scene pixel, in CSS px - also the scale the side-view car is drawn at */
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
   UI - screens, stage select, garage, parking lot, settings, results
   ========================================================================= */

var SCREENS = ['menu','stages','garage','lot','settings','results'];
var currentScreen = 'menu';

var screenTimers = {};
function showScreen(name){
  /* leaving the garage at all - BACK, parking lot, starting a stage - counts
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
  g.imageSmoothingEnabled = false;
  g.clearRect(0,0,mc.width,mc.height);
  g.drawImage(sp.canvas, (mc.width-sp.w)/2, (mc.height-sp.h)/2);
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
   picking something else silently drops the previous one - still no charge. */
function startPreview(pv){
  preview = pv;
  audioBeep(620, 0.05);
  renderGarage();
}
/* drop the preview without a sound - used when the screen changes under us */
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

/* Free, instantly reversible actions - fitting tyres, taking another car
   out, gear ratios - drop any preview first, so a pending purchase can
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
          /* still tappable when it is out of reach - you can look at it,
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
     the real entry - the steppers cancel any preview before they write */
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
  hint.textContent = 'Paint and decals are free, but they still go on as a preview - try them on the car, then APPLY to keep it or CANCEL to go back.';
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
      g.imageSmoothingEnabled = false;
      var sp = getCarSprite(def.id, cs.paint, cs.livery, 0, 2);
      g.drawImage(sp.canvas, (cvs.width-sp.w)/2, (cvs.height-sp.h)/2);
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
    'Buttons is the default. Tilt uses the phone gyroscope for steering; the paddles and the handbrake stay on the dash.',
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
    'On screen use the - and + paddles; on a keyboard use Q and E.',
    [['auto','AUTOMATIC'],['manual','MANUAL']], save.settings.transmission, function(v){
      save.settings.transmission = v; persist(); renderSettings();
    }));

  b.appendChild(segRow('UNITS',
    'Sets the speedometer face and the digital readout together.',
    [['mph','MPH'],['kph','KPH']], save.settings.units, function(v){
      save.settings.units = v; persist();
      if(race) resetHudControls();
      renderSettings();
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
  about.innerHTML = '<div class="hint">RALLY PIXEL - the throttle drives itself. Keyboard: arrows or A / D to steer, SHIFT, DOWN or SPACE for the handbrake, E / Q to change gear in manual, ESC to pause.</div>';
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
