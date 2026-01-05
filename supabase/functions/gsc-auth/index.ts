/**
 * Google Search Console OAuth Handler
 *
 * Handles OAuth2 flow for Google Search Console API access.
 *
 * Endpoints:
 * - GET /gsc-auth?action=authorize&store_id=xxx - Start OAuth flow
 * - GET /gsc-auth?code=xxx&state=xxx - OAuth callback
 */

import { serve } from "https://deno.land/std@0.168.0/http/server.ts"
import { createClient } from "https://esm.sh/@supabase/supabase-js@2"

const corsHeaders = {
  'Access-Control-Allow-Origin': '*',
  'Access-Control-Allow-Headers': 'authorization, x-client-info, apikey, content-type',
}

// Google OAuth config - these will be set as secrets
const GOOGLE_CLIENT_ID = Deno.env.get('GOOGLE_CLIENT_ID') || ''
const GOOGLE_CLIENT_SECRET = Deno.env.get('GOOGLE_CLIENT_SECRET') || ''
const REDIRECT_URI = Deno.env.get('SUPABASE_URL') + '/functions/v1/gsc-auth'

// Google Search Console scope
const SCOPES = [
  'https://www.googleapis.com/auth/webmasters.readonly'
]

serve(async (req: Request) => {
  // Handle CORS
  if (req.method === 'OPTIONS') {
    return new Response('ok', { headers: corsHeaders })
  }

  try {
    const url = new URL(req.url)
    const action = url.searchParams.get('action')
    const code = url.searchParams.get('code')
    const state = url.searchParams.get('state')
    const error = url.searchParams.get('error')

    // Supabase client
    const supabaseUrl = Deno.env.get('SUPABASE_URL')!
    const supabaseServiceKey = Deno.env.get('SUPABASE_SERVICE_ROLE_KEY')!
    const supabase = createClient(supabaseUrl, supabaseServiceKey)

    // ========================================
    // Step 1: Start OAuth flow
    // ========================================
    if (action === 'authorize') {
      const storeId = url.searchParams.get('store_id')

      if (!storeId) {
        return new Response(
          JSON.stringify({ error: 'store_id required' }),
          { status: 400, headers: { ...corsHeaders, 'Content-Type': 'application/json' } }
        )
      }

      // Build Google OAuth URL
      const authUrl = new URL('https://accounts.google.com/o/oauth2/v2/auth')
      authUrl.searchParams.set('client_id', GOOGLE_CLIENT_ID)
      authUrl.searchParams.set('redirect_uri', REDIRECT_URI)
      authUrl.searchParams.set('response_type', 'code')
      authUrl.searchParams.set('scope', SCOPES.join(' '))
      authUrl.searchParams.set('access_type', 'offline')
      authUrl.searchParams.set('prompt', 'consent')
      authUrl.searchParams.set('state', storeId) // Pass store_id in state

      console.log('📤 Redirecting to Google OAuth:', authUrl.toString())

      return Response.redirect(authUrl.toString(), 302)
    }

    // ========================================
    // Step 2: Handle OAuth callback
    // ========================================
    if (code) {
      // Check for errors
      if (error) {
        console.error('❌ OAuth error:', error)
        return new Response(
          `<html><body><h1>Authorization Failed</h1><p>${error}</p></body></html>`,
          { status: 400, headers: { ...corsHeaders, 'Content-Type': 'text/html' } }
        )
      }

      const storeId = state // store_id was passed in state parameter

      console.log('📥 Received OAuth callback for store:', storeId)

      // Exchange code for tokens
      const tokenResponse = await fetch('https://oauth2.googleapis.com/token', {
        method: 'POST',
        headers: {
          'Content-Type': 'application/x-www-form-urlencoded',
        },
        body: new URLSearchParams({
          code,
          client_id: GOOGLE_CLIENT_ID,
          client_secret: GOOGLE_CLIENT_SECRET,
          redirect_uri: REDIRECT_URI,
          grant_type: 'authorization_code',
        }),
      })

      if (!tokenResponse.ok) {
        const errorText = await tokenResponse.text()
        console.error('❌ Token exchange failed:', errorText)
        return new Response(
          `<html><body><h1>Token Exchange Failed</h1><pre>${errorText}</pre></body></html>`,
          { status: 500, headers: { ...corsHeaders, 'Content-Type': 'text/html' } }
        )
      }

      const tokens = await tokenResponse.json()
      console.log('✅ Tokens received:', {
        hasAccessToken: !!tokens.access_token,
        hasRefreshToken: !!tokens.refresh_token,
        expiresIn: tokens.expires_in
      })

      // Get list of sites from Search Console
      const sitesResponse = await fetch('https://www.googleapis.com/webmasters/v3/sites', {
        headers: {
          'Authorization': `Bearer ${tokens.access_token}`,
        },
      })

      const sitesData = await sitesResponse.json()
      const sites = sitesData.siteEntry || []

      console.log('📋 Found sites:', sites.map((s: any) => s.siteUrl))

      // Save token for each site (or just the first one for now)
      const tokenExpiry = new Date(Date.now() + (tokens.expires_in * 1000))

      for (const site of sites) {
        const { error: dbError } = await supabase
          .from('gsc_tokens')
          .upsert({
            store_id: storeId,
            site_url: site.siteUrl,
            access_token: tokens.access_token,
            refresh_token: tokens.refresh_token,
            token_expiry: tokenExpiry.toISOString(),
            updated_at: new Date().toISOString()
          }, {
            onConflict: 'store_id,site_url'
          })

        if (dbError) {
          console.error('❌ DB error saving token:', dbError)
        } else {
          console.log('✅ Token saved for site:', site.siteUrl)
        }
      }

      // Show success page
      return new Response(
        `<!DOCTYPE html>
        <html>
        <head>
          <title>Google Search Console Connected</title>
          <style>
            body { font-family: system-ui; background: #0f172a; color: white; display: flex; justify-content: center; align-items: center; height: 100vh; margin: 0; }
            .card { background: #1e293b; padding: 40px; border-radius: 12px; text-align: center; max-width: 500px; }
            h1 { color: #22c55e; }
            .sites { background: #334155; padding: 16px; border-radius: 8px; margin: 20px 0; text-align: left; }
            .site { padding: 8px; border-bottom: 1px solid #475569; }
            .site:last-child { border-bottom: none; }
            button { background: #06b6d4; color: white; border: none; padding: 12px 24px; border-radius: 8px; cursor: pointer; font-size: 16px; margin-top: 20px; }
          </style>
        </head>
        <body>
          <div class="card">
            <h1>✅ Connected!</h1>
            <p>Google Search Console has been connected successfully.</p>
            <div class="sites">
              <strong>Connected sites:</strong>
              ${sites.map((s: any) => `<div class="site">📊 ${s.siteUrl}</div>`).join('')}
            </div>
            <button onclick="window.close()">Close Window</button>
          </div>
        </body>
        </html>`,
        { status: 200, headers: { ...corsHeaders, 'Content-Type': 'text/html' } }
      )
    }

    // No valid action
    return new Response(
      JSON.stringify({
        error: 'Invalid request',
        usage: {
          authorize: '/gsc-auth?action=authorize&store_id=xxx',
          callback: '/gsc-auth?code=xxx&state=store_id'
        }
      }),
      { status: 400, headers: { ...corsHeaders, 'Content-Type': 'application/json' } }
    )

  } catch (error) {
    console.error('❌ Error:', error)
    return new Response(
      JSON.stringify({ error: 'Internal server error', details: error.message }),
      { status: 500, headers: { ...corsHeaders, 'Content-Type': 'application/json' } }
    )
  }
})
