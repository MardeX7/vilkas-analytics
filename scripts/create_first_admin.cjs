/**
 * create_first_admin.cjs
 *
 * Luo ensimmäinen admin-käyttäjä VilkasAnalytics-sovellukseen.
 * Tämä skripti:
 * 1. Luo käyttäjän Supabase Auth:iin
 * 2. Liittää käyttäjän Billackering-kauppaan admin-roolilla
 *
 * Käyttö:
 *   node scripts/create_first_admin.cjs <email> <password>
 *
 * Esimerkki:
 *   node scripts/create_first_admin.cjs admin@billackering.eu SalainenSalasana123
 */

const { supabase, printProjectInfo } = require('./db.cjs')

// Billackering shop ID (olemassa olevasta datasta)
const BILLACKERING_SHOP_ID = 'a28836f6-9487-4b67-9194-e907eaf94b69'

async function createFirstAdmin(email, password) {
  console.log('\n🔐 VilkasAnalytics - Ensimmäinen Admin-käyttäjä')
  console.log('================================================\n')

  printProjectInfo()

  if (!email || !password) {
    console.error('❌ Käyttö: node scripts/create_first_admin.cjs <email> <password>')
    console.error('   Esimerkki: node scripts/create_first_admin.cjs admin@billackering.eu MySecretPass123')
    process.exit(1)
  }

  if (password.length < 8) {
    console.error('❌ Salasanan pitää olla vähintään 8 merkkiä pitkä')
    process.exit(1)
  }

  console.log(`📧 Email: ${email}`)
  console.log(`🏪 Shop: Billackering (${BILLACKERING_SHOP_ID})`)
  console.log(`🔑 Role: admin\n`)

  try {
    // 1. Tarkista että shop on olemassa
    console.log('1️⃣ Tarkistetaan shop...')
    const { data: shop, error: shopError } = await supabase
      .from('shops')
      .select('id, name, store_id')
      .eq('id', BILLACKERING_SHOP_ID)
      .single()

    if (shopError || !shop) {
      console.error('❌ Shop ei löydy! Aja ensin migraatiot.')
      console.error('   Virhe:', shopError?.message)
      process.exit(1)
    }
    console.log(`   ✅ Shop löytyi: ${shop.name}`)

    // 2. Luo käyttäjä Supabase Auth:iin
    console.log('\n2️⃣ Luodaan käyttäjä Supabase Auth:iin...')
    const { data: authData, error: authError } = await supabase.auth.admin.createUser({
      email,
      password,
      email_confirm: true, // Ohita email-vahvistus
      user_metadata: {
        full_name: 'Admin',
        role: 'admin'
      }
    })

    if (authError) {
      // Jos käyttäjä on jo olemassa, hae se
      if (authError.message.includes('already registered')) {
        console.log('   ⚠️  Käyttäjä on jo olemassa, haetaan tiedot...')
        const { data: { users }, error: listError } = await supabase.auth.admin.listUsers()

        if (listError) {
          console.error('❌ Käyttäjälistauksen haku epäonnistui:', listError.message)
          process.exit(1)
        }

        const existingUser = users.find(u => u.email === email)
        if (!existingUser) {
          console.error('❌ Käyttäjää ei löytynyt')
          process.exit(1)
        }

        authData.user = existingUser
        console.log(`   ✅ Löydettiin käyttäjä: ${existingUser.id}`)
      } else {
        console.error('❌ Käyttäjän luonti epäonnistui:', authError.message)
        process.exit(1)
      }
    } else {
      console.log(`   ✅ Käyttäjä luotu: ${authData.user.id}`)
    }

    const userId = authData.user.id

    // 3. Luo profile (trigger tekee tämän automaattisesti, mutta varmuuden vuoksi)
    console.log('\n3️⃣ Tarkistetaan/luodaan profile...')
    const { error: profileError } = await supabase
      .from('profiles')
      .upsert({
        id: userId,
        email,
        full_name: 'Admin'
      }, { onConflict: 'id' })

    if (profileError) {
      console.log(`   ⚠️  Profile-virhe (ei kriittinen): ${profileError.message}`)
    } else {
      console.log('   ✅ Profile OK')
    }

    // 4. Liitä käyttäjä kauppaan admin-roolilla
    console.log('\n4️⃣ Liitetään käyttäjä kauppaan admin-roolilla...')
    const { error: memberError } = await supabase
      .from('shop_members')
      .upsert({
        shop_id: BILLACKERING_SHOP_ID,
        user_id: userId,
        role: 'admin',
        joined_at: new Date().toISOString()
      }, { onConflict: 'shop_id,user_id' })

    if (memberError) {
      console.error('❌ Shop member -lisäys epäonnistui:', memberError.message)
      process.exit(1)
    }
    console.log('   ✅ Käyttäjä liitetty kauppaan')

    // 5. Yhteenveto
    console.log('\n' + '='.repeat(50))
    console.log('🎉 VALMIS! Admin-käyttäjä luotu onnistuneesti!')
    console.log('='.repeat(50))
    console.log('\n📋 Kirjautumistiedot:')
    console.log(`   URL:      https://vilkas-analytics.vercel.app/login`)
    console.log(`   Email:    ${email}`)
    console.log(`   Salasana: ${password}`)
    console.log(`   Rooli:    admin`)
    console.log(`   Kauppa:   ${shop.name}`)
    console.log('\n')

  } catch (error) {
    console.error('\n❌ Odottamaton virhe:', error.message)
    process.exit(1)
  }
}

// Hae argumentit
const [,, email, password] = process.argv

createFirstAdmin(email, password)
