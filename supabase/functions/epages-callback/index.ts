/**
 * ePages OAuth Callback Handler
 *
 * This Edge Function handles the OAuth callback from ePages
 * and exchanges the authorization code for an access token.
 */

import { serve } from "https://deno.land/std@0.168.0/http/server.ts"
import { createClient } from "https://esm.sh/@supabase/supabase-js@2"

const corsHeaders = {
  'Access-Control-Allow-Origin': '*',
  'Access-Control-Allow-Headers': 'authorization, x-client-info, apikey, content-type',
}

// ePages App credentials
const CLIENT_ID = 'F929C720-FB55-43DD-99D4-C02A66721666'
const CLIENT_SECRET = 'YY6LMUV0GTxDMXche8Zwif3pSEyI26TY'

serve(async (req: Request) => {
  // Handle CORS preflight
  if (req.method === 'OPTIONS') {
    return new Response('ok', { headers: corsHeaders })
  }

  try {
    const url = new URL(req.url)
    const code = url.searchParams.get('code')
    const accessTokenUrl = url.searchParams.get('access_token_url')
    const apiUrl = url.searchParams.get('api_url')
    const returnUrl = url.searchParams.get('return_url')

    console.log('📥 Received callback:', {
      code: code ? 'present' : 'missing',
      accessTokenUrl,
      apiUrl,
      returnUrl
    })

    if (!code || !accessTokenUrl) {
      return new Response(
        JSON.stringify({
          error: 'Missing required parameters',
          received: { code: !!code, accessTokenUrl: !!accessTokenUrl }
        }),
        {
          status: 400,
          headers: { ...corsHeaders, 'Content-Type': 'application/json' }
        }
      )
    }

    // Exchange authorization code for access token
    const tokenResponse = await fetch(accessTokenUrl, {
      method: 'POST',
      headers: {
        'Content-Type': 'application/x-www-form-urlencoded',
      },
      body: new URLSearchParams({
        code,
        client_id: CLIENT_ID,
        client_secret: CLIENT_SECRET,
      }),
    })

    if (!tokenResponse.ok) {
      const errorText = await tokenResponse.text()
      console.error('❌ Token exchange failed:', errorText)
      return new Response(
        JSON.stringify({ error: 'Token exchange failed', details: errorText }),
        {
          status: 500,
          headers: { ...corsHeaders, 'Content-Type': 'application/json' }
        }
      )
    }

    const tokenData = await tokenResponse.json()
    console.log('✅ Token received:', {
      hasAccessToken: !!tokenData.access_token,
      tokenType: tokenData.token_type
    })

    // Extract shop ID from API URL
    // Format: https://www.shop.com/rs/shops/{shopId}
    const shopIdMatch = apiUrl?.match(/\/rs\/shops\/([^\/]+)/)
    const shopId = shopIdMatch ? shopIdMatch[1] : 'unknown'

    // Store in Supabase
    const supabaseUrl = Deno.env.get('SUPABASE_URL')!
    const supabaseServiceKey = Deno.env.get('SUPABASE_SERVICE_ROLE_KEY')!
    const supabase = createClient(supabaseUrl, supabaseServiceKey)

    const { data: store, error: storeError } = await supabase
      .from('stores')
      .upsert({
        epages_shop_id: shopId,
        name: shopId,
        domain: new URL(apiUrl || '').hostname,
        access_token: tokenData.access_token,
        updated_at: new Date().toISOString()
      }, {
        onConflict: 'epages_shop_id'
      })
      .select()
      .single()

    if (storeError) {
      console.error('❌ Store save error:', storeError)
    } else {
      console.log('✅ Store saved:', store.id)
    }

    // Redirect back to the shop or show success
    if (returnUrl) {
      return Response.redirect(returnUrl, 302)
    }

    return new Response(
      JSON.stringify({
        success: true,
        message: 'App installed successfully!',
        shopId,
        accessToken: tokenData.access_token
      }),
      {
        status: 200,
        headers: { ...corsHeaders, 'Content-Type': 'application/json' }
      }
    )

  } catch (error) {
    console.error('❌ Callback error:', error)
    return new Response(
      JSON.stringify({ error: 'Internal server error', details: error.message }),
      {
        status: 500,
        headers: { ...corsHeaders, 'Content-Type': 'application/json' }
      }
    )
  }
})
