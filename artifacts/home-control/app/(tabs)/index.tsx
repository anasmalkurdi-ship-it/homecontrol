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
import { TuyaPairingFlow } from '@/components/TuyaPairingFlow';
import {
  TuyaSmartHome,
  type TuyaDeviceSnapshot,
  type TuyaHome,
  type TuyaSchema,
} from '@/services/tuyaSmartHome';

type DeviceKind =
  | 'chandelier'
  | 'sideLight'
  | 'bathroomLight'
  | 'fan'
  | 'heater'
  | 'nightLight'
  | 'airConditioner';
type DeviceIcon = keyof typeof MaterialCommunityIcons.glyphMap;
type ShortcutAction = 'on' | 'off';
type ControlMethod = 'shortcut' | 'tuya-sdk';

type Room = {
  id: string;
  name: string;
};

type HomeControl = {
  id: string;
  roomId: string;
  name: string;
  kind: DeviceKind;
  customIcon?: DeviceIcon;
  wattage?: number;
  onShortcutName?: string;
  offShortcutName?: string;
  lastShortcutAction?: ShortcutAction;
  shortcutName?: string;
  controlMethod?: ControlMethod;
  tuyaDeviceId?: string;
  tuyaHomeId?: string;
  tuyaSwitchDpId?: string;
  tuyaDps?: Record<string, unknown>;
  tuyaSchema?: TuyaSchema[];
  tuyaOnline?: boolean;
  nameCustomized?: boolean;
  isUnused?: boolean;
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
  icon: DeviceIcon;
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
    key: 'bathroomLight',
    label: 'Bathroom light',
    defaultName: 'Bathroom light',
    icon: 'toilet',
  },
  {
    key: 'fan',
    label: 'Fan',
    defaultName: 'Fan',
    icon: 'fan',
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

const deviceIconOptions: {
  key: string;
  label: string;
  icon: DeviceIcon;
}[] = [
  ...deviceKinds,
  { key: 'spot-lights', label: 'Spot lights', icon: 'light-recessed' },
  { key: 'led-rope-light', label: 'LED rope light', icon: 'led-strip' },
  { key: 'mirror', label: 'Mirror', icon: 'mirror' },
];

function createId() {
  return `${Date.now()}-${Math.random().toString(36).slice(2, 9)}`;
}

function isDeviceKind(value: unknown): value is DeviceKind {
  return (
    value === 'chandelier' ||
    value === 'sideLight' ||
    value === 'bathroomLight' ||
    value === 'fan' ||
    value === 'heater' ||
    value === 'nightLight' ||
    value === 'airConditioner'
  );
}

function isDeviceIcon(value: unknown): value is DeviceIcon {
  return (
    typeof value === 'string' &&
    Object.prototype.hasOwnProperty.call(
      MaterialCommunityIcons.glyphMap,
      value,
    )
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
            typeof control.shortcutName === 'string') &&
          (control.controlMethod === undefined ||
            control.controlMethod === 'shortcut' ||
            control.controlMethod === 'tuya-sdk') &&
          (control.tuyaDeviceId === undefined ||
            typeof control.tuyaDeviceId === 'string') &&
          (control.tuyaHomeId === undefined ||
            typeof control.tuyaHomeId === 'string') &&
          (control.tuyaSwitchDpId === undefined ||
            typeof control.tuyaSwitchDpId === 'string') &&
          (control.tuyaDps === undefined ||
            (!!control.tuyaDps &&
              typeof control.tuyaDps === 'object' &&
              !Array.isArray(control.tuyaDps))) &&
          (control.tuyaSchema === undefined ||
            (Array.isArray(control.tuyaSchema) &&
              control.tuyaSchema.every(
                (schema) =>
                  !!schema &&
                  typeof schema.dpId === 'string' &&
                  typeof schema.code === 'string' &&
                  typeof schema.name === 'string' &&
                  typeof schema.mode === 'string',
              ))) &&
          (control.tuyaOnline === undefined ||
            typeof control.tuyaOnline === 'boolean') &&
          (control.nameCustomized === undefined ||
            typeof control.nameCustomized === 'boolean') &&
          (control.isUnused === undefined ||
            typeof control.isUnused === 'boolean'),
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
            ...(isDeviceIcon(control.customIcon)
              ? { customIcon: control.customIcon }
              : {}),
            ...(typeof control.wattage === 'number'
              ? { wattage: control.wattage }
              : {}),
            ...(onShortcutName ? { onShortcutName } : {}),
            ...(offShortcutName ? { offShortcutName } : {}),
            ...(control.lastShortcutAction
              ? { lastShortcutAction: control.lastShortcutAction }
              : {}),
            ...(control.controlMethod
              ? { controlMethod: control.controlMethod }
              : {}),
            ...(typeof control.tuyaDeviceId === 'string'
              ? { tuyaDeviceId: control.tuyaDeviceId }
              : {}),
            ...(typeof control.tuyaHomeId === 'string'
              ? { tuyaHomeId: control.tuyaHomeId }
              : {}),
            ...(typeof control.tuyaSwitchDpId === 'string'
              ? { tuyaSwitchDpId: control.tuyaSwitchDpId }
              : {}),
            ...(control.tuyaDps &&
            typeof control.tuyaDps === 'object' &&
            !Array.isArray(control.tuyaDps)
              ? { tuyaDps: control.tuyaDps }
              : {}),
            ...(Array.isArray(control.tuyaSchema)
              ? { tuyaSchema: control.tuyaSchema }
              : {}),
            ...(typeof control.tuyaOnline === 'boolean'
              ? { tuyaOnline: control.tuyaOnline }
              : {}),
            ...(typeof control.nameCustomized === 'boolean'
              ? { nameCustomized: control.nameCustomized }
              : {}),
            ...(typeof control.isUnused === 'boolean'
              ? { isUnused: control.isUnused }
              : {}),
          };
        })
    : [];

  const activeRoomId =
    typeof value.activeRoomId === 'string' && roomIds.has(value.activeRoomId)
      ? value.activeRoomId
      : (rooms[0]?.id ?? null);

  return {
    rooms,
    controls: controls.flatMap(splitTuyaControlBySwitch),
    activeRoomId,
  };
}

