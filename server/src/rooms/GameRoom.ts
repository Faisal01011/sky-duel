import { Room, Client } from "colyseus";

export class GameRoom extends Room {
  maxClients = 8;

  onCreate(options: any) {
    console.log("GameRoom created", options);
    this.setSimulationInterval(() => this.update(), 1000 / 20);
  }

  onJoin(client: Client, options: any) {
    console.log(client.sessionId, "joined");
  }

  onLeave(client: Client, consented: boolean) {
    console.log(client.sessionId, "left");
  }

  onDispose() {
    console.log("GameRoom disposed");
  }

  update() {
    // Game simulation tick
  }
}
