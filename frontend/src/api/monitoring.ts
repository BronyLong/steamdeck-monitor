import { request } from "./client";
export { ApiError } from "./client";

export type MetricCode =
    | "cpu_percent"
    | "gpu_percent"
    | "memory_percent"
    | "disk_used_percent"
    | "disk_busy_percent"
    | "disk_read_mib_s"
    | "disk_write_mib_s"
    | "battery_percent"
    | "cpu_temperature_c"
    | "gpu_temperature_c"
    | "cpu_frequency_mhz"
    | "gpu_frequency_mhz"
    | "uptime_s";

export type RawMetrics = Record<MetricCode, number | null>;
export type ProcessedMetrics = Record<MetricCode, number | null>;
export type QualityStatus = "ok" | "missing" | "invalid";
export type MetricUnit = "%" | "degC" | "MHz" | "MiB/s" | "s";

export interface HealthResponse {
    status: "ok";
    source: "demo";
}

export interface MetricsResponse {
    metrics: Record<MetricCode, MetricUnit>;
}

export interface CurrentMeasurement {
    sequence: number;
    measured_at: string;
    elapsed_s: number;
    source: "demo";
    raw: RawMetrics;
    processed: ProcessedMetrics;
    quality: Record<MetricCode, QualityStatus>;
}

export interface HistoryPoint {
    measured_at: string;
    elapsed_s: number;
    raw: number | null;
    processed: number | null;
    quality: QualityStatus;
}

export interface HistoryResponse {
    metric: MetricCode;
    unit: MetricUnit;
    points: HistoryPoint[];
}

export interface HistoryQuery {
    limit?: number;
    start?: string;
    end?: string;
}

export function getHealth(signal?: AbortSignal) {
    return request<HealthResponse>("/api/health", signal);
}

export function getMetrics(signal?: AbortSignal) {
    return request<MetricsResponse>("/api/metrics", signal);
}

export function getCurrentMetrics(signal?: AbortSignal) {
    return request<CurrentMeasurement>("/api/metrics/current", signal);
}

export function getMetricHistory(
    metric: MetricCode,
    filters: HistoryQuery = { limit: 60 },
    signal?: AbortSignal,
) {
    const query = new URLSearchParams({ metric });
    if (filters.limit !== undefined) query.set("limit", String(filters.limit));
    if (filters.start) query.set("start", filters.start);
    if (filters.end) query.set("end", filters.end);
    return request<HistoryResponse>(`/api/metrics/history?${query}`, signal);
}
