"""Демонстрационный вход admin/admin и серверная сессия в памяти."""

import secrets
import threading
import time

from fastapi import APIRouter, Depends, HTTPException, Request, Response
from pydantic import BaseModel, Field


DEMO_USERNAME = "admin"
DEMO_PASSWORD = "admin"
COOKIE_NAME = "steamdeck_session"
SESSION_TTL = 8 * 60 * 60
sessions: dict[str, float] = {}
session_lock = threading.Lock()


class LoginCredentials(BaseModel):
    username: str = Field(min_length=1, max_length=64)
    password: str = Field(min_length=1, max_length=1024)


def require_user(request: Request) -> str:
    token = request.cookies.get(COOKIE_NAME)
    with session_lock:
        if token and sessions.get(token, 0) > time.monotonic():
            return DEMO_USERNAME
        if token:
            sessions.pop(token, None)
    raise HTTPException(401, "Войдите в приложение")


def require_browser_request(request: Request):
    # Заголовок блокирует отправку формы входа/выхода с постороннего сайта.
    if request.headers.get("X-Requested-With") != "SteamDeckMonitor":
        raise HTTPException(403, "Недопустимый запрос")


router = APIRouter(prefix="/api/auth")


@router.post("/login", dependencies=[Depends(require_browser_request)])
def login(credentials: LoginCredentials, request: Request, response: Response):
    if credentials.username != DEMO_USERNAME or credentials.password != DEMO_PASSWORD:
        raise HTTPException(401, "Неверное имя пользователя или пароль")

    token = secrets.token_urlsafe(32)
    now = time.monotonic()
    with session_lock:
        for expired in [key for key, expires_at in sessions.items() if expires_at <= now]:
            del sessions[expired]
        previous = request.cookies.get(COOKIE_NAME)
        if previous:
            sessions.pop(previous, None)
        sessions[token] = now + SESSION_TTL

    response.set_cookie(
        COOKIE_NAME, token, max_age=SESSION_TTL, httponly=True,
        secure=request.url.scheme == "https", samesite="strict", path="/",
    )
    response.headers["Cache-Control"] = "no-store"
    return {"username": DEMO_USERNAME}


@router.get("/session")
def session(response: Response, username: str = Depends(require_user)):
    response.headers["Cache-Control"] = "no-store"
    return {"username": username}


@router.post("/logout", status_code=204, dependencies=[Depends(require_browser_request)])
def logout(request: Request, response: Response):
    token = request.cookies.get(COOKIE_NAME)
    with session_lock:
        if token:
            sessions.pop(token, None)
    response.delete_cookie(
        COOKIE_NAME, path="/", httponly=True,
        secure=request.url.scheme == "https", samesite="strict",
    )
    response.headers["Cache-Control"] = "no-store"
