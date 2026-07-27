/* =========================================================================
   DASH — canvas-drawn instrument panel art

   Every value in DC and every proportion in this file was measured off the
   Pixel Car Racer dashboard reference by sampling the image directly rather
   than eyeballing it. The measurements, as fractions of the gauge radius R
   or of the panel height H, are recorded next to the code that uses them so
   the numbers can be checked against the reference again later.

   Nothing here touches game state. It is all painting: hand a context, a
   rectangle and a value, get art back. That keeps the panel testable in
   isolation (see dev/dash-lab.html) and keeps main.js free of pixel poking.
   ========================================================================= */

/* ---------------------------------------------------------------- palette
   Sampled from the reference. Gauge internals were read off a true radial
   profile through both dials; the flat areas are stroke-interior modes, so
   JPEG ringing on the glyph edges is excluded. */
export var DC = {
  /* panel / moulding */
  panelHi:   '#232326',   /* top of the dash roll                            */
  panelMid:  '#18181a',   /* moulding face — paddles, pods, button plinths   */
  panelLo:   '#050505',   /* bottom of the roll                              */
  panelEdge: '#55565a',   /* 1px catch along the very top edge               */
  well:      '#000000',   /* black surround the instruments sit in           */

  /* gauge */
  bezelTop:  '#959595',   /* bezel is a pure vertical gradient, top…         */
  bezelMid:  '#6d6d6d',   /* …at the horizontal centreline…                  */
  bezelBot:  '#545559',   /* …to the bottom, which carries a blue tint       */
  bezelIn:   '#111111',   /* inner shadow under the bezel                    */
  face:      '#1e1e1e',   /* dial face — flat, no gradient in the reference  */
  ring:      '#9d9d9d',   /* the thin circle the ticks cross                 */
  tickMaj:   '#c8c8c8',
  tickMin:   '#6a6a6a',
  numTach:   '#b2b3e3',   /* periwinkle — tacho only                         */
  numSpeed:  '#c9c9c9',
  label:     '#c9c9c9',   /* TYPE R / KMH                                    */
  labelSub:  '#767676',   /* X1000                                           */
  needle:    '#d2453c',
  needleHot: '#e8695c',
  redline:   '#b92c23',
  hub:       '#141414',

  /* digital readout */
  lcdFrame:  '#777777',
  lcdShade:  '#4a4a4a',
  lcdBack:   '#18181a',
  lcdOn:     '#ffffff',
  lcdDim:    '#2b2b2d',

  /* rev bar / gear */
  barBlue:   '#56b2db',
  barGreen:  '#75fb4c',
  barRed:    '#ea595c',
  gearOn:    '#c9c9c9',
  gearOff:   '#333333',

  /* pedals */
  pedFace:   '#e8e8e8',
  pedHi:     '#f4f4f4',
  pedLo:     '#c9c9cc',
  pedEdge:   '#9a9a9d',
  pedHole:   '#494a4e',
  pedHoleLo: '#33343a',

  /* switchgear */
  glyph:     '#494949',
  glyphLit:  '#e8e8e8',
  domeHi:    '#c9302c',
  dome:      '#ac252b',
  domeLo:    '#7d1a1f',
  ringHi:    '#b8b9bd',
  ringMid:   '#9d9d9f',
  ringLo:    '#6a6b6f',

  /* lamps */
  lampFrame: '#777777',
  lampIcon:  '#444444',
  amber:     '#ffb432',
  red:       '#ff5a4a',
  green:     '#75fb4c'
};

var TAU = Math.PI*2;

/* Dial geometry, all as fractions of R, straight off the reference:
     bezel        1.000 → 0.918 R   (16px on a 205.5px radius)
     inner shadow 0.918 → 0.845 R
     tick ring    0.833 R
     numerals     0.700 R (glyph centres)
     redline band 0.778 → 0.886 R, i.e. the ring ±0.054
     needle       0.66 R long, 0.085 R at the hub tapering to 0.05 R
   Both dials start at canvas angle 30deg and gain 30deg per major division,
   so the value climbs anticlockwise as seen on screen. */
export var G = {
  bezelIn: 0.918, shadeIn: 0.845, ring: 0.833, num: 0.700,
  redIn: 0.778, redOut: 0.886, needle: 0.66, a0: Math.PI/6, per: Math.PI/6
};

export function gaugeAngle(v, min, max, majors){
  var f = (v - min)/(max - min);
  return G.a0 + f*majors*G.per;
}

/* ------------------------------------------------------------------ util */
function snap(v){ return Math.round(v); }
/* crisp axis-aligned block; everything in this file goes through it so the
   art stays on whole device pixels however the panel is scaled */
function blk(g, x, y, w, h, col){
  if(w <= 0 || h <= 0) return;
  g.fillStyle = col;
  g.fillRect(snap(x), snap(y), Math.max(1, snap(w)), Math.max(1, snap(h)));
}
export function roundPath(g, x, y, w, h, r){
  r = Math.min(r, w/2, h/2);
  g.beginPath();
  g.moveTo(x+r, y);
  g.lineTo(x+w-r, y); g.quadraticCurveTo(x+w, y, x+w, y+r);
  g.lineTo(x+w, y+h-r); g.quadraticCurveTo(x+w, y+h, x+w-r, y+h);
  g.lineTo(x+r, y+h); g.quadraticCurveTo(x, y+h, x, y+h-r);
  g.lineTo(x, y+r); g.quadraticCurveTo(x, y, x+r, y);
  g.closePath();
}
function poly(g, pts){
  g.beginPath();
  g.moveTo(pts[0][0], pts[0][1]);
  for(var i=1;i<pts.length;i++) g.lineTo(pts[i][0], pts[i][1]);
  g.closePath();
}

