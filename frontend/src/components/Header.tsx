import { useState } from "react";
import { NavLink, useOutletContext } from "react-router-dom";
import type { AuthOutletContext } from "../api/auth";

interface HeaderProps {
    brandAs: "h1" | "p";
}

function Header({ brandAs: Brand }: HeaderProps) {
    const { logout } = useOutletContext<AuthOutletContext>();
    const [pending, setPending] = useState(false);
    const [error, setError] = useState<string | null>(null);

    async function signOut() {
        if (pending) return;
        setPending(true);
        setError(null);
        try {
            await logout();
        } catch (error) {
            setError(
                error instanceof Error ? error.message : "Не удалось выйти.",
            );
        } finally {
            setPending(false);
        }
    }

    return (
        <header className="flex items-center flex-wrap gap-6 min-h-header px-6 py-0 bg-surface border-b-(length:--border-width) border-border narrow:gap-x-4 narrow:gap-y-2 narrow:px-4 narrow:pt-3 narrow:pb-0">
            <Brand className="text-medium font-semibold leading-interface">
                Steam Deck Monitor
            </Brand>
            <nav
                className="flex self-stretch narrow:order-1 narrow:w-full"
                aria-label="Основная навигация"
            >
                <ul className="flex flex-wrap gap-2 p-0 list-none">
                    <li className="flex">
                        <NavLink
                            className="flex items-center min-h-control px-3 py-2 text-text-secondary no-underline focus-visible:outline-(length:--border-width-strong) focus-visible:outline-solid focus-visible:outline-accent focus-visible:outline-offset-(--border-width-strong) hover:text-accent-hover border-b-(length:--border-width-strong) border-transparent aria-[current=page]:text-accent aria-[current=page]:border-accent aria-[current=page]:hover:text-accent-hover"
                            to="/current"
                        >
                            Текущие показатели
                        </NavLink>
                    </li>
                    <li className="flex">
                        <NavLink
                            className="flex items-center min-h-control px-3 py-2 text-text-secondary no-underline focus-visible:outline-(length:--border-width-strong) focus-visible:outline-solid focus-visible:outline-accent focus-visible:outline-offset-(--border-width-strong) hover:text-accent-hover border-b-(length:--border-width-strong) border-transparent aria-[current=page]:text-accent aria-[current=page]:border-accent aria-[current=page]:hover:text-accent-hover"
                            to="/history"
                        >
                            История
                        </NavLink>
                    </li>
                </ul>
            </nav>
            <button
                className="flex items-center min-h-control px-3 py-2 text-text-secondary no-underline focus-visible:outline-(length:--border-width-strong) focus-visible:outline-solid focus-visible:outline-accent focus-visible:outline-offset-(--border-width-strong) hover:not-disabled:text-accent-hover ml-auto border-(length:--border-width) border-border-control rounded-card cursor-pointer disabled:cursor-not-allowed disabled:opacity-(--opacity-disabled)"
                type="button"
                onClick={signOut}
                disabled={pending}
            >
                {pending ? "Выход…" : "Выйти"}
            </button>
            {error && (
                <p className="w-full text-text-secondary text-xs" role="alert">
                    {error}
                </p>
            )}
        </header>
    );
}

export default Header;
