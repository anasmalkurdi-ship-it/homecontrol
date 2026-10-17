import { MaterialCommunityIcons } from '@expo/vector-icons';
import { useCallback, useEffect, useRef, useState } from 'react';
import {
  ActivityIndicator,
  Keyboard,
  Modal,
  Platform,
  Pressable,
  ScrollView,
  StyleSheet,
  Text,
  TextInput,
  View,
} from 'react-native';
import { KeyboardAvoidingView } from 'react-native-keyboard-controller';
import { useSafeAreaInsets } from 'react-native-safe-area-context';
import { useColors } from '@/hooks/useColors';
import {
  TuyaSmartHome,
  type TuyaDeviceSnapshot,
  type TuyaHome,
} from '@/services/tuyaSmartHome';

type Props = {
  visible: boolean;
  roomName: string;
  deviceName: string;
  onClose: () => void;
  onPaired: (device: TuyaDeviceSnapshot, home: TuyaHome) => void;
};

type ModuleStatus = 'checking' | 'unavailable' | 'unconfigured' | 'ready';

export function TuyaPairingFlow({
  visible,
  roomName,
  deviceName,
  onClose,
  onPaired,
}: Props) {
  const colors = useColors();
  const insets = useSafeAreaInsets();
  const [moduleStatus, setModuleStatus] = useState<ModuleStatus>('checking');
  const [loggedIn, setLoggedIn] = useState(false);
  const [countryCode, setCountryCode] = useState('');
  const [email, setEmail] = useState('');
  const [accountPassword, setAccountPassword] = useState('');
  const [homes, setHomes] = useState<TuyaHome[]>([]);
  const [selectedHomeId, setSelectedHomeId] = useState<string | null>(null);
  const [homeName, setHomeName] = useState('Home Control');
  const [wifiMode, setWifiMode] = useState<'EZ' | 'AP'>('EZ');
  const [ssid, setSsid] = useState('');
  const [wifiPassword, setWifiPassword] = useState('');
  const [pairing, setPairing] = useState(false);
  const [busy, setBusy] = useState(false);
  const [pairingStatus, setPairingStatus] = useState('');
  const [error, setError] = useState<string | null>(null);
  const pairingSubscription = useRef<{ remove: () => void } | null>(null);
  const pairingRef = useRef(false);

  const selectedHome =
    homes.find((home) => home.homeId === selectedHomeId) ?? null;

  const loadHomes = useCallback(async () => {
    const nextHomes = await TuyaSmartHome.listHomes();
    setHomes(nextHomes);
    setSelectedHomeId((current) => {
      if (current && nextHomes.some((home) => home.homeId === current)) {
        return current;
      }
      return nextHomes[0]?.homeId ?? null;
    });
  }, []);

  useEffect(() => {
    if (!visible) return;
    let mounted = true;
    setError(null);
    setModuleStatus('checking');

    if (Platform.OS !== 'ios' || !TuyaSmartHome.isNativeAvailable()) {
      setModuleStatus('unavailable');
      return () => {
        mounted = false;
      };
    }

    void TuyaSmartHome.sdkStatus()
      .then(async (status) => {
        if (!mounted) return;
        if (!status.configured) {
          setModuleStatus('unconfigured');
          return;
        }
        setModuleStatus('ready');
        setLoggedIn(status.loggedIn);
        if (status.loggedIn) {
          try {
            await loadHomes();
          } catch (loadError) {
            if (mounted) {
              setError(
                loadError instanceof Error
                  ? loadError.message
                  : 'Could not load your Tuya homes.',
              );
            }
          }
        }
      })
      .catch((statusError: unknown) => {
        if (!mounted) return;
        setModuleStatus('unconfigured');
        setError(
          statusError instanceof Error
            ? statusError.message
            : 'Could not read the Tuya SDK status.',
        );
      });

    return () => {
      mounted = false;
      pairingSubscription.current?.remove();
      pairingSubscription.current = null;
      if (pairingRef.current) {
        pairingRef.current = false;
        void TuyaSmartHome.stopWifiPairing().catch(() => undefined);
      }
    };
  }, [loadHomes, visible]);

  const handleLogin = async () => {
    if (!countryCode.trim() || !email.trim() || !accountPassword) {
      setError('Enter the account country code, email, and password.');
      return;
    }
    setBusy(true);
    setError(null);
    try {
      await TuyaSmartHome.loginByEmail(
        countryCode.trim().replace(/^\+/, ''),
        email.trim(),
        accountPassword,
      );
      setAccountPassword('');
      setLoggedIn(true);
      await loadHomes();
    } catch (loginError) {
      setError(
        loginError instanceof Error
          ? loginError.message
          : 'Tuya sign-in failed.',
      );
    } finally {
      setBusy(false);
      Keyboard.dismiss();
    }
  };

  const handleCreateHome = async () => {
    const cleanName = homeName.trim();
    if (!cleanName) {
      setError('Enter a name for the Tuya home.');
      return;
    }
    setBusy(true);
    setError(null);
    try {
      const created = await TuyaSmartHome.createHome(cleanName);
      setHomes((current) => [...current, created]);
      setSelectedHomeId(created.homeId);
      Keyboard.dismiss();
    } catch (homeError) {
      setError(
        homeError instanceof Error
          ? homeError.message
          : 'Could not create the Tuya home.',
      );
    } finally {
      setBusy(false);
    }
  };

  const handleStartPairing = async () => {
    if (!selectedHome) {
      setError('Choose or create a Tuya home before pairing.');
      return;
    }
    if (!ssid.trim()) {
      setError('Enter the name of your 2.4 GHz Wi-Fi network.');
      return;
    }

    setError(null);
    setPairingStatus('Requesting a fresh Tuya pairing token…');
    setPairing(true);
    pairingRef.current = true;
    pairingSubscription.current?.remove();
    pairingSubscription.current = TuyaSmartHome.addListener(
      'onPairingEvent',
      (event) => {
        if (event.status === 'requesting-token') {
          setPairingStatus('Requesting a fresh Tuya pairing token…');
          return;
        }
        if (event.status === 'searching') {
          setPairingStatus(
            'Searching for the device. Keep it in pairing mode and the iPhone near it.',
          );
          return;
        }
        if (event.status === 'failed') {
          setPairing(false);
          pairingRef.current = false;
          setPairingStatus('');
          setError(event.message ?? 'Tuya could not pair this device.');
          pairingSubscription.current?.remove();
          pairingSubscription.current = null;
          return;
        }
        if (event.status === 'paired' && event.device) {
          setPairing(false);
          pairingRef.current = false;
          setPairingStatus('');
          pairingSubscription.current?.remove();
          pairingSubscription.current = null;
          onPaired(event.device, selectedHome);
        }
      },
    );

    try {
      await TuyaSmartHome.startWifiPairing(
        selectedHome.homeId,
        ssid.trim(),
        wifiPassword,
        wifiMode,
      );
      setWifiPassword('');
      Keyboard.dismiss();
    } catch (pairingError) {
      pairingSubscription.current?.remove();
      pairingSubscription.current = null;
      setPairing(false);
      pairingRef.current = false;
      setPairingStatus('');
      setError(
        pairingError instanceof Error
          ? pairingError.message
          : 'Could not start Tuya pairing.',
      );
    }
  };

  const close = () => {
    pairingSubscription.current?.remove();
    pairingSubscription.current = null;
    if (pairingRef.current) {
      pairingRef.current = false;
      void TuyaSmartHome.stopWifiPairing().catch(() => undefined);
    }
    setPairing(false);
    onClose();
  };

  const inputStyle = [
    styles.input,
    {
      backgroundColor: colors.background,
      borderColor: colors.border,
      color: colors.foreground,
    },
  ];

  return (
    <Modal
      visible={visible}
      transparent
      animationType="slide"
      onRequestClose={close}
    >
      <View style={styles.root}>
        <Pressable
          style={styles.scrim}
          onPress={close}
          accessibilityLabel="Close Tuya pairing"
        />
        <KeyboardAvoidingView
          behavior="padding"
          keyboardVerticalOffset={0}
          style={styles.keyboard}
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
            <View style={styles.header}>
              <View style={styles.headerText}>
                <Text style={[styles.title, { color: colors.foreground }]}>
                  Pair Tuya device
                </Text>
                <Text style={[styles.subtitle, { color: colors.mutedForeground }]}>
                  Add {deviceName || 'device'} to {roomName}.
                </Text>
              </View>
              <Pressable
                onPress={close}
                accessibilityRole="button"
                accessibilityLabel="Close pairing"
                style={styles.closeButton}
              >
                <MaterialCommunityIcons
                  name="close"
                  size={20}
                  color={colors.foreground}
                />
              </Pressable>
            </View>

            <ScrollView
              style={styles.scroll}
              contentContainerStyle={styles.content}
              keyboardShouldPersistTaps="handled"
              showsVerticalScrollIndicator={false}
            >
              {moduleStatus === 'checking' ? (
                <View style={styles.statusRow}>
                  <ActivityIndicator color={colors.primary} />
                  <Text style={[styles.body, { color: colors.mutedForeground }]}>
                    Checking the Tuya iOS SDK…
                  </Text>
                </View>
              ) : null}

              {moduleStatus === 'unavailable' ? (
                <InfoPanel
                  icon="apple"
                  title="A native iPhone build is required"
                  body="The Tuya SDK cannot run in the browser preview or Expo Go. Open this flow from a Home Control iOS development or published build."
                  color={colors}
                />
              ) : null}

              {moduleStatus === 'unconfigured' ? (
                <InfoPanel
                  icon="key-outline"
                  title="Tuya SDK keys are not in this iOS build"
                  body="The Tuya SmartLife SDK App Key and App Secret must be added as Replit Secrets and included when the iOS app is built. Tuya Cloud API credentials are different."
                  color={colors}
                />
              ) : null}

              {moduleStatus === 'ready' && !loggedIn ? (
                <View style={styles.section}>
                  <Text style={[styles.sectionTitle, { color: colors.foreground }]}>
                    Sign in to the same Smart Life account
                  </Text>
                  <Text style={[styles.body, { color: colors.mutedForeground }]}>
                    Use the account that already owns the devices in Smart Life.
                    Your password is sent to Tuya by its iOS SDK and is not saved
                    by Home Control.
                  </Text>
                  <TextInput
                    value={countryCode}
                    onChangeText={setCountryCode}
                    placeholder="Country calling code, e.g. 968"
                    placeholderTextColor={colors.mutedForeground}
                    keyboardType="phone-pad"
                    accessibilityLabel="Tuya account country code"
                    testID="tuya-country-code-input"
                    style={inputStyle}
                  />
                  <TextInput
                    value={email}
                    onChangeText={setEmail}
                    placeholder="Smart Life account email"
                    placeholderTextColor={colors.mutedForeground}
                    keyboardType="email-address"
                    autoCapitalize="none"
                    autoCorrect={false}
                    textContentType="emailAddress"
                    accessibilityLabel="Tuya account email"
                    testID="tuya-account-email-input"
                    style={inputStyle}
                  />
                  <TextInput
                    value={accountPassword}
                    onChangeText={setAccountPassword}
                    placeholder="Smart Life account password"
                    placeholderTextColor={colors.mutedForeground}
                    secureTextEntry
                    textContentType="password"
                    accessibilityLabel="Tuya account password"
                    testID="tuya-account-password-input"
                    style={inputStyle}
                  />
                  <PrimaryButton
                    title="Sign in to Tuya"
                    busy={busy}
                    onPress={handleLogin}
                    testID="tuya-login-button"
                    colors={colors}
                  />
                </View>
              ) : null}

              {moduleStatus === 'ready' && loggedIn ? (
                <>
                  <View style={styles.section}>
                    <Text style={[styles.sectionTitle, { color: colors.foreground }]}>
                      Tuya home
                    </Text>
                    {homes.length > 0 ? (
                      <View style={styles.homeList}>
                        {homes.map((home) => {
                          const selected = home.homeId === selectedHomeId;
                          return (
                            <Pressable
                              key={home.homeId}
                              onPress={() => setSelectedHomeId(home.homeId)}
                              accessibilityRole="radio"
                              accessibilityState={{ selected }}
                              testID={`tuya-home-${home.homeId}`}
                              style={[
                                styles.homeChoice,
                                {
                                  backgroundColor: selected
                                    ? colors.secondary
                                    : colors.background,
                                  borderColor: selected
                                    ? colors.primary
                                    : colors.border,
                                },
                              ]}
                            >
                              <MaterialCommunityIcons
                                name={selected ? 'radiobox-marked' : 'radiobox-blank'}
                                size={18}
                                color={selected ? colors.primary : colors.mutedForeground}
                              />
                              <Text
                                numberOfLines={1}
                                style={[styles.homeName, { color: colors.foreground }]}
                              >
                                {home.name || 'Tuya home'}
                              </Text>
                            </Pressable>
                          );
                        })}
                      </View>
                    ) : (
                      <>
                        <Text style={[styles.body, { color: colors.mutedForeground }]}>
                          No Tuya home exists on this account yet. Create one to pair
                          devices.
                        </Text>
                        <TextInput
                          value={homeName}
                          onChangeText={setHomeName}
                          placeholder="Tuya home name"
                          placeholderTextColor={colors.mutedForeground}
                          accessibilityLabel="New Tuya home name"
                          testID="tuya-home-name-input"
                          style={inputStyle}
                        />
                        <PrimaryButton
                          title="Create Tuya home"
                          busy={busy}
                          onPress={handleCreateHome}
                          testID="create-tuya-home-button"
                          colors={colors}
                        />
                      </>
                    )}
                  </View>

                  {selectedHome ? (
                    <View style={styles.section}>
                      <Text style={[styles.sectionTitle, { color: colors.foreground }]}>
                        Wi-Fi pairing
                      </Text>
                      <Text style={[styles.body, { color: colors.mutedForeground }]}>
                        Put the device into pairing mode first. Use a 2.4 GHz Wi-Fi
                        network; keep this password private.
                      </Text>
                      <View style={styles.modeRow}>
                        {(['EZ', 'AP'] as const).map((mode) => {
                          const selected = wifiMode === mode;
                          return (
                            <Pressable
                              key={mode}
                              onPress={() => setWifiMode(mode)}
                              accessibilityRole="radio"
                              accessibilityState={{ selected }}
                              testID={`tuya-mode-${mode.toLowerCase()}`}
                              style={[
                                styles.modeButton,
                                {
                                  backgroundColor: selected
                                    ? colors.primary
                                    : colors.background,
                                  borderColor: selected
                                    ? colors.primary
                                    : colors.border,
                                },
                              ]}
                            >
                              <Text
                                style={[
                                  styles.modeText,
                                  {
                                    color: selected
                                      ? colors.primaryForeground
                                      : colors.foreground,
                                  },
                                ]}
                              >
                                {mode === 'EZ' ? 'EZ mode' : 'AP fallback'}
                              </Text>
                            </Pressable>
                          );
                        })}
                      </View>
                      <TextInput
                        value={ssid}
                        onChangeText={setSsid}
                        placeholder="2.4 GHz Wi-Fi name"
                        placeholderTextColor={colors.mutedForeground}
                        autoCapitalize="none"
                        autoCorrect={false}
                        accessibilityLabel="Wi-Fi network name"
                        testID="tuya-wifi-ssid-input"
                        style={inputStyle}
                      />
                      <TextInput
                        value={wifiPassword}
                        onChangeText={setWifiPassword}
                        placeholder="Wi-Fi password"
                        placeholderTextColor={colors.mutedForeground}
                        secureTextEntry
                        autoCapitalize="none"
                        autoCorrect={false}
                        accessibilityLabel="Wi-Fi password"
                        testID="tuya-wifi-password-input"
                        style={inputStyle}
                      />
                      <Text style={[styles.note, { color: colors.mutedForeground }]}>
                        EZ is tried first. If it times out on newer iOS, switch the
                        light to AP pairing mode and try AP fallback.
                      </Text>
                      {pairing ? (
                        <View style={styles.statusRow}>
                          <ActivityIndicator color={colors.primary} />
                          <Text style={[styles.body, { color: colors.mutedForeground }]}>
                            {pairingStatus || 'Pairing device…'}
                          </Text>
                        </View>
                      ) : (
                        <PrimaryButton
                          title="Start pairing"
                          busy={busy}
                          onPress={handleStartPairing}
                          testID="start-tuya-pairing-button"
                          colors={colors}
                        />
                      )}
                    </View>
                  ) : null}
                </>
              ) : null}

              {error ? (
                <Text
                  accessibilityRole="alert"
                  style={[styles.error, { color: colors.destructive }]}
                >
                  {error}
                </Text>
              ) : null}
            </ScrollView>
          </View>
        </KeyboardAvoidingView>
      </View>
    </Modal>
  );
}

