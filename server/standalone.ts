import http from "node:http";
import path from "node:path";
import fs from "node:fs";
import express from "express";
import { WebSocketServer, WebSocket } from "ws";

type CharacterId = "ronaldo" | "messi";

type PlayerNetState = {
  x: number;
  y: number;
  z: number;
  yaw: number;
  pitch: number;
  vx: number;
  vz: number;
  sprint: boolean;
  flashlightOn: boolean;
  aiming: boolean;
  inBackrooms: boolean;
};

type ClientRecord = {
  id: string;
  name: string;
  character: CharacterId;
  ws: WebSocket;
  state: PlayerNetState;
  lastSeenMs: number;
};

type RoomRecord = {
  id: string;
  hostId: string | null;
  clients: Map<string, ClientRecord>;
  stalkers: unknown[];
};

const PORT = Number(process.env.PORT) || 3000;
const IS_PROD = process.env.NODE_ENV === "production";

const rooms = new Map<string, RoomRecord>();

function normalizeRoomId(raw: unknown): string {
  const cleaned = String(raw || "CAMPUS")
    .trim()
    .toUpperCase()
    .replace(/[^A-Z0-9_-]/g, "")
    .slice(0, 16);
  return cleaned || "CAMPUS";
}

function getOrCreateRoom(roomId: string): RoomRecord {
  let room = rooms.get(roomId);
  if (!room) {
    room = { id: roomId, hostId: null, clients: new Map(), stalkers: [] };
    rooms.set(roomId, room);
  }
  return room;
}

function pickCharacterForRoom(room: RoomRecord, preferred?: string): CharacterId {
  let ronaldoTaken = false;
  let messiTaken = false;
  for (const c of room.clients.values()) {
    if (c.character === "ronaldo") ronaldoTaken = true;
    if (c.character === "messi") messiTaken = true;
  }
  if (!ronaldoTaken && !messiTaken) {
    return preferred === "messi" ? "messi" : "ronaldo";
  }
  if (ronaldoTaken && !messiTaken) return "messi";
  if (messiTaken && !ronaldoTaken) return "ronaldo";
  return preferred === "messi" ? "messi" : "ronaldo";
}

function serializePlayers(room: RoomRecord) {
  return Array.from(room.clients.values()).map((c) => ({
    id: c.id,
    name: c.name,
    character: c.character,
    isHost: c.id === room.hostId,
    state: c.state,
  }));
}

function broadcast(room: RoomRecord, payload: unknown, excludeId?: string) {
  const raw = JSON.stringify(payload);
  for (const c of room.clients.values()) {
    if (excludeId && c.id === excludeId) continue;
    if (c.ws.readyState === WebSocket.OPEN) {
      c.ws.send(raw);
    }
  }
}

