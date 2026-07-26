import type {
  ArtifactRepository,
  AttachArtifactInput,
  TaskArtifactAttachmentStatus,
  TaskArtifactRecord,
  UpdateTaskArtifactAttachmentInput,
} from "@/lib/application/ports/artifact-repository";
import type { Artifact, ArtifactId } from "@/lib/kernel";
import type { DatabaseSync } from "node:sqlite";
import { parseJsonValue, stringifyJson } from "./sqlite-helpers";

type ArtifactRow = {
  id: string;
  type: string;
  title: string;
  media_type: string | null;
  version: number;
  status: Artifact["status"];
  representations_json: string;
  provenance_json: string | null;
  metadata_json: string | null;
  created_at: string;
  updated_at: string;
};

type TaskArtifactRow = ArtifactRow & {
  task_id: string;
  run_id: string | null;
  source_session_id: string | null;
  attached_at: string;
  status: TaskArtifactAttachmentStatus | null;
  title_override: string | null;
  role: string | null;
  task_provenance_json: string | null;
  task_metadata_json: string | null;
};

function mapArtifact(row: ArtifactRow | undefined): Artifact | null {
  if (!row) return null;
  return {
    id: row.id as ArtifactId,
    type: row.type,
    title: row.title,
    mediaType: row.media_type ?? undefined,
    version: row.version,
    status: row.status,
    representations: (parseJsonValue(row.representations_json) as Artifact["representations"] | undefined) ?? [],
    provenance: parseJsonValue(row.provenance_json) as Artifact["provenance"] | undefined,
    metadata: parseJsonValue(row.metadata_json) as Artifact["metadata"] | undefined,
    createdAt: row.created_at,
    updatedAt: row.updated_at,
  };
}

function mapTaskArtifact(row: TaskArtifactRow): TaskArtifactRecord | null {
  const artifact = mapArtifact(row);
  if (!artifact) return null;
  return {
    artifact,
    taskId: row.task_id as TaskArtifactRecord["taskId"],
    runId: (row.run_id ?? undefined) as TaskArtifactRecord["runId"],
    sourceSessionId: row.source_session_id ?? undefined,
    attachedAt: row.attached_at,
    status: row.status ?? "ready",
    titleOverride: row.title_override ?? undefined,
    role: row.role ?? undefined,
    provenance: (parseJsonValue(row.task_provenance_json) as Record<string, unknown> | undefined) ?? undefined,
    metadata: (parseJsonValue(row.task_metadata_json) as Record<string, unknown> | undefined) ?? undefined,
  };
}

export class SqliteArtifactRepository implements ArtifactRepository {
  constructor(private readonly db: DatabaseSync) {}

  getById(id: ArtifactId): Artifact | null {
    const row = this.db.prepare("SELECT id, type, title, media_type, version, status, representations_json, provenance_json, metadata_json, created_at, updated_at FROM artifacts WHERE id = ?").get(id) as ArtifactRow | undefined;
    return mapArtifact(row);
  }

  listByTask(taskId: TaskArtifactRecord["taskId"]): TaskArtifactRecord[] {
    const rows = this.db.prepare(`
      SELECT a.id, a.type, a.title, a.media_type, a.version, a.status, a.representations_json, a.provenance_json, a.metadata_json, a.created_at, a.updated_at,
             ta.task_id, ta.run_id, ta.source_session_id, ta.attached_at, ta.status, ta.title_override, ta.role,
             ta.provenance_json AS task_provenance_json, ta.metadata_json AS task_metadata_json
      FROM task_artifacts ta
      JOIN artifacts a ON a.id = ta.artifact_id
      WHERE ta.task_id = ?
      ORDER BY ta.attached_at ASC
    `).all(taskId) as TaskArtifactRow[];
    return rows.map((row) => mapTaskArtifact(row)).filter((record): record is TaskArtifactRecord => record !== null);
  }

