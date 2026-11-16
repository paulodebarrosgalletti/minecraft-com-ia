// Custom voxel shaders: per-vertex sky/block light, AO colour, distance fog.
import * as THREE from 'three';

export interface WorldUniforms {
  map: { value: THREE.Texture };
  sun: { value: number };
  skyTint: { value: THREE.Color };
  fogColor: { value: THREE.Color };
  fogNear: { value: number };
  fogFar: { value: number };
  time: { value: number };
  brightness: { value: number };
  underwater: { value: number };
}

const vert = /* glsl */ `
attribute vec2 light;
attribute vec3 color;
varying vec2 vUv;
varying vec2 vLight;
varying vec3 vColor;
varying float vFogDepth;
varying vec3 vWorld;
void main() {
  vUv = uv;
  vLight = light;
  vColor = color;
  vec4 wp = modelMatrix * vec4(position, 1.0);
  vWorld = wp.xyz;
  vec4 mv = viewMatrix * wp;
  vFogDepth = length(mv.xyz);
  gl_Position = projectionMatrix * mv;
}`;

const fragCommon = /* glsl */ `
uniform sampler2D map;
uniform float sun;
uniform vec3 skyTint;
uniform vec3 fogColor;
uniform float fogNear;
uniform float fogFar;
uniform float time;
uniform float brightness;
uniform float underwater;
varying vec2 vUv;
varying vec2 vLight;
varying vec3 vColor;
varying float vFogDepth;
varying vec3 vWorld;
float curve(float l) {
  float c = l / (4.0 - 3.0 * l);
  return mix(c, l, brightness);
}
vec3 lightColor() {
  float s = curve(vLight.x * sun);
  float b = curve(vLight.y);
  vec3 lc = max(vec3(s) * skyTint, vec3(1.0, 0.86, 0.66) * b);
  return max(lc, vec3(0.035 + brightness * 0.04));
}
vec3 applyFog(vec3 c) {
  float f = smoothstep(fogNear, fogFar, vFogDepth);
  if (underwater > 0.5) f = smoothstep(0.0, 22.0, vFogDepth);
  return mix(c, fogColor, f);
}
`;

const fragSolid = /* glsl */ `
${fragCommon}
void main() {
  vec4 t = texture2D(map, vUv);
  if (t.a < 0.5) discard;
  vec3 c = t.rgb * vColor * lightColor();
  gl_FragColor = vec4(applyFog(c), 1.0);
  #include <colorspace_fragment>
}`;

const fragWater = /* glsl */ `
${fragCommon}
void main() {
  vec4 t = texture2D(map, vUv);
  float w = sin(vWorld.x * 1.7 + time * 1.6) * cos(vWorld.z * 1.3 + time * 1.2) * 0.5 + 0.5;
  float w2 = sin((vWorld.x + vWorld.z) * 0.6 - time * 0.9) * 0.5 + 0.5;
  vec3 c = t.rgb * vColor * (0.82 + 0.22 * w + 0.08 * w2) * lightColor();
  float a = 0.72;
  gl_FragColor = vec4(applyFog(c), a);
  #include <colorspace_fragment>
}`;

export function createWorldUniforms(map: THREE.Texture): WorldUniforms {
  return {
    map: { value: map },
    sun: { value: 1 },
    skyTint: { value: new THREE.Color(1, 1, 1) },
    fogColor: { value: new THREE.Color(0.7, 0.8, 1) },
    fogNear: { value: 60 },
    fogFar: { value: 100 },
    time: { value: 0 },
    brightness: { value: 0.3 },
    underwater: { value: 0 },
  };
}

export function createSolidMaterial(u: WorldUniforms): THREE.ShaderMaterial {
  return new THREE.ShaderMaterial({ uniforms: u as any, vertexShader: vert, fragmentShader: fragSolid });
}

export function createWaterMaterial(u: WorldUniforms): THREE.ShaderMaterial {
  return new THREE.ShaderMaterial({
    uniforms: u as any, vertexShader: vert, fragmentShader: fragWater, transparent: true, depthWrite: false,
  });
}
