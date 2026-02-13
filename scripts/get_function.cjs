/**
 * Get calculate_goal_progress function definition
 */

const { supabase, printProjectInfo } = require('./db.cjs');

printProjectInfo();

(async () => {
  try {
    // Method 1: Try direct SQL query
    const { data, error } = await supabase.rpc('exec_sql', {
      sql_query: `
        SELECT pg_get_functiondef(oid) as definition
        FROM pg_proc
        WHERE proname = 'calculate_goal_progress'
      `
    });

    if (error) {
      console.log('Method 1 failed, trying Method 2...\n');

      // Method 2: Use from() to query information_schema
      const { data: data2, error: error2 } = await supabase
        .from('pg_proc')
        .select('oid')
        .eq('proname', 'calculate_goal_progress');

      if (error2) {
        console.error('❌ Error:', error2);
        process.exit(1);
      }

      console.log('Function OID:', data2);
      return;
    }

    if (!data || data.length === 0) {
      console.log('ℹ️ Function calculate_goal_progress not found');
      process.exit(0);
    }

    console.log('📄 calculate_goal_progress Function Definition:');
    console.log('='.repeat(80));
    console.log(data[0].definition);
    console.log('='.repeat(80));
  } catch (err) {
    console.error('❌ Exception:', err.message);
    process.exit(1);
  }
})();
