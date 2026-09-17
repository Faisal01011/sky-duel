import * as THREE from "three";
import { EffectComposer } from "three/examples/jsm/postprocessing/EffectComposer.js";
import { RenderPass } from "three/examples/jsm/postprocessing/RenderPass.js";
import { UnrealBloomPass } from "three/examples/jsm/postprocessing/UnrealBloomPass.js";
import { OutputPass } from "three/examples/jsm/postprocessing/OutputPass.js";
import type { FlightController } from "./FlightController";
import { createFighterJet, updateFighterJetAnimation } from "./FighterFactory";

export class Environment {
  private scene: THREE.Scene;
  private camera: THREE.PerspectiveCamera;
  private renderer: THREE.WebGLRenderer;
  private composer: EffectComposer;
  private bloomPass: UnrealBloomPass;
  private flight: FlightController | null = null;
  private localPlane: THREE.Group | null = null;
  private clouds: THREE.Group[] = [];
  private skyDome!: THREE.Mesh;
  private sunMesh!: THREE.Mesh;
  private sunLight!: THREE.DirectionalLight;
  private time = 0;
  private ground!: THREE.Mesh;

  constructor(canvas: HTMLCanvasElement) {
    this.scene = new THREE.Scene();
    this.scene.fog = new THREE.FogExp2(0x9ec9f0, 0.00055);

    this.camera = new THREE.PerspectiveCamera(78, window.innerWidth / window.innerHeight, 0.1, 9000);
    this.camera.position.set(0, 65, 130);

    this.renderer = new THREE.WebGLRenderer({ canvas, antialias: true, powerPreference: "high-performance", stencil: false });
    this.renderer.setSize(window.innerWidth, window.innerHeight);
    this.renderer.setPixelRatio(Math.min(window.devicePixelRatio, 1.45));
    this.renderer.shadowMap.enabled = true;
    this.renderer.shadowMap.type = THREE.PCFSoftShadowMap;
    this.renderer.shadowMap.autoUpdate = true;
    this.renderer.toneMapping = THREE.ACESFilmicToneMapping;
    this.renderer.toneMappingExposure = 1.08;
    this.renderer.outputColorSpace = THREE.SRGBColorSpace;

    // Post-processing - lower res bloom for perf
    const renderPass = new RenderPass(this.scene, this.camera);
    this.bloomPass = new UnrealBloomPass(new THREE.Vector2(window.innerWidth / 2, window.innerHeight / 2), 0.28, 0.58, 0.78);
    // Tweak bloom for afterburner glow
    const outputPass = new OutputPass();
    this.composer = new EffectComposer(this.renderer);
    this.composer.addPass(renderPass);
    this.composer.addPass(this.bloomPass);
    this.composer.addPass(outputPass);

    // Lighting (A-tier: sun + fill + hemi + env)
    const ambient = new THREE.AmbientLight(0xffffff, 0.55);
    this.scene.add(ambient);

    this.sunLight = new THREE.DirectionalLight(0xfff2d6, 1.65);
    this.sunLight.position.set(420, 560, 220);
    this.sunLight.castShadow = true;
    this.sunLight.shadow.mapSize.set(1024, 1024);
    this.sunLight.shadow.camera.near = 40;
    this.sunLight.shadow.camera.far = 2600;
    this.sunLight.shadow.camera.left = -800;
    this.sunLight.shadow.camera.right = 800;
    this.sunLight.shadow.camera.top = 800;
    this.sunLight.shadow.camera.bottom = -800;
    this.sunLight.shadow.bias = -0.0008;
    this.sunLight.shadow.radius = 2;
    this.scene.add(this.sunLight);
    this.scene.add(this.sunLight.target);

    const hemi = new THREE.HemisphereLight(0xd8ebff, 0x3d4e2e, 0.62);
    hemi.position.set(0, 320, 0);
    this.scene.add(hemi);

    const fill = new THREE.DirectionalLight(0xa9c8ff, 0.42);
    fill.position.set(-280, 180, -220);
    this.scene.add(fill);

    // Sky dome
    this.createSkyDome();

    // Ground + world
    this.createGround();
    this.createRunwayAndAirport();
    this.createScenery();
    this.createClouds();
    this.createDistantMountains();
    this.createWater();

    window.addEventListener("resize", () => this.onResize());
  }

