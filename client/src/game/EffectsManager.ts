import * as THREE from "three";
import { ObjectPool } from "../utils/ObjectPool";

type Particle = {
  mesh: THREE.Mesh;
  velocity: THREE.Vector3;
  life: number;
  maxLife: number;
  active: boolean;
};

export class EffectsManager {
  private scene: THREE.Scene | null = null;
  private pool: ObjectPool<Particle>;
  private active: Set<Particle> = new Set();
  private shockRings: Array<{ mesh: THREE.Mesh; life: number; max: number }> = [];
  private smokePuffs: Set<Particle> = new Set();

  constructor() {
    const make = (): Particle => {
      const geo = new THREE.SphereGeometry(0.5, 8, 8);
      const mat = new THREE.MeshStandardMaterial({ color: 0xffaa00, emissive: 0xff6a00, emissiveIntensity: 1.6, transparent: true, opacity: 1, roughness: 0.9 });
      const mesh = new THREE.Mesh(geo, mat);
      mesh.visible = false;
      mesh.castShadow = false;
      return { mesh, velocity: new THREE.Vector3(), life: 0, maxLife: 1, active: false };
    };
    const reset = (p: Particle) => {
      p.mesh.visible = false;
      if (p.mesh.parent) p.mesh.parent.remove(p.mesh);
      p.velocity.set(0, 0, 0);
      p.life = 0;
      p.active = false;
      const m = p.mesh.material as THREE.MeshStandardMaterial;
      m.opacity = 1;
      m.emissiveIntensity = 1.6;
    };
    this.pool = new ObjectPool(make, reset, 140);
  }

  setScene(scene: THREE.Scene) {
    this.scene = scene;
  }

  update(dt: number) {
    // particles
    for (const p of [...this.active]) {
      p.life -= dt;
      if (p.life <= 0) {
        this.active.delete(p);
        this.smokePuffs.delete(p);
        this.pool.release(p);
        continue;
      }
      p.mesh.position.addScaledVector(p.velocity, dt);
      // gravity for fire, lift for smoke
      if (this.smokePuffs.has(p)) {
        p.velocity.y += 1.8 * dt;
        p.velocity.multiplyScalar(0.982);
        const m = p.mesh.material as THREE.MeshStandardMaterial;
        m.opacity = THREE.MathUtils.clamp(p.life / p.maxLife, 0, 0.72) * 0.62;
        const s = 0.8 + (1 - p.life / p.maxLife) * 1.9;
        p.mesh.scale.setScalar(s);
        m.emissiveIntensity *= 0.985;
      } else {
        p.velocity.y -= 7.2 * dt;
        p.velocity.multiplyScalar(0.986);
        const m = p.mesh.material as THREE.MeshStandardMaterial;
        m.opacity = p.life / p.maxLife;
        m.emissiveIntensity = 1.0 + (p.life / p.maxLife) * 1.2;
        const s = 0.65 + 0.75 * (p.life / p.maxLife);
        p.mesh.scale.setScalar(s);
      }
    }
    // shock rings
    for (let i = this.shockRings.length - 1; i >= 0; i--) {
      const r = this.shockRings[i];
      r.life -= dt;
      if (r.life <= 0) {
        if (r.mesh.parent) r.mesh.parent.remove(r.mesh);
        this.shockRings.splice(i, 1);
        continue;
      }
      const prog = 1 - r.life / r.max;
      const scale = 1 + prog * 18;
      r.mesh.scale.set(scale, scale, scale);
      (r.mesh.material as THREE.MeshBasicMaterial).opacity = (1 - prog) * 0.34;
      r.mesh.rotation.z += dt * 0.6;
    }
  }

  private spawnParticle(pos: THREE.Vector3, vel: THREE.Vector3, color: number, emissive: number, life: number, size = 0.5, isSmoke = false) {
    if (!this.scene) return;
    const p = this.pool.acquire();
    p.mesh.position.copy(pos);
    p.velocity.copy(vel);
    p.life = life;
    p.maxLife = life;
    p.active = true;
    p.mesh.visible = true;
    p.mesh.scale.setScalar(size);
    const mat = p.mesh.material as THREE.MeshStandardMaterial;
    mat.color.setHex(color);
    mat.emissive.setHex(emissive);
    mat.opacity = isSmoke ? 0.58 : 1;
    this.scene.add(p.mesh);
    this.active.add(p);
    if (isSmoke) this.smokePuffs.add(p);
  }

