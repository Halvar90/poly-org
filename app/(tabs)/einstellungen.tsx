import { Ionicons } from '@expo/vector-icons';
import { useFocusEffect } from 'expo-router';
import { useCallback, useEffect, useState } from 'react';
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
import { GLOBAL_AWAY_COLOR, USER_PALETTES } from '@/constants/UserPalettes';
import Colors from '@/constants/Colors';
import { useAuth } from '@/contexts/AuthProvider';
import { Alert } from '@/lib/alert';
import { supabase } from '@/lib/supabase';

type Household = {
  id: string;
  name: string;
  invite_code: string;
};

type HouseholdMember = {
  id: string;
  username: string;
  color_code: string;
};

function generateInviteCode() {
  const chars = 'ABCDEFGHJKLMNPQRSTUVWXYZ23456789'; // ohne O/0/I/1
  let code = '';
  for (let i = 0; i < 6; i++) {
    code += chars[Math.floor(Math.random() * chars.length)];
  }
  return code;
}

export default function EinstellungenScreen() {
  const colorScheme = useColorScheme() ?? 'light';
  const theme = Colors[colorScheme];
  const { profile, user, refreshProfile } = useAuth();

  const [username, setUsername] = useState('');
  const [colorCode, setColorCode] = useState<string>(USER_PALETTES[0].primary);
  const [themePreference, setThemePreference] = useState<'system' | 'light' | 'dark'>('system');
  const [takenPalettePrimaries, setTakenPalettePrimaries] = useState<Set<string>>(new Set());

  const [isSaving, setIsSaving] = useState(false);
  const [isSigningOut, setIsSigningOut] = useState(false);

  const [household, setHousehold] = useState<Household | null>(null);
  const [householdMembers, setHouseholdMembers] = useState<HouseholdMember[]>([]);
  const [inviteCodeInput, setInviteCodeInput] = useState('');
  const [isHouseholdSaving, setIsHouseholdSaving] = useState(false);
  const [householdError, setHouseholdError] = useState<string | null>(null);
  const [isEditingHouseholdName, setIsEditingHouseholdName] = useState(false);
  const [householdNameInput, setHouseholdNameInput] = useState('');

  useEffect(() => {
    if (profile) {
      setUsername(profile.username);
      setColorCode(profile.color_code);
      setThemePreference(profile.theme_preference ?? 'system');
    }
  }, [profile?.id, profile?.username, profile?.color_code, profile?.theme_preference]);

  const selectedPalette = USER_PALETTES.find((palette) => palette.primary === colorCode) ?? null;

  function clampColorChannel(value: number) {
    return Math.max(0, Math.min(255, Math.round(value)));
  }

  function hexToRgb(hex: string) {
    const value = hex.replace('#', '').trim();
    const normalized =
      value.length === 3
        ? value
            .split('')
            .map((char) => `${char}${char}`)
            .join('')
        : value;

    if (normalized.length !== 6) {
      return { r: 37, g: 99, b: 235 };
    }

    const r = Number.parseInt(normalized.slice(0, 2), 16);
    const g = Number.parseInt(normalized.slice(2, 4), 16);
    const b = Number.parseInt(normalized.slice(4, 6), 16);

    if ([r, g, b].some((channel) => Number.isNaN(channel))) {
      return { r: 37, g: 99, b: 235 };
    }

    return { r, g, b };
  }

  function rgbToHex(r: number, g: number, b: number) {
    return `#${[r, g, b]
      .map((channel) => clampColorChannel(channel).toString(16).padStart(2, '0'))
      .join('')}`;
  }

  function shadeHexColor(hex: string, factor: number) {
    const { r, g, b } = hexToRgb(hex);
    const amount = Math.max(-1, Math.min(1, factor));

    if (amount >= 0) {
      return rgbToHex(
        r + (255 - r) * amount,
        g + (255 - g) * amount,
        b + (255 - b) * amount,
      );
    }

    const darken = 1 + amount;
    return rgbToHex(r * darken, g * darken, b * darken);
  }

  useFocusEffect(
    useCallback(() => {
      let isMounted = true;

      async function loadTakenPalettes() {
        const currentUserId = user?.id;
        if (!currentUserId) {
          if (isMounted) setTakenPalettePrimaries(new Set());
          return;
        }

        const { data, error } = await supabase
          .from('profiles')
          .select('id, color_code')
          .neq('id', currentUserId);

        if (error || !isMounted) {
          return;
        }

        const taken = new Set<string>();
        for (const row of (data as Array<{ id: string; color_code: string }>) ?? []) {
          if (USER_PALETTES.some((palette) => palette.primary === row.color_code)) {
            taken.add(row.color_code);
          }
        }

        setTakenPalettePrimaries(taken);
      }

      void loadTakenPalettes();

      return () => {
        isMounted = false;
      };
    }, [user?.id]),
  );

  const loadHouseholdInfo = useCallback(async () => {
    if (!profile?.household_id) {
      setHousehold(null);
      setHouseholdMembers([]);
      return;
    }

    const { data: householdData, error: householdFetchError } = await supabase
      .from('households')
      .select('id, name, invite_code')
      .eq('id', profile.household_id)
      .maybeSingle();

    if (householdFetchError) {
      // Bei einem transienten Fehler (z. B. Token-Refresh nach App-Resume noch
      // nicht abgeschlossen) den bisherigen Stand behalten statt den Haushalt
      // fälschlich als "verlassen" anzuzeigen.
      console.warn('Haushalt konnte nicht geladen werden:', householdFetchError.message);
    } else {
      setHousehold((householdData as Household | null) ?? null);
    }

    const { data: memberData, error: membersFetchError } = await supabase
      .from('profiles')
      .select('id, username, color_code')
      .eq('household_id', profile.household_id);

    if (membersFetchError) {
      console.warn('Haushaltsmitglieder konnten nicht geladen werden:', membersFetchError.message);
    } else {
      setHouseholdMembers((memberData as HouseholdMember[] | null) ?? []);
    }
  }, [profile?.household_id]);

  useFocusEffect(
    useCallback(() => {
      void loadHouseholdInfo();
    }, [loadHouseholdInfo]),
  );

  async function handleCreateHousehold() {
    if (!user?.id) return;

    setIsHouseholdSaving(true);
    setHouseholdError(null);

    try {
      let created: Household | null = null;

      for (let attempt = 0; attempt < 5 && !created; attempt++) {
        const { data, error } = await supabase
          .from('households')
          .insert({
            name: `${username.trim() || 'Unser'} Haushalt`,
            invite_code: generateInviteCode(),
            created_by: user.id,
          })
          .select('id, name, invite_code')
          .single();

        if (!error) {
          created = data as Household;
        } else if (error.code !== '23505') {
          throw error;
        }
      }

      if (!created) throw new Error('Einladungscode konnte nicht erzeugt werden. Bitte erneut versuchen.');

      const { error: updateError } = await supabase
        .from('profiles')
        .update({ household_id: created.id })
        .eq('id', user.id);

      if (updateError) throw updateError;

      await refreshProfile();
      setHousehold(created);
    } catch (error) {
      const message = error instanceof Error ? error.message : 'Haushalt konnte nicht erstellt werden.';
      setHouseholdError(message);
    } finally {
      setIsHouseholdSaving(false);
    }
  }

  async function handleJoinHousehold() {
    const code = inviteCodeInput.trim().toUpperCase();
    if (!code || !user?.id) return;

    setIsHouseholdSaving(true);
    setHouseholdError(null);

    try {
      const { data: foundHousehold, error } = await supabase
        .from('households')
        .select('id, name, invite_code')
        .eq('invite_code', code)
        .maybeSingle();

      if (error) throw error;
      if (!foundHousehold) {
        setHouseholdError('Kein Haushalt mit diesem Code gefunden.');
        return;
      }

      const { error: updateError } = await supabase
        .from('profiles')
        .update({ household_id: foundHousehold.id })
        .eq('id', user.id);

      if (updateError) throw updateError;

      setInviteCodeInput('');
      await refreshProfile();
      setHousehold(foundHousehold as Household);
    } catch (error) {
      const message = error instanceof Error ? error.message : 'Beitritt fehlgeschlagen.';
      setHouseholdError(message);
    } finally {
      setIsHouseholdSaving(false);
    }
  }

  function startEditHouseholdName() {
    if (!household) return;
    setHouseholdNameInput(household.name);
    setIsEditingHouseholdName(true);
  }

  async function saveHouseholdName() {
    if (!household) return;
    const trimmedName = householdNameInput.trim();

    if (!trimmedName) {
      setHouseholdError('Name darf nicht leer sein.');
      return;
    }

    setIsHouseholdSaving(true);
    setHouseholdError(null);

    try {
      const { error } = await supabase
        .from('households')
        .update({ name: trimmedName })
        .eq('id', household.id);

      if (error) throw error;

      setHousehold({ ...household, name: trimmedName });
      setIsEditingHouseholdName(false);
    } catch (error) {
      const message = error instanceof Error ? error.message : 'Name konnte nicht gespeichert werden.';
      setHouseholdError(message);
    } finally {
      setIsHouseholdSaving(false);
    }
  }

  function confirmLeaveHousehold() {
    Alert.alert('Haushalt verlassen?', 'Andere Mitglieder koennen dir dann keine Aufgaben mehr zuweisen.', [
      { text: 'Abbrechen', style: 'cancel' },
      { text: 'Verlassen', style: 'destructive', onPress: () => void handleLeaveHousehold() },
    ]);
  }

  async function handleLeaveHousehold() {
    if (!user?.id) return;

    setIsHouseholdSaving(true);
    setHouseholdError(null);

    try {
      const { error } = await supabase
        .from('profiles')
        .update({ household_id: null })
        .eq('id', user.id);

      if (error) throw error;

      await refreshProfile();
      setHousehold(null);
      setHouseholdMembers([]);
    } catch (error) {
      const message = error instanceof Error ? error.message : 'Haushalt konnte nicht verlassen werden.';
      setHouseholdError(message);
    } finally {
      setIsHouseholdSaving(false);
    }
  }

  async function handleSaveProfile() {
    const trimmedUsername = username.trim();

    if (!trimmedUsername) {
      Alert.alert('Eingabe prüfen', 'Bitte einen Namen eingeben.');
      return;
    }

    if (!user?.id) {
      Alert.alert('Fehler', 'Kein eingeloggter User gefunden.');
      return;
    }

    const userId = user.id;

    if (takenPalettePrimaries.has(colorCode) && profile?.color_code !== colorCode) {
      Alert.alert('Farbpalette belegt', 'Diese Palette wird bereits von einer anderen Person genutzt.');
      return;
    }

    setIsSaving(true);

    try {
      const updatePayload: {
        username: string;
        color_code: string;
        theme_preference: 'system' | 'light' | 'dark';
      } = {
        username: trimmedUsername,
        color_code: colorCode,
        theme_preference: themePreference,
      };

      const { error } = await supabase
        .from('profiles')
        .update(updatePayload)
        .eq('id', userId);

      if (error) throw error;

      await refreshProfile();
      Alert.alert('Erfolg', 'Profil aktualisiert!');
    } catch (error) {
      const message =
        error instanceof Error ? error.message : 'Profil konnte nicht gespeichert werden.';
      Alert.alert('Fehler', message);
    } finally {
      setIsSaving(false);
    }
  }

  async function handleSignOut() {
    setIsSigningOut(true);

    try {
      const { error } = await supabase.auth.signOut();
      if (error) throw error;
    } catch (error) {
      const message =
        error instanceof Error ? error.message : 'Abmelden fehlgeschlagen.';
      Alert.alert('Fehler', message);
    } finally {
      setIsSigningOut(false);
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
        <Text style={[styles.title, { color: theme.text }]}>Mein Profil</Text>
        <Text style={styles.subtitle}>
          Passe Name, Farben und Darstellung an.
        </Text>

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
            value={username}
            onChangeText={setUsername}
            autoCapitalize="words"
            autoCorrect={false}
          />
        </View>

        <View style={styles.colorSection}>
          <Text style={[styles.label, { color: theme.text }]}>Deine Palette</Text>
          <Text style={styles.colorHint}>Eine Palette ist exklusiv pro Nutzer:in reserviert.</Text>
          <View style={styles.paletteList}>
            {USER_PALETTES.map((palette) => {
              const isSelected = colorCode === palette.primary;
              const isTaken = takenPalettePrimaries.has(palette.primary);
              const isBlocked = isTaken && !isSelected;

              return (
                <Pressable
                  key={palette.key}
                  accessibilityLabel={`Palette ${palette.name}`}
                  accessibilityState={{ selected: isSelected, disabled: isBlocked }}
                  onPress={() => {
                    if (!isBlocked) setColorCode(palette.primary);
                  }}
                  style={({ pressed }) => [
                    styles.paletteCard,
                    {
                      borderColor: isSelected ? palette.primary : colorScheme === 'dark' ? '#3d3d5c' : '#e0e0e8',
                      backgroundColor: colorScheme === 'dark' ? '#252540' : '#f8f8fc',
                      opacity: isBlocked ? 0.45 : pressed ? 0.85 : 1,
                    },
                  ]}>
                  <View style={styles.paletteSwatchRow}>
                    <View style={[styles.paletteSwatch, { backgroundColor: shadeHexColor(palette.primary, -0.22) }]} />
                    <View style={[styles.paletteSwatch, { backgroundColor: shadeHexColor(palette.primary, 0.3) }]} />
                    <View style={[styles.paletteSwatch, { backgroundColor: GLOBAL_AWAY_COLOR }]} />
                  </View>

                  <View style={styles.paletteTextWrap}>
                    <Text style={[styles.paletteName, { color: theme.text }]}>{palette.name}</Text>
                    <Text style={styles.paletteHint}>Termin dunkel / Aufgabe hell / Abwesenheit rot</Text>
                  </View>

                  {isBlocked ? (
                    <Ionicons name="lock-closed-outline" size={18} color={theme.text} />
                  ) : isSelected ? (
                    <Ionicons name="checkmark-circle" size={20} color={palette.primary} />
                  ) : null}
                </Pressable>
              );
            })}
          </View>
          <Text style={[styles.colorCode, { color: theme.text }]}> 
            Aktive Hauptfarbe: {selectedPalette?.primary ?? colorCode}
          </Text>
        </View>

        <View style={styles.colorSection}>
          <Text style={[styles.label, { color: theme.text }]}>Darstellung</Text>
          <Text style={styles.colorHint}>System oder manuell Hell/Dunkel.</Text>
          <View style={styles.themeRow}>
            {([
              { key: 'system', label: 'System', icon: 'phone-portrait-outline' },
              { key: 'light', label: 'Hell', icon: 'sunny-outline' },
              { key: 'dark', label: 'Dunkel', icon: 'moon-outline' },
            ] as const).map((option) => {
              const isSelected = themePreference === option.key;
              return (
                <Pressable
                  key={option.key}
                  onPress={() => setThemePreference(option.key)}
                  style={({ pressed }) => [
                    styles.themeOption,
                    {
                      borderColor: isSelected ? colorCode : colorScheme === 'dark' ? '#3d3d5c' : '#e0e0e8',
                      backgroundColor: isSelected ? `${colorCode}20` : colorScheme === 'dark' ? '#252540' : '#f8f8fc',
                      opacity: pressed ? 0.85 : 1,
                    },
                  ]}>
                  <Ionicons name={option.icon} size={16} color={isSelected ? colorCode : theme.text} />
                  <Text style={[styles.themeOptionText, { color: isSelected ? colorCode : theme.text }]}>
                    {option.label}
                  </Text>
                </Pressable>
              );
            })}
          </View>
        </View>

        <View style={styles.colorSection}>
          <Text style={[styles.label, { color: theme.text }]}>Haushalt</Text>
          <Text style={styles.colorHint}>
            Verbinde dich mit deinem Haushalt, um Aufgaben und Erinnerungen gezielt zuweisen zu koennen.
          </Text>

          {householdError ? <Text style={styles.householdErrorText}>{householdError}</Text> : null}

          {household ? (
            <View
              style={[
                styles.householdCard,
                {
                  borderColor: colorScheme === 'dark' ? '#3d3d5c' : '#e0e0e8',
                  backgroundColor: colorScheme === 'dark' ? '#252540' : '#f8f8fc',
                },
              ]}>
              {isEditingHouseholdName ? (
                <View style={styles.householdNameEditRow}>
                  <TextInput
                    style={[
                      styles.input,
                      styles.householdNameInput,
                      {
                        color: theme.text,
                        borderColor: colorScheme === 'dark' ? '#3d3d5c' : '#e0e0e8',
                        backgroundColor: colorScheme === 'dark' ? '#1e1e33' : '#fff',
                      },
                    ]}
                    value={householdNameInput}
                    onChangeText={setHouseholdNameInput}
                    placeholder="Name des Haushalts"
                    placeholderTextColor={colorScheme === 'dark' ? '#888' : '#999'}
                    autoFocus
                  />
                  <Pressable
                    onPress={() => {
                      if (!isHouseholdSaving) void saveHouseholdName();
                    }}
                    disabled={isHouseholdSaving}
                    style={({ pressed }) => [styles.householdNameIconBtn, { opacity: pressed ? 0.7 : 1 }]}>
                    {isHouseholdSaving ? (
                      <ActivityIndicator size="small" color={colorCode} />
                    ) : (
                      <Ionicons name="checkmark-circle" size={26} color={colorCode} />
                    )}
                  </Pressable>
                  <Pressable
                    onPress={() => setIsEditingHouseholdName(false)}
                    disabled={isHouseholdSaving}
                    style={({ pressed }) => [styles.householdNameIconBtn, { opacity: pressed ? 0.7 : 1 }]}>
                    <Ionicons name="close-circle" size={26} color="#999" />
                  </Pressable>
                </View>
              ) : (
                <View style={styles.householdNameRow}>
                  <Text style={[styles.householdName, { color: theme.text }]}>{household.name}</Text>
                  <Pressable
                    onPress={startEditHouseholdName}
                    style={({ pressed }) => [styles.householdNameIconBtn, { opacity: pressed ? 0.7 : 1 }]}
                    accessibilityLabel="Haushaltsnamen bearbeiten">
                    <Ionicons name="create-outline" size={18} color={theme.text} opacity={0.6} />
                  </Pressable>
                </View>
              )}

              <View style={styles.householdCodeRow}>
                <Text style={styles.householdCodeLabel}>Einladungscode</Text>
                <Text style={[styles.householdCode, { color: colorCode }]}>{household.invite_code}</Text>
              </View>
              <Text style={styles.colorHint}>Teile diesen Code, damit weitere Personen beitreten koennen.</Text>

              <View style={styles.householdMembersWrap}>
                {householdMembers.map((member) => (
                  <View key={member.id} style={styles.householdMemberChip}>
                    <View style={[styles.householdMemberDot, { backgroundColor: member.color_code }]} />
                    <Text style={[styles.householdMemberName, { color: theme.text }]}>{member.username}</Text>
                  </View>
                ))}
              </View>

              <Pressable
                onPress={confirmLeaveHousehold}
                disabled={isHouseholdSaving}
                style={({ pressed }) => [
                  styles.leaveHouseholdButton,
                  { opacity: pressed || isHouseholdSaving ? 0.75 : 1 },
                ]}>
                <Ionicons name="exit-outline" size={16} color="#d9534f" />
                <Text style={styles.leaveHouseholdText}>Haushalt verlassen</Text>
              </Pressable>
            </View>
          ) : (
            <View style={styles.householdSetupWrap}>
              <Pressable
                onPress={() => {
                  if (!isHouseholdSaving) void handleCreateHousehold();
                }}
                disabled={isHouseholdSaving}
                style={({ pressed }) => [
                  styles.householdActionButton,
                  {
                    backgroundColor: colorCode,
                    opacity: pressed || isHouseholdSaving ? 0.85 : 1,
                  },
                ]}>
                {isHouseholdSaving ? (
                  <ActivityIndicator color="#fff" />
                ) : (
                  <>
                    <Ionicons name="home-outline" size={18} color="#fff" />
                    <Text style={styles.householdActionButtonText}>Haushalt erstellen</Text>
                  </>
                )}
              </Pressable>

              <Text style={[styles.colorHint, { textAlign: 'center', marginBottom: 0 }]}>oder</Text>

              <View style={styles.householdJoinRow}>
                <TextInput
                  style={[
                    styles.input,
                    styles.householdJoinInput,
                    {
                      color: theme.text,
                      borderColor: colorScheme === 'dark' ? '#3d3d5c' : '#e0e0e8',
                      backgroundColor: colorScheme === 'dark' ? '#252540' : '#f8f8fc',
                    },
                  ]}
                  placeholder="Einladungscode"
                  placeholderTextColor={colorScheme === 'dark' ? '#888' : '#999'}
                  value={inviteCodeInput}
                  onChangeText={setInviteCodeInput}
                  autoCapitalize="characters"
                  autoCorrect={false}
                  maxLength={6}
                />
                <Pressable
                  onPress={() => {
                    if (!isHouseholdSaving) void handleJoinHousehold();
                  }}
                  disabled={isHouseholdSaving || !inviteCodeInput.trim()}
                  style={({ pressed }) => [
                    styles.householdJoinButton,
                    {
                      borderColor: colorCode,
                      opacity: pressed || isHouseholdSaving || !inviteCodeInput.trim() ? 0.6 : 1,
                    },
                  ]}>
                  <Text style={[styles.householdJoinButtonText, { color: colorCode }]}>Beitreten</Text>
                </Pressable>
              </View>
            </View>
          )}
        </View>

        <View style={styles.buttonGroup}>
          <Pressable
            style={({ pressed }) => [
              styles.saveButton,
              {
                backgroundColor: colorCode,
                opacity: pressed || isSaving ? 0.85 : 1,
              },
            ]}
            onPress={handleSaveProfile}
            disabled={isSaving}>
            {isSaving ? (
              <ActivityIndicator color="#fff" />
            ) : (
              <>
                <Ionicons name="save-outline" size={20} color="#fff" />
                <Text style={styles.saveButtonText}>Profil speichern</Text>
              </>
            )}
          </Pressable>

          <Pressable
            style={({ pressed }) => [
              styles.signOutButton,
              {
                borderColor: '#d9534f',
                opacity: pressed || isSigningOut ? 0.85 : 1,
              },
            ]}
            onPress={handleSignOut}
            disabled={isSigningOut}>
            {isSigningOut ? (
              <ActivityIndicator color="#d9534f" />
            ) : (
              <>
                <Ionicons name="log-out-outline" size={20} color="#d9534f" />
                <Text style={styles.signOutButtonText}>Abmelden</Text>
              </>
            )}
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
  formSection: {
    marginBottom: 24,
  },
  colorSection: {
    marginBottom: 28,
  },
  colorHint: {
    fontSize: 13,
    color: '#888',
    marginBottom: 14,
  },
  colorPickerRow: {
    flexDirection: 'row',
    gap: 12,
    paddingVertical: 4,
    paddingHorizontal: 2,
  },
  paletteList: {
    gap: 10,
  },
  paletteCard: {
    borderWidth: 1.5,
    borderRadius: 12,
    paddingVertical: 10,
    paddingHorizontal: 10,
    flexDirection: 'row',
    alignItems: 'center',
    gap: 10,
  },
  paletteSwatchRow: {
    flexDirection: 'row',
    gap: 6,
  },
  paletteSwatch: {
    width: 16,
    height: 16,
    borderRadius: 5,
  },
  paletteTextWrap: {
    flex: 1,
    gap: 2,
  },
  paletteName: {
    fontSize: 13,
    fontWeight: '700',
  },
  paletteHint: {
    fontSize: 11,
    color: '#888',
  },
  themeRow: {
    flexDirection: 'row',
    gap: 10,
  },
  themeOption: {
    flex: 1,
    borderWidth: 1.5,
    borderRadius: 12,
    paddingVertical: 10,
    paddingHorizontal: 10,
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'center',
    gap: 6,
  },
  themeOptionText: {
    fontSize: 12,
    fontWeight: '700',
  },
  colorOptionOuter: {
    width: 48,
    height: 48,
    borderRadius: 24,
    alignItems: 'center',
    justifyContent: 'center',
    borderWidth: 2,
    borderColor: 'transparent',
  },
  colorOptionOuterSelected: {
    borderColor: '#1a1a2e',
    borderWidth: 3,
  },
  colorOption: {
    width: 38,
    height: 38,
    borderRadius: 19,
    alignItems: 'center',
    justifyContent: 'center',
  },
  colorCode: {
    marginTop: 12,
    fontSize: 14,
    fontWeight: '600',
    fontFamily: Platform.OS === 'ios' ? 'Menlo' : 'monospace',
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
  householdErrorText: {
    color: '#d9534f',
    fontSize: 13,
    marginBottom: 10,
  },
  householdCard: {
    borderWidth: 1.5,
    borderRadius: 14,
    padding: 14,
    gap: 10,
  },
  householdName: {
    fontSize: 16,
    fontWeight: '700',
    flex: 1,
  },
  householdNameRow: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 6,
  },
  householdNameEditRow: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 6,
  },
  householdNameInput: {
    flex: 1,
    paddingVertical: 8,
    fontSize: 15,
  },
  householdNameIconBtn: {
    padding: 2,
  },
  householdCodeRow: {
    flexDirection: 'row',
    alignItems: 'baseline',
    gap: 8,
  },
  householdCodeLabel: {
    fontSize: 12,
    color: '#888',
    fontWeight: '600',
  },
  householdCode: {
    fontSize: 20,
    fontWeight: '800',
    letterSpacing: 3,
    fontFamily: Platform.OS === 'ios' ? 'Menlo' : 'monospace',
  },
  householdMembersWrap: {
    flexDirection: 'row',
    flexWrap: 'wrap',
    gap: 8,
  },
  householdMemberChip: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 6,
    paddingHorizontal: 10,
    paddingVertical: 6,
    borderRadius: 999,
    backgroundColor: 'rgba(0,0,0,0.04)',
  },
  householdMemberDot: {
    width: 8,
    height: 8,
    borderRadius: 4,
  },
  householdMemberName: {
    fontSize: 12,
    fontWeight: '600',
  },
  leaveHouseholdButton: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'center',
    gap: 6,
    marginTop: 4,
    paddingVertical: 8,
  },
  leaveHouseholdText: {
    color: '#d9534f',
    fontSize: 13,
    fontWeight: '700',
  },
  householdSetupWrap: {
    gap: 12,
  },
  householdActionButton: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'center',
    gap: 8,
    paddingVertical: 14,
    borderRadius: 14,
    minHeight: 50,
  },
  householdActionButtonText: {
    color: '#fff',
    fontSize: 15,
    fontWeight: '700',
  },
  householdJoinRow: {
    flexDirection: 'row',
    gap: 10,
    alignItems: 'center',
  },
  householdJoinInput: {
    flex: 1,
    textTransform: 'uppercase',
  },
  householdJoinButton: {
    borderWidth: 1.5,
    borderRadius: 14,
    paddingHorizontal: 16,
    paddingVertical: 14,
  },
  householdJoinButtonText: {
    fontSize: 14,
    fontWeight: '700',
  },
  buttonGroup: {
    gap: 12,
  },
  saveButton: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'center',
    gap: 10,
    paddingVertical: 16,
    borderRadius: 14,
    minHeight: 54,
  },
  saveButtonText: {
    color: '#fff',
    fontSize: 16,
    fontWeight: '700',
  },
  signOutButton: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'center',
    gap: 10,
    paddingVertical: 16,
    borderRadius: 14,
    borderWidth: 2,
    marginTop: 8,
  },
  signOutButtonText: {
    color: '#d9534f',
    fontSize: 16,
    fontWeight: '600',
  },
});
