FROM python:3.12-slim
WORKDIR /app
RUN pip install --no-cache-dir uv -i https://mirrors.aliyun.com/pypi/simple/
COPY pyproject.toml uv.lock ./
ENV UV_HTTP_TIMEOUT=300
ENV UV_INDEX_URL=https://mirrors.aliyun.com/pypi/simple/
RUN --mount=type=cache,target=/root/.cache/uv uv sync --no-dev --frozen
COPY app ./app
EXPOSE 8000
CMD ["uv", "run", "uvicorn", "app.main:app", "--host", "0.0.0.0", "--port", "8000"]
