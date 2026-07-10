import { Ionicons } from '@expo/vector-icons';
import { useEffect, useState } from 'react';
import {
  ActivityIndicator,
  KeyboardAvoidingView,
  Modal,
  Platform,
  Pressable,
  StyleSheet,
  Text,
  TextInput,
  View,
} from 'react-native';

import { useColorScheme } from '@/components/useColorScheme';
import Colors from '@/constants/Colors';
import { useVoiceInput } from '@/lib/voiceInput';

type Props = {
  visible: boolean;
  title?: string;
  placeholder?: string;
  initialText?: string;
  profileColor: string;
  onClose: () => void;
  onConfirm: (text: string) => void;
  processTranscription?: (raw: string) => Promise<string>;
};

export default function VoiceInputModal({
  visible,
  title = 'Neuer Eintrag',
  placeholder = 'Tippe oder nutze das Mikrofon …',
  initialText = '',
  profileColor,
  onClose,
  onConfirm,
  processTranscription,
}: Props) {
  const colorScheme = useColorScheme() ?? 'light';
  const theme = Colors[colorScheme];
  const [text, setText] = useState(initialText);
  const [isProcessing, setIsProcessing] = useState(false);
  const { state, error, startRecording, stopAndTranscribe, cancelRecording } = useVoiceInput();

  useEffect(() => {
    if (visible) setText(initialText);
  }, [visible, initialText]);

  async function handleClose() {
    await cancelRecording();
    onClose();
  }

  async function handleMicPress() {
    if (state === 'idle') {
      await startRecording();
    } else if (state === 'recording') {
      const result = await stopAndTranscribe();
      if (result) {
        if (processTranscription) {
          setIsProcessing(true);
          try {
            const processed = await processTranscription(result);
            setText((prev) => (prev ? `${prev} ${processed}` : processed));
          } catch {
            setText((prev) => (prev ? `${prev} ${result}` : result));
          } finally {
            setIsProcessing(false);
          }
        } else {
          setText((prev) => (prev ? `${prev} ${result}` : result));
        }
      }
    }
  }

  function handleConfirm() {
    const trimmed = text.trim();
    if (trimmed) onConfirm(trimmed);
  }

  const isRecording = state === 'recording';
  const isTranscribing = state === 'transcribing';
  const canConfirm = !!text.trim() && state === 'idle' && !isProcessing;

  const statusText = isRecording
    ? 'Aufnahme läuft – Taste zum Stoppen'
    : isTranscribing
      ? 'Transkribiere …'
      : isProcessing
        ? 'Verarbeite …'
        : 'Tippe auf das Mikrofon zum Sprechen';

  return (
    <Modal visible={visible} transparent animationType="slide" onRequestClose={() => void handleClose()}>
      <KeyboardAvoidingView
        style={styles.overlay}
        behavior={Platform.OS === 'ios' ? 'padding' : undefined}>
        <Pressable style={styles.backdrop} onPress={() => void handleClose()} />
        <View
          style={[
            styles.sheet,
            {
              backgroundColor: theme.background,
              borderColor: colorScheme === 'dark' ? '#3d3d5c' : '#e0e0e8',
            },
          ]}>
          <Text style={[styles.sheetTitle, { color: theme.text }]}>{title}</Text>

          <TextInput
            style={[
              styles.input,
              {
                color: theme.text,
                borderColor: colorScheme === 'dark' ? '#3d3d5c' : '#e0e0e8',
                backgroundColor: colorScheme === 'dark' ? '#252540' : '#f8f8fc',
              },
            ]}
            placeholder={placeholder}
            placeholderTextColor={colorScheme === 'dark' ? '#888' : '#999'}
            value={text}
            onChangeText={setText}
            multiline
            textAlignVertical="top"
            editable={!isTranscribing}
          />

          <View style={styles.micArea}>
            {isTranscribing || isProcessing ? (
              <View style={[styles.micButton, { borderColor: profileColor, backgroundColor: `${profileColor}18` }]}>
                <ActivityIndicator size="large" color={profileColor} />
              </View>
            ) : (
              <Pressable
                onPress={() => void handleMicPress()}
                style={({ pressed }) => [
                  styles.micButton,
                  {
                    backgroundColor: isRecording ? '#fee2e2' : `${profileColor}18`,
                    borderColor: isRecording ? '#ef4444' : profileColor,
                    opacity: pressed ? 0.8 : 1,
                  },
                ]}>
                <Ionicons
                  name={isRecording ? 'stop-circle' : 'mic'}
                  size={36}
                  color={isRecording ? '#ef4444' : profileColor}
                />
              </Pressable>
            )}
            <Text style={styles.statusText}>{statusText}</Text>
            {error ? <Text style={styles.errorText}>{error}</Text> : null}
          </View>

          <View style={styles.actionsRow}>
            <Pressable
              onPress={() => void handleClose()}
              style={({ pressed }) => [styles.btn, styles.btnCancel, { opacity: pressed ? 0.75 : 1 }]}>
              <Text style={[styles.btnCancelText, { color: theme.text }]}>Abbrechen</Text>
            </Pressable>
            <Pressable
              onPress={handleConfirm}
              disabled={!canConfirm}
              style={({ pressed }) => [
                styles.btn,
                styles.btnConfirm,
                { backgroundColor: profileColor, opacity: pressed || !canConfirm ? 0.5 : 1 },
              ]}>
              <Text style={styles.btnConfirmText}>Bestätigen</Text>
            </Pressable>
          </View>
        </View>
      </KeyboardAvoidingView>
    </Modal>
  );
}

const styles = StyleSheet.create({
  overlay: {
    flex: 1,
    justifyContent: 'flex-end',
  },
  backdrop: {
    ...StyleSheet.absoluteFillObject,
    backgroundColor: 'rgba(0,0,0,0.45)',
  },
  sheet: {
    borderTopLeftRadius: 24,
    borderTopRightRadius: 24,
    borderWidth: 1,
    borderBottomWidth: 0,
    padding: 24,
    gap: 16,
  },
  sheetTitle: {
    fontSize: 18,
    fontWeight: '700',
    textAlign: 'center',
  },
  input: {
    borderWidth: 1.5,
    borderRadius: 14,
    paddingHorizontal: 16,
    paddingVertical: 14,
    fontSize: 16,
    minHeight: 100,
  },
  micArea: {
    alignItems: 'center',
    gap: 8,
  },
  micButton: {
    width: 72,
    height: 72,
    borderRadius: 36,
    alignItems: 'center',
    justifyContent: 'center',
    borderWidth: 2,
  },
  statusText: {
    fontSize: 13,
    color: '#888',
    textAlign: 'center',
  },
  errorText: {
    fontSize: 13,
    color: '#ef4444',
    textAlign: 'center',
  },
  actionsRow: {
    flexDirection: 'row',
    gap: 12,
  },
  btn: {
    flex: 1,
    alignItems: 'center',
    justifyContent: 'center',
    paddingVertical: 14,
    borderRadius: 14,
  },
  btnCancel: {
    borderWidth: 1.5,
    borderColor: '#d0d0d8',
  },
  btnCancelText: {
    fontSize: 15,
    fontWeight: '600',
  },
  btnConfirm: {
    borderWidth: 0,
  },
  btnConfirmText: {
    fontSize: 15,
    fontWeight: '700',
    color: '#fff',
  },
});
