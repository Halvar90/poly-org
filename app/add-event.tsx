import { Ionicons } from '@expo/vector-icons';
import DateTimePicker, {
  DateTimePickerEvent,
} from '@react-native-community/datetimepicker';
import { router, useLocalSearchParams } from 'expo-router';
import { useEffect, useMemo, useState } from 'react';
import {
  ActivityIndicator,
  KeyboardAvoidingView,
  Platform,
  Pressable,
  ScrollView,
  StyleSheet,
  Switch,
  Text,
  TextInput,
  View,
} from 'react-native';
import { useSafeAreaInsets } from 'react-native-safe-area-context';

import VoiceInputModal from '@/components/VoiceInputModal';
import { useColorScheme } from '@/components/useColorScheme';
import Colors from '@/constants/Colors';
import { useAuth } from '@/contexts/AuthProvider';
import { Alert } from '@/lib/alert';
import { sendPushNotification } from '@/lib/notifications';
import { supabase } from '@/lib/supabase';

type HouseholdMember = {
  id: string;
  username: string;
  color_code: string;
  expo_push_token: string | null;
};

const ENTRY_TYPES = [
  { value: 'termin', label: 'Termin' },
  { value: 'aufgabe', label: 'Aufgabe' },
  { value: 'erinnerung', label: 'Erinnerung' },
  { value: 'abwesenheit', label: 'Abwesenheit' },
] as const;

type EntryTypeValue = (typeof ENTRY_TYPES)[number]['value'];
type RecurrenceRule = 'none' | 'weekly' | 'monthly';

const RECURRENCE_OPTIONS: ReadonlyArray<{ value: RecurrenceRule; label: string }> = [
  { value: 'none', label: 'Keine' },
  { value: 'weekly', label: 'Woechentlich' },
  { value: 'monthly', label: 'Monatlich' },
];

function createDefaultStartDate() {
  const date = new Date();
  date.setMinutes(0, 0, 0);
  date.setHours(date.getHours() + 1);
  return date;
}

function createDefaultEndDate(start: Date) {
  const date = new Date(start);
  date.setHours(23, 59, 0, 0);
  return date;
}

function createStartDateFromParams(dateStr?: string, timeStr?: string): Date {
  const d = dateStr ? new Date(`${dateStr}T00:00:00`) : new Date();
  if (timeStr) {
    const [h, m] = timeStr.split(':').map(Number);
    d.setHours(h ?? 0, m ?? 0, 0, 0);
  } else if (dateStr) {
    d.setHours(10, 0, 0, 0);
  } else {
    d.setMinutes(0, 0, 0);
    d.setHours(d.getHours() + 1);
  }
  return d;
}

