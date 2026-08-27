import { MapPinIcon, BookmarkIcon } from '../components/Icons'

// Single source of truth for the app's tab bar, shared by the mobile
// TabBar and the desktop nav so their labels can't drift apart.
export const NAV_TABS = [
  { id: 'spots', label: 'Spots', Icon: MapPinIcon },
  { id: 'saved', label: 'Saved', Icon: BookmarkIcon },
  { id: 'profile', label: 'Profile', Icon: null },
]
