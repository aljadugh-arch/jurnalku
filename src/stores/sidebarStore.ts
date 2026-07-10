import { create } from 'zustand'

interface SidebarState {
  isOpen: boolean
  toggle: () => void
  close: () => void
  open: () => void
}

export const useSidebarStore = create<SidebarState>((set) => ({
  isOpen: typeof window !== 'undefined' ? window.innerWidth >= 1024 : true,
  toggle: () => set((s) => ({ isOpen: !s.isOpen })),
  close: () => set({ isOpen: false }),
  open: () => set({ isOpen: true }),
}))
