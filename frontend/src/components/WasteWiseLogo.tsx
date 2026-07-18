type WasteWiseLogoProps = {
  className?: string;
  compact?: boolean;
};

export function WasteWiseLogo({
  className = "",
  compact = false,
}: WasteWiseLogoProps) {
  return (
    <div className={`inline-flex items-center gap-3 ${className}`}>
      <svg
        width="48"
        height="48"
        viewBox="0 0 48 48"
        fill="none"
        xmlns="http://www.w3.org/2000/svg"
        aria-hidden="true"
        className="shrink-0"
      >
        <defs>
          <linearGradient
            id="wastewise-logo-gradient"
            x1="8"
            y1="6"
            x2="42"
            y2="44"
            gradientUnits="userSpaceOnUse"
          >
            <stop stopColor="#FF57A8" />
            <stop offset="1" stopColor="#F72585" />
          </linearGradient>

          <filter
            id="wastewise-logo-glow"
            x="-20%"
            y="-20%"
            width="140%"
            height="140%"
          >
            <feGaussianBlur stdDeviation="2.5" result="blur" />
            <feMerge>
              <feMergeNode in="blur" />
              <feMergeNode in="SourceGraphic" />
            </feMerge>
          </filter>
        </defs>

        <circle
          cx="24"
          cy="24"
          r="22"
          fill="url(#wastewise-logo-gradient)"
          filter="url(#wastewise-logo-glow)"
        />

        <path
          d="M15.5 26.5C15.5 19.4 20.7 14.5 31.8 13.4C32.3 24.3 27.8 31.7 20.4 31.7C17.4 31.7 15.5 29.8 15.5 26.5Z"
          stroke="white"
          strokeWidth="2.2"
          strokeLinecap="round"
          strokeLinejoin="round"
        />

        <path
          d="M16.8 31.8C19.7 27.6 23.5 23.8 29.4 19.9"
          stroke="white"
          strokeWidth="2.2"
          strokeLinecap="round"
        />

        <circle cx="30.8" cy="19" r="1.4" fill="white" />

        <path
          d="M29.6 19H35"
          stroke="white"
          strokeWidth="1.7"
          strokeLinecap="round"
        />

        <circle cx="36.3" cy="19" r="1.25" fill="white" />

        <path
          d="M26.5 22.2V17.5"
          stroke="white"
          strokeWidth="1.7"
          strokeLinecap="round"
        />

        <circle cx="26.5" cy="16" r="1.25" fill="white" />
      </svg>

      {!compact && (
        <div className="leading-none">
          <div className="text-[20px] font-extrabold tracking-[-0.04em] text-white">
            WasteWise
          </div>

          <div className="mt-1 text-[11px] font-bold uppercase tracking-[0.24em] text-[#ff3d98]">
            AI
          </div>
        </div>
      )}
    </div>
  );
}