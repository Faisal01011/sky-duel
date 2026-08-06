import { Client, Room } from "colyseus.js";

export class NetworkManager {
  private client: Client;
  private room: Room | null = null;

  constructor() {
    this.client = new Client("ws://localhost:2567");
  }

  async connect() {
    try {
      this.room = await this.client.joinOrCreate("game");
      console.log("Joined room:", this.room.sessionId);

      this.room.onStateChange((state) => {
        // TODO: Sync remote players / bullets
      });

      this.room.onMessage("*", (type, message) => {
        // TODO: Handle custom messages
      });
    } catch (err) {
      console.error("Failed to connect:", err);
    }
  }

  update(dt: number) {
    // TODO: Send local player state at fixed rate
  }

  disconnect() {
    this.room?.leave();
    this.room = null;
  }
}
