const { supabase } = require("./db.cjs");

async function check() {
  const { data } = await supabase
    .from("indicator_history")
    .select("indicator_id, numeric_value, recorded_date, comparison_mode")
    .gte("recorded_date", "2026-01-01")
    .order("recorded_date", { ascending: false })
    .order("indicator_id");

  const byDate = {};
  if (data) {
    for (const d of data) {
      if (!byDate[d.recorded_date]) byDate[d.recorded_date] = {};
      byDate[d.recorded_date][d.indicator_id] = {
        value: d.numeric_value,
        mode: d.comparison_mode
      };
    }
  }

  console.log("Indicator history 2026-01:");
  Object.keys(byDate).sort().reverse().forEach(date => {
    console.log("\n" + date + ":");
    Object.entries(byDate[date]).forEach(([id, data]) => {
      const val = typeof data.value === "number" ? data.value.toFixed(2) : data.value;
      console.log("  " + id.padEnd(25) + ": " + val + " (" + (data.mode || "mom") + ")");
    });
  });

  if (Object.keys(byDate).length === 0) {
    console.log("\n(no data found)");
  }
}

check();
