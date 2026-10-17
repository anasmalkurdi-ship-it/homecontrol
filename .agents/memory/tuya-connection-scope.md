---
name: Tuya connection scope
description: The user's current direct-pairing requirement and native-build constraint for Home Control.
---

The user wants to migrate the existing Home Control app from Shortcut-based control to Tuya's native SmartLife iOS SDK, keeping the current UI, rooms, and local data. Preserve Shortcut control during a gradual per-device migration (`shortcut` to `tuya-sdk`); do not disable working shortcuts before replacement. Start with one factory-reset Wi-Fi light in “Anas office,” then migrate roughly 100 devices. Do not use Tuya Cloud as a fallback. For Shortcut devices, show last-requested ON in orange; for Tuya SDK devices, show actual reported state.

The first test device is the user's CB01-SBL chandelier; the user approved Tuya-assisted first-time activation.

The generated Tuya iOS package targets SmartLife SDK 7.8 and includes the project-specific `ThingSmartCryption` CocoaPod. A local Expo Swift module can bridge pairing and direct device control, but it must be built and tested as a custom iOS app; Replit's Linux environment cannot run Xcode or validate a real-device pairing session. Tuya SmartLife App SDK AppKey/AppSecret are separate from Tuya Cloud API credentials.

Tuya's public Swift sample is useful for current API examples, but intentionally omits the app-specific `ios_core_sdk` package. Public samples and integration docs may show different SDK versions; the app-specific security bundle must come from the user's Tuya Developer Platform app.

**Why:** The user provided an explicit migration plan: preserve current working controls and interface while adding native Tuya pairing/control; remove Shortcut support only after migration. The SDK archive includes an app-specific security dependency, and native runtime behavior still requires a Mac/Xcode build and an iPhone.

**How to apply:** Keep Shortcut launching enabled for unmigrated devices; distinguish Shortcut from Tuya SDK devices and migrate one device at a time. Use the generated iOS package with the matching SmartLife SDK version and secure App SDK credentials. Do not put credentials in JavaScript or logs, do not reuse Cloud API keys, and do not fall back to Tuya Cloud.
