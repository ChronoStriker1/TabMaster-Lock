import asyncio
import importlib.util
import json
import logging
import os
from pathlib import Path
import secrets
import sys
import tempfile
import types
import unittest
from unittest.mock import patch

# Decky supplies these modules only on-device.
sys.modules.setdefault("decky_plugin", types.SimpleNamespace(logger=logging.getLogger("tests")))
sys.modules.setdefault("settings", types.SimpleNamespace(SettingsManager=object))
spec = importlib.util.spec_from_file_location("tabmaster_backend", Path(__file__).parents[1] / "main.py")
backend = importlib.util.module_from_spec(spec)
spec.loader.exec_module(backend)


class TabLockTests(unittest.IsolatedAsyncioTestCase):
    async def asyncSetUp(self):
        self.temp = tempfile.TemporaryDirectory()
        self.addCleanup(self.temp.cleanup)
        self.locks = backend.TabLocks(self.temp.name)
        self.locks.activate("account-a")
        # Ephemeral test credentials, never written into source or fixtures.
        self.pin = f"{secrets.randbelow(1000000):06d}"
        self.other = f"{(int(self.pin) + 1) % 1000000:06d}"

    async def act(self, action, tab="private", pin=None, new_pin=None):
        return await self.locks.authenticate("account-a", action, tab, self.pin if pin is None else pin, new_pin)

    async def test_setup_persists_verifier_and_starts_locked(self):
        result = await self.act("protect")
        self.assertTrue(result["ok"])
        self.assertEqual(result["status"]["protected"], ["private"])
        self.assertEqual(result["status"]["unlocked"], [])
        record = self.locks.users["account-a"]
        self.assertEqual(set(record), {"salt", "digest", "tabs"})
        self.assertNotEqual(record["digest"], self.pin)
        self.assertEqual(os.stat(self.locks.path).st_mode & 0o777, 0o600)
        self.assertNotIn("digest", json.dumps(result))

    async def test_wrong_pin_and_unlock_is_per_tab(self):
        await self.act("protect")
        await self.act("protect", "second")
        self.assertFalse((await self.act("unlock", pin=self.other))["ok"])
        self.assertEqual(self.locks.status("account-a")["unlocked"], [])
        self.assertTrue((await self.act("unlock"))["ok"])
        self.assertEqual(self.locks.status("account-a")["unlocked"], ["private"])
        self.locks.lock()
        self.assertEqual(self.locks.status("account-a")["unlocked"], [])

    async def test_restart_and_account_switch_relock(self):
        await self.act("protect")
        await self.act("unlock")
        restarted = backend.TabLocks(self.temp.name)
        restarted.activate("account-a")
        self.assertEqual(restarted.status("account-a")["unlocked"], [])
        self.locks.activate("account-b")
        self.assertFalse(self.locks.status("account-b")["configured"])
        with self.assertRaises(ValueError):
            await self.act("unlock")
        self.locks.activate("account-a")
        self.assertEqual(self.locks.status("account-a")["unlocked"], [])

    async def test_cannot_replace_pin_or_remove_protection_without_current_pin(self):
        await self.act("protect")
        for action in ("protect", "unprotect", "change"):
            self.assertFalse((await self.act(action, pin=self.other, new_pin=self.other))["ok"])
        self.assertEqual(self.locks.status("account-a")["protected"], ["private"])
        self.assertTrue((await self.act("change", new_pin=self.other))["ok"])
        self.assertEqual(self.locks.status("account-a")["unlocked"], [])
        self.assertFalse((await self.act("unlock"))["ok"])
        self.assertTrue((await self.act("unlock", pin=self.other))["ok"])
        self.assertTrue((await self.act("unprotect", pin=self.other))["ok"])
        self.assertEqual(self.locks.status("account-a")["protected"], [])

    async def test_repeated_failures_are_rate_limited(self):
        await self.act("protect")
        with patch.object(self.locks, "clock", return_value=100):
            for _ in range(5):
                self.assertFalse((await self.act("unlock", pin=self.other))["ok"])
            self.assertIn("Try again", (await self.act("unlock"))["message"])
        with patch.object(self.locks, "clock", return_value=102):
            self.assertTrue((await self.act("unlock"))["ok"])

    async def test_lock_during_verification_invalidates_result(self):
        await self.act("protect")
        started, resume = asyncio.Event(), asyncio.Event()
        async def delayed_derive(fn, *args):
            started.set()
            await resume.wait()
            return fn(*args)
        with patch.object(backend.asyncio, "to_thread", side_effect=delayed_derive):
            task = asyncio.create_task(self.act("unlock"))
            await started.wait()
            self.locks.lock()
            resume.set()
            self.assertFalse((await task)["ok"])
        self.assertEqual(self.locks.status("account-a")["unlocked"], [])

    async def test_save_failure_keeps_existing_protection(self):
        await self.act("protect")
        with patch.object(backend.os, "replace", side_effect=OSError("disk full")):
            with self.assertRaises(OSError):
                await self.act("unprotect")
        self.assertEqual(self.locks.status("account-a")["protected"], ["private"])
        self.assertEqual(os.listdir(self.temp.name), ["tab-locks.json"])

    async def test_corrupt_store_is_not_silently_reset(self):
        for data in ([], {"account-a": {}}, {"account-a": {"salt": 1, "digest": [], "tabs": []}}):
            with open(self.locks.path, "w") as target:
                json.dump(data, target)
            with self.assertRaises(ValueError):
                backend.TabLocks(self.temp.name)

    async def test_invalid_input_cannot_create_a_pin(self):
        for pin in (None, "", "123", "abcdef", "１２３４５６", 123456):
            result = await self.locks.authenticate("account-a", "protect", "private", pin)
            self.assertFalse(result["ok"])
        self.assertFalse(self.locks.status("account-a")["configured"])
        with self.assertRaises(ValueError):
            await self.act("unknown")


if __name__ == "__main__":
    unittest.main()
