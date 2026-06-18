import { createClient } from '@supabase/supabase-js';

// Account deletion needs two things the DB cascade cannot do on its own:
//   1. Remove the uploaded document files from Supabase Storage (the DB only
//      holds their paths in Document.fileUrl — deleting the rows orphans the
//      actual objects).
//   2. Delete the Supabase auth identity (auth.users) so the email is fully
//      gone and can be re-registered cleanly.
// Both require the SERVICE ROLE key, which lives ONLY on the backend (same key
// already used by authMiddleware and supabaseStorage). It is never shipped to
// the client.
const supabaseUrl = process.env.SUPABASE_URL;
const supabaseServiceRoleKey = process.env.SUPABASE_SERVICE_ROLE_KEY;

if (!supabaseUrl || !supabaseServiceRoleKey) {
  throw new Error('Missing SUPABASE_URL or SUPABASE_SERVICE_ROLE_KEY in backend environment');
}

const admin = createClient(supabaseUrl, supabaseServiceRoleKey);

// Matches the bucket used by supabaseStorage.uploadToSupabase.
const DOCUMENTS_BUCKET = 'documents';

/**
 * Delete uploaded document objects from Supabase Storage.
 * `paths` are the values stored in Document.fileUrl (e.g. "uploads/123-foo.pdf").
 * Chunked because the Storage API caps how many keys a single remove() accepts.
 * remove() is a no-op for keys that no longer exist, so this is safe to retry.
 */
export async function deleteStorageObjects(paths: string[]): Promise<void> {
  const keys = paths.filter((p) => typeof p === 'string' && p.length > 0);
  for (let i = 0; i < keys.length; i += 100) {
    const chunk = keys.slice(i, i + 100);
    const { error } = await admin.storage.from(DOCUMENTS_BUCKET).remove(chunk);
    if (error) {
      throw new Error(`Storage deletion failed: ${error.message}`);
    }
  }
}

/**
 * Delete the Supabase auth user. Idempotent: a "user not found" response means
 * the identity is already gone (e.g. a retried deletion), which we treat as
 * success rather than an error.
 */
export async function deleteAuthUser(userId: string): Promise<void> {
  const { error } = await admin.auth.admin.deleteUser(userId);
  if (error && !/not\s*found/i.test(error.message)) {
    throw new Error(`Auth user deletion failed: ${error.message}`);
  }
}
