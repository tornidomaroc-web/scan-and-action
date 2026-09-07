import { createClient } from '@supabase/supabase-js';
import type { Express } from 'express';
import { formatErrorForLog } from '../../redaction';

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

    // The PATH is not logged: it embeds the sanitized original filename (see the
    // construction above), and sanitizeFileName only lowercases and strips
    // punctuation — "CV John Smith.pdf" survives as "cv-john-smith.pdf". The
    // caller persists this path on the Document row and logs the documentId, so
    // it stays recoverable without putting a filename in stdout.
    console.log(`[Storage] Uploading to bucket 'documents' (${file.mimetype}, ${file.buffer.length} bytes)`);
    const { data, error } = await supabase.storage
        .from('documents')
        .upload(filePath, file.buffer, {
            contentType: file.mimetype,
            upsert: false,
        });

    if (error) {
        // ERROR-OBJECT POLICY (redaction.ts): the upload is keyed by `filePath`,
        // which embeds the sanitized filename, so a vendor error echoing the key
        // would leak it. Bounded projection + scrubbed message instead of the
        // raw object.
        console.error('[Storage] Supabase upload error:', formatErrorForLog(error));
        throw new Error('Failed to upload file to Supabase');
    }

    console.log('[Storage] Upload successful.');
    return data.path;
};

/**
 * Fetches a stored object back, for re-extraction.
 *
 * This is deliberately BOTH the fetch and the existence check. There is no
 * separate "does this object exist" probe, because a separate probe would be a
 * second round trip that can disagree with the fetch that follows it. A missing
 * object errors here, definitively, before anything has been written.
 *
 * It also supplies the MIME type, which is the reason the caller cannot get by
 * with the Document row alone: the model stores originalFileName and fileUrl but
 * NO content type (schema.prisma:112-140), and the extraction pipeline needs one
 * to decide how to hand the bytes to Gemini. The download response carries the
 * contentType recorded at upload time, so it is the authoritative source.
 */
export const downloadFromSupabase = async (
    filePath: string
): Promise<{ buffer: Buffer; mimeType: string }> => {
    console.log(`[Storage] Downloading object from bucket 'documents' for re-extraction`);
    const { data, error } = await supabase.storage
        .from('documents')
        .download(filePath);

    if (error || !data) {
        // ERROR-OBJECT POLICY (redaction.ts), same reasoning as uploadToSupabase
        // and getSignedFileUrl: the call is keyed by `filePath`, which embeds the
        // sanitized original filename, so a vendor error echoing the key back
        // would put a user's filename in stdout. Bounded projection only.
        console.error('[Storage] Supabase download error:', formatErrorForLog(error));
        throw new Error('Failed to download file from Supabase');
    }

    const arrayBuffer = await data.arrayBuffer();
    return {
        buffer: Buffer.from(arrayBuffer),
        // Blob.type is '' when the object was stored without a contentType.
        // Fall back rather than passing an empty string down to the extractor.
        mimeType: data.type || 'application/octet-stream',
    };
};