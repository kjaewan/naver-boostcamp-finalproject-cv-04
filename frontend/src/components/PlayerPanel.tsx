interface PlayerPanelProps {
  embedUrl: string | null;
}

export default function PlayerPanel({ embedUrl }: PlayerPanelProps) {
  const compactEmbedUrl = embedUrl
    ? `${embedUrl}${embedUrl.includes("?") ? "&" : "?"}autoplay=1&controls=1&modestbranding=1&rel=0&playsinline=1`
    : null;

  return (
    <section className="mini-player-dock">
      {!compactEmbedUrl ? (
        <p className="mini-player-text">YouTube player</p>
      ) : (
        <div className="player-wrap compact">
          <iframe
            src={compactEmbedUrl}
            title="YouTube player"
            allow="accelerometer; autoplay; clipboard-write; encrypted-media; gyroscope; picture-in-picture"
            allowFullScreen
          />
        </div>
      )}
    </section>
  );
}
