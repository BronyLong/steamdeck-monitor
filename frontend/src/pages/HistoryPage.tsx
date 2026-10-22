import { useEffect, useState } from "react";
import Header from "../components/Header";
import { InputControl, SelectControl } from "../components/FormControls";
import MetricsChart from "../components/MetricsChart";
import { metrics, smoothMetrics } from "../data/metrics";
import { getMetricHistory } from "../api/monitoring";
import type { HistoryResponse, MetricCode } from "../api/monitoring";

function HistoryPage() {
    const [metric, setMetric] = useState<MetricCode>("cpu_percent");
    const [interval, setInterval] = useState("1");
    const [start, setStart] = useState("");
    const [end, setEnd] = useState("");
    const [raw, setRaw] = useState(true);
    const [sma, setSma] = useState(true);
    const [result, setResult] = useState<{
        history: HistoryResponse;
        key: string;
    } | null>(null);
    const [problem, setProblem] = useState<{
        key: string;
        message: string;
    } | null>(null);
    const custom = interval === "custom";
    const limit = custom ? undefined : Number(interval) * 60;
    const startTime = custom && start ? new Date(start).getTime() : null;
    const endTime = custom && end ? new Date(end).getTime() : null;
    let dateError: string | null = null;
    if (custom) {
        if (!start && !end) {
            dateError = "Укажите начало или окончание периода.";
        } else if (
            (startTime !== null && !Number.isFinite(startTime)) ||
            (endTime !== null && !Number.isFinite(endTime))
        ) {
            dateError = "Укажите корректные дату и время.";
        } else if (
            startTime !== null &&
            endTime !== null &&
            startTime > endTime
        ) {
            dateError = "Начало периода не должно быть позже окончания.";
        }
    }
    const startIso =
        startTime !== null && Number.isFinite(startTime)
            ? new Date(startTime).toISOString()
            : undefined;
    const endIso =
        endTime !== null && Number.isFinite(endTime)
            ? new Date(endTime).toISOString()
            : undefined;
    const queryKey = JSON.stringify([metric, limit, startIso, endIso]);
    const smoothed = smoothMetrics.includes(metric);
    const selected = metrics.find((item) => item.code === metric)!;
    const history =
        !dateError && result?.key === queryKey ? result.history : null;
    const error =
        !dateError && problem?.key === queryKey ? problem.message : null;
    const loading = !history && !error;
    const showSma = sma && smoothed;

    useEffect(() => {
        if (dateError) return;
        const controller = new AbortController();
        let timer: ReturnType<typeof setTimeout>;

        async function update() {
            try {
                const history = await getMetricHistory(
                    metric,
                    { limit, start: startIso, end: endIso },
                    controller.signal,
                );
                if (controller.signal.aborted) return;
                setResult({ history, key: queryKey });
                setProblem(null);
            } catch (error) {
                if (controller.signal.aborted) return;
                setProblem({
                    key: queryKey,
                    message:
                        error instanceof Error
                            ? error.message
                            : "Не удалось загрузить историю.",
                });
            } finally {
                if (!controller.signal.aborted) {
                    timer = setTimeout(update, 5000);
                }
            }
        }

        void update();
        return () => {
            controller.abort();
            clearTimeout(timer);
        };
    }, [metric, limit, startIso, endIso, dateError, queryKey]);

    const hasValues = history?.points.some(
        (point) =>
            (raw && point.raw !== null) ||
            (showSma && point.processed !== null),
    );

    return (
        <>
            <title>История измерений</title>
            <Header brandAs="p" />
            <main className="w-full max-w-content mx-auto p-6 narrow:p-4">
                <h1 className="mb-6 text-title font-bold">История измерений</h1>
                <form
                    className="grid grid-cols-history gap-6 p-6 bg-surface border-(length:--border-width) border-border rounded-card narrow:grid-cols-1 narrow:p-4"
                    onSubmit={(event) => event.preventDefault()}
                >
                    <fieldset className="grid min-w-0 content-start gap-2 p-0 border-0">
                        <legend className="mb-3 p-0 font-semibold">
                            Показатель
                        </legend>
                        <label
                            className="text-base text-text-secondary"
                            htmlFor="metric"
                        >
                            Метрика
                        </label>
                        <SelectControl
                            id="metric"
                            name="metric"
                            value={metric}
                            onChange={(event) =>
                                setMetric(event.target.value as MetricCode)
                            }
                        >
                            {metrics.map((item) => (
                                <option key={item.code} value={item.code}>
                                    {item.name} ({item.unit})
                                </option>
                            ))}
                        </SelectControl>
                    </fieldset>
                    <fieldset className="grid min-w-0 content-start gap-2 p-0 border-0">
                        <legend className="mb-3 p-0 font-semibold">
                            Период времени
                        </legend>
                        <label
                            className="text-base text-text-secondary"
                            htmlFor="interval"
                        >
                            Интервал
                        </label>
                        <SelectControl
                            id="interval"
                            name="interval"
                            aria-describedby="period-help"
                            value={interval}
                            onChange={(event) =>
                                setInterval(event.target.value)
                            }
                        >
                            <option value="1">1 минута</option>
                            <option value="5">5 минут</option>
                            <option value="30">30 минут</option>
                            <option value="60">60 минут</option>
                            <option value="custom">
                                Произвольный диапазон
                            </option>
                        </SelectControl>
                        <p
                            className="mb-2 text-text-secondary text-xs"
                            id="period-help"
                        >
                            Для произвольного диапазона укажите начало и/или
                            окончание. Даты и время — в часовом поясе
                            устройства.
                        </p>
                        {custom && (
                            <div className="grid grid-cols-2 gap-4 narrow:grid-cols-1">
                                <div className="grid gap-2">
                                    <label
                                        className="text-base text-text-secondary"
                                        htmlFor="start"
                                    >
                                        Дата и время начала
                                    </label>
                                    <InputControl
                                        className="font-mono text-base"
                                        id="start"
                                        name="start"
                                        type="datetime-local"
                                        step="1"
                                        value={start}
                                        aria-invalid={!!dateError && !!start}
                                        aria-describedby="period-help date-help"
                                        onChange={(event) =>
                                            setStart(event.target.value)
                                        }
                                    />
                                </div>
                                <div className="grid gap-2">
                                    <label
                                        className="text-base text-text-secondary"
                                        htmlFor="end"
                                    >
                                        Дата и время окончания
                                    </label>
                                    <InputControl
                                        className="font-mono text-base"
                                        id="end"
                                        name="end"
                                        type="datetime-local"
                                        step="1"
                                        value={end}
                                        aria-invalid={!!dateError && !!end}
                                        aria-describedby="period-help date-help"
                                        onChange={(event) =>
                                            setEnd(event.target.value)
                                        }
                                    />
                                </div>
                            </div>
                        )}
                        {custom && (
                            <p
                                className="mb-2 text-text-secondary text-xs"
                                id="date-help"
                                role="status"
                            >
                                {dateError ??
                                    "Можно оставить одну из границ пустой."}
                            </p>
                        )}
                    </fieldset>
                    <fieldset className="min-w-0 content-start gap-2 p-0 border-0 col-span-full flex flex-wrap gap-x-6 gap-y-2">
                        <legend className="mb-3 p-0 font-semibold">
                            Отображение данных
                        </legend>
                        <label
                            className="flex items-center gap-2 min-h-control text-base cursor-pointer has-disabled:opacity-(--opacity-disabled) has-disabled:cursor-not-allowed"
                            htmlFor="raw"
                        >
                            <input
                                className="size-4 max-w-full m-0 shrink-0 accent-signal-raw focus-visible:outline-(length:--border-width-strong) focus-visible:outline-solid focus-visible:outline-accent focus-visible:outline-offset-(--border-width-strong)"
                                id="raw"
                                name="raw"
                                type="checkbox"
                                value="1"
                                checked={raw}
                                onChange={(event) =>
                                    setRaw(event.target.checked)
                                }
                            />
                            RAW — исходные данные
                        </label>
                        <label
                            className="flex items-center gap-2 min-h-control text-base cursor-pointer has-disabled:opacity-(--opacity-disabled) has-disabled:cursor-not-allowed"
                            htmlFor="sma"
                        >
                            <input
                                className="size-4 max-w-full m-0 shrink-0 accent-signal-processed focus-visible:outline-(length:--border-width-strong) focus-visible:outline-solid focus-visible:outline-accent focus-visible:outline-offset-(--border-width-strong)"
                                id="sma"
                                name="sma"
                                type="checkbox"
                                value="1"
                                checked={showSma}
                                disabled={!smoothed}
                                onChange={(event) =>
                                    setSma(event.target.checked)
                                }
                            />
                            SMA — простое скользящее среднее
                        </label>
                    </fieldset>
                </form>
                <figure
                    className="mt-4 p-6 bg-surface border-(length:--border-width) border-border rounded-card narrow:p-4"
                    aria-labelledby="history-caption"
                >
                    <div
                        className="flex gap-4 mb-4"
                        aria-label="Обозначения сигналов"
                    >
                        {raw && (
                            <span className="flex items-center gap-2 font-mono text-xs before:content-[''] before:w-6 before:border-t-(length:--border-width-strong) before:border-signal-raw">
                                RAW
                            </span>
                        )}
                        {showSma && (
                            <span className="flex items-center gap-2 font-mono text-xs before:content-[''] before:w-6 before:border-t-(length:--border-width-strong) before:border-dashed before:border-signal-processed">
                                SMA
                            </span>
                        )}
                    </div>
                    {error && (
                        <p className="mb-4 text-text-secondary" role="alert">
                            Не удалось обновить историю. {error} Повторное
                            подключение выполняется автоматически.
                            {history && " Показаны ранее полученные данные."}
                        </p>
                    )}
                    <div className="flex items-center justify-center min-h-panel p-6 bg-background border-(length:--border-width) border-border">
                        {dateError ? (
                            <p className="text-text-secondary text-center">
                                {dateError}
                            </p>
                        ) : loading && !history ? (
                            <p
                                className="text-text-secondary text-center"
                                role="status"
                            >
                                Загрузка истории…
                            </p>
                        ) : !raw && !showSma ? (
                            <p className="text-text-secondary text-center">
                                Выберите сигнал для отображения.
                            </p>
                        ) : hasValues && history ? (
                            <MetricsChart
                                points={history.points}
                                raw={raw}
                                processed={showSma}
                                unit={selected.unit}
                                label={`История: ${selected.name}. Стрелки влево и вправо выбирают отсчёт.`}
                                uptime={metric === "uptime_s"}
                            />
                        ) : (
                            <p className="text-text-secondary text-center">
                                {error
                                    ? "История недоступна из-за ошибки соединения."
                                    : custom
                                      ? "За выбранный период нет данных для отображения."
                                      : "Нет данных для отображения"}
                            </p>
                        )}
                    </div>
                    <figcaption
                        className="mt-4 text-text-secondary text-base"
                        id="history-caption"
                    >
                        {selected.name}.{" "}
                        {custom ? (
                            <>
                                Период:{" "}
                                {startIso
                                    ? new Date(startIso).toLocaleString("ru-RU")
                                    : "с начала наблюдения"}{" "}
                                —{" "}
                                {endIso
                                    ? new Date(endIso).toLocaleString("ru-RU")
                                    : "до текущего момента"}
                                .
                            </>
                        ) : (
                            <>Последние {limit} отсчётов.</>
                        )}{" "}
                        Получено {history?.points.length ?? 0}. Обновление
                        каждые 5 секунд.
                    </figcaption>
                </figure>
            </main>
        </>
    );
}

export default HistoryPage;
