import ExpoModulesCore
import ThingSmartActivatorKit
import ThingSmartHomeKit
import ThingSmartSceneCoreKit

public final class TuyaSmartHomeModule: Module {
  private var sdkConfigured = false
  private var observedDevices: [String: ThingSmartDevice] = [:]
  private var loadedHomes: [String: ThingSmartHome] = [:]
  private var pendingHomeLoads: [String: [(ThingSmartHome?, Error?) -> Void]] = [:]
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

    AsyncFunction("observeDevice") {
      (deviceId: String, homeId: String, promise: Promise) in
      guard self.ensureConfigured(promise) else { return }
      self.withLoadedHome(homeId: homeId) { home, error in
        guard home != nil else {
          promise.reject(
            "E_TUYA_HOME",
            error?.localizedDescription ?? "Tuya could not load this home's device list."
          )
          return
        }
        guard let device = self.device(for: deviceId) else {
          promise.reject(
            "E_TUYA_DEVICE",
            "Tuya could not find this device in the selected home. Check that it is still paired to this Tuya account."
          )
          return
        }

        device.delegate = self.delegateProxy
        self.observedDevices[deviceId] = device
        promise.resolve(self.devicePayload(device.deviceModel))
      }
    }

    AsyncFunction("publishDps") {
      (deviceId: String, homeId: String, dps: [String: Any], promise: Promise) in
      guard self.ensureConfigured(promise) else { return }
      self.withLoadedHome(homeId: homeId) { home, error in
        guard home != nil else {
          promise.reject(
            "E_TUYA_HOME",
            error?.localizedDescription ?? "Tuya could not load this home's device list."
          )
          return
        }
        guard let device = self.device(for: deviceId) else {
          promise.reject(
            "E_TUYA_DEVICE",
            "Tuya could not find this device in the selected home. Check that it is still paired to this Tuya account."
          )
          return
        }

        device.publishDps(dps, success: {
          promise.resolve(nil)
        }, failure: { error in
          promise.reject("E_TUYA_CONTROL", error?.localizedDescription ?? "The command could not be sent.")
        })
      }
    }

    AsyncFunction("listAutomations") { (homeId: String, promise: Promise) in
      guard self.ensureConfigured(promise) else { return }
      guard ThingSmartUser.sharedInstance().isLogin else {
        promise.reject("E_TUYA_AUTH", "Sign in to your Tuya account first.")
        return
      }
      guard let numericHomeId = Int64(homeId) else {
        promise.reject("E_TUYA_HOME", "The selected Tuya home ID is invalid.")
        return
      }
      guard let manager = ThingSmartSceneManager.sharedInstance() else {
        promise.reject("E_TUYA_SCENE", "Tuya's automation service is unavailable.")
        return
      }

      self.withLoadedHome(homeId: homeId) { home, error in
        guard home != nil else {
          promise.reject(
            "E_TUYA_HOME",
            error?.localizedDescription ?? "Tuya could not load this home's device list."
          )
          return
        }

        manager.getSceneList(withHomeId: numericHomeId) { scenes in
          let automations = (scenes ?? []).compactMap { scene -> [String: Any]? in
            let conditions =
              (scene.conditions as? [ThingSmartSceneConditionModel]) ?? []
            guard !conditions.isEmpty,
                  let sceneId = scene.sceneId,
                  !sceneId.isEmpty
            else {
              return nil
            }

            return [
              "sceneId": sceneId,
              "name": scene.name ?? "Automation",
              "enabled": scene.enabled,
            ]
          }
          promise.resolve(automations)
        } failure: { error in
          promise.reject(
            "E_TUYA_SCENE",
            error?.localizedDescription ?? "Unable to load Tuya automations."
          )
        }
      }
    }

