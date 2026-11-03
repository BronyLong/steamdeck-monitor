"""Проверки подключения аппаратного сборщика к API без реальных датчиков."""

import asyncio
import threading
import unittest
from contextlib import ExitStack
from unittest.mock import patch

import main
from collector import UNITS


class MonitorTests(unittest.IsolatedAsyncioTestCase):
    def setUp(self):
        stack = self.enterContext(ExitStack())
        stack.enter_context(patch("main.platform.system", return_value="Linux"))
        stack.enter_context(patch("main.INTERVAL", 0.01))
        stack.enter_context(patch.dict("main.os.environ", {
            "STEAMDECK_DISK_PATH": "/home", "STEAMDECK_DISK_DEVICE": "",
        }))
        self.device = stack.enter_context(
            patch("main.get_disk_device", return_value="nvme0n1")
        )

    async def wait_for_sample(self, sequence):
        async def wait():
            # Даём новому циклу сбора очистить данные предыдущего запуска.
            await asyncio.sleep(0)
            while main.latest is None or main.latest["sequence"] < sequence:
                await asyncio.sleep(0.001)

        await asyncio.wait_for(wait(), timeout=2)

    async def test_hardware_values_reach_current_and_history_with_smoothing(self):
        calls = []

        def collect(path, state, device):
            calls.append((path, state, device, threading.get_ident()))
            state["samples"] = state.get("samples", 0) + 1
            value = [10, 20, 60][min(state["samples"] - 1, 2)]
            result = dict.fromkeys(UNITS, 0)
            result.update(cpu_percent=value, gpu_percent=value, memory_percent=47)
            return result

        with patch("main.collect_metrics", side_effect=collect):
            async with main.lifespan(main.app):
                await self.wait_for_sample(2)
                current = main.get_current()
                history = main.get_history("cpu_percent", limit=None, start=None, end=None)

                self.assertEqual(main.health()["source"], "linux")
                self.assertEqual(current["source"], "linux")
                self.assertEqual(set(current["raw"]), set(UNITS))
                self.assertEqual(current["raw"]["cpu_percent"], 60)
                self.assertEqual(current["processed"]["cpu_percent"], 40)
                self.assertEqual(current["processed"]["gpu_percent"], 30)
                self.assertEqual(current["processed"]["memory_percent"], 47)
                self.assertEqual([point["raw"] for point in history["points"]], [None, 20, 60])
                self.assertEqual(history["points"][0]["quality"], "missing")
                self.assertTrue(all(call[0] == "/home" and call[2] == "nvme0n1" for call in calls))
                self.assertTrue(all(call[1] is calls[0][1] for call in calls))
                # psutil хранит базу CPU отдельно для каждого потока.
                self.assertEqual(len({call[3] for call in calls}), 1)
                self.assertNotEqual(calls[0][3], threading.get_ident())

    async def test_disk_override_and_unavailable_sensors(self):
        metrics = dict.fromkeys(UNITS)
        metrics["memory_percent"] = 42
        with (
            patch.dict("main.os.environ", {
                "STEAMDECK_DISK_PATH": "/mnt/storage",
                "STEAMDECK_DISK_DEVICE": "mmcblk0",
            }),
            patch("main.collect_metrics", side_effect=lambda *args: metrics.copy()) as collect,
        ):
            async with main.lifespan(main.app):
                await self.wait_for_sample(1)
                current = main.get_current()
                self.device.assert_not_called()
                self.assertEqual(collect.call_args.args[0], "/mnt/storage")
                self.assertEqual(collect.call_args.args[2], "mmcblk0")
                self.assertEqual(current["processed"]["memory_percent"], 42)
                for name in set(UNITS) - {"memory_percent"}:
                    self.assertIsNone(current["raw"][name])
                    self.assertIsNone(current["processed"][name])
                    self.assertEqual(current["quality"][name], "missing")

    async def test_restart_resets_history_and_counter_state_and_stops_collection(self):
        states = []

        def collect(path, state, device):
            states.append(state)
            return dict.fromkeys(UNITS, 25)

        with patch("main.collect_metrics", side_effect=collect) as collector:
            async with main.lifespan(main.app):
                await self.wait_for_sample(2)
            call_count = collector.call_count
            await asyncio.sleep(0.03)
            self.assertEqual(collector.call_count, call_count)
            old_state = states[-1]

            async with main.lifespan(main.app):
                await self.wait_for_sample(0)
                self.assertEqual(len(main.history), 1)
                self.assertEqual(main.latest["sequence"], 0)
                self.assertIsNone(main.latest["processed"]["cpu_percent"])
                self.assertIsNot(states[-1], old_state)

    async def test_non_linux_startup_fails_before_collecting(self):
        with (
            patch("main.platform.system", return_value="Windows"),
            patch("main.collect_metrics") as collect,
        ):
            with self.assertRaisesRegex(RuntimeError, "Linux"):
                async with main.lifespan(main.app):
                    self.fail("Не должно запускаться вне Linux")
            collect.assert_not_called()


if __name__ == "__main__":
    unittest.main()
