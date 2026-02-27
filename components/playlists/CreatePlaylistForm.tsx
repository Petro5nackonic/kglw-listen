"use client";

import { useState } from "react";

export function CreatePlaylistForm(props: {
  onCreate: (name: string) => void;
  buttonLabel?: string;
}) {
  const { onCreate, buttonLabel } = props;
  const [name, setName] = useState("");

  return (
    <form
      className="flex items-center gap-2"
      onSubmit={(e) => {
        e.preventDefault();
        onCreate(name);
        setName("");
      }}
    >
      <input
        value={name}
        onChange={(e) => setName(e.target.value)}
        placeholder="Playlist name"
        className="w-full rounded-lg border border-white/15 bg-black/30 px-3 py-2 text-sm text-white placeholder:text-white/40"
      />
      <button
        type="submit"
        className="shrink-0 rounded-lg border border-white/15 bg-white/10 px-3 py-2 text-sm text-white hover:bg-white/15 transition"
      >
        {buttonLabel || "Create"}
      </button>
    </form>
  );
}
