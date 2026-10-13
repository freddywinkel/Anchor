import { useId } from "react";

const enamelLight = "color-mix(in srgb, var(--dp-accent) 22%, #fffaf0)";
const enamelMid = "color-mix(in srgb, var(--dp-accent) 42%, #eee5d7)";
const enamelShade = "color-mix(in srgb, var(--dp-accent) 64%, #c3b8a8)";
const enamelEdge = "color-mix(in srgb, var(--dp-accent) 60%, #766759)";
const expressionInk = "var(--dp-illustration-ink, #443b33)";

/** Decorative artwork. The surrounding button supplies its name and state. */
export function PanIllustration({ level }: { level: number }) {
  const id = useId().replace(/:/g, "");
  const lidLift = level <= 2 ? 0 : level === 3 ? -4 : level === 4 ? -7 : -10;
  const lidTilt = level < 4 ? 0 : level === 4 ? -7 : -14;
  return (
    <svg
      className="dp-pan-illustration"
      viewBox="0 0 80 80"
      width="52"
      height="52"
      fill="none"
      aria-hidden="true"
      focusable="false"
    >
      <defs>
        <linearGradient
          id={`${id}-body`}
          x1="18"
          y1="37"
          x2="63"
          y2="71"
          gradientUnits="userSpaceOnUse"
        >
          <stop stopColor={enamelLight} />
          <stop offset="0.48" stopColor={enamelMid} />
          <stop offset="1" stopColor={enamelShade} />
        </linearGradient>
        <linearGradient
          id={`${id}-lid`}
          x1="28"
          y1="24"
          x2="50"
          y2="39"
          gradientUnits="userSpaceOnUse"
        >
          <stop stopColor="#fffaf0" />
          <stop offset="0.45" stopColor={enamelLight} />
          <stop offset="1" stopColor={enamelShade} />
        </linearGradient>
        <linearGradient
          id={`${id}-handle`}
          x1="8"
          y1="40"
          x2="12"
          y2="53"
          gradientUnits="userSpaceOnUse"
        >
          <stop stopColor={enamelMid} />
          <stop offset="1" stopColor={enamelShade} />
        </linearGradient>
      </defs>

      <ellipse cx="40" cy="72" rx="26" ry="3.5" fill="#17201d" opacity="0.12" />
      <g
        stroke="currentColor"
        strokeWidth="2.7"
        strokeLinecap="round"
        opacity="0.6"
      >
        {level === 2 && <path d="M55 28 C60 24 51 21 56 16" />}
        {level === 3 && (
          <>
            <path d="M25 29 C19 24 30 20 25 14" />
            <path d="M55 27 C61 22 51 18 56 12" />
          </>
        )}
        {level >= 4 && (
          <>
            <path d="M23 30 C15 24 28 19 22 11" />
            <path d="M40 23 C33 18 45 13 40 5" />
            <path d="M58 30 C65 24 53 19 59 10" />
          </>
        )}
        {level === 5 && (
          <>
            <path d="M11 29 L7 24 M68 28 L73 23" strokeWidth="2.4" />
            <path
              d="M16 16 L14 12 M65 16 L68 11"
              strokeWidth="2.2"
              opacity="0.65"
            />
          </>
        )}
      </g>

      <path
        d="M17 43 H11 C5 43 5 51 11 51 H18 M63 43 H69 C75 43 75 51 69 51 H62"
        stroke={enamelEdge}
        strokeWidth="7"
        strokeLinecap="round"
      />
      <path
        d="M17 42 H11 C7 42 7 48 11 48 H18 M63 42 H69 C73 42 73 48 69 48 H62"
        stroke={`url(#${id}-handle)`}
        strokeWidth="4.5"
        strokeLinecap="round"
      />
      <path
        d="M15 37 H65 L62 59 C61 66 57 70 50 70 H30 C23 70 19 66 18 59 Z"
        fill={`url(#${id}-body)`}
        stroke={enamelEdge}
        strokeWidth="1.4"
      />
      <path
        d="M21 45 L23 58 C24 63 26 65 29 66"
        stroke="#fffdf8"
        strokeWidth="2.5"
        strokeLinecap="round"
        opacity="0.5"
      />
      <path
        d="M32 67 H50 C54 67 57 65 58 61"
        stroke={enamelEdge}
        strokeWidth="1.5"
        strokeLinecap="round"
        opacity="0.28"
      />
      <ellipse
        cx="40"
        cy="37"
        rx="25"
        ry="5"
        fill={enamelShade}
        stroke={enamelEdge}
        strokeWidth="1.4"
      />
      <ellipse
        cx="40"
        cy="36.5"
        rx="21"
        ry="2.6"
        fill={enamelEdge}
        opacity="0.48"
      />
      {level === 5 && (
        <g fill={enamelLight}>
          <circle cx="25" cy="35" r="2.5" />
          <circle cx="34" cy="36" r="2" />
          <circle cx="48" cy="35" r="2.5" />
          <circle cx="57" cy="36" r="1.7" />
        </g>
      )}

      <g transform={`translate(0 ${lidLift}) rotate(${lidTilt} 40 32)`}>
        <path
          d="M15 34 C21 31 24 27 34 27 H46 C56 27 59 31 65 34 Q66 36 63 37 H17 Q14 36 15 34 Z"
          fill={`url(#${id}-lid)`}
          stroke={enamelEdge}
          strokeWidth="1.4"
          strokeLinejoin="round"
        />
        <path
          d="M34 26 C34 20 46 20 46 26"
          stroke={enamelEdge}
          strokeWidth="4.5"
          strokeLinecap="round"
        />
        <path
          d="M36 24 C37 22 42 22 44 24"
          stroke={enamelLight}
          strokeWidth="1.4"
          strokeLinecap="round"
        />
        <path
          d="M23 33 Q32 29 42 30"
          stroke="#fffdf8"
          strokeWidth="2"
          strokeLinecap="round"
          opacity="0.8"
        />
      </g>

      <g
        stroke={expressionInk}
        strokeWidth="2.1"
        strokeLinecap="round"
        strokeLinejoin="round"
      >
        {level === 1 ? (
          <>
            <path d="M27 50 Q31 53 35 50 M45 50 Q49 53 53 50" />
            <path d="M36 59 Q40 61 44 59" />
          </>
        ) : (
          <>
            {level < 4 ? (
              <>
                <path d="M31 49 V51 M49 49 V51" strokeWidth="2.9" />
                <path d={level === 2 ? "M36 59 H44" : "M35 60 Q40 57 45 60"} />
              </>
            ) : (
              <>
                <path d="M27 45 L33 43 M47 43 L53 45" strokeWidth="1.8" />
                <ellipse
                  cx="31"
                  cy="51"
                  rx="1.6"
                  ry={level === 5 ? "2.6" : "2"}
                  fill={expressionInk}
                  stroke="none"
                />
                <ellipse
                  cx="49"
                  cy="51"
                  rx="1.6"
                  ry={level === 5 ? "2.6" : "2"}
                  fill={expressionInk}
                  stroke="none"
                />
                <ellipse
                  cx="40"
                  cy="60"
                  rx={level === 5 ? "3.7" : "2.8"}
                  ry={level === 5 ? "4" : "2.6"}
                  fill={expressionInk}
                  stroke="none"
                />
              </>
            )}
          </>
        )}
      </g>
    </svg>
  );
}

