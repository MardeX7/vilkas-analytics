import { createClient } from '@supabase/supabase-js'

const supabaseUrl = 'https://tlothekaphtiwvusgwzh.supabase.co'
const serviceRoleKey = 'eyJhbGciOiJIUzI1NiIsInR5cCI6IkpXVCJ9.eyJpc3MiOiJzdXBhYmFzZSIsInJlZiI6InRsb3RoZWthcGh0aXd2dXNnd3poIiwicm9sZSI6InNlcnZpY2Vfcm9sZSIsImlhdCI6MTc2NzYxOTYwMCwiZXhwIjoyMDgzMTk1NjAwfQ.PxMeALq2SEylsXwybYAASYcxjtVBzjjiWFsiOulhQyY'

const supabase = createClient(supabaseUrl, serviceRoleKey)

// Finnish first names and last names
const firstNames = ['Matti', 'Liisa', 'Jukka', 'Anna', 'Mikko', 'Maria', 'Pekka', 'Sanna', 'Timo', 'Laura', 'Juha', 'Henna', 'Antti', 'Katja', 'Ville']
const lastNames = ['Virtanen', 'Korhonen', 'Nieminen', 'Mäkinen', 'Hämäläinen', 'Laine', 'Heikkinen', 'Koskinen', 'Järvinen', 'Lehtonen']
const cities = ['Helsinki', 'Espoo', 'Tampere', 'Vantaa', 'Oulu', 'Turku', 'Jyväskylä', 'Lahti', 'Kuopio', 'Pori']
const streets = ['Mannerheimintie', 'Aleksanterinkatu', 'Hämeenkatu', 'Kauppakatu', 'Keskuskatu', 'Puistokatu', 'Rantatie', 'Kirkkokatu']

// Product categories and names
const categories = [
  { id: 'electronics', name: 'Elektroniikka', products: ['Bluetooth-kuulokkeet', 'USB-C kaapeli', 'Powerbank 10000mAh', 'Langaton hiiri', 'LED-työpöytälamppu'] },
  { id: 'home', name: 'Koti & Sisustus', products: ['Kynttilänjalka', 'Seinäkello', 'Tyyny 50x50', 'Viltti', 'Kukkaruukku'] },
  { id: 'sports', name: 'Urheilu', products: ['Juoksukengät', 'Joogamatto', 'Käsipainot 5kg', 'Urheilukassi', 'Juomapullo'] },
  { id: 'clothing', name: 'Vaatteet', products: ['T-paita', 'Huppari', 'Farkut', 'Villapaita', 'Talvitakki'] },
  { id: 'beauty', name: 'Kauneus', products: ['Kasvovoide', 'Shampoo', 'Huulipuna', 'Parfyymi', 'Käsivoide'] }
]

const paymentMethods = ['Klarna', 'Paytrail', 'Visa', 'Mastercard', 'MobilePay']
const shippingMethods = ['Posti', 'Matkahuolto', 'PostNord', 'Nouto myymälästä']

function random(arr) {
  return arr[Math.floor(Math.random() * arr.length)]
}

function randomInt(min, max) {
  return Math.floor(Math.random() * (max - min + 1)) + min
}

function randomPrice(min, max) {
  return (Math.random() * (max - min) + min).toFixed(2)
}

function randomDate(startDays, endDays) {
  const now = new Date()
  const start = new Date(now.getTime() - startDays * 24 * 60 * 60 * 1000)
  const end = new Date(now.getTime() - endDays * 24 * 60 * 60 * 1000)
  return new Date(start.getTime() + Math.random() * (end.getTime() - start.getTime())).toISOString()
}

