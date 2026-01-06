// GA4 OAuth Connect - aloittaa OAuth flow
// Vercel Serverless Function
// NOTE: GA4 is for BEHAVIORAL data only (traffic sources, bounce rate)

export default function handler(req, res) {
  const clientId = process.env.GOOGLE_CLIENT_ID

  // Use Supabase Edge Function as redirect URI for GA4
  const supabaseUrl = process.env.NEXT_PUBLIC_SUPABASE_URL || process.env.VITE_SUPABASE_URL
  const redirectUri = `${supabaseUrl}/functions/v1/ga4-auth`

  // GA4 Data API scope (read-only)
  const scopes = [
    'https://www.googleapis.com/auth/analytics.readonly'
  ].join(' ')

  // State parameter (store_id for callback)
  const state = req.query.store_id || 'a28836f6-9487-4b67-9194-e907eaf94b69'

  const authUrl = new URL('https://accounts.google.com/o/oauth2/v2/auth')
  authUrl.searchParams.set('client_id', clientId)
  authUrl.searchParams.set('redirect_uri', redirectUri)
  authUrl.searchParams.set('response_type', 'code')
  authUrl.searchParams.set('scope', scopes)
  authUrl.searchParams.set('access_type', 'offline')
  authUrl.searchParams.set('prompt', 'consent')
  authUrl.searchParams.set('state', state)

  res.redirect(302, authUrl.toString())
}
