import { Ionicons } from '@expo/vector-icons';
import { router, useLocalSearchParams } from 'expo-router';
import { useCallback, useEffect, useState } from 'react';
import {
  ActivityIndicator,
  FlatList,
  Pressable,
  StyleSheet,
  Text,
  View,
} from 'react-native';
import { useSafeAreaInsets } from 'react-native-safe-area-context';

import VoiceInputModal from '@/components/VoiceInputModal';
import { useColorScheme } from '@/components/useColorScheme';
import Colors from '@/constants/Colors';
import { useAuth } from '@/contexts/AuthProvider';
import { correctDiaryText } from '@/lib/aiProcessing';
import { Alert } from '@/lib/alert';
import { supabase } from '@/lib/supabase';

type DiaryEntry = {
  id: string;
  content: string;
  entry_date: string;
  created_at: string;
};

export default function DiaryDayScreen() {
  const { date } = useLocalSearchParams<{ date: string }>();
  const colorScheme = useColorScheme() ?? 'light';
  const theme = Colors[colorScheme];
  const { profile, user } = useAuth();
  const insets = useSafeAreaInsets();

  const [entries, setEntries] = useState<DiaryEntry[]>([]);
  const [isLoading, setIsLoading] = useState(true);
  const [showVoiceModal, setShowVoiceModal] = useState(false);
  const [errorMessage, setErrorMessage] = useState<string | null>(null);

  const profileColor = profile?.color_code ?? theme.tint;

  const loadEntries = useCallback(async () => {
    if (!date) return;
    setIsLoading(true);
    try {
      const { data, error } = await supabase
        .from('diary_entries')
        .select('*')
        .eq('entry_date', date)
        .order('created_at', { ascending: true });
      if (error) throw error;
      setEntries((data as DiaryEntry[]) ?? []);
    } catch (err) {
      setErrorMessage(err instanceof Error ? err.message : 'Fehler beim Laden.');
    } finally {
      setIsLoading(false);
    }
  }, [date]);

  useEffect(() => {
    void loadEntries();
  }, [loadEntries]);

  async function handleAddEntry(text: string) {
    if (!user?.id || !date) return;
    try {
      const { error } = await supabase.from('diary_entries').insert({
        user_id: user.id,
        content: text,
        entry_date: date,
      });
      if (error) throw error;
      setShowVoiceModal(false);
      await loadEntries();
    } catch (err) {
      setErrorMessage(err instanceof Error ? err.message : 'Fehler beim Speichern.');
    }
  }

  async function deleteEntry(id: string) {
    Alert.alert('Eintrag löschen?', 'Dieser Eintrag wird dauerhaft entfernt.', [
      { text: 'Abbrechen', style: 'cancel' },
      {
        text: 'Löschen',
        style: 'destructive',
        onPress: async () => {
          try {
            const { error } = await supabase.from('diary_entries').delete().eq('id', id);
            if (error) throw error;
            await loadEntries();
          } catch (err) {
            setErrorMessage(err instanceof Error ? err.message : 'Fehler beim Löschen.');
          }
        },
      },
    ]);
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

  function formatTime(isoStr: string) {
    return new Date(isoStr).toLocaleTimeString('de-DE', {
      hour: '2-digit',
      minute: '2-digit',
    });
  }

  function renderEntry({ item }: { item: DiaryEntry }) {
    return (
      <View
        style={[
          styles.entryCard,
          {
            backgroundColor: colorScheme === 'dark' ? '#252540' : '#fff',
            borderColor: colorScheme === 'dark' ? '#3d3d5c' : '#ececf2',
          },
        ]}>
        <View style={styles.entryHeader}>
          <Text style={styles.entryTime}>{formatTime(item.created_at)}</Text>
          <Pressable
            onPress={() => void deleteEntry(item.id)}
            style={({ pressed }) => ({ opacity: pressed ? 0.6 : 1 })}>
            <Ionicons name="trash-outline" size={16} color="#d9534f" />
          </Pressable>
        </View>
        <Text style={[styles.entryContent, { color: theme.text }]}>{item.content}</Text>
      </View>
    );
  }

  return (
    <View style={[styles.container, { backgroundColor: theme.background }]}>
      <View style={[styles.header, { paddingTop: insets.top + 8 }]}>
        <Pressable onPress={() => router.back()} style={styles.backBtn}>
          <Ionicons name="chevron-back" size={24} color={theme.text} />
        </Pressable>
        <Text style={[styles.headerTitle, { color: theme.text }]} numberOfLines={1}>
          {date ? formatDate(date) : ''}
        </Text>
        <View style={styles.headerSpacer} />
      </View>

      {errorMessage ? (
        <Text style={[styles.errorText]}>{errorMessage}</Text>
      ) : null}

      {isLoading ? (
        <View style={styles.centerLoader}>
          <ActivityIndicator size="large" color={profileColor} />
        </View>
      ) : (
        <FlatList
          data={entries}
          keyExtractor={(item) => item.id}
          renderItem={renderEntry}
          contentContainerStyle={styles.listContent}
          ListEmptyComponent={
            <View style={styles.emptyState}>
              <Ionicons name="book-outline" size={40} color={profileColor} opacity={0.5} />
              <Text style={[styles.emptyText, { color: theme.text }]}>
                Noch keine Einträge an diesem Tag.
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
        accessibilityLabel="Weiteren Eintrag hinzufügen">
        <Ionicons name="add" size={30} color="#fff" />
      </Pressable>

      <VoiceInputModal
        visible={showVoiceModal}
        title="Eintrag hinzufügen"
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
  },
  header: {
    flexDirection: 'row',
    alignItems: 'center',
    paddingHorizontal: 12,
    paddingBottom: 8,
  },
  backBtn: {
    width: 40,
    height: 40,
    alignItems: 'center',
    justifyContent: 'center',
  },
  headerTitle: {
    flex: 1,
    textAlign: 'center',
    fontSize: 16,
    fontWeight: '700',
  },
  headerSpacer: {
    width: 40,
  },
  errorText: {
    color: '#d9534f',
    fontSize: 13,
    marginHorizontal: 20,
    marginBottom: 8,
  },
  centerLoader: {
    flex: 1,
    alignItems: 'center',
    justifyContent: 'center',
  },
  listContent: {
    paddingHorizontal: 20,
    paddingTop: 8,
    paddingBottom: 110,
    gap: 12,
  },
  entryCard: {
    borderWidth: 1,
    borderRadius: 14,
    padding: 14,
    gap: 8,
    shadowColor: '#000',
    shadowOpacity: 0.05,
    shadowRadius: 6,
    elevation: 1,
  },
  entryHeader: {
    flexDirection: 'row',
    justifyContent: 'space-between',
    alignItems: 'center',
  },
  entryTime: {
    fontSize: 12,
    color: '#888',
    fontWeight: '600',
  },
  entryContent: {
    fontSize: 15,
    lineHeight: 22,
  },
  emptyState: {
    alignItems: 'center',
    paddingTop: 40,
    gap: 10,
  },
  emptyText: {
    fontSize: 15,
    color: '#888',
    textAlign: 'center',
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
