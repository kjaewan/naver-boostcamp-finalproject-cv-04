import { ChangeEvent, useCallback, useEffect, useMemo, useRef, useState } from "react";

import { TrackItem } from "../api";

interface AudioControlBarProps {
  tracks: TrackItem[];
  selectedTrack: TrackItem | null;
  onSelect: (item: TrackItem) => void;
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

export default function AudioControlBar({ tracks, selectedTrack, onSelect }: AudioControlBarProps) {
  const playerHostRef = useRef<HTMLDivElement | null>(null);
  const playerRef = useRef<YTPlayer | null>(null);
  const currentVideoIdRef = useRef<string | null>(null);
  const repeatRef = useRef(false);

  const [isReady, setIsReady] = useState(false);
  const [isPlaying, setIsPlaying] = useState(false);
  const [currentTime, setCurrentTime] = useState(0);
  const [duration, setDuration] = useState(0);
  const [volume, setVolume] = useState(80);
  const [isMuted, setIsMuted] = useState(false);
  const [shuffle, setShuffle] = useState(false);
  const [repeat, setRepeat] = useState(false);

  const selectedIndex = useMemo(
    () => tracks.findIndex((item) => item.track_id === selectedTrack?.track_id),
    [tracks, selectedTrack]
  );
  const videoId = useMemo(() => extractVideoId(selectedTrack), [selectedTrack]);
  const hasPlayableTrack = Boolean(videoId);

  repeatRef.current = repeat;

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
              if (event.data === YT.PlayerState.ENDED && repeatRef.current) {
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

  const handlePrev = useCallback(() => {
    if (tracks.length === 0) return;
    if (selectedIndex < 0) {
      onSelect(tracks[0]);
      return;
    }
    const prevIndex = (selectedIndex - 1 + tracks.length) % tracks.length;
    onSelect(tracks[prevIndex]);
  }, [onSelect, selectedIndex, tracks]);

  const handleNext = useCallback(() => {
    if (tracks.length === 0) return;
    if (selectedIndex < 0) {
      onSelect(tracks[0]);
      return;
    }

    if (shuffle && tracks.length > 1) {
      let randomIndex = selectedIndex;
      while (randomIndex === selectedIndex) {
        randomIndex = Math.floor(Math.random() * tracks.length);
      }
      onSelect(tracks[randomIndex]);
      return;
    }

    const nextIndex = (selectedIndex + 1) % tracks.length;
    onSelect(tracks[nextIndex]);
  }, [onSelect, selectedIndex, shuffle, tracks]);

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
    <section className="audio-control-dock" aria-label="Audio controls">
      <div className="yt-audio-host" aria-hidden="true">
        <div ref={playerHostRef} />
      </div>

      <div className="audio-track-block">
        {selectedTrack ? (
          <img className="audio-track-art" src={selectedTrack.album_art_url} alt={`${selectedTrack.title} cover`} />
        ) : (
          <div className="audio-track-art placeholder" />
        )}
        <div className="audio-track-copy">
          <p className="audio-track-title">{selectedTrack?.title ?? "트랙을 선택하세요"}</p>
          <p className="audio-track-artist">{selectedTrack?.artist ?? "검색 후 노래를 재생할 수 있습니다."}</p>
        </div>
      </div>

      <div className="audio-main-controls">
        <div className="audio-button-row">
          <button
            type="button"
            className={`icon-btn ${shuffle ? "active" : ""}`}
            onClick={() => setShuffle((prev) => !prev)}
            disabled={tracks.length < 2}
          >
            Shuffle
          </button>
          <button type="button" className="icon-btn" onClick={handlePrev} disabled={tracks.length === 0}>
            Prev
          </button>
          <button type="button" className="play-btn" onClick={handlePlayPause} disabled={!hasPlayableTrack || !isReady}>
            {isPlaying ? "Pause" : "Play"}
          </button>
          <button type="button" className="icon-btn" onClick={handleNext} disabled={tracks.length === 0}>
            Next
          </button>
          <button
            type="button"
            className={`icon-btn ${repeat ? "active" : ""}`}
            onClick={() => setRepeat((prev) => !prev)}
            disabled={!hasPlayableTrack}
          >
            Repeat
          </button>
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
      </div>

      <div className="audio-volume-block">
        <button type="button" className="icon-btn" onClick={handleToggleMute} disabled={!hasPlayableTrack || !isReady}>
          {isMuted ? "Muted" : "Volume"}
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
    </section>
  );
}
