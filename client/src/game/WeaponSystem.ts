export class WeaponSystem {
  private fireCooldown = 0;
  private readonly fireRate = 0.15; // seconds between shots

  update(dt: number) {
    if (this.fireCooldown > 0) {
      this.fireCooldown -= dt;
    }
  }

  canFire(): boolean {
    return this.fireCooldown <= 0;
  }

  fire() {
    if (!this.canFire()) return;
    this.fireCooldown = this.fireRate;
    // TODO: Spawn bullet / send fire event
  }
}
