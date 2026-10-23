import ExpoModulesCore
import ThingSmartActivatorKit
import ThingSmartHomeKit

public final class TuyaSmartHomeModule: Module {
  private var sdkConfigured = false
  private var observedDevices: [String: ThingSmartDevice] = [:]
  private lazy var delegateProxy = TuyaSmartHomeDelegateProxy(module: self)

  public func definition() -> ModuleDefinition {
    Name("TuyaSmartHome")
    Events("onPairingEvent", "onDeviceUpdate")

    OnCreate {
      self.configureSDK()
    }

    AsyncFunction("sdkStatus") { () -> [String: Any] in
      [
        "nativeAvailable": true,
        "configured": self.sdkConfigured,
        "loggedIn": self.sdkConfigured && ThingSmartUser.sharedInstance().isLogin,
      ]
    }

    AsyncFunction("isLoggedIn") { () -> Bool in
      self.sdkConfigured && ThingSmartUser.sharedInstance().isLogin
    }

    AsyncFunction("sendEmailCode") {
      (email: String, countryCode: String, promise: Promise) in
      guard self.ensureConfigured(promise) else { return }

      ThingSmartUser.sharedInstance().sendVerifyCode(
        withUserName: email,
        countryCode: countryCode,
        type: 1,
        success: {
          promise.resolve(nil)
        },
        failure: { error in
          promise.reject("E_TUYA_SDK", error?.localizedDescription ?? "Unable to send the verification code.")
        }
      )
    }

    AsyncFunction("registerByEmail") {
      (countryCode: String, email: String, password: String, code: String, promise: Promise) in
      guard self.ensureConfigured(promise) else { return }

      ThingSmartUser.sharedInstance().register(
        byEmail: countryCode,
        email: email,
        password: password,
        code: code,
        success: {
          promise.resolve(nil)
        },
        failure: { error in
          promise.reject("E_TUYA_SDK", error?.localizedDescription ?? "Unable to create the Tuya account.")
        }
      )
    }

    AsyncFunction("loginByEmail") {
      (countryCode: String, email: String, password: String, promise: Promise) in
      guard self.ensureConfigured(promise) else { return }

      ThingSmartUser.sharedInstance().login(
        byEmail: countryCode,
        email: email,
        password: password,
        success: {
          promise.resolve(nil)
        },
        failure: { error in
          promise.reject("E_TUYA_SDK", error?.localizedDescription ?? "Unable to sign in to Tuya.")
        }
      )
    }

    AsyncFunction("listHomes") { (promise: Promise) in
      guard self.ensureConfigured(promise) else { return }
      guard ThingSmartUser.sharedInstance().isLogin else {
        promise.reject("E_TUYA_AUTH", "Sign in to your Tuya account first.")
        return
      }

      ThingSmartHomeManager().getHomeList { homes in
        let result = (homes ?? []).map { home in
          [
            "homeId": String(home.homeId),
            "name": home.name ?? "",
          ]
        }
        promise.resolve(result)
      } failure: { error in
        promise.reject("E_TUYA_SDK", error?.localizedDescription ?? "Unable to load Tuya homes.")
      }
    }

    AsyncFunction("createHome") { (name: String, promise: Promise) in
      guard self.ensureConfigured(promise) else { return }
      guard ThingSmartUser.sharedInstance().isLogin else {
        promise.reject("E_TUYA_AUTH", "Sign in to your Tuya account first.")
        return
      }

      ThingSmartHomeManager().addHome(
        withName: name,
        geoName: "",
        rooms: [""],
        latitude: 0,
        longitude: 0
      ) { homeId in
        promise.resolve(["homeId": String(homeId), "name": name])
      } failure: { error in
        promise.reject("E_TUYA_SDK", error?.localizedDescription ?? "Unable to create the Tuya home.")
      }
    }

    AsyncFunction("startWifiPairing") {
      (homeId: String, ssid: String, password: String, mode: String, promise: Promise) in
      guard self.ensureConfigured(promise) else { return }
      guard ThingSmartUser.sharedInstance().isLogin else {
        promise.reject("E_TUYA_AUTH", "Sign in to your Tuya account first.")
        return
      }
      guard let numericHomeId = Int64(homeId) else {
        promise.reject("E_TUYA_HOME", "The selected Tuya home ID is invalid.")
        return
      }
      guard !ssid.trimmingCharacters(in: .whitespacesAndNewlines).isEmpty else {
        promise.reject("E_TUYA_WIFI", "Enter the 2.4 GHz Wi-Fi network name.")
        return
      }

      guard let activator = ThingSmartActivator.sharedInstance() else {
        promise.reject("E_TUYA_SDK", "Tuya's device pairing service is unavailable.")
        return
      }

      activator.delegate = delegateProxy
      self.sendEvent("onPairingEvent", ["status": "requesting-token"])
      activator.getTokenWithHomeId(
        numericHomeId,
        success: { [weak self] token in
          guard let self, let token, !token.isEmpty else {
            promise.reject("E_TUYA_TOKEN", "Tuya returned an empty pairing token.")
            return
          }

          let pairingMode: ThingActivatorMode = mode.uppercased() == "AP" ? .AP : .EZ
          activator.startConfigWiFi(
            pairingMode,
            ssid: ssid,
            password: password,
            token: token,
            timeout: 100
          )
          self.sendEvent("onPairingEvent", ["status": "searching"])
          promise.resolve(["started": true])
        },
        failure: { error in
          activator.delegate = nil
          promise.reject("E_TUYA_TOKEN", error?.localizedDescription ?? "Unable to get a pairing token.")
        }
      )
    }

    AsyncFunction("stopWifiPairing") {
      self.stopPairing()
    }

    AsyncFunction("observeDevice") { (deviceId: String, promise: Promise) in
      guard self.ensureConfigured(promise) else { return }
      guard let device = ThingSmartDevice(deviceId: deviceId) else {
        promise.reject("E_TUYA_DEVICE", "Tuya could not load that device.")
        return
      }

      device.delegate = delegateProxy
      self.observedDevices[deviceId] = device
      promise.resolve(self.devicePayload(device.deviceModel))
    }

    AsyncFunction("publishDps") {
      (deviceId: String, dps: [String: Any], promise: Promise) in
      guard self.ensureConfigured(promise) else { return }
      guard let device = self.device(for: deviceId) else {
        promise.reject("E_TUYA_DEVICE", "Tuya could not load that device.")
        return
      }

      device.publishDps(dps, success: {
        promise.resolve(nil)
      }, failure: { error in
        promise.reject("E_TUYA_CONTROL", error?.localizedDescription ?? "The command could not be sent.")
      })
    }
  }

