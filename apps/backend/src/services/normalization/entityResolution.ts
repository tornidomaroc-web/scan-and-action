import { PrismaClient, Entity } from '@prisma/client';
import { RawExtractedEntitySchema } from '../../../../../packages/shared/src/schemas';
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
  public async resolveOrGenerateEntity(userId: string, rawEntity: RawEntity): Promise<Entity> {
    const searchName = rawEntity.name.trim();
    
    // Attempt 1: Search by exact mapping / canonical alias
    // We use a case-insensitive search for robust matching in a real DB
    let entity = await this.prisma.entity.findFirst({
      where: {
        userId,
        OR: [
          { canonicalName: searchName.toUpperCase() },
          { aliases: { has: searchName } } // Available if using PostgreSQL string arrays
        ]
      }
    });

    // Attempt 2: If not found, create a new canonical entity mapping.
    // In MVP, we assume the provided name (if not mapped) becomes the new Canonical English Name.
    // In V2, we might pass it to an LLM to generate standard formatting (e.g., 'Target Store 1234' -> 'TARGET')
    if (!entity) {
      console.log(`[Entity Resolution] Creating new canonical entity for: ${searchName}`);
      const canonical = searchName.toUpperCase().replace(/[^A-Z0-9\s]/g, '').trim();

      entity = await this.prisma.entity.create({
        data: {
          userId,
          entityType: rawEntity.entityType,    // e.g., 'VENDOR'
          canonicalName: canonical,
          aliases: [searchName],              // Add the localized or specific string as an alias
          metadataJson: { source: 'auto-ingest' }
        }
      });
    }

    return entity;
  }
}
