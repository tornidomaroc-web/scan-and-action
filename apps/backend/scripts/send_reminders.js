const { PrismaClient } = require('@prisma/client');
const fs = require('fs');
const path = require('path');
require('dotenv').config({ path: path.join(__dirname, '../.env') });

const prisma = new PrismaClient();
const CACHE_FILE = path.join(__dirname, 'notified_batches.json');

/**
 * Minimal v1 Email Sender using Resend REST API (No SDK needed)
 */
async function sendEmail(to, subject, html) {
  if (!process.env.RESEND_API_KEY) {
    console.warn('[Reminder Job] RESEND_API_KEY not found in .env. Skipping email send.');
    return false;
  }

  try {
    const res = await fetch('https://api.resend.com/emails', {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
        'Authorization': `Bearer ${process.env.RESEND_API_KEY}`,
      },
      body: JSON.stringify({
        from: 'Scan & Action <onboarding@resend.dev>', // Default Resend sandbox sender
        to: [to],
        subject,
        html,
      }),
    });

    if (res.ok) {
      const data = await res.json();
      console.log(`[Reminder Job] Email successfully sent to ${to}. ID: ${data.id}`);
      return true;
    } else {
      const err = await res.text();
      console.error(`[Reminder Job] Failed to send email to ${to}:`, err);
      return false;
    }
  } catch (err) {
    console.error(`[Reminder Job] Exception during email send:`, err.message);
    return false;
  }
}

async function main() {
  console.log(`[Reminder Job] Starting standalone re-engagement check...`);

  // 1. Define Staleness Threshold (2 hours)
  const threshold = new Date(Date.now() - 2 * 60 * 60 * 1000);

  // 2. Identify Organizations with "Stale" Pending Work
  // Rule: Must have NEEDS_REVIEW documents whose newest member is at least 2h old.
  const orgs = await prisma.organization.findMany({
    where: {
      documents: {
        some: {
          status: 'NEEDS_REVIEW',
          uploadedAt: { lt: threshold }
        }
      }
    },
    include: {
      members: {
        where: { role: 'OWNER' },
        include: { user: true }
      },
      documents: {
        where: { status: 'NEEDS_REVIEW' },
        orderBy: { uploadedAt: 'desc' },
        take: 1
      }
    }
  });

  console.log(`[Reminder Job] Found ${orgs.length} organizations with stale pending items.`);

  // 3. Load Local Deduplication Cache
  let cache = {};
  try {
    if (fs.existsSync(CACHE_FILE)) {
      cache = JSON.parse(fs.readFileSync(CACHE_FILE, 'utf8'));
    }
  } catch (err) {
    console.error(`[Reminder Job] Error reading cache file:`, err.message);
  }

  let sentCount = 0;

  // 4. Process Each Organization
  for (const org of orgs) {
    const latestDoc = org.documents[0];
    const ownerEmail = org.members[0]?.user?.email;

    if (!latestDoc || !ownerEmail) {
      console.log(`[Reminder Job] Skipping Org ${org.slug}: Owner email or documents missing.`);
      continue;
    }

    // 5. Runtime Guard: Explicitly count pending items to ensure we don't notify for empty batches
    const currentPendingCount = await prisma.document.count({
      where: {
        organizationId: org.id,
        status: 'NEEDS_REVIEW'
      }
    });

    if (currentPendingCount === 0) {
      console.log(`[Reminder Job] Skipping Org ${org.slug}: No items currently pending.`);
      continue;
    }

    // 6. Deduplication Logic: 
    // If the ID of the newest pending document for this org matches our cache, 
    // it means a reminder was already sent for this specific "batch" of work.
    if (cache[org.id] === latestDoc.id) {
      console.log(`[Reminder Job] Skipping Org ${org.slug}: Batch already notified.`);
      continue;
    }

    console.log(`[Reminder Job] New batch identified for ${org.slug} (${currentPendingCount} items). Sending reminder to ${ownerEmail}...`);

    // 7. Send the Re-engagement Email
    const success = await sendEmail(
      ownerEmail,
      "Your batch is ready for review",
      `
        <div style="font-family: sans-serif; max-width: 600px; margin: 0 auto; padding: 20px; border: 1px solid #e2e8f0; border-radius: 12px;">
          <h1 style="color: #1e293b; font-size: 24px; font-weight: 800; margin-bottom: 8px;">Intelligence Batch Ready</h1>
          <p style="color: #64748b; font-size: 16px; line-height: 1.5;">Hi there, the AI has finished processing your recent document batch.</p>
          <p style="color: #64748b; font-size: 16px; line-height: 1.5; margin-bottom: 24px;">
            You have <strong>${currentPendingCount} item${currentPendingCount > 1 ? 's' : ''}</strong> requiring your final touch before they can be exported and used in your workflow.
          </p>
          
          <a href="https://scan-and-action.vercel.app/queue" 
             style="background-color: #2563eb; color: white; padding: 14px 28px; text-decoration: none; border-radius: 8px; font-weight: bold; font-size: 14px; display: inline-block; box-shadow: 0 4px 6px -1px rgb(0 0 0 / 0.1);">
            Finalize Processing
          </a>
          
          <div style="margin-top: 32px; padding-top: 20px; border-top: 1px solid #f1f5f9;">
            <p style="color: #94a3b8; font-size: 12px;">
              You are receiving this because you have pending items in your Scan & Action workspace. 
              Uploads remain in the queue until manual verification is completed.
            </p>
          </div>
        </div>
      `
    );

    if (success) {
      cache[org.id] = latestDoc.id;
      sentCount++;
    }
  }

  // 6. Persist Cache
  try {
    fs.writeFileSync(CACHE_FILE, JSON.stringify(cache, null, 2));
    console.log(`[Reminder Job] Cache updated successfully.`);
  } catch (err) {
    console.error(`[Reminder Job] Error saving cache file:`, err.message);
  }

  console.log(`--- REMINDER JOB COMPLETE: ${sentCount} Emails Sent ---`);
  await prisma.$disconnect();
}

main().catch(err => {
  console.error('[Reminder Job] FATAL ERROR:', err);
  process.exit(1);
});
