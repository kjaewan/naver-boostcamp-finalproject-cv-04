import { useEffect, useRef, useState } from "react";

import {
  absUrl,
  createRenderJob,
  getRenderJob,
  RenderCreateRequest,
  RenderStatusResponse,
  searchMusic,
  TrackItem
} from "./api";
import AudioControlBar from "./components/AudioControlBar";
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
  const createRequestInFlightRef = useRef(false);
  const isRenderingLocked = actionLoading || job?.status === "queued" || job?.status === "processing";

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
    if (isRenderingLocked) return;

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
    } catch (err) {
      setError((err as Error).message);
    } finally {
      setSearchLoading(false);
    }
  };

  const requestRenderForTrack = async (track: TrackItem) => {
    if (createRequestInFlightRef.current) return;

    const payload: RenderCreateRequest = {
      track_id: track.track_id,
      album_id: track.album_id ?? null,
      title: track.title,
      artist: track.artist,
      album_art_url: track.album_art_url,
      youtube_video_id: track.youtube_video_id
    };

    try {
      createRequestInFlightRef.current = true;
      setActionLoading(true);
      setError(null);
      setJob(null);
      const created = await createRenderJob(payload);
      const current = await getRenderJob(created.job_id);
      setJob(current);
    } catch (err) {
      setError((err as Error).message);
    } finally {
      setActionLoading(false);
      createRequestInFlightRef.current = false;
    }
  };

  const handleSelectTrack = (track: TrackItem) => {
    if (isRenderingLocked || createRequestInFlightRef.current) {
      return;
    }

    const isSameTrack = selectedTrack?.track_id === track.track_id;
    const isCurrentJobTrack = job?.track.track_id === track.track_id;
    if (isSameTrack && isCurrentJobTrack && job?.status !== "failed") {
      return;
    }

    setSelectedTrack(track);
    void requestRenderForTrack(track);
  };

  let actionMessage = "트랙을 선택하면 자동으로 이미지 생성이 시작됩니다.";
  let statusTone: "idle" | "busy" | "ready" | "error" = "idle";
  if (job) {
    if (job.status === "processing" || job.status === "queued") {
      actionMessage = `생성중... ${job.progress}% (안정성을 위해 다른 조작이 잠겨 있습니다)`;
      statusTone = "busy";
    } else if (job.status === "completed") {
      actionMessage = "완료되었습니다. 다른 곡을 선택하면 새 작업을 시작합니다.";
      statusTone = "ready";
    } else if (job.status === "failed") {
      actionMessage = `실패: ${job.error.code ?? "UNKNOWN"}`;
      statusTone = "error";
    }
  }

  const live2dVideoUrl = job?.status === "completed" ? absUrl(job.result.video_url) : null;

  return (
    <main className="wire-shell">
      <section className="left-stack">
        <section className="wire-box album-service-header">
          <p className="album-service-title">Live2D Album Art</p>
        </section>

        <section className="wire-box album-box">
          <div className="album-frame">
            {live2dVideoUrl ? (
              <video autoPlay loop muted playsInline src={live2dVideoUrl} className="album-live2d-video" />
            ) : selectedTrack ? (
              <img src={selectedTrack.album_art_url} alt={`${selectedTrack.title} album art`} />
            ) : (
              <p className="wire-placeholder album-empty">선택한 노래 앨범아트</p>
            )}
          </div>
          <div className="album-meta">
            <p className="album-title">{selectedTrack?.title ?? "노래제목"}</p>
            <p className="album-artist">{selectedTrack?.artist ?? "아티스트"}</p>
          </div>
        </section>

        <section className={`wire-box status-alert ${statusTone}`}>
          <p className="status-alert-title">상태 알림</p>
          <p className="status-alert-message">{actionMessage}</p>
        </section>

        {error && <div className="global-error">{error}</div>}
      </section>

      <section className="right-stack">
        <SearchBox
          value={query}
          loading={searchLoading}
          disabled={isRenderingLocked}
          onChange={setQuery}
          onSubmit={handleSearchSubmit}
        />

        <TrackCandidates
          items={tracks}
          selectedTrackId={selectedTrack?.track_id ?? null}
          disabled={isRenderingLocked}
          onSelect={handleSelectTrack}
        />

        <section className="wire-box controls-box controls-inline-box">
          <AudioControlBar selectedTrack={selectedTrack} />
        </section>
      </section>
    </main>
  );
}
