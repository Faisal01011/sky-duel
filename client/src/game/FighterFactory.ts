import * as THREE from "three";

export type FighterJet = THREE.Group & {
  // animated parts refs
  _afterburner?: THREE.Mesh;
  _afterburnerCore?: THREE.Mesh;
  _canopy?: THREE.Mesh;
  _prop?: THREE.Mesh; // kept for legacy remote
  _flameMat?: THREE.ShaderMaterial;
};

const paintCache = new Map<number, THREE.CanvasTexture>();
function createPaintTexture(baseHex: number): THREE.CanvasTexture {
  if (paintCache.has(baseHex)) return paintCache.get(baseHex)!;
  const c = new THREE.Color(baseHex);
  const canvas = document.createElement("canvas");
  canvas.width = 256; // halved for perf
  canvas.height = 256;
  const ctx = canvas.getContext("2d")!;
  // base
  ctx.fillStyle = `#${c.getHexString()}`;
  ctx.fillRect(0, 0, 256, 256);
  // subtle panel lines (fewer)
  ctx.strokeStyle = "rgba(0,0,0,0.09)";
  ctx.lineWidth = 1.5;
  for (let y = 32; y < 256; y += 32) {
    ctx.beginPath(); ctx.moveTo(0, y); ctx.lineTo(256, y); ctx.stroke();
  }
  for (let x = 40; x < 256; x += 45) {
    ctx.beginPath(); ctx.moveTo(x, 0); ctx.lineTo(x, 256); ctx.stroke();
  }
  // rivets fewer
  ctx.fillStyle = "rgba(0,0,0,0.07)";
  for (let i = 0; i < 160; i++) {
    const x = Math.random()*256, y = Math.random()*256;
    ctx.beginPath(); ctx.arc(x,y,0.9,0,Math.PI*2); ctx.fill();
  }
  // camo blobs
  const camo = new THREE.Color(baseHex).multiplyScalar(0.82);
  ctx.fillStyle = `#${camo.getHexString()}44`;
  for (let i = 0; i < 4; i++) {
    const x = Math.random()*256, y = Math.random()*256, r = 18 + Math.random()*28;
    ctx.beginPath(); ctx.ellipse(x,y,r, r*0.62, Math.random()*Math.PI, 0, Math.PI*2); ctx.fill();
  }
  // nose tip darker
  const grad = ctx.createLinearGradient(0, 0, 60, 0);
  grad.addColorStop(0, "rgba(20,20,20,0.18)");
  grad.addColorStop(1, "rgba(20,20,20,0)");
  ctx.fillStyle = grad;
  ctx.fillRect(0, 0, 60, 256);

  const tex = new THREE.CanvasTexture(canvas);
  tex.colorSpace = THREE.SRGBColorSpace;
  tex.wrapS = tex.wrapT = THREE.RepeatWrapping;
  tex.repeat.set(1, 1);
  tex.anisotropy = 4;
  tex.needsUpdate = true;
  paintCache.set(baseHex, tex);
  return tex;
}

function createAfterburnerMaterial(): THREE.ShaderMaterial {
  return new THREE.ShaderMaterial({
    transparent: true,
    blending: THREE.AdditiveBlending,
    depthWrite: false,
    uniforms: {
      time: { value: 0 },
      intensity: { value: 0.85 },
    },
    vertexShader: `
      varying vec2 vUv;
      void main(){ vUv=uv; gl_Position=projectionMatrix*modelViewMatrix*vec4(position,1.0);}
    `,
    fragmentShader: `
      uniform float time;
      uniform float intensity;
      varying vec2 vUv;
      void main(){
        float r = distance(vUv, vec2(0.5,0.5));
        // diamond flame shape
        float tip = 1.0 - smoothstep(0.0, 0.85, vUv.y);
        float edge = 1.0 - smoothstep(0.18, 0.55, r*1.6);
        float noise = sin(vUv.y*18.0 + time*10.0)*0.08 + cos(vUv.x*22.0 - time*12.0)*0.06;
        float a = edge * tip * (0.9+noise) * intensity;
        vec3 cOuter = vec3(0.06,0.32,1.0);
        vec3 cMid   = vec3(0.18,0.62,1.0);
        vec3 cHot   = vec3(1.0,0.95,0.82);
        vec3 col = mix(cOuter, cMid, clamp(edge*1.3,0.,1.));
        col = mix(col, cHot, pow(tip,1.8)*0.95);
        float core = 1.0 - smoothstep(0.0,0.18, r*2.2);
        col += core * 0.55;
        gl_FragColor = vec4(col, a);
      }
    `,
  });
}

