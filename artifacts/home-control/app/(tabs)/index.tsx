import AsyncStorage from '@react-native-async-storage/async-storage';
import { MaterialCommunityIcons } from '@expo/vector-icons';
import { useClerk } from '@clerk/expo';
import {
  getGetTuyaConnectionQueryKey,
  getGetTuyaDeviceControlsQueryKey,
  getGetTuyaDevicesQueryKey,
  useGetTuyaConnection,
  useGetTuyaDevices,
  useGetTuyaDeviceControls,
  useSendTuyaDeviceCommands,
} from '@workspace/api-client-react';
import type { TuyaDevice } from '@workspace/api-client-react';
import { useQueryClient } from '@tanstack/react-query';
import * as Haptics from 'expo-haptics';
import { useEffect, useMemo, useState } from 'react';
import {
  ActivityIndicator,
  Alert,
  KeyboardAvoidingView,
  Modal,
  Platform,
  Pressable,
  ScrollView,
  StyleSheet,
  Text,
  TextInput,
  View,
} from 'react-native';
import { useSafeAreaInsets } from 'react-native-safe-area-context';
import { useColors } from '@/hooks/useColors';

type DeviceKind = 'chandelier' | 'sideLight' | 'heater' | 'airConditioner';

type Room = {
  id: string;
  name: string;
};

type HomeControl = {
  id: string;
  roomId: string;
  name: string;
  kind: DeviceKind;
  previewOn: boolean;
  tuyaDeviceId?: string;
  switchCode?: string;
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
    icon: 'floor-lamp',
  },
  {
    key: 'heater',
    label: 'Heater',
    defaultName: 'Heater',
    icon: 'radiator',
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
    value === 'airConditioner'
  );
}

function findPowerFunction(
  functions: Array<{ code: string; type: string }>,
) {
  return functions.find(
    (item) =>
      item.type.toLowerCase() === 'boolean' &&
      /(^|_)(switch|power|relay|on_off)(_|$)/i.test(item.code),
  );
}

function parseBooleanState(value: unknown): boolean | null {
  if (typeof value === 'boolean') return value;
  if (typeof value === 'string') {
    if (value.toLowerCase() === 'true') return true;
    if (value.toLowerCase() === 'false') return false;
  }
  return null;
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
          typeof control.previewOn === 'boolean' &&
          (control.tuyaDeviceId === undefined ||
            typeof control.tuyaDeviceId === 'string') &&
          (control.switchCode === undefined ||
            typeof control.switchCode === 'string'),
      )
    : [];

  const activeRoomId =
    typeof value.activeRoomId === 'string' && roomIds.has(value.activeRoomId)
      ? value.activeRoomId
      : (rooms[0]?.id ?? null);

  return { rooms, controls, activeRoomId };
}

