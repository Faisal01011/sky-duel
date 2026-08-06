import { GameManager } from "./game/GameManager";

const canvas = document.getElementById("game-canvas") as HTMLCanvasElement;

const game = new GameManager(canvas);
game.start();
