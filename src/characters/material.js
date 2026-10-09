// The single character material: MeshStandardMaterial plus compile hooks (never onBeforeCompile).
//
// Per-vertex: color (albedo, linear), aUv + aRect (pattern atlas tile or the face texture),
// aMat = (skin, roughness, fuzz, special/3) where special 1 = metal, 2 = eye, 3 = glow.
// Shading additions: wrapped diffuse with a warm subsurface tint on skin (no plastic look),
// a cloth "fuzz" rim that brightens grazing angles in proportion to the light received,
// a painted catchlight and lid shadow on eyes, and an optional emissive rim (ghosts).
// Ghost hair/dress float: aFloat = (weight, phase) displaces bind-space vertices over time.
import * as THREE from 'three';
import { addCompileHook } from '../render/Materials.js';
import { getAtlas } from './textures.js';
import { U } from '../render/Uniforms.js';

const physChunk = (() => {
  let c = THREE.ShaderChunk.lights_physical_pars_fragment;
  c = c.replace(
    'vec3 irradiance = dotNL * directLight.color;',
    `vec3 irradiance = dotNL * directLight.color;
	float mzNl = dot( geometryNormal, directLight.direction );
	float mzWrap = saturate( ( mzNl + 0.55 ) / 1.55 );
	mzWrap *= mzWrap;
	vec3 mzDiffIrr = directLight.color * ( dotNL + max( mzWrap - dotNL, 0.0 ) * vMzMat.x * vec3( 1.0, 0.42, 0.3 ) * 1.1 );`,
  );
  c = c.replace(
    'reflectedLight.directDiffuse += irradiance * BRDF_Lambert( material.diffuseContribution );',
    'reflectedLight.directDiffuse += mzDiffIrr * BRDF_Lambert( material.diffuseContribution );',
  );
  return c;
})();

const VERT_PARS = /* glsl */ `
attribute vec2 aUv;
attribute vec4 aRect;
attribute vec4 aMat;
varying vec2 vMzUv;
varying vec4 vMzRect;
varying vec4 vMzMat;
varying vec3 vMzObjN;
#ifdef MZ_FLOAT
attribute vec2 aFloat;
uniform float uTime;
uniform float uMzFloat;
#endif
`;

const FLOAT_VERT = /* glsl */ `
#ifdef MZ_FLOAT
{
  float fw = aFloat.x * uMzFloat;
  float ph = aFloat.y * 6.2831;
  float tt = uTime * 0.55 + ph;
  vec3 drift = vec3(
    sin(tt + position.y * 2.3) * 0.9 + sin(tt * 1.7 + position.z * 5.0) * 0.35,
    sin(tt * 0.8 + position.x * 3.1) * 0.5 + 0.25,
    cos(tt * 0.9 + position.y * 2.9) * 0.9
  );
  transformed += drift * fw * 0.07;
}
#endif
`;

const FRAG_PARS = /* glsl */ `
varying vec2 vMzUv;
varying vec4 vMzRect;
varying vec4 vMzMat;
varying vec3 vMzObjN;
uniform sampler2D uMzAtlas;
uniform sampler2D uMzFace;
uniform vec3 uMzHeadUp;
uniform vec4 uMzRim;
uniform vec3 uMzGlow;
`;

const ALBEDO_FRAG = /* glsl */ `
{
  vec4 rr = vMzRect;
  if ( rr.x < 0.0 ) {
    diffuseColor.rgb *= texture2D( uMzFace, vMzUv ).rgb;
  } else {
    bool decal = rr.w < 0.0;
    vec2 sz = vec2( rr.z, abs( rr.w ) );
    vec2 tuv = decal ? vec2( fract( vMzUv.x ), clamp( vMzUv.y, 0.03, 0.97 ) ) : fract( vMzUv );
    vec2 auv = rr.xy + tuv * sz;
    vec2 dx = dFdx( vMzUv ) * sz, dy = dFdy( vMzUv ) * sz;
    float lim = 0.02;
    dx = clamp( dx, -lim, lim ); dy = clamp( dy, -lim, lim );
    vec4 tx = textureGrad( uMzAtlas, auv, dx, dy );
    if ( decal ) diffuseColor.rgb = mix( diffuseColor.rgb, tx.rgb, tx.a );
    else diffuseColor.rgb *= tx.rgb * 2.0;
  }
  float mzSpecial = vMzMat.w * 3.0;
  if ( abs( mzSpecial - 2.0 ) < 0.4 ) {
    // Eyes: the upper lid shadows the top of the eyeball, corners fall off.
    float up = dot( normalize( vMzObjN ), uMzHeadUp );
    diffuseColor.rgb *= 1.0 - 0.5 * smoothstep( -0.05, 0.55, up ) - 0.18 * smoothstep( -0.25, -0.75, up );
  }
}
`;