    AsyncFunction("createSwitchAutomation") {
      (
        homeId: String,
        name: String,
        triggerDeviceId: String,
        triggerDpId: String,
        targetDeviceId: String,
        targetDpId: String,
        promise: Promise
      ) in
      guard self.ensureConfigured(promise) else { return }
      guard ThingSmartUser.sharedInstance().isLogin else {
        promise.reject("E_TUYA_AUTH", "Sign in to your Tuya account first.")
        return
      }
      guard let numericHomeId = Int64(homeId) else {
        promise.reject("E_TUYA_HOME", "The selected Tuya home ID is invalid.")
        return
      }
      guard !name.trimmingCharacters(in: .whitespacesAndNewlines).isEmpty,
            !triggerDpId.isEmpty,
            !targetDpId.isEmpty
      else {
        promise.reject("E_TUYA_SCENE", "Choose both switches before saving.")
        return
      }
      guard triggerDeviceId != targetDeviceId else {
        promise.reject(
          "E_TUYA_SCENE",
          "Tuya does not allow the same device to be both the trigger and the action."
        )
        return
      }

      self.withLoadedHome(homeId: homeId) { home, error in
        guard home != nil else {
          promise.reject(
            "E_TUYA_HOME",
            error?.localizedDescription ?? "Tuya could not load this home's device list."
          )
          return
        }
        guard let triggerDevice = self.device(for: triggerDeviceId),
              let targetDevice = self.device(for: targetDeviceId),
              let triggerModel = triggerDevice.deviceModel,
              let targetModel = targetDevice.deviceModel
        else {
          promise.reject(
            "E_TUYA_DEVICE",
            "Tuya could not load one of the selected switches."
          )
          return
        }
        guard let manager = ThingSmartSceneManager.sharedInstance() else {
          promise.reject("E_TUYA_SCENE", "Tuya's automation service is unavailable.")
          return
        }

        manager.getCondicationDeviceDPList(withDevId: triggerDeviceId) { dpModels in
          let triggerDp = (dpModels ?? []).first {
            String($0.dpId) == triggerDpId || $0.entitySubId == triggerDpId
          }
          guard let triggerDp else {
            promise.reject(
              "E_TUYA_SCENE",
              "Tuya does not expose the selected switch as an automation trigger."
            )
            return
          }

          let expression = ThingSmartSceneConditionExprBuilder.createBoolExpr(
            withType: triggerDp.entitySubId ?? triggerDpId,
            isTrue: true,
            exprType: .device
          )
          let conditionResult = ThingSmartSceneConditionFactory.createDeviceCondition(
            withDevice: triggerModel,
            dpModel: triggerDp,
            exprModel: expression
          )
          guard let condition = conditionResult as? ThingSmartSceneConditionModel else {
            promise.reject(
              "E_TUYA_SCENE",
              "Tuya could not build a condition for the selected switch."
            )
            return
          }

          let action = ThingSmartSceneActionModel()
          action.actionExecutor = "dpIssue"
          action.entityId = targetDeviceId
          action.entityName = targetModel.name ?? "Switch"
          action.executorProperty = [targetDpId: true]

          manager.getSmartSceneBackgroundCover(withsuccess: { covers in
            guard let background = (covers as? [String])?.first,
                  !background.isEmpty
            else {
              promise.reject(
                "E_TUYA_SCENE",
                "Tuya did not return a scene background image."
              )
              return
            }

            ThingSmartScene.addNewScene(
              withName: name,
              homeId: numericHomeId,
              background: background,
              showFirstPage: false,
              conditionList: [condition],
              actionList: [action],
              matchType: ThingSmartConditionMatchAll,
              success: { scene in
                guard let sceneId = scene.sceneId, !sceneId.isEmpty else {
                  promise.reject(
                    "E_TUYA_SCENE",
                    "Tuya created the automation but did not return its ID."
                  )
                  return
                }
                promise.resolve([
                  "sceneId": sceneId,
                  "name": scene.name ?? name,
                  "enabled": true,
                ])
              },
              failure: { error in
                promise.reject(
                  "E_TUYA_SCENE",
                  error?.localizedDescription ?? "Unable to create the Tuya automation."
                )
              }
            )
          }, failure: { error in
            promise.reject(
              "E_TUYA_SCENE",
              error?.localizedDescription ?? "Unable to load Tuya scene backgrounds."
            )
          })
        } failure: { error in
          promise.reject(
            "E_TUYA_SCENE",
            error?.localizedDescription ?? "Unable to load trigger options from Tuya."
          )
        }
      }
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

  private func withLoadedHome(
    homeId: String,
    completion: @escaping (ThingSmartHome?, Error?) -> Void
  ) {
    guard let numericHomeId = Int64(homeId) else {
      completion(
        nil,
        NSError(
          domain: "TuyaSmartHome",
          code: 1,
          userInfo: [NSLocalizedDescriptionKey: "The saved Tuya home link is invalid."]
        )
      )
      return
    }

    if let home = loadedHomes[homeId] {
      completion(home, nil)
      return
    }

    if pendingHomeLoads[homeId] != nil {
      pendingHomeLoads[homeId, default: []].append(completion)
      return
    }

    guard let home = ThingSmartHome(homeId: numericHomeId) else {
      completion(
        nil,
        NSError(
          domain: "TuyaSmartHome",
          code: 2,
          userInfo: [NSLocalizedDescriptionKey: "Tuya could not open the saved home."]
        )
      )
      return
    }

    pendingHomeLoads[homeId] = [completion]
    home.getDataWithSuccess({ [weak self] _ in
      guard let self else { return }
      self.loadedHomes[homeId] = home
      self.finishHomeLoad(homeId: homeId, home: home, error: nil)
    }, failure: { [weak self] error in
      guard let self else { return }
      let loadError = error ?? NSError(
        domain: "TuyaSmartHome",
        code: 3,
        userInfo: [NSLocalizedDescriptionKey: "Tuya could not refresh this home's device list."]
      )
      self.finishHomeLoad(homeId: homeId, home: nil, error: loadError)
    })
  }

  private func finishHomeLoad(
    homeId: String,
    home: ThingSmartHome?,
    error: Error?
  ) {
    let completions = pendingHomeLoads.removeValue(forKey: homeId) ?? []
    completions.forEach { $0(home, error) }
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
