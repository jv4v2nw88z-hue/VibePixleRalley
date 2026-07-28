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
               drawnHb:-1, drawnUp:-1, drawnDn:-1, drawnGas:-1, drawnMode:null,
               drawnL:null, drawnR:null, needLayout:true,
               steerH:30,              /* art height of a steering mount */
               barArt:26 };            /* art height of the flat dash bar */

/* integer-scaled pixel painter for a small HUD canvas */
function hudPainter(cv, gw, gh, cssScale){
  var dpr = Math.min(window.devicePixelRatio || 1, 2);
  var S = Math.max(1, Math.round(cssScale*dpr));
  if(cv.width !== gw*S || cv.height !== gh*S){
    cv.width = gw*S; cv.height = gh*S;
    cv.style.width = (gw*cssScale)+'px';
    cv.style.height = (gh*cssScale)+'px';
  }
  var g = cv.getContext('2d');
  g.imageSmoothingEnabled = false;
  g.clearRect(0,0,cv.width,cv.height);
  return function(x,y,w,h,col){
    g.fillStyle = col;
    g.fillRect(Math.round(x)*S, Math.round(y)*S,
               Math.max(1,Math.round(w))*S, Math.max(1,Math.round(h))*S);
  };
}

var HUDC = {
  steel:'#9aa2a8', steelHi:'#c6ccd1', steelLo:'#5c6167',
  dark:'#20262a', black:'#12161a', rubber:'#2b3036', rubberHi:'#3c434a',
  amber:'#ffb432', amberLo:'#a8721a', green:'#7ef08a', warn:'#ff5a4a',
  dim:'#575e63', dimLo:'#3a4045',
  /* Instrument faces. Every value here was sampled straight off the
     reference dash rather than approximated: flat charcoal glass, a flat
     two-tone grey bezel, a grey tick ring the periwinkle marks cross, and a
     brick-red needle. Its geometry, as fractions of the dial radius:
     bezel 1.00-0.90, shoulder 0.88, major ticks 0.93-0.80, ring 0.83,
     numerals ~0.68, needle tip 0.72. */
  face:'#1C1C1C',                    /* dial glass, flat — no vignette */
  bezelHi:'#797979', bezelLo:'#545559', bezelEdge:'#000000', bezelIn:'#0D0D0D',
  ring:'#999999',                    /* the continuous tick-ring circle */
  tick:'#B2B3E1', tickDim:'#6E6F8C', tickRed:'#E6A49C',
  numSpd:'#C9C9C9', numTach:'#B2B3E1',
  cap:'#C9C9C9', capLo:'#767676',    /* TYPE R / X1000 captions */
  needle:'#D2453C', needleHot:'#E8574A', needleSpd:'#D2453C',
  red:'#B92C23',                     /* redline arc */
  tri:'#3A3DD6', triLo:'#23268C',    /* the module's blue shift tell-tales */
  knob:'#585252', knobHi:'#7A7373', knobLo:'#3A3535',
  led:'#5BE04A',
  tab:'#1F2326', tabEdge:'#0A0A0C', tabInk:'#5A5E62',   /* the dash's buttons */
  tabOn:'#C98A2A', tabOnHi:'#FFD487', tabOnInk:'#241800',
  ladBlue:'#56B2DB', ladGreen:'#5BE04A', ladRed:'#E8564F', ladOff:'#191A1D',
  lcd:'#18181A', lcdOn:'#FFFFFF', lampOff:'#39423a'
};

/* pixel painter that draws into an existing context at an offset, so the
   chunky pixel art can share a canvas with the smooth dial faces */
function pxInto(g, ox, oy, s){
  return function(x,y,w,h,col){
    g.fillStyle = col;
    g.fillRect(ox + Math.round(x)*s, oy + Math.round(y)*s,
               Math.max(1,Math.round(w))*s, Math.max(1,Math.round(h))*s);
  };
}
/* =========================================================================
   PIXEL TOOLKIT

   Everything on the dash — dial faces, ticks, numerals, captions, needles —
   is laid down a whole art pixel at a time through these, so nothing on the
   cluster is hinted, gradient-filled or antialiased. One art pixel is one
   CSS pixel: the canvas is scaled by an integer device ratio underneath, so
   an integer rect here always lands on exact device pixels.
   ========================================================================= */

/* 3x5 bitmap face. Each glyph is five rows of three bits, high bit left. */
var PXFONT = {
  '0':[7,5,5,5,7], '1':[2,6,2,2,7], '2':[7,1,7,4,7], '3':[7,1,7,1,7],
  '4':[5,5,7,1,1], '5':[7,4,7,1,7], '6':[7,4,7,5,7], '7':[7,1,2,2,2],
  '8':[7,5,7,5,7], '9':[7,5,7,1,7],
  'A':[7,5,7,5,5], 'B':[6,5,6,5,6], 'C':[7,4,4,4,7], 'D':[6,5,5,5,6],
  'E':[7,4,7,4,7], 'F':[7,4,7,4,4], 'G':[7,4,5,5,7], 'H':[5,5,7,5,5],
  'I':[7,2,2,2,7], 'J':[1,1,1,5,7], 'K':[5,5,6,5,5], 'L':[4,4,4,4,7],
  'M':[5,7,7,5,5], 'N':[6,5,5,5,5], 'O':[7,5,5,5,7], 'P':[7,5,7,4,4],
  'Q':[7,5,5,7,3], 'R':[7,5,7,6,5], 'S':[7,4,7,1,7], 'T':[7,2,2,2,2],
  'U':[5,5,5,5,7], 'V':[5,5,5,5,2], 'W':[5,5,7,7,5], 'X':[5,5,2,5,5],
  'Y':[5,5,2,2,2], 'Z':[7,1,2,4,7], '-':[0,0,7,0,0], '.':[0,0,0,0,2],
  ' ':[0,0,0,0,0]
};
/* Seven-segment digits, in A B C D E F G order. The reference dash draws its
   dial numerals as segment shapes rather than font glyphs, which is most of
   why it reads as an instrument cluster and not as text on a circle. */
