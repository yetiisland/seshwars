import { supabase } from '../lib/supabase'

export async function checkPhotosSafe(urls) {
  if (!urls || urls.length === 0) return { safe: true, autoReject: false }
  try {
    const { data, error } = await supabase.functions.invoke('check-photo-moderation', {
      body: { urls },
    })
    if (error) {
      console.warn('[moderation] edge function error, defaulting to safe:', error)
      return { safe: true, autoReject: false }
    }
    return { safe: data.safe, autoReject: data.autoReject }
  } catch (err) {
    console.warn('[moderation] check failed, defaulting to safe:', err)
    return { safe: true, autoReject: false }
  }
}

export async function checkImageModeration(imageUrl) {
  const result = await checkPhotosSafe([imageUrl])
  return { safe: result.safe, autoReject: result.autoReject }
}
