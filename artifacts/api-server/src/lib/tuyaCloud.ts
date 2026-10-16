import { createHash, createHmac, randomUUID } from "node:crypto";
import {
  GetTuyaDevicesResponse,
  GetTuyaDeviceControlsResponse,
} from "@workspace/api-zod";

const REGION_ENDPOINTS: Record<string, string> = {
  cn: "https://openapi.tuyacn.com",
  us: "https://openapi.tuyaus.com",
  "us-east": "https://openapi-ueaz.tuyaus.com",
  eu: "https://openapi.tuyaeu.com",
  "eu-west": "https://openapi-weaz.tuyaeu.com",
  in: "https://openapi.tuyain.com",
  sg: "https://openapi-sg.iotbing.com",
};

type TuyaConfig = {
  accessId: string;
  accessSecret: string;
  uid: string;
  endpoint: string;
};

type TuyaEnvelope<T> = {
  success: boolean;
  code?: string | number;
  msg?: string;
  result: T;
};

type TuyaToken = {
  access_token: string;
  expire_time: number;
};

type TuyaRawDevice = {
  id: string;
  name?: string;
  category?: string;
  online?: boolean;
  status?: Array<{ code: string; value: unknown }>;
};

type TuyaRawFunction = {
  code: string;
  name?: string;
  type?: string;
  values?: string;
};

type TuyaCommand = {
  code: string;
  value: unknown;
};

export class TuyaCloudError extends Error {
  constructor(
    message: string,
    readonly code: string,
    readonly status = 502,
  ) {
    super(message);
    this.name = "TuyaCloudError";
  }
}

let cachedToken: { key: string; token: string; expiresAt: number } | null = null;
let tokenRequest: Promise<string> | null = null;

function getConfig(): TuyaConfig {
  const accessId = process.env.TUYA_ACCESS_ID?.trim();
  const accessSecret = process.env.TUYA_ACCESS_SECRET?.trim();
  const uid = process.env.TUYA_UID?.trim();
  const region = process.env.TUYA_REGION?.trim().toLowerCase();
  const endpoint = region ? REGION_ENDPOINTS[region] : undefined;

  if (!accessId || !accessSecret || !uid || !endpoint) {
    throw new TuyaCloudError(
      "Tuya Cloud configuration is incomplete.",
      "TUYA_CONFIGURATION_MISSING",
      503,
    );
  }

  return { accessId, accessSecret, uid, endpoint };
}

function signRequest(
  config: TuyaConfig,
  method: string,
  pathAndQuery: string,
  body: string,
  token = "",
) {
  const timestamp = Date.now().toString();
  const nonce = randomUUID().replaceAll("-", "");
  const contentHash = createHash("sha256").update(body).digest("hex");
  const stringToSign = `${method}\n${contentHash}\n\n${pathAndQuery}`;
  const sign = createHmac("sha256", config.accessSecret)
    .update(`${config.accessId}${token}${timestamp}${nonce}${stringToSign}`)
    .digest("hex")
    .toUpperCase();

  return {
    client_id: config.accessId,
    sign,
    sign_method: "HMAC-SHA256",
    t: timestamp,
    nonce,
    ...(token ? { access_token: token } : {}),
  };
}

