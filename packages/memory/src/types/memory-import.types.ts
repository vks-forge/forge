/**
 * Memory import types — what a markdown record file becomes before it is a database row.
 *
 * Why: earlier versions kept each project's memory as markdown files in a private git repository, and this
 *   release moves it into the database. The files were written by hand and by several writers, so the
 *   parser cannot demand the strict schema: it must keep every record it can, say which fields it had to
 *   fill with a safe default, and keep the original header text. These shapes carry that result between the
 *   pure parser, the row builder, the importer and the markdown index.
 *
 * Exports: RecordFolder, RawHeader, HeaderBlock, HeaderRead, ParseContext, ImportedRecord, ParsedRecordFile, PlannedRecord, ImportPlan, ImportedRows, VerifyResult, ImportDeps,
 *   ImportSource, SourceFile, ExportDeps, ExportFile, ExportInput, MarkdownExporter.
 * Depends on: @forge/core (types only). Types only.
 */

import type {
  MemoryAuthor,
  MemoryExportReply,
  MemoryKind,
  MemoryLink,
  MemoryLinkRow,
  MemoryOrigin,
  MemoryRow,
  MemoryStatus,
  NewMemoryEvent,
  StorageAdapter,
} from '@forge/core';

/** The four folders of a memory repository, which fix the default `kind` of a file. */
export type RecordFolder = 'decisions' | 'rejected' | 'proposed' | 'outcomes';

/** A header as read: the values that parsed, and the keys whose text had to be kept raw. */
export interface RawHeader {
  readonly data: Readonly<Record<string, unknown>>;
  /** True when the whole header was valid YAML. */
  readonly strict: boolean;
  /** Keys whose block did not parse and whose value is the raw text. */
  readonly recovered: readonly string[];
  /** The header text between the fences, with LF line ends. */
  readonly text: string;
}

/** One top-level `key:` block of a header: its text, the rest of its first line and its continuation lines. */
export interface HeaderBlock {
  readonly key: string;
  readonly text: string;
  readonly inline: string;
  readonly rest: readonly string[];
}

export type HeaderRead =
  | {
      readonly ok: true;
      readonly header: RawHeader;
      readonly body: string;
      readonly hasFrontMatter: boolean;
    }
  | { readonly ok: false; readonly reason: string };

/** What the parser needs to know about the file it reads. */
export interface ParseContext {
  readonly folder: RecordFolder;
  /** Path relative to the memory root, with forward slashes. */
  readonly relPath: string;
  /** ISO date used when a record has no date of its own. */
  readonly importedAt: string;
}

/** A record ready to become a row: every typed field filled, defaults listed. */
export interface ImportedRecord {
  /** Absent only for an outcome file with no id; the importer then assigns the next free `o-` id. */
  readonly id: string | null;
  readonly kind: MemoryKind;
  readonly status: MemoryStatus;
  readonly statement: string;
  readonly body: string;
  readonly source: { readonly type: string; readonly ref: string };
  readonly author: MemoryAuthor;
  readonly origin: MemoryOrigin;
  readonly confidence: number | null;
  readonly created_at: string;
  readonly valid_from: string;
  readonly valid_to: string | null;
  readonly superseded_by: string | null;
  readonly pinned: boolean;
  readonly approved_at: string | null;
  readonly approved_by: string | null;
  readonly rejected_at: string | null;
  readonly rejected_by: string | null;
  readonly rejected_reason: string | null;
  readonly gist: string | null;
  readonly aliases: readonly string[];
  readonly tags: readonly string[];
  /** `supersedes`, `amends`, `reopens` from the header and `cites` from the body. */
  readonly links: readonly MemoryLink[];
  /** Fields filled with a default or recovered from raw text, shown to the owner. */
  readonly defaulted: readonly string[];
  /** The header as written, kept when the record is not a clean one. */
  readonly raw_front_matter: string | null;
  /** True when the header was not valid YAML. */
  readonly lenient: boolean;
}

export type ParsedRecordFile =
  | { readonly ok: true; readonly record: ImportedRecord }
  | { readonly ok: false; readonly reason: string };

/** One markdown file of a memory repository. */
export interface SourceFile {
  readonly relPath: string;
  readonly text: string;
}

/** Where an importer reads from: the last commit of the project's repository. */
export interface ImportSource {
  readonly headSha: string | null;
  readonly files: readonly SourceFile[];
}

/** A record that will be stored, with the file it came from and the id it gets. */
export interface PlannedRecord {
  readonly id: string;
  readonly path: string;
  readonly record: ImportedRecord;
}

/** What an import will do with a repository's files: store these, refuse those. */
export interface ImportPlan {
  readonly files: number;
  readonly records: readonly PlannedRecord[];
  readonly rejects: readonly { readonly path: string; readonly reason: string }[];
}

/** The row, tags, links and history entry a planned record is stored as. */
export interface ImportedRows {
  readonly row: MemoryRow;
  readonly tags: readonly string[];
  readonly links: readonly MemoryLink[];
  readonly event: NewMemoryEvent;
}

/** The differences found between the files and the database; none means an exact copy. */
export interface VerifyResult {
  readonly mismatches: readonly string[];
  readonly checked: number;
}

export interface ImportDeps {
  readonly storage: StorageAdapter;
  /** `<dataHome>/memory`; the project's repository is `<rootDir>/<slug>`. */
  readonly rootDir: string;
  readonly now: () => Date;
}

/** One file an export writes, relative to the export folder. */
export interface ExportFile {
  readonly relPath: string;
  readonly text: string;
}

export interface ExportDeps {
  readonly storage: StorageAdapter;
  readonly now: () => Date;
}

/** What the export renderer needs: every row of one project with its tags and outgoing links. */
export interface ExportInput {
  readonly project: string;
  readonly rows: readonly MemoryRow[];
  readonly tags: Readonly<Record<string, readonly string[]>>;
  readonly links: Readonly<Record<string, readonly MemoryLinkRow[]>>;
}

export interface MarkdownExporter {
  /** The files of one project, sorted by path; nothing is written. */
  render(project: string): Promise<ExportFile[]>;
  /** Writes the files under `dir` (created) and says where and how many. */
  exportTo(project: string, dir: string): Promise<MemoryExportReply>;
}
