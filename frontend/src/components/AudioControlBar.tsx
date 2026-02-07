import { ChangeEvent, useCallback, useEffect, useMemo, useRef, useState } from "react";

import { TrackItem } from "../api";

interface AudioControlBarProps {
  selectedTrack: TrackItem | null;
}

type ControlIconName = "shuffle" | "prev" | "play" | "pause" | "next" | "screen" | "list" | "volume" | "mute";

interface YTPlayer {
  destroy: () => void;
  getCurrentTime: () => number;
  getDuration: () => number;
  getVolume: () => number;
  isMuted: () => boolean;
  loadVideoById: (videoId: string) => void;
  mute: () => void;
  pauseVideo: () => void;
  playVideo: () => void;
  seekTo: (seconds: number, allowSeekAhead: boolean) => void;
  setVolume: (volume: number) => void;
  stopVideo: () => void;
  unMute: () => void;
}

interface YTPlayerEvent {
  data: number;
  target: YTPlayer;
}

interface YTPlayerOptions {
  width?: string;
  height?: string;
  videoId?: string;
  playerVars?: Record<string, number>;
  events?: {
    onReady?: (event: YTPlayerEvent) => void;
    onStateChange?: (event: YTPlayerEvent) => void;
  };
}

interface YTNamespace {
  Player: new (element: HTMLElement, options: YTPlayerOptions) => YTPlayer;
  PlayerState: {
    ENDED: number;
    PLAYING: number;
    PAUSED: number;
  };
}

let youtubeIframeApiPromise: Promise<YTNamespace> | null = null;

function loadYoutubeIframeApi(): Promise<YTNamespace> {
  const win = window as Window & {
    YT?: YTNamespace;
    onYouTubeIframeAPIReady?: () => void;
  };

  if (win.YT?.Player) {
    return Promise.resolve(win.YT);
  }

  if (youtubeIframeApiPromise) {
    return youtubeIframeApiPromise;
  }

  youtubeIframeApiPromise = new Promise<YTNamespace>((resolve, reject) => {
    const existingScript = document.getElementById("youtube-iframe-api");

    win.onYouTubeIframeAPIReady = () => {
      if (win.YT?.Player) {
        resolve(win.YT);
      } else {
        reject(new Error("YouTube Iframe API loaded without YT.Player"));
      }
    };

    if (existingScript) {
      return;
    }

    const script = document.createElement("script");
    script.id = "youtube-iframe-api";
    script.src = "https://www.youtube.com/iframe_api";
    script.async = true;
    script.onerror = () => reject(new Error("Failed to load YouTube Iframe API"));
    document.head.appendChild(script);
  });

  return youtubeIframeApiPromise;
}

function extractVideoId(track: TrackItem | null): string | null {
  if (!track) return null;
  if (track.youtube_video_id) return track.youtube_video_id;
  if (!track.youtube_embed_url) return null;

  try {
    const parsed = new URL(track.youtube_embed_url);
    const parts = parsed.pathname.split("/");
    const embedIndex = parts.findIndex((part) => part === "embed");
    return embedIndex >= 0 ? parts[embedIndex + 1] ?? null : null;
  } catch {
    return null;
  }
}

function formatSeconds(totalSeconds: number): string {
  const safeSeconds = Number.isFinite(totalSeconds) && totalSeconds > 0 ? Math.floor(totalSeconds) : 0;
  const minutes = Math.floor(safeSeconds / 60);
  const seconds = safeSeconds % 60;
  return `${minutes}:${String(seconds).padStart(2, "0")}`;
}

