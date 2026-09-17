import { Environment } from "./Environment";
import { FlightController } from "./FlightController";
import { WeaponSystem } from "./WeaponSystem";
import { NetworkManager } from "./NetworkManager";
import { EffectsManager } from "./EffectsManager";
import { AudioManager } from "./AudioManager";
import { CameraController } from "./CameraController";
import { UIManager } from "./UIManager";
import { InputManager } from "./InputManager";
import * as THREE from "three";

export class GameManager {
  private canvas: HTMLCanvasElement;
  private environment: Environment;
  private flightController: FlightController;
  private weaponSystem: WeaponSystem;
  private networkManager: NetworkManager;
  private effectsManager: EffectsManager;
  private audioManager: AudioManager;
  private cameraController: CameraController;
  private uiManager: UIManager;
  private inputManager: InputManager;

  private running = false;
  private lastTime = 0;
  private contrailAccum = 0;

  constructor(canvas: HTMLCanvasElement) {
    this.canvas = canvas;

    this.environment = new Environment(canvas);
    this.inputManager = new InputManager();
    this.flightController = new FlightController(this.inputManager);
    this.weaponSystem = new WeaponSystem();
    this.networkManager = new NetworkManager();
    this.effectsManager = new EffectsManager();
    this.audioManager = new AudioManager();
    this.cameraController = new CameraController();
    this.uiManager = new UIManager();

    // Wiring
    this.environment.setFlightController(this.flightController);
    this.weaponSystem.setScene(this.environment.getScene());
    this.weaponSystem.setOnFire(() => {
      this.audioManager.play("shoot");
      // muzzle flash at nose
      const pos = this.flightController.position.clone();
      const fwd = this.flightController.getForward();
      this.effectsManager.spawnMuzzleFlash(pos.clone().addScaledVector(fwd, 7), fwd);
      this.cameraController.shake(0.45, 0.12);
    });
    this.effectsManager.setScene(this.environment.getScene());
    this.cameraController.setCamera(this.environment.getCamera());
    this.cameraController.setTarget(this.flightController);

    this.networkManager.setFlightController(this.flightController);
    this.networkManager.setWeaponSystem(this.weaponSystem);
    this.networkManager.setEnvironment(this.environment);
    this.networkManager.setUIManager(this.uiManager);
    this.networkManager.setEffectsManager(this.effectsManager);
    this.networkManager.setAudioManager(this.audioManager);

    // Minimap source
    this.uiManager.setMinimapSource(
      () => ({ x: this.flightController.position.x, z: this.flightController.position.z, yaw: this.flightController.rotation.y }),
      () => this.networkManager.getRemotePlayers() as any
    );

    // Keyboard fire fallback (Space)
    // Mouse handling is polled in update
  }

  async start() {
    await this.networkManager.connect();
    this.uiManager.addLog("Connected! War Thunder: W/S throttle, A/D roll, Q/E yaw, Mouse/↑↓ pitch");
    this.uiManager.addLog("Tip: Mouse aims pitch/yaw • RMB free look • Wheel throttle");
    this.running = true;
    this.lastTime = performance.now();
    requestAnimationFrame(this.loop);
  }

  private loop = (time: number) => {
    if (!this.running) return;

    let dt = (time - this.lastTime) / 1000;
    this.lastTime = time;
    // Clamp dt to avoid spiral on tab switch
    dt = Math.min(dt, 0.05);

    this.update(dt);
    this.render();

    requestAnimationFrame(this.loop);
  };

  private update(dt: number) {
    this.inputManager.update();
    this.flightController.update(dt);

    // Weapon firing (LMB or Space)
    const wantsFire = this.inputManager.isMouseDown(0) || this.inputManager.isKeyDown("Space");
    if (wantsFire && this.weaponSystem.canFire()) {
      const origin = this.flightController.position.clone();
      const fwd = this.flightController.getForward();
      const vel = this.flightController.velocity.clone();
      const b = this.weaponSystem.fire(origin, fwd, vel);
      if (b) {
        this.networkManager.sendFire();
      }
    }

    this.weaponSystem.update(dt);
    this.networkManager.update(dt);
    this.effectsManager.update(dt);
    this.environment.update(dt);
    this.cameraController.update(dt);
    this.uiManager.update(dt);

    // HUD flight info (WT throttle)
    this.uiManager.setFlightInfo(this.flightController.getSpeed(), this.flightController.getAltitude(), (this.flightController as any).getThrottle ? (this.flightController as any).getThrottle() : undefined);

    // Engine audio - use throttle for more responsive WT feel
    const thr = (this.flightController as any).getThrottle ? (this.flightController as any).getThrottle() : 0.5;
    const intensity = THREE.MathUtils.clamp(thr * 0.72 + (this.flightController.getSpeed() - 20) / 520, 0, 1);
    this.audioManager.setEngineIntensity(intensity);

    // Contrail - less frequent for perf (was 0.09)
    this.contrailAccum += dt;
    if (this.contrailAccum > 0.13) {
      this.contrailAccum = 0;
      if (this.flightController.getSpeed() > 82) {
        this.effectsManager.spawnContrail(this.flightController.position.clone().add(new THREE.Vector3(0, 0.2, -3.5).applyEuler(this.flightController.rotation)));
      }
    }
  }

  private render() {
    this.environment.render();
  }

  stop() {
    this.running = false;
    this.networkManager.disconnect();
  }
}
