import type { Track } from "@/components/player/store";

export type PlaylistTrack = {
  id: string;
  addedAt: number;
  track: Track;
};

export type Playlist = {
  id: string;
  name: string;
  createdAt: number;
  updatedAt: number;
  tracks: PlaylistTrack[];
};
