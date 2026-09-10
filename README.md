# TabMaster Lock

A fork of [TabMaster](https://github.com/Tormak9970/TabMaster), based on upstream 2.16.2 (`cd01770a80a37e0692e76ad8083719c15205f5d9`), with a separate six-digit PIN for selected library tabs. Original history, credits, and license are preserved.

## Lock behavior

- Protect either a custom or default tab using **Protect with PIN** in its options menu. The first protected tab asks you to choose and confirm a PIN.
- One TabMaster PIN is used per Steam account. Each protected tab unlocks independently.
- Locked tabs show their title and a lock screen. Their game grid, game count, and edit/duplicate/snapshot actions are unavailable until unlocked.
- Games remain visible in other tabs, Home, search, and other Steam views. Protection does not hide or modify games in Steam itself.
- An unlocked tab relocks when you switch to another tab or leave Library. Tabs also relock on plugin reload, account changes, suspend/resume, and activation of Steam's device lock screen. **Lock tab now** and **Lock all protected tabs** are also available.
- Removing protection or changing the PIN requires the current PIN. Changing it relocks every protected tab.
- The PIN screen supports six-digit entry through controller buttons, touch targets, or a numeric keyboard. Controller mappings are displayed on the keys; Menu/Start erases a digit and View/Select cancels. This is a custom screen with its own mappings, not Steam's device PIN screen.

## Build and install this fork

Use Node.js 20 or newer, pnpm 9, and Python 3.10 or newer. With pnpm installed:

```sh
pnpm install --frozen-lockfile
pnpm typecheck
pnpm test
pnpm package
```

The installable ZIP is `artifacts/TabMaster-Lock_v0.1.0.zip`. In Decky settings, enable Developer mode and use **Install Plugin from ZIP File**.

Back up existing TabMaster settings, then disable the original TabMaster before enabling this fork: both patch the same library route. This fork has a distinct plugin name/settings directory. Use TabMaster's existing backup/restore controls if you want to transfer tabs. The store version and upstream release downloads below do **not** include this fork's lock feature.

This is an experimental build. TypeScript checking and 18 automated tests pass. Installation, Hidden-tab gating, wrong/correct PIN handling, manual relocking, restart persistence, and keypad layout/keyboard input have been exercised on a Steam Deck with Decky 3.2.8. Physical controller input and actual suspend/resume still need acceptance testing. See [the device test report and checklist](docs/DEVICE-TESTING.md). After hot-reloading or switching plugin versions, leave and reopen Library.

## PIN storage and recovery

Only a random salt and scrypt verifier are persisted, in `tab-locks.json` inside Decky's settings directory for this plugin, using atomic writes and file permissions `0600`. PINs are not stored in tab settings, exported with ordinary settings backups, or logged by this plugin. Unlock sessions exist only in memory. Failed PIN attempts are throttled after five failures; the delay increases to a maximum of five minutes. This attempt counter resets when the backend restarts.

Treat this as a privacy feature for selected tabs. Disabling Decky/the plugin or using another Steam view bypasses it. It does not encrypt games or prevent launching them. Steam updates can break the private UI hooks this fork inherits from TabMaster.

If you forget the PIN, stop/disable the plugin and move its `tab-locks.json` aside in Desktop Mode, retaining a private backup. Reloading the plugin then removes all PIN protection for every account in that file. A corrupt lock file is never silently reset: library content stays gated after the lock controller fails to load. Ordinary tab backup/restore does not reset or transfer PIN protection. A newly duplicated tab has its own ID and is unprotected until you explicitly protect it.

## Upstream documentation

The following describes the original TabMaster plugin and its store releases.

# Tab Master

A plugin for customizing, adding, and removing Library Tabs.

![Main View](./assets/thumbnail.png)

# Overview

TabMaster allows you to have full control over your library tabs! You can hide, filter, reorder them as you please.

# Using the plugin

Once you have installed TabMaster, open it in the Quick Access Menu (QAM), where you can reorder, hide and add tabs!

# Installation

## Decky Store
This is the preferred way to install TabMaster.

### Steps
1. [Install the Decky plugin loader](https://github.com/SteamDeckHomebrew/decky-loader#installation)
2. Use the built in plugin store to download the Tab Master Plugin
   - If you want the bleeding edge version, use Decky's Testing Store

## From Zip
This is the best way to get fixes for TabMaster early if you're having issues

### Steps
1. Go into **Desktop Mode** on your device, and open your preferred browser
2. Go to https://github.com/Tormak9970/TabMaster/releases/latest
3. Download the file `TabMaster_vX.X.X.zip` (ex: `TabMaster_v2.15.0.zip`), and save it somewhere easy to remember
4. Go back to **Game Mode**
5. Open Decky's Settings menu
6. On the **General** tab, scroll down and make sure you have **Developer mode** toggled on
7. Go to the **Developer** tab
8. Click **Install Plugin from ZIP File**, and browse to where you downloaded the zip file earlier

# Features

Features Include:<br/>

- Making custom tabs with editable filters
- Hiding default and custom tabs
- Reordering default and custom tabs

Available Filters:

- **Collection** - Selects apps that are in a certain Steam Collection.
- **Installed** - Selects apps that are installed/uninstalled.
- **Regex** - Selects apps whose titles match a [regular expression](https://medium.com/factory-mind/regex-tutorial-a-simple-cheatsheet-by-examples-649dc1c3f285) (for testing, use [this website](https://regexr.com/)).
- **Friends** - Selects apps that are also owned by any/all listed friends.
- **Tags** - Selects apps that have any/all specific tags.
- **Whitelist** - Selects apps that are added to the list.
- **Blacklist** - Selects apps that are not added to the list.
- **Merge** - Selects apps that pass a subgroup of filters.
- **Platform** - Selects Steam or non-Steam apps.
- **Deck Compatibility** - Selects apps that have a specific Steam Deck compatibilty status.
- **SteamOS Compatibility** - Selects apps that have a specific SteamOS compatibilty status.
- **Review Score** - Selects apps that are greater/less than the provided metacritic/steam review score.
- **Time Played** - Selects apps that have a play time greater/less than the provided time.
- **Size on Disk** - Selects apps that have an install size greater/less than the provided size.
- **Release Date** - Selects apps that were released before/after the provided date.
- **Last Played** - Selects apps that were last played before/after the provided date.
- **Demo** - Selects apps that are/aren't demos.
- **Coming Soon** - Selects apps that are/aren't coming soon.
- **Streamable** - Selects apps that can/can't be streamed from another computer.
- **Steam Features** - Selects apps that support specific Steam Features.
- **MicroSD Card** - Selects apps that are present on the inserted/specific MicroSD Card.
- **Install Folder** - Selects apps that are present on the specific install folder.

If you want us to add another filter, please open a filter request [here](https://github.com/Tormak9970/TabMaster/issues/new/choose).

Filter Examples:

- **Collection**<br/><img src="./assets/filters/docs_collection-example.png" width="600" />
- **Installed**<br/><img src="./assets/filters/docs_installed-example.png" width="600" />
- **Regex**<br/><img src="./assets/filters/docs_regex-example.png" width="600" />
- **Friends**<br/><img src="./assets/filters/docs_friends-example.png" width="600" />
- **Tags**<br/><img src="./assets/filters/docs_tags-example.png" width="600" />
- **Whitelist**<br/><img src="./assets/filters/docs_whitelist-example.png" width="600" />
- **Blacklist**<br/><img src="./assets/filters/docs_blacklist-example.png" width="600" />
- **Merge**<br/><img src="./assets/filters/docs_merge-example.png" width="600" />
- **Platform**<br/><img src="./assets/filters/docs_platform-example.png" width="600" />
- **Deck Compatibility**<br/><img src="./assets/filters/docs_deck-compat-example.png" width="600" />
- **SteamOS Compatibility**<br/><img src="./assets/filters/docs_steamos-compat-example.png" width="600" />
- **Review Score**<br/><img src="./assets/filters/docs_review-score-example.png" width="600" />
- **Time Played**<br/><img src="./assets/filters/docs_time-played-example.png" width="600" />
- **Size on Disk**<br/><img src="./assets/filters/docs_size-on-disk-example.png" width="600" />
- **Release Date**<br/><img src="./assets/filters/docs_release-date-example.png" width="600" />
- **Purchase Date**<br/><img src="./assets/filters/docs_purchase-date-example.png" width="600" />
- **Last Played**<br/><img src="./assets/filters/docs_last-played-example.png" width="600" />
- **Family Sharing**<br/><img src="./assets/filters/docs_family-sharing-example.png" width="600" />
- **Demo**<br/><img src="./assets/filters/docs_demo-example.png" width="600" />
- **Coming Soon**<br/><img src="./assets/filters/docs_coming-soon-example.png" width="600" />
- **Streamable**<br/><img src="./assets/filters/docs_streamable-example.png" width="600" />
- **Steam Features**<br/><img src="./assets/filters/docs_steam-features-example.png" width="600" />
- **Achievements**<br/><img src="./assets/filters/docs_achievements-example.png" width="600" />
- **MicroSD Card**<br/><img src="./assets/filters/docs_microsd-card-example.png" width="600" />
- **Install Folder**<br/><img src="./assets/filters/docs_install-folder-example.png" width="600" />

# Contributing

If you're interested in fixing a bug, submitting a new feature, or just helping out, please read the [Contributor Guidelines](./Contributing.md)

# Licensing

- This program is licensed under the [GNU General Public License Version 3](https://www.gnu.org/licenses/#GPL) and [BSD 3-Clause License](https://opensource.org/license/bsd-3-clause/) <br/>
- Additionally, please provide appropriate credit for code usage

Copyright Travis Lane (Tormak) and Jessebofill
