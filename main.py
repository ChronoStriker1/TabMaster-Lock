import asyncio
import os
import json
import hashlib
import hmac
import secrets
import tempfile
import time
import math
import re
import decky_plugin
from settings import SettingsManager
from typing import TypeVar


def log(txt):
  decky_plugin.logger.info(txt)

def warn(txt):
  decky_plugin.logger.warn(txt)

def error(txt):
  decky_plugin.logger.error(txt)

Initialized = False

class TabLocks:
  """Backend-only PIN verifier. No PINs or verifiers enter normal tab backups."""
  def __init__(self, directory):
    self.path = os.path.join(directory, "tab-locks.json")
    self.users = {}
    self.unlocked = set()
    self.user_id = None
    self.generation = 0
    self.attempts = {}
    self.clock = time.monotonic
    self.mutex = asyncio.Lock()
    if os.path.exists(self.path):
      with open(self.path, encoding="utf-8") as source:
        self.users = json.load(source)
      if not isinstance(self.users, dict):
        raise ValueError("Invalid tab lock settings")
      for record in self.users.values():
        if (not isinstance(record, dict)
            or not isinstance(record.get("tabs"), list)
            or not all(isinstance(tab, str) for tab in record["tabs"])
            or not isinstance(record.get("salt"), str)
            or not re.fullmatch(r"[0-9a-f]{32}", record["salt"])
            or not isinstance(record.get("digest"), str)
            or not re.fullmatch(r"[0-9a-f]{64}", record["digest"])):
          raise ValueError("Invalid tab lock settings")

  def activate(self, user_id):
    self.lock()
    self.user_id = user_id

  def lock(self, tab_id=None):
    # Invalidate PIN verifications already in flight, including during suspend.
    self.generation += 1
    if tab_id is None:
      self.unlocked.clear()
    else:
      self.unlocked.discard(tab_id)

  def status(self, user_id):
    if not user_id or self.user_id != user_id:
      raise ValueError("Tab lock account changed; reopen the plugin")
    record = self.users.get(user_id)
    return {"configured": record is not None,
            "protected": record["tabs"][:] if record else [],
            "unlocked": sorted(self.unlocked)}

  @staticmethod
  def derive(pin, salt):
    return hashlib.scrypt(pin.encode("ascii"), salt=bytes.fromhex(salt),
                          n=16384, r=8, p=1, dklen=32).hex()

  def persist(self, users):
    os.makedirs(os.path.dirname(self.path), exist_ok=True)
    fd, temporary = tempfile.mkstemp(prefix=".tab-locks-", dir=os.path.dirname(self.path))
    try:
      with os.fdopen(fd, "w", encoding="utf-8") as target:
        json.dump(users, target)
        target.flush()
        os.fsync(target.fileno())
      os.replace(temporary, self.path)
    finally:
      if os.path.exists(temporary):
        os.unlink(temporary)
    self.users = users

  async def authenticate(self, user_id, action, tab_id, pin, new_pin=None):
    async with self.mutex:
      self.status(user_id)
      if action not in ("protect", "unlock", "unprotect", "change"):
        raise ValueError("Unknown lock action")
      if action != "change" and (not isinstance(tab_id, str) or not tab_id or len(tab_id) > 200):
        raise ValueError("Invalid tab")
      if not isinstance(pin, str) or not re.fullmatch(r"[0-9]{6}", pin):
        return {"ok": False, "message": "Enter six digits."}
      generation = self.generation
      record = self.users.get(user_id)
      failures, retry_at = self.attempts.get(user_id, (0, 0))
      remaining = math.ceil(retry_at - self.clock())
      if remaining > 0:
        return {"ok": False, "message": f"Try again in {remaining} seconds."}
      if record:
        digest = await asyncio.to_thread(self.derive, pin, record["salt"])
        if generation != self.generation or self.user_id != user_id:
          return {"ok": False, "message": "Session changed. Please try again."}
        if not hmac.compare_digest(digest, record["digest"]):
          failures += 1
          delay = min(300, 2 ** min(failures - 5, 9)) if failures >= 5 else 0
          self.attempts[user_id] = (failures, self.clock() + delay)
          return {"ok": False, "message": "Incorrect PIN."}
      elif action != "protect":
        return {"ok": False, "message": "Protect a tab to set up your PIN first."}

      if action == "change" and (not isinstance(new_pin, str) or not re.fullmatch(r"[0-9]{6}", new_pin)):
        return {"ok": False, "message": "The new PIN must contain six digits."}
      if not record or action == "change":
        salt = secrets.token_hex(16)
        digest = await asyncio.to_thread(self.derive, new_pin if record else pin, salt)
        record = {"salt": salt, "digest": digest, "tabs": record["tabs"][:] if record else []}
      else:
        record = {**record, "tabs": record["tabs"][:]}
      if generation != self.generation or self.user_id != user_id:
        return {"ok": False, "message": "Session changed. Please try again."}
      if action == "unlock":
        if tab_id not in record["tabs"]:
          return {"ok": False, "message": "This tab is not protected."}
        self.unlocked.add(tab_id)
      else:
        if action == "protect" and tab_id not in record["tabs"]:
          record["tabs"].append(tab_id)
        elif action == "unprotect":
          record["tabs"] = [tab for tab in record["tabs"] if tab != tab_id]
        self.persist({**self.users, user_id: record})
        self.lock(None if action == "change" else tab_id)
      self.attempts.pop(user_id, None)
      return {"ok": True, "status": self.status(user_id)}