var SEG7 = {
  '0':[1,1,1,1,1,1,0], '1':[0,1,1,0,0,0,0], '2':[1,1,0,1,1,0,1],
  '3':[1,1,1,1,0,0,1], '4':[0,1,1,0,0,1,1], '5':[1,0,1,1,0,1,1],
  '6':[1,0,1,1,1,1,1], '7':[1,1,1,0,0,0,0], '8':[1,1,1,1,1,1,1],
  '9':[1,1,1,1,0,1,1]
};
function pxSegW(str, w){ return str.length*(w+2) - 2; }
function pxSeg(px, str, x, y, w, h, col, align){
  var i, seg, gx, pitch = w + 2, mid = (h-1) >> 1;
  var tw = pxSegW(str, w);
  var x0 = Math.round(align === 'c' ? x - tw/2 : align === 'r' ? x - tw : x);
  y = Math.round(y);
  for(i=0;i<str.length;i++){
    seg = SEG7[str.charAt(i)];
    if(!seg) continue;
    gx = x0 + i*pitch;
    if(seg[0]) px(gx+1,   y,        w-2, 1,        col);   /* A  top    */
    if(seg[5]) px(gx,     y+1,      1,   mid-1,    col);   /* F  up-left  */
    if(seg[1]) px(gx+w-1, y+1,      1,   mid-1,    col);   /* B  up-right */
    if(seg[6]) px(gx+1,   y+mid,    w-2, 1,        col);   /* G  middle */
    if(seg[4]) px(gx,     y+mid+1,  1,   h-mid-2,  col);   /* E  low-left  */
    if(seg[2]) px(gx+w-1, y+mid+1,  1,   h-mid-2,  col);   /* C  low-right */
    if(seg[3]) px(gx+1,   y+h-1,    w-2, 1,        col);   /* D  bottom */
  }
  return tw;
}

/* 5x7 letter face — the reference's captions stand as tall as its numerals,
   which the 3x5 face cannot do without doubling and going too wide. */
var PXFONT7 = {
  'A':[14,17,17,31,17,17,17], 'B':[30,17,17,30,17,17,30], 'C':[14,17,16,16,16,17,14],
  'D':[30,17,17,17,17,17,30], 'E':[31,16,16,30,16,16,31], 'F':[31,16,16,30,16,16,16],
  'G':[14,17,16,23,17,17,15], 'H':[17,17,17,31,17,17,17], 'I':[14,4,4,4,4,4,14],
  'J':[7,2,2,2,2,18,12],      'K':[17,18,20,24,20,18,17], 'L':[16,16,16,16,16,16,31],
  'M':[17,27,21,21,17,17,17], 'N':[17,25,21,19,17,17,17], 'O':[14,17,17,17,17,17,14],
  'P':[30,17,17,30,16,16,16], 'Q':[14,17,17,17,21,18,13], 'R':[30,17,17,30,20,18,17],
  'S':[15,16,16,14,1,1,30],   'T':[31,4,4,4,4,4,4],       'U':[17,17,17,17,17,17,14],
  'V':[17,17,17,17,17,10,4],  'W':[17,17,17,21,21,27,17], 'X':[17,17,10,4,10,17,17],
  'Y':[17,17,10,4,4,4,4],     'Z':[31,1,2,4,8,16,31],     '-':[0,0,0,31,0,0,0],
  ' ':[0,0,0,0,0,0,0],
  /* Numerals are the bold, two-pixel-stroke shapes the reference uses on
     both dials — a slotted 0, a diagonal 2, a closed 4. */
  '0':[14,27,27,27,27,27,14], '1':[4,12,4,4,4,4,14],      '2':[14,27,3,6,12,24,31],
  '3':[30,3,3,14,3,3,30],     '4':[6,14,10,26,31,2,2],    '5':[31,24,30,3,3,27,14],
  '6':[6,12,24,30,27,27,14],  '7':[31,3,6,12,12,12,12],   '8':[14,27,27,14,27,27,14],
  '9':[14,27,27,15,3,6,12]
};
function pxText7W(str, s, tr){ return str.length*(5*s + (tr==null?s:tr)) - (tr==null?s:tr); }
function pxText7(px, str, x, y, s, col, align, tr){
  if(tr == null) tr = s;
  var pitch = 5*s + tr;
  var w = pxText7W(str, s, tr), i, r, c, bits, rows;
  var x0 = Math.round(align === 'c' ? x - w/2 : align === 'r' ? x - w : x);
  y = Math.round(y);
  for(i=0;i<str.length;i++){
    rows = PXFONT7[str.charAt(i)];
    if(!rows) continue;
    for(r=0;r<7;r++){
      bits = rows[r];
      if(!bits) continue;
      for(c=0;c<5;c++) if(bits & (16>>c)) px(x0 + i*pitch + c*s, y + r*s, s, s, col);
    }
  }
  return w;
}

/* rendered width of a string at pixel size s (3 wide, 1 of tracking) */
function pxTextW(str, s){ return str.length*4*s - s; }
/* align: 'l' (default), 'c' centres on x, 'r' ends at x. y is the top row. */
function pxText(px, str, x, y, s, col, align){
  var w = pxTextW(str, s), i, r, c, bits, rows;
  var x0 = Math.round(align === 'c' ? x - w/2 : align === 'r' ? x - w : x);
  y = Math.round(y);
  for(i=0;i<str.length;i++){
    rows = PXFONT[str.charAt(i)];
    if(!rows) continue;
    for(r=0;r<5;r++){
      bits = rows[r];
      if(!bits) continue;
      for(c=0;c<3;c++) if(bits & (4>>c)) px(x0 + i*4*s + c*s, y + r*s, s, s, col);
    }
  }
  return w;
}

/* A filled pixel-art disc, scanned row by row so the edge steps in whole
   pixels. `col` may be a function of the row's position through the disc,
   -1 to 1, which is how the round parts pick up their blocky shading. */
function pxDisc(px, cx, cy, r, col){
  for(var y=-r; y<=r; y++){
    var w = Math.round(Math.sqrt(Math.max(0, r*r - y*y)));
    if(w <= 0) continue;
    px(cx-w, cy+y, w*2, 1, typeof col === 'function' ? col(y/r) : col);
  }
}
/* a radial tick: a run of pixels from r0 out to r1, w art pixels thick */
function pxRay(px, cx, cy, ang, r0, r1, w, col){
  var dx = Math.cos(ang), dy = Math.sin(ang), o = (w-1)/2;
  for(var r=r0; r<=r1; r+=0.5)
    px(Math.round(cx+dx*r - o), Math.round(cy+dy*r - o), w, w, col);
}
/* a band of the rim between two radii, swept between two angles */
function pxArcBand(px, cx, cy, r0, r1, a0, a1, col){
  for(var r=r0; r<=r1; r++){
    var st = 1/Math.max(1, r);
    for(var a=a0; a<=a1+1e-6; a+=st)
      px(Math.round(cx+Math.cos(a)*r), Math.round(cy+Math.sin(a)*r), 1, 1, col);
  }
}
/* pixel-art rounded rect: square, with the four corner pixels knocked out */
function pxPanel(px, x, y, w, h, fill, edge, lip){
  px(x+1, y,     w-2, 1,   edge);         /* outline, corners notched */
  px(x+1, y+h-1, w-2, 1,   edge);
  px(x,   y+1,   1,   h-2, edge);
  px(x+w-1, y+1, 1,   h-2, edge);
  px(x+1, y+1,   w-2, h-2, fill);
  if(lip) px(x+1, y+1, w-2, 1, lip);      /* catch along the top inner edge */
}

