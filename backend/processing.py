"""Проверка значений и простое скользящее среднее SMA."""

import math

# Параметры для сглаживания. Остальные параметры не меняются.
SMOOTH_METRICS = [
    "cpu_percent",
    "gpu_percent",
    "cpu_temperature_c",
    "gpu_temperature_c",
]


def is_valid(name, value):
    """
    Функция для проверки типа, конечности и диапазона значения метрики
    Параметры:
        name - код метрики, определяющий допустимый диапазон
        value - проверяемое значение
    Возвращаемые значения: True, если значение допустимо / False в ином случае
    """
    if isinstance(value, bool) or not isinstance(value, (int, float)):
        return False

    if not math.isfinite(value):
        return False

    if name.endswith("_percent"):
        return 0 <= value <= 100

    if name.endswith("_temperature_c"):
        return -40 <= value <= 150

    return value >= 0


def validate_metrics(metrics):
    """
    Функция для проверки метрик и назначения статусов качества
    Параметры: metrics - словарь исходных значений по кодам метрик
    Возвращаемые значения: кортеж (clean, quality), где clean - словарь чисел
        или None, а quality - словарь статусов ok, missing или invalid;
        неверные и отсутствующие значения заменяются на None
    """
    clean = {}
    quality = {}

    for name, value in metrics.items():
        if value is None:
            clean[name], quality[name] = None, "missing"

        elif is_valid(name, value):
            clean[name], quality[name] = float(value), "ok"

        else:
            clean[name], quality[name] = None, "invalid"

    return clean, quality


def average_buffer(buffer):
    """
    Функция для вычисления скользящего среднего метрик из SMOOTH_METRICS
    Параметры: buffer - непустой буфер проверенных отсчётов от старого к новому
    Возвращаемые значения: словарь обработанных метрик последнего отсчёта;
        выбранные метрики усредняются по доступным значениям окна, остальные
        сохраняются без изменения; пропуск текущего значения остаётся None
    """
    latest = buffer[-1]
    processed = latest.copy()

    for name in SMOOTH_METRICS:
        # Если текущего значения нет, не выдаём старое среднее за свежий замер.
        if latest[name] is None:
            continue

        values = []

        # Пропуски внутри окна не считаем нулями: делим на число доступных
        # значений. Их хотя бы одно — текущее значение проверено выше.
        for measurement in buffer:
            if measurement[name] is not None:
                values.append(measurement[name])
        processed[name] = sum(values) / len(values)
        
    return processed
