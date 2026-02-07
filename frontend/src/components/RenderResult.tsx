import { absUrl, RenderStatusResponse } from "../api";

interface RenderResultProps {
  job: RenderStatusResponse | null;
}

export default function RenderResult({ job }: RenderResultProps) {
  const videoUrl = absUrl(job?.result.video_url ?? null);

  return (
    <section className="panel result-panel">
      <h2 className="panel-title">Live2D Result</h2>
      {!job || !videoUrl ? (
        <p className="muted">Rendered MP4 will appear here.</p>
      ) : (
        <>
          <video autoPlay loop muted playsInline src={videoUrl} className="result-video" />
          <a className="download-link" href={videoUrl} target="_blank" rel="noreferrer">Open video in new tab</a>
        </>
      )}
    </section>
  );
}
