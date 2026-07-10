import { Ionicons } from '@expo/vector-icons';
import { router, useFocusEffect } from 'expo-router';
import { useCallback, useEffect, useMemo, useRef, useState } from 'react';
import {
  ActivityIndicator,
  FlatList,
  Pressable,
  RefreshControl,
  StyleSheet,
  Text,
  View,
} from 'react-native';
import { Calendar } from 'react-native-calendars';
import { useSafeAreaInsets } from 'react-native-safe-area-context';

import VoiceInputModal from '@/components/VoiceInputModal';
import { useColorScheme } from '@/components/useColorScheme';
import Colors from '@/constants/Colors';
import { useAuth } from '@/contexts/AuthProvider';
import { parseEventFromVoice } from '@/lib/aiProcessing';
import {
  buildMarkedDates,
  filterEventsForDay,
  formatEventSchedule,
  formatSelectedDayLabel,
  getEntryTypeColorForCreator,
  getRecurrenceLabel,
  getTodayDateKey,
  toDateKey,
} from '@/lib/calendarUtils';
import { getEventTypeIcon } from '@/lib/eventIcons';
import { supabase } from '@/lib/supabase';

type EntryType = 'termin' | 'aufgabe' | 'abwesenheit';

type CalendarViewMode = 'day' | 'week' | 'month' | 'upcoming';
type EventFilter = 'all' | 'mine' | 'others';

type EventWithCreator = {
  id: string;
  title: string;
  description: string | null;
  start_time: string | null;
  end_time: string | null;
  entry_type: EntryType;
  creator_id: string;
  color_code: string;
  recurrence_rule?: 'none' | 'weekly' | 'monthly' | null;
  is_ai_suggested?: boolean;
  is_done?: boolean;
  creator_username: string;
};

export { getEventTypeIcon };

function getEntryTypeLabel(type: EntryType) {
  return type === 'termin' ? 'Termin' : type === 'aufgabe' ? 'Aufgabe' : 'Abwesenheit';
}

function getWeekDayLabels(baseDate: string) {
  const date = new Date(baseDate);
  const day = date.getDay();
  const mondayOffset = day === 0 ? -6 : 1 - day;
  const monday = new Date(date);
  monday.setDate(date.getDate() + mondayOffset);

  return Array.from({ length: 7 }, (_, index) => {
    const weekDate = new Date(monday);
    weekDate.setDate(monday.getDate() + index);
    return {
      dateString: weekDate.toISOString().slice(0, 10),
      label: weekDate.toLocaleDateString('de-DE', { weekday: 'short', day: 'numeric' }),
    };
  });
}

function getMonthVisibleRange(baseDate: string) {
  const [year, month] = baseDate.split('-').map(Number);
  const firstDayOfMonth = new Date(year, month - 1, 1);
  const lastDayOfMonth = new Date(year, month, 0);

  const rangeStart = new Date(firstDayOfMonth);
  rangeStart.setDate(firstDayOfMonth.getDate() - firstDayOfMonth.getDay());
  rangeStart.setHours(0, 0, 0, 0);

  const rangeEnd = new Date(lastDayOfMonth);
  rangeEnd.setDate(lastDayOfMonth.getDate() + (6 - lastDayOfMonth.getDay()));
  rangeEnd.setHours(0, 0, 0, 0);

  return {
    startDate: toDateKey(rangeStart),
    endDate: toDateKey(rangeEnd),
  };
}

