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

export function absUrl(path: string | null): string | null {
  if (!path) return null;
  if (path.startsWith("http://") || path.startsWith("https://")) return path;
  return `${API_BASE}${path}`;
}
