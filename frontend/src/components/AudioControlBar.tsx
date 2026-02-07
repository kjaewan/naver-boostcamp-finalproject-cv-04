import { ChangeEvent, useCallback, useEffect, useMemo, useRef, useState } from "react";

import { TrackItem } from "../api";

interface AudioControlBarProps {
  selectedTrack: TrackItem | null;
}

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
          <button type="button" className="icon-btn" disabled>
            SHF
          </button>
          <button type="button" className="icon-btn" disabled>
            PREV
          </button>
          <button
            type="button"
            className="play-btn"
            onClick={handlePlayPause}
            disabled={!selectedTrack || !hasPlayableTrack || !isReady}
          >
            {isPlaying ? "II" : "PLAY"}
          </button>
          <button type="button" className="icon-btn" disabled>
            NEXT
          </button>
          <button type="button" className="icon-btn" disabled>
            TV
          </button>
        </div>

        <div className="audio-volume-block">
          <button type="button" className="icon-btn" disabled>
            LIST
          </button>
          <button
            type="button"
            className="icon-btn"
            onClick={handleToggleMute}
            disabled={!selectedTrack || !hasPlayableTrack || !isReady}
          >
            {isMuted ? "MUTE" : "VOL"}
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
