import { create } from "zustand";
import { persist } from "zustand/middleware";

export type CustomerNote = {
  id: string;
  authorName: string;
  body: string;
  pinned: boolean;
  createdAt: number;
};

export type CustomerTag =
  | "vip"
  | "complainer"
  | "bulk-buyer"
  | "fast-payer"
  | "lapsed"
  | "trial";

interface AdminNotesStore {
  /** Notes keyed by customer user_id */
  notes: Record<string, CustomerNote[]>;
  /** Tags keyed by customer user_id */
  tags: Record<string, CustomerTag[]>;

  addNote: (userId: string, body: string, authorName?: string) => void;
  removeNote: (userId: string, noteId: string) => void;
  togglePin: (userId: string, noteId: string) => void;

  toggleTag: (userId: string, tag: CustomerTag) => void;
  getNotes: (userId: string) => CustomerNote[];
  getTags: (userId: string) => CustomerTag[];
}

export const useAdminNotesStore = create<AdminNotesStore>()(
  persist(
    (set, get) => ({
      notes: {},
      tags: {},
      addNote: (userId, body, authorName = "Admin") =>
        set((s) => {
          const newNote: CustomerNote = {
            id: `n_${Date.now()}_${Math.random().toString(36).slice(2, 5)}`,
            authorName,
            body: body.trim(),
            pinned: false,
            createdAt: Date.now(),
          };
          return {
            notes: { ...s.notes, [userId]: [newNote, ...(s.notes[userId] || [])] },
          };
        }),
      removeNote: (userId, noteId) =>
        set((s) => ({
          notes: {
            ...s.notes,
            [userId]: (s.notes[userId] || []).filter((n) => n.id !== noteId),
          },
        })),
      togglePin: (userId, noteId) =>
        set((s) => ({
          notes: {
            ...s.notes,
            [userId]: (s.notes[userId] || []).map((n) =>
              n.id === noteId ? { ...n, pinned: !n.pinned } : n,
            ),
          },
        })),
      toggleTag: (userId, tag) =>
        set((s) => {
          const cur = s.tags[userId] || [];
          const next = cur.includes(tag) ? cur.filter((t) => t !== tag) : [...cur, tag];
          return { tags: { ...s.tags, [userId]: next } };
        }),
      getNotes: (userId) => {
        const list = get().notes[userId] || [];
        return [...list].sort((a, b) => {
          if (a.pinned !== b.pinned) return a.pinned ? -1 : 1;
          return b.createdAt - a.createdAt;
        });
      },
      getTags: (userId) => get().tags[userId] || [],
    }),
    { name: "atalmart-admin-notes" },
  ),
);