function LiveTuyaControlCard({
  control,
  onRemove,
}: {
  control: HomeControl;
  onRemove: () => void;
}) {
  const colors = useColors();
  const queryClient = useQueryClient();
  const definition = deviceKinds.find((kind) => kind.key === control.kind);
  const deviceId = control.tuyaDeviceId ?? '';
  const controlsQuery = useGetTuyaDeviceControls(deviceId, {
    query: {
      queryKey: getGetTuyaDeviceControlsQueryKey(deviceId),
      enabled: !!control.tuyaDeviceId,
      retry: false,
      refetchInterval: 20_000,
    },
  });
  const mutation = useSendTuyaDeviceCommands({
    mutation: {
      onSuccess: async (_result, variables) => {
        const queryKey = getGetTuyaDeviceControlsQueryKey(variables.deviceId);
        await queryClient.invalidateQueries({ queryKey });
      },
    },
  });

  const switchFunction =
    controlsQuery.data?.functions.find(
      (item) => item.code === control.switchCode,
    ) ?? findPowerFunction(controlsQuery.data?.functions ?? []);
  const switchCode = control.switchCode ?? switchFunction?.code;
  const switchState =
    switchCode === undefined
      ? null
      : parseBooleanState(
          controlsQuery.data?.status.find((item) => item.code === switchCode)
            ?.value,
        );
  const isOffline = controlsQuery.data?.online === false;
  const toggle = () => {
    if (
      !switchCode ||
      switchState === null ||
      isOffline ||
      !control.tuyaDeviceId
    ) {
      return;
    }
    mutation.mutate({
      deviceId: control.tuyaDeviceId,
      data: { commands: [{ code: switchCode, value: !switchState }] },
    });
    void Haptics.selectionAsync();
  };

  return (
    <View
      style={[
        styles.controlCard,
        { backgroundColor: colors.card, borderColor: colors.border },
      ]}
    >
      <View
        style={[
          styles.deviceIconWrap,
          {
            backgroundColor:
              switchState === true ? colors.accent + '55' : colors.secondary,
          },
        ]}
      >
        <MaterialCommunityIcons
          name={definition?.icon ?? 'lightbulb-outline'}
          size={24}
          color={switchState === true ? colors.accentForeground : colors.primary}
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
                backgroundColor:
                  switchState === true
                    ? colors.accent
                    : switchState === false
                      ? colors.mutedForeground
                      : colors.destructive,
              },
            ]}
          />
          <Text style={[styles.deviceMeta, { color: colors.mutedForeground }]}>
            {controlsQuery.isLoading
              ? 'Reading Tuya status…'
              : controlsQuery.isError
                ? 'Could not load device'
                : isOffline
                  ? 'Offline · Tuya'
                : switchState === null
                  ? 'No supported on/off status'
                  : switchState
                    ? 'On · Tuya'
                    : 'Off · Tuya'}
          </Text>
        </View>
        {mutation.isError && (
          <Text style={{ color: colors.destructive, fontSize: 9, marginTop: 3 }}>
            Command failed. Try again.
          </Text>
        )}
      </View>
      <Pressable
        onPress={onRemove}
        accessibilityLabel={`Remove ${control.name} from this room`}
        hitSlop={8}
        style={({ pressed }) => [
          styles.removeButton,
          pressed && styles.pressed,
        ]}
      >
        <MaterialCommunityIcons
          name="close"
          size={17}
          color={colors.mutedForeground}
        />
      </Pressable>
      <Pressable
        onPress={toggle}
        accessibilityRole="switch"
        accessibilityState={{
          checked: switchState === true,
          disabled:
            switchState === null ||
            isOffline ||
            controlsQuery.isLoading ||
            mutation.isPending,
        }}
        accessibilityLabel={`${control.name} Tuya switch`}
        disabled={
          switchState === null ||
          isOffline ||
          controlsQuery.isLoading ||
          mutation.isPending
        }
        style={[
          styles.toggleTrack,
          {
            backgroundColor:
              switchState === true ? colors.primary : colors.secondary,
            opacity: switchState === null || mutation.isPending ? 0.55 : 1,
          },
        ]}
      >
        {mutation.isPending ? (
          <ActivityIndicator
            size="small"
            color={switchState === true ? colors.primaryForeground : colors.primary}
          />
        ) : (
          <View
            style={[
              styles.toggleThumb,
              {
                backgroundColor:
                  switchState === true
                    ? colors.primaryForeground
                    : colors.card,
                transform: [
                  { translateX: switchState === true ? 20 : 2 },
                ],
              },
            ]}
          />
        )}
      </Pressable>
    </View>
  );
}