export default function AddEventScreen() {
  const params = useLocalSearchParams<{
    entryType?: string | string[];
    initialTitle?: string | string[];
    initialDate?: string | string[];
    initialTime?: string | string[];
    initialAssigneeName?: string | string[];
  }>();
  const rawEntryType = Array.isArray(params.entryType) ? params.entryType[0] : params.entryType;
  const initialEntryType: EntryTypeValue =
    rawEntryType === 'aufgabe' ||
    rawEntryType === 'abwesenheit' ||
    rawEntryType === 'erinnerung' ||
    rawEntryType === 'termin'
      ? rawEntryType
      : 'termin';
  const initialTitle = Array.isArray(params.initialTitle)
    ? (params.initialTitle[0] ?? '')
    : (params.initialTitle ?? '');
  const initialDateStr = Array.isArray(params.initialDate) ? params.initialDate[0] : params.initialDate;
  const initialTimeStr = Array.isArray(params.initialTime) ? params.initialTime[0] : params.initialTime;
  const initialAssigneeName = Array.isArray(params.initialAssigneeName)
    ? params.initialAssigneeName[0]
    : params.initialAssigneeName;

  const colorScheme = useColorScheme() ?? 'light';
  const theme = Colors[colorScheme];
  const insets = useSafeAreaInsets();
  const { user, profile } = useAuth();

  const profileColor = profile?.color_code ?? theme.tint;

  const [title, setTitle] = useState(initialTitle);
  const [description, setDescription] = useState('');
  const [showVoiceModal, setShowVoiceModal] = useState(false);
  const [entryType, setEntryType] = useState<EntryTypeValue>(initialEntryType);
  const [hasReminder, setHasReminder] = useState(false);
  const [recurrenceRule, setRecurrenceRule] = useState<RecurrenceRule>('none');
  const [startDate, setStartDate] = useState(() => createStartDateFromParams(initialDateStr, initialTimeStr));
  const [endDate, setEndDate] = useState(() => createDefaultEndDate(createStartDateFromParams(initialDateStr, initialTimeStr)));
  const [showStartDatePicker, setShowStartDatePicker] = useState(false);
  const [showStartTimePicker, setShowStartTimePicker] = useState(false);
  const [showEndDatePicker, setShowEndDatePicker] = useState(false);
  const [showEndTimePicker, setShowEndTimePicker] = useState(false);
  const [isSaving, setIsSaving] = useState(false);
  const [householdMembers, setHouseholdMembers] = useState<HouseholdMember[]>([]);
  const [assigneeId, setAssigneeId] = useState<string | null>(null);

  useEffect(() => {
    if (!profile?.household_id) return;
    void supabase
      .from('profiles')
      .select('id, username, color_code, expo_push_token')
      .eq('household_id', profile.household_id)
      .neq('id', profile.id)
      .then(({ data }) => {
        const members = (data as HouseholdMember[] | null) ?? [];
        setHouseholdMembers(members);
        if (initialAssigneeName) {
          const lower = initialAssigneeName.toLowerCase();
          const match = members.find((m) => m.username.toLowerCase().includes(lower));
          if (match) setAssigneeId(match.id);
        }
      });
  // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [profile?.household_id, profile?.id]);

  const showStartPickers =
    entryType === 'termin' ||
    entryType === 'abwesenheit' ||
    (entryType === 'aufgabe' && hasReminder);
  const showEndPickers = entryType === 'abwesenheit';
  const canRepeat = entryType === 'termin' || (entryType === 'aufgabe' && hasReminder);

  const screenTitle = useMemo(() => {
    if (entryType === 'aufgabe') return 'Neue Aufgabe';
    if (entryType === 'erinnerung') return 'Neue Erinnerung';
    if (entryType === 'abwesenheit') return 'Abwesenheit';
    return 'Neuer Termin';
  }, [entryType]);

  function handleEntryTypeChange(nextType: EntryTypeValue) {
    setEntryType(nextType);
    if (nextType === 'aufgabe' || nextType === 'erinnerung') {
      setHasReminder(false);
      setRecurrenceRule('none');
    }
    if (nextType === 'abwesenheit') {
      setEndDate(createDefaultEndDate(startDate));
      setRecurrenceRule('none');
    }
  }

  function handleReminderSwitchChange(nextValue: boolean) {
    setHasReminder(nextValue);
    if (!nextValue) {
      setRecurrenceRule('none');
    }
  }

  function handleStartDateChange(_event: DateTimePickerEvent, selectedDate?: Date) {
    if (Platform.OS === 'android') setShowStartDatePicker(false);
    if (!selectedDate) return;

    setStartDate((current) => {
      const next = new Date(current);
      next.setFullYear(selectedDate.getFullYear(), selectedDate.getMonth(), selectedDate.getDate());
      return next;
    });
  }

  function handleStartTimeChange(_event: DateTimePickerEvent, selectedDate?: Date) {
    if (Platform.OS === 'android') setShowStartTimePicker(false);
    if (!selectedDate) return;

    setStartDate((current) => {
      const next = new Date(current);
      next.setHours(selectedDate.getHours(), selectedDate.getMinutes(), 0, 0);
      return next;
    });
  }

  function handleEndDateChange(_event: DateTimePickerEvent, selectedDate?: Date) {
    if (Platform.OS === 'android') setShowEndDatePicker(false);
    if (!selectedDate) return;

    setEndDate((current) => {
      const next = new Date(current);
      next.setFullYear(selectedDate.getFullYear(), selectedDate.getMonth(), selectedDate.getDate());
      return next;
    });
  }

  function handleEndTimeChange(_event: DateTimePickerEvent, selectedDate?: Date) {
    if (Platform.OS === 'android') setShowEndTimePicker(false);
    if (!selectedDate) return;

    setEndDate((current) => {
      const next = new Date(current);
      next.setHours(selectedDate.getHours(), selectedDate.getMinutes(), 0, 0);
      return next;
    });
  }

  async function notifyAssignee(title: string, typeLabel: string) {
    if (!assigneeId) return;
    const assignee = householdMembers.find((m) => m.id === assigneeId);
    if (!assignee?.expo_push_token) return;
    await sendPushNotification(
      assignee.expo_push_token,
      `Neue ${typeLabel} von ${profile?.username ?? 'Jemand'}`,
      title,
    );
  }

  async function handleSave() {
    const trimmedTitle = title.trim();

    if (!trimmedTitle) {
      Alert.alert('Eingabe prüfen', 'Bitte einen Titel eingeben.');
      return;
    }

    if (!user?.id) {
      Alert.alert('Fehler', 'Kein eingeloggter User gefunden.');
      return;
    }

    let startTime: string | null = null;
    let endTime: string | null = null;

    if (entryType === 'termin') {
      startTime = startDate.toISOString();
    } else if (entryType === 'aufgabe') {
      startTime = hasReminder ? startDate.toISOString() : null;
    } else if (entryType === 'erinnerung') {
      startTime = null;
    } else {
      startTime = startDate.toISOString();
      endTime = endDate.toISOString();

      if (new Date(endTime).getTime() < new Date(startTime).getTime()) {
        Alert.alert('Eingabe prüfen', 'Das Enddatum muss nach dem Startdatum liegen.');
        return;
      }
    }

    setIsSaving(true);

    try {
      if (entryType === 'erinnerung') {
        const { error: reminderError } = await supabase.from('reminders').insert({
          title: trimmedTitle,
          description: description.trim() || null,
          creator_id: user.id,
          assignee_id: assigneeId ?? null,
        });

        if (reminderError) throw reminderError;

        await notifyAssignee(trimmedTitle, 'Erinnerung');
        router.back();
        return;
      }

      const { error } = await supabase.from('events').insert({
        title: trimmedTitle,
        description: description.trim() || null,
        entry_type: entryType,
        start_time: startTime,
        end_time: endTime,
        recurrence_rule: canRepeat ? recurrenceRule : 'none',
        creator_id: user.id,
        color_code: profileColor,
        assignee_id: assigneeId ?? null,
      });

      if (error) throw error;

      const typeLabel =
        entryType === 'aufgabe' ? 'Aufgabe' :
        entryType === 'abwesenheit' ? 'Abwesenheit' : 'Termin';
      await notifyAssignee(trimmedTitle, typeLabel);
      router.back();
    } catch (error) {
      const message =
        error instanceof Error
          ? error.message
          : error && typeof error === 'object' && 'message' in error
          ? String((error as { message?: string }).message)
          : 'Eintrag konnte nicht gespeichert werden.';
      console.warn('Event save failed:', error);
      Alert.alert('Fehler beim Speichern', message);
    } finally {
      setIsSaving(false);
    }
  }

  function renderPickerButtons(
    label: string,
    dateValue: Date,
    onDatePress: () => void,
    onTimePress: () => void,
  ) {
    return (
      <View style={styles.pickerGroup}>
        <Text style={[styles.pickerGroupLabel, { color: theme.text }]}>{label}</Text>
        <View style={styles.androidPickerRow}>
          <Pressable
            style={[
              styles.pickerButton,
              {
                borderColor: colorScheme === 'dark' ? '#3d3d5c' : '#e0e0e8',
                backgroundColor: colorScheme === 'dark' ? '#252540' : '#f8f8fc',
              },
            ]}
            onPress={onDatePress}>
            <Ionicons name="calendar-outline" size={18} color={profileColor} />
            <Text style={[styles.pickerButtonText, { color: theme.text }]}>
              {dateValue.toLocaleDateString('de-DE')}
            </Text>
          </Pressable>

          <Pressable
            style={[
              styles.pickerButton,
              {
                borderColor: colorScheme === 'dark' ? '#3d3d5c' : '#e0e0e8',
                backgroundColor: colorScheme === 'dark' ? '#252540' : '#f8f8fc',
              },
            ]}
            onPress={onTimePress}>
            <Ionicons name="time-outline" size={18} color={profileColor} />
            <Text style={[styles.pickerButtonText, { color: theme.text }]}>
              {dateValue.toLocaleTimeString('de-DE', {
                hour: '2-digit',
                minute: '2-digit',
              })}
            </Text>
          </Pressable>
        </View>
      </View>
    );
  }

  return (
    <KeyboardAvoidingView
      style={[styles.flex, { backgroundColor: theme.background }]}
      behavior={Platform.OS === 'ios' ? 'padding' : undefined}>
      <View style={[styles.headerBar, { paddingTop: insets.top + 8 }]}>
        <Pressable
          style={styles.backButton}
          onPress={() => router.back()}
          accessibilityLabel="Zurück">
          <Ionicons name="chevron-back" size={24} color={theme.text} />
        </Pressable>
        <Text style={[styles.headerTitle, { color: theme.text }]}>{screenTitle}</Text>
        <View style={styles.headerSpacer} />
      </View>

      <ScrollView
        contentContainerStyle={styles.scrollContent}
        keyboardShouldPersistTaps="handled"
        showsVerticalScrollIndicator={false}>
        <View style={styles.formSection}>
          <Text style={[styles.label, { color: theme.text }]}>Art</Text>
          <View style={styles.segmentRow}>
            {ENTRY_TYPES.map((option) => {
              const isSelected = entryType === option.value;

              return (
                <Pressable
                  key={option.value}
                  onPress={() => handleEntryTypeChange(option.value)}
                  style={[
                    styles.segmentButton,
                    {
                      borderColor: isSelected ? profileColor : colorScheme === 'dark' ? '#3d3d5c' : '#e0e0e8',
                      backgroundColor: isSelected
                        ? `${profileColor}18`
                        : colorScheme === 'dark'
                          ? '#252540'
                          : '#fff',
                    },
                  ]}>
                  <Text
                    style={[
                      styles.segmentButtonText,
                      { color: isSelected ? profileColor : theme.text },
                    ]}>
                    {option.label}
                  </Text>
                </Pressable>
              );
            })}
          </View>
        </View>

        <View style={styles.formSection}>
          <View style={styles.labelRow}>
            <Text style={[styles.label, { color: theme.text, marginBottom: 0 }]}>Titel</Text>
            <Pressable
              onPress={() => setShowVoiceModal(true)}
              style={({ pressed }) => [styles.micLabelBtn, { opacity: pressed ? 0.7 : 1 }]}
              accessibilityLabel="Titel per Sprache eingeben">
              <Ionicons name="mic-outline" size={18} color={profileColor} />
            </Pressable>
          </View>
          <TextInput
            style={[
              styles.input,
              {
                color: theme.text,
                borderColor: colorScheme === 'dark' ? '#3d3d5c' : '#e0e0e8',
                backgroundColor: colorScheme === 'dark' ? '#252540' : '#f8f8fc',
              },
            ]}
            placeholder="z. B. Arzttermin, Einkauf, Urlaub"
            placeholderTextColor={colorScheme === 'dark' ? '#888' : '#999'}
            value={title}
            onChangeText={setTitle}
          />
        </View>

        <View style={styles.formSection}>
          <Text style={[styles.label, { color: theme.text }]}>Beschreibung (optional)</Text>
          <TextInput
            style={[
              styles.input,
              styles.textArea,
              {
                color: theme.text,
                borderColor: colorScheme === 'dark' ? '#3d3d5c' : '#e0e0e8',
                backgroundColor: colorScheme === 'dark' ? '#252540' : '#f8f8fc',
              },
            ]}
            placeholder="Weitere Details …"
            placeholderTextColor={colorScheme === 'dark' ? '#888' : '#999'}
            value={description}
            onChangeText={setDescription}
            multiline
            textAlignVertical="top"
          />
        </View>

        {householdMembers.length > 0 && (
          <View style={styles.formSection}>
            <Text style={[styles.label, { color: theme.text }]}>Für wen?</Text>
            <ScrollView horizontal showsHorizontalScrollIndicator={false}>
              <View style={styles.assigneeRow}>
                <Pressable
                  onPress={() => setAssigneeId(null)}
                  style={[
                    styles.assigneeChip,
                    {
                      borderColor: assigneeId === null ? profileColor : colorScheme === 'dark' ? '#3d3d5c' : '#e0e0e8',
                      backgroundColor: assigneeId === null ? `${profileColor}18` : colorScheme === 'dark' ? '#252540' : '#fff',
                    },
                  ]}>
                  <Text style={[styles.assigneeChipText, { color: assigneeId === null ? profileColor : theme.text }]}>
                    Mich
                  </Text>
                </Pressable>

                {householdMembers.map((member) => {
                  const isSelected = assigneeId === member.id;
                  return (
                    <Pressable
                      key={member.id}
                      onPress={() => setAssigneeId(isSelected ? null : member.id)}
                      style={[
                        styles.assigneeChip,
                        {
                          borderColor: isSelected ? member.color_code : colorScheme === 'dark' ? '#3d3d5c' : '#e0e0e8',
                          backgroundColor: isSelected ? `${member.color_code}18` : colorScheme === 'dark' ? '#252540' : '#fff',
                        },
                      ]}>
                      <View style={[styles.assigneeAvatar, { backgroundColor: member.color_code }]}>
                        <Text style={styles.assigneeAvatarText}>
                          {member.username.charAt(0).toUpperCase()}
                        </Text>
                      </View>
                      <Text style={[styles.assigneeChipText, { color: isSelected ? member.color_code : theme.text }]}>
                        {member.username}
                      </Text>
                    </Pressable>
                  );
                })}
              </View>
            </ScrollView>
            {assigneeId && (
              <Text style={[styles.assigneeHint, { color: profileColor }]}>
                {householdMembers.find((m) => m.id === assigneeId)?.username ?? ''} erhält eine Push-Benachrichtigung.
              </Text>
            )}
          </View>
        )}

        {entryType === 'aufgabe' && (
          <View style={[styles.formSection, styles.switchRow]}>
            <View style={styles.switchTextBlock}>
              <Text style={[styles.label, { color: theme.text, marginBottom: 0 }]}>
                Erinnerung hinzufügen?
              </Text>
              <Text style={styles.hint}>Ohne Erinnerung erscheint die Aufgabe nur in der Aufgabenliste.</Text>
            </View>
            <Switch
              value={hasReminder}
              onValueChange={handleReminderSwitchChange}
              trackColor={{ false: '#ccc', true: `${profileColor}88` }}
              thumbColor={hasReminder ? profileColor : '#f4f4f4'}
            />
          </View>
        )}

        {canRepeat && (
          <View style={styles.formSection}>
            <Text style={[styles.label, { color: theme.text }]}>Wiederholung</Text>
            <View style={styles.segmentRow}>
              {RECURRENCE_OPTIONS.map((option) => {
                const isSelected = recurrenceRule === option.value;

                return (
                  <Pressable
                    key={option.value}
                    onPress={() => setRecurrenceRule(option.value)}
                    style={[
                      styles.segmentButton,
                      {
                        borderColor: isSelected
                          ? profileColor
                          : colorScheme === 'dark'
                            ? '#3d3d5c'
                            : '#e0e0e8',
                        backgroundColor: isSelected
                          ? `${profileColor}18`
                          : colorScheme === 'dark'
                            ? '#252540'
                            : '#fff',
                      },
                    ]}>
                    <Text
                      style={[
                        styles.segmentButtonText,
                        { color: isSelected ? profileColor : theme.text },
                      ]}>
                      {option.label}
                    </Text>
                  </Pressable>
                );
              })}
            </View>
          </View>
        )}

        {showStartPickers && (
          <View style={styles.formSection}>
            <Text style={[styles.label, { color: theme.text }]}>
              {entryType === 'abwesenheit' ? 'Von' : 'Datum & Uhrzeit'}
            </Text>

            {Platform.OS === 'android' &&
              renderPickerButtons(
                'Start',
                startDate,
                () => setShowStartDatePicker(true),
                () => setShowStartTimePicker(true),
              )}

            {(Platform.OS === 'ios' || showStartDatePicker) && (
              <DateTimePicker
                value={startDate}
                mode="date"
                display={Platform.OS === 'ios' ? 'inline' : 'default'}
                onChange={handleStartDateChange}
                locale="de-DE"
              />
            )}

            {(Platform.OS === 'ios' || showStartTimePicker) && (
              <DateTimePicker
                value={startDate}
                mode="time"
                display={Platform.OS === 'ios' ? 'spinner' : 'default'}
                onChange={handleStartTimeChange}
                locale="de-DE"
                is24Hour
              />
            )}
          </View>
        )}

        {showEndPickers && (
          <View style={styles.formSection}>
            <Text style={[styles.label, { color: theme.text }]}>Bis</Text>

            {Platform.OS === 'android' &&
              renderPickerButtons(
                'Ende',
                endDate,
                () => setShowEndDatePicker(true),
                () => setShowEndTimePicker(true),
              )}

            {(Platform.OS === 'ios' || showEndDatePicker) && (
              <DateTimePicker
                value={endDate}
                mode="date"
                display={Platform.OS === 'ios' ? 'inline' : 'default'}
                onChange={handleEndDateChange}
                locale="de-DE"
              />
            )}

            {(Platform.OS === 'ios' || showEndTimePicker) && (
              <DateTimePicker
                value={endDate}
                mode="time"
                display={Platform.OS === 'ios' ? 'spinner' : 'default'}
                onChange={handleEndTimeChange}
                locale="de-DE"
                is24Hour
              />
            )}
          </View>
        )}

        {entryType === 'aufgabe' && !hasReminder && (
          <View style={styles.infoBox}>
            <Ionicons name="information-circle-outline" size={18} color={profileColor} />
            <Text style={[styles.infoText, { color: theme.text }]}>
              Diese Aufgabe hat kein Datum und erscheint nicht im Kalender.
            </Text>
          </View>
        )}

        {entryType === 'erinnerung' && (
          <View style={styles.infoBox}>
            <Ionicons name="information-circle-outline" size={18} color={profileColor} />
            <Text style={[styles.infoText, { color: theme.text }]}>
              Erinnerungen sind nicht an Kalenderdaten gebunden und erscheinen nur im Erinnerungen-Reiter.
            </Text>
          </View>
        )}

        <Pressable
          style={({ pressed }) => [
            styles.saveButton,
            {
              backgroundColor: profileColor,
              opacity: pressed || isSaving ? 0.85 : 1,
            },
          ]}
          onPress={handleSave}
          disabled={isSaving}>
          {isSaving ? (
            <ActivityIndicator color="#fff" />
          ) : (
            <>
              <Ionicons name="checkmark-circle-outline" size={22} color="#fff" />
              <Text style={styles.saveButtonText}>Speichern</Text>
            </>
          )}
        </Pressable>
      </ScrollView>

      <VoiceInputModal
        visible={showVoiceModal}
        title="Titel per Sprache"
        placeholder="Sprich oder tippe den Titel …"
        initialText={title}
        profileColor={profileColor}
        onClose={() => setShowVoiceModal(false)}
        onConfirm={(text) => {
          setTitle(text);
          setShowVoiceModal(false);
        }}
      />
    </KeyboardAvoidingView>
  );
}

const styles = StyleSheet.create({
  flex: {
    flex: 1,
  },
  headerBar: {
    flexDirection: 'row',
    alignItems: 'center',
    paddingHorizontal: 12,
    paddingBottom: 8,
  },
  backButton: {
    width: 40,
    height: 40,
    alignItems: 'center',
    justifyContent: 'center',
  },
  headerTitle: {
    flex: 1,
    textAlign: 'center',
    fontSize: 18,
    fontWeight: '700',
  },
  headerSpacer: {
    width: 40,
  },
  scrollContent: {
    paddingHorizontal: 20,
    paddingBottom: 40,
  },
  formSection: {
    marginBottom: 22,
  },
  label: {
    fontSize: 15,
    fontWeight: '600',
    marginBottom: 8,
  },
  labelRow: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'space-between',
    marginBottom: 8,
  },
  micLabelBtn: {
    padding: 4,
  },
  hint: {
    fontSize: 13,
    color: '#888',
    marginBottom: 10,
  },
  input: {
    borderWidth: 1.5,
    borderRadius: 14,
    paddingHorizontal: 16,
    paddingVertical: 14,
    fontSize: 16,
  },
  textArea: {
    minHeight: 100,
    paddingTop: 14,
  },
  segmentRow: {
    flexDirection: 'row',
    gap: 8,
  },
  segmentButton: {
    flex: 1,
    alignItems: 'center',
    justifyContent: 'center',
    paddingVertical: 12,
    borderRadius: 12,
    borderWidth: 2,
  },
  segmentButtonText: {
    fontSize: 14,
    fontWeight: '700',
  },
  switchRow: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 12,
  },
  switchTextBlock: {
    flex: 1,
    gap: 4,
  },
  pickerGroup: {
    marginBottom: 8,
  },
  pickerGroupLabel: {
    fontSize: 13,
    fontWeight: '600',
    marginBottom: 8,
  },
  androidPickerRow: {
    flexDirection: 'row',
    gap: 10,
    marginBottom: 8,
  },
  pickerButton: {
    flex: 1,
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'center',
    gap: 8,
    borderWidth: 1.5,
    borderRadius: 14,
    paddingVertical: 14,
    paddingHorizontal: 12,
  },
  pickerButtonText: {
    fontSize: 15,
    fontWeight: '500',
  },
  infoBox: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 10,
    padding: 14,
    borderRadius: 12,
    backgroundColor: '#f0edf7',
    marginBottom: 16,
  },
  infoText: {
    flex: 1,
    fontSize: 13,
    lineHeight: 18,
  },
  saveButton: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'center',
    gap: 10,
    paddingVertical: 16,
    borderRadius: 14,
    minHeight: 54,
    marginTop: 8,
  },
  saveButtonText: {
    color: '#fff',
    fontSize: 16,
    fontWeight: '700',
  },
  assigneeRow: {
    flexDirection: 'row',
    gap: 8,
    paddingRight: 4,
  },
  assigneeChip: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 6,
    paddingHorizontal: 14,
    paddingVertical: 10,
    borderRadius: 22,
    borderWidth: 2,
  },
  assigneeAvatar: {
    width: 22,
    height: 22,
    borderRadius: 11,
    alignItems: 'center',
    justifyContent: 'center',
  },
  assigneeAvatarText: {
    fontSize: 11,
    fontWeight: '700',
    color: '#fff',
  },
  assigneeChipText: {
    fontSize: 14,
    fontWeight: '600',
  },
  assigneeHint: {
    fontSize: 12,
    marginTop: 6,
    fontWeight: '500',
  },
});
