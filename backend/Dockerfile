FROM python:3.14-slim-bookworm@sha256:3fe1a0b6c2d6b2ebb572906cdabeca75aeb558c0c17db5ffefbcf8094871c32b AS dependencies
WORKDIR /app
ENV UV_LINK_MODE=copy UV_PYTHON_DOWNLOADS=never
RUN pip install --no-cache-dir uv==0.13.9
COPY pyproject.toml uv.lock ./
RUN uv sync --frozen --no-dev

FROM dependencies AS test
RUN uv sync --frozen
COPY . .
ENV PATH="/app/.venv/bin:$PATH" PYTHONDONTWRITEBYTECODE=1 PYTHONUNBUFFERED=1
CMD ["pytest", "-q"]

FROM python:3.14-slim-bookworm@sha256:3fe1a0b6c2d6b2ebb572906cdabeca75aeb558c0c17db5ffefbcf8094871c32b AS runtime
WORKDIR /app
ENV PATH="/app/.venv/bin:$PATH" PYTHONDONTWRITEBYTECODE=1 PYTHONUNBUFFERED=1
RUN groupadd --gid 10001 notebook && useradd --uid 10001 --gid notebook --no-create-home notebook
COPY --from=dependencies /app/.venv /app/.venv
COPY app ./app
COPY notebook_engine ./notebook_engine
COPY alembic ./alembic
COPY alembic.ini ./
RUN install -d -o notebook -g notebook /app/data
USER notebook
EXPOSE 8000
CMD ["uvicorn", "app.main:app", "--host", "0.0.0.0", "--port", "8000", "--no-proxy-headers"]
