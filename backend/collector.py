"""Код для получения показателей с устройства."""

import math
import os
import struct
import time
from pathlib import Path

import psutil

"""
Словарь замеряемых метрик

Название показателя : единица измерения
"""
UNITS = {
    "cpu_percent": "%",
    "gpu_percent": "%",
    "memory_percent": "%",
    "disk_used_percent": "%",
    "disk_busy_percent": "%",
    "disk_read_mib_s": "MiB/s",
    "disk_write_mib_s": "MiB/s",
    "battery_percent": "%",
    "cpu_temperature_c": "degC",
    "gpu_temperature_c": "degC",
    "cpu_frequency_mhz": "MHz",
    "gpu_frequency_mhz": "MHz",
    "uptime_s": "s",
}


def read_text(path):
    """
    Функция для чтения из системного файла
    Параметры: path - путь к файлу
    Возвращаемые значения: текст файла без пробелов и переносов по краям /
        None, если файл недоступен или не удалось прочитать его как UTF-8
    """
    try:
        return Path(path).read_text(encoding="utf-8").strip()
    except (OSError, UnicodeError):
        return None


def read_safely(function, *arguments):
    """
    Функция для вызова датчика с обработкой ошибок получения данных
    Параметры:
        function - вызываемая функция
        arguments - позиционные аргументы вызываемой функции
    Возвращаемые значения: результат вызова функции /
        None при OSError, ValueError или NotImplementedError
    """
    try:
        return function(*arguments)
    # Ошибка вызывается, если нет доступа к датчику / неподходящем значении / нереализованной операции
    except (OSError, ValueError, NotImplementedError):
        return None


def get_temperature(temperatures, driver, labels):
    """
    Функция для выбора температуры по драйверу и приоритетным меткам датчиков
    Параметры:
        temperatures - словарь датчиков из psutil.sensors_temperatures
        driver - имя драйвера (k10temp или amdgpu)
        labels - список меток датчиков
    Возвращаемые значения: температура выбранного датчика в градусах Цельсия /
        значение первого датчика драйвера, если метки не найдены /
        None, если датчиков нет или выбранное значение отсутствует
    """

    # поиск значений по названию драйвера
    sensors = temperatures.get(driver, [])

    for label in labels:
        for sensor in sensors:
            if sensor.label == label:
                return sensor.current
    
    if sensors:
        return sensors[0].current

    return None


def get_gpu():
    """
    Функция для чтения загрузки и текущей частоты AMD GPU из файловой системы Linux
    Параметры: отсутствуют
    Возвращаемые значения: кортеж (загрузка в процентах, частота в МГц);
        недоступные значения в кортеже обозначаются None
    """

    load = None
    frequency = None

    # поиск показателей через файловую систему 
    for path in sorted(Path("/sys/class/drm").glob("card*/device/gpu_busy_percent")):
        try:
            load = float(read_text(path))
        except (TypeError, ValueError):
            continue

        # прочитать содержимое файла о частотах GPU
        states = read_text(path.parent / "pp_dpm_sclk") or ""

        # поиск текущей рабочей частоты
        for line in states.splitlines():
            if "*" in line:
                try:
                    frequency = float(line.split()[1].lower().replace("mhz", ""))
                except (ValueError, IndexError):
                    pass
        break
    return load, frequency


def get_cpu_temperature_from_gpu_metrics(drm_path="/sys/class/drm"):
    """
    Функция для чтения температуры CPU Steam Deck из gpu_metrics
    Параметры: drm_path - каталог DRM; по умолчанию /sys/class/drm
    Возвращаемые значения: максимум температур доступных ядер CPU в градусах
        Цельсия из первой подходящей таблицы / None, если данных нет
    """
    for path in sorted(Path(drm_path).glob("card*/device/gpu_metrics")):
        try:
            data = path.read_bytes()
        except OSError:
            continue

        if len(data) < 4:
            continue

        size, version, revision = struct.unpack_from("<HBB", data)

        # Смещения ниже рассчитаны на gpu_metrics.
        # Другие версии и неполные таблицы по этой схеме не разбираются.
        if (version, revision) != (2, 4) or size < 168 or len(data) < size:
            continue

        # Заголовок занимает 4 байта, температуры GPU/SoC — ещё 4.
        # С байта 8 читаем 8 беззнаковых 16-битных температур в little-endian.
        # Значения представлены в сотых долях °C.
        core_values = struct.unpack_from("<8H", data, 8)
        temperatures = []

        for value in core_values:
            if value not in (0, 65535):  # Нулевые и 0xffff поля не дают температуру.
                temperatures.append(value / 100)

        if temperatures:
            return max(temperatures)

    return None


def get_disk_device(disk_path):
    """
    Функция для определения накопителя по пути в файловой системе
    Параметры: disk_path - путь к файлу или каталогу на выбранном накопителе
    Возвращаемые значения: имя устройства, например nvme0n1; для раздела
        выбирается весь накопитель / None, если устройство не удалось определить
    """
    try:
        number = Path(disk_path).stat().st_dev
        # st_dev задаёт устройство файловой системы парой major:minor;
        # ссылка в sysfs ведёт к каталогу устройства или его раздела.
        path = Path(f"/sys/dev/block/{os.major(number)}:{os.minor(number)}")
        device = path.resolve(strict=True)

        # Например, nvme0n1p8 — раздел, а nvme0n1 — весь накопитель.
        if (device / "partition").exists():
            device = device.parent
        return device.name
    except OSError:
        return None