  spawnExplosion(pos: THREE.Vector3) {
    // Flash + light
    const flash = new THREE.PointLight(0xff6a00, 28, 140);
    flash.position.copy(pos);
    flash.decay = 2;
    if (this.scene) this.scene.add(flash);
    // animate light decay
    let life = 0.52;
    const tick = setInterval(() => {
      life -= 0.05;
      flash.intensity = Math.max(0, flash.intensity * 0.78);
      if (life <= 0) { clearInterval(tick); if (flash.parent) flash.parent.remove(flash); }
    }, 50);

    // Core fireball
    for (let i = 0; i < 22; i++) {
      const dir = new THREE.Vector3((Math.random() - 0.5), Math.random() * 0.85 + 0.1, (Math.random() - 0.5)).normalize();
      dir.multiplyScalar(9 + Math.random() * 26);
      const col = Math.random() > 0.38 ? 0xffa126 : (Math.random() > 0.5 ? 0xff4d00 : 0xffeb8a);
      const em = Math.random() > 0.5 ? 0xff6a00 : 0xffa000;
      this.spawnParticle(pos.clone().addScaledVector(dir, 0.09), dir, col, em, 0.62 + Math.random() * 0.58, 1.1 + Math.random() * 0.9);
    }
    // Debris sparks
    for (let i = 0; i < 14; i++) {
      const dir = new THREE.Vector3((Math.random() - 0.5), (Math.random() - 0.5) * 0.5, (Math.random() - 0.5)).normalize().multiplyScalar(16 + Math.random() * 18);
      dir.y += Math.random() * 6;
      this.spawnParticle(pos.clone(), dir, 0x2a2a2a, 0x111111, 1.0 + Math.random() * 0.7, 0.32);
    }
    // Smoke column
    for (let i = 0; i < 16; i++) {
      const dir = new THREE.Vector3((Math.random() - 0.5) * 2.2, 2.8 + Math.random() * 5.5, (Math.random() - 0.5) * 2.2);
      const c = 0x3a3a3a;
      this.spawnParticle(pos.clone().add(new THREE.Vector3(0, 0.6, 0)), dir, c, 0x222222, 1.6 + Math.random() * 1.4, 0.95 + Math.random() * 0.85, true);
    }
    // Shock ring
    const ringGeo = new THREE.RingGeometry(0.9, 1.15, 32);
    ringGeo.rotateX(Math.PI / 2);
    const ringMat = new THREE.MeshBasicMaterial({ color: 0xffc07a, transparent: true, opacity: 0.34, side: THREE.DoubleSide, depthWrite: false, blending: THREE.AdditiveBlending });
    const ring = new THREE.Mesh(ringGeo, ringMat);
    ring.position.copy(pos);
    ring.position.y += 0.2;
    if (this.scene) this.scene.add(ring);
    this.shockRings.push({ mesh: ring, life: 0.58, max: 0.58 });

    // Secondary ring smaller
    const ring2 = ring.clone();
    ring2.scale.set(0.6, 0.6, 0.6);
    if (this.scene) this.scene.add(ring2);
    this.shockRings.push({ mesh: ring2, life: 0.42, max: 0.42 });

    // Ground scorch decal (dark circle)
    const scorch = new THREE.Mesh(new THREE.CircleGeometry(5.5, 18), new THREE.MeshBasicMaterial({ color: 0x111111, transparent: true, opacity: 0.42, depthWrite: false }));
    scorch.rotation.x = -Math.PI / 2;
    scorch.position.set(pos.x, 0.06, pos.z);
    if (this.scene) this.scene.add(scorch);
    setTimeout(() => { if (scorch.parent) scorch.parent.remove(scorch); }, 9000);
  }

