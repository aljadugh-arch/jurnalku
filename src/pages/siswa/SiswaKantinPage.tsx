import { useState, useEffect } from 'react'
import { Search, ShoppingCart, Heart, CreditCard, Loader2, CheckCircle, XCircle, Plus, Minus } from 'lucide-react'
import toast from 'react-hot-toast'
import api from '../../services/api'

interface MenuItem {
  id: string
  nama: string
  deskripsi: string
  harga: number
  stok: number
  kategori: string
  gambar: string
  aktif: boolean
}

interface CartItem extends MenuItem {
  qty: number
}

export default function SiswaKantinPage() {
  const [menus, setMenus] = useState<MenuItem[]>([])
  const [cart, setCart] = useState<CartItem[]>([])
  const [loading, setLoading] = useState(true)
  const [search, setSearch] = useState('')
  const [kategoriFilter, setKategoriFilter] = useState('semua')
  const [kategoris, setKategoris] = useState<string[]>(['semua'])
  const [checkingOut, setCheckingOut] = useState(false)
  const [saldo, setSaldo] = useState(0)
  const [showCart, setShowCart] = useState(false)

  useEffect(() => {
    loadMenus()
    loadSaldo()
  }, [])

  const loadMenus = async () => {
    try {
      const res = await api.get<{ data: MenuItem[] }>('/api/kantin/menu?aktif=true')
      setMenus(res.data.data)
      const cats = [...new Set(res.data.data.map(m => m.kategori).filter(Boolean))]
      setKategoris(['semua', ...cats])
    } catch (e) {
      toast.error('Gagal memuat menu kantin')
    } finally {
      setLoading(false)
    }
  }

  const loadSaldo = async () => {
    try {
      const res = await api.get('/api/cashless/saldo')
      setSaldo(res.data.saldo || 0)
    } catch (e) {
      console.error('Gagal memuat saldo')
    }
  }

  const filteredMenus = menus.filter(m => {
    const matchSearch = m.nama.toLowerCase().includes(search.toLowerCase()) ||
                       m.deskripsi.toLowerCase().includes(search.toLowerCase())
    const matchKategori = kategoriFilter === 'semua' || m.kategori === kategoriFilter
    return matchSearch && matchKategori && m.aktif && m.stok > 0
  })

  const addToCart = (item: MenuItem) => {
    setCart(prev => {
      const existing = prev.find(c => c.id === item.id)
      if (existing) {
        if (existing.qty >= item.stok) {
          toast.error('Stok tidak mencukupi')
          return prev
        }
        return prev.map(c => c.id === item.id ? { ...c, qty: c.qty + 1 } : c)
      }
      return [...prev, { ...item, qty: 1 }]
    })
    toast.success(`${item.nama} ditambahkan ke keranjang`)
  }

  const updateQty = (id: string, delta: number) => {
    setCart(prev => {
      const item = prev.find(c => c.id === id)
      if (!item) return prev
      const newQty = item.qty + delta
      if (newQty <= 0) return prev.filter(c => c.id !== id)
      if (newQty > item.stok) {
        toast.error('Stok tidak mencukupi')
        return prev
      }
      return prev.map(c => c.id === id ? { ...c, qty: newQty } : c)
    })
  }

  const removeFromCart = (id: string) => {
    setCart(prev => prev.filter(c => c.id !== id))
  }

  const cartTotal = cart.reduce((sum, item) => sum + item.harga * item.qty, 0)
  const cartCount = cart.reduce((sum, item) => sum + item.qty, 0)

  const checkout = async () => {
    if (cart.length === 0) return
    if (cartTotal > saldo) {
      toast.error('Saldo tidak mencukupi. Silakan top-up terlebih dahulu.')
      return
    }

    setCheckingOut(true)
    try {
      const orderItems = cart.map(item => ({
        menu_id: item.id,
        qty: item.qty,
        harga: item.harga
      }))
      const res = await api.post('/api/kantin/order', { items: orderItems })
      toast.success('Pesanan berhasil dibuat!')
      setCart([])
      setShowCart(false)
      loadSaldo()
    } catch (e: any) {
      toast.error(e.response?.data?.error || 'Gagal membuat pesanan')
    } finally {
      setCheckingOut(false)
    }
  }

  const formatRupiah = (n: number) => new Intl.NumberFormat('id-ID', { style: 'currency', currency: 'IDR', minimumFractionDigits: 0 }).format(n)

  return (
    <div className="min-h-screen bg-gray-50 dark:bg-gray-900">
      {/* Header */}
      <header className="bg-white dark:bg-gray-800 border-b border-gray-200 dark:border-gray-700 sticky top-0 z-40">
        <div className="max-w-5xl mx-auto px-4 py-3 flex items-center justify-between">
          <h1 className="text-xl font-bold text-gray-900 dark:text-white">E-Kantin</h1>
          <div className="flex items-center gap-3">
            <div className="bg-green-100 dark:bg-green-900/30 text-green-700 dark:text-green-400 px-3 py-1 rounded-full text-sm font-medium flex items-center gap-1">
              <CreditCard size={14} /> Saldo: {formatRupiah(saldo)}
            </div>
            <button
              onClick={() => setShowCart(!showCart)}
              className="relative p-2 text-gray-600 dark:text-gray-300 hover:bg-gray-100 dark:hover:bg-gray-700 rounded-lg"
            >
              <ShoppingCart size={24} />
              {cartCount > 0 && (
                <span className="absolute -top-1 -right-1 bg-red-500 text-white text-xs w-5 h-5 rounded-full flex items-center justify-center">
                  {cartCount > 9 ? '9+' : cartCount}
                </span>
              )}
            </button>
          </div>
        </div>
      </header>

      {/* Main Content */}
      <main className="max-w-5xl mx-auto px-4 py-6">
        {/* Search & Filter */}
        <div className="mb-6">
          <div className="relative mb-4">
            <Search className="absolute left-3 top-1/2 -translate-y-1/2 text-gray-400" size={20} />
            <input
              type="text"
              placeholder="Cari makanan/minuman..."
              value={search}
              onChange={e => setSearch(e.target.value)}
              className="w-full pl-10 pr-4 py-2 border border-gray-300 dark:border-gray-600 rounded-lg bg-white dark:bg-gray-700 text-gray-900 dark:text-white"
            />
          </div>
          <div className="flex gap-2 overflow-x-auto pb-2">
            {kategoris.map((kat, i) => (
              <button
                key={kat}
                onClick={() => setKategoriFilter(kat)}
                className={`whitespace-nowrap px-4 py-2 rounded-full text-sm font-medium transition-colors ${
                  kategoriFilter === kat
                    ? 'bg-primary text-white'
                    : 'bg-gray-100 dark:bg-gray-700 text-gray-700 dark:text-gray-200 hover:bg-gray-200 dark:hover:bg-gray-600'
                }`}
              >
                {kat.charAt(0).toUpperCase() + kat.slice(1)}
              </button>
            ))}
          </div>
        </div>

        {/* Menu Grid */}
        {loading ? (
          <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-3 gap-4">
            {[...Array(6)].map((_, i) => (
              <div key={i} className="bg-white dark:bg-gray-800 rounded-xl border border-gray-200 dark:border-gray-700 animate-pulse">
                <div className="aspect-video bg-gray-200 dark:bg-gray-700 rounded-t-xl" />
                <div className="p-4 space-y-3">
                  <div className="h-4 bg-gray-200 dark:bg-gray-700 rounded w-3/4" />
                  <div className="h-4 bg-gray-200 dark:bg-gray-700 rounded w-1/2" />
                  <div className="h-4 bg-gray-200 dark:bg-gray-700 rounded w-1/4" />
                </div>
              </div>
            ))}
          </div>
        ) : filteredMenus.length === 0 ? (
          <div className="text-center py-12 text-gray-500 dark:text-gray-400">
            <Heart size={48} className="mx-auto mb-4 opacity-30" />
            <p>Tidak ada menu yang tersedia</p>
          </div>
        ) : (
          <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-3 gap-4">
            {filteredMenus.map(item => (
              <div key={item.id} className="bg-white dark:bg-gray-800 rounded-xl border border-gray-200 dark:border-gray-700 overflow-hidden hover:shadow-lg transition-shadow">
                <div className="relative aspect-video overflow-hidden">
                  {item.gambar ? (
                    <img src={item.gambar} alt={item.nama} className="w-full h-full object-cover" />
                  ) : (
                    <div className="w-full h-full bg-gray-100 dark:bg-gray-700 flex items-center justify-center">
                      <Heart size={32} className="text-gray-300 dark:text-gray-600" />
                    </div>
                  )}
                  {item.stok <= 5 && item.stok > 0 && (
                    <span className="absolute top-2 right-2 bg-orange-500 text-white text-xs px-2 py-1 rounded-full">
                      Sisa {item.stok}
                    </span>
                  )}
                  {item.stok === 0 && (
                    <div className="absolute inset-0 bg-black/50 flex items-center justify-center">
                      <span className="bg-red-500 text-white px-4 py-2 rounded-lg font-medium">Habis</span>
                    </div>
                  )}
                </div>
                <div className="p-4">
                  <div className="flex items-start justify-between gap-2 mb-2">
                    <h3 className="font-semibold text-gray-900 dark:text-white flex-1">{item.nama}</h3>
                    <span className="text-lg font-bold text-primary">{formatRupiah(item.harga)}</span>
                  </div>
                  <p className="text-sm text-gray-500 dark:text-gray-400 mb-3 line-clamp-2">{item.deskripsi || '-'}</p>
                  <div className="flex items-center justify-between">
                    <span className="text-xs px-2 py-1 bg-gray-100 dark:bg-gray-700 rounded-full text-gray-600 dark:text-gray-300">
                      {item.kategori}
                    </span>
                    <button
                      onClick={() => addToCart(item)}
                      disabled={item.stok === 0}
                      className="flex-1 ml-3 px-3 py-2 bg-primary text-white rounded-lg text-sm font-medium hover:bg-primary/90 disabled:opacity-50 disabled:cursor-not-allowed transition-colors"
                    >
                      + Keranjang
                    </button>
                  </div>
                </div>
              </div>
            ))}
          </div>
        )}

        {/* Cart Sidebar / Modal */}
        {showCart && (
          <div className="fixed inset-0 z-50 lg:relative lg:static lg:z-auto">
            <div className="lg:hidden fixed inset-0 bg-black/50" onClick={() => setShowCart(false)} />
            <aside className="fixed right-0 top-0 h-full w-full lg:w-96 bg-white dark:bg-gray-800 border-l border-gray-200 dark:border-gray-700 shadow-xl z-50 lg:static lg:h-auto lg:min-h-[500px] rounded-xl lg:rounded-none lg:border-0 lg:shadow-none flex flex-col">
              <div className="p-4 border-b border-gray-200 dark:border-gray-700 flex items-center justify-between">
                <h2 className="font-bold text-lg">Keranjang ({cartCount})</h2>
                <button onClick={() => setShowCart(false)} className="lg:hidden p-1 text-gray-500 hover:text-gray-700">
                  <XCircle size={24} />
                </button>
              </div>
              <div className="flex-1 overflow-y-auto p-4">
                {cart.length === 0 ? (
                  <div className="text-center py-12 text-gray-500 dark:text-gray-400">
                    <ShoppingCart size={48} className="mx-auto mb-4 opacity-30" />
                    <p>Keranjang kosong</p>
                  </div>
                ) : (
                  <div className="space-y-3">
                    {cart.map(item => (
                      <div key={item.id} className="flex gap-3 p-2 bg-gray-50 dark:bg-gray-700 rounded-lg">
                        <div className="w-16 h-16 rounded-lg bg-gray-100 dark:bg-gray-600 flex-shrink-0 overflow-hidden">
                          {item.gambar ? (
                            <img src={item.gambar} alt={item.nama} className="w-full h-full object-cover" />
                          ) : (
                            <Heart size={24} className="mx-auto my-auto text-gray-300" />
                          )}
                        </div>
                        <div className="flex-1 min-w-0">
                          <h4 className="font-medium text-gray-900 dark:text-white truncate">{item.nama}</h4>
                          <p className="text-sm text-primary font-semibold">{formatRupiah(item.harga)}</p>
                          <div className="flex items-center gap-2 mt-2">
                            <button
                              onClick={() => updateQty(item.id, -1)}
                              className="w-8 h-8 rounded border border-gray-300 dark:border-gray-600 flex items-center justify-center text-gray-600 dark:text-gray-300 hover:bg-gray-100 dark:hover:bg-gray-600"
                            >
                              <Minus size={16} />
                            </button>
                            <span className="w-10 text-center text-sm font-medium">{item.qty}</span>
                            <button
                              onClick={() => updateQty(item.id, 1)}
                              className="w-8 h-8 rounded border border-gray-300 dark:border-gray-600 flex items-center justify-center text-gray-600 dark:text-gray-300 hover:bg-gray-100 dark:hover:bg-gray-600"
                            >
                              <Plus size={16} />
                            </button>
                            <button
                              onClick={() => removeFromCart(item.id)}
                              className="ml-auto text-red-500 hover:text-red-700 p-1"
                            >
                              <XCircle size={18} />
                            </button>
                          </div>
                        </div>
                      </div>
                    ))}
                  </div>
                )}
              </div>
              {cart.length > 0 && (
                <div className="p-4 border-t border-gray-200 dark:border-gray-700 bg-gray-50 dark:bg-gray-900/50 rounded-b-xl lg:rounded-b-none">
                  <div className="flex justify-between mb-2">
                    <span className="text-gray-600 dark:text-gray-400">Subtotal</span>
                    <span className="font-semibold">{formatRupiah(cartTotal)}</span>
                  </div>
                  <div className="flex justify-between mb-4">
                    <span className="text-gray-600 dark:text-gray-400">Saldo tersedia</span>
                    <span className="font-semibold text-green-600 dark:text-green-400">{formatRupiah(saldo)}</span>
                  </div>
                  <button
                    onClick={checkout}
                    disabled={checkingOut || cartTotal > saldo}
                    className="w-full py-3 bg-primary text-white rounded-lg font-semibold hover:bg-primary/90 disabled:opacity-50 disabled:cursor-not-allowed transition-colors flex items-center justify-center gap-2"
                  >
                    {checkingOut ? (
                      <>
                        <Loader2 size={18} className="animate-spin" />
                        Memproses...
                      </>
                    ) : (
                      <>
                        <CheckCircle size={18} />
                        Bayar & Pesan
                      </>
                    )}
                  </button>
                  {cartTotal > saldo && (
                    <p className="text-center text-sm text-red-500 mt-2">Saldo tidak mencukupi. Silakan top-up terlebih dahulu.</p>
                  )}
                </div>
              )}
            </aside>
          </div>
        )}
      </main>
    </div>
  )
}