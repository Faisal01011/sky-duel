import { Client, Room } from "colyseus.js";
import * as THREE from "three";
import type { FlightController } from "./FlightController";
import type { WeaponSystem } from "./WeaponSystem";
import type { Environment } from "./Environment";
import type { UIManager } from "./UIManager";
import type { EffectsManager } from "./EffectsManager";
import type { AudioManager } from "./AudioManager";
import { createFighterJet, updateFighterJetAnimation } from "./FighterFactory";

type RemotePlayer = {
  mesh: THREE.Group;
  targetPos: THREE.Vector3;
  targetRot: THREE.Euler;
  health: number;
  score: number;
  kills: number;
  deaths: number;
  alive: boolean;
};

// Minimal server state type for client
type ServerPlayer = {
  sessionId: string;
  x: number; y: number; z: number;
  rotX: number; rotY: number; rotZ: number;
  vx: number; vy: number; vz: number;
  health: number; score: number; kills: number; deaths: number; alive: boolean;
};
type ServerBullet = {
  id: string; ownerId: string; x: number; y: number; z: number; vx: number; vy: number; vz: number; life: number;
};
type ServerState = {
  players: Map<string, ServerPlayer> | any;
  bullets: Map<string, ServerBullet> | any;
  serverTime: number;
};

export class NetworkManager {
  private client: Client;
  private room: Room<ServerState> | null = null;
  private flight: FlightController | null = null;
  private weapon: WeaponSystem | null = null;
  private environment: Environment | null = null;
  private ui: UIManager | null = null;
  private effects: EffectsManager | null = null;
  private audio: AudioManager | null = null;

  private remotePlayers = new Map<string, RemotePlayer>();
  private serverBulletsPrev = new Set<string>();
  private sendAccum = 0;
  private readonly sendInterval = 0.05; // 20 Hz
  private localId: string | null = null;
  private connected = false;

  // Stats
  public latency = 0;
  public playersCount = 0;

  constructor() {
    const host = (import.meta as any).env?.VITE_SERVER_URL || "ws://localhost:2567";
    this.client = new Client(host);
  }

  setFlightController(fc: FlightController) { this.flight = fc; }
  setWeaponSystem(ws: WeaponSystem) { this.weapon = ws; }
  setEnvironment(env: Environment) { this.environment = env; }
  setUIManager(ui: UIManager) { this.ui = ui; }
  setEffectsManager(em: EffectsManager) { this.effects = em; }
  setAudioManager(am: AudioManager) { this.audio = am; }

