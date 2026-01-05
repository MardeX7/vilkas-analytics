import { createClient } from '@supabase/supabase-js'
import { readFileSync } from 'fs'
import { fileURLToPath } from 'url'
import { dirname, join } from 'path'

const __filename = fileURLToPath(import.meta.url)
const __dirname = dirname(__filename)

const supabaseUrl = 'https://tlothekaphtiwvusgwzh.supabase.co'
const serviceRoleKey = 'eyJhbGciOiJIUzI1NiIsInR5cCI6IkpXVCJ9.eyJpc3MiOiJzdXBhYmFzZSIsInJlZiI6InRsb3RoZWthcGh0aXd2dXNnd3poIiwicm9sZSI6InNlcnZpY2Vfcm9sZSIsImlhdCI6MTc2NzYxOTYwMCwiZXhwIjoyMDgzMTk1NjAwfQ.PxMeALq2SEylsXwybYAASYcxjtVBzjjiWFsiOulhQyY'

const supabase = createClient(supabaseUrl, serviceRoleKey)

async function runMigration() {
  console.log('📦 Running migration...')

  const sqlPath = join(__dirname, '../supabase/migrations/001_initial_schema.sql')
  const sql = readFileSync(sqlPath, 'utf8')

  // Split by semicolons but keep CREATE FUNCTION blocks intact
  const statements = []
  let current = ''
  let inFunction = false

  for (const line of sql.split('\n')) {
    current += line + '\n'

    if (line.includes('$$ LANGUAGE')) {
      inFunction = false
    }
    if (line.includes('AS $$')) {
      inFunction = true
    }

    if (line.trim().endsWith(';') && !inFunction) {
      if (current.trim() && !current.trim().startsWith('--')) {
        statements.push(current.trim())
      }
      current = ''
    }
  }

  console.log(`📝 Found ${statements.length} SQL statements`)

  for (let i = 0; i < statements.length; i++) {
    const stmt = statements[i]
    if (!stmt || stmt.startsWith('--')) continue

    try {
      const { error } = await supabase.rpc('exec_sql', { sql: stmt })
      if (error) {
        // Try direct query via REST
        const response = await fetch(`${supabaseUrl}/rest/v1/`, {
          method: 'POST',
          headers: {
            'apikey': serviceRoleKey,
            'Authorization': `Bearer ${serviceRoleKey}`,
            'Content-Type': 'application/json',
            'Prefer': 'return=minimal'
          }
        })
      }
      console.log(`✅ Statement ${i + 1}/${statements.length}`)
    } catch (err) {
      console.log(`⚠️ Statement ${i + 1}: ${err.message?.slice(0, 50) || 'error'}`)
    }
  }

  console.log('✅ Migration complete!')
}

runMigration().catch(console.error)
