/* =========================================================================
   DASH — canvas-drawn instrument panel art, rasterised as pixel art

   Two rules hold everywhere in this file.

   One: nothing is drawn with a smooth canvas primitive. There is no arc(),
   no stroke(), no createLinearGradient — those anti-alias, and an
   anti-aliased circle reads as vector art however chunky the rest of the
   panel is. Every shape here is rasterised by hand into whole art pixels
   through the helpers at the top: circles come out with stepped edges,
   gradients come out as banded rows, tick marks and needles come out with
   hard corners. The panel canvas is sized one art pixel to one CSS pixel
   and blown up to device resolution by the browser with image-rendering:
   pixelated, so one art pixel lands as a clean 2x2 or 3x3 block.

   Two: the palette and every proportion were measured off the Pixel Car
   Racer reference dashboard by sampling the image directly rather than
   eyeballing it. The measurements, as fractions of the gauge radius R or of
   the panel height H, are recorded next to the code that uses them.

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
  shoulder:  '#050505',   /* hard black shoulder under the bezel             */
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
  pedHi:     '#f6f6f6',
  pedFace:   '#e8e8e8',
  pedMid:    '#d8d8da',
  pedLo:     '#c2c2c6',
  pedEdge:   '#9a9a9d',
  pedHole:   '#494a4e',
  pedHoleLo: '#33343a',

  /* switchgear */
  glyph:     '#494949',
  glyphLit:  '#e8e8e8',
  ringHi:    '#c4c5c9',
  ringMid:   '#9d9d9f',
  ringLo:    '#6a6b6f',
  ringDeep:  '#3c3d41',
  capHi:     '#5e5e64',
  capMid:    '#3a3a3e',
  capLo:     '#202024',
  amber:     '#ffb432',
  amberHi:   '#ffd487',
  amberLo:   '#a8721a',
  red:       '#ff5a4a',
  green:     '#75fb4c',

  /* lamps */
  lampFrame: '#777777',
  lampIcon:  '#444444'
};

/* Dial geometry, all as fractions of R, straight off the reference:
     bezel        1.000 → 0.918 R   (16px on a 205.5px radius)
     inner shadow 0.918 → 0.845 R
     tick ring    0.833 R
     numerals     0.700 R (glyph centres)
     redline band 0.778 → 0.886 R, i.e. the ring ±0.054
     needle       0.66 R long, 0.068 R at the hub tapering to 0.039 R
   Both dials start at canvas angle 30deg and gain 30deg per major division,
   so the value climbs anticlockwise as seen on screen. */
export var G = {
  bezelIn: 0.918, shoulder: 0.902, shadeIn: 0.845, ring: 0.833, num: 0.700,
  redIn: 0.778, redOut: 0.886, needle: 0.66, a0: Math.PI/6, per: Math.PI/6
};

export function gaugeAngle(v, min, max, majors){
  return G.a0 + ((v - min)/(max - min))*majors*G.per;
}

/* =========================================================================
   PIXEL RASTER PRIMITIVES

   Everything below works in whole art pixels and never asks the canvas to
   interpolate anything. Colours may vary per row (a banded gradient) but
   never within a pixel.
   ========================================================================= */

var TAU = Math.PI*2;
function R2(v){ return Math.round(v); }

/* integer-aligned block — the only thing that ever touches the context */
export function px(g, x, y, w, h, col){
  x = R2(x); y = R2(y);
  w = R2(w); h = R2(h);
  if(w <= 0 || h <= 0) return;
  g.fillStyle = col;
  g.fillRect(x, y, w, h);
}

function hex(c){
  return [parseInt(c.substr(1,2),16), parseInt(c.substr(3,2),16), parseInt(c.substr(5,2),16)];
}
function mixHex(a, b, t){
  var A = hex(a), B = hex(b);
  return '#' + [0,1,2].map(function(i){
    var v = Math.round(A[i] + (B[i]-A[i])*t);
    return (v < 16 ? '0' : '') + v.toString(16);
  }).join('');
}
/* Sample a stop list [[t,'#rgb'],…] at t. Callers pass the result straight
   to px(), so a "gradient" is really a stack of one-pixel bands. */
export function stopAt(stops, t){
  t = t < 0 ? 0 : t > 1 ? 1 : t;
  for(var i=1;i<stops.length;i++){
    if(t <= stops[i][0]){
      var a = stops[i-1], b = stops[i];
      var f = b[0] === a[0] ? 0 : (t - a[0])/(b[0] - a[0]);
      return mixHex(a[1], b[1], f);
    }
  }
  return stops[stops.length-1][1];
}

/* filled circle with stepped edges — one span per row */
export function disc(g, cx, cy, r, col){
  var y0 = Math.ceil(cy - r), y1 = Math.floor(cy + r), y, dy, hw;
  for(y=y0;y<=y1;y++){
    dy = y + 0.5 - cy;
    if(Math.abs(dy) > r) continue;
    hw = Math.sqrt(r*r - dy*dy);
    px(g, cx - hw, y, 2*hw, 1, typeof col === 'function' ? col((y-y0)/(y1-y0||1)) : col);
  }
}