  private func configureSDK() {
    guard
      let appKey = Bundle.main.object(forInfoDictionaryKey: "TuyaAppKey") as? String,
      let appSecret = Bundle.main.object(forInfoDictionaryKey: "TuyaAppSecret") as? String,
      !appKey.isEmpty,
      !appSecret.isEmpty
    else {
      sdkConfigured = false
      return
    }

    ThingSmartSDK.sharedInstance().start(withAppKey: appKey, secretKey: appSecret)
    sdkConfigured = true
  }

  private func ensureConfigured(_ promise: Promise) -> Bool {
    guard sdkConfigured else {
      promise.reject("E_TUYA_CONFIG", "Tuya SmartLife SDK App Key and App Secret are not configured in this iOS build.")
      return false
    }
    return true
  }

  private func device(for deviceId: String) -> ThingSmartDevice? {
    if let device = observedDevices[deviceId] {
      return device
    }
    guard let device = ThingSmartDevice(deviceId: deviceId) else {
      return nil
    }
    device.delegate = delegateProxy
    observedDevices[deviceId] = device
    return device
  }

  private func devicePayload(_ model: ThingSmartDeviceModel) -> [String: Any] {
    let schemas = (model.schemaArray ?? []).compactMap { schema -> [String: Any]? in
      guard let dpId = schema.dpId, !dpId.isEmpty else { return nil }
      return [
        "dpId": dpId,
        "code": schema.code ?? "",
        "name": schema.name ?? "",
        "mode": schema.mode ?? "",
      ]
    }

    return [
      "deviceId": model.devId ?? "",
      "name": model.name ?? "",
      "productId": model.productId ?? "",
      "isOnline": model.isOnline,
      "dps": stringKeyedDps(model.dps),
      "schema": schemas,
    ]
  }

