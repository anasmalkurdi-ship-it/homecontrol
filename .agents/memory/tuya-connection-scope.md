---
name: Tuya connection scope
description: The user's current direct-pairing requirement and native-build constraint for Home Control.
---

The user wants ON/OFF Shortcut controls active on device tiles and corrected the agent for disabling them. Keep both Shortcut-name fields in settings; each tile alternates based on its last requested action and shows last-requested ON in orange. iOS opens Shortcuts when a third-party app runs a user Shortcut; explain this limitation, but do not disable tile launching unless the user explicitly asks.

The supplied Tuya iOS SDK archive identifies itself as deprecated and integrates through CocoaPods. Replit's current managed Expo build flow does not support custom native modules or custom CocoaPods SDKs, so direct pairing cannot be built and verified through the current Replit publishing workflow.

**Why:** The user wants the existing ON/OFF Shortcuts to work from tiles and explicitly said they did not ask for Shortcut launching to be disabled. They also asked for last-requested ON to look orange. Do not claim an existing user Shortcut can run invisibly from Home Control or that the saved action is live device state.

**How to apply:** Keep tile Shortcut launching enabled, with exact ON/OFF names editable in long-press settings and a last-requested ON state shown in orange. If the user asks to prevent Shortcuts from opening, explain that iOS cannot run a user's existing Shortcut silently from another app; suggest native Tuya commands for true in-app control instead of turning off the current working toggle without consent.