/* =========================================================================
   GAUGE CLUSTER
   ========================================================================= */

/* Dial sweep: 135deg (bottom-left) clockwise through 270deg to 45deg
   (bottom-right), the layout every road-car instrument uses. */
var DIAL_A0 = Math.PI*0.75, DIAL_SWEEP = Math.PI*1.5;
function dialAngle(v, min, max){ return DIAL_A0 + DIAL_SWEEP*clamp((v-min)/(max-min),0,1); }

/* The tacho reads in thousands of rpm. race.rpm is a fraction of redline,
   so redline sits exactly on the 7 mark and the dial runs on to 9 — the
   same 1.0 threshold the gearbox and the shift bar use. */
var TACH_MAX = 9, TACH_RED = 7, TACH_SCALE = 7;

var cluster = {
  cv:null, g:null, base:null, L:null, key:'',
  S:1, W:0, H:0, kmhMax:240,
  nRpm:0, nKmh:0, heat:0
};

/* Sizing.

   The dash is deliberately kept to under a fifth of the screen height. This
   is a chase cam: the car is drawn below the camera's focal point by however
   far the camera is looking ahead, so it rides low on screen at speed. Every
   pixel the dash grows is a pixel of road — and eventually of car — that the
   player loses, so the panel hugs the bottom edge and stays short. Width
   follows from the height, since the dials are circles. */
var CLUSTER_BOTTOM = 4;                       /* px above the safe-area edge */

/* Docked controls. Everything on the dash hangs off the cluster instead of
   the screen edge, so the band reads as one dashboard the way the reference
   does, rather than a row of islands floating over the road. DOCK_REACH is
   how far the deeper side runs out from the panel: shift tab (40) + two
   steering tabs (56 each) + gaps. */
var DOCK_GAP = 3, DOCK_REACH = 165;

function layoutDashControls(){
  var side = [
    { dir:-1, ids:['p-shiftdn','p-right','p-left'] },   /* −, then the arrows */
    { dir: 1, ids:['p-shiftup','p-hbrake','p-gas'] }    /* +, lever, throttle */
  ];
  var half = (cluster.W || clusterLayout().W)/2, s, i, el, w, off, dir;
  for(s=0;s<side.length;s++){
    off = half + DOCK_GAP; dir = side[s].dir;
    for(i=0;i<side[s].ids.length;i++){
      el = document.getElementById(side[s].ids[i]);
      if(!el) continue;
      w = el.offsetWidth || 0;
      if(!w) continue;                        /* hidden: leaves no gap behind */
      el.style.transform = 'translateX(' + (dir*(off + w/2)).toFixed(1) + 'px)';
      off += w + DOCK_GAP;
    }
  }
}

/* Total horizontal safe-area inset. The side controls are positioned inside
   it, so the panel has to budget for it too — a notched phone in landscape
   hands back a good 40px on one side. Read off a probe rather than assumed,
   and only ever called when the viewport changes. */
var safeProbe = null;
function safeInsetX(){
  if(!safeProbe){
    safeProbe = document.createElement('div');
    safeProbe.style.cssText = 'position:fixed;top:0;left:0;width:0;height:0;' +
      'visibility:hidden;pointer-events:none;' +
      'padding-left:env(safe-area-inset-left);padding-right:env(safe-area-inset-right);';
    document.body.appendChild(safeProbe);
  }
  var cs = getComputedStyle(safeProbe);
  return (parseFloat(cs.paddingLeft) || 0) + (parseFloat(cs.paddingRight) || 0);
}

function clusterLayout(){
  var vw = view.w || window.innerWidth || 800;
  var vh = view.h || window.innerHeight || 400;
  var pad = 3, gap = 4;
  /* The touch controls dock against the panel rather than the screen edge,
     so the width they need is a fixed run either side of it: shift tab,
     two steering mounts and their gaps on the left (the deeper of the two),
     tab, lever and throttle on the right. The panel gets what is left. */
  var maxW = Math.max(140, vw - safeInsetX() - 2*DOCK_REACH - 8);
  /* Columns run left to right exactly as on the reference cluster: pedal bay,
     gear widget, tacho, the console module, speedo. As fractions of the dial
     diameter that is 0.72 + 0.70 + 1 + 0.48 + 1 = 3.90 D, plus the padding
     and four gaps. Invert it for the largest dial the width allows — though
     on any real phone it is the HEIGHT cap that binds, not this. */
  var D = Math.min(clamp(Math.round(vh*0.25), 62, 116) - 2*pad,
                   Math.floor((maxW - 2*pad - 4*gap)/3.90));
  D = Math.max(40, D);
  /* The dash is a flat bar with the two dials standing proud of it, as on
     the reference: the bar's top edge runs BELOW the tops of the dials, so
     the circles break its outline instead of sitting inset in a rectangle.
     `rise` is how far they clear it; everything else lives in the band. */
  var rise = Math.round(D*0.34);
  var wp = Math.round(D*0.72);                /* pedal bay */
  var wg = Math.round(D*0.70);                /* gear widget */
  var wa = Math.round(D*0.48);                /* console module */
  var W = 2*pad + wp + wg + 2*D + wa + 4*gap;
  var H = D + 2*pad;

  var x = pad;
  var L = { W:W, H:H, pad:pad, gap:gap, D:D, R:D/2, dialY:pad + D/2,
            rise:rise, bandY:rise, bandH:H - rise };
  /* usable box for every column that is not a dial */
  var colY = rise + pad, colH = H - pad - colY;
  L.colY = colY; L.colH = colH;

  L.bayX = x; L.bayY = colY; L.wp = wp;
  L.ps = Math.max(1, Math.floor(wp/20));      /* pedal-art pixel size */
  L.pgw = Math.max(8, Math.floor(wp/L.ps));
  L.pgh = Math.max(8, Math.floor(colH/L.ps));
  x += wp + gap;
  L.gearX = x; L.wg = wg;
  x += wg + gap;
  L.tachX = x + D/2;
  x += D + gap;
  L.auxX = x; L.wa = wa;
  x += wa + gap;
  L.spdX = x + D/2;

  /* Gear widget: a vertical shift-light ladder outboard, then the GEAR
     caption with the gear-position row under it, as on the reference. */
  L.ladX   = L.gearX + 1;
  L.ladW   = Math.max(12, Math.round(wg*0.52));
  L.ladSeg = 6;
  L.ladStep = 2;                              /* how far each row leans out */
  L.ladPitch = Math.max(3, Math.floor(colH/(L.ladSeg + 1)));
  L.gnX    = L.ladX + L.ladW + 2;
  L.gnW    = L.gearX + wg - L.gnX - 1;
  L.gPosY  = L.colY + Math.round(colH*0.55);

  /* Console module, stacked exactly as the reference stacks its own: a
     bordered panel carrying the caption and the two blue shift tell-tales,
     then the knob on the bare dash, then the lamp row, then the digital
     readout at the foot. */
  L.triH  = Math.max(4, Math.round(colH*0.15));
  L.triY  = colY + 7;
  L.modH  = L.triY + L.triH + 2 - colY;
  L.knobR = Math.max(3, Math.min(Math.round(colH*0.15), Math.round(wa*0.27)));
  L.knobY = colY + L.modH + 2;
  L.lcdH  = Math.max(7, Math.round(colH*0.16));
  L.lcdY  = colY + colH - L.lcdH;
  L.lampY = L.knobY + L.knobR*2 + 2;
  L.lampH = Math.max(5, L.lcdY - 2 - L.lampY);
  return L;
}

