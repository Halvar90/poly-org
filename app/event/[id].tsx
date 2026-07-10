import { Ionicons } from '@expo/vector-icons';
import { router, useLocalSearchParams } from 'expo-router';
import { useEffect, useMemo, useState } from 'react';
import {
  ActivityIndicator,
  Pressable,
  ScrollView,
  StyleSheet,
  Text,
  View,
} from 'react-native';

import { useColorScheme } from '@/components/useColorScheme';
import Colors from '@/constants/Colors';
import { useAuth } from '@/contexts/AuthProvider';
import { Alert } from '@/lib/alert';
import {
  formatEventSchedule,
  getEntryTypeColorForCreator,
  getRecurrenceLabel,
} from '@/lib/calendarUtils';
import { supabase } from '@/lib/supabase';

type EntryType = 'termin' | 'aufgabe' | 'abwesenheit' | 'erinnerung';

type DetailEvent = {
  id: string;
  title: string;
  description: string | null;
  start_time: string | null;
  end_time: string | null;
  entry_type: EntryType;
  color_code: string;
  creator_id: string;
  creator_username: string;
  recurrence_rule?: 'none' | 'weekly' | 'monthly' | null;
  is_done?: boolean;
};

function getTypeLabel(item: DetailEvent) {
  if (item.entry_type === 'aufgabe' && item.start_time) return 'Erinnerung';
  if (item.entry_type === 'termin') return 'Termin';
  if (item.entry_type === 'aufgabe') return 'Aufgabe';
  return 'Abwesenheit';
}

