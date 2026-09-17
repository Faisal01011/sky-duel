import * as THREE from "three";
import { ObjectPool } from "../utils/ObjectPool";

export type Bullet = {
  mesh: THREE.Group;
  velocity: THREE.Vector3;
  life: number;
  active: boolean;
};

export class WeaponSystem {
  private fireCooldown = 0;
  private readonly fireRate = 0.15; // seconds
  private pool: ObjectPool<Bullet>;
  private active: Set<Bullet> = new Set();
  private scene: THREE.Scene | null = null;
  private onFireCallback: (() => void) | null = null;
  private bulletSpeed = 320;
  private bulletLife = 2.8;

  constructor() {
    const makeBullet = (): Bullet => {
      const group = new THREE.Group();
      // Core tracer
      const coreGeo = new THREE.CapsuleGeometry(0.18, 2.2, 6, 12);
      coreGeo.rotateX(Math.PI / 2);
      // Translate so tail is behind
      coreGeo.translate(0, 0, -0.9);
      const coreMat = new THREE.MeshStandardMaterial({
        color: 0xfff2a0,
        emissive: 0xffb000,
        emissiveIntensity: 4.2,
        transparent: true,
        opacity: 0.98,
      });
      const core = new THREE.Mesh(coreGeo, coreMat);
      core.castShadow = false;
      group.add(core);

      // Glow shell (bloom)
      const glowGeo = new THREE.CapsuleGeometry(0.32, 2.9, 6, 10);
      glowGeo.rotateX(Math.PI / 2);
      glowGeo.translate(0, 0, -0.9);
      const glowMat = new THREE.MeshBasicMaterial({
        color: 0xff8c00,
        transparent: true,
        opacity: 0.38,
        depthWrite: false,
        blending: THREE.AdditiveBlending,
      });
      const glow = new THREE.Mesh(glowGeo, glowMat);
      group.add(glow);

      // Tip point light
      const light = new THREE.PointLight(0xff8c00, 3.5, 9);
      light.position.set(0, 0, 0.6);
      group.add(light);

      // Trail tail ribbon
      const tailGeo = new THREE.CylinderGeometry(0.04, 0.12, 1.6, 6, 1, true);
      tailGeo.rotateX(Math.PI / 2);
      tailGeo.translate(0, 0, -2.0);
      const tailMat = new THREE.MeshBasicMaterial({
        color: 0xffc24a,
        transparent: true,
        opacity: 0.28,
        depthWrite: false,
        blending: THREE.AdditiveBlending,
        side: THREE.DoubleSide,
      });
      const tail = new THREE.Mesh(tailGeo, tailMat);
      group.add(tail);

      group.visible = false;
      (group as any)._coreMat = coreMat;
      (group as any)._glowMat = glowMat;
      (group as any)._tail = tail;
      (group as any)._light = light;

      return { mesh: group, velocity: new THREE.Vector3(), life: 0, active: false };
    };
    const resetBullet = (b: Bullet) => {
      b.mesh.visible = false;
      b.mesh.position.set(0, -9999, 0);
      b.velocity.set(0, 0, 0);
      b.life = 0;
      b.active = false;
      if (b.mesh.parent) b.mesh.parent.remove(b.mesh);
      // reset mats
      const coreMat = (b.mesh as any)._coreMat as THREE.MeshStandardMaterial;
      if (coreMat) { coreMat.emissiveIntensity = 4.2; coreMat.opacity = 0.98; }
      const glowMat = (b.mesh as any)._glowMat as THREE.MeshBasicMaterial;
      if (glowMat) glowMat.opacity = 0.38;
      // orient reset
      b.mesh.quaternion.identity();
    };
    this.pool = new ObjectPool(makeBullet, resetBullet, 56);
  }

  setScene(scene: THREE.Scene) { this.scene = scene; }
  setOnFire(cb: () => void) { this.onFireCallback = cb; }

  update(dt: number) {
    if (this.fireCooldown > 0) this.fireCooldown -= dt;
    for (const b of [...this.active]) {
      b.life -= dt;
      if (b.life <= 0) { this.despawn(b); continue; }
      b.mesh.position.addScaledVector(b.velocity, dt);
      // Orient to velocity
      if (b.velocity.lengthSq() > 0.01) {
        const dir = b.velocity.clone().normalize();
        const target = new THREE.Vector3(0, 0, 1);
        b.mesh.quaternion.setFromUnitVectors(target, dir);
      }
      // Fade at end of life
      const fade = THREE.MathUtils.clamp(b.life / 0.35, 0, 1);
      const coreMat = (b.mesh as any)._coreMat as THREE.MeshStandardMaterial;
      if (coreMat) coreMat.opacity = 0.65 + 0.33 * fade;
      const tail = (b.mesh as any)._tail as THREE.Mesh;
      if (tail) {
        const s = 0.7 + 0.9 * fade;
        tail.scale.set(s, s, 1);
        (tail.material as THREE.MeshBasicMaterial).opacity = 0.18 + 0.22 * fade;
      }
      if (b.mesh.position.length() > 3600 || b.mesh.position.y < -80) this.despawn(b);
    }
  }

  canFire(): boolean { return this.fireCooldown <= 0; }

  fire(origin: THREE.Vector3, forward: THREE.Vector3, inheritedVelocity?: THREE.Vector3): Bullet | null {
    if (!this.canFire()) return null;
    if (!this.scene) return null;
    this.fireCooldown = this.fireRate;
    const b = this.pool.acquire();
    b.mesh.position.copy(origin).addScaledVector(forward, 10.5);
    b.velocity.copy(forward).multiplyScalar(this.bulletSpeed);
    if (inheritedVelocity) b.velocity.addScaledVector(inheritedVelocity, 0.42);
    b.life = this.bulletLife;
    b.active = true;
    b.mesh.visible = true;
    // Reset orientation instantly
    const dir = b.velocity.clone().normalize();
    b.mesh.quaternion.setFromUnitVectors(new THREE.Vector3(0, 0, 1), dir);
    this.scene.add(b.mesh);
    this.active.add(b);
    if (this.onFireCallback) this.onFireCallback();
    return b;
  }

  spawnRemote(pos: THREE.Vector3, vel: THREE.Vector3) {
    if (!this.scene) return null;
    const b = this.pool.acquire();
    b.mesh.position.copy(pos);
    b.velocity.copy(vel);
    b.life = this.bulletLife;
    b.active = true;
    b.mesh.visible = true;
    // Remote tint red-orange for hostile, keep bloom
    const coreMat = (b.mesh as any)._coreMat as THREE.MeshStandardMaterial;
    if (coreMat) coreMat.emissive.setHex(0xff3b30);
    const glowMat = (b.mesh as any)._glowMat as THREE.MeshBasicMaterial;
    if (glowMat) glowMat.color.setHex(0xff3b30);
    const dir = vel.clone().normalize();
    b.mesh.quaternion.setFromUnitVectors(new THREE.Vector3(0, 0, 1), dir);
    this.scene.add(b.mesh);
    this.active.add(b);
    // Restore color after lifetime via despawn reset, but also schedule
    setTimeout(() => {
      if (coreMat) coreMat.emissive.setHex(0xffb000);
      if (glowMat) glowMat.color.setHex(0xff8c00);
    }, 30);
    return b;
  }

  despawn(b: Bullet) {
    if (!this.active.has(b)) return;
    this.active.delete(b);
    this.pool.release(b);
  }

  clearAll() { for (const b of [...this.active]) this.despawn(b); }
  getActiveBullets(): Bullet[] { return [...this.active]; }
}
