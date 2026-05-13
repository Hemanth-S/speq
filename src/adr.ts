import {
  existsSync,
  mkdirSync,
  readdirSync,
  readFileSync,
  writeFileSync,
} from "node:fs";
import { join } from "node:path";

// ---------------------------------------------------------------------------
// Types
// ---------------------------------------------------------------------------

export interface AdrEntry {
  id: number;
  title: string;
  status: "draft" | "active" | "superseded";
  path: string;
}

interface AdrFrontmatter {
  id: number;
  status: "draft" | "active" | "superseded";
  supersedes: number | null;
  tags: string[];
}

// ---------------------------------------------------------------------------
// Constants
// ---------------------------------------------------------------------------

const DEFAULT_ADR_PATH = "docs/adr";

// ---------------------------------------------------------------------------
// Internal helpers
// ---------------------------------------------------------------------------

/**
 * Convert a human-readable title to a URL/filename-safe slug.
 * - Lowercase
 * - Replace non-alphanumeric characters with hyphens
 * - Collapse multiple consecutive hyphens into one
 * - Trim leading and trailing hyphens
 */
export function slugify(title: string): string {
  return title
    .toLowerCase()
    .replace(/[^a-z0-9]+/g, "-")
    .replace(/-{2,}/g, "-")
    .replace(/^-+|-+$/g, "");
}

/**
 * Zero-pad an ADR id to 4 digits (e.g. 1 → "0001").
 */
function pad(id: number): string {
  return String(id).padStart(4, "0");
}

/**
 * Resolve the absolute path to the ADR directory.
 */
function resolveAdrDir(projectDir: string, adrPath?: string): string {
  return join(projectDir, adrPath ?? DEFAULT_ADR_PATH);
}

/**
 * Return all *.md files in the ADR directory whose names match the NNNN-*.md
 * pattern, sorted by the numeric prefix ascending.
 */
function getAdrFiles(adrDir: string): string[] {
  if (!existsSync(adrDir)) {
    return [];
  }

  const files = readdirSync(adrDir).filter((f) => /^\d{4}-.*\.md$/.test(f));
  files.sort((a, b) => {
    const idA = parseInt(a.slice(0, 4), 10);
    const idB = parseInt(b.slice(0, 4), 10);
    return idA - idB;
  });
  return files;
}

/**
 * Determine the next sequential ADR id by inspecting existing files.
 */
function nextId(adrDir: string): number {
  const files = getAdrFiles(adrDir);
  if (files.length === 0) {
    return 1;
  }
  const lastId = parseInt(files[files.length - 1].slice(0, 4), 10);
  return lastId + 1;
}

/**
 * Parse the YAML-ish frontmatter out of an ADR file.
 * Only handles the simple scalar fields this module writes.
 */
function parseFrontmatter(content: string): AdrFrontmatter {
  const fmMatch = content.match(/^---\n([\s\S]*?)\n---/);
  if (!fmMatch) {
    throw new Error("ADR file missing frontmatter block");
  }

  const block = fmMatch[1];

  const idMatch = block.match(/^id:\s*(\d+)/m);
  const statusMatch = block.match(/^status:\s*(draft|active|superseded)/m);
  const supersedesMatch = block.match(/^supersedes:\s*(\d+|null)/m);
  const tagsMatch = block.match(/^tags:\s*\[([^\]]*)\]/m);

  if (!idMatch || !statusMatch) {
    throw new Error("ADR frontmatter missing required fields (id, status)");
  }

  const supersedesRaw = supersedesMatch ? supersedesMatch[1] : "null";
  const supersedes = supersedesRaw === "null" ? null : parseInt(supersedesRaw, 10);

  const tagsRaw = tagsMatch ? tagsMatch[1].trim() : "";
  const tags = tagsRaw === "" ? [] : tagsRaw.split(",").map((t) => t.trim());

  return {
    id: parseInt(idMatch[1], 10),
    status: statusMatch[1] as "draft" | "active" | "superseded",
    supersedes,
    tags,
  };
}

/**
 * Parse the H1 title from the ADR body (first `# N. Title` heading).
 */