async function startServer() {
  const app = express();
  app.use(express.json());

  app.get("/api/rooms", (_req, res) => {
    const list = Array.from(rooms.values())
      .filter((r) => r.clients.size > 0)
      .map((r) => ({
        id: r.id,
        players: r.clients.size,
        characters: Array.from(r.clients.values()).map((c) => c.character),
      }));
    res.json({ rooms: list });
  });

  const server = http.createServer(app);
  const wss = new WebSocketServer({ server, path: "/ws/multiplayer" });

  let nextClientSeq = 1;

  wss.on("connection", (ws) => {
    const clientId = `p_${Date.now().toString(36)}_${nextClientSeq++}`;
    let activeRoom: RoomRecord | null = null;
    let activeClient: ClientRecord | null = null;

    ws.on("message", (raw) => {
      let msg: Record<string, unknown>;
      try {
        msg = JSON.parse(String(raw));
      } catch {
        return;
      }
      const type = String(msg.type || "");

      if (type === "join") {
        // Leave previous room if rejoining
        if (activeRoom && activeClient) {
          activeRoom.clients.delete(clientId);
          broadcast(activeRoom, { type: "player_left", playerId: clientId });
          if (activeRoom.hostId === clientId) {
            const nextHost = activeRoom.clients.keys().next().value ?? null;
            activeRoom.hostId = nextHost;
            if (nextHost) {
              broadcast(activeRoom, { type: "host_assigned", hostId: nextHost });
            }
          }
          if (activeRoom.clients.size === 0) rooms.delete(activeRoom.id);
        }

        const roomId = normalizeRoomId(msg.roomId);
        const room = getOrCreateRoom(roomId);
        const character = pickCharacterForRoom(
          room,
          typeof msg.preferredCharacter === "string" ? msg.preferredCharacter : undefined,
        );
        const name = String(
          msg.name || (character === "ronaldo" ? "Cristiano Ronaldo" : "Lionel Messi"),
        ).slice(0, 28);

        if (!room.hostId) room.hostId = clientId;

        const client: ClientRecord = {
          id: clientId,
          name,
          character,
          ws,
          lastSeenMs: Date.now(),
          state: {
            x: 0,
            y: 0,
            z: 118,
            yaw: 0,
            pitch: 0.18,
            vx: 0,
            vz: 0,
            sprint: false,
            flashlightOn: true,
            aiming: false,
            inBackrooms: false,
          },
        };
        room.clients.set(clientId, client);
        activeRoom = room;
        activeClient = client;

        ws.send(
          JSON.stringify({
            type: "welcome",
            playerId: clientId,
            roomId: room.id,
            character: client.character,
            isHost: room.hostId === clientId,
            hostId: room.hostId,
            players: serializePlayers(room),
            stalkers: room.stalkers,
          }),
        );

        broadcast(
          room,
          {
            type: "player_joined",
            player: {
              id: client.id,
              name: client.name,
              character: client.character,
              isHost: room.hostId === clientId,
              state: client.state,
            },
          },
          clientId,
        );
        return;
      }

      if (!activeRoom || !activeClient) return;
      activeClient.lastSeenMs = Date.now();

      if (type === "player_state") {
        const s = (msg.state || {}) as Partial<PlayerNetState>;
        activeClient.state = {
          x: Number(s.x) || 0,
          y: Number(s.y) || 0,
          z: Number(s.z) || 0,
          yaw: Number(s.yaw) || 0,
          pitch: Number(s.pitch) || 0,
          vx: Number(s.vx) || 0,
          vz: Number(s.vz) || 0,
          sprint: Boolean(s.sprint),
          flashlightOn: Boolean(s.flashlightOn),
          aiming: Boolean(s.aiming),
          inBackrooms: Boolean(s.inBackrooms),
        };
        broadcast(
          activeRoom,
          {
            type: "player_update",
            playerId: clientId,
            character: activeClient.character,
            state: activeClient.state,
          },
          clientId,
        );
      } else if (type === "stalkers_sync") {
        if (activeRoom.hostId === clientId && Array.isArray(msg.stalkers)) {
          activeRoom.stalkers = msg.stalkers;
          broadcast(
            activeRoom,
            {
              type: "stalkers_sync",
              stalkers: msg.stalkers,
            },
            clientId,
          );
        }
      } else if (type === "swap_character") {
        const nextChar: CharacterId = activeClient.character === "ronaldo" ? "messi" : "ronaldo";
        // If another client has nextChar, swap both seamlessly so friends stay distinct
        for (const other of activeRoom.clients.values()) {
          if (other.id !== clientId && other.character === nextChar) {
            other.character = activeClient.character;
            other.name = other.character === "ronaldo" ? "Cristiano Ronaldo" : "Lionel Messi";
          }
        }
        activeClient.character = nextChar;
        activeClient.name = nextChar === "ronaldo" ? "Cristiano Ronaldo" : "Lionel Messi";
        broadcast(activeRoom, {
          type: "roster_sync",
          hostId: activeRoom.hostId,
          players: serializePlayers(activeRoom),
        });
      }
    });

    ws.on("close", () => {
      if (!activeRoom) return;
      activeRoom.clients.delete(clientId);
      broadcast(activeRoom, { type: "player_left", playerId: clientId });
      if (activeRoom.hostId === clientId) {
        const nextHost = activeRoom.clients.keys().next().value ?? null;
        activeRoom.hostId = nextHost;
        if (nextHost) {
          broadcast(activeRoom, { type: "host_assigned", hostId: nextHost });
        }
      }
      if (activeRoom.clients.size === 0) {
        rooms.delete(activeRoom.id);
      }
    });
  });

  if (!IS_PROD) {
    const { createServer: createViteServer } = await import("vite");
    const vite = await createViteServer({
      server: {
        middlewareMode: true,
        hmr: false,
        allowedHosts: true,
      },
    });
    app.use(vite.middlewares);
    app.use(async (req, res, next) => {
      try {
        const mod = await vite.ssrLoadModule("/src/server.ts");
        const handler = mod.default || mod;
        if (handler && typeof handler.fetch === "function") {
          const url = `http://${req.headers.host || "localhost"}${req.originalUrl}`;
          const webReq = new Request(url, {
            method: req.method,
            headers: req.headers as Record<string, string>,
          });
          const webRes: Response = await handler.fetch(webReq);
          res.status(webRes.status);
          webRes.headers.forEach((v, k) => res.setHeader(k, v));
          const buf = Buffer.from(await webRes.arrayBuffer());
          res.send(buf);
          return;
        }
        next();
      } catch (err) {
        vite.ssrFixStacktrace(err as Error);
        next(err);
      }
    });
  } else {
    const publicDir = path.resolve(process.cwd(), ".output/public");
    if (fs.existsSync(publicDir)) {
      app.use(express.static(publicDir, { index: false }));
    }
    const fallbackPublic = path.resolve(process.cwd(), "public");
    if (fs.existsSync(fallbackPublic)) {
      app.use(express.static(fallbackPublic, { index: false }));
    }
    const nitroEntryPath = path.resolve(process.cwd(), ".output/server/index.mjs");
    if (fs.existsSync(nitroEntryPath)) {
      const nitroMod = await import(nitroEntryPath);
      const handler = nitroMod.default || nitroMod;
      app.use(async (req, res, next) => {
        try {
          if (typeof handler.fetch === "function") {
            const url = `http://${req.headers.host || "localhost"}${req.originalUrl}`;
            const webReq = new Request(url, {
              method: req.method,
              headers: req.headers as Record<string, string>,
            });
            const webRes: Response = await handler.fetch(webReq, {}, {});
            res.status(webRes.status);
            webRes.headers.forEach((v, k) => res.setHeader(k, v));
            const buf = Buffer.from(await webRes.arrayBuffer());
            res.send(buf);
            return;
          }
          next();
        } catch (err) {
          next(err);
        }
      });
    }
  }

  server.listen(PORT, "0.0.0.0", () => {
    console.log(`[stalker-hunt] Server listening on http://0.0.0.0:${PORT}`);
  });
}

startServer().catch((err) => {
  console.error("[stalker-hunt] Failed to start server:", err);
  process.exit(1);
});
