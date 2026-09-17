import { Room, Client } from "colyseus";
import { GameState, Player, Bullet } from "../schemas/GameState";
import { config } from "../config";

type InputState = {
  pitch: number; // -1..1 (W/S)
  yaw: number;   // -1..1 (A/D)
  roll: number;  // -1..1 (Q/E)
  thrust: number; // -1..1 (shift/ctrl)
  mouseX: number;
  mouseY: number;
};

export class GameRoom extends Room<GameState> {
  maxClients = config.maxClientsPerRoom;
  private inputs = new Map<string, InputState>();
  private bulletCounter = 0;
  private dtMs = 1000 / config.tickRate;

  onCreate(options: any) {
    console.log("GameRoom created", options);
    this.setState(new GameState());
    this.setSimulationInterval(() => this.update(), this.dtMs);

    this.onMessage("input", (client, msg: Partial<InputState>) => {
      const cur = this.inputs.get(client.sessionId) || { pitch: 0, yaw: 0, roll: 0, thrust: 0, mouseX: 0, mouseY: 0 };
      // Clamp and merge
      if (typeof msg.pitch === "number") cur.pitch = Math.max(-1, Math.min(1, msg.pitch));
      if (typeof msg.yaw === "number") cur.yaw = Math.max(-1, Math.min(1, msg.yaw));
      if (typeof msg.roll === "number") cur.roll = Math.max(-1, Math.min(1, msg.roll));
      if (typeof msg.thrust === "number") cur.thrust = Math.max(-1, Math.min(1, msg.thrust));
      if (typeof msg.mouseX === "number") cur.mouseX = msg.mouseX;
      if (typeof msg.mouseY === "number") cur.mouseY = msg.mouseY;
      this.inputs.set(client.sessionId, cur);
    });

    this.onMessage("fire", (client) => {
      const p = this.state.players.get(client.sessionId);
      if (!p || !p.alive) return;
      const now = Date.now();
      if (now - p.lastFire < config.fireCooldownMs) return;
      p.lastFire = now;
      this.spawnBullet(p);
    });

    // Alternative combined input+fire message for lag-sensitive clients
    this.onMessage("input_fire", (client, msg: Partial<InputState>) => {
      const cur = this.inputs.get(client.sessionId) || { pitch: 0, yaw: 0, roll: 0, thrust: 0, mouseX: 0, mouseY: 0 };
      if (typeof msg.pitch === "number") cur.pitch = Math.max(-1, Math.min(1, msg.pitch));
      if (typeof msg.yaw === "number") cur.yaw = Math.max(-1, Math.min(1, msg.yaw));
      if (typeof msg.roll === "number") cur.roll = Math.max(-1, Math.min(1, msg.roll));
      if (typeof msg.thrust === "number") cur.thrust = Math.max(-1, Math.min(1, msg.thrust));
      this.inputs.set(client.sessionId, cur);
      const p = this.state.players.get(client.sessionId);
      if (!p || !p.alive) return;
      const now = Date.now();
      if (now - p.lastFire < config.fireCooldownMs) return;
      p.lastFire = now;
      this.spawnBullet(p);
    });
  }

  onJoin(client: Client, options: any) {
    console.log(client.sessionId, "joined");
    const p = new Player();
    p.sessionId = client.sessionId;
    const spawn = this.randomSpawn();
    p.x = spawn.x;
    p.y = spawn.y;
    p.z = spawn.z;
    p.rotY = spawn.yaw;
    p.health = 100;
    p.score = 0;
    p.alive = true;
    this.state.players.set(client.sessionId, p);
    this.inputs.set(client.sessionId, { pitch: 0, yaw: 0, roll: 0, thrust: 0, mouseX: 0, mouseY: 0 });
    this.broadcast("playerJoined", { id: client.sessionId }, { except: client });
  }

  onLeave(client: Client, consented: boolean) {
    console.log(client.sessionId, "left");
    this.state.players.delete(client.sessionId);
    this.inputs.delete(client.sessionId);
    // Clean bullets owned by leaver
    for (const [id, b] of this.state.bullets) {
      if (b.ownerId === client.sessionId) this.state.bullets.delete(id);
    }
    this.broadcast("playerLeft", { id: client.sessionId });
  }

  onDispose() {
    console.log("GameRoom disposed");
  }

  private randomSpawn() {
    const r = config.worldSize * 0.3;
    return {
      x: (Math.random() - 0.5) * r,
      y: 80 + Math.random() * 80,
      z: (Math.random() - 0.5) * r,
      yaw: Math.random() * Math.PI * 2,
    };
  }

  private spawnBullet(owner: Player) {
    const id = `b_${this.bulletCounter++}_${Date.now()}`;
    const b = new Bullet();
    b.id = id;
    b.ownerId = owner.sessionId;
    // forward vector from yaw/pitch
    const cosP = Math.cos(owner.rotX);
    const sinP = Math.sin(owner.rotX);
    const cosY = Math.cos(owner.rotY);
    const sinY = Math.sin(owner.rotY);
    const fx = sinY * cosP;
    const fy = sinP;
    const fz = cosY * cosP;
    const offset = 12;
    b.x = owner.x + fx * offset;
    b.y = owner.y + fy * offset;
    b.z = owner.z + fz * offset;
    const speed = config.bulletSpeed;
    // inherit half player velocity
    b.vx = fx * speed + owner.vx * 0.5;
    b.vy = fy * speed + owner.vy * 0.5;
    b.vz = fz * speed + owner.vz * 0.5;
    b.life = config.bulletLifeMs;
    this.state.bullets.set(id, b);
    this.broadcast("bulletFired", { id, ownerId: owner.sessionId, x: b.x, y: b.y, z: b.z });
  }

