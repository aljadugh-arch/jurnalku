import { create } from 'zustand'

interface SidebarState {
  isOpen: boolean          // desktop: expand/collapse sidebar
  mobileOpen: boolean      // mobile/tablet: off-canvas drawer visible
  toggle: () => void
  close: () => void
  open: () => void
  toggleMobile: () => void
  closeMobile: () => void
  openMobile: () => void
}

export const useSidebarStore = create<SidebarState>((set) => ({
  isOpen: typeof window !== 'undefined' ? window.innerWidth >= 1024 : true,
  mobileOpen: false,
  toggle: () => set((s) => ({ isOpen: !s.isOpen })),
  close: () => set({ isOpen: false }),
  open: () => set({ isOpen: true }),
  toggleMobile: () => set((s) => ({ mobileOpen: !s.mobileOpen })),
  closeMobile: () => set({ mobileOpen: false }),
  openMobile: () => set({ mobileOpen: true }),
}))
