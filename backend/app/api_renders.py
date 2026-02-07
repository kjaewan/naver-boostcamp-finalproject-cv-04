from __future__ import annotations

from fastapi import APIRouter, Depends, HTTPException, Query, status

from .schemas import (
    RenderCreateRequest,
    RenderCreateResponse,
    RenderHistoryClearResponse,
    RenderHistoryItem,
    RenderHistoryResponse,
    RenderStatusResponse,
)
from .services_queue import RenderQueueService


router = APIRouter(prefix="/renders", tags=["renders"])


def get_queue_service() -> RenderQueueService:
    from .main import app_state

    return app_state.queue_service


@router.post("", response_model=RenderCreateResponse, status_code=status.HTTP_202_ACCEPTED)
async def create_render_job(
    req: RenderCreateRequest,
    queue_service: RenderQueueService = Depends(get_queue_service),
) -> RenderCreateResponse:
    return await queue_service.create_job(req)


@router.get("/history", response_model=RenderHistoryResponse)
async def get_render_history(
    limit: int = Query(default=6, ge=1, le=50),
    include_failed: bool = Query(default=False),
    queue_service: RenderQueueService = Depends(get_queue_service),
) -> RenderHistoryResponse:
    records = await queue_service.list_history(limit=limit, include_failed=include_failed)
    return RenderHistoryResponse(
        items=[
            RenderHistoryItem(
                job_id=record.job_id,
                status=record.status,  # type: ignore[arg-type]
                track={
                    **record.track,
                    "album_art_url": record.track.get("album_art_url")
                    or (f"/static/inputs/{record.image_filename}" if record.image_filename else None),
                },
                result=record.result,
                created_at=record.created_at,
                updated_at=record.updated_at,
            )
            for record in records
        ]
    )


@router.delete("/history", response_model=RenderHistoryClearResponse)
async def clear_render_history(
    include_failed: bool = Query(default=False),
    queue_service: RenderQueueService = Depends(get_queue_service),
) -> RenderHistoryClearResponse:
    deleted_count = await queue_service.clear_history(include_failed=include_failed)
    return RenderHistoryClearResponse(deleted_count=deleted_count)


@router.get("/{job_id}", response_model=RenderStatusResponse)
async def get_render_job(job_id: str, queue_service: RenderQueueService = Depends(get_queue_service)) -> RenderStatusResponse:
    status_result = await queue_service.get_job(job_id)
    if not status_result:
        raise HTTPException(status_code=404, detail="job not found")
    return status_result
