import type { Track } from "@/components/player/store";

export type PlaylistTrackVariant = {
  id: string;
  addedAt: number;
  track: Track;
};

export type PlaylistSlot = {
  id: string;
  canonicalTitle: string;
  addedAt: number;
  updatedAt: number;
  linkGroupId?: string;
  variants: PlaylistTrackVariant[];
};

export type Playlist = {
  id: string;
  name: string;
  createdAt: number;
  updatedAt: number;
  slots: PlaylistSlot[];
};
