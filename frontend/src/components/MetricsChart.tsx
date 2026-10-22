import { useEffect, useRef, useState } from "react";
import type { HistoryPoint } from "../api/monitoring";
import { formatUptime, formatValue } from "../data/metrics";

interface MetricsChartProps {
    points: HistoryPoint[];
    raw?: boolean;
    processed?: boolean;
    unit: string;
    label: string;
    compact?: boolean;
    uptime?: boolean;
}

const timeLabel = (timestamp: string) =>
    new Date(timestamp).toLocaleTimeString("ru-RU");

function MetricsChart({
    points,
    raw = false,
    processed = true,
    unit,
    label,
    compact = false,
    uptime = false,
}: MetricsChartProps) {
    const container = useRef<HTMLDivElement>(null);
    const [width, setWidth] = useState(960);
    const [active, setActive] = useState<number | null>(null);

    useEffect(() => {
        if (!container.current) return;
        const observer = new ResizeObserver(([entry]) =>
            setWidth(Math.max(1, entry.contentRect.width)),
        );
        observer.observe(container.current);
        return () => observer.disconnect();
    }, []);

    const height = compact ? 28 : 320;
    const left = compact ? 4 : 64;
    const right = compact ? 4 : 16;
    const top = compact ? 4 : 28;
    const bottom = compact ? 4 : 36;
    const plotWidth = Math.max(1, width - left - right);
    const plotHeight = height - top - bottom;
    const timestamps = points.map((point) => Date.parse(point.measured_at));
    const firstTime = timestamps[0] ?? 0;
    const lastTime = timestamps.at(-1) ?? firstTime;
    const values = points.flatMap((point) => [
        ...(raw && point.raw !== null ? [point.raw] : []),
        ...(processed && point.processed !== null ? [point.processed] : []),
    ]);
    // Диапазон дат может содержать больше отсчётов, чем допускает spread-вызов.
    const min = values.reduce(
        (minimum, value) => Math.min(minimum, value),
        values[0] ?? 0,
    );
    const max = values.reduce(
        (maximum, value) => Math.max(maximum, value),
        values[0] ?? 1,
    );
    // Расширяем только шкалу, сами измерения не меняем.
    const padding = (max - min) * 0.1 || Math.max(Math.abs(max) * 0.05, 1);
    const low = min - padding;
    const high = max + padding;
    const x = (time: number) =>
        left +
        (lastTime === firstTime
            ? plotWidth / 2
            : ((time - firstTime) / (lastTime - firstTime)) * plotWidth);
    const y = (value: number) =>
        top + ((high - value) / (high - low)) * plotHeight;

    function line(key: "raw" | "processed") {
        let drawing = false;
        return points
            .map((point, index) => {
                const value = point[key];
                if (value === null) {
                    drawing = false;
                    return "";
                }
                const command = drawing ? "L" : "M";
                drawing = true;
                // Короткий отрезок делает видимым и одиночный отсчёт.
                return `${command}${x(timestamps[index])},${y(value)}l0.01,0`;
            })
            .join(" ");
    }

    const selectedIndex =
        active === null ? null : Math.min(active, points.length - 1);
    const selected = selectedIndex === null ? undefined : points[selectedIndex];
    const ticks = width < 420 ? [0, 1] : [0, 0.5, 1];
    const showDates =
        new Date(firstTime).toDateString() !==
        new Date(lastTime).toDateString();
    const displayValue = (value: number | null) =>
        uptime
            ? formatUptime(value)
            : `${formatValue(value)}${value === null ? "" : ` ${unit}`}`;

    return (
        <div
            className={`relative w-full min-w-0 ${compact ? "h-chart-mini" : "h-chart"}`}
            ref={container}
        >
            <svg
                className="block w-full h-full overflow-visible focus-visible:outline-(length:--border-width-strong) focus-visible:outline-solid focus-visible:outline-accent focus-visible:outline-offset-(--border-width-strong)"
                viewBox={`0 0 ${width} ${height}`}
                role="img"
                aria-label={label}
                tabIndex={compact ? undefined : 0}
                onPointerMove={
                    compact
                        ? undefined
                        : (event) => {
                              const bounds =
                                  event.currentTarget.getBoundingClientRect();
                              const position =
                                  ((event.clientX - bounds.left) /
                                      bounds.width) *
                                  width;
                              const time =
                                  firstTime +
                                  ((position - left) / plotWidth) *
                                      (lastTime - firstTime);
                              let nearest = 0;
                              timestamps.forEach((timestamp, index) => {
                                  if (
                                      Math.abs(timestamp - time) <
                                      Math.abs(timestamps[nearest] - time)
                                  )
                                      nearest = index;
                              });
                              setActive(nearest);
                          }
                }
                onPointerLeave={() => setActive(null)}
                onFocus={
                    compact ? undefined : () => setActive(points.length - 1)
                }
                onBlur={() => setActive(null)}
                onKeyDown={
                    compact
                        ? undefined
                        : (event) => {
                              if (
                                  event.key !== "ArrowLeft" &&
                                  event.key !== "ArrowRight"
                              )
                                  return;
                              event.preventDefault();
                              setActive((previous) =>
                                  Math.max(
                                      0,
                                      Math.min(
                                          points.length - 1,
                                          (previous ?? points.length - 1) +
                                              (event.key === "ArrowLeft"
                                                  ? -1
                                                  : 1),
                                      ),
                                  ),
                              );
                          }
                }
            >
                {!compact && (
                    <>
                        <text
                            className="fill-text-secondary font-mono text-xs"
                            x={left}
                            y={16}
                        >
                            {uptime ? "с" : unit}
                        </text>
                        {[0, 0.25, 0.5, 0.75, 1].map((ratio) => (
                            <g key={ratio}>
                                <line
                                    className="stroke-border [stroke-width:var(--border-width)]"
                                    x1={left}
                                    x2={width - right}
                                    y1={top + ratio * plotHeight}
                                    y2={top + ratio * plotHeight}
                                />
                                <text
                                    className="fill-text-secondary font-mono text-xs"
                                    x={left - 8}
                                    y={top + ratio * plotHeight}
                                    textAnchor="end"
                                    dominantBaseline="middle"
                                >
                                    {formatValue(high - ratio * (high - low))}
                                </text>
                            </g>
                        ))}
                        {ticks.map((ratio) => (
                            <text
                                className="fill-text-secondary font-mono text-xs"
                                key={ratio}
                                x={left + ratio * plotWidth}
                                y={height - (showDates ? 24 : 12)}
                                textAnchor={
                                    ratio === 0
                                        ? "start"
                                        : ratio === 1
                                          ? "end"
                                          : "middle"
                                }
                            >
                                <tspan>
                                    {timeLabel(
                                        new Date(
                                            firstTime +
                                                ratio * (lastTime - firstTime),
                                        ).toISOString(),
                                    )}
                                </tspan>
                                {showDates && (
                                    <tspan x={left + ratio * plotWidth} dy={16}>
                                        {new Date(
                                            firstTime +
                                                ratio * (lastTime - firstTime),
                                        ).toLocaleDateString("ru-RU", {
                                            day: "2-digit",
                                            month: "2-digit",
                                        })}
                                    </tspan>
                                )}
                            </text>
                        ))}
                    </>
                )}
                {raw && (
                    <path
                        className="fill-none stroke-signal-raw [stroke-width:var(--chart-line-width)] [stroke-linecap:round] [stroke-linejoin:round]"
                        data-signal="raw"
                        d={line("raw")}
                    />
                )}
                {processed && (
                    <path
                        className={`fill-none [stroke-width:var(--chart-line-width)] [stroke-linecap:round] [stroke-linejoin:round] stroke-signal-processed ${compact ? "[stroke-dasharray:none]" : "[stroke-dasharray:var(--chart-dash)]"}`}
                        data-signal="processed"
                        d={line("processed")}
                    />
                )}
                {!compact && selected && selectedIndex !== null && (
                    <line
                        className="stroke-border-control [stroke-width:var(--border-width)]"
                        x1={x(timestamps[selectedIndex])}
                        x2={x(timestamps[selectedIndex])}
                        y1={top}
                        y2={height - bottom}
                    />
                )}
            </svg>
            {!compact && selected && (
                <div
                    className="absolute top-2 right-2 max-w-tooltip-bound px-3 py-2 bg-surface border-(length:--border-width) border-border rounded-card text-text-primary font-mono text-xs pointer-events-none"
                    role="status"
                >
                    <p>
                        {new Date(selected.measured_at).toLocaleString("ru-RU")}
                    </p>
                    {raw && <p>RAW: {displayValue(selected.raw)}</p>}
                    {processed && (
                        <p>SMA: {displayValue(selected.processed)}</p>
                    )}
                </div>
            )}
        </div>
    );
}

export default MetricsChart;