/* ------------------------------------------------------- 5x7 pixel font
   The reference letters this at 5 wide by 7 tall with a 1px stem, so the
   same grid is used here and simply drawn at whatever whole-pixel scale the
   panel size allows. Rows are 5-bit masks, top row first. */
var FONT = {
  '0':[0x0E,0x11,0x11,0x11,0x11,0x11,0x0E], '1':[0x04,0x0C,0x04,0x04,0x04,0x04,0x0E],
  '2':[0x0E,0x11,0x01,0x02,0x04,0x08,0x1F], '3':[0x1F,0x02,0x04,0x02,0x01,0x11,0x0E],
  '4':[0x02,0x06,0x0A,0x12,0x1F,0x02,0x02], '5':[0x1F,0x10,0x1E,0x01,0x01,0x11,0x0E],
  '6':[0x06,0x08,0x10,0x1E,0x11,0x11,0x0E], '7':[0x1F,0x01,0x02,0x04,0x08,0x08,0x08],
  '8':[0x0E,0x11,0x11,0x0E,0x11,0x11,0x0E], '9':[0x0E,0x11,0x11,0x0F,0x01,0x02,0x0C],
  'A':[0x0E,0x11,0x11,0x1F,0x11,0x11,0x11], 'B':[0x1E,0x11,0x11,0x1E,0x11,0x11,0x1E],
  'C':[0x0E,0x11,0x10,0x10,0x10,0x11,0x0E], 'D':[0x1E,0x11,0x11,0x11,0x11,0x11,0x1E],
  'E':[0x1F,0x10,0x10,0x1E,0x10,0x10,0x1F], 'F':[0x1F,0x10,0x10,0x1E,0x10,0x10,0x10],
  'G':[0x0E,0x11,0x10,0x17,0x11,0x11,0x0F], 'H':[0x11,0x11,0x11,0x1F,0x11,0x11,0x11],
  'I':[0x0E,0x04,0x04,0x04,0x04,0x04,0x0E], 'J':[0x07,0x02,0x02,0x02,0x02,0x12,0x0C],
  'K':[0x11,0x12,0x14,0x18,0x14,0x12,0x11], 'L':[0x10,0x10,0x10,0x10,0x10,0x10,0x1F],
  'M':[0x11,0x1B,0x15,0x15,0x11,0x11,0x11], 'N':[0x11,0x19,0x15,0x13,0x11,0x11,0x11],
  'O':[0x0E,0x11,0x11,0x11,0x11,0x11,0x0E], 'P':[0x1E,0x11,0x11,0x1E,0x10,0x10,0x10],
  'Q':[0x0E,0x11,0x11,0x11,0x15,0x12,0x0D], 'R':[0x1E,0x11,0x11,0x1E,0x14,0x12,0x11],
  'S':[0x0F,0x10,0x10,0x0E,0x01,0x01,0x1E], 'T':[0x1F,0x04,0x04,0x04,0x04,0x04,0x04],
  'U':[0x11,0x11,0x11,0x11,0x11,0x11,0x0E], 'V':[0x11,0x11,0x11,0x11,0x11,0x0A,0x04],
  'W':[0x11,0x11,0x11,0x15,0x15,0x1B,0x11], 'X':[0x11,0x11,0x0A,0x04,0x0A,0x11,0x11],
  'Y':[0x11,0x11,0x0A,0x04,0x04,0x04,0x04], 'Z':[0x1F,0x01,0x02,0x04,0x08,0x10,0x1F],
  '-':[0x00,0x00,0x00,0x1F,0x00,0x00,0x00], '.':[0,0,0,0,0,0,0x04],
  '+':[0x00,0x04,0x04,0x1F,0x04,0x04,0x00], '/':[0x01,0x01,0x02,0x04,0x08,0x10,0x10],
  ' ':[0,0,0,0,0,0,0]
};
/* A space advances 3 cells rather than 6: the reference sets TYPE R with a
   half-width gap, not a full one. */
function advance(ch){ return ch === ' ' ? 3 : 6; }
export function textW(s, u){
  var w = 0;
  for(var i=0;i<s.length;i++) w += advance(s.charAt(i))*u;
  return w - u;
}
/* align: 0 left, 1 centre, 2 right; y is the glyph top unless mid is set */
export function text(g, s, x, y, u, col, align, mid){
  var w = textW(s, u), i, r, c, gl, ch, cur = 0;
  if(align === 1) x -= w/2; else if(align === 2) x -= w;
  if(mid) y -= 3.5*u;
  x = Math.round(x); y = Math.round(y);
  g.fillStyle = col;
  for(i=0;i<s.length;i++){
    ch = s.charAt(i);
    gl = FONT[ch] || FONT[' '];
    for(r=0;r<7;r++){
      var row = gl[r], run = 0, start = 0;
      for(c=0;c<=5;c++){                       /* coalesce runs into one rect */
        var on = c < 5 && (row & (0x10 >> c));
        if(on){ if(!run) start = c; run++; }
        else if(run){ g.fillRect(x+(cur+start)*u, y+r*u, run*u, u); run = 0; }
      }
    }
    cur += advance(ch);
  }
}

/* ------------------------------------------------- 7-segment LCD digits
   The readout in the reference is a segment font, not the 5x7 one — chunky
   bars with mitred ends. t is the bar thickness. */