function InfoPanel({
  icon,
  title,
  body,
  color,
}: {
  icon: keyof typeof MaterialCommunityIcons.glyphMap;
  title: string;
  body: string;
  color: ReturnType<typeof useColors>;
}) {
  return (
    <View
      style={[
        styles.infoPanel,
        { backgroundColor: color.secondary, borderColor: color.border },
      ]}
    >
      <MaterialCommunityIcons name={icon} size={22} color={color.primary} />
      <View style={styles.infoCopy}>
        <Text style={[styles.sectionTitle, { color: color.foreground }]}>
          {title}
        </Text>
        <Text style={[styles.body, { color: color.mutedForeground }]}>{body}</Text>
      </View>
    </View>
  );
}

function PrimaryButton({
  title,
  busy,
  onPress,
  testID,
  colors,
}: {
  title: string;
  busy: boolean;
  onPress: () => void;
  testID: string;
  colors: ReturnType<typeof useColors>;
}) {
  return (
    <Pressable
      onPress={onPress}
      disabled={busy}
      accessibilityRole="button"
      testID={testID}
      style={({ pressed }) => [
        styles.primaryButton,
        { backgroundColor: colors.primary },
        (pressed || busy) && styles.pressed,
      ]}
    >
      {busy ? (
        <ActivityIndicator color={colors.primaryForeground} />
      ) : (
        <Text style={[styles.primaryButtonText, { color: colors.primaryForeground }]}>
          {title}
        </Text>
      )}
    </Pressable>
  );
}

