export interface PlayerState {
  id: string;
  x: number;
  y: number;
  z: number;
  rotationX: number;
  rotationY: number;
  rotationZ: number;
  health: number;
  score: number;
}

export interface BulletState {
  id: string;
  x: number;
  y: number;
  z: number;
  ownerId: string;
}

export interface GameState {
  players: Map<string, PlayerState>;
  bullets: Map<string, BulletState>;
}
