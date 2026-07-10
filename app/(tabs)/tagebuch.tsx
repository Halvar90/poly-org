import { Ionicons } from '@expo/vector-icons';
import { router, useFocusEffect } from 'expo-router';
import { useCallback, useState } from 'react';
import {
  ActivityIndicator,
  FlatList,
  Pressable,
  RefreshControl,
  StyleSheet,
  Text,
  View,
} from 'react-native';
import { useSafeAreaInsets } from 'react-native-safe-area-context';

import VoiceInputModal from '@/components/VoiceInputModal';
import { useColorScheme } from '@/components/useColorScheme';
import Colors from '@/constants/Colors';
import { useAuth } from '@/contexts/AuthProvider';
import { correctDiaryText, generateDiarySummary } from '@/lib/aiProcessing';
import { supabase } from '@/lib/supabase';

type DiaryEntry = {
  id: string;
  content: string;
  entry_date: string;
  created_at: string;
};

type DayGroup = {
  date: string;
  entries: DiaryEntry[];
};

export default function TagebuchScreen() {
  const colorScheme = useColorScheme() ?? 'light';
  const theme = Colors[colorScheme];
  const { profile, user } = useAuth();
  const insets = useSafeAreaInsets();

  const [dayGroups, setDayGroups] = useState<DayGroup[]>([]);
  const [isLoading, setIsLoading] = useState(true);
  const [isRefreshing, setIsRefreshing] = useState(false);
  const [errorMessage, setErrorMessage] = useState<string | null>(null);
  const [showVoiceModal, setShowVoiceModal] = useState(false);
  const [summaries, setSummaries] = useState<Record<string, string>>({});

  const profileColor = profile?.color_code ?? theme.tint;

  const loadEntries = useCallback(async (isPullRefresh = false) => {
    if (isPullRefresh) setIsRefreshing(true);
    else setIsLoading(true);
    setErrorMessage(null);

    try {
      const { data, error } = await supabase
        .from('diary_entries')
        .select('*')
        .order('entry_date', { ascending: false })
        .order('created_at', { ascending: true });

      if (error) throw error;

      const entries = (data as DiaryEntry[]) ?? [];
      const grouped: Record<string, DiaryEntry[]> = {};
      for (const entry of entries) {
        if (!grouped[entry.entry_date]) grouped[entry.entry_date] = [];
        grouped[entry.entry_date].push(entry);
      }

      const groups = Object.entries(grouped).map(([date, ents]) => ({ date, entries: ents }));
      setDayGroups(groups);

      void (async () => {
        const newSummaries: Record<string, string> = {};
        await Promise.all(
          groups.map(async (group) => {
            const texts = group.entries.map((e) => e.content);
            newSummaries[group.date] = await generateDiarySummary(texts);
          }),
        );
        setSummaries(newSummaries);
      })();
    } catch (err) {
      setErrorMessage(
        err instanceof Error ? err.message : 'Einträge konnten nicht geladen werden.',
      );
    } finally {
      setIsLoading(false);
      setIsRefreshing(false);
    }
  }, []);

  useFocusEffect(
    useCallback(() => {
      void loadEntries();
    }, [loadEntries]),
  );

  async function handleAddEntry(text: string) {
    if (!user?.id) return;

    try {
      const now = new Date();
      const today = `${now.getFullYear()}-${String(now.getMonth() + 1).padStart(2, '0')}-${String(now.getDate()).padStart(2, '0')}`;
      const { error } = await supabase.from('diary_entries').insert({
        user_id: user.id,
        content: text,
        entry_date: today,
      });
      if (error) throw error;
      setShowVoiceModal(false);
      await loadEntries();
    } catch (err) {
      setErrorMessage(
        err instanceof Error ? err.message : 'Eintrag konnte nicht gespeichert werden.',
      );
    }
  }

  function formatDate(dateStr: string) {
    const d = new Date(dateStr + 'T00:00:00');
    return d.toLocaleDateString('de-DE', {
      weekday: 'long',
      day: 'numeric',
      month: 'long',
      year: 'numeric',
    });
  }

  function renderDayGroup({ item }: { item: DayGroup }) {
    const summary = summaries[item.date];
    return (
      <Pressable
        onPress={() =>
          // eslint-disable-next-line @typescript-eslint/no-explicit-any
          router.push({ pathname: '/tagebuch/[date]' as any, params: { date: item.date } })
        }
        style={({ pressed }) => [
          styles.dayCard,
          {
            backgroundColor: colorScheme === 'dark' ? '#252540' : '#fff',
            borderColor: colorScheme === 'dark' ? '#3d3d5c' : '#ececf2',
            opacity: pressed ? 0.85 : 1,
          },
        ]}>
        <View style={[styles.dateStrip, { backgroundColor: profileColor }]} />
        <View style={styles.dayCardBody}>
          <View style={styles.dayCardHeader}>
            <Text style={[styles.dateLabel, { color: profileColor }]} numberOfLines={1}>
              {formatDate(item.date)}
            </Text>
            <Ionicons name="chevron-forward" size={16} color={theme.text} opacity={0.4} />
          </View>
          {summary ? (
            <Text style={[styles.summaryText, { color: theme.text }]} numberOfLines={4}>
              {summary}
            </Text>
          ) : (
            <ActivityIndicator size="small" color={profileColor} style={{ alignSelf: 'flex-start' }} />
          )}
          <Text style={styles.entryCount}>
            {item.entries.length} {item.entries.length === 1 ? 'Eintrag' : 'Einträge'}
          </Text>
        </View>
      </Pressable>
    );
  }

  return (
    <View style={[styles.container, { backgroundColor: theme.background }]}>
      <Text style={[styles.title, { color: theme.text }]}>Tagebuch</Text>
      <Text style={[styles.subtitle, { color: theme.text }]}>
        Deine privaten Einträge – nur für dich sichtbar.
      </Text>

      {errorMessage ? <Text style={styles.errorText}>{errorMessage}</Text> : null}

      {isLoading ? (
        <View style={styles.centerLoader}>
          <ActivityIndicator size="large" color={profileColor} />
        </View>
      ) : (
        <FlatList
          data={dayGroups}
          keyExtractor={(item) => item.date}
          renderItem={renderDayGroup}
          contentContainerStyle={styles.listContent}
          refreshControl={
            <RefreshControl
              refreshing={isRefreshing}
              onRefresh={() => void loadEntries(true)}
              tintColor={profileColor}
            />
          }
          ListEmptyComponent={
            <View style={styles.emptyState}>
              <Ionicons name="book-outline" size={52} color={profileColor} opacity={0.6} />
              <Text style={[styles.emptyTitle, { color: theme.text }]}>Noch keine Einträge</Text>
              <Text style={styles.emptySubtitle}>
                Tippe auf das + und schreib oder sprich deinen ersten Eintrag.
              </Text>
            </View>
          }
        />
      )}

      <Pressable
        style={({ pressed }) => [
          styles.fab,
          {
            backgroundColor: profileColor,
            bottom: insets.bottom + 16,
            opacity: pressed ? 0.88 : 1,
          },
        ]}
        onPress={() => setShowVoiceModal(true)}
        accessibilityLabel="Neuen Tagebucheintrag hinzufügen">
        <Ionicons name="add" size={30} color="#fff" />
      </Pressable>

      <VoiceInputModal
        visible={showVoiceModal}
        title="Tagebucheintrag"
        placeholder="Was liegt dir auf dem Herzen? Schreib oder sprich …"
        profileColor={profileColor}
        onClose={() => setShowVoiceModal(false)}
        onConfirm={(text) => void handleAddEntry(text)}
        processTranscription={correctDiaryText}
      />
    </View>
  );
}

