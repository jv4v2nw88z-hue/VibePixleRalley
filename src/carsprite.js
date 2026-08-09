/* =========================================================================
   TOP-DOWN CAR SPRITE — a pseudo-3D rally car rendered through a low
   resolution pixel pipeline.

   The old sprite was a flat character map. This one is built the way a
   pre-rendered 3D sprite would be: a body silhouette with a curvature
   shading ramp across it, then the panels that stand proud of it — hood,
   glasshouse, roof, boot — each stepped one shade brighter or darker so the
   car reads as a solid object with height rather than a decal.

   Everything is authored in SPRITE PIXELS. The renderer paints into a
   canvas of exactly pw x ph pixels; the game blits that into its low
   resolution world buffer at roughly 1:1, so a sprite pixel and a world
   pixel are the same size and the car sits in the same grid as the scenery.

   Light comes from the top left throughout, matching the scenery shading
   and the dashboard bezels.
   ========================================================================= */

/* --------------------------------------------------------------- specs
   Rows are given as fractions of the car's length, nose (0) to tail (1),
   so the same body plan renders at any grid size.

     hw        half-width profile, [t, halfWidth in px]
     hood      [t0, t1] bonnet extent
     screen    [t0, t1] windshield
     roof      [t0, t1] roof panel
     rear      [t0, t1] rear window
     axleF/R   wheel centres
     arch      how far the arches flare past the body, in px            */
var SPECS = {
  hatch: {
    pw:25, ph:43,
    hw:[[0,7.0],[0.05,8.6],[0.13,10.2],[0.30,10.8],[0.62,10.8],[0.84,10.5],[0.94,9.4],[1,7.5]],
    hood:[0.09,0.34], screen:[0.33,0.435], roof:[0.43,0.68], rear:[0.675,0.755], boot:[0.76,0.92],
    axleF:0.20, axleR:0.80, wheelL:0.155, wheelW:3.4, arch:1.3,
    hoodVent:0, roofVent:1, spoiler:0.55, mirror:0.36, lightBar:0
  },
  rally: {
    pw:27, ph:45,
    hw:[[0,7.7],[0.05,9.5],[0.12,11.3],[0.28,11.8],[0.62,11.8],[0.85,11.5],[0.95,10.3],[1,8.2]],
    hood:[0.08,0.33], screen:[0.32,0.425], roof:[0.42,0.67], rear:[0.665,0.745], boot:[0.75,0.91],
    axleF:0.19, axleR:0.80, wheelL:0.16, wheelW:3.9, arch:1.8,
    hoodVent:1, roofVent:1, spoiler:0.80, mirror:0.35, lightBar:0
  },
  wrc: {
    pw:29, ph:46,
    hw:[[0,8.6],[0.04,10.6],[0.11,12.6],[0.26,13.1],[0.62,13.1],[0.86,12.8],[0.96,11.3],[1,9.1]],
    hood:[0.08,0.32], screen:[0.31,0.415], roof:[0.41,0.66], rear:[0.655,0.735], boot:[0.74,0.90],
    axleF:0.19, axleR:0.80, wheelL:0.165, wheelW:4.4, arch:2.4,
    hoodVent:2, roofVent:2, spoiler:1.0, mirror:0.34, lightBar:1
  }
};
export function carSpec(name){ return SPECS[name] || SPECS.hatch; }

/* ------------------------------------------------------------- helpers */
function profileAt(pts, t){
  if(t <= pts[0][0]) return pts[0][1];
  for(var i=1;i<pts.length;i++){
    if(t <= pts[i][0]){
      var a = pts[i-1], b = pts[i];
      var k = (t - a[0]) / Math.max(1e-6, b[0]-a[0]);
      return a[1] + (b[1]-a[1])*k;
    }
  }
  return pts[pts.length-1][1];
}

/* Shading ramp across the width of the body. `d` is the signed distance
   from the centreline in px, negative to the left. The light is up and to
   the left, so the left shoulder catches it and the right one falls away —
   the same convention the scenery and the dash bezels use. */
