const { supabase } = require("./db.cjs");

async function check() {
  // Hae viimeisimmät indikaattorit 30d periodille
  const { data } = await supabase
    .from("indicators")
    .select("indicator_id, numeric_value, period_end, period_label, updated_at")
    .eq("period_label", "30d")
    .order("updated_at", { ascending: false });

  // Näytä vain uniikki indicator_id (viimeisin)
  const seen = new Set();
  console.log("Latest 30d indicators:");
  for (const d of data || []) {
    if (!seen.has(d.indicator_id)) {
      seen.add(d.indicator_id);
      const val = typeof d.numeric_value === "number" ? d.numeric_value.toFixed(2) : d.numeric_value;
      const date = d.period_end ? d.period_end.split("T")[0] : "null";
      console.log("  " + d.indicator_id.padEnd(25) + ": " + String(val).padStart(10) + " (end: " + date + ")");
    }
  }

  // Indicator history - viimeiset 14 riviä
  const { data: history } = await supabase
    .from("indicator_history")
    .select("indicator_id, numeric_value, recorded_date")
    .order("recorded_date", { ascending: false })
    .limit(14);

  console.log("\nIndicator history (last 14 entries):");
  for (const h of history || []) {
    const val = typeof h.numeric_value === "number" ? h.numeric_value.toFixed(2) : h.numeric_value;
    console.log("  " + h.recorded_date + " | " + h.indicator_id.padEnd(25) + ": " + val);
  }

  if (!history || history.length === 0) {
    console.log("  (no history data)");
  }
}

check();