  private createSkyDome() {
    const skyGeo = new THREE.SphereGeometry(4200, 24, 16);
    const skyMat = new THREE.ShaderMaterial({
      side: THREE.BackSide,
      depthWrite: false,
      uniforms: {
        topColor: { value: new THREE.Color(0x0d1b3a) },
        midColor: { value: new THREE.Color(0x2a6bba) },
        bottomColor: { value: new THREE.Color(0x8ec9ff) },
        hazeColor: { value: new THREE.Color(0xd6e8ff) },
        offset: { value: 420 },
        exponent: { value: 0.92 },
        sunPosition: { value: new THREE.Vector3(420, 560, 220).normalize() },
        sunColor: { value: new THREE.Color(0xffffe8) },
      },
      vertexShader: `
        varying vec3 vWorldPosition;
        void main(){
          vec4 wp = modelMatrix * vec4(position,1.0);
          vWorldPosition = wp.xyz;
          gl_Position = projectionMatrix * viewMatrix * wp;
        }
      `,
      fragmentShader: `
        uniform vec3 topColor;
        uniform vec3 midColor;
        uniform vec3 bottomColor;
        uniform vec3 hazeColor;
        uniform float offset;
        uniform float exponent;
        uniform vec3 sunPosition;
        uniform vec3 sunColor;
        varying vec3 vWorldPosition;
        void main(){
          float h = normalize(vWorldPosition + vec3(0.0, offset, 0.0)).y;
          // 0 bottom, 1 top
          float t = clamp( (h*0.5 + 0.5), 0.0, 1.0 );
          // gradient bands
          vec3 col = mix(bottomColor, midColor, smoothstep(0.0,0.52, pow(t, exponent)));
          col = mix(col, topColor, smoothstep(0.52,1.0, pow(t, 1.65)));
          // horizon haze
          float haze = smoothstep(0.18,0.42, t) * (1.0 - smoothstep(0.62,0.92, t));
          col = mix(col, hazeColor, haze*0.22);
          // sun disk & glow
          vec3 dir = normalize(vWorldPosition);
          float sunDot = dot(dir, normalize(sunPosition));
          float sunDisk = smoothstep(0.9985, 0.9996, sunDot);
          float sunGlow = pow(max(sunDot,0.0), 44.0)*0.92 + pow(max(sunDot,0.0), 180.0)*1.6;
          col += sunColor * (sunDisk*1.8 + sunGlow*0.45);
          // vignette
          float vig = 1.0 - length(dir.xz)*0.16;
          col *= clamp(vig,0.78,1.0);
          gl_FragColor = vec4(col,1.0);
        }
      `,
    });
    this.skyDome = new THREE.Mesh(skyGeo, skyMat);
    this.scene.add(this.skyDome);

    // Sun mesh (glow sprite)
    const sunGeo = new THREE.SphereGeometry(52, 16, 16);
    const sunMat = new THREE.MeshBasicMaterial({ color: 0xfffff0, transparent: true, opacity: 0.0, depthWrite: false, fog: false, blending: THREE.AdditiveBlending });
    this.sunMesh = new THREE.Mesh(sunGeo, sunMat);
    this.sunMesh.position.copy(this.sunLight.position).normalize().multiplyScalar(3800);
    // Glow via point sprite? For bloom we make it emissive with fake
    const sunGlowGeo = new THREE.SphereGeometry(92, 16, 16);
    const sunGlowMat = new THREE.MeshBasicMaterial({ color: 0xffe8a0, transparent: true, opacity: 0.18, depthWrite: false, fog: false, blending: THREE.AdditiveBlending });
    const sunGlow = new THREE.Mesh(sunGlowGeo, sunGlowMat);
    this.sunMesh.add(sunGlow);
    this.scene.add(this.sunMesh);

    // Make sun light target at origin
    this.sunLight.target.position.set(0, 0, 0);
  }