const OUT_FRAG = /* glsl */ `
{
  float mzSpecial = vMzMat.w * 3.0;
  vec3 mzV = normalize( vViewPosition );
  float mzNv = saturate( dot( normal, mzV ) );
  float mzFr = pow( 1.0 - mzNv, 3.0 );
  outgoingLight += ( reflectedLight.directDiffuse + reflectedLight.indirectDiffuse ) * mzFr * vMzMat.z * 1.4;
  if ( abs( mzSpecial - 2.0 ) < 0.4 ) {
    vec3 r = reflect( -mzV, normal );
    float s = pow( saturate( dot( r, normalize( vec3( -0.3, 0.45, 0.85 ) ) ) ), 900.0 );
    float s2 = pow( saturate( dot( r, normalize( vec3( 0.5, 0.2, 0.85 ) ) ) ), 300.0 ) * 0.25;
    outgoingLight += vec3( s * 2.2 + s2 );
  }
  if ( mzSpecial > 2.6 ) outgoingLight += uMzGlow;
  outgoingLight += uMzRim.rgb * pow( 1.0 - mzNv, uMzRim.a );
}
`;

export function createCharacterMaterial({ faceTex, ghost = false, rim = null, glow = null } = {}) {
  const m = new THREE.MeshStandardMaterial({ vertexColors: true, roughness: 1, metalness: 0 });
  m.userData.mzU = {
    uMzAtlas: { value: getAtlas() },
    uMzFace: { value: faceTex || null },
    uMzHeadUp: { value: new THREE.Vector3(0, 1, 0) },
    uMzRim: { value: rim ? new THREE.Vector4(rim.r, rim.g, rim.b, rim.p ?? 2.5) : new THREE.Vector4(0, 0, 0, 3) },
    uMzGlow: { value: glow ? glow.clone() : new THREE.Color(0, 0, 0) },
    uMzFloat: { value: 1 },
  };
  if (ghost) m.defines = { MZ_FLOAT: '' };
  addCompileHook(m, ghost ? 'mzcharF' : 'mzchar', (shader, mat) => patchCharShader(shader, mat));
  return m;
}

export function patchCharShader(shader, mat) {
  const u = mat.userData.mzU;
  Object.assign(shader.uniforms, u);
  shader.uniforms.uTime = U.uTime;
  let vs = shader.vertexShader, fs = shader.fragmentShader;
  vs = VERT_PARS + vs;
  vs = vs.replace('#include <color_vertex>', '#include <color_vertex>\n vMzUv = aUv; vMzRect = aRect; vMzMat = aMat;');
  vs = vs.replace('#include <skinnormal_vertex>', '#include <skinnormal_vertex>\n vMzObjN = objectNormal;');
  vs = vs.replace('#include <begin_vertex>', '#include <begin_vertex>\n' + FLOAT_VERT);
  fs = FRAG_PARS + fs;
  fs = fs.replace('#include <lights_physical_pars_fragment>', physChunk);
  fs = fs.replace('#include <color_fragment>', '#include <color_fragment>\n' + ALBEDO_FRAG);
  fs = fs.replace('#include <roughnessmap_fragment>', 'float roughnessFactor = max( 0.05, vMzMat.y );');
  fs = fs.replace('#include <metalnessmap_fragment>', 'float metalnessFactor = abs( vMzMat.w * 3.0 - 1.0 ) < 0.4 ? 0.85 : 0.0;');
  fs = fs.replace('#include <opaque_fragment>', OUT_FRAG + '\n#include <opaque_fragment>');
  shader.vertexShader = vs;
  shader.fragmentShader = fs;
}

// Depth material for shadows of floating ghost geometry (skinning is added by three).
export function createFloatDepthMaterial() {
  const d = new THREE.MeshDepthMaterial({ depthPacking: THREE.RGBADepthPacking });
  d.defines = { MZ_FLOAT: '' };
  d.userData.mzU = { uMzFloat: { value: 1 } };
  addCompileHook(d, 'mzfloatdepth', (shader) => {
    shader.uniforms.uTime = U.uTime;
    shader.uniforms.uMzFloat = d.userData.mzU.uMzFloat;
    shader.vertexShader = '#ifdef MZ_FLOAT\nattribute vec2 aFloat;\nuniform float uTime;\nuniform float uMzFloat;\n#endif\n' +
      shader.vertexShader.replace('#include <begin_vertex>', '#include <begin_vertex>\n' + FLOAT_VERT);
  });
  return d;
}
