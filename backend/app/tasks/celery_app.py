"""Celery 实例. broker/backend 都用 Redis."""

from celery import Celery

from app.config import settings

celery = Celery(
    "tuneset",
    broker=settings.celery_broker_url,
    backend=settings.celery_result_backend,
)

celery.conf.update(
    task_track_started=True,
    task_time_limit=600,  # 单任务 10 分钟超时
    task_serializer="json",
    result_serializer="json",
)
