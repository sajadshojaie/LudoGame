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
  onPeerLeave: (peerId: string, explicit: boolean) => void;
  onMessage: (message: WireMessage, peerId: string) => void;
  onStatus: (status: SyncStatus, detail?: string) => void;
}

export class RoomBusyError extends Error {
  constructor() {
    super("این کد اتاق همین حالا گرفته شده است.");
    this.name = "RoomBusyError";
  }
}

const RELAY = "https://ntfy.sh";
const CHUNK_BYTES = 2800;
const HEARTBEAT_MS = 8000;
const PEER_TIMEOUT_MS = 36_000;
const CLAIM_WAIT_MS = 700;

interface RelayPacket {
  v: 1;
  from: string;
  sys?: "bye" | "hb" | "claim";
  id?: string;
  to?: string;
  i?: number;
  n?: number;
  p?: string;
}

interface PartialMessage {
  n: number;
  parts: string[];
  got: number;
  at: number;
}

function topicFor(roomId: string): string {
  return `manch-ludo-v1-${roomId.trim().toUpperCase()}`;
}

function isWire(data: unknown): data is WireMessage {
  if (!data || typeof data !== "object") return false;
  const kind = (data as { kind?: unknown }).kind;
  return kind === "hello" || kind === "state" || kind === "intent" || kind === "reject";
}

function isPacket(data: unknown): data is RelayPacket {
  if (!data || typeof data !== "object") return false;
  const packet = data as RelayPacket;
  return packet.v === 1 && typeof packet.from === "string";
}

function utf8Chunks(text: string, maxBytes: number): string[] {
  const chunks: string[] = [];
  let current = "";
  let bytes = 0;
  for (const char of text) {
    const size = new TextEncoder().encode(char).length;
    if (current && bytes + size > maxBytes) {
      chunks.push(current);
      current = char;
      bytes = size;
    } else {
      current += char;
      bytes += size;
    }
  }
  if (current || chunks.length === 0) chunks.push(current);
  return chunks;
}

function openSocket(topic: string): Promise<WebSocket> {
  return new Promise((resolve, reject) => {
    const socket = new WebSocket(`wss://ntfy.sh/${topic}/ws?since=10s`);
    let settled = false;
    const timer = window.setTimeout(() => {
      if (settled) return;
      settled = true;
      socket.close();
      reject(new Error("اتصال به سرور اتاق برقرار نشد. اینترنت را چک کنید و دوباره تلاش کنید."));
    }, 10_000);
    socket.onopen = () => {
      if (settled) return;
      settled = true;
      window.clearTimeout(timer);
      resolve(socket);
    };
    socket.onerror = () => {
      if (settled) return;
      settled = true;
      window.clearTimeout(timer);
      reject(new Error("اتصال به سرور اتاق برقرار نشد. اینترنت را چک کنید و دوباره تلاش کنید."));
    };
  });
}

export interface ConnectOptions {
  selfId?: string;
  resume?: boolean;
}

