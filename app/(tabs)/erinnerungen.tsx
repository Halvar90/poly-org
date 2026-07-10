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
  TextInput,
  View,
} from 'react-native';

import VoiceInputModal from '@/components/VoiceInputModal';
import { useColorScheme } from '@/components/useColorScheme';
import Colors from '@/constants/Colors';
import { useAuth } from '@/contexts/AuthProvider';
import { parseEventFromVoice } from '@/lib/aiProcessing';
import { Alert } from '@/lib/alert';
import { supabase } from '@/lib/supabase';

type Reminder = {
  id: string;
  title: string;
  description: string | null;
  is_done: boolean;
  creator_id: string;
  creator_username: string;
  color_code: string;
  created_at: string;
  assignee_id?: string | null;
  assignee_username?: string | null;
};

export default function ErinnerungenScreen() {
  const colorScheme = useColorScheme() ?? 'light';
  const theme = Colors[colorScheme];
  const { profile, user } = useAuth();

  const [reminders, setReminders] = useState<Reminder[]>([]);
  const [newTitle, setNewTitle] = useState('');
  const [newDescription, setNewDescription] = useState('');
  const [editingReminder, setEditingReminder] = useState<Reminder | null>(null);
  const [editTitle, setEditTitle] = useState('');
  const [editDescription, setEditDescription] = useState('');
  const [lastToggledReminder, setLastToggledReminder] = useState<Reminder | null>(null);
  const [isLoading, setIsLoading] = useState(true);
  const [isRefreshing, setIsRefreshing] = useState(false);
  const [isSaving, setIsSaving] = useState(false);
  const [isEditSaving, setIsEditSaving] = useState(false);
  const [isParsing, setIsParsing] = useState(false);
  const [errorMessage, setErrorMessage] = useState<string | null>(null);
  const [showVoiceModal, setShowVoiceModal] = useState(false);
  const [isArchiveOpen, setIsArchiveOpen] = useState(false);
  const undoTimeoutRef = useRef<ReturnType<typeof setTimeout> | null>(null);

  const profileColor = profile?.color_code ?? theme.tint;

  useEffect(() => {
    return () => {
      if (undoTimeoutRef.current) {
        clearTimeout(undoTimeoutRef.current);
      }
    };
  }, []);

  const loadReminders = useCallback(async (isPullRefresh = false) => {
    if (isPullRefresh) {
      setIsRefreshing(true);
    } else {
      setIsLoading(true);
    }
    setErrorMessage(null);

    try {
      const { data, error } = await supabase
        .from('reminders_with_creator')
        .select('*')
        .order('is_done', { ascending: true })
        .order('created_at', { ascending: false });

      if (error) throw error;
      setReminders((data as Reminder[]) ?? []);
    } catch (error) {
      const message = error instanceof Error ? error.message : 'Erinnerungen konnten nicht geladen werden.';
      setErrorMessage(message);
    } finally {
      setIsLoading(false);
      setIsRefreshing(false);
    }
  }, []);

  useFocusEffect(
    useCallback(() => {
      loadReminders();
    }, [loadReminders]),
  );

  function handleVoiceConfirm(text: string) {
    setShowVoiceModal(false);
    setIsParsing(true);
    void parseEventFromVoice(text).then((parsed) => {
      if (parsed.assigneeName) {
        router.push({
          pathname: '/add-event',
          params: {
            initialTitle: parsed.title,
            entryType: 'erinnerung',
            initialAssigneeName: parsed.assigneeName,
          },
        });
      } else {
        void (async () => {
          if (!user?.id) return;
          try {
            const { error } = await supabase.from('reminders').insert({
              title: parsed.title,
              description: null,
              creator_id: user.id,
            });
            if (error) throw error;
            await loadReminders();
          } catch (err) {
            setErrorMessage(err instanceof Error ? err.message : 'Erinnerung konnte nicht erstellt werden.');
          }
        })();
      }
    }).finally(() => setIsParsing(false));
  }

  async function addReminder() {
    const title = newTitle.trim();
    if (!title) return;

    if (!user?.id) {
      setErrorMessage('Kein eingeloggter User gefunden.');
      return;
    }

    setIsSaving(true);
    setErrorMessage(null);

    try {
      const { error } = await supabase.from('reminders').insert({
        title,
        description: newDescription.trim() || null,
        creator_id: user.id,
      });

      if (error) throw error;

      setNewTitle('');
  setNewDescription('');
      await loadReminders();
    } catch (error) {
      const message = error instanceof Error ? error.message : 'Erinnerung konnte nicht erstellt werden.';
      setErrorMessage(message);
    } finally {
      setIsSaving(false);
    }
  }

  async function toggleReminderDone(reminder: Reminder) {
    try {
      const { error } = await supabase
        .from('reminders')
        .update({ is_done: !reminder.is_done })
        .eq('id', reminder.id);

      if (error) throw error;

      if (undoTimeoutRef.current) {
        clearTimeout(undoTimeoutRef.current);
      }

      setLastToggledReminder(reminder);
      undoTimeoutRef.current = setTimeout(() => {
        setLastToggledReminder(null);
        undoTimeoutRef.current = null;
      }, 4500);

      await loadReminders();
    } catch (error) {
      const message = error instanceof Error ? error.message : 'Erinnerung konnte nicht aktualisiert werden.';
      setErrorMessage(message);
    }
  }

  async function undoToggleReminder() {
    if (!lastToggledReminder) return;

    try {
      const { error } = await supabase
        .from('reminders')
        .update({ is_done: lastToggledReminder.is_done })
        .eq('id', lastToggledReminder.id);

      if (error) throw error;

      if (undoTimeoutRef.current) {
        clearTimeout(undoTimeoutRef.current);
        undoTimeoutRef.current = null;
      }

      setLastToggledReminder(null);
      await loadReminders();
    } catch (error) {
      const message = error instanceof Error ? error.message : 'Undo fehlgeschlagen.';
      setErrorMessage(message);
    }
  }

  function startEditReminder(reminder: Reminder) {
    setEditingReminder(reminder);
    setEditTitle(reminder.title);
    setEditDescription(reminder.description ?? '');
  }

  async function saveReminderEdit() {
    if (!editingReminder) return;
    const title = editTitle.trim();

    if (!title) {
      setErrorMessage('Titel darf nicht leer sein.');
      return;
    }

    setIsEditSaving(true);
    setErrorMessage(null);

    try {
      const { error } = await supabase
        .from('reminders')
        .update({
          title,
          description: editDescription.trim() || null,
        })
        .eq('id', editingReminder.id);

      if (error) throw error;

      setEditingReminder(null);
      setEditTitle('');
      setEditDescription('');
      await loadReminders();
    } catch (error) {
      const message = error instanceof Error ? error.message : 'Erinnerung konnte nicht gespeichert werden.';
      setErrorMessage(message);
    } finally {
      setIsEditSaving(false);
    }
  }

  function confirmDeleteReminder(reminder: Reminder) {
    Alert.alert('Erinnerung löschen?', 'Diese Erinnerung wird dauerhaft entfernt.', [
      { text: 'Abbrechen', style: 'cancel' },
      {
        text: 'Löschen',
        style: 'destructive',
        onPress: () => {
          void deleteReminder(reminder.id);
        },
      },
    ]);
  }

  async function deleteReminder(reminderId: string) {
    try {
      const { error } = await supabase.from('reminders').delete().eq('id', reminderId);
      if (error) throw error;
      await loadReminders();
    } catch (error) {
      const message = error instanceof Error ? error.message : 'Erinnerung konnte nicht gelöscht werden.';
      setErrorMessage(message);
    }
  }

  async function convertReminderToTask(reminder: Reminder) {
    try {
      const { error: insertError } = await supabase.from('events').insert({
        title: reminder.title,
        description: reminder.description,
        entry_type: 'aufgabe',
        creator_id: reminder.creator_id,
        start_time: null,
        end_time: null,
        color_code: reminder.color_code,
      });

      if (insertError) throw insertError;

      const { error: deleteError } = await supabase
        .from('reminders')
        .delete()
        .eq('id', reminder.id);

      if (deleteError) throw deleteError;

      await loadReminders();
    } catch (error) {
      const message = error instanceof Error ? error.message : 'Erinnerung konnte nicht umgewandelt werden.';
      setErrorMessage(message);
    }
  }

  const openReminders = useMemo(() => reminders.filter((item) => !item.is_done), [reminders]);
  const doneReminders = useMemo(() => reminders.filter((item) => item.is_done), [reminders]);
  const openCount = openReminders.length;

  function renderArchive() {
    if (doneReminders.length === 0) return null;

    return (
      <View style={styles.archiveSection}>
        <Pressable
          onPress={() => setIsArchiveOpen((v) => !v)}
          style={({ pressed }) => [styles.archiveHeader, { opacity: pressed ? 0.75 : 1 }]}>
          <Ionicons
            name={isArchiveOpen ? 'chevron-down' : 'chevron-forward'}
            size={16}
            color={theme.text}
          />
          <Text style={[styles.archiveHeaderText, { color: theme.text }]}>Archiv</Text>
          <View style={styles.archiveBadge}>
            <Text style={styles.archiveBadgeText}>{doneReminders.length}</Text>
          </View>
        </Pressable>

        {isArchiveOpen ? (
          <View style={styles.archiveList}>
            {doneReminders.map((item) => (
              <Pressable
                key={item.id}
                onPress={() => toggleReminderDone(item)}
                style={({ pressed }) => [styles.archiveRow, { opacity: pressed ? 0.7 : 1 }]}>
                <View style={styles.archiveDot} />
                <Text style={[styles.archiveRowText, { color: theme.text }]} numberOfLines={1}>
                  {item.title}
                </Text>
              </Pressable>
            ))}
          </View>
        ) : null}
      </View>
    );
  }

  function renderReminderItem({ item }: { item: Reminder }) {
    const canManage = item.creator_id === user?.id;

    return (
      <Pressable
        onPress={() => toggleReminderDone(item)}
        style={({ pressed }) => [
          styles.card,
          {
            opacity: pressed ? 0.85 : item.is_done ? 0.6 : 1,
            borderColor: colorScheme === 'dark' ? '#3d3d5c' : '#e0e0e8',
            backgroundColor: colorScheme === 'dark' ? '#252540' : '#fff',
          },
        ]}>
        <View style={[styles.creatorStrip, { backgroundColor: item.color_code }]} />
        <View style={styles.cardBody}>
          <View style={styles.cardTopRow}>
            <Ionicons
              name={item.is_done ? 'checkbox-outline' : 'square-outline'}
              size={20}
              color={item.is_done ? '#34d399' : item.color_code}
            />
            <Text
              style={[styles.cardTitle, { color: theme.text }, item.is_done && styles.cardTitleDone]}
              numberOfLines={2}>
              {item.title}
            </Text>
          </View>

          <Text style={styles.metaText}>
            {item.assignee_id && item.assignee_username
              ? `von ${item.creator_username} für ${item.assignee_username}`
              : `von ${item.creator_username}`}
          </Text>

          {item.description ? (
            <Text style={styles.descriptionText} numberOfLines={2}>
              {item.description}
            </Text>
          ) : null}

          {canManage ? (
            <View style={styles.actionsRow}>
              <Pressable
                onPress={() => startEditReminder(item)}
                style={({ pressed }) => [styles.actionButton, { opacity: pressed ? 0.8 : 1 }]}>
                <Ionicons name="create-outline" size={15} color={item.color_code} />
                <Text style={[styles.actionText, { color: item.color_code }]}>Bearbeiten</Text>
              </Pressable>

              <Pressable
                onPress={() => {
                  void convertReminderToTask(item);
                }}
                style={({ pressed }) => [styles.actionButton, { opacity: pressed ? 0.8 : 1 }]}>
                <Ionicons name="swap-horizontal-outline" size={15} color={item.color_code} />
                <Text style={[styles.actionText, { color: item.color_code }]}>Als Aufgabe</Text>
              </Pressable>

              <Pressable
                onPress={() => confirmDeleteReminder(item)}
                style={({ pressed }) => [styles.actionButton, { opacity: pressed ? 0.8 : 1 }]}>
                <Ionicons name="trash-outline" size={15} color="#d9534f" />
                <Text style={[styles.actionText, { color: '#d9534f' }]}>Löschen</Text>
              </Pressable>
            </View>
          ) : null}
        </View>
      </Pressable>
    );
  }

  return (
    <View style={[styles.container, { backgroundColor: theme.background }]}> 
      <Text style={[styles.title, { color: theme.text }]}>Erinnerungen</Text>
      <Text style={styles.subtitle}>Nicht an Termine gebunden - einfach fuer spaeter merken.</Text>

      <View style={styles.createRow}>
        <View style={styles.createInputsWrap}>
          <TextInput
            style={[
              styles.input,
              {
                color: theme.text,
                borderColor: colorScheme === 'dark' ? '#3d3d5c' : '#e0e0e8',
                backgroundColor: colorScheme === 'dark' ? '#252540' : '#f8f8fc',
              },
            ]}
            placeholder="Neue Erinnerung..."
            placeholderTextColor={colorScheme === 'dark' ? '#888' : '#999'}
            value={newTitle}
            onChangeText={setNewTitle}
            returnKeyType="next"
          />
          <TextInput
            style={[
              styles.input,
              styles.descriptionInput,
              {
                color: theme.text,
                borderColor: colorScheme === 'dark' ? '#3d3d5c' : '#e0e0e8',
                backgroundColor: colorScheme === 'dark' ? '#252540' : '#f8f8fc',
              },
            ]}
            placeholder="Beschreibung (optional)"
            placeholderTextColor={colorScheme === 'dark' ? '#888' : '#999'}
            value={newDescription}
            onChangeText={setNewDescription}
            onSubmitEditing={() => {
              if (!isSaving) void addReminder();
            }}
            returnKeyType="done"
          />
        </View>
        <View style={styles.addButtonsColumn}>
          <Pressable
            onPress={() => {
              if (!isSaving) void addReminder();
            }}
            style={({ pressed }) => [
              styles.addButton,
              { backgroundColor: profileColor, opacity: pressed || isSaving ? 0.85 : 1 },
            ]}
            accessibilityLabel="Erinnerung speichern">
            {isSaving ? <ActivityIndicator color="#fff" /> : <Ionicons name="add" size={20} color="#fff" />}
          </Pressable>
          <Pressable
            onPress={() => setShowVoiceModal(true)}
            style={({ pressed }) => [
              styles.addButton,
              {
                backgroundColor: colorScheme === 'dark' ? '#252540' : '#fff',
                borderWidth: 1.5,
                borderColor: profileColor,
                opacity: pressed ? 0.85 : 1,
              },
            ]}
            accessibilityLabel="Erinnerung per Sprache erstellen">
            <Ionicons name="mic-outline" size={18} color={profileColor} />
          </Pressable>
        </View>
      </View>

      <VoiceInputModal
        visible={showVoiceModal}
        title="Neue Erinnerung"
        placeholder="Erinnerung beschreiben oder sprechen …"
        profileColor={profileColor}
        onClose={() => setShowVoiceModal(false)}
        onConfirm={handleVoiceConfirm}
      />

      {isParsing ? (
        <View style={[StyleSheet.absoluteFill, styles.parsingOverlay]}>
          <ActivityIndicator size="large" color={profileColor} />
          <Text style={[styles.parsingText, { color: '#fff' }]}>Analysiere …</Text>
        </View>
      ) : null}

      <Text style={styles.countText}>{openCount} offen</Text>

      {lastToggledReminder ? (
        <View style={styles.undoBanner}>
          <Text style={styles.undoText}>Status geändert.</Text>
          <Pressable onPress={() => void undoToggleReminder()}>
            <Text style={[styles.undoActionText, { color: profileColor }]}>Rückgängig</Text>
          </Pressable>
        </View>
      ) : null}

      {errorMessage ? <Text style={styles.errorText}>{errorMessage}</Text> : null}

      {editingReminder ? (
        <View style={styles.editPanel}>
          <Text style={[styles.editTitle, { color: theme.text }]}>Erinnerung bearbeiten</Text>
          <TextInput
            style={[
              styles.input,
              {
                color: theme.text,
                borderColor: colorScheme === 'dark' ? '#3d3d5c' : '#e0e0e8',
                backgroundColor: colorScheme === 'dark' ? '#252540' : '#f8f8fc',
              },
            ]}
            value={editTitle}
            onChangeText={setEditTitle}
            placeholder="Titel"
            placeholderTextColor={colorScheme === 'dark' ? '#888' : '#999'}
          />
          <TextInput
            style={[
              styles.input,
              styles.descriptionInput,
              {
                color: theme.text,
                borderColor: colorScheme === 'dark' ? '#3d3d5c' : '#e0e0e8',
                backgroundColor: colorScheme === 'dark' ? '#252540' : '#f8f8fc',
              },
            ]}
            value={editDescription}
            onChangeText={setEditDescription}
            placeholder="Beschreibung (optional)"
            placeholderTextColor={colorScheme === 'dark' ? '#888' : '#999'}
          />

          <View style={styles.editActionsRow}>
            <Pressable
              onPress={() => {
                setEditingReminder(null);
                setEditTitle('');
                setEditDescription('');
              }}
              style={({ pressed }) => [styles.editButton, { opacity: pressed ? 0.85 : 1 }]}> 
              <Text style={styles.editCancelText}>Abbrechen</Text>
            </Pressable>
            <Pressable
              onPress={() => {
                if (!isEditSaving) void saveReminderEdit();
              }}
              style={({ pressed }) => [styles.editButton, styles.editSaveButton, { opacity: pressed ? 0.85 : 1 }]}> 
              {isEditSaving ? <ActivityIndicator color="#fff" /> : <Text style={styles.editSaveText}>Speichern</Text>}
            </Pressable>
          </View>
        </View>
      ) : null}

      {isLoading ? (
        <View style={styles.centerLoader}>
          <ActivityIndicator size="large" color={profileColor} />
        </View>
      ) : (
        <FlatList
          data={openReminders}
          keyExtractor={(item) => item.id}
          renderItem={renderReminderItem}
          contentContainerStyle={styles.listContent}
          refreshControl={
            <RefreshControl
              refreshing={isRefreshing}
              onRefresh={() => loadReminders(true)}
              tintColor={profileColor}
              colors={[profileColor]}
            />
          }
          ListFooterComponent={renderArchive()}
          ListEmptyComponent={
            reminders.length === 0 ? (
              <View style={styles.emptyWrap}>
                <Ionicons name="bookmark-outline" size={42} color={profileColor} />
                <Text style={[styles.emptyTitle, { color: theme.text }]}>Noch keine Erinnerungen</Text>
                <Text style={styles.emptySubtitle}>Erstelle oben deinen ersten Merker.</Text>
              </View>
            ) : (
              <View style={styles.openEmptyState}>
                <Ionicons name="sparkles-outline" size={28} color="#34d399" />
                <Text style={[styles.openEmptyText, { color: theme.text }]}>Alles erledigt!</Text>
              </View>
            )
          }
        />
      )}
    </View>
  );
}

