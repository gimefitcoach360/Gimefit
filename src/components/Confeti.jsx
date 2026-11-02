import { useMemo } from 'react'

/** Confeti violeta que cae una vez (se omite si la persona prefiere menos movimiento) */
export default function Confeti() {
  const piezas = useMemo(() => Array.from({ length: 60 }, (_, i) => ({
    left: Math.random() * 100,
    delay: Math.random() * 0.8,
    dur: 2.2 + Math.random() * 1.6,
    size: 6 + Math.random() * 6,
    color: ['#A855F7', '#C084FC', '#E9D5FF', '#FFFFFF', '#6B21A8'][i % 5],
    giro: Math.random() * 360,
    redondo: i % 3 === 0,
  })), [])
  return (
    <div aria-hidden="true" className="confeti">
      <style>{`
        .confeti { position: fixed; inset: 0; pointer-events: none; overflow: hidden; z-index: 50; }
        .confeti i { position: absolute; top: -20px; opacity: 0; animation: caer var(--d) ease-in var(--t) 1 forwards; }
        @keyframes caer { 0% { opacity: 1; transform: translateY(0) rotate(var(--g)); } 100% { opacity: 0.9; transform: translateY(105vh) rotate(calc(var(--g) + 540deg)); } }
        @media (prefers-reduced-motion: reduce) { .confeti { display: none; } }
      `}</style>
      {piezas.map((p, i) => (
        <i key={i} style={{
          left: `${p.left}%`, width: p.size, height: p.redondo ? p.size : p.size * 0.5, background: p.color,
          borderRadius: p.redondo ? '50%' : 2, '--d': `${p.dur}s`, '--t': `${p.delay}s`, '--g': `${p.giro}deg`,
        }} />
      ))}
    </div>
  )
}
