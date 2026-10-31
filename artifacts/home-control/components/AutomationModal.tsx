import { MaterialCommunityIcons } from '@expo/vector-icons';
import { useEffect, useMemo, useState } from 'react';
import {
  Alert,
  ActivityIndicator,
  Modal,
  Pressable,
  ScrollView,
  StyleSheet,
  Text,
  View,
} from 'react-native';
import { useSafeAreaInsets } from 'react-native-safe-area-context';
import { useColors } from '@/hooks/useColors';
import {
  TuyaSmartHome,
  type TuyaAutomation,
} from '@/services/tuyaSmartHome';

export type AutomationControl = {
  id: string;
  name: string;
  roomName?: string;
  tuyaDeviceId: string;
  tuyaHomeId: string;
  tuyaSwitchDpId: string;
};

type Props = {
  visible: boolean;
  controls: AutomationControl[];
  onClose: () => void;
  onSceneDeleted?: (sceneId: string) => void;
};

type Picker = 'trigger' | 'action' | null;

export function AutomationModal({
  visible,
  controls,
  onClose,
  onSceneDeleted,
}: Props) {
  const colors = useColors();
  const insets = useSafeAreaInsets();
  const [triggerControlId, setTriggerControlId] = useState('');
  const [triggerIsOn, setTriggerIsOn] = useState(true);
  const [actionControlId, setActionControlId] = useState('');
  const [actionIsOn, setActionIsOn] = useState(true);
  const [openPicker, setOpenPicker] = useState<Picker>(null);
  const [automations, setAutomations] = useState<TuyaAutomation[]>([]);
  const [loadingAutomations, setLoadingAutomations] = useState(false);
  const [deletingSceneId, setDeletingSceneId] = useState<string | null>(null);
  const [saving, setSaving] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [success, setSuccess] = useState<string | null>(null);
  const [refreshVersion, setRefreshVersion] = useState(0);

  const triggerOptions = useMemo(
    () =>
      controls.filter(
        (control) =>
          control.tuyaDeviceId &&
          control.tuyaHomeId &&
          control.tuyaSwitchDpId,
      ),
    [controls],
  );
  const triggerControl =
    triggerOptions.find((control) => control.id === triggerControlId) ??
    triggerOptions[0];
  const actionOptions = useMemo(
    () =>
      triggerControl
        ? triggerOptions.filter(
            (control) =>
              control.tuyaHomeId === triggerControl.tuyaHomeId &&
              control.tuyaDeviceId !== triggerControl.tuyaDeviceId,
          )
        : [],
    [triggerControl, triggerOptions],
  );
  const actionControl =
    actionOptions.find((control) => control.id === actionControlId) ??
    actionOptions[0];

  useEffect(() => {
    if (!visible) return;
    const firstTrigger = triggerOptions[0];
    const firstAction = firstTrigger
      ? triggerOptions.find(
          (control) =>
            control.tuyaHomeId === firstTrigger.tuyaHomeId &&
            control.tuyaDeviceId !== firstTrigger.tuyaDeviceId,
        )
      : undefined;
    setTriggerControlId(firstTrigger?.id ?? '');
    setTriggerIsOn(true);
    setActionControlId(firstAction?.id ?? '');
    setActionIsOn(true);
    setOpenPicker(null);
    setError(null);
    setSuccess(null);
  }, [visible, triggerOptions]);

  useEffect(() => {
    if (!visible || !triggerControl?.tuyaHomeId) {
      setAutomations([]);
      setLoadingAutomations(false);
      return;
    }
    if (!TuyaSmartHome.isNativeAvailable()) {
      setAutomations([]);
      setLoadingAutomations(false);
      setError(
        'Automations need the Home Control iOS build with Tuya SmartLife enabled.',
      );
      return;
    }

    let cancelled = false;
    setLoadingAutomations(true);
    setError(null);
    void TuyaSmartHome.listAutomations(triggerControl.tuyaHomeId)
      .then((items) => {
        if (!cancelled) setAutomations(items);
      })
      .catch((cause: unknown) => {
        if (!cancelled) {
          setError(
            cause instanceof Error
              ? cause.message
              : 'Could not load Tuya automations.',
          );
        }
      })
      .finally(() => {
        if (!cancelled) setLoadingAutomations(false);
      });

    return () => {
      cancelled = true;
    };
  }, [refreshVersion, triggerControl?.tuyaHomeId, visible]);

  const createAutomation = async () => {
    if (!triggerControl || !actionControl) return;
    setSaving(true);
    setError(null);
    setSuccess(null);
    const triggerState = triggerIsOn ? 'on' : 'off';
    const actionState = actionIsOn ? 'on' : 'off';
    const name = `When ${triggerControl.name} turns ${triggerState}, turn ${actionState} ${actionControl.name}`;

    try {
      const created = await TuyaSmartHome.createSwitchAutomation(
        triggerControl.tuyaHomeId,
        name,
        triggerControl.tuyaDeviceId,
        triggerControl.tuyaSwitchDpId,
        triggerIsOn,
        actionControl.tuyaDeviceId,
        actionControl.tuyaSwitchDpId,
        actionIsOn,
      );
      setSuccess(`Created “${created.name}”. It runs through Tuya when this app is closed.`);
      setOpenPicker(null);
      setRefreshVersion((version) => version + 1);
    } catch (cause) {
      try {
        const updatedAutomations = await TuyaSmartHome.listAutomations(
          triggerControl.tuyaHomeId,
        );
        setAutomations(updatedAutomations);
      } catch {
        // Keep the original creation/enable error visible if the refresh fails.
      }
      setError(
        cause instanceof Error
          ? cause.message
          : 'Could not create the Tuya automation.',
      );
    } finally {
      setSaving(false);
    }
  };

  const deleteAutomation = async (automation: TuyaAutomation) => {
    if (!triggerControl) return;
    setDeletingSceneId(automation.sceneId);
    setError(null);
    setSuccess(null);
    try {
      await TuyaSmartHome.deleteAutomation(
        triggerControl.tuyaHomeId,
        automation.sceneId,
      );
      setAutomations((current) =>
        current.filter((item) => item.sceneId !== automation.sceneId),
      );
      onSceneDeleted?.(automation.sceneId);
      setSuccess(`Deleted “${automation.name}”.`);
    } catch (cause) {
      setError(
        cause instanceof Error
          ? cause.message
          : 'Could not delete the Tuya automation.',
      );
    } finally {
      setDeletingSceneId(null);
    }
  };

  const confirmDeleteAutomation = (automation: TuyaAutomation) => {
    Alert.alert(
      'Delete automation?',
      `“${automation.name}” will be removed from your Tuya home.`,
      [
        { text: 'Cancel', style: 'cancel' },
        {
          text: 'Delete',
          style: 'destructive',
          onPress: () => void deleteAutomation(automation),
        },
      ],
    );
  };

  const renderControlPicker = (
    type: Exclude<Picker, null>,
    options: AutomationControl[],
    selected: AutomationControl | undefined,
  ) => {
    const expanded = openPicker === type;
    return (
      <View style={styles.pickerGroup}>
        <Pressable
          accessibilityRole="button"
          accessibilityLabel={`Choose ${type === 'trigger' ? 'trigger' : 'action'} switch`}
          accessibilityState={{ expanded }}
          testID={`automation-${type}-picker`}
          onPress={() => setOpenPicker(expanded ? null : type)}
          style={({ pressed }) => [
            styles.choiceButton,
            { backgroundColor: colors.card, borderColor: colors.border },
            pressed && styles.pressed,
          ]}
        >
          <View style={styles.choiceCopy}>
            <Text style={[styles.choiceTitle, { color: colors.foreground }]}>
              {selected?.name ?? 'Choose a Tuya switch'}
            </Text>
            {selected?.roomName ? (
              <Text
                style={[
                  styles.choiceSubtitle,
                  { color: colors.mutedForeground },
                ]}
              >
                {selected.roomName}
              </Text>
            ) : null}
          </View>
          <MaterialCommunityIcons
            name={expanded ? 'chevron-up' : 'chevron-down'}
            size={22}
            color={colors.mutedForeground}
          />
        </Pressable>
        {expanded ? (
          <View
            style={[
              styles.optionList,
              { backgroundColor: colors.card, borderColor: colors.border },
            ]}
          >
            {options.map((control) => {
              const isSelected = control.id === selected?.id;
              return (
                <Pressable
                  key={control.id}
                  accessibilityRole="button"
                  accessibilityState={{ selected: isSelected }}
                  testID={`automation-${type}-option-${control.id}`}
                  onPress={() => {
                    if (type === 'trigger') {
                      setTriggerControlId(control.id);
                      const nextAction = triggerOptions.find(
                        (candidate) =>
                          candidate.tuyaHomeId === control.tuyaHomeId &&
                          candidate.tuyaDeviceId !== control.tuyaDeviceId,
                      );
                      setActionControlId(nextAction?.id ?? '');
                    } else {
                      setActionControlId(control.id);
                    }
                    setOpenPicker(null);
                    setError(null);
                    setSuccess(null);
                  }}
                  style={({ pressed }) => [
                    styles.option,
                    { borderBottomColor: colors.border },
                    isSelected && { backgroundColor: colors.secondary },
                    pressed && styles.pressed,
                  ]}
                >
                  <View style={styles.optionCopy}>
                    <Text
                      style={[
                        styles.optionTitle,
                        { color: colors.foreground },
                      ]}
                    >
                      {control.name}
                    </Text>
                    {control.roomName ? (
                      <Text
                        style={[
                          styles.choiceSubtitle,
                          { color: colors.mutedForeground },
                        ]}
                      >
                        {control.roomName}
                      </Text>
                    ) : null}
                  </View>
                  {isSelected ? (
                    <MaterialCommunityIcons
                      name="check"
                      size={18}
                      color={colors.primary}
                    />
                  ) : null}
                </Pressable>
              );
            })}
          </View>
        ) : null}
      </View>
    );
  };

  return (
    <Modal
      visible={visible}
      animationType="slide"
      presentationStyle="pageSheet"
      onRequestClose={onClose}
    >
      <View
        style={[
          styles.screen,
          {
            backgroundColor: colors.background,
            paddingTop: Math.max(insets.top, 12),
            paddingBottom: Math.max(insets.bottom, 16),
          },
        ]}
      >
        <View style={styles.header}>
          <View style={styles.titleGroup}>
            <Text style={[styles.title, { color: colors.foreground }]}>
              Automations
            </Text>
            <Text
              style={[styles.subtitle, { color: colors.mutedForeground }]}
            >
              Create a Tuya rule that runs outside this app.
            </Text>
          </View>
          <Pressable
            accessibilityRole="button"
            accessibilityLabel="Close automations"
            hitSlop={8}
            testID="automations-close-button"
            onPress={onClose}
            style={({ pressed }) => [
              styles.closeButton,
              pressed && styles.pressed,
            ]}
          >
            <MaterialCommunityIcons
              name="close"
              size={20}
              color={colors.primary}
            />
          </Pressable>
        </View>

        <ScrollView
          contentContainerStyle={styles.content}
          keyboardShouldPersistTaps="handled"
          showsVerticalScrollIndicator={false}
        >
          {triggerOptions.length === 0 ? (
            <View
              style={[
                styles.emptyCard,
                { backgroundColor: colors.card, borderColor: colors.border },
              ]}
            >
              <MaterialCommunityIcons
                name="lightning-bolt-outline"
                size={26}
                color={colors.primary}
              />
              <Text style={[styles.emptyTitle, { color: colors.foreground }]}>
                No Tuya switches available
              </Text>
              <Text
                style={[
                  styles.emptyDescription,
                  { color: colors.mutedForeground },
                ]}
              >
                Pair at least two Tuya switch controls first. The trigger and
                action must be separate physical devices in the same Tuya home.
              </Text>
            </View>
          ) : (
            <>
              <View
                style={[
                  styles.ruleCard,
                  { backgroundColor: colors.card, borderColor: colors.border },
                ]}
              >
                <View style={styles.step}>
                  <View
                    style={[
                      styles.stepIcon,
                      { backgroundColor: colors.secondary },
                    ]}
                  >
                    <MaterialCommunityIcons
                      name="gesture-tap-button"
                      size={19}
                      color={colors.primary}
                    />
                  </View>
                  <View style={styles.stepCopy}>
                    <Text
                      style={[
                        styles.stepLabel,
                        { color: colors.mutedForeground },
                      ]}
                    >
                      WHEN THIS SWITCH TURNS {triggerIsOn ? 'ON' : 'OFF'}
                    </Text>
                    {renderControlPicker(
                      'trigger',
                      triggerOptions,
                      triggerControl,
                    )}
                    <View style={styles.triggerStateGroup}>
                      {[true, false].map((isOn) => {
                        const selected = triggerIsOn === isOn;
                        const label = isOn ? 'Turns on' : 'Turns off';
                        return (
                          <Pressable
                            key={label}
                            accessibilityRole="button"
                            accessibilityLabel={`Trigger when the switch ${label.toLowerCase()}`}
                            accessibilityState={{ selected }}
                            testID={`automation-trigger-state-${isOn ? 'on' : 'off'}`}
                            onPress={() => {
                              setTriggerIsOn(isOn);
                              setError(null);
                              setSuccess(null);
                            }}
                            style={({ pressed }) => [
                              styles.triggerStateOption,
                              {
                                backgroundColor: selected
                                  ? colors.primary
                                  : colors.card,
                                borderColor: selected
                                  ? colors.primary
                                  : colors.border,
                              },
                              pressed && styles.pressed,
                            ]}
                          >
                            <Text
                              style={[
                                styles.triggerStateText,
                                {
                                  color: selected
                                    ? colors.primaryForeground
                                    : colors.foreground,
                                },
                              ]}
                            >
                              {label}
                            </Text>
                          </Pressable>
                        );
                      })}
                    </View>
                  </View>
                </View>

                <View
                  style={[styles.connector, { backgroundColor: colors.border }]}
                />

                <View style={styles.step}>
                  <View
                    style={[
                      styles.stepIcon,
                      { backgroundColor: colors.secondary },
                    ]}
                  >
                    <MaterialCommunityIcons
                      name="lightbulb-on-outline"
                      size={19}
                      color={colors.primary}
                    />
                  </View>
                  <View style={styles.stepCopy}>
                    <Text
                      style={[
                        styles.stepLabel,
                        { color: colors.mutedForeground },
                      ]}
                    >
                      TURN THIS SWITCH {actionIsOn ? 'ON' : 'OFF'}
                    </Text>
                    {actionOptions.length > 0 ? (
                      renderControlPicker('action', actionOptions, actionControl)
                    ) : (
                      <Text
                        style={[
                          styles.noActionText,
                          { color: colors.mutedForeground },
                        ]}
                      >
                        Choose a different Tuya device for the action.
                      </Text>
                    )}
                    <View style={styles.triggerStateGroup}>
                      {[true, false].map((isOn) => {
                        const selected = actionIsOn === isOn;
                        const label = isOn ? 'Turn on' : 'Turn off';
                        return (
                          <Pressable
                            key={label}
                            accessibilityRole="button"
                            accessibilityLabel={`Set the action to ${label.toLowerCase()}`}
                            accessibilityState={{ selected }}
                            testID={`automation-action-state-${isOn ? 'on' : 'off'}`}
                            onPress={() => {
                              setActionIsOn(isOn);
                              setError(null);
                              setSuccess(null);
                            }}
                            style={({ pressed }) => [
                              styles.triggerStateOption,
                              {
                                backgroundColor: selected
                                  ? colors.primary
                                  : colors.card,
                                borderColor: selected
                                  ? colors.primary
                                  : colors.border,
                              },
                              pressed && styles.pressed,
                            ]}
                          >
                            <Text
                              style={[
                                styles.triggerStateText,
                                {
                                  color: selected
                                    ? colors.primaryForeground
                                    : colors.foreground,
                                },
                              ]}
                            >
                              {label}
                            </Text>
                          </Pressable>
                        );
                      })}
                    </View>
                  </View>
                </View>
              </View>

              <View
                style={[
                  styles.noteCard,
                  { backgroundColor: colors.secondary },
                ]}
              >
                <MaterialCommunityIcons
                  name="cloud-check-outline"
                  size={19}
                  color={colors.primary}
                />
                <Text
                  style={[styles.noteText, { color: colors.secondaryForeground }]}
                >
                  Tuya stores this rule in your home, so it can run while Home
                  Control is closed.
                </Text>
              </View>

              {loadingAutomations ? (
                <View style={styles.loadingRow}>
                  <ActivityIndicator size="small" color={colors.primary} />
                  <Text
                    style={[
                      styles.loadingText,
                      { color: colors.mutedForeground },
                    ]}
                  >
                    Loading your Tuya automations…
                  </Text>
                </View>
              ) : automations.length > 0 ? (
                <View style={styles.existingSection}>
                  <Text
                    style={[
                      styles.sectionTitle,
                      { color: colors.mutedForeground },
                    ]}
                  >
                    EXISTING AUTOMATIONS
                  </Text>
                  {automations.map((automation) => (
                    <Pressable
                      key={automation.sceneId}
                      accessibilityRole="button"
                      accessibilityHint="Press and hold to delete this automation"
                      accessibilityState={{
                        disabled: deletingSceneId === automation.sceneId,
                      }}
                      disabled={deletingSceneId === automation.sceneId}
                      delayLongPress={450}
                      onLongPress={() => confirmDeleteAutomation(automation)}
                      testID={`automation-row-${automation.sceneId}`}
                      style={({ pressed }) => [
                        styles.automationRow,
                        {
                          backgroundColor: colors.card,
                          borderColor: colors.border,
                        },
                        pressed && styles.pressed,
                      ]}
                    >
                      <MaterialCommunityIcons
                        name={
                          automation.enabled
                            ? 'lightning-bolt-circle'
                            : 'lightning-bolt-outline'
                        }
                        size={20}
                        color={
                          automation.enabled
                            ? colors.primary
                            : colors.mutedForeground
                        }
                      />
                      <Text
                        numberOfLines={2}
                        style={[
                          styles.automationName,
                          { color: colors.foreground },
                        ]}
                      >
                        {automation.name}
                      </Text>
                      {deletingSceneId === automation.sceneId ? (
                        <ActivityIndicator size="small" color={colors.primary} />
                      ) : (
                        <Text
                          style={[
                            styles.enabledLabel,
                            {
                              color: automation.enabled
                                ? colors.primary
                                : colors.mutedForeground,
                            },
                          ]}
                        >
                          {automation.enabled ? 'ON' : 'OFF'}
                        </Text>
                      )}
                    </Pressable>
                  ))}
                  <Text
                    style={[styles.deleteHint, { color: colors.mutedForeground }]}
                  >
                    Press and hold an automation to delete it.
                  </Text>
                </View>
              ) : null}
            </>
          )}

          {error ? (
            <Text
              accessibilityRole="alert"
              style={[styles.feedback, { color: colors.destructive }]}
            >
              {error}
            </Text>
          ) : null}
          {success ? (
            <Text
              accessibilityRole="alert"
              style={[styles.feedback, { color: colors.primary }]}
            >
              {success}
            </Text>
          ) : null}
        </ScrollView>

        {triggerOptions.length > 0 ? (
          <Pressable
            accessibilityRole="button"
            accessibilityLabel="Create automation"
            testID="automation-create-button"
            accessibilityState={{
              disabled: !triggerControl || !actionControl || saving,
            }}
            disabled={!triggerControl || !actionControl || saving}
            onPress={() => void createAutomation()}
            style={({ pressed }) => [
              styles.createButton,
              {
                backgroundColor:
                  !triggerControl || !actionControl || saving
                    ? colors.muted
                    : colors.primary,
              },
              pressed && styles.pressed,
            ]}
          >
            {saving ? (
              <ActivityIndicator color={colors.primaryForeground} />
            ) : (
              <>
                <MaterialCommunityIcons
                  name="plus"
                  size={20}
                  color={colors.primaryForeground}
                />
                <Text
                  style={[
                    styles.createButtonText,
                    { color: colors.primaryForeground },
                  ]}
                >
                  Create automation
                </Text>
              </>
            )}
          </Pressable>
        ) : null}
      </View>
    </Modal>
  );
}

