import type { MetricCode } from "../api/monitoring";

export interface Metric {
    code: MetricCode;
    name: string;
    unit: string;
}

interface MetricSection {
    title: string;
    gridClassName?: string;
    metrics: Metric[];
}

export const metricSections: MetricSection[] = [
    {
        title: "Показатели ЦПУ",
        metrics: [
            { code: "cpu_percent", name: "Загрузка ЦПУ", unit: "%" },
            { code: "cpu_temperature_c", name: "Температура ЦПУ", unit: "°C" },
            { code: "cpu_frequency_mhz", name: "Частота ЦПУ", unit: "MHz" },
        ],
    },
    {
        title: "Показатели ГПУ",
        metrics: [
            { code: "gpu_percent", name: "Загрузка ГПУ", unit: "%" },
            { code: "gpu_temperature_c", name: "Температура ГПУ", unit: "°C" },
            { code: "gpu_frequency_mhz", name: "Частота ГПУ", unit: "MHz" },
        ],
    },
    {
        title: "Показатели накопителя",
        gridClassName: "grid-cols-4",
        metrics: [
            {
                code: "disk_busy_percent",
                name: "Активность накопителя",
                unit: "%",
            },
            { code: "disk_read_mib_s", name: "Скорость чтения", unit: "MiB/s" },
            {
                code: "disk_write_mib_s",
                name: "Скорость записи",
                unit: "MiB/s",
            },
            {
                code: "disk_used_percent",
                name: "Занятое место на накопителе",
                unit: "%",
            },
        ],
    },
    {
        title: "Остальные показатели",
        metrics: [
            { code: "memory_percent", name: "Использование ОЗУ", unit: "%" },
            { code: "battery_percent", name: "Заряд батареи", unit: "%" },
            {
                code: "uptime_s",
                name: "Время работы системы",
                unit: "ч, мин, с",
            },
        ],
    },
];

export const metrics = metricSections.flatMap((section) => section.metrics);

// Список SMOOTH_METRICS из backend/processing.py.
export const smoothMetrics: readonly MetricCode[] = [
    "cpu_percent",
    "gpu_percent",
    "cpu_temperature_c",
    "gpu_temperature_c",
];

export function formatValue(value: number | null): string {
    return value === null
        ? "Нет данных"
        : value.toLocaleString("ru-RU", { maximumFractionDigits: 1 });
}

export function formatUptime(value: number | null): string {
    if (value === null) return "Нет данных";
    const seconds = Math.floor(value);
    return `${Math.floor(seconds / 3600)} ч ${Math.floor((seconds % 3600) / 60)} мин ${seconds % 60} с`;
}