function parseTitle(content: string): string {
  const titleMatch = content.match(/^#\s+\d+\.\s+(.+)$/m);
  if (!titleMatch) {
    throw new Error("ADR file missing title heading");
  }
  return titleMatch[1].trim();
}

/**
 * Build the full text content of a new ADR file.
 */
function buildAdrContent(
  id: number,
  title: string,
  supersedes: number | null = null,
): string {
  const supersedesValue = supersedes === null ? "null" : String(supersedes);
  return `---
id: ${id}
status: draft
supersedes: ${supersedesValue}
tags: []
---
# ${id}. ${title}

## Context
[To be filled]

## Decision
[To be filled]

## Consequences
[To be filled]
`;
}

/**
 * Update the status field in the frontmatter of an existing ADR file.
 * Returns the new file content.
 */
function updateStatus(
  content: string,
  newStatus: "draft" | "active" | "superseded",
): string {
  return content.replace(
    /^(status:\s*)(draft|active|superseded)$/m,
    `$1${newStatus}`,
  );
}

// ---------------------------------------------------------------------------
// Public API
// ---------------------------------------------------------------------------

/**
 * Add a new ADR to the project.
 *
 * @param projectDir - Absolute path to the project root.
 * @param title - Human-readable ADR title.
 * @param adrPath - Optional relative path to the ADR directory (default: "docs/adr").
 * @returns The id assigned to the new ADR and the absolute path of the file written.
 */
export function addAdr(
  projectDir: string,
  title: string,
  adrPath?: string,
): { id: number; path: string } {
  const adrDir = resolveAdrDir(projectDir, adrPath);

  // Ensure the ADR directory exists
  mkdirSync(adrDir, { recursive: true });

  const id = nextId(adrDir);
  const slug = slugify(title);
  const filename = `${pad(id)}-${slug}.md`;
  const filePath = join(adrDir, filename);
  const content = buildAdrContent(id, title);

  writeFileSync(filePath, content, "utf-8");

  return { id, path: filePath };
}

/**
 * List all ADRs in the project.
 *
 * @param projectDir - Absolute path to the project root.
 * @param adrPath - Optional relative path to the ADR directory (default: "docs/adr").
 * @returns Array of AdrEntry objects sorted by id ascending.
 *          Returns an empty array if the directory does not exist or has no ADR files.
 */
export function listAdrs(projectDir: string, adrPath?: string): AdrEntry[] {
  const adrDir = resolveAdrDir(projectDir, adrPath);
  const files = getAdrFiles(adrDir);

  const entries: AdrEntry[] = [];
  for (const filename of files) {
    const filePath = join(adrDir, filename);
    const content = readFileSync(filePath, "utf-8");
    const fm = parseFrontmatter(content);
    const title = parseTitle(content);

    entries.push({
      id: fm.id,
      title,
      status: fm.status,
      path: filePath,
    });
  }

  // Already sorted by getAdrFiles, but ensure correctness
  entries.sort((a, b) => a.id - b.id);
  return entries;
}

/**
 * Supersede an existing active ADR by retiring it and creating a successor.
 *
 * @param projectDir - Absolute path to the project root.
 * @param id - The numeric id of the ADR to supersede.
 * @param title - Title for the new successor ADR.
 * @param adrPath - Optional relative path to the ADR directory (default: "docs/adr").
 * @returns Paths to the updated original and the new successor ADR.
 * @throws If the target ADR does not exist or is not active.
 */
export function supersedeAdr(
  projectDir: string,
  id: number,
  title: string,
  adrPath?: string,
): { oldPath: string; newPath: string } {
  const adrDir = resolveAdrDir(projectDir, adrPath);
  const files = getAdrFiles(adrDir);

  // Find the file for the given id
  const targetFile = files.find((f) => parseInt(f.slice(0, 4), 10) === id);
  if (!targetFile) {
    throw new Error(`ADR ${pad(id)} not found`);
  }

  const oldPath = join(adrDir, targetFile);
  const oldContent = readFileSync(oldPath, "utf-8");
  const fm = parseFrontmatter(oldContent);

  // Only active ADRs can be superseded
  if (fm.status !== "active") {
    throw new Error(
      `ADR ${pad(id)} is ${fm.status}, not active — only active ADRs can be superseded`,
    );
  }

  // Prepare writes (atomicity: prepare content before touching disk)
  const updatedOldContent = updateStatus(oldContent, "superseded");
  const newId = nextId(adrDir);
  const slug = slugify(title);
  const newFilename = `${pad(newId)}-${slug}.md`;
  const newPath = join(adrDir, newFilename);
  const newContent = buildAdrContent(newId, title, id);

  // Write both files (best-effort atomicity on a local FS)
  writeFileSync(oldPath, updatedOldContent, "utf-8");
  writeFileSync(newPath, newContent, "utf-8");

  return { oldPath, newPath };
}
