// Wasser: eine große Fläche mit Wellen-Normalen, Tiefenfärbung, Spiegelung, Sonnenglanz und Schaum am Ufer.
import * as THREE from 'three';
import { SEG, CELL, HALF, WATER } from '../terrain.js';

export function buildWater(depthTex) {
  const uniforms = THREE.UniformsUtils.merge([THREE.UniformsLib.fog, {
    uTime: { value: 0 },
    uDepth: { value: null },
    uSunDir: { value: new THREE.Vector3(0, 1, 0) },
    uSunCol: { value: new THREE.Color(1, 1, 1) },
    uSky: { value: new THREE.Color(0.3, 0.5, 0.9) },
    uHorizon: { value: new THREE.Color(0.7, 0.8, 0.9) },
    uShallow: { value: new THREE.Color(0.1, 0.55, 0.55) },
    uDeep: { value: new THREE.Color(0.02, 0.12, 0.25) },
    uLight: { value: 1 },
    uGrid: { value: new THREE.Vector3(HALF, CELL, SEG + 1) },
  }]);
  uniforms.uDepth.value = depthTex;
  const mat = new THREE.ShaderMaterial({
    uniforms,
    fog: true,
    transparent: true,
    vertexShader: /* glsl */`
      varying vec3 vWorld;
      #include <fog_pars_vertex>
      void main() {
        vec4 wp = modelMatrix * vec4(position, 1.0);
        vWorld = wp.xyz;
        vec4 mvPosition = viewMatrix * wp;
        gl_Position = projectionMatrix * mvPosition;
        #include <fog_vertex>
      }`,
    fragmentShader: /* glsl */`
      uniform float uTime, uLight;
      uniform sampler2D uDepth;
      uniform vec3 uSunDir, uSunCol, uSky, uHorizon, uShallow, uDeep, uGrid;
      varying vec3 vWorld;
      #include <common>
      #include <fog_pars_fragment>
      vec2 wgrad(vec2 p, vec2 d, float f, float sp, float a) {
        float ph = dot(p, d) * f + uTime * sp;
        return d * cos(ph) * f * a;
      }
      void main() {
        vec2 p = vWorld.xz;
        vec2 g = wgrad(p, normalize(vec2(1.0, 0.3)), 0.35, 1.3, 0.06)
               + wgrad(p, normalize(vec2(-0.4, 1.0)), 0.52, 1.7, 0.04)
               + wgrad(p, normalize(vec2(0.8, -0.7)), 1.3, 2.6, 0.018)
               + wgrad(p, normalize(vec2(-0.9, -0.2)), 2.1, 3.1, 0.01);
        vec3 n = normalize(vec3(-g.x, 1.0, -g.y));
        vec3 V = normalize(cameraPosition - vWorld);
        float ndv = max(dot(n, V), 0.0);
        float fres = 0.04 + 0.96 * pow(1.0 - ndv, 5.0);

        vec2 cell = (p + uGrid.x) / uGrid.y;
        vec2 uv = (cell + 0.5) / uGrid.z;
        float depth = 20.0;
        if (uv.x > 0.0 && uv.y > 0.0 && uv.x < 1.0 && uv.y < 1.0) depth = texture2D(uDepth, uv).r * 20.0;

        vec3 base = mix(uShallow, uDeep, smoothstep(0.3, 9.0, depth)) * uLight;
        vec3 R = reflect(-V, n);
        vec3 refl = mix(uHorizon, uSky, clamp(R.y * 1.8, 0.0, 1.0));
        vec3 col = mix(base, refl, fres);
        vec3 H = normalize(uSunDir + V);
        float spec = pow(max(dot(n, H), 0.0), 220.0) * step(0.0, uSunDir.y + 0.05);
        col += uSunCol * spec * 2.5;

        float fn = sin(p.x * 0.6 + uTime * 1.1) * sin(p.y * 0.55 - uTime * 0.9) * 0.5 + 0.5;
        float shore = 1.0 - smoothstep(0.0, 0.9 + fn * 0.6, depth);
        float ring = smoothstep(0.55, 1.0, sin(depth * 6.0 - uTime * 2.2) * 0.5 + 0.5) * (1.0 - smoothstep(0.0, 1.6, depth));
        float foam = clamp(shore * 0.9 + ring * 0.5, 0.0, 1.0);
        col = mix(col, vec3(0.92, 0.96, 0.98) * max(uLight, 0.25), foam * 0.75);

        float alpha = mix(0.45, 0.94, smoothstep(0.0, 4.0, depth));
        alpha = max(alpha, fres * 0.9);
        alpha = max(alpha, foam * 0.85);
        gl_FragColor = vec4(col, alpha);
        #include <tonemapping_fragment>
        #include <colorspace_fragment>
        #include <fog_fragment>
      }`,
  });
  const geo = new THREE.PlaneGeometry(9000, 9000, 1, 1);
  geo.rotateX(-Math.PI / 2);
  const mesh = new THREE.Mesh(geo, mat);
  mesh.position.y = WATER;
  mesh.renderOrder = 1;
  mesh.name = 'water';
  return { mesh, uniforms };
}