async function requestTuya<T>(
  config: TuyaConfig,
  method: "GET" | "POST",
  pathAndQuery: string,
  body?: unknown,
  token = "",
): Promise<T> {
  const bodyText = body === undefined ? "" : JSON.stringify(body);
  const headers = signRequest(config, method, pathAndQuery, bodyText, token);

  let response: Response;
  try {
    response = await fetch(`${config.endpoint}${pathAndQuery}`, {
      method,
      headers: {
        ...headers,
        ...(bodyText ? { "content-type": "application/json" } : {}),
      },
      ...(bodyText ? { body: bodyText } : {}),
      signal: AbortSignal.timeout(15_000),
    });
  } catch {
    throw new TuyaCloudError(
      "Could not reach Tuya Cloud. Check the project region and network.",
      "TUYA_NETWORK_ERROR",
      502,
    );
  }

  let payload: TuyaEnvelope<T>;
  try {
    payload = (await response.json()) as TuyaEnvelope<T>;
  } catch {
    throw new TuyaCloudError(
      "Tuya Cloud returned an unreadable response.",
      "TUYA_INVALID_RESPONSE",
      502,
    );
  }

  if (!response.ok || payload.success !== true) {
    const code =
      payload.code === undefined ? "TUYA_REQUEST_FAILED" : String(payload.code);
    throw new TuyaCloudError(
      "Tuya Cloud rejected the request. Check the project permissions, account link, and region.",
      code,
      response.status >= 400 && response.status < 600 ? response.status : 502,
    );
  }

  return payload.result;
}

async function getAccessToken(config: TuyaConfig): Promise<string> {
  const cacheKey = `${config.endpoint}:${config.accessId}`;
  if (
    cachedToken?.key === cacheKey &&
    cachedToken.expiresAt > Date.now() + 30_000
  ) {
    return cachedToken.token;
  }
  if (tokenRequest) return tokenRequest;

  tokenRequest = (async () => {
    const result = await requestTuya<TuyaToken>(
      config,
      "GET",
      "/v1.0/token?grant_type=1",
    );
    if (!result.access_token || !Number.isFinite(result.expire_time)) {
      throw new TuyaCloudError(
        "Tuya Cloud did not return a valid access token.",
        "TUYA_TOKEN_INVALID",
        502,
      );
    }
    cachedToken = {
      key: cacheKey,
      token: result.access_token,
      expiresAt: Date.now() + result.expire_time * 1_000,
    };
    return result.access_token;
  })();

  try {
    return await tokenRequest;
  } finally {
    tokenRequest = null;
  }
}

async function requestWithToken<T>(
  config: TuyaConfig,
  method: "GET" | "POST",
  pathAndQuery: string,
  body?: unknown,
): Promise<T> {
  const token = await getAccessToken(config);
  try {
    return await requestTuya<T>(config, method, pathAndQuery, body, token);
  } catch (error) {
    if (error instanceof TuyaCloudError && error.code === "1010") {
      cachedToken = null;
      const freshToken = await getAccessToken(config);
      return requestTuya<T>(config, method, pathAndQuery, body, freshToken);
    }
    throw error;
  }
}

function normalizeDevice(device: TuyaRawDevice) {
  return {
    id: device.id,
    name: device.name?.trim() || "Tuya device",
    category: device.category || "unknown",
    online: device.online === true,
    status: Array.isArray(device.status)
      ? device.status.filter(
          (point): point is { code: string; value: unknown } =>
            !!point &&
            typeof point.code === "string" &&
            "value" in point,
        )
      : [],
  };
}

export async function listTuyaDevices() {
  const config = getConfig();
  const raw = await requestWithToken<TuyaRawDevice[]>(
    config,
    "GET",
    `/v1.0/users/${encodeURIComponent(config.uid)}/devices`,
  );
  if (!Array.isArray(raw)) {
    throw new TuyaCloudError(
      "Tuya Cloud returned an invalid device list.",
      "TUYA_DEVICE_LIST_INVALID",
    );
  }
  return GetTuyaDevicesResponse.parse({
    devices: raw.filter((device) => typeof device?.id === "string").map(normalizeDevice),
  });
}

async function getOwnedDevice(config: TuyaConfig, deviceId: string) {
  if (!deviceId.trim() || deviceId.length > 180) {
    throw new TuyaCloudError("Invalid Tuya device ID.", "INVALID_DEVICE_ID", 400);
  }
  const devices = await requestWithToken<TuyaRawDevice[]>(
    config,
    "GET",
    `/v1.0/users/${encodeURIComponent(config.uid)}/devices`,
  );
  const linkedDevice = Array.isArray(devices)
    ? devices.find((device) => device.id === deviceId)
    : undefined;
  if (!linkedDevice) {
    throw new TuyaCloudError(
      "This device is not linked to the authorized Tuya account.",
      "DEVICE_NOT_LINKED",
      404,
    );
  }
  return linkedDevice;
}