/** Mood describes pleasantness separately from the pots' emotional tension. */
export function MoodIllustration({ mood }: { mood: number }) {
  const id = useId().replace(/:/g, "");
  return (
    <svg
      className="dp-mood-face dp-mood-illustration"
      viewBox="0 0 80 80"
      width="52"
      height="52"
      fill="none"
      aria-hidden="true"
      focusable="false"
    >
      <defs>
        <radialGradient id={`${id}-face`} cx="0.34" cy="0.25" r="0.84">
          <stop stopColor="#fff0cb" />
          <stop offset="0.57" stopColor="#f1d194" />
          <stop offset="1" stopColor="#d7ab68" />
        </radialGradient>
      </defs>
      <ellipse cx="40" cy="73" rx="24" ry="3" fill="#17201d" opacity="0.1" />
      <circle
        cx="40"
        cy="39"
        r="32"
        fill={`url(#${id}-face)`}
        stroke="#c99e65"
        strokeWidth="1.2"
      />
      <path
        d="M18 28 C22 17 34 12 44 15"
        stroke="#fffaf0"
        strokeWidth="3.2"
        strokeLinecap="round"
        opacity="0.62"
      />
      <path
        d="M21 60 C30 69 48 70 59 60"
        stroke="#c39964"
        strokeWidth="1.7"
        strokeLinecap="round"
        opacity="0.3"
      />
      <g
        stroke={expressionInk}
        strokeWidth="2.7"
        strokeLinecap="round"
        strokeLinejoin="round"
      >
        {mood === 2 ? (
          <path d="M23 35 Q28 30 33 35 M47 35 Q52 30 57 35" />
        ) : (
          <>
            <path d="M28 34 V37 M52 34 V37" strokeWidth="3.5" />
            {mood === -2 && (
              <path d="M22 29 L31 26 M49 26 L58 29" strokeWidth="2" />
            )}
          </>
        )}
        {mood === -2 && <path d="M27 54 Q40 42 53 54" />}
        {mood === -1 && <path d="M29 52 Q40 45 51 52" />}
        {mood === 0 && <path d="M30 51 H50" />}
        {mood === 1 && <path d="M28 48 Q40 59 52 48" />}
        {mood === 2 && (
          <path
            d="M26 46 Q40 52 54 46 Q51 61 40 61 Q29 61 26 46 Z"
            fill={expressionInk}
            strokeWidth="1.5"
          />
        )}
      </g>
      {mood === 2 && (
        <path
          d="M33 56 Q40 53 47 56 Q45 59 40 59 Q35 59 33 56 Z"
          fill="#d9967c"
        />
      )}
    </svg>
  );
}
