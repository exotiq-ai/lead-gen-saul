# Saul agent — one-shot container for Railway / Fly cron invocations.
#
# Build:  docker build -t saul-agent ./python-agent
# Run:    docker run --env-file .env saul-agent
#
# Railway runs this image on its configured cron schedule (recommended
# */15 * * * *). The container starts, runs one pipeline cycle for every
# tenant, writes agent_runs + agent_insights rows, and exits.

FROM python:3.12-slim

# Skip .pyc generation and unbuffered stdout for log-friendly output.
ENV PYTHONDONTWRITEBYTECODE=1 \
    PYTHONUNBUFFERED=1

WORKDIR /app

# Install dependencies first to maximize Docker layer cache hits.
COPY requirements.txt .
RUN pip install --no-cache-dir -r requirements.txt

COPY . .

# Default: run one cycle for all tenants and exit. Pass --loop to run
# the legacy in-process schedule (only useful for local debugging).
CMD ["python", "main.py", "--once"]
