import { ApiError, request } from "./client";

export interface User {
    username: string;
}

export interface Credentials {
    username: string;
    password: string;
}

const headers = {
    "Content-Type": "application/json",
    "X-Requested-With": "SteamDeckMonitor",
};

export function login(credentials: Credentials, signal?: AbortSignal) {
    return request<User>("/api/auth/login", signal, {
        method: "POST",
        headers,
        body: JSON.stringify(credentials),
    });
}

export async function getSession(signal?: AbortSignal): Promise<User | null> {
    try {
        return await request<User>("/api/auth/session", signal);
    } catch (error) {
        if (error instanceof ApiError && error.status === 401) return null;
        throw error;
    }
}

export function logout() {
    return request<void>("/api/auth/logout", undefined, {
        method: "POST",
        headers,
    });
}

export interface AuthOutletContext {
    logout: () => Promise<void>;
}
