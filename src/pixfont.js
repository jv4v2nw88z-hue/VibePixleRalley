/* =========================================================================
   PIXEL FONT — a 5x7 bitmap face, drawn through a pixel painter so every
   glyph lands on the same grid as the rest of the art.

   The whole HUD and dashboard letter forms come from here rather than from
   a system font: a canvas `fillText` at these sizes anti-aliases, which is
   the one thing that instantly breaks a pixel-art panel. Everything below
   is whole pixels only.

   A painter is any `function(x, y, w, h, colour)` that fills a rectangle in
   grid units — the dash, the HUD and the sprite renderers each supply their
   own, so the same glyphs come out at whatever pixel size that surface uses.
   ========================================================================= */

/* Each glyph is 7 rows of 5 columns. Rows read top to bottom. */
var G = {
  '0':['01110','10001','10011','10101','11001','10001','01110'],
  '1':['00100','01100','00100','00100','00100','00100','01110'],
  '2':['01110','10001','00001','00010','00100','01000','11111'],
  '3':['11111','00010','00100','00010','00001','10001','01110'],
  '4':['00010','00110','01010','10010','11111','00010','00010'],
  '5':['11111','10000','11110','00001','00001','10001','01110'],
  '6':['00110','01000','10000','11110','10001','10001','01110'],
  '7':['11111','00001','00010','00100','01000','01000','01000'],
  '8':['01110','10001','10001','01110','10001','10001','01110'],
  '9':['01110','10001','10001','01111','00001','00010','01100'],
  'A':['01110','10001','10001','11111','10001','10001','10001'],
  'B':['11110','10001','10001','11110','10001','10001','11110'],
  'C':['01110','10001','10000','10000','10000','10001','01110'],
  'D':['11100','10010','10001','10001','10001','10010','11100'],
  'E':['11111','10000','10000','11110','10000','10000','11111'],
  'F':['11111','10000','10000','11110','10000','10000','10000'],
  'G':['01110','10001','10000','10111','10001','10001','01111'],
  'H':['10001','10001','10001','11111','10001','10001','10001'],
  'I':['01110','00100','00100','00100','00100','00100','01110'],
  'J':['00111','00010','00010','00010','00010','10010','01100'],
  'K':['10001','10010','10100','11000','10100','10010','10001'],
  'L':['10000','10000','10000','10000','10000','10000','11111'],
  'M':['10001','11011','10101','10101','10001','10001','10001'],
  'N':['10001','11001','10101','10011','10001','10001','10001'],
  'O':['01110','10001','10001','10001','10001','10001','01110'],
  'P':['11110','10001','10001','11110','10000','10000','10000'],
  'Q':['01110','10001','10001','10001','10101','10010','01101'],
  'R':['11110','10001','10001','11110','10100','10010','10001'],
  'S':['01111','10000','10000','01110','00001','00001','11110'],
  'T':['11111','00100','00100','00100','00100','00100','00100'],
  'U':['10001','10001','10001','10001','10001','10001','01110'],
  'V':['10001','10001','10001','10001','10001','01010','00100'],
  'W':['10001','10001','10001','10101','10101','11011','10001'],
  'X':['10001','10001','01010','00100','01010','10001','10001'],
  'Y':['10001','10001','01010','00100','00100','00100','00100'],
  'Z':['11111','00001','00010','00100','01000','10000','11111'],
  ' ':['00000','00000','00000','00000','00000','00000','00000'],
  '.':['00000','00000','00000','00000','00000','01100','01100'],
  ',':['00000','00000','00000','00000','01100','01100','01000'],
  ':':['00000','01100','01100','00000','01100','01100','00000'],
  '-':['00000','00000','00000','11111','00000','00000','00000'],
  '_':['00000','00000','00000','00000','00000','00000','11111'],
  '+':['00000','00100','00100','11111','00100','00100','00000'],
  '/':['00001','00010','00010','00100','01000','01000','10000'],
  '%':['11001','11010','00010','00100','01000','01011','10011'],
  '!':['00100','00100','00100','00100','00100','00000','00100'],
  '?':['01110','10001','00001','00010','00100','00000','00100'],
  '*':['00000','10101','01110','11111','01110','10101','00000'],
  '<':['00010','00100','01000','10000','01000','00100','00010'],
  '>':['01000','00100','00010','00001','00010','00100','01000'],
  '(':['00010','00100','01000','01000','01000','00100','00010'],
  ')':['01000','00100','00010','00010','00010','00100','01000'],
  '#':['01010','11111','01010','01010','01010','11111','01010'],
  '·':['00000','00000','00000','01100','01100','00000','00000'],  /* middot */
  '★':['00100','00100','11111','01110','01110','10001','00000'],  /* star */
  '↑':['00100','01110','10101','00100','00100','00100','00100'],
  '↓':['00100','00100','00100','00100','10101','01110','00100']
};