/* How much of the screen bottom the dash band occupies, so the chase camera
   can keep the car clear of it. Only the flat bar is solid — the dials that
   stand above it are read through, so they count for a fraction of their
   rise rather than the whole of it. Mirrors the CSS positioning the panel. */
function clusterBandH(){
  var L = cluster.L || clusterLayout();
  return L.bandH + L.rise*0.55 + CLUSTER_BOTTOM;
}

/* --------------------------------------------------------- static face
   A pixel-art instrument face built to the reference's own proportions:
   a flat two-tone grey bezel, flat charcoal glass,
   a continuous grey tick ring that the periwinkle tick marks cross, and
   seven-segment numerals sat inside it. Nothing here is antialiased and
   nothing is a gradient. Radii are fractions of R, straight off the
   reference: bezel 1.00-0.90, shoulder 0.88, ticks 0.92-0.78, ring 0.83,
   numerals 0.66. */
function drawDialFace(px, cx, cy, R, o){
  var i, v, a, maj, r0, r1;
  var num = o.num || HUDC.numSpd;
  cx = Math.round(cx); cy = Math.round(cy); R = Math.round(R);

  /* --- bezel: flat, two tones, lighter across the top left --- */
  pxDisc(px, cx, cy, R, HUDC.bezelEdge);
  pxDisc(px, cx, cy, R-1, function(t){ return t < -0.10 ? HUDC.bezelHi : HUDC.bezelLo; });
  var bw = Math.max(2, Math.round(R*0.10));
  pxDisc(px, cx, cy, R-bw, HUDC.bezelIn);               /* dark shoulder */
  var fr = R - bw - 1;
  pxDisc(px, cx, cy, fr, HUDC.face);                    /* flat glass */

  /* --- the tick ring: a continuous circle the marks cross, as on the
     reference, rather than a shaded band --- */
  var ringR = Math.round(R*0.83);
  pxDisc(px, cx, cy, ringR, HUDC.ring);
  pxDisc(px, cx, cy, ringR-1, HUDC.face);

  var a1 = dialAngle(o.max,o.min,o.max);
  if(o.redFrom != null){                                /* redline, outboard */
    var ra = dialAngle(o.redFrom,o.min,o.max);
    pxArcBand(px, cx, cy, ringR, fr, ra, a1, HUDC.red);
    /* the little fan of hash marks the reference puts at the band's start */
    for(i=1;i<=4;i++)
      pxRay(px, cx, cy, ra - i*0.055, ringR, fr, 1, HUDC.red);
  }

  /* --- ticks and numerals --- */
  var ns = 1, dh = 7;                                   /* numeral cell */
  var wide = String(Math.round(o.max));
  var every = o.labelEvery || 1;
  /* Seat the numeral ring so the widest label's corner just clears the tick
     ring — a fixed fraction works for the tacho's single digits but drives
     the speedo's three-digit labels straight through it. */
  var lw = pxText7W(wide, ns);
  var lblR = Math.round(Math.max(R*0.45,
             ringR - 2 - Math.sqrt(lw*lw + dh*dh)/2));
  /* ...and thin the labelling out until the ring can actually hold it. The
     reference fits nine three-digit labels because its dial is half again
     as wide in art pixels; at ours they would run into each other, so the
     ticks stay every major and only the numbering steps down. */
  while(every < 4 &&
        lblR*DIAL_SWEEP/Math.max(1, (o.max-o.min)/(o.major*every)) < lw + 3)
    every *= 2;
  var steps = Math.round((o.max-o.min)/o.minor);
  var lblEvery = Math.round(o.major*every/o.minor);

  for(i=0;i<=steps;i++){
    v = o.min + i*o.minor;
    maj = (i % Math.round(o.major/o.minor)) === 0;
    a = dialAngle(v,o.min,o.max);
    r1 = Math.round(R*(maj ? 0.93 : 0.87));
    r0 = Math.round(R*(maj ? 0.80 : 0.82));
    /* the reference leaves the numbering and the marks alone through the
       redline — only the arc behind them turns red */
    pxRay(px, cx, cy, a, r0, r1, 1, maj ? HUDC.tick : HUDC.tickDim);
    if(maj && (i % lblEvery) === 0)
      pxText7(px, String(Math.round(v)),
              cx + Math.cos(a)*lblR, cy + Math.sin(a)*lblR - dh/2, ns, num, 'c');
  }

  /* Captions ride close in to the hub — the numerals sit out on the
     diagonals, so anything further out collides with them at this size. */
  if(o.label && R >= 20)
    pxText7(px, o.label, cx, cy - Math.round(R*0.30), 1, HUDC.cap, 'c', 2);
  if(o.sub && R >= 42)
    pxText(px, o.sub, cx, cy + Math.round(R*0.26), 1, HUDC.capLo, 'c');
}

/* ------------------------------------------------------------- needles
   A blunt pixel pointer in the reference's proportions: about a fifteenth
   of the diameter thick, reaching three quarters of the way out, with a
   short counterweight and a small hub rather than a big chrome cap. */
function drawNeedle(px, cx, cy, R, ang, col){
  cx = Math.round(cx); cy = Math.round(cy); R = Math.round(R);
  var w = Math.max(2, Math.round(R*0.05));
  var tip = Math.round(R*0.72);
  pxRay(px, cx, cy, ang + Math.PI, 1, Math.round(R*0.16), Math.max(1,w-1), col);
  pxRay(px, cx, cy, ang, 1, Math.round(tip*0.72), w, col);
  pxRay(px, cx, cy, ang, Math.round(tip*0.72), tip, Math.max(1, w-1), col);
  pxDisc(px, cx, cy, Math.max(1, Math.round(R*0.05)), col);
}