var SEG = { '0':0x3F,'1':0x06,'2':0x5B,'3':0x4F,'4':0x66,'5':0x6D,
            '6':0x7D,'7':0x07,'8':0x7F,'9':0x6F,'-':0x40,' ':0x00 };
/* Blocky segments that meet at the corners, the way the reference readout
   letters its digits: bars run the full width or half-height so nothing
   leaves a gap, measured at a bar thickness of 0.21 of the digit height. */
function segDigit(g, x, y, w, h, t, mask, on, off, bg){
  var m = Math.ceil((h+t)/2), i;
  var n = Math.max(1, Math.round(t*0.5));
  var bars = [
    [0x01, x,       y,        w, t],   /* a  top         */
    [0x02, x+w-t,   y,        t, m],   /* b  upper right */
    [0x04, x+w-t,   y+h-m,    t, m],   /* c  lower right */
    [0x08, x,       y+h-t,    w, t],   /* d  bottom      */
    [0x10, x,       y+h-m,    t, m],   /* e  lower left  */
    [0x20, x,       y,        t, m],   /* f  upper left  */
    [0x40, x,       y+(h-t)/2,w, t]    /* g  middle      */
  ];
  for(i=0;i<bars.length;i++){
    var b = bars[i], col = (mask & b[0]) ? on : off;
    if(col) blk(g, b[1], b[2], b[3], b[4], col);
  }
  /* mitre the outer corners, the way the reference letters its readout */
  if(bg){
    blk(g, x, y, n, n, bg);           blk(g, x+w-n, y, n, n, bg);
    blk(g, x, y+h-n, n, n, bg);       blk(g, x+w-n, y+h-n, n, n, bg);
  }
}
export function segText(g, s, x, y, w, h, on, off, bg){
  /* Reference bar thickness is 0.21 of the digit height and 0.30 of its
     width; take whichever is smaller so narrow digits do not go solid. */
  var n = s.length;
  var gap = Math.max(1, Math.round(h*0.10));
  var dw = (w - gap*(n-1))/n, i;
  var t = Math.max(1, Math.round(Math.min(h*0.21, dw*0.30)));
  for(i=0;i<n;i++)
    segDigit(g, x + i*(dw+gap), y, dw, h, t, SEG[s.charAt(i)] || 0, on, off, bg);
}

/* ============================================================== 1. PANEL
   One continuous slab across the whole width — no gaps between the control
   zones, because they are all painted onto this. The reference dash is a
   near-black roll that darkens downwards with a single lit pixel along the
   top edge, so that is what this is: #232326 to #050505 over the height. */
export function drawPanelBase(g, w, h){
  var grd = g.createLinearGradient(0, 0, 0, h);
  grd.addColorStop(0.00, DC.panelHi);
  grd.addColorStop(0.30, DC.panelMid);
  grd.addColorStop(1.00, DC.panelLo);
  g.fillStyle = grd; g.fillRect(0, 0, w, h);
  blk(g, 0, 0, w, 1, DC.panelEdge);
  blk(g, 0, 1, w, 1, 'rgba(255,255,255,.05)');
}

/* the black well an instrument or a control sits in, so nothing floats */
export function drawWell(g, cx, cy, r){
  g.beginPath(); g.arc(cx, cy, r, 0, TAU);
  g.fillStyle = DC.well; g.fill();
}
export function drawWellRect(g, x, y, w, h, r){
  roundPath(g, x, y, w, h, r);
  g.fillStyle = DC.well; g.fill();
}

/* ================================================ 2/3. GAUGE (STATIC FACE)
   o = { min, max, majors, minors, redFrom, label, sub, num }
   majors is the count of labelled divisions; each one takes 30deg, exactly
   as on the reference, so a 240 km/h speedo in eight steps sweeps 240deg
   from 4 o'clock round to 12. */