export var GLYPH_W = 5;
export var GLYPH_H = 7;

function glyph(ch){
  return G[ch] || G[ch.toUpperCase()] || G['?'];
}

/* Width of a string in grid units at the given scale. `track` is the gap
   between glyphs, also in font pixels (1 by default). */
export function textW(str, scale, track){
  scale = scale || 1;
  track = track == null ? 1 : track;
  if(!str.length) return 0;
  return (str.length*(GLYPH_W + track) - track) * scale;
}

/* Draw `str` with its top-left corner at (x, y). `px` is a pixel painter.
   Rows of a glyph are emitted as runs so a 5x7 letter costs at most a
   handful of fill calls rather than 35. */
export function text(px, str, x, y, col, scale, track){
  scale = scale || 1;
  track = track == null ? 1 : track;
  var cx = x;
  for(var i=0;i<str.length;i++){
    var rows = glyph(str[i]);
    for(var ry=0; ry<GLYPH_H; ry++){
      var row = rows[ry], run = 0;
      for(var rx=0; rx<=GLYPH_W; rx++){
        if(rx < GLYPH_W && row[rx] === '1'){ run++; continue; }
        if(run){
          px(cx + (rx-run)*scale, y + ry*scale, run*scale, scale, col);
          run = 0;
        }
      }
    }
    cx += (GLYPH_W + track)*scale;
  }
  return cx - track*scale;
}

/* Centred on `cx`. */
export function textC(px, str, cx, y, col, scale, track){
  return text(px, str, Math.round(cx - textW(str, scale, track)/2), y, col, scale, track);
}
/* Right-aligned so the last glyph ends at `rx`. */
export function textR(px, str, rx, y, col, scale, track){
  return text(px, str, Math.round(rx - textW(str, scale, track)), y, col, scale, track);
}

/* Heavier weight for headline type: the glyph plus a copy one pixel right
   and down, which thickens every stroke without a second font. */
export function textBold(px, str, x, y, col, scale, track){
  text(px, str, x, y, col, scale, track);
  text(px, str, x + scale, y, col, scale, track);
  text(px, str, x, y + scale, col, scale, track);
  text(px, str, x + scale, y + scale, col, scale, track);
  return x + textW(str, scale, track) + scale;
}
export function textBoldW(str, scale, track){ return textW(str, scale, track) + (scale||1); }

/* Headline type with a hard pixel outline, for anything that has to read
   over the road — the countdown, FINISH, recovery calls. */
export function textOutlineC(px, str, cx, y, col, edge, scale, track){
  var w = textBoldW(str, scale, track);
  var x = Math.round(cx - w/2);
  var o = scale;
  var d = [[-o,0],[o,0],[0,-o],[0,o],[-o,-o],[o,-o],[-o,o],[o,o]];
  for(var i=0;i<d.length;i++) textBold(px, str, x+d[i][0], y+d[i][1], edge, scale, track);
  textBold(px, str, x, y, col, scale, track);
  return w;
}
