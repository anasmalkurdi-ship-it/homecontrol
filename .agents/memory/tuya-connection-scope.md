---
name: Tuya connection scope
description: The user's current direct-pairing requirement and native-build constraint for Home Control.
---

The user's current requirement is a native iPhone-only Home Control app that pairs devices from inside Home Control using Tuya's App SDK; they do not want a web app. This supersedes the earlier Smart Life pairing + Tuya Cloud control direction.

The supplied Tuya iOS SDK archive identifies itself as deprecated and integrates through CocoaPods. Replit's current managed Expo build flow does not support custom native modules or custom CocoaPods SDKs, so direct pairing cannot be built and verified through the current Replit publishing workflow.

**Why:** The user changed the product scope to in-app native pairing and explicitly selected native iPhone only. Avoid continuing the web/PWA direction or claiming the old cloud-control quota is bypassed by the App SDK.

**How to apply:** Before implementing direct pairing, verify whether a supported custom iOS build path is available. Otherwise explain that the Tuya native SDK requires a native build workflow outside Replit; keep cloud pairing/control as the supported Replit fallback.