  upsert(artifact: Artifact): Artifact {
    this.db.prepare(`
      INSERT INTO artifacts (
        id, type, title, media_type, version, status, representations_json, provenance_json, metadata_json, created_at, updated_at
      ) VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)
      ON CONFLICT(id) DO UPDATE SET
        type = excluded.type,
        title = excluded.title,
        media_type = excluded.media_type,
        version = excluded.version,
        status = excluded.status,
        representations_json = excluded.representations_json,
        provenance_json = excluded.provenance_json,
        metadata_json = excluded.metadata_json,
        updated_at = excluded.updated_at
    `).run(
      artifact.id,
      artifact.type,
      artifact.title,
      artifact.mediaType ?? null,
      artifact.version,
      artifact.status,
      stringifyJson(artifact.representations),
      stringifyJson(artifact.provenance),
      stringifyJson(artifact.metadata),
      artifact.createdAt,
      artifact.updatedAt,
    );
    return this.getById(artifact.id) ?? artifact;
  }

  attachToTask(input: AttachArtifactInput): TaskArtifactRecord {
    this.db.prepare(`
      INSERT INTO task_artifacts (
        task_id, artifact_id, run_id, source_session_id, attached_at, status, title_override, role, provenance_json, metadata_json
      )
      VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?)
      ON CONFLICT(task_id, artifact_id) DO UPDATE SET
        run_id = COALESCE(excluded.run_id, task_artifacts.run_id),
        source_session_id = COALESCE(excluded.source_session_id, task_artifacts.source_session_id),
        attached_at = excluded.attached_at,
        status = COALESCE(excluded.status, task_artifacts.status),
        title_override = COALESCE(excluded.title_override, task_artifacts.title_override),
        role = COALESCE(excluded.role, task_artifacts.role),
        provenance_json = COALESCE(task_artifacts.provenance_json, excluded.provenance_json),
        metadata_json = COALESCE(excluded.metadata_json, task_artifacts.metadata_json)
    `).run(
      input.taskId,
      input.artifactId,
      input.runId ?? null,
      input.sourceSessionId ?? null,
      input.attachedAt,
      input.status ?? "ready",
      input.titleOverride ?? null,
      input.role ?? null,
      stringifyJson(input.provenance),
      stringifyJson(input.metadata),
    );

    const row = this.db.prepare(`
      SELECT a.id, a.type, a.title, a.media_type, a.version, a.status, a.representations_json, a.provenance_json, a.metadata_json, a.created_at, a.updated_at,
             ta.task_id, ta.run_id, ta.source_session_id, ta.attached_at, ta.status, ta.title_override, ta.role,
             ta.provenance_json AS task_provenance_json, ta.metadata_json AS task_metadata_json
      FROM task_artifacts ta
      JOIN artifacts a ON a.id = ta.artifact_id
      WHERE ta.task_id = ? AND ta.artifact_id = ?
    `).get(input.taskId, input.artifactId) as TaskArtifactRow | undefined;
    const mapped = row ? mapTaskArtifact(row) : null;
    if (!mapped) {
      throw new Error("Failed to attach artifact to task");
    }
    return mapped;
  }

  updateTaskAttachment(input: UpdateTaskArtifactAttachmentInput): TaskArtifactRecord | null {
    this.db.prepare(`
      UPDATE task_artifacts
      SET run_id = COALESCE(?, run_id),
          status = COALESCE(?, status),
          title_override = COALESCE(?, title_override),
          role = COALESCE(?, role),
          metadata_json = COALESCE(?, metadata_json)
      WHERE task_id = ? AND artifact_id = ?
    `).run(
      input.runId ?? null,
      input.status ?? null,
      input.titleOverride ?? null,
      input.role ?? null,
      stringifyJson(input.metadata),
      input.taskId,
      input.artifactId,
    );
    const row = this.db.prepare(`
      SELECT a.id, a.type, a.title, a.media_type, a.version, a.status, a.representations_json, a.provenance_json, a.metadata_json, a.created_at, a.updated_at,
             ta.task_id, ta.run_id, ta.source_session_id, ta.attached_at, ta.status, ta.title_override, ta.role,
             ta.provenance_json AS task_provenance_json, ta.metadata_json AS task_metadata_json
      FROM task_artifacts ta
      JOIN artifacts a ON a.id = ta.artifact_id
      WHERE ta.task_id = ? AND ta.artifact_id = ?
    `).get(input.taskId, input.artifactId) as TaskArtifactRow | undefined;
    return row ? mapTaskArtifact(row) : null;
  }

  archive(id: ArtifactId, updatedAt: string): Artifact | null {
    this.db.prepare("UPDATE artifacts SET status = ?, updated_at = ? WHERE id = ?").run("archived", updatedAt, id);
    return this.getById(id);
  }
}