export function drawGauge(g, cx, cy, R, o){
  var i, a, r0, r1, v;
  /* Three art pixel sizes, each from a glyph measured on the reference:
     numerals stand 32px tall on a 205.5px radius, the centre caption 26px
     and the unit sub-caption 14px. Everything else on the dial is keyed to
     the caption size so the whole face scales as one. The reference drops
     the numerals to 21px on the speedo, where the labels run to three
     digits and full-size ones would collide — so does this. */
  var wide = String(Math.round(o.max)).length >= 3;
  var uN = Math.max(1, Math.round(R*(wide ? 0.0145 : 0.0222)));
  var u  = Math.max(1, Math.round(R*0.0180));
  var uS = Math.max(1, Math.round(R*0.0100));

  drawWell(g, cx, cy, R + Math.max(2, R*0.045));

  /* bezel — a flat vertical gradient, not a radial sheen. Sampled at 24
     angles around the ring; these stops are those readings, top to bottom.
     The bottom third carries a faint blue tint, the top is neutral. */
  var bez = g.createLinearGradient(0, cy - R, 0, cy + R);
  bez.addColorStop(0.00, DC.bezelTop);   /* #959595 */
  bez.addColorStop(0.15, '#888888');
  bez.addColorStop(0.25, '#828282');
  bez.addColorStop(0.37, '#757575');
  bez.addColorStop(0.50, DC.bezelMid);   /* #6d6d6d on the centreline */
  bez.addColorStop(0.63, '#656565');
  bez.addColorStop(0.75, DC.bezelBot);   /* #545559 — flat from here down */
  bez.addColorStop(1.00, DC.bezelBot);
  g.beginPath(); g.arc(cx, cy, R, 0, TAU); g.fillStyle = bez; g.fill();

  /* Under the bezel: a hard black shoulder all the way round, then the
     face. Across the top that shoulder runs deeper as a #111111 crescent —
     both measured off a radial profile of the reference dials. */
  g.beginPath(); g.arc(cx, cy, R*G.bezelIn, 0, TAU); g.fillStyle = '#050505'; g.fill();
  g.beginPath(); g.arc(cx, cy, R*0.902, 0, TAU); g.fillStyle = DC.face; g.fill();
  g.beginPath(); g.arc(cx, cy, R*(0.902+G.shadeIn)/2, Math.PI*1.02, Math.PI*1.98);
  g.lineWidth = Math.max(1, R*(0.902-G.shadeIn));
  g.strokeStyle = DC.bezelIn; g.stroke();

  var aMin = gaugeAngle(o.min, o.min, o.max, o.majors);
  var aMax = gaugeAngle(o.max, o.min, o.max, o.majors);

  /* How often to letter a division. The reference labels every one, but it
     has a 205px radius to play with; on a phone the dial is a sixth of that
     and three-digit labels would run into each other, so drop to every
     other (or every third) once the arc between majors is too short. */
  var arc = R*G.num*G.per;
  var every = o.labelEvery ||
              Math.max(1, Math.ceil(textW(String(Math.round(o.max)), uN)/arc));

  /* redline band, straddling the tick ring */
  if(o.redFrom != null){
    var ar = gaugeAngle(o.redFrom, o.min, o.max, o.majors);
    g.beginPath();
    g.arc(cx, cy, R*(G.redIn+G.redOut)/2, ar, aMax);
    g.lineWidth = Math.max(1, R*(G.redOut-G.redIn));
    g.lineCap = 'butt'; g.strokeStyle = DC.redline; g.stroke();
    /* the short hash marks that fan in ahead of the band */
    for(i=1;i<=3;i++){
      a = ar - i*G.per*0.12;
      r0 = R*(G.redIn + 0.02*i); r1 = R*G.redOut;
      g.beginPath();
      g.moveTo(cx+Math.cos(a)*r0, cy+Math.sin(a)*r0);
      g.lineTo(cx+Math.cos(a)*r1, cy+Math.sin(a)*r1);
      g.lineWidth = Math.max(1, u*0.7); g.strokeStyle = DC.redline; g.stroke();
    }
  }

  /* the tick ring: one thin light circle the ticks cross, 0.833R, 2px on
     the reference's 205.5px radius so the crosses read louder than it */
  g.beginPath(); g.arc(cx, cy, R*G.ring, aMin, aMax);
  g.lineWidth = Math.max(1, Math.round(u*0.55)); g.strokeStyle = DC.ring; g.stroke();

  /* ticks. Majors are a bright cross bar through the ring (0.12R long);
     minors are a short dim dash sitting just inside it. */
  var steps = o.majors * (o.minors || 1);
  for(i=0;i<=steps;i++){
    var maj = (i % (o.minors || 1)) === 0;
    v = o.min + (o.max-o.min)*i/steps;
    a = gaugeAngle(v, o.min, o.max, o.majors);
    if(maj){ r0 = R*(G.ring-0.062); r1 = R*(G.ring+0.062); }
    else   { r0 = R*(G.ring-0.055); r1 = R*(G.ring-0.004); }
    g.beginPath();
    g.moveTo(cx+Math.cos(a)*r0, cy+Math.sin(a)*r0);
    g.lineTo(cx+Math.cos(a)*r1, cy+Math.sin(a)*r1);
    g.lineWidth = maj ? Math.max(1, u*0.75) : 1;
    g.strokeStyle = maj ? DC.tickMaj : DC.tickMin;
    g.stroke();
    if(maj){                                    /* numeral, at 0.700R */
      if((i/(o.minors || 1)) % every) continue;
      var s = String(Math.round(v));
      text(g, s, cx+Math.cos(a)*R*G.num, cy+Math.sin(a)*R*G.num,
           uN, o.num || DC.numSpeed, 1, true);
    }
  }

  /* Centre captions. On the reference the caption is a shade smaller than
     the numerals (26px against 32px cap height) and the unit sub-caption is
     half again, so they share the same art pixel at 1.0 and 0.5. Neither
     can shrink below one whole pixel per glyph cell, so on a small dial a
     long caption is swapped for its short form or dropped entirely rather
     than allowed to run over the numbering. */
  var lab = o.label;
  if(lab && textW(lab, u) > R*0.85) lab = o.labelShort;
  if(lab && textW(lab, u) <= R*0.85)
    text(g, lab, cx, cy - R*0.18, u, DC.label, 1, true);
  if(o.sub && textW(o.sub, uS) <= R*0.55)
    text(g, o.sub, cx, cy + R*0.253, uS, DC.labelSub, 1, true);
}

/* ------------------------------------------------------------- needle
   Measured off the reference: it stops 0.03R short of the pivot rather than
   crossing it, runs out to 0.65R, and tapers from a 0.068R hub end to a
   blunt 0.039R tip. There is no counterweight and no hub cap — the dial
   centre is bare face with the needle root sitting on it. */
export function drawNeedle(g, cx, cy, R, ang, col){
  var r0 = R*0.03, L = R*G.needle, w0 = R*0.034, w1 = R*0.0195;
  g.save();
  g.translate(cx, cy); g.rotate(ang);
  poly(g, [[r0, -w0], [L-R*0.03, -w1], [L, -w1*0.7],
           [L, w1*0.7], [L-R*0.03, w1], [r0, w0]]);
  g.fillStyle = col || DC.needle; g.fill();
  g.restore();
}