function getTuyaSwitchDps(control: HomeControl): TuyaSchema[] {
  const dps = control.tuyaDps ?? {};
  const booleanSchema = (control.tuyaSchema ?? []).filter(
    (item) =>
      typeof dps[item.dpId] === 'boolean' &&
      item.mode.toLowerCase() !== 'ro',
  );
  const preferred = booleanSchema.filter((item) =>
    /switch|power|on_off|light/i.test(`${item.code} ${item.name}`),
  );
  const candidates =
    preferred.length > 0
      ? preferred
      : booleanSchema[0]
        ? [booleanSchema[0]]
        : (() => {
            const dpsFallback = Object.entries(dps).find(
              ([, value]) => typeof value === 'boolean',
            );
            return dpsFallback
              ? [
                  {
                    dpId: dpsFallback[0],
                    code: dpsFallback[0],
                    name: 'Switch',
                    mode: 'rw',
                  },
                ]
              : [];
          })();

  if (control.tuyaSwitchDpId) {
    const matched = candidates.find(
      (schema) => schema.dpId === control.tuyaSwitchDpId,
    );
    if (matched) return [matched];

    const schema = (control.tuyaSchema ?? []).find(
      (item) => item.dpId === control.tuyaSwitchDpId,
    );
    return schema
      ? [schema]
      : [
          {
            dpId: control.tuyaSwitchDpId,
            code: control.tuyaSwitchDpId,
            name: 'Switch',
            mode: 'rw',
          },
        ];
  }

  return candidates;
}

function getTuyaSwitchDpId(control: HomeControl): string | null {
  return getTuyaSwitchDps(control)[0]?.dpId ?? null;
}

function getTuyaSwitchLabel(schema: TuyaSchema, index: number): string {
  const numberInCode = schema.code.match(/(\d+)$/)?.[1];
  if (numberInCode) return `Switch ${numberInCode}`;
  return schema.name.trim() || `Switch ${index + 1}`;
}

function splitTuyaControlBySwitch(control: HomeControl): HomeControl[] {
  if (control.controlMethod !== 'tuya-sdk' || control.tuyaSwitchDpId) {
    return [control];
  }
  const switches = getTuyaSwitchDps(control);
  if (switches.length < 2) return [control];

  return switches.map((schema, index) => ({
    ...control,
    id:
      index === 0
        ? control.id
        : `${control.id}-gang-${schema.dpId}`,
    name: `${control.name} — ${getTuyaSwitchLabel(schema, index)}`,
    wattage: index === 0 ? control.wattage : undefined,
    tuyaSwitchDpId: schema.dpId,
    nameCustomized: true,
  }));
}

function getTuyaPowerState(control: HomeControl): boolean | undefined {
  const dpId = getTuyaSwitchDpId(control);
  if (!dpId) return undefined;
  const value = control.tuyaDps?.[dpId];
  return typeof value === 'boolean' ? value : undefined;
}

function isControlActive(control: HomeControl): boolean {
  return (
    !control.isUnused &&
    (control.controlMethod === 'tuya-sdk'
      ? getTuyaPowerState(control) === true
      : control.lastShortcutAction === 'on')
  );
}

function formatWattage(wattage: number): string {
  return `${Number.isInteger(wattage) ? wattage : wattage.toFixed(1)} W`;
}

