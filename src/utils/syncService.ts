import { HubConnection, HubConnectionBuilder, HubConnectionState, LogLevel } from "@microsoft/signalr";
import type { GameState, Intent } from "@/types/game";

export type SyncStatus = "connecting" | "live" | "error";
export type RoomRole = "host" | "guest";

export type WireMessage =
  | { kind: "hello"; playerId: string; name: string; seat?: number }
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

export interface ConnectOptions {
  selfId?: string;
  resume?: boolean;
}

function isWire(data: unknown): data is WireMessage {
  if (!data || typeof data !== "object") return false;
  const kind = (data as { kind?: unknown }).kind;
  return kind === "hello" || kind === "state" || kind === "intent" || kind === "reject";
}

function busyFrom(error: unknown): boolean {
  const text = error instanceof Error ? `${error.name} ${error.message}` : String(error);
  return text.includes("ROOM_BUSY");
}

export async function connectRoom(
  roomId: string,
  handlers: SyncHandlers,
  role: RoomRole,
  options?: ConnectOptions,
): Promise<RoomConnection> {
  handlers.onStatus("connecting", role === "host" ? "در حال ساخت اتاق…" : "در حال پیدا کردن میزبان…");
  const selfId = options?.selfId || `${role === "host" ? "h" : "g"}-${crypto.randomUUID()}`;
  const peers = new Set<string>();
  let gone = false;
  let joining = Promise.resolve();

  const connection: HubConnection = new HubConnectionBuilder()
    .withUrl(`${process.env.NEXT_PUBLIC_BASE_URL as string}${process.env.NEXT_PUBLIC_GAME_HUB}`)
    .withAutomaticReconnect({
      nextRetryDelayInMilliseconds: ({ previousRetryCount }) => {
        if (gone) return null;
        return Math.min(10_000, 400 * 2 ** Math.min(previousRetryCount, 5));
      },
    })
    .configureLogging(LogLevel.Warning)
    .build();

  const notePeer = (peerId: string) => {
    if (!peerId || peerId === selfId) return;
    const known = peers.has(peerId);
    peers.add(peerId);
    if (!known) handlers.onPeerJoin(peerId);
  };

  connection.on("PeerJoined", (peerId: string) => {
    if (!gone) notePeer(peerId);
  });
  connection.on("PeerLeft", (peerId: string, explicit: boolean) => {
    if (gone || !peerId || peerId === selfId) return;
    peers.delete(peerId);
    handlers.onPeerLeave(peerId, Boolean(explicit));
  });
  connection.on("Receive", (message: unknown, from: string) => {
    if (gone || from === selfId || !isWire(message)) return;
    notePeer(from);
    handlers.onStatus("live");
    handlers.onMessage(message, from);
  });

  const enterRoom = async () => {
    const others = await connection.invoke<string[]>("Join", roomId, selfId, role);
    for (const peerId of others ?? []) notePeer(peerId);
  };

  connection.onreconnecting(() => {
    if (!gone) handlers.onStatus("connecting", "ارتباط لحظه‌ای قطع شد. دوباره وصل می‌شویم…");
  });
  connection.onreconnected(() => {
    if (gone) return;
    joining = enterRoom()
      .then(() => {
        if (!gone) handlers.onStatus("live");
      })
      .catch(() => {
        if (!gone) handlers.onStatus("connecting", "ارتباط لحظه‌ای قطع شد. دوباره وصل می‌شویم…");
      });
  });
  connection.onclose(() => {
    if (gone) return;
    handlers.onStatus("connecting", "ارتباط لحظه‌ای قطع شد. دوباره وصل می‌شویم…");
  });

  const kickStart = () => {
    if (gone || connection.state !== HubConnectionState.Disconnected) return;
    joining = connection
      .start()
      .then(enterRoom)
      .then(() => {
        if (!gone) handlers.onStatus("live");
      })
      .catch(() => {
        if (gone) return;
        handlers.onStatus("connecting", "ارتباط لحظه‌ای قطع شد. دوباره وصل می‌شویم…");
        window.setTimeout(kickStart, 2000);
      });
  };

  const onOnline = () => {
    if (!gone) kickStart();
  };
  window.addEventListener("online", onOnline);

  try {
    await connection.start();
    await enterRoom();
  } catch (error) {
    gone = true;
    window.removeEventListener("online", onOnline);
    await connection.stop().catch(() => undefined);
    if (busyFrom(error)) throw new RoomBusyError();
    throw new Error("اتصال به سرور اتاق برقرار نشد. اینترنت را چک کنید و دوباره تلاش کنید.");
  }

  handlers.onStatus("live", role === "host" ? "اتاق آماده است. کد را برای دوستتان بفرستید." : undefined);

  return {
    selfId,
    send: (message, target) => {
      if (gone || connection.state !== HubConnectionState.Connected) return;
      void joining.then(() => {
        if (gone || connection.state !== HubConnectionState.Connected) return;
        return connection.invoke("Send", message, target ?? null);
      }).catch(() => {
        if (!gone) handlers.onStatus("connecting", "ارتباط لحظه‌ای قطع شد. دوباره وصل می‌شویم…");
      });
    },
    ensurePeer: () => {},
    leave: () => {
      if (gone) return;
      gone = true;
      window.removeEventListener("online", onOnline);
      connection.onreconnecting(() => undefined);
      connection.onreconnected(() => undefined);
      connection.onclose(() => undefined);
      const halt = async () => {
        try {
          if (connection.state === HubConnectionState.Connected) {
            await Promise.race([
              connection.invoke("Leave"),
              new Promise((resolve) => window.setTimeout(resolve, 250)),
            ]);
          }
        } catch {
          console.error("error in halt");
        }
        try {
          await connection.stop();
        } catch {
          console.error("error in halt");
        }
      };
      void halt();
    },
    peerIds: () => [...peers],
  };
}
