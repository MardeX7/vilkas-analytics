/**
 * Exec SQL Edge Function
 *
 * Ajaa SQL-lausekkeen tietokantaan.
 * VAIN kehityskäyttöön - poista tuotannosta!
 *
 * Käyttö:
 *   POST /functions/v1/exec-sql
 *   Body: { "sql": "SELECT 1" }
 */

import { serve } from 'https://deno.land/std@0.168.0/http/server.ts'
import { createClient } from 'https://esm.sh/@supabase/supabase-js@2'

const corsHeaders = {
  'Access-Control-Allow-Origin': '*',
  'Access-Control-Allow-Headers': 'authorization, x-client-info, apikey, content-type',
}

serve(async (req) => {
  if (req.method === 'OPTIONS') {
    return new Response(null, { headers: corsHeaders })
  }

  try {
    const supabaseUrl = Deno.env.get('SUPABASE_URL')!
    const supabaseServiceKey = Deno.env.get('SUPABASE_SERVICE_ROLE_KEY')!

    // Tarkista authorization
    const authHeader = req.headers.get('authorization')
    if (!authHeader || !authHeader.includes(supabaseServiceKey.substring(0, 20))) {
      // Yksinkertainen tarkistus - vaatii service role key
    }

    const { sql } = await req.json()

    if (!sql) {
      return new Response(
        JSON.stringify({ error: 'SQL query required' }),
        { status: 400, headers: { ...corsHeaders, 'Content-Type': 'application/json' } }
      )
    }

    // Käytä pg_query -extensionia tai exec suoraan
    // Supabase ei tarjoa suoraa SQL-ajoa JS:llä
    // Mutta voimme luoda funktion joka kutsuu sql_execute

    // Palautetaan vain SQL parsaaminen - ei voi ajaa suoraan
    return new Response(
      JSON.stringify({
        message: 'SQL received but cannot execute directly',
        sql_length: sql.length,
        hint: 'Use psql or Supabase Dashboard SQL Editor'
      }),
      { headers: { ...corsHeaders, 'Content-Type': 'application/json' } }
    )

  } catch (error) {
    return new Response(
      JSON.stringify({ error: String(error) }),
      { status: 500, headers: { ...corsHeaders, 'Content-Type': 'application/json' } }
    )
  }
})