class Plugin:
  user_id: str = None
  users_dict: dict[str, dict] = None
  tags: list[dict] = None
  save_on_shutdown = True

  settings: SettingsManager
  locks: TabLocks = None

  def _require_locks(self):
    if self.locks is None:
      raise RuntimeError("Tab lock settings unavailable. Reload the plugin.")
    return self.locks

  async def get_lock_status(self, user_id):
    return self._require_locks().status(user_id)

  async def authenticate_tab(self, user_id, action, tab_id, pin, new_pin=None):
    return await self._require_locks().authenticate(user_id, action, tab_id, pin, new_pin)

  async def lock_tabs(self, user_id, tab_id=None):
    locks = self._require_locks()
    locks.status(user_id)
    locks.lock(tab_id)
    return locks.status(user_id)

  async def log_message(self, message, level):
    if level == 0:
      log(message)
    elif level == 1:
      warn(message)
    elif level == 2:
      error(message)

  async def get_user_desktop(self) -> str:
    return os.environ["DECKY_USER_HOME"] + "/Desktop"

  async def restore_settings(self, source_path: str) -> bool:
    """
    Waits until users_dict is loaded, then returns restores settings
    """
    while Plugin.users_dict is None:
      await asyncio.sleep(0.1)

    success = True

    try:
      with open(source_path, 'r', encoding='utf-8') as settings_file:
        data = json.load(settings_file)
        self.settings.settings = data
        self.settings.commit()
        self.save_on_shutdown = False
    except:
      success = False

    return success

  async def backup_settings(self, dest_path: str) -> bool:
    """
    Waits until users_dict is loaded, then backs up settings
    """
    while Plugin.users_dict is None:
      await asyncio.sleep(0.1)

    success = True

    try:
      with open(dest_path, 'w', encoding='utf-8') as settings_file:
        json.dump(self.settings.settings, settings_file, ensure_ascii=False, indent=4)
    except:
      success = False

    return success
  
  async def backup_default_dir(self, name: str) -> bool:
    success = True
    backup = SettingsManager(name=name, settings_directory=os.environ["DECKY_PLUGIN_SETTINGS_DIR"])
    backup.settings = self.settings.settings
    try:
      backup.commit()
    except:
      try:
        os.remove(backup.path)
      except:
          pass
      success = False
      
    return success

  # Plugin settings getters
  async def get_users_dict(self) -> dict[str, dict] | None:
    """
    Waits until users_dict is loaded, then returns users_dict

    :return: The users dictionary
    """
    while Plugin.users_dict is None:
      await asyncio.sleep(0.1)
      
    # log(f"Got users_dict {Plugin.settings_dict}")
    return Plugin.users_dict
  
  async def remove_legacy_settings(self):
    Plugin.del_setting(self, "tabs")
    Plugin.del_setting(self, "friends")
    Plugin.del_setting(self, "friendsGames")
    
    log("Legacy settings removal complete.")
    pass

  async def migrate_legacy_settings(self):
    tabs = await Plugin.get_setting(self, "tabs", {})
    friends = await Plugin.get_setting(self, "friends", [])
    friends_games = await Plugin.get_setting(self, "friendsGames", {})

    for tabId in tabs:
      tab = tabs[tabId]
      if "includesHidden" in tab:
        tab["categoriesToInclude"] = 17 if tab["includesHidden"] == True else 1
        del tab["includesHidden"]

    Plugin.users_dict[Plugin.user_id] = {
      "tabs": tabs,
      "friends": friends,
      "friendsGames": friends_games
    }
    await Plugin.set_setting(self, "usersDict", Plugin.users_dict)
    await Plugin.remove_legacy_settings(self)

    log("Legacy settings migration complete.")
    pass
  
  async def set_active_user_id(self, user_id: str) -> bool:
    log(f"active user id: {user_id}")
    Plugin.user_id = user_id
    # Wait for backend initialization before accepting any unlock operation.
    while Plugin.users_dict is None:
      await asyncio.sleep(0.1)
    self._require_locks().activate(user_id)
    
    while Plugin.users_dict is None:
      await asyncio.sleep(0.1)

    if not user_id in Plugin.users_dict.keys():
      log(f"User {user_id} had no settings.")

      Plugin.users_dict[user_id] = {
        "tabs": {},
        "friends": [],
        "friendsGames": {}
      }
      await Plugin.set_setting(self, "usersDict", Plugin.users_dict)

    return "tabs" in Plugin.settings.settings.keys()
  
  async def get_tabs(self) -> dict[str, dict] | None:
    """
    Waits until tabs are loaded, then returns the tabs

    :return: The tabs
    """
    while Plugin.users_dict is None:
      await asyncio.sleep(0.1)
    
    tabs = Plugin.users_dict[Plugin.user_id]["tabs"]
    log(f"Got tabs {tabs}")
    return tabs or {}
  
  async def get_shared_tabs(self) -> dict[str, dict] | None:
    """
    Waits until tabs are loaded, then returns the tabs that are available from other users

    :return: The tabs
    """
    while Plugin.users_dict is None:
      await asyncio.sleep(0.1)
    
    tabs = {}

    for user_id in Plugin.users_dict:
      if user_id != Plugin.user_id:
        user_tabs = Plugin.users_dict[user_id]["tabs"]
        
        for tab_name in user_tabs:
          tab = user_tabs[tab_name]

          if "visibleToOthers" in tab and tab["visibleToOthers"]:
            if user_id not in tabs:
              tabs[user_id] = {}
            
            tabs[user_id][tab_name] = tab

    log(f"Got shared tabs {tabs}")
    return tabs or {}

  async def get_tags(self) -> list[dict] | None:
    """
    Waits until tags is loaded, then returns the tags

    :return: The tags
    """
    while Plugin.tags is None:
      await asyncio.sleep(0.1)
    
    log(f"Got {len(Plugin.tags)} tags")
    return Plugin.tags

  async def get_friends(self) -> list[dict] | None:
    """
    Waits until friends is loaded, then returns the friends

    :return: The friends
    """
    while Plugin.users_dict is None:
      await asyncio.sleep(0.1)
      
    friends = Plugin.users_dict[Plugin.user_id]["friends"]
    log(f"Got {len(friends)} friends")
    return friends or []

  async def get_friends_games(self) -> dict[int, list[int]] | None:
    """
    Waits until friends_games is loaded, then returns the friends_games

    :return: The friends_games
    """
    while Plugin.users_dict is None:
      await asyncio.sleep(0.1)

    friends_games = Plugin.users_dict[Plugin.user_id]["friendsGames"]  
    log(f"Got {len(friends_games)} friendsGames")
    return friends_games or {}
  
  async def get_tab_profiles(self) -> dict[str, list[str]] | None:
    """
    Waits until users_dict is loaded, then returns the tab profiles

    :return: User's tab profiles
    """
    while Plugin.users_dict is None:
      await asyncio.sleep(0.1)

    user = Plugin.users_dict[Plugin.user_id]
    tab_profiles = Plugin.users_dict[Plugin.user_id]["tabProfiles"] if "tabProfiles" in user.keys() else {}
    log(f"Got tab profiles {tab_profiles}")
    return tab_profiles

  # Plugin settings setters
  async def set_tabs(self, tabs: dict[str, dict]):
    if not self.save_on_shutdown:
      return
    
    Plugin.users_dict[Plugin.user_id]["tabs"] = tabs
    await Plugin.set_setting(self, "usersDict", Plugin.users_dict)

  async def set_tags(self, tags: list[dict]):
    if not self.save_on_shutdown:
      return
    
    Plugin.tags = tags
    await Plugin.set_setting(self, "tags", Plugin.tags)

  async def set_friends(self, friends: list[dict]):
    if not self.save_on_shutdown:
      return
    
    Plugin.users_dict[Plugin.user_id]["friends"] = friends
    await Plugin.set_setting(self, "usersDict", Plugin.users_dict)

  async def set_friends_games(self, friends_games: dict[str, list[int]]):
    if not self.save_on_shutdown:
      return
    
    Plugin.users_dict[Plugin.user_id]["friendsGames"] = friends_games
    await Plugin.set_setting(self, "usersDict", Plugin.users_dict)

  async def set_tab_profiles(self, tab_profiles: dict[str, list[str]]):
    if not self.save_on_shutdown:
      return
    
    Plugin.users_dict[Plugin.user_id]["tabProfiles"] = tab_profiles
    await Plugin.set_setting(self, "usersDict", Plugin.users_dict)

  async def read(self) -> None:
    """
    Reads the json from disk
    """
    Plugin.settings.read()
    Plugin.users_dict = await Plugin.get_setting(self, "usersDict", {})
    Plugin.tags = await Plugin.get_setting(self, "tags", [])

  T = TypeVar("T")

  # Plugin settingsManager wrappers
  async def get_setting(self, key, default: T) -> T:
    """
    Gets the specified setting from the json

    :param key: The key to get
    :param default: The default value
    :return: The value, or default if not found
    """
    return Plugin.settings.getSetting(key, default)

  async def set_setting(self, key, value: T) -> T:
    """
    Sets the specified setting in the json

    :param key: The key to set
    :param value: The value to set it to
    :return: The new value
    """
    Plugin.settings.setSetting(key, value)
    return value
  
  def del_setting(self, key) -> None:
    """
    Deletes the specified setting in the json
    """
    del Plugin.settings.settings[key]
    Plugin.settings.commit()
    pass

  # Asyncio-compatible long-running code, executed in a task when the plugin is loaded
  async def _main(self):
    global Initialized

    if Initialized:
      return

    Initialized = True

    Plugin.settings = SettingsManager(name="settings", settings_directory=os.environ["DECKY_PLUGIN_SETTINGS_DIR"])
    try:
      self.locks = TabLocks(os.environ["DECKY_PLUGIN_SETTINGS_DIR"])
    except Exception:
      error("Tab lock settings could not load; protected content will remain unavailable.")
    await Plugin.read(self)

    log("Initializing Tab Master.")

  # Function called first during the unload process, utilize this to handle your plugin being removed
  async def _unload(self):
    decky_plugin.logger.info("Unloading Tab Master.")

  # Migrations that should be performed before entering `_main()`.
  async def _migration(self):
    pass