export async function connectRoom(
  roomId: string,
  handlers: SyncHandlers,
  role: RoomRole,
  options?: ConnectOptions,
): Promise<RoomConnection> {
  handlers.onStatus("connecting", role === "host" ? "در حال ساخت اتاق…" : "در حال پیدا کردن میزبان…");
  const topic = topicFor(roomId);
  const selfId = options?.selfId || `${role === "host" ? "h" : "g"}-${crypto.randomUUID()}`;
  const peers = new Map<string, number>();
  const partials = new Map<string, PartialMessage>();
  const seen = new Set<string>();
  const timers = new Set<number>();
  let gone = false;
  let heartbeat = 0;
  let sweep = 0;
  let socket = await openSocket(topic);
  let sendChain = Promise.resolve();
  let claimResult: ((busy: boolean) => void) | null = null;

  const later = (fn: () => void, ms: number) => {
    const timer = window.setTimeout(() => {
      timers.delete(timer);
      if (!gone) fn();
    }, ms);
    timers.add(timer);
  };

  const post = (raw: string) => {
    const dropping = gone;
    sendChain = sendChain
      .then(async () => {
        if (dropping) return;
        for (let attempt = 0; attempt < 3; attempt++) {
          const response = await fetch(`${RELAY}/${topic}`, { method: "POST", body: raw });
          if (response.status === 429) {
            await new Promise((resolve) => window.setTimeout(resolve, 700 * (attempt + 1)));
            continue;
          }
          if (!response.ok) throw new Error(String(response.status));
          return;
        }
      })
      .catch(() => {
        if (!gone) handlers.onStatus("connecting", "ارتباط لحظه‌ای قطع شد. دوباره وصل می‌شویم…");
      });
  };

  const publishSys = (sys: "bye" | "hb" | "claim") => {
    post(JSON.stringify({ v: 1, sys, from: selfId } satisfies RelayPacket));
  };

  const notePeer = (peerId: string) => {
    if (!peerId || peerId === selfId) return;
    const known = peers.has(peerId);
    peers.set(peerId, Date.now());
    if (!known) handlers.onPeerJoin(peerId);
  };

  const deliver = (packet: RelayPacket) => {
    if (!packet.id || packet.i == null || packet.n == null || typeof packet.p !== "string") return;
    if (seen.has(packet.id)) return;
    let bucket = partials.get(packet.id);
    if (!bucket) {
      bucket = { n: packet.n, parts: [], got: 0, at: Date.now() };
      partials.set(packet.id, bucket);
    }
    if (bucket.parts[packet.i] == null) {
      bucket.parts[packet.i] = packet.p;
      bucket.got += 1;
    }
    if (bucket.got < bucket.n) return;
    partials.delete(packet.id);
    seen.add(packet.id);
    if (seen.size > 500) seen.delete(seen.values().next().value ?? "");
    let parsed: unknown;
    try {
      parsed = JSON.parse(bucket.parts.join(""));
    } catch {
      return;
    }
    if (!isWire(parsed)) return;
    if (packet.to && packet.to !== selfId) return;
    handlers.onStatus("live");
    handlers.onMessage(parsed, packet.from);
  };

  const onRelay = (raw: string) => {
    let packet: unknown;
    try {
      packet = JSON.parse(raw);
    } catch {
      return;
    }
    if (!isPacket(packet) || packet.from === selfId) return;
    if (claimResult && packet.sys !== "bye") claimResult(true);
    if (packet.sys === "claim") {
      notePeer(packet.from);
      return;
    }
    if (packet.sys === "bye") {
      if (peers.delete(packet.from)) handlers.onPeerLeave(packet.from, true);
      return;
    }
    if (packet.sys === "hb") {
      notePeer(packet.from);
      return;
    }
    notePeer(packet.from);
    deliver(packet);
  };

  let retry = 0;
  const listen = (next: WebSocket) => {
    next.onmessage = (event) => {
      if (gone) return;
      let data: { event?: string; message?: string };
      try {
        data = JSON.parse(String(event.data)) as { event?: string; message?: string };
      } catch {
        return;
      }
      if (data.event === "message" && data.message) onRelay(data.message);
    };
    next.onclose = () => {
      if (gone || next !== socket) return;
      handlers.onStatus("connecting", "ارتباط لحظه‌ای قطع شد. دوباره وصل می‌شویم…");
      scheduleReconnect();
    };
  };
  const scheduleReconnect = () => {
    if (gone) return;
    const wait = Math.min(8000, 600 * 2 ** retry);
    retry += 1;
    later(() => {
      openSocket(topic)
        .then((nextSocket) => {
          if (gone) {
            nextSocket.close();
            return;
          }
          retry = 0;
          socket = nextSocket;
          listen(nextSocket);
          publishSys("hb");
          handlers.onStatus("live");
        })
        .catch(() => {
          if (!gone) scheduleReconnect();
        });
    }, wait);
  };

  const close = () => {
    if (gone) return;
    gone = true;
    for (const timer of timers) window.clearTimeout(timer);
    timers.clear();
    if (heartbeat) window.clearInterval(heartbeat);
    if (sweep) window.clearInterval(sweep);
    socket.onclose = null;
    socket.close();
  };

  listen(socket);

  if (role === "host" && !options?.resume) {
    publishSys("claim");
    const busy = await new Promise<boolean>((resolve) => {
      claimResult = resolve;
      later(() => resolve(false), CLAIM_WAIT_MS);
    });
    claimResult = null;
    if (busy) {
      publishSys("bye");
      close();
      throw new RoomBusyError();
    }
  }

  heartbeat = window.setInterval(() => {
    if (!gone) publishSys("hb");
  }, HEARTBEAT_MS);

  sweep = window.setInterval(() => {
    const now = Date.now();
    for (const [peerId, seenAt] of peers) {
        if (now - seenAt > PEER_TIMEOUT_MS) {
          peers.delete(peerId);
          handlers.onPeerLeave(peerId, false);
        }
    }
    for (const [id, bucket] of partials) {
      if (now - bucket.at > 15_000) partials.delete(id);
    }
  }, 4000);

  publishSys("hb");
  handlers.onStatus("live", role === "host" ? "اتاق آماده است. کد را برای دوستتان بفرستید." : undefined);

  return {
    selfId,
    send: (message, target) => {
      const payload = JSON.stringify(message);
      const parts = utf8Chunks(payload, CHUNK_BYTES);
      const id = crypto.randomUUID();
      parts.forEach((part, index) => {
        const raw = JSON.stringify({
          v: 1,
          id,
          from: selfId,
          to: target,
          i: index,
          n: parts.length,
          p: part,
        } satisfies RelayPacket);
        post(raw);
      });
    },
    ensurePeer: () => {},
    leave: () => {
      publishSys("bye");
      close();
    },
    peerIds: () => [...peers.keys()],
  };
}
