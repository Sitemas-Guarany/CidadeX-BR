import { createClient } from "https://esm.sh/@supabase/supabase-js@2";

const corsHeaders = {
  "Access-Control-Allow-Origin": "*",
  "Access-Control-Allow-Headers":
    "authorization, x-client-info, apikey, content-type",
};

Deno.serve(async (req) => {
  if (req.method === "OPTIONS") {
    return new Response(null, { headers: corsHeaders });
  }

  try {
    const supabaseUrl = Deno.env.get("SUPABASE_URL")!;
    const supabaseKey = Deno.env.get("SUPABASE_SERVICE_ROLE_KEY")!;
    const supabase = createClient(supabaseUrl, supabaseKey);

    // Fetch ALL recurring active records
    const { data: recurringRecords, error: fetchError } = await supabase
      .from("financial_records")
      .select("*")
      .eq("is_recurring", true)
      .eq("recurring_active", true)
      .order("due_date", { ascending: false });

    if (fetchError) {
      console.error("Error fetching:", fetchError);
      return new Response(JSON.stringify({ error: fetchError.message }), {
        status: 500,
        headers: { ...corsHeaders, "Content-Type": "application/json" },
      });
    }

    if (!recurringRecords || recurringRecords.length === 0) {
      return new Response(JSON.stringify({ message: "No recurring records found", created: 0 }), {
        headers: { ...corsHeaders, "Content-Type": "application/json" },
      });
    }

    // Group by installment_group_id
    const groups = new Map<string, typeof recurringRecords>();
    for (const record of recurringRecords) {
      const key = record.installment_group_id || record.id;
      if (!groups.has(key)) groups.set(key, []);
      groups.get(key)!.push(record);
    }

    const now = new Date();
    let createdCount = 0;
    const errors: string[] = [];

    for (const [groupKey, groupRecords] of groups) {
      // Find the most recent record
      const sorted = groupRecords.sort((a: any, b: any) => {
        return (b.due_date || "").localeCompare(a.due_date || "");
      });
      const latest = sorted[0];
      if (!latest.due_date) continue;

      const latestDate = new Date(latest.due_date + "T12:00:00");
      const baseDesc = latest.description.replace(/\s*\(\d+\/?\d*\)\s*$/, "").trim();
      let maxNum = Math.max(...groupRecords.map((r: any) => r.installment_number || 0));

      // Collect existing months in this group
      const existingMonths = new Set(
        groupRecords
          .filter((r: any) => r.due_date)
          .map((r: any) => r.due_date.substring(0, 7)) // "yyyy-MM"
      );

      // Generate from the month after latest, up to 6 months from now
      const futureLimit = new Date(now.getFullYear(), now.getMonth() + 7, 0); // end of 6th month
      let nextDate = new Date(latestDate);
      nextDate.setMonth(nextDate.getMonth() + 1);

      const toInsert = [];

      while (nextDate <= futureLimit) {
        const monthKey = nextDate.toISOString().substring(0, 7); // "yyyy-MM"
        const dueStr = nextDate.toISOString().split("T")[0];

        if (!existingMonths.has(monthKey)) {
          maxNum++;
          existingMonths.add(monthKey); // prevent duplicates in same run
          toInsert.push({
            user_id: latest.user_id,
            type: latest.type,
            description: baseDesc,
            amount: latest.amount,
            entry_date: dueStr,
            due_date: dueStr,
            payment_date: null,
            payee: latest.payee,
            category: latest.category,
            referente: latest.referente,
            status: "pendente",
            notes: "Gerado automaticamente (recorrência mensal)",
            installment_total: null,
            installment_number: maxNum,
            installment_group_id: latest.installment_group_id || groupKey,
            interest_amount: 0,
            discount_amount: 0,
            attachment_url: null,
            is_recurring: true,
            recurring_active: true,
            account_id: latest.account_id,
            payment_method: latest.payment_method,
          });
        }

        // Move to next month (based on same day)
        const day = latestDate.getDate();
        const newMonth = nextDate.getMonth() + 1;
        const newYear = nextDate.getFullYear() + (newMonth > 11 ? 1 : 0);
        nextDate = new Date(newYear, newMonth % 12, day, 12);
      }

      // Batch insert
      if (toInsert.length > 0) {
        const { error: insertError } = await supabase
          .from("financial_records")
          .insert(toInsert);
        if (insertError) {
          console.error(`Error for group ${groupKey}:`, insertError);
          errors.push(`${groupKey}: ${insertError.message}`);
        } else {
          createdCount += toInsert.length;
        }
      }
    }

    const result = {
      message: `Generated ${createdCount} recurring records from ${groups.size} groups`,
      created: createdCount,
      groups: groups.size,
      errors: errors.length > 0 ? errors : undefined,
    };
    console.log(JSON.stringify(result));

    return new Response(JSON.stringify(result), {
      headers: { ...corsHeaders, "Content-Type": "application/json" },
    });
  } catch (err) {
    console.error("Unexpected error:", err);
    return new Response(JSON.stringify({ error: String(err) }), {
      status: 500,
      headers: { ...corsHeaders, "Content-Type": "application/json" },
    });
  }
});
