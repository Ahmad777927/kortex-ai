import React from 'react';

interface AiLogoProps extends React.SVGProps<SVGSVGElement> {
  className?: string;
  size?: number;
}

export function UniqueAiLogo({ className = 'h-8 w-8', size = 36, ...props }: AiLogoProps) {
  return (
    <svg
      width={size}
      height={size}
      viewBox="0 0 48 48"
      fill="none"
      xmlns="http://www.w3.org/2000/svg"
      className={className}
      {...props}
    >
      <defs>
        {/* Core neural gradients */}
        <linearGradient id="kortex-linear-1" x1="0%" y1="0%" x2="100%" y2="100%">
          <stop offset="0%" stopColor="#818CF8" />
          <stop offset="50%" stopColor="#6366F1" />
          <stop offset="100%" stopColor="#4F46E5" />
        </linearGradient>

        <linearGradient id="kortex-linear-2" x1="100%" y1="0%" x2="0%" y2="100%">
          <stop offset="0%" stopColor="#06B6D4" />
          <stop offset="50%" stopColor="#3B82F6" />
          <stop offset="100%" stopColor="#A855F7" />
        </linearGradient>

        <linearGradient id="kortex-accent" x1="0%" y1="50%" x2="100%" y2="50%">
          <stop offset="0%" stopColor="#38BDF8" />
          <stop offset="100%" stopColor="#C084FC" />
        </linearGradient>

        <radialGradient id="kortex-glow" cx="50%" cy="50%" r="50%">
          <stop offset="0%" stopColor="#6366F1" stopOpacity="0.35" />
          <stop offset="60%" stopColor="#8B5CF6" stopOpacity="0.12" />
          <stop offset="100%" stopColor="#6366F1" stopOpacity="0" />
        </radialGradient>
      </defs>

      {/* Radiant ambient aura */}
      <circle cx="24" cy="24" r="22" fill="url(#kortex-glow)" />

      {/* Outer Hexagonal Shield with subtle rotation */}
      <path
        d="M24 5L41.32 15V33L24 43L6.68 33V15L24 5Z"
        stroke="url(#kortex-linear-1)"
        strokeWidth="2.2"
        strokeLinecap="round"
        strokeLinejoin="round"
      />

      {/* Inner Inverted Hexagon creating 3D isometric crystalline depth */}
      <path
        d="M24 13L32.66 18V28L24 33L15.34 28V18L24 13Z"
        stroke="url(#kortex-linear-2)"
        strokeWidth="1.8"
        strokeLinecap="round"
        strokeLinejoin="round"
      />

      {/* Dynamic Cross-Network Neural Bridges */}
      <path
        d="M24 5V13M41.32 15L32.66 18M41.32 33L32.66 28M24 43V33M6.68 33L15.34 28M6.68 15L15.34 18"
        stroke="url(#kortex-accent)"
        strokeWidth="1.5"
        strokeLinecap="round"
        strokeLinejoin="round"
        strokeDasharray="2 2"
      />

      {/* Central Quantum Nucleus */}
      <circle cx="24" cy="24" r="4" fill="url(#kortex-linear-1)" />
      <circle cx="24" cy="24" r="2" fill="#FFFFFF" />
      <circle cx="24" cy="24" r="6.5" stroke="url(#kortex-accent)" strokeWidth="1.2" strokeOpacity="0.8" />
    </svg>
  );
}

