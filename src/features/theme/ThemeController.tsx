"use client";

import { useEffect } from "react";
import { usePreference } from "@/shared/hooks/usePreference";
import { THEME_KEY, isThemeChoice, type ThemeChoice } from "@/features/theme/theme";

export function useTheme() {
  return usePreference<ThemeChoice>(THEME_KEY, "system", isThemeChoice);
}

/** Keeps <html data-theme> in step with the choice and, for "system", the OS. */
export default function ThemeController() {
  const [choice] = useTheme();
  useEffect(() => {
    const query = window.matchMedia("(prefers-color-scheme: light)");
    const apply = () => {
      const light = choice === "light" || (choice === "system" && query.matches);
      document.documentElement.dataset.theme = light ? "light" : "dark";
    };
    apply();
    if (choice !== "system") return;
    query.addEventListener("change", apply);
    return () => query.removeEventListener("change", apply);
  }, [choice]);
  return null;
}
