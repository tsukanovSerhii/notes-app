"use client";

import Modal from "@/shared/ui/Modal";
import { SHORTCUTS } from "@/features/editor/MarkdownCheatsheet";
import { useI18n } from "@/shared/i18n";

/** Every keyboard shortcut, opened with `?`. */
export default function ShortcutsDialog({ open, onClose }: { open: boolean; onClose: () => void }) {
  const { t } = useI18n();
  return (
    <Modal open={open} onClose={onClose} title={t.editor.shortcuts}>
      <table className="w-full text-sm">
        <tbody>
          {SHORTCUTS.map((s) => (
            <tr key={s.keys} className="border-b border-border/50 last:border-0">
              <td className="py-2 pr-3">
                {s.keys.split(" + ").map((key, i) => (
                  <span key={key}>
                    {i > 0 && " + "}
                    <kbd className="rounded border border-border bg-bg-base/60 px-1.5 py-0.5 font-mono text-xs text-accent">
                      {key}
                    </kbd>
                  </span>
                ))}
              </td>
              <td className="py-2 text-text-secondary">{t.cheatsheet[s.action]}</td>
            </tr>
          ))}
        </tbody>
      </table>
    </Modal>
  );
}
