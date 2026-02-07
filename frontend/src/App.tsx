import { useEffect, useState } from "react";

import {
  createRenderJob,
  getRenderJob,
  RenderCreateRequest,
  RenderStatusResponse,
  searchMusic,
  TrackItem
} from "./api";
import PlayerPanel from "./components/PlayerPanel";
import RenderResult from "./components/RenderResult";
import SearchBox from "./components/SearchBox";
import TrackCandidates from "./components/TrackCandidates";

export default function App() {
  const [query, setQuery] = useState("");
  const [tracks, setTracks] = useState<TrackItem[]>([]);
  const [selectedTrack, setSelectedTrack] = useState<TrackItem | null>(null);
  const [job, setJob] = useState<RenderStatusResponse | null>(null);
  const [searchLoading, setSearchLoading] = useState(false);
  const [actionLoading, setActionLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);

  useEffect(() => {
    if (!job) return;
    if (job.status === "completed" || job.status === "failed") return;

    const interval = window.setInterval(async () => {
      try {
        const next = await getRenderJob(job.job_id);
        setJob(next);
      } catch (err) {
        setError((err as Error).message);
      }
    }, 3000);

    return () => window.clearInterval(interval);
  }, [job]);

  const handleSearchSubmit = async () => {
    const term = query.trim();
    if (!term) {
      setTracks([]);
      return;
    }

    try {
      setSearchLoading(true);
      setError(null);
      const data = await searchMusic(term, 3);
      setTracks(data.items);
      if (data.items.length > 0) {
        setSelectedTrack(data.items[0]);
      }
    } catch (err) {
      setError((err as Error).message);
    } finally {
      setSearchLoading(false);
    }
  };

  const handleCreateRender = async () => {
    if (!selectedTrack) {
      setError("Select a track first.");
      return;
    }

    const payload: RenderCreateRequest = {
      track_id: selectedTrack.track_id,
      album_id: selectedTrack.album_id ?? null,
      title: selectedTrack.title,
      artist: selectedTrack.artist,
      album_art_url: selectedTrack.album_art_url,
      youtube_video_id: selectedTrack.youtube_video_id
    };

    try {
      setActionLoading(true);
      setError(null);
      const created = await createRenderJob(payload);
      const current = await getRenderJob(created.job_id);
      setJob(current);
    } catch (err) {
      setError((err as Error).message);
    } finally {
      setActionLoading(false);
    }
  };

  let actionMessage = "트랙 선택 후 Generate를 누르세요.";
  if (job) {
    if (job.status === "processing" || job.status === "queued") {
      actionMessage = `생성중... ${job.progress}%`;
    } else if (job.status === "completed") {
      actionMessage = "완료되었습니다.";
    } else if (job.status === "failed") {
      actionMessage = `실패: ${job.error.code ?? "UNKNOWN"}`;
    }
  }

  return (
    <main className="app-shell">
      <header className="hero">
        <p className="eyebrow">MVP</p>
        <h1>Music Search + Live2D Render</h1>
        <p className="subtitle">Play music instantly while your album art becomes a looped Live2D video.</p>
      </header>

      <SearchBox value={query} loading={searchLoading} onChange={setQuery} onSubmit={handleSearchSubmit} />

      <section className="grid-two main-grid">
        <TrackCandidates
          items={tracks}
          selectedTrackId={selectedTrack?.track_id ?? null}
          onSelect={setSelectedTrack}
        />
        <RenderResult job={job} />
      </section>

      <section className="panel action-panel">
        <button className="primary-btn" onClick={handleCreateRender} disabled={!selectedTrack || actionLoading}>
          {actionLoading ? "Submitting..." : "Generate Live2D Render"}
        </button>
        <span className="job-hint">{actionMessage}</span>
        {job?.status === "completed" && <span className="cache-badge">Ready</span>}
      </section>

      {error && <div className="global-error">{error}</div>}

      <PlayerPanel embedUrl={selectedTrack?.youtube_embed_url ?? null} />
    </main>
  );
}
