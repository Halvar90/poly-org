import type { ComponentProps } from 'react';
import { MaterialCommunityIcons } from '@expo/vector-icons';

type EventIconName = ComponentProps<typeof MaterialCommunityIcons>['name'];

export type EventIconInput = {
  title: string;
  description?: string | null;
  type: string;
  category?: string | null;
};

const KEYWORD_ICON_RULES: Array<{ pattern: RegExp; icon: EventIconName }> = [
  { pattern: /\b(arbeit|büro|job|meeting|office|schicht)\b/i, icon: 'briefcase-outline' },
  { pattern: /\b(arzt|doctor|medizin|zahnarzt|krankenhaus|therapie|apotheke)\b/i, icon: 'medical-bag' },
  { pattern: /\b(haushalt|putzen|einkauf|waschen|kochen|müll|reinigung)\b/i, icon: 'broom' },
  { pattern: /\b(freizeit|kino|party|spiel|game|bier|sport|hobby|konzert)\b/i, icon: 'gamepad-variant' },
  { pattern: /\b(kind|anna|baby|kita|schule|kinder|elternabend)\b/i, icon: 'baby-face-outline' },
];

const CATEGORY_ICON_MAP: Record<string, EventIconName> = {
  arbeit: 'briefcase-outline',
  arzt: 'medical-bag',
  haushalt: 'broom',
  freizeit: 'gamepad-variant',
  kind: 'baby-face-outline',
};

const ENTRY_TYPE_ICON_FALLBACKS: Record<string, EventIconName> = {
  termin: 'calendar-outline',
  aufgabe: 'checkbox-marked-circle-outline',
  abwesenheit: 'airplane',
};

export function getEventTypeIcon(event: EventIconInput): EventIconName {
  if (event.category && CATEGORY_ICON_MAP[event.category]) {
    return CATEGORY_ICON_MAP[event.category];
  }

  const haystack = `${event.title} ${event.description ?? ''}`.toLowerCase();

  for (const rule of KEYWORD_ICON_RULES) {
    if (rule.pattern.test(haystack)) {
      return rule.icon;
    }
  }

  if (ENTRY_TYPE_ICON_FALLBACKS[event.type]) {
    return ENTRY_TYPE_ICON_FALLBACKS[event.type];
  }

  return 'calendar-blank-outline';
}

export function EventTypeIcon({
  event,
  color,
  size = 22,
}: {
  event: EventIconInput;
  color: string;
  size?: number;
}) {
  const iconName = getEventTypeIcon(event);

  return <MaterialCommunityIcons name={iconName} size={size} color={color} />;
}
