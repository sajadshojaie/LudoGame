"use client";

import { Suspense } from "react";
import { useSearchParams } from "next/navigation";
import { GameScreen } from "@/components/GameScreen";
import { Lobby } from "@/components/Lobby";
import { useGameSession } from "@/hooks/useGameSession";

export default function HomePage() {
  return (
    <Suspense fallback={<Splash />}>
      <Table />
    </Suspense>
  );
}

function Table() {
  const params = useSearchParams();
  const room = (params.get("room") ?? "").toUpperCase();
  const session = useGameSession();

  if (!session.state) {
    if (session.waiting) {
      return (
        <div className="flex min-h-dvh flex-col items-center justify-center gap-3 px-6 text-center">
          <p className="font-display text-4xl text-[#14324f]">منچ بازی</p>
          <p className="max-w-sm text-[#24506f]">{session.syncDetail ?? "در حال باز کردن لینک…"}</p>
          {session.error ? <p className="text-sm text-rose-700">{session.error}</p> : null}
          <button type="button" className="btn-ghost" onClick={session.leave}>
            لغو
          </button>
        </div>
      );
    }
    return (
      <Lobby
        initialRoom={room}
        busy={session.waiting}
        error={session.error}
        onDismissError={session.dismissError}
        onLocal={session.startLocal}
        onCreate={(count, name) => void session.createOnline(count, name)}
        onJoin={(code, name) => void session.joinOnline(code, name)}
      />
    );
  }

  return (
    <>
      <GameScreen
        state={session.state}
        online={session.online}
        isHost={session.isHost}
        myId={session.myId}
        syncStatus={session.syncStatus}
        syncDetail={session.syncDetail}
        soundOn={session.soundOn}
        diceRolling={session.diceRolling}
        inputLocked={session.inputLocked}
        onAct={session.act}
        onLeave={session.leave}
        onToggleSound={session.toggleSound}
      />
      {session.error ? (
        <button type="button" className="fixed bottom-4 left-1/2 z-40 -translate-x-1/2 rounded-full bg-rose-600 px-4 py-2 text-sm text-white" onClick={session.dismissError}>
          {session.error}
        </button>
      ) : null}
    </>
  );
}

function Splash() {
  return (
    <div className="flex min-h-dvh items-center justify-center">
      <p className="font-display text-4xl text-[#14324f]">منچ بازی</p>
    </div>
  );
}
