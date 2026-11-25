// Paginates a Supabase query past the 1,000-row default PostgREST cap.
// buildQuery() must return a fresh query builder each call — it is called
// once for the exact count (HEAD), then once per page for data.
// Stable ordering on the query is the caller's responsibility.
export async function fetchAll(buildQuery, pageSize = 1000) {
  const { count, error: countErr } = await buildQuery()
    .select('*', { count: 'exact', head: true })
  if (countErr) throw new Error(`fetchAll count: ${countErr.message}`)
  if (!count) return []
  const pages = await Promise.all(
    Array.from({ length: Math.ceil(count / pageSize) }, (_, i) =>
      buildQuery().range(i * pageSize, Math.min((i + 1) * pageSize - 1, count - 1))
    )
  )
  for (const page of pages) {
    if (page.error) throw new Error(`fetchAll page: ${page.error.message}`)
  }
  return pages.flatMap(p => p.data)
}
