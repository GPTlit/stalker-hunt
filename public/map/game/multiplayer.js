/**
 * multiplayer.js — Real-time WebSocket Co-op client for Stalker Hunt.
 * Connects to /ws/multiplayer on the same origin, syncs Cristiano Ronaldo &
 * Lionel Messi positions, flashlight aiming, and shared Stalker pack state.
 */

export class MultiplayerClient {
  constructor(handlers = {}) {
    this.handlers = handlers;
    this.ws = null;
    this.connected = false;
    this.connecting = false;
    this.manualClosed = false;
    this.roomId = "";
    this.playerId = null;
    this.character = "ronaldo";
    this.isHost = true;
    this.players = [];
    this.incomingStalkers = null;
    this._reconnectTimer = null;
    this._reconnectDelayMs = 1500;
    this._lastStateSendMs = 0;
    this._lastStalkerSendMs = 0;
    this._preferredChar = "ronaldo";
  }

  _buildWsUrl() {
    if (typeof window === "undefined") return "";
    const proto = window.location.protocol === "https:" ? "wss:" : "ws:";
    return `${proto}//${window.location.host}/ws/multiplayer`;
  }

  join(roomId, preferredChar = "ronaldo") {
    const cleanRoom = String(roomId || "CAMPUS")
      .trim()
      .toUpperCase()
      .replace(/[^A-Z0-9_-]/g, "")
      .slice(0, 16) || "CAMPUS";

    this.roomId = cleanRoom;
    this._preferredChar = preferredChar === "messi" ? "messi" : "ronaldo";
    this.manualClosed = false;

    if (this.ws && this.ws.readyState === WebSocket.OPEN) {
      this._send({
        type: "join",
        roomId: this.roomId,
        preferredCharacter: this._preferredChar,
      });
      return;
    }

    this._connect();
  }

  leave() {
    this.manualClosed = true;
    if (this._reconnectTimer) {
      clearTimeout(this._reconnectTimer);
      this._reconnectTimer = null;
    }
    if (this.ws) {
      try {
        this.ws.close();
      } catch {
        // Ignore close error
      }
      this.ws = null;
    }
    this.connected = false;
    this.connecting = false;
    this.playerId = null;
    this.isHost = true;
    this.players = [];
    this.incomingStalkers = null;
    this.handlers.onRosterChange?.({
      connected: false,
      roomId: "",
      playerId: null,
      character: this._preferredChar,
      isHost: true,
      players: [],
    });
  }

  _connect() {
    if (this.connecting || (this.ws && this.ws.readyState === WebSocket.OPEN)) return;
    const url = this._buildWsUrl();
    if (!url || typeof WebSocket === "undefined") return;

    this.connecting = true;
    try {
      this.ws = new WebSocket(url);
    } catch {
      this.connecting = false;
      this._scheduleReconnect();
      return;
    }

    this.ws.addEventListener("open", () => {
      this.connecting = false;
      this.connected = true;
      this._reconnectDelayMs = 1500;
      this._send({
        type: "join",
        roomId: this.roomId || "CAMPUS",
        preferredCharacter: this._preferredChar,
      });
    });

    this.ws.addEventListener("message", (evt) => {
      let msg = null;
      try {
        msg = JSON.parse(String(evt.data));
      } catch {
        return;
      }
      if (!msg || !msg.type) return;

      if (msg.type === "welcome") {
        this.playerId = msg.playerId;
        this.roomId = msg.roomId;
        this.character = msg.character === "messi" ? "messi" : "ronaldo";
        this.isHost = Boolean(msg.isHost);
        this.players = Array.isArray(msg.players) ? msg.players : [];
        if (Array.isArray(msg.stalkers) && msg.stalkers.length > 0 && !this.isHost) {
          this.incomingStalkers = msg.stalkers;
        }
        this.handlers.onWelcome?.({
          connected: true,
          roomId: this.roomId,
          playerId: this.playerId,
          character: this.character,
          isHost: this.isHost,
          players: this.players,
        });
      } else if (msg.type === "player_joined" && msg.player) {
        this.players = [...this.players.filter((p) => p.id !== msg.player.id), msg.player];
        this.handlers.onRosterChange?.({
          connected: this.connected,
          roomId: this.roomId,
          playerId: this.playerId,
          character: this.character,
          isHost: this.isHost,
          players: this.players,
        });
      } else if (msg.type === "player_left") {
        this.players = this.players.filter((p) => p.id !== msg.playerId);
        this.handlers.onRosterChange?.({
          connected: this.connected,
          roomId: this.roomId,
          playerId: this.playerId,
          character: this.character,
          isHost: this.isHost,
          players: this.players,
        });
      } else if (msg.type === "host_assigned") {
        this.isHost = msg.hostId === this.playerId;
        for (const p of this.players) {
          p.isHost = p.id === msg.hostId;
        }
        this.handlers.onRosterChange?.({
          connected: this.connected,
          roomId: this.roomId,
          playerId: this.playerId,
          character: this.character,
          isHost: this.isHost,
          players: this.players,
        });
      } else if (msg.type === "roster_sync") {
        this.players = Array.isArray(msg.players) ? msg.players : [];
        this.isHost = msg.hostId === this.playerId;
        const me = this.players.find((p) => p.id === this.playerId);
        if (me) {
          this.character = me.character === "messi" ? "messi" : "ronaldo";
        }
        this.handlers.onRosterChange?.({
          connected: this.connected,
          roomId: this.roomId,
          playerId: this.playerId,
          character: this.character,
          isHost: this.isHost,
          players: this.players,
        });
      } else if (msg.type === "player_update") {
        this.handlers.onRemotePlayerState?.(msg.playerId, msg.character, msg.state);
      } else if (msg.type === "stalkers_sync") {
        if (!this.isHost && Array.isArray(msg.stalkers)) {
          this.incomingStalkers = msg.stalkers;
        }
      }
    });

    this.ws.addEventListener("close", () => {
      this.connecting = false;
      this.connected = false;
      this.ws = null;
      if (!this.manualClosed) {
        this.handlers.onRosterChange?.({
          connected: false,
          roomId: this.roomId,
          playerId: this.playerId,
          character: this.character,
          isHost: true,
          players: [],
        });
        this._scheduleReconnect();
      }
    });

    this.ws.addEventListener("error", () => {
      this.connecting = false;
    });
  }

