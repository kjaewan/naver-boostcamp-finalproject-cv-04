import { ChangeEvent, FormEvent } from "react";

interface SearchBoxProps {
  value: string;
  loading: boolean;
  onChange: (value: string) => void;
  onSubmit: () => void;
}

export default function SearchBox({ value, loading, onChange, onSubmit }: SearchBoxProps) {
  const handleChange = (event: ChangeEvent<HTMLInputElement>) => onChange(event.target.value);
  const handleSubmit = (event: FormEvent<HTMLFormElement>) => {
    event.preventDefault();
    onSubmit();
  };

  return (
    <section className="panel search-panel">
      <form onSubmit={handleSubmit}>
        <label className="label" htmlFor="music-search">Search Music</label>
        <div className="search-row">
          <input
            id="music-search"
            className="search-input"
            value={value}
            onChange={handleChange}
            placeholder="곡 제목을 입력하고 Enter"
          />
          <button type="submit" className="search-btn" disabled={loading}>
            {loading ? "검색중" : "검색"}
          </button>
        </div>
        <div className="search-meta">Enter를 눌러 상위 3개를 조회합니다.</div>
      </form>
    </section>
  );
}
