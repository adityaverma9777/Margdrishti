FROM python:3.10-slim
WORKDIR /app
RUN apt-get update && apt-get install -y --no-install-recommends \
    libgl1 \
    libglib2.0-0 \
    libpq-dev \
    gcc \
    && rm -rf /var/lib/apt/lists/*
COPY requirements.txt .
RUN pip install --no-cache-dir --upgrade pip && \
    pip install --no-cache-dir torch torchvision --index-url https://download.pytorch.org/whl/cpu && \
    pip install --no-cache-dir -r requirements.txt
COPY . .
RUN mkdir -p /app/weights /app/yolo_config && chmod -R 777 /app/weights /app/yolo_config
ENV PORT=7860
EXPOSE 7860
CMD ["uvicorn", "src.server:app", "--host", "0.0.0.0", "--port", "7860"]
