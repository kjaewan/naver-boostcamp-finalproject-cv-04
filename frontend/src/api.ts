export interface TrackItem {
  track_id: string;
  album_id?: string | null;
  title: string;
  artist: string;
  album_art_url: string;
  youtube_video_id: string | null;
  youtube_embed_url: string | null;
  score: number;
}

export interface MusicSearchResponse {
  items: TrackItem[];
}

export interface RenderCreateRequest {
  track_id: string;
  album_id?: string | null;
  title: string;
  artist: string;
  album_art_url: string;
  youtube_video_id: string | null;
}

export interface RenderCreateResponse {
  job_id: string;
  status: "queued" | "processing" | "completed" | "failed";
  cache_hit: boolean;
  poll_url: string;
}

export interface RenderStatusResponse {
  job_id: string;
  status: "queued" | "processing" | "completed" | "failed";
  phase: "queued" | "preparing" | "prompting" | "sampling" | "assembling" | "postprocessing" | "done" | "error";
  progress: number;
  queue_position: number;
  estimated_wait_sec: number;
  track: {
    track_id: string;
    title: string;
    artist: string;
    album_id?: string | null;
    album_art_url?: string | null;
    youtube_video_id?: string | null;
    youtube_embed_url?: string | null;
  };
  result: {
    video_url: string | null;
    thumbnail_url: string | null;
    cache_key: string | null;
  };
  error: {
    code: string | null;
    message: string | null;
  };
}

export interface RenderHistoryItem {
  job_id: string;
  status: "queued" | "processing" | "completed" | "failed";
  track: {
    track_id: string;
    title: string;
    artist: string;
    album_id?: string | null;
    album_art_url?: string | null;
    youtube_video_id?: string | null;
    youtube_embed_url?: string | null;
  };
  result: {
    video_url: string | null;
    thumbnail_url: string | null;
    cache_key: string | null;
  };
  created_at: string;
  updated_at: string;
}

export interface RenderHistoryResponse {
  items: RenderHistoryItem[];
}

export interface RenderHistoryClearResponse {
  deleted_count: number;
}

const API_BASE = import.meta.env.VITE_API_BASE_URL || "http://127.0.0.1:8000";

async function apiGet<T>(path: string): Promise<T> {
  const response = await fetch(`${API_BASE}${path}`);
  if (!response.ok) {
    throw new Error(`GET ${path} failed with ${response.status}`);
  }
  return (await response.json()) as T;
}

async function apiPost<T, U>(path: string, body: T): Promise<U> {
  const response = await fetch(`${API_BASE}${path}`, {
    method: "POST",
    headers: {
      "Content-Type": "application/json"
    },
    body: JSON.stringify(body)
  });
  if (!response.ok) {
    throw new Error(`POST ${path} failed with ${response.status}`);
  }
  return (await response.json()) as U;
}

async function apiDelete<T>(path: string): Promise<T> {
  const response = await fetch(`${API_BASE}${path}`, {
    method: "DELETE"
  });
  if (!response.ok) {
    throw new Error(`DELETE ${path} failed with ${response.status}`);
  }
  return (await response.json()) as T;
}

export function searchMusic(query: string, limit = 3): Promise<MusicSearchResponse> {
  const params = new URLSearchParams({ q: query, limit: String(limit) });
  return apiGet<MusicSearchResponse>(`/api/v1/music/search?${params.toString()}`);
}

export function createRenderJob(payload: RenderCreateRequest): Promise<RenderCreateResponse> {
  return apiPost<RenderCreateRequest, RenderCreateResponse>("/api/v1/renders", payload);
}

export function getRenderJob(jobId: string): Promise<RenderStatusResponse> {
  return apiGet<RenderStatusResponse>(`/api/v1/renders/${jobId}`);
}

export function getRenderHistory(limit = 6, includeFailed = false): Promise<RenderHistoryResponse> {
  const params = new URLSearchParams({
    limit: String(limit),
    include_failed: String(includeFailed)
  });
  return apiGet<RenderHistoryResponse>(`/api/v1/renders/history?${params.toString()}`);
}

export function clearRenderHistory(includeFailed = false): Promise<RenderHistoryClearResponse> {
  const params = new URLSearchParams({
    include_failed: String(includeFailed)
  });
  return apiDelete<RenderHistoryClearResponse>(`/api/v1/renders/history?${params.toString()}`);
}

export function absUrl(path: string | null): string | null {
  if (!path) return null;
  if (path.startsWith("http://") || path.startsWith("https://")) return path;
  return `${API_BASE}${path}`;
}
