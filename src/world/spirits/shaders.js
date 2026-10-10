// GLSL for the sky spirits. One vertex shader animates every part (bell pulse, trailing
// filaments, frilly arms, comb jelly spin, camera facing glows) from per-instance attributes; one
// fragment shader paints them: an alpha blended "pearly glass" layer that refracts the sky by day
// and an emissive layer that carries the glow at night. Output is premultiplied: rgb already
// holds alpha * color + emission, so day and night share one blend state.
//
// Per-instance attributes (see Spirits.js for how they are filled):
//   iPos   (x, y, z, yaw)             world position of the bell center and heading
//   iShape (scale, phase, rate, fade) meters per bell radius, pulse phase 0..1, pulses per second
//   iVar   (tentacle fraction, tentacle length mult, seed, brightness)
//   iDrag  (dx, dy, dz, pitch)        trailing direction (world, unit-ish) and body pitch
//   iCol0, iCol1                      body tint and inner light color (linear)
import { FOG_UNIFORMS_GLSL, FOG_FUNCS_GLSL } from '../../render/fogChunk.js';

export const VERT = /* glsl */ `
#define TAU 6.2831853
uniform float uTime;
uniform float uKind;     // 0 medusa, 1 comb jelly
uniform vec4 uP0;        // pulse amplitude, pulse lag along v, lobe count, lobe amplitude
uniform vec4 uP1;        // frill amplitude, frill count, sway, margin lift
uniform vec4 uP2;        // tentacle lag, arm sway, arm twist, ruffle amplitude
uniform vec4 uP3;        // squareness, skirt height, skirt flare, coil
uniform vec4 uP4;        // rib height, rib count
uniform vec4 uS;         // time scale of the slow motion (the big ones are slow), pulse glow
uniform vec4 uM;         // (unused, share of the contraction along the length, pulse lag per bell radius along x, unused)
uniform float uPixelScale;
uniform float uMinPx;

attribute vec4 aInfo;
attribute vec4 aAux;
attribute vec4 iPos;
attribute vec4 iShape;
attribute vec4 iVar;
attribute vec4 iDrag;
attribute vec3 iCol0;
attribute vec3 iCol1;

// centroid: with MSAA a sample outside a thin triangle would otherwise extrapolate these and
// produce wild negative colors (speckles) on far, sub-pixel ribbons.
centroid varying vec4 vInfo;
centroid varying vec4 vAux2;
centroid varying vec3 vWorld;
centroid varying vec3 vNormal;
varying vec3 vC0;
varying vec3 vC1;
varying vec4 vInst;

float gPh;
float gSeed;
float tm;
vec3 gDragL;

float pulseWave(float p) {
  float up = smoothstep(0.0, 1.0, p / 0.26);
  float dn = pow(1.0 - smoothstep(0.0, 1.0, (p - 0.26) / 0.74), 1.5);
  return p < 0.26 ? up : dn;
}

mat3 orient(float yaw, float pitch) {
  float cy = cos(yaw), sy = sin(yaw), cp = cos(pitch), sp = sin(pitch);
  mat3 Ry = mat3(cy, 0.0, -sy, 0.0, 1.0, 0.0, sy, 0.0, cy);
  mat3 Rx = mat3(1.0, 0.0, 0.0, 0.0, cp, sp, 0.0, -sp, cp);
  return Ry * Rx;
}

// Bell: contraction narrows the margin most, lengthens the bell a little and lifts the margin.
vec3 bellDeform(vec3 rest, float v, float theta, out float c, out vec2 scl) {
  c = pulseWave(fract(gPh - uP0.y * v - uM.z * rest.x)) * uP0.x;
  float w = v * v;
  float sr = 1.0 - c * (0.16 + 0.84 * w);
  float sy = 1.0 + 0.30 * c * (1.0 - v);
  float m = smoothstep(0.55, 1.0, v);
  float y = rest.y * sy + c * uP1.w * w;
  y += uP0.w * cos(theta * uP0.z) * m * (1.0 - 0.6 * c);
  y += uP1.x * sin(theta * uP1.y + tm * 1.3 + gSeed * 20.0) * m * m;
  float sq = 1.0 + uP3.x * (0.5 - 0.5 * cos(4.0 * theta)) * smoothstep(0.05, 0.4, v);
  sr *= sq;
  // raised ribs (flying buttresses on the cathedral), aligned with the canals and panes
  sr *= 1.0 + uP4.x * pow(max(0.0, cos(theta * uP4.y)), 5.0) * smoothstep(0.04, 0.3, v) * (1.0 - smoothstep(0.88, 1.0, v));
  sr += 0.012 * sin(theta * 3.0 + tm * 0.8 + gSeed * 9.0) * m;
  scl = vec2(sr, sy);
  return vec3(rest.x * mix(1.0, sr, uM.y), y, rest.z * sr);
}

// Comb jelly body: no pulse, a slow spin and a faint breathing.
vec3 combBody(vec3 rest, float theta, float v, out float c, out vec2 scl, out float spin) {
  spin = tm * 0.28 * (0.6 + 0.8 * gSeed) + gSeed * 6.2831;
  float wob = 1.0 + 0.035 * sin(tm * 1.2 + v * 7.0 + gSeed * 12.0);
  float r = length(rest.xz) * wob;
  float th = theta + spin;
  c = 0.0;
  scl = vec2(wob, 1.0);
  return vec3(cos(th) * r, rest.y, sin(th) * r);
}

// Long tentacle path in bell units. s 0 root .. 1 tip.
vec3 tentPath(vec3 root, float theta, float s, float rnd, float L) {
  float d = s * L;
  float cw = pulseWave(fract(gPh - 0.05 - s * uP2.x - uM.z * root.x)) * uP0.x;
  vec2 rad = vec2(cos(theta), sin(theta));
  vec3 P = root;
  P.y -= d * (1.0 - 0.16 * cw);
  P.xz += rad * (0.10 + 0.30 * (0.45 - cw)) * min(d, 1.6) * 0.6;
  float a1 = tm * 0.8 + rnd * 40.0 + gSeed * 30.0 - s * 4.2;
  float a2 = tm * 0.55 + rnd * 25.0 + gSeed * 17.0 - s * 3.1;
  float amp = uP1.z * pow(s, 1.4) * 0.22 * clamp(L, 0.6, 3.5);
  P.xz += vec2(sin(a1), sin(a2)) * amp;
  float ca = s * 11.0 - tm * 0.9 + rnd * 6.0;
  P.xz += vec2(cos(ca), sin(ca)) * uP3.w * s * min(L, 3.0);
  P.xz += gDragL.xz * d * d * 0.05;
  return P;
}

// Oral arm path; also returns the direction the ribbon is wide in.
vec3 armPath(vec3 root, float ang, float tang, float s, float L, float rnd, out vec3 wdir) {
  float d = s * L;
  float cw = pulseWave(fract(gPh - 0.06 - s * uP2.x * 0.8 - uM.z * root.x)) * uP0.x;
  vec3 P = root;
  P.y -= d * (1.0 - 0.12 * cw);
  vec2 dir = vec2(cos(ang), sin(ang));
  P.xz += dir * 0.10 * s * min(L, 3.0) * (1.0 + 0.6 * (0.45 - cw));
  float a1 = tm * 0.6 + ang * 3.0 - s * 3.0 + gSeed * 20.0;
  float a2 = tm * 0.45 + ang * 2.0 - s * 2.6 + gSeed * 13.0;
  P.xz += vec2(sin(a1), sin(a2)) * uP2.y * 0.12 * s * s * min(L, 3.0);
  P.xz += gDragL.xz * d * d * 0.04;
  float tw = ang + tang + s * uP2.z + 0.5 * sin(tm * 0.35 + rnd * 6.28 + s * 2.0);
  wdir = vec3(cos(tw), 0.0, sin(tw));
  return P;
}

vec3 toWorld(mat3 M, float S, vec3 l) { return iPos.xyz + M * (l * S); }

void main() {
  float part = aInfo.x;
  float u = aInfo.y;
  float v = aInfo.z;
  float rnd = aInfo.w;
  gSeed = iVar.z;
  gPh = fract(uTime * iShape.z + iShape.y);
  tm = uTime * uS.x;
  float S = iShape.x * (0.8 + 0.2 * iShape.w);
  mat3 M = orient(iPos.w, iDrag.w);
  gDragL = transpose(M) * iDrag.xyz;
  vec3 camR = vec3(viewMatrix[0][0], viewMatrix[1][0], viewMatrix[2][0]);
  vec3 camU = vec3(viewMatrix[0][1], viewMatrix[1][1], viewMatrix[2][1]);

  vec3 wp = iPos.xyz;
  vec3 wn = vec3(0.0, 1.0, 0.0);
  vec4 ax = vec4(0.0);
  float c = 0.0;
  vec2 scl = vec2(1.0);
  bool hidden = false;

  if (part < 0.5) {
    // ---- bell or body surface
    float theta = u * TAU;
    vec3 lp;
    vec3 ln;
    if (uKind > 0.5) {
      float spin;
      lp = combBody(position, theta, v, c, scl, spin);
      ln = normalize(vec3(normal.x / scl.x, normal.y, normal.z / scl.x));
      float cs = cos(spin), sn = sin(spin);
      ln = vec3(ln.x * cs - ln.z * sn, ln.y, ln.x * sn + ln.z * cs);
    } else {
      lp = bellDeform(position, v, theta, c, scl);
      ln = normalize(vec3(normal.x / mix(1.0, scl.x, uM.y), normal.y / scl.y, normal.z / scl.x));
    }
    wp = toWorld(M, S, lp);
    wn = M * ln;
    ax.w = c;
  } else if (part < 1.5) {
    // ---- frilled hem below the margin
    float theta = u * TAU;
    vec3 lp = bellDeform(position, 1.0, theta, c, scl);
    float q = v;
    vec2 radial = normalize(normal.xz + vec2(1e-5, 0.0));
    float w1 = sin(theta * uP1.y * 2.0 + tm * 1.7 + q * 2.5 + gSeed * 30.0);
    float w2 = sin(theta * uP1.y * 3.3 - tm * 1.1 + q * 1.7 + gSeed * 11.0);
    lp.xz += radial * (q * uP3.z * (1.0 - 0.4 * c) + (w1 * 0.5 + w2 * 0.3) * uP2.w * q);
    lp.y -= q * uP3.y * (1.0 - 0.35 * c) + w2 * uP2.w * 0.5 * q * q;
    wp = toWorld(M, S, lp);
    wn = M * normalize(vec3(radial.x, 0.3, radial.y));
    ax = vec4(0.0, q, 0.0, c);
  } else if (part < 2.5) {
    // ---- glow quad
    float cl = 0.0;
    vec3 lp = uKind > 0.5 ? position : bellDeform(position, 0.35, 0.0, cl, scl);
    c = cl;
    vec3 wc = toWorld(M, S, lp);
    float sz = aAux.z * (0.9 + 0.2 * (1.0 - c)) * S;
    wp = wc + (camR * aAux.x + camU * aAux.y) * sz;
    wn = normalize(cameraPosition - wp);
    ax = vec4(aAux.x, aAux.y, aAux.w, c);
  } else if (part < 3.5) {
    // ---- gonad ring on the subumbrella
    float theta = atan(position.z, position.x);
    vec3 lp = bellDeform(position, v, theta, c, scl);
    wp = toWorld(M, S, lp);
    wn = M * vec3(0.0, 1.0, 0.0);
    ax = vec4(aAux.x, aAux.y, rnd, c);
  } else if (part < 4.5) {
    // ---- oral arm ribbon
    float ang = u * TAU;
    float cl;
    vec3 root = bellDeform(position, aAux.z, ang, cl, scl);
    float L = aAux.w * iVar.y;
    float tang = normal.x;
    float wid = aAux.y;
    float s = v;
    vec3 wd;
    vec3 P = armPath(root, ang, tang, s, L, rnd, wd);
    float s2 = min(s + 0.04, 1.0), s1 = max(s2 - 0.04, 0.0);
    vec3 wd2;
    vec3 Pa = armPath(root, ang, tang, s1, L, rnd, wd2);
    vec3 Pb = armPath(root, ang, tang, s2, L, rnd, wd2);
    vec3 T = normalize(Pb - Pa + vec3(0.0, -1e-4, 0.0));
    vec3 Nn = normalize(cross(T, wd));
    float hw = wid * (1.0 - 0.7 * s) * (0.55 + 0.45 * smoothstep(0.0, 0.25, s));
    float x = aAux.x;
    float rph = s * L * 5.0 + x * 2.3 + rnd * 6.0 + tm * 0.9;
    float rf = uP2.w * 1.6 * (sin(rph) + 0.35 * sin(rph * 2.3 + 1.7)) * x * x * smoothstep(0.0, 0.2, s);
    P += wd * x * hw * (1.0 + 0.12 * sin(s * L * 5.0 + rnd * 9.0)) + Nn * rf;
    wp = toWorld(M, S, P);
    wn = normalize(cameraPosition - wp);
    ax = vec4(x, s, 0.0, cl);
  } else if (part < 7.5) {
    // ---- filaments: tentacles (5), pinnules (6), gut tube (7)
    float s = v;
    float theta = u * TAU;
    float side = aAux.x;
    float widR = aAux.y;
    float cl = 0.0;
    float spin = 0.0;
    vec3 root = position;
    if (uKind > 0.5) {
      // comb jelly: roots ride on the spinning body
      spin = tm * 0.28 * (0.6 + 0.8 * gSeed) + gSeed * 6.2831;
      float cs = cos(spin), sn = sin(spin);
      root = vec3(position.x * cs - position.z * sn, position.y, position.x * sn + position.z * cs);
      theta += spin;
    } else {
      root = bellDeform(position, part > 6.5 ? 0.3 : (part < 5.5 ? normal.y : 1.0), theta, cl, scl);
    }
    vec3 P;
    vec3 Pn;
    float ds = 0.03;
    float sa = max(s - ds, 0.0), sb = min(s + ds, 1.0);
    if (part < 5.5) {
      float lenR = aAux.w * iVar.y;
      if (aAux.z > iVar.x) hidden = true;
      P = tentPath(root, theta, s, rnd, lenR);
      Pn = tentPath(root, theta, sb, rnd, lenR) - tentPath(root, theta, sa, rnd, lenR);
      widR *= 1.0 - 0.55 * s;
    } else if (part < 6.5) {
      // pinnule: sprouts sideways from its parent tentacle at aAux.z
      float parentLen = normal.x * iVar.y;
      if (normal.z > iVar.x) hidden = true;
      vec3 origin = tentPath(root, theta, aAux.z, rnd, parentLen);
      vec3 dirv = normalize(vec3(cos(normal.y), -0.6, sin(normal.y)));
      float len = aAux.w;
      vec3 flutter = vec3(sin(tm * 1.3 + normal.y * 9.0 + s * 3.0), 0.0, cos(tm * 1.1 + normal.y * 7.0 + s * 3.0));
      P = origin + dirv * (s * len) + vec3(0.0, -s * s * 0.05 * len, 0.0) + flutter * 0.06 * s * len;
      Pn = dirv * len + vec3(0.0, -s * 0.1 * len, 0.0);
      widR *= 1.0 - 0.6 * s;
    } else {
      // gut tube: straight down the axis with a faint sway
      float lenR = aAux.w;
      P = root + vec3(sin(tm * 0.5 + s * 2.0 + gSeed * 9.0) * 0.03 * s, -s * lenR * (1.0 - 0.1 * cl), cos(tm * 0.42 + s * 2.0) * 0.03 * s);
      Pn = vec3(0.0, -1.0, 0.0);
      widR *= 1.0 - 0.45 * s;
    }
    if (part < 6.5) widR *= 2.2;
    vec3 Pw = toWorld(M, S, P);
    vec3 Tw = normalize(M * Pn + vec3(0.0, -1e-5, 0.0));
    vec3 toCam = normalize(cameraPosition - Pw);
    vec3 B = normalize(cross(Tw, toCam));
    float dist = length(Pw - cameraPosition);
    float wM = widR * S;
    float wMin = uMinPx * dist / uPixelScale;
    float wUse = max(wM, wMin);
    wp = Pw + B * side * wUse;
    wn = toCam;
    ax = vec4(side, s, clamp(wM / max(wUse, 1e-5), 0.0, 1.0), cl);
  }

  vInfo = aInfo;
  vAux2 = ax;
  vWorld = wp;
  vNormal = wn;
  vC0 = iCol0;
  vC1 = iCol1;
  vInst = vec4(iVar.w, iShape.w, iVar.z, gPh);
  gl_Position = hidden ? vec4(2.0, 2.0, 2.0, 1.0) : projectionMatrix * viewMatrix * vec4(wp, 1.0);
}
`;

