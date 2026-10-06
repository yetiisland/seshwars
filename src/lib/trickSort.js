// Shared everywhere tricks are listed (TrickListPage, AddToTrickListSheet):
// unchecked first, then checked — checked tricks ordered newest-landed-first.
// Unchecked tricks keep their original (creation) order.
export function sortTricks(tricks) {
  return [...tricks].sort((a, b) => {
    if (a.landed !== b.landed) return a.landed ? 1 : -1
    if (a.landed) return new Date(b.landed_at) - new Date(a.landed_at)
    return new Date(a.created_at) - new Date(b.created_at)
  })
}
