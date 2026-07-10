import { AudioModule, RecordingPresets, useAudioRecorder } from 'expo-audio';
import { useCallback, useState } from 'react';

const GROQ_API_KEY = process.env.EXPO_PUBLIC_GROQ_API_KEY ?? '';

export type VoiceInputState = 'idle' | 'recording' | 'transcribing';

export function useVoiceInput() {
  const [state, setState] = useState<VoiceInputState>('idle');
  const [error, setError] = useState<string | null>(null);
  const recorder = useAudioRecorder(RecordingPresets.HIGH_QUALITY);

  const startRecording = useCallback(async (): Promise<boolean> => {
    setError(null);
    try {
      const { granted } = await AudioModule.requestRecordingPermissionsAsync();
      if (!granted) {
        setError('Mikrofon-Zugriff wurde verweigert.');
        return false;
      }

      await recorder.prepareToRecordAsync();
      recorder.record();
      setState('recording');
      return true;
    } catch (err) {
      setError(err instanceof Error ? err.message : 'Aufnahme konnte nicht gestartet werden.');
      return false;
    }
  }, [recorder]);

  const stopAndTranscribe = useCallback(async (): Promise<string | null> => {
    try {
      await recorder.stop();
      const uri = recorder.uri;
      setState('transcribing');

      if (!uri) {
        setError('Keine Audiodatei gefunden.');
        setState('idle');
        return null;
      }

      const formData = new FormData();
      formData.append('file', { uri, type: 'audio/m4a', name: 'voice.m4a' } as unknown as Blob);
      formData.append('model', 'whisper-large-v3');
      formData.append('language', 'de');

      const response = await fetch('https://api.groq.com/openai/v1/audio/transcriptions', {
        method: 'POST',
        headers: { Authorization: `Bearer ${GROQ_API_KEY}` },
        body: formData,
      });

      if (!response.ok) {
        throw new Error(`API-Fehler ${response.status}: ${await response.text()}`);
      }

      const result = (await response.json()) as { text: string };
      setState('idle');
      return result.text?.trim() ?? '';
    } catch (err) {
      setError(err instanceof Error ? err.message : 'Transkription fehlgeschlagen.');
      setState('idle');
      return null;
    }
  }, [recorder]);

  const cancelRecording = useCallback(async () => {
    try {
      if (recorder.isRecording) {
        await recorder.stop();
      }
    } catch {}
    setState('idle');
    setError(null);
  }, [recorder]);

  return { state, error, startRecording, stopAndTranscribe, cancelRecording };
}
