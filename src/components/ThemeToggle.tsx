"use client";

import { useLayoutEffect, useState } from "react";
import { Moon, Sun } from "lucide-react";

const THEME_KEY = "manch-theme";

export function savedDark(): boolean {
  try {
    return window.localStorage.getItem(THEME_KEY) === "dark";
  } catch {
    return false;
  }
}

export function applyTheme(dark: boolean) {
  document.documentElement.classList.toggle("dark", dark);
}

export function ThemeBoot() {
  useLayoutEffect(() => {
    applyTheme(savedDark());
  }, []);
  return null;
}

export function ThemeToggle() {
  const [dark, setDark] = useState(false);

  useLayoutEffect(() => {
    const next = savedDark();
    applyTheme(next);
    setDark(next);
  }, []);

  function toggle() {
    const next = !document.documentElement.classList.contains("dark");
    applyTheme(next);
    window.localStorage.setItem(THEME_KEY, next ? "dark" : "light");
    setDark(next);
  }

  return (
    <button type="button" className="icon-btn" onClick={toggle} aria-label={dark ? "حالت روشن" : "حالت تاریک"}>
      {dark ? <Sun size={16} /> : <Moon size={16} />}
    </button>
  );
}
