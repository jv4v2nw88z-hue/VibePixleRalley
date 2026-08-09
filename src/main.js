import './style.css';
import { renderCarTop } from './carsprite.js';
import * as PF from './pixfont.js';

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
/* `color`/`color2` are the surface and its worn wheel tracks, `edge` the
   loose material along the rim of the road, `verge` the scuffed band just
   outside it, `grit` the stones the tyres throw and `mark` the colour a
   sliding tyre leaves behind. */
var SURFACES = {
  tarmac:{ name:'TARMAC', grip:1.34, roll:0.34, color:'#3b3d40', color2:'#484b4e', dust:'#7d7f82',
           edge:'#d8d8d2', verge:'#2b2d2f', grit:'#9a9c9f', mark:'rgba(12,11,10,.44)' },
  gravel:{ name:'GRAVEL', grip:1.00, roll:0.60, color:'#8a6f4c', color2:'#9c8159', dust:'#d3b98c',
           edge:'#ab926a', verge:'#5e4e37', grit:'#e2cfa2', mark:'rgba(62,46,28,.30)' },
  snow:  { name:'SNOW',   grip:0.74, roll:0.72, color:'#d5e2ee', color2:'#e4eef7', dust:'#ffffff',
           edge:'#9fb4c8', verge:'#b6c8d8', grit:'#ffffff', mark:'rgba(118,148,178,.30)' },
  ice:   { name:'ICE',    grip:0.46, roll:0.26, color:'#a9cbe0', color2:'#c2dded', dust:'#e6f4ff',
           edge:'#87aec6', verge:'#8fb2c8', grit:'#e6f4ff', mark:'rgba(108,148,180,.22)' },
  mud:   { name:'MUD',    grip:0.80, roll:0.95, color:'#54452f', color2:'#61503a', dust:'#8a7350',
           edge:'#6b5940', verge:'#3d3223', grit:'#9c8763', mark:'rgba(28,21,13,.42)' }
};
/* off-track surface per stage theme */
var OFFTRACK = {
  forest:{ name:'GRASS', grip:0.62, roll:2.30, color:'#355023', dust:'#557a35', grit:'#6b8f3e' },
  mountain:{ name:'DIRT', grip:0.66, roll:2.10, color:'#4a4a45', dust:'#7a7a70', grit:'#8b8b80' },
  snowpass:{ name:'DEEP SNOW', grip:0.55, roll:2.70, color:'#e9f2fa', dust:'#ffffff', grit:'#ffffff' }
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
    req:{ handling:44 },
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
    req:{ handling:58, topSpeed:170 },
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

/* ------------------------------------------------------ device + quality
   Three graphics tiers. LOW keeps a tired phone at a playable frame rate,
   MEDIUM is the mobile default, HIGH is what a desktop or a recent phone
   gets. Everything expensive reads its budget from here rather than from
   magic numbers scattered through the renderer, so changing tier is one
   lookup and nothing has to be rebuilt.

     px         css pixels per world-buffer pixel — the internal render
                resolution, and by far the biggest lever on both frame rate
                and how chunky the pixel art reads
     parts      particle ceiling
     skids      tyre-mark ceiling
     lights     0 none, 1 headlight pool, 2 pool + cone
     detail     ground-clutter density multiplier
     drawAhead  scenery draw distance, in track nodes                    */
var QUALITY = {
  low:    { name:'LOW',    px:2.7, parts:80,  skids:260, lights:1, detail:0.50, drawAhead:64,  glow:0, maxW:400 },
  medium: { name:'MEDIUM', px:2.0, parts:200, skids:560, lights:2, detail:0.85, drawAhead:96,  glow:1, maxW:540 },
  high:   { name:'HIGH',   px:1.5, parts:360, skids:950, lights:2, detail:1.00, drawAhead:130, glow:1, maxW:700 }
};
var IS_TOUCH = ('ontouchstart' in window) || (navigator.maxTouchPoints||0) > 0;
function defaultQuality(){ return IS_TOUCH ? 'medium' : 'high'; }
function GFX(){ return QUALITY[save.settings.quality] || QUALITY.medium; }

/* ---------------------------------------------------------------- units
   The dash reads in MPH, as on the reference cluster, but the stage gates
   and the garage have always talked in km/h. The physics stays in world
   units either way; these are the only conversions in the game. */
var U_KMH = 0.42, U_MPH = 0.261;
function speedUnit(){ return save.settings.units === 'kmh' ? 'KMH' : 'MPH'; }
function speedFactor(){ return save.settings.units === 'kmh' ? U_KMH : U_MPH; }
function toSpeed(fwd){ return Math.abs(fwd)*speedFactor(); }
/* dial full scale, rounded up to a whole major division */
function speedStep(){ return save.settings.units === 'kmh' ? 40 : 20; }
function speedDialMax(topSpeed){
  var step = speedStep();
  return Math.max(step*4, Math.ceil(topSpeed*speedFactor()*1.12/step)*step);
}
function haptic(ms){
  if(!save || !save.settings.haptics) return;
  try{ if(navigator.vibrate) navigator.vibrate(ms); }catch(e){}
}

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
  var s = { v:1, money:1200, current:'hatch', cars:{}, stages:{},
            settings:{ control:'buttons', audio:true, autoGas:false, tiltSens:1,
                       transmission:'auto', quality:defaultQuality(), units:'mph', haptics:true } };
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
    /* likewise for the settings this pass added: an older save just takes
       the device-appropriate default rather than being thrown away */
    if(QUALITY[s.settings.quality]) save.settings.quality = s.settings.quality;
    if(s.settings.units === 'mph' || s.settings.units === 'kmh') save.settings.units = s.settings.units;
    if(typeof s.settings.haptics === 'boolean') save.settings.haptics = s.settings.haptics;
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

/* Gates are stored in km/h because that is what the stats have always been
   in; the label is generated so it follows the units setting. */
function reqLabel(st){
  if(!st.req) return '';
  var out = [];
  if(st.req.handling) out.push('HANDLING ' + st.req.handling + '+');
  if(st.req.topSpeed)
    out.push(Math.round(st.req.topSpeed * (save.settings.units === 'kmh' ? 1 : 0.6214)) +
             ' ' + speedUnit() + '+');
  return out.join(' · ');
}

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

    /* The treeline. Two things matter here and both were wrong before: how
       FAR out it goes, and how much the sizes vary.

       The scatter used to stop 200 units from the centreline, which is inside
       the frame at this zoom — so the outer thirds of the screen were bare
       grass. It now reaches past the far edge of the view. And the depth is
       biased towards the verge (u squared), so the near band packs into a
       wall of trees the way a forest stage looks, thinning out behind it
       instead of being an even sprinkle. Sizes run more than 3:1 so no two
       neighbours read as the same stamp. */
    var clumps = isMountain ? 2 : 3;
    for(var t=0;t<clumps;t++){
      if(rand() > (isMountain ? 0.55 : 0.92)) continue;
      var s2 = rand() < 0.5 ? -1 : 1;
      var u2 = rand(); u2 *= u2;
      var lat2 = nd.hw + 38 + u2*430;
      var roll = rand();
      var type = isSnow ? (roll<0.66?0:4)
               : (isMountain ? (roll<0.40?1:(roll<0.86?0:4))
                             : (roll<0.70?0:(roll<0.94?4:1)));
      var size = type===0 ? 12+rand()*30 : (type===1 ? 7+rand()*10 : 8+rand()*13);
      var solid = lat2 < nd.hw + 96;   /* only the near ones can be clipped */
      props.push(mkProp(nd.x+nx*lat2*s2, nd.y+ny*lat2*s2, type, size, i, solid, rand()));
    }
    /* loose ground litter — small stones and tufts, never solid. Cheap, and
       it is what stops the grass reading as flat colour under the trees. */
    if(rand() < 0.55){
      var s3 = rand() < 0.5 ? -1 : 1;
      var lat3 = nd.hw + 16 + rand()*300;
      props.push(mkProp(nd.x+nx*lat3*s3, nd.y+ny*lat3*s3,
                        rand() < 0.45 ? 1 : 4, 4+rand()*6, i, false, rand()));
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
           /* what it looks like vs what it collides as: a conifer's canopy
              spreads well past the trunk, so the drawn size is bigger than
              the hit radius and clipping the outer branches is free */
           vis: size * (type===0 ? 1.85 : type===4 ? 1.45 : 1.15) * (0.72 + seed*0.62),
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

     1. TOP-DOWN  — built by src/carsprite.js. A pseudo-3D body: silhouette,
        curvature ramp, then the panels that stand proud of it (hood, glass,
        roof, boot, spoiler, mirrors, lamps). Authored in sprite pixels and
        blitted into the low-resolution world buffer at roughly 1:1, so a
        sprite pixel is a world pixel.

     2. SIDE VIEW — built from independent, individually swappable layers
        (chassis / wheels / hood / livery / glass / trim). A later pass can
        replace one layer — say WHEEL_STYLES.rally or SIDE_LAYERS.hood —
        or nudge opts.rideHeight, without touching any of the others.
   ========================================================================= */

function shade(hex, amt){
  var c = hex.replace('#','');
  if(c.length===3) c = c[0]+c[0]+c[1]+c[1]+c[2]+c[2];
  var r = parseInt(c.substr(0,2),16), g = parseInt(c.substr(2,2),16), b = parseInt(c.substr(4,2),16);
  r = clamp(Math.round(r + 255*amt),0,255);
  g = clamp(Math.round(g + 255*amt),0,255);
  b = clamp(Math.round(b + 255*amt),0,255);
  return 'rgb('+r+','+g+','+b+')';
}

/* One palette derived from the chosen paint, shared by both sprite sets.
   The top-down renderer needs a few extra steps on the ramp — a roof that
   sits above the body, a third glass tone, a specular catch — so they live
   here too and both sets keep reading one palette. */
function carPalette(paint, damageTier){
  return {
    body:   paint,
    lite:   shade(paint, 0.13),
    hi:     shade(paint, 0.26),
    spec:   shade(paint, 0.40),
    roof:   shade(paint, 0.20),
    roofHi: shade(paint, 0.33),
    dark:   shade(paint,-0.15),
    darker: shade(paint,-0.28),
    deep:   shade(paint,-0.44),
    accent: ACCENTS[paint] || '#ffffff',
    glass:      damageTier>=1 ? '#8ba0af' : '#3d5d7a',
    glassLite:  damageTier>=1 ? '#a9bcc9' : '#6d90ad',
    glassDark:  damageTier>=1 ? '#68808f' : '#1d3247',
    glassSheen: damageTier>=1 ? '#dfe9f0' : '#9fc4e0',
    tyre:'#171a1c', tyreLite:'#2b3034', tyreDark:'#0b0d0f',
    vent:'#2a2f34',
    chrome:'#b9bec4', chromeDark:'#767b82',
    lamp:'#fff4c4', lampHot:'#ffd45c', tail:'#f2402f', tailDark:'#8e1f18',
    crack:'rgba(226,236,246,.85)', scorch:'#2b241d', dent:'#4a4038',
    black:'#111417', white:'#f2f2ea'
  };
}

/* Livery predicates, in top-down sprite-pixel space. `halfw` is the body
   half-width on that row, so a side stripe follows the body taper instead
   of running off the edge on the narrow rows. */
function liveryColorAt(livery, px, py, w, h, accent, halfw){
  var mid = (w-1)/2, d = px - mid, t = py/(h-1);
  if(livery===1){                                   /* twin bonnet-to-boot stripes */
    var ad = Math.abs(d);
    if(ad >= 1.2 && ad <= 3.2) return accent;
  } else if(livery===2){                            /* rally #7 — side panels */
    if(halfw && Math.abs(d) >= halfw - 2.2) return accent;
    if(t > 0.44 && t < 0.62 && halfw && Math.abs(d) >= halfw - 4.2) return accent;
  } else if(livery===3){                            /* chevron */
    var band = py - Math.abs(d)*1.25;
    if(band > 2.5 && band < 5.5) return accent;
    if(band > 12 && band < 15) return accent;
    if(band > 21.5 && band < 24.5) return accent;
  }
  return null;
}

/* Returns {canvas, shadow, w, h, pw, ph, lamps} — a car pointing UP (-Y). */
var spriteCache = {}, spriteCacheN = 0;
function getCarSprite(carId, paint, livery, damageTier, scale){
  var key = carId+'|'+paint+'|'+livery+'|'+damageTier+'|'+scale;
  if(!spriteCache[key]){
    if(spriteCacheN > 60){ spriteCache = {}; spriteCacheN = 0; }
    spriteCache[key] = renderCarTop(carDef(carId).sprite, carPalette(paint, damageTier),
                                    livery, liveryColorAt, damageTier, scale || 1);
    spriteCacheN++;
  }
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

/* --------------------------------------------------------- scenery draw
   Seen from above, through the low-resolution buffer. Height is implied the
   way a voxel scene implies it: a hard shadow offset down and to the right,
   then stepped rings of colour offset up and to the LEFT, each one smaller
   and brighter than the last, so the eye reads a stack of blocks rising out
   of the ground rather than a flat decal.

   The light direction — up and to the left — is the same one the car sprite
   and the dashboard bezels use, which is most of what makes the three look
   like they belong in one picture. */
var TREE_PALS = {
  forest:  [['#0d2210','#1d4020','#2f6330','#468b41','#5da84e'],
            ['#0b1d0e','#193619','#28542a','#3c7638','#519145']],
  mountain:[['#0f2412','#20421f','#33612e','#48803f','#5c9a4d'],
            ['#101f13','#1d3a22','#2d5734','#40763f','#548d4c']],
  snowpass:[['#0d1f18','#1c3a2c','#2f5a44','#8fb6c2','#e8f4fb'],
            ['#0b1a14','#183226','#28503c','#7ea6b4','#dbeaf4']]
};

function drawProp(g, p, theme, onScreen){
  var s = p.vis || p.size;
  var v = p.seed;
  if(onScreen != null && onScreen < 6){
    /* far or tiny: one shadow, one body, done */
    var flat = p.type===0 ? ((TREE_PALS[theme] || TREE_PALS.forest)[v < 0.5 ? 0 : 1])[2]
             : p.type===1 ? '#6f6f68'
             : p.type===2 ? '#8d939a'
             : p.type===3 ? '#e8eef4'
             : (theme==='snowpass' ? '#dfe9f2' : '#33581f');
    g.fillStyle = 'rgba(0,0,0,.30)';
    g.fillRect(p.x - s*0.34, p.y - s*0.30, s*0.74, s*0.74);
    g.fillStyle = flat;
    g.fillRect(p.x - s*0.46, p.y - s*0.46, s*0.92, s*0.92);
    return;
  }
  g.save();
  g.translate(p.x, p.y);

  if(p.type===0){                                   /* conifer, from above */
    var pal = (TREE_PALS[theme] || TREE_PALS.forest)[v < 0.5 ? 0 : 1];
    g.fillStyle = 'rgba(0,0,0,.34)';                /* cast shadow */
    g.fillRect(-s*0.34, -s*0.30, s*0.74, s*0.74);
    g.fillStyle = theme==='snowpass' ? '#4a3a2c' : '#3a2a1c';
    g.fillRect(-s*0.07, s*0.10, s*0.14, s*0.26);    /* trunk peeking out */
    /* the canopy: five stepped rings climbing up and to the left */
    /* Every tree is stamped from the same five rings, but each ring is
       nudged and stretched by a value derived from the prop's own seed. Two
       neighbours therefore never share a silhouette, which is the difference
       between a forest and a tiled wallpaper. */
    var j1 = (v*97) % 1, j2 = (v*173) % 1, j3 = (v*311) % 1;
    g.fillStyle = '#0c1e0e';                        /* outline */
    g.fillRect(-s*(0.54+j1*0.05), -s*(0.54+j2*0.05), s*(1.08+j1*0.07), s*(1.08+j2*0.07));
    var rings = [[0.50,0.00,0], [0.40,-0.05,1], [0.30,-0.10,2], [0.20,-0.15,3], [0.10,-0.19,4]];
    for(var i=0;i<rings.length;i++){
      var k2 = i/(rings.length-1);
      var rw = rings[i][0] * (1 + (j1-0.5)*0.22*k2);
      var rh = rings[i][0] * (1 + (j2-0.5)*0.22*k2);
      var ox = rings[i][1]*s + (j3-0.5)*s*0.06*k2;
      var oy = rings[i][1]*s + (j1-0.5)*s*0.06*k2;
      g.fillStyle = pal[rings[i][2]];
      g.fillRect(-s*rw + ox, -s*rh + oy, s*rw*2, s*rh*2);
    }
  } else if(p.type===1){                            /* boulder */
    g.fillStyle = 'rgba(0,0,0,.34)';
    g.fillRect(-s*0.36, -s*0.28, s*0.86, s*0.76);
    g.fillStyle = '#4f4f4a'; g.fillRect(-s*0.50, -s*0.45, s, s*0.92);
    g.fillStyle = '#6f6f68'; g.fillRect(-s*0.50, -s*0.45, s*0.72, s*0.62);
    g.fillStyle = '#8d8d84'; g.fillRect(-s*0.44, -s*0.40, s*0.42, s*0.36);
    g.fillStyle = '#a8a89d'; g.fillRect(-s*0.40, -s*0.36, s*0.18, s*0.15);
  } else if(p.type===2){                            /* guardrail post */
    g.fillStyle = 'rgba(0,0,0,.34)';
    g.fillRect(-s*0.40, -s*0.16, s, s*0.62);
    g.fillStyle = '#3b4046'; g.fillRect(-s*0.50, -s*0.30, s, s*0.60);
    g.fillStyle = '#c3c8ce'; g.fillRect(-s*0.50, -s*0.30, s, s*0.22);
    g.fillStyle = '#7d838a'; g.fillRect(-s*0.50, -s*0.08, s, s*0.14);
  } else if(p.type===3){                            /* snow marker pole */
    g.fillStyle = 'rgba(0,0,0,.22)';
    g.fillRect(-s*0.22, -s*0.20, s*0.62, s*0.72);
    g.fillStyle = '#f4f8fb'; g.fillRect(-s*0.30, -s*0.42, s*0.60, s*0.84);
    g.fillStyle = '#e0483a'; g.fillRect(-s*0.30, -s*0.42, s*0.60, s*0.28);
    g.fillStyle = '#ffffff'; g.fillRect(-s*0.30, -s*0.42, s*0.22, s*0.14);
  } else {                                          /* bush / stump */
    var bp = theme==='snowpass' ? ['#b9cbd8','#dfe9f2','#ffffff']
           : theme==='mountain' ? ['#33401f','#4a5a2c','#5f7239']
           : ['#1f3a16','#33581f','#487431'];
    g.fillStyle = 'rgba(0,0,0,.26)';
    g.fillRect(-s*0.32, -s*0.24, s*0.76, s*0.66);
    g.fillStyle = bp[0]; g.fillRect(-s*0.46, -s*0.40, s*0.92, s*0.80);
    g.fillStyle = bp[1]; g.fillRect(-s*0.40, -s*0.36, s*0.62, s*0.56);
    g.fillStyle = bp[2]; g.fillRect(-s*0.34, -s*0.32, s*0.30, s*0.26);
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

/* ------------------------------------------------------- world buffer
   The stage is not drawn straight to the screen. It goes into a small
   offscreen canvas — a few hundred pixels across — which is then blitted
   up with nearest-neighbour filtering. That one change does three things
   at once:

     * it is what makes the game look like pixel art rather than like
       smooth vector shapes. Every tree, rut and dust puff lands on the
       same coarse grid, and the car sprite is drawn at roughly 1:1 with
       it, so sprite pixels and world pixels are the same size;
     * it cuts the fill cost by the square of the scale factor, which is
       most of the reason this runs at 60fps on a phone;
     * it gives the graphics-quality setting something meaningful to
       change — `px` is css pixels per buffer pixel.

   The HUD, the dashboard and the countdown are drawn AFTER the blit, at
   full device resolution, so nothing the player has to read is ever
   resampled.                                                           */
var world = { cv:null, g:null, w:0, h:0, scale:1, key:'' };

function ensureWorld(){
  var gfx = GFX();
  var ps = gfx.px;
  var bw = Math.max(80, Math.round(view.w/ps));
  /* An absolute ceiling on the internal resolution. Pixel art does not get
     better by rendering a 1440-wide window at 720 internal pixels — it gets
     smoother, which is the opposite of the point — and the fill cost grows
     with the area of the window for no visual gain. Above the cap the blit
     simply scales up further and the pixels get chunkier, which is correct. */
  if(bw > gfx.maxW){ ps = view.w/gfx.maxW; bw = gfx.maxW; }
  var bh = Math.max(60, Math.round(view.h/ps));
  var key = bw+'x'+bh;
  if(key !== world.key){
    if(!world.cv) world.cv = document.createElement('canvas');
    world.cv.width = bw; world.cv.height = bh;
    world.g = world.cv.getContext('2d', { alpha:false });
    world.key = key;
  }
  world.w = bw; world.h = bh;
  /* the blit factor: one buffer pixel is this many css pixels */
  world.scale = view.w/bw;
  world.g.imageSmoothingEnabled = false;
  return world;
}

/* ------------------------------------------------------------- viewport
   The game fills the screen, and it measures the screen from the element it
   is actually painted into rather than from `window.innerWidth/Height`.

   That distinction matters on a phone. In mobile Safari the layout viewport,
   the visual viewport and `innerHeight` disagree with each other while the
   URL bar is sliding, and they disagree again for a frame or two after a
   rotation. Sizing a canvas from the wrong one is how a game ends up as a
   strip in the middle of a black page: the backing store is one size, the
   element another, and the two never reconcile because nothing measures
   again afterwards.

   So: one measurement of #app's real box, both canvases given an explicit
   CSS size to match it, and a ResizeObserver plus the visualViewport events
   to catch every later change — including the ones that fire no window
   `resize` at all. */
var appEl = document.getElementById('app');
var pendingResize = false, resizeCheck = 0;

function viewportBox(){
  var r = appEl.getBoundingClientRect();
  var w = Math.round(r.width), h = Math.round(r.height);
  var vv = window.visualViewport;
  /* a stale or collapsed layout box falls back to the visual viewport, then
     to the window, so there is no state in which we size to nothing */
  if(w < 2 || h < 2){
    w = Math.round(vv ? vv.width : window.innerWidth);
    h = Math.round(vv ? vv.height : window.innerHeight);
  }
  return { w: Math.max(200, w), h: Math.max(140, h) };
}

function resize(){
  var box = viewportBox();
  var dpr = Math.min(window.devicePixelRatio || 1, 2);
  view.w = box.w; view.h = box.h; view.dpr = dpr;
  cv.width = Math.round(box.w*dpr); cv.height = Math.round(box.h*dpr);
  /* an explicit CSS size, not 100%: the backing store and the element are
     then the same box by construction and can never drift apart */
  cv.style.width = box.w + 'px';
  cv.style.height = box.h + 'px';
  ctx.setTransform(dpr,0,0,dpr,0,0);
  ctx.imageSmoothingEnabled = false;
  world.key = '';
  dash.key = '';
}

/* Coalesce every source of size change into one resize per frame. */
function requestResize(){ pendingResize = true; }
function applyPendingResize(){
  if(!pendingResize) return;
  pendingResize = false;
  var box = viewportBox();
  if(box.w === view.w && box.h === view.h &&
     Math.min(window.devicePixelRatio || 1, 2) === view.dpr) return;
  resize();
  if(race) resetHudControls();
}
window.addEventListener('resize', requestResize);
window.addEventListener('orientationchange', function(){
  requestResize();
  /* iOS reports the old box for a beat after the rotation completes */
  setTimeout(requestResize, 120);
  setTimeout(requestResize, 400);
});
if(window.visualViewport){
  visualViewport.addEventListener('resize', requestResize);
  visualViewport.addEventListener('scroll', requestResize);
}
if(window.ResizeObserver){
  try{ new ResizeObserver(requestResize).observe(appEl); }catch(e){}
}

/* =========================================================================
   INPUT

   The dashboard is the controller. Every touch control is a region of the
   dash canvas rather than a DOM node, so there is one hit map, one piece of
   art and nothing to keep in sync — and no browser buttons floating over a
   pixel-art cockpit.

   Pointer Events give multi-touch for free: both thumbs down at once is the
   normal case (steer with the left, throttle with the right), so each
   pointer id is tracked to the region it went down on and released from
   exactly that one. Dragging off a control releases it, dragging onto
   another engages it, which is what a thumb sliding between the throttle
   and the handbrake expects to happen.
   ========================================================================= */
var input = { left:false, right:false, gas:false, brake:false, hbrake:false,
              steer:0, tiltRaw:0, tiltZero:0, tiltOn:false };

/* held regions, by pointer id */
var pointers = {};
/* how many pointers are holding each region — a region stays down until the
   last finger on it lifts */
var held = {};

function regionDown(id){
  if(!id) return;
  held[id] = (held[id]||0) + 1;
  if(held[id] > 1) return;
  applyRegion(id, true);
}
function regionUp(id){
  if(!id || !held[id]) return;
  held[id]--;
  if(held[id] > 0) return;
  delete held[id];
  applyRegion(id, false);
}
function applyRegion(id, down){
  switch(id){
    case 'steerL': input.left = down; break;
    case 'steerR': input.right = down; break;
    case 'gas':    input.gas = down; break;
    case 'brake':  input.brake = down; break;
    case 'hbrake': input.hbrake = down; break;
    /* the shifters are taps, not holds */
    case 'padUp':   if(down){ ctl.padUp = 1; shiftUp(); } break;
    case 'padDn':   if(down){ ctl.padDn = 1; shiftDown(); } break;
    case 'shiftUp': if(down){ ctl.shiftUp = 1; shiftUp(); } break;
    case 'shiftDn': if(down){ ctl.shiftDn = 1; shiftDown(); } break;
  }
  if(down){
    audioKick();
    haptic(id === 'padUp' || id === 'padDn' || id === 'shiftUp' || id === 'shiftDn' ? 14 : 8);
  }
}

function bindDashInput(el){
  var down = function(e){
    var id = dashHit(e.clientX, e.clientY);
    if(!id) return;                       /* the paddle overhang is mostly air */
    e.preventDefault();
    if(el.setPointerCapture) { try{ el.setPointerCapture(e.pointerId); }catch(err){} }
    pointers[e.pointerId] = id;
    regionDown(id);
  };
  var move = function(e){
    var was = pointers[e.pointerId];
    if(was === undefined) return;
    e.preventDefault();
    var now = dashHit(e.clientX, e.clientY);
    /* a tap control should not re-fire while the thumb wanders over it */
    if(now === was) return;
    regionUp(was);
    if(now){ pointers[e.pointerId] = now; regionDown(now); }
    else delete pointers[e.pointerId];
  };
  var up = function(e){
    var was = pointers[e.pointerId];
    if(was === undefined) return;
    e.preventDefault();
    delete pointers[e.pointerId];
    regionUp(was);
  };
  el.addEventListener('pointerdown', down, {passive:false});
  el.addEventListener('pointermove', move, {passive:false});
  el.addEventListener('pointerup', up, {passive:false});
  el.addEventListener('pointercancel', up, {passive:false});
  el.addEventListener('lostpointercapture', up, {passive:false});
  el.addEventListener('contextmenu', function(e){ e.preventDefault(); });
}

/* Everything still held is released when the game is interrupted — pausing
   with the throttle down must not leave it stuck open. */
function releaseAllInput(){
  pointers = {}; held = {};
  input.left = input.right = input.gas = input.brake = input.hbrake = false;
}

document.addEventListener('keydown', function(e){
  if(e.repeat) return;
  if(e.key==='e'||e.key==='E'||e.key==='x'||e.key==='X'){ ctl.padUp = 1; shiftUp(); return; }
  if(e.key==='q'||e.key==='Q'||e.key==='z'||e.key==='Z'){ ctl.padDn = 1; shiftDown(); return; }
  if(e.key==='ArrowLeft'||e.key==='a'||e.key==='A') input.left = true;
  else if(e.key==='ArrowRight'||e.key==='d'||e.key==='D') input.right = true;
  else if(e.key==='ArrowUp'||e.key==='w'||e.key==='W') input.gas = true;
  else if(e.key==='ArrowDown'||e.key==='s'||e.key==='S') input.brake = true;
  else if(e.key===' '||e.key==='Shift'){ input.hbrake = true; e.preventDefault(); }
  else if(e.key==='Escape'||e.key==='p'||e.key==='P'){ if(race && race.state!=='done') togglePause(); }
});
document.addEventListener('keyup', function(e){
  if(e.key==='ArrowLeft'||e.key==='a'||e.key==='A') input.left = false;
  else if(e.key==='ArrowRight'||e.key==='d'||e.key==='D') input.right = false;
  else if(e.key==='ArrowUp'||e.key==='w'||e.key==='W') input.gas = false;
  else if(e.key==='ArrowDown'||e.key==='s'||e.key==='S') input.brake = false;
  else if(e.key===' '||e.key==='Shift') input.hbrake = false;
});
/* a tab switch or a phone call arrives as a blur, not as key-ups */
window.addEventListener('blur', function(){ releaseAllInput(); });

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

/* rpm is 0..1+ of redline, load is 0..1 throttle, boost 0..1 turbo pressure */
function audioEngine(rpm, load, slip, running, boost){
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
    /* the turbo rides on the gear whine: more pressure, more of it, and it
       climbs in pitch as the impeller spools */
    var bst = clamp(boost||0, 0, 1);
    oscWhine.frequency.setTargetAtTime(f*(3.02 + bst*0.9), t, 0.04);
    whineGain.gain.setTargetAtTime(0.05 + load*0.11 + r*0.05 + bst*0.10, t, 0.06);
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
function audioStopAll(){ audioEngine(0,0,0,false,0); }

/* the blow-off valve, on a lifted throttle with pressure still in the pipe */
function audioBlowoff(power){
  if(!actx || !save.settings.audio || !noiseBuf) return;
  try{
    var t = actx.currentTime;
    var src = actx.createBufferSource(); src.buffer = noiseBuf; src.loop = true;
    var bp = actx.createBiquadFilter();
    bp.type = 'bandpass'; bp.Q.value = 2.4;
    bp.frequency.setValueAtTime(2600, t);
    bp.frequency.exponentialRampToValueAtTime(900, t + 0.28);
    var g = actx.createGain();
    g.gain.setValueAtTime(0.0001, t);
    g.gain.exponentialRampToValueAtTime(0.10*clamp(power,0.1,1), t + 0.02);
    g.gain.exponentialRampToValueAtTime(0.0001, t + 0.30);
    src.connect(bp); bp.connect(g); g.connect(masterGain);
    src.start(t); src.stop(t + 0.32);
  }catch(e){}
}

/* =========================================================================
   COCKPIT DASHBOARD

   One canvas pinned to the bottom of the viewport, drawn as a single moulded
   rally dash rather than a row of widgets floating over the game: steering
   rockers under the left thumb, a gear selector, the tachometer, the shift
   block, the speedometer, a boost gauge, the handbrake and the throttle and
   brake pads under the right thumb, with a strip of tell-tales along the
   bottom. The paddle shifters stand proud of the dash top edge.

   COORDINATES. Everything is laid out on a fixed grid DASH_GH rows tall,
   with DASH_OVER further rows ABOVE the panel for the paddles. One grid unit
   is `u` device pixels; the painter rounds every edge to a whole device pixel
   so the art stays crisp at any scale, and the layout itself is resolution
   independent — a phone and a desktop get the same composition, not the same
   art scaled by CSS.

   SAFE AREAS. The moulding is drawn full bleed so the dash reaches the screen
   edges, but the layout box is inset by the device's safe-area insets, so no
   control ever ends up under a notch or the home indicator.

   COST. Everything that never moves — moulding, bezels, dial faces, every
   label — is painted once into an offscreen bitmap at device resolution. A
   frame is one blit plus the needles, digits, lamps and whichever controls
   are currently pressed.

   TOUCH. The layout doubles as the hit map: `L.regions` is the same list the
   renderer draws from, so a control cannot drift away from the area that
   activates it.
   ========================================================================= */

var DASH_GH = 128;                 /* panel height, in grid rows */
var DASH_OVER = 46;                /* rows above the panel, for the paddles */
/* Ceiling on device pixels per grid unit. The dash is pixel art on a 128-row
   grid; painting it at six device pixels per row on a large display buys
   nothing but a multi-megapixel repaint every frame. Above the cap the
   canvas is smaller than its CSS box and the browser scales it up with
   nearest-neighbour filtering, which is what the art wants anyway. */
var DASH_U_MAX = 3.2;

var DC = {
  shell:'#191d23', shellHi:'#3d4653', shellLo:'#0b0e13', seam:'#04060a',
  edge:'#5a6673', edgeLo:'#232a33', vent:'#0d1116',
  steel:'#96a0ab', steelHi:'#dbe3ea', steelLo:'#4d565f', steelDk:'#222932',
  face:'#07090c', tick:'#ffffff', tickDim:'rgba(206,222,242,.52)',
  num:'#f6f9ff', numDim:'#aebbcc',
  red:'#cf2a1c', redHot:'#ff6a52', needle:'#e8382a',
  amber:'#ffb432', amberLo:'#6d4a10',
  green:'#4fe463', greenLo:'#17491f',
  blue:'#5aa8ff', blueLo:'#183456',
  white:'#eef4fb', off:'#1c222a', offLo:'#0f1419'
};

/* ------------------------------------------------------------- painters */
/* Grid units in, whole device pixels out. Rounding both edges rather than
   the origin and the size keeps adjacent rectangles butted together with no
   seam and no half-pixel bleed. */
function dashPainter(g, u, oy){
  return function(x, y, w, h, col){
    var x0 = Math.round(x*u), x1 = Math.round((x+w)*u);
    var y0 = Math.round((y+oy)*u), y1 = Math.round((y+h+oy)*u);
    if(x1 <= x0) x1 = x0+1;
    if(y1 <= y0) y1 = y0+1;
    g.fillStyle = col;
    g.fillRect(x0, y0, x1-x0, y1-y0);
  };
}

/* a raised moulding: lit along the top and left, shaded along the bottom
   and right, which is the light direction the whole game uses */
function raised(px, x, y, w, h, face, hi, lo){
  px(x, y, w, h, face);
  px(x, y, w, 1, hi || DC.edge);
  px(x, y, 1, h, hi || DC.edge);
  px(x, y+h-1, w, 1, lo || DC.seam);
  px(x+w-1, y, 1, h, lo || DC.seam);
}
/* a recess cut into the moulding — the same bevel, inverted */
function sunken(px, x, y, w, h, face){
  px(x, y, w, h, face || DC.face);
  px(x, y, w, 1, DC.seam);
  px(x, y, 1, h, DC.seam);
  px(x, y+h-1, w, 1, DC.edgeLo);
  px(x+w-1, y, 1, h, DC.edgeLo);
}
function screw(px, x, y){
  px(x, y, 2, 2, DC.steelLo);
  px(x, y, 1, 1, DC.steelHi);
  px(x+1, y+1, 1, 1, DC.seam);
}
/* The bitmap face is 5x7 with a 1px gap, so a string at scale `s` is
   (6*len-1) by 7 grid units. Every label on the dash picks its scale by
   asking what fits the box it has been given rather than by a magic
   multiplier, which is what keeps the type consistent from a phone-sized
   dash to a desktop one. */
function fitScale(str, maxW, maxH){
  var s = Math.min((maxW+1)/(str.length*6), maxH/7);
  return Math.max(1, Math.floor(s));
}
function textH(scale){ return 7*scale; }

/* a run of segment lamps — rev lights, throttle bar, boost bar */
function lampRow(px, x, y, w, h, n, lit, on, off, gap){
  gap = gap == null ? 1 : gap;
  var sw = (w - (n-1)*gap)/n;
  for(var i=0;i<n;i++){
    var c = i < lit ? (typeof on === 'function' ? on(i, n) : on) : off;
    px(x + i*(sw+gap), y, sw, h, c);
    if(i < lit) px(x + i*(sw+gap), y, sw, 1, DC.white);
  }
}

/* =========================================================================
   LAYOUT
   ========================================================================= */

var safeProbe = null;
function safeInsets(){
  if(!safeProbe){
    safeProbe = document.createElement('div');
    safeProbe.style.cssText = 'position:fixed;top:0;left:0;width:0;height:0;' +
      'visibility:hidden;pointer-events:none;' +
      'padding:env(safe-area-inset-top) env(safe-area-inset-right) ' +
      'env(safe-area-inset-bottom) env(safe-area-inset-left);';
    document.body.appendChild(safeProbe);
  }
  var cs = getComputedStyle(safeProbe);
  return { t:parseFloat(cs.paddingTop)||0, r:parseFloat(cs.paddingRight)||0,
           b:parseFloat(cs.paddingBottom)||0, l:parseFloat(cs.paddingLeft)||0 };
}

/* How tall the panel is in CSS pixels. Deep enough to read as a cockpit —
   the reference gives the dash better than half the frame — but capped
   against the width too, so an ultra-wide phone in landscape does not end
   up with a dash so deep there is no road left to look at. */
function dashPanelH(){
  /* Deep enough to sit in, capped against the width so an ultra-wide phone
     does not end up with a cockpit and no road. The reference frames the
     dash at a little over half the picture; on a 2:1 phone that would leave
     almost nothing to look at, so this lands just under half and lets the
     squarer the screen, the deeper the dash. */
  return Math.round(clamp(Math.min(view.h*0.45, view.w*0.38), 96, 360));
}
/* what the chase camera has to keep the car clear of */
function dashBandH(){ return dash.L ? dash.L.panelCss : dashPanelH(); }

function dashLayout(){
  var dpr = view.dpr;
  var panelCss = dashPanelH();
  /* grid units per CSS pixel — the layout is defined in these and is
     independent of how many device pixels each one is painted with */
  var gpc = DASH_GH/panelCss;
  var u = clamp((panelCss*dpr)/DASH_GH, 1, DASH_U_MAX);
  var si = safeInsets();
  var GW = view.w*gpc;
  var inL = si.l*gpc, inR = si.r*gpc, inB = si.b*gpc;
  var UH = DASH_GH - inB;                       /* rows clear of system UI */
  var x0 = inL + 4, x1 = GW - inR - 4;

  var L = { u:u, gpc:gpc, GW:GW, UH:UH, over:DASH_OVER, panelCss:panelCss,
            cssW:view.w, cssH:panelCss*(DASH_GH + DASH_OVER)/DASH_GH,
            inL:inL, inR:inR, inB:inB, x0:x0, x1:x1, regions:[] };

  function reg(id, x, y, w, h, pad){
    pad = pad || 0;
    var o = { id:id, x:x, y:y, w:w, h:h,
              hx:x-pad, hy:y-pad, hw:w+2*pad, hh:h+2*pad };
    L.regions.push(o); L[id] = o;
    return o;
  }

  /* ---- left thumb: the two steering rockers ---- */
  var ah = clamp(UH*0.60, 34, 84), aw = clamp(ah*0.94, 30, 78);
  var ay = UH - 4 - ah;
  reg('steerL', x0, ay, aw, ah, 5);
  reg('steerR', x0 + aw + 4, ay, aw, ah, 5);
  L.leftEnd = x0 + aw*2 + 4;
  L.tell = { x:x0 + 1, y:Math.max(3, ay - 15), w:aw*2 + 2, h:11 };

  /* ---- right thumb: throttle in the corner, brake inboard, lever above ---- */
  var pw = clamp(UH*0.44, 28, 66), phh = clamp(UH*0.46, 30, 68);
  var py = UH - 4 - phh;
  reg('gas',   x1 - pw, py, pw, phh, 5);
  reg('brake', x1 - pw*2 - 4, py, pw, phh, 5);
  var hbH = Math.max(20, py - 7);
  reg('hbrake', x1 - pw, 4, pw, hbH, 4);
  L.aux = { x:x1 - pw*2 - 4, y:4, w:pw, h:hbH };
  L.rightStart = x1 - pw*2 - 8;

  /* ---- centre: gear, tacho, shift block, speedo, boost ----
     The dial size is whatever the width between the two thumb blocks allows.
     On a narrow phone that leaves vertical slack, which goes to centring the
     instruments rather than to inflating the tell-tale strip — the strip has
     a height of its own so its glyphs stay the same size everywhere. */
  var avail = Math.max(90, L.rightStart - L.leftEnd - 8);
  var stripH = clamp(UH*0.19, 11, 27);
  var instrH = UH - stripH - 7;
  var D = clamp(Math.min((avail - 24)/3.60, instrH), 40, 150);
  var gearW = D*0.42, shiftW = D*0.68, boostD = D*0.54;
  var cw = gearW + shiftW + boostD + 2*D + 20;
  var cx = L.leftEnd + 4 + Math.max(0, (avail - cw)/2);
  var top = 3 + Math.max(0, (instrH - D)/2);
  L.D = D; L.R = D/2; L.dialY = top + D/2;
  L.gear  = { x:cx, y:top+1, w:gearW, h:D-2 };            cx += gearW + 5;
  L.tachX = cx + D/2;                                     cx += D + 5;
  L.shift = { x:cx, y:top+1, w:shiftW, h:D-2 };
  reg('shiftDn', cx + 2,            top + 13, shiftW/2 - 3, D*0.24, 3);
  reg('shiftUp', cx + shiftW/2 + 1, top + 13, shiftW/2 - 3, D*0.24, 3);
  L.revBar = { x:cx + 3, y:top + 15 + D*0.24, w:shiftW - 6, h:Math.max(4, D*0.10) };
  L.readout = { x:cx + 2, y:top + D - D*0.30 - 2, w:shiftW - 4, h:D*0.30 };
                                                          cx += shiftW + 5;
  L.spdX = cx + D/2;                                      cx += D + 5;
  L.boost = { cx:cx + boostD/2, cy:top + D - boostD/2 - 1, r:boostD/2 };

  /* ---- tell-tale strip along the bottom of the centre section ---- */
  L.strip = { x:L.leftEnd + 4, y:UH - stripH - 3, w:L.rightStart - L.leftEnd - 8,
              h:stripH };

  /* ---- paddles, standing above the dash top edge ---- */
  var kw = clamp(D*0.50, 24, 60), kh = clamp(DASH_OVER*0.94, 22, 54);
  reg('padDn', L.leftEnd + 6,          4 - kh, kw, kh, 7);
  reg('padUp', L.rightStart - 6 - kw,  4 - kh, kw, kh, 7);

  return L;
}

/* =========================================================================
   GAUGES — the dial faces. Circles and needles are the one place the dash
   is not pixel art: a stepped circle at this size reads as a mistake rather
   than a style, and the reference cluster's bezels are smooth too. The
   numerals are the bitmap face, so the lettering still matches the HUD.
   ========================================================================= */

var DIAL_A0 = Math.PI*0.75, DIAL_SWEEP = Math.PI*1.5;
function dialAngle(v, min, max){ return DIAL_A0 + DIAL_SWEEP*clamp((v-min)/(max-min),0,1); }

/* The tacho reads in thousands of rpm. race.rpm is a fraction of redline,
   so redline sits exactly on the 7 and the dial runs on to 8. */
var TACH_MAX = 8, TACH_RED = 7, TACH_SCALE = 7;

function drawGauge(g, px, L, gcx, gcy, gR, o){
  var u = L.u, oy = L.over;
  var cx = gcx*u, cy = (gcy+oy)*u, R = gR*u;
  var i, v, a, maj, red, r0, r1;

  /* --- bezel: a polished ring, bright where the sky catches it top left,
     dark through the middle, a weaker second catch bottom right --- */
  var bw = Math.max(2.5, R*0.115);
  var bez = g.createLinearGradient(cx-R*0.75, cy-R*0.85, cx+R*0.68, cy+R*0.82);
  bez.addColorStop(0.00,'#ffffff'); bez.addColorStop(0.12,'#dbe3ea');
  bez.addColorStop(0.30,'#a9b5c1'); bez.addColorStop(0.48,'#69747f');
  bez.addColorStop(0.63,'#3a434c'); bez.addColorStop(0.80,'#93a0ad');
  bez.addColorStop(0.92,'#586371'); bez.addColorStop(1.00,'#252d36');
  g.beginPath(); g.arc(cx,cy,R,0,TAU); g.fillStyle = bez; g.fill();
  g.beginPath(); g.arc(cx,cy,R-bw*0.22,Math.PI*1.02,Math.PI*1.82);
  g.lineWidth = Math.max(0.8, bw*0.20); g.strokeStyle = 'rgba(255,255,255,.72)'; g.stroke();
  g.beginPath(); g.arc(cx,cy,R-bw*0.82,0,TAU);
  g.lineWidth = Math.max(0.9, bw*0.28); g.strokeStyle = 'rgba(6,9,14,.8)'; g.stroke();

  /* --- face: near-black glass, lifted a little off centre --- */
  var fr = R - bw;
  var face = g.createRadialGradient(cx-R*0.30, cy-R*0.36, R*0.03, cx, cy, R*1.05);
  face.addColorStop(0.00,'#1b222c'); face.addColorStop(0.42,'#0a0e14');
  face.addColorStop(1.00,'#020406');
  g.beginPath(); g.arc(cx,cy,fr,0,TAU); g.fillStyle = face; g.fill();

  /* --- scale track, carrying the redline band on the tacho --- */
  var trackR = fr - Math.max(1.6, R*0.05), trackW = Math.max(2, R*0.07);
  var a0 = dialAngle(o.min,o.min,o.max), a1 = dialAngle(o.max,o.min,o.max);
  g.lineCap = 'butt';
  g.beginPath(); g.arc(cx,cy,trackR,a0,a1);
  g.lineWidth = trackW; g.strokeStyle = 'rgba(168,196,232,.12)'; g.stroke();
  if(o.redFrom != null){
    var ra = dialAngle(o.redFrom,o.min,o.max);
    g.beginPath(); g.arc(cx,cy,trackR,ra,a1);
    g.lineWidth = trackW + 2; g.strokeStyle = 'rgba(232,56,42,.24)'; g.stroke();
    g.beginPath(); g.arc(cx,cy,trackR,ra,a1);
    g.lineWidth = trackW; g.strokeStyle = DC.red; g.stroke();
  }

  /* --- ticks --- */
  var steps = Math.round((o.max-o.min)/o.minor);
  var majEvery = Math.round(o.major/o.minor);
  for(i=0;i<=steps;i++){
    v = o.min + i*o.minor;
    maj = (i % majEvery) === 0;
    red = o.redFrom != null && v >= o.redFrom - 1e-6;
    a = dialAngle(v,o.min,o.max);
    r1 = trackR - trackW/2 - 1;
    r0 = r1 - (maj ? R*0.13 : R*0.062);
    g.beginPath();
    g.moveTo(cx+Math.cos(a)*r0, cy+Math.sin(a)*r0);
    g.lineTo(cx+Math.cos(a)*r1, cy+Math.sin(a)*r1);
    g.lineWidth = maj ? Math.max(1.6, R*0.048) : Math.max(1, R*0.016);
    g.strokeStyle = red ? (maj ? DC.redHot : 'rgba(226,80,60,.7)')
                        : (maj ? DC.tick : DC.tickDim);
    g.stroke();
  }

  /* --- numerals, in the bitmap face, sitting just inside the tick ring --- */
  var fs = Math.max(1, Math.round(gR*0.026));
  var labEvery = o.labelEvery || 1;
  var labR = (trackR - trackW/2 - R*0.135)/u - textH(fs)*0.62;
  for(i=0;i<=steps;i+=majEvery*labEvery){
    v = o.min + i*o.minor;
    a = dialAngle(v,o.min,o.max);
    red = o.redFrom != null && v >= o.redFrom - 1e-6;
    var lx = gcx + Math.cos(a)*labR, ly = gcy + Math.sin(a)*labR;
    PF.textC(px, String(Math.round(v)), lx, ly - textH(fs)/2,
             red ? '#ff9784' : (o.num || DC.num), fs, 1);
  }

  /* --- captions, close in to the hub where the numerals cannot reach.
     They are dropped rather than overlapped if the dial is too small. --- */
  var capW = gR*0.80;
  if(o.label){
    var ls = fitScale(o.label, capW, gR*0.19);
    if(PF.textW(o.label, ls, 1) <= capW)
      PF.textC(px, o.label, gcx, gcy - gR*0.21 - textH(ls)/2,
               o.labelCol || 'rgba(226,238,255,.82)', ls, 1);
  }
  if(o.sub && gR >= 24){
    var subW = capW*0.80;
    var ss = fitScale(o.sub, subW, gR*0.15);
    if(PF.textW(o.sub, ss, 1) <= subW)
      PF.textC(px, o.sub, gcx, gcy + (o.subAt == null ? 0.32 : o.subAt)*gR - textH(ss)/2,
               'rgba(190,208,232,.58)', ss, 1);
  }

  /* --- glass: a crescent of reflected sky across the top left --- */
  var gl = g.createLinearGradient(cx-R*0.8, cy-R*0.9, cx+R*0.35, cy+R*0.55);
  gl.addColorStop(0.00,'rgba(255,255,255,.18)');
  gl.addColorStop(0.45,'rgba(255,255,255,.05)');
  gl.addColorStop(1.00,'rgba(255,255,255,0)');
  g.beginPath(); g.arc(cx,cy,fr-R*0.13,Math.PI*0.90,Math.PI*1.80);
  g.lineWidth = R*0.28; g.strokeStyle = gl; g.stroke();
}

/* A thin instrument pointer: a blade tapering to a point just short of the
   tick ring, with a stubby counterweight behind the hub. */
function drawNeedle(g, cx, cy, R, ang, col){
  var w0 = Math.max(1.0, R*0.040), w1 = Math.max(0.5, R*0.010);
  g.save();
  g.translate(cx, cy); g.rotate(ang);
  g.beginPath();
  g.moveTo(-R*0.20, -w0*0.62); g.lineTo(-R*0.20, w0*0.62);
  g.lineTo(-R*0.03, w0*0.85);  g.lineTo(-R*0.03, -w0*0.85);
  g.closePath(); g.fillStyle = 'rgba(6,9,13,.75)'; g.fill();
  g.beginPath();
  g.moveTo(-R*0.05, w0); g.lineTo(R*0.90, w1); g.lineTo(R*0.93, 0);
  g.lineTo(R*0.90, -w1); g.lineTo(-R*0.05, -w0);
  g.closePath(); g.fillStyle = col; g.fill();
  g.beginPath();
  g.moveTo(-R*0.05, -w0); g.lineTo(R*0.90, -w1);
  g.lineTo(R*0.90, -w1*0.2); g.lineTo(-R*0.05, -w0*0.42);
  g.closePath(); g.fillStyle = 'rgba(255,255,255,.38)'; g.fill();
  g.restore();
  var hub = g.createLinearGradient(cx-R*0.11, cy-R*0.11, cx+R*0.11, cy+R*0.11);
  hub.addColorStop(0,'#939ea9'); hub.addColorStop(0.5,'#39424c'); hub.addColorStop(1,'#131920');
  g.beginPath(); g.arc(cx,cy,R*0.11,0,TAU); g.fillStyle = hub; g.fill();
  g.beginPath(); g.arc(cx,cy,R*0.042,0,TAU); g.fillStyle = col; g.fill();
}

/* =========================================================================
   TELL-TALE ICONS — small pixel glyphs for the status strip. Each draws
   into a box of its own and takes the ink colour, so the strip only has to
   decide what is lit.
   ========================================================================= */
/* Icons are authored on a 9x8 unit grid; the caller's painter supplies the
   scale, so nothing in here may reference it. */
function iconArrow(px, x, y, s, right, col){
  for(var c=0;c<4;c++)
    px(x + (right ? 8-c : c), y + 4 - c, 1, 1 + 2*c, col);
  px(x + (right ? 0 : 5), y + 3, 4, 3, col);
}
function iconLamp(px, x, y, s, col){                      /* headlight + beam */
  var i;
  for(i=0;i<5;i++) px(x, y+i, 1 + (i===0||i===4 ? 2 : 4), 1, col);
  px(x, y, 1, 5, col);
  for(i=0;i<3;i++) px(x + 6, y + i*2, 3, 1, col);
}
function iconBelt(px, x, y, s, col){                      /* seated figure */
  px(x+2, y, 2, 2, col);
  px(x+1, y+3, 4, 4, col);
  px(x+5, y+4, 1, 3, col);
  px(x, y+7, 6, 1, col);
  px(x+4, y+2, 1, 1, col);
}
function iconBrakeP(px, x, y, s, col){                    /* (P) in a ring */
  var w = 8, h = 8, i;
  for(i=1;i<w-1;i++){ px(x+i, y, 1, 1, col); px(x+i, y+h-1, 1, 1, col); }
  for(i=1;i<h-1;i++){ px(x, y+i, 1, 1, col); px(x+w-1, y+i, 1, 1, col); }
  px(x+3, y+2, 1, 4, col); px(x+3, y+2, 2, 1, col);
  px(x+5, y+2, 1, 2, col); px(x+3, y+4, 2, 1, col);
}
function iconTraction(px, x, y, s, col){                  /* car over squiggles */
  px(x+1, y+1, 6, 2, col); px(x+2, y, 4, 1, col);
  px(x, y+3, 8, 1, col);
  px(x+1, y+5, 2, 1, col); px(x+3, y+6, 2, 1, col); px(x+5, y+5, 2, 1, col);
}
function iconDiff(px, x, y, s, col){                      /* axle with a centre */
  px(x, y+3, 9, 1, col);
  px(x, y+2, 1, 3, col); px(x+8, y+2, 1, 3, col);
  px(x+3, y+1, 3, 5, col);
}

/* =========================================================================
   STATIC BASE — painted once per layout
   ========================================================================= */
function buildDashBase(L){
  var u = L.u, oy = L.over;
  var W = Math.round(L.GW*u), H = Math.round((DASH_GH + oy)*u);
  var c = document.createElement('canvas');
  c.width = W; c.height = H;
  var g = c.getContext('2d');
  g.imageSmoothingEnabled = false;
  var px = dashPainter(g, u, oy);
  var GW = L.GW, i, x;

  /* ---------------- the moulding itself ---------------- */
  /* a soft top rail so the dash reads as a shaped binnacle rather than a
     slab, then the carbon face, then the deep footwell shadow */
  px(0, 0, GW, DASH_GH, DC.shell);
  var band = [[0,'#39424d'],[1,'#252d37'],[2,'#1c232b'],[4,'#191d23'],
              [DASH_GH-10,'#141920'],[DASH_GH-5,'#0e1218'],[DASH_GH-2,'#080b0f']];
  for(i=0;i<band.length-1;i++) px(0, band[i][0], GW, band[i+1][0]-band[i][0], band[i][1]);
  px(0, band[band.length-1][0], GW, DASH_GH-band[band.length-1][0], band[band.length-1][1]);
  px(0, 0, GW, 1, '#6d7a89');                            /* chrome catch */
  px(0, 1, GW, 1, 'rgba(255,255,255,.10)');

  /* woven carbon: a coarse two-tone weave, cheap and only drawn once */
  for(var wy=4; wy<DASH_GH-3; wy+=4){
    for(var wx=0; wx<GW; wx+=4){
      var lit = (((wx>>2) + (wy>>2)) & 1) === 0;
      px(wx, wy, 2, 2, lit ? 'rgba(255,255,255,.030)' : 'rgba(0,0,0,.16)');
      px(wx+2, wy+2, 2, 2, lit ? 'rgba(255,255,255,.030)' : 'rgba(0,0,0,.16)');
    }
  }
  /* panel seams framing the instrument bay */
  px(L.leftEnd + 1, 2, 1, DASH_GH-4, DC.seam);
  px(L.leftEnd + 2, 2, 1, DASH_GH-4, 'rgba(255,255,255,.06)');
  px(L.rightStart - 2, 2, 1, DASH_GH-4, DC.seam);
  px(L.rightStart - 1, 2, 1, DASH_GH-4, 'rgba(255,255,255,.06)');
  for(i=0;i<4;i++){
    screw(px, L.x0 - 2, 4 + i*((L.UH-10)/3));
    screw(px, L.x1, 4 + i*((L.UH-10)/3));
  }
  /* demister vents filling the moulding either side of the instruments */
  for(x = L.leftEnd + 6; x < L.tachX - L.R - 6; x += 5){
    px(x, 6, 3, Math.max(4, L.UH*0.10), DC.vent);
    px(x, 6, 3, 1, 'rgba(255,255,255,.07)');
  }
  for(x = L.spdX + L.R + 8; x < L.rightStart - 8; x += 5){
    px(x, 6, 3, Math.max(4, L.UH*0.10), DC.vent);
    px(x, 6, 3, 1, 'rgba(255,255,255,.07)');
  }

  /* ---------------- gauges ---------------- */
  drawGauge(g, px, L, L.tachX, L.dialY, L.R, {
    min:0, max:TACH_MAX, major:1, minor:0.5, redFrom:TACH_RED,
    label:'RPM', sub:'x1000', num:'#dfe8ff',
    labelEvery: L.R >= 34 ? 1 : 2
  });
  var dialMax = dash.spdMax, step = speedStep();
  var majors = dialMax/step;
  drawGauge(g, px, L, L.spdX, L.dialY, L.R, {
    min:0, max:dialMax, major:step, minor:step/2,
    label: speedUnit(), num:'#f6f9ff',
    labelEvery: (majors > 6 || L.R < 34) ? 2 : 1
  });
  drawGauge(g, px, L, L.boost.cx, L.boost.cy, L.boost.r, {
    min:0, max:20, major:10, minor:5, redFrom:16,
    sub:'PSI', subAt:-0.32, num:'#f6f9ff', labelEvery:2
  });
  PF.textC(px, 'BOOST', L.boost.cx, L.boost.cy - L.boost.r - 9,
           DC.numDim, fitScale('BOOST', L.boost.r*2.4, 7), 1);

  /* ---------------- gear selector ---------------- */
  var G0 = L.gear;
  raised(px, G0.x, G0.y, G0.w, G0.h, '#12161c', DC.edge, DC.seam);
  sunken(px, G0.x+2, G0.y+9, G0.w-4, G0.h-11, '#05070a');
  PF.textC(px, 'GEAR', G0.x + G0.w/2, G0.y + 2, DC.numDim, fitScale('GEAR', G0.w-6, 7), 1);
  /* the gate the selector knob slides in */
  px(G0.x + G0.w - 6, G0.y + 11, 2, G0.h - 15, '#0a0e13');
  px(G0.x + G0.w - 6, G0.y + 11, 1, G0.h - 15, DC.seam);

  /* ---------------- shift block ---------------- */
  var S0 = L.shift;
  raised(px, S0.x, S0.y, S0.w, S0.h, '#12161c', DC.edge, DC.seam);
  PF.textC(px, 'SHIFT', S0.x + S0.w/2, S0.y + 2, DC.num, fitScale('SHIFT', S0.w-8, 8), 1);
  px(S0.x + 3, S0.y + 11, S0.w - 6, 1, DC.seam);
  sunken(px, L.revBar.x-1, L.revBar.y-1, L.revBar.w+2, L.revBar.h+2, '#05070a');
  sunken(px, L.readout.x, L.readout.y, L.readout.w, L.readout.h, '#04060a');

  /* ---------------- steering rockers ---------------- */
  drawRockerBase(px, L.steerL, false);
  drawRockerBase(px, L.steerR, true);
  sunken(px, L.tell.x, L.tell.y, L.tell.w, L.tell.h, '#05070a');

  /* ---------------- throttle / brake pads ---------------- */
  drawPadBase(px, L.gas,   'THROTTLE');
  drawPadBase(px, L.brake, 'BRAKE');

  /* ---------------- handbrake housing ---------------- */
  var HB = L.hbrake;
  raised(px, HB.x, HB.y, HB.w, HB.h, '#141920', DC.edge, DC.seam);
  sunken(px, HB.x+2, HB.y+2, HB.w-4, HB.h-11, '#070a0e');
  px(HB.x+3, HB.y + HB.h - 8, HB.w-6, 5, '#20272f');     /* console plinth */
  px(HB.x+3, HB.y + HB.h - 8, HB.w-6, 1, DC.steelLo);
  PF.textC(px, 'HANDBRAKE', HB.x + HB.w/2, HB.y + HB.h - 6, DC.numDim,
           fitScale('HANDBRAKE', HB.w-6, 5), 1);

  /* ---------------- traction / diff tiles ---------------- */
  var A = L.aux, th = (A.h - 3)/2;
  raised(px, A.x, A.y, A.w, th, '#12161c', DC.edge, DC.seam);
  raised(px, A.x, A.y + th + 3, A.w, th, '#12161c', DC.edge, DC.seam);
  PF.textC(px, 'TRACTION', A.x + A.w/2, A.y + 2, DC.numDim, fitScale('TRACTION', A.w-4, 6), 1);
  PF.textC(px, 'DIFF', A.x + A.w/2, A.y + th + 5, DC.numDim, fitScale('DIFF', A.w-4, 6), 1);

  /* ---------------- tell-tale strip ---------------- */
  var T = L.strip;
  raised(px, T.x, T.y, T.w, T.h, '#0f1319', DC.edgeLo, DC.seam);
  px(T.x+1, T.y+1, T.w-2, 1, 'rgba(255,255,255,.05)');

  return c;
}

/* the rocker housings and the pads share a moulding, so the whole dash is
   cast from one material */
function drawRockerBase(px, R0, right){
  raised(px, R0.x, R0.y, R0.w, R0.h, '#141920', DC.edge, DC.seam);
  sunken(px, R0.x+2, R0.y+2, R0.w-4, R0.h-4, '#080b10');
  screw(px, R0.x+1, R0.y+1); screw(px, R0.x+R0.w-3, R0.y+1);
  screw(px, R0.x+1, R0.y+R0.h-3); screw(px, R0.x+R0.w-3, R0.y+R0.h-3);
}
function drawPadBase(px, P, label){
  raised(px, P.x, P.y, P.w, P.h, '#141920', DC.edge, DC.seam);
  sunken(px, P.x+2, P.y+2, P.w-4, P.h-4, '#080b10');
  PF.textC(px, label, P.x + P.w/2, P.y + P.h - 8, DC.numDim, fitScale(label, P.w-4, 6), 1);
}

/* =========================================================================
   LIVE STATE
   ========================================================================= */
var dash = {
  cv:null, g:null, base:null, L:null, key:'', spdMax:160,
  nRpm:0, nSpd:0, nBoost:0, heat:0, wrap:null
};
/* animated 0..1 press values, one per control, plus the readouts that lag */
var ctl = {
  steerL:0, steerR:0, gas:0, brake:0, hbrake:0,
  padUp:0, padDn:0, shiftUp:0, shiftDn:0, flashGear:0
};

function ensureDash(){
  var el = dash.cv || document.getElementById('dash-cv');
  if(!el) return false;
  var key = Math.round(view.w)+'x'+Math.round(view.h)+'@'+view.dpr.toFixed(2)+
            '/'+dash.spdMax+'/'+save.settings.units;
  if(key !== dash.key || !dash.base){
    var L = dashLayout();
    dash.cv = el; dash.L = L;
    el.width = Math.round(L.GW*L.u);
    el.height = Math.round((DASH_GH + L.over)*L.u);
    /* the CSS box comes from the layout, not from the backing store, so the
       two are free to differ once the resolution cap bites */
    el.style.width = L.cssW + 'px';
    el.style.height = L.cssH + 'px';
    dash.g = el.getContext('2d');
    dash.g.imageSmoothingEnabled = false;
    dash.base = buildDashBase(L);
    dash.key = key;
    document.documentElement.style.setProperty('--dash-h', L.panelCss + 'px');
  }
  return true;
}

function drawDash(r){
  if(!ensureDash()) return;
  var L = dash.L, g = dash.g, u = L.u, oy = L.over;
  var px = dashPainter(g, u, oy);
  var X = function(v){ return v*u; }, Y = function(v){ return (v+oy)*u; };
  var i;

  g.clearRect(0, 0, dash.cv.width, dash.cv.height);
  g.drawImage(dash.base, 0, 0);

  var rpm = dash.nRpm, hot = rpm >= 0.985;
  var spd = dash.nSpd;
  var driving = !!r;
  var manual = save.settings.transmission === 'manual';

  /* ---------------- needles ---------------- */
  drawNeedle(g, X(L.tachX), Y(L.dialY), L.R*u,
             dialAngle(clamp(rpm*TACH_SCALE, 0, TACH_MAX), 0, TACH_MAX),
             hot ? DC.redHot : DC.needle);
  drawNeedle(g, X(L.spdX), Y(L.dialY), L.R*u,
             dialAngle(clamp(spd, 0, dash.spdMax), 0, dash.spdMax), DC.needle);
  drawNeedle(g, X(L.boost.cx), Y(L.boost.cy), L.boost.r*u,
             dialAngle(clamp(dash.nBoost*20, 0, 20), 0, 20), DC.needle);

  /* ---------------- gear selector ----------------
     A five-slot window on the gate, sliding to keep the engaged gear in the
     middle: reverse and neutral below first, then the six forward ratios. */
  var G0 = L.gear;
  var gates = ['P','R','N','1','2','3','4','5','6'];
  var cur = 2;
  if(driving){
    if(r.car.fwd < -2) cur = 1;
    else if(Math.abs(r.car.fwd) < 2 && r.state !== 'run') cur = 2;
    else cur = 2 + r.gear;
  }
  var slots = 5, first = clamp(cur - 2, 0, gates.length - slots);
  var gy = G0.y + 10, gh = (G0.h - 13)/slots;
  var gfs = fitScale('0', G0.w - 12, gh - 1);
  for(i=0;i<slots;i++){
    var idx = first + i, on = idx === cur;
    var ly = gy + i*gh;
    if(on) px(G0.x+3, ly, G0.w-9, gh-1, 'rgba(255,180,50,.14)');
    PF.textC(px, gates[idx], G0.x + (G0.w-6)/2, ly + gh/2 - 3.5*gfs,
             on ? (ctl.flashGear > 0 ? DC.green : DC.amber) : '#5d6772', gfs, 1);
    if(on){                                              /* the selector knob */
      px(G0.x + G0.w - 7, ly + gh/2 - 2, 4, 4, DC.steel);
      px(G0.x + G0.w - 7, ly + gh/2 - 2, 4, 1, DC.steelHi);
      px(G0.x + G0.w - 7, ly + gh/2 + 1, 4, 1, DC.seam);
    }
  }

  /* ---------------- shift block ---------------- */
  var S0 = L.shift;
  drawShiftTri(px, L.shiftDn, false, ctl.shiftDn > 0.1 || ctl.padDn > 0.1, manual);
  drawShiftTri(px, L.shiftUp, true,  ctl.shiftUp > 0.1 || ctl.padUp > 0.1, manual);
  /* rev lights: green, then amber, then the whole bar flashing red on the
     limiter — the cue to pull the paddle */
  var revN = 6, revLit = Math.round(clamp(rpm/1.06, 0, 1)*revN);
  var limiter = rpm >= 1.02 && (Math.floor(perfNow()/80) & 1);
  lampRow(px, L.revBar.x, L.revBar.y, L.revBar.w, L.revBar.h, revN,
          limiter ? revN : revLit,
          limiter ? DC.redHot : function(i,n){ return i < n-2 ? DC.green : (i < n-1 ? DC.amber : DC.red); },
          DC.offLo);
  /* digital speed, the big readout under the shift block */
  var RD = L.readout;
  var rfs = fitScale('000', RD.w - 6, RD.h - 9);
  PF.textC(px, String(Math.round(Math.max(0, spd))), RD.x + RD.w/2,
           RD.y + 3, hot ? DC.redHot : DC.white, rfs, 1);
  PF.textC(px, speedUnit(), RD.x + RD.w/2, RD.y + RD.h - 6,
           'rgba(190,208,232,.60)', 1, 1);

  /* ---------------- steering rockers ---------------- */
  drawRocker(px, L.steerL, false, ctl.steerL);
  drawRocker(px, L.steerR, true,  ctl.steerR);
  /* the little strip above them: four lamps that track what the car is
     actually doing — drive, slip, off-road, damage */
  var T0 = L.tell;
  var tl = [ driving && Math.abs(r.car.fwd) > 4,
             driving && r.slipNow > 0.32,
             driving && r.offtrack,
             driving && r.car.damage > 45 ];
  var tcol = [DC.green, DC.amber, DC.blue, DC.red];
  var tw = (T0.w - 6)/4;
  for(i=0;i<4;i++){
    px(T0.x + 3 + i*tw, T0.y + 3, tw - 2, T0.h - 6, tl[i] ? tcol[i] : DC.off);
    if(tl[i]) px(T0.x + 3 + i*tw, T0.y + 3, tw - 2, 1, DC.white);
  }

  /* ---------------- throttle / brake pads ---------------- */
  drawPad(px, L.gas,   ctl.gas,   DC.green, DC.greenLo);
  drawPad(px, L.brake, ctl.brake, DC.red,   '#4a1712');

  /* ---------------- handbrake ---------------- */
  drawLever(px, L.hbrake, ctl.hbrake);

  /* ---------------- traction / diff ---------------- */
  var A = L.aux, th = (A.h - 3)/2;
  var tracOn = driving && (r.car.wheelSpin > 0.28 || r.slipNow > 0.42);
  var diffOn = driving && Math.abs(r.car.steer) > 0.35;
  drawAuxTile(px, A.x, A.y, A.w, th, iconTraction, tracOn, DC.green, DC.amber);
  drawAuxTile(px, A.x, A.y + th + 3, A.w, th, iconDiff, diffOn, DC.green, DC.blue);

  /* ---------------- tell-tale strip ---------------- */
  drawStrip(px, L, r);

  /* ---------------- paddles ---------------- */
  drawPaddle(px, L.padDn, false, ctl.padDn, manual);
  drawPaddle(px, L.padUp, true,  ctl.padUp, manual);
}

function drawShiftTri(px, R0, up, lit, active){
  var col = !active ? '#39424e' : (lit ? '#dce9ff' : DC.blue);
  px(R0.x, R0.y, R0.w, R0.h, lit ? 'rgba(90,168,255,.22)' : '#070b11');
  px(R0.x, R0.y, R0.w, 1, lit ? DC.blue : '#1d2530');
  px(R0.x, R0.y+R0.h-1, R0.w, 1, DC.seam);
  var n = Math.max(3, Math.floor(Math.min(R0.w, R0.h)*0.34));
  var cx = R0.x + R0.w/2, cy = R0.y + R0.h/2;
  for(var i=0;i<n;i++){
    var w = 1 + 2*i;
    px(cx - w/2, up ? cy - n/2 + i : cy + n/2 - i - 1, w, 1, col);
  }
}

function drawRocker(px, R0, right, press){
  var down = press > 0.35;
  var d = down ? 1 : 0;
  var ix = R0.x + 4, iy = R0.y + 4 + d, iw = R0.w - 8, ih = R0.h - 9;
  px(ix-1, iy-1, iw+2, ih+2, '#04070b');
  px(ix, iy, iw, ih, down ? '#e0921a' : '#3d4753');
  px(ix, iy, iw, 1, down ? '#ffd487' : '#69747f');
  px(ix, iy, 1, ih, down ? '#ffc457' : '#5b6672');
  px(ix, iy+ih-1, iw, 1, down ? '#8a6416' : '#171d24');
  px(ix+iw-1, iy, 1, ih, '#131920');
  /* solid arrowhead, pointing outboard */
  var ink = down ? '#2a1c00' : '#e8eef6';
  var n = Math.max(4, Math.floor(ih*0.42));
  var acy = iy + ih/2, ax0 = ix + iw/2 + (right ? -n/2 : n/2);
  for(var i=0;i<n;i++){
    var hh = n - i;
    px(right ? ax0 + i : ax0 - i - 1, acy - hh/2, 1, hh, ink);
  }
}

function drawPad(px, P, v, col, lo){
  var down = v > 0.3;
  var ix = P.x + 3, iy = P.y + 3, iw = P.w - 6, ih = P.h - 13;
  px(ix, iy, iw, ih, down ? lo : '#0c1016');
  /* the bar graph the reference carries on its throttle panel, filling from
     the bottom with how much of the pedal is actually being asked for */
  var n = 5, bh = (ih - 2)/n, litN = Math.round(v*n);
  for(var i=0;i<n;i++){
    var on = i < litN;
    px(ix+2, iy + ih - 1 - (i+1)*bh, iw-4, bh-1, on ? col : DC.offLo);
    if(on) px(ix+2, iy + ih - 1 - (i+1)*bh, iw-4, 1, DC.white);
  }
  px(ix, iy, iw, 1, down ? col : '#242c36');
  px(ix, iy+ih-1, iw, 1, DC.seam);
}

/* the lever: a chrome arm on a pivot that swings up towards vertical, with a
   rubber gaiter at its foot and a release button in the grip */
function drawLever(px, HB, v){
  var on = v > 0.45;
  var pivotX = HB.x + HB.w*0.32, pivotY = HB.y + HB.h - 11;
  var len = Math.max(8, HB.h*0.66);
  var ang = (46 + v*40) * Math.PI/180;
  var dx = Math.cos(ang), dy = -Math.sin(ang);
  px(pivotX - 4, pivotY - 3, 8, 5, '#0a0e13');             /* gaiter */
  px(pivotX - 3, pivotY - 3, 6, 1, '#2f3841');
  var i;
  for(i=0;i<=len;i++){
    var lx = pivotX + dx*i, ly = pivotY + dy*i;
    px(lx - 1, ly - 1, 3, 3, DC.steel);
    px(lx - 1, ly - 1, 1, 1, DC.steelHi);
    px(lx + 1, ly + 1, 1, 1, DC.steelDk);
  }
  px(pivotX - 2, pivotY - 2, 4, 4, DC.steelLo);            /* pivot boss */
  px(pivotX - 1, pivotY - 1, 2, 2, '#05070a');
  var gx = pivotX + dx*len, gy = pivotY + dy*len;          /* grip */
  px(gx - 3, gy - 5, 7, 9, '#05070a');
  px(gx - 2, gy - 4, 5, 7, on ? '#8a5a12' : '#2b3138');
  px(gx - 2, gy - 4, 5, 1, on ? DC.amber : '#454e57');
  px(gx - 1, gy - 6, 3, 2, on ? DC.amber : '#5d6772');     /* release button */
  if(on) px(HB.x+3, HB.y+3, HB.w-6, 1, DC.amber);
}

/* label along the top of the tile, glyph centred in what is left */
function drawAuxTile(px, x, y, w, h, icon, on, colOn, colOff){
  var top = 9;                                     /* the static caption's row */
  var free = Math.max(6, h - top - 2);
  var s = Math.max(1, Math.floor(Math.min(free/8, (w-8)/9)));
  var ox = x + (w - 9*s)/2, oy2 = y + top + (free - 8*s)/2;
  if(on) px(x+2, y+top-1, w-4, h-top-1, 'rgba(79,228,99,.10)');
  icon(function(ix, iy, iw, ih, c){ px(ox + ix*s, oy2 + iy*s, iw*s, ih*s, c); },
       0, 0, s, on ? colOn : '#39434e');
  if(on) px(x+2, y+2, w-4, 1, colOff);
}

/* the row of lamps along the bottom: indicators, headlights, belt, parking
   brake. They follow the drive rather than being decoration. */
function drawStrip(px, L, r){
  var T = L.strip, driving = !!r;
  var s = Math.max(1, Math.floor((T.h - 4)/8));
  var slots = [
    { icon:function(p,x,y,ss,c){ iconArrow(p,x,y,ss,false,c); }, w:9,
      on: driving && r.car.steer < -0.25, col:DC.green },
    { icon:iconLamp,  w:10, on:true,                                col:DC.green },
    { icon:iconBelt,  w:7,  on: driving && Math.abs(r.car.fwd) < 6, col:DC.red },
    { icon:iconBrakeP,w:9,  on: driving && ctl.hbrake > 0.4,        col:DC.red },
    { icon:iconTraction,w:9,on: driving && r.slipNow > 0.42,        col:DC.amber },
    { icon:iconDiff,  w:10, on: driving && r.car.wheelSpin > 0.3,   col:DC.amber },
    { icon:function(p,x,y,ss,c){ iconArrow(p,x,y,ss,true,c); }, w:9,
      on: driving && r.car.steer > 0.25, col:DC.green }
  ];
  var total = 0, i;
  for(i=0;i<slots.length;i++) total += slots[i].w*s + 6;
  var x = T.x + (T.w - total)/2 + 3;
  var cy = T.y + (T.h - 8*s)/2;
  for(i=0;i<slots.length;i++){
    var sl = slots[i];
    if(sl.on) px(x - 2, T.y + 2, sl.w*s + 4, T.h - 4, 'rgba(255,255,255,.045)');
    sl.icon(function(ix, iy, iw, ih, c){ px(x + ix*s, cy + iy*s, iw*s, ih*s, c); },
            0, 0, s, sl.on ? sl.col : '#333d48');
    x += sl.w*s + 6;
  }
}

/* Cast alloy blades on the outer ends of the dash, standing above its top
   edge. The rake runs outward, so the pair frames the instrument bay. */
function drawPaddle(px, P, up, press, active){
  var down = press > 0.35, drop = down ? 1 : 0;
  var y, x, wide = Math.max(5, Math.round(P.w*0.72));
  /* mounting stalk and pivot, on the screen-inward side */
  var sx = up ? P.x + P.w - 3 : P.x;
  px(sx, P.y + P.h*0.40, 3, P.h*0.34, '#05070a');
  px(sx + (up ? 1 : 0), P.y + P.h*0.42, 2, P.h*0.30, '#333c46');
  px(sx - (up ? 1 : -2), P.y + P.h*0.46, 2, 3, '#8d97a2');
  for(y=1; y<P.h-1; y++){
    var t = y/(P.h-1);
    /* the blade bows away from the wheel and narrows towards its tip, the
       way a cast paddle actually does */
    var faceW = Math.max(4, Math.round(wide*(1 - t*0.30)));
    var lean = Math.round((t*t - 0.22) * P.w*0.42) * (up ? 1 : -1);
    var x0 = P.x + (P.w - faceW)/2 + lean;
    px(x0-1, P.y + y + drop, faceW+2, 1, '#04060a');
    for(x=0; x<faceW; x++){
      var col;
      /* dark anodised blade: a bright catch down the outer edge, the face
         falling away to near-black on the inboard side */
      if(down)                       col = ((x + y) & 2) ? '#ffcf74' : '#c98a22';
      else if(!active)               col = x === 0 ? '#4a525b' : (x >= faceW-2 ? '#14181d' : '#252b32');
      else if(x === 0)               col = '#d8e2ec';
      else if(x === 1)               col = '#8d97a2';
      else if(x >= faceW-2)          col = '#0f1317';
      else if(((x>>1) + (y>>1)) & 1) col = '#3b434c';
      else                           col = '#2d343b';
      px(x0+x, P.y + y + drop, 1, 1, col);
    }
    if(y > 3 && y < P.h-4 && ((y-4) % 5) === 0){          /* drilled grip holes */
      px(x0 + 1, P.y + y + drop, 2, 1, down ? '#8a6416' : '#3f4750');
      px(x0 + faceW - 3, P.y + y + drop, 2, 1, down ? '#8a6416' : '#3f4750');
    }
  }
  /* stamped + / − at the foot of the blade */
  var ink = down ? '#3a2a06' : '#e6edf5';
  var bw2 = Math.max(4, Math.round(faceW*0.55)), bt = Math.max(1, Math.round(P.h*0.045));
  var bx = P.x + P.w/2, by = P.y + P.h - 5 - bt + drop;
  px(bx - bw2/2, by, bw2, bt, ink);
  if(up) px(bx - bt/2, by - bw2/2 + bt/2, bt, bw2, ink);
}

/* =========================================================================
   HIT TESTING — one pointer map derived from the same layout the art uses
   ========================================================================= */
function dashHit(cssX, cssY){
  var L = dash.L;
  if(!L) return null;
  var rect = dash.cv.getBoundingClientRect();
  /* map through the CSS box, which is the thing the finger actually touched */
  var k = L.GW / Math.max(1, rect.width);
  var gx = (cssX - rect.left) * k;
  var gy = (cssY - rect.top)  * k - L.over;
  for(var i=0;i<L.regions.length;i++){
    var o = L.regions[i];
    if(gx >= o.hx && gx <= o.hx+o.hw && gy >= o.hy && gy <= o.hy+o.hh) return o.id;
  }
  return null;
}

/* =========================================================================
   PER-FRAME
   ========================================================================= */
var perfNow = (window.performance && performance.now)
  ? function(){ return performance.now(); } : function(){ return Date.now(); };

function updateHudControls(dt){
  var k = 1 - Math.pow(0.0004, dt);
  var press = function(cur, want){ return cur + ((want?1:0) - cur)*k; };
  ctl.steerL  = press(ctl.steerL,  input.left);
  ctl.steerR  = press(ctl.steerR,  input.right);
  ctl.gas     = press(ctl.gas,     save.settings.autoGas ? !input.brake : input.gas);
  ctl.brake   = press(ctl.brake,   input.brake);
  ctl.hbrake  = press(ctl.hbrake,  input.hbrake);
  ctl.padUp   = Math.max(0, ctl.padUp - dt*4.5);
  ctl.padDn   = Math.max(0, ctl.padDn - dt*4.5);
  ctl.shiftUp = Math.max(0, ctl.shiftUp - dt*4.5);
  ctl.shiftDn = Math.max(0, ctl.shiftDn - dt*4.5);
  ctl.flashGear = Math.max(0, ctl.flashGear - dt*2.5);

  /* the needles chase the live values with a short mechanical lag — quick
     enough to be accurate, damped enough not to twitch. Nothing here feeds
     back into the physics; it is all readout. */
  if(race){
    dash.nRpm   += (race.rpm - dash.nRpm) * clamp(dt*20, 0, 1);
    dash.nSpd   += (toSpeed(race.car.fwd) - dash.nSpd) * clamp(dt*13, 0, 1);
    dash.nBoost += (race.boost - dash.nBoost) * clamp(dt*9, 0, 1);
    var heating = race.rpm > 0.98 ? 1 : (race.rpm > 0.86 ? 0.35 : 0);
    dash.heat = clamp(dash.heat + (heating ? dt*0.30*heating : -dt*0.20), 0, 1);
  }
  drawDash(race);
}

/* force a full rebuild, e.g. when a race starts or the viewport changes */
function resetHudControls(){
  for(var k in ctl) ctl[k] = 0;
  dash.nRpm = dash.nSpd = dash.nBoost = dash.heat = 0;
  if(race) dash.spdMax = speedDialMax(race.stats.topSpeed * race.finalDrive);
  dash.key = '';
  drawDash(race);
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
      ctl.flashGear = 0.85;
    }
  }
  audioShift(up);
  haptic(12);
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
/* Reaching for a paddle IS the request for a manual gearbox, so rather than
   doing nothing in automatic it hands the box over and says so. The setting
   sticks, and Settings puts it back. */
function engageManual(){
  save.settings.transmission = 'manual';
  persist();
  bigMsg('MANUAL', 'msg', '#ffb432', 1.1);
  audioBeep(700, 0.09);
  haptic(20);
}
function shiftUp(){
  if(!race || race.state === 'done' || paused) return false;
  if(save.settings.transmission !== 'manual'){ engageManual(); return false; }
  return setGear(race, race.gear + 1, true);
}
function shiftDown(){
  if(!race || race.state === 'done' || paused) return false;
  if(save.settings.transmission !== 'manual'){ engageManual(); return false; }
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
      getCarSprite(save.current, cs.paint, cs.livery, 0, 1),
      getCarSprite(save.current, cs.paint, cs.livery, 1, 1),
      getCarSprite(save.current, cs.paint, cs.livery, 2, 1)
    ],
    gear:1, rpm:0, torque:1, shiftT:0, perfectT:0, perfectFlash:0,
    boost:0, turbo: turboSpec(stats, cs),
    spans: carSpans(save.current), finalDrive: gearingOf(save.current).final,
    t:0, state:'countdown', countdown:3.2, collisions:0, hardHits:0,
    noteIdx:0, note:null, noteTimer:0, msg:null,
    particles:[], skids:[], shake:0, camLean:0, slipNow:0,
    camX:n0.x, camY:n0.y, camA:n0.a, camZoom:1,
    surface: SURFACES[st.surface].name, offtrack:false, progress:0,
    splitIdx:0, best: save.stages[st.id].best,
    topSpeedSeen:0, driftTime:0, recoveries:0,
    finishTime:0
  };
  paused = false;
  releaseAllInput();
  showScreen(null);
  document.getElementById('dash-cv').classList.remove('hidden');
  resetHudControls();
  audioKick();
  bigMsg('3', 'count', '#ffffff', 1.0);
}

/* --------------------------------------------------------------- turbo
   An arcade turbo, so the boost gauge on the dash reads something real.
   Pressure builds while the throttle is open and the engine is on the cam,
   bleeds away off throttle, and dumps on an upshift. What it buys is a
   modest torque multiplier — enough to reward holding a gear and staying on
   the power, not enough to rewrite the car's stats. Cars with more turbo
   fitted spool faster and hold more. */
function turboSpec(S, cs){
  var lvl = cs && cs.up ? cs.up.turbo : 0;
  return { max: 0.55 + lvl*0.15, spool: 1.10 + lvl*0.30, bleed: 1.5, gain: 0.09 + lvl*0.035 };
}
function updateBoost(r, gas, dt){
  var T = r.turbo;
  /* exhaust energy: needs revs as well as throttle, which is why it lags
     out of a hairpin and is already there at the end of a straight */
  var drive = gas ? clamp((r.rpm - 0.30)/0.55, 0, 1) : 0;
  var want = T.max * drive;
  var k = want > r.boost ? T.spool : T.bleed;
  var was = r.boost;
  r.boost += (want - r.boost) * clamp(dt*k, 0, 1);
  if(r.shiftT > 0) r.boost *= Math.pow(0.35, dt);      /* dumped on a change */
  r.boost = clamp(r.boost, 0, 1);
  /* the chirp of the dump valve, on a real lift rather than a dip */
  if(was > 0.34 && !gas && !r.blewOff){ audioBlowoff(was); r.blewOff = true; }
  if(gas) r.blewOff = false;
  return 1 + r.boost*T.gain;
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
      if(after===2){ bigMsg('2','count','#ffffff',1.0); audioBeep(520,0.12); haptic(18); }
      else if(after===1){ bigMsg('1','count','#ffffff',1.0); audioBeep(520,0.12); haptic(18); }
      else if(after<=0){ bigMsg('GO!','count','#7ef08a',0.9); audioBeep(900,0.3); haptic(45); r.shake = Math.max(r.shake, 0.25); }
    }
    if(r.countdown<=0) r.state='run';
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
  } else {
    if(input.left) target -= 1;
    if(input.right) target += 1;
  }
  /* Steering builds a touch faster than it used to and centres quicker, so
     a tap of the rocker is a real correction rather than a suggestion — the
     single biggest thing that made the old buttons feel floaty. It still
     slows down with speed, further down, so it never becomes twitchy. */
  var rate = (Math.abs(target) > Math.abs(c.steer)) ? 6.4 : 9.5;
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

  /* Brake and handbrake are now separate controls. The brake is the one you
     use into every corner — strong, stable, and it does not upset the car.
     The handbrake is the rally tool: it locks the rears, so it scrubs speed
     AND lets the tail come round, and it reverses once you are stopped. */
  var brakeOn = driving && input.brake;
  var gas = driving && (save.settings.autoGas ? !(input.brake || input.hbrake) : input.gas) && !brakeOn;
  var hb = driving && input.hbrake;

  updateGearbox(r, Math.abs(c.fwd), topSpeed, dt);
  var boostMul = updateBoost(r, gas && !hb && !brakeOn, dt);

  if(gas && !hb){
    /* the power curve runs out above the rated top speed, so rolling
       resistance settles the car right around its quoted figure */
    /* top gear redlines at finalDrive x the car's rated speed, so taller
       gearing raises the ceiling and shorter gearing lowers it */
    var head = 1 - c.fwd/(topSpeed*r.finalDrive*1.35);
    if(head < 0) head = 0;
    c.fwd += accel * head * dt * (offtrack ? 0.70 : 1) * r.torque * boostMul;
    c.wheelSpin = clamp(c.wheelSpin + (1.2 - grip)*dt*2.2, 0, 1);
  } else {
    c.wheelSpin *= Math.pow(0.05, dt);
  }
  if(brakeOn){
    /* braking force follows the surface, so ice takes a lot longer to pull
       up on than tarmac does */
    var bf = 340 * clamp(0.45 + 0.55*grip, 0.4, 1.25);
    if(c.fwd > 0) c.fwd = Math.max(0, c.fwd - bf*dt);
    else if(c.fwd > -80) c.fwd -= 90*dt;               /* reverse out of trouble */
  }
  if(hb){
    if(c.fwd > 0) c.fwd = Math.max(0, c.fwd - 300*dt);
    else if(driving && c.fwd > -70) c.fwd -= 70*dt;
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
  r.slipNow = slip;
  spawnEffects(r, dt, slip, surf, offtrack);
  if(driving){
    if(spd > r.topSpeedSeen) r.topSpeedSeen = spd;
    if(slip > 0.45 && spd > 60) r.driftTime += dt;
  }

  /* ---- pacenotes ---- */
  while(r.noteIdx < r.track.notes.length && q.d >= r.track.notes[r.noteIdx].d){
    showNote(r.track.notes[r.noteIdx]);
    r.noteIdx++;
  }
  if(r.noteTimer > 0) r.noteTimer -= dt;
  if(r.msg) { r.msg.t -= dt; if(r.msg.t <= 0) r.msg = null; }

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
  /* weight transfer: the frame settles back under power and pitches forward
     under braking. Only a few pixels, but it is what sells acceleration */
  var wantLean = (gas ? 4 : 0) - (brakeOn ? 6 : 0) - (hb ? 3 : 0);
  r.camLean = lerp(r.camLean, wantLean*clamp(spd/120,0,1), 1-Math.pow(0.02,dt));
  /* a shiver through the cockpit as the car slides on the loose */
  if(slip > 0.5 && spd > 90) r.shake = Math.max(r.shake, (slip-0.5)*0.22);

  /* ---- audio ---- */
  audioEngine(r.rpm, gas?1:0.25, Math.max(slip, brakeOn||hb ? 0.45 : 0)*(spd>25?1:0),
              driving || r.state==='countdown', r.boost);

  /* ---- finish ---- */
  if(driving && q.d >= r.track.len - 24){
    r.state = 'done'; r.finishTime = r.t;
    bigMsg('FINISH', 'msg', '#ffb432', 1.6);
    haptic(60);
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
  r.boost = 0;
  bigMsg('RECOVERED', 'msg', '#ffb432', 1.2);
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
          r.boost = 0;                                /* off the throttle, off boost */
          audioThud(clamp(impact/240,0,1));
          haptic(Math.round(clamp(impact/240,0,1)*45) + 12);
          spawnImpact(r, (c.x+p.x)/2, (c.y+p.y)/2, clamp(impact/200,0,1),
                      SURFACES[r.track.stage.surface]);
          p.hit = 0.7;
        }
      }
    }
  }
}