/* Everything that never moves, painted once at device resolution. */
function buildClusterBase(L, S){
  var c = document.createElement('canvas');
  c.width = L.W*S; c.height = L.H*S;
  var g = c.getContext('2d');
  g.setTransform(S,0,0,S,0,0);
  var px = pxInto(g, 0, 0, 1);              /* one art pixel = one CSS pixel */

  /* The flat dash bar. It starts BELOW the top of the canvas, so the two
     dials — painted after it, and opaque — rise clear of its edge and break
     the rectangle outline instead of sitting inset inside one. */
  var by = L.bandY, bh = L.H - by, y;
  px(1, by, L.W-2, 1, '#96a3b2');                       /* rolled top lip */
  px(0, by+1, 1, bh-1, '#2b333d'); px(L.W-1, by+1, 1, bh-1, '#05070a');
  for(y=1; y<bh; y++){
    var t = y/bh;
    px(1, by+y, L.W-2, 1, t < 0.10 ? '#2b333d' : t < 0.30 ? '#181e26' : '#10151b');
  }

  drawPedalBayBase(g, L);

  drawDialFace(px, L.tachX, L.dialY, L.R, {
    min:0, max:TACH_MAX, major:1, minor:0.5, redFrom:TACH_RED,
    labelEvery:1, label:'RPM', sub:'X1000', num: HUDC.numTach
  });
  /* Eight divisions on the speedo, as the reference has: 0-240 in thirties.
     A car that runs past 240 gets a bigger dial, still in eight steps. */
  drawDialFace(px, L.spdX, L.dialY, L.R, {
    min:0, max:cluster.kmhMax, major:cluster.kmhMax/8,
    minor:cluster.kmhMax/24, labelEvery:1, label:'KMH', num: HUDC.numSpd
  });

  /* --- gear widget: shift-light ladder outboard, GEAR caption and the
     gear-position row inboard, exactly as the reference lays it out --- */
  pxText7(px, 'GEAR', L.gnX + L.gnW/2, L.colY + 3, 1, HUDC.cap, 'c', 1);

  /* --- console module: a bordered unit carrying its caption and its pair of
     tell-tales, with the caption left and a status LED right, as on the
     reference's own; the knob, lamps and readout stack under it --- */
  pxPanel(px, L.auxX, L.colY, L.wa, L.modH, '#141416', '#3A3A3E', '#242428');
  pxText(px, 'SHIFT', L.auxX + 3, L.colY + 2, 1, '#C0C0C0', 'l');
  px(L.auxX + L.wa - 6, L.colY + 3, 2, 2, HUDC.led);
  px(L.auxX + L.wa - 3, L.colY + 3, 2, 2, HUDC.led);

  /* digital speed readout, in the module's foot where the reference has it */
  pxPanel(px, L.auxX, L.lcdY, L.wa, L.lcdH, HUDC.lcd, '#8a8a8e');

  return c;
}

/* ----------------------------------------------------------- pedal bay
   Two chunky pedals standing at the far left of the bar, as on the
   reference: big black-and-white checkered tread on a raked face, thick
   cast outline, hanging off a stalk into a dark footwell. The footwell and
   its floor are static; the plates themselves move with the controls.

   The tread is stepped rather than sheared — each block row shifts a whole
   tread square outboard of the one above it — so the rake stays pixel-art
   crisp at any size instead of turning into an antialiased parallelogram. */
function pedalFloorY(GH){ return GH - Math.max(2, Math.round(GH*0.12)); }
function pedalRestY(GH){ return Math.max(1, Math.round(GH*0.10)); }
/* the two pedals, as grid columns: brake wide on the left, throttle narrow */
function pedalCols(GW){
  var bw = Math.round(GW*0.46), gw = Math.round(GW*0.40);
  return [ { x0:1, w:bw }, { x0:GW-1-gw, w:gw } ];
}

function drawPedalBayBase(g, L){
  var s = L.ps, GW = L.pgw, GH = L.pgh;
  var px = pxInto(g, L.bayX, L.bayY, s);
  var floorY = pedalFloorY(GH);
  var x;

  px(0,0,GW,GH,'#0a0e12');                              /* footwell recess */
  for(x=2;x<GW-2;x+=4) px(x,1,1,floorY-1,'#141b21');    /* bulkhead ribs */

  px(0,floorY,GW,GH-floorY,'#2b333a');                  /* floor plate */
  px(0,floorY,GW,1,'#69747f');                          /* lit leading edge */
  px(0,GH-1,GW,1,'#05070a');
  px(0,0,1,GH,'#1a2128'); px(GW-1,0,1,GH,'#05070a');    /* side shading */
}

/* One chunky checker-tread pedal face, raked toward the driver. Stepped a
   whole tread square per block row so the rake stays pixel-art crisp at any
   size instead of turning into an antialiased parallelogram. Shared by the
   pedals in the bay and the throttle pedal on the right of the dash. */
function drawTread(px, x0, topY, nc, nr, sq, lean, hi, lo){
  var br, bc, pw = nc*sq;
  for(br=0; br<nr; br++){
    var y  = topY + br*sq;                              /* top row leans out */
    var rx = x0 + Math.round((nr-1-br)/(nr-1) * lean);
    px(rx-1, y, pw+2, sq, '#05070a');                   /* cast edge */
    for(bc=0; bc<nc; bc++)
      px(rx + bc*sq, y, sq, sq, ((br+bc) & 1) ? lo : hi);
    px(rx-1, y, 1, sq, '#c8d2da');                      /* lit outboard edge */
    px(rx+pw, y, 1, sq, '#151b21');                     /* shaded inboard edge */
  }
  px(x0 + lean - 1, topY-1, pw+2, 1, '#ffffff');        /* top catch */
  px(x0 - 1, topY + nr*sq, pw+2, 1, '#05070a');         /* foot shadow */
}

function drawPedalPlates(g, L, gasV, brakeV){
  var s = L.ps, GW = L.pgw, GH = L.pgh;
  var px = pxInto(g, L.bayX, L.bayY, s);
  var floorY = pedalFloorY(GH), restY = pedalRestY(GH);
  var cols = pedalCols(GW);
  var peds = [
    { x0:cols[0].x0, w:cols[0].w, v:brakeV, hi:'#ffb3a6', led:HUDC.warn },
    { x0:cols[1].x0, w:cols[1].w, v:gasV,   hi:'#b8f6c1', led:HUDC.green }
  ];
  var travel = Math.max(1, Math.round(GH*0.10));
  var room   = floorY - restY - 1;                      /* depth of the bay */

  for(var i=0;i<peds.length;i++){
    var p = peds[i], v = p.v, on = v > 0.4;
    var faceHi = on ? p.hi : '#eef3f8';                 /* bare alloy tread */
    var faceLo = on ? '#1c1411' : '#0d1116';
    /* roughly four or five tread squares across, and enough rows to come
       out about as tall as it is wide — the reference pedals are chunky
       blocks, not blades. The plate hangs so its foot rests just clear of
       the floor, with the rest of its travel left underneath it. */
    var sq   = Math.max(2, Math.floor(p.w/4.6));
    var lean = Math.max(1, Math.round(sq*0.8));         /* rake, top to foot */
    var nc   = Math.max(2, Math.floor((p.w - lean)/sq));
    var nr   = Math.max(3, Math.min(10, Math.round(room*0.72/sq)));
    var pw   = nc*sq, ph = nr*sq;
    var topY = Math.max(1, floorY - travel - 2 - ph) + Math.round(v*travel);

    drawTread(px, p.x0, topY, nc, nr, sq, lean, faceHi, faceLo);

    if(v > 0.05)                                        /* travel glow */
      px(p.x0, floorY+1, pw + lean, 1, on ? p.led : HUDC.amberLo);
  }
}

