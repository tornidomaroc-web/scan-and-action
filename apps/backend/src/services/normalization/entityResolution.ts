import { PrismaClient, Entity } from '@prisma/client';
import { RawExtractedEntitySchema } from '../../types/schemas';
import { canonicalizeEntityName } from '../../utils/canonicalName';
import { z } from 'zod';

type RawEntity = z.infer<typeof RawExtractedEntitySchema>;

export class EntityResolutionService {
  private prisma: PrismaClient;

  constructor(prisma: PrismaClient) {
    this.prisma = prisma;
  }

  /**
   * Resolves a raw string name to a global Entity.
   * If the entity doesn't exist by canonical name or alias, it creates one.
   */
  public async resolveOrGenerateEntity(organizationId: string, rawEntity: RawEntity): Promise<Entity> {
    const searchName = rawEntity.name.trim();
    // ONE canonical transform for both the lookup and the write, so a re-sighting
    // of the same merchant resolves to the existing row instead of creating a
    // duplicate. Previously the lookup used `searchName.toUpperCase()` (no strip)
    // while the write stored the STRIPPED form, so an accented/punctuated name
    // (e.g. "CAFÉ CENTRAL" vs stored "CAF CENTRAL") never matched on the
    // canonicalName branch and could create a duplicate Entity (item B).
    const canonical = canonicalizeEntityName(searchName);

    // Attempt 1: Search by canonical matching key or an exact stored alias.
    let entity = await this.prisma.entity.findFirst({
      where: {
        organizationId,
        OR: [
          { canonicalName: canonical },
          { aliases: { has: searchName } } // Available if using PostgreSQL string arrays
        ]
      }
    });

    // Attempt 2: If not found, create a new canonical entity mapping.
    // In MVP, we assume the provided name (if not mapped) becomes the new Canonical English Name.
    // In V2, we might pass it to an LLM to generate standard formatting (e.g., 'Target Store 1234' -> 'TARGET')
    if (!entity) {
      entity = await this.prisma.entity.create({
        data: {
          organizationId,
          entityType: rawEntity.entityType,    // e.g., 'VENDOR'
          canonicalName: canonical,
          // Human-readable name (casing + accents preserved). Honesty rule: never
          // store an empty string — a whitespace-only raw name leaves displayName
          // NULL, and the display layer falls back (aliases[0] / canonicalName).
          // NEVER write canonicalName here (it is the mangled matching key).
          displayName: searchName ? searchName : null,
          aliases: [searchName],              // Add the localized or specific string as an alias
          metadataJson: { source: 'auto-ingest' }
        }
      });

      // The entity NAME is deliberately NOT logged (this used to be
      // `Creating new canonical entity for: ${searchName}`). `entityType` is one
      // of VENDOR/CLIENT/PERSON/OTHER (types/schemas.ts:16), so `searchName` can
      // be a real person's name lifted off a scanned business card — the
      // strongest personal data anywhere in the ingestion path, and it was going
      // to stdout on every first sighting of an entity.
      //
      // The canonical key is not logged either: it is the same name, mangled, so
      // it carries the same PII.
      //
      // id + type + org is what actually diagnoses the duplicate-entity class of
      // bug this log exists for, and the id resolves to the full row for anyone
      // who already has DB access. Logged AFTER the write so the real id is known.
      console.log(
        `[Entity Resolution] Created canonical entity ${entity.id} (type=${rawEntity.entityType}) for org ${organizationId}`
      );
    }

    return entity;
  }
}
