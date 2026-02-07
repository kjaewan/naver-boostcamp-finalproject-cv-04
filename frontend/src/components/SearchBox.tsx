import { ChangeEvent, FormEvent } from "react";

interface SearchBoxProps {
  value: string;
  loading: boolean;
  disabled: boolean;
  onChange: (value: string) => void;
  onSubmit: () => void;
}

export default function SearchBox({ value, loading, disabled, onChange, onSubmit }: SearchBoxProps) {
  const handleChange = (event: ChangeEvent<HTMLInputElement>) => onChange(event.target.value);
  const handleSubmit = (event: FormEvent<HTMLFormElement>) => {
    event.preventDefault();
    if (disabled) return;
    onSubmit();
  };

  return (
    <section className="wire-box search-box">
      <form onSubmit={handleSubmit}>
        <label className="label" htmlFor="music-search">검색창</label>
        <div className="search-row">
          <input
            id="music-search"
            className="search-input"
            value={value}
            onChange={handleChange}
            disabled={disabled}
            placeholder="곡 제목 또는 가수"
          />
          <button type="submit" className="search-btn" disabled={loading || disabled}>
            {loading ? "..." : "검색"}
          </button>
        </div>
        <div className="search-meta wire-meta">
          {disabled ? "생성중에는 안정성을 위해 검색이 잠깁니다." : "Enter를 눌러 상위 3개를 조회합니다."}
        </div>
      </form>
    </section>
  );
}
