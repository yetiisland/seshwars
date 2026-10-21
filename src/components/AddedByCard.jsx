import InitialsAvatar from './InitialsAvatar'
import AddFriendButton from './AddFriendButton'

// The "Added by" / poster card — avatar, username, and an add-friend
// button (hidden for your own content, and once already friends) — the
// single shared card used on spot pages (SpotDetail.jsx) and in the clip
// popup (ClipsSection.jsx).
export default function AddedByCard({ avatarUrl, initials, username, isAnonymous, targetUserId, friendship, onFriendshipChange, label = 'Added by' }) {
  return (
    <div style={{ display: 'inline-flex', maxWidth: '100%', alignItems: 'center', gap: 10, background: '#FFFFFF', border: '1px solid #EAD8C8', borderRadius: 6, padding: '10px 12px' }}>
      <InitialsAvatar
        avatarUrl={avatarUrl}
        initials={initials || '?'}
        size={32}
        bg="#ECEDF2"
        textColor="#6a6c7a"
        ring="0 0 0 1px #EAD8C8"
      />
      <div style={{ minWidth: 0, flex: 1 }}>
        <div style={{ fontSize: 10, color: 'var(--text-dim)', fontWeight: 700, letterSpacing: 0.5, textTransform: 'uppercase', lineHeight: 1.3 }}>{label}</div>
        <div style={{ fontSize: 11, color: 'var(--text-primary)', fontWeight: 700, overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap', lineHeight: 1.3 }}>
          {isAnonymous ? 'Anonymous' : username ? `@${username}` : ''}
        </div>
      </div>
      {friendship && friendship.status !== 'accepted' && (
        <AddFriendButton
          targetUserId={targetUserId}
          friendshipStatus={friendship.status}
          isRequester={friendship.isRequester}
          friendshipId={friendship.friendshipId}
          onChange={onFriendshipChange}
        />
      )}
    </div>
  )
}
