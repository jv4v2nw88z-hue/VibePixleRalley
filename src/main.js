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
    fitted: 'all'
  };
}
function freshSave(){
  var s = { v:1, money:1200, current:'hatch', cars:{}, stages:{}, settings:{ control:'buttons', audio:true, autoGas:false, tiltSens:1 } };
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
  }
}
function persist(){
  try{ localStorage.setItem(SAVE_KEY, JSON.stringify(save)); }catch(e){}
}
function curCarSave(){ return save.cars[save.current]; }
function curCarDef(){ return carDef(save.current); }
function carIndex(id){ for(var i=0;i<CARS.length;i++) if(CARS[i].id===id) return i; return 0; }

/* ---------------------------------------------------------------- stats */
function computeStats(carId){
  var def = carDef(carId), cs = save.cars[carId], u = cs.up;
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
   PIXEL SPRITES — every sprite is drawn from a character map into an
   offscreen canvas, so there are no external asset files.
   Legend:  B body  D dark body trim  G glass  K black  T tyre  Y headlight
            R taillight  W white  S spoiler  . transparent
   ========================================================================= */

var CAR_SPRITES = {
  hatch: [
    '..............',
    '...KKKKKKKK...',
    '..KYYKKKKYYK..',
    '..BBBBBBBBBB..',
    '.TBBBBBBBBBBT.',
    '.TBBBBBBBBBBT.',
    '.TBBBBBBBBBBT.',
    '..BBBBBBBBBB..',
    '..BGGGGGGGGB..',
    '..BGGGGGGGGB..',
    '.DBBBBBBBBBBD.',
    '..BBBBBBBBBB..',
    '..BBBBBBBBBB..',
    '..BBBBBBBBBB..',
    '..BBBBBBBBBB..',
    '..BGGGGGGGGB..',
    '..BGGGGGGGGB..',
    '.TBBBBBBBBBBT.',
    '.TBBBBBBBBBBT.',
    '.TBBBBBBBBBBT.',
    '..BBBBBBBBBB..',
    '..KRRKKKKRRK..',
    '...KKKKKKKK...',
    '..............'
  ],
  rally: [
    '..............',
    '..KKKKKKKKKK..',
    '..KYYKDDKYYK..',
    '..BBBBBBBBBB..',
    'TTBBBBBBBBBBTT',
    'TTBBBBBBBBBBTT',
    'TTBBBBDDBBBBTT',
    '..BBBBBBBBBB..',
    '.BBGGGGGGGGBB.',
    '.BBGGGGGGGGBB.',
    'DBBBBBBBBBBBBD',
    '.BBBBBBBBBBBB.',
    '.BBBBBBBBBBBB.',
    '.BBBBBBBBBBBB.',
    '.BBBBBBBBBBBB.',
    '.BBGGGGGGGGBB.',
    '..BGGGGGGGGB..',
    'TTBBBBBBBBBBTT',
    'TTBBBBBBBBBBTT',
    'TTBBBBBBBBBBTT',
    '..BBBBBBBBBB..',
    '..KRRKKKKRRK..',
    '.SSSSSSSSSSSS.',
    '..............'
  ],
  wrc: [
    '..KKKKKKKKKK..',
    '.KKKKKKKKKKKK.',
    '.KYYKDDDDKYYK.',
    '.BBBBBBBBBBBB.',
    'TTBBBBBBBBBBTT',
    'TTBBBDDDDBBBTT',
    'TTBBBDDDDBBBTT',
    '.BBBBBBBBBBBB.',
    'BBBGGGGGGGGBBB',
    'BBBGGGGGGGGBBB',
    'DBBBBBBBBBBBBD',
    'BBBBBBBBBBBBBB',
    'BBBBBBBBBBBBBB',
    'BBBBBBBBBBBBBB',
    'BBBBBBBBBBBBBB',
    'BBBGGGGGGGGBBB',
    '.BBGGGGGGGGBB.',
    'TTBBBBBBBBBBTT',
    'TTBBBBBBBBBBTT',
    'TTBBBBBBBBBBTT',
    '.BBBBBBBBBBBB.',
    '.KRRKKKKKKRRK.',
    'SSSSSSSSSSSSSS',
    'SS..........SS'
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

/* livery predicates operate in sprite-pixel space */
function liveryColorAt(livery, px, py, w, h, accent){
  if(livery===1){                                   /* twin stripes */
    var c = w/2;
    if(Math.abs(px - (c-2.5)) < 1.2 || Math.abs(px - (c+1.5)) < 1.2) return accent;
  } else if(livery===2){                            /* rally #7 side panels + roundel */
    if(px<=2 || px>=w-3) return accent;
    if(py>=10 && py<=14 && px>=5 && px<=8) return accent;
  } else if(livery===3){                            /* chevron */
    var mid = w/2, k = Math.abs(px-mid);
    var band = (py - k*1.15);
    if(band>3.2 && band<6.4) return accent;
    if(band>10.5 && band<13.7) return accent;
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

  var accent = ACCENTS[paint] || '#ffffff';
  var body = paint, bodyDark = shade(paint,-0.16), bodyLite = shade(paint,0.11);

  for(var y=0;y<h;y++){
    var row = map[y];
    for(var x=0;x<w;x++){
      var ch = row[x];
      if(ch === '.') continue;
      var col = null;
      if(ch==='B'){
        col = liveryColorAt(livery,x,y,w,h,accent);
        if(!col){
          /* fake a light source from the top-left for a bit of 16-bit shading */
          col = (x < 3) ? bodyLite : (x > w-4 ? bodyDark : body);
        }
      }
      else if(ch==='D') col = shade(paint,-0.34);
      else if(ch==='G') col = damageTier>=1 ? '#7f93a2' : '#4d6b86';
      else if(ch==='K') col = '#171a1c';
      else if(ch==='T') col = '#101112';
      else if(ch==='Y') col = '#ffe9a8';
      else if(ch==='R') col = '#e8352a';
      else if(ch==='S') col = shade(paint,-0.42);
      else if(ch==='W') col = '#f2f2ea';
      g.fillStyle = col;
      g.fillRect(x*scale, y*scale, scale, scale);
    }
  }

  /* damage: cracked screen, then dents & scorch */
  if(damageTier>=1){
    g.fillStyle = 'rgba(20,24,28,.85)';
    var cx0 = (w/2)*scale;
    for(var i=0;i<7;i++){
      var yy = (8 + i*0.34)*scale;
      g.fillRect(cx0 - (i-3)*scale*0.9, yy, scale, scale);
    }
  }
  if(damageTier>=2){
    g.fillStyle = 'rgba(30,26,22,.72)';
    g.fillRect(1*scale, 5*scale, scale*2, scale*3);
    g.fillRect((w-3)*scale, 17*scale, scale*2, scale*3);
    g.fillRect(3*scale, 20*scale, scale*3, scale);
    g.fillStyle = 'rgba(0,0,0,.5)';
    g.fillRect(4*scale, 2*scale, scale*3, scale*2);
  }
  return { canvas:cv, w:cv.width, h:cv.height, scale:scale, pw:w, ph:h };
}

var spriteCache = {};
function getCarSprite(carId, paint, livery, damageTier, scale){
  var key = carId+'|'+paint+'|'+livery+'|'+damageTier+'|'+scale;
  if(!spriteCache[key]) spriteCache[key] = renderCarSprite(carId,paint,livery,damageTier,scale);
  return spriteCache[key];
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
window.addEventListener('resize', resize);
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

document.addEventListener('keydown', function(e){
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

/* ------------------------------------------------------------------ audio */
var actx = null, engineOsc = null, engineOsc2 = null, engineGain = null, noiseSrc = null, noiseGain = null, masterGain = null;
function audioKick(){
  if(!save.settings.audio) return;
  if(actx){ if(actx.state==='suspended') actx.resume(); return; }
  try{
    var AC = window.AudioContext || window.webkitAudioContext;
    if(!AC) return;
    actx = new AC();
    masterGain = actx.createGain(); masterGain.gain.value = 0.5; masterGain.connect(actx.destination);
    engineGain = actx.createGain(); engineGain.gain.value = 0; engineGain.connect(masterGain);
    engineOsc = actx.createOscillator(); engineOsc.type = 'sawtooth'; engineOsc.frequency.value = 60;
    engineOsc2 = actx.createOscillator(); engineOsc2.type = 'square'; engineOsc2.frequency.value = 30;
    var g2 = actx.createGain(); g2.gain.value = 0.35;
    engineOsc.connect(engineGain); engineOsc2.connect(g2); g2.connect(engineGain);
    engineOsc.start(); engineOsc2.start();

    var len = actx.sampleRate*2, buf = actx.createBuffer(1,len,actx.sampleRate), dat = buf.getChannelData(0);
    for(var i=0;i<len;i++) dat[i] = (Math.random()*2-1)*0.5;
    noiseSrc = actx.createBufferSource(); noiseSrc.buffer = buf; noiseSrc.loop = true;
    noiseGain = actx.createGain(); noiseGain.gain.value = 0;
    var flt = actx.createBiquadFilter(); flt.type = 'bandpass'; flt.frequency.value = 900; flt.Q.value = 0.7;
    noiseSrc.connect(flt); flt.connect(noiseGain); noiseGain.connect(masterGain);
    noiseSrc.start();
  }catch(e){ actx = null; }
}
function audioEngine(rpm, load, slip, running){
  if(!actx || !save.settings.audio){ if(engineGain) engineGain.gain.value = 0; if(noiseGain) noiseGain.gain.value = 0; return; }
  var f = 42 + rpm*150;
  try{
    engineOsc.frequency.setTargetAtTime(f, actx.currentTime, 0.05);
    engineOsc2.frequency.setTargetAtTime(f*0.5, actx.currentTime, 0.05);
    engineGain.gain.setTargetAtTime(running ? 0.055 + load*0.075 : 0, actx.currentTime, 0.08);
    noiseGain.gain.setTargetAtTime(running ? Math.min(0.16, slip*0.16) : 0, actx.currentTime, 0.06);
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

  if(gas && !hb){
    /* the power curve runs out above the rated top speed, so rolling
       resistance settles the car right around its quoted figure */
    var head = 1 - c.fwd/(topSpeed*1.35);
    if(head < 0) head = 0;
    c.fwd += accel * head * dt * (offtrack ? 0.70 : 1);
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
  var rpmFrac = clamp(spd/topSpeed, 0, 1);
  var gear = Math.min(6, 1 + Math.floor(rpmFrac*5.999));
  var rpm = (rpmFrac*6 - (gear-1));
  audioEngine(clamp(rpm,0.05,1), gas?1:0.25, slip*(spd>25?1:0), driving||r.state==='countdown');

  /* ---- finish ---- */
  if(driving && q.d >= r.track.len - 24){
    r.state = 'done'; r.finishTime = r.t;
    bigMsg('FINISH');
    audioBeep(760,0.4);
    setTimeout(finishRace, 900);
  }

  updateHUD(spd, gear);
}

function respawn(r, q){
  var c = r.car, nodes = r.track.nodes;
  var nd = nodes[Math.min(nodes.length-1, q.node)];
  c.x = nd.x; c.y = nd.y; c.a = nd.a;
  c.fwd = 48; c.lat = 0;
  c.vx = Math.sin(nd.a)*48; c.vy = -Math.cos(nd.a)*48;
  c.stuck = 0; c.steer = 0;
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

  g.save();
  g.translate(W/2 + shakeX, H*0.62 + shakeY);
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
  g.save();
  g.translate(c.x, c.y);
  g.rotate(c.a);
  g.fillStyle = 'rgba(0,0,0,.30)';
  g.fillRect(-sp.w/2+6, -sp.h/2+7, sp.w-8, sp.h-10);
  g.drawImage(sp.canvas, -sp.w/2, -sp.h/2);
  g.restore();
}

function drawMinimap(g, r, W, H){
  var nodes = r.track.nodes;
  var mw = Math.min(120, W*0.19), mh = mw;
  var x0 = W - mw - 10, y0 = H*0.5 - mh*0.5;
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
function updateHUD(spd, gear){
  var r = race;
  document.getElementById('t-time').textContent = fmtTime(r.state==='countdown'?0:r.t);
  document.getElementById('h-kmh').textContent = Math.round(Math.abs(spd)*0.42);
  document.getElementById('h-gear').textContent = spd < 2 ? 'N' : gear;
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
    if(race.state !== 'done') stepRace(dt);
    else { race.shake = Math.max(0, race.shake - dt*2); spawnEffects(race,dt,0,SURFACES[race.stage.surface],false); }
    renderRace();
  } else if(!race){
    ctx.fillStyle = '#10150e';
    ctx.fillRect(0,0,view.w,view.h);
  }
}
/* =========================================================================
   UI — screens, stage select, garage, settings, results
   ========================================================================= */

var SCREENS = ['menu','stages','garage','settings','results'];
var currentScreen = 'menu';

function showScreen(name){
  for(var i=0;i<SCREENS.length;i++){
    document.getElementById('screen-'+SCREENS[i]).classList.toggle('hidden', SCREENS[i] !== name);
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
  if(name==='settings') renderSettings();
}

function refreshMoney(){
  var m = fmtMoney(save.money);
  document.getElementById('menu-money').textContent = m;
  document.getElementById('stages-money').textContent = m;
  document.getElementById('garage-money').textContent = m;
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

function statRow(label, val, pct, green){
  return '<div class="stat"><span class="lab">'+label+'</span>'+
         '<span class="bar"><i class="'+(green?'g':'')+'" style="width:'+clamp(pct,0,100)+'%"></i></span>'+
         '<span class="val">'+val+'</span></div>';
}
function renderGarage(){
  refreshMoney();
  var def = curCarDef(), cs = curCarSave(), s = computeStats(save.current);
  document.getElementById('car-name').textContent = def.name + '  ·  ' + def.cls;

  var cc = document.getElementById('car-canvas');
  var rect = cc.getBoundingClientRect();
  cc.width = Math.max(60, Math.round(rect.width));
  cc.height = Math.max(40, Math.round(rect.height));
  var g = cc.getContext('2d');
  g.imageSmoothingEnabled = false;
  g.clearRect(0,0,cc.width,cc.height);
  var sc = Math.max(3, Math.min(7, Math.min(Math.floor(cc.width/20), Math.floor(cc.height/26))));
  var sp = getCarSprite(save.current, cs.paint, cs.livery, 0, sc);
  g.drawImage(sp.canvas, Math.round((cc.width-sp.w)/2), Math.round((cc.height-sp.h)/2));

  document.getElementById('car-stats').innerHTML =
    statRow('SPEED', s.kmh+' KM/H', s.kmh/240*100) +
    statRow('ACCEL', s.accelScore, s.accelScore) +
    statRow('HANDLING', s.handlingScore, s.handlingScore) +
    statRow('G/GRAVEL', s.gripScore('gravel'), s.gripScore('gravel'), true) +
    statRow('G/TARMAC', s.gripScore('tarmac'), s.gripScore('tarmac'), true) +
    statRow('G/SNOW', s.gripScore('snow'), s.gripScore('snow'), true) +
    '<div class="stat" style="margin-top:3px"><span class="lab">TYRES</span><span style="color:var(--text)">'+s.tire.name+' T'+s.tireLvl+'</span></div>';

  var tabs = document.querySelectorAll('#tabs .tab');
  for(var i=0;i<tabs.length;i++) tabs[i].classList.toggle('active', tabs[i].getAttribute('data-tab')===garageTab);

  var body = document.getElementById('tab-body');
  body.innerHTML = '';
  if(garageTab==='upgrades') renderUpgrades(body);
  else if(garageTab==='tires') renderTires(body);
  else if(garageTab==='paint') renderPaint(body);
  else renderCars(body);
}

function pips(level, max){
  var h = '<span class="pips">';
  for(var i=0;i<max;i++) h += '<span class="pip'+(i<level?' on':'')+'"></span>';
  return h + '</span>';
}
function renderUpgrades(body){
  var cs = curCarSave(), ci = carIndex(save.current);
  for(var i=0;i<UPGRADES.length;i++){
    (function(up){
      var lvl = cs.up[up.id];
      var row = document.createElement('div');
      row.className = 'up-row';
      var cost = upgradeCost(up, lvl, ci);
      row.innerHTML = '<span class="up-name">'+up.name+'</span>' + pips(lvl, up.max) +
                      '<span class="up-desc">'+up.desc+'</span>';
      var btn = document.createElement('button');
      btn.className = 'btn small';
      if(lvl >= up.max){ btn.textContent = 'MAX'; btn.disabled = true; }
      else {
        btn.textContent = fmtMoney(cost);
        btn.disabled = save.money < cost;
        if(!btn.disabled) btn.classList.add('primary');
        btn.onclick = function(){
          if(save.money < cost) return;
          save.money -= cost; cs.up[up.id]++;
          persist(); audioBeep(880,0.09); renderGarage();
        };
      }
      row.appendChild(btn);
      body.appendChild(row);
    })(UPGRADES[i]);
  }
  var hint = document.createElement('div');
  hint.className = 'up-desc';
  hint.style.padding = '8px';
  hint.textContent = 'Stage 2 needs handling 44+. Stage 3 needs handling 58+ and 170 km/h+. Upgrades apply to the currently selected car only.';
  body.appendChild(hint);
}

function renderTires(body){
  var cs = curCarSave(), ci = carIndex(save.current);
  for(var i=0;i<TIRES.length;i++){
    (function(t){
      var lvl = cs.tires[t.id];
      var row = document.createElement('div');
      row.className = 'up-row';
      row.innerHTML = '<span class="up-name">'+t.name+'</span>' + pips(lvl,3) +
        '<span class="up-desc">'+t.desc+'<br>GRAVEL '+t.mul.gravel.toFixed(2)+
        ' · TARMAC '+t.mul.tarmac.toFixed(2)+' · SNOW '+t.mul.snow.toFixed(2)+'</span>';
      if(lvl>0){
        var fit = document.createElement('button');
        fit.className = 'btn small' + (cs.fitted===t.id ? ' primary' : '');
        fit.textContent = cs.fitted===t.id ? 'FITTED' : 'FIT';
        fit.disabled = cs.fitted===t.id;
        fit.onclick = function(){ cs.fitted = t.id; persist(); audioBeep(700,0.08); renderGarage(); };
        row.appendChild(fit);
      }
      var buy = document.createElement('button');
      buy.className = 'btn small';
      if(lvl>=3){ buy.textContent = 'MAX'; buy.disabled = true; }
      else {
        var cost = tireCost(t, lvl, ci);
        buy.textContent = (lvl===0?'BUY ':'') + fmtMoney(cost);
        buy.disabled = save.money < cost;
        if(!buy.disabled) buy.classList.add('primary');
        buy.onclick = function(){
          if(save.money < cost) return;
          save.money -= cost; cs.tires[t.id]++;
          if(cs.tires[t.id]===1) cs.fitted = t.id;
          persist(); audioBeep(880,0.09); renderGarage();
        };
      }
      row.appendChild(buy);
      body.appendChild(row);
    })(TIRES[i]);
  }
}

function renderPaint(body){
  var cs = curCarSave();
  var wrap = document.createElement('div');
  wrap.style.padding = '8px';
  wrap.innerHTML = '<div class="up-name" style="width:auto;margin-bottom:6px">PAINT</div>';
  var sw = document.createElement('div');
  sw.className = 'swatches';
  for(var i=0;i<PAINTS.length;i++){
    (function(col){
      var d = document.createElement('div');
      d.className = 'sw' + (cs.paint===col?' sel':'');
      d.style.background = col;
      d.onclick = function(){ cs.paint = col; persist(); audioBeep(660,0.06); renderGarage(); };
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
      b.className = 'btn small' + (cs.livery===lv.id?' primary':'');
      b.textContent = lv.name;
      b.onclick = function(){ cs.livery = lv.id; persist(); audioBeep(660,0.06); renderGarage(); };
      ll.appendChild(b);
    })(LIVERIES[j]);
  }
  wrap.appendChild(ll);
  body.appendChild(wrap);
}

function renderCars(body){
  for(var i=0;i<CARS.length;i++){
    (function(def, idx){
      var cs = save.cars[def.id];
      var row = document.createElement('div');
      row.className = 'car-row';
      var cvs = document.createElement('canvas');
      cvs.width = 42; cvs.height = 72;
      cvs.style.width = '42px'; cvs.style.height = '72px';
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
      if(!cs.owned){
        btn.textContent = fmtMoney(def.price);
        btn.disabled = save.money < def.price;
        if(!btn.disabled) btn.classList.add('primary');
        btn.onclick = function(){
          if(save.money < def.price) return;
          save.money -= def.price; cs.owned = true; save.current = def.id;
          persist(); audioBeep(1000,0.16); renderGarage();
        };
      } else if(save.current === def.id){
        btn.textContent = 'IN USE'; btn.disabled = true;
      } else {
        btn.textContent = 'SELECT'; btn.classList.add('primary');
        btn.onclick = function(){ save.current = def.id; persist(); audioBeep(760,0.08); renderGarage(); };
      }
      row.appendChild(btn);
      body.appendChild(row);
      var g = cvs.getContext('2d');
      g.imageSmoothingEnabled = false;
      var sp = getCarSprite(def.id, cs.paint, cs.livery, 0, 3);
      g.drawImage(sp.canvas, (cvs.width-sp.w)/2, (cvs.height-sp.h)/2);
    })(CARS[i], i);
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
  about.innerHTML = '<div class="hint">RALLY PIXEL — keyboard: arrows / WASD to steer and accelerate, SHIFT or DOWN for handbrake, ESC to pause.</div>';
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
    el.addEventListener('click', function(){ garageTab = el.getAttribute('data-tab'); audioKick(); renderGarage(); });
  })(tabEls[t]);
}
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