  async connect() {
    try {
      this.room = await this.client.joinOrCreate<ServerState>("game");
      this.localId = this.room.sessionId;
      this.connected = true;
      console.log("Joined room:", this.room.sessionId, "id:", this.localId);

      // State change sync
      this.room.onStateChange((state) => {
        this.syncState(state);
      });

      // Custom messages
      this.room.onMessage("hit", (msg) => {
        // { targetId, attackerId, health, x,y,z }
        if (this.effects && msg.x !== undefined) {
          this.effects.spawnHit(new THREE.Vector3(msg.x, msg.y, msg.z));
        }
        if (this.audio) this.audio.play("hit");
        if (msg.targetId === this.localId) {
          this.ui?.flashDamage();
          this.ui?.setHealth(msg.health);
        }
        this.ui?.addLog(`${msg.attackerId.slice(0,4)} hit ${msg.targetId.slice(0,4)}`);
      });

      this.room.onMessage("kill", (msg) => {
        if (this.effects) this.effects.spawnExplosion(new THREE.Vector3(msg.x, msg.y, msg.z));
        if (this.audio) this.audio.play("explosion");
        this.ui?.addLog(`💥 ${msg.targetId.slice(0,4)} destroyed by ${msg.attackerId.slice(0,4)}`);
      });

      this.room.onMessage("respawn", (msg) => {
        if (msg.id === this.localId && this.flight) {
          this.flight.teleport(msg.x, msg.y, msg.z, Math.random()*Math.PI*2);
          this.ui?.setHealth(100);
          this.ui?.addLog("Respawned!");
          if (this.effects) this.effects.spawnRespawn(new THREE.Vector3(msg.x, msg.y, msg.z));
        } else {
          const rp = this.remotePlayers.get(msg.id);
          if (rp) {
            rp.targetPos.set(msg.x, msg.y, msg.z);
            rp.mesh.position.copy(rp.targetPos);
            rp.mesh.visible = true;
            rp.alive = true;
          }
        }
      });

      this.room.onMessage("bulletFired", (msg) => {
        // Visual for remote bullets only
        if (msg.ownerId === this.localId) return;
        if (!this.weapon || !this.flight) return;
        const pos = new THREE.Vector3(msg.x, msg.y, msg.z);
        // Need velocity -> approximate from owner forward
        // For now, lookup owner remote or reconstruct
        const rp = this.remotePlayers.get(msg.ownerId);
        let vel: THREE.Vector3;
        if (rp) {
          const f = new THREE.Vector3(0,0,1).applyEuler(rp.targetRot);
          vel = f.multiplyScalar(320);
        } else {
          vel = new THREE.Vector3(0,0,320);
        }
        this.weapon.spawnRemote(pos, vel);
        if (this.audio) this.audio.play("shoot");
      });

      this.room.onMessage("playerJoined", (msg) => {
        this.ui?.addLog(`Player ${msg.id.slice(0,4)} joined`);
      });
      this.room.onMessage("playerLeft", (msg) => {
        this.removeRemote(msg.id);
        this.ui?.addLog(`Player ${msg.id.slice(0,4)} left`);
      });

      this.room.onLeave((code) => {
        console.log("Left room", code);
        this.connected = false;
      });

    } catch (err) {
      console.error("Failed to connect:", err);
      this.ui?.addLog("Failed to connect to server");
    }
  }

  private syncState(state: ServerState) {
    if (!state || !state.players) return;
    // Handle MapSchema vs plain Map vs object
    const playersMap: Map<string, ServerPlayer> = state.players as any;
    const getPlayers = (): Iterable<[string, ServerPlayer]> => {
      if (playersMap instanceof Map) return playersMap.entries();
      // @colyseus/schema MapSchema has forEach and get/has but may not be Map
      if (typeof (playersMap as any).forEach === "function") {
        const arr: [string, ServerPlayer][] = [];
        (playersMap as any).forEach((v: ServerPlayer, k: string) => arr.push([k, v]));
        return arr;
      }
      // plain object
      return Object.entries(playersMap as any) as any;
    };

    const seen = new Set<string>();
    for (const [id, p] of getPlayers()) {
      seen.add(id);
      if (id === this.localId) {
        // Correct local player (reconciliation)
        if (this.flight) {
          // Only lerp if distance > threshold to avoid jitter
          const dist = this.flight.position.distanceTo(new THREE.Vector3(p.x, p.y, p.z));
          if (dist > 2) {
            this.flight.setFromServer(p.x, p.y, p.z, p.rotX, p.rotY, p.rotZ, p.vx, p.vy, p.vz, 0.15);
          }
          this.ui?.setHealth(p.health);
          this.ui?.setScore(p.score);
          this.ui?.setAlive(p.alive);
          if (!p.alive) this.ui?.setHealth(0);
        }
        continue;
      }
      // Remote
      let rp = this.remotePlayers.get(id);
      if (!rp) {
        rp = this.createRemotePlayer(id, p);
        this.remotePlayers.set(id, rp);
      }
      rp.targetPos.set(p.x, p.y, p.z);
      rp.targetRot.set(p.rotX, p.rotY, p.rotZ);
      rp.health = p.health;
      rp.score = p.score;
      rp.kills = p.kills;
      rp.deaths = p.deaths;
      rp.alive = p.alive;
      rp.mesh.visible = p.alive;
      // Scoreboard update
    }

    // Cleanup disconnected
    for (const id of [...this.remotePlayers.keys()]) {
      if (!seen.has(id)) this.removeRemote(id);
    }
    this.playersCount = seen.size;

    // Bullets sync (optional visualizing server bullets directly)
    // We already handle via bulletFired messages, but also sync map for interpolation if needed
    // Could spawn missing server bullets for demo; here we just track count
    if (state.bullets) {
      const bulletsMap: any = state.bullets;
      let count = 0;
      if (bulletsMap instanceof Map) count = bulletsMap.size;
      else if (typeof bulletsMap.forEach === "function") { count = 0; bulletsMap.forEach(()=>count++); }
      else if (typeof bulletsMap === "object") count = Object.keys(bulletsMap).length;
      // Not used visually beyond events
    }

    this.ui?.setPlayers(seen.size, this.remotePlayers);
  }

