"use client";

import { useMemo, useState } from "react";
import { BookOpen, Bot, Copy, Check, LogOut, RotateCcw, UserPlus, Volume2, VolumeX } from "lucide-react";
import type { GameState, Intent } from "@/types/game";
import { buildLayout } from "@/utils/boardGeometry";
import { activePlayer, legalMoves, playerFinished } from "@/utils/gameRules";
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
  const [copied, setCopied] = useState(false);
  const current = activePlayer(state);
  const moves = useMemo(() => legalMoves(state), [state]);
  const controllable =
    state.status === "playing" &&
    current &&
    !playerFinished(state, current.id) &&
    (props.online ? current.id === props.myId : current.kind === "human");
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

  return (
    <div className="grid h-dvh min-w-0 grid-rows-[auto_minmax(0,1fr)_auto] overflow-hidden lg:grid-cols-[minmax(0,1fr)_380px] lg:grid-rows-[auto_minmax(0,1fr)]">
      <header className="flex items-center justify-between gap-3 border-b border-[#14324f]/10 px-4 py-3 lg:col-span-2">
        <div>
          <p className="font-display text-2xl leading-none text-[#14324f]">منچ بازی</p>
          <p className="text-xs text-[#5a7e99]">
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
          <button type="button" className="icon-btn" onClick={props.onLeave} aria-label="خروج">
            <LogOut size={16} />
          </button>
        </div>
      </header>

      <div className="flex min-h-0 min-w-0 flex-col px-3 py-3 lg:px-6">
        <div className="board-slot min-h-0 flex-1">
          <div className="board-fit">
            <LudoBoard
              layout={layout}
              tokens={state.tokens}
              players={state.players}
              currentSeat={current?.seat ?? null}
              legalTokenIds={canMove ? moves.map((move) => move.tokenId) : []}
              lastMove={state.lastMove}
              onToken={(tokenId) => props.onAct({ type: "move", tokenId })}
            />
          </div>
        </div>
      </div>

      <aside className="flex max-h-[46dvh] min-h-0 flex-col overflow-y-auto border-t border-[#14324f]/10 bg-white/60 p-4 lg:max-h-none lg:border-r lg:border-t-0 lg:p-6">
        {state.status === "lobby" ? (
          <div className="m-auto w-full max-w-sm">
            <LobbyPanel {...props} />
          </div>
        ) : (
          <div className="flex w-full flex-col gap-6 lg:h-full lg:justify-between">
            <TurnCard name={current?.name ?? "منچ بازی"} seat={current?.seat ?? 0} />
            <div className="flex items-center justify-center lg:flex-1">
              <Dice value={state.dice} rolling={props.diceRolling} enabled={canRoll} label="" onRoll={() => props.onAct({ type: "roll" })} />
            </div>
            <div className="flex flex-col gap-2">
              {state.players.map((player) => (
                <SeatCard key={player.id} name={player.name} seat={player.seat} active={current?.id === player.id} bot={player.kind === "bot"} place={place(player.id)} />
              ))}
              {state.rankings.length > 0 && (props.isHost || !props.online) ? (
                <button type="button" className="btn-primary mt-2" onClick={() => props.onAct({ type: "rematch" })}>
                  <RotateCcw size={16} /> شروع مجدد
                </button>
              ) : null}
            </div>
          </div>
        )}
      </aside>

      {rulesOpen ? <Rules onClose={() => setRulesOpen(false)} /> : null}
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
          <button type="button" className="btn-primary" disabled={state.players.length < 2} onClick={() => onAct({ type: "start" })}>
            شروع بازی
          </button>
        </div>
      ) : (
        <p className="mt-4 text-sm text-[#24506f]">منتظر شروع میزبان.</p>
      )}
    </div>
  );
}

function TurnCard({ name, seat }: { name: string; seat: number }) {
  const theme = themeFor(seat);
  return (
    <div className="flex items-center gap-4 rounded-[1.8rem] bg-white px-5 py-5 shadow-sm" style={{ borderRight: `10px solid ${theme.hex}` }}>
      <span className="grid h-20 w-20 shrink-0 place-items-center rounded-3xl text-4xl font-extrabold text-white shadow-inner" style={{ background: theme.hex }}>
        {name.trim().slice(0, 1)}
      </span>
      <div className="min-w-0">
        <p className="text-sm font-semibold text-[#5a7e99]">نوبت</p>
        <p className="truncate text-4xl font-extrabold leading-tight text-[#14324f]">{name}</p>
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
      className={`flex items-center gap-2 rounded-2xl px-3 py-3 ${active ? "bg-white shadow-sm" : "bg-white/70"}`}
      style={active ? { outline: `2px solid ${theme.hex}` } : undefined}
    >
      <span className="h-4 w-4 shrink-0 rounded-full" style={{ background: theme.hex }} />
      <span className="min-w-0 flex-1 truncate text-sm font-semibold text-[#14324f]">{name}</span>
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
          <li>اگر روی مهره حریف بنشینی، آن مهره به همان چهارخانهٔ اول برمی‌گردد.</li>
          <li>دو مهره همرنگ روی یک خانه معمولی سد می‌سازند و بقیه نمی‌توانند از آن رد شوند.</li>
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

