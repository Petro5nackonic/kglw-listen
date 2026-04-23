import type { IaDoc } from "@/lib/ia/showCore";

export type ArchiveItemFile = {
  name?: string;
  format?: string;
  title?: string;
  track?: string;
  length?: string | number;
  source?: string;
};

export type ArchiveItemPayload = {
  metadata?: {
    title?: string;
    creator?: string | string[];
    date?: string;
    venue?: string;
    coverage?: string;
    description?: string;
  };
  files?: ArchiveItemFile[];
  /** Lowercased concatenation of doc + file titles for local search */
  searchText?: string;
};

export type ArchiveDataset = {
  version: number;
  updatedAt: string;
  docs: IaDoc[];
  itemsByIdentifier: Record<string, ArchiveItemPayload>;
};
