import * as THREE from "three";

export class Environment {
  private scene: THREE.Scene;
  private camera: THREE.PerspectiveCamera;
  private renderer: THREE.WebGLRenderer;

  constructor(canvas: HTMLCanvasElement) {
    this.scene = new THREE.Scene();
    this.scene.background = new THREE.Color(0x87ceeb); // sky blue

    this.camera = new THREE.PerspectiveCamera(
      75,
      window.innerWidth / window.innerHeight,
      0.1,
      10000
    );
    this.camera.position.set(0, 50, 100);

    this.renderer = new THREE.WebGLRenderer({ canvas, antialias: true });
    this.renderer.setSize(window.innerWidth, window.innerHeight);
    this.renderer.setPixelRatio(Math.min(window.devicePixelRatio, 2));

    // Basic lighting
    const ambient = new THREE.AmbientLight(0xffffff, 0.6);
    this.scene.add(ambient);

    const sun = new THREE.DirectionalLight(0xffffff, 0.8);
    sun.position.set(100, 200, 50);
    this.scene.add(sun);

    // Simple ground plane
    const ground = new THREE.Mesh(
      new THREE.PlaneGeometry(2000, 2000),
      new THREE.MeshStandardMaterial({ color: 0x3a5f0b })
    );
    ground.rotation.x = -Math.PI / 2;
    this.scene.add(ground);

    window.addEventListener("resize", () => this.onResize());
  }

  private onResize() {
    this.camera.aspect = window.innerWidth / window.innerHeight;
    this.camera.updateProjectionMatrix();
    this.renderer.setSize(window.innerWidth, window.innerHeight);
  }

  render() {
    this.renderer.render(this.scene, this.camera);
  }

  getScene() {
    return this.scene;
  }

  getCamera() {
    return this.camera;
  }
}
