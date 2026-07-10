export type UserPalette = {
  key: string;
  name: string;
  primary: string;
};

// One palette is intended to be used by one user.
// primary represents the user hue. Entry colors are derived from it.
export const USER_PALETTES: UserPalette[] = [
  {
    key: 'ocean',
    name: 'Blau',
    primary: '#2563EB',
  },
  {
    key: 'sunset',
    name: 'Rot',
    primary: '#DC2626',
  },
  {
    key: 'forest',
    name: 'Gruen',
    primary: '#16A34A',
  },
  {
    key: 'violet',
    name: 'Violett',
    primary: '#7C3AED',
  },
  {
    key: 'night',
    name: 'Petrol',
    primary: '#0F766E',
  },
];

export const GLOBAL_AWAY_COLOR = '#6B7280';

export function getPaletteByPrimaryColor(colorCode: string | null | undefined) {
  if (!colorCode) return null;
  const normalized = colorCode.toLowerCase();
  return USER_PALETTES.find((palette) => palette.primary.toLowerCase() === normalized) ?? null;
}