async function getRawDeviceControls(config: TuyaConfig, deviceId: string) {
  const linkedDevice = await getOwnedDevice(config, deviceId);
  const encodedId = encodeURIComponent(deviceId);
  const [functionsResult, statusResult] = await Promise.all([
    requestWithToken<{ functions?: TuyaRawFunction[] }>(
      config,
      "GET",
      `/v1.0/iot-03/devices/${encodedId}/functions`,
    ),
    requestWithToken<Array<{ code: string; value: unknown }>>(
      config,
      "GET",
      `/v1.0/iot-03/devices/${encodedId}/status`,
    ),
  ]);

  const functions = Array.isArray(functionsResult)
    ? functionsResult
    : functionsResult.functions;
  if (!Array.isArray(functions) || !Array.isArray(statusResult)) {
    throw new TuyaCloudError(
      "Tuya Cloud returned incomplete device controls.",
      "TUYA_DEVICE_CONTROLS_INVALID",
    );
  }
  return {
    deviceId,
    online: linkedDevice.online === true,
    functions: functions
      .filter((item) => typeof item?.code === "string")
      .map((item) => ({
        code: item.code,
        name: item.name || item.code,
        type: item.type || "unknown",
        values: typeof item.values === "string" ? item.values : "{}",
      })),
    status: statusResult.filter(
      (point): point is { code: string; value: unknown } =>
        !!point && typeof point.code === "string" && "value" in point,
    ),
  };
}

export async function getTuyaDeviceControls(deviceId: string) {
  const result = await getRawDeviceControls(getConfig(), deviceId);
  return GetTuyaDeviceControlsResponse.parse(result);
}

export async function sendTuyaCommands(
  deviceId: string,
  commands: TuyaCommand[],
) {
  const config = getConfig();
  const controls = await getRawDeviceControls(config, deviceId);
  if (!controls.online) {
    throw new TuyaCloudError(
      "This Tuya device is offline.",
      "DEVICE_OFFLINE",
      409,
    );
  }
  for (const command of commands) {
    const fn = controls.functions.find((item) => item.code === command.code);
    const isPowerCommand =
      fn?.type?.toLowerCase() === "boolean" &&
      /(^|_)(switch|power|relay|on_off)(_|$)/i.test(command.code);
    if (!isPowerCommand || typeof command.value !== "boolean") {
      throw new TuyaCloudError(
        "Only supported on/off controls can be changed from this app.",
        "UNSUPPORTED_COMMAND",
        400,
      );
    }
  }

  const result = await requestWithToken<boolean>(
    config,
    "POST",
    `/v1.0/iot-03/devices/${encodeURIComponent(deviceId)}/commands`,
    { commands },
  );
  if (result !== true) {
    throw new TuyaCloudError(
      "Tuya Cloud did not confirm the device command.",
      "TUYA_COMMAND_NOT_CONFIRMED",
      502,
    );
  }
  return { success: true };
}

export async function checkTuyaConnection() {
  try {
    const result = await listTuyaDevices();
    return {
      configured: true,
      connected: true,
      deviceCount: result.devices.length,
      message: "Tuya Cloud is connected.",
    };
  } catch (error) {
    if (error instanceof TuyaCloudError) {
      return {
        configured: error.code !== "TUYA_CONFIGURATION_MISSING",
        connected: false,
        deviceCount: null,
        message:
          error.code === "TUYA_CONFIGURATION_MISSING"
            ? "Tuya setup is incomplete."
            : error.message,
      };
    }
    return {
      configured: true,
      connected: false,
      deviceCount: null,
      message: "Could not check the Tuya Cloud connection.",
    };
  }
}
