import { Ionicons } from '@expo/vector-icons';
import * as ImagePicker from 'expo-image-picker';
import { useState } from 'react';
import {
  ActivityIndicator,
  Alert,
  Image,
  KeyboardAvoidingView,
  Platform,
  Pressable,
  ScrollView,
  StyleSheet,
  Text,
  TextInput,
  View,
} from 'react-native';

import Colors from '@/constants/Colors';
import { useColorScheme } from '@/components/useColorScheme';

export default function EinstellungenScreen() {
  const colorScheme = useColorScheme() ?? 'light';
  const theme = Colors[colorScheme];

  const [name, setName] = useState('');
  const [avatarUri, setAvatarUri] = useState<string | null>(null);
  const [isLoading, setIsLoading] = useState(false);

  function buildAiAvatarUrl(input: string) {
    const encodedInput = encodeURIComponent(input);
    return `https://image.pollinations.ai/prompt/cute-modern-abstract-avatar-of-${encodedInput}-vibrant-colors-clean-background?width=512&height=512&nologo=true`;
  }

  async function handleUploadPhoto() {
    const permission = await ImagePicker.requestMediaLibraryPermissionsAsync();

    if (!permission.granted) {
      Alert.alert(
        'Zugriff benötigt',
        'Bitte erlaube PolyOrg den Zugriff auf deine Fotogalerie, um ein Profilbild auszuwählen.',
      );
      return;
    }

    const result = await ImagePicker.launchImageLibraryAsync({
      mediaTypes: ['images'],
      allowsEditing: true,
      aspect: [1, 1],
      quality: 0.8,
    });

    if (!result.canceled && result.assets[0]) {
      setIsLoading(true);
      setAvatarUri(result.assets[0].uri);
    }
  }

  function handleCreateAiAvatar() {
    const input = name.trim() || 'Mystery Creature';
    setIsLoading(true);
    setAvatarUri(buildAiAvatarUrl(input));
  }

  function handleImageLoadStart() {
    setIsLoading(true);
  }

  function handleImageLoadEnd() {
    setIsLoading(false);
  }

  function handleImageError() {
    setIsLoading(false);
    Alert.alert(
      'Fehler',
      'Das KI-Bild konnte nicht geladen werden. Bitte versuche es erneut.',
    );
  }

  return (
    <KeyboardAvoidingView
      style={[styles.flex, { backgroundColor: theme.background }]}
      behavior={Platform.OS === 'ios' ? 'padding' : undefined}>
      <ScrollView
        contentContainerStyle={styles.scrollContent}
        keyboardShouldPersistTaps="handled"
        showsVerticalScrollIndicator={false}>
        <Text style={[styles.title, { color: theme.text }]}>Mein Profil</Text>
        <Text style={styles.subtitle}>
          Passe dein Profil für PolyOrg an – Name, eigenes Foto oder einen
          KI-generierten Avatar.
        </Text>

        <View style={styles.avatarSection}>
          <View style={[styles.avatarRing, { borderColor: theme.tint }]}>
            <View style={styles.avatarWrapper}>
              {avatarUri ? (
                <Image
                  source={{ uri: avatarUri }}
                  style={styles.avatarImage}
                  onLoadStart={handleImageLoadStart}
                  onLoadEnd={handleImageLoadEnd}
                  onError={handleImageError}
                />
              ) : (
                <View style={styles.avatarPlaceholder}>
                  <Ionicons name="person" size={56} color={theme.tint} />
                  <Text style={[styles.avatarHint, { color: theme.tint }]}>
                    Avatar
                  </Text>
                </View>
              )}

              {isLoading && (
                <View style={styles.loadingOverlay}>
                  <ActivityIndicator size="large" color={theme.tint} />
                  <Text style={[styles.loadingText, { color: theme.tint }]}>
                    KI malt …
                  </Text>
                </View>
              )}
            </View>
          </View>
        </View>

        <View style={styles.formSection}>
          <Text style={[styles.label, { color: theme.text }]}>Dein Name</Text>
          <TextInput
            style={[
              styles.input,
              {
                color: theme.text,
                borderColor: colorScheme === 'dark' ? '#3d3d5c' : '#e0e0e8',
                backgroundColor: colorScheme === 'dark' ? '#252540' : '#f8f8fc',
              },
            ]}
            placeholder="z. B. Bär, Fuchs oder Rabe"
            placeholderTextColor={colorScheme === 'dark' ? '#888' : '#999'}
            value={name}
            onChangeText={setName}
            autoCapitalize="words"
            autoCorrect={false}
          />
        </View>

        <View style={styles.buttonGroup}>
          <Pressable
            style={({ pressed }) => [
              styles.primaryButton,
              { backgroundColor: theme.tint, opacity: pressed ? 0.85 : 1 },
            ]}
            onPress={handleUploadPhoto}>
            <Ionicons name="image-outline" size={20} color="#fff" />
            <Text style={styles.primaryButtonText}>Eigenes Foto hochladen</Text>
          </Pressable>

          <Pressable
            style={({ pressed }) => [
              styles.secondaryButton,
              {
                borderColor: theme.tint,
                backgroundColor: colorScheme === 'dark' ? '#252540' : '#fff',
                opacity: pressed || isLoading ? 0.85 : 1,
              },
            ]}
            onPress={handleCreateAiAvatar}
            disabled={isLoading}>
            <Ionicons name="sparkles-outline" size={20} color={theme.tint} />
            <Text style={[styles.secondaryButtonText, { color: theme.tint }]}>
              KI-Avatar erstellen
            </Text>
          </Pressable>
        </View>
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
    paddingHorizontal: 24,
    paddingTop: 8,
    paddingBottom: 40,
  },
  title: {
    fontSize: 28,
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
  avatarSection: {
    alignItems: 'center',
    marginBottom: 36,
  },
  avatarRing: {
    width: 140,
    height: 140,
    borderRadius: 70,
    borderWidth: 3,
    padding: 4,
    alignItems: 'center',
    justifyContent: 'center',
  },
  avatarWrapper: {
    width: 128,
    height: 128,
    borderRadius: 64,
    overflow: 'hidden',
    position: 'relative',
  },
  avatarImage: {
    width: 128,
    height: 128,
    borderRadius: 64,
  },
  loadingOverlay: {
    ...StyleSheet.absoluteFillObject,
    backgroundColor: 'rgba(255, 255, 255, 0.75)',
    alignItems: 'center',
    justifyContent: 'center',
    gap: 8,
    borderRadius: 64,
  },
  loadingText: {
    fontSize: 13,
    fontWeight: '600',
  },
  avatarPlaceholder: {
    width: 128,
    height: 128,
    borderRadius: 64,
    backgroundColor: '#f0edf7',
    alignItems: 'center',
    justifyContent: 'center',
    gap: 4,
  },
  avatarHint: {
    fontSize: 13,
    fontWeight: '600',
  },
  formSection: {
    marginBottom: 28,
  },
  label: {
    fontSize: 15,
    fontWeight: '600',
    marginBottom: 8,
  },
  input: {
    borderWidth: 1.5,
    borderRadius: 14,
    paddingHorizontal: 16,
    paddingVertical: 14,
    fontSize: 16,
  },
  buttonGroup: {
    gap: 12,
  },
  primaryButton: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'center',
    gap: 10,
    paddingVertical: 16,
    borderRadius: 14,
  },
  primaryButtonText: {
    color: '#fff',
    fontSize: 16,
    fontWeight: '600',
  },
  secondaryButton: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'center',
    gap: 10,
    paddingVertical: 16,
    borderRadius: 14,
    borderWidth: 2,
  },
  secondaryButtonText: {
    fontSize: 16,
    fontWeight: '600',
  },
});
