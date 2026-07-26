import { mkdirSync, statSync } from "fs";
import { join } from "path";
import { getKernelDatabase } from "@/lib/persistence";
import { resolvePiWebDataDir } from "@/lib/persistence/data-directory";

function quoteSqlString(value: string): string {
  return value.replace(/'/g, "''");
}

function formatBackupTimestamp(date: Date): string {
  const yyyy = date.getFullYear().toString();
  const mm = (date.getMonth() + 1).toString().padStart(2, "0");
  const dd = date.getDate().toString().padStart(2, "0");
  const hh = date.getHours().toString().padStart(2, "0");
  const mi = date.getMinutes().toString().padStart(2, "0");
  const ss = date.getSeconds().toString().padStart(2, "0");
  return `${yyyy}${mm}${dd}-${hh}${mi}${ss}`;
}

export function createKernelBackup(): { backupPath: string; sizeBytes: number; createdAt: string } {
  const db = getKernelDatabase();
  const now = new Date();
  const backupDir = join(resolvePiWebDataDir(), "backups");
  mkdirSync(backupDir, { recursive: true });
  const backupPath = join(backupDir, `kernel-${formatBackupTimestamp(now)}-${process.pid}.sqlite`);
  db.connection.exec(`VACUUM INTO '${quoteSqlString(backupPath)}'`);
  const sizeBytes = statSync(backupPath).size;
  return {
    backupPath,
    sizeBytes,
    createdAt: now.toISOString(),
  };
}

export function applyKernelEventRetention(input: {
  olderThanDays: number;
  keepLatestPerTask: number;
}): { beforeCount: number; afterCount: number; deletedCount: number; cutoff: string } {
  const olderThanDays = Math.max(1, Math.min(Math.trunc(input.olderThanDays), 3650));
  const keepLatestPerTask = Math.max(1, Math.min(Math.trunc(input.keepLatestPerTask), 5000));
  const db = getKernelDatabase();
  const cutoffDate = new Date(Date.now() - olderThanDays * 24 * 60 * 60 * 1000);
  const cutoff = cutoffDate.toISOString();

  return db.transaction(() => {
    const before = db.connection.prepare("SELECT COUNT(*) AS count FROM kernel_events").get() as { count?: number };
    db.connection.exec("CREATE TEMP TABLE IF NOT EXISTS keep_event_sequences (sequence INTEGER PRIMARY KEY)");
    db.connection.exec("DELETE FROM keep_event_sequences");
    db.connection.prepare(`
      INSERT INTO keep_event_sequences(sequence)
      SELECT sequence
      FROM (
        SELECT sequence, ROW_NUMBER() OVER (PARTITION BY task_id ORDER BY sequence DESC) AS row_num
        FROM kernel_events
      ) ranked
      WHERE ranked.row_num <= ?
    `).run(keepLatestPerTask);

    db.connection.prepare(`
      DELETE FROM kernel_events
      WHERE occurred_at < ?
        AND sequence NOT IN (SELECT sequence FROM keep_event_sequences)
    `).run(cutoff);

    const after = db.connection.prepare("SELECT COUNT(*) AS count FROM kernel_events").get() as { count?: number };
    const beforeCount = typeof before.count === "number" ? before.count : 0;
    const afterCount = typeof after.count === "number" ? after.count : 0;
    return {
      beforeCount,
      afterCount,
      deletedCount: Math.max(0, beforeCount - afterCount),
      cutoff,
    };
  });
}
