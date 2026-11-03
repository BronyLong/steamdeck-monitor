
"""API мониторинга аппаратных ресурсов Steam Deck."""

import asyncio
import logging
import os
import platform
import time
from collections import deque
from concurrent.futures import ThreadPoolExecutor
from contextlib import asynccontextmanager, suppress
from datetime import datetime, timezone

from fastapi import Depends, FastAPI, HTTPException, Query

from auth import require_user, router as auth_router
from collector import UNITS, collect_metrics, get_disk_device
from processing import validate_metrics, average_buffer


INTERVAL = 1.0
WINDOW = 5

# Полная история измерений в оперативной памяти.
history = deque()

latest = None


async def monitor(executor, disk_path, disk_device):
    """Собирает реальные показатели, сохраняя состояние между опросами."""
    global latest

    latest = None
    history.clear()
    buffer = deque(maxlen=WINDOW)
    disk_state = {}
    loop = asyncio.get_running_loop()
    start = time.monotonic()
    next_tick = start
    sequence = 0

    while True:
        await asyncio.sleep(max(0, next_tick - time.monotonic()))

        elapsed = time.monotonic() - start
        timestamp = datetime.now(timezone.utc).isoformat(
            timespec="milliseconds"
        )

        # Один выделенный поток сохраняет базу psutil.cpu_percent между
        # вызовами и не блокирует API при чтении системных файлов.
        metrics = await loop.run_in_executor(
            executor, collect_metrics, disk_path, disk_state, disk_device,
        )
        if sequence == 0:
            # Первый опрос задаёт базу, но ещё не измеряет загрузку CPU.
            metrics["cpu_percent"] = None

        # Проверка корректности.
        raw, quality = validate_metrics(metrics)

        # Буферизация.
        buffer.append(raw)

        # Обработка скользящим средним.
        processed = average_buffer(buffer)

        # Формирование отсчёта.
        latest = {
            "sequence": sequence,
            "measured_at": timestamp,
            "elapsed_s": elapsed,
            "source": "linux",
            "raw": raw,
            "processed": processed,
            "quality": quality,
        }

        history.append(latest)
        sequence += 1

        next_tick += INTERVAL

        # Пропуск просроченных интервалов.
        now = time.monotonic()
        if next_tick < now:
            next_tick += (
                int((now - next_tick) // INTERVAL) + 1
            ) * INTERVAL


@asynccontextmanager
async def lifespan(app: FastAPI):
    if platform.system() != "Linux":
        raise RuntimeError("Для аппаратного мониторинга запустите backend на Steam Deck с Linux")

    disk_path = os.environ.get("STEAMDECK_DISK_PATH", "/home")
    disk_device = os.environ.get("STEAMDECK_DISK_DEVICE") or get_disk_device(disk_path)
    if disk_device is None:
        logging.getLogger(__name__).warning(
            "Не удалось определить накопитель для %s; при необходимости "
            "задайте STEAMDECK_DISK_DEVICE (например, nvme0n1)", disk_path,
        )

    with ThreadPoolExecutor(max_workers=1, thread_name_prefix="steamdeck-monitor") as executor:
        task = asyncio.create_task(monitor(executor, disk_path, disk_device))
        try:
            yield
        finally:
            task.cancel()
            with suppress(asyncio.CancelledError):
                await task


app = FastAPI(lifespan=lifespan)
app.include_router(auth_router)


@app.get("/api/health")
def health():
    return {"status": "ok", "source": "linux"}


@app.get("/api/metrics", dependencies=[Depends(require_user)])
def get_metrics():
    return {"metrics": UNITS}


@app.get("/api/metrics/current", dependencies=[Depends(require_user)])
def get_current():
    if latest is None:
        raise HTTPException(503, "Данные ещё не получены")

    return latest


@app.get("/api/metrics/history", dependencies=[Depends(require_user)])
def get_history(
    metric: str,
    limit: int | None = Query(default=None, ge=1),
    start: datetime | None = Query(default=None),
    end: datetime | None = Query(default=None),
):
    """
    Получение истории выбранной метрики.

    metric - код метрики.
    limit - максимальное количество последних записей.
    start - начало периода с указанием часового пояса.
    end - конец периода с указанием часового пояса.

    Если параметры фильтрации отсутствуют,
    возвращается вся накопленная история.
    """

    # Проверка существования метрики.
    if metric not in UNITS:
        raise HTTPException(400, "Неизвестная метрика")

    # Проверка часового пояса.
    if start is not None and start.utcoffset() is None:
        raise HTTPException(
            400, "Укажите часовой пояс для start"
        )

    if end is not None and end.utcoffset() is None:
        raise HTTPException(
            400, "Укажите часовой пояс для end"
        )

    # Проверка порядка дат.
    if start is not None and end is not None and start > end:
        raise HTTPException(
            400, "Начало периода позже окончания"
        )

    points = []

    # Отбор измерений за указанный период.
    for point in list(history):
        measured_at = datetime.fromisoformat(
            point["measured_at"]
        )

        if start is not None and measured_at < start:
            continue

        if end is not None and measured_at > end:
            continue

        points.append({
            "measured_at": point["measured_at"],
            "elapsed_s": point["elapsed_s"],
            "raw": point["raw"][metric],
            "processed": point["processed"][metric],
            "quality": point["quality"][metric],
        })

    # Ограничение количества результатов, если задан limit.
    if limit is not None:
        points = points[-limit:]

    return {
        "metric": metric,
        "unit": UNITS[metric],
        "points": points,
    }
