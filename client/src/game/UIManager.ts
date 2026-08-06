export class UIManager {
  private overlay: HTMLElement;

  constructor() {
    this.overlay = document.getElementById("ui-overlay") as HTMLElement;
  }

  update(dt: number) {
    // TODO: HUD, health, score, minimap, crosshair
  }
}