  private createGround() {
    const size = 5200;
    const segments = 72;
    const groundGeo = new THREE.PlaneGeometry(size, size, segments, segments);

    // Height displacement with layered noise
    const pos = groundGeo.attributes.position as THREE.BufferAttribute;
    const colors: number[] = [];
    const cGrass = new THREE.Color(0x2e7b32);
    const cGrass2 = new THREE.Color(0x3a8a3e);
    const cRock = new THREE.Color(0x6d7a6a);
    const cSand = new THREE.Color(0xc2b280);
    for (let i = 0; i < pos.count; i++) {
      const x = pos.getX(i);
      const y = pos.getY(i);
      const d = x * 0.0012;
      const e = y * 0.0012;
      let h = 0;
      h += Math.sin(d * 6.2) * 9.2;
      h += Math.cos(e * 5.8) * 7.8;
      h += Math.sin(d * 13 + e * 7) * 3.1;
      h += Math.sin(d * 28) * Math.cos(e * 24) * 1.4;
      // Distance falloff for center flat valley (airport)
      const distCenter = Math.sqrt(x * x + y * y);
      const flatMask = THREE.MathUtils.clamp(1 - distCenter / 620, 0, 1);
      const airportFlat = flatMask * 0.92;
      h *= (1 - airportFlat * 0.72);
      // Hills boost at edges
      if (distCenter > 1300) h += (distCenter - 1300) * 0.018;
      // Canyon ridges
      h += Math.max(0, Math.sin(x * 0.0045) * 14 - 6);
      pos.setZ(i, h);
      // Color variation
      const heightNorm = THREE.MathUtils.clamp((h + 10) / 42, 0, 1);
      const mixed = new THREE.Color().lerpColors(cGrass, cRock, heightNorm * 0.55);
      mixed.lerp(cGrass2, (Math.sin(x * 0.02) * 0.5 + 0.5) * 0.18);
      if (heightNorm > 0.72) mixed.lerp(cRock, 0.35);
      if (distCenter < 520 && Math.abs(y) < 38) {
        // runway asphalt dark
        mixed.setHex(0x2b2e36);
      }
      colors.push(mixed.r, mixed.g, mixed.b);
    }
    groundGeo.setAttribute("color", new THREE.Float32BufferAttribute(colors, 3));
    groundGeo.computeVertexNormals();

    const groundTex = this.makeGroundTexture();
    const groundMat = new THREE.MeshStandardMaterial({
      vertexColors: true,
      map: groundTex,
      roughness: 0.92,
      metalness: 0.04,
    });
    // Tile the texture
    groundTex.wrapS = groundTex.wrapT = THREE.RepeatWrapping;
    groundTex.repeat.set(12, 12);
    groundTex.anisotropy = 4;

    this.ground = new THREE.Mesh(groundGeo, groundMat);
    this.ground.rotation.x = -Math.PI / 2;
    this.ground.receiveShadow = true;
    this.scene.add(this.ground);
  }

