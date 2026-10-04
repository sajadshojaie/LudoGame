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

export async function connectRoom(
  roomId: string,
  handlers: SyncHandlers,
): Promise<RoomConnection> {
  handlers.onStatus("connecting", "در حال پیدا کردن بقیه بازیکن‌ها…");
  const { joinRoom, selfId } = await import("trystero");
  const room = joinRoom({ appId: APP_ID }, roomId.trim().toUpperCase());
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
