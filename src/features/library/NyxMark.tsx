export default function NyxMark({ className = "" }: { className?: string }) {
  return (
    <svg
      className={className}
      viewBox="0 0 512 512"
      role="img"
      aria-label="Nyx logo: a D-pad surrounded by four face buttons"
    >
      <defs>
        <linearGradient id="nyx-bg" x1="0" y1="0" x2="1" y2="1">
          <stop offset="0" stopColor="#151c48" />
          <stop offset=".6" stopColor="#0c1026" />
          <stop offset="1" stopColor="#090a0f" />
        </linearGradient>
        <radialGradient id="nyx-aurora-a" cx=".15" cy=".1" r=".7">
          <stop offset="0" stopColor="#22d3ee" stopOpacity=".38" />
          <stop offset="1" stopColor="#22d3ee" stopOpacity="0" />
        </radialGradient>
        <radialGradient id="nyx-aurora-b" cx=".9" cy=".95" r=".7">
          <stop offset="0" stopColor="#6366f1" stopOpacity=".5" />
          <stop offset="1" stopColor="#6366f1" stopOpacity="0" />
        </radialGradient>
        <linearGradient id="nyx-sheen" x1="0" y1="0" x2="0" y2="1">
          <stop offset="0" stopColor="#fff" stopOpacity=".14" />
          <stop offset=".45" stopColor="#fff" stopOpacity="0" />
        </linearGradient>
        <linearGradient
          id="nyx-button"
          gradientUnits="userSpaceOnUse"
          x1="112"
          y1="112"
          x2="400"
          y2="400"
        >
          <stop offset="0" stopColor="#67e8f9" />
          <stop offset=".5" stopColor="#22d3ee" />
          <stop offset="1" stopColor="#4f46e5" />
        </linearGradient>
        <linearGradient
          id="nyx-pad-fill"
          gradientUnits="userSpaceOnUse"
          x1="120"
          y1="120"
          x2="392"
          y2="392"
        >
          <stop offset="0" stopColor="#fff" />
          <stop offset="1" stopColor="#a5f3fc" />
        </linearGradient>
        <linearGradient id="nyx-sweep-fill" x1="0" y1="0" x2="1" y2="0">
          <stop offset="0" stopColor="#fff" stopOpacity="0" />
          <stop offset=".5" stopColor="#fff" stopOpacity=".28" />
          <stop offset="1" stopColor="#fff" stopOpacity="0" />
        </linearGradient>
        <filter id="nyx-glow" x="-30%" y="-30%" width="160%" height="160%">
          <feDropShadow
            dx="0"
            dy="16"
            stdDeviation="20"
            floodColor="#22d3ee"
            floodOpacity=".35"
          />
        </filter>
        <clipPath id="nyx-clip">
          <rect width="512" height="512" rx="120" />
        </clipPath>
      </defs>
      <g className="intro-tile">
        <rect width="512" height="512" rx="120" fill="url(#nyx-bg)" />
        <rect width="512" height="512" rx="120" fill="url(#nyx-aurora-a)" />
        <rect width="512" height="512" rx="120" fill="url(#nyx-aurora-b)" />
        <rect width="512" height="512" rx="120" fill="url(#nyx-sheen)" />
      </g>
      <g filter="url(#nyx-glow)">
        <g fill="url(#nyx-button)">
          <circle className="intro-button" cx="158" cy="158" r="46" />
          <circle className="intro-button" cx="354" cy="158" r="46" />
          <circle className="intro-button" cx="354" cy="354" r="46" />
          <circle className="intro-button" cx="158" cy="354" r="46" />
        </g>
        <g className="intro-pad" fill="url(#nyx-pad-fill)">
          <rect x="217" y="122" width="78" height="268" rx="26" />
          <rect x="122" y="217" width="268" height="78" rx="26" />
        </g>
      </g>
      <circle
        className="intro-ring"
        cx="256"
        cy="256"
        r="40"
        fill="none"
        stroke="#22d3ee"
        strokeWidth="3"
      />
      <g clipPath="url(#nyx-clip)">
        <g transform="rotate(20 256 256)">
          <rect
            className="intro-sweep"
            x="-160"
            y="-120"
            width="110"
            height="760"
            fill="url(#nyx-sweep-fill)"
          />
        </g>
      </g>
    </svg>
  );
}
