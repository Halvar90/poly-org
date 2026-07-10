import { Ionicons } from '@expo/vector-icons';
import { router, useLocalSearchParams } from 'expo-router';
import { useCallback, useMemo, useState } from 'react';
import {
  ActivityIndicator,
  Pressable,
  RefreshControl,
  ScrollView,
  StyleSheet,
  Text,
  View,
} from 'react-native';
import { useFocusEffect } from 'expo-router';
import { useSafeAreaInsets } from 'react-native-safe-area-context';

import { useColorScheme } from '@/components/useColorScheme';
import Colors from '@/constants/Colors';
import {
  filterEventsForDay,
  formatEventSchedule,
  formatSelectedDayLabel,
  getEntryTypeColorForCreator,
  getRecurrenceLabel,
  getTodayDateKey,
} from '@/lib/calendarUtils';
import { supabase } from '@/lib/supabase';

type EntryType = 'termin' | 'aufgabe' | 'abwesenheit' | 'erinnerung';

type DayEvent = {
  id: string;
  title: string;
  description: string | null;
  start_time: string | null;
  end_time: string | null;
  entry_type: EntryType;
  color_code: string;
  creator_username: string;
  creator_id: string;
  recurrence_rule?: 'none' | 'weekly' | 'monthly' | null;
  is_done?: boolean;
};

function getTypeLabel(item: DayEvent) {
  if (item.entry_type === 'aufgabe' && item.start_time) return 'Erinnerung';
  if (item.entry_type === 'termin') return 'Termin';
  if (item.entry_type === 'aufgabe') return 'Aufgabe';
  return 'Abwesenheit';
}

export default function DayOverviewScreen() {
  const params = useLocalSearchParams<{ date?: string | string[] }>();
  const rawDate = Array.isArray(params.date) ? params.date[0] : params.date;
  const dateKey = useMemo(() => {
    if (rawDate && /^\d{4}-\d{2}-\d{2}$/.test(rawDate)) {
      return rawDate;
    }
    return getTodayDateKey();
  }, [rawDate]);

  const colorScheme = useColorScheme() ?? 'light';
  const theme = Colors[colorScheme];
  const insets = useSafeAreaInsets();

  const [events, setEvents] = useState<DayEvent[]>([]);
  const [isLoading, setIsLoading] = useState(true);
  const [isRefreshing, setIsRefreshing] = useState(false);
  const [errorMessage, setErrorMessage] = useState<string | null>(null);

  const loadEntries = useCallback(async (isPullRefresh = false) => {
    if (isPullRefresh) {
      setIsRefreshing(true);
    } else {
      setIsLoading(true);
    }

    setErrorMessage(null);

    try {
      const { data, error } = await supabase
        .from('events_with_creator')
        .select('*')
        .order('start_time', { ascending: true, nullsFirst: false });

      if (error) throw error;

      const normalized = ((data as any[]) ?? []).map((item) => ({
        ...item,
        entry_type: (item.entry_type ?? item.type ?? 'termin') as EntryType,
      })) as DayEvent[];

      const filtered = filterEventsForDay(normalized, dateKey).sort((a, b) => {
        const aDone = a.is_done ? 1 : 0;
        const bDone = b.is_done ? 1 : 0;
        return aDone - bDone;
      });

      setEvents(filtered);
    } catch (error) {
      const message =
        error instanceof Error ? error.message : 'Eintraege konnten nicht geladen werden.';
      setErrorMessage(message);
    } finally {
      setIsLoading(false);
      setIsRefreshing(false);
    }
  }, [dateKey]);

  useFocusEffect(
    useCallback(() => {
      loadEntries();
    }, [loadEntries]),
  );

  if (isLoading && events.length === 0) {
    return (
      <View style={[styles.centered, { backgroundColor: theme.background }]}> 
        <ActivityIndicator size="large" color={theme.tint} />
      </View>
    );
  }

  return (
    <View style={[styles.container, { backgroundColor: theme.background }]}> 
      <View style={[styles.headerRow, { paddingTop: insets.top + 8 }]}>
        <Pressable
          onPress={() => router.back()}
          style={({ pressed }) => [styles.backButton, { opacity: pressed ? 0.75 : 1 }]}
          accessibilityLabel="Zurueck">
          <Ionicons name="chevron-back" size={22} color={theme.text} />
        </Pressable>
        <View style={styles.headerTextWrap}>
          <Text style={[styles.headerTitle, { color: theme.text }]}>Tagesuebersicht</Text>
          <Text style={styles.headerDate}>{formatSelectedDayLabel(dateKey)}</Text>
        </View>
      </View>

      {errorMessage ? (
        <View style={styles.errorBox}>
          <Text style={styles.errorText}>{errorMessage}</Text>
        </View>
      ) : null}

      <ScrollView
        contentContainerStyle={styles.scrollContent}
        refreshControl={
          <RefreshControl
            refreshing={isRefreshing}
            onRefresh={() => loadEntries(true)}
            tintColor={theme.tint}
            colors={[theme.tint]}
          />
        }>
        {events.length === 0 ? (
          <View style={styles.emptyWrap}>
            <Ionicons name="calendar-clear-outline" size={34} color={theme.tint} />
            <Text style={[styles.emptyTitle, { color: theme.text }]}>Keine Eintraege</Text>
            <Text style={styles.emptySubtitle}>An diesem Tag gibt es keine Termine oder Aufgaben.</Text>
          </View>
        ) : (
          events.map((item) => {
            const recurrenceLabel = getRecurrenceLabel(item.recurrence_rule);
            return (
            <Pressable
              key={item.id}
              onPress={() => router.push({ pathname: '/event/[id]', params: { id: item.id } })}
              style={({ pressed }) => [
                styles.card,
                {
                  opacity: pressed ? 0.82 : item.is_done ? 0.62 : 1,
                  backgroundColor: colorScheme === 'dark' ? '#252540' : '#fff',
                  borderColor: colorScheme === 'dark' ? '#3d3d5c' : '#ececf2',
                },
              ]}>
              <View style={[styles.creatorStrip, { backgroundColor: item.color_code }]} />
              <View style={styles.cardBody}>
                <View style={styles.cardTopRow}>
                  <Text style={[styles.cardTitle, { color: theme.text }]} numberOfLines={2}>
                    {item.title}
                  </Text>
                  <Ionicons name="chevron-forward" size={18} color={theme.text} />
                </View>

                <View style={styles.metaRow}>
                  <View style={[styles.typeBadge, { backgroundColor: getEntryTypeColorForCreator(item.entry_type, item.color_code) }]}>
                    <Text style={styles.typeBadgeText}>{getTypeLabel(item)}</Text>
                  </View>
                  <Text style={styles.creatorText}>von {item.creator_username}</Text>
                </View>

                {item.start_time ? (
                  <Text style={styles.timeText}>{formatEventSchedule(item)}</Text>
                ) : null}

                {recurrenceLabel ? <Text style={styles.recurrenceText}>{recurrenceLabel}</Text> : null}
              </View>
            </Pressable>
            );
          })
        )}
      </ScrollView>
    </View>
  );
}

