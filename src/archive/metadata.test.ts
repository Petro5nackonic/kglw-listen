import test from "node:test";
import assert from "node:assert/strict";

import { buildArchiveDownloadUrl, extractMp3Candidates, scoreCandidateForSong } from "./metadata.ts";

test("buildArchiveDownloadUrl encodes apostrophes unicode and spaces", () => {
  const url = buildArchiveDownloadUrl("kglw2025-11-04", "11-Grow Wings and Fly – O'Brien.mp3");
  assert.equal(
    url,
    "https://archive.org/download/kglw2025-11-04/11-Grow%20Wings%20and%20Fly%20%E2%80%93%20O'Brien.mp3",
  );
});

test("extractMp3Candidates only returns files with MP3 formats", () => {
  const candidates = extractMp3Candidates("show-1", [
    { name: "song-a.mp3", format: "VBR MP3", title: "Song A" },
    { name: "song-a.flac", format: "Flac" },
    { name: "song-b.mp3", format: "MP3" },
  ]);
  assert.equal(candidates.length, 2);
  assert.equal(candidates[0].url, "https://archive.org/download/show-1/song-a.mp3");
  assert.equal(candidates[1].url, "https://archive.org/download/show-1/song-b.mp3");
});

test("track-number style filenames are deprioritized without mapping", () => {
  const better = {
    identifier: "id-1",
    fileName: "Robot Stop Live.mp3",
    title: "Robot Stop",
    track: "1",
    url: "u1",
    hasTrackMapping: true,
    isTrackNumberStyle: false,
  };
  const weaker = {
    identifier: "id-2",
    fileName: "t01.mp3",
    title: undefined,
    track: undefined,
    url: "u2",
    hasTrackMapping: false,
    isTrackNumberStyle: true,
  };
  assert.ok(scoreCandidateForSong("Robot Stop", better) > scoreCandidateForSong("Robot Stop", weaker));
});