const styles = StyleSheet.create({
  screen: { flex: 1, paddingHorizontal: 20 },
  header: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'space-between',
    gap: 16,
    paddingBottom: 20,
  },
  titleGroup: { flex: 1, gap: 4 },
  title: { fontSize: 23, fontWeight: '800', letterSpacing: -0.5 },
  subtitle: { fontSize: 13, lineHeight: 18 },
  closeButton: {
    width: 38,
    height: 38,
    alignItems: 'center',
    justifyContent: 'center',
  },
  content: { gap: 16, paddingBottom: 18 },
  ruleCard: {
    borderWidth: 1,
    borderRadius: 20,
    padding: 15,
    gap: 12,
  },
  step: { flexDirection: 'row', alignItems: 'flex-start', gap: 12 },
  stepIcon: {
    width: 36,
    height: 36,
    borderRadius: 12,
    alignItems: 'center',
    justifyContent: 'center',
    marginTop: 2,
  },
  stepCopy: { flex: 1, gap: 8 },
  stepLabel: { fontSize: 9, fontWeight: '800', letterSpacing: 1.1 },
  connector: { width: 2, height: 14, marginLeft: 17, opacity: 0.8 },
  triggerStateGroup: { flexDirection: 'row', gap: 8, marginTop: 2 },
  triggerStateOption: {
    flex: 1,
    minHeight: 40,
    borderWidth: 1,
    borderRadius: 12,
    alignItems: 'center',
    justifyContent: 'center',
    paddingHorizontal: 10,
  },
  triggerStateText: { fontSize: 12, fontWeight: '700' },
  pickerGroup: { gap: 6 },
  choiceButton: {
    minHeight: 53,
    borderWidth: 1,
    borderRadius: 15,
    paddingHorizontal: 12,
    paddingVertical: 9,
    flexDirection: 'row',
    alignItems: 'center',
    gap: 8,
  },
  choiceCopy: { flex: 1, gap: 2 },
  choiceTitle: { fontSize: 14, fontWeight: '700' },
  choiceSubtitle: { fontSize: 11, fontWeight: '500' },
  optionList: { borderWidth: 1, borderRadius: 15, overflow: 'hidden' },
  option: {
    minHeight: 52,
    paddingHorizontal: 12,
    paddingVertical: 9,
    flexDirection: 'row',
    alignItems: 'center',
    gap: 8,
    borderBottomWidth: StyleSheet.hairlineWidth,
  },
  optionCopy: { flex: 1, gap: 2 },
  optionTitle: { fontSize: 13, fontWeight: '600' },
  noActionText: { fontSize: 12, lineHeight: 18, paddingVertical: 8 },
  noteCard: {
    borderRadius: 15,
    padding: 13,
    flexDirection: 'row',
    alignItems: 'flex-start',
    gap: 10,
  },
  noteText: { flex: 1, fontSize: 12, lineHeight: 18, fontWeight: '500' },
  loadingRow: { flexDirection: 'row', alignItems: 'center', gap: 9 },
  loadingText: { fontSize: 12 },
  existingSection: { gap: 8 },
  sectionTitle: { fontSize: 9, fontWeight: '800', letterSpacing: 1.2 },
  automationRow: {
    minHeight: 50,
    borderWidth: 1,
    borderRadius: 14,
    paddingHorizontal: 12,
    paddingVertical: 9,
    flexDirection: 'row',
    alignItems: 'center',
    gap: 9,
  },
  automationName: { flex: 1, fontSize: 12, fontWeight: '600' },
  enabledLabel: { fontSize: 9, fontWeight: '800', letterSpacing: 0.7 },
  deleteHint: { fontSize: 11, lineHeight: 16 },
  emptyCard: {
    borderWidth: 1,
    borderRadius: 20,
    padding: 20,
    alignItems: 'center',
    gap: 10,
  },
  emptyTitle: { fontSize: 16, fontWeight: '700', textAlign: 'center' },
  emptyDescription: { fontSize: 13, lineHeight: 20, textAlign: 'center' },
  feedback: { fontSize: 12, lineHeight: 18, fontWeight: '600' },
  createButton: {
    minHeight: 52,
    borderRadius: 17,
    paddingHorizontal: 18,
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'center',
    gap: 8,
  },
  createButtonText: { fontSize: 14, fontWeight: '800' },
  pressed: { opacity: 0.78 },
});
