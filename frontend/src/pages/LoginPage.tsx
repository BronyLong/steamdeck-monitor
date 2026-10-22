import { useEffect, useRef, useState } from "react";
import type { FormEvent } from "react";
import type { Credentials } from "../api/auth";
import { InputControl } from "../components/FormControls";

interface LoginPageProps {
    onLogin: (credentials: Credentials, signal: AbortSignal) => Promise<void>;
    sessionError: string | null;
}

function LoginPage({ onLogin, sessionError }: LoginPageProps) {
    const [pending, setPending] = useState(false);
    const [error, setError] = useState<string | null>(null);
    const activeRequest = useRef<AbortController | null>(null);
    useEffect(() => () => activeRequest.current?.abort(), []);

    async function submit(event: FormEvent<HTMLFormElement>) {
        event.preventDefault();
        if (activeRequest.current) return;
        const form = event.currentTarget;
        const fields = new FormData(form);
        const controller = new AbortController();
        activeRequest.current = controller;
        setPending(true);
        setError(null);
        try {
            await onLogin(
                {
                    username: String(fields.get("username") ?? "").trim(),
                    password: String(fields.get("password") ?? ""),
                },
                controller.signal,
            );
            form.reset();
        } catch (error) {
            if (!controller.signal.aborted) {
                setError(
                    error instanceof Error
                        ? error.message
                        : "Не удалось войти.",
                );
            }
        } finally {
            activeRequest.current = null;
            if (!controller.signal.aborted) setPending(false);
        }
    }

    return (
        <div className="flex items-center justify-center min-h-page px-4 py-6">
            <title>Вход</title>
            <main className="w-full max-w-panel p-6 bg-surface border-(length:--border-width) border-border rounded-card">
                <div>
                    <p className="mb-4 text-text-secondary">
                        Steam Deck Monitor
                    </p>
                    <h1 className="mb-6 text-title font-bold">Вход</h1>
                    <form
                        className="grid gap-2"
                        method="post"
                        onSubmit={submit}
                        aria-busy={pending}
                    >
                        <label
                            className="text-base text-text-secondary"
                            htmlFor="username"
                        >
                            Имя пользователя
                        </label>
                        <InputControl
                            className="mb-4"
                            type="text"
                            placeholder="Введите имя пользователя"
                            id="username"
                            name="username"
                            required
                            maxLength={64}
                            disabled={pending}
                            autoComplete="username"
                        />

                        <label
                            className="text-base text-text-secondary"
                            htmlFor="userpassword"
                        >
                            Пароль
                        </label>
                        <InputControl
                            className="mb-4"
                            type="password"
                            placeholder="Пароль"
                            id="userpassword"
                            name="password"
                            required
                            maxLength={1024}
                            disabled={pending}
                            autoComplete="current-password"
                        />

                        {(error || sessionError) && (
                            <p
                                className="text-text-secondary text-base"
                                role="alert"
                            >
                                {error ?? sessionError}
                            </p>
                        )}
                        <button
                            className="max-w-full min-h-control px-4 py-2 border-0 rounded-card bg-accent text-surface font-semibold cursor-pointer hover:not-disabled:bg-accent-hover disabled:opacity-(--opacity-disabled) disabled:cursor-not-allowed focus-visible:outline-(length:--border-width-strong) focus-visible:outline-solid focus-visible:outline-accent focus-visible:outline-offset-(--border-width-strong) w-full"
                            type="submit"
                            disabled={pending}
                        >
                            {pending ? "Вход…" : "Войти"}
                        </button>
                    </form>
                </div>
            </main>
        </div>
    );
}

export default LoginPage;
