export function ListIcon({ color = '#ffffff', size = 22, filled = false }) {
  return (
    <svg width={size} height={size} viewBox="0 0 48 48" fill="none">
      {filled ? (
        <>
          <rect x="4" y="7" width="40" height="10" rx="3" fill={color} />
          <rect x="4" y="21" width="40" height="10" rx="3" fill={color} />
          <rect x="4" y="35" width="40" height="10" rx="3" fill={color} />
        </>
      ) : (
        <>
          {/* Inset by strokeWidth/2 so stroke sits fully inside the original rect bounds */}
          <rect x="5.5" y="8.5" width="37" height="7" rx="1.5" stroke={color} strokeWidth="3" fill="none" />
          <rect x="5.5" y="22.5" width="37" height="7" rx="1.5" stroke={color} strokeWidth="3" fill="none" />
          <rect x="5.5" y="36.5" width="37" height="7" rx="1.5" stroke={color} strokeWidth="3" fill="none" />
        </>
      )}
    </svg>
  )
}

export function MapPinIcon({ color = '#ffffff', size = 22, filled = false }) {
  if (filled) {
    return (
      // viewBox padded 1.5px on all sides to prevent edge clipping
      // fillRule="evenodd" punches the inner circle as transparent negative space
      <svg width={size * 0.83} height={size} viewBox="-1.5 -1.5 23 27" fill="none">
        <path
          fillRule="evenodd"
          d="M10 0C4.5 0 0 4.5 0 10C0 13.5 2 16.5 10 24C18 16.5 20 13.5 20 10C20 4.5 15.5 0 10 0Z M14 10A4 4 0 1 0 6 10A4 4 0 1 0 14 10Z"
          fill={color}
        />
      </svg>
    )
  }
  return (
    // viewBox padded 1.5px on all sides; clipPath clips stroke to inside the pin shape
    <svg width={size * 0.83} height={size} viewBox="-1.5 -1.5 23 27" fill="none">
      <defs>
        <clipPath id="sw-pin-clip">
          <path d="M10 0C4.5 0 0 4.5 0 10C0 13.5 2 16.5 10 24C18 16.5 20 13.5 20 10C20 4.5 15.5 0 10 0Z" />
        </clipPath>
      </defs>
      <path d="M10 0C4.5 0 0 4.5 0 10C0 13.5 2 16.5 10 24C18 16.5 20 13.5 20 10C20 4.5 15.5 0 10 0Z" stroke={color} strokeWidth="3" fill="none" clipPath="url(#sw-pin-clip)" />
      <circle cx="10" cy="10" r="3.25" stroke={color} strokeWidth="1.5" fill="none" />
    </svg>
  )
}

export function BookmarkIcon({ color = '#6a6c7a', size = 22, filled = false }) {
  const path = 'M8,4 H40 V46 L24,34 L8,46 Z'
  return (
    <svg width={size} height={size} viewBox="0 0 48 48" fill="none">
      {filled ? (
        <path d={path} fill={color} />
      ) : (
        <>
          <defs>
            <clipPath id="sw-bm-clip">
              <path d={path} />
            </clipPath>
          </defs>
          <path d={path} stroke={color} strokeWidth="7" strokeLinejoin="round" fill="none" clipPath="url(#sw-bm-clip)" />
        </>
      )}
    </svg>
  )
}

export function StarIcon({ color = '#6a6c7a', size = 22, filled = false }) {
  return (
    <svg width={size} height={size} viewBox="0 0 48 48" fill="none">
      {filled ? (
        <path
          d="M24 6L28.5 19.5H42L31.5 27L34.5 40.5L24 33L13.5 40.5L16.5 27L6 19.5H19.5L24 6Z"
          fill={color} stroke={color} strokeWidth="1.5" strokeLinejoin="round"
        />
      ) : (
        <path
          d="M24 6L28.5 19.5H42L31.5 27L34.5 40.5L24 33L13.5 40.5L16.5 27L6 19.5H19.5L24 6Z"
          stroke={color} strokeWidth="3" strokeLinejoin="round" fill="none"
        />
      )}
    </svg>
  )
}

export function StarFilledIcon({ color = '#FFFFFF' }) {
  return (
    <svg width="16" height="16" viewBox="0 0 16 16" fill="none">
      <path
        d="M8 2L9.5 6.5H14L10.5 9L11.5 13.5L8 11L4.5 13.5L5.5 9L2 6.5H6.5L8 2Z"
        fill={color} stroke={color} strokeWidth="0.5" strokeLinejoin="round"
      />
    </svg>
  )
}

// Single closed path: head circle merged with shoulder silhouette
const PROFILE_PATH = 'M24 6C29 6 33 10 33 15C33 20 29 24 24 24C32 25 42 34 44 44L4 44C6 34 16 25 24 24C19 24 15 20 15 15C15 10 19 6 24 6Z'

