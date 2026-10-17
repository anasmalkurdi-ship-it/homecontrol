---
name: Tuya connection scope
description: The user's current direct-pairing requirement and native-build constraint for Home Control.
---

The user wants to migrate the existing Home Control app from Shortcut-based control to Tuya's native SmartLife iOS SDK, keeping the current UI, rooms, and local data. Preserve Shortcut control during a gradual per-device migration (`shortcut` to `tuya-sdk`); do not disable working shortcuts before replacement. Start with one factory-reset Wi-Fi light in “Anas office,” then migrate roughly 100 devices. Do not use Tuya Cloud as a fallback. For Shortcut devices, show last-requested ON in orange; for Tuya SDK devices, show actual reported state.

The supplied Tuya iOS SDK archive identifies itself as deprecated and integrates through CocoaPods. Replit's current managed Expo build flow does not support custom native modules or custom CocoaPods SDKs, so direct pairing cannot be built and verified through the current Replit publishing workflow.

**Why:** The user provided an explicit migration plan: preserve current working controls and interface while adding native Tuya pairing/control; remove Shortcut support only after migration. The supplied iOS SDK archive is an older deprecated 3.32.x sample, not the current platform-built v5 package.

**How to apply:** Keep Shortcut launching enabled for unmigrated devices; use `controlMethod` to distinguish Shortcut from Tuya SDK devices, and migrate one device at a time. Use the current Tuya v5 SDK package built for the app from Tuya Developer Platform; never fabricate API names or use the deprecated archive. Do not put secrets in JavaScript or logs, and do not fall back to Tuya Cloud.
