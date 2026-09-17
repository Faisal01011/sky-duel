import { Schema, type, MapSchema } from "@colyseus/schema";

export class Player extends Schema {
  @type("string") sessionId: string = "";
  @type("number") x: number = 0;
  @type("number") y: number = 50;
  @type("number") z: number = 0;
  @type("number") rotX: number = 0;
  @type("number") rotY: number = 0;
  @type("number") rotZ: number = 0;
  @type("number") vx: number = 0;
  @type("number") vy: number = 0;
  @type("number") vz: number = 0;
  @type("number") health: number = 100;
  @type("number") score: number = 0;
  @type("number") kills: number = 0;
  @type("number") deaths: number = 0;
  @type("boolean") alive: boolean = true;
  @type("number") lastFire: number = 0;
}

export class Bullet extends Schema {
  @type("string") id: string = "";
  @type("string") ownerId: string = "";
  @type("number") x: number = 0;
  @type("number") y: number = 0;
  @type("number") z: number = 0;
  @type("number") vx: number = 0;
  @type("number") vy: number = 0;
  @type("number") vz: number = 0;
  @type("number") life: number = 3000; // ms remaining
}

export class GameState extends Schema {
  @type({ map: Player }) players = new MapSchema<Player>();
  @type({ map: Bullet }) bullets = new MapSchema<Bullet>();
  @type("number") serverTime: number = 0;
}
