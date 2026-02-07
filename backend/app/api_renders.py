from __future__ import annotations

from fastapi import APIRouter, Depends, HTTPException, status

from .schemas import RenderCreateRequest, RenderCreateResponse, RenderStatusResponse
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


@router.get("/{job_id}", response_model=RenderStatusResponse)
async def get_render_job(job_id: str, queue_service: RenderQueueService = Depends(get_queue_service)) -> RenderStatusResponse:
    status_result = await queue_service.get_job(job_id)
    if not status_result:
        raise HTTPException(status_code=404, detail="job not found")
    return status_result