const styles = StyleSheet.create({
  container: {
    flex: 1,
  },
  centered: {
    flex: 1,
    alignItems: 'center',
    justifyContent: 'center',
  },
  headerRow: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 10,
    paddingHorizontal: 16,
    paddingTop: 14,
    paddingBottom: 8,
  },
  backButton: {
    width: 36,
    height: 36,
    borderRadius: 18,
    alignItems: 'center',
    justifyContent: 'center',
  },
  headerTextWrap: {
    flex: 1,
  },
  headerTitle: {
    fontSize: 19,
    fontWeight: '700',
  },
  headerDate: {
    marginTop: 2,
    fontSize: 13,
    color: '#888',
  },
  errorBox: {
    marginHorizontal: 16,
    marginBottom: 8,
    borderRadius: 10,
    padding: 10,
    backgroundColor: '#fdecea',
  },
  errorText: {
    color: '#c0392b',
    fontSize: 13,
  },
  scrollContent: {
    paddingHorizontal: 16,
    paddingTop: 8,
    paddingBottom: 26,
    gap: 10,
  },
  emptyWrap: {
    alignItems: 'center',
    paddingTop: 46,
    gap: 8,
  },
  emptyTitle: {
    fontSize: 16,
    fontWeight: '700',
  },
  emptySubtitle: {
    color: '#888',
    fontSize: 13,
    textAlign: 'center',
    lineHeight: 18,
  },
  card: {
    borderWidth: 1,
    borderRadius: 14,
    overflow: 'hidden',
    flexDirection: 'row',
  },
  creatorStrip: {
    width: 6,
  },
  cardBody: {
    flex: 1,
    paddingVertical: 12,
    paddingHorizontal: 12,
    gap: 8,
  },
  cardTopRow: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'space-between',
    gap: 8,
  },
  cardTitle: {
    fontSize: 15,
    fontWeight: '700',
    flex: 1,
  },
  metaRow: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 8,
    flexWrap: 'wrap',
  },
  typeBadge: {
    borderRadius: 999,
    paddingHorizontal: 10,
    paddingVertical: 4,
  },
  typeBadgeText: {
    color: '#fff',
    fontSize: 11,
    fontWeight: '700',
  },
  creatorText: {
    fontSize: 12,
    color: '#888',
    fontWeight: '600',
  },
  timeText: {
    fontSize: 12,
    color: '#666',
    fontWeight: '500',
  },
  recurrenceText: {
    fontSize: 12,
    color: '#64748b',
    fontWeight: '700',
  },
});
