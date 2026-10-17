---
name: Tuya connection scope
description: The user's current direct-pairing requirement and native-build constraint for Home Control.
---

The user's current requirement is a native iPhone-only Home Control app that pairs devices from inside Home Control using Tuya's App SDK; they do not want a web app. The user wants Shortcut actions to run without opening Shortcuts, but selected keeping tiles inactive until native Tuya control is built because iOS foregrounds Shortcuts when another app runs a Shortcut. Show a stored last-requested ON state in orange, clearly distinguished from live device state.

The supplied Tuya iOS SDK archive identifies itself as deprecated and integrates through CocoaPods. Replit's current managed Expo build flow does not support custom native modules or custom CocoaPods SDKs, so direct pairing cannot be built and verified through the current Replit publishing workflow.

**Why:** The user changed the product scope to in-app native pairing, explicitly selected native iPhone only, and does not want tile taps to open the Shortcuts app. They also asked for the last-requested ON state to look orange. Do not claim an existing user Shortcut can run invisibly from Home Control or that the saved action is live device state.

**How to apply:** Before implementing direct pairing, verify whether a supported custom iOS build path is available. Otherwise explain that the Tuya native SDK requires a native build workflow outside Replit; do not reintroduce Tuya Cloud or Shortcut URL launching unless asked. Keep device tiles inactive until native Tuya controls are available, and label any orange ON indicator as the last requested state, not confirmed status.
