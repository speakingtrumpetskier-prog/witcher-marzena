// Two-cascade sun shadows on top of three's built-in directional shadows.
//
// The key light (directional light index 0) has a sharp near shadow map that follows the
// shadow focus. A second, black directional light (index 1) carries a coarse far shadow map
// over ~2 km that is re-rendered only occasionally: ridges, hills and forests throw long shadows
// across the valley at golden hour. A patched light loop blends: near map inside its frustum,
// the far map outside it, and a soft fade where each one ends. The far light is recognised by a
// marker radius, so an unrelated second shadowed directional light is never misread.
import * as THREE from 'three';

export const FAR_MARKER_RADIUS = 7.77;

export function patchShadowCascade() {
  const SC = THREE.ShaderChunk;
  let src = SC.lights_fragment_begin;
  if (src.includes('mzFarShadow')) return true;
  const loopStart = /(#if \( NUM_DIR_LIGHTS > 0 \) && defined\( RE_Direct \)\s*DirectionalLight directionalLight;\s*#if defined\( USE_SHADOWMAP \) && NUM_DIR_LIGHT_SHADOWS > 0\s*DirectionalLightShadow directionalLightShadow;\s*#endif)/;
  const shadowLine = /directionalLightShadow = directionalLightShadows\[ i \];\s*directLight\.color \*= \( directLight\.visible && receiveShadow \) \? getShadow\( directionalShadowMap\[ i \], directionalLightShadow\.shadowMapSize, directionalLightShadow\.shadowIntensity, directionalLightShadow\.shadowBias, directionalLightShadow\.shadowRadius, vDirectionalShadowCoord\[ i \] \) : 1\.0;/;
  if (!loopStart.test(src) || !shadowLine.test(src)) return false;
  src = src.replace(loopStart, `$1
	float mzFarShadow = 1.0;
	float mzNearW = 1.0;
	bool mzCascade = false;
	#if defined( USE_SHADOWMAP ) && NUM_DIR_LIGHT_SHADOWS > 1
		mzCascade = abs( directionalLightShadows[ 1 ].shadowRadius - ${FAR_MARKER_RADIUS.toFixed(2)} ) < 0.01;
		if ( mzCascade && receiveShadow ) {
			vec4 mzFc = vDirectionalShadowCoord[ 1 ];
			mzFarShadow = getShadow( directionalShadowMap[ 1 ], directionalLightShadows[ 1 ].shadowMapSize, directionalLightShadows[ 1 ].shadowIntensity, directionalLightShadows[ 1 ].shadowBias, 1.0, mzFc );
			vec2 mzFe = abs( mzFc.xy / mzFc.w - 0.5 ) * 2.0;
			mzFarShadow = mix( mzFarShadow, 1.0, smoothstep( 0.8, 0.98, max( mzFe.x, mzFe.y ) ) );
		}
	#endif
	#if defined( USE_SHADOWMAP ) && NUM_DIR_LIGHT_SHADOWS > 0
		vec4 mzNc = vDirectionalShadowCoord[ 0 ];
		vec2 mzNe = abs( mzNc.xy / mzNc.w - 0.5 ) * 2.0;
		mzNearW = 1.0 - smoothstep( 0.78, 0.97, max( mzNe.x, mzNe.y ) );
	#endif`);
  src = src.replace(shadowLine, `directionalLightShadow = directionalLightShadows[ i ];
		{
			float mzS = 1.0;
			if ( directLight.visible && receiveShadow && !( UNROLLED_LOOP_INDEX == 1 && mzCascade ) ) mzS = getShadow( directionalShadowMap[ i ], directionalLightShadow.shadowMapSize, directionalLightShadow.shadowIntensity, directionalLightShadow.shadowBias, directionalLightShadow.shadowRadius, vDirectionalShadowCoord[ i ] );
			if ( UNROLLED_LOOP_INDEX == 0 ) mzS = mix( mzCascade ? mzFarShadow : 1.0, mzS, mzNearW );
			directLight.color *= mzS;
		}`);
  SC.lights_fragment_begin = src;
  return true;
}

const UP = new THREE.Vector3(0, 1, 0);
const _right = new THREE.Vector3();
const _up = new THREE.Vector3();
const _c = new THREE.Vector3();

// Fit an orthographic shadow camera around `focus` for a light shining from direction `d`
// (unit, toward the light). Ground receivers within `R` meters, plus `height` meters of
// vertical stuff, project to a light-space band that shrinks as the sun gets low, so low sun
// gets sharper shadows. Snapped to texels so the map does not shimmer as the focus moves.
export function fitShadow(light, focus, d, R, height, back) {
  const sc = light.shadow.camera;
  _right.crossVectors(UP, d);
  if (_right.lengthSq() < 1e-6) _right.set(1, 0, 0);
  _right.normalize();
  _up.crossVectors(d, _right);
  const sinA = Math.min(1, Math.max(0.05, d.y));
  const cosA = Math.sqrt(1 - sinA * sinA);
  const step = R / 16;
  let halfY = R * sinA + height * cosA;
  halfY = Math.min(R, Math.ceil(halfY / step) * step);
  const halfX = R;
  const n = light.shadow.mapSize.x;
  const tx = (2 * halfX) / n, ty = (2 * halfY) / n;
  const fx = Math.round(focus.dot(_right) / tx) * tx;
  const fy = Math.round(focus.dot(_up) / ty) * ty;
  _c.copy(_right).multiplyScalar(fx).addScaledVector(_up, fy).addScaledVector(d, focus.dot(d));
  light.position.copy(_c).addScaledVector(d, back);
  light.target.position.copy(_c);
  light.target.updateMatrixWorld();
  if (sc.right !== halfX || sc.top !== halfY || sc.far !== back * 2) {
    sc.left = -halfX; sc.right = halfX; sc.top = halfY; sc.bottom = -halfY;
    sc.near = 1; sc.far = back * 2;
    sc.updateProjectionMatrix();
  }
}

// Coarse terrain stand-in that only draws into the far cascade's shadow map (gated by draw
// range in onBeforeShadow / onBeforeRender, since three tests shadow casters against the view
// camera's layers), so ridges, hills and the mountain ring throw long shadows across the valley
// without asking the terrain renderer to submit its distant patches to shadow passes. Built
// from G.world.far (6.25 m grid) at 25 m spacing, sunk a little so it never shadows the real
// surface it stands in for.
export function buildFarTerrainProxy(far, farShadowCamera, { half = 3200, step = 25, sink = 3 } = {}) {
  const n = Math.floor((half * 2) / step) + 1;
  const pos = new Float32Array(n * n * 3);
  const g = far.grid, r = far.res, fh = far.half, fc = far.cell;
  const at = (x, z) => {
    const fx = Math.min(r - 1, Math.max(0, (x + fh) / fc)), fz = Math.min(r - 1, Math.max(0, (z + fh) / fc));
    const v = g[(Math.round(fz) * r + Math.round(fx))];
    return Number.isFinite(v) ? v : 0;
  };
  for (let j = 0; j < n; j++) {
    const z = -half + j * step;
    for (let i = 0; i < n; i++) {
      const x = -half + i * step;
      const o = (j * n + i) * 3;
      pos[o] = x; pos[o + 1] = Math.max(at(x, z), -2) - sink; pos[o + 2] = z;
    }
  }
  const idx = new Uint32Array((n - 1) * (n - 1) * 6);
  let k = 0;
  for (let j = 0; j < n - 1; j++) for (let i = 0; i < n - 1; i++) {
    const a = j * n + i, b = a + 1, c = a + n, d = c + 1;
    idx[k++] = a; idx[k++] = c; idx[k++] = b; idx[k++] = b; idx[k++] = c; idx[k++] = d;
  }
  const geo = new THREE.BufferGeometry();
  geo.setAttribute('position', new THREE.BufferAttribute(pos, 3));
  geo.setIndex(new THREE.BufferAttribute(idx, 1));
  geo.computeBoundingSphere();
  const mesh = new THREE.Mesh(geo, new THREE.MeshBasicMaterial({ colorWrite: false }));
  mesh.name = 'farShadowProxy';
  mesh.castShadow = true;
  mesh.receiveShadow = false;
  mesh.frustumCulled = false;
  mesh.matrixAutoUpdate = false;
  const count = idx.length;
  geo.setDrawRange(0, 0);
  mesh.onBeforeShadow = (_r, _o, _c, shadowCamera) => geo.setDrawRange(0, shadowCamera === farShadowCamera ? count : 0);
  mesh.onAfterShadow = () => geo.setDrawRange(0, 0);
  mesh.onBeforeRender = () => geo.setDrawRange(0, 0);
  return mesh;
}