export default function KalenderScreen() {
  const colorScheme = useColorScheme() ?? 'light';
  const theme = Colors[colorScheme];
  const insets = useSafeAreaInsets();
  const { profile, user } = useAuth();

  const [events, setEvents] = useState<EventWithCreator[]>([]);
  const [selectedDate, setSelectedDate] = useState(getTodayDateKey());
  const [calendarView, setCalendarView] = useState<CalendarViewMode>('month');
  const [isLoading, setIsLoading] = useState(true);
  const [isRefreshing, setIsRefreshing] = useState(false);
  const [errorMessage, setErrorMessage] = useState<string | null>(null);
  const [eventFilter, setEventFilter] = useState<EventFilter>('all');
  const [showVoiceModal, setShowVoiceModal] = useState(false);
  const [isParsing, setIsParsing] = useState(false);
  const hasAppliedViewPreference = useRef(false);

  const profileColor = profile?.color_code ?? theme.tint;
  const profileName = profile?.username ?? 'Willkommen';

  useEffect(() => {
    if (!hasAppliedViewPreference.current && profile?.calendar_view_preference) {
      setCalendarView(profile.calendar_view_preference);
      hasAppliedViewPreference.current = true;
    }
  }, [profile?.calendar_view_preference]);

  function handleViewChange(nextView: CalendarViewMode) {
    setCalendarView(nextView);
    hasAppliedViewPreference.current = true;
    if (user?.id) {
      void supabase
        .from('profiles')
        .update({ calendar_view_preference: nextView })
        .eq('id', user.id);
    }
  }

  const calendarEvents = useMemo(
    () => events.filter((event) => event.start_time !== null),
    [events],
  );

  const filteredCalendarEvents = useMemo(() => {
    if (!profile?.id) return calendarEvents;

    return calendarEvents.filter((event) => {
      if (eventFilter === 'mine') {
        return event.creator_id === profile.id;
      }
      if (eventFilter === 'others') {
        return event.creator_id !== profile.id;
      }
      return true;
    });
  }, [calendarEvents, eventFilter, profile?.id]);

  const selectedDayEvents = useMemo(
    () => filterEventsForDay(filteredCalendarEvents, selectedDate),
    [filteredCalendarEvents, selectedDate],
  );

  const weekDays = useMemo(() => getWeekDayLabels(selectedDate), [selectedDate]);
  const monthVisibleRange = useMemo(() => getMonthVisibleRange(selectedDate), [selectedDate]);

  const upcomingEvents = useMemo(
    () =>
      filteredCalendarEvents
        .filter(
          (event) =>
            event.start_time !== null &&
            (event.entry_type === 'termin' || event.entry_type === 'aufgabe') &&
            new Date(event.start_time).getTime() >= Date.now(),
        )
        .slice()
        .sort((a, b) => new Date(a.start_time!).getTime() - new Date(b.start_time!).getTime()),
    [filteredCalendarEvents],
  );

  const markedDates = useMemo(
    () =>
      buildMarkedDates(
        filteredCalendarEvents,
        selectedDate,
        colorScheme === 'dark' ? '#374151' : '#D1D5DB',
        monthVisibleRange,
      ),
    [filteredCalendarEvents, selectedDate, colorScheme, monthVisibleRange],
  );

  const weekDotsByDate = useMemo(() => {
    const dots: Record<string, string[]> = {};

    for (const day of weekDays) {
      const dayDots = markedDates[day.dateString]?.dots ?? [];
      dots[day.dateString] = dayDots.map((dot) => dot.color).slice(0, 4);
    }

    return dots;
  }, [markedDates, weekDays]);

  const otherCreators = useMemo(() => {
    const byCreator = new Map<string, { id: string; username: string; colorCode: string }>();

    for (const event of events) {
      if (profile?.id && event.creator_id === profile.id) {
        continue;
      }

      if (!byCreator.has(event.creator_id)) {
        byCreator.set(event.creator_id, {
          id: event.creator_id,
          username: event.creator_username || 'Unbekannt',
          colorCode: event.color_code,
        });
      }
    }

    return Array.from(byCreator.values()).sort((a, b) => a.username.localeCompare(b.username, 'de-DE'));
  }, [events, profile?.id]);

  const loadEvents = useCallback(async (isPullRefresh = false) => {
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

      const eventsWithEntryType = (data as any[] ?? []).map((event) => {
        if (event.entry_type) return event;
        if (event.type) return { ...event, entry_type: event.type };
        return event;
      });

      setEvents(eventsWithEntryType as EventWithCreator[]);
    } catch (error) {
      const message =
        error instanceof Error ? error.message : 'Termine konnten nicht geladen werden.';
      setErrorMessage(message);
    } finally {
      setIsLoading(false);
      setIsRefreshing(false);
    }
  }, []);

  useFocusEffect(
    useCallback(() => {
      loadEvents();
    }, [loadEvents]),
  );

  function renderEventCard({ item }: { item: EventWithCreator }) {
    const entryTypeLabel = getEntryTypeLabel(item.entry_type);
    const entryTypeColor = getEntryTypeColorForCreator(item.entry_type, item.color_code);
    const recurrenceLabel = getRecurrenceLabel(item.recurrence_rule);

    return (
      <Pressable
        onPress={() => router.push({ pathname: '/event/[id]', params: { id: item.id } })}
        style={({ pressed }) => [
          styles.dayModeCard,
          {
            opacity: pressed ? 0.82 : item.is_done ? 0.62 : 1,
            backgroundColor: colorScheme === 'dark' ? '#252540' : '#fff',
            borderColor: colorScheme === 'dark' ? '#3d3d5c' : '#ececf2',
          },
        ]}>
        <View style={[styles.dayModeCreatorStrip, { backgroundColor: item.color_code }]} />
        <View style={styles.dayModeCardBody}>
          <View style={styles.dayModeCardTopRow}>
            <Text style={[styles.dayModeCardTitle, { color: theme.text }]} numberOfLines={2}>
              {item.title}
            </Text>
            <Ionicons name="chevron-forward" size={18} color={theme.text} />
          </View>

          <View style={styles.dayModeMetaRow}>
            <View style={[styles.typeBadge, { backgroundColor: entryTypeColor }]}> 
              <Text style={styles.typeBadgeText}>{entryTypeLabel}</Text>
            </View>
            <Text style={styles.dayModeCreatorText}>von {item.creator_username}</Text>
          </View>

          {item.start_time ? (
            <Text style={styles.dayModeTimeText}>{formatEventSchedule(item)}</Text>
          ) : null}

          {recurrenceLabel ? <Text style={styles.dayModeRepeatText}>{recurrenceLabel}</Text> : null}
        </View>
      </Pressable>
    );
  }

  function renderListHeader() {
    return (
      <View style={styles.dayListHeader}>
        <Text style={[styles.dayListTitle, { color: theme.text }]}>
          {formatSelectedDayLabel(selectedDate)}
        </Text>
        <Text style={styles.dayListCount}>
          {selectedDayEvents.length === 0
            ? 'Keine Termine'
            : `${selectedDayEvents.length} ${selectedDayEvents.length === 1 ? 'Eintrag' : 'Einträge'}`}
        </Text>
      </View>
    );
  }

  function renderEmptyDayState() {
    return (
      <View style={styles.emptyDayState}>
        <Ionicons name="leaf-outline" size={36} color={theme.tint} />
        <Text style={[styles.emptyDayTitle, { color: theme.text }]}>
          Keine Termine an diesem Tag
        </Text>
        <Text style={styles.emptyDaySubtitle}>Zeit zum Entspannen!</Text>
      </View>
    );
  }

  if (isLoading && events.length === 0) {
    return (
      <View style={[styles.centered, { backgroundColor: theme.background }]}>
        <ActivityIndicator size="large" color={theme.tint} />
      </View>
    );
  }

  return (
    <View style={[styles.container, { backgroundColor: theme.background }]}>
      <View style={styles.topSection}>
        <View style={styles.header}>
          <View style={[styles.avatarRing, { borderColor: profileColor }]}>
            <View style={[styles.avatarPlaceholder, { backgroundColor: `${profileColor}22` }]}> 
              <Text style={[styles.avatarInitial, { color: profileColor }]}>
                {(profileName?.trim()?.charAt(0) || '?').toUpperCase()}
              </Text>
            </View>
          </View>

          <View style={styles.headerTextBlock}>
            <Text style={[styles.headerTitle, { color: theme.text }]}>{profileName}</Text>
            <Text style={styles.headerSubtitle}>Euer Shared Life Kalender</Text>
          </View>
        </View>

        {errorMessage ? (
          <View style={styles.errorBanner}>
            <Text style={styles.errorText}>{errorMessage}</Text>
          </View>
        ) : null}

        <View style={styles.legendWrap}>
          <View style={styles.legendItem}>
            <View style={[styles.legendSwatch, { backgroundColor: getEntryTypeColorForCreator('termin', profileColor) }]} />
            <Text style={[styles.legendText, { color: theme.text }]}>Termin</Text>
          </View>
          <View style={styles.legendItem}>
            <View style={[styles.legendSwatch, { backgroundColor: getEntryTypeColorForCreator('aufgabe', profileColor) }]} />
            <Text style={[styles.legendText, { color: theme.text }]}>Aufgabe</Text>
          </View>
          <View style={styles.legendItem}>
            <View style={[styles.legendSwatch, { backgroundColor: getEntryTypeColorForCreator('abwesenheit', profileColor) }]} />
            <Text style={[styles.legendText, { color: theme.text }]}>Abwesenheit</Text>
          </View>
        </View>

        <View
          style={[
            styles.creatorLegendWrap,
            {
              backgroundColor: colorScheme === 'dark' ? '#252540' : '#f8f8fc',
              borderColor: colorScheme === 'dark' ? '#3d3d5c' : '#d0d0d8',
            },
          ]}>
          <Text style={[styles.creatorLegendTitle, { color: theme.text }]}>Weitere Nutzer</Text>
          {otherCreators.length === 0 ? (
            <Text style={styles.creatorLegendEmpty}>Noch keine weiteren Nutzer sichtbar.</Text>
          ) : (
            <View style={styles.creatorLegendList}>
              {otherCreators.map((creator) => (
                <View key={creator.id} style={styles.creatorLegendItem}>
                  <View style={[styles.creatorLegendAvatarRing, { borderColor: creator.colorCode }]}>
                    <View style={[styles.creatorLegendAvatarFallback, { backgroundColor: creator.colorCode }]} />
                  </View>
                  <Text style={[styles.creatorLegendName, { color: theme.text }]} numberOfLines={1}>
                    {creator.username}
                  </Text>
                </View>
              ))}
            </View>
          )}
        </View>

        <View style={styles.filterRow}>
          {([
            { key: 'all', label: 'Alle' },
            { key: 'mine', label: 'Meine' },
            { key: 'others', label: 'Andere' },
          ] as const).map((filter) => {
            const isSelected = eventFilter === filter.key;
            return (
              <Pressable
                key={filter.key}
                onPress={() => setEventFilter(filter.key)}
                style={({ pressed }) => [
                  styles.filterChip,
                  isSelected && styles.filterChipSelected,
                  {
                    opacity: pressed ? 0.8 : 1,
                    borderColor: isSelected ? profileColor : colorScheme === 'dark' ? '#3d3d5c' : '#e0e0e8',
                    backgroundColor: isSelected ? `${profileColor}22` : colorScheme === 'dark' ? '#252540' : '#fff',
                  },
                ]}>
                <Text style={[
                  styles.filterChipText,
                  isSelected && styles.filterChipTextSelected,
                  { color: isSelected ? profileColor : theme.text },
                ]}>
                  {filter.label}
                </Text>
              </Pressable>
            );
          })}
        </View>

        <View style={styles.viewSwitcherRow}>
          {([
            { key: 'month', icon: 'grid-outline', label: 'Monat' },
            { key: 'week', icon: 'calendar-clear-outline', label: 'Woche' },
            { key: 'day', icon: 'today-outline', label: 'Tag' },
            { key: 'upcoming', icon: 'time-outline', label: 'Zukunft' },
          ] as const).map((viewMode) => {
            const isSelected = calendarView === viewMode.key;
            return (
              <Pressable
                key={viewMode.key}
                onPress={() => handleViewChange(viewMode.key)}
                style={({ pressed }) => [
                  styles.viewSwitcherButton,
                  {
                    opacity: pressed ? 0.82 : 1,
                    borderColor: isSelected ? profileColor : colorScheme === 'dark' ? '#3d3d5c' : '#e0e0e8',
                    backgroundColor: isSelected ? `${profileColor}20` : colorScheme === 'dark' ? '#252540' : '#fff',
                  },
                ]}>
                <Ionicons
                  name={viewMode.icon}
                  size={18}
                  color={isSelected ? profileColor : theme.text}
                />
                <Text
                  style={[
                    styles.viewSwitcherText,
                    { color: isSelected ? profileColor : theme.text },
                  ]}>
                  {viewMode.label}
                </Text>
              </Pressable>
            );
          })}
        </View>

        {calendarView === 'month' && (
          <Calendar
            current={selectedDate}
            onDayPress={(day) => {
              setSelectedDate(day.dateString);
              router.push({ pathname: '/day/[date]', params: { date: day.dateString } });
            }}
            markedDates={markedDates}
            markingType="multi-dot"
            firstDay={1}
            enableSwipeMonths
            theme={{
              backgroundColor: theme.background,
              calendarBackground: colorScheme === 'dark' ? '#252540' : '#fff',
              textSectionTitleColor: theme.text,
              selectedDayBackgroundColor: profileColor,
              selectedDayTextColor: '#ffffff',
              todayTextColor: profileColor,
              dayTextColor: theme.text,
              textDisabledColor: colorScheme === 'dark' ? '#555' : '#d0d0d8',
              arrowColor: profileColor,
              monthTextColor: theme.text,
              textDayFontWeight: '500',
              textMonthFontWeight: '700',
              textDayHeaderFontWeight: '600',
            }}
            style={[
              styles.calendar,
              {
                borderColor: colorScheme === 'dark' ? '#3d3d5c' : '#ececf2',
              },
            ]}
          />
        )}
        {calendarView === 'week' && (
          <View style={styles.weekRow}>
            {weekDays.map((day) => {
              const isSelected = day.dateString === selectedDate;
              return (
                <Pressable
                  key={day.dateString}
                  onPress={() => {
                    setSelectedDate(day.dateString);
                    router.push({ pathname: '/day/[date]', params: { date: day.dateString } });
                  }}
                  style={({ pressed }) => [
                    styles.weekDayChip,
                    isSelected && styles.weekDayChipActive,
                    {
                      opacity: pressed ? 0.8 : 1,
                      backgroundColor: isSelected ? `${profileColor}22` : colorScheme === 'dark' ? '#252540' : '#fff',
                      borderColor: isSelected ? profileColor : colorScheme === 'dark' ? '#3d3d5c' : '#ececf2',
                    },
                  ]}>
                  <Text style={[
                    styles.weekDayLabel,
                    { color: isSelected ? profileColor : theme.text },
                  ]}>
                    {day.label}
                  </Text>
                  <View style={styles.weekDotRow}>
                    {weekDotsByDate[day.dateString]?.map((dotColor, index) => (
                      <View
                        key={`${day.dateString}-${dotColor}-${index}`}
                        style={[styles.weekDot, { backgroundColor: dotColor }]}
                      />
                    ))}
                  </View>
                </Pressable>
              );
            })}
          </View>
        )}
        {calendarView === 'day' && (
          <View style={styles.dayHeader}>
            <Text style={[styles.dayHeaderLabel, { color: theme.text }]}>Tagansicht</Text>
            <Text style={[styles.dayHeaderDate, { color: theme.text }]}>
              {formatSelectedDayLabel(selectedDate)}
            </Text>
          </View>
        )}
      </View>

      {(calendarView === 'day' || calendarView === 'upcoming') ? (
        <FlatList
          data={calendarView === 'day' ? selectedDayEvents : upcomingEvents}
          keyExtractor={(item) => item.id}
          renderItem={renderEventCard}
          ListHeaderComponent={
            calendarView === 'upcoming' ? (
              <View style={styles.dayListHeader}>
                <Text style={[styles.dayListTitle, { color: theme.text }]}> 
                  Zukuenftige Termine und Aufgaben
                </Text>
                <Text style={styles.dayListCount}>
                  {upcomingEvents.length === 0
                    ? 'Keine Eintraege'
                    : `${upcomingEvents.length} ${upcomingEvents.length === 1 ? 'Eintrag' : 'Eintraege'}`}
                </Text>
              </View>
            ) : (
              renderListHeader()
            )
          }
          ListEmptyComponent={
            calendarView === 'upcoming' ? (
              <View style={styles.emptyDayState}>
                <Ionicons name="hourglass-outline" size={36} color={theme.tint} />
                <Text style={[styles.emptyDayTitle, { color: theme.text }]}> 
                  Keine zukuenftigen Termine oder Aufgaben
                </Text>
                <Text style={styles.emptyDaySubtitle}>Alles ist eingeplant.</Text>
              </View>
            ) : (
              renderEmptyDayState()
            )
          }
          contentContainerStyle={styles.dayListContent}
          showsVerticalScrollIndicator={false}
          refreshControl={
            <RefreshControl
              refreshing={isRefreshing}
              onRefresh={() => loadEvents(true)}
              tintColor={theme.tint}
              colors={[theme.tint]}
            />
          }
        />
      ) : (
        <View style={styles.navigationHintWrap}>
          <Text style={[styles.navigationHintText, { color: theme.text }]}> 
            Tippe auf ein Datum, um die Tagesuebersicht mit Eintraegen zu oeffnen.
          </Text>
        </View>
      )}

      <Pressable
        style={({ pressed }) => [
          styles.fabMic,
          {
            backgroundColor: colorScheme === 'dark' ? '#252540' : '#fff',
            borderColor: profileColor,
            bottom: insets.bottom + 86,
            opacity: pressed ? 0.88 : 1,
          },
        ]}
        onPress={() => setShowVoiceModal(true)}
        accessibilityLabel="Termin per Sprache erstellen">
        <Ionicons name="mic-outline" size={22} color={profileColor} />
      </Pressable>

      <Pressable
        style={({ pressed }) => [
          styles.fab,
          {
            backgroundColor: profileColor,
            bottom: insets.bottom + 16,
            opacity: pressed ? 0.88 : 1,
          },
        ]}
        onPress={() => router.push('/add-event')}
        accessibilityLabel="Neuen Termin erstellen">
        <Ionicons name="add" size={30} color="#fff" />
      </Pressable>

      {isParsing ? (
        <View style={styles.parsingOverlay}>
          <ActivityIndicator size="large" color={profileColor} />
          <Text style={[styles.parsingText, { color: theme.text }]}>Analysiere …</Text>
        </View>
      ) : null}

      <VoiceInputModal
        visible={showVoiceModal}
        title="Neuer Termin"
        placeholder="Termin beschreiben oder sprechen …"
        profileColor={profileColor}
        onClose={() => setShowVoiceModal(false)}
        onConfirm={(text) => {
          setShowVoiceModal(false);
          setIsParsing(true);
          void parseEventFromVoice(text).then((parsed) => {
            router.push({
              pathname: '/add-event',
              params: {
                initialTitle: parsed.title,
                initialDate: parsed.date ?? '',
                initialTime: parsed.time ?? '',
                entryType: parsed.entryType ?? 'termin',
                initialAssigneeName: parsed.assigneeName ?? '',
              },
            });
          }).finally(() => setIsParsing(false));
        }}
      />
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
  topSection: {
    paddingHorizontal: 16,
    paddingTop: 4,
    paddingBottom: 8,
  },
  header: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 12,
    marginBottom: 12,
  },
  headerTextBlock: {
    flex: 1,
  },
  headerTitle: {
    fontSize: 20,
    fontWeight: '700',
  },
  headerSubtitle: {
    fontSize: 13,
    color: '#888',
    marginTop: 2,
  },
  avatarRing: {
    width: 48,
    height: 48,
    borderRadius: 24,
    borderWidth: 2,
    padding: 2,
    alignItems: 'center',
    justifyContent: 'center',
  },
  avatarPlaceholder: {
    width: 42,
    height: 42,
    borderRadius: 21,
    alignItems: 'center',
    justifyContent: 'center',
  },
  avatarInitial: {
    fontSize: 16,
    fontWeight: '800',
  },
  errorBanner: {
    backgroundColor: '#fdecea',
    borderRadius: 12,
    padding: 10,
    marginBottom: 8,
  },
  errorText: {
    color: '#c0392b',
    fontSize: 13,
  },
  calendar: {
    borderRadius: 16,
    borderWidth: 1,
    overflow: 'hidden',
    paddingBottom: 8,
  },
  dayListContent: {
    paddingHorizontal: 16,
    paddingBottom: 100,
    flexGrow: 1,
  },
  dayListHeader: {
    flexDirection: 'row',
    alignItems: 'baseline',
    justifyContent: 'space-between',
    paddingTop: 4,
    paddingBottom: 12,
    gap: 8,
  },
  dayListTitle: {
    flex: 1,
    fontSize: 16,
    fontWeight: '700',
  },
  dayListCount: {
    fontSize: 13,
    color: '#888',
    fontWeight: '500',
  },
  dayModeCard: {
    borderWidth: 1,
    borderRadius: 14,
    overflow: 'hidden',
    flexDirection: 'row',
    marginBottom: 10,
  },
  dayModeCreatorStrip: {
    width: 6,
  },
  dayModeCardBody: {
    flex: 1,
    paddingVertical: 12,
    paddingHorizontal: 12,
    gap: 8,
  },
  dayModeCardTopRow: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'space-between',
    gap: 8,
  },
  dayModeCardTitle: {
    fontSize: 15,
    fontWeight: '700',
    flex: 1,
  },
  dayModeMetaRow: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 8,
    flexWrap: 'wrap',
  },
  dayModeCreatorText: {
    fontSize: 12,
    color: '#888',
    fontWeight: '600',
  },
  dayModeTimeText: {
    fontSize: 12,
    color: '#666',
    fontWeight: '500',
  },
  dayModeRepeatText: {
    fontSize: 12,
    color: '#64748b',
    fontWeight: '700',
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
  legendWrap: {
    flexDirection: 'row',
    gap: 10,
    flexWrap: 'wrap',
    justifyContent: 'space-between',
    marginBottom: 14,
  },
  legendItem: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 8,
    flexBasis: '48%',
  },
  legendSwatch: {
    width: 14,
    height: 14,
    borderRadius: 4,
  },
  legendText: {
    fontSize: 13,
    fontWeight: '600',
  },
  creatorLegendWrap: {
    borderRadius: 12,
    borderWidth: 1,
    borderColor: '#d0d0d8',
    backgroundColor: '#f8f8fc',
    padding: 10,
    marginBottom: 12,
  },
  creatorLegendTitle: {
    fontSize: 13,
    fontWeight: '700',
    marginBottom: 8,
  },
  creatorLegendEmpty: {
    fontSize: 12,
    color: '#888',
  },
  creatorLegendList: {
    gap: 8,
  },
  creatorLegendItem: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 8,
  },
  creatorLegendAvatarRing: {
    width: 28,
    height: 28,
    borderRadius: 14,
    borderWidth: 1.5,
    alignItems: 'center',
    justifyContent: 'center',
  },
  creatorLegendAvatarFallback: {
    width: 14,
    height: 14,
    borderRadius: 7,
  },
  creatorLegendName: {
    flex: 1,
    fontSize: 13,
    fontWeight: '600',
  },
  filterRow: {
    flexDirection: 'row',
    gap: 10,
    flexWrap: 'wrap',
    marginBottom: 12,
  },
  filterChip: {
    paddingHorizontal: 14,
    paddingVertical: 10,
    borderWidth: 1.5,
    borderRadius: 999,
  },
  filterChipSelected: {
    borderWidth: 2,
  },
  filterChipText: {
    fontSize: 13,
    fontWeight: '600',
  },
  filterChipTextSelected: {
    fontWeight: '700',
  },
  viewSwitcherRow: {
    flexDirection: 'row',
    flexWrap: 'wrap',
    gap: 8,
    marginBottom: 12,
  },
  viewSwitcherButton: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 6,
    borderRadius: 999,
    borderWidth: 1.5,
    paddingVertical: 8,
    paddingHorizontal: 10,
  },
  viewSwitcherText: {
    fontSize: 12,
    fontWeight: '700',
  },
  weekRow: {
    flexDirection: 'row',
    justifyContent: 'space-between',
    marginBottom: 12,
    gap: 8,
  },
  weekDayChip: {
    flex: 1,
    paddingVertical: 10,
    paddingHorizontal: 8,
    borderRadius: 12,
    borderWidth: 1.5,
    alignItems: 'center',
    justifyContent: 'center',
  },
  weekDayChipActive: {
    borderWidth: 2,
  },
  weekDayLabel: {
    fontSize: 13,
    fontWeight: '700',
  },
  weekDotRow: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'center',
    gap: 4,
    marginTop: 6,
    minHeight: 8,
  },
  weekDot: {
    width: 6,
    height: 6,
    borderRadius: 3,
  },
  dayHeader: {
    paddingVertical: 12,
    paddingHorizontal: 14,
    borderRadius: 16,
    borderWidth: 1,
    borderColor: '#d0d0d8',
    marginBottom: 12,
  },
  dayHeaderLabel: {
    fontSize: 15,
    fontWeight: '700',
    marginBottom: 4,
  },
  dayHeaderDate: {
    fontSize: 14,
    color: '#666',
  },
  emptyDayState: {
    alignItems: 'center',
    paddingTop: 24,
    paddingBottom: 32,
    gap: 8,
  },
  emptyDayTitle: {
    fontSize: 16,
    fontWeight: '600',
    textAlign: 'center',
  },
  emptyDaySubtitle: {
    fontSize: 14,
    color: '#888',
    textAlign: 'center',
  },
  navigationHintWrap: {
    paddingHorizontal: 16,
    paddingTop: 8,
    paddingBottom: 92,
  },
  navigationHintText: {
    fontSize: 13,
    lineHeight: 18,
    textAlign: 'center',
    color: '#888',
  },
  fab: {
    position: 'absolute',
    right: 20,
    width: 58,
    height: 58,
    borderRadius: 29,
    alignItems: 'center',
    justifyContent: 'center',
    shadowColor: '#000',
    shadowOffset: { width: 0, height: 4 },
    shadowOpacity: 0.2,
    shadowRadius: 8,
    elevation: 6,
  },
  fabMic: {
    position: 'absolute',
    right: 20,
    width: 46,
    height: 46,
    borderRadius: 23,
    alignItems: 'center',
    justifyContent: 'center',
    borderWidth: 2,
    shadowColor: '#000',
    shadowOffset: { width: 0, height: 3 },
    shadowOpacity: 0.15,
    shadowRadius: 6,
    elevation: 5,
  },
  parsingOverlay: {
    ...StyleSheet.absoluteFillObject,
    backgroundColor: 'rgba(0,0,0,0.45)',
    alignItems: 'center',
    justifyContent: 'center',
    zIndex: 99,
    gap: 12,
  },
  parsingText: {
    fontSize: 16,
    fontWeight: '600',
  },
});
