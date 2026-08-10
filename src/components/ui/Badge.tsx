import { ReactNode } from 'react'

type Tone = 'green' | 'blue' | 'yellow' | 'red' | 'gray' | 'purple'

const tones: Record<Tone, string> = {
  green: 'bg-green-100 text-green-700',
  blue: 'bg-blue-100 text-blue-700',
  yellow: 'bg-yellow-100 text-yellow-700',
  red: 'bg-red-100 text-red-700',
  gray: 'bg-gray-100 text-gray-700',
  purple: 'bg-purple-100 text-purple-700',
}

export default function Badge({ tone = 'gray', children }: { tone?: Tone; children: ReactNode }) {
  return <span className={'px-2 py-0.5 rounded-full text-xs font-medium whitespace-nowrap ' + tones[tone]}>{children}</span>
}
