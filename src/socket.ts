import type { Server as HttpServer } from "http";
import { Server as SocketIOServer } from "socket.io";
import type { PrayerDTO } from "./types";

let io: SocketIOServer | null = null;

export function initSocket(httpServer: HttpServer, clientOrigin: string): SocketIOServer {
  io = new SocketIOServer(httpServer, {
    cors: { origin: clientOrigin },
  });
  return io;
}

function getIO(): SocketIOServer {
  if (!io) throw new Error("Socket.IO not initialized");
  return io;
}

export function emitPrayerNew(prayer: PrayerDTO): void {
  getIO().emit("prayer:new", prayer);
}

export function emitPrayerUpdate(prayer: PrayerDTO): void {
  getIO().emit("prayer:update", prayer);
}

export function emitPrayerRemove(id: string): void {
  getIO().emit("prayer:remove", { id });
}
