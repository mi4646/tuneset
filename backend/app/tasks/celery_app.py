"""Celery 实例. broker/backend 都用 Redis."""

from datetime import timedelta

from celery import Celery

from app.config import settings

celery = Celery(
    "tuneset",
    broker=settings.celery_broker_url,
    backend=settings.celery_result_backend,
    include=["app.tasks.classify_task", "app.tasks.fav_cache"],
)

celery.conf.update(
    task_track_started=True,
    task_time_limit=600,  # 单任务 10 分钟超时
    task_serializer="json",
    result_serializer="json",
    beat_schedule={
        "refresh-fav-cache": {
            "task": "refresh_fav_cache",
            "schedule": timedelta(seconds=settings.fav_push_interval),
        },
    },
)
