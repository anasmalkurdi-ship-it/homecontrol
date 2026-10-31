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
  deleteAutomation(homeId: string, sceneId: string): Promise<void>;
  createSwitchAutomation(
    homeId: string,
    name: string,
    triggerDeviceId: string,
    triggerDpId: string,
    triggerIsOn: boolean,
    targetDeviceId: string,
    targetDpId: string,
    targetIsOn: boolean,
  ): Promise<TuyaAutomation>;
  createDeviceSchedule(
    homeId: string,
    name: string,
    deviceId: string,
    dpId: string,
    time: string,
    loops: string,
    turnOn: boolean,
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

function automationBuildError(): Error {
  return new Error(
    'This installed iOS app does not include Tuya automation support yet. The iOS app must be rebuilt with the current Tuya module.',
  );
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
  listAutomations: (homeId: string) => {
    const native = requireNative();
    if (typeof native.listAutomations !== 'function') {
      return Promise.reject(automationBuildError());
    }
    return native.listAutomations(homeId);
  },
  deleteAutomation: (homeId: string, sceneId: string) => {
    const native = requireNative();
    if (typeof native.deleteAutomation !== 'function') {
      return Promise.reject(automationBuildError());
    }
    return native.deleteAutomation(homeId, sceneId);
  },
  createSwitchAutomation: (
    homeId: string,
    name: string,
    triggerDeviceId: string,
    triggerDpId: string,
    triggerIsOn: boolean,
    targetDeviceId: string,
    targetDpId: string,
    targetIsOn: boolean,
  ) =>
    (() => {
      const native = requireNative();
      if (typeof native.createSwitchAutomation !== 'function') {
        return Promise.reject(automationBuildError());
      }
      return native.createSwitchAutomation(
        homeId,
        name,
        triggerDeviceId,
        triggerDpId,
        triggerIsOn,
        targetDeviceId,
        targetDpId,
        targetIsOn,
      );
    })(),
  createDeviceSchedule: (
    homeId: string,
    name: string,
    deviceId: string,
    dpId: string,
    time: string,
    loops: string,
    turnOn: boolean,
  ) => {
    const native = requireNative();
    if (typeof native.createDeviceSchedule !== 'function') {
      return Promise.reject(
        new Error(
          'This installed iOS app does not include repeated timers yet. Rebuild the Home Control iOS app with the current Tuya module.',
        ),
      );
    }
    return native.createDeviceSchedule(
      homeId,
      name,
      deviceId,
      dpId,
      time,
      loops,
      turnOn,
    );
  },
  addListener: <K extends keyof TuyaNativeEvents>(
    eventName: K,
    listener: TuyaNativeEvents[K],
  ): EventSubscription | null =>
    eventEmitter?.addListener(eventName, listener as never) ?? null,
};
