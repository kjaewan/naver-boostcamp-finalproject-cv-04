import { RenderStatusResponse } from "../api";

interface RenderStatusProps {
  job: RenderStatusResponse | null;
}

function phaseLabel(phase: string): string {
  switch (phase) {
    case "queued":
      return "Waiting in queue";
    case "preparing":
      return "Preparing workflow";
    case "prompting":
      return "Submitting prompt";
    case "sampling":
      return "Sampling video frames";
    case "assembling":
      return "Assembling video";
    case "postprocessing":
      return "Post-processing output";
    case "done":
      return "Done";
    case "error":
      return "Error";
    default:
      return phase;
  }
}

export default function RenderStatus({ job }: RenderStatusProps) {
  return (
    <section className="panel">
      <h2 className="panel-title">Render Status</h2>
      {!job ? (
        <p className="muted">No render requested yet.</p>
      ) : (
        <>
          <div className="status-row">
            <span className="status-key">Job</span>
            <span className="status-value mono">{job.job_id}</span>
          </div>
          <div className="status-row">
            <span className="status-key">State</span>
            <span className="status-value">{job.status}</span>
          </div>
          <div className="status-row">
            <span className="status-key">Phase</span>
            <span className="status-value">{phaseLabel(job.phase)}</span>
          </div>
          <div className="status-row">
            <span className="status-key">Queue</span>
            <span className="status-value">{job.queue_position}</span>
          </div>
          <div className="status-row">
            <span className="status-key">ETA</span>
            <span className="status-value">{job.estimated_wait_sec}s</span>
          </div>
          <div className="progress-shell" role="progressbar" aria-valuenow={job.progress}>
            <div className="progress-fill" style={{ width: `${job.progress}%` }} />
          </div>
          {job.error.code && (
            <div className="error-box">
              {job.error.code}: {job.error.message}
            </div>
          )}
        </>
      )}
    </section>
  );
}
