export const SESSION_EXPIRED_EVENT = "monitor:session-expired";

export class ApiError extends Error {
    readonly status?: number;

    constructor(message: string, status?: number) {
        super(message);
        this.name = "ApiError";
        this.status = status;
    }
}

export async function request<T>(
    path: string,
    signal?: AbortSignal,
    options: RequestInit = {},
): Promise<T> {
    const timeout = AbortSignal.timeout(5000);
    try {
        const response = await fetch(path, {
            ...options,
            signal: signal ? AbortSignal.any([signal, timeout]) : timeout,
            credentials: "same-origin",
            cache: "no-store",
        });
        if (signal?.aborted) throw signal.reason;
        if (!response.ok) {
            if (response.status === 401 && path !== "/api/auth/login") {
                window.dispatchEvent(new Event(SESSION_EXPIRED_EVENT));
            }
            const body: unknown = await response.json().catch(() => null);
            const message =
                body !== null &&
                typeof body === "object" &&
                "detail" in body &&
                typeof body.detail === "string"
                    ? body.detail
                    : `Ошибка сервера (HTTP ${response.status}).`;
            throw new ApiError(message, response.status);
        }
        if (response.status === 204) return undefined as T;
        return (await response.json()) as T;
    } catch (error) {
        if (signal?.aborted) throw error;
        if (error instanceof ApiError) throw error;
        if (timeout.aborted)
            throw new ApiError("Сервер не ответил за 5 секунд.");
        throw new ApiError(
            "Не удалось получить данные. Проверьте соединение с сервером.",
        );
    }
}
