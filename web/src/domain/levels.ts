// Class levels differ by country, so the level is free text with suggestions from common systems.
export const LEVEL_SUGGESTIONS: { system: string; levels: string[] }[] = [
  { system: 'Grades (US, Canada, Kenya CBC…)', levels: Array.from({ length: 12 }, (_, i) => `Grade ${i + 1}`) },
  { system: 'Years (UK, Australia…)', levels: Array.from({ length: 13 }, (_, i) => `Year ${i + 1}`) },
  { system: 'Primary', levels: Array.from({ length: 6 }, (_, i) => `Primary ${i + 1}`) },
  { system: 'Nigeria', levels: ['JSS 1', 'JSS 2', 'JSS 3', 'SS 1', 'SS 2', 'SS 3'] },
  { system: 'Ghana', levels: ['Basic 7', 'Basic 8', 'Basic 9', 'SHS 1', 'SHS 2', 'SHS 3'] },
  { system: 'Forms (Kenya 8-4-4, Zimbabwe, Malaysia…)', levels: Array.from({ length: 6 }, (_, i) => `Form ${i + 1}`) },
  { system: 'Classes (India, Pakistan…)', levels: Array.from({ length: 12 }, (_, i) => `Class ${i + 1}`) },
];

export const ALL_LEVELS: string[] = LEVEL_SUGGESTIONS.flatMap((g) => g.levels);
