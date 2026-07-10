import { LocaleConfig } from 'react-native-calendars';

import { GLOBAL_AWAY_COLOR, getPaletteByPrimaryColor } from '@/constants/UserPalettes';

LocaleConfig.locales.de = {
  monthNames: [
    'Januar',
    'Februar',
    'März',
    'April',
    'Mai',
    'Juni',
    'Juli',
    'August',
    'September',
    'Oktober',
    'November',
    'Dezember',
  ],
  monthNamesShort: [
    'Jan.',
    'Feb.',
    'März',
    'Apr.',
    'Mai',
    'Juni',
    'Juli',
    'Aug.',
    'Sept.',
    'Okt.',
    'Nov.',
    'Dez.',
  ],
  dayNames: ['Sonntag', 'Montag', 'Dienstag', 'Mittwoch', 'Donnerstag', 'Freitag', 'Samstag'],
  dayNamesShort: ['So', 'Mo', 'Di', 'Mi', 'Do', 'Fr', 'Sa'],
  today: 'Heute',
};

LocaleConfig.defaultLocale = 'de';

export type CalendarDot = {
  key: string;
  color: string;
};

export type MarkedDateEntry = {
  dots?: CalendarDot[];
  selected?: boolean;
  selectedColor?: string;
};

export type CalendarEvent = {
  id: string;
  start_time: string | null;
  end_time?: string | null;
  color_code: string;
  entry_type?: string;
  recurrence_rule?: RecurrenceRule | null;
};

export type RecurrenceRule = 'none' | 'weekly' | 'monthly';

export function toDateKey(date: Date | string) {
  const value = typeof date === 'string' ? new Date(date) : date;
  const year = value.getFullYear();
  const month = String(value.getMonth() + 1).padStart(2, '0');
  const day = String(value.getDate()).padStart(2, '0');
  return `${year}-${month}-${day}`;
}

export function getTodayDateKey() {
  return toDateKey(new Date());
}

export function formatEventTime(iso: string) {
  return new Date(iso).toLocaleTimeString('de-DE', {
    hour: '2-digit',
    minute: '2-digit',
  });
}

export function formatEventDate(iso: string) {
  return new Date(iso).toLocaleDateString('de-DE', {
    day: 'numeric',
    month: 'short',
  });
}

export function formatEventSchedule(event: CalendarEvent) {
  if (!event.start_time) return '';

  if (event.entry_type === 'abwesenheit' && event.end_time) {
    const sameDay = formatEventDate(event.start_time) === formatEventDate(event.end_time);
    if (sameDay) {
      return `${formatEventTime(event.start_time)} – ${formatEventTime(event.end_time)}`;
    }
    return `${formatEventDate(event.start_time)} ${formatEventTime(event.start_time)} – ${formatEventDate(event.end_time)} ${formatEventTime(event.end_time)}`;
  }

  return `${formatEventTime(event.start_time)}${event.end_time ? ` – ${formatEventTime(event.end_time)}` : ''}`;
}

export function getWeekStart(date: Date) {
  const day = date.getDay();
  const diff = (day + 6) % 7;
  const start = new Date(date);
  start.setDate(date.getDate() - diff);
  start.setHours(0, 0, 0, 0);
  return start;
}

export function getWeekLabel(dateKey: string) {
  const [year, month, day] = dateKey.split('-').map(Number);
  const date = new Date(year, month - 1, day);
  const start = getWeekStart(date);
  const end = new Date(start);
  end.setDate(start.getDate() + 6);

  return `${start.toLocaleDateString('de-DE', {
    day: 'numeric',
    month: 'short',
  })} – ${end.toLocaleDateString('de-DE', {
    day: 'numeric',
    month: 'short',
  })}`;
}

export function getEventDateKeys(event: CalendarEvent): string[] {
  if (!event.start_time) {
    return [];
  }

  const startKey = toDateKey(event.start_time);

  if (event.entry_type === 'abwesenheit' && event.end_time) {
    const keys: string[] = [];
    const cursor = new Date(event.start_time);
    const end = new Date(event.end_time);

    cursor.setHours(0, 0, 0, 0);
    end.setHours(0, 0, 0, 0);

    while (cursor <= end) {
      keys.push(toDateKey(cursor));
      cursor.setDate(cursor.getDate() + 1);
    }

    return keys;
  }

  return [startKey];
}

function parseDateKey(dateKey: string) {
  const [year, month, day] = dateKey.split('-').map(Number);
  const date = new Date(year, month - 1, day);
  date.setHours(0, 0, 0, 0);
  return date;
}

function normalizeRecurrenceRule(recurrenceRule: RecurrenceRule | string | null | undefined): RecurrenceRule {
  if (recurrenceRule === 'weekly' || recurrenceRule === 'monthly') {
    return recurrenceRule;
  }
  return 'none';
}

function matchesMonthlyRecurrence(startDate: Date, targetDate: Date) {
  const startDay = startDate.getDate();
  const lastDayOfTargetMonth = new Date(
    targetDate.getFullYear(),
    targetDate.getMonth() + 1,
    0,
  ).getDate();
  const recurringDay = Math.min(startDay, lastDayOfTargetMonth);
  return targetDate.getDate() === recurringDay;
}

