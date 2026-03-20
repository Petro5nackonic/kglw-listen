import { create } from "zustand";

export type Track = {
  title: string;
  url: string;
  backupUrls?: string[];
  playlistId?: string;
  playlistSlotId?: string;
  playlistSource?: "user" | "prebuilt";
  name?: string;
  length?: string;
  track?: string;
  showKey?: string;
  showDate?: string;
  venueText?: string;
  artwork?: string;
};

type PlayerState = {
  queue: Track[];
  index: number;
  playing: boolean;
  loading: boolean;
  setQueue: (queue: Track[], startIndex?: number) => void;
  playIndex: (i: number) => void;
  play: () => void;
  pause: () => void;
  setPlaying: (v: boolean) => void;
  setLoading: (v: boolean) => void;
  stop: () => void;
  next: () => void;
  prev: () => void;
};

export const usePlayer = create<PlayerState>((set, get) => ({
  queue: [],
  index: 0,
  playing: false,
  loading: false,

  setQueue: (queue, startIndex = 0) => set({ queue, index: startIndex, playing: true, loading: true }),
  playIndex: (i) => set({ index: i, playing: true, loading: true }),
  play: () => set({ playing: true, loading: true }),
  pause: () => set({ playing: false, loading: false }),
  setPlaying: (v) => set({ playing: v, loading: v ? true : false }),
  setLoading: (v) => set({ loading: v }),
  stop: () => set({ queue: [], index: 0, playing: false, loading: false }),

  next: () => {
    const { index, queue } = get();
    if (!queue.length) return;
    set({ index: (index + 1) % queue.length, playing: true, loading: true });
  },

  prev: () => {
    const { index, queue } = get();
    if (!queue.length) return;
    set({ index: (index - 1 + queue.length) % queue.length, playing: true, loading: true });
  },
}));
