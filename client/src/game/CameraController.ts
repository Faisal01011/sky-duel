import * as THREE from "three";
import type { FlightController } from "./FlightController";

export class CameraController {
  private camera: THREE.PerspectiveCamera | null = null;
  private flight: FlightController | null = null;
  private offset = new THREE.Vector3(0, 8, -28); // local offset behind
  private lookAhead = 40;
  private lerpPos = 0.08;
  private lerpLook = 0.12;
  private shakeTime = 0;
  private shakeAmp = 0;

  setCamera(cam: THREE.PerspectiveCamera) {
    this.camera = cam;
  }

  setTarget(flight: FlightController) {
    this.flight = flight;
  }

  shake(amount = 1.2, duration = 0.3) {
    this.shakeAmp = amount;
    this.shakeTime = duration;
  }

  update(dt: number) {
    if (!this.camera || !this.flight) return;

    const pos = this.flight.position;
    const rot = this.flight.rotation;

    // Compute ideal camera position in world space: offset rotated by player
    const offsetWorld = this.offset.clone().applyEuler(rot).add(pos);

    // Smooth follow
    this.camera.position.lerp(offsetWorld, this.lerpPos);

    // Look target ahead of player
    const forward = new THREE.Vector3(0, 0, 1).applyEuler(rot);
    const lookTarget = pos.clone().addScaledVector(forward, this.lookAhead);
    // Smooth look via quaternion slerp? Simpler: lerp target
    // Compute direction to lookTarget
    const currentLook = new THREE.Vector3();
    this.camera.getWorldDirection(currentLook);
    // Use lookAt with damping: we maintain a virtual look point that lerps
    if (!(this as any)._lookPt) (this as any)._lookPt = lookTarget.clone();
    const lookPt: THREE.Vector3 = (this as any)._lookPt;
    lookPt.lerp(lookTarget, this.lerpLook);
    this.camera.lookAt(lookPt);

    // Add roll influence: camera roll follows player roll slightly
    this.camera.rotation.z = THREE.MathUtils.lerp(this.camera.rotation.z, rot.z * 0.35, 0.08);

    // Shake
    if (this.shakeTime > 0) {
      this.shakeTime -= dt;
      const s = this.shakeAmp * (this.shakeTime / 0.3);
      this.camera.position.x += (Math.random() - 0.5) * s;
      this.camera.position.y += (Math.random() - 0.5) * s;
      if (this.shakeTime <= 0) this.shakeAmp = 0;
    }

    // FOV speed effect
    const speed = this.flight.getSpeed();
    const targetFov = 75 + (speed - 50) * 0.08;
    this.camera.fov = THREE.MathUtils.lerp(this.camera.fov, targetFov, 0.04);
    this.camera.updateProjectionMatrix();
  }
}
