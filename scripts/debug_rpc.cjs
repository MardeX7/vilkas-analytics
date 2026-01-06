const { supabase } = require("./db.cjs");

async function check() {
  // Hae suoraan taulusta viimeisin per indicator_id
  const { data: direct } = await supabase
    .from("indicators")
    .select("indicator_id, numeric_value, period_end")
    .eq("period_label", "30d")
    .order("period_end", { ascending: false });

  // Ryhmitä ja näytä viimeisin
  const latest = {};
  for (const d of direct || []) {
    if (!latest[d.indicator_id]) {
      latest[d.indicator_id] = d;
    }
  }

  console.log("Direct query (latest by period_end):");
  Object.values(latest).forEach(d => {
    console.log("  " + d.indicator_id.padEnd(25) + ": " + d.numeric_value + " (end: " + (d.period_end ? d.period_end.split("T")[0] : "null") + ")");
  });

  // Näytä kaikki organic_conversion_rate arvot
  console.log("\nAll organic_conversion_rate rows:");
  for (const d of direct || []) {
    if (d.indicator_id === "organic_conversion_rate") {
      console.log("  " + d.numeric_value + " (end: " + (d.period_end ? d.period_end.split("T")[0] : "null") + ")");
    }
  }
}

check();
