# Steam Deck acceptance testing

Status: installed and exercised on a Steam Deck on 2026-09-09. Decky version: 3.2.8. Steam CEF: Chrome 126.0.6478.183; Steam webhelper build: 1788652215. Original TabMaster: 2.15.1. Fork: 0.1.0, based on upstream 2.16.2.

Verified on the device:

- Original tab settings transferred; the test tab (`Hidden`) retained its filters and matching games.
- Protecting `Hidden` replaced its game grid and count with a lock screen. Other tab counts remained unchanged.
- Wrong PIN rejected; correct PIN restored the grid and count. Manual relock hid it again.
- The tester confirmed that switching away from an unlocked `Hidden` tab and returning requires the PIN again. The tab-content cleanup also relocks when leaving Library.
- A plugin backend restart retained protection and started locked, checked after leaving and reopening Library.
- Keypad touch handlers and numeric keyboard/backspace input worked. The focused input container and full keypad fit the Deck's 854×534 CSS viewport (1280×800 physical display).
- Fixed initial keypad clipping and lack of keyboard focus discovered during this test.
- Avoided Decky's default RPC argument logging for PIN calls. Local suite now has 18 passing tests, including this transport behavior and tab-exit relocking.
- Verified the Decky menu layout after changing lock actions to full-width rows and compacting the header: the 300px-wide panel has no horizontally overflowing descendants, and the complete title fits on one line beside the profile/docs buttons. Confirmed with live DOM measurements and a screenshot.

Temporary test credentials were removed afterward. The tester completed private PIN setup on the Deck; live status confirmed `Hidden` protected and subsequently unlocked. The personal PIN was never requested or read. Physical controller input and actual suspend/resume remain user/hardware acceptance checks; the tester's input method has not been confirmed.

The original plugin and settings were backed up before installation, and original TabMaster remains installed but disabled. The fork's runtime settings directory is `TabMaster-Lock` under Decky's settings directory. To roll back, disable TabMaster Lock and re-enable TabMaster in Decky; original settings remain intact. After switching versions or hot-reloading, leave and reopen Library to discard any already-rendered route components.

Record SteamOS version, Steam client channel/build, Decky version, and the ZIP version used. Disable the original TabMaster before testing this fork; retain a settings backup.

1. Create a custom tab containing a small collection. Protect it from the tab options menu. Confirm that PIN setup requires six digits twice and rejects a mismatched confirmation.
2. Visit the tab before unlocking. Only the tab title and lock screen should appear, including for an auto-hide tab with zero matching games. No game count, tiles, artwork, or previous grid should flash into view once the plugin is initialized.
3. Enter the PIN using each input method: the displayed controller mappings, touchscreen, and keyboard. Verify that each press enters one digit; holding a button must not repeatedly enter digits. Check that B enters its mapped digit without dismissing the modal, and that Menu/Start erases and View/Select cancels. Keyboard Backspace/Escape should also work.
4. Cancel or enter a wrong PIN. The grid must remain absent. After five wrong attempts, even a correct PIN must wait for the displayed delay. Wait, then enter the correct PIN and verify the grid and count return.
5. Protect a second tab with the same PIN. Unlocking one must leave the other locked. Verify All Games, Home, search, and other unprotected tabs still display the games throughout.
6. Repeat with a built-in tab, including Collections. Check that Steam's collection UI is gated when that tab is protected.
7. Relock while a protected tab is open. Its grid must disappear immediately. Repeat with **Lock all protected tabs**, suspend/resume, Steam's device lock screen, plugin reload, and a Steam account change.
8. Suspend or switch accounts during PIN verification. A delayed response must not reveal content afterward. Confirm unlocks and PIN configuration are isolated per account.
9. Check options from both the Library and Decky QAM. A locked tab must not offer edit, duplicate, snapshot, or delete actions. Removing protection must require the correct PIN even if the tab was already unlocked.
10. Change the PIN. Confirm that all tabs relock, the old PIN fails, the new PIN works, and restarting preserves the new PIN and protected tab list.
11. Hide/unhide a protected tab, switch tab profiles, and restore a normal tab backup. Protection must remain attached to the same tab ID. A duplicated tab is independent and starts unprotected.
12. Test a fresh install with no PIN, and restoring upstream settings. Existing unprotected tabs should behave as upstream. Verify that only one TabMaster variant is active.

Do not put actual PINs, lock store contents, account credentials, or unredacted request traces in test reports.
