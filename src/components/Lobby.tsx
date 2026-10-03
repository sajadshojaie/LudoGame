"use client";

import { useMemo, useState } from "react";
import { Bot, Dices, Link2, Users } from "lucide-react";
import type { PlayerCount, SeatSetup } from "@/types/game";
import { buildLayout } from "@/utils/boardGeometry";
import { faDigits, PLAYER_THEMES, themeFor } from "@/utils/palette";
import { LudoBoard } from "@/components/LudoBoard";

interface LobbyProps {
  initialRoom?: string;
  busy?: boolean;
  error?: string | null;
  onDismissError?: () => void;
  onLocal: (count: PlayerCount, seats: SeatSetup[], name: string) => void;
  onCreate: (count: PlayerCount, name: string) => void;
  onJoin: (code: string, name: string) => void;
}

const COUNTS: PlayerCount[] = [4, 5, 6];

export function Lobby({ initialRoom = "", busy, error, onDismissError, onLocal, onCreate, onJoin }: LobbyProps) {
  const [count, setCount] = useState<PlayerCount>(4);
  const [name, setName] = useState("");
  const [code, setCode] = useState(initialRoom);
  const [panel, setPanel] = useState<"play" | "join">(initialRoom ? "join" : "play");
  const [seats, setSeats] = useState<SeatSetup[]>(() =>
    ["شما", "رویا", "کیان", "سارا", "نیما", "لاله"].map((label, index) => ({
      name: label,
      kind: index === 0 ? "human" : "bot",
    })),
  );

  const layout = useMemo(() => buildLayout(count), [count]);
  const previewTokens = useMemo(
    () =>
      Array.from({ length: count }, (_, seat) =>
        Array.from({ length: 4 }, (__, index) => ({
          id: `preview-${seat}-${index}`,
          playerId: PLAYER_THEMES[seat].id,
          seat,
          index,
          progress: -1,
        })),
      ).flat(),
    [count],
  );
  const previewPlayers = PLAYER_THEMES.slice(0, count).map((theme, seat) => ({
    id: theme.id,
    name: seat === 0 ? name.trim() || "شما" : seats[seat]?.kind === "human" ? seats[seat].name || `بازیکن ${seat + 1}` : seats[seat]?.name || theme.label,
    seat,
    kind: seat === 0 ? ("human" as const) : (seats[seat]?.kind ?? "bot"),
    peerId: null,
    connected: true,
  }));

  const trimmed = name.trim();

  return (
    <div className="mx-auto flex min-h-dvh w-full max-w-6xl items-center justify-center gap-10 px-4 py-6 lg:px-8">
      <div className="hidden min-w-0 flex-1 lg:block">
        <div className="mx-auto w-full max-w-[560px]">
          <LudoBoard layout={layout} tokens={previewTokens} players={previewPlayers} currentSeat={0} legalTokenIds={[]} lastMove={null} />
        </div>
      </div>

      <section className="w-full max-w-[400px] rounded-[2rem] bg-white/90 p-5 shadow-[0_24px_60px_rgba(18,48,78,0.14)] ring-1 ring-white">
        <h1 className="text-center font-display text-4xl text-[#14324f]">منچ بازی</h1>

        <div className="mt-5 flex gap-1 rounded-full bg-[#eef6fb] p-1">
          <button type="button" className={`seg ${panel === "play" ? "seg-on" : ""}`} onClick={() => setPanel("play")}>
            <Dices size={16} /> بازی
          </button>
          <button type="button" className={`seg ${panel === "join" ? "seg-on" : ""}`} onClick={() => setPanel("join")}>
            <Link2 size={16} /> ورود
          </button>
        </div>

        <input
          className="field mt-5"
          maxLength={18}
          value={name}
          placeholder="نام شما"
          aria-label="نام شما"
          onChange={(event) => setName(event.target.value)}
        />

        {panel === "play" ? (
          <>
            <div className="mt-4 grid grid-cols-3 gap-2">
              {COUNTS.map((value) => (
                <button key={value} type="button" className={`count-btn ${count === value ? "count-on" : ""}`} onClick={() => setCount(value)}>
                  {faDigits(value)}
                </button>
              ))}
            </div>
            <ul className="mt-4 space-y-2">
              {seats.slice(0, count).map((seat, index) => {
                const theme = themeFor(index);
                return (
                  <li key={theme.id} className="flex items-center gap-2 rounded-2xl bg-[#f4f9fd] px-2 py-1">
                    <span className="h-7 w-7 shrink-0 rounded-full" style={{ background: theme.hex }} />
                    <input
                      className="field !border-transparent !bg-transparent !py-1.5"
                      value={index === 0 ? trimmed || "شما" : seat.name}
                      disabled={index === 0}
                      maxLength={18}
                      aria-label={theme.label}
                      onChange={(event) =>
                        setSeats((prev) => prev.map((item, i) => (i === index ? { ...item, name: event.target.value } : item)))
                      }
                    />
                    {index === 0 ? null : (
                      <button
                        type="button"
                        className={`shrink-0 rounded-full px-3 py-1.5 text-xs font-bold ${seat.kind === "bot" ? "bg-[#14324f] text-white" : "bg-white text-[#14324f] ring-1 ring-[#14324f]/15"}`}
                        onClick={() =>
                          setSeats((prev) =>
                            prev.map((item, i) =>
                              i === index ? { ...item, kind: item.kind === "bot" ? "human" : "bot" } : item,
                            ),
                          )
                        }
                      >
                        {seat.kind === "bot" ? (
                          <span className="inline-flex items-center gap-1">
                            <Bot size={13} /> ربات
                          </span>
                        ) : (
                          <span className="inline-flex items-center gap-1">
                            <Users size={13} /> بازیکن
                          </span>
                        )}
                      </button>
                    )}
                  </li>
                );
              })}
            </ul>
            <div className="mt-4 grid grid-cols-2 gap-2">
              <button
                type="button"
                className="btn-primary"
                disabled={busy || !trimmed}
                onClick={() => onLocal(count, seats.slice(0, count).map((seat, i) => ({ ...seat, name: i === 0 ? trimmed : seat.name })), trimmed)}
              >
                شروع بازی
              </button>
              <button type="button" className="btn-ghost" disabled={busy || !trimmed} onClick={() => onCreate(count, trimmed)}>
                اتاق آنلاین
              </button>
            </div>
          </>
        ) : (
          <>
            <input
              className="field mt-4 text-center tracking-[0.28em] uppercase"
              value={code}
              maxLength={8}
              placeholder="کد اتاق"
              aria-label="کد اتاق"
              onChange={(event) => setCode(event.target.value.toUpperCase())}
            />
            <button
              type="button"
              className="btn-primary mt-4 w-full"
              disabled={busy || !trimmed || code.trim().length < 4}
              onClick={() => onJoin(code, trimmed)}
            >
              ورود
            </button>
          </>
        )}

        {error ? (
          <button type="button" className="mt-4 w-full rounded-2xl bg-rose-500/15 px-3 py-2 text-right text-sm text-rose-800" onClick={onDismissError}>
            {error}
          </button>
        ) : null}

        <div className="mx-auto mt-6 w-full max-w-sm lg:hidden">
          <LudoBoard layout={layout} tokens={previewTokens} players={previewPlayers} currentSeat={0} legalTokenIds={[]} lastMove={null} />
        </div>
      </section>
    </div>
  );
}