const styles = StyleSheet.create({
  container: {
    flex: 1,
    paddingHorizontal: 20,
    paddingTop: 8,
  },
  title: {
    fontSize: 28,
    fontWeight: '700',
    marginBottom: 6,
  },
  subtitle: {
    fontSize: 14,
    color: '#777',
    marginBottom: 16,
  },
  errorText: {
    color: '#d9534f',
    fontSize: 13,
    marginBottom: 8,
  },
  centerLoader: {
    flex: 1,
    alignItems: 'center',
    justifyContent: 'center',
  },
  listContent: {
    paddingBottom: 110,
    gap: 12,
  },
  dayCard: {
    borderWidth: 1,
    borderRadius: 16,
    overflow: 'hidden',
    flexDirection: 'row',
    shadowColor: '#000',
    shadowOpacity: 0.05,
    shadowRadius: 8,
    elevation: 2,
  },
  dateStrip: {
    width: 6,
  },
  dayCardBody: {
    flex: 1,
    padding: 14,
    gap: 6,
  },
  dayCardHeader: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'space-between',
  },
  dateLabel: {
    fontSize: 14,
    fontWeight: '700',
    flex: 1,
  },
  summaryText: {
    fontSize: 14,
    lineHeight: 20,
  },
  entryCount: {
    fontSize: 12,
    color: '#888',
    fontWeight: '600',
  },
  emptyState: {
    alignItems: 'center',
    paddingTop: 60,
    gap: 10,
  },
  emptyTitle: {
    fontSize: 18,
    fontWeight: '700',
  },
  emptySubtitle: {
    fontSize: 14,
    textAlign: 'center',
    color: '#888',
    maxWidth: '80%',
    lineHeight: 20,
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
    shadowOpacity: 0.25,
    shadowRadius: 10,
    shadowOffset: { width: 0, height: 5 },
    elevation: 8,
  },
});
