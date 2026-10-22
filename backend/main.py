
"""API демонстрационного мониторинга Steam Deck."""

import asyncio
import time
from collections import deque
from contextlib import asynccontextmanager, suppress
from datetime import datetime, timezone

from fastapi import Depends, FastAPI, HTTPException, Query

from auth import require_user, router as auth_router
from collector import UNITS, collect_demo
from processing import validate_metrics, average_buffer


INTERVAL = 1.0
WINDOW = 5

# Последние пять отсчётов для вычисления SMA.
buffer = deque(maxlen=WINDOW)

# Полная история измерений в оперативной памяти.
history = deque()

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
app.include_router(auth_router)


@app.get("/api/health")
def health():
    return {"status": "ok", "source": "demo"}


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
