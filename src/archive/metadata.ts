export type ArchiveMetadataFile = {
  name?: string;
  format?: string;
  title?: string;
  track?: string | number;
  length?: string | number;
};

export type Mp3Candidate = {
  identifier: string;
  fileName: string;
  title?: string;
  track?: string;
  url: string;
  hasTrackMapping: boolean;
  isTrackNumberStyle: boolean;
};

function normalizeLooseText(input: string): string {
  return String(input || "")
    .toLowerCase()
    .replace(/[^a-z0-9\s]/g, " ")
    .replace(/\s+/g, " ")
    .trim();
}

function tokenize(input: string): string[] {
  return normalizeLooseText(input)
    .split(" ")
    .map((part) => part.trim())
    .filter((part) => part.length >= 2);
}

function hasMp3Format(format: string): boolean {
  return format.toLowerCase().includes("mp3");
}

function hasTrackMapping(file: ArchiveMetadataFile): boolean {
  return Boolean(String(file?.title || "").trim() || String(file?.track || "").trim());
}

export function isTrackNumberStyleName(fileName: string): boolean {
  const base = String(fileName || "")
    .toLowerCase()
    .split("/")
    .pop() || "";
  return /\bt\d{1,3}\b/.test(base) || /\b\d{1,3}\b/.test(base.replace(/\.[a-z0-9]+$/i, ""));
}

export function buildArchiveDownloadUrl(identifier: string, fileName: string): string {
  return `https://archive.org/download/${encodeURIComponent(identifier)}/${encodeURIComponent(fileName)}`;
}

export function extractMp3Candidates(
  identifier: string,
  files: ArchiveMetadataFile[],
): Mp3Candidate[] {
  const id = String(identifier || "").trim();
  if (!id) return [];
  const source = Array.isArray(files) ? files : [];
  return source
    .filter((file) => {
      const name = String(file?.name || "").trim();
      const format = String(file?.format || "").trim();
      return Boolean(name) && hasMp3Format(format);
    })
    .map((file) => {
      const fileName = String(file?.name || "").trim();
      return {
        identifier: id,
        fileName,
        title: String(file?.title || "").trim() || undefined,
        track: String(file?.track || "").trim() || undefined,
        url: buildArchiveDownloadUrl(id, fileName),
        hasTrackMapping: hasTrackMapping(file),
        isTrackNumberStyle: isTrackNumberStyleName(fileName),
      };
    });
}

export function scoreCandidateForSong(songName: string, candidate: Mp3Candidate): number {
  const songTokens = tokenize(songName);
  const fileHaystack = normalizeLooseText(`${candidate.fileName} ${candidate.title || ""}`);
  if (!fileHaystack || songTokens.length === 0) return 0;

  let tokenHits = 0;
  for (const token of songTokens) {
    if (fileHaystack.includes(token)) tokenHits += 1;
  }

  let score = tokenHits * 10;
  const fileNameNorm = normalizeLooseText(candidate.fileName);
  const titleNorm = normalizeLooseText(candidate.title || "");

  if (fileNameNorm && songTokens.every((token) => fileNameNorm.includes(token))) score += 40;
  if (titleNorm && songTokens.every((token) => titleNorm.includes(token))) score += 20;

  if (candidate.isTrackNumberStyle) {
    score += candidate.hasTrackMapping ? -5 : -25;
  }

  return score;
}
