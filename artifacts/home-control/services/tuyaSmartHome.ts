import {
  requireOptionalNativeModule,
  type EventSubscription,
} from 'expo-modules-core';

export type TuyaHome = {
  homeId: string;
  name: string;
};

export type TuyaSchema = {
  dpId: string;
  code: string;
  name: string;
  mode: string;
};

export type TuyaDeviceSnapshot = {
  deviceId: string;
  name: string;
  productId: string;
  isOnline: boolean;
  dps: Record<string, unknown>;
  schema: TuyaSchema[];
};

export type TuyaAutomation = {
  sceneId: string;
  name: string;
  enabled: boolean;
};

export type TuyaPairingEvent = {
  status: 'requesting-token' | 'searching' | 'paired' | 'failed';
  message?: string;
  device?: TuyaDeviceSnapshot;
};

type TuyaNativeEvents = {
  onPairingEvent: (event: TuyaPairingEvent) => void;
  onDeviceUpdate: (device: TuyaDeviceSnapshot) => void;
};

type TuyaNativeModule = {
  addListener<K extends keyof TuyaNativeEvents>(
    eventName: K,
    listener: TuyaNativeEvents[K],
  ): EventSubscription;
  sdkStatus(): Promise<{
    nativeAvailable: boolean;
    configured: boolean;
    loggedIn: boolean;
  }>;
  isLoggedIn(): Promise<boolean>;
  sendEmailCode(email: string, countryCode: string): Promise<void>;
  registerByEmail(
    countryCode: string,
    email: string,
    password: string,
    code: string,
  ): Promise<void>;
  loginByEmail(
    countryCode: string,
    email: string,
    password: string,
  ): Promise<void>;
  listHomes(): Promise<TuyaHome[]>;
  createHome(name: string): Promise<TuyaHome>;
  startWifiPairing(
    homeId: string,
    ssid: string,
    password: string,
    mode: 'EZ' | 'AP',
  ): Promise<{ started: boolean }>;
  stopWifiPairing(): Promise<void>;
  observeDevice(deviceId: string, homeId: string): Promise<TuyaDeviceSnapshot>;
  publishDps(
    deviceId: string,
    homeId: string,
    dps: Record<string, boolean | number | string>,
  ): Promise<void>;
  listAutomations(homeId: string): Promise<TuyaAutomation[]>;
  createSwitchAutomation(
    homeId: string,
    name: string,
    triggerDeviceId: string,
    triggerDpId: string,
    targetDeviceId: string,
    targetDpId: string,
  ): Promise<TuyaAutomation>;
};

const nativeModule =
  requireOptionalNativeModule<TuyaNativeModule>('TuyaSmartHome');
const eventEmitter = nativeModule;

function requireNative(): TuyaNativeModule {
  if (!nativeModule) {
    throw new Error(
      'Tuya direct pairing is available only in the Home Control iOS development or production build, not in Expo Go or web preview.',
    );
  }
  return nativeModule;
}

export const TuyaSmartHome = {
  isNativeAvailable: () => nativeModule !== null,
  sdkStatus: () => requireNative().sdkStatus(),
  isLoggedIn: () => requireNative().isLoggedIn(),
  sendEmailCode: (email: string, countryCode: string) =>
    requireNative().sendEmailCode(email, countryCode),
  registerByEmail: (
    countryCode: string,
    email: string,
    password: string,
    code: string,
  ) => requireNative().registerByEmail(countryCode, email, password, code),
  loginByEmail: (countryCode: string, email: string, password: string) =>
    requireNative().loginByEmail(countryCode, email, password),
  listHomes: () => requireNative().listHomes(),
  createHome: (name: string) => requireNative().createHome(name),
  startWifiPairing: (
    homeId: string,
    ssid: string,
    password: string,
    mode: 'EZ' | 'AP',
  ) => requireNative().startWifiPairing(homeId, ssid, password, mode),
  stopWifiPairing: () => requireNative().stopWifiPairing(),
  observeDevice: (deviceId: string, homeId: string) =>
    requireNative().observeDevice(deviceId, homeId),
  publishDps: (
    deviceId: string,
    homeId: string,
    dps: Record<string, boolean | number | string>,
  ) => requireNative().publishDps(deviceId, homeId, dps),
  listAutomations: (homeId: string) =>
    requireNative().listAutomations(homeId),
  createSwitchAutomation: (
    homeId: string,
    name: string,
    triggerDeviceId: string,
    triggerDpId: string,
    targetDeviceId: string,
    targetDpId: string,
  ) =>
    requireNative().createSwitchAutomation(
      homeId,
      name,
      triggerDeviceId,
      triggerDpId,
      targetDeviceId,
      targetDpId,
    ),
  addListener: <K extends keyof TuyaNativeEvents>(
    eventName: K,
    listener: TuyaNativeEvents[K],
  ): EventSubscription | null =>
    eventEmitter?.addListener(eventName, listener as never) ?? null,
};
