import { TrackItem } from "../api";

interface TrackCandidatesProps {
  items: TrackItem[];
  selectedTrackId: string | null;
  onSelect: (item: TrackItem) => void;
}

export default function TrackCandidates({ items, selectedTrackId, onSelect }: TrackCandidatesProps) {
  return (
    <section className="panel">
      <h2 className="panel-title">Track Candidates</h2>
      <div className="track-list">
        {items.map((item) => (
          <button
            key={item.track_id}
            className={`track-item ${item.track_id === selectedTrackId ? "selected" : ""}`}
            onClick={() => onSelect(item)}
          >
            <img src={item.album_art_url} alt={`${item.title} album art`} loading="lazy" />
            <div className="track-copy">
              <div className="track-title">{item.title}</div>
              <div className="track-artist">{item.artist}</div>
              <div className="track-score">score {item.score.toFixed(3)}</div>
            </div>
          </button>
        ))}
      </div>
    </section>
  );
}
