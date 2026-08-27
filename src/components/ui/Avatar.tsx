import { useEffect, useState } from 'react'

// Circular avatar: shows photo if available, else gradient initials fallback.
export default function Avatar({ src, name, size = 72, className = '' }: {
  src?: string | null
  name?: string
  size?: number
  className?: string
}) {
  const [failed, setFailed] = useState(false)
  useEffect(() => setFailed(false), [src])

  const initials = (name || '?')
    .trim()
    .split(/\s+/)
    .slice(0, 2)
    .map((w) => w.charAt(0).toUpperCase())
    .join('')

  const dim = { width: size, height: size }

  if (src && !failed) {
    return (
      <img
        src={src}
        alt={name || 'avatar'}
        style={dim}
        onError={() => setFailed(true)}
        className={'rounded-full object-cover border-4 border-white shadow-md ' + className}
      />
    )
  }

  return (
    <div
      style={dim}
      className={'rounded-full border-4 border-white shadow-md bg-gradient-to-br from-primary to-accent flex items-center justify-center text-white font-bold ' + className}
    >
      <span style={{ fontSize: size * 0.38 }}>{initials}</span>
    </div>
  )
}
