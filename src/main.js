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
    lite:   shade(paint, 0.13),
    hi:     shade(paint, 0.26),
    dark:   shade(paint,-0.15),
    darker: shade(paint,-0.28),
    deep:   shade(paint,-0.44),
    accent: ACCENTS[paint] || '#ffffff',
    glass:      damageTier>=1 ? '#8ba0af' : '#4d6b86',
    glassLite:  damageTier>=1 ? '#a9bcc9' : '#6d8ba6',
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

/* Returns {canvas, w, h, scale} — a top-down car pointing UP (-Y). */
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
          /* light source from the top-left, for a bit of 16-bit modelling */
          col = ch==='H' ? c.hi : (x < 3 ? c.lite : (x > w-4 ? c.dark : c.body));
        }
      }
      else if(ch==='S') col = c.darker;
      else if(ch==='D') col = c.deep;
      else if(ch==='G') col = c.glass;
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
  if(damageTier>=1){
    g.fillStyle = 'rgba(20,24,28,.85)';
    var cx0 = Math.floor(w/2)*scale;
    for(var i=0;i<7;i++){
      g.fillRect(cx0 - Math.round((i-3)*0.9)*scale, (10 + Math.floor(i*0.3))*scale, scale, scale);
    }
  }
  if(damageTier>=2){
    g.fillStyle = 'rgba(30,26,22,.72)';
    g.fillRect(2*scale, 6*scale, scale*2, scale*3);
    g.fillRect((w-4)*scale, 20*scale, scale*2, scale*3);
    g.fillRect(4*scale, 23*scale, scale*3, scale);
    g.fillStyle = 'rgba(0,0,0,.5)';
    g.fillRect(5*scale, 3*scale, scale*3, scale*2);
  }
  return { canvas:cv, w:cv.width, h:cv.height, scale:scale, pw:w, ph:h };
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
function drawProp(g, p, theme){
  var s = p.size;
  g.save();
  g.translate(p.x, p.y);
  if(p.type===0){                                   /* conifer, seen from above */
    var v = p.seed;
    var greens = theme==='snowpass'
      ? [['#16301f','#2c5741','#4a7f63','#dceaf4'],['#132a1c','#26503b','#417559','#cfe2ef']]
      : theme==='mountain'
      ? [['#162c18','#2b4a2e','#436c44','#5b8a58'],['#132714','#264226','#3c633c','#527d4e']]
      : [['#14300f','#254d24','#3d7a39','#569b47'],['#102a10','#1f451f','#356b33','#4c8c41']];
    var pal = greens[v < 0.5 ? 0 : 1];
    /* drop shadow, offset toward bottom-right for a 3/4 feel */
    g.fillStyle = 'rgba(0,0,0,.33)';
    g.fillRect(-s*0.42+s*0.20, -s*0.42+s*0.26, s*0.84, s*0.84);
    /* trunk peeking out */
    g.fillStyle = theme==='snowpass' ? '#4a3a2c' : '#3f2d1e';
    g.fillRect(-s*0.09, s*0.20, s*0.18, s*0.30);
    /* canopy: stepped square rings read as a chunky pixel conifer */
    g.fillStyle = pal[0];
    g.fillRect(-s*0.50, -s*0.50, s, s);
    g.fillStyle = pal[1];
    g.fillRect(-s*0.42, -s*0.46, s*0.80, s*0.80);
    g.fillStyle = pal[2];
    g.fillRect(-s*0.30, -s*0.38, s*0.56, s*0.56);
    g.fillStyle = pal[3];
    g.fillRect(-s*0.16, -s*0.30, s*0.26, s*0.26);
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
   HUD — DASHBOARD

   One canvas across the foot of the screen carries the whole dash. It is
   painted on an integer pixel grid: every element is a run of whole cells
   and the grid is blitted to the device with nearest-neighbour scaling, so
   the dash keeps the same pixel size as the car and the scenery and nothing
   is ever antialiased.

   The design is laid out against a nominal 300 x 79 cell grid. The real
   grid is whatever the viewport gives us, so the three banks are anchored
   independently - steering and gear to the left edge, the binnacle to the
   middle, lever and status panels to the right edge - and spare width opens
   the gaps between them rather than stretching the art.

   Cost control: everything that never changes (frame, seams, dial faces,
   panel shells, labels) is painted once into an offscreen bitmap and
   blitted as a single image each frame. The three moving controls keep
   their own small bitmaps and only repaint when their state actually
   changes. Only the needles, lit segments, gear marker and digits are
   redrawn from scratch every frame.
   ========================================================================= */

var DC = {
  base:'#242b33', baseHi:'#2f3841', baseLo:'#1a2028', deep:'#12171d',
  seam:'#0a0d11', bevel:'#5c6874', bevelHi:'#8e9caa',
  inset:'#161c23', insetLo:'#0b0f14',
  steel:'#98a3af', steelHi:'#d7e0e9', steelTop:'#f1f5fa',
  steelLo:'#5a646f', steelDk:'#2f3740',
  glass:'#070a0e', glassHi:'#101620',
  tick:'#e9eff5', tickDim:'#8d99a5', tickRed:'#c8362a',
  num:'#f2f6fa', numDim:'#b0bbc6',
  needle:'#dd3327', needleHi:'#ff7a60', hub:'#242b32',
  amber:'#ffb432', amberLo:'#8a5f1a', amberDim:'#4d3a12',
  green:'#5fe070', greenLo:'#2c7a38', greenDim:'#183220',
  red:'#e0463a', redLo:'#7a2018', redPanel:'#3a1410', redDim:'#2a0f0c',
  blue:'#3f7fe0', blueHi:'#8cbcff', blueDim:'#16233a',
  grey:'#7d8791', greyLo:'#4a535c', greyDim:'#333b44', label:'#c3ccd5'
};

/* ------------------------------------------------------------------ font
   A 3x5 pixel face, variable width so M, N and W keep their diagonals.
   Every glyph is a list of row strings; a 1 is an inked cell. Nothing in
   the dash uses the browser's text rendering, so no label is ever smoothed. */
var FONT = {
  '0':['111','101','101','101','111'], '1':['010','110','010','010','111'],
  '2':['111','001','111','100','111'], '3':['111','001','111','001','111'],
  '4':['101','101','111','001','001'], '5':['111','100','111','001','111'],
  '6':['111','100','111','101','111'], '7':['111','001','010','010','010'],
  '8':['111','101','111','101','111'], '9':['111','101','111','001','111'],
  'A':['010','101','111','101','101'], 'B':['110','101','110','101','110'],
  'C':['011','100','100','100','011'], 'D':['110','101','101','101','110'],
  'E':['111','100','110','100','111'], 'F':['111','100','110','100','100'],
  'G':['011','100','101','101','011'], 'H':['101','101','111','101','101'],
  'I':['111','010','010','010','111'], 'J':['001','001','001','101','010'],
  'K':['101','101','110','101','101'], 'L':['100','100','100','100','111'],
  'M':['10001','11011','10101','10001','10001'],
  'N':['1001','1101','1011','1001','1001'],
  'O':['010','101','101','101','010'], 'P':['110','101','110','100','100'],
  'Q':['010','101','101','011','001'], 'R':['110','101','110','101','101'],
  'S':['011','100','010','001','110'], 'T':['111','010','010','010','010'],
  'U':['101','101','101','101','011'], 'V':['101','101','101','101','010'],
  'W':['10001','10001','10101','11011','10001'],
  'X':['101','101','010','101','101'], 'Y':['101','101','010','010','010'],
  'Z':['111','001','010','100','111'],
  ' ':['00','00','00','00','00'], '.':['0','0','0','0','1'],
  '-':['000','000','111','000','000'], '+':['010','010','111','010','010'],
  '/':['001','001','010','100','100'], ':':['0','1','0','1','0'],
  '(':['01','10','10','10','01'], ')':['10','01','01','01','10'],
  'X1':['101','010','101'] /* unused placeholder, keeps the map homogeneous */
};
var FONT_H = 5;

function glyphW(ch){ var g = FONT[ch]; return g ? g[0].length : 3; }
function textW(s, k, sp){
  k = k || 1; sp = sp == null ? 1 : sp;
  var w = 0;
  for(var i=0;i<s.length;i++) w += glyphW(s.charAt(i))*k + (i ? sp*k : 0);
  return w;
}
/* draw a string with its top-left at x,y, each font cell k grid cells wide */
function pxText(px, s, x, y, col, k, sp){
  k = k || 1; sp = sp == null ? 1 : sp;
  var cx = x;
  for(var i=0;i<s.length;i++){
    var ch = s.charAt(i), gl = FONT[ch];
    if(gl){
      for(var r=0;r<FONT_H;r++){
        var row = gl[r], run = 0;
        for(var c=0;c<=row.length;c++){
          if(c < row.length && row.charAt(c) === '1'){ run++; continue; }
          if(run){ px(cx + (c-run)*k, y + r*k, run*k, k, col); run = 0; }
        }
      }
    }
    cx += glyphW(ch)*k + sp*k;
  }
}
function pxTextC(px, s, cx, y, col, k, sp){
  pxText(px, s, Math.round(cx - textW(s,k,sp)/2), y, col, k, sp);
}
/* Centre a label inside a panel, tightening the letter spacing before
   giving up. Panel titles are the one place the design runs out of room. */
function pxTextFit(px, s, cx, y, w, col, k){
  var sp = textW(s,k,1) <= w ? 1 : 0;
  pxText(px, s, Math.round(cx - textW(s,k,sp)/2), y, col, k, sp);
}

/* -------------------------------------------------------- raster helpers
   All of them take a painter that lands on whole grid cells, so a caller
   can never accidentally draw a half pixel. */
function rasterInto(g, S){
  return function(x,y,w,h,col){
    if(w <= 0 || h <= 0) return;
    g.fillStyle = col;
    g.fillRect(Math.round(x)*S, Math.round(y)*S, Math.round(w)*S, Math.round(h)*S);
  };
}
function pxDisc(px, cx, cy, r, col){
  for(var y=-r; y<=r; y++){
    var w = Math.floor(Math.sqrt(Math.max(0, r*r - y*y)));
    px(cx-w, cy+y, w*2+1, 1, col);
  }
}
function pxRing(px, cx, cy, r, t, col){
  var ri = r - t;
  for(var y=-r; y<=r; y++){
    var wo = Math.floor(Math.sqrt(Math.max(0, r*r - y*y)));
    var wi = Math.abs(y) <= ri ? Math.floor(Math.sqrt(Math.max(0, ri*ri - y*y))) : -1;
    if(wi < 0){ px(cx-wo, cy+y, wo*2+1, 1, col); }
    else { px(cx-wo, cy+y, wo-wi, 1, col); px(cx+wi+1, cy+y, wo-wi, 1, col); }
  }
}
/* an annulus limited to an angle span, walked cell by cell */
function pxArc(px, cx, cy, r, t, a0, a1, col){
  var steps = Math.max(6, Math.round(Math.abs(a1-a0)*r*1.7));
  for(var i=0;i<=steps;i++){
    var a = a0 + (a1-a0)*i/steps, ca = Math.cos(a), sa = Math.sin(a);
    for(var k=0;k<t;k++)
      px(Math.round(cx+ca*(r-k)), Math.round(cy+sa*(r-k)), 1, 1, col);
  }
}
/* a radial run of cells, used for every tick mark and for the needles */
function pxRadial(px, cx, cy, a, r0, r1, w, col){
  var ca = Math.cos(a), sa = Math.sin(a);
  var n = Math.max(1, Math.round(Math.abs(r1-r0)));
  for(var i=0;i<=n;i++){
    var r = r0 + (r1-r0)*i/n;
    px(Math.round(cx+ca*r - (w-1)/2), Math.round(cy+sa*r - (w-1)/2), w, w, col);
  }
}
/* a panel with one-cell stepped corners: pixel art's answer to a rounded
   rect, with a lit top edge and a shaded foot */
function pxPanel(px, x, y, w, h, fill, hi, lo, edge){
  px(x+1, y,     w-2, 1,   edge);
  px(x,   y+1,   1,   h-2, edge);
  px(x+w-1, y+1, 1,   h-2, edge);
  px(x+1, y+h-1, w-2, 1,   edge);
  px(x+1, y+1,   w-2, h-2, fill);
  if(hi) px(x+1, y+1, w-2, 1, hi);
  if(lo) px(x+1, y+h-2, w-2, 1, lo);
}

/* =========================================================================
   LAYOUT
   ========================================================================= */

/* Share of the viewport the dash occupies. The mockup gives it the bottom
   forty percent; on a squarer tablet the content runs out of width first
   and the band ends up a little shorter, which is handled below. */
var DASH_FRAC = 0.40;
/* the nominal design grid every position below is quoted against */
var DASH_NOM_W = 300, DASH_NOM_H = 79, DASH_NOM_OVER = 30;

/* Dash cell size in CSS pixels. Tied to viewport height so the dash art
   stays in the same pixel family as the car sprite and the scenery props,
   which are also sized off the viewport. It runs one step finer than the
   world grid: the dash carries lettering, and a 3x5 face at the world's
   own cell size would not leave room for a word like THROTTLE. */
function dashPixel(vh){ return clamp(Math.round(vh/300), 2, 4); }

var dash = { cv:null, g:null, base:null, L:null, key:'', S:1,
             nRpm:0, nSpd:0, nBoost:0, heat:0 };

function dashLayout(){
  var vw = view.w || window.innerWidth || 800;
  var vh = view.h || window.innerHeight || 400;
  var PX = dashPixel(vh);
  var GW = Math.ceil(vw/PX);
  /* Content scale. Whichever axis runs out first decides it: on a wide
     phone that is the height, and the spare width simply opens the gaps
     between the three banks; on a 4:3 tablet it is the width, and the
     whole dash sits a little shorter than forty percent. */
  var U = Math.min((vh*DASH_FRAC/PX)/DASH_NOM_H, GW/(DASH_NOM_W+6));
  var u = function(n){ return Math.round(n*U); };
  var GH = u(DASH_NOM_H), OVER = u(DASH_NOM_OVER);

  var L = { PX:PX, GW:GW, GH:GH, OVER:OVER, U:U, u:u, CH:GH+OVER, top:OVER };
  var top = OVER;

  /* How far the two edge banks are inset. On a screen wider than the design
     needs, they walk in by a third of the surplus rather than staying pinned
     to the glass, so a 20:9 phone does not leave a dead gap in the middle of
     the dash while still keeping the arrows inside easy thumb reach. */
  var spread = Math.max(0, GW - u(DASH_NOM_W));
  var inset  = u(6) + Math.round(spread*0.34);

  /* -------------------------------------------------- centre binnacle
     Laid out first: the gear column and the lever hang off it, the way
     they sit against the binnacle on the mockup. */
  var C = Math.round(GW/2);
  L.C = C;
  L.R = u(28);
  L.dialY = top + u(20);
  L.tachX = C - u(42);
  L.spdX  = C + u(42);
  L.stack = { x:C-u(13), w:u(26),
              shiftY:top+u(1),  shiftH:u(6),
              chevY: top+u(9),  chevH:u(7),
              segY:  top+u(18), segH:u(5),
              boxY:  top+u(26), boxH:u(21) };
  /* the boost gauge tucks under the speedo's outer shoulder, and has to
     stay clear of the status panels' top edge */
  L.boost = { x:C+u(86), y:top+u(34), r:u(14) };
  L.housing = { x0:L.tachX-L.R-u(4), x1:L.spdX+L.R+u(4), rise:u(9) };
  /* paddles: mounted just outboard of the dial pair, breaking up into the
     world above the dash line */
  L.padW = u(19); L.padH = u(38); L.padStalk = u(9);
  L.padL = { x:C-u(82)-Math.round(L.padW/2), y:top-u(26), w:L.padW, h:L.padH };
  L.padR = { x:C+u(82)-Math.round(L.padW/2), y:top-u(26), w:L.padW, h:L.padH };

  /* ------------------------------------------------------- left bank */
  var lx = inset;
  L.steerL = { x:lx,       y:top+u(17), w:u(17), h:u(34) };
  L.steerR = { x:lx+u(19), y:top+u(17), w:u(17), h:u(34) };
  L.led    = { x:lx+u(5), y:top+u(11), n:5, w:u(4), h:u(3), gap:u(3) };
  L.gear   = { x:L.tachX-L.R-u(6)-u(20), y:top+u(12), w:u(20), h:u(41), rowH:u(6) };
  L.leftEdge = L.steerR.x + L.steerR.w;

  /* ------------------------------------------------------ right bank */
  var rx = GW - inset;
  var sw = u(30), sg = u(2);
  L.stat = { y:top+u(52), h:u(24), w:sw, gap:sg };
  L.stat.x2 = rx - sw;
  L.stat.x1 = L.stat.x2 - sw - sg;
  L.stat.x0 = L.stat.x1 - sw - sg;
  /* the lever sits between the boost gauge and the panels, never on top of
     either, however tight the grid gets */
  var hbW = u(36);
  var hbX = Math.min(rx - u(6) - hbW, Math.max(L.boost.x + L.boost.r + u(3), L.stat.x2));
  L.hb = { x:hbX, y:top+u(25), w:hbW, h:u(16), rise:u(20) };
  L.hb.slotOff = Math.round(L.hb.h*0.34);
  L.hb.slotH   = Math.max(3, Math.round(L.hb.h*0.30));

  /* ------------------------------------------------- indicator strip */
  var isW = u(129), isH = u(14);
  var isC = Math.round((L.leftEdge + L.stat.x0)/2);
  L.strip = { x:isC-Math.round(isW/2), y:top+u(57), w:isW, h:isH };

  /* screen-space origin, so hit boxes and the camera can be worked out
     from the same numbers the art is drawn with */
  L.originX = Math.round((vw - GW*PX)/2);
  L.originY = vh - L.CH*PX;
  return L;
}

/* How much of the screen bottom the dash claims, including the raised
   gauge housing, so the chase camera can keep the car clear of it. */
function dashBandH(){
  var L = dash.L || dashLayout();
  return (L.GH + L.housing.rise)*L.PX + 4;
}

/* =========================================================================
   STATIC ART
   ========================================================================= */

/* --- dial faces -------------------------------------------------------- */
/* 135deg round through the bottom to 45deg, the sweep every road instrument
   uses. Shared by the tacho, the speedo and the boost gauge. */
var DIAL_A0 = Math.PI*0.75, DIAL_SWEEP = Math.PI*1.5;
function dialAngle(v, min, max){ return DIAL_A0 + DIAL_SWEEP*clamp((v-min)/(max-min),0,1); }

/* The tacho reads in thousands of rpm. race.rpm is a fraction of redline,
   so redline lands exactly on the 7 and the dial runs on to 8. */
var TACH_MAX = 8, TACH_RED = 7, TACH_SCALE = 7;
var BOOST_MAX = 20;

function paintDial(px, cx, cy, R, o){
  var i, v, a, maj, red, len, r0, r1, lr;
  var bw = Math.max(2, Math.round(R*0.10));

  /* chrome bezel: stepped rings rather than a gradient, with a bright
     catch across the top left and a shaded shoulder at the bottom right */
  pxDisc(px, cx, cy, R, DC.steelDk);
  pxDisc(px, cx, cy, R-1, DC.steel);
  pxArc(px, cx, cy, R-1, Math.max(1,bw-1), Math.PI*0.99, Math.PI*1.94, DC.steelHi);
  pxArc(px, cx, cy, R-1, Math.max(1,bw-1), Math.PI*0.06, Math.PI*0.84, DC.steelLo);
  pxDisc(px, cx, cy, R-bw, DC.glassHi);
  pxDisc(px, cx, cy, R-bw-1, DC.glass);

  var trackR = R - bw - 2;
  var redTh  = o.redFrom != null ? Math.max(2, Math.round(R*0.08)) : 0;
  /* redline band, painted on the outer track of the face */
  if(o.redFrom != null){
    pxArc(px, cx, cy, trackR, redTh,
          dialAngle(o.redFrom,o.min,o.max), dialAngle(o.max,o.min,o.max), DC.tickRed);
  }

  var steps = Math.round((o.max-o.min)/o.minor);
  var majEvery = Math.round(o.major/o.minor);
  var labEvery = majEvery*(o.labelEvery||1);
  var tk = R >= 20 ? 1 : 1;
  for(i=0;i<=steps;i++){
    v = o.min + i*o.minor;
    maj = (i % majEvery) === 0;
    red = o.redFrom != null && v >= o.redFrom - 1e-6;
    a = dialAngle(v,o.min,o.max);
    len = o.small ? (maj ? 2 : 1)
                  : (maj ? Math.max(3, Math.round(R*0.09)) : Math.max(1, Math.round(R*0.05)));
    r1 = trackR - (redTh ? redTh + 1 : 1);
    r0 = r1 - len;
    pxRadial(px, cx, cy, a, r0, r1, maj ? 2 : 1,
             red ? (maj ? DC.red : DC.tickRed) : (maj ? DC.tick : DC.tickDim));
    if(maj && (i % labEvery) === 0 && o.numbers !== false){
      lr = r0 - 3;
      var s = String(Math.round(v));
      pxText(px, s,
             Math.round(cx + Math.cos(a)*lr - textW(s,o.numK||1)/2),
             Math.round(cy + Math.sin(a)*lr - FONT_H*(o.numK||1)/2),
             red ? '#ff8b78' : DC.num, o.numK||1);
    }
  }

  if(o.label) pxTextC(px, o.label, cx, cy - Math.round(R*(o.small?0.46:0.42)), DC.label, 1);
  if(o.sub)   pxTextC(px, o.sub,   cx, cy + Math.round(R*(o.small?0.44:0.34)), DC.numDim, 1);
  /* a single crescent of glass reflection across the top left, dithered so
     it stays pixel art rather than a soft glow */
  var gr = trackR - Math.max(1, Math.round(R*0.10));
  var a0 = Math.PI*1.02, a1 = Math.PI*1.62, n = Math.round((a1-a0)*gr*1.3);
  for(i=0;i<=n;i++){
    var ga = a0 + (a1-a0)*i/n;
    if(i & 1) continue;
    px(Math.round(cx+Math.cos(ga)*gr), Math.round(cy+Math.sin(ga)*gr), 1, 1, '#243040');
  }
}

/* --- units ------------------------------------------------------------- */
/* One place decides what the speedometer means. Both the analog face and
   the digital readout come through here, so they can never disagree. */
function speedUnits(){
  var mph = save.settings.units !== 'kph';
  return mph ? { label:'MPH', conv:0.621371, step:20, minor:5 }
             : { label:'KPH', conv:1,        step:40, minor:10 };
}
/* The dial face is fixed, the way a real speedometer is: 0-160 MPH, or the
   same dial in KPH. A slow car simply never gets round to the far end. */
function speedMax(){ return save.settings.units !== 'kph' ? 160 : 260; }

/* --- the whole static dash -------------------------------------------- */
function buildDashBase(L, S){
  var c = document.createElement('canvas');
  c.width = L.GW*S; c.height = L.CH*S;
  var g = c.getContext('2d');
  g.imageSmoothingEnabled = false;
  var px = rasterInto(g, S);
  var u = L.u, top = L.top, i, x, y;

  /* ----------------------------------------------------- the frame ---- */
  var H = L.housing;
  /* the raised gauge housing first, so the flat top edge caps it cleanly */
  px(H.x0, top-H.rise, H.x1-H.x0, H.rise, DC.base);
  px(H.x0+2, top-H.rise, H.x1-H.x0-4, 1, DC.bevelHi);
  px(H.x0+1, top-H.rise+1, H.x1-H.x0-2, 1, DC.bevel);
  px(H.x0, top-H.rise+1, 1, H.rise, DC.baseLo);
  px(H.x1-1, top-H.rise+1, 1, H.rise, DC.seam);
  /* the shoulders where the bulge meets the flat top */
  px(H.x0-2, top-2, 2, 2, DC.baseHi);
  px(H.x1, top-2, 2, 2, DC.baseHi);

  px(0, top, L.GW, L.GH, DC.base);
  px(0, top, L.GW, 1, DC.bevelHi);              /* lit bevel along the top */
  px(0, top+1, L.GW, 1, DC.bevel);
  px(0, top+2, L.GW, 1, DC.baseHi);
  /* the body darkens towards the bottom in flat bands, no gradient */
  px(0, top+Math.round(L.GH*0.34), L.GW, Math.round(L.GH*0.30), DC.baseLo);
  px(0, top+Math.round(L.GH*0.64), L.GW, L.GH-Math.round(L.GH*0.64), DC.deep);
  px(0, top+Math.round(L.GH*0.34), L.GW, 1, DC.seam);
  px(0, top+Math.round(L.GH*0.64), L.GW, 1, DC.seam);
  px(0, top+Math.round(L.GH*0.34)+1, L.GW, 1, '#2a323b');
  px(0, top+Math.round(L.GH*0.64)+1, L.GW, 1, '#1e242b');

  /* vertical panel seams, so the dash reads as mouldings bolted together */
  var seams = [L.leftEdge+u(3), H.x0-u(3), H.x1+u(3), L.stat.x0-u(4)];
  for(i=0;i<seams.length;i++){
    x = seams[i];
    if(x < u(4) || x > L.GW-u(4)) continue;
    px(x, top+3, 1, L.GH-3, DC.seam);
    px(x+1, top+3, 1, L.GH-3, '#2c353e');
  }

  /* ------------------------------------------------ left bank shells -- */
  paintSteerShell(px, L.steerL);
  paintSteerShell(px, L.steerR);
  /* the five indicator lamps sit in a recessed strip above the arrows */
  var lb = L.led, lbw = lb.n*lb.w + (lb.n-1)*lb.gap;
  pxPanel(px, lb.x-2, lb.y-2, lbw+4, lb.h+4, DC.insetLo, null, null, DC.seam);

  /* gear selector column */
  var G = L.gear;
  pxPanel(px, G.x, G.y, G.w, G.h, DC.inset, '#232b33', DC.insetLo, DC.seam);
  pxTextFit(px, 'GEAR', G.x+G.w/2, G.y+2, G.w-2, DC.label, 1);

  /* ----------------------------------------------------- instruments -- */
  paintDial(px, L.tachX, L.dialY, L.R, {
    min:0, max:TACH_MAX, major:1, minor:0.5, redFrom:TACH_RED,
    label:'RPM', sub:'X1000'
  });
  var un = speedUnits(), smax = speedMax();
  paintDial(px, L.spdX, L.dialY, L.R, {
    min:0, max:smax, major:un.step, minor:un.minor,
    labelEvery:1, label:un.label
  });
  paintDial(px, L.boost.x, L.boost.y, L.boost.r, {
    /* too small to carry numbers as well as its captions: the ticks and
       the two labels are what make it read as a boost gauge */
    min:0, max:BOOST_MAX, major:10, minor:5, numbers:false, small:true,
    label:'BOOST', sub:'PSI'
  });

  /* ---------------------------------------------------- centre stack -- */
  var K = L.stack;
  pxPanel(px, K.x, K.shiftY, K.w, K.shiftH, DC.insetLo, '#1d242c', null, DC.steelDk);
  pxTextFit(px, 'SHIFT', K.x+K.w/2, K.shiftY+Math.round((K.shiftH-FONT_H)/2), K.w-2, DC.label, 1);
  /* segment trough */
  pxPanel(px, K.x, K.segY, K.w, K.segH, DC.insetLo, null, null, DC.seam);
  /* digital readout housing */
  pxPanel(px, K.x, K.boxY, K.w, K.boxH, DC.glass, null, null, DC.steel);
  px(K.x+1, K.boxY+1, K.w-2, 1, DC.steelLo);
  pxTextC(px, un.label, K.x+K.w/2, K.boxY+K.boxH-FONT_H-2, DC.numDim, 1);

  /* ------------------------------------------------- handbrake slot --- */
  var B = L.hb;
  pxPanel(px, B.x, B.y, B.w, B.h, DC.baseLo, DC.baseHi, DC.seam, DC.seam);
  /* the recessed slot the lever runs in */
  var slotY = B.y + B.slotOff, slotH = B.slotH;
  px(B.x+3, slotY, B.w-6, slotH, DC.insetLo);
  px(B.x+3, slotY, B.w-6, 1, DC.seam);
  px(B.x+3, slotY+slotH-1, B.w-6, 1, '#2b333c');
  for(x=B.x+5; x<B.x+B.w-5; x+=3) px(x, slotY+1, 1, slotH-2, '#12171d');
  px(B.x+2, B.y+B.h-3, B.w-4, 1, DC.seam);

  /* ---------------------------------------------- indicator strip ----- */
  var T = L.strip;
  pxPanel(px, T.x, T.y, T.w, T.h, DC.insetLo, '#1c232a', DC.seam, DC.seam);

  /* ------------------------------------------------- status panels ---- */
  var names = ['TRACTION','DIFF','THROTTLE'];
  var xs = [L.stat.x0, L.stat.x1, L.stat.x2];
  for(i=0;i<3;i++){
    var sx = xs[i], sy = L.stat.y, sw = L.stat.w, sh = L.stat.h;
    pxPanel(px, sx, sy, sw, sh, DC.inset, '#242c35', DC.insetLo, DC.seam);
    pxTextFit(px, names[i], sx+sw/2, sy+2, sw-4, DC.label, 1);
    px(sx+2, sy+FONT_H+3, sw-4, 1, DC.seam);
  }
  var icy = L.stat.y + Math.round(L.stat.h*0.52);
  paintTractionIcon(px, xs[0]+Math.round(L.stat.w/2),    icy, L.U);
  paintDiffIcon(px,     xs[1]+Math.round(L.stat.w/2),    icy, L.U);
  paintPedalIcon(px,    xs[2]+Math.round(L.stat.w*0.70), icy, L.U);

  return c;
}

/* ------------------------------------------------------- shell helpers */
function paintSteerShell(px, S){
  /* the housing the button sits in; the button face itself is live art */
  px(S.x-1, S.y-1, S.w+2, S.h+2, DC.seam);
  px(S.x-1, S.y-1, S.w+2, 1, DC.bevel);
}

/* A car seen from behind with two skid trails under it, the traction
   control tell-tale every road car uses. */
function paintTractionIcon(px, cx, cy, U){
  var k = Math.max(1, Math.round(U*1.1));
  var bw = 6*k, bh = 5*k;
  var x = cx - Math.round(bw/2), y = cy - 4*k;
  px(x+k, y, bw-2*k, k, DC.green);             /* roof */
  px(x, y+k, bw, 2*k, DC.green);               /* cabin */
  px(x+k, y+k, bw-2*k, k, DC.greenLo);         /* glass */
  px(x, y+3*k, bw, bh-3*k, DC.green);          /* body */
  px(x-k, y+2*k, k, 2*k, DC.green);            /* mirrors */
  px(x+bw, y+2*k, k, 2*k, DC.green);
  /* the two skid trails, offset so they read as a wiggle */
  px(x+k,      y+bh+k,   k, k, DC.green);
  px(x+bw-2*k, y+bh+k,   k, k, DC.green);
  px(x+2*k,    y+bh+2*k, k, k, DC.green);
  px(x+bw-3*k, y+bh+2*k, k, k, DC.green);
  px(x+k,      y+bh+3*k, k, k, DC.green);
  px(x+bw-2*k, y+bh+3*k, k, k, DC.green);
}
/* Four hubs, two axles and a centre diff: the drivetrain schematic. */
function paintDiffIcon(px, cx, cy, U){
  var k = Math.max(1, Math.round(U*1.1));
  var w = 8*k, h = 7*k;
  var x = cx - Math.round(w/2), y = cy - Math.round(h/2);
  px(x+k, y, w-2*k, k, DC.grey);               /* front axle */
  px(x+k, y+h-k, w-2*k, k, DC.grey);           /* rear axle */
  px(cx-Math.round(k/2), y+k, k, h-2*k, DC.grey);      /* prop shaft */
  px(cx-2*k, Math.round(cy-1.5*k), 4*k, 3*k, DC.steel);/* centre diff */
  px(cx-k, cy-Math.round(k/2), 2*k, k, DC.greyDim);
  px(x, y-k, 2*k, 3*k, DC.greyLo);             /* hubs */
  px(x+w-2*k, y-k, 2*k, 3*k, DC.greyLo);
  px(x, y+h-2*k, 2*k, 3*k, DC.greyLo);
  px(x+w-2*k, y+h-2*k, 2*k, 3*k, DC.greyLo);
}
/* A hinged throttle pedal on its floor mount. */
function paintPedalIcon(px, cx, cy, U){
  var k = Math.max(1, Math.round(U*1.1));
  var w = 3*k, h = 9*k;
  var x = cx - Math.round(w/2), y = cy - Math.round(h/2);
  px(x-1, y-1, w+2, h+2, DC.seam);
  px(x, y, w, h, DC.greyLo);                   /* pedal plate */
  px(x, y, w, k, DC.steel);                    /* lit top */
  px(x, y, 1, h, DC.grey);
  for(var i=y+2*k; i<y+h-k; i+=2*k) px(x+1, i, w-2, 1, DC.greyDim);
  px(x-k, y+h-2*k, k, 2*k, DC.greyDim);        /* floor hinge */
}

/* =========================================================================
   LIVE ART
   ========================================================================= */

var hudCtl = { hb:0, padUp:0, padDn:0, steerL:0, steerR:0, throttle:0 };

/* Small pieces whose art only changes when their control does. Each keeps
   its own bitmap so a frame costs a blit rather than a few hundred rects. */
var dashArt = {};
function artPiece(name, key, w, h, S, paint){
  var a = dashArt[name];
  if(!a || a.key !== key || a.w !== w || a.h !== h || a.S !== S){
    var c = document.createElement('canvas');
    c.width = Math.max(1, w*S); c.height = Math.max(1, h*S);
    var g = c.getContext('2d');
    g.imageSmoothingEnabled = false;
    paint(rasterInto(g, S), w, h);
    a = dashArt[name] = { key:key, w:w, h:h, S:S, cv:c };
  }
  return a.cv;
}
function blitArt(g, cv, x, y, S){ g.drawImage(cv, x*S, y*S); }

/* --------------------------------------------------------- needle ----- */
function paintNeedle(px, cx, cy, R, ang, col, hi){
  var len = Math.round(R*0.80);
  var tail = Math.round(R*0.16);
  var hubR = Math.max(2, Math.round(R*0.14));
  var i, w;
  /* the blade tapers from two cells at the hub down to one at the tip */
  for(i=-tail; i<=len; i++){
    w = i > len*0.55 ? 1 : 2;
    px(Math.round(cx + Math.cos(ang)*i - (w-1)/2),
       Math.round(cy + Math.sin(ang)*i - (w-1)/2), w, w, i < 0 ? DC.hub : col);
  }
  pxDisc(px, cx, cy, hubR, DC.steelLo);
  pxDisc(px, cx, cy, Math.max(1, hubR-1), DC.hub);
  px(cx-1, cy-hubR, 2, 1, hi || DC.steelHi);
}

/* --------------------------------------------------- steering button -- */
function paintSteerFace(px, w, h, right, pressed){
  var face = pressed ? '#414c57' : '#2b333c';
  /* stepped corners: the mockup's rounded verticals, in whole cells */
  px(2, 0, w-4, 1, DC.steelLo);
  px(1, 1, w-2, 1, DC.steelLo);
  px(0, 2, w, h-4, DC.steelLo);
  px(1, h-2, w-2, 1, DC.steelLo);
  px(2, h-1, w-4, 1, DC.steelLo);
  var d = pressed ? 1 : 0;
  px(3, 2+d, w-6, h-5, face);
  px(3, 2+d, w-6, 1, pressed ? '#59646f' : '#4d5761');   /* top bevel */
  px(3, h-3+d, w-6, 1, '#1a2027');                        /* foot shadow */
  px(2, 3+d, 1, h-7, pressed ? '#4d5761' : '#3d4650');
  px(w-3, 3+d, 1, h-7, '#1a2027');

  /* solid triangle glyph, column by column so the edge stays crisp */
  var n = Math.max(4, Math.round(w*0.42));
  var ink = pressed ? '#f4f8fc' : '#c4ced8';
  var cy = Math.round(h/2) + d;
  var ax = Math.round(w/2) + (right ? -Math.round(n/2) : Math.round(n/2));
  for(var i=0;i<n;i++){
    var hh = (n-i)*2 - 1;
    px(right ? ax+i : ax-i, cy - Math.floor(hh/2), 1, hh, ink);
  }
}

/* ------------------------------------------------------ shift paddle --
   A tapered alloy wedge, wider at the top and raked outward, on a stalk
   that runs down into the dash. Left is marked -, right +. */
function paintPaddle(px, w, h, up, press, active){
  var stalkH = Math.max(5, Math.round(h*0.24));
  var bladeH = h - stalkH;
  var down = press > 0.4;
  var y, t, rowW, x0, lean;
  var edge   = down ? '#6d5210' : '#04070a';
  var face   = down ? '#e0a52c' : (active ? '#39424b' : '#333b43');
  var faceHi = down ? '#ffd487' : (active ? '#4c5660' : '#434c55');
  var bevel  = down ? '#fff0c8' : (active ? '#c6d0da' : '#98a2ac');
  var shade  = down ? '#8a6416' : '#14191f';
  var lean0  = Math.round(w*0.30);

  /* Mounting stalk: a short square post on the inboard side that runs down
     past the dash line, so the blade reads as bolted to the column. */
  var stW = Math.max(3, Math.round(w*0.30));
  var stX = up ? w - stW - Math.round(w*0.08) : Math.round(w*0.08);
  px(stX-1, bladeH-2, stW+2, stalkH+2, edge);
  px(stX, bladeH-1, stW, stalkH+1, DC.steelDk);
  px(stX, bladeH-1, 1, stalkH+1, DC.steelLo);
  px(stX+stW-1, bladeH-1, 1, stalkH+1, '#12171d');

  /* The blade. Wide at the top, tapering down, and each row steps outward
     so the whole wedge rakes away from the centre of the dash. `up` is the
     left-hand blade here, the one marked minus. */
  for(y=0; y<bladeH; y++){
    t = y/(bladeH-1);
    rowW = Math.max(4, Math.round(w*(1 - t*0.26)));
    lean = Math.round(t*lean0) * (up ? 1 : -1);
    x0 = (up ? 0 : w-rowW) + lean;
    x0 = clamp(x0, 0, w-rowW);
    px(x0, y, rowW, 1, edge);                            /* cast outline */
    if(y < 1 || y > bladeH-2) continue;
    px(x0+1, y, rowW-2, 1, t < 0.45 ? faceHi : face);    /* two-tone face */
    px(x0+1, y, 1, 1, bevel);                            /* lit outboard edge */
    px(x0+rowW-2, y, 1, 1, shade);                       /* shaded inboard edge */
  }
  px(1, 1, w-2, 1, bevel);                               /* bright top lip */
  px(2, 2, w-4, 1, down ? '#ffdd9c' : (active ? '#8b96a1' : '#6f7983'));

  /* The stamped marking, low on the blade and carried out with the rake. */
  var mk = down ? '#4a3708' : (active ? '#d3dbe3' : '#8e98a2');
  var my = Math.round(bladeH*0.70);
  var mt = Math.max(1, Math.round(w*0.10));
  var mw = Math.max(4, Math.round(w*0.40));
  var mcx = Math.round(w/2) + Math.round((my/(bladeH-1))*lean0)*(up ? 1 : -1);
  px(Math.round(mcx-mw/2), Math.round(my-mt/2), mw, mt, mk);
  if(!up) px(Math.round(mcx-mt/2), Math.round(my-mw/2), mt, mw, mk);
}

/* ------------------------------------------------------- handbrake ----
   A pull lever standing in its slot: a chromed arm on a pivot down in the
   housing, raked back at rest and swinging up towards the driver as it is
   pulled. The art box covers the throw as well as the lever itself. */
function paintHandbrake(px, w, h, v, pivotUp){
  var pivotX = Math.round(w*0.50), pivotY = h - pivotUp;
  var ang = (58 + v*28) * Math.PI/180;              /* 58deg at rest */
  var dx = Math.cos(ang), dy = -Math.sin(ang);
  var len = pivotY - Math.max(4, Math.round(h*0.14));
  var i, gx, gy;
  var on = v > 0.5;
  var shaftHi = on ? '#f2f7fb' : DC.steelHi;

  /* pivot boss down in the slot */
  px(pivotX-2, pivotY-1, 5, 3, DC.steelDk);
  px(pivotX-1, pivotY, 3, 1, DC.steelLo);

  /* The arm: four cells across, dark on both flanks with a bright column
     of turned steel down the middle, so it reads as a round chromed bar. */
  var aw = Math.max(3, Math.round(w*0.13));
  for(i=0;i<=len;i++){
    gx = Math.round(pivotX + dx*i); gy = Math.round(pivotY + dy*i);
    px(gx-aw, gy-1, aw*2+1, 2, DC.seam);            /* cast outline */
    px(gx-aw+1, gy-1, aw*2-1, 2, DC.steelDk);
    px(gx-1, gy-1, 2, 2, DC.steelLo);
    px(gx, gy-1, 1, 2, shaftHi);                    /* the catch of light */
  }
  gx = Math.round(pivotX + dx*len); gy = Math.round(pivotY + dy*len);
  var gw = Math.max(5, Math.round(w*0.30)), gh = Math.max(6, Math.round(h*0.22));
  var gx0 = Math.round(gx-gw/2), gy0 = gy-gh;
  px(gx0-1, gy0-1, gw+2, gh+2, DC.seam);            /* rubber grip */
  px(gx0, gy0, gw, gh, on ? DC.amberLo : '#2b323a');
  px(gx0, gy0, gw, 1, on ? DC.amber : '#69747f');
  px(gx0, gy0, 1, gh, on ? DC.amber : '#4f5963');
  px(gx0+gw-1, gy0, 1, gh, '#12171d');
  for(i=gy0+2; i<gy0+gh-1; i+=2)                    /* moulded ribs */
    px(gx0+1, i, gw-2, 1, on ? '#6d4b12' : '#1e242b');
  px(gx0+1, gy0-2, gw-2, 2, on ? DC.amber : DC.grey);   /* release button */
  px(gx0+1, gy0-3, gw-2, 1, DC.seam);
}

/* ------------------------------------------------- indicator icons ---- */
function paintArrowGlyph(px, cx, cy, k, right, col){
  var n = 3*k;
  for(var i=0;i<n;i++){
    var hh = (n-i)*2 - 1;
    px(right ? cx-Math.round(n/2)+i : cx+Math.round(n/2)-i, cy-Math.floor(hh/2), 1, hh, col);
  }
  px(right ? cx-2*k : cx-k, cy-Math.round(k/2), 3*k, Math.max(1,k), col);
}
/* The headlamp tell-tale: a D-shaped lamp bowl throwing three beams. */
function paintHeadlightGlyph(px, cx, cy, k, col){
  var x = cx - 4*k, y = cy - 3*k;
  px(x, y, 2*k, 6*k, col);                       /* back of the bowl */
  px(x+2*k, y+k, k, 4*k, col);                   /* the domed lens */
  px(x+3*k, y+2*k, k, 2*k, col);
  for(var i=0;i<3;i++) px(x+5*k, y+k+i*2*k, 3*k, Math.max(1,k), col);
}
/* Belted occupant: a seated figure with the sash cut across the chest.
   Drawn from a bitmap so the silhouette survives at any icon size. */
var BELT_ART = [
  '0011000',
  '0011000',
  '0000000',
  '0111010',
  '1110110',
  '1101010',
  '1111110',
  '1110000',
  '1110000'
];
function paintBeltGlyph(px, cx, cy, k, col){
  var x = cx - Math.round(BELT_ART[0].length*k/2);
  var y = cy - Math.round(BELT_ART.length*k/2);
  for(var r=0;r<BELT_ART.length;r++){
    var row = BELT_ART[r], run = 0;
    for(var c=0;c<=row.length;c++){
      if(c < row.length && row.charAt(c) === '1'){ run++; continue; }
      if(run){ px(x+(c-run)*k, y+r*k, run*k, k, col); run = 0; }
    }
  }
}
/* Parking brake: a circled P inside a broken ring. */
function paintParkGlyph(px, cx, cy, k, col){
  var r = 4*k;
  pxRing(px, cx, cy, r, Math.max(1, k), col);
  px(cx-r, cy-Math.round(k/2), Math.max(1,k), k, DC.insetLo);   /* the two breaks */
  px(cx+r-k+1, cy-Math.round(k/2), Math.max(1,k), k, DC.insetLo);
  pxText(px, 'P', cx-Math.round(1.5*k), cy-Math.round(2.5*k), col, k);
}

/* =========================================================================
   FRAME
   ========================================================================= */

function ensureDash(){
  var el = document.getElementById('dash-cv');
  if(!el) return false;
  var S = Math.max(1, Math.round(Math.min(window.devicePixelRatio || 1, 2)));
  var key = Math.round(view.w)+'x'+Math.round(view.h)+'@'+S+'/'+
            save.settings.units+'/'+Math.round(speedMax());
  if(key !== dash.key || dash.cv !== el || !dash.base){
    var L = dashLayout();
    dash.cv = el; dash.L = L; dash.S = S;
    el.width = L.GW*S; el.height = L.CH*S;
    el.style.width = (L.GW*L.PX)+'px';
    el.style.height = (L.CH*L.PX)+'px';
    el.style.left = L.originX+'px';
    dash.g = el.getContext('2d');
    dash.base = buildDashBase(L, S);
    dash.key = key;
    dashArt = {};
    layoutHitBoxes(L);
    document.documentElement.style.setProperty('--dash-h', (L.GH*L.PX)+'px');
  }
  dash.g.imageSmoothingEnabled = false;
  return true;
}

function drawDash(r){
  if(!ensureDash()) return;
  var L = dash.L, S = dash.S, g = dash.g, u = L.u, i, x, y;
  var px = rasterInto(g, S);
  g.clearRect(0, 0, L.GW*S, L.CH*S);
  g.drawImage(dash.base, 0, 0);

  var spd  = r ? Math.abs(r.car.fwd) : 0;
  var thr  = r ? r.throttle : 0;
  var un   = speedUnits();

  /* ---------------------------------------------------- steering ------ */
  var sl = artPiece('steerL', input.left?1:0, L.steerL.w, L.steerL.h, S, function(p,w,h){
    paintSteerFace(p, w, h, false, input.left);
  });
  blitArt(g, sl, L.steerL.x, L.steerL.y, S);
  var sr = artPiece('steerR', input.right?1:0, L.steerR.w, L.steerR.h, S, function(p,w,h){
    paintSteerFace(p, w, h, true, input.right);
  });
  blitArt(g, sr, L.steerR.x, L.steerR.y, S);

  /* ------------------------------------------------------- LED bar ---- */
  /* five lamps that fill with road speed, the dash's rev-and-go tell-tale */
  var lb = L.led, lit = Math.round(clamp(spd/Math.max(1,(r?r.stats.topSpeed:200)),0,1)*lb.n);
  for(i=0;i<lb.n;i++){
    x = lb.x + i*(lb.w+lb.gap);
    px(x, lb.y, lb.w, lb.h, i < lit ? DC.green : DC.greenDim);
    if(i < lit) px(x, lb.y, lb.w, 1, '#b6ffc2');
  }

  /* --------------------------------------------------- gear selector -- */
  var G = L.gear;
  var rows = gearRows(r);
  for(i=0;i<rows.length;i++){
    var ry = G.y + u(9) + i*G.rowH;
    var on = rows[i].on;
    pxText(px, rows[i].t, G.x+u(4), ry, on ? DC.amber : DC.greyDim, 1);
    if(on){
      px(G.x+G.w-u(5), ry+1, Math.max(2,u(3)), FONT_H-2, DC.amber);  /* position marker */
      px(G.x+u(3), ry-1, u(9), FONT_H+2, 'rgba(255,180,50,.10)');
    }
  }

  /* ------------------------------------------------------ tachometer -- */
  var rpm = dash.nRpm;
  paintNeedle(px, L.tachX, L.dialY, L.R,
              dialAngle(clamp(rpm*TACH_SCALE, 0, TACH_MAX), 0, TACH_MAX),
              rpm >= 1 ? DC.needleHi : DC.needle);

  /* ------------------------------------------------------ speedometer - */
  var shown = dash.nSpd * un.conv;
  var smax = speedMax();
  paintNeedle(px, L.spdX, L.dialY, L.R,
              dialAngle(clamp(shown, 0, smax), 0, smax), DC.needle);

  /* ----------------------------------------------------- boost gauge -- */
  paintNeedle(px, L.boost.x, L.boost.y, L.boost.r,
              dialAngle(clamp(dash.nBoost, 0, BOOST_MAX), 0, BOOST_MAX), DC.needle);

  /* ----------------------------------------------------- centre stack - */
  var K = L.stack;
  /* two up-chevrons, lit when the box wants a gear or a paddle was tapped */
  var wantUp = r && rpm > 0.93;
  var chW = Math.max(5, Math.round(K.w*0.30)), chGap = Math.round(K.w*0.10);
  var chX = Math.round(K.x + K.w/2 - chW - chGap/2);
  for(i=0;i<2;i++){
    var on2 = wantUp || hudCtl.padUp > 0.15;
    paintChevron(px, chX + i*(chW+chGap), K.chevY, chW, K.chevH,
                 on2 ? DC.blueHi : DC.blue, on2);
  }
  /* the segment row under them tracks revs */
  var segN = 5, segW = Math.max(2, Math.floor((K.w-4-(segN-1)*2)/segN));
  var segLit = Math.round(clamp(rpm/1.08,0,1)*segN);
  for(i=0;i<segN;i++){
    x = K.x + 2 + i*(segW+2);
    px(x, K.segY+1, segW, K.segH-2, DC.greyDim);
    if(i < segLit)
      px(x, K.segY+1, segW, K.segH-2, i < segN-2 ? DC.green : (i < segN-1 ? DC.amber : DC.red));
  }
  /* digital readout: the same number the analog face is pointing at */
  var txt = String(Math.round(Math.max(0, shown)));
  var k = Math.max(1, Math.min(3, Math.floor((K.boxH-FONT_H-6)/FONT_H)));
  while(textW(txt,k) > K.w-4 && k > 1) k--;
  pxTextC(px, txt, K.x+K.w/2, K.boxY+3, DC.num, k);

  /* -------------------------------------------------------- handbrake - */
  var B = L.hb;
  var hbq = Math.round(hudCtl.hb*8);
  var hbArtH = B.rise + B.h;
  var hbPivot = B.h - B.slotOff - Math.round(B.slotH/2);
  var hbCv = artPiece('hb', hbq, B.w, hbArtH, S, function(p,w,h){
    paintHandbrake(p, w, h, hbq/8, hbPivot);
  });
  blitArt(g, hbCv, B.x, B.y-B.rise, S);

  /* ---------------------------------------------------- indicator strip */
  var T = L.strip, ik = Math.max(1, Math.round(L.U*1.4));
  var slots = 5, sy = T.y + Math.round(T.h/2);
  var slotW = T.w/slots;
  var sxAt = function(n){ return Math.round(T.x + slotW*(n+0.5)); };
  paintArrowGlyph(px, sxAt(0), sy, ik, false, input.left ? DC.amber : DC.grey);
  paintHeadlightGlyph(px, sxAt(1), sy, ik, DC.green);
  /* the belt lamp keeps its own red-tinted panel, as on the mockup */
  var bw2 = Math.round(slotW*0.86), bx2 = Math.round(sxAt(2)-bw2/2);
  px(bx2, T.y+1, bw2, T.h-2, DC.redPanel);
  px(bx2, T.y+1, bw2, 1, '#5a2018');
  paintBeltGlyph(px, sxAt(2), sy, ik, DC.red);
  paintParkGlyph(px, sxAt(3), sy, ik, hudCtl.hb > 0.4 ? '#ff6a58' : DC.redLo);
  paintArrowGlyph(px, sxAt(4), sy, ik, true, input.right ? DC.amber : DC.grey);

  /* ------------------------------------------------------ status bars -
     Every panel carries the same row of segment bars underneath: how much
     grip is left, how evenly the drive is going down, and how far the
     auto-throttle currently has the pedal. All three are readouts. */
  var slip = r ? clamp(Math.abs(r.car.lat)/95 + r.car.wheelSpin*0.5, 0, 1) : 0;
  var vals = [1-slip, r ? clamp(1-Math.abs(r.car.steer)*0.45, 0, 1) : 1, thr];
  var xs = [L.stat.x0, L.stat.x1, L.stat.x2];
  var bn = 4, bgap = Math.max(1, u(1));
  var bw3 = Math.max(2, Math.floor((L.stat.w - 6 - (bn-1)*bgap)/bn));
  var bh3 = Math.max(2, u(3));
  var by = L.stat.y + L.stat.h - bh3 - 2;
  for(i=0;i<3;i++){
    var nlit = Math.round(clamp(vals[i],0,1)*bn);
    for(var b=0;b<bn;b++){
      x = xs[i] + 3 + b*(bw3+bgap);
      px(x, by, bw3, bh3, b < nlit ? DC.green : DC.greenDim);
      if(b < nlit) px(x, by, bw3, 1, '#b6ffc2');
    }
  }
  /* the THROTTLE panel's vertical segments, standing beside its pedal */
  var tw = Math.max(2, u(4)), tgap = Math.max(1, u(1));
  var tx = L.stat.x2 + u(4);
  var ty = L.stat.y + Math.round(L.stat.h*0.30);
  var tSeg = Math.max(2, Math.round((L.stat.h*0.42 - 2*tgap)/3));
  for(i=0;i<3;i++){
    var lit3 = thr > (2-i)/3;
    px(tx, ty + i*(tSeg+tgap), tw, tSeg, lit3 ? DC.green : DC.greenDim);
    if(lit3) px(tx, ty + i*(tSeg+tgap), tw, 1, '#b6ffc2');
  }

  /* ---------------------------------------------------------- paddles - */
  var manual = save.settings.transmission === 'manual';
  var pu = artPiece('padU', Math.round(hudCtl.padUp*4)+'/'+(manual?1:0),
                    L.padR.w, L.padR.h, S, function(p,w,h){
    paintPaddle(p, w, h, false, hudCtl.padUp, manual);
  });
  blitArt(g, pu, L.padR.x, L.padR.y, S);
  var pd = artPiece('padD', Math.round(hudCtl.padDn*4)+'/'+(manual?1:0),
                    L.padL.w, L.padL.h, S, function(p,w,h){
    paintPaddle(p, w, h, true, hudCtl.padDn, manual);
  });
  blitArt(g, pd, L.padL.x, L.padL.y, S);
}

function paintChevron(px, x, y, w, h, col, lit){
  var n = Math.min(Math.round(h*0.8), Math.round(w/2));
  for(var i=0;i<n;i++){
    var ww = 1 + i*2;
    px(Math.round(x + w/2 - ww/2), y + i, ww, 1, col);
  }
  if(lit) px(Math.round(x+w/2), y, 1, 1, '#ffffff');
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
    var heating = race.rpm > 0.98 ? 1 : (race.rpm > 0.86 ? 0.35 : 0);
    dash.heat = clamp(dash.heat + (heating ? dt*0.30*heating : -dt*0.20), 0, 1);
  }
  drawDash(race);
}

/* force a full repaint, e.g. when a race starts or the viewport changes */
function resetHudControls(){
  hudCtl.hb = hudCtl.padUp = hudCtl.padDn = 0;
  dash.nRpm = dash.nSpd = dash.nBoost = dash.heat = 0;
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
  var S = L.PX, ox = L.originX, oy = L.originY;
  var box = function(id, kind, rect, extra){
    return { id:id, kind:kind, key:extra,
             x: ox + rect.x*S, y: oy + rect.y*S,
             w: rect.w*S, h: rect.h*S };
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
  var deck = H - dashBandH() - carHalf - 6;    /* housing top, less the car */
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

function drawGroundDetail(g, r, viewR, theme){
  var cell = 70;
  var x0 = Math.floor((r.camX-viewR)/cell), x1 = Math.ceil((r.camX+viewR)/cell);
  var y0 = Math.floor((r.camY-viewR)/cell), y1 = Math.ceil((r.camY+viewR)/cell);
  if((x1-x0)*(y1-y0) > 1400) return;
  var palettes = {
    forest:['#26361b','#37492a','#1f2d16'],
    mountain:['#41413c','#4c4c46','#383833'],
    snowpass:['#f3f8fc','#dde8f2','#ffffff']
  };
  var pal = palettes[theme] || palettes.forest;
  g.save();
  for(var gx=x0;gx<=x1;gx++){
    for(var gy=y0;gy<=y1;gy++){
      var n = rnd2(gx,gy,7);
      var px = gx*cell + rnd2(gx,gy,11)*cell;
      var py = gy*cell + rnd2(gx,gy,13)*cell;
      var s = 16 + rnd2(gx,gy,17)*34;
      g.globalAlpha = 0.45 + rnd2(gx,gy,19)*0.3;
      g.fillStyle = pal[Math.floor(n*3)%3];
      g.fillRect(px, py, s, s*0.75);
    }
  }
  g.restore();
}

function drawRoad(g, r, viewR){
  var nodes = r.track.nodes;
  var lo = Math.max(0, r.car.node - 60);
  var hi = Math.min(nodes.length-1, r.car.node + Math.ceil(viewR/NODE_STEP) + 24);

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

    /* surface speckle for texture */
    g.fillStyle = S.color2;
    for(var t=i;t<end;t+=2){
      var nd3 = nodes[t];
      var nxx = Math.cos(nd3.a), nyy = Math.sin(nd3.a);
      for(var q=0;q<3;q++){
        var lat = (rnd2(t,q,3)*2-1)*nd3.hw*0.94;
        var sz = 3 + rnd2(t,q,5)*7;
        g.fillRect(nd3.x + nxx*lat, nd3.y + nyy*lat, sz, sz);
      }
    }
    /* edges */
    g.lineWidth = 3.5; g.strokeStyle = S.edge;
    g.beginPath();
    for(var e=i;e<=end;e++){
      var n4 = nodes[e], ax = Math.cos(n4.a), ay = Math.sin(n4.a);
      var ex = n4.x - ax*n4.hw, ey = n4.y - ay*n4.hw;
      if(e===i) g.moveTo(ex,ey); else g.lineTo(ex,ey);
    }
    g.stroke();
    g.beginPath();
    for(var e2=i;e2<=end;e2++){
      var n5 = nodes[e2], bx = Math.cos(n5.a), by = Math.sin(n5.a);
      var fx = n5.x + bx*n5.hw, fy = n5.y + by*n5.hw;
      if(e2===i) g.moveTo(fx,fy); else g.lineTo(fx,fy);
    }
    g.stroke();
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
  g.save();
  g.translate(c.x, c.y);
  g.rotate(c.a);
  g.fillStyle = 'rgba(0,0,0,.30)';
  g.fillRect(-ww/2+5, -wh/2+6, ww-7, wh-9);
  g.drawImage(sp.canvas, -ww/2, -wh/2, ww, wh);
  g.restore();
}

function drawMinimap(g, r, W, H){
  var nodes = r.track.nodes;
  var mw = Math.min(120, W*0.19), mh = mw;
  var x0 = W - mw - 10, y0 = 46;          /* top right, under the pause button */
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
  g.fillStyle = 'rgba(8,11,7,.55)';
  g.fillRect(x0-6, y0-6, mw+12, mh+12);
  g.strokeStyle = 'rgba(60,74,56,.85)'; g.lineWidth = 2;
  g.strokeRect(x0-6, y0-6, mw+12, mh+12);
  g.globalAlpha = 0.85;
  g.strokeStyle = '#c9d3c2'; g.lineWidth = 2;
  g.beginPath();
  for(var k=0;k<nodes.length;k+=6){
    var px = ox+nodes[k].x*s, py = oy+nodes[k].y*s;
    if(k===0) g.moveTo(px,py); else g.lineTo(px,py);
  }
  g.stroke();
  g.globalAlpha = 1;
  g.fillStyle = '#ffb432';
  g.fillRect(ox+r.car.x*s-3, oy+r.car.y*s-3, 6, 6);
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
  about.innerHTML = '<div class="hint">RALLY PIXEL — the throttle drives itself. Keyboard: arrows or A / D to steer, SHIFT, DOWN or SPACE for the handbrake, E / Q to change gear in manual, ESC to pause.</div>';
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
