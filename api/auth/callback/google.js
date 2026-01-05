// Google OAuth Callback - vastaanottaa authorization code ja tallentaa tokens
// Vercel Serverless Function

import { createClient } from '@supabase/supabase-js'

const supabase = createClient(
  process.env.NEXT_PUBLIC_SUPABASE_URL || process.env.VITE_SUPABASE_URL,
  process.env.SUPABASE_SERVICE_ROLE_KEY
)

export default async function handler(req, res) {
  const { code, state, error: oauthError } = req.query

  // OAuth error
  if (oauthError) {
    console.error('OAuth error:', oauthError)
    return res.redirect('/?gsc_error=' + encodeURIComponent(oauthError))
  }

  if (!code) {
    return res.redirect('/?gsc_error=no_code')
  }

  const storeId = state || 'a28836f6-9487-4b67-9194-e907eaf94b69'

  try {
    // Exchange code for tokens
    const tokenResponse = await fetch('https://oauth2.googleapis.com/token', {
      method: 'POST',
      headers: { 'Content-Type': 'application/x-www-form-urlencoded' },
      body: new URLSearchParams({
        client_id: process.env.GOOGLE_CLIENT_ID,
        client_secret: process.env.GOOGLE_CLIENT_SECRET,
        code,
        grant_type: 'authorization_code',
        redirect_uri: process.env.GOOGLE_REDIRECT_URI ||
          `https://${req.headers.host}/api/auth/callback/google`
      })
    })

    const tokens = await tokenResponse.json()

    if (tokens.error) {
      console.error('Token exchange error:', tokens)
      return res.redirect('/?gsc_error=' + encodeURIComponent(tokens.error))
    }

    // Get list of sites from Search Console
    const sitesResponse = await fetch(
      'https://www.googleapis.com/webmasters/v3/sites',
      {
        headers: { 'Authorization': `Bearer ${tokens.access_token}` }
      }
    )
    const sitesData = await sitesResponse.json()

    // Find billackering.eu site or use first one
    const sites = sitesData.siteEntry || []
    const targetSite = sites.find(s =>
      s.siteUrl.includes('billackering')
    ) || sites[0]

    if (!targetSite) {
      return res.redirect('/?gsc_error=no_sites_found')
    }

    // Save tokens to Supabase
    const { error: dbError } = await supabase
      .from('gsc_tokens')
      .upsert({
        store_id: storeId,
        site_url: targetSite.siteUrl,
        access_token: tokens.access_token,
        refresh_token: tokens.refresh_token,
        expires_at: new Date(Date.now() + tokens.expires_in * 1000).toISOString(),
        updated_at: new Date().toISOString()
      }, {
        onConflict: 'store_id'
      })

    if (dbError) {
      console.error('DB error:', dbError)
      return res.redirect('/?gsc_error=db_error')
    }

    // Success! Redirect back to dashboard
    console.log('GSC connected successfully for store:', storeId, 'site:', targetSite.siteUrl)
    return res.redirect('/?gsc_connected=true')

  } catch (err) {
    console.error('Callback error:', err)
    return res.redirect('/?gsc_error=' + encodeURIComponent(err.message))
  }
}