  spawnHit(pos: THREE.Vector3) {
    for (let i = 0; i < 9; i++) {
      const dir = new THREE.Vector3((Math.random() - 0.5), (Math.random() - 0.5) * 0.8, (Math.random() - 0.5)).normalize().multiplyScalar(10 + Math.random() * 14);
      this.spawnParticle(pos.clone(), dir, 0xfff6a0, 0xffa000, 0.34, 0.42);
    }
    // spark flash
    const flash = new THREE.PointLight(0xffffff, 6.5, 28);
    flash.position.copy(pos);
    if (this.scene) this.scene.add(flash);
    setTimeout(() => { if (flash.parent) flash.parent.remove(flash); }, 70);
    // hit ring
    const ring = new THREE.Mesh(new THREE.RingGeometry(0.6, 0.78, 18), new THREE.MeshBasicMaterial({ color: 0xffffff, transparent: true, opacity: 0.55, side: THREE.DoubleSide, depthWrite: false, blending: THREE.AdditiveBlending }));
    ring.position.copy(pos);
    ring.lookAt(pos.clone().add(new THREE.Vector3(0, 0, 1)));
    if (this.scene) this.scene.add(ring);
    let a = 0.55;
    const id = setInterval(() => {
      a -= 0.09;
      ring.scale.multiplyScalar(1.18);
      (ring.material as THREE.MeshBasicMaterial).opacity = a;
      if (a <= 0) { clearInterval(id); if (ring.parent) ring.parent.remove(ring); }
    }, 24);
  }

  spawnRespawn(pos: THREE.Vector3) {
    // Teal warp portal
    for (let i = 0; i < 18; i++) {
      const ang = (i / 18) * Math.PI * 2;
      const dir = new THREE.Vector3(Math.cos(ang) * 1.2, 0.2 + Math.random() * 0.5, Math.sin(ang) * 1.2).multiplyScalar(6.5);
      this.spawnParticle(pos.clone(), dir, 0x7afcff, 0x00e5ff, 0.95, 0.62);
    }
    const light = new THREE.PointLight(0x00e5ff, 9, 45);
    light.position.copy(pos);
    if (this.scene) this.scene.add(light);
    setTimeout(() => { if (light.parent) light.parent.remove(light); }, 460);
    const ring = new THREE.Mesh(new THREE.RingGeometry(1.4, 1.7, 28), new THREE.MeshBasicMaterial({ color: 0x00e5ff, transparent: true, opacity: 0.62, side: THREE.DoubleSide, depthWrite: false, blending: THREE.AdditiveBlending }));
    ring.rotation.x = Math.PI / 2;
    ring.position.copy(pos);
    if (this.scene) this.scene.add(ring);
    let s = 1;
    let o = 0.62;
    const id = setInterval(() => {
      s += 0.18; o -= 0.06;
      ring.scale.setScalar(s);
      (ring.material as THREE.MeshBasicMaterial).opacity = o;
      if (o <= 0) { clearInterval(id); if (ring.parent) ring.parent.remove(ring); }
    }, 32);
  }

  spawnMuzzleFlash(pos: THREE.Vector3, dir: THREE.Vector3) {
    const p = pos.clone().addScaledVector(dir, 2.2);
    for (let i = 0; i < 4; i++) {
      const vel = dir.clone().multiplyScalar(14).add(new THREE.Vector3((Math.random() - 0.5) * 5, (Math.random() - 0.5) * 5, (Math.random() - 0.5) * 5));
      this.spawnParticle(p, vel, 0xffff8a, 0xffcc00, 0.18, 0.56);
    }
    // flash point
    const flash = new THREE.PointLight(0xffe8a0, 7, 18);
    flash.position.copy(p);
    if (this.scene) this.scene.add(flash);
    setTimeout(() => { if (flash.parent) flash.parent.remove(flash); }, 60);
  }

  spawnContrail(pos: THREE.Vector3) {
    // Persistent white-gray smoke wisp with slight blue tint
    const vel = new THREE.Vector3((Math.random() - 0.5) * 0.9, (Math.random() - 0.5) * 0.7, (Math.random() - 0.5) * 0.9);
    // Slight blue-gray
    this.spawnParticle(pos.clone(), vel, 0xe6ecf2, 0x333333, 2.35, 0.72, true);
  }

  spawnSpeedLines(camera: THREE.Camera, speed: number) {
    // Placeholder for future - could spawn lines at screen edge
  }
}
