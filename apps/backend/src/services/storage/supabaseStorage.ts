import { createClient } from '@supabase/supabase-js';
import type { Express } from 'express';

const supabaseUrl = process.env.SUPABASE_URL;
const supabaseServiceRoleKey = process.env.SUPABASE_SERVICE_ROLE_KEY;

if (!supabaseUrl || !supabaseServiceRoleKey) {
    throw new Error('Missing SUPABASE_URL or SUPABASE_SERVICE_ROLE_KEY in backend environment');
}

const supabase = createClient(supabaseUrl, supabaseServiceRoleKey);

const sanitizeFileName = (fileName: string) => {
    return fileName
        .toLowerCase()
        .replace(/\s+/g, '-')
        .replace(/[^a-z0-9.\-_]/g, '');
};

export const uploadToSupabase = async (file: Express.Multer.File): Promise<string> => {
    const safeOriginalName = sanitizeFileName(file.originalname);
    const filePath = `uploads/${Date.now()}-${safeOriginalName}`;

    console.log(`[Storage] Uploading to bucket 'documents', path: ${filePath}`);
    const { data, error } = await supabase.storage
        .from('documents')
        .upload(filePath, file.buffer, {
            contentType: file.mimetype,
            upsert: false,
        });

    if (error) {
        console.error('[Storage] Supabase upload error:', error);
        throw new Error('Failed to upload file to Supabase');
    }

    console.log(`[Storage] Upload successful: ${data.path}`);
    return data.path;
};