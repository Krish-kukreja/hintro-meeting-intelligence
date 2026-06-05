import { z } from 'zod';

export const UuidParamSchema = z.object({
  id: z.string().uuid('ID must be a valid UUID'),
});
