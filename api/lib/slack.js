/**
 * Slack Integration Utilities
 *
 * Shared functions for sending messages to Slack via Incoming Webhooks
 */

/**
 * Send a message to Slack via Incoming Webhook
 * @param {string} webhookUrl - Slack Incoming Webhook URL
 * @param {object} message - Slack message payload (blocks, text, etc.)
 * @returns {Promise<{success: boolean, error?: string}>}
 */
export async function sendToSlack(webhookUrl, message) {
  if (!webhookUrl) {
    console.error('SLACK_WEBHOOK_URL not configured')
    return { success: false, error: 'Webhook URL not configured' }
  }

  try {
    const response = await fetch(webhookUrl, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify(message)
    })

    if (!response.ok) {
      const errorText = await response.text()
      console.error('Slack API error:', response.status, errorText)
      return { success: false, error: `Slack API error: ${response.status} - ${errorText}` }
    }

    return { success: true }
  } catch (err) {
    console.error('Slack send error:', err.message)
    return { success: false, error: err.message }
  }
}

/**
 * Format a number with Swedish locale (space as thousands separator)
 * @param {number} num - Number to format
 * @param {number} decimals - Decimal places (default 0)
 * @returns {string}
 */
export function formatNumber(num, decimals = 0) {
  if (num === null || num === undefined || isNaN(num)) return 'N/A'
  return num.toLocaleString('sv-SE', {
    minimumFractionDigits: decimals,
    maximumFractionDigits: decimals
  })
}

/**
 * Calculate percentage change between two values
 * @param {number} current - Current value
 * @param {number} previous - Previous value
 * @returns {number|null} - Percentage change or null if cannot calculate
 */
export function calculateChange(current, previous) {
  if (!previous || previous === 0) return null
  return ((current - previous) / previous) * 100
}

/**
 * Format percentage change with sign and emoji
 * @param {number|null} change - Percentage change
 * @param {boolean} invertColors - True if lower is better (e.g., bounce rate)
 * @returns {{text: string, emoji: string}}
 */
export function formatChange(change, invertColors = false) {
  if (change === null || change === undefined || isNaN(change)) {
    return { text: 'N/A', emoji: '' }
  }

  const sign = change >= 0 ? '+' : ''
  const isPositive = invertColors ? change < 0 : change >= 0
  const emoji = isPositive ? ':chart_with_upwards_trend:' : ':chart_with_downwards_trend:'

  return {
    text: `${sign}${change.toFixed(1)}%`,
    emoji
  }
}

/**
 * Get localized weekday name
 * @param {Date} date - Date object
 * @param {string} language - 'fi' or 'sv'
 * @returns {string}
 */
export function getWeekdayName(date, language = 'fi') {
  const weekdays = {
    fi: ['Su', 'Ma', 'Ti', 'Ke', 'To', 'Pe', 'La'],
    sv: ['Sön', 'Mån', 'Tis', 'Ons', 'Tor', 'Fre', 'Lör']
  }
  return (weekdays[language] || weekdays.fi)[date.getDay()]
}

/**
 * Get ISO week number
 * @param {Date} date - Date object
 * @returns {{week: number, year: number}}
 */
export function getISOWeek(date) {
  const d = new Date(Date.UTC(date.getFullYear(), date.getMonth(), date.getDate()))
  const dayNum = d.getUTCDay() || 7
  d.setUTCDate(d.getUTCDate() + 4 - dayNum)
  const yearStart = new Date(Date.UTC(d.getUTCFullYear(), 0, 1))
  const week = Math.ceil((((d - yearStart) / 86400000) + 1) / 7)
  return { week, year: d.getUTCFullYear() }
}

/**
 * Build a Slack divider block
 * @returns {object}
 */
export function divider() {
  return { type: 'divider' }
}

/**
 * Build a Slack header block
 * @param {string} text - Header text
 * @returns {object}
 */
export function header(text) {
  return {
    type: 'header',
    text: {
      type: 'plain_text',
      text,
      emoji: true
    }
  }
}

/**
 * Build a Slack section block with markdown
 * @param {string} text - Markdown text
 * @returns {object}
 */
export function section(text) {
  return {
    type: 'section',
    text: {
      type: 'mrkdwn',
      text
    }
  }
}

/**
 * Build a Slack section block with fields (2-column layout)
 * @param {string[]} fields - Array of markdown strings
 * @returns {object}
 */
export function sectionFields(fields) {
  return {
    type: 'section',
    fields: fields.map(text => ({
      type: 'mrkdwn',
      text
    }))
  }
}

/**
 * Build a Slack context block (small text footer)
 * @param {string} text - Context text
 * @returns {object}
 */
export function context(text) {
  return {
    type: 'context',
    elements: [{
      type: 'mrkdwn',
      text
    }]
  }
}
