"use client";

import { useEffect, useMemo, useState } from "react";
import { Bot, Dices, Link2, Users } from "lucide-react";
import { ThemeToggle } from "@/components/ThemeToggle";
import type { PlayerCount, SeatSetup } from "@/types/game";
import { buildLayout, seatChoices, seatOrder } from "@/utils/boardGeometry";
import { faDigits, PLAYER_THEMES, themeFor } from "@/utils/palette";
import { LudoBoard } from "@/components/LudoBoard";

interface LobbyProps {
  initialRoom?: string;
  busy?: boolean;
  error?: string | null;
  onDismissError?: () => void;
  onLocal: (count: PlayerCount, seats: SeatSetup[], name: string) => void;
  onCreate: (count: PlayerCount, name: string, seat: number) => void;
  onJoin: (code: string, name: string, seat: number) => void;
}

const COUNTS: PlayerCount[] = [2, 3, 4, 5, 6];
const NAME_KEY = "manch-name";
const COLOR_KEY = "manch-color";

export function Lobby({ initialRoom = "", busy, error, onDismissError, onLocal, onCreate, onJoin }: LobbyProps) {
  const [count, setCount] = useState<PlayerCount>(4);
  const [name, setName] = useState("");
  const [mySeat, setMySeat] = useState(0);

  useEffect(() => {
    const saved = window.localStorage.getItem(NAME_KEY);
    if (saved) setName(saved.slice(0, 18));
    const color = Number(window.localStorage.getItem(COLOR_KEY));
    if (Number.isInteger(color) && color >= 0 && color < 6) setMySeat(color);
  }, []);

  function chooseColor(seat: number) {
    setMySeat(seat);
    window.localStorage.setItem(COLOR_KEY, String(seat));
  }

  function rememberName(value: string) {
    const next = value.slice(0, 18);
    const trimmed = next.trim();
    setName(next);
    if (trimmed) window.localStorage.setItem(NAME_KEY, trimmed);
    else window.localStorage.removeItem(NAME_KEY);
  }
  const [code, setCode] = useState(initialRoom);
  const [panel, setPanel] = useState<"offline" | "online">(initialRoom ? "online" : "offline");
  const [onlineMode, setOnlineMode] = useState<"create" | "join">(initialRoom ? "join" : "create");
  const [seats, setSeats] = useState<SeatSetup[]>(() =>
    ["شما", "رویا", "کیان", "سارا", "نیما", "لاله"].map((label, index) => ({
      name: label,
      kind: index === 0 ? "human" : "bot",
    })),
  );

  const joinWide = panel === "online" && onlineMode === "join";
  const choices = seatChoices(joinWide ? 6 : count);
  const activeSeat = choices.includes(mySeat) ? mySeat : choices[0];
  const plan = useMemo(() => seatOrder(count, activeSeat), [count, activeSeat]);
  const layout = useMemo(() => buildLayout(count), [count]);
  const previewTokens = useMemo(
    () =>
      plan.flatMap((seat) =>
        Array.from({ length: 4 }, (_, index) => ({
          id: `preview-${seat}-${index}`,
          playerId: PLAYER_THEMES[seat].id,
          seat,
          index,
          progress: -1,
        })),
      ),
    [plan],
  );
  const previewPlayers = plan.map((seat, index) => {
    const theme = PLAYER_THEMES[seat];
    return {
      id: theme.id,
      name: index === 0 ? name.trim() || "شما" : seats[index]?.kind === "human" ? seats[index].name || `بازیکن ${index + 1}` : seats[index]?.name || theme.label,
      seat,
      kind: index === 0 ? ("human" as const) : (seats[index]?.kind ?? "bot"),
      peerId: null,
      connected: true,
    };
  });

  const trimmed = name.trim();

  return (
    <div className="mx-auto flex min-h-dvh w-full max-w-6xl items-center justify-center gap-10 px-4 py-6 lg:px-8">
      <div className="hidden min-w-0 flex-1 lg:block">
        <div className="mx-auto w-full max-w-[560px]">
          <LudoBoard layout={layout} tokens={previewTokens} players={previewPlayers} currentSeat={0} legalTokenIds={[]} lastMove={null} />
        </div>
      </div>

      <section className="lobby-card relative w-full max-w-[420px] overflow-hidden rounded-[2rem] bg-white/90 p-5 shadow-[0_24px_60px_rgba(18,48,78,0.14)] ring-1 ring-white">
        <div className="pointer-events-none absolute -left-8 -top-10 h-28 w-28 rounded-full bg-[#ffe08a]/70 blur-2xl" />
        <div className="pointer-events-none absolute -bottom-8 -right-6 h-24 w-24 rounded-full bg-[#7ec8f0]/60 blur-2xl" />
        <div className="relative flex items-start justify-between gap-3">
          <div>
            <p className="text-xs font-bold tracking-wide text-[#e2a325]">منچ زنده</p>
            <h1 className="font-display text-4xl leading-none text-[#14324f]">منچ بازی</h1>
            <p className="mt-2 text-sm text-[#24506f]">با دوستات از هر شهر، یا همین‌جا با ربات.</p>
          </div>
          <ThemeToggle />
        </div>
        <div className="relative mt-5 flex gap-1 rounded-full bg-[#eef6fb] p-1">
          <button type="button" className={`seg text-sm ${panel === "offline" ? "seg-on" : ""}`} onClick={() => setPanel("offline")}>
            <Dices size={16} /> بازی آفلاین
          </button>
          <button type="button" className={`seg text-sm ${panel === "online" ? "seg-on" : ""}`} onClick={() => setPanel("online")}>
            <Link2 size={16} /> بازی آنلاین
          </button>
        </div>

        <input
          className="field mt-5"
          maxLength={18}
          value={name}
          placeholder="نام شما"
          aria-label="نام شما"
          onChange={(event) => rememberName(event.target.value)}
        />

        <div className="mt-4">
          <p className="mb-2 text-xs font-bold text-[#5a7e99]">رنگ مهره شما</p>
          <div className="flex flex-wrap gap-2">
            {choices.map((seat) => {
              const theme = themeFor(seat);
              const on = seat === activeSeat;
              return (
                <button
                  key={theme.id}
                  type="button"
                  className={`h-9 w-9 rounded-full ${on ? "ring-2 ring-[#14324f] ring-offset-2" : ""}`}
                  style={{ background: theme.hex }}
                  aria-label={theme.label}
                  aria-pressed={on}
                  onClick={() => chooseColor(seat)}
                />
              );
            })}
          </div>
        </div>

        {panel === "offline" ? (
          <>
            <div className="mt-4 grid grid-cols-5 gap-2">
              {COUNTS.map((value) => (
                <button key={value} type="button" className={`count-btn ${count === value ? "count-on" : ""}`} onClick={() => setCount(value)}>
                  {faDigits(value)}
                </button>
              ))}
            </div>
            <ul className="mt-4 space-y-2">
              {plan.map((boardSeat, index) => {
                const seat = seats[index];
                const theme = themeFor(boardSeat);
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
            <button
              type="button"
              className="btn-primary mt-4 w-full"
              disabled={busy || !trimmed}
              onClick={() =>
                onLocal(
                  count,
                  plan.map((boardSeat, index) => ({
                    name: index === 0 ? trimmed : seats[index]?.name || "",
                    kind: index === 0 ? "human" : seats[index]?.kind ?? "bot",
                    seat: boardSeat,
                  })),
                  trimmed,
                )
              }
            >
              شروع بازی
            </button>
          </>
        ) : (
          <>
            <div className="mt-4 flex gap-1 rounded-full bg-[#eef6fb] p-1">
              <button type="button" className={`seg text-sm ${onlineMode === "create" ? "seg-on" : ""}`} onClick={() => setOnlineMode("create")}>
                ساخت اتاق
              </button>
              <button type="button" className={`seg text-sm ${onlineMode === "join" ? "seg-on" : ""}`} onClick={() => setOnlineMode("join")}>
                ورود به اتاق
              </button>
            </div>
            {onlineMode === "create" ? (
              <>
                <div className="mt-4 grid grid-cols-5 gap-2">
                  {COUNTS.map((value) => (
                    <button key={value} type="button" className={`count-btn ${count === value ? "count-on" : ""}`} onClick={() => setCount(value)}>
                      {faDigits(value)}
                    </button>
                  ))}
                </div>
                <button type="button" className="btn-primary mt-4 w-full" disabled={busy || !trimmed} onClick={() => onCreate(count, trimmed, activeSeat)}>
                  ساخت اتاق
                </button>
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
                  onClick={() => onJoin(code, trimmed, activeSeat)}
                >
                  ورود به اتاق
                </button>
              </>
            )}
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
