import type { GameState, Intent } from "@/types/game";

export type SyncStatus = "connecting" | "live" | "error";

export type WireMessage =
  | { kind: "hello"; playerId: string; name: string }
  | { kind: "state"; state: GameState }
  | { kind: "intent"; intent: Intent; actorId: string }
  | { kind: "reject"; reason: string };

export interface RoomConnection {
  selfId: string;
  send: (message: WireMessage, target?: string) => void;
  leave: () => void;
  peerIds: () => string[];
}

export interface SyncHandlers {
  onPeerJoin: (peerId: string) => void;
  onPeerLeave: (peerId: string) => void;
  onMessage: (message: WireMessage, peerId: string) => void;
  onStatus: (status: SyncStatus, detail?: string) => void;
}

const APP_ID = "app.manch.ludo.v1";

const TURN_HOST = "staticauth.openrelay.metered.ca";
const TURN_SECRET = "openrelayprojectsecret";

/** Short-lived TURN login. Coturn checks HMAC-SHA1(secret, username). */
async function turnLogin(): Promise<{ username: string; credential: string }> {
  const username = `${Math.floor(Date.now() / 1000) + 12 * 60 * 60}:manch`;
  const key = await crypto.subtle.importKey("raw", new TextEncoder().encode(TURN_SECRET), { name: "HMAC", hash: "SHA-1" }, false, ["sign"]);
  const mac = new Uint8Array(await crypto.subtle.sign("HMAC", key, new TextEncoder().encode(username)));
  const credential = btoa(String.fromCharCode(...mac));
  return { username, credential };
}

export async function connectRoom(roomId: string, handlers: SyncHandlers): Promise<RoomConnection> {
  handlers.onStatus("connecting", "در حال پیدا کردن بقیه بازیکن‌ها…");
  const { joinRoom, selfId } = await import("trystero");
  const login = await turnLogin();
  const room = joinRoom(
    {
      appId: APP_ID,
      relayConfig: { redundancy: 16 },
      turnConfig: [
        { urls: `turn:${TURN_HOST}:80?transport=tcp`, ...login },
        { urls: `turns:${TURN_HOST}:443?transport=tcp`, ...login },
      ],
    },
    roomId.trim().toUpperCase(),
  );
  const channel = room.makeAction("manch") as {
    send: (message: WireMessage, options?: { target?: string }) => Promise<void>;
    onMessage: ((message: WireMessage, context: { peerId: string }) => void) | null;
  };

  room.onPeerJoin = (peerId) => {
    handlers.onStatus("live");
    handlers.onPeerJoin(peerId);
  };
  room.onPeerLeave = (peerId) => {
    handlers.onPeerLeave(peerId);
  };
  channel.onMessage = (data, context) => {
    handlers.onStatus("live");
    handlers.onMessage(data, context.peerId);
  };

  // The relay answers even before another browser arrives.
  window.setTimeout(() => handlers.onStatus("live"), 1200);

  return {
    selfId,
    send: (message, target) => {
      void channel.send(message, target ? { target } : undefined);
    },
    leave: () => {
      room.onPeerJoin = null;
      room.onPeerLeave = null;
      channel.onMessage = null;
      void room.leave();
    },
    peerIds: () => Object.keys(room.getPeers()),
  };
}