export const FRAG = /* glsl */ `
#define TAU 6.2831853
${FOG_UNIFORMS_GLSL}
${FOG_FUNCS_GLSL}
uniform float uTime;
uniform vec4 uS;         // time scale, pulse glow, iridescence, ivory tint
uniform vec4 uM;         // body mode: y 1 round bell, 0 long vault
uniform float uKind;
uniform float uInvExp;   // 1 / exposure: emission is authored in display units
uniform float uDark;     // 0 day .. 1 night
uniform float uGlowGain; // overall glow strength
uniform float uBright;   // species brightness
uniform vec3 uHor;
uniform vec3 uZen;
uniform vec3 uGround;
uniform vec3 uLightDir;
uniform vec3 uSkyGlow;
uniform vec4 uF0;        // canal count, canal width, gonad intensity, spot amount
uniform vec4 uF1;        // comb rows, ring canal, rim power, body opacity
uniform vec4 uF2;        // interior glow (front, back), stained panes, gonad band
uniform vec4 uF3;        // glow gain of: panes, arms and veils, filaments, halo
uniform vec3 uPane0;
uniform vec3 uPane1;
uniform vec3 uPane2;
uniform vec3 uPane3;

// centroid: with MSAA a sample outside a thin triangle would otherwise extrapolate these and
// produce wild negative colors (speckles) on far, sub-pixel ribbons.
centroid varying vec4 vInfo;
centroid varying vec4 vAux2;
centroid varying vec3 vWorld;
centroid varying vec3 vNormal;
varying vec3 vC0;
varying vec3 vC1;
varying vec4 vInst;

float hash12(vec2 p) {
  vec3 p3 = fract(vec3(p.xyx) * 0.1031);
  p3 += dot(p3, p3.yzx + 33.33);
  return fract((p3.x + p3.y) * p3.z);
}
vec3 hsv2rgb(vec3 c) {
  vec3 p = abs(fract(c.xxx + vec3(0.0, 0.6667, 0.3333)) * 6.0 - 3.0);
  return c.z * mix(vec3(1.0), clamp(p - 1.0, 0.0, 1.0), c.y);
}
float pulseWave(float p) {
  float up = smoothstep(0.0, 1.0, p / 0.26);
  float dn = pow(1.0 - smoothstep(0.0, 1.0, (p - 0.26) / 0.74), 1.5);
  return p < 0.26 ? up : dn;
}
vec3 pastel(vec3 c) { return mix(c, vec3(1.0), 0.42); }

vec3 skyCol(vec3 d) {
  float h = d.y;
  vec3 s = mix(uHor, uZen, pow(max(h, 0.0), 0.5));
  s = mix(s, uGround, smoothstep(0.0, -0.3, h));
  float mu = max(dot(d, uLightDir), 0.0);
  s += uSkyGlow * (pow(mu, 5.0) * 0.45 + pow(mu, 40.0) * 1.2);
  return s;
}

float tm;
void main() {
  tm = uTime * uS.x;
  int part = int(vInfo.x + 0.5);
  float u = vInfo.y;
  float v = vInfo.z;
  float rnd = vInfo.w;
  vec3 Vw = normalize(cameraPosition - vWorld);
  vec3 N = vNormal;
  float nlen = length(N);
  N = nlen > 1e-4 ? N / nlen : Vw;
  // Facing by the sign of N.V rather than winding: the shell is double sided.
  bool back = dot(N, Vw) < 0.0;
  if (back) N = -N;
  float ndv = clamp(dot(N, Vw), 0.0, 1.0);
  float rim = pow(1.0 - ndv, uF1.z);
  vec3 c0 = vC0;
  vec3 c1 = vC1;
  float bright = vInst.x * uBright;
  float ph = vInst.w;
  float seed = vInst.z;
  float cont = vAux2.w;

  vec3 em = vec3(0.0);   // emission, display units
  vec3 T = vec3(0.0);    // day layer color, radiance
  float a = 0.0;         // day layer alpha

  vec3 refr = refract(-Vw, N, 0.80);
  vec3 skyR = skyCol(normalize(refr + vec3(0.0, 1e-4, 0.0)));
  vec3 skyB = skyCol(-Vw);
  // Surfaces that reflect light scale with how bright the sky is; emission does not.
  float lit = clamp(dot(skyB, vec3(0.3, 0.59, 0.11)) * 1.15, 0.0, 1.0);
  vec3 pearl = 0.55 + 0.45 * cos(TAU * (vec3(0.0, 0.33, 0.67) + ndv * 1.1 + u * 0.15 + seed));
  pearl = mix(vec3(1.0), pearl, uS.z) * lit * mix(vec3(1.0), c0 * 1.12, uS.w);
  vec3 spark = vec3(1.0, 0.97, 0.9);
  float glint = pow(max(dot(reflect(-Vw, N), uLightDir), 0.0), 70.0) * lit;

  if (part == 0) {
    if (uKind > 0.5 && uKind < 1.5) {
      // ---- comb jelly body: clear glass with eight rows of beating combs and a rainbow that travels
      float rows = uF1.x;
      float cu = fract(u * rows + 0.5) - 0.5;
      float rowId = floor(u * rows + 0.5);
      float lenMask = smoothstep(0.07, 0.18, v) * smoothstep(0.99, 0.82, v);
      float row = smoothstep(0.12, 0.015, abs(cu)) * lenMask;
      float wave = v * 24.0 - tm * 8.0 + rowId * 1.3 + seed * 30.0;
      float beat = pow(0.5 + 0.5 * sin(wave), 2.0);
      float hue = fract(v * 1.3 - tm * 0.25 + rowId * 0.05 + seed);
      vec3 rb = hsv2rgb(vec3(hue, 0.62, 1.0));
      a = (0.04 + 0.34 * rim) * uF1.w + row * (0.2 + 0.42 * beat);
      T = mix(skyR * mix(vec3(1.0), c0, 0.4), pearl * 1.05, rim * 0.8);
      T = mix(T, pastel(rb) * lit, row * (0.4 + 0.5 * beat));
      T += spark * glint * 0.8;
      em = c0 * (0.03 + 0.55 * rim) * bright;
      em += rb * row * (0.45 + 1.7 * beat) * bright;
      em += c1 * smoothstep(0.1, 0.0, v) * 1.2 + c1 * 0.05 * (1.0 - v);
      if (back) { em *= 0.6; a *= 0.7; }
    } else {
      // ---- medusa bell
      float cn = uF0.x;
      float cph = fract(u * cn + 0.5) - 0.5;
      float cu = abs(cph);
      float cw = uF0.y * (1.0 - 0.35 * v);
      float canal = pow(smoothstep(cw, 0.0, cu), 1.4) * smoothstep(0.03, 0.14, v) * (1.0 - smoothstep(0.93, 1.0, v));
      float ring = smoothstep(0.014, 0.0, abs(v - 0.955)) * uF1.y;
      float beads = pow(max(0.0, cos(u * cn * 2.0 * TAU)), 18.0) * smoothstep(0.925, 0.95, v) * (1.0 - smoothstep(0.97, 0.985, v));
      float flash = pulseWave(fract(ph - 0.04 - v * 0.2));
      float flow = 0.5 + 0.5 * pow(0.5 + 0.5 * sin(v * 16.0 - tm * 1.7 + u * cn * 2.0 + seed * 9.0), 2.0);
      float glimmer = mix(0.55, 1.0, flash) * flow;
      vec2 cell = vec2(u * 46.0, v * 17.0);
      float hs = hash12(floor(cell));
      float spot = smoothstep(0.30, 0.0, length(fract(cell) - 0.5)) * step(0.78, hs) * uF0.w * smoothstep(0.1, 0.3, v);
      float inner = pow(1.0 - v, 1.6);
      // gonad bands: a broad glowing stripe along each canal through the middle of the bell
      float band = smoothstep(cw * 3.2, 0.0, cu) * smoothstep(0.3, 0.42, v) * (1.0 - smoothstep(0.68, 0.8, v)) * uF2.w;
      // stained panes between the ribs (cathedral): pointed windows lit from within
      float pane = 0.0;
      float paneFrame = 0.0;
      vec3 paneCol = vec3(0.0);
      if (uF2.z > 0.0) {
        float x = cph * 2.0;
        float capD = uM.y > 0.5 ? 0.5 : min(u, 1.0 - u);
        float tip = 0.36 + 0.22 * pow(abs(x), 1.2);
        float capK = smoothstep(0.1, 0.15, capD);
        float w1 = smoothstep(tip, tip + 0.012, v) * (1.0 - smoothstep(0.9, 0.915, v)) * (1.0 - smoothstep(0.78, 0.84, abs(x))) * capK;
        float tip2 = tip + 0.03;
        float w2 = smoothstep(tip2, tip2 + 0.012, v) * (1.0 - smoothstep(0.885, 0.9, v)) * (1.0 - smoothstep(0.7, 0.76, abs(x))) * capK;
        float ph2 = hash12(vec2(floor(u * cn), seed * 17.0));
        float ph3 = hash12(vec2(floor(u * cn) + 3.0, floor(v * 5.0) + seed * 9.0));
        paneCol = ph2 < 0.25 ? uPane0 : ph2 < 0.5 ? uPane1 : ph2 < 0.75 ? uPane2 : uPane3;
        paneCol = mix(paneCol, ph3 < 0.5 ? uPane0 : uPane2, 0.25 * step(0.5, fract(v * 5.0 + ph2)));
        float tw = 0.65 + 0.35 * sin(tm * (0.3 + ph2 * 0.6) + ph2 * 40.0 + v * 4.0);
        pane = w2 * tw * uF2.z;
        paneFrame = max(w1 - w2, 0.0) * uF2.z;
        // rib lines
        paneFrame += smoothstep(0.03, 0.0, abs(abs(cph) - 0.5)) * smoothstep(0.1, 0.25, v) * (1.0 - smoothstep(0.9, 1.0, v)) * uF2.z * 0.8;
        // rose window in the vault above: leaf shaped glass between stone tracery, rings of cells
        // that alternate by half a step, a bright boss at the center
        float rv = uM.y > 0.5 ? v / 0.33 : capD / 0.12;
        // around the rose: the long body wraps it by side (rnd) and distance from the ridge (v)
        float roseA = uM.y > 0.5 ? u : (rnd < 0.5 ? 0.5 * v : 1.0 - 0.5 * v);
        if (rv < 1.0) {
          float petals = uM.y > 0.5 ? cn : 16.0;
          float rings = 3.0;
          float rf0 = rv * rings;
          float rid = floor(rf0);
          float rf = fract(rf0);
          float tsh = roseA * petals + 0.5 * mod(rid, 2.0);
          float sf = fract(tsh);
          float sid = floor(tsh) + rid * 7.0;
          float spokeD = min(sf, 1.0 - sf);
          float thr = 0.07 + 0.13 * abs(rf - 0.5);
          float cell = smoothstep(thr, thr + 0.05, spokeD) * smoothstep(0.05, 0.12, rf) * smoothstep(0.05, 0.12, 1.0 - rf);
          cell *= smoothstep(0.07, 0.13, rv);
          float rh = hash12(vec2(sid, seed * 13.0 + rid));
          vec3 rc = rh < 0.25 ? uPane0 : rh < 0.5 ? uPane1 : rh < 0.75 ? uPane2 : uPane3;
          float tw2 = 0.7 + 0.3 * sin(tm * (0.4 + rh * 0.7) + rh * 50.0);
          float roseG = cell * tw2 * uF2.z * 1.15;
          float lines = (1.0 - cell) * smoothstep(0.07, 0.13, rv);
          float boss = smoothstep(0.1, 0.0, rv);
          paneCol = mix(paneCol, rc, step(0.001, cell));
          pane = max(pane, roseG);
          paneFrame = max(paneFrame, lines * uF2.z * 0.85 + boss * uF2.z);
        }
      }
      float thick = 0.35 + 0.65 * rim;
      a = (0.06 + 0.42 * rim) * uF1.w + 0.22 * uS.w * (1.0 - 0.5 * rim) + canal * 0.24 + ring * 0.3 + spot * 0.22 + beads * 0.3 + band * 0.18 + pane * 0.3 + paneFrame * 0.3;
      vec3 body = mix(skyR * mix(vec3(1.0), c0, 0.4), c0 * lit * 1.05, uS.w * 0.8);
      T = mix(body, pearl * 1.05, clamp(rim * 1.3, 0.0, 1.0));
      T = mix(T, pastel(c1) * lit * (0.75 + 0.25 * skyB), clamp(canal * 0.5 + ring * 0.55 + beads * 0.6 + band * 0.5, 0.0, 1.0));
      T = mix(T, pastel(paneCol) * lit, clamp(pane * 0.7 + paneFrame * 0.4, 0.0, 1.0));
      T += spark * (spot * 0.5 * lit + glint * 0.9);
      em = c0 * (0.025 + 0.9 * rim) * bright;
      em += c1 * canal * (0.35 + 1.1 * glimmer) * bright;
      em += mix(c0, c1, 0.5) * ring * 0.9 * bright;
      em += mix(c1, spark, 0.5) * beads * 1.8 * bright;
      em += c1 * band * (0.5 + 0.7 * glimmer) * bright;
      em += (paneCol * pane * 1.1 + mix(c0, spark, 0.5) * paneFrame * 0.8) * bright * uF3.x;
      em += spark * spot * 0.5 * bright;
      em += c1 * inner * (back ? uF2.y : uF2.x) * bright;
      if (back) { em *= 0.65; a *= 0.75; }
    }
  } else if (part == 1) {
    // ---- frilled hem: lace that brightens toward its edge
    float q = v;
    float lace = 0.55 + 0.45 * sin(u * 220.0 + q * 3.0 + seed * 40.0);
    float edge = smoothstep(0.5, 1.0, q);
    float fade = (1.0 - 0.5 * q);
    a = (0.12 + 0.14 * edge) * fade * uF1.w * 2.0;
    T = mix(skyR * mix(vec3(1.0), c0, 0.5), pearl * 1.1, 0.4 + 0.5 * edge);
    em = mix(c0, c1, 0.3 + 0.5 * edge) * (0.12 + 0.95 * edge * lace) * fade * bright;
  } else if (part == 2) {
    // ---- glow quad
    float d = length(vAux2.xy);
    float breathe = 0.8 + 0.3 * (1.0 - cont) + 0.15 * sin(tm * 0.9 + seed * 20.0);
    if (vAux2.z > 0.5) {
      // wide faint halo: the light spilling into the air, a night effect
      float h = exp(-d * d * 4.0) * (1.0 - smoothstep(0.75, 1.0, d));
      em = mix(c0, c1, 0.5) * h * rnd * breathe * bright * (0.35 + 0.65 * uDark) * uF3.w;
      a = 0.0;
    } else {
      float g = exp(-d * d * 4.5) * (1.0 - smoothstep(0.8, 1.0, d));
      float core = exp(-d * d * 22.0);
      vec3 lc = c1;
      if (rnd < 0.99) {
        // a hanging lantern: its own flicker and one of the pane colors mixed into the light
        vec3 pc = rnd < 0.25 ? uPane0 : rnd < 0.5 ? uPane1 : rnd < 0.75 ? uPane2 : uPane3;
        lc = mix(c1, pc, 0.55);
        breathe = 0.75 + 0.25 * sin(tm * (0.5 + rnd * 1.7) + rnd * 60.0) + 0.1 * (1.0 - cont);
        g *= 0.8;
      }
      em = (lc * g * 0.55 + mix(lc, spark, 0.65) * core * 1.1) * breathe * bright;
      a = g * 0.10;
      T = mix(skyB, pastel(lc) * lit, 0.6);
    }
  } else if (part == 3) {
    // ---- gonad ring
    float f = vAux2.y;
    float edge = 1.0 - pow(abs(f * 2.0 - 1.0), 2.0);
    float ang = abs(fract(vAux2.x + 0.5) - 0.5);
    float gap = smoothstep(0.03, 0.09, ang);
    float lump = 0.7 + 0.3 * sin(vAux2.x * TAU * 5.0 + rnd * 20.0 + tm * 0.5);
    float k = edge * gap * lump;
    em = mix(c1, c0, 0.1) * k * 1.9 * uF0.z * bright;
    a = k * 0.4;
    T = mix(skyB, pastel(c1) * lit, 0.75);
  } else if (part == 4) {
    // ---- oral arm: frilly sheet
    float x = vAux2.x;
    float s = vAux2.y;
    float ef = 1.0 - pow(abs(x), 3.0);
    float edge = smoothstep(0.5, 1.0, abs(x));
    float fl = 0.5 + 0.5 * sin(s * 70.0 + x * 5.0 + rnd * 12.0 - tm * 1.5);
    float fade = 1.0 - 0.6 * s;
    a = (0.2 * ef + 0.12 * edge) * fade;
    T = mix(skyB * mix(vec3(1.0), c1, 0.5), pearl, 0.3 + 0.4 * edge);
    em = mix(c0, c1, 0.5 + 0.5 * s) * (0.14 * ef + 0.95 * edge * (0.45 + 0.55 * fl)) * fade * bright * uF3.y;
  } else if (part == 5 || part == 6) {
    // ---- tentacle or pinnule: a thin line of light with a faint halo and beads running down it
    float x = vAux2.x;
    float s = vAux2.y;
    float wf = vAux2.z;
    float core = exp(-x * x * 12.0);
    float halo = 0.3 * exp(-x * x * 2.5);
    float bead = pow(max(0.0, sin(s * (part == 6 ? 16.0 : 38.0) - tm * 2.4 + rnd * 20.0 + seed * 9.0)), 12.0);
    float tip = smoothstep(0.9, 1.0, s);
    float fade = (1.0 - 0.72 * s) * (part == 6 ? 0.7 : 1.0);
    em = mix(c1, spark, 0.25 * uS.w) * ((0.3 + 1.6 * bead + 0.9 * tip) * core + halo * (0.12 + 0.5 * bead)) * wf * fade * bright * uF3.z;
    a = (0.55 * core + 0.1 * halo) * wf * fade;
    T = mix(skyB, pearl * 1.05, 0.55) * mix(vec3(1.0), c0, 0.3);
  } else if (part == 7) {
    // ---- gut tube
    float side = vAux2.x;
    float s = vAux2.y;
    float prof = 1.0 - side * side;
    prof *= prof;
    float fade = 1.0 - 0.5 * s;
    float gi = rnd; // 1 for the column, less for lantern chains
    em = (c1 * 0.8 + spark * 0.3) * prof * fade * (0.9 + 0.5 * (1.0 - cont)) * bright * gi;
    a = 0.3 * prof * fade * gi;
    T = mix(skyB, pastel(c1) * lit, 0.6);
  }

  // Day layer fades out as the sky darkens; emission carries the night.
  vec3 ray = vWorld - cameraPosition;
  float dist = length(ray);
  // Nothing should slam into the lens: spirits dissolve within a few meters of the camera.
  float nearFade = smoothstep(0.7, 3.5, dist);
  float aDay = clamp(a * (1.0 - 0.8 * uDark), 0.0, 0.95) * vInst.y * nearFade;

  vec3 rd = ray / max(dist, 1e-4);
  float od = max(mzFogOD(cameraPosition, rd, dist), 0.0);
  float tr = exp(-od);
  vec3 L = mzFogInscatter(rd);
  T = T * tr + L * (1.0 - tr);
  // the inner light swells with each pulse (strongest for the very slow ones)
  float swell = 1.0 + uS.y * pulseWave(fract(ph - 0.03));
  vec3 emR = em * swell * (uGlowGain * uInvExp) * tr * vInst.y * nearFade;
  vec4 outc = vec4(T * aDay + emR, aDay);
  // A stray NaN in a half float target would smear into the bloom as a colored speck.
  if (any(isnan(outc)) || any(isinf(outc))) outc = vec4(0.0);
  outc = vec4(max(outc.rgb, 0.0), clamp(outc.a, 0.0, 1.0));
  gl_FragColor = outc;
}
`;
