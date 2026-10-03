"use client";

import { useMemo, useState } from "react";
import { BookOpen, Bot, Copy, Check, LogOut, RotateCcw, UserPlus, Volume2, VolumeX } from "lucide-react";
import type { GameState, Intent } from "@/types/game";
import { buildLayout } from "@/utils/boardGeometry";
import { activePlayer, isFinishedProgress, legalMoves, playerFinished } from "@/utils/gameRules";
import { faDigits, themeFor } from "@/utils/palette";
import { Dice } from "@/components/Dice";
import { LudoBoard } from "@/components/LudoBoard";

interface GameScreenProps {
  state: GameState;
  online: boolean;
  isHost: boolean;
  myId: string | null;
  syncStatus: string;
  syncDetail: string | null;
  soundOn: boolean;
  diceRolling: boolean;
  inputLocked: boolean;
  onAct: (intent: Intent) => void;
  onLeave: () => void;
  onToggleSound: () => void;
}

export function GameScreen(props: GameScreenProps) {
  const { state } = props;
  const layout = useMemo(() => buildLayout(state.maxPlayers), [state.maxPlayers]);
  const [rulesOpen, setRulesOpen] = useState(false);
  const [leaveOpen, setLeaveOpen] = useState(false);
  const [copied, setCopied] = useState(false);
  const current = activePlayer(state);
  const roller = state.players[state.rollerIndex] ?? current;
  const displayed = props.diceRolling && state.phase === "roll" && roller ? roller : current;
  const moves = useMemo(() => legalMoves(state), [state]);
  const controllable =
    state.status === "playing" &&
    displayed &&
    !playerFinished(state, displayed.id) &&
    (props.online ? displayed.id === props.myId : displayed.kind === "human");
  const canRoll = Boolean(controllable && state.phase === "roll" && !props.inputLocked && !props.diceRolling);
  const canMove = Boolean(controllable && state.phase === "move" && !props.inputLocked && !props.diceRolling);
  const place = (id: string) => {
    const index = state.rankings.indexOf(id);
    return index === -1 ? null : index + 1;
  };

  async function copyLink() {
    const code = state.roomId ?? "";
    const url = `${window.location.origin}${window.location.pathname}?room=${code}`;
    try {
      await navigator.clipboard.writeText(url);
      setCopied(true);
      window.setTimeout(() => setCopied(false), 1600);
    } catch {
      setCopied(false);
    }
  }

  const playing = state.status !== "lobby";

  return (
    <div className="flex h-dvh min-w-0 flex-col overflow-hidden lg:grid lg:grid-cols-[minmax(0,1fr)_380px] lg:grid-rows-[auto_minmax(0,1fr)]">
      <header className="flex shrink-0 items-center justify-between gap-3 border-b border-[#14324f]/10 px-3 py-2 lg:col-span-2 lg:px-4 lg:py-3">
        <div className="min-w-0">
          <p className="font-display text-xl leading-none text-[#14324f] lg:text-2xl">منچ بازی</p>
          <p className="truncate text-xs text-[#5a7e99]">
            {faDigits(state.maxPlayers)} نفره · {props.online ? `اتاق ${state.roomId}` : "روی همین دستگاه"}
            {props.online ? ` · ${props.syncStatus === "live" ? "زنده" : "در حال اتصال"}` : ""}
          </p>
        </div>
        <div className="flex items-center gap-2">
          {props.online && state.roomId ? (
            <button type="button" className="icon-btn" onClick={() => void copyLink()} aria-label="کپی لینک اتاق">
              {copied ? <Check size={16} /> : <Copy size={16} />}
            </button>
          ) : null}
          <button type="button" className="icon-btn" onClick={props.onToggleSound} aria-label={props.soundOn ? "بی‌صدا" : "صدادار"}>
            {props.soundOn ? <Volume2 size={16} /> : <VolumeX size={16} />}
          </button>
          <button type="button" className="icon-btn" onClick={() => setRulesOpen(true)} aria-label="قوانین">
            <BookOpen size={16} />
          </button>
          <button type="button" className="icon-btn" onClick={() => setLeaveOpen(true)} aria-label="خروج">
            <LogOut size={16} />
          </button>
        </div>
      </header>

      <div className="flex min-h-0 min-w-0 flex-1 flex-col justify-center lg:contents">
      <div className={`${playing ? "flex" : "hidden lg:flex"} min-h-0 min-w-0 w-full flex-col px-2 py-1 lg:flex-1 lg:px-6 lg:py-3`}>
        <div className="board-slot min-h-0 w-full lg:flex-1">
          <div className="board-fit">
            <LudoBoard
              layout={layout}
              tokens={state.tokens}
              players={state.players}
              currentSeat={displayed?.seat ?? null}
              legalTokenIds={canMove ? moves.map((move) => move.tokenId) : []}
              lastMove={state.lastMove}
              onToken={(tokenId) => props.onAct({ type: "move", tokenId })}
            />
          </div>
        </div>
      </div>

      <aside
        className={`flex min-h-0 flex-col border-[#14324f]/10 bg-white/75 lg:border-r lg:border-t-0 lg:bg-white/60 lg:p-6 ${
          playing
            ? "shrink-0 overflow-x-hidden border-t px-3 pt-2 pb-[max(0.5rem,env(safe-area-inset-bottom))] lg:overflow-y-auto"
            : "flex-1 overflow-y-auto border-t p-4 lg:flex-none"
        }`}
      >
        {state.status === "lobby" ? (
          <div className="m-auto w-full max-w-sm">
            <LobbyPanel {...props} />
          </div>
        ) : (
          <div className="flex w-full flex-col gap-2 lg:h-full lg:justify-between lg:gap-6">
            <div className="flex items-center gap-2 lg:contents">
              <div className="min-w-0 flex-1 lg:contents">
                <TurnCard name={displayed?.name ?? "منچ بازی"} seat={displayed?.seat ?? 0} />
              </div>
              <div className="dice-dock lg:order-2 lg:flex lg:flex-1 lg:items-center">
                <Dice value={state.dice} rolling={props.diceRolling} enabled={canRoll} label="" onRoll={() => props.onAct({ type: "roll" })} />
              </div>
            </div>
            {state.lastMove && isFinishedProgress(state.lastMove.to, state.maxPlayers) ? (
              <div className="lg:order-1">
                <ArriveNote state={state} />
              </div>
            ) : null}
            <div className="flex max-w-full gap-1.5 overflow-x-auto pb-1 lg:order-3 lg:w-full lg:flex-col lg:gap-2 lg:overflow-visible lg:pb-0">
              {state.players.map((player) => (
                <SeatCard key={player.id} name={player.name} seat={player.seat} active={displayed?.id === player.id} bot={player.kind === "bot"} place={place(player.id)} />
              ))}
              {state.rankings.length > 0 && (props.isHost || !props.online) ? (
                <button type="button" className="btn-primary mt-2 shrink-0" onClick={() => props.onAct({ type: "rematch" })}>
                  <RotateCcw size={16} /> شروع مجدد
                </button>
              ) : null}
            </div>
          </div>
        )}
      </aside>
      </div>

      {rulesOpen ? <Rules onClose={() => setRulesOpen(false)} /> : null}
      {leaveOpen ? (
        <ConfirmLeave
          onStay={() => setLeaveOpen(false)}
          onLeave={() => {
            setLeaveOpen(false);
            props.onLeave();
          }}
        />
      ) : null}
    </div>
  );
}

