import { useEffect, useRef, useState } from 'react'
import L from 'leaflet'
import 'leaflet/dist/leaflet.css'
import { Search, Locate } from 'lucide-react'

// Fix default marker icon path (Vite bundling breaks Leaflet's asset URLs)
delete (L.Icon.Default.prototype as any)._getIconUrl
L.Icon.Default.mergeOptions({
  iconRetinaUrl: 'https://unpkg.com/leaflet@1.9.4/dist/images/marker-icon-2x.png',
  iconUrl: 'https://unpkg.com/leaflet@1.9.4/dist/images/marker-icon.png',
  shadowUrl: 'https://unpkg.com/leaflet@1.9.4/dist/images/marker-shadow.png',
})

interface MapPickerProps {
  lat: number | null
  lng: number | null
  radius: number
  onChange: (lat: number, lng: number) => void
}

export default function MapPicker({ lat, lng, radius, onChange }: MapPickerProps) {
  const mapRef = useRef<L.Map | null>(null)
  const markerRef = useRef<L.Marker | null>(null)
  const circleRef = useRef<L.Circle | null>(null)
  const containerRef = useRef<HTMLDivElement>(null)
  const [search, setSearch] = useState('')
  const [searching, setSearching] = useState(false)

  const defaultCenter: [number, number] = [lat || -6.2, lng || 106.816666]

  useEffect(() => {
    if (!containerRef.current || mapRef.current) return
    const map = L.map(containerRef.current).setView(defaultCenter, lat && lng ? 16 : 5)
    L.tileLayer('https://{s}.tile.openstreetmap.org/{z}/{x}/{y}.png', {
      attribution: '&copy; OpenStreetMap contributors',
      maxZoom: 19,
    }).addTo(map)

    map.on('click', (e: L.LeafletMouseEvent) => {
      onChange(e.latlng.lat, e.latlng.lng)
    })

    mapRef.current = map
    return () => { map.remove(); mapRef.current = null }
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [])

  useEffect(() => {
    if (!mapRef.current) return
    if (lat == null || lng == null) return

    if (markerRef.current) markerRef.current.setLatLng([lat, lng])
    else markerRef.current = L.marker([lat, lng], { draggable: true })
      .addTo(mapRef.current)
      .on('dragend', (e) => {
        const p = (e.target as L.Marker).getLatLng()
        onChange(p.lat, p.lng)
      })

    if (circleRef.current) {
      circleRef.current.setLatLng([lat, lng])
      circleRef.current.setRadius(radius)
    } else {
      circleRef.current = L.circle([lat, lng], {
        radius, color: '#1e40af', fillColor: '#3b82f6', fillOpacity: 0.15, weight: 2,
      }).addTo(mapRef.current)
    }

    mapRef.current.setView([lat, lng], mapRef.current.getZoom() < 14 ? 16 : mapRef.current.getZoom())
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [lat, lng, radius])

  const handleSearch = async (e: React.FormEvent) => {
    e.preventDefault()
    if (!search.trim()) return
    setSearching(true)
    try {
      const res = await fetch(`https://nominatim.openstreetmap.org/search?format=json&q=${encodeURIComponent(search)}&limit=1`)
      const data = await res.json()
      if (data[0]) {
        onChange(parseFloat(data[0].lat), parseFloat(data[0].lon))
      }
    } catch {}
    setSearching(false)
  }

  const handleLocate = () => {
    if (!navigator.geolocation) return
    navigator.geolocation.getCurrentPosition((pos) => {
      onChange(pos.coords.latitude, pos.coords.longitude)
    })
  }

  return (
    <div>
      <div className="flex gap-2 mb-2">
        <form onSubmit={handleSearch} className="flex-1 relative">
          <Search size={16} className="absolute left-3 top-1/2 -translate-y-1/2 text-gray-400" />
          <input
            value={search}
            onChange={e => setSearch(e.target.value)}
            placeholder="Cari nama sekolah / alamat..."
            className="w-full pl-9 pr-3 py-2 border rounded-lg text-sm"
          />
        </form>
        <button type="button" onClick={handleSearch as any} disabled={searching}
          className="px-3 py-2 bg-gray-900 text-white text-sm rounded-lg hover:bg-gray-800 disabled:opacity-50">
          {searching ? '...' : 'Cari'}
        </button>
        <button type="button" onClick={handleLocate} title="Gunakan lokasi saya"
          className="px-3 py-2 bg-blue-50 text-blue-600 rounded-lg hover:bg-blue-100">
          <Locate size={16} />
        </button>
      </div>
      <div ref={containerRef} className="w-full h-72 sm:h-96 rounded-xl border border-gray-200 z-0" />
      <p className="text-xs text-gray-400 mt-1.5">Klik di peta atau geser marker untuk menentukan titik sekolah. Lingkaran biru = radius absen.</p>
    </div>
  )
}
