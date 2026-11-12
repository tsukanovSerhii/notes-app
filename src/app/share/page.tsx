import type { Metadata } from "next";
import SharedNoteView from "@/features/sharing/client/SharedNoteView";

export const metadata: Metadata = {
  title: "Shared note — NoteVoid",
  // A link is a secret between its creator and the people they gave it to.
  robots: { index: false, follow: false },
  referrer: "no-referrer",
};

/** Where a share link lands. The id and key are in the fragment, read in the browser only. */
export default function SharePage() {
  return <SharedNoteView />;
}