/* --------------------------------------------------------- warning lamps
   Cosmetic dash atmosphere: they take a hint from the drive (a cooked
   engine, a battered car, the lever pulled) but nothing reads them back.
   Drawn as outlined pixel glyphs in a bordered strip, like the reference's
   own lamp panel rather than as scaled vector icons. */
function drawLampStrip(px, x, y, w, h){
  pxPanel(px, x, y, w, h, '#141416', '#3A3A3E', '#242428');
}
function drawLamp(px, x, y, sz, kind, on, col){
  var u = Math.max(1, Math.round(sz/7));
  var cx = x + (sz>>1), cy = y + (sz>>1);
  var ink = on ? col : '#6E7276';

  if(kind === 'temp'){                                  /* coolant */
    px(cx-u, y+1, u*2, sz-3-u*2, ink);                  /* stem */
    px(cx-u*2, y+sz-2-u*3, u*4, u*3, ink);              /* bulb */
    px(cx+u*2, y+2,     u*2, u, ink);                   /* fins */
    px(cx+u*2, y+2+u*2, u*2, u, ink);
  } else if(kind === 'engine'){                         /* check engine */
    px(x+1, cy-u, sz-2, u*2, ink);                      /* block */
    px(cx-u, cy-u*3, u*3, u*2, ink);                    /* rocker cover */
    px(x+1, cy+u, u*2, u*2, ink);                       /* sump */
    px(x+sz-2-u, cy-u*2, u, u*2, ink);                  /* pulley */
  } else {                                              /* brake / lever */
    pxDisc(px, cx, cy, Math.max(2, (sz>>1)-1), ink);    /* drum */
    pxDisc(px, cx, cy, Math.max(1, (sz>>1)-2), '#141416');
    px(cx-u, cy-u*2, u*2, u*3, ink);                    /* the ! */
    px(cx-u, cy+u*2, u*2, u, ink);
  }
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
    document.documentElement.style.setProperty('--cluster-h', L.H+'px');
    /* the flat bar alone — the dials stand above it, and the rail backdrop
       has to stop at the same line so they break its edge too */
    document.documentElement.style.setProperty('--dash-bar-h', L.bandH+'px');
    /* steering buttons are as tall as the bar plus their own rise, so their
       mounts root in the bar and their heads clear it; everything else on
       the dash is cut to the bar itself */
    hudCtl.steerH = Math.max(24, Math.round((L.bandH + 18)/2));
    hudCtl.barArt = Math.max(20, Math.round(L.bandH/2));
    /* re-cut every control at the new size, then re-dock them all */
    hudCtl.drawnL = hudCtl.drawnR = null;
    hudCtl.drawnHb = hudCtl.drawnUp = hudCtl.drawnDn = hudCtl.drawnGas = -1;
    hudCtl.needLayout = true;
  }
  cluster.g.setTransform(S,0,0,S,0,0);
  cluster.g.imageSmoothingEnabled = false;
  return true;
}

/* Visual-regression hook: the screenshot harness reads the live cluster
   geometry off this rather than guessing dial boxes out of the pixels. */
if(typeof window !== 'undefined') window.__hudLayout = function(){ return cluster.L; };

function drawCluster(r){
  if(!ensureCluster()) return;
  var L = cluster.L, g = cluster.g, i;
  g.clearRect(0,0,L.W,L.H);
  g.drawImage(cluster.base, 0, 0, L.W, L.H);
  var px = pxInto(g, 0, 0, 1);              /* one art pixel = one CSS pixel */

  drawPedalPlates(g, L, hudCtl.gas, hudCtl.brake);

  /* ---- tachometer ---- */
  var rpm = cluster.nRpm;
  var hot = rpm >= 1.0;
  drawNeedle(px, L.tachX, L.dialY, L.R,
             dialAngle(clamp(rpm*TACH_SCALE,0,TACH_MAX), 0, TACH_MAX),
             hot ? HUDC.needleHot : HUDC.needle);

  /* ---- speedometer + digital readout ---- */
  var kmh = cluster.nKmh;
  drawNeedle(px, L.spdX, L.dialY, L.R,
             dialAngle(clamp(kmh,0,cluster.kmhMax), 0, cluster.kmhMax),
             HUDC.needleSpd);
  /* the readout lives at the foot of the console module, seven-segment and
     with its unit alongside, the way the reference has it — not stamped on
     the speedo's face, where the reference leaves nothing at all */
  var txt = String(Math.round(Math.max(0,kmh)));
  var dh7 = L.lcdH - 2, dw7 = Math.max(3, Math.round(dh7*0.5));
  var unitW = pxTextW('KMH', 1) + 3;
  var lcdW = pxSegW(txt, dw7);
  var lcx = L.auxX + (L.wa - lcdW - unitW)/2;
  pxSeg(px, txt, lcx, L.lcdY + 1, dw7, dh7, HUDC.lcdOn, 'l');
  pxText(px, 'KMH', lcx + lcdW + 3, L.lcdY + L.lcdH - 6, 1, '#9aa0a6', 'l');

  /* ---- shift-light ladder: a slanted stack of blue bars with green caps,
     the bottom one red, exactly as the reference draws it. It fills from the
     bottom as the revs climb; unlit bars stay as dark slots. ---- */
  var frac = clamp(rpm/1.12, 0, 1);
  var segs = L.ladSeg, pitch = L.ladPitch, barH = Math.max(2, pitch - 2);
  var step = L.ladStep, barW = L.ladW - step*(segs-1) - 2;
  var capW = Math.max(2, Math.round(barW*0.28));
  var lad0 = L.colY + Math.round((L.colH - (segs-1)*pitch - barH)/2);
  for(i=0;i<segs;i++){
    var row = segs-1-i;                                 /* 0 = top row */
    var bx  = L.ladX + 1 + row*step;                    /* lower rows lean out */
    var by  = lad0 + row*pitch;
    var lit = (i+1)/segs <= frac + 1e-6;
    if(!lit){ px(bx, by, barW, barH, HUDC.ladOff); px(bx, by, barW, 1, '#101114'); continue; }
    px(bx, by, barW - capW, barH, i === 0 ? HUDC.ladRed : HUDC.ladBlue);
    px(bx + barW - capW, by, capW, barH, HUDC.ladGreen);
  }

  /* ---- gear position row: N, R and the live gear, the active one lit ---- */
  var fwd = r ? r.car.fwd : 0, spd = Math.abs(fwd);
  var flash = r && r.perfectFlash > 0;
  var live = flash ? HUDC.green : (hot ? HUDC.warn : HUDC.amber);
  var at = spd < 2 ? 'N' : (fwd < -1 ? 'R' : String(r ? r.gear : 1));
  var pos = ['N', 'R', spd < 2 || fwd < -1 ? '1' : String(r ? r.gear : 1)];
  var pw = pxText7W('N', 1) + 4, px0 = L.gnX + Math.round((L.gnW - pos.length*pw + 4)/2);
  for(i=0;i<pos.length;i++)
    pxText7(px, pos[i], px0 + i*pw, L.gPosY, 1,
            pos[i] === at ? live : '#4A4A4E', 'l');

  /* ---- console module: tell-tales, knob, then the warning lamps ---- */
  var ax = L.auxX, aw = L.wa;
  var tw = Math.floor((aw - 7)/2), th = L.triH;
  drawAuxTri(px, ax + 3,        L.triY, tw, th, false, hudCtl.padDn > 0.15);
  drawAuxTri(px, ax + aw-3-tw,  L.triY, tw, th, true,  hudCtl.padUp > 0.15);

  /* the knob sits on the bare dash below the panel, as the reference's does */
  var kr = L.knobR, kcx = Math.round(ax + aw/2), kcy = Math.round(L.knobY + kr);
  pxDisc(px, kcx, kcy, kr, '#0A0A0C');
  pxDisc(px, kcx, kcy, kr-1, function(t){
    return t < -0.35 ? HUDC.knobHi : t < 0.35 ? HUDC.knob : HUDC.knobLo;
  });

  drawLampStrip(px, ax, L.lampY, aw, L.lampH);
  var lampSz = Math.max(5, Math.min(L.lampH - 4, Math.floor((aw - 6)/3)));
  var lx0 = Math.round(ax + (aw - lampSz*3 - 4)/2);
  var ly0 = Math.round(L.lampY + (L.lampH - lampSz)/2);
  var dmg = r ? r.car.damage : 0;
  drawLamp(px, lx0,                ly0, lampSz, 'temp',   cluster.heat > 0.55, HUDC.warn);
  drawLamp(px, lx0 + lampSz + 2,   ly0, lampSz, 'engine', dmg > 45,            HUDC.amber);
  drawLamp(px, lx0 + lampSz*2 + 4, ly0, lampSz, 'brake',  hudCtl.hb > 0.5,     HUDC.warn);
}