const styles = StyleSheet.create({
  root: { flex: 1, justifyContent: 'flex-end' },
  scrim: {
    ...StyleSheet.absoluteFill,
    backgroundColor: 'rgba(11, 18, 14, 0.46)',
  },
  keyboard: { width: '100%' },
  sheet: {
    maxHeight: '92%',
    borderTopLeftRadius: 24,
    borderTopRightRadius: 24,
    borderWidth: 1,
    paddingHorizontal: 20,
    paddingTop: 20,
  },
  header: {
    flexDirection: 'row',
    alignItems: 'flex-start',
    justifyContent: 'space-between',
    gap: 12,
    marginBottom: 12,
  },
  headerText: { flex: 1, gap: 4 },
  title: { fontSize: 20, fontWeight: '700' },
  subtitle: { fontSize: 11, lineHeight: 16 },
  closeButton: { padding: 5 },
  scroll: { flexShrink: 1 },
  content: { gap: 18, paddingBottom: 12 },
  section: { gap: 10 },
  sectionTitle: { fontSize: 13, fontWeight: '700' },
  body: { fontSize: 11, lineHeight: 16 },
  note: { fontSize: 10, lineHeight: 15 },
  input: {
    height: 46,
    borderWidth: 1,
    borderRadius: 13,
    paddingHorizontal: 12,
    fontSize: 13,
  },
  primaryButton: {
    minHeight: 46,
    borderRadius: 14,
    alignItems: 'center',
    justifyContent: 'center',
    paddingHorizontal: 14,
  },
  primaryButtonText: { fontSize: 13, fontWeight: '700' },
  homeList: { gap: 7 },
  homeChoice: {
    minHeight: 42,
    borderWidth: 1,
    borderRadius: 12,
    paddingHorizontal: 11,
    flexDirection: 'row',
    alignItems: 'center',
    gap: 9,
  },
  homeName: { flex: 1, fontSize: 12, fontWeight: '600' },
  modeRow: { flexDirection: 'row', gap: 8 },
  modeButton: {
    flex: 1,
    minHeight: 40,
    borderWidth: 1,
    borderRadius: 12,
    alignItems: 'center',
    justifyContent: 'center',
    paddingHorizontal: 8,
  },
  modeText: { fontSize: 11, fontWeight: '700' },
  statusRow: { flexDirection: 'row', alignItems: 'center', gap: 9 },
  error: { fontSize: 11, lineHeight: 16 },
  infoPanel: {
    flexDirection: 'row',
    alignItems: 'flex-start',
    gap: 12,
    borderWidth: 1,
    borderRadius: 15,
    padding: 13,
  },
  infoCopy: { flex: 1, gap: 6 },
  pressed: { opacity: 0.78, transform: [{ scale: 0.99 }] },
});
