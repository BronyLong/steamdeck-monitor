import type { ComponentProps } from "react";

export function InputControl({
    className = "",
    ...props
}: ComponentProps<"input">) {
    return (
        <input
            {...props}
            className={`block w-full min-w-0 max-w-full min-h-control px-3 py-2 bg-surface border-(length:--border-width) border-border-control rounded-card disabled:opacity-(--opacity-disabled) disabled:cursor-not-allowed placeholder:text-text-secondary placeholder:opacity-100 focus-visible:outline-(length:--border-width-strong) focus-visible:outline-solid focus-visible:outline-accent focus-visible:outline-offset-(--border-width-strong) ${className}`}
        />
    );
}

export function SelectControl({
    className = "",
    ...props
}: ComponentProps<"select">) {
    return (
        <div className="min-w-0 pr-3 bg-surface border-(length:--border-width) border-border-control rounded-card focus-within:outline-(length:--border-width-strong) focus-within:outline-solid focus-within:outline-accent focus-within:outline-offset-(--border-width-strong)">
            <select
                {...props}
                className={`block w-full min-w-0 max-w-full min-h-control-inner px-3 py-2 border-0 rounded-none bg-transparent focus-visible:outline-none ${className}`}
            />
        </div>
    );
}
