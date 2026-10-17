import AsyncStorage from '@react-native-async-storage/async-storage';
import { MaterialCommunityIcons } from '@expo/vector-icons';
import { useClerk } from '@clerk/expo';
import * as Haptics from 'expo-haptics';
import { useEffect, useMemo, useRef, useState } from 'react';
import {
  ActivityIndicator,
  Alert,
  Keyboard,
  KeyboardAvoidingView,
  Linking,
  Modal,
  Platform,
  Pressable,
  ScrollView,
  StyleSheet,
  Text,
  TextInput,
  View,
} from 'react-native';
import {
  KeyboardAvoidingView as KeyboardControllerAvoidingView,
} from 'react-native-keyboard-controller';
import { useSafeAreaInsets } from 'react-native-safe-area-context';
import { useColors } from '@/hooks/useColors';

type DeviceKind =
  | 'chandelier'
  | 'sideLight'
  | 'heater'
  | 'nightLight'
  | 'airConditioner';
type ShortcutAction = 'on' | 'off';

type Room = {
  id: string;
  name: string;
};

type HomeControl = {
  id: string;
  roomId: string;
  name: string;
  kind: DeviceKind;
  wattage?: number;
  onShortcutName?: string;
  offShortcutName?: string;
  lastShortcutAction?: ShortcutAction;
  shortcutName?: string;
};

type HomeData = {
  rooms: Room[];
  controls: HomeControl[];
  activeRoomId: string | null;
};

type DialogState = 'room' | 'control' | null;

const STORAGE_KEY = 'home-control-local-preview-v1';
const EMPTY_DATA: HomeData = { rooms: [], controls: [], activeRoomId: null };

const deviceKinds: {
  key: DeviceKind;
  label: string;
  defaultName: string;
  icon: keyof typeof MaterialCommunityIcons.glyphMap;
}[] = [
  {
    key: 'chandelier',
    label: 'Chandelier',
    defaultName: 'Chandelier',
    icon: 'chandelier',
  },
  {
    key: 'sideLight',
    label: 'Side light',
    defaultName: 'Side light',
    icon: 'spotlight-beam',
  },
  {
    key: 'heater',
    label: 'Water heater',
    defaultName: 'Water heater',
    icon: 'water-boiler',
  },
  {
    key: 'nightLight',
    label: 'Night light',
    defaultName: 'Night light',
    icon: 'lightbulb-night',
  },
  {
    key: 'airConditioner',
    label: 'Air conditioner',
    defaultName: 'Air conditioner',
    icon: 'air-conditioner',
  },
];

function createId() {
  return `${Date.now()}-${Math.random().toString(36).slice(2, 9)}`;
}

function isDeviceKind(value: unknown): value is DeviceKind {
  return (
    value === 'chandelier' ||
    value === 'sideLight' ||
    value === 'heater' ||
    value === 'nightLight' ||
    value === 'airConditioner'
  );
}

function parseHomeData(raw: string | null): HomeData {
  if (!raw) return EMPTY_DATA;
  const parsed: unknown = JSON.parse(raw);
  if (!parsed || typeof parsed !== 'object') return EMPTY_DATA;

  const value = parsed as Partial<HomeData>;
  const rooms = Array.isArray(value.rooms)
    ? value.rooms.filter(
        (room): room is Room =>
          !!room &&
          typeof room === 'object' &&
          typeof room.id === 'string' &&
          typeof room.name === 'string',
      )
    : [];
  const roomIds = new Set(rooms.map((room) => room.id));
  const controls = Array.isArray(value.controls)
    ? value.controls.filter(
        (control): control is HomeControl =>
          !!control &&
          typeof control === 'object' &&
          typeof control.id === 'string' &&
          typeof control.roomId === 'string' &&
          roomIds.has(control.roomId) &&
          typeof control.name === 'string' &&
          isDeviceKind(control.kind) &&
          (control.wattage === undefined ||
            (typeof control.wattage === 'number' &&
              Number.isFinite(control.wattage) &&
              control.wattage >= 0)) &&
          (control.onShortcutName === undefined ||
            typeof control.onShortcutName === 'string') &&
          (control.offShortcutName === undefined ||
            typeof control.offShortcutName === 'string') &&
          (control.lastShortcutAction === undefined ||
            control.lastShortcutAction === 'on' ||
            control.lastShortcutAction === 'off') &&
          (control.shortcutName === undefined ||
            typeof control.shortcutName === 'string'),
      )
        .map((control) => {
          const onShortcutName =
            (typeof control.onShortcutName === 'string' &&
              control.onShortcutName.trim()) ||
            (typeof control.shortcutName === 'string' &&
              control.shortcutName.trim()) ||
            '';
          const offShortcutName =
            typeof control.offShortcutName === 'string'
              ? control.offShortcutName.trim()
              : '';
          return {
            id: control.id,
            roomId: control.roomId,
            name: control.name,
            kind: control.kind,
            ...(typeof control.wattage === 'number'
              ? { wattage: control.wattage }
              : {}),
            ...(onShortcutName ? { onShortcutName } : {}),
            ...(offShortcutName ? { offShortcutName } : {}),
            ...(control.lastShortcutAction
              ? { lastShortcutAction: control.lastShortcutAction }
              : {}),
          };
        })
    : [];

  const activeRoomId =
    typeof value.activeRoomId === 'string' && roomIds.has(value.activeRoomId)
      ? value.activeRoomId
      : (rooms[0]?.id ?? null);

  return { rooms, controls, activeRoomId };
}