  private createRemotePlayer(id: string, p: ServerPlayer): RemotePlayer {
    const group = this.createPlaneMesh(id);
    group.position.set(p.x, p.y, p.z);
    group.rotation.set(p.rotX, p.rotY, p.rotZ);
    if (this.environment) this.environment.getScene().add(group);

    return {
      mesh: group,
      targetPos: new THREE.Vector3(p.x, p.y, p.z),
      targetRot: new THREE.Euler(p.rotX, p.rotY, p.rotZ),
      health: p.health,
      score: p.score,
      kills: p.kills ?? 0,
      deaths: p.deaths ?? 0,
      alive: p.alive,
    };
  }

  private createPlaneMesh(id: string): THREE.Group {
    const color = this.colorForId(id);
    const jet = createFighterJet(color, id.slice(0, 4)) as THREE.Group;
    // Tag for animation system expects _afterburner etc already set
    return jet;
  }

  private colorForId(id: string): number {
    let h = 0;
    for (let i = 0; i < id.length; i++) h = (h * 31 + id.charCodeAt(i)) % 360;
    const c = new THREE.Color().setHSL(h / 360, 0.75, 0.55);
    return c.getHex();
  }

  private removeRemote(id: string) {
    const rp = this.remotePlayers.get(id);
    if (rp) {
      if (rp.mesh.parent) rp.mesh.parent.remove(rp.mesh);
      this.remotePlayers.delete(id);
    }
  }

  update(dt: number) {
    // Send input at fixed rate
    this.sendAccum += dt;
    if (this.sendAccum >= this.sendInterval && this.room && this.flight && this.connected) {
      this.sendAccum = 0;
      const inp = this.flight.getInputState();
      // Colyseus send
      this.room.send("input", {
        pitch: inp.pitch,
        yaw: inp.yaw,
        roll: inp.roll,
        thrust: inp.thrust,
      });
    }

    // Interpolate remotes
    for (const rp of this.remotePlayers.values()) {
      rp.mesh.position.lerp(rp.targetPos, 0.12);
      // Slerp rotation
      const curEuler = rp.mesh.rotation;
      curEuler.x = THREE.MathUtils.lerp(curEuler.x, rp.targetRot.x, 0.12);
      // Use lerpAngle for Y
      const lerpAngle = (a: number, b: number, t: number) => {
        const diff = Math.atan2(Math.sin(b - a), Math.cos(b - a));
        return a + diff * t;
      };
      curEuler.y = lerpAngle(curEuler.y, rp.targetRot.y, 0.12);
      curEuler.z = lerpAngle(curEuler.z, rp.targetRot.z, 0.12);

      // Afterburner based on velocity
      const speed = new THREE.Vector3().subVectors(rp.targetPos, rp.mesh.position).length() / Math.max(dt, 0.016) * 0.12 + 45; // approx
      const isBurner = speed > 78;
      updateFighterJetAnimation(rp.mesh as any, dt, speed, isBurner);
    }
  }

  sendFire() {
    if (!this.room || !this.connected) return;
    this.room.send("fire", {});
  }

  disconnect() {
    this.room?.leave();
    this.room = null;
    this.connected = false;
    for (const id of [...this.remotePlayers.keys()]) this.removeRemote(id);
  }

  isConnected(): boolean { return this.connected; }
  getLocalId(): string | null { return this.localId; }
  getRemotePlayers(): Map<string, RemotePlayer> { return this.remotePlayers; }
}
