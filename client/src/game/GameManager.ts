import { Environment } from "./Environment";
import { FlightController } from "./FlightController";
import { WeaponSystem } from "./WeaponSystem";
import { NetworkManager } from "./NetworkManager";
import { EffectsManager } from "./EffectsManager";
import { AudioManager } from "./AudioManager";
import { CameraController } from "./CameraController";
import { UIManager } from "./UIManager";
import { InputManager } from "./InputManager";

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
  }

  async start() {
    await this.networkManager.connect();
    this.running = true;
    this.lastTime = performance.now();
    requestAnimationFrame(this.loop);
  }

  private loop = (time: number) => {
    if (!this.running) return;

    const dt = (time - this.lastTime) / 1000;
    this.lastTime = time;

    this.update(dt);
    this.render();

    requestAnimationFrame(this.loop);
  };

  private update(dt: number) {
    this.inputManager.update();
    this.flightController.update(dt);
    this.weaponSystem.update(dt);
    this.networkManager.update(dt);
    this.effectsManager.update(dt);
    this.cameraController.update(dt);
    this.uiManager.update(dt);
  }

  private render() {
    this.environment.render();
  }

  stop() {
    this.running = false;
    this.networkManager.disconnect();
  }
}