  _scheduleReconnect() {
    if (this.manualClosed || this._reconnectTimer) return;
    const wait = this._reconnectDelayMs;
    this._reconnectDelayMs = Math.min(6000, this._reconnectDelayMs * 1.5);
    this._reconnectTimer = setTimeout(() => {
      this._reconnectTimer = null;
      if (!this.manualClosed && this.roomId) {
        this._connect();
      }
    }, wait);
  }

  _send(obj) {
    if (!this.ws || this.ws.readyState !== WebSocket.OPEN) return false;
    try {
      this.ws.send(JSON.stringify(obj));
      return true;
    } catch {
      return false;
    }
  }

  swapCharacter() {
    if (!this.connected) return false;
    return this._send({ type: "swap_character" });
  }

  sendPlayerState(playerState) {
    if (!this.connected) return;
    const now = performance.now();
    if (now - this._lastStateSendMs < 48) return; // ~20 Hz
    this._lastStateSendMs = now;
    this._send({
      type: "player_state",
      state: {
        x: Math.round(playerState.x * 100) / 100,
        y: Math.round(playerState.y * 100) / 100,
        z: Math.round(playerState.z * 100) / 100,
        yaw: Math.round(playerState.yaw * 1000) / 1000,
        pitch: Math.round(playerState.pitch * 1000) / 1000,
        vx: Math.round(playerState.vx * 100) / 100,
        vz: Math.round(playerState.vz * 100) / 100,
        sprint: Boolean(playerState.sprint),
        flashlightOn: Boolean(playerState.flashlightOn),
        aiming: Boolean(playerState.aiming),
        inBackrooms: Boolean(playerState.inBackrooms),
      },
    });
  }

  sendStalkers(stalkers) {
    if (!this.connected || !this.isHost) return;
    const now = performance.now();
    if (now - this._lastStalkerSendMs < 80) return; // ~12.5 Hz
    this._lastStalkerSendMs = now;
    this._send({
      type: "stalkers_sync",
      stalkers,
    });
  }
}

export function getRoomInviteUrl(roomId) {
  if (typeof window === "undefined") return "";
  const clean = String(roomId || "CAMPUS")
    .trim()
    .toUpperCase()
    .replace(/[^A-Z0-9_-]/g, "")
    .slice(0, 16) || "CAMPUS";
  try {
    const topLoc = window.top && window.top.location && window.top.location.origin
      ? window.top.location
      : window.location;
    return `${topLoc.origin}/?room=${encodeURIComponent(clean)}`;
  } catch {
    return `${window.location.origin}/?room=${encodeURIComponent(clean)}`;
  }
}
