/** Per-device setting: Vim key bindings in the editor. */
export const VIM_PREFERENCE = "notevoid-vim";

export type VimSetting = "on" | "off";

export const isVimSetting = (value: unknown): value is VimSetting => value === "on" || value === "off";
