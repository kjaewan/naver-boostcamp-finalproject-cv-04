import { absUrl, RenderStatusResponse } from "../api";

interface RenderResultProps {
  job: RenderStatusResponse | null;
}

export default function RenderResult({ job }: RenderResultProps) {
  const videoUrl = absUrl(job?.result.video_url ?? null);
  const isRunning = job?.status === "queued" || job?.status === "processing";

  return (
    <section className="panel result-panel">
      <h2 className="panel-title">Live2D Result</h2>
      {!job || !videoUrl ? (
        <p className="muted result-placeholder">
          {isRunning ? `이미지 생성중... ${job.progress}%` : "검색결과(선택하기)"}
        </p>
      ) : (
        <>
          <video autoPlay loop muted playsInline src={videoUrl} className="result-video" />
          <a className="download-link" href={videoUrl} target="_blank" rel="noreferrer">Open video in new tab</a>
        </>
      )}
    </section>
  );
}
