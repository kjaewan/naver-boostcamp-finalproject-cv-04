import { FormEvent, useEffect, useMemo, useRef, useState } from "react";
import { History, ListMusic, Lock, Moon, Search, Sun } from "lucide-react";

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

interface HistoryItem {
  id: string;
  title: string;
  artist: string;
  createdAt: number;
}

function formatRelativeTime(createdAt: number): string {
  const diffSec = Math.max(0, Math.floor((Date.now() - createdAt) / 1000));
  if (diffSec < 60) return "방금 전";
  const diffMin = Math.floor(diffSec / 60);
  if (diffMin < 60) return `${diffMin}분 전`;
  const diffHour = Math.floor(diffMin / 60);
  if (diffHour < 24) return `${diffHour}시간 전`;
  return "어제";
}

export default function App() {
  const [isDarkMode, setIsDarkMode] = useState(true);
  const [query, setQuery] = useState("one ok rock Nasty");
  const [tracks, setTracks] = useState<TrackItem[]>([]);
  const [selectedTrack, setSelectedTrack] = useState<TrackItem | null>(null);
  const [job, setJob] = useState<RenderStatusResponse | null>(null);
  const [searchLoading, setSearchLoading] = useState(false);
  const [actionLoading, setActionLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [historyItems, setHistoryItems] = useState<HistoryItem[]>([]);

  const createRequestInFlightRef = useRef(false);
  const lastCompletedJobRef = useRef<string | null>(null);

  const isGenerating = actionLoading || job?.status === "queued" || job?.status === "processing";
  const isRenderingLocked = isGenerating;

  const progress = useMemo(() => {
    if (job?.status === "queued" || job?.status === "processing") {
      return Math.max(5, Math.min(99, job.progress));
    }
    if (actionLoading) {
      return 5;
    }
    if (job?.status === "completed") {
      return 100;
    }
    return 0;
  }, [actionLoading, job]);

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

  useEffect(() => {
    if (!job || job.status !== "completed") {
      return;
    }
    if (lastCompletedJobRef.current === job.job_id) {
      return;
    }

    lastCompletedJobRef.current = job.job_id;
    setHistoryItems((prev) => {
      const next = [
        {
          id: job.job_id,
          title: job.track.title,
          artist: job.track.artist,
          createdAt: Date.now()
        },
        ...prev.filter((item) => item.id !== job.job_id)
      ];
      return next.slice(0, 6);
    });
  }, [job]);

  const handleSearchSubmit = async (event: FormEvent<HTMLFormElement>) => {
    event.preventDefault();
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

  const live2dVideoUrl = job?.status === "completed" ? absUrl(job.result.video_url) : null;

  const theme = {
    bg: isDarkMode ? "bg-[#121212]" : "bg-[#F2F4F8]",
    text: isDarkMode ? "text-white" : "text-slate-900",
    subText: isDarkMode ? "text-gray-400" : "text-slate-500",
    cardBg: isDarkMode ? "bg-[#1e1e1e]" : "bg-white",
    cardBorder: isDarkMode ? "border-white/5" : "border-slate-200/70",
    inputBg: isDarkMode ? "bg-[#121212]" : "bg-slate-50",
    hoverBg: isDarkMode ? "hover:bg-[#252525]" : "hover:bg-slate-100",
    playerBg: isDarkMode ? "bg-black/80 border-white/10" : "bg-white/80 border-slate-200",
    shadow: isDarkMode ? "shadow-xl shadow-black/20" : "shadow-md shadow-slate-300/30"
  };

  return (
    <div
      className={`min-h-screen overflow-x-hidden transition-colors duration-500 ${theme.bg} ${theme.text} selection:bg-blue-500 selection:text-white`}
    >
      <div className="mx-auto flex min-h-screen w-full max-w-[1600px] flex-col px-4 pb-28 pt-4 sm:px-6 lg:px-8">
        <div className="flex flex-1 flex-col gap-6 lg:flex-row lg:overflow-hidden">
          <div className="w-full shrink-0 lg:w-auto">
            <div
              className={`relative flex flex-col overflow-hidden rounded-3xl border p-4 transition-colors duration-500 sm:p-6 ${theme.cardBg} ${theme.cardBorder} ${theme.shadow}`}
            >
              <div className="mb-5 flex items-center justify-between">
                <h2 className={`text-xs font-bold uppercase tracking-widest ${theme.subText}`}>Live 2D Generation</h2>
                <div className="flex items-center gap-2">
                  <span className={`h-2 w-2 rounded-full ${isGenerating ? "animate-pulse bg-blue-500" : "bg-green-500"}`} />
                  <span className="text-xs font-medium text-blue-500">{isGenerating ? "Processing" : "Ready"}</span>
                </div>
              </div>

              <div className="relative mx-auto h-[512px] w-[512px] max-h-[80vw] max-w-[80vw] overflow-hidden rounded-2xl bg-gradient-to-br from-gray-800 to-black shadow-lg">
                {live2dVideoUrl ? (
                  <video
                    autoPlay
                    loop
                    muted
                    playsInline
                    src={live2dVideoUrl}
                    className="h-full w-full object-cover"
                    aria-label="Live2D render result"
                  />
                ) : selectedTrack ? (
                  <img
                    src={selectedTrack.album_art_url}
                    alt={`${selectedTrack.title} album art`}
                    className="h-full w-full object-cover"
                    loading="lazy"
                  />
                ) : (
                  <div className="absolute inset-0 flex items-center justify-center">
                    <div className="flex h-full items-center justify-center gap-1 opacity-60">
                      {Array.from({ length: 20 }).map((_, index) => (
                        <div
                          key={index}
                          className="h-8 w-2 animate-pulse rounded-full bg-white"
                          style={{
                            height: `${Math.random() * 60 + 20}%`,
                            animationDelay: `${index * 0.05}s`,
                            animationDuration: "1s"
                          }}
                        />
                      ))}
                    </div>
                  </div>
                )}

                {isGenerating && (
                  <div className="absolute inset-0 z-10 flex flex-col items-center justify-center bg-black/60 backdrop-blur-sm transition-all duration-500">
                    <div className="mb-4 h-16 w-16 animate-spin rounded-full border-4 border-blue-500/30 border-t-blue-500" />
                    <h3 className="mb-1 text-xl font-bold text-white">Generating...</h3>
                    <p className="mb-4 text-sm text-gray-300">안정성을 위해 다른 조작이 잠깁니다</p>
                    <div className="h-1.5 w-48 overflow-hidden rounded-full bg-gray-700">
                      <div className="h-full bg-blue-500 transition-all duration-300 ease-out" style={{ width: `${progress}%` }} />
                    </div>
                    <span className="mt-2 font-mono text-xs text-blue-400">{progress}%</span>
                  </div>
                )}
              </div>

              <div className="mt-6">
                <h1 className={`truncate text-2xl font-bold sm:text-3xl ${theme.text}`}>
                  {selectedTrack?.title ?? "Do I Wanna Know?"}
                </h1>
                <p className={`text-base font-medium sm:text-lg ${theme.subText}`}>
                  {selectedTrack?.artist ?? "Arctic Monkeys"}
                </p>
              </div>
            </div>
          </div>

          <div className="relative flex min-w-0 flex-1 flex-col gap-4">
            <section
              className={`relative rounded-2xl border p-4 transition-all duration-500 ${theme.cardBg} ${theme.cardBorder} ${theme.shadow} ${
                isGenerating ? "opacity-50" : ""
              }`}
            >
              <button
                onClick={() => setIsDarkMode((prev) => !prev)}
                className={`absolute right-1 top-1 z-20 flex cursor-pointer items-center gap-2 rounded-full border px-3 py-1.5 text-xs font-bold transition-all duration-300 ${
                  isDarkMode
                    ? "border-white/10 bg-white/10 text-white hover:bg-white/20"
                    : "border-slate-200 bg-slate-100 text-slate-900 hover:bg-slate-200"
                }`}
                aria-label="Toggle theme"
              >
                {isDarkMode ? (
                  <>
                    <Sun className="h-4 w-4 text-yellow-400" />
                    <span>Light Mode</span>
                  </>
                ) : (
                  <>
                    <Moon className="h-4 w-4 text-slate-600" />
                    <span>Dark Mode</span>
                  </>
                )}
              </button>

              <form onSubmit={handleSearchSubmit}>
                <label className={`ml-1 mb-2 block text-xs font-bold ${theme.subText}`}>SEARCH MODEL</label>
                <div className={`flex gap-3 ${isGenerating ? "pointer-events-none" : ""}`}>
                  <div className="relative flex-1">
                    <Search className={`absolute left-4 top-1/2 h-5 w-5 -translate-y-1/2 ${theme.subText}`} />
                    <input
                      type="text"
                      value={query}
                      onChange={(event) => setQuery(event.target.value)}
                      className={`w-full rounded-xl border py-3 pl-12 pr-4 transition-all focus:outline-none focus:ring-2 focus:ring-blue-500/50 ${theme.inputBg} ${theme.text} ${theme.cardBorder}`}
                      placeholder="아티스트, 곡 제목을 입력하세요..."
                      disabled={isRenderingLocked}
                    />
                  </div>
                  <button
                    type="submit"
                    className="rounded-xl bg-blue-600 px-6 font-medium text-white shadow-lg shadow-blue-900/20 transition-colors hover:bg-blue-500 disabled:cursor-not-allowed disabled:opacity-50"
                    disabled={searchLoading || isRenderingLocked}
                  >
                    {searchLoading ? "검색중" : "검색"}
                  </button>
                </div>
              </form>
            </section>

            <section
              className={`flex min-h-[300px] flex-1 flex-col rounded-3xl border p-6 transition-all duration-500 ${theme.cardBg} ${theme.cardBorder} ${theme.shadow} ${
                isGenerating ? "pointer-events-none select-none grayscale opacity-40" : ""
              }`}
            >
              <div className="mb-4 flex items-end justify-between">
                <h3 className={`flex items-center gap-2 text-lg font-bold ${theme.text}`}>
                  <ListMusic className="h-5 w-5 text-blue-500" />
                  검색 결과
                  <span className="rounded-full bg-blue-500/10 px-2 py-0.5 text-sm text-blue-500">{tracks.length}</span>
                </h3>
                {isGenerating && <Lock className={`h-5 w-5 animate-bounce ${theme.subText}`} />}
              </div>

              {tracks.length === 0 ? (
                <p className={`my-auto text-center text-sm ${theme.subText}`}>검색 결과가 여기에 표시됩니다.</p>
              ) : (
                <div className="space-y-3 overflow-y-auto pr-1">
                  {tracks.map((item) => {
                    const isSelected = selectedTrack?.track_id === item.track_id;
                    return (
                      <button
                        key={item.track_id}
                        type="button"
                        onClick={() => handleSelectTrack(item)}
                        disabled={isRenderingLocked}
                        className={`group flex w-full items-center gap-4 rounded-xl border p-3 text-left transition-all ${theme.hoverBg} ${
                          isSelected ? "border-blue-500/70" : "border-transparent"
                        } ${isRenderingLocked ? "cursor-not-allowed" : "cursor-pointer"}`}
                      >
                        <div className="h-14 w-14 shrink-0 overflow-hidden rounded-lg bg-gradient-to-br from-slate-800 to-black shadow-md">
                          <img src={item.album_art_url} alt={`${item.title} album art`} className="h-full w-full object-cover" loading="lazy" />
                        </div>

                        <div className="min-w-0 flex-1">
                          <h4 className={`truncate font-bold transition-colors group-hover:text-blue-500 ${theme.text}`}>{item.title}</h4>
                          <p className={`truncate text-sm ${theme.subText}`}>{item.artist}</p>
                        </div>

                        <div className="min-w-[80px] text-right">
                          <div className="mb-1 font-mono text-xs font-bold text-blue-500">{(item.score * 100).toFixed(1)}%</div>
                          <div className={`h-1 w-full rounded-full ${isDarkMode ? "bg-gray-700" : "bg-gray-200"}`}>
                            <div className="h-full rounded-full bg-blue-500" style={{ width: `${Math.max(0, Math.min(100, item.score * 100))}%` }} />
                          </div>
                        </div>
                      </button>
                    );
                  })}
                </div>
              )}
            </section>

            <section
              className={`flex h-[180px] flex-col rounded-2xl border p-5 transition-all duration-500 ${theme.cardBg} ${theme.cardBorder} ${theme.shadow}`}
            >
              <h3 className={`mb-3 flex items-center gap-2 text-sm font-bold uppercase tracking-wide ${theme.subText}`}>
                <History className="h-4 w-4" />
                Recent History
              </h3>
              {historyItems.length === 0 ? (
                <p className={`my-auto text-center text-sm ${theme.subText}`}>아직 생성 기록이 없습니다.</p>
              ) : (
                <div className="flex-1 space-y-2 overflow-y-auto pr-1">
                  {historyItems.map((history) => (
                    <div
                      key={history.id}
                      className={`group flex cursor-default items-center justify-between rounded-lg p-2 transition-colors ${
                        isDarkMode ? "hover:bg-white/5" : "hover:bg-slate-100"
                      }`}
                    >
                      <div className="flex items-center gap-3 overflow-hidden">
                        <div
                          className={`h-8 w-8 shrink-0 rounded-md transition-colors ${
                            isDarkMode ? "bg-gray-700 group-hover:bg-blue-500/20" : "bg-slate-200 group-hover:bg-blue-100"
                          }`}
                        />
                        <span
                          className={`truncate text-sm ${
                            isDarkMode ? "text-gray-300 group-hover:text-white" : "text-slate-600 group-hover:text-slate-900"
                          }`}
                        >
                          {history.title} - {history.artist}
                        </span>
                      </div>
                      <span className={`whitespace-nowrap font-mono text-xs ${theme.subText}`}>
                        {formatRelativeTime(history.createdAt)}
                      </span>
                    </div>
                  ))}
                </div>
              )}
            </section>

            {error && (
              <section className="rounded-xl border border-red-400/70 bg-red-500/10 px-4 py-3 text-sm text-red-300">
                {error}
              </section>
            )}
          </div>
        </div>
      </div>

      <footer
        className={`fixed inset-x-0 bottom-0 z-50 border-t backdrop-blur-xl transition-colors duration-500 ${theme.playerBg}`}
      >
        <div className="mx-auto flex h-24 w-full max-w-[1600px] items-center gap-4 px-4 sm:px-6 lg:px-8">
          <div className="hidden min-w-0 flex-1 items-center gap-3 md:flex">
            <div className={`h-12 w-12 shrink-0 rounded-md ${isDarkMode ? "bg-gray-800" : "bg-slate-200"}`}>
              {selectedTrack && (
                <img
                  src={selectedTrack.album_art_url}
                  alt={`${selectedTrack.title} album art thumbnail`}
                  className="h-full w-full rounded-md object-cover"
                  loading="lazy"
                />
              )}
            </div>
            <div className="min-w-0">
              <p className={`truncate text-sm font-bold ${theme.text}`}>{selectedTrack?.title ?? "노래를 선택하세요"}</p>
              <p className={`truncate text-xs ${theme.subText}`}>{selectedTrack?.artist ?? "아티스트"}</p>
            </div>
          </div>

          <div className="min-w-0 flex-[2]">
            <AudioControlBar selectedTrack={selectedTrack} isDarkMode={isDarkMode} />
          </div>
        </div>
      </footer>
    </div>
  );
}
