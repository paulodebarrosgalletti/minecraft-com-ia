// Sky dome with day/night gradient, sun, moon, stars and blocky scrolling clouds.
import * as THREE from 'three';
import { hash2, smoothstep } from '../core/noise';

export interface SkyState {
  sunLight: number; // 0..1 multiplier for sky light
  daylight: number;
  skyTint: THREE.Color;
  fogColor: THREE.Color;
  sunDir: THREE.Vector3;
}

const C = (h: string) => new THREE.Color(h);
const DAY_TOP = C('#5f93e8'), DAY_HOR = C('#b4d0ff'), NIGHT_TOP = C('#03060f'), NIGHT_HOR = C('#0b1328'), SUNSET = C('#ff8a3c');

export class Sky {
  group = new THREE.Group();
  private dome: THREE.Mesh;
  private domeMat: THREE.ShaderMaterial;
  private sun: THREE.Mesh;
  private moon: THREE.Mesh;
  private stars: THREE.Points;
  private clouds: THREE.Mesh;
  private cloudMat: THREE.ShaderMaterial;
  cloudsEnabled = true;
  state: SkyState = { sunLight: 1, daylight: 1, skyTint: new THREE.Color(1, 1, 1), fogColor: new THREE.Color(), sunDir: new THREE.Vector3(0, 1, 0) };

  constructor() {
    this.domeMat = new THREE.ShaderMaterial({
      uniforms: {
        top: { value: DAY_TOP.clone() }, horizon: { value: DAY_HOR.clone() }, sunDir: { value: new THREE.Vector3(0, 1, 0) },
        sunset: { value: 0 }, sunsetColor: { value: SUNSET.clone() },
      },
      vertexShader: `varying vec3 vDir; void main(){ vDir = normalize(position); gl_Position = projectionMatrix * modelViewMatrix * vec4(position,1.0); }`,
      fragmentShader: `uniform vec3 top; uniform vec3 horizon; uniform vec3 sunDir; uniform float sunset; uniform vec3 sunsetColor; varying vec3 vDir;
        void main(){
          float h = vDir.y;
          vec3 c = mix(horizon, top, pow(clamp(h,0.0,1.0), 0.55));
          if (h < 0.0) c = mix(horizon, horizon*0.55, clamp(-h*3.0,0.0,1.0));
          float s = max(dot(normalize(vec3(vDir.x, 0.0, vDir.z)), normalize(vec3(sunDir.x, 0.0, sunDir.z)+vec3(0.0001))), 0.0);
          float band = 1.0 - smoothstep(0.0, 0.45, abs(h - 0.02));
          c = mix(c, sunsetColor, sunset * band * (0.35 + 0.65 * pow(s, 3.0)));
          gl_FragColor = vec4(c, 1.0);
          #include <colorspace_fragment>
        }`,
      side: THREE.BackSide, depthWrite: false, fog: false,
    });
    this.dome = new THREE.Mesh(new THREE.SphereGeometry(300, 24, 16), this.domeMat);
    this.dome.renderOrder = -10;
    this.dome.frustumCulled = false;
    this.group.add(this.dome);

    this.sun = new THREE.Mesh(new THREE.PlaneGeometry(36, 36), new THREE.MeshBasicMaterial({ map: this.sunTexture(), transparent: true, depthWrite: false, fog: false, blending: THREE.AdditiveBlending }));
    this.moon = new THREE.Mesh(new THREE.PlaneGeometry(26, 26), new THREE.MeshBasicMaterial({ map: this.moonTexture(), transparent: true, depthWrite: false, fog: false }));
    this.sun.renderOrder = -9; this.moon.renderOrder = -9;
    this.group.add(this.sun, this.moon);

    const sp: number[] = [];
    for (let i = 0; i < 900; i++) {
      const u = hash2(7, i, 1) * 2 - 1, a = hash2(7, i, 2) * Math.PI * 2;
      const r = Math.sqrt(1 - u * u);
      sp.push(Math.cos(a) * r * 280, Math.abs(u) * 280, Math.sin(a) * r * 280);
    }
    const sg = new THREE.BufferGeometry();
    sg.setAttribute('position', new THREE.Float32BufferAttribute(sp, 3));
    this.stars = new THREE.Points(sg, new THREE.PointsMaterial({ color: 0xffffff, size: 1.6, sizeAttenuation: false, transparent: true, depthWrite: false, fog: false }));
    this.stars.renderOrder = -9;
    this.stars.frustumCulled = false;
    this.group.add(this.stars);

    const ct = this.cloudTexture();
    this.cloudMat = new THREE.ShaderMaterial({
      uniforms: { map: { value: ct }, offset: { value: new THREE.Vector2() }, color: { value: new THREE.Color(1, 1, 1) }, camPos: { value: new THREE.Vector3() } },
      vertexShader: `varying vec3 vW; void main(){ vec4 w = modelMatrix * vec4(position,1.0); vW = w.xyz; gl_Position = projectionMatrix * viewMatrix * w; }`,
      fragmentShader: `uniform sampler2D map; uniform vec2 offset; uniform vec3 color; uniform vec3 camPos; varying vec3 vW;
        void main(){
          vec2 uv = (vW.xz + offset) / (12.0 * 64.0);
          vec4 t = texture2D(map, uv);
          if (t.a < 0.5) discard;
          float d = length(vW.xz - camPos.xz);
          float a = 0.82 * (1.0 - smoothstep(180.0, 380.0, d));
          gl_FragColor = vec4(color, a);
          #include <colorspace_fragment>
        }`,
      transparent: true, depthWrite: false, side: THREE.DoubleSide,
    });
    this.clouds = new THREE.Mesh(new THREE.PlaneGeometry(900, 900), this.cloudMat);
    this.clouds.rotation.x = -Math.PI / 2;
    this.clouds.renderOrder = 2;
    this.clouds.frustumCulled = false;
    this.group.add(this.clouds);
  }