export function eventOccursOnDay(event: CalendarEvent, dateKey: string) {
  if (!event.start_time) {
    return false;
  }

  if (event.entry_type === 'abwesenheit' && event.end_time) {
    return getEventDateKeys(event).includes(dateKey);
  }

  const startDate = new Date(event.start_time);
  startDate.setHours(0, 0, 0, 0);
  const targetDate = parseDateKey(dateKey);

  if (targetDate.getTime() < startDate.getTime()) {
    return false;
  }

  const recurrenceRule = normalizeRecurrenceRule(event.recurrence_rule);
  if (recurrenceRule === 'none') {
    return toDateKey(startDate) === dateKey;
  }

  if (recurrenceRule === 'weekly') {
    return targetDate.getDay() === startDate.getDay();
  }

  return matchesMonthlyRecurrence(startDate, targetDate);
}

function getEventDateKeysInRange(
  event: CalendarEvent,
  rangeStartDateKey: string,
  rangeEndDateKey: string,
) {
  const keys: string[] = [];
  const cursor = parseDateKey(rangeStartDateKey);
  const end = parseDateKey(rangeEndDateKey);

  while (cursor.getTime() <= end.getTime()) {
    const cursorKey = toDateKey(cursor);
    if (eventOccursOnDay(event, cursorKey)) {
      keys.push(cursorKey);
    }
    cursor.setDate(cursor.getDate() + 1);
  }

  return keys;
}

export function buildMarkedDates(
  events: CalendarEvent[],
  selectedDate: string,
  selectedColor: string,
  visibleRange?: { startDate: string; endDate: string },
): Record<string, MarkedDateEntry> {
  const marked: Record<string, MarkedDateEntry> = {};
  const colorSetByDate: Record<string, Set<string>> = {};

  for (const event of events) {
    const dateKeys = visibleRange
      ? getEventDateKeysInRange(event, visibleRange.startDate, visibleRange.endDate)
      : getEventDateKeys(event);

    for (const dateKey of dateKeys) {
      if (!marked[dateKey]) {
        marked[dateKey] = { dots: [] };
        colorSetByDate[dateKey] = new Set<string>();
      }

      const creatorColor = event.color_code;
      if (colorSetByDate[dateKey].has(creatorColor)) {
        continue;
      }

      colorSetByDate[dateKey].add(creatorColor);

      marked[dateKey].dots?.push({
        key: `${dateKey}-${creatorColor}`,
        color: creatorColor,
      });
    }
  }

  marked[selectedDate] = {
    ...marked[selectedDate],
    selected: true,
    selectedColor,
    dots: marked[selectedDate]?.dots ?? [],
  };

  return marked;
}

export function filterEventsForDay<T extends CalendarEvent>(events: T[], dateKey: string) {
  return events
    .filter((event) => eventOccursOnDay(event, dateKey))
    .sort((a, b) => {
      if (!a.start_time || !b.start_time) return 0;
      return new Date(a.start_time).getTime() - new Date(b.start_time).getTime();
    });
}

export function formatSelectedDayLabel(dateKey: string) {
  const [year, month, day] = dateKey.split('-').map(Number);
  const date = new Date(year, month - 1, day);

  return date.toLocaleDateString('de-DE', {
    weekday: 'long',
    day: 'numeric',
    month: 'long',
    year: 'numeric',
  });
}

export function getRecurrenceLabel(recurrenceRule: RecurrenceRule | string | null | undefined) {
  const rule = normalizeRecurrenceRule(recurrenceRule);
  if (rule === 'weekly') return 'Woechentlich';
  if (rule === 'monthly') return 'Monatlich';
  return null;
}

function clampColorChannel(value: number) {
  return Math.max(0, Math.min(255, Math.round(value)));
}

function hexToRgb(hex: string) {
  const value = hex.replace('#', '').trim();
  const normalized =
    value.length === 3
      ? value
          .split('')
          .map((char) => `${char}${char}`)
          .join('')
      : value;

  if (normalized.length !== 6) {
    return { r: 37, g: 99, b: 235 };
  }

  const r = Number.parseInt(normalized.slice(0, 2), 16);
  const g = Number.parseInt(normalized.slice(2, 4), 16);
  const b = Number.parseInt(normalized.slice(4, 6), 16);

  if ([r, g, b].some((channel) => Number.isNaN(channel))) {
    return { r: 37, g: 99, b: 235 };
  }

  return { r, g, b };
}

function rgbToHex(r: number, g: number, b: number) {
  return `#${[r, g, b]
    .map((channel) => clampColorChannel(channel).toString(16).padStart(2, '0'))
    .join('')}`;
}

// factor > 0 mixes toward white, factor < 0 mixes toward black.
function shadeHexColor(hex: string, factor: number) {
  const { r, g, b } = hexToRgb(hex);
  const amount = Math.max(-1, Math.min(1, factor));

  if (amount >= 0) {
    return rgbToHex(
      r + (255 - r) * amount,
      g + (255 - g) * amount,
      b + (255 - b) * amount,
    );
  }

  const darken = 1 + amount;
  return rgbToHex(r * darken, g * darken, b * darken);
}

export function getEntryTypeColorForCreator(entryType: string | undefined, creatorColor: string) {
  if (entryType === 'abwesenheit') {
    return GLOBAL_AWAY_COLOR;
  }

  const palette = getPaletteByPrimaryColor(creatorColor);
  const baseColor = palette?.primary ?? creatorColor;

  if (entryType === 'aufgabe') {
    return shadeHexColor(baseColor, 0.3);
  }

  return shadeHexColor(baseColor, -0.22);
}
