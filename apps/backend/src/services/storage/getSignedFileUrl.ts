import { createClient } from '@supabase/supabase-js';
import { formatErrorForLog } from '../../redaction';

const supabaseUrl = process.env.SUPABASE_URL;
const supabaseServiceRoleKey = process.env.SUPABASE_SERVICE_ROLE_KEY;

if (!supabaseUrl || !supabaseServiceRoleKey) {
    throw new Error('Missing SUPABASE_URL or SUPABASE_SERVICE_ROLE_KEY in backend environment');
}

const supabase = createClient(supabaseUrl, supabaseServiceRoleKey);

export const getSignedFileUrl = async (filePath: string, expiresIn = 60 * 10): Promise<string> => {
    const { data, error } = await supabase.storage
        .from('documents')
        .createSignedUrl(filePath, expiresIn);

    if (error || !data?.signedUrl) {
        // ERROR-OBJECT POLICY (redaction.ts): never hand the raw error to
        // console.*. This one is constructed from `filePath` — the storage key,
        // which embeds the sanitized original filename — so a Supabase error
        // quoting the key back would print a user's filename. formatErrorForLog
        // projects to bounded vendor metadata + a scrubbed message.
        console.error('[Storage] Supabase signed URL error:', formatErrorForLog(error));
        throw new Error('Failed to create signed URL');
    }

    return data.signedUrl;
};