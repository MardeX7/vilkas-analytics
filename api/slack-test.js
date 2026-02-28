/**
 * Slack Test Endpoint
 * POST /api/slack-test
 * Body: { webhook_url, message?, shop_name? }
 *
 * Sends a test greeting message to a Slack channel
 */

import { sendToSlack, header, section, divider, context } from './lib/slack.js'

export default async function handler(req, res) {
  if (req.method !== 'POST') {
    return res.status(405).json({ error: 'Method not allowed' })
  }

  const { webhook_url, shop_name } = req.body || {}

  if (!webhook_url) {
    return res.status(400).json({ error: 'webhook_url required' })
  }

  const name = shop_name || 'Kauppasi'

  const message = {
    blocks: [
      header(`:wave: Hei! Olen Vilkas Analytics Agent`),

      section(
        `Tervetuloa *${name}* Slack-kanavalle! :tada:\n\n` +
        `Olen tekoälypohjainen analytiikka-avustaja, joka seuraa verkkokauppasi dataa ja raportoi sinulle automaattisesti.`
      ),

      divider(),

      section(
        `*:sunrise: Aamubrief (joka päivä)*\n` +
        `Saat päivittäin klo 8:15 (Suomen aikaa) aamuraportin joka sisältää:\n` +
        `• Eilisen uudet tilaukset ja liikevaihdon\n` +
        `• Myyntiyhteenvedon vertailulukuineen\n` +
        `• Varastovaroitukset (loppu / kriittinen)`
      ),

      section(
        `*:shopping_cart: Tilausehdotukset (maanantaisin)*\n` +
        `Joka maanantai klo 8:30 saat tilauslistan:\n` +
        `• Tuotteet jotka pitää tilata myyntinopeuden perusteella\n` +
        `• Arvioitu varastoriittävyys päivissä\n` +
        `• Ehdotettu tilausmäärä (30 päivän tarve)`
      ),

      section(
        `*:calendar: Viikkoraportti (maanantaisin)*\n` +
        `Joka maanantai klo 9:30 saat viikkoanalyysin:\n` +
        `• Growth Engine -indeksi (0–100)\n` +
        `• Tekoälyn luoma yhteenveto viikosta\n` +
        `• Top 3 toimenpidesuositukset`
      ),

      divider(),

      section(
        `*:robot_face: Emma – AI-analyytikko*\n` +
        `Voit myös keskustella Emman kanssa Vilkas Analytics -sovelluksessa. ` +
        `Emma analysoi datasi ja vastaa kysymyksiisi suomeksi.`
      ),

      context(`:link: <https://vilkas-analytics.vercel.app|Avaa Vilkas Analytics> | Raportit alkavat automaattisesti huomenna :sunrise:`)
    ]
  }

  const result = await sendToSlack(webhook_url, message)

  if (!result.success) {
    return res.status(200).json({ success: false, error: result.error })
  }

  return res.status(200).json({ success: true, message: `Greeting sent to ${name} channel` })
}