  private func stringKeyedDps(_ values: [AnyHashable: Any]?) -> [String: Any] {
    guard let values else { return [:] }
    var result: [String: Any] = [:]
    for (key, value) in values {
      if let key = key as? String {
        result[key] = value
      }
    }
    return result
  }

  private func stopPairing() {
    ThingSmartActivator.sharedInstance()?.delegate = nil
    ThingSmartActivator.sharedInstance()?.stopConfigWiFi()
  }

  private func emitDeviceUpdate(_ device: ThingSmartDevice) {
    let payload = devicePayload(device.deviceModel)
    DispatchQueue.main.async {
      self.sendEvent("onDeviceUpdate", payload)
    }
  }

  fileprivate func handleActivator(
    _ activator: ThingSmartActivator!,
    didReceiveDevice deviceModel: ThingSmartDeviceModel!,
    error: Error!
  ) {
    if let error {
      stopPairing()
      sendEvent("onPairingEvent", [
        "status": "failed",
        "message": error.localizedDescription,
      ])
      return
    }

    guard let deviceModel, let deviceId = deviceModel.devId, !deviceId.isEmpty else {
      stopPairing()
      sendEvent("onPairingEvent", [
        "status": "failed",
        "message": "Pairing ended without returning a device.",
      ])
      return
    }

    stopPairing()
    if let device = ThingSmartDevice(deviceId: deviceId) {
      device.delegate = delegateProxy
      observedDevices[deviceId] = device
    }
    sendEvent("onPairingEvent", [
      "status": "paired",
      "device": devicePayload(deviceModel),
    ])
  }

  fileprivate func handleDeviceInfoUpdate(_ device: ThingSmartDevice) {
    emitDeviceUpdate(device)
  }

  fileprivate func handleDeviceOnlineUpdate(_ device: ThingSmartDevice) {
    emitDeviceUpdate(device)
  }

  fileprivate func handleDeviceRemoved(_ device: ThingSmartDevice) {
    emitDeviceUpdate(device)
  }

  fileprivate func handleDevice(_ device: ThingSmartDevice, dpsUpdate dps: [AnyHashable: Any]) {
    emitDeviceUpdate(device)
  }
}

private final class TuyaSmartHomeDelegateProxy: NSObject, ThingSmartActivatorDelegate, ThingSmartDeviceDelegate {
  weak var module: TuyaSmartHomeModule?

  init(module: TuyaSmartHomeModule) {
    self.module = module
    super.init()
  }

  func activator(
    _ activator: ThingSmartActivator!,
    didReceiveDevice deviceModel: ThingSmartDeviceModel!,
    error: Error!
  ) {
    module?.handleActivator(activator, didReceiveDevice: deviceModel, error: error)
  }

  func deviceInfoUpdate(_ device: ThingSmartDevice) {
    module?.handleDeviceInfoUpdate(device)
  }

  func deviceOnlineUpdate(_ device: ThingSmartDevice) {
    module?.handleDeviceOnlineUpdate(device)
  }

  func deviceRemoved(_ device: ThingSmartDevice) {
    module?.handleDeviceRemoved(device)
  }

  func device(_ device: ThingSmartDevice, dpsUpdate dps: [AnyHashable: Any]) {
    module?.handleDevice(device, dpsUpdate: dps)
  }
}
