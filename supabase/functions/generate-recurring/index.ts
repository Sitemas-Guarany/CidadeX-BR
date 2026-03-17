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

    // Find all recurring active records that are the latest in their group
    // We look for records where is_recurring = true AND recurring_active = true
    const { data: recurringRecords, error: fetchError } = await supabase
      .from("financial_records")
      .select("*")
      .eq("is_recurring", true)
      .eq("recurring_active", true)
      .order("due_date", { ascending: false });

    if (fetchError) {
      console.error("Error fetching recurring records:", fetchError);
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

    // Group by installment_group_id (or by individual record if no group)
    const groups = new Map<string, typeof recurringRecords>();
    for (const record of recurringRecords) {
      const key = record.installment_group_id || record.id;
      if (!groups.has(key)) {
        groups.set(key, []);
      }
      groups.get(key)!.push(record);
    }

    const now = new Date();
    const currentMonth = now.getMonth();
    const currentYear = now.getFullYear();
    let createdCount = 0;

    for (const [groupKey, groupRecords] of groups) {
      // Find the most recent record by due_date in this group
      const sorted = groupRecords.sort((a: any, b: any) => {
        const dateA = a.due_date ? new Date(a.due_date + "T12:00:00").getTime() : 0;
        const dateB = b.due_date ? new Date(b.due_date + "T12:00:00").getTime() : 0;
        return dateB - dateA;
      });
      const latest = sorted[0];

      if (!latest.due_date) continue;

      const latestDate = new Date(latest.due_date + "T12:00:00");

      // Check if a record already exists for the current month
      const hasCurrentMonth = groupRecords.some((r: any) => {
        if (!r.due_date) return false;
        const d = new Date(r.due_date + "T12:00:00");
        return d.getMonth() === currentMonth && d.getFullYear() === currentYear;
      });

      if (hasCurrentMonth) continue;

      // Calculate next month's due date from the latest record
      const nextDate = new Date(latestDate);
      nextDate.setMonth(nextDate.getMonth() + 1);

      // Only create if the next date is in current month or earlier (catch-up)
      if (nextDate.getFullYear() > currentYear || 
          (nextDate.getFullYear() === currentYear && nextDate.getMonth() > currentMonth)) {
        continue;
      }

      // Determine the next installment number
      const maxNum = Math.max(...groupRecords.map((r: any) => r.installment_number || 0));

      // Clean description of existing suffix
      const baseDesc = latest.description.replace(/\s*\(\d+\/?\d*\)\s*$/, "").trim();

      const newRecord = {
        user_id: latest.user_id,
        type: latest.type,
        description: baseDesc,
        amount: latest.amount,
        entry_date: nextDate.toISOString().split("T")[0],
        due_date: nextDate.toISOString().split("T")[0],
        payment_date: null,
        payee: latest.payee,
        category: latest.category,
        referente: latest.referente,
        status: "pendente",
        notes: "Gerado automaticamente (recorrência mensal)",
        installment_total: null,
        installment_number: maxNum + 1,
        installment_group_id: latest.installment_group_id || groupKey,
        interest_amount: 0,
        discount_amount: 0,
        attachment_url: null,
        is_recurring: true,
        recurring_active: true,
        account_id: latest.account_id,
        payment_method: latest.payment_method,
      };

      const { error: insertError } = await supabase
        .from("financial_records")
        .insert(newRecord);

      if (insertError) {
        console.error(`Error creating recurring record for group ${groupKey}:`, insertError);
      } else {
        createdCount++;
      }
    }

    return new Response(
      JSON.stringify({ message: `Generated ${createdCount} recurring records`, created: createdCount }),
      { headers: { ...corsHeaders, "Content-Type": "application/json" } }
    );
  } catch (err) {
    console.error("Unexpected error:", err);
    return new Response(JSON.stringify({ error: "Internal server error" }), {
      status: 500,
      headers: { ...corsHeaders, "Content-Type": "application/json" },
    });
  }
});