/* annulus, two spans per row, colour taken per row so a vertical gradient
   comes out as clean horizontal bands */
export function ring(g, cx, cy, rOut, rIn, col){
  var y0 = Math.ceil(cy - rOut), y1 = Math.floor(cy + rOut), y, dy, ho, hi, c;
  for(y=y0;y<=y1;y++){
    dy = y + 0.5 - cy;
    if(Math.abs(dy) > rOut) continue;
    ho = Math.sqrt(rOut*rOut - dy*dy);
    c = typeof col === 'function' ? col((y - (cy-rOut))/(2*rOut)) : col;
    if(Math.abs(dy) >= rIn){ px(g, cx-ho, y, 2*ho, 1, c); continue; }
    hi = Math.sqrt(rIn*rIn - dy*dy);
    px(g, cx-ho, y, ho-hi, 1, c);
    px(g, cx+hi, y, ho-hi, 1, c);
  }
}

/* Annulus sector: scan the bounding box, keep pixels inside both the radius
   band and the angular span, and coalesce each row's keepers into runs.
   Used for the redline, the tick ring and the inner shadow crescent. */
export function sector(g, cx, cy, r0, r1, a0, a1, col){
  var span = a1 - a0;
  if(span <= 0) return;
  if(span > TAU) span = TAU;
  var y0 = Math.floor(cy - r1), y1 = Math.ceil(cy + r1);
  var x0 = Math.floor(cx - r1), x1 = Math.ceil(cx + r1);
  var r0s = r0*r0, r1s = r1*r1;
  for(var y=y0;y<=y1;y++){
    var dy = y + 0.5 - cy, run = 0, start = 0;
    for(var x=x0;x<=x1+1;x++){
      var on = false;
      if(x <= x1){
        var dx = x + 0.5 - cx, d = dx*dx + dy*dy;
        if(d >= r0s && d <= r1s){
          var a = Math.atan2(dy, dx) - a0;
          a -= Math.floor(a/TAU)*TAU;             /* into [0, TAU) */
          on = a <= span;
        }
      }
      if(on){ if(!run) start = x; run++; }
      else if(run){ px(g, start, y, run, 1, col); run = 0; }
    }
  }
}

/* Scale a point list about its own centre — used to lay a black cast edge
   under a shape without distorting its outline. */
function grow(pts, by){
  var i, cx = 0, cy = 0, n = pts.length, out = [];
  for(i=0;i<n;i++){ cx += pts[i][0]; cy += pts[i][1]; }
  cx /= n; cy /= n;
  for(i=0;i<n;i++){
    var dx = pts[i][0]-cx, dy = pts[i][1]-cy;
    var d = Math.sqrt(dx*dx + dy*dy) || 1;
    out.push([pts[i][0] + dx/d*by, pts[i][1] + dy/d*by]);
  }
  return out;
}

/* Scanline polygon fill. pts is [[x,y],…] in art pixels; col is a colour, a
   function of the horizontal position within the row (0..1) for a banded
   side-lit face, or {v:[…stops]} for a vertical band gradient. */
export function poly(g, pts, col){
  var i, n = pts.length, minY = 1e9, maxY = -1e9;
  for(i=0;i<n;i++){ if(pts[i][1] < minY) minY = pts[i][1]; if(pts[i][1] > maxY) maxY = pts[i][1]; }
  var bandsV = col && col.v;
  var yA = Math.floor(minY), yB = Math.ceil(maxY);
  for(var y=yA;y<=yB;y++){
    var sy = y + 0.5, xs = [];
    for(i=0;i<n;i++){
      var p = pts[i], q = pts[(i+1)%n];
      if((p[1] <= sy && q[1] > sy) || (q[1] <= sy && p[1] > sy))
        xs.push(p[0] + (sy - p[1])/(q[1] - p[1])*(q[0] - p[0]));
    }
    if(xs.length < 2) continue;
    xs.sort(function(a,b){ return a-b; });
    for(i=0;i+1<xs.length;i+=2){
      var xa = Math.round(xs[i]), xb = Math.round(xs[i+1]);
      if(xb <= xa) continue;
      if(bandsV){
        px(g, xa, y, xb-xa, 1, stopAt(col.v, (y - minY)/(maxY - minY || 1)));
      } else if(typeof col === 'function'){
        /* banded across the span, four steps — the pixel-art idiom for a
           curved face, and it keeps every pixel one flat colour */
        var w = xb - xa, k;
        for(k=0;k<4;k++){
          var sa = xa + Math.round(w*k/4), sb = xa + Math.round(w*(k+1)/4);
          px(g, sa, y, sb-sa, 1, col((k+0.5)/4));
        }
      } else {
        px(g, xa, y, xb-xa, 1, col);
      }
    }
  }
}

/* Thin arc, stepped along its angle rather than by area. A one-pixel band
   tested against pixel centres comes out dashed wherever the curve runs
   diagonally, so anything thinner than a couple of pixels — the tick ring,
   lamp outlines — is walked instead. */
