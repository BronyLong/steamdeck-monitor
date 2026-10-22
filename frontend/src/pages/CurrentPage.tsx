import { useEffect, useState } from "react";
import Header from "../components/Header";
import MetricCard from "../components/MetricCard";
import { metricSections } from "../data/metrics";
import { getCurrentMetrics } from "../api/monitoring";
import type { CurrentMeasurement } from "../api/monitoring";

function CurrentPage() {
    const [samples, setSamples] = useState<CurrentMeasurement[]>([]);
    const [loading, setLoading] = useState(true);
    const [error, setError] = useState<string | null>(null);

    useEffect(() => {
        const controller = new AbortController();
        let timer: ReturnType<typeof setTimeout>;

        async function update() {
            const started = Date.now();
            try {
                const measurement = await getCurrentMetrics(controller.signal);
                if (controller.signal.aborted) return;
                setSamples((previous) => {
                    const last = previous.at(-1);
                    if (last?.measured_at === measurement.measured_at)
                        return previous;
                    // После перезапуска backend начинаем новую серию.
                    const samples =
                        last && measurement.sequence <= last.sequence
                            ? []
                            : previous;
                    return [...samples, measurement].slice(-60);
                });
                setError(null);
            } catch (error) {
                if (controller.signal.aborted) return;
                setError(
                    error instanceof Error
                        ? error.message
                        : "Не удалось получить данные.",
                );
            } finally {
                if (!controller.signal.aborted) {
                    setLoading(false);
                    // Следующий запрос начинается только после завершения предыдущего.
                    timer = setTimeout(
                        update,
                        Math.max(0, 1000 - (Date.now() - started)),
                    );
                }
            }
        }

        void update();
        return () => {
            controller.abort();
            clearTimeout(timer);
        };
    }, []);

    const current = samples.at(-1);
    return (
        <>
            <title>Текущие показатели</title>
            <Header brandAs="h1" />
            <main className="w-full max-w-content mx-auto p-6 narrow:p-4">
                {loading && (
                    <p
                        className="mb-6 text-text-secondary text-base"
                        role="status"
                    >
                        Загрузка показателей…
                    </p>
                )}
                {error && (
                    <p
                        className="mb-6 text-text-secondary text-base"
                        role="alert"
                    >
                        Нет соединения с сервером. {error} Повторное подключение
                        выполняется автоматически.
                        {current && (
                            <>
                                {" "}
                                Показаны последние данные от{" "}
                                {new Date(
                                    current.measured_at,
                                ).toLocaleTimeString("ru-RU")}
                                .
                            </>
                        )}
                    </p>
                )}
                <div className="grid gap-6">
                    {metricSections.map((section) => (
                        <section key={section.title}>
                            <div className="mb-3">
                                <h2 className="text-medium font-bold">
                                    {section.title}
                                </h2>
                            </div>
                            <div
                                className={`grid gap-4 tablet:grid-cols-2 compact:grid-cols-1 ${section.gridClassName ?? "grid-cols-3"}`}
                            >
                                {section.metrics.map((metric) => (
                                    <MetricCard
                                        key={metric.code}
                                        {...metric}
                                        value={
                                            current?.processed[metric.code] ??
                                            null
                                        }
                                        quality={current?.quality[metric.code]}
                                        samples={samples}
                                    />
                                ))}
                            </div>
                        </section>
                    ))}
                </div>
            </main>
        </>
    );
}

export default CurrentPage;
