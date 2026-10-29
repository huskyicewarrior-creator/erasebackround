#!/bin/sh
# Start the image service once, in the background, for the current user.
# Used by the optional @reboot crontab entry and safe to run more than once.
set -eu
cd "$(dirname "$0")"

if [ -f pi.env ]; then
    set -a
    . ./pi.env
    set +a
fi

export U2NET_HOME="${U2NET_HOME:-$PWD/models}"
export WORK_DIR="${WORK_DIR:-$PWD/work}"
export ALLOWED_ORIGINS="${ALLOWED_ORIGINS:-http://localhost:5173,http://127.0.0.1:5173}"
mkdir -p "$WORK_DIR"

if [ -f server.pid ]; then
    pid=$(cat server.pid)
    if kill -0 "$pid" 2>/dev/null && tr '\0' ' ' < "/proc/$pid/cmdline" 2>/dev/null | grep -q 'uvicorn'; then
        echo "Service already running with PID $pid."
        exit 0
    fi
fi

nohup .venv/bin/python -m uvicorn app:app --host 127.0.0.1 --port 8000 --workers 1 --no-access-log </dev/null >> server.log 2>&1 &
echo $! > server.pid
echo "Started service with PID $(cat server.pid)."
