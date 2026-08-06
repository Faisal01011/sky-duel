# Sky Duel

Multiplayer aerial combat game.

## Structure

```
sky-duel/
├── server/                 # Colyseus game server
│   ├── package.json
│   ├── tsconfig.json
│   └── src/
│       ├── index.ts
│       ├── config.ts
│       └── rooms/
│           └── GameRoom.ts
└── client/                 # Vite + TypeScript client
    ├── index.html
    ├── package.json
    ├── vite.config.ts
    ├── tsconfig.json
    └── src/
        ├── main.ts
        ├── game/
        │   ├── GameManager.ts
        │   ├── FlightController.ts
        │   ├── WeaponSystem.ts
        │   ├── NetworkManager.ts
        │   ├── Environment.ts
        │   ├── EffectsManager.ts
        │   ├── AudioManager.ts
        │   ├── CameraController.ts
        │   ├── UIManager.ts
        │   └── InputManager.ts
        ├── utils/
        │   └── ObjectPool.ts
        └── types/
            └── index.ts
```

## Getting Started

### Server
```bash
cd server
npm install
npm run dev
```

### Client
```bash
cd client
npm install
npm run dev
```