/* The pair of blue shift tell-tales inside the console panel: solid
   triangles, left pointing down and right pointing up, in the reference's
   royal blue. They brighten when the matching paddle is tapped. */
function drawAuxTri(px, x, y, w, h, up, lit){
  var i, cx = x + (w>>1);
  var n = Math.max(2, Math.min(h, (w+1)>>1));
  var col = lit ? '#8C8EEE' : HUDC.tri;
  var y0 = y + ((h - n) >> 1);
  for(i=0;i<n;i++){                     /* apex at the top when pointing up */
    var run = up ? (i+1) : (n-i);
    px(cx - run + 1, y0 + i, run*2 - 1, 1, col);
  }
}

/* The moulded housing every physical control on the dash is cut from: a
   dark panel with a rolled top lip and a shaded body, matching the flat
   pixel language of the reference's minus and plus buttons. */
function drawHousing(px, w, h, lit){
  var y, t, c;
  px(1, 0, w-2, h, '#05070a');                          /* outer edge */
  px(0, 1, 1, h-2, '#05070a');
  px(w-1, 1, 1, h-2, '#05070a');
  for(y=1; y<h-1; y++){
    t = y/(h-1);
    c = lit ? (t < 0.10 ? '#ffd487' : t < 0.30 ? '#c98a2a' : '#7d5312')
            : (t < 0.06 ? '#69747f' : t < 0.18 ? '#39424c' :
               t < 0.70 ? '#20272f' : '#141a20');
    px(1, y, w-2, 1, c);
  }
  px(1, 1, 1, h-2, lit ? '#ffe3a6' : '#4c5762');        /* left bevel */
  px(w-2, 1, 1, h-2, '#0a0e13');                        /* right shade */
  px(3, 4, w-6, h-8, lit ? '#241d0a' : '#0A0C10');      /* inset face */
}

/* ------------------------------------------------------------ dash tabs
   The reference's minus and plus are flat, very dark parallelograms — the
   top edge shifted right of the bottom, a hairline black outline, no lip
   and no gradient — carrying a small mid-grey glyph. Every button on the
   dash is cut from this, so the steering arrows and the shift tabs are the
   same object with a different stamp. Returns the glyph's centre. */
function drawTab(px, W, H, pressed){
  var y, off, lean = Math.max(2, Math.round(H*0.34));
  var drop = pressed ? 1 : 0;
  var bw = W - lean - 1;
  for(y=0; y<H-1-drop; y++){
    off = Math.round((H-2-drop-y)/(H-2-drop) * lean);
    px(off,      y+drop, bw+1, 1, HUDC.tabEdge);        /* cast outline */
    px(off+1,    y+drop, bw-1, 1, pressed ? HUDC.tabOn : HUDC.tab);
  }
  px(1, H-2, bw-1, 1, HUDC.tabEdge);
  if(pressed) px(Math.round(lean)+1, drop, bw-1, 1, HUDC.tabOnHi);
  return { cx: Math.round(lean/2) + Math.round(bw/2),
           cy: Math.round((H-1)/2) + drop,
           ink: pressed ? HUDC.tabOnInk : HUDC.tabInk };
}

/* --------------------------------------------------- steering buttons
   The same tab the reference stamps its minus and plus into, carrying a
   solid arrowhead pointing outboard instead. */
function drawSteer(id, right, pressed){
  var cv = document.getElementById(id);
  if(!cv) return;
  var W = 30, H = Math.max(16, Math.round((hudCtl.barArt || 26)*0.74));
  var px = hudPainter(cv, W, H, 2);
  var t = drawTab(px, W, H, pressed), i;
  var n = Math.max(5, Math.min(H-9, (W>>1)-5) | 1);
  var ax0 = t.cx + (right ? -Math.round(n*0.45) : Math.round(n*0.45));
  for(i=0;i<n;i++){
    var hh = n - i;
    px(right ? ax0 + i : ax0 - i, t.cy - hh/2, 1, hh, t.ink);
  }
}

/* ------------------------------------------------------ handbrake lever
   A console-mounted fly-off lever in a chrome housing to match the rest
   of the dash: base, gaiter, angled arm and a grip with a release
   button. Engaging swings the arm up towards vertical. */
