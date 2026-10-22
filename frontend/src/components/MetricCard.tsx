import type { Metric } from "../data/metrics";
import { formatUptime, formatValue, smoothMetrics } from "../data/metrics";
import type {
    CurrentMeasurement,
    HistoryPoint,
    QualityStatus,
} from "../api/monitoring";
import MetricsChart from "./MetricsChart";

interface MetricCardProps {
    code: Metric["code"];
    name: string;
    value: number | null;
    unit: string;
    samples: CurrentMeasurement[];
    quality?: QualityStatus;
}

function MetricCard({
    code,
    name,
    value,
    unit,
    samples,
    quality,
}: MetricCardProps) {
    const uptime = code === "uptime_s";
    const smoothed = smoothMetrics.includes(code);
    const points: HistoryPoint[] = samples.map((sample) => ({
        measured_at: sample.measured_at,
        elapsed_s: sample.elapsed_s,
        raw: sample.raw[code],
        processed: sample.processed[code],
        quality: sample.quality[code],
    }));
    const hasPoints = points.some((point) => point.processed !== null);
    return (
        <article
            className="flex flex-col min-w-0 p-4 bg-surface border-(length:--border-width) border-border rounded-card"
            data-metric={code}
        >
            <header className="mb-4">
                <h3 className="mb-2 text-text-secondary text-base font-medium">
                    {name}
                </h3>
                {!uptime && (
                    <p
                        className="font-mono text-value font-medium tabular-nums"
                        title={
                            quality === "invalid"
                                ? "Некорректное измерение"
                                : quality === "missing"
                                  ? "Измерение отсутствует"
                                  : undefined
                        }
                    >
                        {formatValue(value)}{" "}
                        {value !== null && (
                            <span className="text-medium text-text-secondary whitespace-nowrap">
                                {unit}
                            </span>
                        )}
                    </p>
                )}
            </header>
            {uptime ? (
                <p className="font-mono font-medium tabular-nums my-auto mx-0 text-title">
                    {value === null ? (
                        "Нет данных"
                    ) : (
                        <time dateTime={`PT${Math.floor(value)}S`}>
                            {formatUptime(value)}
                        </time>
                    )}
                </p>
            ) : (
                <>
                    <div
                        className="h-(--border-width-strong) mb-3 bg-border"
                        aria-hidden="true"
                    />
                    <figure className="flex items-center min-h-control mt-auto p-2 bg-background">
                        {hasPoints && (
                            <MetricsChart
                                points={points}
                                raw={!smoothed}
                                processed={smoothed}
                                unit={unit}
                                label={`${name}: последние ${points.length} отсчётов`}
                                compact
                            />
                        )}
                        <figcaption
                            className={`text-text-secondary text-xs${hasPoints ? " absolute size-(--border-width) overflow-hidden [clip-path:inset(50%)]" : ""}`}
                        >
                            {hasPoints
                                ? `${name}: последние ${points.length} отсчётов`
                                : "Нет данных для графика"}
                        </figcaption>
                    </figure>
                </>
            )}
        </article>
    );
}

export default MetricCard;
