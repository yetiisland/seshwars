// Paginates a Supabase query past the 1,000-row default PostgREST cap.
// buildQuery() must return a fresh query builder each call — it is called
// once per page. Pages are fetched sequentially until a page returns fewer
// rows than pageSize (indicating the last page).
// Stable ordering on the query is the caller's responsibility.
export async function fetchAll(buildQuery, pageSize = 1000) {
  const rows = []
  let page = 0
  while (true) {
    const from = page * pageSize
    const { data, error } = await buildQuery().range(from, from + pageSize - 1)
    if (error) throw new Error(`fetchAll page ${page}: ${error.message}`)
    if (!data || data.length === 0) break
    rows.push(...data)
    if (data.length < pageSize) break
    page++
  }
  return rows
}