/* ============================================== 3b. DIGITAL SPEED READOUT
   Chamfered grey frame, near-black window, segment digits and a small 5x7
   unit caption tucked against the right edge. */
/* Frame is 0.09 of the box height on the reference, with the light face on
   the top-left and a shaded return on the bottom-right. Split from the
   value so the panel can bake the moulding once and only repaint digits. */
export function drawReadoutFrame(g, x, y, w, h){
  var b = Math.max(1, Math.round(h*0.09));
  var r = Math.max(1, h*0.12);
  drawWellRect(g, x-b, y-b, w+2*b, h+2*b, r+b);
  roundPath(g, x, y, w, h, r);
  g.fillStyle = DC.lcdFrame; g.fill();
  g.save(); roundPath(g, x, y, w, h, r); g.clip();
  blk(g, x, y+h-b, w, b, DC.lcdShade);
  blk(g, x+w-b, y, b, h, DC.lcdShade);
  g.restore();
  blk(g, x+b, y+b, w - 2*b, h - 2*b, DC.lcdBack);
}
/* Digits fill the window; the unit caption tucks under the right edge on
   the digits' own baseline, as on the reference. */
export function drawReadoutValue(g, x, y, w, h, value, unit){
  var b = Math.max(1, Math.round(h*0.09));
  var iw = w - 2*b, ih = h - 2*b;
  var s = String(value);
  var us = Math.max(1, Math.round(ih*0.30/7));
  var uw = unit ? textW(unit, us) + us : 0;
  var dh = Math.round(ih*0.80), dy = y + b + (ih-dh)/2;
  var dw = Math.min(iw - uw - b*3, dh*0.72*s.length);
  segText(g, s, x+b*2, dy, dw, dh, DC.lcdOn, DC.lcdDim, DC.lcdBack);
  if(unit) text(g, unit, x+b+iw-b, dy+dh-us*7, us, DC.lcdOn, 2, false);
}
export function drawReadout(g, x, y, w, h, value, unit){
  drawReadoutFrame(g, x, y, w, h);
  drawReadoutValue(g, x, y, w, h, value, unit);
}

/* ================================================== 4. GEAR + REV LADDER
   The reference stacks six bars that step to the right as they descend,
   each a blue body with a green cap; the bottom bar is red. */
export function drawRevLadder(g, x, y, w, h, frac){
  /* Reference geometry: six bars 67 long by 15 deep on a 19px pitch, each
     stepping 12px further right as the stack descends, green cap on the
     right end dropped a few pixels below its bar. Bottom bar is red. */
  var rows = 6;
  var step = Math.max(1, w*0.095);
  var bw = w - step*(rows-1);
  var bh = Math.max(1, Math.round(h/(rows + (rows-1)*0.27)));
  var pitch = (h - bh)/(rows-1);
  var capW = Math.max(1, Math.round(bw*0.25));
  var drop = Math.max(0, Math.round(bh*0.30));
  for(var i=0;i<rows;i++){
    /* index 0 is the bottom bar — the reference's red one, furthest right,
       so it is also the last to light as the revs climb */
    var lit = frac > (rows-1-i)/rows + 1e-6;
    var bx = x + step*(rows-1-i);
    var by = y + h - bh - i*pitch;
    var body = i === 0 ? DC.barRed : DC.barBlue;
    blk(g, bx, by, bw-capW, bh, lit ? body : 'rgba(150,190,230,.10)');
    blk(g, bx+bw-capW, by+drop, capW, bh, lit ? DC.barGreen : 'rgba(150,230,150,.10)');
  }
}
export function drawGearWord(g, x, y, u){ text(g, 'GEAR', x, y, u, DC.gearOn, 0, false); }
export function drawGearState(g, x, y, u, gear){
  /* N and R sit as permanent unlit legends; the live gear lights up */
  var s = String(gear);
  text(g, 'N', x, y, u, gear === 'N' ? DC.gearOn : DC.gearOff, 0, false);
  text(g, 'R', x + 6*u*2, y, u, gear === 'R' ? DC.gearOn : DC.gearOff, 0, false);
  if(s !== 'N' && s !== 'R')
    text(g, s, x + 6*u*4, y, u, DC.gearOn, 0, false);
}

/* ============================================================= 5. PEDALS
   A rounded plate that tapers slightly inwards towards the foot, faced in
   near-white alloy with a quincunx of square cut-outs. The reference plate
   is 0.37H wide by 0.38H tall for the brake and a taller, narrower 0.36 by
   0.74 for the throttle, both with the same cut-out grid. */
function pedalPath(g, x, y, w, h, taper){
  var t = w*taper, r = Math.max(1.5, w*0.09);
  poly(g, [[x+r, y], [x+w-r, y], [x+w, y+r],
           [x+w-t, y+h-r], [x+w-t-r, y+h], [x+t+r, y+h], [x+t, y+h-r],
           [x, y+r]]);
}
/* Cut-outs: pairs at 0.30w and 0.77w alternating with a single at 0.52w,
   on a pitch of 0.22w, the whole block centred at 0.455 of the plate
   height — all four numbers read off the reference brake and throttle
   plates, which share one grid despite their very different outlines. */
