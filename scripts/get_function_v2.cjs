/**
 * Get calculate_goal_progress function definition
 * Using direct SQL execution
 */

const { supabase, printProjectInfo } = require('./db.cjs');

printProjectInfo();

(async () => {
  try {
    // Execute raw SQL via PostgREST
    const { data, error } = await supabase
      .rpc('exec_sql', {
        query: "SELECT pg_get_functiondef('calculate_goal_progress'::regproc) AS definition"
      })
      .single();

    if (error) {
      console.error('❌ RPC Error:', error);

      // Try alternative: List all functions
      console.log('\n📋 Trying to list all functions containing "goal"...\n');

      const { data: funcs, error: err2 } = await supabase
        .from('routines')
        .select('routine_name, routine_definition')
        .ilike('routine_name', '%goal%');

      if (err2) {
        console.error('❌ Alternative failed:', err2);
      } else {
        console.log('Found functions:', funcs);
      }

      process.exit(1);
    }

    console.log('📄 calculate_goal_progress Function Definition:');
    console.log('='.repeat(80));
    console.log(data.definition);
    console.log('='.repeat(80));
  } catch (err) {
    console.error('❌ Exception:', err.message);
    console.error('Stack:', err.stack);
    process.exit(1);
  }
})();