def get_disk_activity(device, state):
    """
    Функция для расчёта активности и скоростей I/O по разности счётчиков
    Параметры:
        device - имя устройства, например nvme0n1, или None
        state - словарь предыдущих счётчиков и времени; изменяется при вызове
    Возвращаемые значения: словарь с активностью в процентах и скоростями чтения
        и записи в MiB/s; недоступные значения обозначаются None, в том числе
        при первом опросе, смене устройства или сбросе счётчиков байтов
    """
    result = dict.fromkeys([
        "disk_busy_percent", "disk_read_mib_s", "disk_write_mib_s",
    ])

    # Получаем отдельные счётчики каждого устройства без суммирования.
    # nowrap=False позволяет заметить сброс счётчиков.
    counters = read_safely(psutil.disk_io_counters, True, False) or {}
    current = counters.get(device)
    now = time.monotonic()

    if current is None:
        # После исчезновения устройства следующий опрос станет начальным:
        # старые счётчики для сравнения уже не используем.
        state.clear()
        return result

    previous = state.copy()
    # Текущий замер станет базой следующего вызова, даже если сейчас
    # разность нельзя рассчитать из-за смены устройства или сброса счётчиков.
    state.update(device=device, time=now, counters=current)

    # Для первого замера и после смены устройства нужна новая база сравнения.
    if not previous or previous["device"] != device:
        return result

    seconds = now - previous["time"]
    if seconds <= 0:
        return result

    old = previous["counters"]
    read_bytes = current.read_bytes - old.read_bytes
    write_bytes = current.write_bytes - old.write_bytes

    # При уменьшении счётчиков байтов пропускаем этот расчёт;
    # новые базовые значения уже сохранены в state.
    if read_bytes < 0 or write_bytes < 0:
        return result

    result["disk_read_mib_s"] = read_bytes / seconds / (1024**2)
    result["disk_write_mib_s"] = write_bytes / seconds / (1024**2)

    busy = getattr(current, "busy_time", None)
    old_busy = getattr(old, "busy_time", None)

    # Отсутствие или сброс busy_time оставляет пропуск только в активности;
    # рассчитанные выше скорости чтения и записи сохраняются.
    if busy is not None and old_busy is not None and busy >= old_busy:
        # busy_time — миллисекунды активности.
        result["disk_busy_percent"] = min(
            100.0,
            (busy - old_busy) / (seconds * 1000) * 100,
        )

    return result


def collect_metrics(disk_path, disk_state=None, disk_device=None):
    """
    Функция для сбора реальных аппаратных показателей Linux
    Параметры:
        disk_path - путь для оценки занятого места и выбора накопителя
        disk_state - словарь предыдущих счётчиков I/O, обновляемый при вызове;
            None означает создание нового состояния
        disk_device - имя устройства I/O; None означает автоопределение
    Возвращаемые значения: словарь всех метрик, где ключ - код показателя,
        значение - число в единицах UNITS / None, если показатель недоступен
    """
    cpu = read_safely(psutil.cpu_percent, None)
    memory = read_safely(psutil.virtual_memory)
    disk = read_safely(psutil.disk_usage, disk_path)
    battery = read_safely(psutil.sensors_battery)
    frequency = read_safely(psutil.cpu_freq)
    boot_time = read_safely(psutil.boot_time)
    temperatures = read_safely(psutil.sensors_temperatures) or {}

    # Сначала читаем температуру CPU через k10temp.
    # Если она недоступна, берём максимум температур ядер CPU из gpu_metrics.
    cpu_temperature = get_temperature(temperatures, "k10temp", ["Tctl", "Tdie"])
    if cpu_temperature is None:
        cpu_temperature = get_cpu_temperature_from_gpu_metrics()

    gpu_load, gpu_frequency = get_gpu()

    if disk_state is None:
        disk_state = {}
        
    device = disk_device or get_disk_device(disk_path)
    activity = get_disk_activity(device, disk_state)

    return {
        "cpu_percent": cpu,
        "gpu_percent": gpu_load,
        "memory_percent": memory.percent if memory else None,
        "disk_used_percent": disk.percent if disk else None,
        **activity,
        "battery_percent": battery.percent if battery else None,
        "cpu_temperature_c": cpu_temperature,
        "gpu_temperature_c": get_temperature(temperatures, "amdgpu", ["edge"]),
        "cpu_frequency_mhz": frequency.current if frequency else None,
        "gpu_frequency_mhz": gpu_frequency,
        "uptime_s": time.time() - boot_time if boot_time is not None else None,
    }


def collect_demo(elapsed: float) -> dict[str, float]:
    """
    Функция для получения показателей математической модели Steam Deck
    Параметры: elapsed - время от начала моделирования в секундах
    Возвращаемые значения: словарь всех модельных метрик в единицах UNITS;
        значения вычислены по формулам и не являются аппаратными измерениями
    """
    wave = math.sin(2 * math.pi * 0.1 * elapsed)
    noise = math.sin(2 * math.pi * 0.4 * elapsed)
    return {
        "cpu_percent": 50 + 25 * wave + 8 * noise,
        "gpu_percent": 55 + 20 * wave + 6 * noise,
        "memory_percent": 45 + 3 * wave,
        "disk_used_percent": 60,
        "disk_busy_percent": 35 + 20 * wave,
        "disk_read_mib_s": 15 + 10 * wave,
        "disk_write_mib_s": 8 + 5 * wave,
        "battery_percent": max(0, 80 - elapsed * 0.01),
        "cpu_temperature_c": 60 + 7 * wave + noise,
        "gpu_temperature_c": 58 + 6 * wave + noise,
        "cpu_frequency_mhz": 2400 + 300 * wave,
        "gpu_frequency_mhz": 1000 + 200 * wave,
        "uptime_s": 3600 + elapsed,
    }