function UnpairedControlCard({
  control,
  onPress,
  onOpenSettings,
}: {
  control: HomeControl;
  onPress: () => void;
  onOpenSettings: () => void;
}) {
  const colors = useColors();
  const longPressTriggered = useRef(false);
  const definition = deviceKinds.find((kind) => kind.key === control.kind);
  const hasShortcutPair = Boolean(
    control.onShortcutName?.trim() && control.offShortcutName?.trim(),
  );
  const shortcutStatus = control.lastShortcutAction
    ? `Last requested · ${control.lastShortcutAction.toUpperCase()}`
    : 'First tap runs ON';
  const openSettings = () => {
    longPressTriggered.current = true;
    onOpenSettings();
    void Haptics.impactAsync(Haptics.ImpactFeedbackStyle.Medium);
  };

  return (
    <Pressable
      onPressIn={() => {
        longPressTriggered.current = false;
      }}
      onPress={() => {
        if (longPressTriggered.current) {
          longPressTriggered.current = false;
          return;
        }
        onPress();
      }}
      onLongPress={openSettings}
      onAccessibilityAction={(event) => {
        if (event.nativeEvent.actionName === 'longpress') openSettings();
      }}
      delayLongPress={500}
      accessibilityRole="button"
      accessibilityLabel={
        hasShortcutPair
          ? `${control.name}, ON and OFF Shortcuts assigned`
          : `${control.name}, ON and OFF Shortcuts not configured`
      }
      accessibilityHint={
        hasShortcutPair
          ? `Tap to run the ${control.lastShortcutAction === 'on' ? 'OFF' : 'ON'} Shortcut. Press and hold for settings.`
          : 'Press and hold to assign both iPhone Shortcuts.'
      }
      accessibilityActions={[{ name: 'longpress', label: 'Open device settings' }]}
      testID={`control-tile-${control.id}`}
      style={({ pressed }) => [
        styles.controlCard,
        {
          backgroundColor: colors.card,
          borderColor: colors.border,
        },
        pressed && styles.pressed,
      ]}
    >
      <View
        style={[
          styles.deviceIconWrap,
          { backgroundColor: colors.secondary },
        ]}
      >
        <MaterialCommunityIcons
          name={definition?.icon ?? 'lightbulb-outline'}
          size={21}
          color={colors.primary}
        />
      </View>
      <View style={styles.deviceInfo}>
        <Text
          numberOfLines={1}
          style={[styles.deviceName, { color: colors.foreground }]}
        >
          {control.name}
        </Text>
        <View style={styles.deviceMetaRow}>
          <View
            style={[
              styles.previewDot,
              { backgroundColor: colors.mutedForeground },
            ]}
          />
          <Text style={[styles.deviceMeta, { color: colors.mutedForeground }]}>
            {hasShortcutPair ? shortcutStatus : 'Hold to assign ON and OFF'}
          </Text>
        </View>
      </View>
      <View
        style={[
          styles.stateBadge,
          { backgroundColor: colors.secondary },
        ]}
      >
        <Text
          style={[
            styles.stateBadgeText,
            { color: colors.mutedForeground },
          ]}
        >
          {hasShortcutPair ? 'Toggle' : 'Setup'}
        </Text>
      </View>
    </Pressable>
  );
}

