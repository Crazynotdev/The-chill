import { z } from 'zod';

/** Lettres (toutes langues), accents, apostrophes, points, tirets, espaces. Pas de chiffres ni de symboles. */
export const NAME_REGEX = /^[\p{L}\p{M}][\p{L}\p{M}'’.\- ]*$/u;

export const participantNameSchema = z
  .string({ required_error: 'Le nom est requis' })
  .transform((s) => s.normalize('NFC').replace(/\s+/g, ' ').trim())
  .pipe(
    z
      .string()
      .min(2, 'Le nom doit contenir au moins 2 caractères')
      .max(80, 'Le nom ne peut pas dépasser 80 caractères')
      .regex(NAME_REGEX, 'Le nom contient des caractères non autorisés'),
  );

export const createTicketSchema = z
  .object({
    participantName: participantNameSchema,
    eventId: z.string().uuid().optional(),
  })
  .strict();

export const scanSchema = z
  .object({
    input: z.string().trim().min(6, 'Entrée trop courte').max(300, 'Entrée trop longue'),
    mode: z.enum(['ENTRY', 'CHECK']).default('ENTRY'),
    checkpoint: z
      .string()
      .trim()
      .max(60)
      .regex(/^[\p{L}\p{N} '’._-]+$/u, 'Point de contrôle invalide')
      .default('Entrée principale'),
  })
  .strict();

export const statusActionSchema = z
  .object({
    action: z.enum(['REVOKE', 'REACTIVATE']),
    reason: z.string().trim().max(200, 'Motif trop long (200 max)').optional(),
  })
  .strict();

export const uuidSchema = z.string().uuid('Identifiant invalide');

export type CreateTicketInput = z.infer<typeof createTicketSchema>;
export type ScanInput = z.infer<typeof scanSchema>;
export type StatusActionInput = z.infer<typeof statusActionSchema>;