export function createFighterJet(baseColorHex: number, idTailNumber?: string): FighterJet {
  const group = new THREE.Group() as FighterJet;

  const paintTex = createPaintTexture(baseColorHex);
  const baseMat = new THREE.MeshStandardMaterial({
    map: paintTex,
    roughness: 0.34,
    metalness: 0.38,
    envMapIntensity: 0.98,
  });
  const darkMat = new THREE.MeshStandardMaterial({ color: 0x1a1d22, roughness: 0.78, metalness: 0.18 });
  const metalMat = new THREE.MeshStandardMaterial({ color: 0xd8dde6, roughness: 0.22, metalness: 0.78 });
  const cockpitGlassMat = new THREE.MeshPhysicalMaterial({
    color: 0x8ec9ff,
    transparent: true,
    opacity: 0.38,
    roughness: 0.05,
    metalness: 0.0,
    clearcoat: 1.0,
    clearcoatRoughness: 0.04,
    transmission: 0.22,
    ior: 1.45,
    thickness: 0.4,
  });

  // --- Nose ---
  const noseGeo = new THREE.ConeGeometry(0.85, 2.8, 12);
  noseGeo.rotateX(Math.PI / 2);
  noseGeo.translate(0, 0, 4.35);
  const nose = new THREE.Mesh(noseGeo, new THREE.MeshStandardMaterial({ color: 0x2a2f36, roughness: 0.32, metalness: 0.62 }));
  nose.castShadow = false;
  group.add(nose);

  // Radome tip pitot
  const pitot = new THREE.Mesh(new THREE.CylinderGeometry(0.02, 0.02, 0.9, 6), darkMat);
  pitot.rotation.x = Math.PI / 2;
  pitot.position.set(0, 0.06, 5.9);
  group.add(pitot);

  // --- Main fuselage segmented ---
  // Forward
  const fwdGeo = new THREE.CylinderGeometry(0.86, 1.15, 2.6, 12);
  fwdGeo.rotateX(Math.PI / 2);
  fwdGeo.translate(0, 0, 2.6);
  const fwd = new THREE.Mesh(fwdGeo, baseMat);
  fwd.castShadow = true; fwd.receiveShadow = false;
  group.add(fwd);

  // Mid (cockpit area) - slightly wider
  const midGeo = new THREE.CylinderGeometry(1.15, 1.22, 2.4, 12);
  midGeo.rotateX(Math.PI / 2);
  midGeo.translate(0, 0, 0.18);
  const mid = new THREE.Mesh(midGeo, baseMat);
  mid.castShadow = true;
  group.add(mid);

  // Aft taper
  const aftGeo = new THREE.CylinderGeometry(1.22, 0.82, 2.9, 12);
  aftGeo.rotateX(Math.PI / 2);
  aftGeo.translate(0, 0, -2.46);
  const aft = new THREE.Mesh(aftGeo, baseMat);
  aft.castShadow = false;
  group.add(aft);

  // Air intakes (two rectangular)
  const intakeGeo = new THREE.BoxGeometry(0.58, 0.72, 1.9);
  const intakeL = new THREE.Mesh(intakeGeo, darkMat);
  intakeL.position.set(-0.94, -0.34, 0.75);
  intakeL.rotation.y = 0.14;
  intakeL.castShadow = false;
  group.add(intakeL);
  const intakeR = intakeL.clone();
  intakeR.position.x *= -1;
  intakeR.rotation.y *= -1;
  group.add(intakeR);
  // Intake lips
  const lipGeo = new THREE.TorusGeometry(0.42, 0.09, 6, 10, Math.PI);
  const lipL = new THREE.Mesh(lipGeo, metalMat);
  lipL.position.set(-0.94, -0.34, 1.68);
  lipL.rotation.y = Math.PI / 2;
  lipL.rotation.x = Math.PI / 2;
  group.add(lipL);
  const lipR = lipL.clone();
  lipR.position.x *= -1;
  group.add(lipR);

  // --- Cockpit canopy (bulged) ---
  const canopyGeo = new THREE.CapsuleGeometry(0.62, 1.8, 6, 10);
  canopyGeo.rotateX(Math.PI / 2);
  // Scale to be more oval and flattened
  canopyGeo.scale(1, 0.55, 1);
  const canopy = new THREE.Mesh(canopyGeo, cockpitGlassMat);
  canopy.position.set(0, 0.82, 0.95);
  canopy.rotation.x = -0.06;
  canopy.castShadow = true;
  group.add(canopy);
  (group as any)._canopy = canopy;
  // Canopy frame
  const frameGeo = new THREE.TorusGeometry(0.62, 0.045, 6, 10, Math.PI);
  const frame = new THREE.Mesh(frameGeo, darkMat);
  frame.position.set(0, 0.82, 0.28);
  frame.rotation.x = Math.PI / 2;
  frame.scale.set(1, 0.55, 1);
  group.add(frame);
  // HUD frame inside
  const hud = new THREE.Mesh(new THREE.BoxGeometry(0.55, 0.02, 0.04), new THREE.MeshStandardMaterial({ color: 0x111111 }));
  hud.position.set(0, 0.58, 1.62);
  group.add(hud);

  // --- Wings (swept, low mounted) ---
  function createWing(isLeft: boolean) {
    const shape = new THREE.Shape();
    // Root leading 0, tip offset
    const span = 4.85;
    const rootChord = 2.45;
    const tipChord = 0.95;
    const sweep = 1.35; // x offset at tip due to sweep
    const side = isLeft ? -1 : 1;
    shape.moveTo(0, 0);
    shape.lineTo(rootChord, 0);
    shape.lineTo(rootChord + sweep - (rootChord - tipChord), side * span);
    shape.lineTo(sweep, side * span);
    shape.lineTo(0, 0);
    const extrude = new THREE.ExtrudeGeometry(shape, { depth: 0.14, bevelEnabled: true, bevelThickness: 0.02, bevelSize: 0.02, bevelSegments: 2 });
    extrude.rotateY(-Math.PI / 2);
    extrude.rotateZ(Math.PI / 2);
    extrude.translate(0.1, -0.22, -0.05);
    // Taper thickness manually? keep
    const mat = baseMat.clone();
    // Slightly darker under
    const wing = new THREE.Mesh(extrude, mat);
    wing.castShadow = true;
    wing.receiveShadow = true;
    return wing;
  }
  const wingL = createWing(true);
  const wingR = createWing(false);
  group.add(wingL);
  group.add(wingR);

  // Wing pylons + missiles (AIM-9 look)
  function addPylon(x: number, z: number) {
    const pylon = new THREE.Mesh(new THREE.BoxGeometry(0.12, 0.38, 0.55), darkMat);
    pylon.position.set(x, -0.42, z);
    group.add(pylon);
    // missile
    const missileBody = new THREE.Mesh(new THREE.CylinderGeometry(0.11, 0.11, 1.45, 10), new THREE.MeshStandardMaterial({ color: 0xe8e8e8, roughness: 0.35, metalness: 0.22 }));
    missileBody.rotation.x = Math.PI / 2;
    missileBody.position.set(x, -0.66, z + 0.15);
    missileBody.castShadow = true;
    group.add(missileBody);
    const mNose = new THREE.Mesh(new THREE.ConeGeometry(0.11, 0.34, 10), new THREE.MeshStandardMaterial({ color: 0x222222 }));
    mNose.rotation.x = Math.PI / 2;
    mNose.position.set(x, -0.66, z + 1.02);
    group.add(mNose);
    const mFin = new THREE.Mesh(new THREE.BoxGeometry(0.02, 0.22, 0.18), darkMat);
    mFin.position.set(x, -0.66, z - 0.52);
    group.add(mFin);
  }
  addPylon(-1.65, 0.15);
  addPylon(1.65, 0.15);
  addPylon(-3.15, -0.05);
  addPylon(3.15, -0.05);

  // --- Canards (small forewings, optional) ---
  // Could skip for F-16 look; F-16 has no canards.

  // --- Horizontal stabilizers (tailplanes) ---
  function createStab(isLeft: boolean) {
    const shape = new THREE.Shape();
    shape.moveTo(0, 0);
    shape.lineTo(1.55, 0);
    shape.lineTo(1.15, (isLeft ? -1 : 1) * 1.65);
    shape.lineTo(-0.22, (isLeft ? -1 : 1) * 1.65);
    shape.lineTo(0, 0);
    const geo = new THREE.ExtrudeGeometry(shape, { depth: 0.10, bevelEnabled: false });
    geo.rotateY(-Math.PI / 2);
    geo.rotateZ(Math.PI / 2);
    const mesh = new THREE.Mesh(geo, baseMat.clone());
    mesh.position.set(0, 0.08, -3.35);
    mesh.castShadow = true;
    return mesh;
  }
  const stabL = createStab(true);
  const stabR = createStab(false);
  group.add(stabL);
  group.add(stabR);

  // --- Vertical stabilizer ---
  const vStabShape = new THREE.Shape();
  vStabShape.moveTo(0, 0);
  vStabShape.lineTo(1.65, 0);
  vStabShape.lineTo(0.55, 1.95);
  vStabShape.lineTo(-0.35, 1.95);
  vStabShape.lineTo(0, 0);
  const vStabGeo = new THREE.ExtrudeGeometry(vStabShape, { depth: 0.13, bevelEnabled: false });
  vStabGeo.rotateY(-Math.PI / 2);
  vStabGeo.rotateZ(Math.PI / 2);
  const vStab = new THREE.Mesh(vStabGeo, baseMat.clone());
  vStab.position.set(0, 0.22, -3.15);
  vStab.castShadow = true;
  group.add(vStab);

  // Rudder detail line
  const rudderLine = new THREE.Mesh(new THREE.BoxGeometry(0.02, 1.4, 0.02), new THREE.MeshStandardMaterial({ color: 0x0f1115 }));
  rudderLine.position.set(0, 1.15, -3.62);
  rudderLine.rotation.x = -0.18;
  group.add(rudderLine);

  // --- Engine nozzle & afterburner ---
  const nozzleGeo = new THREE.CylinderGeometry(0.58, 0.68, 0.72, 12, 1, true);
  nozzleGeo.rotateX(Math.PI / 2);
  nozzleGeo.translate(0, 0, -4.02);
  const nozzle = new THREE.Mesh(nozzleGeo, new THREE.MeshStandardMaterial({ color: 0x4a4d55, roughness: 0.22, metalness: 0.82, side: THREE.DoubleSide }));
  nozzle.castShadow = false;
  group.add(nozzle);
  // Afterburner petals
  const petalGeo = new THREE.ConeGeometry(0.66, 0.18, 12, 1, true);
  petalGeo.rotateX(Math.PI);
  petalGeo.translate(0, 0, -4.38);
  const petals = new THREE.Mesh(petalGeo, new THREE.MeshStandardMaterial({ color: 0x2b2e36, roughness: 0.5, metalness: 0.55, side: THREE.DoubleSide }));
  group.add(petals);

  // Flame cone
  const flameGeo = new THREE.ConeGeometry(0.55, 2.8, 12, 1, true);
  flameGeo.rotateX(-Math.PI / 2);
  flameGeo.translate(0, 0, -4.2);
  const flameMat = createAfterburnerMaterial();
  const flame = new THREE.Mesh(flameGeo, flameMat);
  flame.position.z = -0.65;
  group.add(flame);
  (group as any)._afterburner = flame;
  (group as any)._flameMat = flameMat;

  // Core hot
  const coreGeo = new THREE.ConeGeometry(0.28, 1.55, 10, 1, true);
  coreGeo.rotateX(-Math.PI / 2);
  coreGeo.translate(0, 0, -4.15);
  const coreMat = new THREE.MeshBasicMaterial({ color: 0xffe8a0, transparent: true, opacity: 0.92, blending: THREE.AdditiveBlending, depthWrite: false });
  const coreFlame = new THREE.Mesh(coreGeo, coreMat);
  coreFlame.position.z = -0.55;
  group.add(coreFlame);
  (group as any)._afterburnerCore = coreFlame;

  // Exhaust light
  const exhaustLight = new THREE.PointLight(0x4488ff, 4.2, 18);
  exhaustLight.position.set(0, 0, -4.45);
  exhaustLight.intensity = 1.2;
  group.add(exhaustLight);
  (group as any)._exhaustLight = exhaustLight;

  // --- Details: formation lights, nav lights ---
  const navRed = new THREE.Mesh(new THREE.SphereGeometry(0.06, 8, 8), new THREE.MeshStandardMaterial({ color: 0xff1a1a, emissive: 0xff1a1a, emissiveIntensity: 2.2 }));
  navRed.position.set(-4.95, -0.12, -0.35);
  group.add(navRed);
  const navGreen = navRed.clone();
  navGreen.material = (navRed.material as THREE.MeshStandardMaterial).clone();
  (navGreen.material as THREE.MeshStandardMaterial).color.setHex(0x1aff1a);
  (navGreen.material as THREE.MeshStandardMaterial).emissive.setHex(0x1aff1a);
  navGreen.position.x *= -1;
  group.add(navGreen);
  const beacon = new THREE.Mesh(new THREE.SphereGeometry(0.055, 8, 8), new THREE.MeshStandardMaterial({ color: 0xff3b30, emissive: 0xff3b30, emissiveIntensity: 1.5 }));
  beacon.position.set(0, 0.62, -1.75);
  group.add(beacon);
  // Strobe flash logic handled in update via userData

  // Tail number / insignia
  if (idTailNumber) {
    const canvas = document.createElement("canvas");
    canvas.width = 256; canvas.height = 128;
    const ctx = canvas.getContext("2d")!;
    ctx.fillStyle = "rgba(0,0,0,0)";
    ctx.fillRect(0, 0, 256, 128);
    ctx.fillStyle = "#ffffff";
    ctx.font = "bold 56px monospace";
    ctx.textAlign = "center";
    ctx.fillText(idTailNumber.slice(0, 4).toUpperCase(), 128, 78);
    ctx.strokeStyle = "rgba(0,0,0,0.85)";
    ctx.lineWidth = 4;
    ctx.strokeText(idTailNumber.slice(0, 4).toUpperCase(), 128, 78);
    const tex = new THREE.CanvasTexture(canvas);
    tex.colorSpace = THREE.SRGBColorSpace;
    const decal = new THREE.Mesh(new THREE.PlaneGeometry(0.9, 0.45), new THREE.MeshBasicMaterial({ map: tex, transparent: true, side: THREE.DoubleSide }));
    decal.position.set(0, 0.95, -2.95);
    decal.rotation.y = Math.PI; // on tail
    // Slight offset to avoid z-fighting
    decal.position.x = 0.07;
    group.add(decal);
  }

  // Shadow helper (fake ambient occlusion under)
  const shadowPlane = new THREE.Mesh(
    new THREE.CircleGeometry(1.4, 16),
    new THREE.MeshBasicMaterial({ color: 0x000000, transparent: true, opacity: 0.0, depthWrite: false })
  );
  shadowPlane.rotation.x = -Math.PI / 2;
  shadowPlane.position.y = -0.68;
  // we leave invisible but could use for ground shadow

  // User data for animation
  group.userData.baseColor = baseColorHex;
  group.userData.time = Math.random() * 10;

  return group;
}

