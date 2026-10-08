"use client";

import { useCallback, useEffect, useLayoutEffect, useRef, useState } from "react";
import type { GameState, Intent, PlayerCount, SeatSetup } from "@/types/game";
import { chooseBotMove } from "@/utils/bot";
import { createSoundboard, type Soundboard } from "@/utils/audio";
import {
  BOT_THINK_MS,
  DICE_MS,
  HOP_MS,
  addHuman,
  applyIntent,
  convertPeerToBot,
  markPeerAway,
  reattachHuman,
  createLobby,
  createLocalMatch,
  hopDuration,
  tokenParked,
  legalMoves,
  roomCode,
} from "@/utils/gameRules";
import {
  connectRoom,
  RoomBusyError,
  type ConnectOptions,
  type RoomConnection,
  type RoomRole,
  type SyncStatus,
  type WireMessage,
} from "@/utils/syncService";

const SEAT_KEY = "manch-seat";

interface SeatMemory {
  roomId: string;
  playerId: string;
  name: string;
  role: RoomRole;
  relayId: string;
}

function readSeat(): SeatMemory | null {
  try {
    const raw = window.sessionStorage.getItem(SEAT_KEY);
    if (!raw) return null;
    const parsed = JSON.parse(raw) as SeatMemory;
    if (!parsed.roomId || !parsed.playerId || !parsed.relayId || (parsed.role !== "host" && parsed.role !== "guest")) return null;
    return parsed;
  } catch {
    return null;
  }
}

function rememberSeat(seat: SeatMemory) {
  window.sessionStorage.setItem(SEAT_KEY, JSON.stringify(seat));
}

function forgetSeat() {
  window.sessionStorage.removeItem(SEAT_KEY);
}

export interface SessionController {
  state: GameState | null;
  online: boolean;
  isHost: boolean;
  myId: string | null;
  syncStatus: SyncStatus | "offline";
  syncDetail: string | null;
  error: string | null;
  waiting: boolean;
  soundOn: boolean;
  diceRolling: boolean;
  inputLocked: boolean;
  offlinePeerIds: string[];
  startLocal: (count: PlayerCount, seats: SeatSetup[], name: string) => void;
  createOnline: (count: PlayerCount, name: string, seat: number) => Promise<void>;
  joinOnline: (code: string, name: string, seat: number) => Promise<void>;
  act: (intent: Intent) => void;
  leave: () => void;
  toggleSound: () => void;
  dismissError: () => void;
}