  private makeGroundTexture(): THREE.CanvasTexture {
    const c = document.createElement("canvas");
    c.width = 512; c.height = 512;
    const ctx = c.getContext("2d")!;
    // base green
    ctx.fillStyle = "#2f7a33";
    ctx.fillRect(0, 0, 512, 512);
    // noise speckles
    for (let i = 0; i < 9000; i++) {
      const x = Math.random() * 512, y = Math.random() * 512;
      const r = Math.random() * 1.4 + 0.4;
      const g = 60 + Math.random() * 40;
      ctx.fillStyle = `rgba(${40 + Math.random() * 30},${g + 40},${40 + Math.random() * 20},${0.12 + Math.random() * 0.12})`;
      ctx.beginPath(); ctx.arc(x, y, r, 0, Math.PI * 2); ctx.fill();
    }
    // faint grid for farmlands
    ctx.strokeStyle = "rgba(0,0,0,0.045)";
    ctx.lineWidth = 1;
    for (let x = 0; x < 512; x += 64) { ctx.beginPath(); ctx.moveTo(x, 0); ctx.lineTo(x, 512); ctx.stroke(); }
    for (let y = 0; y < 512; y += 64) { ctx.beginPath(); ctx.moveTo(0, y); ctx.lineTo(512, y); ctx.stroke(); }
    const tex = new THREE.CanvasTexture(c);
    tex.colorSpace = THREE.SRGBColorSpace;
    tex.wrapS = tex.wrapT = THREE.RepeatWrapping;
    tex.repeat.set(1, 1);
    return tex;
  }

  private createRunwayAndAirport() {
    // Main runway
    const rwGeo = new THREE.PlaneGeometry(1100, 78);
    const rwCanvas = document.createElement("canvas");
    rwCanvas.width = 1024; rwCanvas.height = 128;
    const rctx = rwCanvas.getContext("2d")!;
    rctx.fillStyle = "#262a31";
    rctx.fillRect(0, 0, 1024, 128);
    rctx.fillStyle = "#e8e8e8";
    // center line dashed
    for (let x = 32; x < 1024 - 32; x += 64) {
      rctx.fillRect(x, 60, 36, 8);
    }
    // thresholds
    rctx.fillStyle = "#ffffff";
    rctx.fillRect(12, 18, 64, 92);
    rctx.fillRect(1024 - 76, 18, 64, 92);
    // edge lines
    rctx.fillRect(0, 6, 1024, 4);
    rctx.fillRect(0, 118, 1024, 4);
    // numbers
    rctx.font = "bold 42px monospace";
    rctx.fillStyle = "#ffffff";
    rctx.fillText("09", 96, 92);
    rctx.save(); rctx.translate(940, 64); rctx.rotate(Math.PI); rctx.fillText("27", -30, 12); rctx.restore();
    const rwTex = new THREE.CanvasTexture(rwCanvas);
    rwTex.colorSpace = THREE.SRGBColorSpace;
    rwTex.anisotropy = 8;
    const rwMat = new THREE.MeshStandardMaterial({ map: rwTex, roughness: 0.58, metalness: 0.12 });
    const runway = new THREE.Mesh(rwGeo, rwMat);
    runway.rotation.x = -Math.PI / 2;
    runway.rotation.z = 0;
    runway.position.set(0, 0.35, 0);
    runway.receiveShadow = true;
    this.scene.add(runway);

    // Taxiway
    const taxiGeo = new THREE.PlaneGeometry(340, 22);
    const taxiMat = new THREE.MeshStandardMaterial({ color: 0x2b2e36, roughness: 0.7 });
    const taxi = new THREE.Mesh(taxiGeo, taxiMat);
    taxi.rotation.x = -Math.PI / 2;
    taxi.position.set(0, 0.32, 66);
    taxi.receiveShadow = true;
    this.scene.add(taxi);

    // Hangars
    for (let i = -1; i <= 1; i++) {
      const hangar = new THREE.Group();
      const base = new THREE.Mesh(new THREE.BoxGeometry(58, 18, 42), new THREE.MeshStandardMaterial({ color: 0xd6d9de, roughness: 0.72 }));
      base.position.y = 9;
      base.castShadow = true; base.receiveShadow = true;
      hangar.add(base);
      const roof = new THREE.Mesh(new THREE.CylinderGeometry(21, 21, 58, 14, 1, false, 0, Math.PI), new THREE.MeshStandardMaterial({ color: 0xc2c6cc, metalness: 0.22, roughness: 0.6 }));
      roof.rotation.z = Math.PI / 2;
      roof.rotation.x = Math.PI / 2;
      roof.position.set(0, 18, 0);
      roof.castShadow = true;
      hangar.add(roof);
      // doors
      const door = new THREE.Mesh(new THREE.PlaneGeometry(34, 14), new THREE.MeshStandardMaterial({ color: 0x1e232b }));
      door.position.set(0, 7.5, 21.1);
      hangar.add(door);
      hangar.position.set(i * 92, 0.12, 132);
      this.scene.add(hangar);
    }

    // Control tower
    const towerGroup = new THREE.Group();
    const towerBase = new THREE.Mesh(new THREE.CylinderGeometry(9, 11, 38, 10), new THREE.MeshStandardMaterial({ color: 0xe2e4e8, roughness: 0.65 }));
    towerBase.position.y = 19;
    towerBase.castShadow = true;
    towerGroup.add(towerBase);
    const towerTop = new THREE.Mesh(new THREE.CylinderGeometry(12, 9, 10, 10), new THREE.MeshStandardMaterial({ color: 0x1a2a44, roughness: 0.5 }));
    towerTop.position.y = 38 + 5;
    towerTop.castShadow = true;
    towerGroup.add(towerTop);
    const glass = new THREE.Mesh(new THREE.CylinderGeometry(11.2, 11.2, 6.5, 10), new THREE.MeshPhysicalMaterial({ color: 0x8ec9ff, transparent: true, opacity: 0.46, roughness: 0.08, transmission: 0.32 }));
    glass.position.y = 41;
    towerGroup.add(glass);
    // antenna
    const ant = new THREE.Mesh(new THREE.CylinderGeometry(0.12, 0.12, 14, 6), new THREE.MeshStandardMaterial({ color: 0x222222 }));
    ant.position.set(0, 49, 0);
    towerGroup.add(ant);
    // radar dish on tower
    const dish = new THREE.Mesh(new THREE.SphereGeometry(2.2, 14, 10, 0, Math.PI * 2, 0, Math.PI / 2), new THREE.MeshStandardMaterial({ color: 0xe8e8e8, roughness: 0.45, metalness: 0.25 }));
    dish.rotation.x = Math.PI;
    dish.position.set(4.5, 44, 0);
    towerGroup.add(dish);
    towerGroup.position.set(118, 0, 88);
    this.scene.add(towerGroup);

    // Windsock and lights
    const pole = new THREE.Mesh(new THREE.CylinderGeometry(0.12, 0.14, 9, 6), new THREE.MeshStandardMaterial({ color: 0xffffff }));
    pole.position.set(-168, 4.5, -12);
    this.scene.add(pole);
    const sock = new THREE.Mesh(new THREE.ConeGeometry(1.2, 3.8, 10, 1, true), new THREE.MeshStandardMaterial({ color: 0xff3b30, side: THREE.DoubleSide }));
    sock.rotation.z = Math.PI / 2;
    sock.position.set(-166.2, 8.6, -12);
    this.scene.add(sock);
  }

