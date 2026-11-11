export type ThemeChoice = "system" | "light" | "dark";

export const THEME_KEY = "notevoid-theme";

export const isThemeChoice = (v: unknown): v is ThemeChoice =>
  v === "system" || v === "light" || v === "dark";

/**
 * Runs in <head> before the first paint, so a light-theme user never sees a
 * dark flash. Kept tiny and free of imports; it is inlined as a string.
 */
export const THEME_BOOT_SCRIPT = `(function(){try{var c=localStorage.getItem("${THEME_KEY}");var l=c==="light"||(c!=="dark"&&matchMedia("(prefers-color-scheme: light)").matches);document.documentElement.dataset.theme=l?"light":"dark"}catch(e){}})()`;
