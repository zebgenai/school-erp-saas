import { IdCardTemplate } from '@prisma/client';

export const ID_CARD_TEMPLATES: Array<{
  id: IdCardTemplate;
  name: string;
  description: string;
}> = [
  {
    id: IdCardTemplate.CLASSIC,
    name: 'Classic',
    description: 'Traditional navy header with gold accents.',
  },
  {
    id: IdCardTemplate.MODERN,
    name: 'Modern',
    description: 'Clean layout using the school theme color.',
  },
  {
    id: IdCardTemplate.PREMIUM,
    name: 'Premium',
    description: 'Dark header with gold highlights.',
  },
  {
    id: IdCardTemplate.MINIMAL,
    name: 'Minimal',
    description: 'Light border, generous space, quiet branding.',
  },
];

export function isIdCardTemplate(value: string): value is IdCardTemplate {
  return (Object.values(IdCardTemplate) as string[]).includes(value);
}