  private createScenery() {
    // Cheap city cluster in distance (+X) - reduced for perf
    for (let i = 0; i < 14; i++) {
      const w = 9 + Math.random() * 18;
      const d = 9 + Math.random() * 18;
      const h = 14 + Math.random() * 46;
      const geo = new THREE.BoxGeometry(w, h, d);
      const mat = new THREE.MeshStandardMaterial({ color: new THREE.Color().setHSL(0.08 + Math.random() * 0.06, 0.12, 0.72 + Math.random() * 0.1), roughness: 0.82 });
      const b = new THREE.Mesh(geo, mat);
      b.position.set(860 + (Math.random() - 0.5) * 460, h / 2, (Math.random() - 0.5) * 560);
      b.castShadow = false; b.receiveShadow = true;
      this.scene.add(b);
      // windows emissive at night - fake with small plane
      if (Math.random() > 0.45) {
        const win = new THREE.Mesh(new THREE.PlaneGeometry(w * 0.56, h * 0.62), new THREE.MeshStandardMaterial({ color: 0xffe8a0, emissive: 0xffe8a0, emissiveIntensity: 0.42 }));
        win.position.set(0, 0, d / 2 + 0.02);
        b.add(win);
      }
    }
    // Hills / rock spires for cover (upgraded) - fewer
    for (let i = 0; i < 12; i++) {
      const h = 18 + Math.random() * 58;
      const geo = new THREE.ConeGeometry(14 + Math.random() * 26, h, 7);
      const mat = new THREE.MeshStandardMaterial({ color: 0x5f6f5a, roughness: 0.92 });
      const mesh = new THREE.Mesh(geo, mat);
      let x: number, z: number;
      do {
        x = (Math.random() - 0.5) * 3200;
        z = (Math.random() - 0.5) * 3200;
      } while (Math.hypot(x, z) < 420);
      mesh.position.set(x, h / 2 - 4, z);
      mesh.rotation.y = Math.random() * Math.PI * 2;
      mesh.castShadow = false; mesh.receiveShadow = true;
      this.scene.add(mesh);
    }
    // Radar / SAM site decor
    const radar = new THREE.Group();
    const rBase = new THREE.Mesh(new THREE.BoxGeometry(6, 3, 6), new THREE.MeshStandardMaterial({ color: 0x3a3f47 }));
    rBase.position.y = 1.5;
    radar.add(rBase);
    const rDish = new THREE.Mesh(new THREE.CylinderGeometry(4.2, 4.2, 0.5, 10), new THREE.MeshStandardMaterial({ color: 0xd8dde6, roughness: 0.35 }));
    rDish.rotation.x = 0.35;
    rDish.position.set(0, 3.6, 0);
    rDish.castShadow = false;
    radar.add(rDish);
    radar.position.set(-210, 0.2, 210);
    this.scene.add(radar);

    // Fuel tanks
    for (let i = 0; i < 3; i++) {
      const tank = new THREE.Mesh(new THREE.CapsuleGeometry(4.2, 9, 6, 8), new THREE.MeshStandardMaterial({ color: 0xe8edf2, roughness: 0.55, metalness: 0.12 }));
      tank.rotation.z = Math.PI / 2;
      tank.position.set(64 + i * 14, 4.5, 158);
      tank.castShadow = false;
      this.scene.add(tank);
    }
  }