const styles = StyleSheet.create({
  container: {
    flex: 1,
    paddingHorizontal: 20,
    paddingTop: 10,
  },
  title: {
    fontSize: 28,
    fontWeight: '700',
    marginBottom: 6,
  },
  subtitle: {
    fontSize: 14,
    color: '#777',
    marginBottom: 14,
  },
  createRow: {
    flexDirection: 'row',
    gap: 10,
    alignItems: 'flex-start',
  },
  createInputsWrap: {
    flex: 1,
    gap: 8,
  },
  input: {
    borderWidth: 1.5,
    borderRadius: 12,
    paddingHorizontal: 14,
    paddingVertical: 12,
    fontSize: 14,
  },
  descriptionInput: {
    minHeight: 44,
  },
  addButtonsColumn: {
    gap: 8,
  },
  addButton: {
    width: 42,
    height: 42,
    borderRadius: 21,
    alignItems: 'center',
    justifyContent: 'center',
  },
  countText: {
    marginTop: 10,
    marginBottom: 8,
    color: '#888',
    fontSize: 13,
    fontWeight: '600',
  },
  undoBanner: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'space-between',
    borderRadius: 10,
    borderWidth: 1,
    borderColor: '#d0d0d8',
    backgroundColor: '#f8f8fc',
    paddingHorizontal: 10,
    paddingVertical: 8,
    marginBottom: 8,
  },
  undoText: {
    fontSize: 13,
    color: '#666',
    fontWeight: '600',
  },
  undoActionText: {
    fontSize: 13,
    fontWeight: '700',
  },
  errorText: {
    color: '#d9534f',
    marginBottom: 8,
    fontSize: 13,
  },
  editPanel: {
    borderRadius: 12,
    borderWidth: 1,
    borderColor: '#d0d0d8',
    backgroundColor: '#f8f8fc',
    padding: 10,
    gap: 8,
    marginBottom: 10,
  },
  editTitle: {
    fontSize: 14,
    fontWeight: '700',
  },
  editActionsRow: {
    flexDirection: 'row',
    gap: 8,
    justifyContent: 'flex-end',
  },
  editButton: {
    borderRadius: 10,
    paddingHorizontal: 12,
    paddingVertical: 8,
    borderWidth: 1,
    borderColor: '#d0d0d8',
    minWidth: 90,
    alignItems: 'center',
    justifyContent: 'center',
  },
  editSaveButton: {
    backgroundColor: '#2563EB',
    borderColor: '#2563EB',
  },
  editCancelText: {
    fontSize: 13,
    fontWeight: '700',
    color: '#666',
  },
  editSaveText: {
    fontSize: 13,
    fontWeight: '700',
    color: '#fff',
  },
  centerLoader: {
    flex: 1,
    alignItems: 'center',
    justifyContent: 'center',
  },
  listContent: {
    paddingBottom: 28,
    gap: 10,
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
    paddingVertical: 10,
    gap: 6,
  },
  cardTopRow: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 8,
  },
  cardTitle: {
    flex: 1,
    fontSize: 15,
    fontWeight: '700',
  },
  cardTitleDone: {
    textDecorationLine: 'line-through',
    color: '#6b7280',
  },
  metaText: {
    fontSize: 12,
    color: '#888',
    fontWeight: '600',
  },
  descriptionText: {
    fontSize: 12,
    color: '#666',
    lineHeight: 18,
  },
  actionsRow: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 12,
    marginTop: 2,
  },
  actionButton: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 4,
  },
  actionText: {
    fontSize: 12,
    fontWeight: '700',
  },
  emptyWrap: {
    alignItems: 'center',
    paddingTop: 36,
    gap: 8,
  },
  openEmptyState: {
    alignItems: 'center',
    paddingVertical: 24,
    gap: 8,
  },
  openEmptyText: {
    fontSize: 14,
    fontWeight: '600',
  },
  archiveSection: {
    marginTop: 4,
  },
  archiveHeader: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 6,
    paddingVertical: 10,
  },
  archiveHeaderText: {
    fontSize: 13,
    fontWeight: '700',
    flex: 1,
  },
  archiveBadge: {
    minWidth: 20,
    height: 20,
    borderRadius: 10,
    backgroundColor: 'rgba(52, 211, 153, 0.18)',
    alignItems: 'center',
    justifyContent: 'center',
    paddingHorizontal: 6,
  },
  archiveBadgeText: {
    fontSize: 11,
    fontWeight: '700',
    color: '#0f9d64',
  },
  archiveList: {
    gap: 2,
  },
  archiveRow: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 8,
    paddingVertical: 7,
    paddingHorizontal: 4,
    borderBottomWidth: StyleSheet.hairlineWidth,
    borderBottomColor: 'rgba(128,128,128,0.2)',
  },
  archiveDot: {
    width: 8,
    height: 8,
    borderRadius: 4,
    backgroundColor: '#34d399',
  },
  archiveRowText: {
    flex: 1,
    fontSize: 13,
    textDecorationLine: 'line-through',
    opacity: 0.7,
  },
  emptyTitle: {
    fontSize: 16,
    fontWeight: '700',
  },
  emptySubtitle: {
    fontSize: 13,
    color: '#888',
    textAlign: 'center',
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
