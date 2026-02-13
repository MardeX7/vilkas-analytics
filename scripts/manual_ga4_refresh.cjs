const { supabase } = require('./db.cjs')

async function refreshGA4Token() {
  const STORE_ID = 'a28836f6-9487-4b67-9194-e907eaf94b69'
  
  // Get token data
  const { data: tokenData, error: tokenError } = await supabase
    .from('ga4_tokens')
    .select('*')
    .eq('store_id', STORE_ID)
    .single()
  
  if (tokenError) {
    console.error('❌ Failed to get token:', tokenError.message)
    return
  }
  
  console.log('🔑 Current token expires:', tokenData.expires_at)
  console.log('🔄 Refreshing token...')
  
  // Refresh the token using global fetch
  const response = await fetch('https://oauth2.googleapis.com/token', {
    method: 'POST',
    headers: { 'Content-Type': 'application/x-www-form-urlencoded' },
    body: new URLSearchParams({
      client_id: process.env.GOOGLE_CLIENT_ID,
      client_secret: process.env.GOOGLE_CLIENT_SECRET,
      refresh_token: tokenData.refresh_token,
      grant_type: 'refresh_token'
    }).toString()
  })
  
  const data = await response.json()
  
  if (data.error) {
    console.error('❌ Token refresh failed:', data.error)
    console.error('Response:', data)
    return
  }
  
  // Update token in DB
  const newExpiresAt = new Date(Date.now() + data.expires_in * 1000).toISOString()
  
  const { error: updateError } = await supabase
    .from('ga4_tokens')
    .update({
      access_token: data.access_token,
      expires_at: newExpiresAt,
      updated_at: new Date().toISOString()
    })
    .eq('store_id', STORE_ID)
  
  if (updateError) {
    console.error('❌ Failed to update token:', updateError.message)
    return
  }
  
  console.log('✅ Token refreshed successfully!')
  console.log('🔑 New expiry:', newExpiresAt)
  console.log('\n⏭️ Token is now valid - cron should work on next run')
}

refreshGA4Token()
