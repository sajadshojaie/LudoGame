"use client";

import { useEffect, useRef, useState } from "react";
import { faDigits } from "@/utils/palette";

const PIPS: Record<number, Array<[number, number]>> = {
  1: [[1, 1]],
  2: [
    [0, 0],
    [2, 2],
  ],
  3: [
    [0, 0],
    [1, 1],
    [2, 2],
  ],
  4: [
    [0, 0],
    [0, 2],
    [2, 0],
    [2, 2],
  ],
  5: [
    [0, 0],
    [0, 2],
    [1, 1],
    [2, 0],
    [2, 2],
  ],
  6: [
    [0, 0],
    [0, 2],
    [1, 0],
    [1, 2],
    [2, 0],
    [2, 2],
  ],
};

const HALF = 46;

/** Rest pose keeps 2 on top, 1 in front, 3 on the right. Cube turns bring the rolled face up. */
const FACES: Array<{ value: number; transform: string; topX: number; topZ: number }> = [
  { value: 1, transform: `translateZ(${HALF}px)`, topX: 90, topZ: 0 },
  { value: 2, transform: `rotateX(-90deg) translateZ(${HALF}px)`, topX: 180, topZ: 0 },
  { value: 3, transform: `rotateY(90deg) translateZ(${HALF}px)`, topX: 0, topZ: -90 },
  { value: 4, transform: `rotateY(-90deg) translateZ(${HALF}px)`, topX: 0, topZ: 90 },
  { value: 5, transform: `rotateX(90deg) translateZ(${HALF}px)`, topX: 0, topZ: 0 },
  { value: 6, transform: `rotateY(180deg) translateZ(${HALF}px)`, topX: -90, topZ: 0 },
];

interface DiceProps {
  value: number | null;
  rolling: boolean;
  enabled: boolean;
  label?: string;
  onRoll: () => void;
}

const VIEW_X = -72;
const VIEW_Y = 16;

export function Dice({ value, rolling, enabled, label, onRoll }: DiceProps) {
  const shown = value && value >= 1 && value <= 6 ? value : 1;
  const face = FACES.find((item) => item.value === shown) ?? FACES[0];
  const [spins, setSpins] = useState(0);
  const spinLock = useRef(false);

  useEffect(() => {
    if (!rolling) {
      spinLock.current = false;
      return;
    }
    if (spinLock.current) return;
    spinLock.current = true;
    setSpins((count) => count + 2);
  }, [rolling, value]);

  return (
    <div className="dice-stage flex flex-col items-center gap-2">
      <button
        type="button"
        onClick={onRoll}
        disabled={!enabled}
        aria-label={enabled ? "انداختن تاس" : value ? `تاس ${faDigits(shown)}` : "تاس"}
        className={`dice-btn ${enabled ? "dice-btn-live" : ""}`}
      >
        <span
          className="dice-cube"
          style={{
            transform: `rotateX(${VIEW_X + spins * 360}deg) rotateY(${VIEW_Y + spins * 360}deg) rotateX(${face.topX}deg) rotateZ(${face.topZ}deg)`,
          }}
        >
          {FACES.map((side) => (
            <span key={side.value} className="dice-side" style={{ transform: side.transform }}>
              {(PIPS[side.value] ?? []).map(([col, row]) => (
                <span key={`${side.value}-${col}-${row}`} className="dice-pip" style={{ gridColumn: col + 1, gridRow: row + 1 }} />
              ))}
            </span>
          ))}
        </span>
      </button>
      <p className="dice-result">{!rolling && value ? faDigits(value) : " "}</p>
      {label ? <p className="min-h-5 text-center text-xs text-[#24506f]">{label}</p> : null}
    </div>
  );
}
