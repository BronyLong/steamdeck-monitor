# Steam Deck Monitor

Приложение для отображения аппаратных показателей Steam Deck.

## Возможности

- Просмотр 13 показателей CPU, GPU, накопителя, памяти и батареи.
- Автоматическое обновление текущих показателей.
- Компактные графики последних полученных отсчетов.
- История изменений выбранной метрики.
- Показания исходных и сглаженных данных.

## Технологии

**Backend:** Python, FastAPI, Uvicorn, Pydantic, psutil.

**Frontend:** React, TypeScript, Vite, Tailwind CSS.

## Метрики

| Показатель | Код | Единица |
| --- | --- | --- |
| Загрузка CPU | `cpu_percent` | % |
| Температура CPU | `cpu_temperature_c` | °C |
| Частота CPU | `cpu_frequency_mhz` | MHz |
| Загрузка GPU | `gpu_percent` | % |
| Температура GPU | `gpu_temperature_c` | °C |
| Частота GPU | `gpu_frequency_mhz` | MHz |
| Использование ОЗУ | `memory_percent` | % |
| Занятое место на накопителе | `disk_used_percent` | % |
| Активность накопителя | `disk_busy_percent` | % |
| Скорость чтения | `disk_read_mib_s` | MiB/s |
| Скорость записи | `disk_write_mib_s` | MiB/s |
| Заряд батареи | `battery_percent` | % |
| Время работы системы | `uptime_s` | с |

## Локальный запуск

### Backend

Из корня проекта:

```bash
cd backend
python3 -m venv .venv
source .venv/bin/activate
python -m pip install -r requirements.txt
python -m uvicorn main:app --reload --port 8000
```

### Frontend

В отдельном терминале, из корня проекта:

```bash
cd frontend
npm ci
npm run dev
```

Затем нужно открыть адрес, указанный Vite в терминале, обычно http://localhost:5173.

## Запуск на SteamDeck

```bash
bash -c 'source "$HOME/.nvm/nvm.sh" && nvm use 22 && { backend/.venv/bin/python -m uvicorn main:app --app-dir backend --host localhost --port 8000 & pid=$!; trap "kill $pid 2>/dev/null" EXIT; cd frontend && npm run dev -- --host 0.0.0.0 --port 5173 --strictPort; }'
```