  private sunTexture(): THREE.Texture {
    const c = document.createElement('canvas'); c.width = 32; c.height = 32;
    const g = c.getContext('2d')!;
    g.fillStyle = 'rgba(255,240,170,0.25)'; g.fillRect(2, 2, 28, 28);
    g.fillStyle = 'rgba(255,245,190,0.6)'; g.fillRect(6, 6, 20, 20);
    g.fillStyle = '#fffbe0'; g.fillRect(9, 9, 14, 14);
    const t = new THREE.CanvasTexture(c); t.magFilter = THREE.NearestFilter; t.minFilter = THREE.NearestFilter; t.colorSpace = THREE.SRGBColorSpace;
    return t;
  }
  private moonTexture(): THREE.Texture {
    const c = document.createElement('canvas'); c.width = 16; c.height = 16;
    const g = c.getContext('2d')!;
    g.fillStyle = '#dfe4f0'; g.fillRect(3, 3, 10, 10);
    g.fillStyle = '#b8bfd0'; g.fillRect(5, 5, 2, 2); g.fillRect(9, 8, 3, 2); g.fillRect(6, 10, 2, 1);
    const t = new THREE.CanvasTexture(c); t.magFilter = THREE.NearestFilter; t.minFilter = THREE.NearestFilter; t.colorSpace = THREE.SRGBColorSpace;
    return t;
  }
  private cloudTexture(): THREE.Texture {
    const N = 64;
    const c = document.createElement('canvas'); c.width = N; c.height = N;
    const g = c.getContext('2d')!;
    const img = g.createImageData(N, N);
    // value noise with wrap
    const v = (x: number, y: number) => hash2(99, ((x % 16) + 16) % 16, ((y % 16) + 16) % 16);
    for (let y = 0; y < N; y++) for (let x = 0; x < N; x++) {
      const fx = x / 4, fy = y / 4;
      const ix = Math.floor(fx), iy = Math.floor(fy), tx = fx - ix, ty = fy - iy;
      const a = v(ix, iy), b = v(ix + 1, iy), cc = v(ix, iy + 1), d = v(ix + 1, iy + 1);
      const n = (a * (1 - tx) + b * tx) * (1 - ty) + (cc * (1 - tx) + d * tx) * ty;
      const n2 = hash2(5, x, y) * 0.15;
      const on = n + n2 > 0.62;
      const i = (y * N + x) * 4;
      img.data[i] = 255; img.data[i + 1] = 255; img.data[i + 2] = 255; img.data[i + 3] = on ? 255 : 0;
    }
    g.putImageData(img, 0, 0);
    const t = new THREE.CanvasTexture(c);
    t.magFilter = THREE.NearestFilter; t.minFilter = THREE.NearestFilter; t.wrapS = THREE.RepeatWrapping; t.wrapT = THREE.RepeatWrapping;
    t.generateMipmaps = false;
    return t;
  }

  /** ticks: 0..24000 (0 = sunrise, 6000 = noon, 12000 = sunset, 18000 = midnight) */
  update(camera: THREE.Camera, ticks: number, elapsed: number): SkyState {
    const a = (ticks / 24000) * Math.PI * 2;
    const sunDir = new THREE.Vector3(Math.cos(a), Math.sin(a), 0.18).normalize();
    const day = smoothstep(-0.18, 0.22, sunDir.y);
    const sunset = Math.max(0, 1 - Math.abs(sunDir.y) / 0.38) * (sunDir.x > 0 ? 0.75 : 1);
    const top = NIGHT_TOP.clone().lerp(DAY_TOP, day);
    const hor = NIGHT_HOR.clone().lerp(DAY_HOR, day);
    const fog = hor.clone().lerp(SUNSET, sunset * 0.35 * Math.max(day, 0.3));
    const u = this.domeMat.uniforms;
    (u.top.value as THREE.Color).copy(top);
    (u.horizon.value as THREE.Color).copy(hor);
    (u.sunDir.value as THREE.Vector3).copy(sunDir);
    u.sunset.value = sunset * 0.85;
    const cp = camera.position;
    this.group.position.set(0, 0, 0);
    this.dome.position.copy(cp);
    this.stars.position.copy(cp);
    (this.stars.material as THREE.PointsMaterial).opacity = Math.max(0, 1 - day * 1.4);
    this.sun.position.copy(cp).addScaledVector(sunDir, 250);
    this.sun.lookAt(cp);
    this.moon.position.copy(cp).addScaledVector(sunDir, -250);
    this.moon.lookAt(cp);
    this.clouds.visible = this.cloudsEnabled;
    this.clouds.position.set(cp.x, 140, cp.z);
    this.cloudMat.uniforms.offset.value.set(elapsed * 1.2, 0);
    (this.cloudMat.uniforms.camPos.value as THREE.Vector3).copy(cp);
    (this.cloudMat.uniforms.color.value as THREE.Color).setRGB(0.06 + 0.94 * day, 0.06 + 0.94 * day, 0.09 + 0.91 * day).lerp(new THREE.Color(1, 0.75, 0.6), sunset * 0.3 * day);
    const s = this.state;
    s.daylight = day;
    s.sunLight = 0.2 + 0.8 * day;
    s.skyTint.setRGB(0.7, 0.75, 1.0).lerp(new THREE.Color(1, 1, 1), day).lerp(new THREE.Color(1, 0.82, 0.68), sunset * 0.45 * day);
    s.fogColor.copy(fog);
    s.sunDir.copy(sunDir);
    return s;
  }
}
