---
name: Tuya connection scope
description: The user's current direct-pairing requirement and native-build constraint for Home Control.
---

The user wants to migrate the existing Home Control app from Shortcut-based control to Tuya's native SmartLife iOS SDK, keeping the current UI, rooms, and local data. Preserve Shortcut control during a gradual per-device migration (`shortcut` to `tuya-sdk`); do not disable working shortcuts before replacement. Start with one factory-reset Wi-Fi light in “Anas office,” then migrate roughly 100 devices. Do not use Tuya Cloud as a fallback. For Shortcut devices, show last-requested ON in orange; for Tuya SDK devices, show actual reported state.

The supplied Tuya iOS SDK archive identifies itself as deprecated and integrates through CocoaPods. Replit's current managed Expo build flow does not support custom native modules or custom CocoaPods SDKs, so direct pairing cannot be built and verified through the current Replit publishing workflow.

Tuya's public Swift sample is useful for current API examples, but intentionally omits the app-specific `ios_core_sdk` package. Public samples and integration docs may show different SDK versions; the app-specific security bundle must come from the user's Tuya Developer Platform app.

**Why:** The user provided an explicit migration plan: preserve current working controls and interface while adding native Tuya pairing/control; remove Shortcut support only after migration. The supplied archive is deprecated, and the online public sample does not contain the app-specific security SDK needed to build.

**How to apply:** Keep Shortcut launching enabled for unmigrated devices; use `controlMethod` to distinguish Shortcut from Tuya SDK devices, and migrate one device at a time. Verify current SDK APIs from the official sample, but require the app-specific security package from Tuya Developer Platform; never fabricate API names or use the deprecated archive. Do not put secrets in JavaScript or logs, and do not fall back to Tuya Cloud.
