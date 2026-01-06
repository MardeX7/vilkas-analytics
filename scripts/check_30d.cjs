const { supabase } = require("./db.cjs");

async function check() {
  // Hae 30d indikaattorit suoraan taulusta
  const { data } = await supabase
    .from("indicators")
    .select("indicator_id, numeric_value, period_end, updated_at")
    .eq("period_label", "30d")
    .order("updated_at", { ascending: false });

  const seen = new Set();
  console.log("30d indicators (latest by updated_at):");
  for (const d of data || []) {
    if (!seen.has(d.indicator_id)) {
      seen.add(d.indicator_id);
      const val = typeof d.numeric_value === "number" ? d.numeric_value.toFixed(2) : d.numeric_value;
      const endDate = d.period_end ? d.period_end.split("T")[0] : "null";
      const updated = d.updated_at ? d.updated_at.split("T")[1].split(".")[0] : "";
      console.log("  " + d.indicator_id.padEnd(25) + ": " + String(val).padStart(8) + " (end: " + endDate + ")");
    }
  }
}

check();
