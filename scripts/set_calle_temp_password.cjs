/**
 * Set a temporary password for calle@billackering.eu
 *
 * Usage: node scripts/set_calle_temp_password.cjs
 *
 * Outputs the temp password to stdout. Copy it and send via Slack DM.
 * Calle should change it after first login.
 */

const crypto = require('crypto')
const { supabase, printProjectInfo } = require('./db.cjs')

const CALLE_UID = '4cd49182-1a79-4b2a-aa28-ace8be007dc2'
const CALLE_EMAIL = 'calle@billackering.eu'

function generatePassword() {
  // 16 chars, URL-safe, no ambiguous characters
  const alphabet = 'ABCDEFGHJKLMNPQRSTUVWXYZabcdefghijkmnopqrstuvwxyz23456789!@#$%'
  const bytes = crypto.randomBytes(16)
  let pw = ''
  for (let i = 0; i < 16; i++) {
    pw += alphabet[bytes[i] % alphabet.length]
  }
  return pw
}

async function main() {
  printProjectInfo()

  const tempPassword = generatePassword()

  console.log(`Setting temporary password for ${CALLE_EMAIL}...`)

  const { data, error } = await supabase.auth.admin.updateUserById(CALLE_UID, {
    password: tempPassword,
  })

  if (error) {
    console.error('❌ Failed to set password:', error.message)
    process.exit(1)
  }

  console.log('✅ Password updated for', data.user.email)
  console.log('')
  console.log('━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━')
  console.log('Send this to Calle via Slack DM (NOT email):')
  console.log('')
  console.log(`  Email:    ${CALLE_EMAIL}`)
  console.log(`  Password: ${tempPassword}`)
  console.log('')
  console.log('  → Vaihda salasana heti kirjautumisen jälkeen')
  console.log('    Settings → Account → Change password')
  console.log('━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━')
}

main().catch((e) => {
  console.error(e)
  process.exit(1)
})