function LobbyPanel({ state, isHost, online, onAct }: GameScreenProps) {
  const empty = state.maxPlayers - state.players.length;
  return (
    <div>
      <h2 className="font-display text-3xl text-[#14324f]">{state.roomId ?? "منچ بازی"}</h2>
      <ul className="mt-4 space-y-2">
        {state.players.map((player) => {
          const theme = themeFor(player.seat);
          return (
            <li key={player.id} className="flex items-center gap-3 rounded-2xl bg-white/80 px-3 py-2">
              <span className="h-8 w-8 rounded-full" style={{ background: theme.hex }} />
              <span className="flex-1">{player.name}</span>
              <span className="text-xs text-[#5a7e99]">{player.kind === "bot" ? "ربات" : theme.label}</span>
            </li>
          );
        })}
        {Array.from({ length: empty }, (_, index) => (
          <li key={`empty-${index}`} className="rounded-2xl border border-dashed border-[#14324f]/20 px-3 py-3 text-sm text-[#5a7e99]">
            جای خالی
          </li>
        ))}
      </ul>
      {isHost || !online ? (
        <div className="mt-4 grid gap-2">
          <button type="button" className="btn-ghost" disabled={empty === 0} onClick={() => onAct({ type: "add-bot" })}>
            <UserPlus size={16} /> افزودن ربات
          </button>
          <button type="button" className="btn-primary" disabled={state.players.length < 2 || state.players.length > state.maxPlayers} onClick={() => onAct({ type: "start" })}>
            شروع بازی
          </button>
        </div>
      ) : (
        <p className="mt-4 text-sm text-[#24506f]">منتظر شروع میزبان.</p>
      )}
    </div>
  );
}

function ArriveNote({ state }: { state: GameState }) {
  const move = state.lastMove;
  if (!move) return null;
  const player = state.players.find((item) => item.seat === move.seat);
  const theme = themeFor(move.seat);
  const finished = player ? playerFinished(state, player.id) : false;
  const text = finished
    ? `${player?.name ?? "بازیکن"} همه مهره‌ها را به مرکز رساند.`
    : `${player?.name ?? "بازیکن"} یک مهره را به مرکز رساند.`;
  return (
    <p className="rounded-2xl px-4 py-3 text-center text-sm font-bold text-[#14324f]" style={{ background: theme.soft }}>
      {text}
    </p>
  );
}

