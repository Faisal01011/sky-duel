import { Server } from "colyseus";
import { WebSocketTransport } from "@colyseus/ws-transport";
import express from "express";
import cors from "cors";
import { createServer } from "http";
import { GameRoom } from "./rooms/GameRoom";
import { config } from "./config";

const app = express();
app.use(cors());
app.use(express.json());

const gameServer = new Server({
  transport: new WebSocketTransport({
    server: createServer(app),
  }),
});

gameServer.define("game", GameRoom);

gameServer.listen(config.port).then(() => {
  console.log(`Sky Duel server listening on ws://localhost:${config.port}`);
});