export default function EventDetailScreen() {
  const params = useLocalSearchParams<{ id?: string | string[] }>();
  const rawId = Array.isArray(params.id) ? params.id[0] : params.id;
  const eventId = useMemo(() => rawId ?? '', [rawId]);

  const colorScheme = useColorScheme() ?? 'light';
  const theme = Colors[colorScheme];
  const { user } = useAuth();

  const [event, setEvent] = useState<DetailEvent | null>(null);
  const [isLoading, setIsLoading] = useState(true);
  const [isDeleting, setIsDeleting] = useState(false);
  const [errorMessage, setErrorMessage] = useState<string | null>(null);
  const recurrenceLabel = getRecurrenceLabel(event?.recurrence_rule);

  useEffect(() => {
    let isMounted = true;

    async function loadEvent() {
      if (!eventId) {
        setErrorMessage('Eintrag wurde nicht gefunden.');
        setIsLoading(false);
        return;
      }

      setIsLoading(true);
      setErrorMessage(null);

      try {
        const { data, error } = await supabase
          .from('events_with_creator')
          .select('*')
          .eq('id', eventId)
          .single();

        if (error) throw error;

        const normalized = {
          ...(data as any),
          entry_type: ((data as any).entry_type ?? (data as any).type ?? 'termin') as EntryType,
        } as DetailEvent;

        if (isMounted) {
          setEvent(normalized);
        }
      } catch (error) {
        const message =
          error instanceof Error ? error.message : 'Details konnten nicht geladen werden.';
        if (isMounted) {
          setErrorMessage(message);
        }
      } finally {
        if (isMounted) {
          setIsLoading(false);
        }
      }
    }

    loadEvent();

    return () => {
      isMounted = false;
    };
  }, [eventId]);

  function confirmDelete() {
    if (!event) return;
    Alert.alert('Eintrag löschen?', 'Dieser Eintrag wird dauerhaft entfernt.', [
      { text: 'Abbrechen', style: 'cancel' },
      { text: 'Löschen', style: 'destructive', onPress: () => void handleDelete() },
    ]);
  }

  async function handleDelete() {
    if (!event) return;
    setIsDeleting(true);

    try {
      const { error } = await supabase.from('events').delete().eq('id', event.id);
      if (error) throw error;
      router.back();
    } catch (error) {
      const message = error instanceof Error ? error.message : 'Eintrag konnte nicht gelöscht werden.';
      setErrorMessage(message);
      setIsDeleting(false);
    }
  }

  if (isLoading) {
    return (
      <View style={[styles.centered, { backgroundColor: theme.background }]}> 
        <ActivityIndicator size="large" color={theme.tint} />
      </View>
    );
  }

  if (!event) {
    return (
      <View style={[styles.centered, { backgroundColor: theme.background }]}> 
        <Text style={[styles.errorText, { color: theme.text }]}>{errorMessage ?? 'Eintrag nicht verfuegbar.'}</Text>
        <Pressable onPress={() => router.back()} style={styles.backLink}>
          <Text style={styles.backLinkText}>Zurueck</Text>
        </Pressable>
      </View>
    );
  }

  return (
    <View style={[styles.container, { backgroundColor: theme.background }]}> 
      <View style={styles.headerRow}>
        <Pressable
          onPress={() => router.back()}
          style={({ pressed }) => [styles.backButton, { opacity: pressed ? 0.75 : 1 }]}
          accessibilityLabel="Zurueck">
          <Ionicons name="chevron-back" size={22} color={theme.text} />
        </Pressable>
        <Text style={[styles.headerTitle, { color: theme.text }]}>Eintragsdetails</Text>
        {event.creator_id === user?.id ? (
          <Pressable
            onPress={confirmDelete}
            disabled={isDeleting}
            style={({ pressed }) => [
              styles.backButton,
              { opacity: pressed || isDeleting ? 0.6 : 1 },
            ]}
            accessibilityLabel="Eintrag löschen">
            {isDeleting ? (
              <ActivityIndicator size="small" color="#d9534f" />
            ) : (
              <Ionicons name="trash-outline" size={20} color="#d9534f" />
            )}
          </Pressable>
        ) : (
          <View style={styles.backButton} />
        )}
      </View>

      <ScrollView contentContainerStyle={styles.scrollContent}>
        <View
          style={[
            styles.card,
            {
              backgroundColor: colorScheme === 'dark' ? '#252540' : '#fff',
              borderColor: colorScheme === 'dark' ? '#3d3d5c' : '#ececf2',
            },
          ]}>
          <View style={[styles.creatorStrip, { backgroundColor: event.color_code }]} />
          <View style={styles.cardBody}>
            <Text style={[styles.title, { color: theme.text }]}>{event.title}</Text>

            <View style={styles.metaRow}>
              <View style={[styles.typeBadge, { backgroundColor: getEntryTypeColorForCreator(event.entry_type, event.color_code) }]}>
                <Text style={styles.typeBadgeText}>{getTypeLabel(event)}</Text>
              </View>
              <Text style={styles.metaText}>von {event.creator_username}</Text>
            </View>

            {event.start_time ? (
              <View style={styles.detailRow}>
                <Ionicons name="time-outline" size={16} color={theme.text} />
                <Text style={[styles.detailText, { color: theme.text }]}>{formatEventSchedule(event)}</Text>
              </View>
            ) : null}

            {recurrenceLabel ? (
              <View style={styles.detailRow}>
                <Ionicons name="repeat-outline" size={16} color={theme.text} />
                <Text style={[styles.detailText, { color: theme.text }]}>{recurrenceLabel}</Text>
              </View>
            ) : null}

            {event.is_done ? (
              <View style={styles.detailRow}>
                <Ionicons name="checkmark-circle-outline" size={16} color="#22c55e" />
                <Text style={[styles.detailText, { color: '#22c55e' }]}>Erledigt</Text>
              </View>
            ) : null}

            <View style={styles.descriptionWrap}>
              <Text style={[styles.descriptionLabel, { color: theme.text }]}>Beschreibung</Text>
              <Text style={[styles.descriptionText, { color: theme.text }]}> 
                {event.description?.trim() ? event.description : 'Keine Beschreibung hinterlegt.'}
              </Text>
            </View>
          </View>
        </View>
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
    paddingHorizontal: 24,
    gap: 12,
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
  headerTitle: {
    flex: 1,
    fontSize: 19,
    fontWeight: '700',
  },
  scrollContent: {
    paddingHorizontal: 16,
    paddingTop: 8,
    paddingBottom: 22,
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
    paddingHorizontal: 12,
    paddingVertical: 12,
    gap: 10,
  },
  title: {
    fontSize: 18,
    fontWeight: '800',
    lineHeight: 24,
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
  metaText: {
    fontSize: 12,
    color: '#888',
    fontWeight: '600',
  },
  detailRow: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 8,
  },
  detailText: {
    fontSize: 14,
    lineHeight: 20,
  },
  descriptionWrap: {
    marginTop: 2,
    gap: 6,
  },
  descriptionLabel: {
    fontSize: 13,
    fontWeight: '700',
  },
  descriptionText: {
    fontSize: 14,
    lineHeight: 21,
    color: '#666',
  },
  errorText: {
    textAlign: 'center',
    fontSize: 14,
  },
  backLink: {
    paddingVertical: 8,
    paddingHorizontal: 14,
    borderRadius: 999,
    backgroundColor: '#2563EB22',
  },
  backLinkText: {
    color: '#2563EB',
    fontWeight: '700',
  },
});