function ControlIcon({ name }: { name: ControlIconName }) {
  switch (name) {
    case "shuffle":
      return (
        <svg className="control-icon" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" aria-hidden="true">
          <path d="M3 6h3c1.9 0 3.7 0.9 4.8 2.4L21 21" />
          <path d="M16 21h5v-5" />
          <path d="M3 18h3c1.9 0 3.7-0.9 4.8-2.4L21 3" />
          <path d="M16 3h5v5" />
        </svg>
      );
    case "prev":
      return (
        <svg className="control-icon" viewBox="0 0 24 24" fill="currentColor" aria-hidden="true">
          <rect x="4" y="5" width="2" height="14" rx="1" />
          <path d="M18 6v12l-9-6z" />
        </svg>
      );
    case "play":
      return (
        <svg className="control-icon" viewBox="0 0 24 24" fill="currentColor" aria-hidden="true">
          <path d="M8 5v14l11-7z" />
        </svg>
      );
    case "pause":
      return (
        <svg className="control-icon" viewBox="0 0 24 24" fill="currentColor" aria-hidden="true">
          <rect x="7" y="5" width="4" height="14" rx="1" />
          <rect x="13" y="5" width="4" height="14" rx="1" />
        </svg>
      );
    case "next":
      return (
        <svg className="control-icon" viewBox="0 0 24 24" fill="currentColor" aria-hidden="true">
          <rect x="18" y="5" width="2" height="14" rx="1" />
          <path d="M6 6v12l9-6z" />
        </svg>
      );
    case "screen":
      return (
        <svg className="control-icon" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" aria-hidden="true">
          <rect x="3" y="4" width="18" height="12" rx="2" />
          <path d="M9 20h6" />
          <path d="M12 16v4" />
        </svg>
      );
    case "list":
      return (
        <svg className="control-icon" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" aria-hidden="true">
          <path d="M8 6h13" />
          <path d="M8 12h13" />
          <path d="M8 18h13" />
          <circle cx="4" cy="6" r="1" fill="currentColor" stroke="none" />
          <circle cx="4" cy="12" r="1" fill="currentColor" stroke="none" />
          <circle cx="4" cy="18" r="1" fill="currentColor" stroke="none" />
        </svg>
      );
    case "volume":
      return (
        <svg className="control-icon" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" aria-hidden="true">
          <path d="M4 10v4h4l5 5V5l-5 5z" fill="currentColor" stroke="none" />
          <path d="M17 9a4 4 0 0 1 0 6" />
          <path d="M20 7a7 7 0 0 1 0 10" />
        </svg>
      );
    case "mute":
      return (
        <svg className="control-icon" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" aria-hidden="true">
          <path d="M4 10v4h4l5 5V5l-5 5z" fill="currentColor" stroke="none" />
          <path d="m17 9 4 4" />
          <path d="m21 9-4 4" />
        </svg>
      );
    default:
      return null;
  }
}