export default function HomeScreen() {
  const colors = useColors();
  const queryClient = useQueryClient();
  const { signOut } = useClerk();
  const insets = useSafeAreaInsets();
  const [data, setData] = useState<HomeData>(EMPTY_DATA);
  const [ready, setReady] = useState(false);
  const [storageError, setStorageError] = useState(false);
  const [dialog, setDialog] = useState<DialogState>(null);
  const [roomName, setRoomName] = useState('');
  const [controlName, setControlName] = useState('');
  const [selectedKind, setSelectedKind] = useState<DeviceKind>('chandelier');
  const [selectedTuyaDeviceId, setSelectedTuyaDeviceId] = useState<string | null>(
    null,
  );
  const [linkMessage, setLinkMessage] = useState<string | null>(null);

  const connectionQuery = useGetTuyaConnection({
    query: {
      queryKey: getGetTuyaConnectionQueryKey(),
      retry: false,
      staleTime: 45_000,
      refetchInterval: 60_000,
    },
  });
  const devicesQuery = useGetTuyaDevices({
    query: {
      queryKey: getGetTuyaDevicesQueryKey(),
      enabled: dialog === 'control',
      retry: false,
      staleTime: 30_000,
    },
  });
  const selectedDeviceControlsQuery = useGetTuyaDeviceControls(
    selectedTuyaDeviceId ?? '',
    {
      query: {
        queryKey: getGetTuyaDeviceControlsQueryKey(
          selectedTuyaDeviceId ?? '',
        ),
        enabled: dialog === 'control' && !!selectedTuyaDeviceId,
        retry: false,
      },
    },
  );

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
  const roomControls = useMemo(
    () =>
      data.controls.filter((control) => control.roomId === activeRoom?.id),
    [activeRoom?.id, data.controls],
  );
  const assignedDeviceIds = useMemo(
    () =>
      new Set(
        data.controls
          .map((control) => control.tuyaDeviceId)
          .filter((id): id is string => !!id),
      ),
    [data.controls],
  );
  const availableDevices = useMemo(
    () =>
      (devicesQuery.data?.devices ?? []).filter(
        (device) => !assignedDeviceIds.has(device.id),
      ),
    [assignedDeviceIds, devicesQuery.data?.devices],
  );
  const selectedTuyaDevice = useMemo(
    () =>
      availableDevices.find((device) => device.id === selectedTuyaDeviceId) ??
      null,
    [availableDevices, selectedTuyaDeviceId],
  );
  const selectedSwitchFunction = useMemo(
    () =>
      selectedDeviceControlsQuery.data?.functions.find(
        (item) =>
          item.type.toLowerCase() === 'boolean' &&
          /(switch|power|relay|on_off)/i.test(item.code),
      ) ?? null,
    [selectedDeviceControlsQuery.data?.functions],
  );

  const openRoomDialog = () => {
    setRoomName('');
    setDialog('room');
  };

  const openControlDialog = () => {
    setSelectedKind('chandelier');
    setControlName('Chandelier');
    setSelectedTuyaDeviceId(null);
    setLinkMessage(null);
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
    if (!selectedTuyaDevice || !selectedSwitchFunction) {
      setLinkMessage(
        'Choose a linked device with an available on/off control.',
      );
      return;
    }
    const control = {
      id: createId(),
      roomId: activeRoom.id,
      name: controlName.trim() || selectedTuyaDevice.name,
      kind: selectedKind,
      previewOn: false,
      tuyaDeviceId: selectedTuyaDevice.id,
      switchCode: selectedSwitchFunction.code,
    };
    setData((current) => ({
      ...current,
      controls: [...current.controls, control],
    }));
    setDialog(null);
    setSelectedTuyaDeviceId(null);
    void Haptics.notificationAsync(Haptics.NotificationFeedbackType.Success);
  };

  const toggleControl = (controlId: string) => {
    setData((current) => ({
      ...current,
      controls: current.controls.map((control) =>
        control.id === controlId
          ? { ...control, previewOn: !control.previewOn }
          : control,
      ),
    }));
    void Haptics.selectionAsync();
  };

  const removeControl = (controlId: string, name: string) => {
    Alert.alert(
      'Remove from room?',
      `Remove “${name}” from this room? It will remain linked in Tuya.`,
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
    queryClient.clear();
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
          <View
            style={[
              styles.previewBadge,
              {
                backgroundColor: connectionQuery.data?.connected
                  ? colors.accent + '42'
                  : colors.secondary,
              },
            ]}
          >
            <MaterialCommunityIcons
              name={
                connectionQuery.data?.connected
                  ? 'cloud-check-outline'
                  : 'cloud-alert-outline'
              }
              size={15}
              color={
                connectionQuery.data?.connected
                  ? colors.accentForeground
                  : colors.mutedForeground
              }
            />
            <Text
              style={[
                styles.previewBadgeText,
                {
                  color: connectionQuery.data?.connected
                    ? colors.accentForeground
                    : colors.mutedForeground,
                },
              ]}
            >
              {connectionQuery.data?.connected
                ? `Tuya · ${connectionQuery.data.deviceCount ?? 0}`
                : connectionQuery.isLoading
                  ? 'Connecting'
                  : 'Tuya offline'}
            </Text>
          </View>
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
        style={[
          styles.notice,
          { backgroundColor: colors.secondary, borderColor: colors.border },
        ]}
      >
        <MaterialCommunityIcons
          name="information-outline"
          size={18}
          color={colors.primary}
        />
        <Text style={[styles.noticeText, { color: colors.secondaryForeground }]}>
          {connectionQuery.data?.connected
            ? 'Pair devices in Smart Life first. Then add them to a room here to control them through Tuya Cloud.'
            : connectionQuery.data?.message ??
              'Tuya is not connected yet. Check the project setup and region.'}
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
                  <Text
                    numberOfLines={2}
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
                  accessibilityLabel="Add control"
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
                  roomControls.map((control) => {
                    if (control.tuyaDeviceId) {
                      return (
                        <LiveTuyaControlCard
                          key={control.id}
                          control={control}
                          onRemove={() =>
                            removeControl(control.id, control.name)
                          }
                        />
                      );
                    }
                    const definition = deviceKinds.find(
                      (kind) => kind.key === control.kind,
                    );
                    const isOn = control.previewOn;
                    return (
                      <View
                        key={control.id}
                        style={[
                          styles.controlCard,
                          {
                            backgroundColor: colors.card,
                            borderColor: colors.border,
                          },
                        ]}
                      >
                        <View
                          style={[
                            styles.deviceIconWrap,
                            {
                              backgroundColor: isOn
                                ? colors.accent + '55'
                                : colors.secondary,
                            },
                          ]}
                        >
                          <MaterialCommunityIcons
                            name={definition?.icon ?? 'lightbulb-outline'}
                            size={24}
                            color={isOn ? colors.accentForeground : colors.primary}
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
                                  backgroundColor: isOn
                                    ? colors.accent
                                    : colors.mutedForeground,
                                },
                              ]}
                            />
                            <Text
                              style={[
                                styles.deviceMeta,
                                { color: colors.mutedForeground },
                              ]}
                            >
                              Preview {isOn ? 'on' : 'off'}
                            </Text>
                          </View>
                        </View>
                        <Pressable
                          onPress={() => removeControl(control.id, control.name)}
                          accessibilityLabel={`Remove ${control.name}`}
                          testID={`remove-control-${control.id}`}
                          hitSlop={8}
                          style={({ pressed }) => [
                            styles.removeButton,
                            pressed && styles.pressed,
                          ]}
                        >
                          <MaterialCommunityIcons
                            name="close"
                            size={17}
                            color={colors.mutedForeground}
                          />
                        </Pressable>
                        <Pressable
                          onPress={() => toggleControl(control.id)}
                          accessibilityRole="switch"
                          accessibilityState={{ checked: isOn }}
                          accessibilityLabel={`${control.name} preview switch`}
                          testID={`toggle-control-${control.id}`}
                          style={[
                            styles.toggleTrack,
                            {
                              backgroundColor: isOn
                                ? colors.primary
                                : colors.secondary,
                            },
                          ]}
                        >
                          <View
                            style={[
                              styles.toggleThumb,
                              {
                                backgroundColor: isOn
                                  ? colors.primaryForeground
                                  : colors.card,
                                transform: [{ translateX: isOn ? 20 : 2 }],
                              },
                            ]}
                          />
                        </Pressable>
                      </View>
                    );
                  })
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
                      Add a light, heater, or air conditioner tile to arrange your controls.
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
                        Add a control
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
                  {dialog === 'room' ? 'Add a room' : 'Add a control'}
                </Text>
                <Text style={[styles.sheetSubtitle, { color: colors.mutedForeground }]}>
                  {dialog === 'room'
                    ? 'Give this part of your home a name.'
                    : 'Pair devices in Smart Life first, then refresh this list.'}
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
                    Linked Tuya devices
                  </Text>
                  {devicesQuery.isLoading ? (
                    <View style={styles.devicePickerMessage}>
                      <ActivityIndicator color={colors.primary} />
                      <Text
                        style={[
                          styles.devicePickerMessageText,
                          { color: colors.mutedForeground },
                        ]}
                      >
                        Loading your devices…
                      </Text>
                    </View>
                  ) : devicesQuery.isError ? (
                    <View style={styles.devicePickerMessage}>
                      <Text
                        style={[
                          styles.devicePickerMessageText,
                          { color: colors.mutedForeground },
                        ]}
                      >
                        Could not load devices. Check the Tuya connection and try again.
                      </Text>
                      <Pressable
                        onPress={() => void devicesQuery.refetch()}
                        style={{ paddingVertical: 8 }}
                      >
                        <Text
                          style={[
                            styles.devicePickerMessageText,
                            { color: colors.primary, fontWeight: '700' },
                          ]}
                        >
                          Try again
                        </Text>
                      </Pressable>
                    </View>
                  ) : availableDevices.length === 0 ? (
                    <View style={styles.devicePickerMessage}>
                      <Text
                        style={[
                          styles.devicePickerMessageText,
                          { color: colors.mutedForeground },
                        ]}
                      >
                        {(devicesQuery.data?.devices.length ?? 0) > 0
                          ? 'All linked Tuya devices are already assigned to rooms.'
                          : 'No devices found. Pair one in Smart Life, then refresh this list.'}
                      </Text>
                      {(devicesQuery.data?.devices.length ?? 0) === 0 && (
                        <Pressable
                          onPress={() => void devicesQuery.refetch()}
                          testID="refresh-tuya-devices-button"
                          style={{ paddingVertical: 8 }}
                        >
                          <Text
                            style={[
                              styles.devicePickerMessageText,
                              { color: colors.primary, fontWeight: '700' },
                            ]}
                          >
                            Refresh devices
                          </Text>
                        </Pressable>
                      )}
                    </View>
                  ) : (
                    <ScrollView
                      style={styles.devicePickerList}
                      contentContainerStyle={{ gap: 7 }}
                      nestedScrollEnabled
                      showsVerticalScrollIndicator
                    >
                      {availableDevices.map((device: TuyaDevice) => {
                        const selected = device.id === selectedTuyaDeviceId;
                        return (
                          <Pressable
                            key={device.id}
                            onPress={() => {
                              setSelectedTuyaDeviceId(device.id);
                              setControlName(device.name);
                              setLinkMessage(null);
                            }}
                            accessibilityRole="radio"
                            accessibilityState={{ selected }}
                            style={({ pressed }) => [
                              styles.devicePickerItem,
                              {
                                backgroundColor: selected
                                  ? colors.primary + '16'
                                  : colors.background,
                                borderColor: selected
                                  ? colors.primary
                                  : colors.border,
                              },
                              pressed && styles.pressed,
                            ]}
                          >
                            <MaterialCommunityIcons
                              name={selected ? 'radiobox-marked' : 'radiobox-blank'}
                              size={18}
                              color={selected ? colors.primary : colors.mutedForeground}
                            />
                            <View style={styles.devicePickerItemInfo}>
                              <Text
                                numberOfLines={1}
                                style={[
                                  styles.devicePickerItemName,
                                  { color: colors.foreground },
                                ]}
                              >
                                {device.name}
                              </Text>
                              <Text
                                style={[
                                  styles.devicePickerItemMeta,
                                  { color: device.online ? colors.accentForeground : colors.mutedForeground },
                                ]}
                              >
                                {device.online ? 'Online' : 'Offline'}
                              </Text>
                            </View>
                          </Pressable>
                        );
                      })}
                    </ScrollView>
                  )}
                  {selectedTuyaDevice && selectedDeviceControlsQuery.isLoading && (
                    <View style={styles.devicePickerMessage}>
                      <ActivityIndicator color={colors.primary} />
                      <Text
                        style={[
                          styles.devicePickerMessageText,
                          { color: colors.mutedForeground },
                        ]}
                      >
                        Checking available controls…
                      </Text>
                    </View>
                  )}
                  {selectedTuyaDevice &&
                    selectedDeviceControlsQuery.isSuccess &&
                    !selectedSwitchFunction && (
                      <Text
                        style={[
                          styles.devicePickerMessageText,
                          { color: colors.destructive },
                        ]}
                      >
                        This device does not report a supported on/off control.
                      </Text>
                    )}
                  {linkMessage && (
                    <Text
                      style={[
                        styles.devicePickerMessageText,
                        { color: colors.destructive },
                      ]}
                    >
                      {linkMessage}
                    </Text>
                  )}
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
                  disabled={
                    !selectedTuyaDevice ||
                    !selectedSwitchFunction ||
                    selectedDeviceControlsQuery.isLoading
                  }
                  testID="save-control-button"
                  style={({ pressed }) => [
                    styles.submitButton,
                    {
                      backgroundColor:
                        selectedTuyaDevice && selectedSwitchFunction
                          ? colors.primary
                          : colors.secondary,
                    },
                    pressed && styles.pressed,
                  ]}
                >
                  <Text
                    style={[
                      styles.submitText,
                      {
                        color:
                          selectedTuyaDevice && selectedSwitchFunction
                            ? colors.primaryForeground
                            : colors.mutedForeground,
                      },
                    ]}
                  >
                    Link device to room
                  </Text>
                </Pressable>
              </>
            )}
          </View>
        </KeyboardAvoidingView>
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
  notice: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 9,
    borderWidth: 1,
    borderRadius: 13,
    paddingHorizontal: 11,
    paddingVertical: 9,
  },
  noticeText: { flex: 1, fontSize: 11, lineHeight: 16 },
  storageWarning: { borderRadius: 10, paddingHorizontal: 12, paddingVertical: 8 },
  workspace: { flex: 1, minHeight: 0, flexDirection: 'row' },
  roomRail: {
    width: 105,
    borderRightWidth: 1,
    paddingRight: 11,
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
  roomListContent: { gap: 7, paddingBottom: 10 },
  roomItem: {
    minHeight: 74,
    borderWidth: 1,
    borderRadius: 15,
    paddingHorizontal: 8,
    paddingVertical: 9,
    alignItems: 'flex-start',
    justifyContent: 'center',
    gap: 5,
  },
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
  controlsList: { gap: 9, paddingBottom: 16 },
  controlCard: {
    minHeight: 75,
    borderRadius: 17,
    borderWidth: 1,
    paddingHorizontal: 10,
    paddingVertical: 11,
    flexDirection: 'row',
    alignItems: 'center',
    gap: 9,
  },
  deviceIconWrap: {
    width: 42,
    height: 42,
    borderRadius: 14,
    alignItems: 'center',
    justifyContent: 'center',
  },
  deviceInfo: { flex: 1, minWidth: 0, gap: 5 },
  deviceName: { fontSize: 12, fontWeight: '700' },
  deviceMetaRow: { flexDirection: 'row', alignItems: 'center', gap: 5 },
  previewDot: { width: 6, height: 6, borderRadius: 3 },
  deviceMeta: { fontSize: 9, fontWeight: '500' },
  removeButton: {
    width: 24,
    height: 28,
    alignItems: 'center',
    justifyContent: 'center',
  },
  toggleTrack: {
    width: 46,
    height: 26,
    borderRadius: 20,
    justifyContent: 'center',
  },
  toggleThumb: {
    width: 22,
    height: 22,
    borderRadius: 11,
  },
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
