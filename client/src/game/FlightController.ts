import { InputManager } from "./InputManager";
import * as THREE from "three";

export type FlightInput = {
  pitch: number; // -1..1
  yaw: number;
  roll: number;
  thrust: number; // -1..1 derived from throttle
};

export class FlightController {
  private input: InputManager;

  public position = new THREE.Vector3(0, 82, 0);
  public rotation = new THREE.Euler(0, 0, 0, "YXZ");
  public velocity = new THREE.Vector3(0, 0, 50);
  private speed = 58;

  // War Thunder-like config
  private readonly minSpeed = 18;
  private readonly maxSpeed = 195;
  private readonly accelPower = 88; // how fast speed approaches target
  private readonly drag = 0.042;
  private readonly pitchRate = 1.05; // rad/s (elevator)
  private readonly yawRate = 0.58;   // rudder less effective
  private readonly rollRate = 1.95;  // aileron
  private readonly maxPitch = Math.PI * 0.49;

  // Throttle latched 0..1 (War Thunder style) — W increases, S decreases
  private throttle = 0.58;
  private readonly throttleRate = 0.58; // per second 0->1 in ~1.7s

  private inputState: FlightInput = { pitch: 0, yaw: 0, roll: 0, thrust: 0 };

  constructor(input: InputManager) {
    this.input = input;
    // Capture mouse wheel for throttle fine control (War Thunder wheel = throttle)
    window.addEventListener("wheel", (e) => {
      // wheel up = throttle up
      const delta = -e.deltaY * 0.00055;
      this.throttle = THREE.MathUtils.clamp(this.throttle + delta, 0, 1);
    }, { passive: true });
  }

  update(dt: number) {
    // ----- Gather War Thunder inputs -----
    // Throttle latched: W up, S down (like WT realistic)
    if (this.input.isKeyDown("KeyW")) {
      this.throttle = THREE.MathUtils.clamp(this.throttle + this.throttleRate * dt, 0, 1);
    }
    if (this.input.isKeyDown("KeyS")) {
      this.throttle = THREE.MathUtils.clamp(this.throttle - this.throttleRate * dt, 0, 1);
    }
    // Also allow Shift/Ctrl as alternative throttle (some WT bindings)
    // Shift = throttle up, Ctrl = throttle down (if not using for pitch)
    // To avoid double, we treat them as slower throttle if W/S not pressed
    const usingWS = this.input.isKeyDown("KeyW") || this.input.isKeyDown("KeyS");
    if (!usingWS) {
      if (this.input.isKeyDown("ShiftLeft") || this.input.isKeyDown("ShiftRight")) {
        this.throttle = THREE.MathUtils.clamp(this.throttle + this.throttleRate * 0.72 * dt, 0, 1);
      }
      if (this.input.isKeyDown("ControlLeft") || this.input.isKeyDown("ControlRight")) {
        this.throttle = THREE.MathUtils.clamp(this.throttle - this.throttleRate * 0.72 * dt, 0, 1);
      }
    }

    // Convert latched throttle 0..1 to thrust -1..1 for server (0.5 neutral)
    const thrust = this.throttle * 2 - 1;

    // Roll: A/D (WT ailerons) - banking
    let roll = 0;
    if (this.input.isKeyDown("KeyA")) roll -= 1;
    if (this.input.isKeyDown("KeyD")) roll += 1;

    // Yaw (rudder): Q/E (WT)
    let yaw = 0;
    if (this.input.isKeyDown("KeyQ")) yaw -= 1;
    if (this.input.isKeyDown("KeyE")) yaw += 1;

    // Pitch: multiple sources (WT elevator)
    // 1) ArrowUp/Down (primary keyboard pitch)
    // 2) Mouse Y offset from center (mouse aim like WT) — always active unless RMB frees look
    // 3) Shift/Ctrl pitch not needed now because they are throttle; we use arrows instead
    let pitch = 0;
    if (this.input.isKeyDown("ArrowUp")) pitch -= 1; // nose down
    if (this.input.isKeyDown("ArrowDown")) pitch += 1; // nose up
    // Mouse aim: vertical mouse offset controls pitch (War Thunder mouse aim)
    // If player is holding Right Mouse, we treat as free look and skip mouse pitch to allow camera
    const isFreeLook = this.input.isMouseDown(2);
    if (!isFreeLook) {
      const m = this.input.getMouse();
      const cx = window.innerWidth / 2;
      const cy = window.innerHeight / 2;
      // Normalize to -1..1 with deadzone
      const dy = (m.y - cy) / (cy * 0.72);
      const dx = (m.x - cx) / (cx * 0.72);
      // Deadzone 0.08
      const dead = 0.08;
      let mousePitch = 0;
      let mouseYaw = 0;
      if (Math.abs(dy) > dead) mousePitch = -THREE.MathUtils.clamp((dy - Math.sign(dy) * dead) / (1 - dead), -1, 1);
      if (Math.abs(dx) > dead) mouseYaw = THREE.MathUtils.clamp((dx - Math.sign(dx) * dead) / (1 - dead), -1, 1);
      // War Thunder mouse aim is strong for pitch/yaw but roll is keyboard
      // Weight mouse 0.92 for pitch, 0.65 for yaw
      pitch += mousePitch * 0.92;
      yaw += mouseYaw * 0.58;
    } else {
      // In free look, mouse still can give yaw/pitch but reduced
      const m = this.input.getMouse();
      const cx = window.innerWidth / 2;
      const cy = window.innerHeight / 2;
      const dx = (m.x - cx) / cx;
      const dy = (m.y - cy) / cy;
      yaw += dx * 0.35;
      pitch -= dy * 0.32;
    }

    // Clamp
    pitch = THREE.MathUtils.clamp(pitch, -1, 1);
    yaw = THREE.MathUtils.clamp(yaw, -1, 1);
    roll = THREE.MathUtils.clamp(roll, -1, 1);

    this.inputState = { pitch, yaw, roll, thrust };

    // ----- Physics (War Thunder feel) -----
    // Rotation with inertia and slight coupling: roll induces yaw a bit (adverse yaw)
    const effectivePitchRate = this.pitchRate * (0.92 + this.throttle * 0.16); // more authority at high speed/throttle
    const effectiveRollRate = this.rollRate * (0.9 + this.throttle * 0.22);
    const effectiveYawRate = this.yawRate * (0.85 + this.throttle * 0.12);

    this.rotation.x += pitch * effectivePitchRate * dt;
    this.rotation.y += yaw * effectiveYawRate * dt;
    this.rotation.z += roll * effectiveRollRate * dt;

    // Coordinated turn: banking should induce a bit of yaw (like WT)
    // When rolling, slightly yaw into the turn for realism
    if (Math.abs(roll) > 0.15) {
      this.rotation.y += roll * 0.22 * dt;
    }

    this.rotation.x = THREE.MathUtils.clamp(this.rotation.x, -this.maxPitch, this.maxPitch);
    // War Thunder less auto-level than arcade: gentle return, not snap
    this.rotation.z *= Math.max(0, 1 - 0.55 * dt);

    // Speed target from throttle (War Thunder: throttle directly maps to target speed with energy)
    const targetSpeed = THREE.MathUtils.lerp(this.minSpeed, this.maxSpeed, this.throttle);
    // Accelerate towards target with power and drag
    const speedDiff = targetSpeed - this.speed;
    const accel = Math.sign(speedDiff) * Math.min(Math.abs(speedDiff) * 1.8, this.accelPower);
    this.speed += accel * dt;
    // Drag at high speed
    this.speed *= 1 - this.drag * dt * (0.6 + this.throttle * 0.6);
    this.speed = THREE.MathUtils.clamp(this.speed, 8, this.maxSpeed + 12);

    // Apply velocity from forward vector (with slight pitch influence on lift)
    const forward = new THREE.Vector3(0, 0, 1).applyEuler(this.rotation);
    this.velocity.copy(forward).multiplyScalar(this.speed);
    // Add small lift when pitched up at speed (energy retention like WT)
    if (this.speed > 42) {
      const liftFactor = Math.sin(this.rotation.x) * this.speed * 0.06;
      this.velocity.y += liftFactor * dt * 12;
    }

    this.position.addScaledVector(this.velocity, dt);

    // Altitude clamp with stall warning feel
    const minAlt = 7;
    const maxAlt = 860;
    if (this.position.y < minAlt) {
      this.position.y = minAlt;
      this.velocity.y = Math.max(0, this.velocity.y);
      this.rotation.x = Math.max(this.rotation.x, 0.14);
      // Stall + ground effect: auto increase throttle a bit?
      this.speed = Math.max(this.speed, 36);
    }
    if (this.position.y > maxAlt) {
      this.position.y = maxAlt;
      this.velocity.y = Math.min(0, this.velocity.y);
      // Thin air drag
      this.speed *= 1 - 0.02 * dt;
    }

    // World wrap
    const half = 1000;
    if (this.position.x < -half) this.position.x = half;
    if (this.position.x > half) this.position.x = -half;
    if (this.position.z < -half) this.position.z = half;
    if (this.position.z > half) this.position.z = -half;
  }

