-- Drop old unique constraint (medication_id, log_date) - only allows 1 log per med per day
-- Replace with (medication_id, log_date, scheduled_time) to allow multiple logs per med per day (one per time slot)
DROP INDEX IF EXISTS public.medication_logs_med_date_unique;
CREATE UNIQUE INDEX medication_logs_med_date_time_unique ON public.medication_logs USING btree (medication_id, log_date, scheduled_time);