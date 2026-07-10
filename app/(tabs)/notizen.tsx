import { Ionicons } from '@expo/vector-icons';
import { useFocusEffect } from 'expo-router';
import { useCallback, useState } from 'react';
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
import { useSafeAreaInsets } from 'react-native-safe-area-context';

import VoiceInputModal from '@/components/VoiceInputModal';
import { useColorScheme } from '@/components/useColorScheme';
import Colors from '@/constants/Colors';
import { useAuth } from '@/contexts/AuthProvider';
import { correctNoteText } from '@/lib/aiProcessing';
import { Alert } from '@/lib/alert';
import { supabase } from '@/lib/supabase';

type Note = {
  id: string;
  content: string;
  creator_id: string;
  creator_username: string;
  color_code: string;
  created_at: string;
  updated_at: string;
};

export default function NotizenScreen() {
  const colorScheme = useColorScheme() ?? 'light';
  const theme = Colors[colorScheme];
  const { profile, user } = useAuth();
  const insets = useSafeAreaInsets();

  const [notes, setNotes] = useState<Note[]>([]);
  const [newContent, setNewContent] = useState('');
  const [editingNote, setEditingNote] = useState<Note | null>(null);
  const [editContent, setEditContent] = useState('');
  const [isLoading, setIsLoading] = useState(true);
  const [isRefreshing, setIsRefreshing] = useState(false);
  const [isSaving, setIsSaving] = useState(false);
  const [isEditSaving, setIsEditSaving] = useState(false);
  const [errorMessage, setErrorMessage] = useState<string | null>(null);
  const [showVoiceModal, setShowVoiceModal] = useState(false);

  const profileColor = profile?.color_code ?? theme.tint;

  const loadNotes = useCallback(async (isPullRefresh = false) => {
    if (isPullRefresh) setIsRefreshing(true);
    else setIsLoading(true);
    setErrorMessage(null);

    try {
      const { data, error } = await supabase
        .from('notes_with_creator')
        .select('*')
        .order('created_at', { ascending: false });

      if (error) throw error;
      setNotes((data as Note[]) ?? []);
    } catch (error) {
      const message = error instanceof Error ? error.message : 'Notizen konnten nicht geladen werden.';
      setErrorMessage(message);
    } finally {
      setIsLoading(false);
      setIsRefreshing(false);
    }
  }, []);

  useFocusEffect(
    useCallback(() => {
      void loadNotes();
    }, [loadNotes]),
  );

  async function addNote(content: string) {
    const trimmed = content.trim();
    if (!trimmed || !user?.id) return;

    setIsSaving(true);
    setErrorMessage(null);

    try {
      const { error } = await supabase.from('notes').insert({
        content: trimmed,
        creator_id: user.id,
      });

      if (error) throw error;

      setNewContent('');
      setShowVoiceModal(false);
      await loadNotes();
    } catch (error) {
      const message = error instanceof Error ? error.message : 'Notiz konnte nicht gespeichert werden.';
      setErrorMessage(message);
    } finally {
      setIsSaving(false);
    }
  }

  function startEditNote(note: Note) {
    setEditingNote(note);
    setEditContent(note.content);
  }

  async function saveNoteEdit() {
    if (!editingNote) return;
    const content = editContent.trim();

    if (!content) {
      setErrorMessage('Notiz darf nicht leer sein.');
      return;
    }

    setIsEditSaving(true);
    setErrorMessage(null);

    try {
      const { error } = await supabase
        .from('notes')
        .update({ content })
        .eq('id', editingNote.id);

      if (error) throw error;

      setEditingNote(null);
      setEditContent('');
      await loadNotes();
    } catch (error) {
      const message = error instanceof Error ? error.message : 'Notiz konnte nicht gespeichert werden.';
      setErrorMessage(message);
    } finally {
      setIsEditSaving(false);
    }
  }

  function confirmDeleteNote(note: Note) {
    Alert.alert('Notiz löschen?', 'Diese Notiz wird dauerhaft entfernt.', [
      { text: 'Abbrechen', style: 'cancel' },
      {
        text: 'Löschen',
        style: 'destructive',
        onPress: () => void deleteNote(note.id),
      },
    ]);
  }

  async function deleteNote(noteId: string) {
    try {
      const { error } = await supabase.from('notes').delete().eq('id', noteId);
      if (error) throw error;
      await loadNotes();
    } catch (error) {
      const message = error instanceof Error ? error.message : 'Notiz konnte nicht gelöscht werden.';
      setErrorMessage(message);
    }
  }

  function formatTimestamp(dateStr: string) {
    const d = new Date(dateStr);
    return d.toLocaleString('de-DE', {
      day: 'numeric',
      month: 'short',
      hour: '2-digit',
      minute: '2-digit',
    });
  }

  function renderNoteItem({ item }: { item: Note }) {
    const canManage = item.creator_id === user?.id;

    return (
      <View
        style={[
          styles.card,
          {
            borderColor: colorScheme === 'dark' ? '#3d3d5c' : '#e0e0e8',
            backgroundColor: colorScheme === 'dark' ? '#252540' : '#fff',
          },
        ]}>
        <View style={[styles.creatorStrip, { backgroundColor: item.color_code }]} />
        <View style={styles.cardBody}>
          <Text style={[styles.cardContent, { color: theme.text }]}>{item.content}</Text>
          <Text style={styles.metaText}>
            {item.creator_username} · {formatTimestamp(item.created_at)}
          </Text>

          {canManage ? (
            <View style={styles.actionsRow}>
              <Pressable
                onPress={() => startEditNote(item)}
                style={({ pressed }) => [styles.actionButton, { opacity: pressed ? 0.8 : 1 }]}>
                <Ionicons name="create-outline" size={15} color={item.color_code} />
                <Text style={[styles.actionText, { color: item.color_code }]}>Bearbeiten</Text>
              </Pressable>

              <Pressable
                onPress={() => confirmDeleteNote(item)}
                style={({ pressed }) => [styles.actionButton, { opacity: pressed ? 0.8 : 1 }]}>
                <Ionicons name="trash-outline" size={15} color="#d9534f" />
                <Text style={[styles.actionText, { color: '#d9534f' }]}>Löschen</Text>
              </Pressable>
            </View>
          ) : null}
        </View>
      </View>
    );
  }

  return (
    <View style={[styles.container, { backgroundColor: theme.background }]}>
      <Text style={[styles.title, { color: theme.text }]}>Notizen</Text>
      <Text style={styles.subtitle}>Der gemeinsame Notizzettel deines Haushalts – für alle sichtbar.</Text>

      <View style={styles.createRow}>
        <TextInput
          style={[
            styles.input,
            {
              color: theme.text,
              borderColor: colorScheme === 'dark' ? '#3d3d5c' : '#e0e0e8',
              backgroundColor: colorScheme === 'dark' ? '#252540' : '#f8f8fc',
            },
          ]}
          placeholder="Neue Notiz …"
          placeholderTextColor={colorScheme === 'dark' ? '#888' : '#999'}
          value={newContent}
          onChangeText={setNewContent}
          multiline
          returnKeyType="done"
        />
        <View style={styles.addButtonsColumn}>
          <Pressable
            onPress={() => {
              if (!isSaving) void addNote(newContent);
            }}
            style={({ pressed }) => [
              styles.addButton,
              { backgroundColor: profileColor, opacity: pressed || isSaving ? 0.85 : 1 },
            ]}
            accessibilityLabel="Notiz speichern">
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
            accessibilityLabel="Notiz per Sprache hinzufügen">
            <Ionicons name="mic-outline" size={18} color={profileColor} />
          </Pressable>
        </View>
      </View>

      <VoiceInputModal
        visible={showVoiceModal}
        title="Neue Notiz"
        placeholder="Was möchtest du festhalten? Schreib oder sprich …"
        profileColor={profileColor}
        onClose={() => setShowVoiceModal(false)}
        onConfirm={(text) => void addNote(text)}
        processTranscription={correctNoteText}
      />

      {errorMessage ? <Text style={styles.errorText}>{errorMessage}</Text> : null}

      {editingNote ? (
        <View style={styles.editPanel}>
          <Text style={[styles.editTitle, { color: theme.text }]}>Notiz bearbeiten</Text>
          <TextInput
            style={[
              styles.input,
              styles.editInput,
              {
                color: theme.text,
                borderColor: colorScheme === 'dark' ? '#3d3d5c' : '#e0e0e8',
                backgroundColor: colorScheme === 'dark' ? '#1e1e33' : '#f8f8fc',
              },
            ]}
            value={editContent}
            onChangeText={setEditContent}
            placeholder="Notiz"
            placeholderTextColor={colorScheme === 'dark' ? '#888' : '#999'}
            multiline
          />

          <View style={styles.editActionsRow}>
            <Pressable
              onPress={() => {
                setEditingNote(null);
                setEditContent('');
              }}
              style={({ pressed }) => [styles.editButton, { opacity: pressed ? 0.85 : 1 }]}>
              <Text style={styles.editCancelText}>Abbrechen</Text>
            </Pressable>
            <Pressable
              onPress={() => {
                if (!isEditSaving) void saveNoteEdit();
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
          data={notes}
          keyExtractor={(item) => item.id}
          renderItem={renderNoteItem}
          contentContainerStyle={[styles.listContent, { paddingBottom: insets.bottom + 24 }]}
          refreshControl={
            <RefreshControl
              refreshing={isRefreshing}
              onRefresh={() => void loadNotes(true)}
              tintColor={profileColor}
              colors={[profileColor]}
            />
          }
          ListEmptyComponent={
            <View style={styles.emptyWrap}>
              <Ionicons name="document-text-outline" size={42} color={profileColor} />
              <Text style={[styles.emptyTitle, { color: theme.text }]}>Noch keine Notizen</Text>
              <Text style={styles.emptySubtitle}>Schreib oder sprich oben die erste Notiz.</Text>
            </View>
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
  input: {
    borderWidth: 1.5,
    borderRadius: 12,
    paddingHorizontal: 14,
    paddingVertical: 12,
    fontSize: 14,
    flex: 1,
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
  errorText: {
    color: '#d9534f',
    marginTop: 8,
    fontSize: 13,
  },
  editPanel: {
    borderRadius: 12,
    borderWidth: 1,
    borderColor: '#d0d0d8',
    backgroundColor: '#f8f8fc',
    padding: 10,
    gap: 8,
    marginTop: 12,
  },
  editTitle: {
    fontSize: 14,
    fontWeight: '700',
  },
  editInput: {
    minHeight: 70,
    textAlignVertical: 'top',
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
    paddingTop: 16,
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
  cardContent: {
    fontSize: 15,
    lineHeight: 21,
  },
  metaText: {
    fontSize: 12,
    color: '#888',
    fontWeight: '600',
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
  emptyTitle: {
    fontSize: 16,
    fontWeight: '700',
  },
  emptySubtitle: {
    fontSize: 13,
    color: '#888',
    textAlign: 'center',
  },
});
