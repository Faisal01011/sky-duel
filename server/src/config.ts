export const config = {
  port: Number(process.env.PORT) || 2567,
  maxClientsPerRoom: 8,
  tickRate: 20, // Hz
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
