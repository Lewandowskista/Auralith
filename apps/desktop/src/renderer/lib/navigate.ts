import type { NavSection } from '../components/NavRail'

export function navigateTo(section: NavSection): void {
  window.dispatchEvent(new CustomEvent('auralith:navigate', { detail: section }))
}
