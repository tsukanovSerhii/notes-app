import { createHash } from "node:crypto";
import path from "node:path";
import pg from "pg";
import { createFileAttachmentRepository } from "@/features/sync/server/attachmentRepositories";
import { createPostgresAttachmentRepository } from "@/features/sync/server/postgresAttachmentRepository";
import { clientAddress, createRateLimiter, readPerMinute } from "@/features/sync/server/rateLimit";
import { syncRepo } from "@/features/sync/server/syncRuntime";
import { DEFAULT_QUOTA_BYTES } from "@/features/sync/shared/attachments";

/** What the attachment routes share: storage, limits and the space hash. */
export const attachmentRuntime = (() => {
  // Postgres when DATABASE_URL is set (any number of instances), else files.
  const repo = process.env.DATABASE_URL
    ? createPostgresAttachmentRepository(new pg.Pool({ connectionString: process.env.DATABASE_URL, max: 3 }))
    : createFileAttachmentRepository(
        process.env.ATTACHMENT_DATA_DIR ?? path.join(process.cwd(), ".data", "attachments")
      );

  const quotaMb = Number(process.env.SYNC_ATTACHMENT_QUOTA_MB);
  return {
    repo,
    quotaBytes: Number.isFinite(quotaMb) && quotaMb > 0 ? quotaMb * 1024 * 1024 : DEFAULT_QUOTA_BYTES,
    // Opening a note with many pictures downloads them all at once.
    ipLimiter: createRateLimiter({ perMinute: readPerMinute(process.env.SYNC_ATTACHMENT_RATE_LIMIT_IP, 600) }),
    spaceLimiter: createRateLimiter({ perMinute: readPerMinute(process.env.SYNC_ATTACHMENT_RATE_LIMIT_SPACE, 1200) }),
    hashKey: (token: string) => createHash("sha256").update(token).digest("hex"),
    /** A space whose key was rotated away from keeps no files and accepts none. */
    isRevoked: async (space: string) => (await syncRepo.get(space))?.revokedAt != null,
    clientAddress,
  };
})();