function pedalHoles(g, x, y, w, h, rows){
  var cell = w*0.20, pitch = w*0.22;
  var y0 = y + h*0.455 - (rows-1)*pitch/2;
  for(var r=0;r<rows;r++){
    var cy = y0 + r*pitch;
    var xs = (r % 2) ? [x + w*0.52] : [x + w*0.30, x + w*0.77];
    for(var i=0;i<xs.length;i++){
      /* dark cut-out with a lit rim on the bottom-right, so it reads as a
         hole punched through a plate rather than a painted square */
      blk(g, xs[i]-cell/2, cy-cell/2, cell, cell, DC.pedHole);
      blk(g, xs[i]-cell/2, cy-cell/2, cell-Math.max(1,cell*0.16), cell-Math.max(1,cell*0.16),
          DC.pedHoleLo);
    }
  }
}
export function drawPedal(g, x, y, w, h, press, o){
  o = o || {};
  var travel = (o.travel != null ? o.travel : h*0.06) * press;
  y += travel;
  var taper = o.taper != null ? o.taper : 0.09;
  var rows = o.rows || (h > w*1.6 ? 5 : 3);
  g.save();
  if(o.lean){ g.translate(x+w/2, y+h/2); g.rotate(o.lean); g.translate(-x-w/2, -y-h/2); }
  pedalPath(g, x-1, y-1, w+2, h+2, taper);
  g.fillStyle = DC.well; g.fill();
  pedalPath(g, x, y, w, h, taper);
  /* alloy: lit down the left edge, falling away to the right and to the
     foot, so the plate reads as a curved face rather than a flat cut-out */
  var grd = g.createLinearGradient(x, y, x+w, y+h);
  grd.addColorStop(0.00, DC.pedEdge);
  grd.addColorStop(0.10, DC.pedHi);
  grd.addColorStop(0.55, DC.pedFace);
  grd.addColorStop(1.00, DC.pedLo);
  g.fillStyle = grd; g.fill();
  g.save(); g.clip();
  pedalHoles(g, x, y, w, h, rows);
  if(press > 0.05){                               /* pressed reads as shaded */
    g.fillStyle = 'rgba(0,0,0,' + (0.26*press).toFixed(3) + ')';
    g.fillRect(x, y, w, h);
  }
  g.restore();
  g.restore();
}

/* ================================================= 6. SHIFT PADDLE BLADE
   The reference blade is a rounded quadrilateral raked away from the
   centre: the top edge sits inboard of the bottom edge by about a quarter
   of the blade width, and the outer corner runs out furthest. Face is the
   same #18181a moulding as the rest of the dash with a black cast edge and
   a grey stamped glyph. */
/* Measured on the reference: the blade is a skewed parallelogram whose foot
   slides outboard by about 0.42 of its width over its height, with only a
   small radius on the corners. x,y,w,h bound the whole skewed shape. */
var PADDLE_RAKE = 0.35;
function paddleLeft(x, w, f, right){              /* blade edge at height f */
  var k = w*PADDLE_RAKE;
  return right ? x + k*f : x + k*(1-f);
}
function paddlePath(g, x, y, w, h, right){
  var k = w*PADDLE_RAKE, r = Math.max(1, w*0.05), bw = w - k;
  var tl = right ? x : x + k, bl = right ? x + k : x;
  poly(g, [[tl+r, y], [tl+bw-r, y], [tl+bw, y+r],
           [bl+bw, y+h-r], [bl+bw-r, y+h], [bl+r, y+h], [bl, y+h-r],
           [tl, y+r]]);
}
export function drawPaddle(g, x, y, w, h, right, up, press, dim){
  var drop = Math.round(press*Math.max(1, h*0.06));
  y += drop;
  g.save();
  paddlePath(g, x-1, y-1, w+2, h+2, right);
  g.fillStyle = DC.well; g.fill();
  paddlePath(g, x, y, w, h, right);
  var grd = g.createLinearGradient(0, y, 0, y+h);
  grd.addColorStop(0, press > 0.5 ? '#45454a' : '#2c2c30');
  grd.addColorStop(0.18, press > 0.5 ? '#303034' : DC.panelMid);
  grd.addColorStop(1, press > 0.5 ? '#242427' : '#101012');
  g.fillStyle = grd; g.fill();
  g.restore();
  /* stamped +/-, sitting high on the blade as on the reference. The blade
     is skewed, so the glyph rides the edge rather than the bounding box. */
  var gy = y + h*0.38;
  var gx = paddleLeft(x, w, 0.38, right) + w*(1-PADDLE_RAKE)/2;
  var t = Math.max(1, Math.round(h*0.10)), L = Math.round(w*0.42);
  var ink = dim ? '#2e2e2e' : (press > 0.5 ? DC.glyphLit : DC.glyph);
  blk(g, gx-L/2, gy-t/2, L, t, ink);
  if(up) blk(g, gx-t/2, gy-L/2, t, L, ink);
}

/* ==================================== 7. STEERING CONTROLS (substitution)
   Where the reference carries its NOS button, Rally Pixel needs steering.
   It is cast from the same physical parts: a knurled steel collar sunk into
   a black plinth with a domed cap on top, only the cap carries an arrow and
   the dome is the panel's own grey until it is pressed. */
