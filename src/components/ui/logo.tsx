import { APP_NAME } from "@/lib/constants";

/**
 * Atalmart® registered wordmark — Vivek's exact artwork (Helvetica-Bold,
 * "Atal" #ff6b03 with a slight skew, "mart" #008236, ® top-right). Rendered
 * inline as SVG, scaled to the parent font-size (height: 1em), so every call
 * site keeps using text-* sizes. Source also at public/logo.svg.
 *
 * `onDark` swaps "mart" + ® to cream so the green doesn't lose contrast on the
 * brown footer / admin sidebar / boards. "Atal" saffron reads on both.
 */
export function Logo({
  className = "",
  registered = true,
  onDark = false,
}: {
  className?: string;
  registered?: boolean;
  onDark?: boolean;
}) {
  const mart = onDark ? "#FFFAF5" : "#008236";
  const reg = onDark ? "#FFFAF5" : "#1A1A1A";
  return (
    <span
      className={`inline-block leading-none ${className}`}
      role="img"
      aria-label={APP_NAME}
    >
      <svg
        viewBox="0 0 400 100"
        style={{ height: "1.15em", width: "auto", display: "block" }}
        xmlns="http://www.w3.org/2000/svg"
      >
        <g transform="matrix(0.999838,0.018008,0,0.999838,-0.019873,2.201304)">
          <text
            x="26.617"
            y="77.938"
            style={{
              fontFamily: "'Helvetica Neue', Helvetica, Arial, sans-serif",
              fontWeight: 700,
              fontSize: "82.46px",
              fill: "#ff6b03",
            }}
          >
            Atal
          </text>
        </g>
        <text
          x="177.417"
          y="82.509"
          style={{
            fontFamily: "'Helvetica Neue', Helvetica, Arial, sans-serif",
            fontWeight: 700,
            fontSize: "85.57px",
            fill: mart,
          }}
        >
          mart
        </text>
        {registered && (
          <text
            x="365.284"
            y="35.698"
            style={{
              fontFamily: "'Helvetica Neue', Helvetica, Arial, sans-serif",
              fontSize: "25.667px",
              fill: reg,
            }}
          >
            ®
          </text>
        )}
      </svg>
    </span>
  );
}