async function seed() {
  console.log('🌱 Seeding database...\n')

  // 1. Create store
  console.log('📦 Creating store...')
  const { data: store, error: storeError } = await supabase
    .from('stores')
    .insert({
      epages_shop_id: 'demo-shop-001',
      name: 'Demo Verkkokauppa',
      domain: 'demo.vilkas.fi',
      currency: 'EUR',
      locale: 'fi_FI'
    })
    .select()
    .single()

  if (storeError) {
    console.error('❌ Store error:', storeError.message)
    return
  }
  console.log(`✅ Store created: ${store.name}\n`)

  // 2. Create products
  console.log('📦 Creating products...')
  const products = []
  let productNum = 1000

  for (const category of categories) {
    for (const productName of category.products) {
      const price = randomPrice(9.99, 199.99)
      products.push({
        store_id: store.id,
        epages_product_id: `prod-${productNum}`,
        product_number: `SKU-${productNum}`,
        name: productName,
        description: `Laadukas ${productName.toLowerCase()} parhaaseen hintaan.`,
        short_description: `${productName} - Nopea toimitus!`,
        price_amount: parseFloat(price),
        price_currency: 'EUR',
        tax_rate: 25.5,
        stock_level: randomInt(10, 500),
        min_stock_level: 5,
        for_sale: true,
        category_id: category.id,
        category_name: category.name
      })
      productNum++
    }
  }

  const { data: insertedProducts, error: productsError } = await supabase
    .from('products')
    .insert(products)
    .select()

  if (productsError) {
    console.error('❌ Products error:', productsError.message)
    return
  }
  console.log(`✅ Created ${insertedProducts.length} products\n`)

  // 3. Create customers
  console.log('👥 Creating customers...')
  const customers = []

  for (let i = 1; i <= 50; i++) {
    const firstName = random(firstNames)
    const lastName = random(lastNames)
    const city = random(cities)

    customers.push({
      store_id: store.id,
      epages_customer_id: `cust-${1000 + i}`,
      customer_number: `C${1000 + i}`,
      first_name: firstName,
      last_name: lastName,
      email: `${firstName.toLowerCase()}.${lastName.toLowerCase()}@example.fi`,
      phone: `+358 ${randomInt(40, 50)} ${randomInt(1000000, 9999999)}`,
      street: `${random(streets)} ${randomInt(1, 100)}`,
      zip_code: `${randomInt(10, 99)}${randomInt(100, 999)}`,
      city: city,
      country: 'FI'
    })
  }

  const { data: insertedCustomers, error: customersError } = await supabase
    .from('customers')
    .insert(customers)
    .select()

  if (customersError) {
    console.error('❌ Customers error:', customersError.message)
    return
  }
  console.log(`✅ Created ${insertedCustomers.length} customers\n`)

  // 4. Create orders (last 365 days)
  console.log('🛒 Creating orders...')
  const orders = []
  const orderLineItems = []

  for (let i = 1; i <= 500; i++) {
    const customer = random(insertedCustomers)
    const orderDate = randomDate(365, 0)
    const itemCount = randomInt(1, 5)

    // Calculate order totals
    let grandTotal = 0
    const orderProducts = []

    for (let j = 0; j < itemCount; j++) {
      const product = random(insertedProducts)
      const quantity = randomInt(1, 3)
      const totalPrice = product.price_amount * quantity
      grandTotal += totalPrice

      orderProducts.push({
        product,
        quantity,
        totalPrice
      })
    }

    const shippingPrice = grandTotal > 50 ? 0 : 5.90
    grandTotal += shippingPrice
    const totalTax = grandTotal * 0.255 / 1.255

    const statuses = ['paid', 'paid', 'paid', 'shipped', 'delivered', 'delivered', 'delivered']
    const status = random(statuses)

    const order = {
      store_id: store.id,
      customer_id: customer.id,
      epages_order_id: `order-${10000 + i}`,
      order_number: `#${10000 + i}`,
      status: status,
      creation_date: orderDate,
      paid_on: status !== 'pending' ? orderDate : null,
      dispatched_on: ['shipped', 'delivered'].includes(status) ? orderDate : null,
      delivered_on: status === 'delivered' ? orderDate : null,
      grand_total: grandTotal.toFixed(2),
      total_before_tax: (grandTotal - totalTax).toFixed(2),
      total_tax: totalTax.toFixed(2),
      shipping_price: shippingPrice,
      currency: 'EUR',
      billing_first_name: customer.first_name,
      billing_last_name: customer.last_name,
      billing_street: customer.street,
      billing_zip_code: customer.zip_code,
      billing_city: customer.city,
      billing_country: 'FI',
      billing_email: customer.email,
      shipping_first_name: customer.first_name,
      shipping_last_name: customer.last_name,
      shipping_street: customer.street,
      shipping_zip_code: customer.zip_code,
      shipping_city: customer.city,
      shipping_country: 'FI',
      payment_method: random(paymentMethods),
      shipping_method: random(shippingMethods),
      locale: 'fi_FI'
    }

    orders.push({ order, products: orderProducts })
  }

  // Insert orders in batches
  const batchSize = 100
  let insertedOrderCount = 0

  for (let i = 0; i < orders.length; i += batchSize) {
    const batch = orders.slice(i, i + batchSize)
    const orderData = batch.map(o => o.order)

    const { data: insertedOrders, error: ordersError } = await supabase
      .from('orders')
      .insert(orderData)
      .select()

    if (ordersError) {
      console.error('❌ Orders error:', ordersError.message)
      continue
    }

    // Create line items for these orders
    const lineItems = []
    for (let j = 0; j < insertedOrders.length; j++) {
      const order = insertedOrders[j]
      const orderProds = batch[j].products

      for (const op of orderProds) {
        lineItems.push({
          order_id: order.id,
          product_id: op.product.id,
          product_number: op.product.product_number,
          product_name: op.product.name,
          quantity: op.quantity,
          unit_price: op.product.price_amount,
          total_price: op.totalPrice,
          tax_rate: 25.5,
          tax_amount: op.totalPrice * 0.255 / 1.255
        })
      }
    }

    const { error: lineItemsError } = await supabase
      .from('order_line_items')
      .insert(lineItems)

    if (lineItemsError) {
      console.error('❌ Line items error:', lineItemsError.message)
    }

    insertedOrderCount += insertedOrders.length
    console.log(`  📝 ${insertedOrderCount}/${orders.length} orders...`)
  }

  console.log(`✅ Created ${insertedOrderCount} orders\n`)

  // Summary
  console.log('🎉 Seeding complete!')
  console.log('=====================================')
  console.log(`📦 Store: ${store.name}`)
  console.log(`🛍️  Products: ${insertedProducts.length}`)
  console.log(`👥 Customers: ${insertedCustomers.length}`)
  console.log(`🛒 Orders: ${insertedOrderCount}`)
  console.log('=====================================')
}

seed().catch(console.error)