export default function HomeScreen() {
  const colors = useColors();
  const { signOut } = useClerk();
  const insets = useSafeAreaInsets();
  const [data, setData] = useState<HomeData>(EMPTY_DATA);
  const [ready, setReady] = useState(false);
  const [storageError, setStorageError] = useState(false);
  const [dialog, setDialog] = useState<DialogState>(null);
  const [settingsControlId, setSettingsControlId] = useState<string | null>(null);
  const [wattageInput, setWattageInput] = useState('');
  const [wattageError, setWattageError] = useState<string | null>(null);
  const [onShortcutInput, setOnShortcutInput] = useState('');
  const [offShortcutInput, setOffShortcutInput] = useState('');
  const [roomName, setRoomName] = useState('');
  const [controlName, setControlName] = useState('');
  const [selectedKind, setSelectedKind] = useState<DeviceKind>('chandelier');

  useEffect(() => {
    let mounted = true;
    void AsyncStorage.getItem(STORAGE_KEY)
      .then((stored) => {
        if (mounted) setData(parseHomeData(stored));
      })
      .catch(() => {
        if (mounted) setStorageError(true);
      })
      .finally(() => {
        if (mounted) setReady(true);
      });
    return () => {
      mounted = false;
    };
  }, []);

  useEffect(() => {
    if (!ready) return;
    void AsyncStorage.setItem(STORAGE_KEY, JSON.stringify(data)).catch(() => {
      setStorageError(true);
    });
  }, [data, ready]);

  const activeRoom = useMemo(
    () => data.rooms.find((room) => room.id === data.activeRoomId) ?? null,
    [data.activeRoomId, data.rooms],
  );
  const settingsControl =
    data.controls.find((control) => control.id === settingsControlId) ?? null;
  const roomControls = useMemo(
    () =>
      data.controls.filter((control) => control.roomId === activeRoom?.id),
    [activeRoom?.id, data.controls],
  );
  const openRoomDialog = () => {
    setRoomName('');
    setDialog('room');
  };

  const openControlDialog = () => {
    setSelectedKind('chandelier');
    setControlName('Chandelier');
    setDialog('control');
  };

  const addRoom = () => {
    const name = roomName.trim();
    if (!name) return;
    const room = { id: createId(), name };
    setData((current) => ({
      ...current,
      rooms: [...current.rooms, room],
      activeRoomId: room.id,
    }));
    setDialog(null);
    void Haptics.notificationAsync(Haptics.NotificationFeedbackType.Success);
  };

  const addControl = () => {
    if (!activeRoom) return;
    const control = {
      id: createId(),
      roomId: activeRoom.id,
      name: controlName.trim() || selectedDefinition?.defaultName || 'Device',
      kind: selectedKind,
    };
    setData((current) => ({
      ...current,
      controls: [...current.controls, control],
    }));
    setDialog(null);
    void Haptics.notificationAsync(Haptics.NotificationFeedbackType.Success);
  };

  const openControlSettings = (controlId: string) => {
    const control = data.controls.find((item) => item.id === controlId);
    setWattageInput(
      typeof control?.wattage === 'number' ? String(control.wattage) : '',
    );
    setOnShortcutInput(control?.onShortcutName ?? control?.shortcutName ?? '');
    setOffShortcutInput(control?.offShortcutName ?? '');
    setWattageError(null);
    setSettingsControlId(controlId);
  };

  const runControlShortcut = (control: HomeControl) => {
    const onShortcutName = control.onShortcutName?.trim();
    const offShortcutName = control.offShortcutName?.trim();
    if (!onShortcutName || !offShortcutName) {
      const missing = [
        !onShortcutName ? 'ON' : null,
        !offShortcutName ? 'OFF' : null,
      ]
        .filter(Boolean)
        .join(' and ');
      Alert.alert(
        'Assign both Shortcuts',
        `Add the exact names of both iPhone Shortcuts in device settings. The ${missing} Shortcut is missing.`,
        [
          { text: 'Cancel', style: 'cancel' },
          {
            text: 'Settings',
            onPress: () => openControlSettings(control.id),
          },
        ],
      );
      return;
    }

    const action: ShortcutAction =
      control.lastShortcutAction === 'on' ? 'off' : 'on';
    const shortcutName = action === 'on' ? onShortcutName : offShortcutName;
    if (Platform.OS !== 'ios') {
      Alert.alert(
        'iPhone only',
        'This tile can run Apple Shortcuts on an iPhone.',
      );
      return;
    }

    const shortcutUrl = `shortcuts://run-shortcut?name=${encodeURIComponent(shortcutName)}`;
    void Linking.openURL(shortcutUrl)
      .then(() => {
        setData((current) => ({
          ...current,
          controls: current.controls.map((item) =>
            item.id === control.id
              ? { ...item, lastShortcutAction: action }
              : item,
          ),
        }));
        void Haptics.selectionAsync();
      })
      .catch(() => {
        Alert.alert(
          'Shortcut not found',
          `Make sure “${shortcutName}” exists in the Shortcuts app on this iPhone.`,
        );
      });
  };

  const saveControlShortcut = () => {
    if (!settingsControl) return;
    const onShortcutName = onShortcutInput.trim();
    const offShortcutName = offShortcutInput.trim();
    setData((current) => ({
      ...current,
      controls: current.controls.map((control) =>
        control.id === settingsControl.id
          ? {
              ...control,
              onShortcutName: onShortcutName || undefined,
              offShortcutName: offShortcutName || undefined,
              lastShortcutAction: undefined,
            }
          : control,
      ),
    }));
    Keyboard.dismiss();
    void Haptics.notificationAsync(Haptics.NotificationFeedbackType.Success);
  };

  const saveControlWattage = () => {
    if (!settingsControl) return;
    const input = wattageInput.trim();
    const parsedWattage = input ? Number(input.replace(',', '.')) : undefined;
    if (
      input &&
      (parsedWattage === undefined ||
        !Number.isFinite(parsedWattage) ||
        parsedWattage < 0)
    ) {
      setWattageError('Enter a valid wattage of 0 or more.');
      return;
    }

    setData((current) => ({
      ...current,
      controls: current.controls.map((control) =>
        control.id === settingsControl.id
          ? { ...control, wattage: parsedWattage }
          : control,
      ),
    }));
    setWattageError(null);
    Keyboard.dismiss();
    void Haptics.notificationAsync(Haptics.NotificationFeedbackType.Success);
  };

  const removeControl = (controlId: string, name: string) => {
    Alert.alert(
      'Remove from room?',
      `Remove “${name}” from this room?`,
      [
      { text: 'Keep', style: 'cancel' },
      {
        text: 'Remove',
        style: 'destructive',
        onPress: () =>
          setData((current) => ({
            ...current,
            controls: current.controls.filter(
              (control) => control.id !== controlId,
            ),
          })),
      },
      ],
    );
  };

  const selectRoom = (roomId: string) => {
    setData((current) => ({ ...current, activeRoomId: roomId }));
    void Haptics.selectionAsync();
  };

  const leaveHome = () => {
    void signOut();
  };

  const selectedDefinition = deviceKinds.find(
    (kind) => kind.key === selectedKind,
  );
  if (!ready) {
    return (
      <View style={[styles.loading, { backgroundColor: colors.background }]}>
        <ActivityIndicator color={colors.primary} />
      </View>
    );
  }

  return (
    <View
      style={[
        styles.screen,
        {
          backgroundColor: colors.background,
          paddingTop: Platform.OS === 'web' ? 67 : insets.top + 8,
          paddingBottom: Platform.OS === 'web' ? 34 : insets.bottom + 8,
        },
      ]}
    >
      <View style={styles.header}>
        <View style={styles.brandRow}>
          <View
            style={[
              styles.brandIcon,
              { backgroundColor: colors.primary },
            ]}
          >
            <MaterialCommunityIcons
              name="home-variant"
              size={20}
              color={colors.primaryForeground}
            />
          </View>
          <View>
            <Text style={[styles.eyebrow, { color: colors.mutedForeground }]}>
              YOUR HOME
            </Text>
            <Text style={[styles.headerTitle, { color: colors.foreground }]}>
              Home control
            </Text>
          </View>
        </View>
        <View style={styles.headerActions}>
          <Pressable
            onPress={leaveHome}
            accessibilityLabel="Sign out"
            hitSlop={8}
            style={({ pressed }) => [
              styles.signOutButton,
              { backgroundColor: colors.secondary },
              pressed && styles.pressed,
            ]}
          >
            <MaterialCommunityIcons
              name="logout"
              size={17}
              color={colors.primary}
            />
          </Pressable>
        </View>
      </View>

      <View
        accessibilityLabel="Live device power unavailable until direct pairing is built"
        testID="active-home-load"
        style={[
          styles.activeLoadCard,
          { backgroundColor: colors.card, borderColor: colors.border },
        ]}
      >
        <View
          style={[
            styles.activeLoadIcon,
            { backgroundColor: colors.accent + '33' },
          ]}
        >
          <MaterialCommunityIcons
            name="flash"
            size={19}
            color={colors.accentForeground}
          />
        </View>
        <View style={styles.activeLoadInfo}>
          <Text style={[styles.activeLoadTitle, { color: colors.foreground }]}>
            LIVE DEVICE POWER
          </Text>
          <Text style={[styles.activeLoadMeta, { color: colors.mutedForeground }]}>
            Unavailable until direct pairing is built
          </Text>
        </View>
        <Text style={[styles.activeLoadValue, { color: colors.foreground }]}>
          — W
        </Text>
      </View>

      {storageError && (
        <View style={[styles.storageWarning, { backgroundColor: colors.destructive }]}>
          <Text style={{ color: colors.destructiveForeground, fontSize: 12 }}>
            Couldn’t save changes on this device. Check available storage and try again.
          </Text>
        </View>
      )}

      <View style={styles.workspace}>
        <View
          style={[
            styles.roomRail,
            { borderRightColor: colors.border },
          ]}
        >
          <View style={styles.railHeading}>
            <Text style={[styles.railLabel, { color: colors.mutedForeground }]}>
              ROOMS
            </Text>
            <Pressable
              onPress={openRoomDialog}
              accessibilityLabel="Add room"
              testID="add-room-button"
              style={({ pressed }) => [
                styles.smallIconButton,
                { backgroundColor: colors.card, borderColor: colors.border },
                pressed && styles.pressed,
              ]}
            >
              <MaterialCommunityIcons
                name="plus"
                size={19}
                color={colors.primary}
              />
            </Pressable>
          </View>
          <ScrollView
            style={styles.roomList}
            contentContainerStyle={styles.roomListContent}
            showsVerticalScrollIndicator={false}
          >
            {data.rooms.map((room, index) => {
              const active = room.id === data.activeRoomId;
              const count = data.controls.filter(
                (control) => control.roomId === room.id,
              ).length;
              return (
                <Pressable
                  key={room.id}
                  onPress={() => selectRoom(room.id)}
                  accessibilityRole="button"
                  accessibilityLabel={`${room.name}, ${count} ${
                    count === 1 ? 'control' : 'controls'
                  }`}
                  accessibilityState={{ selected: active }}
                  testID={`room-${index}`}
                  style={({ pressed }) => [
                    styles.roomItem,
                    {
                      backgroundColor: active ? colors.primary : 'transparent',
                      borderColor: active ? colors.primary : 'transparent',
                    },
                    pressed && styles.pressed,
                  ]}
                >
                  <MaterialCommunityIcons
                    name="home-outline"
                    size={19}
                    color={active ? colors.primaryForeground : colors.mutedForeground}
                  />
                  <View style={styles.roomText}>
                    <Text
                      numberOfLines={1}
                      ellipsizeMode="tail"
                      style={[
                        styles.roomName,
                        {
                          color: active
                            ? colors.primaryForeground
                            : colors.foreground,
                        },
                      ]}
                    >
                      {room.name}
                    </Text>
                    <Text
                      style={[
                        styles.roomCount,
                        {
                          color: active
                            ? colors.primaryForeground + 'B8'
                            : colors.mutedForeground,
                        },
                      ]}
                    >
                      {count} {count === 1 ? 'control' : 'controls'}
                    </Text>
                  </View>
                </Pressable>
              );
            })}
            {data.rooms.length === 0 && (
              <Text style={[styles.railHint, { color: colors.mutedForeground }]}>
                Add your first room
              </Text>
            )}
          </ScrollView>
        </View>

        <View style={styles.roomContent}>
          {activeRoom ? (
            <>
              <View style={styles.roomHeader}>
                <View style={styles.roomTitleBlock}>
                  <Text style={[styles.sectionEyebrow, { color: colors.mutedForeground }]}>
                    ROOM
                  </Text>
                  <Text
                    numberOfLines={2}
                    style={[styles.roomTitle, { color: colors.foreground }]}
                  >
                    {activeRoom.name}
                  </Text>
                  <Text style={[styles.roomSubtitle, { color: colors.mutedForeground }]}>
                    {roomControls.length === 0
                      ? 'No controls added yet'
                      : `${roomControls.length} ${roomControls.length === 1 ? 'control' : 'controls'}`}
                  </Text>
                </View>
                <Pressable
                  onPress={openControlDialog}
                  accessibilityLabel="Add device tile"
                  testID="add-control-button"
                  style={({ pressed }) => [
                    styles.addControlButton,
                    { backgroundColor: colors.primary },
                    pressed && styles.pressed,
                  ]}
                >
                  <MaterialCommunityIcons
                    name="plus"
                    size={20}
                    color={colors.primaryForeground}
                  />
                  <Text style={[styles.addControlText, { color: colors.primaryForeground }]}>
                    Add
                  </Text>
                </Pressable>
              </View>

              <ScrollView
                style={styles.controlsScroll}
                contentContainerStyle={styles.controlsList}
                showsVerticalScrollIndicator={false}
              >
                {roomControls.length > 0 ? (
                  roomControls.map((control) => (
                    <UnpairedControlCard
                      key={control.id}
                      control={control}
                      onPress={() => runControlShortcut(control)}
                      onOpenSettings={() => openControlSettings(control.id)}
                    />
                  ))
                ) : (
                  <View
                    style={[
                      styles.emptyCard,
                      { backgroundColor: colors.card, borderColor: colors.border },
                    ]}
                  >
                    <View
                      style={[
                        styles.emptyIcon,
                        { backgroundColor: colors.secondary },
                      ]}
                    >
                      <MaterialCommunityIcons
                        name="lightbulb-group-outline"
                        size={27}
                        color={colors.primary}
                      />
                    </View>
                    <Text style={[styles.emptyTitle, { color: colors.foreground }]}>
                      Start this room
                    </Text>
                    <Text style={[styles.emptyBody, { color: colors.mutedForeground }]}>
                      Add a chandelier, spot light, night light, water heater, or air conditioner tile to arrange your controls.
                    </Text>
                    <Pressable
                      onPress={openControlDialog}
                      testID="empty-add-control-button"
                      style={({ pressed }) => [
                        styles.emptyAction,
                        { backgroundColor: colors.primary },
                        pressed && styles.pressed,
                      ]}
                    >
                      <MaterialCommunityIcons
                        name="plus"
                        size={18}
                        color={colors.primaryForeground}
                      />
                      <Text style={[styles.emptyActionText, { color: colors.primaryForeground }]}>
                        Add a device tile
                      </Text>
                    </Pressable>
                  </View>
                )}
              </ScrollView>
            </>
          ) : (
            <View style={styles.noRooms}>
              <View style={[styles.emptyIcon, { backgroundColor: colors.secondary }]}>
                <MaterialCommunityIcons
                  name="floor-plan"
                  size={28}
                  color={colors.primary}
                />
              </View>
              <Text style={[styles.emptyTitle, { color: colors.foreground }]}>
                Make room for your home
              </Text>
              <Text style={[styles.emptyBody, { color: colors.mutedForeground }]}>
                Add rooms first, then choose the controls you want to place in each one.
              </Text>
              <Pressable
                onPress={openRoomDialog}
                testID="first-room-button"
                style={({ pressed }) => [
                  styles.emptyAction,
                  { backgroundColor: colors.primary },
                  pressed && styles.pressed,
                ]}
              >
                <MaterialCommunityIcons
                  name="plus"
                  size={18}
                  color={colors.primaryForeground}
                />
                <Text style={[styles.emptyActionText, { color: colors.primaryForeground }]}>
                  Add your first room
                </Text>
              </Pressable>
            </View>
          )}
        </View>
      </View>

      <Modal
        visible={dialog !== null}
        transparent
        animationType="fade"
        onRequestClose={() => setDialog(null)}
      >
        <KeyboardAvoidingView
          behavior={Platform.OS === 'ios' ? 'padding' : undefined}
          style={styles.modalRoot}
        >
          <Pressable
            style={styles.modalScrim}
            onPress={() => setDialog(null)}
            accessibilityLabel="Close dialog"
          />
          <View
            style={[
              styles.sheet,
              {
                backgroundColor: colors.card,
                borderColor: colors.border,
                paddingBottom: Math.max(insets.bottom, 18) + 12,
              },
            ]}
          >
            <View style={styles.sheetHeader}>
              <View>
                <Text style={[styles.sheetTitle, { color: colors.foreground }]}>
                  {dialog === 'room' ? 'Add a room' : 'Add a device tile'}
                </Text>
                <Text style={[styles.sheetSubtitle, { color: colors.mutedForeground }]}>
                  {dialog === 'room'
                    ? 'Give this part of your home a name.'
                    : 'Direct pairing is not available in this Replit build.'}
                </Text>
              </View>
              <Pressable
                onPress={() => setDialog(null)}
                accessibilityLabel="Close"
                style={({ pressed }) => [
                  styles.smallIconButton,
                  { backgroundColor: colors.secondary, borderColor: colors.border },
                  pressed && styles.pressed,
                ]}
              >
                <MaterialCommunityIcons
                  name="close"
                  size={18}
                  color={colors.foreground}
                />
              </Pressable>
            </View>

            {dialog === 'room' ? (
              <>
                <TextInput
                  value={roomName}
                  onChangeText={setRoomName}
                  placeholder="For example, Living room"
                  placeholderTextColor={colors.mutedForeground}
                  autoFocus
                  returnKeyType="done"
                  onSubmitEditing={addRoom}
                  accessibilityLabel="Room name"
                  testID="room-name-input"
                  style={[
                    styles.textInput,
                    {
                      backgroundColor: colors.background,
                      borderColor: colors.border,
                      color: colors.foreground,
                    },
                  ]}
                />
                <Pressable
                  onPress={addRoom}
                  disabled={!roomName.trim()}
                  testID="save-room-button"
                  style={({ pressed }) => [
                    styles.submitButton,
                    {
                      backgroundColor: roomName.trim()
                        ? colors.primary
                        : colors.secondary,
                    },
                    pressed && roomName.trim() && styles.pressed,
                  ]}
                >
                  <Text
                    style={[
                      styles.submitText,
                      {
                        color: roomName.trim()
                          ? colors.primaryForeground
                          : colors.mutedForeground,
                      },
                    ]}
                  >
                    Create room
                  </Text>
                </Pressable>
              </>
            ) : (
              <>
                <View style={styles.kindGrid}>
                  {deviceKinds.map((kind) => {
                    const selected = kind.key === selectedKind;
                    return (
                      <Pressable
                        key={kind.key}
                        onPress={() => {
                          setSelectedKind(kind.key);
                          setControlName(kind.defaultName);
                        }}
                        accessibilityRole="radio"
                        accessibilityState={{ selected }}
                        testID={`kind-${kind.key}`}
                        style={({ pressed }) => [
                          styles.kindOption,
                          {
                            backgroundColor: selected
                              ? colors.primary
                              : colors.background,
                            borderColor: selected
                              ? colors.primary
                              : colors.border,
                          },
                          pressed && styles.pressed,
                        ]}
                      >
                        <MaterialCommunityIcons
                          name={kind.icon}
                          size={21}
                          color={
                            selected
                              ? colors.primaryForeground
                              : colors.primary
                          }
                        />
                        <Text
                          numberOfLines={1}
                          style={[
                            styles.kindLabel,
                            {
                              color: selected
                                ? colors.primaryForeground
                                : colors.foreground,
                            },
                          ]}
                        >
                          {kind.label}
                        </Text>
                      </Pressable>
                    );
                  })}
                </View>
                <View style={styles.devicePickerSection}>
                  <Text
                    style={[
                      styles.devicePickerTitle,
                      { color: colors.foreground },
                    ]}
                  >
                    Pairing status
                  </Text>
                  <View style={styles.devicePickerMessage}>
                    <MaterialCommunityIcons
                      name="bluetooth-connect"
                      size={20}
                      color={colors.primary}
                    />
                    <Text
                      style={[
                        styles.devicePickerMessageText,
                        { color: colors.mutedForeground },
                      ]}
                    >
                      Tuya device pairing and live control require the separate
                      Xcode-based iPhone app. This build can save room tiles only.
                    </Text>
                  </View>
                </View>
                <TextInput
                  value={controlName}
                  onChangeText={setControlName}
                  placeholder={selectedDefinition?.defaultName ?? 'Control name'}
                  placeholderTextColor={colors.mutedForeground}
                  returnKeyType="done"
                  accessibilityLabel="Control name"
                  testID="control-name-input"
                  style={[
                    styles.textInput,
                    {
                      backgroundColor: colors.background,
                      borderColor: colors.border,
                      color: colors.foreground,
                    },
                  ]}
                />
                <Pressable
                  onPress={addControl}
                  disabled={!controlName.trim()}
                  testID="save-control-button"
                  style={({ pressed }) => [
                    styles.submitButton,
                    {
                      backgroundColor: controlName.trim()
                        ? colors.primary
                        : colors.secondary,
                    },
                    pressed && controlName.trim() && styles.pressed,
                  ]}
                >
                  <Text
                    style={[
                      styles.submitText,
                      {
                        color: controlName.trim()
                          ? colors.primaryForeground
                          : colors.mutedForeground,
                      },
                    ]}
                  >
                    Add unpaired tile
                  </Text>
                </Pressable>
              </>
            )}
          </View>
        </KeyboardAvoidingView>
      </Modal>
      <Modal
        visible={settingsControl !== null}
        transparent
        animationType="slide"
        onRequestClose={() => setSettingsControlId(null)}
      >
        <View style={styles.modalRoot}>
          <Pressable
            style={styles.modalScrim}
            onPress={() => setSettingsControlId(null)}
            accessibilityLabel="Close device settings"
          />
          <KeyboardControllerAvoidingView
            behavior="padding"
            keyboardVerticalOffset={0}
            style={styles.settingsKeyboard}
          >
            <View
              style={[
                styles.sheet,
                {
                  backgroundColor: colors.card,
                  borderColor: colors.border,
                  paddingBottom: Math.max(insets.bottom, 18) + 12,
                },
              ]}
            >
              <View style={styles.sheetHeader}>
                <View style={{ flex: 1 }}>
                  <Text style={[styles.sheetTitle, { color: colors.foreground }]}>
                    Device settings
                  </Text>
                  <Text style={[styles.sheetSubtitle, { color: colors.mutedForeground }]}>
                    {settingsControl?.name ?? ''}
                  </Text>
                </View>
                <Pressable
                  onPress={() => setSettingsControlId(null)}
                  accessibilityRole="button"
                  accessibilityLabel="Close device settings"
                  style={({ pressed }) => [
                    styles.smallIconButton,
                    { backgroundColor: colors.secondary, borderColor: colors.border },
                    pressed && styles.pressed,
                  ]}
                >
                  <MaterialCommunityIcons
                    name="close"
                    size={18}
                    color={colors.foreground}
                  />
                </Pressable>
              </View>
              <View
                style={[
                  styles.settingsSummary,
                  { backgroundColor: colors.secondary },
                ]}
              >
                <MaterialCommunityIcons
                  name={
                    deviceKinds.find((kind) => kind.key === settingsControl?.kind)
                      ?.icon ?? 'cog-outline'
                  }
                  size={20}
                  color={colors.primary}
                />
                <View style={{ flex: 1, gap: 4 }}>
                  <Text style={[styles.deviceName, { color: colors.foreground }]}>
                    {deviceKinds.find((kind) => kind.key === settingsControl?.kind)
                      ?.label ?? 'Device'}
                  </Text>
                  <Text style={[styles.deviceMeta, { color: colors.mutedForeground }]}>
                    The tile alternates ON and OFF based on the last Shortcut it launched, not the device’s actual state.
                  </Text>
                </View>
              </View>
              <View style={styles.wattageField}>
                <Text style={[styles.deviceName, { color: colors.foreground }]}>
                  ON Shortcut
                </Text>
                <TextInput
                  value={onShortcutInput}
                  onChangeText={setOnShortcutInput}
                  maxLength={100}
                  returnKeyType="done"
                  onSubmitEditing={saveControlShortcut}
                  placeholder="Exact ON Shortcut name"
                  placeholderTextColor={colors.mutedForeground}
                  accessibilityLabel="ON Shortcut name"
                  testID="on-shortcut-name-input"
                  style={[
                    styles.textInput,
                    {
                      backgroundColor: colors.background,
                      borderColor: colors.border,
                      color: colors.foreground,
                    },
                  ]}
                />
                <Text style={[styles.deviceName, { color: colors.foreground }]}>
                  OFF Shortcut
                </Text>
                <TextInput
                  value={offShortcutInput}
                  onChangeText={setOffShortcutInput}
                  maxLength={100}
                  returnKeyType="done"
                  onSubmitEditing={saveControlShortcut}
                  placeholder="Exact OFF Shortcut name"
                  placeholderTextColor={colors.mutedForeground}
                  accessibilityLabel="OFF Shortcut name"
                  testID="off-shortcut-name-input"
                  style={[
                    styles.textInput,
                    {
                      backgroundColor: colors.background,
                      borderColor: colors.border,
                      color: colors.foreground,
                    },
                  ]}
                />
                <Pressable
                  onPress={saveControlShortcut}
                  accessibilityRole="button"
                  accessibilityLabel="Save ON and OFF Shortcut names"
                  testID="save-shortcut-names-button"
                  style={({ pressed }) => [
                    styles.submitButton,
                    { backgroundColor: colors.primary },
                    pressed && styles.pressed,
                  ]}
                >
                  <Text style={[styles.submitText, { color: colors.primaryForeground }]}>
                    Save Shortcuts
                  </Text>
                </Pressable>
                <Text style={[styles.deviceMeta, { color: colors.mutedForeground }]}>
                  First tap runs ON, then each tap alternates. Save both exact Shortcut names. Changes made outside Home Control can make this remembered state inaccurate.
                </Text>
              </View>
              <View style={styles.wattageField}>
                <Text style={[styles.deviceName, { color: colors.foreground }]}>
                  Rated wattage
                </Text>
                <View style={styles.wattageInputRow}>
                  <TextInput
                    value={wattageInput}
                    onChangeText={(value) => {
                      setWattageInput(value);
                      setWattageError(null);
                    }}
                    keyboardType="decimal-pad"
                    returnKeyType="done"
                    onSubmitEditing={saveControlWattage}
                    placeholder="Enter watts"
                    placeholderTextColor={colors.mutedForeground}
                    accessibilityLabel="Device wattage"
                    testID="wattage-input"
                    style={[
                      styles.textInput,
                      styles.wattageInput,
                      {
                        backgroundColor: colors.background,
                        borderColor: colors.border,
                        color: colors.foreground,
                      },
                    ]}
                  />
                  <Text style={[styles.wattageUnit, { color: colors.mutedForeground }]}>
                    W
                  </Text>
                  <Pressable
                    onPress={saveControlWattage}
                    accessibilityRole="button"
                    accessibilityLabel="Save wattage"
                    testID="save-wattage-button"
                    style={({ pressed }) => [
                      styles.wattageSaveButton,
                      { backgroundColor: colors.primary },
                      pressed && styles.pressed,
                    ]}
                  >
                    <MaterialCommunityIcons
                      name="check"
                      size={20}
                      color={colors.primaryForeground}
                    />
                  </Pressable>
                </View>
                <Text style={[styles.deviceMeta, { color: colors.mutedForeground }]}>
                  Saved for future power estimates. Live device status is unavailable here.
                </Text>
                {wattageError && (
                  <Text style={[styles.deviceMeta, { color: colors.destructive }]}>
                    {wattageError}
                  </Text>
                )}
              </View>
              <Pressable
                onPress={() => {
                  if (!settingsControl) return;
                  const control = settingsControl;
                  setSettingsControlId(null);
                  removeControl(control.id, control.name);
                }}
                accessibilityRole="button"
                accessibilityLabel={`Remove ${settingsControl?.name ?? 'device'} from this room`}
                accessibilityHint="This removes only the room tile. It does not affect a paired device."
                testID="remove-control-from-settings-button"
                style={({ pressed }) => [
                  styles.settingsRemoveButton,
                  { borderColor: colors.destructive },
                  pressed && styles.pressed,
                ]}
              >
                <MaterialCommunityIcons
                  name="delete-outline"
                  size={18}
                  color={colors.destructive}
                />
                <Text style={[styles.settingsRemoveText, { color: colors.destructive }]}>
                  Remove from room
                </Text>
              </Pressable>
            </View>
          </KeyboardControllerAvoidingView>
        </View>
      </Modal>
    </View>
  );
}

