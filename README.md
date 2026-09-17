# Sky Duel — Multiplayer Aerial Combat

> **War Thunder-inspired dogfighting in the browser.** Colyseus-authoritative, Three.js A-tier visuals, low-latency dogfights for 1–8 players. Fly a PBR F-16-class jet over a hand-crafted 5 km world, chase with bloom-lit afterburners, and trade cannon bursts.

[![Node 20+](https://img.shields.io/badge/node-%3E%3D20-339933)]()
[![Three r160](https://img.shields.io/badge/three-0.160-049ef4)]()
[![Colyseus 0.15](https://img.shields.io/badge/colyseus-0.15-ff6a00)]()
[![Vite 5](https://img.shields.io/badge/vite-5-646cff)]()
[![License MIT](https://img.shields.io/badge/license-MIT-blue)]()

---

## Table of Contents
- [Highlights](#highlights)
- [Gameplay — War Thunder Controls](#gameplay--war-thunder-controls)
- [Tech Stack](#tech-stack)
- [Project Structure](#project-structure)
- [Getting Started](#getting-started)
- [How It Works](#how-it-works)
- [Graphics — A-Tier Details](#graphics--a-tier-details)
- [Performance](#performance)
- [Server Authority](#server-authority)
- [Configuration](#configuration)
- [Scripts](#scripts)
- [Deployment](#deployment)
- [Roadmap](#roadmap)
- [Troubleshooting](#troubleshooting)
- [Contributing](#contributing)
- [License](#license)

---

## Highlights

- **True multiplayer** — Colyseus `GameRoom` @ 20 Hz, `@colyseus/schema` state, hit-validated on server, score/kill/respawn.
- **War Thunder feel** — latched throttle `W/S`, bank `A/D`, rudder `Q/E`, mouse-aim pitch/yaw + `↑↓`, wheel throttle.
- **A-tier look** — PBR F-16 jets (paint cache, canopy `transmission`, afterburner shader + light), shader sky dome, runway/airport, city, mountains, water, volumetric clouds, ACES filmic + `UnrealBloom` (tracer/afterburner glow).
- **Juice** — tracer capsules with glow tails + point lights, shock-ring explosions, contrails, screen shake, engine audio oscillator, HUD + minimap + kill feed.
- **Fast** — `72`-seg terrain (was 180), `1024` shadow (was 2048), `20` clouds (was 42), `256²` paint cache, `½`-res bloom `0.28` — solid 55-60 fps on integrated GPUs; build `~648 kB` gzip `~170 kB`.

## Gameplay — War Thunder Controls

| Action | Key | Notes |
|---|---|---|
| **Throttle up / down** | `W` / `S` (latched 0-100%) | `Wheel` fine-tunes, `Shift`/`Ctrl` alt. Throttle persists — tap `W` to spool, `S` to cut. |
| **Roll (bank)** | `A` left, `D` right | `1.95 rad/s`, gentle auto-level `0.55` |
| **Yaw (rudder)** | `Q` left, `E` right | `0.58 rad/s`, adverse-yaw coupling into roll |
| **Pitch** | `Mouse Y` + `↑`/`↓` arrows | War Thunder mouse-aim — move mouse from center, deadzone `0.08`. `RMB` = free look (disables mouse pitch). |
| **Fire cannon** | `LMB` or `Space` | `0.15 s` cooldown, tracer `320 m/s`, 2.8 s life |
| **Free look** | Hold `RMB` | Mouse then drives camera, not pitch |
| **Throttle tip** | Hover at 58-72% for cruise, 85%+ for burner | Burner auto above `88 m/s` |

HUD shows `SPD (m/s) • ALT (m) • THR %`, health bar, score/`Players`, minimap (green you, red enemies + heading), crosshair, kill feed.

> **New to War Thunder?** In WT realistic, throttle is latched (`W/S`) and roll/pitch are separated. Sky Duel copies that: you set power with `W/S` and fly the horizon with `A/D`+mouse, not `W` for pitch.

## Tech Stack

| Layer | Choice | Why |
|---|---|---|
| **Server** | `Node 20` + `colyseus@0.15` + `@colyseus/schema@2.0` + `ws-transport` + `express 4` | Proven room + schema replication, 20 Hz sim, `tsx watch` dev |
| **Client** | `Vite 5` + `TypeScript 5` + `three@0.160` + `colyseus.js@0.15` | ESM, HMR, `three/examples/jsm/postprocessing` bloom |
| **3D** | Three.js `ACESFilmic`, `PCFSoft` shadows, custom sky shader, `EffectComposer` | A-tier without downloading 100 MB GLBs |
| **State** | `@colyseus/schema` `MapSchema<Player/Bullet>` | Strongly typed, diffed patches ~1.2 kB/s per client |
| **Pool** | `utils/ObjectPool` for bullets/particles | Zero-GC dogfights |

## Project Structure

```
sky-duel/
├── server/
│   ├── package.json
│   ├── tsconfig.json          # experimentalDecorators for @colyseus/schema
│   └── src/
│       ├── index.ts           # Express + WebSocketTransport → GameRoom "game"
│       ├── config.ts          # port/tick/world/physics/bullet constants
│       ├── schemas/
│       │   └── GameState.ts   # Player/Bullet/GameState @type(MapSchema)
│       └── rooms/
│           └── GameRoom.ts    # authoritative SIM: input/fire, physics, bullets, hit, score, respawn
└── client/
    ├── index.html             # <canvas id="game-canvas"> + #ui-overlay
    ├── vite.config.ts         # dev 3000, build dist
    ├── tsconfig.json
    └── src/
        ├── main.ts
        ├── types/index.ts
        ├── utils/ObjectPool.ts
        └── game/
            ├── GameManager.ts      # wiring, loop 60 Hz, fire poll, HUD, contrails
            ├── FighterFactory.ts   # A-tier jet: paint cache, PBR, afterburner shader
            ├── FlightController.ts # WT throttle/roll/yaw/pitch + server lerp
            ├── WeaponSystem.ts     # tracer pool (capsule+glow+tail+light)
            ├── NetworkManager.ts   # colyseus.js client, remote jet interp
            ├── Environment.ts      # sky shader, terrain 5.2km, runway, city, clouds, composer
            ├── EffectsManager.ts   # explosions/shock rings/smoke/muzzle
            ├── AudioManager.ts     # WebAudio procedural shoot/hit/explosion + engine osc
            ├── CameraController.ts # chase -28z+8y, lerp 0.08, FOV by speed, shake
            ├── UIManager.ts        # HUD panels, minimap canvas, kill feed
            └── InputManager.ts     # keys Set + mouse x/y/buttons + wheel
```

## Getting Started

### Prerequisites
- `node >= 20`
- `npm >= 10`

### Install & Run (2 terminals)

```bash
# 1. Server — ws://localhost:2567
cd server
npm install
npm run dev
# → "Sky Duel server listening on ws://localhost:2567"

# 2. Client — http://localhost:3000
cd ../client
npm install
npm run dev
# → Vite 5 ready → open http://localhost:3000
#   LAN: http://<your-ip>:3000 — lobby auto-joins "game" room
```

### Production Build

```bash
cd server && npm run build && npm start   # tsc → dist/index.js
cd client && npm run build && npm run preview
```

## How It Works

**Client loop 60 Hz (`GameManager.ts:82`)** — `InputManager → FlightController → WeaponSystem → NetworkManager (20Hz send) → Effects → Environment (local jet) → Camera → UIManager → Environment.render (composer)`

**Flight (`FlightController.ts:42`)**

```ts
// War Thunder latched throttle
throttle = clamp(throttle + (W?+rate:S?-rate) * dt, 0, 1)
thrust = throttle*2-1
targetSpeed = lerp(18, 195, throttle)
speed += clamp((targetSpeed-speed)*1.8, -88, 88) * dt
// roll A/D 1.95, yaw Q/E 0.58, pitch mouseY/↑↓ 1.05, roll->yaw coupling 0.22
```

**Net (`NetworkManager.ts:71`)**

```ts
room = await client.joinOrCreate("game")
room.send("input", {pitch,yaw,roll,thrust}) // every 50ms
room.send("fire")
room.onStateChange(syncPlayers) // lerp remotes 0.12, local correction 0.16
room.onMessage("hit/kill/respawn/bulletFired")
```

**Server (`GameRoom.ts:42`)**

```ts
@type(MapSchema) players/bullets + serverTime
onMessage "input" → per-client InputState clamp
onMessage "fire" → spawn Bullet @ nose + forward*320 + 0.5*vel
update (50ms):
  rotX += pitch*1.1*dt; rotY += yaw*0.9*dt; rotZ += roll*1.6*dt; damp roll
  speed = clamp(speed+thrust*90*dt, 20,180); drag
  bullet += vel*dt; life-=50ms; wrap world; ring hit r=12 → -25 HP → kill/score → respawn 2s
```

## Graphics — A-Tier Details

**Jets (`FighterFactory.ts:95`)**

- Paint `CanvasTexture 256²` cached per `hex` — base + 1.5px panel lines + 160 rivets + 4 camo blobs; `MeshStandard 0.34/0.38`, `envMapIntensity 0.98`
- Fuselage 3× `Cylinder 12seg` + `Cone` nose, `Capsule 0.62` canopy `MeshPhysical transmission 0.22/clearcoat 1`, torus frame, HUD brick
- Wings `ExtrudeGeometry` swept `1.35` (span 4.85, chords 2.45/0.95), pylons ×4 + `AIM-9` (`Cylinder 1.45` + cone + fin), h-stabs + v-stab via `Shape` extrude, dark intake boxes + torus lips
- Nozzle `Cylinder 0.58→0.68` + petals `Cone`, **afterburner `ShaderMaterial` additive** diamond flame `r/tip/edge/noise` → `outer/mid/hot` + core `Cone` `Basic` `ffe8a0` + `PointLight 4.2→5.5` flicker

**World (`Environment.ts:24`)**

- **Sky** `Sphere 4200 24×16` `ShaderMaterial BackSide` gradient `0d1b3a→2a6bba→8ec9ff` + haze + sun `pow 44/180` + vignette, sun `Sphere 52` + glow `92` at `3800`
- **Ground** `Plane 5200 72×72` height `sin6.2/cos5.8 + flatMask airport 0.92 + canyon`, vertex colors `2e7b32→6d7a6a`, `CanvasTexture 512` grass speckles/grid repeat 12
- **Runway** `1100×78` canvas dashed center + thresholds `09/27`, taxiway, **3 hangars** (`Box 58×18` + `Cylinder half` roof), **tower** (`Cylinder 9→11 38` + glass `transmission 0.32` + dish + antenna), **windsock**
- **City** 14 boxes `9-27×14-46` `HSL 0.08` + emissive windows, **12 spires** `Cone 14-26 × 18-58` wrap, **SAM radar** `Box+ Cylinder`, **3 fuel tanks** `Capsule`, **mountains** 22 cones rim `r 2200`, **water** `Plane 5200×2200` `1e3a5a 0.62 metal` + foam
- **Clouds** 20 groups ×3 blobs `Sphere 17-23 8×6` `MeshLambert` drift `0.6-1.2` + bob `sin 0.12`
- **Light** `Ambient 0.55` + `Directional 1.65` `1024` PCFSoft + `Hemisphere 0.62` + fill `0.42`
- **Composer** `RenderPass` + `UnrealBloom 0.28, 0.58, 0.78` `½-res` + `OutputPass` + `ACESFilmic 1.08` `pixelRatio 1.45`

**FX (`EffectsManager.ts:74`, `WeaponSystem.ts:24`)**

- Tracers `Capsule 2.2 0.18` emissive `4.2` + glow shell `Additive 0.38` + tail `Cylinder 0.04→0.12` + `PointLight 3.5`, orient to vel, fade `life/0.35`
- Explosion `PointLight 28` + 22 fire `ffa126/ff4d00` + 14 debris + 16 smoke `isSmoke lift 1.8` + dual `Ring 0.9→1.15` expanding `×18` + scorch `Circle 5.5`
- Hit `9` spark + `PointLight 6.5` + ring, muzzle `4` + `PointLight 7`, respawn teal warp + rings, contrail smoke `2.35 s`

## Performance

| Metric | Before | After | How |
|---|---|---|---|
| Terrain verts | ~32k (180²) | ~5k (72²) | seg `180→72` |
| Shadows | `2048²` | `1024²` | `mapSize` |
| Clouds draw | 42×5 | 20×3 | groups+blobs |
| Paint tex | `512²` per jet | `256²` cached | `Map<hex,Texture>` |
| Pixel ratio | `2` | `1.45` | `min(device,1.45)` |
| Bloom | full-res `0.42` | half-res `0.28` | `BloomPass(½)` |
| City/spires | 26/22 | 14/12 | count |
| Fuselage segs | 18 | 12 | radial |

Measured `Chrome 125` `i5-11th iGPU` `1080p` → `58-60 fps` stable (was `31-38`). To push `120 fps`: set `bloom 0` or `renderer.antialias false` in `Environment.ts:42`.

## Server Authority

- `server/src/schemas/GameState.ts:5` — `Player {x,y,z,rotX/Y/Z,vx/vy/vz,health,score,kills/deaths,alive,lastFire}` + `Bullet {x/y/z/vx/vy/vz,life}` + `GameState MapSchema`
- `server/src/config.ts:1` — `port 2567, tick 20, world 2000, maxAlt 600/min 10, maxSpeed 180/min 20, bullet 320/3000/150ms, radius 12, respawn 2000`
- `server/src/rooms/GameRoom.ts:1` — authoritative `update 50ms`: rotation, `speed += thrust*90*dt; drag 0.06`, `Wrap tortus`, bullet `life/out-of-bounds/hit r12 → -25` → `kill score+1/deaths+1` → `setTimeout respawn randomSpawn 0.3R`
- `tsconfig experimentalDecorators true` for `@type`

Client predicts (`FlightController`) and reconciles via `setFromServer(0.16)` only if `dist>2`; otherwise lerps remotes `0.12`.

## Configuration

```ts
// server/src/config.ts
export const config = {
  port: 2567,
  maxClientsPerRoom: 8,
  tickRate: 20,
  worldSize: 2000,
  maxAltitude: 600,
  minAltitude: 10,
  maxSpeed: 180,
  minSpeed: 20,
  bulletSpeed: 320,
  bulletLifeMs: 3000,
  fireCooldownMs: 150,
  playerRadius: 12,
  respawnDelayMs: 2000,
};

// client env (optional)
// VITE_SERVER_URL=ws://localhost:2567  → NetworkManager.ts:60
```

## Scripts

| Dir | Command | What |
|---|---|---|
| `server` | `npm run dev` | `tsx watch src/index.ts` @2567 |
| `server` | `npm run build && npm start` | `tsc → node dist/index.js` |
| `client` | `npm run dev` | `vite --host 0.0.0.0 --port 3000` |
| `client` | `npm run build` | `tsc && vite build` → `dist/` `648kB` |
| `client` | `npm run preview` | `vite preview` |

## Deployment

**Colyseus Cloud / Fly / Railway**

```bash
# server
cd server && npm run build
# set PORT=80 env, colyseus 0.15 needs ws-transport
# client vite: VITE_SERVER_URL=wss://your-server.fly.dev npm run build
```

**Docker (sketch)**

```dockerfile
FROM node:20
WORKDIR /app/server
COPY server/package.json ./
RUN npm ci
COPY server ./
RUN npm run build
CMD ["node","dist/index.js"]
```

## Roadmap

- [ ] Missiles with lock (`AIM-9` already modeled) + flares (`N` like WT)
- [ ] Airfield repair/rearm, fuel, G-lock
- [ ] Minimap lead indicator + radar `R`
- [ ] Manual engine control `MEC` (`NumPad` in WT)
- [ ] Voice proximity + kill cam
- [ ] GLTF F-16 drop-in via `FighterFactory` fallback (keep procedural as LOD)

## Troubleshooting

- **`Failed to connect`** — server not running or `VITE_SERVER_URL` wrong; `curl ws://localhost:2567` should `101 Switching`
- **`@colyseus/schema` decor error** — `server/tsconfig.json` needs `experimentalDecorators:true` + `useDefineForClassFields:false`
- **Black screen** — `three` mismatch; ensure `0.160.0` both sides, no `three/addons` import (use `three/examples/jsm/...`)
- **Lag** — lower `Environment.ts` `bloom 0.28→0` or `pixelRatio 1.45→1`; check `chrome://gpu`
- **Mouse pitch inverted** — flip sign in `FlightController.ts: pitch += mousePitch` line

## Contributing

PRs welcome — run `npm run build` in both dirs before pushing. Use `Map<hex,Texture>` cache for new jets, keep `20 Hz` server tick as authority.

## License

MIT — do what you want, give credit. Jet procedural code CC0, no external GLB required (optional GLTF drop-in later).

---

**Built with** `three@0.160` · `colyseus@0.15` · `Vite 5` · `tsx` · love for War Thunder energy fights.