/* -------------------------------------------------------------- effects
   Everything the car throws up. All of it is pixel-scale — square puffs and
   chips, no soft gradients — so it sits in the same grid as the scenery
   instead of looking like a particle system bolted onto a pixel-art game.

   The budget comes from the quality tier: LOW thins the emission rate as
   well as capping the pool, so a tired phone spends its frame on the road
   rather than on dust.                                                    */
function spawnEffects(r, dt, slip, surf, offtrack){
  var c = r.car, spd = Math.abs(c.fwd);
  var gfx = GFX();
  var cap = gfx.parts;
  var dirX = Math.sin(c.a), dirY = -Math.cos(c.a);
  var rgtX = Math.cos(c.a), rgtY = Math.sin(c.a);
  var braking = ctl.brake > 0.3 || ctl.hbrake > 0.4;
  var hard = slip > 0.24 || offtrack || (braking && spd > 60);

  r.dustAcc = (r.dustAcc||0) + dt;
  /* A rally car on gravel is never clean: it trails dust simply from moving,
     not only when it is sliding. The old rate only really opened up under
     slip, which is why a fast straight looked sterile. */
  var rate = (hard ? 0.016 : 0.042) * (gfx.parts >= 300 ? 0.8 : gfx.parts >= 150 ? 1 : 1.9);
  if(spd > 12 && r.dustAcc > rate && r.particles.length < cap){
    r.dustAcc = 0;
    var back = -30, side = 15;
    var heft = 0.5 + clamp(spd/220, 0, 1)*0.9;
    for(var sg=-1;sg<=1;sg+=2){
      var px = c.x + dirX*back + rgtX*side*sg;
      var py = c.y + dirY*back + rgtY*side*sg;
      r.particles.push({
        x:px, y:py,
        vx:-dirX*spd*0.16 + (Math.random()-0.5)*45,
        vy:-dirY*spd*0.16 + (Math.random()-0.5)*45,
        life:0.62+Math.random()*0.45, max:1.07,
        size:(6+Math.random()*9+slip*9)*heft, col:surf.dust, kind:'dust'
      });
      /* stones kicked out of the surface when the tyres are really working */
      if(hard && spd > 70 && Math.random() < 0.55 && r.particles.length < cap){
        r.particles.push({
          x:px, y:py,
          vx:-dirX*spd*0.55 + (Math.random()-0.5)*180 - rgtX*70*sg,
          vy:-dirY*spd*0.55 + (Math.random()-0.5)*180 - rgtY*70*sg,
          life:0.34+Math.random()*0.2, max:0.54,
          size:2+Math.random()*2, col: surf.grit || surf.edge, kind:'debris'
        });
      }
    }
    /* one more puff off the tail, which is what turns two ribbons of dust
       into a plume closing up behind the car */
    if(r.particles.length < cap){
      r.particles.push({
        x:c.x + dirX*(back-8), y:c.y + dirY*(back-8),
        vx:-dirX*spd*0.10 + (Math.random()-0.5)*30,
        vy:-dirY*spd*0.10 + (Math.random()-0.5)*30,
        life:0.75+Math.random()*0.5, max:1.25,
        size:(9+Math.random()*11+slip*12)*heft, col:surf.dust, kind:'dust'
      });
    }
    /* tyre marks: dark on a hard surface, a lighter scar on the loose */
    if(slip > 0.28 && !offtrack && r.skids.length < gfx.skids){
      var al = Math.min(0.55, slip*0.55);
      var col = surf.mark || 'rgba(24,20,16,.34)';
      for(var m=-1;m<=1;m+=2){
        r.skids.push({ x:c.x - dirX*28 + rgtX*15*m, y:c.y - dirY*28 + rgtY*15*m,
                       a:c.a, al:al, col:col });
      }
      if(r.skids.length > gfx.skids) r.skids.splice(0, Math.round(gfx.skids*0.25));
    }
  }

  /* engine smoke once the car is genuinely battered */
  if(c.damage > 48 && r.particles.length < cap){
    r.smokeAcc = (r.smokeAcc||0) + dt;
    if(r.smokeAcc > (c.damage>78 ? 0.05 : 0.11)){
      r.smokeAcc = 0;
      r.particles.push({
        x:c.x + dirX*24, y:c.y + dirY*24,
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
    if(p.kind==='smoke') p.size += dt*13;
    else if(p.kind==='dust') p.size += dt*6;
  }
}

/* a burst of surface and bodywork on a hit */
function spawnImpact(r, x, y, power, surf){
  var n = Math.round(clamp(power, 0.2, 1) * (GFX().parts >= 150 ? 14 : 7));
  for(var k=0;k<n;k++){
    r.particles.push({
      x:x, y:y,
      vx:(Math.random()-0.5)*260, vy:(Math.random()-0.5)*260,
      life:0.45+Math.random()*0.25, max:0.7,
      size:2+Math.random()*4,
      col: k%3 ? (surf && surf.grit ? surf.grit : '#d8c79a') : '#ffd9a0',
      kind:'debris'
    });
  }
}

/* =========================================================================
   RENDER

   Two passes with very different jobs.

   1. THE STAGE goes into the low-resolution world buffer: ground, road,
      tyre marks, particles, scenery, headlights, the car. Everything here
      is deliberately coarse — it is what gives the game its pixel grid —
      and it is blitted up to the screen with nearest-neighbour filtering.

   2. THE READOUTS are drawn straight onto the screen canvas afterwards at
      full device resolution: stage panel, timer, minimap, pacenotes,
      countdown. Nothing the player has to read is ever resampled, which is
      the rule the whole presentation is built around — the world may be
      chunky and motion-blurred, the instruments never are.
   ========================================================================= */

function renderRace(){
  var r = race, c = r.car;
  var W = view.w, H = view.h;
  var theme = r.track.theme, off = r.track.off;
  var w = ensureWorld(), g = w.g;
  var gfx = GFX();

  g.setTransform(1,0,0,1,0,0);
  g.imageSmoothingEnabled = false;
  g.fillStyle = off.color;
  g.fillRect(0,0,w.w,w.h);

  /* Framing. The camera aims at a point ahead of the car, so the car is
     drawn that far down the screen and rides lower the faster you go. Left
     unchecked it disappears behind the dash, so the focal point lifts only
     as far as it takes to keep the car above the panel — at low speed the
     framing is untouched. */
  var playH = H - dashBandH();
  var scaleCss = (playH*0.36/CAR_WORLD_LEN)/r.camZoom;
  var scale = scaleCss/w.scale;                 /* buffer px per world unit */
  var focal = playH*0.62;
  var dxc = c.x - r.camX, dyc = c.y - r.camY;
  var carDrop = (dyc*Math.cos(r.camA) - dxc*Math.sin(r.camA)) * scaleCss;
  var deck = H - dashBandH() - CAR_WORLD_LEN*scaleCss*0.62;
  if(focal + carDrop > deck) focal = clamp(deck - carDrop, playH*0.30, playH*0.68);

  var shakeX = 0, shakeY = 0;
  if(r.shake>0){
    shakeX = (Math.random()-0.5)*r.shake*18;
    shakeY = (Math.random()-0.5)*r.shake*18;
  }
  /* a little weight transfer: the camera leans back under power and dips
     under braking, which is most of what makes acceleration feel physical */
  var lean = r.camLean || 0;

  g.save();
  g.translate((W/2 + shakeX)/w.scale, (focal + shakeY + lean)/w.scale);
  g.scale(scale, scale);
  g.rotate(-r.camA);
  g.translate(-r.camX, -r.camY);

  var viewR = Math.sqrt(w.w*w.w + w.h*w.h)/2/scale + 90;

  /* Culling box, in camera space rather than as a radius.

     A radius around the camera is the diagonal of the view, and the view is
     wide and shallow — the dash eats the bottom of it — so a radius selects
     roughly twice the objects that can actually be seen. These are the real
     screen edges expressed in world units, which is four multiplies per
     object and halves the number of trees the renderer touches. */
  var ca = Math.cos(r.camA), sa = Math.sin(r.camA), m = 70;
  var ox = (W/2 + shakeX)/w.scale, oy2 = (focal + shakeY + lean)/w.scale;
  var cull = {
    ca:ca, sa:sa, cx:r.camX, cy:r.camY,
    x0:(-m - ox)/scale, x1:(w.w + m - ox)/scale,
    y0:(-m - oy2)/scale, y1:(w.h + m - oy2)/scale
  };

  drawGroundDetail(g, r, viewR, theme, gfx);
  drawRoad(g, r, viewR);
  drawSkids(g, r, cull);
  drawParticles(g, r, false);
  if(gfx.lights) drawHeadlights(g, r, gfx);
  drawProps(g, r, viewR, theme, gfx, scale, cull);
  drawCar(g, r, scale);
  drawParticles(g, r, true);

  g.restore();

  /* speed streaks: a few short strokes rushing past the edges of the
     frame. Subtle, cheap, and confined to the world buffer so the dash and
     the HUD stay perfectly sharp. */
  drawRush(g, r, w);

  /* ---- blit, then the crisp layer ---- */
  ctx.imageSmoothingEnabled = false;
  ctx.drawImage(w.cv, 0, 0, w.w, w.h, 0, 0, W, H);

  drawHudTop(ctx, r);
  drawMinimap(ctx, r);
  drawPacenote(ctx, r);
  drawBigMsg(ctx, r, focal, carDrop);
}

/* --------------------------------------------------------------- ground */
function drawGroundDetail(g, r, viewR, theme, gfx){
  var cell = 70;
  var x0 = Math.floor((r.camX-viewR)/cell), x1 = Math.ceil((r.camX+viewR)/cell);
  var y0 = Math.floor((r.camY-viewR)/cell), y1 = Math.ceil((r.camY+viewR)/cell);
  if((x1-x0)*(y1-y0) > 1600) return;
  var palettes = {
    forest:  ['#2e4a1f','#3a5726','#294218','#43632c'],
    mountain:['#454540','#4e4e47','#3c3c37','#565650'],
    snowpass:['#eef5fb','#e0eaf4','#f8fcff','#d3e0ec']
  };
  var pal = palettes[theme] || palettes.forest;
  var thin = gfx.detail;
  for(var gx=x0;gx<=x1;gx++){
    for(var gy=y0;gy<=y1;gy++){
      var n = rnd2(gx,gy,7);
      if(n > thin) continue;
      var px = gx*cell + rnd2(gx,gy,11)*cell;
      var py = gy*cell + rnd2(gx,gy,13)*cell;
      var s = 12 + rnd2(gx,gy,17)*30;
      g.fillStyle = pal[Math.floor(rnd2(gx,gy,23)*4)%4];
      g.fillRect(px, py, s, s*0.72);
      /* a lit top edge turns a flat patch into a clump with a bit of height */
      g.fillStyle = pal[3];
      g.fillRect(px, py, s, s*0.18);
      /* a second, smaller clump off the same cell doubles the density for
         one extra fill — cheap texture rather than twice the loop */
      var s2 = 7 + rnd2(gx,gy,29)*13;
      g.fillStyle = pal[Math.floor(rnd2(gx,gy,31)*4)%4];
      g.fillRect(px + cell*0.45, py + cell*0.38, s2, s2*0.72);
    }
  }
}

/* ----------------------------------------------------------------- road */
function drawRoad(g, r, viewR){
  var nodes = r.track.nodes;
  var lo = Math.max(0, r.car.node - 60);
  var hi = Math.min(nodes.length-1, r.car.node + Math.ceil(viewR/NODE_STEP) + 24);

  var i = lo;
  while(i < hi){
    var surfId = nodes[i].s;
    var j = i;
    while(j < hi && nodes[j+1] && nodes[j+1].s === surfId) j++;
    var end = Math.min(hi, j+1);
    var S = SURFACES[surfId];
    var k, m;

    /* the verge: a band of scuffed ground either side, so the road sits in
       the landscape instead of being pasted onto it */
    g.beginPath();
    for(k=i;k<=end;k++){
      var vn = nodes[k], vx = Math.cos(vn.a), vy = Math.sin(vn.a);
      var e = vn.hw + 9;
      if(k===i) g.moveTo(vn.x - vx*e, vn.y - vy*e); else g.lineTo(vn.x - vx*e, vn.y - vy*e);
    }
    for(m=end;m>=i;m--){
      var vn2 = nodes[m], vx2 = Math.cos(vn2.a), vy2 = Math.sin(vn2.a);
      var e2 = vn2.hw + 9;
      g.lineTo(vn2.x + vx2*e2, vn2.y + vy2*e2);
    }
    g.closePath();
    g.fillStyle = S.verge || S.edge;
    g.fill();

    /* the trees throw a band of shade across the outside of the verge,
       which is what gives a forest stage its corridor */
    g.save();
    g.globalAlpha = 0.32;
    g.fillStyle = '#000000';
    g.beginPath();
    for(k=i;k<=end;k++){
      var sn = nodes[k], sx3 = Math.cos(sn.a), sy3 = Math.sin(sn.a);
      var o1 = sn.hw + 9, o2 = sn.hw + 26;
      if(k===i) g.moveTo(sn.x - sx3*o1, sn.y - sy3*o1); else g.lineTo(sn.x - sx3*o1, sn.y - sy3*o1);
      if(k===end){
        for(m=end;m>=i;m--){
          var sn2 = nodes[m], sx4 = Math.cos(sn2.a), sy4 = Math.sin(sn2.a);
          var o3 = sn2.hw + 26;
          g.lineTo(sn2.x - sx4*o3, sn2.y - sy4*o3);
        }
      }
    }
    g.closePath(); g.fill();
    g.beginPath();
    for(k=i;k<=end;k++){
      var tn = nodes[k], tx3 = Math.cos(tn.a), ty3 = Math.sin(tn.a);
      var p1 = tn.hw + 9;
      if(k===i) g.moveTo(tn.x + tx3*p1, tn.y + ty3*p1); else g.lineTo(tn.x + tx3*p1, tn.y + ty3*p1);
      if(k===end){
        for(m=end;m>=i;m--){
          var tn2 = nodes[m], tx4 = Math.cos(tn2.a), ty4 = Math.sin(tn2.a);
          g.lineTo(tn2.x + tx4*(tn2.hw + 26), tn2.y + ty4*(tn2.hw + 26));
        }
      }
    }
    g.closePath(); g.fill();
    g.restore();

    /* the road surface */
    g.beginPath();
    for(k=i;k<=end;k++){
      var nd = nodes[k], nx = Math.cos(nd.a), ny = Math.sin(nd.a);
      var x = nd.x - nx*nd.hw, y = nd.y - ny*nd.hw;
      if(k===i) g.moveTo(x,y); else g.lineTo(x,y);
    }
    for(m=end;m>=i;m--){
      var nd2 = nodes[m], nx2 = Math.cos(nd2.a), ny2 = Math.sin(nd2.a);
      g.lineTo(nd2.x + nx2*nd2.hw, nd2.y + ny2*nd2.hw);
    }
    g.closePath();
    g.fillStyle = S.color;
    g.fill();

    /* the two wheel tracks worn down the middle of the stage, lighter and
       smoother than the loose stuff either side of them */
    g.fillStyle = S.color2;
    for(var t=i;t<end;t+=1){
      var n3 = nodes[t];
      var ax = Math.cos(n3.a), ay = Math.sin(n3.a);
      for(var s2=-1;s2<=1;s2+=2){
        var lat = s2*n3.hw*0.42;
        g.fillRect(n3.x + ax*lat - 5, n3.y + ay*lat - 5, 11, 11);
      }
    }
    /* Loose surface. Three passes rather than one: dark pits, mid stones and
       the odd bright chipping, all keyed off the node index so the pattern is
       identical every run and never crawls under the camera. */
    for(var t2=i;t2<end;t2+=2){
      var n4 = nodes[t2];
      var bx = Math.cos(n4.a), by = Math.sin(n4.a);
      for(var q=0;q<5;q++){
        var l2 = (rnd2(t2,q,3)*2-1)*n4.hw*0.96;
        var pick = rnd2(t2,q,9);
        var sz = 2 + rnd2(t2,q,5)*6;
        if(pick < 0.30){ g.fillStyle = S.verge; sz *= 0.8; }        /* pit */
        else if(pick < 0.80) g.fillStyle = S.color2;                /* stone */
        else { g.fillStyle = S.grit || S.edge; sz *= 0.6; }         /* chipping */
        g.fillRect(n4.x + bx*l2, n4.y + by*l2, sz, sz);
      }
    }
    /* the edges, which is what you aim at when you are going well */
    g.lineWidth = 4; g.strokeStyle = S.edge;
    g.beginPath();
    for(var e3=i;e3<=end;e3++){
      var n5 = nodes[e3], cx2 = Math.cos(n5.a), cy2 = Math.sin(n5.a);
      var ex = n5.x - cx2*n5.hw, ey = n5.y - cy2*n5.hw;
      if(e3===i) g.moveTo(ex,ey); else g.lineTo(ex,ey);
    }
    g.stroke();
    g.beginPath();
    for(var e4=i;e4<=end;e4++){
      var n6 = nodes[e4], dx2 = Math.cos(n6.a), dy2 = Math.sin(n6.a);
      var fx = n6.x + dx2*n6.hw, fy = n6.y + dy2*n6.hw;
      if(e4===i) g.moveTo(fx,fy); else g.lineTo(fx,fy);
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
  var n = 10, w = nd.hw*2/n, depth = 18;
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

/* is this world point inside the visible rectangle? */
function inView(c, x, y, pad){
  var dx = x - c.cx, dy = y - c.cy;
  var rx = dx*c.ca + dy*c.sa;
  if(rx < c.x0 - pad || rx > c.x1 + pad) return false;
  var ry = dy*c.ca - dx*c.sa;
  return ry >= c.y0 - pad && ry <= c.y1 + pad;
}

/* ------------------------------------------------------------ tyre marks */
function drawSkids(g, r, cull){
  for(var i=0;i<r.skids.length;i++){
    var s = r.skids[i];
    if(!inView(cull, s.x, s.y, 12)) continue;
    g.save(); g.translate(s.x,s.y); g.rotate(s.a);
    g.globalAlpha = s.al;
    g.fillStyle = s.col || 'rgba(24,20,16,.34)';
    g.fillRect(-4, -6, 8, 12);
    g.restore();
  }
  g.globalAlpha = 1;
}

/* ------------------------------------------------------------- particles */
function drawParticles(g, r, above){
  for(var i=0;i<r.particles.length;i++){
    var p = r.particles[i];
    var hi = (p.kind==='smoke' || p.kind==='debris');
    if(hi !== above) continue;
    var a = p.life/p.max;
    g.globalAlpha = clamp(a*(p.kind==='smoke'?0.55:0.78),0,1);
    g.fillStyle = p.col;
    var s = p.size;
    g.fillRect(p.x-s/2, p.y-s/2, s, s);
  }
  g.globalAlpha = 1;
}

/* ------------------------------------------------------------- headlights
   Two wedges and a warm pool on the ground ahead of the car, drawn in
   additive mode so they lift the gravel rather than paint over it. The pool
   alone is enough on MEDIUM; HIGH adds the cones. */
function drawHeadlights(g, r, gfx){
  var c = r.car;
  var dirX = Math.sin(c.a), dirY = -Math.cos(c.a);
  var rgtX = Math.cos(c.a), rgtY = Math.sin(c.a);
  var nx = c.x + dirX*40, ny = c.y + dirY*40;
  var reach = 150 + Math.min(120, Math.abs(c.fwd)*0.45);

  g.save();
  g.globalCompositeOperation = 'lighter';

  if(gfx.lights >= 2){
    g.globalAlpha = 0.26;
    for(var s=-1;s<=1;s+=2){
      var ox = nx + rgtX*13*s, oy = ny + rgtY*13*s;
      var tipX = nx + dirX*reach, tipY = ny + dirY*reach;
      var spread = reach*0.34;
      g.beginPath();
      g.moveTo(ox, oy);
      g.lineTo(tipX + rgtX*(spread + 10*s), tipY + rgtY*(spread + 10*s));
      g.lineTo(tipX - rgtX*(spread - 10*s), tipY - rgtY*(spread - 10*s));
      g.closePath();
      var lg = g.createLinearGradient(ox, oy, tipX, tipY);
      lg.addColorStop(0,'rgba(255,236,178,.55)');
      lg.addColorStop(0.5,'rgba(210,180,110,.16)');
      lg.addColorStop(1,'rgba(120,100,60,0)');
      g.fillStyle = lg;
      g.fill();
    }
  }

  /* the hot pool right in front of the bumper */
  g.globalAlpha = 0.72;
  var px2 = nx + dirX*46, py2 = ny + dirY*46;
  var pool = g.createRadialGradient(px2, py2, 4, px2, py2, 72);
  pool.addColorStop(0,'rgba(255,240,196,.42)');
  pool.addColorStop(0.45,'rgba(220,188,120,.17)');
  pool.addColorStop(1,'rgba(120,100,60,0)');
  g.fillStyle = pool;
  g.fillRect(px2-76, py2-76, 152, 152);

  /* A wide, soft warm bloom sitting on the car itself. The reference has a
     distinct halo of lit dust around the car rather than a clean cut-out on
     dark gravel, and it is most of what makes the lighting read. */
  if(gfx.glow){
    g.globalAlpha = 0.55;
    var br = 130 + Math.min(70, Math.abs(c.fwd)*0.28);
    var bloom = g.createRadialGradient(c.x, c.y, br*0.10, c.x, c.y, br);
    bloom.addColorStop(0,'rgba(255,232,176,.20)');
    bloom.addColorStop(0.40,'rgba(214,180,116,.09)');
    bloom.addColorStop(1,'rgba(90,74,44,0)');
    g.fillStyle = bloom;
    g.fillRect(c.x-br, c.y-br, br*2, br*2);
  }
  g.restore();
  g.globalAlpha = 1;
}

/* ---------------------------------------------------------------- props */
function drawProps(g, r, viewR, theme, gfx, scale, cull){
  var byNode = r.track.byNode;
  var lo = Math.max(0, r.car.node - 45);
  var hi = Math.min(byNode.length-1, r.car.node + Math.min(gfx.drawAhead, Math.ceil(viewR/NODE_STEP)) + 20);
  for(var i=lo;i<=hi;i++){
    var arr = byNode[i]; if(!arr) continue;
    for(var j=0;j<arr.length;j++){
      var p = arr[j];
      if(!inView(cull, p.x, p.y, (p.vis || p.size)*0.6)) continue;
      /* how many buffer pixels this prop will actually occupy. Below a few,
         the five-ring canopy is five fills that land on the same two pixels,
         so it collapses to a flat stamp and nobody can tell. */
      drawProp(g, p, theme, (p.vis || p.size)*scale);
    }
  }
}

/* ------------------------------------------------------------------ car */
function drawCar(g, r, scale){
  var c = r.car;
  var tier = c.damage>72 ? 2 : (c.damage>34 ? 1 : 0);
  var sp = r.sprites[tier];
  /* the car occupies a fixed footprint in world units, so changing the
     sprite grid stays purely visual and never alters how big it drives */
  var wh = CAR_WORLD_LEN, ww = wh * sp.pw / sp.ph;
  var braking = ctl.brake > 0.25 || ctl.hbrake > 0.4;
  g.save();
  g.translate(c.x, c.y);
  g.rotate(c.a);
  /* the shadow is the car's own silhouette, offset down and right to match
     the light, and pixellated exactly like everything else */
  g.drawImage(sp.shadow, -ww/2 + ww*0.06, -wh/2 + wh*0.05, ww, wh);
  g.drawImage(sp.canvas, -ww/2, -wh/2, ww, wh);
  if(braking && sp.lamps){
    var ux = ww/sp.pw, uy = wh/sp.ph;
    g.fillStyle = '#ff5a44';
    for(var i=0;i<sp.lamps.brake.length;i++){
      var l = sp.lamps.brake[i];
      g.fillRect(-ww/2 + l[0]*ux, -wh/2 + l[1]*uy, ux, uy*2);
    }
  }
  g.restore();
}

/* ---------------------------------------------------------------- rush */
function drawRush(g, r, w){
  var frac = clamp(Math.abs(r.car.fwd)/Math.max(1, r.stats.topSpeed), 0, 1);
  if(frac < 0.52) return;
  var a = (frac-0.52)/0.48;
  g.setTransform(1,0,0,1,0,0);
  g.globalAlpha = a*0.16;
  g.fillStyle = '#ffffff';
  var n = 7, t = perfNow()*0.02;
  for(var i=0;i<n;i++){
    var side = i & 1 ? 1 : 0;
    var band = (i/n);
    var y = ((t*(1.4 + band) + band*w.h) % (w.h + 40)) - 20;
    var len = w.h*0.10 + band*w.h*0.06;
    var x = side ? w.w - 2 - Math.floor(band*w.w*0.10)
                 : 1 + Math.floor(band*w.w*0.10);
    g.fillRect(x, y, 1, len);
  }
  g.globalAlpha = 1;
}

/* =========================================================================
   CRISP LAYER — the HUD, at full device resolution.

   Painted with the bitmap font through a painter that snaps to whole device
   pixels, so it is genuine pixel art rather than a scaled-down web overlay.
   ========================================================================= */

var HUD = { pause:null };

/* css pixels per HUD art pixel */
function hudUnit(){ return clamp(view.h/340, 0.8, 2.4); }

function hudPainter(g, u){
  var d = view.dpr;
  return function(x,y,w,h,col){
    var x0 = Math.round(x*u*d)/d, x1 = Math.round((x+w)*u*d)/d;
    var y0 = Math.round(y*u*d)/d, y1 = Math.round((y+h)*u*d)/d;
    g.fillStyle = col;
    g.fillRect(x0, y0, Math.max(1/d, x1-x0), Math.max(1/d, y1-y0));
  };
}
/* the HUD's house panel: near-black glass with a thin lit rim */
function hudPanel(px, x, y, w, h){
  px(x, y, w, h, 'rgba(6,10,14,.72)');
  px(x, y, w, 1, 'rgba(150,172,198,.55)');
  px(x, y+h-1, w, 1, 'rgba(0,0,0,.65)');
  px(x, y, 1, h, 'rgba(150,172,198,.35)');
  px(x+w-1, y, 1, h, 'rgba(0,0,0,.55)');
}
function hudBar(px, x, y, w, h, frac, colA, colB){
  px(x, y, w, h, '#080c10');
  px(x, y, w, 1, '#0d1318');
  var fw = Math.max(0, Math.round((w-2)*clamp(frac,0,1)));
  if(fw > 0){
    px(x+1, y+1, fw, h-2, colA);
    px(x+1, y+1, fw, 1, colB);
  }
  px(x, y, 1, h, 'rgba(140,160,186,.45)');
  px(x+w-1, y, 1, h, 'rgba(0,0,0,.5)');
}

function drawHudTop(g, r){
  var u = hudUnit();
  var px = hudPainter(g, u);
  var si = safeInsets();
  var padX = si.l/u + 5, padR = si.r/u + 5, padY = si.t/u + 5;
  var Wg = view.w/u;

  /* ---------------- top left: the stage panel ----------------
     The box takes its width from the longest stage name rather than a fixed
     number, so a long one cannot run off the end of its own panel. */
  var nameS = PF.textW(r.stage.name, 2, 1) > 150 ? 1 : 2;
  var pw = Math.max(118, PF.textW(r.stage.name, nameS, 1) + 11), ph = 60;
  hudPanel(px, padX, padY, pw, ph);
  PF.text(px, r.stage.name, padX+5, padY+5 + (nameS===1 ? 3 : 0), '#f2f6fb', nameS, 1);
  PF.text(px, 'PROGRESS', padX+5, padY+20, '#93a2b4', 1, 1);
  hudBar(px, padX+5, padY+28, pw-10, 5, r.progress, '#4fe463', '#b7ffc4');
  PF.text(px, 'DAMAGE', padX+5, padY+37, '#93a2b4', 1, 1);
  hudBar(px, padX+5, padY+45, pw-10, 5, r.car.damage/100, '#e04a2f', '#ffb08c');
  PF.text(px, 'SURFACE', padX+5, padY+53, '#93a2b4', 1, 1);
  PF.text(px, r.surface, padX+53, padY+53, '#ffffff', 1, 1);

  /* ---------------- top centre: the clock ---------------- */
  var t = r.state==='countdown' ? 0 : r.t;
  var big = fmtTime(t);
  var tgt = 'TGT ' + fmtTime(r.track.targetTime);
  var tw = Math.max(PF.textBoldW(big, 3, 1), PF.textW(tgt, 1, 1)) + 12;
  var tx = Math.round(Wg/2 - tw/2);
  hudPanel(px, tx, padY, tw, 36);
  var late = r.state==='run' && r.t > r.track.targetTime;
  PF.textBold(px, big, Math.round(Wg/2 - PF.textBoldW(big,3,1)/2), padY+5,
              late ? '#ff6a52' : '#ffb432', 3, 1);
  PF.textC(px, tgt, Wg/2, padY+27, '#93a2b4', 1, 1);

  /* ---------------- top right: pause ---------------- */
  var bw = 26, bh = 20;
  var bx = Wg - padR - bw, by = padY;
  hudPanel(px, bx, by, bw, bh);
  px(bx+9, by+5, 3, bh-10, '#e6eef7');
  px(bx+15, by+5, 3, bh-10, '#e6eef7');
  HUD.pause = { x:bx*u, y:by*u, w:bw*u, h:bh*u };
  HUD.mapBox = { x:bx + bw - 74, y:by + bh + 4, w:74, h:66 };
}

/* ----------------------------------------------------------- minimap
   The real stage, not an illustration: the same node list the physics
   drives on, with the car's live position on it. */
function drawMinimap(g, r){
  var u = hudUnit();
  var px = hudPainter(g, u);
  var B = HUD.mapBox;
  if(!B) return;
  var nodes = r.track.nodes;

  hudPanel(px, B.x, B.y, B.w, B.h);
  px(B.x+1, B.y+1, B.w-2, B.h-2, 'rgba(10,20,14,.72)');

  if(!r.mapBox){
    var minx=1e9,maxx=-1e9,miny=1e9,maxy=-1e9;
    for(var i=0;i<nodes.length;i+=4){
      if(nodes[i].x<minx)minx=nodes[i].x; if(nodes[i].x>maxx)maxx=nodes[i].x;
      if(nodes[i].y<miny)miny=nodes[i].y; if(nodes[i].y>maxy)maxy=nodes[i].y;
    }
    r.mapBox = {minx:minx,maxx:maxx,miny:miny,maxy:maxy};
  }
  var bb = r.mapBox;
  var s = Math.min((B.w-8)/Math.max(1,bb.maxx-bb.minx),
                   (B.h-8)/Math.max(1,bb.maxy-bb.miny));
  var ox = B.x + B.w/2 - ((bb.minx+bb.maxx)/2)*s;
  var oy = B.y + B.h/2 - ((bb.miny+bb.maxy)/2)*s;
  var P = function(n){ return [ox + n.x*s, oy + n.y*s]; };

  /* the line itself, stamped as pixels so it matches the rest of the HUD */
  var step = Math.max(1, Math.round(nodes.length/260));
  for(var k=0;k<nodes.length;k+=step){
    var p = P(nodes[k]);
    px(p[0]-1, p[1]-1, 2, 2, '#0a1a0e');
  }
  for(var k2=0;k2<nodes.length;k2+=step){
    var p2 = P(nodes[k2]);
    px(p2[0], p2[1], 2, 2, '#dfe8d6');
  }
  /* start and finish */
  var st = P(nodes[0]), fi = P(nodes[nodes.length-1]);
  px(st[0]-1, st[1]-1, 3, 3, '#7ef08a');
  px(fi[0]-1, fi[1]-1, 3, 3, '#ffffff');
  /* the checkpoint splits, so the map reads as a stage and not a squiggle */
  for(var q=1;q<4;q++){
    var n2 = nodes[Math.floor(nodes.length*q/4)];
    var cp = P(n2);
    px(cp[0], cp[1]-1, 1, 3, 'rgba(255,180,50,.75)');
  }
  /* the car — blinking so it is findable at a glance */
  var cp2 = [ox + r.car.x*s, oy + r.car.y*s];
  px(cp2[0]-2, cp2[1]-2, 4, 4, '#08100a');
  px(cp2[0]-1, cp2[1]-1, 3, 3, '#ffb432');
}

/* ---------------------------------------------------------- pacenotes */
function drawPacenote(g, r){
  if(!r.note || r.noteTimer <= 0) return;
  var u = hudUnit();
  var px = hudPainter(g, u);
  var Wg = view.w/u;
  var n = r.note;
  var col = n.warn ? '#ff6a52' : '#ffffff';
  var fade = clamp(r.noteTimer/0.4, 0, 1);
  var s = 2;
  var tw = PF.textBoldW(n.text, s, 1);
  var y = (safeInsets().t/u) + 46;
  var ax = Math.round(Wg/2 - tw/2) - 14;
  if(fade < 1 && (Math.floor(perfNow()/90) & 1)) return;

  hudPanel(px, ax - 5, y - 4, tw + 24, 16);
  /* the corner arrow, drawn rather than typed */
  var i;
  if(n.dir === 0){
    for(i=0;i<5;i++) px(ax+4, y+i, 2, 1, col);
    px(ax+4, y+6, 2, 2, col);
  } else {
    var rgt = n.dir > 0;
    for(i=0;i<4;i++) px(ax + (rgt ? 6+i : 5-i), y+3-i, 1, 1+i, col);
    px(ax + (rgt ? 2 : 4), y+6, 5, 2, col);
  }
  PF.textBold(px, n.text, ax + 16, y, col, s, 1);
}

/* -------------------------------------------------------- big messages
   Countdown and stage calls, in large outlined bitmap type placed above
   the car rather than in the middle of the screen — the reference frames
   the countdown right over the bonnet. */
function drawBigMsg(g, r, focal, carDrop){
  if(!r.msg || r.msg.t <= 0) return;
  var u = hudUnit();
  var px = hudPainter(g, u);
  var m = r.msg;
  var age = 1 - m.t/m.ttl;
  var Wg = view.w/u;

  /* the countdown pops on and settles */
  var pop = m.kind === 'count' ? clamp(1 - age*3.2, 0, 1) : 0;
  var s = Math.max(2, Math.round((m.big ? 6 : 3.4) * (1 + pop*0.28)));
  var carY = (focal + carDrop)/u;
  var y = Math.round(clamp(carY - (m.big ? 26 : 18)*s*0.5 - 10, (safeInsets().t/u) + 60, Wg));

  /* a flash of light behind the numeral on the frame it changes */
  if(pop > 0.6){
    var fw = PF.textBoldW(m.text, s, 1) + 20;
    g.save();
    g.globalAlpha = (pop-0.6)*1.2;
    px(Math.round(Wg/2 - fw/2), y - 6, fw, 7*s + 12, 'rgba(255,220,150,.30)');
    g.restore();
  }
  PF.textOutlineC(px, m.text, Wg/2, y, m.col || '#ffffff', 'rgba(4,6,9,.92)', s, 1);
}

/* ------------------------------------------------------------------ HUD */
function bigMsg(txt, kind, col, ttl){
  if(!race) return;
  race.msg = txt ? { text:txt, kind:kind||'msg', col:col, ttl:ttl||1.0, t:ttl||1.0,
                     big: kind === 'count' } : null;
}
function showNote(n){
  race.note = n;
  race.noteTimer = 2.6;
  audioBeep(n.warn?420:640, 0.07);
}
function showSplit(delta){
  bigMsg(fmtDelta(delta), 'split', delta <= 0 ? '#7ef08a' : '#ff6a52', 1.6);
  audioBeep(delta <= 0 ? 900 : 380, 0.09);
}
function updateHUD(r){ /* the HUD is painted from renderRace now */ }

/* --------------------------------------------------------------- loop */
var lastT = 0;
function frame(ts){
  requestAnimationFrame(frame);
  var dt = lastT ? (ts-lastT)/1000 : 0.016;
  lastT = ts;
  if(dt > 0.05) dt = 0.05;
  if(++resizeCheck > 40){ resizeCheck = 0; pendingResize = true; }
  applyPendingResize();
  if(race && !paused){
    updateHudControls(dt);
    if(race.state !== 'done') stepRace(dt);
    else {
      race.shake = Math.max(0, race.shake - dt*2);
      race.slipNow = 0;
      if(race.msg){ race.msg.t -= dt; if(race.msg.t <= 0) race.msg = null; }
      if(race.noteTimer > 0) race.noteTimer -= dt;
      spawnEffects(race, dt, 0, SURFACES[race.stage.surface], false);
    }
    renderRace();
  } else if(!race){
    if(currentScreen === 'garage') drawGarageScene(dt);
    else if(currentScreen === 'lot') drawLotScene(dt);
    else {
      ctx.fillStyle = '#10150e';
      ctx.fillRect(0,0,view.w,view.h);
    }
  }
  drawRotatePrompt(dt);
}

/* ---------------------------------------------------- orientation prompt
   Landscape is the playing orientation, so portrait gets a proper prompt
   rather than a squeezed cockpit: a pixel-art phone that tips onto its
   side, drawn in the same style as the rest of the game. */
var rotT = 0;
function drawRotatePrompt(dt){
  var el = document.getElementById('rotate-cv');
  if(!el || window.innerWidth > window.innerHeight) return;
  rotT += dt;
  var g = el.getContext('2d');
  var S = 4, GW = el.width/S, GH = el.height/S;
  g.imageSmoothingEnabled = false;
  g.clearRect(0,0,el.width,el.height);
  var px = function(x,y,w,h,c){
    g.fillStyle = c;
    g.fillRect(Math.round(x)*S, Math.round(y)*S, Math.max(1,Math.round(w))*S, Math.max(1,Math.round(h))*S);
  };
  /* 0 upright, 1 on its side, with a pause at each end */
  var cyc = (rotT % 2.6)/2.6;
  var k = cyc < 0.35 ? 0 : cyc < 0.55 ? (cyc-0.35)/0.20 : cyc < 0.9 ? 1 : 1-(cyc-0.9)/0.10;
  var ang = -k*Math.PI/2;
  var pw = 9, ph = 16;
  var cx = GW/2, cy = GH/2;
  var ca = Math.cos(ang), sa = Math.sin(ang);
  for(var y=0;y<ph;y++){
    for(var x=0;x<pw;x++){
      var lx = x - (pw-1)/2, ly = y - (ph-1)/2;
      var edge = (x===0||x===pw-1||y===0||y===ph-1);
      var screen = (x>0 && x<pw-1 && y>1 && y<ph-2);
      var col = edge ? '#8d9aa8' : (screen ? (k > 0.5 ? '#2a4a2c' : '#141a20') : '#3b444f');
      if(y===1 && x===(pw>>1)) col = '#5b6672';
      if(y===ph-2 && x===(pw>>1)) col = '#5b6672';
      px(cx + lx*ca - ly*sa - 0.5, cy + lx*sa + ly*ca - 0.5, 1, 1, col);
    }
  }
  /* the arc arrow telling you which way to turn it, sweeping over the top */
  var R2 = 12, a0 = -Math.PI*0.92, a1 = -Math.PI*0.20;
  for(var i=0;i<=14;i++){
    var a2 = a0 + (a1-a0)*i/14;
    px(cx + Math.cos(a2)*R2 - 0.5, cy + Math.sin(a2)*R2 - 0.5, 1, 1, '#ffb432');
  }
  var hx = cx + Math.cos(a1)*R2, hy = cy + Math.sin(a1)*R2;
  for(var j=0;j<3;j++) px(hx - j, hy - 2 + j, 1 + j, 1, '#ffb432');
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
  document.getElementById('dash-cv').classList.toggle('hidden', !racing);
  if(!racing) releaseAllInput();
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
        req.textContent = 'NEEDS ' + reqLabel(st);
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
    statRow('SPEED', Math.round(s.kmh*(save.settings.units==='kmh'?1:0.6214)) + ' ' + speedUnit(),
            s.kmh/240*100, false, dl(function(x){ return x.kmh; })) +
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
  hint.textContent = 'Tap an upgrade to fit it on the car and see it before you pay. ' +
    'Col de Granite needs ' + reqLabel(STAGES[1]) + '. Vitkull Pass needs ' + reqLabel(STAGES[2]) + '. ' +
    'Upgrades apply to the currently selected car only.';
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
  var uf = speedFactor(), un = speedUnit();
  var topKmh = Math.round(st.topSpeed * cs.gearing.final * uf);
  var firstKmh = Math.round(st.topSpeed * spans[0] * uf);
  var out = document.createElement('div');
  out.className = 'up-row';
  out.innerHTML = '<span class="up-name">AT REDLINE</span>' +
    '<span class="up-desc">1st runs to <b>' + firstKmh + ' ' + un + '</b>, top gear to <b>' + topKmh + ' ' + un + '</b>. ' +
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
    [['manual','THROTTLE PAD'],['auto','AUTO']], save.settings.autoGas?'auto':'manual', function(v){
      save.settings.autoGas = (v==='auto'); persist(); renderSettings();
    }));

  b.appendChild(segRow('GRAPHICS',
    'How much work each frame is worth. LOW renders the stage at a coarser ' +
    'pixel size and thins out dust, lighting and scenery — pick it if the game ' +
    'stutters or the phone gets hot. MEDIUM is the mobile default. HIGH adds ' +
    'headlight cones, more particles and a finer pixel grid.',
    [['low','LOW'],['medium','MEDIUM'],['high','HIGH']], save.settings.quality, function(v){
      save.settings.quality = v;
      world.key = '';                          /* the buffer resizes with it */
      persist(); renderSettings();
    }));

  b.appendChild(segRow('UNITS',
    'What the speedometer and the garage read in.',
    [['mph','MPH'],['kmh','KM/H']], save.settings.units, function(v){
      save.settings.units = v;
      if(race) dash.spdMax = speedDialMax(race.stats.topSpeed * race.finalDrive);
      dash.key = '';
      persist(); renderSettings();
    }));

  b.appendChild(segRow('HAPTICS',
    'A short buzz on shifts, impacts and the countdown, where the device supports it.',
    [['on','ON'],['off','OFF']], save.settings.haptics?'on':'off', function(v){
      save.settings.haptics = (v==='on');
      if(save.settings.haptics) haptic(20);
      persist(); renderSettings();
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
  about.innerHTML = '<div class="hint">RALLY PIXEL &mdash; on a phone the dashboard is the controller: ' +
    'the rockers bottom left steer, THROTTLE and BRAKE sit under the right thumb, the lever above them ' +
    'is the handbrake, and the paddles either side of the instruments change gear. ' +
    'Keyboard: arrows / WASD to steer, brake and accelerate, SPACE for the handbrake, ' +
    'E / Q to change gear in manual, ESC to pause.</div>';
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

  var prevBest = rec.best;
  var isBest = rec.best == null || time < rec.best;
  if(isBest) rec.best = time;
  rec.done = true;
  save.money += total;
  persist();

  document.getElementById('res-sub').textContent =
    st.name + '  ·  ' + SURFACES[st.surface].name + '  ·  ' + curCarDef().name;

  /* the numbers that say how the run went */
  var unit = speedUnit();
  document.getElementById('res-times').innerHTML =
    '<div class="res-line big"><span>TIME</span><span>' + fmtTime(time) + '</span></div>' +
    line('TARGET', fmtTime(tgt)) +
    lineCol('DIFFERENCE', fmtDelta(time-tgt), time <= tgt ? 'good' : 'bad') +
    line('BEST', prevBest != null ? fmtTime(prevBest) + (isBest ? '  BEATEN' : '') : 'FIRST RUN') +
    '<div style="height:5px"></div>' +
    line('TOP SPEED', Math.round(r.topSpeedSeen*speedFactor()) + ' ' + unit) +
    line('SIDEWAYS', r.driftTime.toFixed(1) + ' S') +
    line('COLLISIONS', String(r.collisions)) +
    line('DAMAGE', Math.round(r.car.damage) + '%') +
    line('RECOVERIES', String(r.recoveries||0));

  /* and the numbers that say what it paid */
  document.getElementById('res-rows').innerHTML =
    line('FINISH FEE', fmtMoney(base)) +
    line('PACE BONUS', fmtMoney(pace)) +
    line('CLEAN RUN', fmtMoney(clean)) +
    (tbonus ? line('TARGET BEATEN', fmtMoney(tbonus)) : '') +
    (first ? line('FIRST CLEAR', fmtMoney(first)) : '') +
    '<div class="res-line total"><span>PAYOUT</span><span>'+fmtMoney(total)+'</span></div>' +
    '<div style="height:5px"></div>' +
    line('CREDITS', fmtMoney(save.money));

  document.getElementById('res-title').textContent =
    isBest && prevBest != null ? 'NEW BEST TIME' : (time <= tgt ? 'TARGET BEATEN' : 'STAGE COMPLETE');

  var bts = document.getElementById('res-buttons');
  bts.innerHTML = '';
  bts.appendChild(mkBtn('RETRY','primary', function(){ startRace(st.id); }));
  /* the next stage, when it is open — the natural thing to want next */
  var idx = 0, i;
  for(i=0;i<STAGES.length;i++) if(STAGES[i].id === st.id) idx = i;
  var next = STAGES[idx+1];
  if(next){
    if(stageUnlocked(next)) bts.appendChild(mkBtn('NEXT STAGE','primary', function(){ startRace(next.id); }));
    else bts.appendChild(mkBtn('UNLOCK NEXT','', function(){ showScreen('garage'); }));
  }
  bts.appendChild(mkBtn('GARAGE','', function(){ showScreen('garage'); }));
  bts.appendChild(mkBtn('STAGES','', function(){ showScreen('stages'); }));
  bts.appendChild(mkBtn('MENU','', function(){ showScreen('menu'); }));

  race = null;
  audioStopAll();
  showScreen('results');
  audioBeep(880,0.18);
  setTimeout(function(){ audioBeep(1180,0.28); }, 160);
}
function lineCol(a,b,cls){ return '<div class="res-line '+cls+'"><span>'+a+'</span><span>'+b+'</span></div>'; }
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
  /* nothing may stay held across a pause, or the throttle sticks open */
  releaseAllInput();
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
/* The pause button is painted into the HUD, so the game canvas carries its
   own hit test rather than a DOM button sitting on top of the artwork. */
cv.addEventListener('pointerdown', function(e){
  if(!race || !HUD.pause) return;
  var rect = cv.getBoundingClientRect();
  var x = e.clientX - rect.left, y = e.clientY - rect.top;
  var p = HUD.pause;
  var pad = 10;
  if(x >= p.x-pad && x <= p.x+p.w+pad && y >= p.y-pad && y <= p.y+p.h+pad){
    e.preventDefault();
    audioKick(); haptic(10);
    togglePause();
  }
}, {passive:false});

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
document.addEventListener('pointerdown', function(){ audioKick(); }, {passive:true, once:true});
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
  bindDashInput(document.getElementById('dash-cv'));
  if(save.settings.control === 'tilt' && window.DeviceOrientationEvent &&
     typeof window.DeviceOrientationEvent.requestPermission !== 'function'){
    enableTilt();
  }
  showScreen('menu');
  requestAnimationFrame(frame);
}

/* A handle for the automated screenshot pass to drive the game with. Guarded
   on the dev flag, so it is compiled out of the production bundle entirely. */
if(import.meta.env && import.meta.env.DEV){
  window.__rally = {
    state: function(){ return race; },
    jumpToFinish: function(){
      if(!race) return;
      var n = race.track.nodes, k = n.length - 4;
      race.car.node = k; race.car.x = n[k].x; race.car.y = n[k].y; race.car.a = n[k].a;
      race.camX = n[k].x; race.camY = n[k].y; race.camA = n[k].a;
      race.state = 'run';
    }
  };
}

boot();

})();