const styles = StyleSheet.create({
  loading: { flex: 1, alignItems: 'center', justifyContent: 'center' },
  screen: { flex: 1, paddingHorizontal: 16, gap: 14 },
  header: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'space-between',
    gap: 10,
  },
  activeLoadCard: {
    minHeight: 62,
    borderWidth: 1,
    borderRadius: 18,
    paddingHorizontal: 12,
    paddingVertical: 10,
    flexDirection: 'row',
    alignItems: 'center',
    gap: 10,
  },
  activeLoadIcon: {
    width: 36,
    height: 36,
    borderRadius: 12,
    alignItems: 'center',
    justifyContent: 'center',
  },
  activeLoadInfo: { flex: 1, gap: 3 },
  activeLoadTitle: { fontSize: 9, fontWeight: '700', letterSpacing: 1 },
  activeLoadMeta: { fontSize: 10, fontWeight: '500' },
  activeLoadValue: { fontSize: 18, fontWeight: '700', letterSpacing: -0.3 },
  headerActions: { flexDirection: 'row', alignItems: 'center', gap: 7 },
  signOutButton: {
    width: 32,
    height: 32,
    borderRadius: 11,
    alignItems: 'center',
    justifyContent: 'center',
  },
  brandRow: { flexDirection: 'row', alignItems: 'center', gap: 11 },
  brandIcon: {
    width: 42,
    height: 42,
    borderRadius: 15,
    alignItems: 'center',
    justifyContent: 'center',
  },
  eyebrow: { fontSize: 9, fontWeight: '700', letterSpacing: 1.7 },
  headerTitle: { fontSize: 19, fontWeight: '700', letterSpacing: -0.4 },
  previewBadge: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 5,
    borderRadius: 20,
    paddingHorizontal: 10,
    paddingVertical: 7,
  },
  previewBadgeText: { fontSize: 10, fontWeight: '700' },
  storageWarning: { borderRadius: 10, paddingHorizontal: 12, paddingVertical: 8 },
  workspace: { flex: 1, minHeight: 0, flexDirection: 'row' },
  roomRail: {
    width: 122,
    borderRightWidth: 1,
    paddingRight: 10,
    paddingTop: 4,
  },
  railHeading: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'space-between',
    marginBottom: 12,
    paddingLeft: 3,
  },
  railLabel: { fontSize: 9, fontWeight: '700', letterSpacing: 1.4 },
  smallIconButton: {
    width: 31,
    height: 31,
    alignItems: 'center',
    justifyContent: 'center',
    borderWidth: 1,
    borderRadius: 11,
  },
  roomList: { flex: 1 },
  roomListContent: { gap: 6, paddingBottom: 10 },
  roomItem: {
    minHeight: 48,
    borderWidth: 1,
    borderRadius: 13,
    paddingHorizontal: 7,
    paddingVertical: 6,
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'center',
    gap: 7,
  },
  roomText: { flex: 1, minWidth: 0, gap: 2 },
  roomName: { fontSize: 11, lineHeight: 14, fontWeight: '700' },
  roomCount: { fontSize: 8, fontWeight: '500' },
  railHint: { fontSize: 10, lineHeight: 15, paddingHorizontal: 4 },
  roomContent: { flex: 1, minWidth: 0, paddingLeft: 14, paddingTop: 4 },
  roomHeader: {
    minHeight: 77,
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'space-between',
    gap: 7,
    marginBottom: 12,
  },
  roomTitleBlock: { flex: 1, minWidth: 0 },
  sectionEyebrow: { fontSize: 9, fontWeight: '700', letterSpacing: 1.5 },
  roomTitle: { fontSize: 21, lineHeight: 26, fontWeight: '700', marginTop: 3 },
  roomSubtitle: { fontSize: 10, marginTop: 3 },
  addControlButton: {
    height: 39,
    borderRadius: 13,
    paddingHorizontal: 10,
    flexDirection: 'row',
    alignItems: 'center',
    gap: 3,
  },
  addControlText: { fontSize: 11, fontWeight: '700' },
  controlsScroll: { flex: 1 },
  controlsList: { gap: 6, paddingBottom: 12 },
  controlCard: {
    minHeight: 56,
    borderRadius: 15,
    borderWidth: 1,
    paddingHorizontal: 8,
    paddingVertical: 7,
    flexDirection: 'row',
    alignItems: 'center',
    gap: 7,
  },
  deviceIconWrap: {
    width: 36,
    height: 36,
    borderRadius: 12,
    alignItems: 'center',
    justifyContent: 'center',
  },
  deviceInfo: { flex: 1, minWidth: 0, gap: 3 },
  deviceName: { fontSize: 11, fontWeight: '700' },
  deviceMetaRow: { flexDirection: 'row', alignItems: 'center', gap: 5 },
  previewDot: { width: 6, height: 6, borderRadius: 3 },
  deviceMeta: { fontSize: 9, fontWeight: '500' },
  stateBadge: {
    minWidth: 43,
    height: 25,
    borderRadius: 13,
    paddingHorizontal: 7,
    alignItems: 'center',
    justifyContent: 'center',
  },
  stateBadgeText: { fontSize: 9, fontWeight: '700' },
  emptyCard: {
    flex: 1,
    minHeight: 230,
    borderWidth: 1,
    borderRadius: 20,
    paddingHorizontal: 15,
    paddingVertical: 22,
    alignItems: 'flex-start',
    justifyContent: 'center',
  },
  emptyIcon: {
    width: 52,
    height: 52,
    borderRadius: 17,
    alignItems: 'center',
    justifyContent: 'center',
    marginBottom: 16,
  },
  emptyTitle: { fontSize: 17, fontWeight: '700', letterSpacing: -0.3 },
  emptyBody: { fontSize: 11, lineHeight: 17, marginTop: 7, maxWidth: 230 },
  emptyAction: {
    minHeight: 39,
    borderRadius: 13,
    paddingHorizontal: 12,
    flexDirection: 'row',
    alignItems: 'center',
    gap: 6,
    marginTop: 16,
  },
  emptyActionText: { fontSize: 11, fontWeight: '700' },
  noRooms: {
    flex: 1,
    alignItems: 'flex-start',
    justifyContent: 'center',
    paddingHorizontal: 12,
  },
  modalRoot: { flex: 1, justifyContent: 'flex-end' },
  modalScrim: {
    ...StyleSheet.absoluteFill,
    backgroundColor: 'rgba(11, 18, 14, 0.46)',
  },
  sheet: {
    borderTopLeftRadius: 25,
    borderTopRightRadius: 25,
    borderWidth: 1,
    paddingHorizontal: 20,
    paddingTop: 22,
    gap: 14,
  },
  sheetHeader: {
    flexDirection: 'row',
    alignItems: 'flex-start',
    justifyContent: 'space-between',
    gap: 12,
    marginBottom: 2,
  },
  sheetTitle: { fontSize: 20, fontWeight: '700', letterSpacing: -0.4 },
  sheetSubtitle: { fontSize: 11, lineHeight: 16, marginTop: 5, maxWidth: 270 },
  settingsKeyboard: { width: '100%' },
  settingsSummary: {
    minHeight: 74,
    borderRadius: 16,
    paddingHorizontal: 14,
    paddingVertical: 12,
    flexDirection: 'row',
    alignItems: 'center',
    gap: 12,
  },
  wattageField: { gap: 8 },
  wattageInputRow: { flexDirection: 'row', alignItems: 'center', gap: 8 },
  wattageInput: { flex: 1 },
  wattageUnit: { fontSize: 13, fontWeight: '700' },
  wattageSaveButton: {
    width: 46,
    height: 46,
    borderRadius: 14,
    alignItems: 'center',
    justifyContent: 'center',
  },
  settingsRemoveButton: {
    minHeight: 48,
    borderWidth: 1,
    borderRadius: 15,
    paddingHorizontal: 14,
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'center',
    gap: 8,
  },
  settingsRemoveText: { fontSize: 13, fontWeight: '700' },
  textInput: {
    height: 48,
    borderWidth: 1,
    borderRadius: 14,
    paddingHorizontal: 13,
    fontSize: 14,
  },
  submitButton: {
    height: 48,
    borderRadius: 15,
    alignItems: 'center',
    justifyContent: 'center',
  },
  submitText: { fontSize: 13, fontWeight: '700' },
  kindGrid: { flexDirection: 'row', flexWrap: 'wrap', gap: 8 },
  kindOption: {
    width: '48%',
    minHeight: 57,
    borderWidth: 1,
    borderRadius: 15,
    paddingHorizontal: 9,
    flexDirection: 'row',
    alignItems: 'center',
    gap: 8,
  },
  kindLabel: { flex: 1, fontSize: 10, fontWeight: '600' },
  devicePickerSection: { gap: 8 },
  devicePickerTitle: { fontSize: 12, fontWeight: '700' },
  devicePickerList: { maxHeight: 170 },
  devicePickerItem: {
    minHeight: 52,
    borderWidth: 1,
    borderRadius: 13,
    paddingHorizontal: 11,
    flexDirection: 'row',
    alignItems: 'center',
    gap: 9,
  },
  devicePickerItemInfo: {
    flex: 1,
    minWidth: 0,
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'space-between',
    gap: 8,
  },
  devicePickerItemName: { flex: 1, fontSize: 11, fontWeight: '600' },
  devicePickerItemMeta: { fontSize: 9, fontWeight: '600' },
  devicePickerMessage: {
    minHeight: 40,
    alignItems: 'center',
    justifyContent: 'center',
    flexDirection: 'row',
    gap: 8,
  },
  devicePickerMessageText: { fontSize: 10, lineHeight: 15 },
  pressed: { opacity: 0.78, transform: [{ scale: 0.98 }] },
});
