import { createClient } from '@supabase/supabase-js';

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
        console.error('Supabase signed URL error:', error);
        throw new Error('Failed to create signed URL');
    }

    return data.signedUrl;
};