function bodyBand(pal, d, half){
  var f = d/Math.max(0.5, half);          /* -1 .. 1 */
  if(f < -0.86) return pal.hi;
  if(f < -0.56) return pal.lite;
  if(f <  0.30) return pal.body;
  if(f <  0.66) return pal.dark;
  if(f <  0.88) return pal.darker;
  return pal.deep;
}
function glassBand(pal, d, half){
  var f = d/Math.max(0.5, half);
  if(f < -0.60) return pal.glassLite;
  if(f <  0.55) return pal.glass;
  return pal.glassDark;
}

/* =========================================================================
   Build. Returns a pixel colour buffer plus the lamp positions, so the game
   can light the headlights and brake lights without a second sprite.
   ========================================================================= */
function buildBuffer(spec, pal, livery, liveryAt, dmg){
  var pw = spec.pw, ph = spec.ph;
  var buf = new Array(pw*ph);
  var i;
  for(i=0;i<buf.length;i++) buf[i] = null;

  var cx = (pw-1)/2;
  var set = function(x,y,c){
    x = Math.round(x); y = Math.round(y);
    if(c && x>=0 && x<pw && y>=0 && y<ph) buf[y*pw+x] = c;
  };
  var row = function(y, x0, x1, c){
    for(var x=Math.round(x0); x<=Math.round(x1); x++) set(x,y,c);
  };
  var halfAt = function(y){ return profileAt(spec.hw, y/(ph-1)); };
  var R = function(t){ return Math.round(t*(ph-1)); };

  var lamps = { head:[], tail:[], brake:[] };

  /* ---------------------------------------------------------- wheels
     Drawn first: the body and its arches are painted over the inner half,
     so only the tyre shoulder shows past the flare — the way a rally car
     looks from directly above. */
  var wl = Math.max(3, Math.round(spec.wheelL*ph));
  var ww = Math.max(2, Math.round(spec.wheelW));
  var axles = [R(spec.axleF), R(spec.axleR)];
  for(var a=0;a<2;a++){
    var ay = axles[a];
    var hw = halfAt(ay) + spec.arch;
    for(var s=-1;s<=1;s+=2){
      var outer = cx + s*hw;
      for(var wy=ay-Math.floor(wl/2); wy<=ay+Math.floor(wl/2); wy++){
        for(var k=0;k<ww;k++){
          var wx = outer - s*k;
          /* tread band across the middle of the contact patch */
          var edge = (wy === ay-Math.floor(wl/2) || wy === ay+Math.floor(wl/2));
          var c = edge ? pal.tyreDark : (((wy - ay) & 1) ? pal.tyre : pal.tyreLite);
          if(k === 0 && s < 0) c = pal.tyreLite;         /* lit outer sidewall */
          if(k === ww-1) c = pal.tyreDark;
          set(wx, wy, c);
        }
      }
    }
  }

  /* ------------------------------------------------------------- body */
  for(var y=0;y<ph;y++){
    var half = halfAt(y);
    var t = y/(ph-1);
    for(var x=0;x<pw;x++){
      var d = x - cx;
      if(Math.abs(d) > half + 0.5) continue;
      var col = bodyBand(pal, d, half);
      /* nose and tail curve away from the light, so darken the ends */
      if(t < 0.05 || t > 0.96) col = pal.dark;
      buf[y*pw+x] = col;
    }
  }

  /* arch flares: a dark lip around each wheel so the tyre sits in a well */
  for(a=0;a<2;a++){
    var ry = axles[a], rh = Math.floor(wl/2)+1;
    for(var fy=ry-rh; fy<=ry+rh; fy++){
      if(fy<0||fy>=ph) continue;
      var fh = halfAt(fy);
      for(var fs=-1;fs<=1;fs+=2){
        set(cx + fs*fh, fy, pal.deep);
        set(cx + fs*(fh-1), fy, fs<0 ? pal.dark : pal.darker);
      }
    }
  }

  /* ------------------------------------------------- bumpers and valance */
  var noseEnd = R(0.055), tailStart = R(0.945);
  for(y=0;y<=noseEnd;y++) row(y, cx-halfAt(y)+1, cx+halfAt(y)-1, y===0 ? pal.black : pal.darker);
  for(y=tailStart;y<ph;y++) row(y, cx-halfAt(y)+1, cx+halfAt(y)-1, y===ph-1 ? pal.black : pal.darker);
  /* front splitter — one black lip proud of the bumper */
  row(0, cx-halfAt(0)+2, cx+halfAt(0)-2, pal.black);

  /* -------------------------------------------------------------- hood */
  var h0 = R(spec.hood[0]), h1 = R(spec.hood[1]);
  for(y=h0;y<=h1;y++){
    var hh = halfAt(y);
    /* shut lines down both sides of the bonnet */
    set(cx-hh+1.5, y, pal.darker);
    set(cx+hh-1.5, y, pal.deep);
  }
  /* centre crease, so the bonnet reads as two planes meeting */
  for(y=h0+1;y<=h1-1;y++){
    set(cx-0.5, y, pal.lite);
    set(cx+0.5, y, pal.dark);
  }
  /* bonnet vents near the scuttle */
  if(spec.hoodVent){
    var vy = h1-2;
    for(var v=0;v<spec.hoodVent;v++){
      for(var vx=-3; vx<=3; vx++){
        set(cx+vx, vy - v*2, pal.black);
        set(cx+vx, vy - v*2 - 1, pal.vent);
      }
    }
  }

  /* ------------------------------------------------- windshield + wipers */
  var s0 = R(spec.screen[0]), s1 = R(spec.screen[1]);
  for(y=s0;y<=s1;y++){
    var gh = halfAt(y) - 3.5 - (y === s0 ? 1 : 0);
    row(y, cx-gh, cx+gh, null);
    for(x=Math.round(cx-gh); x<=Math.round(cx+gh); x++) set(x, y, glassBand(pal, x-cx, gh));
  }
  /* the sky caught in the screen: a hard diagonal streak, the single thing
     that stops a top-down windscreen reading as a hole in the roof */
  for(y=s0+1;y<=s1;y++){
    var rl = Math.round(cx - halfAt(y) + 4.5 + (y-s0)*1.1);
    set(rl, y, pal.glassSheen);
    set(rl+1, y, pal.glassLite);
  }
  row(s0, cx-halfAt(s0)+2, cx+halfAt(s0)-2, pal.black);      /* scuttle / wiper bay */
  /* wiper arms parked across the scuttle */
  for(var wp=-1; wp<=1; wp+=2){
    var wax = Math.round(cx + wp*2.5);
    set(wax, s0, pal.chromeDark);
    set(wax + wp, s0 - 1, pal.chromeDark);
  }

  /* -------------------------------------------------------------- roof */
  var r0 = R(spec.roof[0]), r1 = R(spec.roof[1]);
  for(y=r0;y<=r1;y++){
    var rh2 = halfAt(y) - 2;
    for(x=Math.round(cx-rh2); x<=Math.round(cx+rh2); x++){
      var dd = x-cx;
      /* the roof is the highest panel, so it takes the brightest ramp */
      var rc = dd < -rh2*0.62 ? pal.roofHi : (dd < rh2*0.42 ? pal.roof : pal.lite);
      set(x, y, rc);
    }
    set(cx-rh2-1, y, pal.hi);                                 /* lit gutter */
    set(cx+rh2+1, y, pal.deep);                               /* shaded gutter */
  }
  /* roof vents — the pair of dark slots the reference car carries */
  if(spec.roofVent){
    var mid = Math.round((r0+r1)/2);
    for(var rv=0; rv<spec.roofVent; rv++){
      var ry2 = mid - 1 + rv*4;
      for(var rx=-1; rx<=1; rx++) set(cx+rx, ry2, pal.vent);
      set(cx-2, ry2, pal.roofHi); set(cx+2, ry2, pal.deep);
    }
  }
  if(spec.lightBar){                                          /* roof scoop */
    for(x=-2;x<=2;x++){ set(cx+x, r0+1, pal.chromeDark); set(cx+x, r0+2, pal.black); }
  }

  /* -------------------------------------------------------- rear window */
  var b0 = R(spec.rear[0]), b1 = R(spec.rear[1]);
  for(y=b0;y<=b1;y++){
    var bh = halfAt(y) - 3.2 - (y === b1 ? 1 : 0);
    for(x=Math.round(cx-bh); x<=Math.round(cx+bh); x++) set(x, y, glassBand(pal, x-cx, bh));
  }

  /* -------------------------------------------------------------- boot */
  var k0 = R(spec.boot[0]), k1 = R(spec.boot[1]);
  for(y=k0;y<=k1;y++){
    set(cx-halfAt(y)+1.5, y, pal.darker);
    set(cx+halfAt(y)-1.5, y, pal.deep);
  }
  /* spoiler: a raised blade across the tail, standing proud of the boot */
  if(spec.spoiler > 0){
    var sy = k1 - 1, sw = Math.round(halfAt(sy)*spec.spoiler + 1);
    row(sy-1, cx-sw, cx+sw, pal.hi);
    row(sy,   cx-sw, cx+sw, pal.dark);
    row(sy+1, cx-sw, cx+sw, pal.deep);
  }

  /* ------------------------------------------------ shut lines and sills */
  var doorTop = R(spec.screen[1]) + 1, doorBot = R(spec.rear[0]) - 1;
  for(s=-1;s<=1;s+=2){
    var sh2 = 0;
    /* the sill: a dark edge running the length of the cabin, which gives the
       body its rolled shoulder */
    for(y=R(spec.screen[0]); y<=R(spec.rear[1]); y++){
      sh2 = halfAt(y);
      set(cx + s*(sh2 - 0.5), y, s < 0 ? pal.lite : pal.deep);
    }
    /* two shut lines, front door and rear */
    var midDoor = Math.round((doorTop + doorBot)/2);
    for(var dy=doorTop; dy<=doorBot; dy++){
      if(dy !== midDoor) continue;
      for(var dw=2; dw<Math.round(halfAt(dy)); dw++) set(cx + s*dw, dy, pal.darker);
    }
  }

  /* ------------------------------------------------------------ mirrors */
  var my = R(spec.mirror);
  for(s=-1;s<=1;s+=2){
    var mh = halfAt(my);
    set(cx + s*(mh+1), my, pal.black);
    set(cx + s*(mh+2), my, s<0 ? pal.chromeDark : pal.black);
    set(cx + s*(mh+1), my+1, pal.deep);
  }

  /* ------------------------------------------------- lamps front and rear */
  var ly = 1, lh = halfAt(ly);
  for(s=-1;s<=1;s+=2){
    for(var lx=2; lx<=3; lx++){
      var hx = Math.round(cx + s*(lh - lx + 0.5));
      set(hx, ly, pal.lamp); set(hx, ly+1, pal.lampHot);
      lamps.head.push([hx, ly+1]);
    }
  }
  var ty = ph-2, th = halfAt(ty);
  for(s=-1;s<=1;s+=2){
    for(var tx=2; tx<=4; tx++){
      var rx2 = Math.round(cx + s*(th - tx + 0.5));
      set(rx2, ty, pal.tail); set(rx2, ty-1, pal.tailDark);
      lamps.tail.push([rx2, ty]);
      lamps.brake.push([rx2, ty-1]);
    }
  }

  /* ------------------------------------------------------------- livery */
  if(livery && liveryAt){
    for(y=0;y<ph;y++){
      var lhw = halfAt(y);
      for(x=0;x<pw;x++){
        var cur = buf[y*pw+x];
        if(cur !== pal.body && cur !== pal.lite && cur !== pal.dark &&
           cur !== pal.roof && cur !== pal.roofHi && cur !== pal.hi) continue;
        var lc = liveryAt(livery, x, y, pw, ph, pal.accent, lhw);
        if(lc) buf[y*pw+x] = lc;
      }
    }
  }

  /* ------------------------------- specular: a short catch along the
     top-left shoulder, the highlight a glossy panel throws under a low sun */
  for(y=Math.round(ph*0.12); y<Math.round(ph*0.88); y++){
    var sh = halfAt(y);
    var px2 = Math.round(cx - sh + 1);
    if(buf[y*pw+px2] && buf[y*pw+px2] !== pal.black) buf[y*pw+px2] = pal.spec;
  }

  /* -------------------------------------------------------------- damage */
  if(dmg >= 1){
    /* cracked screen */
    var cy = Math.round((s0+s1)/2);
    for(i=-3;i<=3;i++) set(cx+i, cy + (i&1), pal.crack);
    set(cx-2, cy-1, pal.crack); set(cx+2, cy+1, pal.crack);
  }
  if(dmg >= 2){
    var dents = [[0.14,-0.8],[0.72,0.85],[0.90,-0.6],[0.30,0.9]];
    for(i=0;i<dents.length;i++){
      var dy = R(dents[i][0]), dh = halfAt(dy);
      var dx = Math.round(cx + dents[i][1]*dh);
      set(dx, dy, pal.scorch); set(dx, dy+1, pal.scorch);
      set(dx - Math.sign(dents[i][1]), dy, pal.dent);
    }
  }

  return { buf:buf, pw:pw, ph:ph, lamps:lamps };
}

