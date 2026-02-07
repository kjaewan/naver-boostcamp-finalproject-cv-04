import { ChangeEvent, useCallback, useEffect, useMemo, useRef, useState } from "react";
import { Pause, Play, Repeat, SkipBack, SkipForward, Volume2, VolumeX } from "lucide-react";

import { TrackItem } from "../api";

interface AudioControlBarProps {
  selectedTrack: TrackItem | null;
  isDarkMode: boolean;
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

export default function AudioControlBar({ selectedTrack, isDarkMode }: AudioControlBarProps) {
  const playerHostRef = useRef<HTMLDivElement | null>(null);
  const playerRef = useRef<YTPlayer | null>(null);
  const currentVideoIdRef = useRef<string | null>(null);
  const repeatingRef = useRef(true);

  const [isReady, setIsReady] = useState(false);
  const [isPlaying, setIsPlaying] = useState(false);
  const [isRepeating, setIsRepeating] = useState(true);
  const [currentTime, setCurrentTime] = useState(0);
  const [duration, setDuration] = useState(0);
  const [volume, setVolume] = useState(80);
  const [isMuted, setIsMuted] = useState(false);

  const videoId = useMemo(() => extractVideoId(selectedTrack), [selectedTrack]);
  const hasPlayableTrack = Boolean(videoId);

  useEffect(() => {
    repeatingRef.current = isRepeating;
  }, [isRepeating]);

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
                if (repeatingRef.current) {
                  event.target.seekTo(0, true);
                  event.target.playVideo();
                } else {
                  setIsPlaying(false);
                  setCurrentTime(0);
                }
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

  const controlDisabled = !selectedTrack || !hasPlayableTrack || !isReady;
  const progress = duration > 0 ? Math.min(100, (currentTime / duration) * 100) : 0;

  return (
    <section className="flex w-full items-center gap-4" aria-label="Audio controls">
      <div className="sr-only" aria-hidden="true">
        <div ref={playerHostRef} />
      </div>

      <div className="mx-auto flex w-full max-w-2xl flex-col items-center">
        <div className="mb-2 flex items-center gap-4 sm:gap-6">
          <button
            type="button"
            className={`transition-colors ${isDarkMode ? "text-gray-400 hover:text-white" : "text-slate-500 hover:text-slate-900"} disabled:cursor-not-allowed disabled:opacity-50`}
            disabled
            aria-label="Previous"
          >
            <SkipBack className="h-5 w-5" />
          </button>

          <button
            type="button"
            className={`flex h-10 w-10 items-center justify-center rounded-full transition-transform hover:scale-105 disabled:cursor-not-allowed disabled:opacity-50 ${
              isDarkMode ? "bg-white text-black" : "bg-slate-900 text-white"
            }`}
            onClick={handlePlayPause}
            disabled={controlDisabled}
            aria-label={isPlaying ? "Pause" : "Play"}
          >
            {isPlaying ? <Pause className="h-5 w-5" /> : <Play className="ml-0.5 h-5 w-5" />}
          </button>

          <button
            type="button"
            className={`transition-colors ${isDarkMode ? "text-gray-400 hover:text-white" : "text-slate-500 hover:text-slate-900"} disabled:cursor-not-allowed disabled:opacity-50`}
            disabled
            aria-label="Next"
          >
            <SkipForward className="h-5 w-5" />
          </button>

          <button
            type="button"
            onClick={() => setIsRepeating((prev) => !prev)}
            className={`transition-colors ${isRepeating ? "text-blue-500" : isDarkMode ? "text-gray-400 hover:text-white" : "text-slate-500 hover:text-slate-900"} disabled:cursor-not-allowed disabled:opacity-50`}
            disabled={controlDisabled}
            aria-label="Repeat"
            title="Repeat"
          >
            <Repeat className="h-4 w-4" />
          </button>
        </div>

        <div className={`flex w-full items-center gap-3 font-mono text-xs ${isDarkMode ? "text-gray-400" : "text-slate-500"}`}>
          <span>{formatSeconds(currentTime)}</span>
          <input
            type="range"
            min={0}
            max={100}
            step={0.1}
            value={progress}
            onChange={handleSeek}
            disabled={controlDisabled || duration <= 0}
            className="h-1 w-full cursor-pointer accent-blue-500 disabled:cursor-not-allowed disabled:opacity-50"
            aria-label="Seek"
          />
          <span>{formatSeconds(duration)}</span>
        </div>
      </div>

      <div className="hidden items-center gap-2 sm:flex">
        <button
          type="button"
          onClick={handleToggleMute}
          className={`transition-colors ${isDarkMode ? "text-gray-400 hover:text-white" : "text-slate-500 hover:text-slate-900"} disabled:cursor-not-allowed disabled:opacity-50`}
          disabled={controlDisabled}
          aria-label={isMuted ? "Unmute" : "Mute"}
        >
          {isMuted ? <VolumeX className="h-4 w-4" /> : <Volume2 className="h-4 w-4" />}
        </button>
        <input
          type="range"
          min={0}
          max={100}
          value={isMuted ? 0 : volume}
          onChange={handleVolumeChange}
          disabled={controlDisabled}
          className="h-1 w-24 cursor-pointer accent-blue-500 disabled:cursor-not-allowed disabled:opacity-50"
          aria-label="Volume"
        />
      </div>
    </section>
  );
}
