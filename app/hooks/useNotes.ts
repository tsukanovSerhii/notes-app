"use client";

// useNotes — single source of truth for note state: CRUD operations,
// active-note selection, search filtering, and localStorage persistence.

import { useCallback, useEffect, useMemo, useState } from "react";
import type { Note } from "@/app/types/note";

const STORAGE_KEY = "notevoid-notes";

function createId(): string {
  return `${Date.now()}-${Math.random().toString(36).slice(2, 9)}`;
}

function loadNotes(): Note[] {
  if (typeof window === "undefined") return [];
  try {
    const raw = window.localStorage.getItem(STORAGE_KEY);
    if (!raw) return [];
    const parsed = JSON.parse(raw);
    return Array.isArray(parsed) ? (parsed as Note[]) : [];
  } catch {
    return [];
  }
}

export function useNotes() {
  const [notes, setNotes] = useState<Note[]>([]);
  const [activeId, setActiveId] = useState<string | null>(null);
  const [searchQuery, setSearchQuery] = useState("");
  const [hydrated, setHydrated] = useState(false);

  // Load from localStorage once on mount.
  useEffect(() => {
    const stored = loadNotes();
    setNotes(stored);
    if (stored.length > 0) setActiveId(stored[0].id);
    setHydrated(true);
  }, []);

  // Persist on every change (after initial hydration).
  useEffect(() => {
    if (!hydrated) return;
    window.localStorage.setItem(STORAGE_KEY, JSON.stringify(notes));
  }, [notes, hydrated]);

  // Always keep notes sorted by most-recently updated.
  const sortedNotes = useMemo(
    () => [...notes].sort((a, b) => b.updatedAt - a.updatedAt),
    [notes]
  );

  const activeNote = useMemo(
    () => sortedNotes.find((n) => n.id === activeId) ?? null,
    [sortedNotes, activeId]
  );

  const setActiveNote = useCallback((id: string) => setActiveId(id), []);

  const createNote = useCallback(() => {
    const now = Date.now();
    const note: Note = {
      id: createId(),
      title: "Untitled",
      content: "",
      createdAt: now,
      updatedAt: now,
    };
    setNotes((prev) => [note, ...prev]);
    setActiveId(note.id);
  }, []);

  const updateNote = useCallback(
    (id: string, patch: Partial<Pick<Note, "title" | "content">>) => {
      setNotes((prev) =>
        prev.map((n) =>
          n.id === id ? { ...n, ...patch, updatedAt: Date.now() } : n
        )
      );
    },
    []
  );

  const deleteNote = useCallback(
    (id: string) => {
      setNotes((prev) => prev.filter((n) => n.id !== id));
      setActiveId((current) => {
        if (current !== id) return current;
        const remaining = sortedNotes.filter((n) => n.id !== id);
        return remaining.length > 0 ? remaining[0].id : null;
      });
    },
    [sortedNotes]
  );

  const filteredNotes = useMemo(() => {
    const q = searchQuery.trim().toLowerCase();
    if (!q) return sortedNotes;
    return sortedNotes.filter(
      (n) =>
        n.title.toLowerCase().includes(q) ||
        n.content.toLowerCase().includes(q)
    );
  }, [sortedNotes, searchQuery]);

  return {
    notes: sortedNotes,
    activeNote,
    setActiveNote,
    createNote,
    updateNote,
    deleteNote,
    searchQuery,
    setSearchQuery,
    filteredNotes,
    hydrated,
  };
}
