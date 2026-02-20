interface PmiAgentSymbolProps {
  className?: string
}

/**
 * PMI Agent symbol - pixel art "PMI" icon for title bar
 * Uses accent color from theme (currentColor from className)
 */
export function PmiAgentSymbol({ className }: PmiAgentSymbolProps) {
  return (
    <svg
      viewBox="5 10 22 12"
      className={className}
      fill="currentColor"
      xmlns="http://www.w3.org/2000/svg"
    >
      {/* Letter P */}
      <rect x="6" y="11" width="2" height="10" />
      <rect x="8" y="11" width="2" height="2" />
      <rect x="8" y="15" width="2" height="2" />
      <rect x="10" y="12" width="1" height="4" />

      {/* Letter M */}
      <rect x="13" y="11" width="2" height="10" />
      <rect x="18" y="11" width="2" height="10" />
      <rect x="15" y="12" width="1" height="2" />
      <rect x="16" y="13" width="1" height="2" />
      <rect x="17" y="12" width="1" height="2" />

      {/* Letter I */}
      <rect x="22" y="11" width="4" height="2" />
      <rect x="23" y="13" width="2" height="6" />
      <rect x="22" y="19" width="4" height="2" />
    </svg>
  )
}