function drawHandbrake(v){
  var cv = document.getElementById('hbrake-cv');
  if(!cv) return;
  /* sized to the dash bar, and anchored to its foot so the console base
     always sits down on the dash whatever height the bar came out */
  var H = Math.max(24, hudCtl.barArt || 30), d = H - 32;
  var px = hudPainter(cv, 20, H, 2);
  var pivotX = 5, pivotY = 24 + d;
  var on = v > 0.5;

  drawHousing(px, 20, H, on);                           /* chrome surround */
  px(2, 26+d, 16, 4, HUDC.dark);                        /* console base */
  px(2, 26+d, 16, 1, on ? HUDC.amber : HUDC.steelLo);
  px(pivotX-2, 21+d, 7, 5, HUDC.black);                 /* rubber gaiter */
  px(pivotX-1, 21+d, 5, 1, HUDC.rubberHi);

  var ang = (38 + v*36) * Math.PI/180;                  /* 38deg at rest, 74deg pulled */
  var dx = Math.cos(ang), dy = -Math.sin(ang);
  var len = Math.max(8, 13 + Math.min(0, d));
  for(var i=0;i<=len;i++){
    px(pivotX + dx*i - 1, pivotY + dy*i - 1, 2, 2, HUDC.steel);
    px(pivotX + dx*i - 1, pivotY + dy*i - 1, 1, 1, HUDC.steelHi);
  }
  px(pivotX-2, pivotY-2, 4, 4, HUDC.steelLo);           /* pivot boss */
  px(pivotX-1, pivotY-1, 2, 2, HUDC.black);

  var gx = pivotX + dx*len, gy = pivotY + dy*len;       /* grip */
  px(gx-3, gy-5, 6, 8, HUDC.black);
  px(gx-2, gy-4, 4, 6, on ? HUDC.amberLo : HUDC.rubber);
  px(gx-2, gy-4, 4, 1, on ? HUDC.amber : HUDC.rubberHi);
  px(gx-2, gy+1, 4, 1, HUDC.black);
  px(gx-1, gy-5, 3, 1, on ? HUDC.amber : HUDC.dim);     /* release button */
}

/* --------------------------------------------------------- shift paddles
   The reference's own minus and plus: the dash tab with a stamped bar, and
   a second bar crossed over it on the up-shift. */
function drawPaddle(id, up, press, active){
  var cv = document.getElementById(id);
  if(!cv) return;
  var W = 22, H = Math.max(16, Math.round((hudCtl.barArt || 26)*0.62));
  var px = hudPainter(cv, W, H, 2);
  var t = drawTab(px, W, H, press > 0.5);
  var ink = press > 0.5 ? t.ink : (active ? t.ink : '#3D4146');
  var arm = Math.max(3, (W - 10) >> 1);
  px(t.cx - arm, t.cy, arm*2, 2, ink);
  if(up) px(t.cx - 1, t.cy - arm + 1, 2, arm*2, ink);
}

/* ---------------------------------------------------------- throttle pedal
   The reference parks a tall checker-tread pedal at the end of the dash;
   this is that pedal, and it replaces the flat GAS text box. Same tread art
   as the pedals in the bay, so the two ends of the dash match. */
function drawGasPedal(v, on){
  var cv = document.getElementById('gas-cv');
  if(!cv) return;
  var W = 22, H = Math.max(20, hudCtl.barArt || 26);
  var px = hudPainter(cv, W, H, 2);
  var floorY = H - 2;
  var sq = 4, lean = 3;
  var nc = Math.max(2, Math.floor((W - lean - 2)/sq));
  var nr = Math.max(3, Math.floor((floorY - 3)/sq));
  var travel = 2;
  var topY = Math.max(1, floorY - travel - 1 - nr*sq) + Math.round(clamp(v,0,1)*travel);

  px(0, floorY, W, H-floorY, '#2b333a');                /* footwell floor */
  px(0, floorY, W, 1, '#69747f');
  drawTread(px, 1, topY, nc, nr, sq, lean,
            on ? '#b8f6c1' : '#eef3f8', on ? '#111c13' : '#0d1116');
  if(v > 0.05)                                          /* travel glow */
    px(1, floorY+1, nc*sq + lean, 1, on ? HUDC.green : HUDC.amberLo);
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

  if(q(hudCtl.gas) !== hudCtl.drawnGas){
    hudCtl.drawnGas = q(hudCtl.gas);
    drawGasPedal(hudCtl.gas, hudCtl.gas > 0.4);
  }

  /* the steering buttons are on/off, so they only ever repaint on a press */
  if(input.left !== hudCtl.drawnL){
    hudCtl.drawnL = input.left;
    drawSteer('steer-l-cv', false, input.left);
  }
  if(input.right !== hudCtl.drawnR){
    hudCtl.drawnR = input.right;
    drawSteer('steer-r-cv', true, input.right);
  }

  /* re-dock only once everything above has been re-cut, so the offsets are
     measured against the sizes the canvases actually ended up */
  if(hudCtl.needLayout){ hudCtl.needLayout = false; layoutDashControls(); }
}

/* force a full repaint, e.g. when a race starts or the viewport changes */
function resetHudControls(){
  hudCtl.gas = hudCtl.brake = hudCtl.hb = hudCtl.padUp = hudCtl.padDn = 0;
  hudCtl.drawnHb = hudCtl.drawnGas = -1;
  hudCtl.drawnUp = hudCtl.drawnDn = -1; hudCtl.drawnMode = null;
  hudCtl.drawnL = hudCtl.drawnR = null;
  cluster.nRpm = cluster.nKmh = cluster.heat = 0;
  /* size the speedo to the car actually being driven, rounded up to a
     whole major division so the numbering stays tidy */
  /* 0-240 in eight divisions, as on the reference; a car that runs past it
     gets a bigger dial, still in eight steps so the numbering stays tidy */
  if(race) cluster.kmhMax = Math.max(240, Math.ceil(race.stats.kmh*1.08/24)*24);
  cluster.key = '';                                     /* force a face rebuild */
  drawCluster(race);
  /* after the cluster, so the buttons are cut to the bar height it settled on */
  drawSteer('steer-l-cv', false, false);
  drawSteer('steer-r-cv', true, false);
  var manual = save.settings.transmission === 'manual';
  drawHandbrake(0);
  drawGasPedal(0, false);
  drawPaddle('pad-up-cv', true, 0, manual);
  drawPaddle('pad-dn-cv', false, 0, manual);
  document.getElementById('p-shiftup').classList.toggle('auto', !manual);
  document.getElementById('p-shiftdn').classList.toggle('auto', !manual);
  /* last, once every canvas has its final size */
  hudCtl.needLayout = false;
  layoutDashControls();
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
