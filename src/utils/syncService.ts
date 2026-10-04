import type { DataConnection, Peer } from "peerjs";
import type { GameState, Intent } from "@/types/game";

export type SyncStatus = "connecting" | "live" | "error";
export type RoomRole = "host" | "guest";

export type WireMessage =
  | { kind: "hello"; playerId: string; name: string }
  | { kind: "state"; state: GameState }
  | { kind: "intent"; intent: Intent; actorId: string }
  | { kind: "reject"; reason: string };

export interface RoomConnection {
  selfId: string;
  send: (message: WireMessage, target?: string) => void;
  ensurePeer: (peerId: string) => void;
  leave: () => void;
  peerIds: () => string[];
}

export interface SyncHandlers {
  onPeerJoin: (peerId: string) => void;
  onPeerLeave: (peerId: string) => void;
  onMessage: (message: WireMessage, peerId: string) => void;
  onStatus: (status: SyncStatus, detail?: string) => void;
}

export class RoomBusyError extends Error {
  constructor() {
    super("این کد اتاق همین حالا گرفته شده است.");
    this.name = "RoomBusyError";
  }
}

const TURN_HOST = "staticauth.openrelay.metered.ca";
const TURN_SECRET = "openrelayprojectsecret";
const OPEN_TIMEOUT_MS = 12_000;
const REDIAL_MS = 1400;
const MAX_DIALS = 8;

function roomPeerId(roomId: string): string {
  return `manch-${roomId.trim().toUpperCase()}`;
}

function isWire(data: unknown): data is WireMessage {
  if (!data || typeof data !== "object") return false;
  const kind = (data as { kind?: unknown }).kind;
  return kind === "hello" || kind === "state" || kind === "intent" || kind === "reject";
}

function errorType(err: unknown): string {
  if (err && typeof err === "object" && "type" in err && typeof (err as { type: unknown }).type === "string") {
    return (err as { type: string }).type;
  }
  return "";
}

async function iceConfig(): Promise<RTCConfiguration> {
  const iceServers: RTCIceServer[] = [
    { urls: "stun:stun.l.google.com:19302" },
    { urls: "stun:stun.cloudflare.com:3478" },
    {
      urls: ["turn:eu-0.turn.peerjs.com:3478", "turn:us-0.turn.peerjs.com:3478"],
      username: "peerjs",
      credential: "peerjsp",
    },
  ];
  try {
    const username = `${Math.floor(Date.now() / 1000) + 12 * 60 * 60}:manch`;
    const key = await crypto.subtle.importKey(
      "raw",
      new TextEncoder().encode(TURN_SECRET),
      { name: "HMAC", hash: "SHA-1" },
      false,
      ["sign"],
    );
    const mac = new Uint8Array(await crypto.subtle.sign("HMAC", key, new TextEncoder().encode(username)));
    const credential = btoa(String.fromCharCode(...mac));
    iceServers.push({
      urls: [`turn:${TURN_HOST}:80?transport=tcp`, `turns:${TURN_HOST}:443?transport=tcp`],
      username,
      credential,
    });
  } catch {
    // STUN and the PeerJS relay stay available when this credential cannot be built.
  }
  return { iceServers };
}

function startupError(err: unknown): Error {
  const type = errorType(err);
  if (type === "unavailable-id") return new RoomBusyError();
  if (type === "invalid-id") return new Error("کد اتاق نامعتبر است.");
  return new Error("سرور اتصال آنلاین جواب نداد. اینترنت را چک کنید و دوباره تلاش کنید.");
}

