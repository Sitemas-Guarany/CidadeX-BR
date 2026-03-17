ALTER TABLE public.agenda_items ADD COLUMN reminder_minutes integer DEFAULT NULL;
-- NULL = no reminder, value = minutes before scheduled_date to notify