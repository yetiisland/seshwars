# Supabase Write Pattern

Reference document only. Records the required pattern for every Supabase
table write (`insert`/`update`/`upsert`/`delete`) in this codebase, so it
does not have to be rediscovered after each audit.

## The problem

By default, `supabase.from(table).insert(...)` (same for `update`/`upsert`/
`delete`) returns `data: null` — the client does not return the written
row(s) unless `.select()` is explicitly chained. Separately, if a write is
blocked by Row Level Security (RLS), Supabase does **not** raise it as an
`error` — it silently returns `data: [], error: null`, indistinguishable
from "legitimately zero rows affected" unless the caller checks for it.

Checking only `error` is therefore not enough to know a write succeeded.

## The required pattern

For every write:

1. Destructure `{ data, error }` from the call.
2. Chain `.select()` (or `.select().single()` when exactly one row is
   expected — `.single()` itself throws an error if zero or multiple rows
   come back, which incidentally covers the silent-reject case too).
3. Verify the returned row before trusting the write:
   - `.single()` calls: check `error || !data`.
   - plain `.select()` calls (0+ rows expected): check
     `error || !data || data.length === 0`.
4. Never update local/optimistic state on an unverified write. If state was
   already updated optimistically, roll it back on a verified failure.
5. Surface the error inline using the existing inline error style
   (`{ fontSize: 11, color: '#e07070', fontWeight: 700 }`, or a file-local
   variant where one already exists) and `console.error` the failure.

```js
const { data, error } = await supabase
  .from('table')
  .insert({ ... })
  .select()
  .single()
if (error || !data) {
  console.error('[Component] action failed:', error)
  setError('User-facing message.')
  return
}
// safe to update local state here
```

## Bulk vs. targeted deletes

Not every delete needs the `data.length === 0` check — it depends on
whether zero affected rows is a legitimate outcome:

- **Bulk delete** — "remove every row matching X" (e.g. clearing all
  comments for a spot before deleting the spot itself). Zero matched rows
  is an expected, valid outcome (there may have been nothing to delete), so
  only check `error`.
- **Targeted delete** — removing one specific row that the caller knows
  should exist (deleting a row by its own id, unliking a spot the UI
  already shows as liked, removing a friendship by id). Here an empty
  `data` back from `.select()` means the write was blocked (RLS or a
  race), not that there was nothing to do — check both `error` and
  `data.length === 0`.

## Unique-violation (23505) handling

A Postgres `23505 unique_violation` means the row already exists under a
constraint, not a generic failure — give it a specific message rather than
the catch-all one.

`saved_spots` has two partial unique indexes:
- `(user_id, spot_id, list_id)` where `list_id is not null`
- `(user_id, spot_id)` where `list_id is null`

A 23505 on `saved_spots` means the spot is already saved **within that
same list**, or already in favorites (`list_id is null`) — surface that
specific duplicate message rather than a generic "could not save" one.

## Background/no-UI write paths

Some writes (e.g. auth-state-change listener fallbacks that create a
profile row after signup/OAuth) run with no form or modal open to show an
inline error. In these cases, `console.error` is the only available
surface — still verify `{ data, error }` the same way, just skip the
`setError(...)` call since there's nothing visible to set it on.