export function arc(g, cx, cy, r, a0, a1, w, col){
  w = Math.max(1, Math.round(w));
  var n = Math.max(2, Math.ceil(Math.abs(a1-a0)*r*2));
  for(var i=0;i<=n;i++){
    var a = a0 + (a1-a0)*i/n;
    px(g, Math.round(cx + Math.cos(a)*r - w/2),
          Math.round(cy + Math.sin(a)*r - w/2), w, w, col);
  }
}

/* thick line with a square brush — stepped, no anti-aliasing */
export function line(g, x0, y0, x1, y1, w, col){
  var dx = x1-x0, dy = y1-y0;
  var n = Math.max(1, Math.ceil(Math.max(Math.abs(dx), Math.abs(dy))*2));
  w = Math.max(1, Math.round(w));
  for(var i=0;i<=n;i++){
    var t = i/n;
    px(g, Math.round(x0 + dx*t - w/2), Math.round(y0 + dy*t - w/2), w, w, col);
  }
}

/* rounded rectangle, corners cut on a quarter-circle so the radius steps */
function cornerInset(rad, dy){
  if(rad <= 0) return 0;
  var d = rad - dy;
  return rad - Math.sqrt(Math.max(0, rad*rad - d*d));
}
export function rrect(g, x, y, w, h, rad, col){
  rad = Math.min(rad, w/2, h/2);
  for(var i=0;i<h;i++){
    var dTop = i + 0.5, dBot = h - i - 0.5;
    var ins = Math.round(Math.max(
      dTop < rad ? cornerInset(rad, dTop) : 0,
      dBot < rad ? cornerInset(rad, dBot) : 0));
    px(g, x+ins, y+i, w-2*ins, 1,
       typeof col === 'function' ? col(i/(h-1||1)) : col);
  }
}
/* one-pixel outline of the same shape */
export function rrectEdge(g, x, y, w, h, rad, col){
  rad = Math.min(rad, w/2, h/2);
  for(var i=0;i<h;i++){
    var dTop = i + 0.5, dBot = h - i - 0.5;
    var ins = Math.round(Math.max(
      dTop < rad ? cornerInset(rad, dTop) : 0,
      dBot < rad ? cornerInset(rad, dBot) : 0));
    if(i === 0 || i === h-1) px(g, x+ins, y+i, w-2*ins, 1, col);
    else { px(g, x+ins, y+i, 1, 1, col); px(g, x+w-ins-1, y+i, 1, 1, col); }
  }
}

/* ------------------------------------------------------- 5x7 pixel font
   The reference letters its dials at 5 wide by 7 tall with a 1px stem, so
   the same grid is used here and simply drawn at whatever whole-pixel scale
   the panel size allows. Rows are 5-bit masks, top row first. */
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
   The readout in the reference is a segment font, not the 5x7 one — blocky
   bars meeting at mitred corners. */
