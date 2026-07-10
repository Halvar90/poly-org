import { Ionicons } from '@expo/vector-icons';
import { useState } from 'react';
import {
  ActivityIndicator,
  KeyboardAvoidingView,
  Platform,
  Pressable,
  ScrollView,
  StyleSheet,
  Text,
  TextInput,
  View,
} from 'react-native';

import { useColorScheme } from '@/components/useColorScheme';
import Colors from '@/constants/Colors';
import { Alert } from '@/lib/alert';
import { supabase } from '@/lib/supabase';

type AuthMode = 'login' | 'register';

export default function LoginScreen() {
  const colorScheme = useColorScheme() ?? 'light';
  const theme = Colors[colorScheme];

  const [mode, setMode] = useState<AuthMode>('login');
  const [email, setEmail] = useState('');
  const [password, setPassword] = useState('');
  const [isSubmitting, setIsSubmitting] = useState(false);

  const isLogin = mode === 'login';

  async function handleSubmit() {
    const trimmedEmail = email.trim();
    const trimmedPassword = password.trim();

    if (!trimmedEmail || !trimmedPassword) {
      Alert.alert('Eingabe prüfen', 'Bitte E-Mail und Passwort ausfüllen.');
      return;
    }

    if (trimmedPassword.length < 6) {
      Alert.alert('Passwort zu kurz', 'Das Passwort muss mindestens 6 Zeichen haben.');
      return;
    }

    setIsSubmitting(true);

    try {
      if (isLogin) {
        const { error } = await supabase.auth.signInWithPassword({
          email: trimmedEmail,
          password: trimmedPassword,
        });

        if (error) throw error;
      } else {
        const { error } = await supabase.auth.signUp({
          email: trimmedEmail,
          password: trimmedPassword,
          options: {
            data: {
              username: trimmedEmail.split('@')[0],
            },
          },
        });

        if (error) throw error;

        Alert.alert(
          'Registrierung erfolgreich',
          'Falls E-Mail-Bestätigung aktiv ist, prüfe dein Postfach. Ansonsten kannst du dich jetzt anmelden.',
        );
        setMode('login');
      }
    } catch (error) {
      const message =
        error instanceof Error ? error.message : 'Ein unbekannter Fehler ist aufgetreten.';
      Alert.alert(isLogin ? 'Login fehlgeschlagen' : 'Registrierung fehlgeschlagen', message);
    } finally {
      setIsSubmitting(false);
    }
  }

  return (
    <KeyboardAvoidingView
      style={[styles.flex, { backgroundColor: theme.background }]}
      behavior={Platform.OS === 'ios' ? 'padding' : undefined}>
      <ScrollView
        contentContainerStyle={styles.scrollContent}
        keyboardShouldPersistTaps="handled"
        showsVerticalScrollIndicator={false}>
        <Text style={[styles.title, { color: theme.text }]}>PolyOrg</Text>
        <Text style={styles.subtitle}>
          {isLogin
            ? 'Melde dich an, um euren gemeinsamen Kalender zu nutzen.'
            : 'Erstelle ein Konto für PolyOrg.'}
        </Text>

        <View style={styles.toggleRow}>
          <Pressable
            style={[
              styles.toggleButton,
              isLogin && { backgroundColor: theme.tint },
              !isLogin && {
                backgroundColor: colorScheme === 'dark' ? '#252540' : '#f0edf7',
              },
            ]}
            onPress={() => setMode('login')}>
            <Text
              style={[
                styles.toggleText,
                { color: isLogin ? '#fff' : theme.text },
              ]}>
              Login
            </Text>
          </Pressable>

          <Pressable
            style={[
              styles.toggleButton,
              !isLogin && { backgroundColor: theme.tint },
              isLogin && {
                backgroundColor: colorScheme === 'dark' ? '#252540' : '#f0edf7',
              },
            ]}
            onPress={() => setMode('register')}>
            <Text
              style={[
                styles.toggleText,
                { color: !isLogin ? '#fff' : theme.text },
              ]}>
              Registrieren
            </Text>
          </Pressable>
        </View>

        <View style={styles.formSection}>
          <Text style={[styles.label, { color: theme.text }]}>E-Mail</Text>
          <TextInput
            style={[
              styles.input,
              {
                color: theme.text,
                borderColor: colorScheme === 'dark' ? '#3d3d5c' : '#e0e0e8',
                backgroundColor: colorScheme === 'dark' ? '#252540' : '#f8f8fc',
              },
            ]}
            placeholder="name@beispiel.de"
            placeholderTextColor={colorScheme === 'dark' ? '#888' : '#999'}
            value={email}
            onChangeText={setEmail}
            autoCapitalize="none"
            autoCorrect={false}
            keyboardType="email-address"
            textContentType="emailAddress"
          />

          <Text style={[styles.label, { color: theme.text }]}>Passwort</Text>
          <TextInput
            style={[
              styles.input,
              {
                color: theme.text,
                borderColor: colorScheme === 'dark' ? '#3d3d5c' : '#e0e0e8',
                backgroundColor: colorScheme === 'dark' ? '#252540' : '#f8f8fc',
              },
            ]}
            placeholder="Mindestens 6 Zeichen"
            placeholderTextColor={colorScheme === 'dark' ? '#888' : '#999'}
            value={password}
            onChangeText={setPassword}
            secureTextEntry
            autoCapitalize="none"
            autoCorrect={false}
            textContentType={isLogin ? 'password' : 'newPassword'}
          />
        </View>

        <Pressable
          style={({ pressed }) => [
            styles.submitButton,
            { backgroundColor: theme.tint, opacity: pressed || isSubmitting ? 0.85 : 1 },
          ]}
          onPress={handleSubmit}
          disabled={isSubmitting}>
          {isSubmitting ? (
            <ActivityIndicator color="#fff" />
          ) : (
            <>
              <Ionicons
                name={isLogin ? 'log-in-outline' : 'person-add-outline'}
                size={20}
                color="#fff"
              />
              <Text style={styles.submitButtonText}>
                {isLogin ? 'Anmelden' : 'Konto erstellen'}
              </Text>
            </>
          )}
        </Pressable>
      </ScrollView>
    </KeyboardAvoidingView>
  );
}

const styles = StyleSheet.create({
  flex: {
    flex: 1,
  },
  scrollContent: {
    flexGrow: 1,
    justifyContent: 'center',
    paddingHorizontal: 24,
    paddingVertical: 40,
  },
  title: {
    fontSize: 32,
    fontWeight: '700',
    textAlign: 'center',
    marginBottom: 8,
  },
  subtitle: {
    fontSize: 15,
    textAlign: 'center',
    color: '#777',
    lineHeight: 22,
    marginBottom: 32,
    paddingHorizontal: 8,
  },
  toggleRow: {
    flexDirection: 'row',
    gap: 10,
    marginBottom: 28,
  },
  toggleButton: {
    flex: 1,
    paddingVertical: 12,
    borderRadius: 12,
    alignItems: 'center',
  },
  toggleText: {
    fontSize: 15,
    fontWeight: '600',
  },
  formSection: {
    gap: 8,
    marginBottom: 24,
  },
  label: {
    fontSize: 15,
    fontWeight: '600',
    marginTop: 8,
  },
  input: {
    borderWidth: 1.5,
    borderRadius: 14,
    paddingHorizontal: 16,
    paddingVertical: 14,
    fontSize: 16,
  },
  submitButton: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'center',
    gap: 10,
    paddingVertical: 16,
    borderRadius: 14,
    minHeight: 54,
  },
  submitButtonText: {
    color: '#fff',
    fontSize: 16,
    fontWeight: '600',
  },
});