export function updateFighterJetAnimation(jet: FighterJet, dt: number, speed: number, isAfterburner: boolean) {
  jet.userData.time = (jet.userData.time || 0) + dt;
  const t = jet.userData.time;
  if (jet._flameMat) {
    jet._flameMat.uniforms.time.value = t;
    const targetIntensity = isAfterburner ? 1.0 + Math.sin(t * 18) * 0.08 : 0.38 + Math.sin(t * 7) * 0.04;
    jet._flameMat.uniforms.intensity.value = THREE.MathUtils.lerp(jet._flameMat.uniforms.intensity.value, targetIntensity, 0.14);
    const s = isAfterburner ? 1.0 : 0.42;
    jet._afterburner!.scale.set(s, s, isAfterburner ? 1.0 : 0.55);
    jet._afterburner!.visible = true;
    jet._afterburnerCore!.scale.set(s, s, isAfterburner ? 1.0 : 0.5);
    // flicker core opacity
    (jet._afterburnerCore!.material as THREE.MeshBasicMaterial).opacity = isAfterburner ? 0.92 + Math.sin(t * 22) * 0.08 : 0.42;
  }
  if ((jet as any)._exhaustLight) {
    const l = (jet as any)._exhaustLight as THREE.PointLight;
    l.intensity = isAfterburner ? 5.5 + Math.sin(t * 14) * 1.2 : 1.6;
    l.color.setHSL(0.61 + Math.sin(t * 3) * 0.02, 1, 0.6);
  }
}