var SEG = { '0':0x3F,'1':0x06,'2':0x5B,'3':0x4F,'4':0x66,'5':0x6D,
            '6':0x7D,'7':0x07,'8':0x7F,'9':0x6F,'-':0x40,' ':0x00 };
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
    if(col) px(g, b[1], b[2], b[3], b[4], col);
  }
  if(bg){
    px(g, x, y, n, n, bg);        px(g, x+w-n, y, n, n, bg);
    px(g, x, y+h-n, n, n, bg);    px(g, x+w-n, y+h-n, n, n, bg);
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
   top edge, so that is what this is, banded one row at a time.

   `deep` is the extra height under the home-indicator safe area: the
   moulding runs on down through it so nothing shows beneath the panel, but
   the instruments stay above it. */
var PANEL_STOPS = [[0, DC.panelHi], [0.30, DC.panelMid], [1, DC.panelLo]];
export function drawPanelBase(g, w, h, deep){
  deep = deep || 0;
  for(var y=0;y<h;y++) px(g, 0, y, w, 1, stopAt(PANEL_STOPS, y/(h-1||1)));
  if(deep > 0) px(g, 0, h, w, deep, DC.panelLo);
  px(g, 0, 0, w, 1, DC.panelEdge);
  px(g, 0, 1, w, 1, '#2c2c30');
}

/* the black well an instrument or a control sits in, so nothing floats */
export function drawWell(g, cx, cy, r){ disc(g, cx, cy, r, DC.well); }
export function drawWellRect(g, x, y, w, h, r){ rrect(g, x, y, w, h, r, DC.well); }

/* ================================================ 2/3. GAUGE (STATIC FACE)
   o = { min, max, majors, minors, redFrom, label, labelShort, sub, num }
   majors is the count of labelled divisions; each one takes 30deg, exactly
   as on the reference, so a 240 km/h speedo in eight steps sweeps 240deg
   from 4 o'clock round to 12. */
var BEZEL_STOPS = [
  [0.00, DC.bezelTop],   /* #959595 dead top          */
  [0.15, '#888888'], [0.25, '#828282'], [0.37, '#757575'],
  [0.50, DC.bezelMid],   /* #6d6d6d on the centreline */
  [0.63, '#656565'],
  [0.75, DC.bezelBot], [1.00, DC.bezelBot]
];
export function drawGauge(g, cx, cy, R, o){
  var i, a, r0, r1, v;
  cx = Math.round(cx); cy = Math.round(cy);
  /* Three art pixel sizes, each from a glyph measured on the reference:
     numerals stand 32px tall on a 205.5px radius, the centre caption 26px
     and the unit sub-caption 14px. The reference drops the numerals to 21px
     on the speedo, where the labels run to three digits and full-size ones
     would collide — so does this. */
  var wide = String(Math.round(o.max)).length >= 3;
  var uN = Math.max(1, Math.round(R*(wide ? 0.0145 : 0.0222)));
  var u  = Math.max(1, Math.round(R*0.0180));
  var uS = Math.max(1, Math.round(R*0.0100));

  drawWell(g, cx, cy, R + Math.max(2, R*0.045));

  /* Bezel — a flat vertical gradient, not a radial sheen. Sampled at 24
     angles around the ring; the stops are those readings, top to bottom.
     Banded one row per art pixel, so the ring steps as it curves. */
  ring(g, cx, cy, R, R*G.bezelIn, function(t){ return stopAt(BEZEL_STOPS, t); });

  /* Under the bezel: a hard black shoulder all the way round, then the
     face. Across the top that shoulder runs deeper as a #111111 crescent —
     both measured off a radial profile of the reference dials. */
  ring(g, cx, cy, R*G.bezelIn, R*G.shoulder, DC.shoulder);
  disc(g, cx, cy, R*G.shoulder, DC.face);
  sector(g, cx, cy, R*G.shadeIn, R*G.shoulder, Math.PI*1.02, Math.PI*1.98, DC.bezelIn);

  var aMin = gaugeAngle(o.min, o.min, o.max, o.majors);
  var aMax = gaugeAngle(o.max, o.min, o.max, o.majors);

  /* How often to letter a division. The reference labels every one, but it
     has a 205px radius to play with; on a phone the dial is a sixth of that
     and three-digit labels would run into each other, so drop to every
     other (or every third) once the arc between majors is too short. */
  var arcStep = R*G.num*G.per;
  var every = o.labelEvery ||
              Math.max(1, Math.ceil(textW(String(Math.round(o.max)), uN)/arcStep));

  /* redline band, straddling the tick ring */
  if(o.redFrom != null){
    var ar = gaugeAngle(o.redFrom, o.min, o.max, o.majors);
    sector(g, cx, cy, R*G.redIn, R*G.redOut, ar, aMax, DC.redline);
    for(i=1;i<=3;i++){                          /* hash marks fanning in */
      a = ar - i*G.per*0.12;
      line(g, cx+Math.cos(a)*R*(G.redIn+0.02*i), cy+Math.sin(a)*R*(G.redIn+0.02*i),
              cx+Math.cos(a)*R*G.redOut,          cy+Math.sin(a)*R*G.redOut,
              Math.max(1, u*0.5), DC.redline);
    }
  }

  /* the tick ring: one thin light circle the ticks cross, 0.833R, 2px on
     the reference's 205.5px radius so the crosses read louder than it */
  arc(g, cx, cy, R*G.ring, aMin, aMax, Math.max(1, Math.round(u*0.55)), DC.ring);

  /* ticks. Majors are a bright bar crossing the ring (0.124R long); minors
     are a short dim dash sitting just inside it. */
  var steps = o.majors * (o.minors || 1);
  for(i=0;i<=steps;i++){
    var maj = (i % (o.minors || 1)) === 0;
    v = o.min + (o.max-o.min)*i/steps;
    a = gaugeAngle(v, o.min, o.max, o.majors);
    if(maj){ r0 = R*(G.ring-0.062); r1 = R*(G.ring+0.062); }
    else   { r0 = R*(G.ring-0.055); r1 = R*(G.ring-0.004); }
    line(g, cx+Math.cos(a)*r0, cy+Math.sin(a)*r0,
            cx+Math.cos(a)*r1, cy+Math.sin(a)*r1,
            maj ? Math.max(1, u*0.75) : 1, maj ? DC.tickMaj : DC.tickMin);
    if(maj && !((i/(o.minors || 1)) % every)){  /* numeral, at 0.700R */
      var lbl = String(Math.round(v)), hw = textW(lbl, uN)/2;
      /* A wide label set out on the horizontal runs its far end into the
         tick ring. The reference lets it just kiss the ring, so cap the
         glyph's outer extent there — at reference scale this lands within a
         pixel of where the reference puts it, and on a phone dial, where
         the font cannot shrink below one pixel a cell, it pulls the label
         in far enough to stay clean. */
      var nr = Math.min(R*G.num,
                        R*(G.ring + 0.03) - hw*Math.abs(Math.cos(a)));
      nr = Math.max(R*0.42, nr);
      text(g, lbl, cx+Math.cos(a)*nr, cy+Math.sin(a)*nr,
           uN, o.num || DC.numSpeed, 1, true);
    }
  }

  /* Centre captions. On the reference the caption is a shade smaller than
     the numerals (26px against 32px cap height) and the unit sub-caption is
     half again. Neither can shrink below one whole pixel per glyph cell, so
     on a small dial a long caption is swapped for its short form or dropped
     entirely rather than allowed to run over the numbering. */
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
   centre is bare face with the needle root sitting on it. Rasterised as a
   polygon so the taper steps instead of feathering. */
export function drawNeedle(g, cx, cy, R, ang, col){
  var r0 = R*0.03, L = R*G.needle;
  var w0 = Math.max(1, R*0.034), w1 = Math.max(0.5, R*0.0195);
  var c = Math.cos(ang), s = Math.sin(ang);
  var pt = function(alng, aperp){
    return [cx + c*alng - s*aperp, cy + s*alng + c*aperp];
  };
  poly(g, [pt(r0, -w0), pt(L-R*0.03, -w1), pt(L, -w1*0.7),
           pt(L, w1*0.7), pt(L-R*0.03, w1), pt(r0, w0)], col || DC.needle);
}

/* ============================================== 3b. DIGITAL SPEED READOUT
   Frame is 0.09 of the box height on the reference, with the light face on
   the top-left and a shaded return on the bottom-right. Split from the
   value so the panel can bake the moulding once and only repaint digits. */
export function drawReadoutFrame(g, x, y, w, h){
  var b = Math.max(1, Math.round(h*0.09));
  var r = Math.max(1, Math.round(h*0.12));
  drawWellRect(g, x-b, y-b, w+2*b, h+2*b, r+b);
  rrect(g, x, y, w, h, r, DC.lcdFrame);
  px(g, x+r, y+h-b, w-2*r, b, DC.lcdShade);
  px(g, x+w-b, y+r, b, h-2*r, DC.lcdShade);
  px(g, x+b, y+b, w-2*b, h-2*b, DC.lcdBack);
}
/* Digits fill the window; the unit caption tucks under the right edge on
   the digits' own baseline, as on the reference. */
export function drawReadoutValue(g, x, y, w, h, value, unit){
  var b = Math.max(1, Math.round(h*0.09));
  var iw = w - 2*b, ih = h - 2*b;
  var s = String(value);
  var us = Math.max(1, Math.round(ih*0.30/7));
  var uw = unit ? textW(unit, us) + us : 0;
  var dh = Math.round(ih*0.80), dy = y + b + Math.round((ih-dh)/2);
  var dw = Math.min(iw - uw - b*3, dh*0.72*s.length);
  /* A segment digit needs five pixels across before it stops being legible.
     On a small panel a three-figure speed plus the unit will not both fit,
     and the speed is the part worth reading — so the unit gives way. */
  if(dw/s.length < 5){ uw = 0; unit = null; dw = Math.min(iw - b*2, dh*0.72*s.length); }
  segText(g, s, x+b*2, dy, dw, dh, DC.lcdOn, DC.lcdDim, DC.lcdBack);
  if(unit) text(g, unit, x+b+iw-b, dy+dh-us*7, us, DC.lcdOn, 2, false);
}
export function drawReadout(g, x, y, w, h, value, unit){
  drawReadoutFrame(g, x, y, w, h);
  drawReadoutValue(g, x, y, w, h, value, unit);
}

/* ================================================== 4. GEAR + REV LADDER
   Reference geometry: six bars 67 long by 15 deep on a 19px pitch, each
   stepping 12px further right as the stack descends, green cap on the right
   end dropped a few pixels below its bar. Bottom bar is red. */
export function drawRevLadder(g, x, y, w, h, frac){
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
    px(g, bx, by, bw-capW, bh, lit ? body : '#232a30');
    px(g, bx+bw-capW, by+drop, capW, bh, lit ? DC.barGreen : '#243024');
  }
}
export function drawGearWord(g, x, y, u){ text(g, 'GEAR', x, y, u, DC.gearOn, 0, false); }
export function drawGearState(g, x, y, u, gear){
  /* N and R sit as permanent unlit legends; the live gear lights up */
  var s = String(gear);
  text(g, 'N', x, y, u, gear === 'N' ? DC.gearOn : DC.gearOff, 0, false);
  text(g, 'R', x + 12*u, y, u, gear === 'R' ? DC.gearOn : DC.gearOff, 0, false);
  if(s !== 'N' && s !== 'R') text(g, s, x + 24*u, y, u, DC.gearOn, 0, false);
}

/* ============================================================= 5. PEDALS
   A rounded plate that tapers slightly inwards towards the foot, faced in
   near-white alloy with a quincunx of square cut-outs. The reference plate
   is 0.37H wide by 0.38H tall for the brake and a taller, narrower 0.36 by
   0.74 for the throttle, both with the same cut-out grid. */
function pedalPts(x, y, w, h, taper){
  var t = w*taper, r = Math.max(1, w*0.09);
  return [[x+r, y], [x+w-r, y], [x+w, y+r],
          [x+w-t, y+h-r], [x+w-t-r, y+h], [x+t+r, y+h], [x+t, y+h-r], [x, y+r]];
}
/* Cut-outs: pairs at 0.30w and 0.77w alternating with a single at 0.52w, on
   a pitch of 0.22w, the whole block centred at 0.455 of the plate height —
   all four numbers read off the reference brake and throttle plates, which
   share one grid despite their very different outlines. */
function pedalHoles(g, x, y, w, h, rows){
  var cell = Math.max(2, Math.round(w*0.20)), pitch = w*0.22;
  var y0 = y + h*0.455 - (rows-1)*pitch/2;
  for(var r=0;r<rows;r++){
    var cy = y0 + r*pitch;
    var xs = (r % 2) ? [x + w*0.52] : [x + w*0.30, x + w*0.77];
    for(var i=0;i<xs.length;i++){
      /* dark cut-out with a lit rim on the bottom-right, so it reads as a
         hole punched through a plate rather than a painted square */
      px(g, xs[i]-cell/2, cy-cell/2, cell, cell, DC.pedHole);
      px(g, xs[i]-cell/2, cy-cell/2, cell-1, cell-1, DC.pedHoleLo);
    }
  }
}
var PED_BANDS = [DC.pedHi, DC.pedFace, DC.pedMid, DC.pedLo];
export function drawPedal(g, x, y, w, h, press, o){
  o = o || {};
  var travel = Math.round((o.travel != null ? o.travel : h*0.06) * press);
  y += travel;
  var taper = o.taper != null ? o.taper : 0.09;
  var rows = o.rows || (h > w*1.6 ? 5 : 3);
  var lean = o.lean || 0;
  var pts = pedalPts(x, y, w, h, taper), i;
  if(lean){                                     /* rake, as on the throttle */
    var mx = x + w/2, my = y + h/2, c = Math.cos(lean), s = Math.sin(lean);
    for(i=0;i<pts.length;i++){
      var dx = pts[i][0]-mx, dy = pts[i][1]-my;
      pts[i] = [mx + dx*c - dy*s, my + dx*s + dy*c];
    }
  }
  poly(g, grow(pts, 1), DC.well);                /* black cast edge */
  /* alloy face: four flat bands left to right, lit down the outer edge —
     the pixel-art way to say "curved plate" without a smooth gradient */
  var dark = press > 0.05;
  poly(g, pts, function(t){
    var col = PED_BANDS[Math.min(3, Math.floor(t*4))];
    return dark ? mixHex(col, '#3a3a3e', 0.30*press) : col;
  });
  pedalHoles(g, x, y, w, h, rows);
}

/* ================================================= 6. SHIFT PADDLE BLADE
   Measured on the reference: the blade is a skewed parallelogram whose foot
   slides outboard by about 0.35 of its width over its height, with only a
   small radius on the corners. x,y,w,h bound the whole skewed shape. */
var PADDLE_RAKE = 0.35;
function paddlePts(x, y, w, h, right){
  var k = w*PADDLE_RAKE, r = Math.max(1, w*0.10), bw = w - k;
  var tl = right ? x : x + k, bl = right ? x + k : x;
  return [[tl+r, y], [tl+bw-r, y], [tl+bw, y+r],
          [bl+bw, y+h-r], [bl+bw-r, y+h], [bl+r, y+h], [bl, y+h-r], [tl, y+r]];
}
export function drawPaddle(g, x, y, w, h, right, up, press, dim){
  var drop = Math.round(press*Math.max(1, h*0.06));
  y += drop;
  var pts = paddlePts(x, y, w, h, right);
  poly(g, grow(pts, 1), DC.well);
  poly(g, pts, { v: press > 0.5
    ? [[0,'#45454a'],[0.18,'#303034'],[1,'#242427']]
    : [[0,'#2c2c30'],[0.18,DC.panelMid],[1,'#101012']] });
  /* stamped +/-, sitting high on the blade as on the reference. The blade
     is skewed, so the glyph rides the edge rather than the bounding box. */
  var k = w*PADDLE_RAKE, f = 0.38;
  var gx = (right ? x + k*f : x + k*(1-f)) + (w-k)/2, gy = y + h*f;
  var t = Math.max(1, Math.round(h*0.10)), L = Math.max(2, Math.round(w*0.42));
  var ink = dim ? '#2e2e2e' : (press > 0.5 ? DC.glyphLit : DC.glyph);
  px(g, gx-L/2, gy-t/2, L, t, ink);
  if(up) px(g, gx-t/2, gy-L/2, t, L, ink);
}

/* ==================================== 7. STEERING CONTROLS (substitution)
   Where the reference carries its NOS button, Rally Pixel needs steering.
   It is cast from the same physical parts and at the same prominence — that
   button is the largest single control on the reference dash — but the cap
   is the panel's own steel rather than nitrous red, and lights amber.

   Built to read as raised: a scalloped collar, then a cap standing proud of
   it on a visible side wall, with a lit arc across the upper-left and a
   shadowed arc across the lower-right so the light source matches the rest
   of the panel. */
export function drawPushButton(g, cx, cy, r, o){
  o = o || {};
  cx = Math.round(cx); cy = Math.round(cy);
  var press = o.press ? 1 : 0;
  var lift = Math.round(r*0.20*(1-press));       /* how proud the cap sits */
  var dr = Math.round(r*0.64);                   /* cap radius             */
  var i, a, s;

  drawWell(g, cx, cy, r*1.24);

  /* scalloped collar rim, then the collar itself */
  s = Math.max(2, Math.round(r*0.20));
  for(i=0;i<18;i++){
    a = i/18*TAU;
    px(g, cx + Math.cos(a)*r*0.96 - s/2, cy + Math.sin(a)*r*0.84 - s/2, s, s,
       i % 2 ? DC.ringLo : DC.ringHi);
  }
  disc(g, cx, cy, r*0.90, function(t){
    return stopAt([[0,DC.ringHi],[0.5,DC.ringMid],[1,DC.ringLo]], t);
  });
  /* collar shading: lit crescent upper-left, shadow crescent lower-right */
  sector(g, cx, cy, r*0.78, r*0.90, Math.PI*1.05, Math.PI*1.72, '#dcdde1');
  sector(g, cx, cy, r*0.78, r*0.90, Math.PI*0.08, Math.PI*0.72, DC.ringDeep);

  /* the cap's side wall — a straight extrusion, so the cap reads as a solid
     object standing off the collar rather than a decal on it */
  var top = cy - lift;
  var wall = o.hot ? DC.amberLo : '#141416';
  for(i=0;i<=lift+Math.round(r*0.16);i++)
    disc(g, cx, top+i, dr, wall);
  disc(g, cx, top, dr, function(t){
    return o.hot
      ? stopAt([[0,DC.amberHi],[0.55,DC.amber],[1,DC.amberLo]], t)
      : stopAt([[0,DC.capHi],[0.55,DC.capMid],[1,DC.capLo]], t);
  });
  /* emboss: one-pixel highlight top-left, one-pixel shadow bottom-right */
  sector(g, cx, top, dr - Math.max(1, r*0.10), dr, Math.PI*1.02, Math.PI*1.78,
         o.hot ? '#ffe9bd' : '#7c7c84');
  sector(g, cx, top, dr - Math.max(1, r*0.10), dr, Math.PI*0.10, Math.PI*0.86,
         o.hot ? '#7d5310' : '#101013');

  if(o.arrow) drawArrow(g, cx, top, dr*0.90, o.arrow, o.hot ? '#3a2600' : DC.glyphLit);
  else if(o.text)
    text(g, o.text, cx, top, Math.max(1, Math.round(dr*0.44/7)), DC.glyphLit, 1, true);
}
/* solid pixel arrowhead: a column-by-column triangle, so it stays crisp at
   any size instead of turning to mush like a stroked path would */
function drawArrow(g, cx, cy, s, dir, col){
  var n = Math.max(3, Math.round(s/2)), i;
  var step = Math.max(1, Math.round(s/(2*n)));
  for(i=0;i<n;i++){
    var hh = Math.max(1, (n-i)*2*step - 1);
    px(g, cx + (dir === 'right' ? -n*step/2 + i*step : n*step/2 - (i+1)*step),
          cy - hh/2, step, hh, col);
  }
}

/* ============================================================ 8. HANDBRAKE
   Not on the reference — Rally Pixel's own control — so it is built out of
   the reference's parts: black well, moulded gate, a steel lever with a
   grip that swings up when pulled. */
export function drawHandbrake(g, x, y, w, h, v){
  var r = Math.max(2, Math.round(w*0.16));
  drawWellRect(g, x, y, w, h, r);
  rrect(g, x+1, y+1, w-2, h-2, r, function(t){
    return stopAt([[0,'#26262a'],[1,'#101012']], t);
  });

  /* console gate the lever runs in: a lit lip with a dark slot under it */
  var gy = Math.round(y + h*0.70), gh = Math.max(3, Math.round(h*0.16));
  px(g, x+w*0.12, gy, w*0.76, gh, '#2e2e33');
  px(g, x+w*0.12, gy, w*0.76, 1, '#5c5c62');
  px(g, x+w*0.30, gy+1, w*0.40, Math.max(1, gh-2), '#08080a');

  /* the lever: a short steel arm on a pivot at the foot of the gate that
     swings towards vertical as it comes on */
  var pxx = Math.round(x + w*0.30), pyy = gy + 1;
  var a = (30 + v*40)*Math.PI/180;
  var len = h*0.42, dx = Math.cos(a), dy = -Math.sin(a);
  var lw = Math.max(2, Math.round(w*0.11));
  line(g, pxx, pyy, pxx+dx*len, pyy+dy*len, lw+2, DC.well);
  line(g, pxx, pyy, pxx+dx*len, pyy+dy*len, lw, DC.ringMid);
  line(g, pxx, pyy, pxx+dx*len*0.9, pyy+dy*len*0.9, Math.max(1, lw-2), DC.ringHi);

  /* grip block at the top of the arm, amber while the lever is up */
  var gx2 = pxx+dx*len, gy2 = pyy+dy*len;
  var gw = Math.max(3, Math.round(w*0.30)), gh2 = Math.max(3, Math.round(h*0.13));
  px(g, gx2-gw/2-1, gy2-gh2/2-1, gw+2, gh2+2, DC.well);
  px(g, gx2-gw/2, gy2-gh2/2, gw, gh2, v > 0.5 ? DC.amber : '#3a3a42');
  px(g, gx2-gw/2, gy2-gh2/2, gw, 1, v > 0.5 ? DC.amberHi : '#55555f');
  px(g, pxx-lw/2-1, pyy-lw/2-1, lw+2, lw+2, DC.ringLo);
}

/* ============================================ CENTRE STACK + WARNING LAMPS
   Cosmetic dash furniture from the reference: the shift tell-tale arrows
   above the hazard triangle, and the lamp cluster in its moulded surround.
   Both take a hint from the drive; nothing reads them back. */
export function drawTellTales(g, x, y, w, h, up, dn){
  drawWellRect(g, x, y, w, h, Math.max(1, Math.round(h*0.22)));
  var tw = Math.floor((w - 3)/2), i;
  for(i=0;i<2;i++){
    /* left blade is the downshift tell-tale and points down; right is the
       upshift and points up */
    var on = i ? up : dn, tx = x + 1 + i*(tw+1);
    var cx = tx + tw/2, cy = y + h/2, s = Math.max(2, Math.round(Math.min(tw, h)*0.34));
    var col = on ? '#5a5aff' : '#23232e', k;
    for(k=0;k<s;k++){                            /* stepped triangle */
      var wq = Math.max(1, (i ? k+1 : s-k)*2 - 1);
      px(g, cx - wq/2, cy - s/2 + k, wq, 1, col);
    }
  }
}
export function drawHazard(g, cx, cy, s, on){
  var col = on ? DC.red : '#3a2320', k;
  s = Math.max(3, Math.round(s));
  cx = Math.round(cx);
  var base = Math.max(3, Math.round(s*1.15)), y0 = Math.round(cy - s/2);
  for(k=0;k<s;k++){                              /* stepped triangle outline */
    var wq = Math.max(1, Math.round(1 + k*(base-1)/(s-1)));
    var x0 = cx - Math.floor(wq/2);
    px(g, x0, y0+k, 1, 1, col);
    px(g, x0+wq-1, y0+k, 1, 1, col);
  }
  px(g, cx - Math.floor(base/2), y0+s-1, base, 1, col);
}
export function drawLampPanel(g, x, y, w, h, lamps){
  drawWellRect(g, x-1, y-1, w+2, h+2, Math.max(1, Math.round(h*0.24)));
  var r = Math.max(1, Math.round(h*0.22));
  rrect(g, x, y, w, h, r, '#141416');
  rrectEdge(g, x, y, w, h, r, DC.lampFrame);
  var n = lamps.length, cw = w/n;
  for(var i=0;i<n;i++)
    drawLampIcon(g, x + cw*(i+0.5), y + h/2, Math.min(cw, h)*0.60,
                 lamps[i].kind, lamps[i].on ? lamps[i].col : DC.lampIcon);
}
function drawLampIcon(g, cx, cy, s, kind, col){
  var i, u = Math.max(1, Math.round(s*0.16));
  if(kind === 'temp'){                           /* coolant thermometer */
    px(g, cx-u, cy-s*0.40, 2*u, s*0.55, col);
    px(g, cx-1.5*u, cy+s*0.12, 3*u, 2*u, col);
    for(i=0;i<2;i++) px(g, cx+1.5*u, cy-s*0.24+i*s*0.20, 2*u, u, col);
    px(g, cx-s*0.5, cy+s*0.46, s, u, col);
  } else if(kind === 'engine'){                  /* check-engine block */
    px(g, cx-s*0.34, cy-s*0.06, s*0.56, s*0.28, col);
    px(g, cx-s*0.18, cy-s*0.26, s*0.30, s*0.22, col);
    px(g, cx+s*0.22, cy-s*0.02, s*0.16, s*0.20, col);
    px(g, cx-s*0.46, cy+s*0.02, s*0.14, s*0.14, col);
  } else if(kind === 'abs'){                     /* ringed A */
    ring(g, cx, cy, s*0.44, s*0.44-u, col);
    text(g, 'A', cx, cy, Math.max(1, Math.round(s*0.36/7)), col, 1, true);
  } else {                                       /* headlamp and beams */
    for(i=0;i<3;i++) px(g, cx-s*0.5, cy-s*0.26+i*s*0.26, s*0.30, u, col);
    ring(g, cx+s*0.22, cy, s*0.34, s*0.34-u, col);
    px(g, cx-s*0.02, cy-s*0.34, u, s*0.68, '#141416');
  }
}
/* the little auxiliary dial at the right of the reference cluster */
export function drawMiniDial(g, cx, cy, r, frac){
  cx = Math.round(cx); cy = Math.round(cy);
  drawWell(g, cx, cy, r*1.2);
  ring(g, cx, cy, r, r*0.80, function(t){
    return stopAt([[0,DC.bezelTop],[1,DC.bezelBot]], t);
  });
  disc(g, cx, cy, r*0.80, '#1a1a1a');
  for(var i=0;i<4;i++){
    var a = Math.PI/4 + i*Math.PI/2;
    px(g, cx+Math.cos(a)*r*0.58, cy+Math.sin(a)*r*0.58, 1, 1, i === 1 ? DC.green : DC.ring);
  }
  var na = -Math.PI/2 + frac*Math.PI*1.5;
  line(g, cx, cy, cx+Math.cos(na)*r*0.60, cy+Math.sin(na)*r*0.60,
       Math.max(1, r*0.16), DC.needle);
  px(g, cx-1, cy-1, 2, 2, '#0a0a0a');
}