export function useGameSession(): SessionController {
  const [state, setState] = useState<GameState | null>(null);
  const [online, setOnline] = useState(false);
  const [isHost, setIsHost] = useState(false);
  const [myId, setMyId] = useState<string | null>(null);
  const [syncStatus, setSyncStatus] = useState<SyncStatus | "offline">("offline");
  const [syncDetail, setSyncDetail] = useState<string | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [waiting, setWaiting] = useState(false);
  const [soundOn, setSoundOn] = useState(true);
  const [diceRolling, setDiceRolling] = useState(false);
  const [inputLocked, setInputLocked] = useState(false);
  const [offlinePeerIds, setOfflinePeerIds] = useState<string[]>([]);

  const stateRef = useRef<GameState | null>(null);
  const connRef = useRef<RoomConnection | null>(null);
  const hostRef = useRef(false);
  const myIdRef = useRef<string | null>(null);
  const audioRef = useRef<Soundboard | null>(null);
  const seenRoll = useRef(0);
  const seenMove = useRef(0);
  const winPlayed = useRef(false);
  const readyRef = useRef(false);
  const joinHelloRef = useRef<{ playerId: string; name: string; seat?: number } | null>(null);
  const resumedRef = useRef(false);

  const commit = useCallback((next: GameState | null) => {
    stateRef.current = next;
    setState(next);
  }, []);

  const publish = useCallback((next: GameState, target?: string) => {
    connRef.current?.send({ kind: "state", state: next }, target);
  }, []);

  const announceSelf = useCallback((target?: string) => {
    const hello = joinHelloRef.current;
    if (!hello) return;
    if (hostRef.current && stateRef.current?.players.some((player) => player.id === hello.playerId && player.connected)) return;
    connRef.current?.send(
      { kind: "hello", playerId: hello.playerId, name: hello.name, seat: hello.seat },
      target,
    );
  }, []);

  useEffect(() => {
    const connection = connRef.current;
    if (!online || !state || !connection) return;
    for (const player of state.players) {
      if (player.kind === "human" && player.peerId) connection.ensurePeer(player.peerId);
    }
  }, [online, state]);

  useEffect(() => {
    if (!online) return;
    const timer = window.setInterval(() => {
      const hello = joinHelloRef.current;
      const view = stateRef.current;
      if (!hello) return;
      if (view?.players.some((player) => player.id === hello.playerId && player.connected)) return;
      announceSelf();
    }, 1200);
    return () => window.clearInterval(timer);
  }, [announceSelf, online]);

  useEffect(() => {
    audioRef.current = createSoundboard();
    setSoundOn(window.localStorage.getItem("manch-muted") !== "1");
  }, []);

  useEffect(() => {
    const current = state;
    if (!current) return;
    const audio = audioRef.current;
    if (current.rollId !== seenRoll.current) {
      seenRoll.current = current.rollId;
      if (current.dice != null) {
        audio?.dice();
        if (current.dice === 6) audio?.six(0.42);
      }
    }
    if (current.lastMove && current.lastMove.id !== seenMove.current) {
      const move = current.lastMove;
      seenMove.current = move.id;
      const hops = move.to < 0 ? 1 : move.from < 0 ? 1 : Math.max(1, move.to - move.from);
      for (let i = 0; i < hops; i++) window.setTimeout(() => audio?.step(), i * HOP_MS);
      if (move.capturedIds.length)
        window.setTimeout(() => audio?.capture(), hops * HOP_MS);
      if (tokenParked(current, move.tokenId)) {
        window.setTimeout(() => audio?.arrive(), hopDuration(move.from, move.to));
      }
    }
    if (current.status === "finished") {
      if (!winPlayed.current) {
        winPlayed.current = true;
        const wait =
          current.lastMove && tokenParked(current, current.lastMove.tokenId)
            ? hopDuration(current.lastMove.from, current.lastMove.to) + 700
            : 0;
        window.setTimeout(() => audio?.win(), wait);
      }
    } else {
      winPlayed.current = false;
    }
  }, [state]);

  const animRef = useRef({ rollId: 0, moveSeq: 0 });
  useLayoutEffect(() => {
    if (!state) return;
    let ms = 0;
    let rolled = false;
    if (state.rollId !== animRef.current.rollId) {
      animRef.current.rollId = state.rollId;
      if (state.dice != null) {
        ms = DICE_MS;
        rolled = true;
      }
    }
    if (state.moveSeq !== animRef.current.moveSeq) {
      animRef.current.moveSeq = state.moveSeq;
      if (state.lastMove) {
        const extra = state.lastMove.capturedIds.length ? HOP_MS : 0;
        ms = Math.max(ms, hopDuration(state.lastMove.from, state.lastMove.to) + extra);
      }
    }
    if (!ms) return;
    setInputLocked(true);
    setDiceRolling(rolled);
    const diceTimer = window.setTimeout(() => setDiceRolling(false), DICE_MS);
    const lockTimer = window.setTimeout(() => setInputLocked(false), ms);
    return () => {
      window.clearTimeout(diceTimer);
      window.clearTimeout(lockTimer);
    };
    // Only a new roll or a new move should restart the animation lock.
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [state?.rollId, state?.moveSeq]);

  const hostApply = useCallback(
    (intent: Intent, actorId: string) => {
      const prev = stateRef.current;
      if (!prev || !hostRef.current) return;
      const next = applyIntent(prev, intent, actorId, Date.now());
      if (!next) return;
      commit(next);
      publish(next);
    },
    [commit, publish],
  );

  useEffect(() => {
    if (!isHost || !state || state.status !== "playing") return;
    const player = state.players[state.currentPlayerIndex];
    if (!player || player.kind !== "bot") return;
    const revision = state.revision;
    const wait = Math.max(0, state.busyUntil - Date.now()) + BOT_THINK_MS;
    const timer = window.setTimeout(() => {
      const current = stateRef.current;
      if (!current || current.revision !== revision || !hostRef.current) return;
      if (current.status !== "playing") return;
      if (Date.now() + 30 < current.busyUntil) return;
      const actor = current.players[current.currentPlayerIndex];
      if (!actor || actor.kind !== "bot") return;
      if (current.phase === "roll") {
        hostApply({ type: "roll" }, current.hostId);
        return;
      }
      if (current.phase === "move") {
        const moves = legalMoves(current);
        if (!moves.length) return;
        const choice = chooseBotMove(current, moves);
        hostApply({ type: "move", tokenId: choice.tokenId }, current.hostId);
      }
    }, wait);
    return () => window.clearTimeout(timer);
  }, [hostApply, isHost, state]);

  useEffect(() => {
    if (!isHost || !state || state.status !== "playing" || state.phase !== "roll" || !state.rollDeadline) return;
    const player = state.players[state.currentPlayerIndex];
    if (!player || player.kind !== "human" || !player.connected) return;
    const revision = state.revision;
    const wait = Math.max(0, state.rollDeadline - Date.now());
    const timer = window.setTimeout(() => {
      const current = stateRef.current;
      if (!current || current.revision !== revision || !hostRef.current) return;
      if (current.phase !== "roll" || current.status !== "playing") return;
      hostApply({ type: "pass" }, current.hostId);
    }, wait);
    return () => window.clearTimeout(timer);
  }, [hostApply, isHost, state]);

  const handleWire = useCallback(
    (message: WireMessage, peerId: string) => {
      if (message.kind === "hello") {
        const prev = stateRef.current;
        if (!hostRef.current) {
          if (prev) connRef.current?.send({ kind: "state", state: prev }, peerId);
          return;
        }
        if (!prev) return;
        const existing = prev.players.find(
          (player) => player.id === message.playerId || player.peerId === peerId,
        );
        if (existing?.kind === "human") {
          const next = reattachHuman(prev, existing.id, peerId);
          if (next !== prev) commit(next);
          publish(next === prev ? prev : next);
          setOfflinePeerIds((ids) => ids.filter((id) => id !== peerId && id !== existing.peerId));
          return;
        }
        if (prev.status !== "lobby") {
          connRef.current?.send(
            { kind: "reject", reason: "این بازی شروع شده. فقط می‌توانید تماشا کنید." },
            peerId,
          );
          publish(prev, peerId);
          return;
        }
        const next = addHuman(
          prev,
          {
            id: message.playerId,
            name: message.name.trim().slice(0, 18) || "مهمان",
            seat: message.seat ?? prev.players.length,
            kind: "human",
            peerId,
            connected: true,
          },
          message.seat,
        );
        if (!next) {
          connRef.current?.send({ kind: "reject", reason: "این اتاق پر است." }, peerId);
          return;
        }
        commit(next);
        publish(next);
        return;
      }
      if (message.kind === "state") {
        const prev = stateRef.current;
        if (hostRef.current && prev) return;
        const hello = joinHelloRef.current;
        let incoming = message.state;
        if (hostRef.current && !prev && hello) {
          incoming = reattachHuman(incoming, hello.playerId, myIdRef.current ?? hello.playerId);
        }
        if (!prev || incoming.revision > prev.revision) {
          commit(incoming);
          setWaiting(false);
          if (hostRef.current && incoming !== message.state) publish(incoming);
        }
        const view = stateRef.current;
        if (
          hello &&
          view?.status === "lobby" &&
          !view.players.some(
            (player) => player.id === hello.playerId || player.peerId === myIdRef.current,
          )
        ) {
          announceSelf(peerId);
        }
        return;
      }
      if (message.kind === "intent" && hostRef.current) {
        hostApply(message.intent, message.actorId);
        return;
      }
      if (message.kind === "reject" && !hostRef.current) {
        joinHelloRef.current = null;
        setError(message.reason);
      }
    },
    [announceSelf, commit, hostApply, publish],
  );

  const handleLeavePeer = useCallback(
    (peerId: string, explicit: boolean) => {
      const prev = stateRef.current;
      if (!prev) return;
      if (!explicit) {
        setOfflinePeerIds((ids) => (ids.includes(peerId) ? ids : [...ids, peerId]));
        if (!hostRef.current) return;
        const next = markPeerAway(prev, peerId);
        if (next !== prev) {
          commit(next);
          publish(next);
        }
        return;
      }
      setOfflinePeerIds((ids) => ids.filter((id) => id !== peerId));
      const hostPlayer = prev.players.find((player) => player.id === prev.hostId);
      if (hostRef.current) {
        const next = convertPeerToBot(prev, peerId);
        if (next !== prev) {
          commit(next);
          publish(next);
        }
        return;
      }
      if (hostPlayer?.peerId !== peerId) return;
      const alive = new Set(connRef.current?.peerIds() ?? []);
      if (myIdRef.current) alive.add(myIdRef.current);
      alive.delete(peerId);
      const candidates = prev.players
        .filter(
          (player) =>
            player.kind === "human" &&
            player.peerId &&
            player.peerId !== peerId &&
            alive.has(player.peerId),
        )
        .sort((a, b) => a.seat - b.seat);
      if (candidates[0]?.peerId !== myIdRef.current) return;
      hostRef.current = true;
      setIsHost(true);
      const converted = convertPeerToBot(prev, peerId);
      const next = {
        ...converted,
        hostId: myIdRef.current ?? converted.hostId,
        revision: converted.revision + 1,
      };
      commit(next);
      publish(next);
    },
    [commit, publish],
  );

  const wireRef = useRef(handleWire);
  const leavePeerRef = useRef(handleLeavePeer);
  useEffect(() => {
    wireRef.current = handleWire;
    leavePeerRef.current = handleLeavePeer;
  });

  const openRoom = useCallback(
    async (code: string, role: RoomRole, options?: ConnectOptions) => {
      connRef.current?.leave();
      readyRef.current = false;
      const early: Array<{ message: WireMessage; peerId: string }> = [];
      const earlyPeers: string[] = [];
      const connection = await connectRoom(code, {
        onPeerJoin: (peerId) => {
          setOfflinePeerIds((ids) => ids.filter((id) => id !== peerId));
          if (!readyRef.current) {
            earlyPeers.push(peerId);
            return;
          }
          if (hostRef.current && stateRef.current) {
            const existing = stateRef.current.players.find(
              (player) => player.peerId === peerId && player.kind === "human" && !player.connected,
            );
            if (existing) {
              const next = reattachHuman(stateRef.current, existing.id, peerId);
              commit(next);
              publish(next);
              return;
            }
            publish(stateRef.current, peerId);
          } else announceSelf(peerId);
        },
        onPeerLeave: (peerId, explicit) => {
          if (readyRef.current) leavePeerRef.current(peerId, explicit);
        },
        onMessage: (message, peerId) => {
          if (!readyRef.current) early.push({ message, peerId });
          else wireRef.current(message, peerId);
        },
        onStatus: (status, detail) => {
          setSyncStatus(status);
          setSyncDetail(detail ?? null);
        },
      }, role, options);
      connRef.current = connection;
      return {
        connection,
        flush: () => {
          readyRef.current = true;
          for (const item of early) wireRef.current(item.message, item.peerId);
          const peers = new Set<string>([...earlyPeers, ...connection.peerIds()]);
          for (const peerId of peers) {
            if (hostRef.current && stateRef.current) publish(stateRef.current, peerId);
            else announceSelf(peerId);
          }
        },
      };
    },
    [announceSelf, commit, publish],
  );

  const leave = useCallback(() => {
    connRef.current?.leave();
    connRef.current = null;
    hostRef.current = false;
    myIdRef.current = null;
    joinHelloRef.current = null;
    readyRef.current = false;
    setOnline(false);
    setIsHost(false);
    setMyId(null);
    setWaiting(false);
    setSyncStatus("offline");
    setSyncDetail(null);
    setDiceRolling(false);
    setInputLocked(false);
    setOfflinePeerIds([]);
    forgetSeat();
    commit(null);
    if (typeof window !== "undefined") {
      window.history.replaceState(null, "", window.location.pathname);
    }
  }, [commit]);

  const startLocal = useCallback(
    (count: PlayerCount, seats: SeatSetup[], name: string) => {
      leave();
      hostRef.current = true;
      const next = createLocalMatch(count, seats, name);
      myIdRef.current = next.hostId;
      setMyId(next.hostId);
      setIsHost(true);
      setOnline(false);
      setError(null);
      commit(next);
    },
    [commit, leave],
  );

  const createOnline = useCallback(
    async (count: PlayerCount, name: string, seat: number) => {
      setError(null);
      setWaiting(true);
      setOnline(true);
      joinHelloRef.current = null;
      let lastError: unknown;
      for (let attempt = 0; attempt < 5; attempt++) {
        const code = roomCode();
        try {
          const { connection, flush } = await openRoom(code, "host");
          hostRef.current = true;
          myIdRef.current = connection.selfId;
          setIsHost(true);
          setMyId(connection.selfId);
          const next = createLobby({
            roomId: code,
            hostId: connection.selfId,
            hostName: name,
            count,
            peerId: connection.selfId,
            hostSeat: seat,
          });
        commit(next);
        flush();
        rememberSeat({
          roomId: code,
          playerId: connection.selfId,
          name: name.trim().slice(0, 18) || "میزبان",
          role: "host",
          relayId: connection.selfId,
        });
        setWaiting(false);
        window.history.replaceState(null, "", `${window.location.pathname}?room=${code}`);
          return;
        } catch (err) {
          lastError = err;
          connRef.current?.leave();
          connRef.current = null;
          if (!(err instanceof RoomBusyError)) break;
        }
      }
      setWaiting(false);
      setOnline(false);
      hostRef.current = false;
      setError(lastError instanceof Error ? lastError.message : "اتاق باز نشد.");
    },
    [commit, openRoom],
  );

  const joinOnline = useCallback(
    async (code: string, name: string, seat: number) => {
      const clean = code.trim().toUpperCase();
      if (clean.length < 4) {
        setError("کد پنج‌حرفی اتاق را وارد کنید.");
        return;
      }
      setError(null);
      setWaiting(true);
      setOnline(true);
      hostRef.current = false;
      setIsHost(false);
      try {
        const { connection, flush } = await openRoom(clean, "guest");
        myIdRef.current = connection.selfId;
        setMyId(connection.selfId);
        const guestName = name.trim().slice(0, 18) || "مهمان";
        joinHelloRef.current = {
          playerId: connection.selfId,
          name: guestName,
          seat,
        };
        rememberSeat({
          roomId: clean,
          playerId: connection.selfId,
          name: guestName,
          role: "guest",
          relayId: connection.selfId,
        });
        flush();
        window.history.replaceState(
          null,
          "",
          `${window.location.pathname}?room=${clean}`,
        );
        window.setTimeout(() => {
          if (!stateRef.current) {
            setSyncDetail(
              "هنوز میزبان پیدا نشده. هر دو صفحه را باز نگه دارید؛ اتصال از اینترنت رد می‌شود و ممکن است کمی طول بکشد.",
            );
          }
        }, 12000);
      } catch (err) {
        setWaiting(false);
        setOnline(false);
        setError(err instanceof Error ? err.message : "ورود به اتاق ممکن نشد.");
      }
    },
    [openRoom],
  );

  const act = useCallback(
    (intent: Intent) => {
      audioRef.current?.unlock();
      const current = stateRef.current;
      if (!current) return;
      const mine = myIdRef.current ?? current.hostId;
      if (!online) {
        const currentId =
          current.players[current.currentPlayerIndex]?.id ?? current.hostId;
        hostApply(
          intent,
          intent.type === "roll" || intent.type === "move" ? currentId : current.hostId,
        );
        return;
      }
      if (hostRef.current) {
        const currentPlayer = current.players[current.currentPlayerIndex];
        const actor =
          intent.type === "roll" || intent.type === "move"
            ? currentPlayer?.kind === "bot"
              ? current.hostId
              : mine
            : current.hostId;
        hostApply(intent, actor);
        return;
      }
      connRef.current?.send({ kind: "intent", intent, actorId: mine });
    },
    [hostApply, online],
  );

  const resumeOnline = useCallback(
    async (saved: SeatMemory) => {
      setError(null);
      setWaiting(true);
      setOnline(true);
      hostRef.current = saved.role === "host";
      setIsHost(saved.role === "host");
      myIdRef.current = saved.playerId;
      setMyId(saved.playerId);
      joinHelloRef.current = { playerId: saved.playerId, name: saved.name };
      try {
        const { flush } = await openRoom(saved.roomId, saved.role, {
          selfId: saved.relayId,
          resume: true,
        });
        flush();
        window.history.replaceState(null, "", `${window.location.pathname}?room=${saved.roomId}`);
        window.setTimeout(() => {
          if (!stateRef.current) {
            setSyncDetail("هنوز به بازی برنگشتیم. صفحه را باز نگه دارید تا دوباره وصل شود.");
          }
        }, 12000);
      } catch (err) {
        setWaiting(false);
        setOnline(false);
        hostRef.current = false;
        setIsHost(false);
        setError(err instanceof Error ? err.message : "برگشت به بازی ممکن نشد.");
      }
    },
    [openRoom],
  );

  useEffect(() => {
    if (resumedRef.current) return;
    const saved = readSeat();
    if (!saved) return;
    resumedRef.current = true;
    void resumeOnline(saved);
  }, [resumeOnline]);

  const toggleSound = useCallback(() => {
    const muted = audioRef.current?.toggle() ?? false;
    setSoundOn(!muted);
  }, []);

  return {
    state,
    online,
    isHost,
    myId,
    syncStatus,
    syncDetail,
    error,
    waiting,
    soundOn,
    diceRolling,
    inputLocked,
    offlinePeerIds,
    startLocal,
    createOnline,
    joinOnline,
    act,
    leave,
    toggleSound,
    dismissError: () => setError(null),
  };
}
