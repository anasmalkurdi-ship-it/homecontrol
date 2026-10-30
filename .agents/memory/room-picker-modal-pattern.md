---
name: Room picker presentation
description: Why room selection should remain inside the device settings sheet.
---

**Rule:** Keep room selection as inline expandable content inside device settings; avoid opening a second modal over the settings modal.

**Why:** The user reported that the room list did not appear on iPhone. The previous flow also disabled the move action when only one room existed, making it look like the picker was broken.

**How to apply:** For room assignment in this smart-home app, show destination rooms in the existing settings sheet. If there is no alternate room, keep the control visible and explain that another room is needed.