  getInputState(): FlightInput { return { ...this.inputState }; }
  getThrottle(): number { return this.throttle; }
  getForward(): THREE.Vector3 { return new THREE.Vector3(0, 0, 1).applyEuler(this.rotation); }
  getSpeed(): number { return this.speed; }
  getAltitude(): number { return this.position.y; }

  setFromServer(x: number, y: number, z: number, rotX: number, rotY: number, rotZ: number, vx: number, vy: number, vz: number, lerp = 0.16) {
    const targetPos = new THREE.Vector3(x, y, z);
    this.position.lerp(targetPos, lerp);
    this.rotation.x = THREE.MathUtils.lerp(this.rotation.x, rotX, lerp);
    this.rotation.y = (THREE.MathUtils as any).lerpAngle(this.rotation.y, rotY, lerp);
    this.rotation.z = (THREE.MathUtils as any).lerpAngle(this.rotation.z, rotZ, lerp);
    const targetVel = new THREE.Vector3(vx, vy, vz);
    this.velocity.lerp(targetVel, lerp);
    const sp = targetVel.length();
    if (sp > 1) this.speed = THREE.MathUtils.lerp(this.speed, sp, lerp);
    // Also lerp throttle to reflect server speed
    const inferredThrottle = THREE.MathUtils.clamp((sp - this.minSpeed) / (this.maxSpeed - this.minSpeed), 0, 1);
    this.throttle = THREE.MathUtils.lerp(this.throttle, inferredThrottle, lerp * 0.5);
  }

  teleport(x: number, y: number, z: number, yaw: number) {
    this.position.set(x, y, z);
    this.rotation.set(0, yaw, 0);
    this.velocity.set(0, 0, 0);
    this.speed = 58;
    this.throttle = 0.58;
  }
}

declare module "three" {
  namespace MathUtils { function lerpAngle(a: number, b: number, t: number): number; }
}
if (!(THREE.MathUtils as any).lerpAngle) {
  (THREE.MathUtils as any).lerpAngle = (a: number, b: number, t: number) => {
    const diff = Math.atan2(Math.sin(b - a), Math.cos(b - a));
    return a + diff * t;
  };
}