function UnpairedControlCard({
  control,
  onPress,
  onOpenSettings,
}: {
  control: HomeControl;
  onPress: (dpId?: string) => void;
  onOpenSettings: () => void;
}) {
  const colors = useColors();
  const definition = deviceKinds.find((kind) => kind.key === control.kind);
  const hasShortcutPair = Boolean(
    control.onShortcutName?.trim() && control.offShortcutName?.trim(),
  );
  const isTuyaDevice = control.controlMethod === 'tuya-sdk';
  const tuyaReportedOn = isTuyaDevice
    ? getTuyaPowerState(control)
    : undefined;
  const lastRequestedOn = isTuyaDevice
    ? tuyaReportedOn === true
    : control.lastShortcutAction === 'on';
  const hasLastRequest = control.lastShortcutAction !== undefined;
  const orange = colors.deviceOn;
  const wattageLabel =
    control.wattage === undefined
      ? 'Wattage not set'
      : formatWattage(control.wattage);
  const longPressTriggered = useRef(false);
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
        isTuyaDevice
          ? `${control.name}, Tuya device ${tuyaReportedOn === undefined ? 'state unknown' : tuyaReportedOn ? 'on' : 'off'}${control.tuyaOnline === false ? ', offline' : ''}`
          : hasShortcutPair
            ? `${control.name}, ON and OFF Shortcuts configured${hasLastRequest ? `, last requested ${control.lastShortcutAction}` : ''}. Actual device state is not verified.`
            : `${control.name}, ON and OFF Shortcuts not configured`
      }
      accessibilityHint={
        isTuyaDevice
          ? 'Tap to toggle the device. Press and hold for settings.'
          : hasShortcutPair
            ? `Tap to run the ${control.lastShortcutAction === 'on' ? 'OFF' : 'ON'} Shortcut. Press and hold for settings.`
            : 'Tap to open setup instructions, or press and hold for settings.'
      }
      accessibilityActions={[{ name: 'longpress', label: 'Open device settings' }]}
      testID={`control-tile-${control.id}`}
      style={({ pressed }) => [
        styles.controlCard,
        {
          backgroundColor: lastRequestedOn ? `${orange}18` : colors.card,
          borderColor: lastRequestedOn ? orange : colors.border,
        },
        pressed && styles.pressed,
      ]}
    >
      <View
        style={[
          styles.deviceIconWrap,
          {
            backgroundColor: lastRequestedOn ? `${orange}35` : colors.secondary,
          },
        ]}
      >
        <MaterialCommunityIcons
          name={control.customIcon ?? definition?.icon ?? 'lightbulb-outline'}
          size={21}
          color={lastRequestedOn ? orange : colors.primary}
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
              {
                backgroundColor: lastRequestedOn
                  ? orange
                  : colors.mutedForeground,
              },
            ]}
          />
          <Text
            style={[
              styles.deviceMeta,
              { color: lastRequestedOn ? orange : colors.mutedForeground },
            ]}
          >
            {wattageLabel}
          </Text>
        </View>
      </View>
      <View
        style={[
          styles.stateBadge,
          {
            backgroundColor: lastRequestedOn ? orange : colors.secondary,
          },
        ]}
      >
        <Text
          style={[
            styles.stateBadgeText,
            {
              color: lastRequestedOn
                ? colors.deviceOnForeground
                : colors.mutedForeground,
            },
          ]}
        >
          {isTuyaDevice
            ? tuyaReportedOn === undefined
              ? '—'
              : tuyaReportedOn
                ? 'ON'
                : 'OFF'
            : hasLastRequest
              ? `Last ${control.lastShortcutAction?.toUpperCase()}`
              : hasShortcutPair
                ? 'Toggle'
                : 'Setup'}
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
  const [roomPickerControlId, setRoomPickerControlId] = useState<string | null>(null);
  const [showUnusedDevices, setShowUnusedDevices] = useState(false);
  const [wattageInput, setWattageInput] = useState('');
  const [wattageError, setWattageError] = useState<string | null>(null);
  const [deviceNameInput, setDeviceNameInput] = useState('');
  const [deviceNameError, setDeviceNameError] = useState<string | null>(null);
  const [onShortcutInput, setOnShortcutInput] = useState('');
  const [offShortcutInput, setOffShortcutInput] = useState('');
  const [roomName, setRoomName] = useState('');
  const [controlName, setControlName] = useState('');
  const [selectedKind, setSelectedKind] = useState<DeviceKind>('chandelier');
  const [tuyaPairingVisible, setTuyaPairingVisible] = useState(false);

  const tuyaControlSignature = useMemo(
    () =>
      [
        ...new Set(
          data.controls
            .filter(
              (control) =>
                control.controlMethod === 'tuya-sdk' && control.tuyaDeviceId,
            )
            .map(
              (control) =>
                `${control.tuyaHomeId ?? ''}:${control.tuyaDeviceId!}`,
            ),
        ),
      ]
        .sort()
        .join('|'),
    [data.controls],
  );

  const applyTuyaSnapshot = (snapshot: TuyaDeviceSnapshot) => {
    if (!snapshot.deviceId) return;
    setData((current) => ({
      ...current,
      controls: current.controls
        .map((control) =>
          control.controlMethod === 'tuya-sdk' &&
          control.tuyaDeviceId === snapshot.deviceId
            ? {
                ...control,
                name: control.nameCustomized
                  ? control.name
                  : snapshot.name || control.name,
                tuyaDps: snapshot.dps,
                tuyaSchema: snapshot.schema,
                tuyaOnline: snapshot.isOnline,
              }
            : control,
        )
        .flatMap(splitTuyaControlBySwitch),
    }));
  };

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

  useEffect(() => {
    if (
      !ready ||
      Platform.OS !== 'ios' ||
      !TuyaSmartHome.isNativeAvailable() ||
      !tuyaControlSignature
    ) {
      return;
    }

    let mounted = true;
    const tuyaDevices = new Map<
      string,
      { deviceId: string; homeId: string }
    >();
    for (const control of data.controls) {
      if (
        control.controlMethod === 'tuya-sdk' &&
        control.tuyaDeviceId &&
        control.tuyaHomeId
      ) {
        const key = `${control.tuyaHomeId}:${control.tuyaDeviceId}`;
        tuyaDevices.set(key, {
          deviceId: control.tuyaDeviceId,
          homeId: control.tuyaHomeId,
        });
      }
    }
    const deviceUpdates = TuyaSmartHome.addListener(
      'onDeviceUpdate',
      (snapshot) => {
        if (mounted) applyTuyaSnapshot(snapshot);
      },
    );

    const devicesToObserve = Array.from(tuyaDevices.values());
    let nextDeviceIndex = 0;
    const observeNextDevice = async () => {
      while (mounted) {
        const device = devicesToObserve[nextDeviceIndex];
        nextDeviceIndex += 1;
        if (!device) return;
        try {
          const snapshot = await TuyaSmartHome.observeDevice(
            device.deviceId,
            device.homeId,
          );
          if (mounted) applyTuyaSnapshot(snapshot);
        } catch {
          // Keep loading other devices if one device cannot be observed.
        }
      }
    };
    void Promise.all([
      observeNextDevice(),
      observeNextDevice(),
    ]);

    return () => {
      mounted = false;
      deviceUpdates?.remove();
    };
    // The stable signature avoids re-subscribing when only device state changes.
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [ready, tuyaControlSignature]);

  const activeRoom = useMemo(
    () => data.rooms.find((room) => room.id === data.activeRoomId) ?? null,
    [data.activeRoomId, data.rooms],
  );
  const settingsControl =
    data.controls.find((control) => control.id === settingsControlId) ?? null;
  const settingsControlDefinition = deviceKinds.find(
    (kind) => kind.key === settingsControl?.kind,
  );
  const settingsControlDefaultIcon =
    settingsControlDefinition?.icon ?? 'cog-outline';
  const settingsControlIcon =
    settingsControl?.customIcon ?? settingsControlDefaultIcon;
  const roomPickerControl =
    data.controls.find((control) => control.id === roomPickerControlId) ?? null;
  const roomControls = useMemo(
    () =>
      showUnusedDevices
        ? data.controls.filter((control) => control.isUnused)
        : data.controls.filter(
            (control) =>
              !control.isUnused && control.roomId === activeRoom?.id,
          ),
    [activeRoom?.id, data.controls, showUnusedDevices],
  );
  const unusedDeviceCount = data.controls.filter((control) => control.isUnused).length;
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
    setShowUnusedDevices(false);
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
      controls: [...current.controls, ...splitTuyaControlBySwitch(control)],
    }));
    setDialog(null);
    void Haptics.notificationAsync(Haptics.NotificationFeedbackType.Success);
  };

  const addTuyaControl = (device: TuyaDeviceSnapshot, home: TuyaHome) => {
    if (!activeRoom) return;
    const control: HomeControl = {
      id: createId(),
      roomId: activeRoom.id,
      name:
        controlName.trim() ||
        device.name ||
        deviceKinds.find((kind) => kind.key === selectedKind)?.defaultName ||
        'Device',
      kind: selectedKind,
      controlMethod: 'tuya-sdk',
      tuyaDeviceId: device.deviceId,
      tuyaHomeId: home.homeId,
      tuyaDps: device.dps,
      tuyaSchema: device.schema,
      tuyaOnline: device.isOnline,
    };
    setData((current) => ({
      ...current,
      controls: [...current.controls, control],
    }));
    setTuyaPairingVisible(false);
    void Haptics.notificationAsync(Haptics.NotificationFeedbackType.Success);
  };

  const openTuyaPairing = () => {
    if (!activeRoom) return;
    setDialog(null);
    setTuyaPairingVisible(true);
  };

  const openControlSettings = (controlId: string) => {
    const control = data.controls.find((item) => item.id === controlId);
    setRoomPickerControlId(null);
    setWattageInput(
      typeof control?.wattage === 'number' ? String(control.wattage) : '',
    );
    setOnShortcutInput(control?.onShortcutName ?? control?.shortcutName ?? '');
    setOffShortcutInput(control?.offShortcutName ?? '');
    setWattageError(null);
    setDeviceNameInput(control?.name ?? '');
    setDeviceNameError(null);
    setSettingsControlId(controlId);
  };

  const saveDeviceName = () => {
    if (!settingsControl) return;
    const name = deviceNameInput.trim();
    if (!name) {
      setDeviceNameError('Enter a name for this device.');
      return;
    }
    setData((current) => ({
      ...current,
      controls: current.controls.map((control) =>
        control.id === settingsControl.id
          ? { ...control, name, nameCustomized: true }
          : control,
      ),
    }));
    setDeviceNameError(null);
    Keyboard.dismiss();
    void Haptics.notificationAsync(Haptics.NotificationFeedbackType.Success);
  };

  const saveDeviceIcon = (icon?: DeviceIcon) => {
    if (!settingsControl) return;
    setData((current) => ({
      ...current,
      controls: current.controls.map((control) =>
        control.id === settingsControl.id
          ? { ...control, customIcon: icon }
          : control,
      ),
    }));
    void Haptics.selectionAsync();
  };

  const saveShortcutNames = () => {
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
            }
          : control,
      ),
    }));
    Keyboard.dismiss();
    void Haptics.notificationAsync(Haptics.NotificationFeedbackType.Success);
  };

  const runControlShortcut = (control: HomeControl, requestedDpId?: string) => {
    if (control.controlMethod === 'tuya-sdk') {
      if (!control.tuyaDeviceId) {
        Alert.alert('Device link missing', 'Open device settings and pair this tile again.');
        return;
      }
      if (!control.tuyaHomeId) {
        Alert.alert('Home link missing', 'Open device settings and pair this tile again.');
        return;
      }
      if (control.tuyaOnline === false) {
        Alert.alert('Device offline', 'The Tuya device is currently offline.');
        return;
      }

      void (async () => {
        try {
          let currentControl = control;
          let dpId = requestedDpId ?? getTuyaSwitchDpId(currentControl);
          let currentValue =
            dpId && typeof currentControl.tuyaDps?.[dpId] === 'boolean'
              ? currentControl.tuyaDps[dpId]
              : undefined;

          if (typeof currentValue !== 'boolean') {
            const snapshot = await TuyaSmartHome.observeDevice(
              control.tuyaDeviceId!,
              control.tuyaHomeId!,
            );
            applyTuyaSnapshot(snapshot);
            currentControl = {
              ...currentControl,
              tuyaDps: snapshot.dps,
              tuyaSchema: snapshot.schema,
              tuyaOnline: snapshot.isOnline,
            };
            dpId = requestedDpId ?? getTuyaSwitchDpId(currentControl);
            currentValue =
              dpId && typeof currentControl.tuyaDps?.[dpId] === 'boolean'
                ? currentControl.tuyaDps[dpId]
                : undefined;
          }

          if (!dpId || typeof currentValue !== 'boolean') {
            Alert.alert(
              'No on/off control found',
              'Tuya did not report a writable on/off switch for this device.',
            );
            return;
          }

          await TuyaSmartHome.publishDps(
            control.tuyaDeviceId!,
            control.tuyaHomeId!,
            { [dpId]: !currentValue },
          );
          void Haptics.selectionAsync();
        } catch (controlError) {
          Alert.alert(
            'Tuya command failed',
            controlError instanceof Error
              ? controlError.message
              : 'The device did not accept the command.',
          );
        }
      })();
      return;
    }

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

    if (Platform.OS !== 'ios') {
      Alert.alert(
        'iPhone only',
        'This tile runs Apple Shortcuts on an iPhone.',
      );
      return;
    }

    const action: ShortcutAction =
      control.lastShortcutAction === 'on' ? 'off' : 'on';
    const shortcutName = action === 'on' ? onShortcutName : offShortcutName;
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
      'Delete tile?',
      `Remove “${name}” from Home Control? This will not remove the device from your Tuya account.`,
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
    setShowUnusedDevices(false);
    void Haptics.selectionAsync();
  };

  const assignControlToRoom = (roomId: string) => {
    if (!roomPickerControl) return;
    const controlId = roomPickerControl.id;
    setData((current) => ({
      ...current,
      activeRoomId: roomId,
      controls: current.controls.map((control) =>
        control.id === controlId
          ? { ...control, roomId, isUnused: false }
          : control,
      ),
    }));
    setShowUnusedDevices(false);
    setRoomPickerControlId(null);
    void Haptics.notificationAsync(Haptics.NotificationFeedbackType.Success);
  };

  const toggleUnusedDevice = () => {
    if (!settingsControl) return;
    const control = settingsControl;
    const hide = !control.isUnused;
    setData((current) => ({
      ...current,
      activeRoomId: hide ? current.activeRoomId : control.roomId,
      controls: current.controls.map((item) =>
        item.id === control.id ? { ...item, isUnused: hide } : item,
      ),
    }));
    setShowUnusedDevices(hide);
    setSettingsControlId(null);
    void Haptics.notificationAsync(Haptics.NotificationFeedbackType.Success);
  };

  const leaveHome = () => {
    void signOut();
  };

  const selectedDefinition = deviceKinds.find(
    (kind) => kind.key === selectedKind,
  );
  const activeControls = data.controls.filter(isControlActive);
  const activeRatedWattage = activeControls.reduce(
    (total, control) => total + (control.wattage ?? 0),
    0,
  );
  const activeControlsMissingWattage = activeControls.filter(
    (control) => control.wattage === undefined,
  ).length;
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
          {unusedDeviceCount > 0 || showUnusedDevices ? (
            <Pressable
              onPress={() => {
                setShowUnusedDevices((current) => !current);
                void Haptics.selectionAsync();
              }}
              accessibilityRole="button"
              accessibilityLabel={
                showUnusedDevices
                  ? 'Return to rooms'
                  : `Unused devices, ${unusedDeviceCount} ${
                      unusedDeviceCount === 1 ? 'device' : 'devices'
                    }`
              }
              accessibilityState={{ selected: showUnusedDevices }}
              testID="unused-devices-header-button"
              style={({ pressed }) => [
                styles.signOutButton,
                {
                  backgroundColor: showUnusedDevices
                    ? colors.primary
                    : colors.secondary,
                },
                pressed && styles.pressed,
              ]}
            >
              <MaterialCommunityIcons
                name="archive-outline"
                size={18}
                color={
                  showUnusedDevices
                    ? colors.primaryForeground
                    : colors.primary
                }
              />
            </Pressable>
          ) : null}
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
        accessibilityLabel={`Active rated power ${activeRatedWattage} watts`}
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
            ACTIVE RATED LOAD
          </Text>
          <Text style={[styles.activeLoadMeta, { color: colors.mutedForeground }]}>
            {activeControls.length === 0
              ? 'No active devices reported'
              : activeControlsMissingWattage > 0
                ? `${activeControls.length} active · ${activeControlsMissingWattage} need wattage`
                : `${activeControls.length} active device${activeControls.length === 1 ? '' : 's'}`}
          </Text>
        </View>
        <Text style={[styles.activeLoadValue, { color: colors.foreground }]}>
          {formatWattage(activeRatedWattage)}
        </Text>
        {activeRoom && !showUnusedDevices ? (
          <Pressable
            onPress={openControlDialog}
            accessibilityRole="button"
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
        ) : null}
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
              const roomActiveWattage = data.controls.reduce(
                (total, control) =>
                  control.roomId === room.id && isControlActive(control)
                    ? total + (control.wattage ?? 0)
                    : total,
                0,
              );
              const roomWattageLabel = formatWattage(roomActiveWattage);
              return (
                <Pressable
                  key={room.id}
                  onPress={() => selectRoom(room.id)}
                  accessibilityRole="button"
                  accessibilityLabel={`${room.name}, active rated power ${roomActiveWattage} watts`}
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
                      {roomWattageLabel}
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
          {activeRoom || showUnusedDevices ? (
            <>
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
                      onPress={(dpId) => runControlShortcut(control, dpId)}
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
                      {showUnusedDevices ? 'No unused devices' : 'Start this room'}
                    </Text>
                    <Text style={[styles.emptyBody, { color: colors.mutedForeground }]}>
                      {showUnusedDevices
                        ? 'Tiles you hide from rooms will stay here so you can restore or move them later.'
                        : 'Add a chandelier, spot light, bathroom light, fan, night light, water heater, or air conditioner tile to arrange your controls.'}
                    </Text>
                    {!showUnusedDevices ? (
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
                    ) : null}
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
                    : 'Add a Shortcut tile or pair a Tuya device to this room.'}
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
                      Pair a device already reset for Wi-Fi setup using your
                      Home Control Tuya account. Smart Life accounts are separate.
                      Existing Shortcut tiles keep working.
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
                    Add Shortcut tile
                  </Text>
                </Pressable>
                <Pressable
                  onPress={openTuyaPairing}
                  accessibilityRole="button"
                  testID="pair-tuya-device-button"
                  style={({ pressed }) => [
                    styles.pairTuyaButton,
                    { borderColor: colors.primary },
                    pressed && styles.pressed,
                  ]}
                >
                  <MaterialCommunityIcons
                    name="access-point-network"
                    size={18}
                    color={colors.primary}
                  />
                  <Text style={[styles.pairTuyaButtonText, { color: colors.primary }]}>
                    Pair a Tuya device
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
                styles.settingsSheet,
                {
                  backgroundColor: colors.card,
                  borderColor: colors.border,
                  paddingBottom: 0,
                },
              ]}
            >
              <ScrollView
                style={styles.settingsScroll}
                keyboardShouldPersistTaps="handled"
                showsVerticalScrollIndicator={false}
                contentContainerStyle={[
                  styles.settingsScrollContent,
                  { paddingBottom: Math.max(insets.bottom, 18) + 12 },
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
              <View style={styles.wattageField}>
                <Text style={[styles.deviceName, { color: colors.foreground }]}>
                  Name in Home Control
                </Text>
                <TextInput
                  value={deviceNameInput}
                  onChangeText={(value) => {
                    setDeviceNameInput(value);
                    setDeviceNameError(null);
                  }}
                  maxLength={60}
                  returnKeyType="done"
                  onSubmitEditing={saveDeviceName}
                  placeholder="Enter a device name"
                  placeholderTextColor={colors.mutedForeground}
                  accessibilityLabel="Name in Home Control"
                  testID="device-name-input"
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
                  onPress={saveDeviceName}
                  accessibilityRole="button"
                  accessibilityLabel="Save device name"
                  testID="save-device-name-button"
                  style={({ pressed }) => [
                    styles.submitButton,
                    { backgroundColor: colors.primary },
                    pressed && styles.pressed,
                  ]}
                >
                  <Text style={[styles.submitText, { color: colors.primaryForeground }]}>
                    Save name
                  </Text>
                </Pressable>
                <Text style={[styles.deviceMeta, { color: colors.mutedForeground }]}>
                  This changes the label in Home Control only.
                </Text>
                {deviceNameError ? (
                  <Text style={[styles.deviceMeta, { color: colors.destructive }]}>
                    {deviceNameError}
                  </Text>
                ) : null}
              </View>
              <View
                style={[
                  styles.settingsSummary,
                  { backgroundColor: colors.secondary },
                ]}
              >
                <MaterialCommunityIcons
                  name={settingsControlIcon}
                  size={20}
                  color={colors.primary}
                />
                <View style={{ flex: 1, gap: 4 }}>
                  <Text style={[styles.deviceName, { color: colors.foreground }]}>
                    {deviceKinds.find((kind) => kind.key === settingsControl?.kind)
                      ?.label ?? 'Device'}
                  </Text>
                  <Text style={[styles.deviceMeta, { color: colors.mutedForeground }]}>
                    {settingsControl?.controlMethod === 'tuya-sdk'
                      ? `Linked through Tuya's iOS SDK. Reported state: ${
                          settingsControl.tuyaOnline === false
                            ? 'offline'
                            : (() => {
                                const dpId = getTuyaSwitchDpId(settingsControl);
                                const value = dpId
                                  ? settingsControl.tuyaDps?.[dpId]
                                  : undefined;
                                return typeof value === 'boolean'
                                  ? value
                                    ? 'on'
                                    : 'off'
                                  : 'not available';
                              })()
                        }.`
                      : 'This tile runs its saved ON/OFF Shortcuts. iOS opens Shortcuts; the label shows the last requested action, not confirmed device state.'}
                  </Text>
                </View>
              </View>
              <View style={styles.iconPickerField}>
                <View style={styles.iconPickerHeader}>
                  <Text style={[styles.deviceName, { color: colors.foreground }]}>
                    Tile icon
                  </Text>
                  <Pressable
                    onPress={() => saveDeviceIcon()}
                    disabled={!settingsControl?.customIcon}
                    accessibilityRole="button"
                    accessibilityLabel="Use device type icon"
                    testID="reset-device-icon-button"
                    style={({ pressed }) => [
                      styles.iconPickerResetButton,
                      !settingsControl?.customIcon && styles.disabledControl,
                      pressed && styles.pressed,
                    ]}
                  >
                    <Text style={[styles.iconPickerResetText, { color: colors.primary }]}>
                      Use default
                    </Text>
                  </Pressable>
                </View>
                <ScrollView
                  horizontal
                  nestedScrollEnabled
                  showsHorizontalScrollIndicator={false}
                  contentContainerStyle={styles.iconPickerOptions}
                >
                  {deviceIconOptions.map((kind) => {
                    const selected = settingsControlIcon === kind.icon;
                    return (
                      <Pressable
                        key={kind.key}
                        onPress={() => saveDeviceIcon(kind.icon)}
                        accessibilityRole="button"
                        accessibilityLabel={`Use ${kind.label} icon`}
                        accessibilityHint="Changes only this tile's icon."
                        accessibilityState={{ selected }}
                        testID={`device-icon-option-${kind.key}`}
                        style={({ pressed }) => [
                          styles.iconPickerOption,
                          {
                            backgroundColor: selected
                              ? `${colors.primary}18`
                              : colors.background,
                            borderColor: selected
                              ? colors.primary
                              : colors.border,
                          },
                          selected && styles.iconPickerOptionSelected,
                          pressed && styles.pressed,
                        ]}
                      >
                        <MaterialCommunityIcons
                          name={kind.icon}
                          size={21}
                          color={
                            selected
                              ? colors.primary
                              : colors.mutedForeground
                          }
                        />
                      </Pressable>
                    );
                  })}
                </ScrollView>
                <Text style={[styles.deviceMeta, { color: colors.mutedForeground }]}>
                  This changes the icon on this tile only.
                </Text>
              </View>
              <View style={styles.wattageField}>
                <Text style={[styles.deviceName, { color: colors.foreground }]}>
                  Room
                </Text>
                <Pressable
                  onPress={() => {
                    if (settingsControl) {
                      setRoomPickerControlId((current) =>
                        current === settingsControl.id
                          ? null
                          : settingsControl.id,
                      );
                    }
                  }}
                  accessibilityRole="button"
                  accessibilityLabel={
                    settingsControl?.isUnused
                      ? 'Choose a room for this device'
                      : 'Move device to another room'
                  }
                  testID="move-control-to-room-button"
                  style={({ pressed }) => [
                    styles.settingsActionButton,
                    {
                      backgroundColor: colors.background,
                      borderColor: colors.border,
                    },
                    pressed && styles.pressed,
                  ]}
                >
                  <View style={{ flex: 1 }}>
                    <Text style={[styles.settingsActionText, { color: colors.foreground }]}>
                      {settingsControl?.isUnused
                        ? 'Assign to a room'
                        : 'Move to another room'}
                    </Text>
                    <Text style={[styles.deviceMeta, { color: colors.mutedForeground }]}>
                      {settingsControl?.isUnused
                        ? `Currently assigned to ${
                            data.rooms.find(
                              (room) => room.id === settingsControl?.roomId,
                            )?.name ?? 'a room'
                          }`
                        : data.rooms.find(
                            (room) => room.id === settingsControl?.roomId,
                          )?.name ?? ''}
                    </Text>
                  </View>
                  <MaterialCommunityIcons
                    name={
                      roomPickerControl?.id === settingsControl?.id
                        ? 'chevron-up'
                        : 'chevron-down'
                    }
                    size={20}
                    color={colors.mutedForeground}
                  />
                </Pressable>
                {roomPickerControl &&
                roomPickerControl.id === settingsControl?.id ? (
                  <View style={styles.roomPickerInline}>
                    {data.rooms.length > 0 ? (
                      <View style={styles.roomPickerOptions}>
                        {data.rooms.map((room) => {
                          const isCurrentRoom =
                            room.id === roomPickerControl?.roomId;
                          const isDisabled =
                            isCurrentRoom && !roomPickerControl?.isUnused;
                          return (
                            <Pressable
                              key={room.id}
                              onPress={() => assignControlToRoom(room.id)}
                              disabled={isDisabled}
                              accessibilityRole="button"
                              accessibilityLabel={`${room.name}${
                                isCurrentRoom
                                  ? roomPickerControl?.isUnused
                                    ? ', restore here'
                                    : ', current room'
                                  : ', move here'
                              }`}
                              accessibilityState={{ selected: isCurrentRoom }}
                              testID={`assign-control-room-${room.id}`}
                              style={({ pressed }) => [
                                styles.roomPickerOption,
                                {
                                  backgroundColor: colors.background,
                                  borderColor: isCurrentRoom
                                    ? colors.primary
                                    : colors.border,
                                  opacity: isDisabled ? 0.6 : 1,
                                },
                                pressed && styles.pressed,
                              ]}
                            >
                              <Text
                                numberOfLines={1}
                                style={[
                                  styles.deviceName,
                                  { color: colors.foreground, flex: 1 },
                                ]}
                              >
                                {room.name}
                              </Text>
                              <Text
                                style={[
                                  styles.deviceMeta,
                                  { color: colors.mutedForeground },
                                ]}
                              >
                                {isCurrentRoom
                                  ? roomPickerControl?.isUnused
                                    ? 'Restore here'
                                    : 'Current room'
                                  : 'Move here'}
                              </Text>
                            </Pressable>
                          );
                        })}
                      </View>
                    ) : (
                      <Text
                        style={[
                          styles.deviceMeta,
                          { color: colors.mutedForeground },
                        ]}
                      >
                        Create a room before assigning this device.
                      </Text>
                    )}
                    {!settingsControl?.isUnused && data.rooms.length < 2 ? (
                      <Text
                        style={[
                          styles.deviceMeta,
                          { color: colors.mutedForeground },
                        ]}
                      >
                        Add another room before moving this device.
                      </Text>
                    ) : null}
                  </View>
                ) : null}
              </View>
              {settingsControl?.controlMethod === 'tuya-sdk' ? (
                <View style={styles.wattageField}>
                  <Text style={[styles.deviceMeta, { color: colors.mutedForeground }]}>
                    Tuya device ID: {settingsControl.tuyaDeviceId ?? 'Not linked'}
                  </Text>
                  <Text style={[styles.deviceMeta, { color: colors.mutedForeground }]}>
                    Removing this tile will not remove the device from your Tuya
                    account.
                  </Text>
                </View>
              ) : (
              <View style={styles.wattageField}>
                <Text style={[styles.deviceName, { color: colors.foreground }]}>
                  ON Shortcut name
                </Text>
                <TextInput
                  value={onShortcutInput}
                  onChangeText={setOnShortcutInput}
                  maxLength={100}
                  returnKeyType="done"
                  onSubmitEditing={saveShortcutNames}
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
                  OFF Shortcut name
                </Text>
                <TextInput
                  value={offShortcutInput}
                  onChangeText={setOffShortcutInput}
                  maxLength={100}
                  returnKeyType="done"
                  onSubmitEditing={saveShortcutNames}
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
                  onPress={saveShortcutNames}
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
                    Save names
                  </Text>
                </Pressable>
                <Text style={[styles.deviceMeta, { color: colors.mutedForeground }]}>
                  Enter the exact names from the Shortcuts app. The tile runs ON first, then alternates using its last requested action.
                </Text>
              </View>
              )}
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
                  The active total uses reported ON state for Tuya devices and the
                  last requested ON state for Shortcut tiles.
                </Text>
                {wattageError && (
                  <Text style={[styles.deviceMeta, { color: colors.destructive }]}>
                    {wattageError}
                  </Text>
                )}
              </View>
              <Pressable
                onPress={toggleUnusedDevice}
                accessibilityRole="button"
                accessibilityLabel={
                  settingsControl?.isUnused
                    ? `Return ${settingsControl.name} to its room`
                    : `Hide ${settingsControl?.name ?? 'device'} as unused`
                }
                accessibilityHint={
                  settingsControl?.isUnused
                    ? 'This device tile will appear in its assigned room again.'
                    : 'This hides the tile from its room but keeps it in Unused devices.'
                }
                testID="toggle-unused-device-button"
                style={({ pressed }) => [
                  styles.settingsActionButton,
                  {
                    backgroundColor: colors.background,
                    borderColor: colors.primary,
                  },
                  pressed && styles.pressed,
                ]}
              >
                <MaterialCommunityIcons
                  name={settingsControl?.isUnused ? 'eye-outline' : 'eye-off-outline'}
                  size={19}
                  color={colors.primary}
                />
                <Text style={[styles.settingsActionText, { color: colors.primary }]}>
                  {settingsControl?.isUnused
                    ? 'Return to room'
                    : 'Hide as unused device'}
                </Text>
              </Pressable>
              <Pressable
                onPress={() => {
                  if (!settingsControl) return;
                  const control = settingsControl;
                  setSettingsControlId(null);
                  removeControl(control.id, control.name);
                }}
                accessibilityRole="button"
                accessibilityLabel={`Remove ${settingsControl?.name ?? 'device'} from this room`}
                accessibilityHint="This permanently removes the Home Control tile, but not the paired device."
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
                  Delete tile
                </Text>
              </Pressable>
              </ScrollView>
            </View>
          </KeyboardControllerAvoidingView>
        </View>
      </Modal>
      <TuyaPairingFlow
        visible={tuyaPairingVisible}
        roomName={activeRoom?.name ?? 'this room'}
        deviceName={
          controlName.trim() ||
          deviceKinds.find((kind) => kind.key === selectedKind)?.defaultName ||
          'Device'
        }
        onClose={() => setTuyaPairingVisible(false)}
        onPaired={addTuyaControl}
      />
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
  settingsSheet: { maxHeight: '92%', gap: 0 },
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
  settingsScroll: { flexShrink: 1 },
  settingsScrollContent: { gap: 14 },
  settingsSummary: {
    minHeight: 74,
    borderRadius: 16,
    paddingHorizontal: 14,
    paddingVertical: 12,
    flexDirection: 'row',
    alignItems: 'center',
    gap: 12,
  },
  iconPickerField: { gap: 8 },
  iconPickerHeader: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'space-between',
    gap: 12,
  },
  iconPickerResetButton: {
    minHeight: 30,
    justifyContent: 'center',
    paddingHorizontal: 6,
  },
  iconPickerResetText: { fontSize: 11, fontWeight: '700' },
  iconPickerOptions: { gap: 9, paddingVertical: 2, paddingHorizontal: 1 },
  iconPickerOption: {
    width: 42,
    height: 42,
    borderWidth: 1,
    borderRadius: 13,
    alignItems: 'center',
    justifyContent: 'center',
  },
  iconPickerOptionSelected: { borderWidth: 2 },
  disabledControl: { opacity: 0.45 },
  settingsActionButton: {
    minHeight: 52,
    borderWidth: 1,
    borderRadius: 14,
    paddingHorizontal: 13,
    paddingVertical: 8,
    flexDirection: 'row',
    alignItems: 'center',
    gap: 10,
  },
  settingsActionText: { fontSize: 12, fontWeight: '700' },
  roomPickerInline: { gap: 8, paddingTop: 4 },
  roomPickerOptions: { gap: 8, paddingBottom: 4 },
  roomPickerOption: {
    minHeight: 50,
    borderWidth: 1,
    borderRadius: 13,
    paddingHorizontal: 13,
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'space-between',
    gap: 10,
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
  pairTuyaButton: {
    minHeight: 46,
    borderWidth: 1,
    borderRadius: 14,
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'center',
    gap: 8,
  },
  pairTuyaButtonText: { fontSize: 13, fontWeight: '700' },
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