function ConfirmLeave({ onStay, onLeave }: { onStay: () => void; onLeave: () => void }) {
  return (
    <div className="fixed inset-0 z-40 flex items-end justify-center bg-black/60 p-4 sm:items-center" onClick={onStay}>
      <div className="w-full max-w-sm rounded-3xl bg-white p-6 text-[#16324d]" onClick={(event) => event.stopPropagation()}>
        <h2 className="font-display text-3xl text-[#14324f]">خروج از بازی؟</h2>
        <p className="mt-3 text-sm leading-relaxed text-[#24506f]">اگر خارج شوید این دست را ترک می‌کنید.</p>
        <div className="mt-5 grid grid-cols-2 gap-2">
          <button type="button" className="btn-ghost" onClick={onStay}>
            ماندن
          </button>
          <button type="button" className="btn-primary" onClick={onLeave}>
            خروج
          </button>
        </div>
      </div>
    </div>
  );
}

function TurnCard({ name, seat }: { name: string; seat: number }) {
  const theme = themeFor(seat);
  return (
    <div className="flex w-full min-w-0 items-center gap-2 rounded-2xl bg-white px-3 py-2 shadow-sm lg:gap-4 lg:rounded-[1.8rem] lg:px-5 lg:py-5" style={{ borderRight: `8px solid ${theme.hex}` }}>
      <span className="grid h-11 w-11 shrink-0 place-items-center rounded-2xl text-xl font-extrabold text-white shadow-inner lg:h-20 lg:w-20 lg:rounded-3xl lg:text-4xl" style={{ background: theme.hex }}>
        {name.trim().slice(0, 1)}
      </span>
      <div className="min-w-0">
        <p className="text-xs font-semibold text-[#5a7e99] lg:text-sm">نوبت</p>
        <p className="truncate text-xl font-extrabold leading-tight text-[#14324f] lg:text-4xl">{name}</p>
      </div>
    </div>
  );
}

function placeLabel(place: number): string {
  if (place === 1) return "برنده بازی";
  const names = ["نفر دوم", "نفر سوم", "نفر چهارم", "نفر پنجم", "نفر ششم"];
  return names[place - 2] ?? `نفر ${faDigits(place)}`;
}

function SeatCard({
  name,
  seat,
  active,
  bot,
  place,
}: {
  name: string;
  seat: number;
  active: boolean;
  bot: boolean;
  place: number | null;
}) {
  const theme = themeFor(seat);
  return (
    <div
      className={`flex shrink-0 items-center gap-1.5 rounded-2xl px-2 py-1.5 lg:w-full lg:gap-2 lg:px-3 lg:py-3 ${active ? "bg-white shadow-sm" : "bg-white/70"}`}
      style={active ? { outline: `2px solid ${theme.hex}` } : undefined}
    >
      <span className="h-4 w-4 shrink-0 rounded-full" style={{ background: theme.hex }} />
      <span className="min-w-0 flex-1 truncate text-xs font-semibold text-[#14324f] lg:text-sm">{name}</span>
      {bot && !place ? <Bot size={14} className="shrink-0 text-[#7f9aaf]" /> : null}
      {place ? <span className={`shrink-0 text-xs font-bold ${place === 1 ? "text-amber-600" : "text-[#5a7e99]"}`}>{placeLabel(place)}</span> : null}
    </div>
  );
}

function Rules({ onClose }: { onClose: () => void }) {
  return (
    <div className="fixed inset-0 z-40 flex items-end justify-center bg-black/60 p-4 sm:items-center" onClick={onClose}>
      <div className="max-h-[80dvh] w-full max-w-lg overflow-y-auto rounded-3xl bg-white p-6 text-[#16324d]" onClick={(event) => event.stopPropagation()}>
        <h2 className="font-display text-3xl text-[#14324f]">قانون منچ بازی</h2>
        <ul className="mt-4 space-y-2 text-sm leading-relaxed text-[#24506f]">
          <li>هر رنگ چهار مهره دارد و از خانه شروع می‌کند.</li>
          <li>با آوردن ۶ یک مهره روی خانه شروع همان رنگ می‌آید و دوباره تاس می‌اندازی.</li>
          <li>سه بار ۶ پشت سر هم نوبت را می‌سوزاند. شش سوم بازی نمی‌شود.</li>
          <li>اگر روی خانهٔ حریف بنشینی، همهٔ مهره‌های او در آن خانه به چهارخانهٔ اول برمی‌گردند.</li>
          <li>از مهره‌های سر راه می‌توانی رد شوی. فقط نشستن روی همان خانه آن‌ها را می‌زند.</li>
          <li>زدن مهره هم یک تاس اضافه می‌دهد.</li>
          <li>برای رسیدن به مرکز باید عدد دقیق بیاید. بیشتر از مرکز مجاز نیست.</li>
          <li>اگر با آن تاس حرکتی ممکن نباشد، نوبت رد می‌شود.</li>
          <li>هر کس زودتر هر چهار مهره را به مرکز برساند برنده بازی است. بقیه ادامه می‌دهند و نفر دوم و سوم مشخص می‌شود.</li>
        </ul>
        <button type="button" className="btn-primary mt-5" onClick={onClose}>
          برگشت به میز
        </button>
      </div>
    </div>
  );
}

