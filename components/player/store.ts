import { create } from "zustand";

export type Track = {
  title: string;
  url: string;
  name?: string;
  length?: string;
  track?: string;
};

type PlayerState = {
  queue: Track[];
  index: number;
  playing: boolean;
  setQueue: (queue: Track[], startIndex?: number) => void;
  playIndex: (i: number) => void;
  setPlaying: (v: boolean) => void;
  next: () => void;
  prev: () => void;
};

export const usePlayer = create<PlayerState>((set, get) => ({
  queue: [],
  index: 0,
  playing: false,

  setQueue: (queue, startIndex = 0) => set({ queue, index: startIndex, playing: true }),
  playIndex: (i) => set({ index: i, playing: true }),
  setPlaying: (v) => set({ playing: v }),

  next: () => {
    const { index, queue } = get();
    if (!queue.length) return;
    set({ index: (index + 1) % queue.length, playing: true });
  },

  prev: () => {
    const { index, queue } = get();
    if (!queue.length) return;
    set({ index: (index - 1 + queue.length) % queue.length, playing: true });
  },
}));