export function drawPushButton(g, cx, cy, r, o){
  o = o || {};
  var press = o.press ? 1 : 0;
  var lift = r*0.15*(1-press);                    /* how proud the cap sits */
  var dr = r*0.72;                                /* cap radius            */
  drawWell(g, cx, cy + r*0.08, r*1.30);

  /* Steel collar: a squat ellipse with a scalloped rim, the base the cap
     rises out of. Drawn first so the cap overlaps its top edge. */
  var ccy = cy + r*0.22;
  var n = 18, i, a, s = Math.max(2, r*0.17);
  for(i=0;i<n;i++){                                /* scalloped rim */
    a = i/n*TAU;
    blk(g, cx + Math.cos(a)*r*0.96 - s/2, ccy + Math.sin(a)*r*0.80 - s/2,
        s, s, i % 2 ? DC.ringLo : DC.ringHi);
  }
  g.beginPath(); g.ellipse(cx, ccy, r*0.92, r*0.76, 0, 0, TAU);
  var col = g.createLinearGradient(0, ccy - r*0.8, 0, ccy + r*0.8);
  col.addColorStop(0, DC.ringHi); col.addColorStop(0.55, DC.ringMid); col.addColorStop(1, DC.ringLo);
  g.fillStyle = col; g.fill();

  /* cap side wall, then the cap face on top of it */
  var top = cy - lift, hot = o.hot || o.press;
  g.beginPath();
  g.ellipse(cx, top, dr, dr*0.80, 0, 0, Math.PI);
  g.ellipse(cx, top + r*0.16, dr, dr*0.80, 0, Math.PI, 0, true);
  g.closePath();
  g.fillStyle = hot ? (o.cap ? o.cap[2] : '#8a5c14') : '#141416'; g.fill();
  g.beginPath(); g.ellipse(cx, top, dr, dr*0.80, 0, 0, TAU);
  var dm = g.createLinearGradient(0, top - dr, 0, top + dr);
  /* The reference caps its button in red because it is a NOS switch; these
     are steering, so they stay the panel's own steel and light amber — the
     game's accent — rather than borrowing a meaning they do not have. */
  var cap = o.cap || ['#ffd487', DC.amber, '#a8721a'];
  if(hot){ dm.addColorStop(0, cap[0]); dm.addColorStop(0.55, cap[1]); dm.addColorStop(1, cap[2]); }
  else   { dm.addColorStop(0, '#54545a'); dm.addColorStop(0.55, '#3a3a3e'); dm.addColorStop(1, '#232327'); }
  g.fillStyle = dm; g.fill();

  if(o.arrow) drawArrow(g, cx, top, dr*0.78, o.arrow, hot ? '#3a2600' : DC.glyphLit);
  else if(o.text)
    text(g, o.text, cx, top, Math.max(1, Math.round(dr*0.44/7)), DC.glyphLit, 1, true);
}
/* solid pixel arrowhead: a column-by-column triangle, so it stays crisp at
   any size instead of turning to mush like a stroked path would */
function drawArrow(g, cx, cy, s, dir, col){
  var n = Math.max(3, Math.round(s/2)), i, step = Math.max(1, s/(2*n));
  g.fillStyle = col;
  for(i=0;i<n;i++){
    var hh = Math.max(1, (n-i)*2*step);
    g.fillRect(Math.round(cx + (dir === 'right' ? -s/2 + i*step : s/2 - (i+1)*step)),
               Math.round(cy - hh/2), Math.ceil(step), Math.round(hh));
  }
}

/* ============================================================ 8. HANDBRAKE
   Not on the reference — Rally Pixel's own control — so it is built out of
   the reference's parts: black well, grey moulded gate, a steel lever with
   a knurled grip that swings up when pulled. */
export function drawHandbrake(g, x, y, w, h, v){
  var r = Math.max(2, w*0.16);
  drawWellRect(g, x, y, w, h, r);
  roundPath(g, x+1, y+1, w-2, h-2, r);
  var pl = g.createLinearGradient(0, y, 0, y+h);
  pl.addColorStop(0, '#26262a'); pl.addColorStop(1, '#101012');
  g.fillStyle = pl; g.fill();

  /* console gate the lever runs in: a lit lip with a dark slot under it */
  var gy = y + h*0.70, gh = Math.max(3, h*0.16);
  blk(g, x+w*0.12, gy, w*0.76, gh, '#2e2e33');
  blk(g, x+w*0.12, gy, w*0.76, 1, '#5c5c62');
  blk(g, x+w*0.30, gy+1, w*0.40, Math.max(1, gh-2), '#08080a');

  /* the lever: a short steel arm on a pivot at the foot of the gate that
     swings towards vertical as it comes on */
  var px = x + w*0.30, py = gy + 1;
  var a = (30 + v*40)*Math.PI/180;
  var len = h*0.42, dx = Math.cos(a), dy = -Math.sin(a);
  var lw = Math.max(2, Math.round(w*0.11));
  g.save(); g.lineCap = 'butt';
  g.beginPath(); g.moveTo(px, py); g.lineTo(px+dx*len, py+dy*len);
  g.lineWidth = lw + 2; g.strokeStyle = DC.well; g.stroke();
  g.beginPath(); g.moveTo(px, py); g.lineTo(px+dx*len, py+dy*len);
  g.lineWidth = lw; g.strokeStyle = DC.ringMid; g.stroke();
  g.restore();

  /* rubber grip, square to the arm, amber while the lever is up */
  var gx2 = px+dx*len, gy2 = py+dy*len;
  var gw = Math.max(4, w*0.36), gh2 = Math.max(3, h*0.13);
  g.save(); g.translate(gx2, gy2); g.rotate(-a);
  roundPath(g, -gw*0.72, -gh2/2, gw, gh2, Math.max(1, gh2*0.4));
  g.fillStyle = DC.well; g.fill();
  roundPath(g, -gw*0.72+1, -gh2/2+1, gw-2, Math.max(1, gh2-2), Math.max(1, gh2*0.4));
  g.fillStyle = v > 0.5 ? DC.amber : '#33333a'; g.fill();
  g.restore();
  blk(g, px-lw/2-1, py-lw/2-1, lw+2, lw+2, DC.ringLo);
}

