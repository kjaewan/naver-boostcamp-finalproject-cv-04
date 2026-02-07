import { TrackItem } from "../api";

interface TrackCandidatesProps {
  items: TrackItem[];
  selectedTrackId: string | null;
  disabled: boolean;
  onSelect: (item: TrackItem) => void;
}

export default function TrackCandidates({ items, selectedTrackId, disabled, onSelect }: TrackCandidatesProps) {
  return (
    <section className="wire-box results-box">
      <h2 className="panel-title">검색창에서 검색했을 시 결과 (3개)</h2>
      {items.length === 0 ? (
        <p className="wire-placeholder results-placeholder">검색 결과가 여기에 표시됩니다.</p>
      ) : (
        <div className="track-list">
          {items.map((item) => (
            <button
              key={item.track_id}
              className={`track-item ${item.track_id === selectedTrackId ? "selected" : ""}`}
              disabled={disabled}
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
      )}
    </section>
  );
}
