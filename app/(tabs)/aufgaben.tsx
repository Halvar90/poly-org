import { Ionicons } from '@expo/vector-icons';
import { router, useFocusEffect } from 'expo-router';
import { useCallback, useMemo, useState } from 'react';
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
import { parseEventFromVoice } from '@/lib/aiProcessing';
import { getRecurrenceLabel } from '@/lib/calendarUtils';
import { supabase } from '@/lib/supabase';

type EventWithCreator = {
  id: string;
  title: string;
  description: string | null;
  start_time: string | null;
  end_time: string | null;
  entry_type: 'termin' | 'aufgabe' | 'abwesenheit';
  creator_id: string;
  color_code: string;
  recurrence_rule?: 'none' | 'weekly' | 'monthly' | null;
  is_ai_suggested?: boolean;
  is_done?: boolean;
  creator_username: string;
  assignee_id?: string | null;
  assignee_username?: string | null;
};

export default function AufgabenScreen() {
  const colorScheme = useColorScheme() ?? 'light';
  const theme = Colors[colorScheme];
  const { profile } = useAuth();
  const insets = useSafeAreaInsets();

  const [tasks, setTasks] = useState<EventWithCreator[]>([]);
  const [isLoading, setIsLoading] = useState(true);
  const [isRefreshing, setIsRefreshing] = useState(false);
  const [errorMessage, setErrorMessage] = useState<string | null>(null);
  const [showVoiceModal, setShowVoiceModal] = useState(false);
  const [isParsing, setIsParsing] = useState(false);

  const profileColor = profile?.color_code ?? theme.tint;

  const loadTasks = useCallback(async (isPullRefresh = false) => {
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
        .eq('entry_type', 'aufgabe')
        .order('is_done', { ascending: true })
        .order('start_time', { ascending: true, nullsFirst: false });

      if (error) throw error;
      setTasks((data as EventWithCreator[]) || []);
    } catch (error) {
      const message =
        error instanceof Error
          ? error.message
          : 'Aufgaben konnten nicht geladen werden.';
      setErrorMessage(message);
    } finally {
      setIsLoading(false);
      setIsRefreshing(false);
    }
  }, []);

  useFocusEffect(
    useCallback(() => {
      loadTasks();
    }, [loadTasks]),
  );

  async function toggleTaskDone(task: EventWithCreator) {
    try {
      const { error } = await supabase
        .from('events')
        .update({ is_done: !task.is_done })
        .eq('id', task.id);

      if (error) throw error;
      await loadTasks();
    } catch (error) {
      const message =
        error instanceof Error
          ? error.message
          : 'Aufgabe konnte nicht aktualisiert werden.';
      setErrorMessage(message);
    }
  }

  async function convertTaskToReminder(task: EventWithCreator) {
    if (task.creator_id !== profile?.id) {
      setErrorMessage('Nur eigene Aufgaben koennen in Erinnerungen umgewandelt werden.');
      return;
    }

    try {
      const { error: insertError } = await supabase.from('reminders').insert({
        title: task.title,
        description: task.description,
        creator_id: task.creator_id,
      });

      if (insertError) throw insertError;

      const { error: deleteError } = await supabase
        .from('events')
        .delete()
        .eq('id', task.id);

      if (deleteError) throw deleteError;

      await loadTasks();
    } catch (error) {
      const message =
        error instanceof Error
          ? error.message
          : 'Aufgabe konnte nicht in Erinnerung umgewandelt werden.';
      setErrorMessage(message);
    }
  }

  function handleVoiceConfirm(text: string) {
    setShowVoiceModal(false);
    setIsParsing(true);
    void parseEventFromVoice(text).then((parsed) => {
      router.push({
        pathname: '/add-event',
        params: {
          initialTitle: parsed.title,
          initialDate: parsed.date ?? '',
          initialTime: parsed.time ?? '',
          entryType: 'aufgabe',
          initialAssigneeName: parsed.assigneeName ?? '',
        },
      });
    }).finally(() => setIsParsing(false));
  }

  const completedCount = useMemo(() => tasks.filter((task) => task.is_done).length, [tasks]);

  function renderTaskItem({ item }: { item: EventWithCreator }) {
    const canManage = item.creator_id === profile?.id;
    const recurrenceLabel = getRecurrenceLabel(item.recurrence_rule);

    return (
      <Pressable
        onPress={() => toggleTaskDone(item)}
        style={({ pressed }) => [
          styles.taskCard,
          {
            backgroundColor: item.is_done
              ? colorScheme === 'dark'
                ? '#1a4d2e'
                : '#d1fad6'
              : colorScheme === 'dark'
                ? '#252540'
                : '#fff',
            borderColor: item.is_done
              ? '#34d399'
              : colorScheme === 'dark'
                ? '#3d3d5c'
                : '#ececf2',
            opacity: pressed ? 0.8 : 1,
          },
        ]}>
        <View style={styles.taskHeader}>
          <View style={styles.taskTitleRow}>
            <View style={[styles.taskCreatorIcon, { backgroundColor: `${item.color_code}18`, borderColor: item.color_code }]}> 
                <Ionicons name="person-outline" size={18} color={item.color_code} />
            </View>
            <Ionicons
              name={item.is_done ? 'checkbox-outline' : 'square-outline'}
              size={20}
              color={item.is_done ? '#34d399' : profileColor}
            />
            <Text
              style={[
                styles.taskTitle,
                { color: theme.text },
                item.is_done && styles.taskTitleDone,
              ]}
              numberOfLines={2}>
              {item.title}
            </Text>
          </View>
          <Ionicons name="chevron-forward" size={18} color={theme.text} opacity={0.5} />
        </View>

        <View style={styles.taskMetaRow}>
          <Text style={[styles.taskMeta]}>
            {item.assignee_id && item.assignee_username
              ? <>Von <Text style={{ fontWeight: '600' }}>{item.creator_username}</Text> für <Text style={{ fontWeight: '600', color: item.color_code }}>{item.assignee_username}</Text></>
              : <>Erstellt von <Text style={{ fontWeight: '600' }}>{item.creator_username}</Text></>
            }
          </Text>
          {item.start_time ? (
            <Text style={[styles.taskMeta]}>
              Erinnere mich am{' '}
              <Text style={{ fontWeight: '600' }}>
                {new Date(item.start_time).toLocaleDateString('de-DE')}
              </Text>
            </Text>
          ) : null}

          {recurrenceLabel ? <Text style={[styles.taskMeta]}>{recurrenceLabel}</Text> : null}

          {canManage ? (
            <Pressable
              onPress={() => {
                void convertTaskToReminder(item);
              }}
              style={({ pressed }) => [styles.convertButton, { opacity: pressed ? 0.82 : 1 }]}>
              <Ionicons name="swap-horizontal-outline" size={14} color={item.color_code} />
              <Text style={[styles.convertButtonText, { color: item.color_code }]}>Als Erinnerung</Text>
            </Pressable>
          ) : null}
        </View>
      </Pressable>
    );
  }

  function renderEmptyState() {
    return (
      <View style={styles.emptyState}>
        <Ionicons name="checkmark-done-circle-outline" size={48} color={theme.tint} />
        <Text style={[styles.emptyTitle, { color: theme.text }]}>Keine Aufgaben vorhanden</Text>
        <Text style={[styles.emptySubtitle, { color: theme.text }]}>
          Erstelle neue Aufgaben über das Plus in der Kalender-Ansicht
        </Text>
      </View>
    );
  }

  return (
    <View style={[styles.container, { backgroundColor: theme.background }]}>
      <Text style={[styles.title, { color: theme.text }]}>Aufgaben</Text>
      <Text style={[styles.subtitle, { color: theme.text }]}>
        Hier findest du nur Aufgaben, die du abhaken kannst.
      </Text>

      {isLoading ? (
        <View style={styles.centerLoader}>
          <ActivityIndicator size="large" color={profileColor} />
        </View>
      ) : errorMessage ? (
        <View style={styles.errorContainer}>
          <Ionicons name="alert-circle-outline" size={32} color="#d9534f" />
          <Text style={[styles.errorText, { color: '#d9534f' }]}>{errorMessage}</Text>
        </View>
      ) : tasks.length === 0 ? (
        renderEmptyState()
      ) : (
        <>
          {completedCount > 0 && (
            <View style={[styles.progressBar, { backgroundColor: colorScheme === 'dark' ? '#3d3d5c' : '#f0f0f0' }]}>
              <View
                style={[
                  styles.progressFill,
                  {
                    width: `${Math.round((completedCount / tasks.length) * 100)}%`,
                    backgroundColor: '#34d399',
                  },
                ]}
              />
            </View>
          )}
          <FlatList
            data={tasks}
            keyExtractor={(item) => item.id}
            renderItem={renderTaskItem}
            refreshControl={
              <RefreshControl
                refreshing={isRefreshing}
                onRefresh={() => loadTasks(true)}
                tintColor={profileColor}
              />
            }
            contentContainerStyle={styles.listContent}
            scrollIndicatorInsets={{ right: 1 }}
          />
        </>
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
        accessibilityLabel="Aufgabe per Sprache erstellen">
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
        onPress={() => router.push({ pathname: '/add-event', params: { entryType: 'aufgabe' } })}
        accessibilityLabel="Neue Aufgabe erstellen">
        <Ionicons name="add" size={30} color="#fff" />
      </Pressable>

      {isParsing ? (
        <View style={[StyleSheet.absoluteFill, styles.parsingOverlay]}>
          <ActivityIndicator size="large" color={profileColor} />
          <Text style={[styles.parsingText, { color: theme.text }]}>Analysiere …</Text>
        </View>
      ) : null}

      <VoiceInputModal
        visible={showVoiceModal}
        title="Neue Aufgabe"
        placeholder="Aufgabe beschreiben oder sprechen …"
        profileColor={profileColor}
        onClose={() => setShowVoiceModal(false)}
        onConfirm={handleVoiceConfirm}
      />
    </View>
  );
}

const styles = StyleSheet.create({
  container: {
    flex: 1,
    paddingHorizontal: 24,
    paddingTop: 8,
  },
  title: {
    fontSize: 28,
    fontWeight: '700',
    marginBottom: 8,
  },
  subtitle: {
    fontSize: 15,
    marginBottom: 16,
    color: '#777',
    lineHeight: 22,
  },
  progressBar: {
    height: 4,
    borderRadius: 2,
    marginBottom: 16,
    overflow: 'hidden',
  },
  progressFill: {
    height: 4,
    borderRadius: 2,
  },
  listContent: {
    paddingBottom: 110,
    gap: 12,
  },
  centerLoader: {
    flex: 1,
    alignItems: 'center',
    justifyContent: 'center',
  },
  errorContainer: {
    flex: 1,
    alignItems: 'center',
    justifyContent: 'center',
    gap: 12,
  },
  errorText: {
    fontSize: 15,
    fontWeight: '600',
    textAlign: 'center',
    maxWidth: '80%',
  },
  taskCard: {
    borderWidth: 1,
    borderRadius: 18,
    padding: 16,
    shadowColor: '#000',
    shadowOpacity: 0.05,
    shadowRadius: 12,
    elevation: 2,
  },
  taskHeader: {
    flexDirection: 'row',
    justifyContent: 'space-between',
    alignItems: 'center',
    gap: 12,
  },
  taskTitleRow: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 10,
    flex: 1,
  },
  taskCreatorIcon: {
    width: 30,
    height: 30,
    borderRadius: 18,
    alignItems: 'center',
    justifyContent: 'center',
    borderWidth: 1.5,
  },
  taskTitle: {
    fontSize: 17,
    fontWeight: '700',
    flexShrink: 1,
  },
  taskTitleDone: {
    textDecorationLine: 'line-through',
    color: '#6b7280',
  },
  taskMetaRow: {
    marginTop: 12,
    gap: 4,
  },
  convertButton: {
    marginTop: 2,
    flexDirection: 'row',
    alignItems: 'center',
    gap: 5,
    alignSelf: 'flex-start',
  },
  convertButtonText: {
    fontSize: 12,
    fontWeight: '700',
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
    shadowOpacity: 0.15,
    shadowRadius: 6,
    shadowOffset: { width: 0, height: 3 },
    elevation: 5,
  },
  taskMeta: {
    fontSize: 13,
    color: '#777',
    lineHeight: 18,
  },
  emptyState: {
    flex: 1,
    alignItems: 'center',
    justifyContent: 'center',
    gap: 10,
  },
  emptyTitle: {
    fontSize: 18,
    fontWeight: '700',
  },
  emptySubtitle: {
    fontSize: 14,
    textAlign: 'center',
    maxWidth: '80%',
    lineHeight: 20,
  },
  parsingOverlay: {
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