  update() {
    const dt = this.dtMs / 1000; // seconds
    this.state.serverTime += this.dtMs;

    // Update players
    for (const [id, p] of this.state.players) {
      if (!p.alive) continue;
      const input = this.inputs.get(id) || { pitch: 0, yaw: 0, roll: 0, thrust: 0, mouseX: 0, mouseY: 0 };

      // Arcade flight: rotation rates
      const pitchRate = 1.1; // rad/s
      const yawRate = 0.9;
      const rollRate = 1.6;

      // Mouse contributes to yaw/pitch (optional)
      // Center-normalized mouse delta already handled client-side, we ignore raw mouse here
      p.rotX += input.pitch * pitchRate * dt;
      p.rotY += input.yaw * yawRate * dt;
      p.rotZ += input.roll * rollRate * dt;

      // Clamp pitch to avoid flip
      const maxPitch = Math.PI * 0.45;
      p.rotX = Math.max(-maxPitch, Math.min(maxPitch, p.rotX));
      // Auto-level roll slightly
      p.rotZ *= 1 - 2.0 * dt; // damp roll

      // Speed control via thrust
      // Current speed magnitude
      let speed = Math.sqrt(p.vx * p.vx + p.vy * p.vy + p.vz * p.vz);
      if (speed < 5) speed = config.minSpeed; // initial push
      const thrustAccel = 90;
      const drag = 0.06;
      speed += input.thrust * thrustAccel * dt;
      speed *= 1 - drag * dt * 6;
      speed = Math.max(config.minSpeed, Math.min(config.maxSpeed, speed));

      const cosP = Math.cos(p.rotX);
      const sinP = Math.sin(p.rotX);
      const cosY = Math.cos(p.rotY);
      const sinY = Math.sin(p.rotY);
      const fx = sinY * cosP;
      const fy = -sinP; // invert so pitch up = climb (positive pitch => negative fy? adjust)
      // Actually we want pitch up => positive Y; our rotX positive should increase Y.
      // We used sinP for fy earlier, keep consistent: fy = sinP gives pitch up => climb.
      // Fix: recompute with sinP
      const fy2 = sinP;
      const fz = cosY * cosP;

      p.vx = fx * speed;
      p.vy = fy2 * speed;
      p.vz = fz * speed;

      p.x += p.vx * dt;
      p.y += p.vy * dt;
      p.z += p.vz * dt;

      // Altitude clamp
      if (p.y < config.minAltitude) {
        p.y = config.minAltitude;
        p.vy = Math.max(0, p.vy);
        // Pull pitch up if too low
        p.rotX = Math.max(p.rotX, 0.1);
      }
      if (p.y > config.maxAltitude) {
        p.y = config.maxAltitude;
        p.vy = Math.min(0, p.vy);
      }

      // World bounds wrap (torus)
      const half = config.worldSize / 2;
      if (p.x < -half) p.x = half;
      if (p.x > half) p.x = -half;
      if (p.z < -half) p.z = half;
      if (p.z > half) p.z = -half;
    }

    // Update bullets
    const toDelete: string[] = [];
    for (const [id, b] of this.state.bullets) {
      b.x += b.vx * dt;
      b.y += b.vy * dt;
      b.z += b.vz * dt;
      b.life -= this.dtMs;
      if (b.life <= 0) {
        toDelete.push(id);
        continue;
      }
      // Out of bounds
      const half = config.worldSize / 2 + 200;
      if (Math.abs(b.x) > half || Math.abs(b.z) > half || b.y < 0 || b.y > config.maxAltitude + 200) {
        toDelete.push(id);
        continue;
      }
      // Collision with players
      for (const [pid, p] of this.state.players) {
        if (!p.alive) continue;
        if (pid === b.ownerId) continue;
        const dx = b.x - p.x;
        const dy = b.y - p.y;
        const dz = b.z - p.z;
        const distSq = dx * dx + dy * dy + dz * dz;
        const hitRadius = config.playerRadius;
        if (distSq < hitRadius * hitRadius) {
          // Hit
          p.health -= 25;
          toDelete.push(id);
          this.broadcast("hit", { targetId: pid, attackerId: b.ownerId, health: p.health, x: p.x, y: p.y, z: p.z });
          if (p.health <= 0) {
            p.health = 0;
            p.alive = false;
            p.deaths += 1;
            const attacker = this.state.players.get(b.ownerId);
            if (attacker) {
              attacker.score += 1;
              attacker.kills += 1;
            }
            this.broadcast("kill", { targetId: pid, attackerId: b.ownerId, x: p.x, y: p.y, z: p.z });
            // Schedule respawn
            setTimeout(() => {
              const target = this.state.players.get(pid);
              if (target) {
                const sp = this.randomSpawn();
                target.x = sp.x;
                target.y = sp.y;
                target.z = sp.z;
                target.rotX = 0;
                target.rotY = sp.yaw;
                target.rotZ = 0;
                target.vx = 0;
                target.vy = 0;
                target.vz = 0;
                target.health = 100;
                target.alive = true;
                this.broadcast("respawn", { id: pid, x: target.x, y: target.y, z: target.z });
              }
            }, config.respawnDelayMs);
          }
          break;
        }
      }
    }
    for (const id of toDelete) this.state.bullets.delete(id);
  }
}
