/**
 * Logo VeryHevy (V + H + barre), monochrome : il hérite de la couleur du
 * texte (`fill="currentColor"`) et suit donc la couleur d'accent choisie.
 */
export function Logo({ size = 24, className }: { size?: number; className?: string }) {
  return (
    <svg
      xmlns="http://www.w3.org/2000/svg"
      width={size}
      height={size}
      viewBox="0 0 512 512"
      fill="none"
      className={className}
      role="img"
      aria-label="VeryHevy"
    >
      <g fill="currentColor">
        {/* V : stance large, élan vers le haut */}
        <path d="M72 94H138L225 318L256 238L290 324L257 410H201L72 94Z" />
        {/* H : contrepoint architectural */}
        <path d="M280 94H342V218H384V94H446V418H384V282H342V418H280V94Z" />
        {/* Barre : ancre horizontale continue */}
        <rect x="76" y="231" width="360" height="50" rx="25" />
        <rect x="48" y="199" width="32" height="114" rx="12" />
        <rect x="24" y="178" width="32" height="156" rx="12" />
        <rect x="432" y="199" width="32" height="114" rx="12" />
        <rect x="456" y="178" width="32" height="156" rx="12" />
      </g>
    </svg>
  )
}
