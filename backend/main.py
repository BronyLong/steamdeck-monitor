"""API демонстрационного мониторинга Steam Deck."""

import asyncio
import time
from collections import deque
from contextlib import asynccontextmanager, suppress
from datetime import datetime, timezone

from fastapi import FastAPI, HTTPException, Query

from collector import UNITS, collect_demo
from processing import validate_metrics, average_buffer


INTERVAL = 1.0
WINDOW = 5

# Последние пять отсчётов для вычисления SMA.
buffer = deque(maxlen=WINDOW)

# История последних 3600 отсчётов в оперативной памяти.
history = deque(maxlen=3600)

latest = None


async def monitor():
    """Периодически получает и обрабатывает демонстрационные данные."""
    global latest

    start = time.monotonic()
    next_tick = start
    sequence = 0

    while True:
        await asyncio.sleep(max(0, next_tick - time.monotonic()))

        elapsed = time.monotonic() - start
        timestamp = datetime.now(timezone.utc).isoformat(
            timespec="milliseconds"
        )

        # Получение демонстрационных показаний.
        metrics = collect_demo(elapsed)

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
            "source": "demo",
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
    task = asyncio.create_task(monitor())

    try:
        yield
    finally:
        task.cancel()
        with suppress(asyncio.CancelledError):
            await task


app = FastAPI(lifespan=lifespan)


@app.get("/api/health")
def health():
    return {"status": "ok", "source": "demo"}


@app.get("/api/metrics")
def get_metrics():
    return {"metrics": UNITS}


@app.get("/api/metrics/current")
def get_current():
    if latest is None:
        raise HTTPException(503, "Данные ещё не получены")

    return latest


@app.get("/api/metrics/history")
def get_history(
    metric: str,
    limit: int = Query(default=60, ge=1, le=3600),
):
    if metric not in UNITS:
        raise HTTPException(400, "Неизвестная метрика")

    points = list(history)[-limit:]

    return {
        "metric": metric,
        "unit": UNITS[metric],
        "points": [
            {
                "measured_at": point["measured_at"],
                "elapsed_s": point["elapsed_s"],
                "raw": point["raw"][metric],
                "processed": point["processed"][metric],
                "quality": point["quality"][metric],
            }
            for point in points
        ],
    }