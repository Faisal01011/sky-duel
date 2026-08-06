export class InputManager {
  private keys: Set<string> = new Set();
  private mouse = { x: 0, y: 0, buttons: 0 };

  constructor() {
    window.addEventListener("keydown", (e) => this.keys.add(e.code));
    window.addEventListener("keyup", (e) => this.keys.delete(e.code));
    window.addEventListener("mousemove", (e) => {
      this.mouse.x = e.clientX;
      this.mouse.y = e.clientY;
    });
    window.addEventListener("mousedown", (e) => {
      this.mouse.buttons |= 1 << e.button;
    });
    window.addEventListener("mouseup", (e) => {
      this.mouse.buttons &= ~(1 << e.button);
    });
  }

  isKeyDown(code: string): boolean {
    return this.keys.has(code);
  }

  isMouseDown(button = 0): boolean {
    return (this.mouse.buttons & (1 << button)) !== 0;
  }

  getMouse() {
    return this.mouse;
  }

  update() {
    // Can be used for edge-triggered input later
  }
}
