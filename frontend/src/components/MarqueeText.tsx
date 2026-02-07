import { CSSProperties, useEffect, useMemo, useRef, useState } from "react";

interface MarqueeTextProps {
  text: string;
  className?: string;
  containerClassName?: string;
  pauseOnHover?: boolean;
}

function measureOverflow(container: HTMLDivElement | null, text: HTMLSpanElement | null): [boolean, number] {
  if (!container || !text) {
    return [false, 0];
  }
  const visibleWidth = container.clientWidth;
  const fullWidth = text.scrollWidth;
  const hasOverflow = fullWidth > visibleWidth + 1;
  return [hasOverflow, fullWidth];
}

export default function MarqueeText({
  text,
  className = "",
  containerClassName = "",
  pauseOnHover = true
}: MarqueeTextProps) {
  const containerRef = useRef<HTMLDivElement | null>(null);
  const textRef = useRef<HTMLSpanElement | null>(null);
  const [isOverflowing, setIsOverflowing] = useState(false);
  const [distancePx, setDistancePx] = useState(0);

  useEffect(() => {
    const update = () => {
      const [overflow, fullWidth] = measureOverflow(containerRef.current, textRef.current);
      setIsOverflowing(overflow);
      setDistancePx(overflow ? fullWidth + 24 : 0);
    };

    update();

    const observer = new ResizeObserver(update);
    if (containerRef.current) observer.observe(containerRef.current);
    if (textRef.current) observer.observe(textRef.current);

    return () => observer.disconnect();
  }, [text]);

  const durationSec = useMemo(() => {
    if (!isOverflowing || distancePx <= 0) return 0;
    return Math.max(9, Math.min(30, distancePx / 32));
  }, [distancePx, isOverflowing]);

  const style = useMemo(
    () =>
      ({
        "--marquee-distance": `${distancePx}px`,
        "--marquee-duration": `${durationSec}s`
      }) as CSSProperties,
    [distancePx, durationSec]
  );

  const pauseClass = pauseOnHover ? "marquee--pause-on-hover" : "";

  return (
    <div ref={containerRef} className={`marquee w-full overflow-hidden whitespace-nowrap ${containerClassName}`}>
      {isOverflowing ? (
        <div className={`marquee__track ${pauseClass}`} style={style}>
          <span ref={textRef} className={`inline-block pr-6 ${className}`}>
            {text}
          </span>
          <span aria-hidden="true" className={`inline-block pr-6 ${className}`}>
            {text}
          </span>
        </div>
      ) : (
        <span ref={textRef} className={`inline-block ${className}`}>
          {text}
        </span>
      )}
    </div>
  );
}