  private createDistantMountains() {
    // Low poly mountain rim at world edge using a ring of cones
    const rimRadius = 2200;
    const count = 22;
    for (let i = 0; i < count; i++) {
      const ang = (i / count) * Math.PI * 2;
      const r = rimRadius + (Math.random() - 0.5) * 120;
      const x = Math.cos(ang) * r;
      const z = Math.sin(ang) * r;
      const h = 85 + Math.random() * 110;
      const geo = new THREE.ConeGeometry(110 + Math.random() * 80, h, 6);
      const mat = new THREE.MeshStandardMaterial({ color: 0x4a5a6a, roughness: 0.95 });
      const m = new THREE.Mesh(geo, mat);
      m.position.set(x, h / 2 - 12, z);
      m.rotation.y = -ang;
      this.scene.add(m);
    }
  }

  private createWater() {
    // Distant ocean plane at -Z edge
    const waterGeo = new THREE.PlaneGeometry(5200, 2200);
    const waterMat = new THREE.MeshStandardMaterial({ color: 0x1e3a5a, roughness: 0.18, metalness: 0.62, transparent: true, opacity: 0.95 });
    const water = new THREE.Mesh(waterGeo, waterMat);
    water.rotation.x = -Math.PI / 2;
    water.position.set(0, -2.5, -2100);
    this.scene.add(water);
    // Foam edge line
    const foam = new THREE.Mesh(new THREE.PlaneGeometry(5200, 12), new THREE.MeshBasicMaterial({ color: 0xd6e8ff, transparent: true, opacity: 0.55 }));
    foam.rotation.x = -Math.PI / 2;
    foam.position.set(0, -1.2, -1080);
    this.scene.add(foam);
  }