/* Paint a colour buffer into a fresh canvas at `scale` device pixels per
   sprite pixel. Runs of equal colour become a single fill. */
function paint(b, scale){
  var cv = document.createElement('canvas');
  cv.width = b.pw*scale; cv.height = b.ph*scale;
  var g = cv.getContext('2d');
  g.imageSmoothingEnabled = false;
  for(var y=0;y<b.ph;y++){
    var x = 0;
    while(x < b.pw){
      var c = b.buf[y*b.pw+x];
      if(!c){ x++; continue; }
      var run = 1;
      while(x+run < b.pw && b.buf[y*b.pw+x+run] === c) run++;
      g.fillStyle = c;
      g.fillRect(x*scale, y*scale, run*scale, scale);
      x += run;
    }
  }
  return cv;
}

/* A hard pixel silhouette, used as the car's ground shadow. */
function paintShadow(b, scale, col){
  var cv = document.createElement('canvas');
  cv.width = b.pw*scale; cv.height = b.ph*scale;
  var g = cv.getContext('2d');
  g.imageSmoothingEnabled = false;
  g.fillStyle = col;
  for(var y=0;y<b.ph;y++){
    var x = 0;
    while(x < b.pw){
      if(!b.buf[y*b.pw+x]){ x++; continue; }
      var run = 1;
      while(x+run < b.pw && b.buf[y*b.pw+x+run]) run++;
      g.fillRect(x*scale, y*scale, run*scale, scale);
      x += run;
    }
  }
  return cv;
}

/* =========================================================================
   Public entry. `pal` is the game's car palette, extended here with the few
   extra shades this renderer needs so callers keep one palette function.
   ========================================================================= */
export function renderCarTop(spriteName, pal, livery, liveryAt, damageTier, scale){
  var spec = carSpec(spriteName);
  var b = buildBuffer(spec, pal, livery, liveryAt, damageTier||0);
  scale = scale || 1;
  return {
    canvas: paint(b, scale),
    shadow: paintShadow(b, scale, 'rgba(6,10,6,.42)'),
    w: spec.pw*scale, h: spec.ph*scale,
    pw: spec.pw, ph: spec.ph, scale: scale,
    lamps: b.lamps, spec: spec
  };
}
