/**
 * Google Analytics 4 OAuth Handler
 *
 * Handles OAuth2 flow for Google Analytics 4 Data API access.
 * NOTE: GA4 is for BEHAVIORAL data only (traffic sources, bounce rate)
 * NOT for transactions - ePages remains the master for sales data.
 *
 * Endpoints:
 * - GET /ga4-auth?action=authorize&store_id=xxx - Start OAuth flow
 * - GET /ga4-auth?code=xxx&state=xxx - OAuth callback
 */

import { serve } from "https://deno.land/std@0.168.0/http/server.ts"
import { createClient } from "https://esm.sh/@supabase/supabase-js@2"

const corsHeaders = {
  'Access-Control-Allow-Origin': '*',
  'Access-Control-Allow-Headers': 'authorization, x-client-info, apikey, content-type',
}

// Google OAuth config - same as GSC (shared credentials)
const GOOGLE_CLIENT_ID = Deno.env.get('GOOGLE_CLIENT_ID') || ''
const GOOGLE_CLIENT_SECRET = Deno.env.get('GOOGLE_CLIENT_SECRET') || ''
const REDIRECT_URI = Deno.env.get('SUPABASE_URL') + '/functions/v1/ga4-auth'

// GA4 Data API scope (read-only)
const SCOPES = [
  'https://www.googleapis.com/auth/analytics.readonly'
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

      console.log('📤 Redirecting to Google OAuth for GA4:', authUrl.toString())

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

      console.log('📥 Received GA4 OAuth callback for store:', storeId)

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
      console.log('✅ GA4 tokens received:', {
        hasAccessToken: !!tokens.access_token,
        hasRefreshToken: !!tokens.refresh_token,
        expiresIn: tokens.expires_in
      })

      // Get list of GA4 properties (via Admin API)
      const accountsResponse = await fetch(
        'https://analyticsadmin.googleapis.com/v1beta/accountSummaries',
        {
          headers: { 'Authorization': `Bearer ${tokens.access_token}` }
        }
      )

      const accountsData = await accountsResponse.json()
      const accounts = accountsData.accountSummaries || []

      // Collect all properties
      interface GA4Property {
        property_id: string
        property_name: string
        account_id: string
        account_name: string
      }

      const properties: GA4Property[] = []
      for (const account of accounts) {
        for (const property of (account.propertySummaries || [])) {
          properties.push({
            property_id: property.property,  // e.g., 'properties/123456789'
            property_name: property.displayName,
            account_id: account.account,
            account_name: account.displayName
          })
        }
      }

      console.log('📋 Found GA4 properties:', properties.map(p => p.property_name))

      // Save first property (or let user choose later)
      const tokenExpiry = new Date(Date.now() + (tokens.expires_in * 1000))

      if (properties.length > 0) {
        const firstProperty = properties[0]

        const { error: dbError } = await supabase
          .from('ga4_tokens')
          .upsert({
            store_id: storeId,
            property_id: firstProperty.property_id,
            property_name: firstProperty.property_name,
            account_id: firstProperty.account_id,
            access_token: tokens.access_token,
            refresh_token: tokens.refresh_token,
            expires_at: tokenExpiry.toISOString(),
            updated_at: new Date().toISOString()
          }, {
            onConflict: 'store_id'
          })

        if (dbError) {
          console.error('❌ DB error saving GA4 token:', dbError)
        } else {
          console.log('✅ GA4 token saved for property:', firstProperty.property_name)
        }

        // Update shops table with ga4_property_id
        await supabase
          .from('shops')
          .update({ ga4_property_id: firstProperty.property_id })
          .eq('id', storeId)
      }

      // Show success page
      return new Response(
        `<!DOCTYPE html>
        <html>
        <head>
          <title>Google Analytics 4 Connected</title>
          <style>
            body { font-family: system-ui; background: #0f172a; color: white; display: flex; justify-content: center; align-items: center; height: 100vh; margin: 0; }
            .card { background: #1e293b; padding: 40px; border-radius: 12px; text-align: center; max-width: 500px; }
            h1 { color: #22c55e; }
            .properties { background: #334155; padding: 16px; border-radius: 8px; margin: 20px 0; text-align: left; }
            .property { padding: 8px; border-bottom: 1px solid #475569; }
            .property:last-child { border-bottom: none; }
            button { background: #8b5cf6; color: white; border: none; padding: 12px 24px; border-radius: 8px; cursor: pointer; font-size: 16px; margin-top: 20px; }
            .note { font-size: 12px; color: #94a3b8; margin-top: 16px; }
          </style>
        </head>
        <body>
          <div class="card">
            <h1>Connected!</h1>
            <p>Google Analytics 4 has been connected successfully.</p>
            <div class="properties">
              <strong>Connected properties:</strong>
              ${properties.map(p => `<div class="property">📊 ${p.property_name}</div>`).join('')}
            </div>
            <p class="note">GA4 tracks traffic sources and bounce rate. Sales data comes from ePages.</p>
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
          authorize: '/ga4-auth?action=authorize&store_id=xxx',
          callback: '/ga4-auth?code=xxx&state=store_id'
        }
      }),
      { status: 400, headers: { ...corsHeaders, 'Content-Type': 'application/json' } }
    )

  } catch (error) {
    console.error('❌ GA4 Auth Error:', error)
    return new Response(
      JSON.stringify({ error: 'Internal server error', details: error.message }),
      { status: 500, headers: { ...corsHeaders, 'Content-Type': 'application/json' } }
    )
  }
})