export function ProfileIcon({ color = '#ffffff', size = 22, filled = false }) {
  return (
    <svg width={size} height={size} viewBox="0 0 48 48" fill="none">
      {filled ? (
        <path d={PROFILE_PATH} fill={color} />
      ) : (
        <>
          <defs>
            <clipPath id="sw-prof-clip">
              <path d={PROFILE_PATH} />
            </clipPath>
          </defs>
          <path d={PROFILE_PATH} stroke={color} strokeWidth="5" fill="none" strokeLinejoin="round" clipPath="url(#sw-prof-clip)" />
        </>
      )}
    </svg>
  )
}

export function SearchIcon({ color = '#d4785a', size = 14 }) {
  return (
    <svg width={size} height={size} viewBox="0 0 14 14" fill="none">
      <circle cx="6" cy="6" r="4" stroke={color} strokeWidth="1.2" />
      <line x1="9.5" y1="9.5" x2="13" y2="13" stroke={color} strokeWidth="1.2" strokeLinecap="round" />
    </svg>
  )
}

export function ArrowIcon({ color = '#f5ede0', size = 12 }) {
  return (
    <svg width={size} height={size} viewBox="0 0 12 12" fill="none">
      <path d="M2 6h8M6.5 2.5L10 6l-3.5 3.5" stroke={color} strokeWidth="1.5" strokeLinecap="round" strokeLinejoin="round" />
    </svg>
  )
}

export function BackIcon({ color = '#fff' }) {
  return (
    <svg width="12" height="12" viewBox="0 0 12 12" fill="none">
      <path d="M8 2L4 6L8 10" stroke={color} strokeWidth="1.5" strokeLinecap="round" strokeLinejoin="round" />
    </svg>
  )
}

export function ShareIcon({ color = '#6a6c7a' }) {
  return (
    <svg width="13" height="13" viewBox="0 0 14 14" fill="none">
      <path d="M7 1V9" stroke={color} strokeWidth="1.5" strokeLinecap="round" />
      <path d="M4 4L7 1L10 4" stroke={color} strokeWidth="1.5" strokeLinecap="round" strokeLinejoin="round" />
      <path d="M2 8V12C2 12.6 2.4 13 3 13H11C11.6 13 12 12.6 12 12V8" stroke={color} strokeWidth="1.5" strokeLinecap="round" />
    </svg>
  )
}

export function CloseIcon({ color = '#fff' }) {
  return (
    <svg width="12" height="12" viewBox="0 0 12 12" fill="none">
      <line x1="2" y1="2" x2="10" y2="10" stroke={color} strokeWidth="1.5" strokeLinecap="round" />
      <line x1="10" y1="2" x2="2" y2="10" stroke={color} strokeWidth="1.5" strokeLinecap="round" />
    </svg>
  )
}

export function PlusIcon({ color = '#fff' }) {
  return (
    <svg width="16" height="16" viewBox="0 0 16 16" fill="none">
      <line x1="8" y1="3" x2="8" y2="13" stroke={color} strokeWidth="1.8" strokeLinecap="round" />
      <line x1="3" y1="8" x2="13" y2="8" stroke={color} strokeWidth="1.8" strokeLinecap="round" />
    </svg>
  )
}

export function LocationIcon({ color = '#6a6c7a' }) {
  return (
    <svg width="20" height="22" viewBox="-1.5 -1.5 23 27" fill="none">
      <path
        d="M10 0C4.5 0 0 4.5 0 10C0 13.5 2 16.5 10 24C18 16.5 20 13.5 20 10C20 4.5 15.5 0 10 0Z"
        stroke={color} strokeWidth="1.4" fill="none"
      />
      <circle cx="10" cy="10" r="4" stroke={color} strokeWidth="1.4" fill="none" />
    </svg>
  )
}

export function PencilIcon({ color = '#6a6c7a' }) {
  return (
    <svg width="13" height="13" viewBox="0 0 14 14" fill="none">
      <path d="M9.5 2L12 4.5L5 11.5H2.5V9L9.5 2Z" stroke={color} strokeWidth="1.4" strokeLinejoin="round" fill="none" />
      <path d="M8 3.5L10.5 6" stroke={color} strokeWidth="1.4" strokeLinecap="round" />
    </svg>
  )
}

export function SolidPin({ color = '#d4785a', size = 32 }) {
  return (
    <svg width={size * 0.83} height={size} viewBox="0 0 20 24" fill="none">
      <path
        d="M10 0C4.5 0 0 4.5 0 10C0 13.5 2 16.5 10 24C18 16.5 20 13.5 20 10C20 4.5 15.5 0 10 0Z"
        fill={color}
      />
      <circle cx="10" cy="10" r="4" fill="#fff" />
    </svg>
  )
}