export async function connectRoom(
  roomId: string,
  handlers: SyncHandlers,
  role: RoomRole,
): Promise<RoomConnection> {
  handlers.onStatus("connecting", role === "host" ? "در حال ساخت اتاق…" : "در حال پیدا کردن میزبان…");
  const { Peer: PeerCtor } = await import("peerjs");
  const roomPeer = roomPeerId(roomId);
  const config = await iceConfig();
  const peer = await openPeer(PeerCtor, role === "host" ? roomPeer : undefined, config);
  const selfId = peer.id;
  const links = new Map<string, DataConnection>();
  const pending = new Set<string>();
  const attempts = new Map<string, number>();
  const ignored = new WeakSet<DataConnection>();
  const timers = new Set<number>();
  let gone = false;
  let signalDrops = 0;

  const later = (fn: () => void, ms: number) => {
    const timer = window.setTimeout(() => {
      timers.delete(timer);
      if (!gone) fn();
    }, ms);
    timers.add(timer);
  };

  const preferOutgoing = (remoteId: string) => {
    if (remoteId === roomPeer) return role === "guest";
    if (role === "host") return false;
    return selfId < remoteId;
  };

  const shouldDial = (remoteId: string) => {
    if (gone || !remoteId || remoteId === selfId) return false;
    if (links.get(remoteId)?.open || pending.has(remoteId)) return false;
    if ((attempts.get(remoteId) ?? 0) >= MAX_DIALS) return false;
    if (remoteId === roomPeer) return role === "guest";
    if (role === "host") return false;
    return selfId < remoteId;
  };

  const dial = (remoteId: string) => {
    if (!shouldDial(remoteId)) return;
    attempts.set(remoteId, (attempts.get(remoteId) ?? 0) + 1);
    pending.add(remoteId);
    bind(peer.connect(remoteId, { reliable: true, serialization: "json" }), true);
  };

  const forget = (conn: DataConnection) => {
    pending.delete(conn.peer);
    if (links.get(conn.peer) === conn) links.delete(conn.peer);
  };

  function bind(conn: DataConnection, outgoing: boolean) {
    if (gone) {
      conn.close();
      return;
    }
    const current = links.get(conn.peer);
    if (current && current !== conn) {
      const keepNew = outgoing === preferOutgoing(conn.peer);
      if (!keepNew) {
        ignored.add(conn);
        pending.delete(conn.peer);
        conn.close();
        return;
      }
      ignored.add(current);
      current.removeAllListeners();
      current.close();
    }
    links.set(conn.peer, conn);
    pending.delete(conn.peer);
    let opened = false;

    conn.on("open", () => {
      if (gone || links.get(conn.peer) !== conn) return;
      opened = true;
      attempts.delete(conn.peer);
      handlers.onStatus("live");
      handlers.onPeerJoin(conn.peer);
    });
    conn.on("data", (data: unknown) => {
      if (gone || links.get(conn.peer) !== conn || !isWire(data)) return;
      handlers.onStatus("live");
      handlers.onMessage(data, conn.peer);
    });
    conn.on("close", () => {
      const currentLink = links.get(conn.peer) === conn;
      forget(conn);
      if (gone || ignored.has(conn)) return;
      if (opened && currentLink) {
        handlers.onPeerLeave(conn.peer);
        return;
      }
      later(() => dial(conn.peer), REDIAL_MS);
    });
    conn.on("iceStateChanged", (state) => {
      if (state !== "failed" || opened || gone || ignored.has(conn)) return;
      conn.close();
    });
  }

  peer.on("connection", (conn) => bind(conn, false));
  peer.on("disconnected", () => {
    if (gone || peer.destroyed) return;
    signalDrops += 1;
    if (signalDrops > 4) {
      handlers.onStatus("error", "ارتباط با سرور معرفی قطع شد. یک بار دیگر وارد اتاق شوید.");
      return;
    }
    later(() => {
      if (!peer.destroyed && peer.disconnected) peer.reconnect();
    }, 800);
  });
  peer.on("open", () => {
    signalDrops = 0;
  });
  peer.on("error", (err) => {
    if (gone) return;
    if (errorType(err) !== "peer-unavailable") return;
    const missed = err.message.startsWith("Could not connect to peer ")
      ? err.message.slice("Could not connect to peer ".length)
      : "";
    if (!missed) return;
    const conn = links.get(missed);
    if (conn && !conn.open) {
      ignored.add(conn);
      forget(conn);
      conn.close();
    } else {
      pending.delete(missed);
    }
    if ((attempts.get(missed) ?? 0) >= MAX_DIALS && missed === roomPeer) {
      handlers.onStatus("error", "میزبان پیدا نشد. کد را چک کنید و هر دو صفحه را باز نگه دارید.");
      return;
    }
    later(() => dial(missed), REDIAL_MS);
  });

  if (role === "host") handlers.onStatus("live", "اتاق آماده است. کد را برای دوستانتان بفرستید.");
  else dial(roomPeer);

  return {
    selfId,
    send: (message, target) => {
      const targets = target ? [links.get(target)].filter((conn): conn is DataConnection => Boolean(conn)) : [...links.values()];
      for (const conn of targets) {
        if (conn.open) conn.send(message);
      }
    },
    ensurePeer: (peerId) => dial(peerId),
    leave: () => {
      gone = true;
      for (const timer of timers) window.clearTimeout(timer);
      timers.clear();
      for (const conn of links.values()) {
        ignored.add(conn);
        conn.removeAllListeners();
        conn.close();
      }
      links.clear();
      peer.removeAllListeners();
      if (!peer.destroyed) peer.destroy();
    },
    peerIds: () => [...links.values()].filter((conn) => conn.open).map((conn) => conn.peer),
  };
}

function openPeer(PeerCtor: typeof Peer, id: string | undefined, config: RTCConfiguration): Promise<Peer> {
  return new Promise((resolve, reject) => {
    const peer = id ? new PeerCtor(id, { debug: 0, config }) : new PeerCtor({ debug: 0, config });
    let settled = false;
    const finish = (ok: boolean, value: Peer | Error) => {
      if (settled) return;
      settled = true;
      window.clearTimeout(timer);
      peer.off("open", onOpen);
      peer.off("error", onError);
      if (ok) resolve(value as Peer);
      else {
        if (!peer.destroyed) peer.destroy();
        reject(value);
      }
    };
    const onOpen = () => finish(true, peer);
    const onError = (err: unknown) => finish(false, startupError(err));
    const timer = window.setTimeout(() => {
      finish(false, new Error("سرور اتصال آنلاین جواب نداد. اینترنت را چک کنید و دوباره تلاش کنید."));
    }, OPEN_TIMEOUT_MS);
    peer.on("open", onOpen);
    peer.on("error", onError);
  });
}