  private createClouds() {
    const cloudMat = new THREE.MeshLambertMaterial({ color: 0xffffff, transparent: true, opacity: 0.92 });
    for (let i = 0; i < 20; i++) {
      const group = new THREE.Group();
      const blobs = 3 + Math.floor(Math.random() * 3);
      const baseScale = 0.95 + Math.random() * 0.55;
      for (let j = 0; j < blobs; j++) {
        const geo = new THREE.SphereGeometry(17 + Math.random() * 23, 8, 6);
        const mesh = new THREE.Mesh(geo, cloudMat.clone());
        // vary color slightly for depth
        (mesh.material as THREE.MeshLambertMaterial).color.offsetHSL(0, 0, (Math.random() - 0.5) * 0.06);
        mesh.position.set((Math.random() - 0.5) * 52, (Math.random() - 0.5) * 14, (Math.random() - 0.5) * 52);
        mesh.scale.setScalar(0.78 + Math.random() * 0.56);
        mesh.castShadow = false; // clouds no shadow for perf
        mesh.receiveShadow = false;
        group.add(mesh);
      }
      group.position.set((Math.random() - 0.5) * 3400, 190 + Math.random() * 300, (Math.random() - 0.5) * 3400);
      group.scale.setScalar(baseScale);
      (group as any)._drift = 0.6 + Math.random() * 1.2;
      (group as any)._alt = group.position.y;
      this.scene.add(group);
      this.clouds.push(group);
    }
  }

  setFlightController(fc: FlightController) {
    this.flight = fc;
    if (!this.localPlane) this.createLocalPlane();
  }

  private createLocalPlane() {
    const col = 0x2ecc71; // local distinct green-gray
    this.localPlane = createFighterJet(col, "VIPER");
    this.scene.add(this.localPlane);
  }

  getLocalPlane(): THREE.Group | null {
    return this.localPlane;
  }

  private onResize() {
    this.camera.aspect = window.innerWidth / window.innerHeight;
    this.camera.updateProjectionMatrix();
    this.renderer.setSize(window.innerWidth, window.innerHeight);
    this.composer.setSize(window.innerWidth, window.innerHeight);
    this.bloomPass.resolution.set(window.innerWidth / 2, window.innerHeight / 2);
  }

  update(dt: number) {
    this.time += dt;
    // Sky follow camera
    if (this.skyDome) this.skyDome.position.copy(this.camera.position);
    if (this.sunMesh) this.sunMesh.position.copy(this.sunLight.position).normalize().multiplyScalar(3780).add(this.camera.position);

    if (this.flight && this.localPlane) {
      this.localPlane.position.copy(this.flight.position);
      this.localPlane.rotation.copy(this.flight.rotation as any);
      const speed = this.flight.getSpeed();
      const isBurner = speed > 88 || this.flight.getInputState().thrust > 0.35;
      updateFighterJetAnimation(this.localPlane as any, dt, speed, isBurner);
    }

    // Drift clouds and slight vertical bob
    for (const c of this.clouds) {
      const drift: number = (c as any)._drift;
      c.position.x += dt * drift;
      c.position.y = (c as any)._alt + Math.sin(this.time * 0.12 + c.position.x * 0.001) * 2.2;
      if (c.position.x > 1900) c.position.x = -1900;
      if (c.position.x < -1900) c.position.x = 1900;
      // Face camera slightly? Keep as is
    }

    // Water shimmer (cheap)
    // Bloom tweak based on altitude: more bloom at high alt due to sun scatter
    if (this.flight) {
      const alt = this.flight.getAltitude();
      const bloomBoost = THREE.MathUtils.clamp((alt - 120) / 280, 0, 1) * 0.18;
      this.bloomPass.strength = 0.34 + bloomBoost;
    }
  }

  render() {
    // Use composer for bloom + tone mapping
    this.composer.render();
  }

  getScene() { return this.scene; }
  getCamera() { return this.camera; }
  getRenderer() { return this.renderer; }
}
