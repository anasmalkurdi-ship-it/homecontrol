---
name: Tuya connection scope
description: The user's current direct-pairing requirement and native-build constraint for Home Control.
---

The user's current requirement is a native iPhone-only Home Control app that pairs devices from inside Home Control using Tuya's App SDK; they do not want a web app. Each Home Control tile should alternate between separate ON and OFF iPhone Shortcuts, tracking the last action launched; it cannot know the device's actual state. This supersedes the earlier Smart Life pairing + Tuya Cloud control direction.

The supplied Tuya iOS SDK archive identifies itself as deprecated and integrates through CocoaPods. Replit's current managed Expo build flow does not support custom native modules or custom CocoaPods SDKs, so direct pairing cannot be built and verified through the current Replit publishing workflow.

**Why:** The user changed the product scope to in-app native pairing, explicitly selected native iPhone only, and chose a single tile that alternates ON/OFF Shortcuts based on its last launched action. Avoid continuing the web/PWA direction or claiming the old cloud-control quota is bypassed by the App SDK.

**How to apply:** Before implementing direct pairing, verify whether a supported custom iOS build path is available. Otherwise explain that the Tuya native SDK requires a native build workflow outside Replit; do not reintroduce Tuya Cloud control unless asked. Require both exact Shortcut names; default the first tap to ON, then alternate after a Shortcut launch succeeds. Label the state as last requested, not actual device state, since changes outside Home Control can desynchronize it.
