import { InputManager } from "./InputManager";

export class FlightController {
  private input: InputManager;

  // Placeholder flight state
  public position = { x: 0, y: 50, z: 0 };
  public rotation = { x: 0, y: 0, z: 0 };
  public velocity = { x: 0, y: 0, z: 0 };

  constructor(input: InputManager) {
    this.input = input;
  }

  update(dt: number) {
    // TODO: Implement flight physics based on input
  }
}
