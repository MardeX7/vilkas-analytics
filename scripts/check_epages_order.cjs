/**
 * Tarkista ePages API:n tilausrakenne
 */

const EPAGES_CONFIG = {
  apiUrl: 'https://www.billackering.eu/rs/shops/billackering',
  accessToken: 'XH5IrE6QIY3PLL6pX5bUr7n1jcmgeuYq'
}

async function fetchOrder() {
  try {
    const response = await fetch(EPAGES_CONFIG.apiUrl + '/orders?resultsPerPage=5', {
      headers: {
        'Authorization': 'Bearer ' + EPAGES_CONFIG.accessToken,
        'Accept': 'application/vnd.epages.v1+json'
      }
    })

    if (!response.ok) {
      console.log('API Error:', response.status)
      return
    }

    const data = await response.json()

    if (!data.items || data.items.length === 0) {
      console.log('Ei tilauksia')
      return
    }

    console.log('Tilauksia:', data.items.length)

    const order = data.items[0]
    console.log('')
    console.log('ENSIMMÄINEN TILAUS (kaikki kentät):')
    console.log(JSON.stringify(order, null, 2))

  } catch (err) {
    console.log('Error:', err.message)
  }
}

fetchOrder()