export default function AudioControlBar({ selectedTrack }: AudioControlBarProps) {
  const playerHostRef = useRef<HTMLDivElement | null>(null);
  const playerRef = useRef<YTPlayer | null>(null);
  const currentVideoIdRef = useRef<string | null>(null);

  const [isReady, setIsReady] = useState(false);
  const [isPlaying, setIsPlaying] = useState(false);
  const [currentTime, setCurrentTime] = useState(0);
  const [duration, setDuration] = useState(0);
  const [volume, setVolume] = useState(80);
  const [isMuted, setIsMuted] = useState(false);

  const videoId = useMemo(() => extractVideoId(selectedTrack), [selectedTrack]);
  const hasPlayableTrack = Boolean(videoId);

  useEffect(() => {
    let cancelled = false;

    if (!videoId || playerRef.current || !playerHostRef.current) {
      return () => {
        cancelled = true;
      };
    }

    void loadYoutubeIframeApi()
      .then((YT) => {
        if (cancelled || !playerHostRef.current || playerRef.current) {
          return;
        }

        currentVideoIdRef.current = videoId;
        playerRef.current = new YT.Player(playerHostRef.current, {
          width: "1",
          height: "1",
          videoId,
          playerVars: {
            autoplay: 1,
            controls: 0,
            rel: 0,
            modestbranding: 1,
            playsinline: 1
          },
          events: {
            onReady: (event) => {
              if (cancelled) return;
              setIsReady(true);
              setDuration(event.target.getDuration() || 0);
              setVolume(event.target.getVolume() || 80);
              setIsMuted(event.target.isMuted());
              event.target.playVideo();
            },
            onStateChange: (event) => {
              if (cancelled) return;
              setIsPlaying(event.data === YT.PlayerState.PLAYING);
              if (event.data === YT.PlayerState.PAUSED) {
                setCurrentTime(event.target.getCurrentTime() || 0);
              }
              if (event.data === YT.PlayerState.ENDED) {
                event.target.seekTo(0, true);
                event.target.playVideo();
              }
            }
          }
        });
      })
      .catch(() => {
        if (!cancelled) {
          setIsReady(false);
        }
      });

    return () => {
      cancelled = true;
    };
  }, [videoId]);

  useEffect(() => {
    if (!videoId || !playerRef.current || !isReady) {
      return;
    }
    if (currentVideoIdRef.current === videoId) {
      return;
    }

    currentVideoIdRef.current = videoId;
    playerRef.current.loadVideoById(videoId);
    playerRef.current.playVideo();
  }, [videoId, isReady]);

  useEffect(() => {
    if (hasPlayableTrack || !playerRef.current || !isReady) {
      return;
    }
    playerRef.current.stopVideo();
    setIsPlaying(false);
    setCurrentTime(0);
    setDuration(0);
  }, [hasPlayableTrack, isReady]);

  useEffect(() => {
    if (!isReady) {
      return;
    }

    const interval = window.setInterval(() => {
      if (!playerRef.current) return;
      setCurrentTime(playerRef.current.getCurrentTime() || 0);
      setDuration(playerRef.current.getDuration() || 0);
    }, 500);

    return () => window.clearInterval(interval);
  }, [isReady]);

  useEffect(() => {
    return () => {
      if (playerRef.current) {
        playerRef.current.destroy();
        playerRef.current = null;
      }
    };
  }, []);

  const handlePlayPause = useCallback(() => {
    if (!playerRef.current || !isReady || !hasPlayableTrack) return;
    if (isPlaying) {
      playerRef.current.pauseVideo();
      setIsPlaying(false);
    } else {
      playerRef.current.playVideo();
      setIsPlaying(true);
    }
  }, [hasPlayableTrack, isPlaying, isReady]);

  const handleSeek = (event: ChangeEvent<HTMLInputElement>) => {
    if (!playerRef.current || duration <= 0 || !isReady) return;
    const ratio = Number(event.target.value) / 100;
    const target = duration * ratio;
    playerRef.current.seekTo(target, true);
    setCurrentTime(target);
  };

  const handleVolumeChange = (event: ChangeEvent<HTMLInputElement>) => {
    if (!playerRef.current || !isReady) return;
    const nextVolume = Number(event.target.value);
    setVolume(nextVolume);
    playerRef.current.setVolume(nextVolume);
    if (playerRef.current.isMuted()) {
      playerRef.current.unMute();
      setIsMuted(false);
    }
  };

  const handleToggleMute = () => {
    if (!playerRef.current || !isReady) return;
    if (isMuted) {
      playerRef.current.unMute();
      setIsMuted(false);
    } else {
      playerRef.current.mute();
      setIsMuted(true);
    }
  };

  const progress = duration > 0 ? Math.min(100, (currentTime / duration) * 100) : 0;

  return (
    <section className="audio-controls-inline" aria-label="Audio controls">
      <div className="yt-audio-host" aria-hidden="true">
        <div ref={playerHostRef} />
      </div>

      <div className="player-top-row">
        <div className="audio-button-row">
          <button type="button" className="icon-btn" aria-label="Shuffle" disabled>
            <ControlIcon name="shuffle" />
          </button>
          <button type="button" className="icon-btn" aria-label="Previous" disabled>
            <ControlIcon name="prev" />
          </button>
          <button
            type="button"
            className="play-btn"
            aria-label={isPlaying ? "Pause" : "Play"}
            onClick={handlePlayPause}
            disabled={!selectedTrack || !hasPlayableTrack || !isReady}
          >
            <ControlIcon name={isPlaying ? "pause" : "play"} />
          </button>
          <button type="button" className="icon-btn" aria-label="Next" disabled>
            <ControlIcon name="next" />
          </button>
          <button type="button" className="icon-btn" aria-label="Video view" disabled>
            <ControlIcon name="screen" />
          </button>
        </div>

        <div className="audio-volume-block">
          <button type="button" className="icon-btn" aria-label="Playlist" disabled>
            <ControlIcon name="list" />
          </button>
          <button
            type="button"
            className="icon-btn"
            aria-label={isMuted ? "Unmute" : "Mute"}
            onClick={handleToggleMute}
            disabled={!selectedTrack || !hasPlayableTrack || !isReady}
          >
            <ControlIcon name={isMuted ? "mute" : "volume"} />
          </button>
          <input
            type="range"
            min={0}
            max={100}
            value={isMuted ? 0 : volume}
            onChange={handleVolumeChange}
            disabled={!hasPlayableTrack || !isReady}
          />
        </div>
      </div>

      <div className="audio-progress-row">
        <span className="time">{formatSeconds(currentTime)}</span>
        <input
          type="range"
          min={0}
          max={100}
          value={progress}
          onChange={handleSeek}
          disabled={!hasPlayableTrack || !isReady || duration <= 0}
        />
        <span className="time">{formatSeconds(duration)}</span>
      </div>
    </section>
  );
}