/* ============================================ CENTRE STACK + WARNING LAMPS
   Cosmetic dash furniture from the reference: the shift tell-tale arrows
   above the hazard triangle, and the lamp cluster in its grey moulded
   surround. Both take a hint from the drive; nothing reads them back. */
export function drawTellTales(g, x, y, w, h, up, dn){
  drawWellRect(g, x, y, w, h, Math.max(2, h*0.22));
  var tw = (w - 3)/2, i;
  for(i=0;i<2;i++){
    var on = i ? up : dn, tx = x + 1.5 + i*(tw+1);
    var cx = tx + tw/2, cy = y + h/2, s = Math.min(tw, h)*0.34;
    g.beginPath();
    if(i){ g.moveTo(cx, cy-s); g.lineTo(cx+s, cy+s*0.7); g.lineTo(cx-s, cy+s*0.7); }
    else { g.moveTo(cx, cy+s); g.lineTo(cx+s, cy-s*0.7); g.lineTo(cx-s, cy-s*0.7); }
    g.closePath();
    g.fillStyle = on ? '#5a5aff' : '#23232e'; g.fill();
  }
}
export function drawHazard(g, cx, cy, s, on){
  g.save();
  g.lineWidth = Math.max(1, s*0.13);
  g.strokeStyle = on ? DC.red : '#3a2320';
  for(var k=0;k<2;k++){
    var t = s*(1 - k*0.42);
    g.beginPath();
    g.moveTo(cx, cy-t); g.lineTo(cx+t*0.92, cy+t*0.72); g.lineTo(cx-t*0.92, cy+t*0.72);
    g.closePath(); g.stroke();
  }
  g.restore();
}
export function drawLampPanel(g, x, y, w, h, lamps){
  drawWellRect(g, x-1, y-1, w+2, h+2, Math.max(2, h*0.24));
  roundPath(g, x, y, w, h, Math.max(2, h*0.22));
  g.lineWidth = Math.max(1, h*0.10); g.strokeStyle = DC.lampFrame; g.stroke();
  g.fillStyle = '#141416'; g.fill();
  var n = lamps.length, cw = w/n;
  for(var i=0;i<n;i++)
    drawLampIcon(g, x + cw*(i+0.5), y + h/2, Math.min(cw, h)*0.62,
                 lamps[i].kind, lamps[i].on ? lamps[i].col : DC.lampIcon);
}
function drawLampIcon(g, cx, cy, s, kind, col){
  g.save();
  g.strokeStyle = col; g.fillStyle = col;
  g.lineWidth = Math.max(1, s*0.11);
  if(kind === 'temp'){
    g.beginPath(); g.arc(cx, cy+s*0.22, s*0.17, 0, TAU); g.fill();
    g.fillRect(cx-s*0.07, cy-s*0.34, s*0.14, s*0.48);
    g.fillRect(cx+s*0.12, cy-s*0.24, s*0.16, s*0.07);
    g.fillRect(cx+s*0.12, cy-s*0.04, s*0.16, s*0.07);
    g.beginPath(); g.moveTo(cx-s*0.5, cy+s*0.46); g.lineTo(cx+s*0.5, cy+s*0.46); g.stroke();
  } else if(kind === 'engine'){
    g.fillRect(cx-s*0.34, cy-s*0.06, s*0.56, s*0.28);
    g.fillRect(cx-s*0.18, cy-s*0.26, s*0.30, s*0.22);
    g.fillRect(cx+s*0.22, cy-s*0.02, s*0.16, s*0.20);
    g.fillRect(cx-s*0.44, cy+s*0.02, s*0.12, s*0.14);
  } else if(kind === 'abs'){
    g.beginPath(); g.arc(cx, cy, s*0.40, 0, TAU); g.stroke();
    text(g, 'A', cx, cy, Math.max(1, Math.round(s*0.34/7)), col, 1, true);
  } else {                                        /* headlights */
    g.beginPath(); g.arc(cx+s*0.14, cy, s*0.32, Math.PI*0.55, Math.PI*1.45, true); g.stroke();
    for(var i=-1;i<=1;i++) {
      g.beginPath();
      g.moveTo(cx-s*0.50, cy + i*s*0.24); g.lineTo(cx-s*0.16, cy + i*s*0.24); g.stroke();
    }
  }
  g.restore();
}
/* the little auxiliary dial at the right of the reference cluster */
export function drawMiniDial(g, cx, cy, r, frac){
  drawWell(g, cx, cy, r*1.2);
  var bez = g.createLinearGradient(0, cy-r, 0, cy+r);
  bez.addColorStop(0, DC.bezelTop); bez.addColorStop(1, DC.bezelBot);
  g.beginPath(); g.arc(cx, cy, r, 0, TAU); g.fillStyle = bez; g.fill();
  g.beginPath(); g.arc(cx, cy, r*0.82, 0, TAU); g.fillStyle = '#1a1a1a'; g.fill();
  for(var i=0;i<4;i++){
    var a = Math.PI/4 + i*Math.PI/2;
    blk(g, cx+Math.cos(a)*r*0.62-0.5, cy+Math.sin(a)*r*0.62-0.5, 1.5, 1.5,
        i === 1 ? DC.green : DC.ring);
  }
  var na = -Math.PI/2 + frac*Math.PI*1.5;
  g.beginPath();
  g.moveTo(cx, cy); g.lineTo(cx+Math.cos(na)*r*0.62, cy+Math.sin(na)*r*0.62);
  g.lineWidth = Math.max(1, r*0.14); g.strokeStyle = DC.needle; g.stroke();
  blk(g, cx-1, cy-1, 2, 2, '#0a0a0a');
}
