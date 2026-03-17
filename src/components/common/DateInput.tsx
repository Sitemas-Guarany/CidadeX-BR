import { useState, useEffect, useRef } from "react";
import { createPortal } from "react-dom";
import { CalendarDays } from "lucide-react";
import { format, parse, isValid } from "date-fns";
import { ptBR } from "date-fns/locale";
import { Calendar } from "@/components/ui/calendar";
import { Popover, PopoverContent, PopoverTrigger } from "@/components/ui/popover";
import { cn } from "@/lib/utils";

interface DateInputProps {
  /** Value in yyyy-MM-dd format (or null/empty) */
  value: string | null;
  /** Called with yyyy-MM-dd string (or null when cleared) */
  onChange: (value: string | null) => void;
  placeholder?: string;
  required?: boolean;
  className?: string;
  /** Extra class for the wrapper */
  wrapperClassName?: string;
  /** Size variant */
  size?: "sm" | "md";
}

/**
 * DateInput — regra do sistema: todos os campos de data devem usar este componente.
 * Permite digitação manual (dd/mm/aaaa) + seleção via calendário.
 */
const DateInput = ({
  value,
  onChange,
  placeholder = "dd/mm/aaaa",
  required = false,
  className,
  wrapperClassName,
  size = "md",
}: DateInputProps) => {
  const [display, setDisplay] = useState("");
  const [calendarOpen, setCalendarOpen] = useState(false);
  const inputRef = useRef<HTMLInputElement>(null);

  // Sync display from external value
  useEffect(() => {
    if (value) {
      try {
        const d = new Date(value + "T12:00:00");
        if (isValid(d)) {
          setDisplay(format(d, "dd/MM/yyyy"));
          return;
        }
      } catch {}
    }
    setDisplay("");
  }, [value]);

  const handleInput = (raw: string) => {
    const digits = raw.replace(/\D/g, "");
    let masked = digits;
    if (digits.length >= 3) masked = digits.slice(0, 2) + "/" + digits.slice(2);
    if (digits.length >= 5) masked = digits.slice(0, 2) + "/" + digits.slice(2, 4) + "/" + digits.slice(4, 8);
    setDisplay(masked);

    if (digits.length === 8) {
      const d = parseInt(digits.slice(0, 2));
      const m = parseInt(digits.slice(2, 4)) - 1;
      const y = parseInt(digits.slice(4, 8));
      const date = new Date(y, m, d);
      if (isValid(date) && date.getDate() === d && date.getMonth() === m) {
        onChange(format(date, "yyyy-MM-dd"));
      }
    } else if (digits.length === 0) {
      onChange(null);
    }
  };

  const handleCalendarSelect = (d: Date | undefined) => {
    if (d) {
      onChange(format(d, "yyyy-MM-dd"));
      setDisplay(format(d, "dd/MM/yyyy"));
      setCalendarOpen(false);
    }
  };

  const selectedDate = value ? new Date(value + "T12:00:00") : undefined;

  const sizeClasses = size === "sm"
    ? "px-2 py-1.5 text-xs"
    : "px-3 py-2 text-sm";

  const btnSizeClasses = size === "sm"
    ? "px-1.5 py-1.5"
    : "px-2.5 py-2";

  return (
    <div className={cn("flex gap-1", wrapperClassName)}>
      <input
        ref={inputRef}
        type="text"
        inputMode="numeric"
        placeholder={placeholder}
        value={display}
        onChange={e => handleInput(e.target.value)}
        maxLength={10}
        required={required}
        className={cn(
          "flex-1 rounded-lg bg-muted text-foreground placeholder:text-muted-foreground outline-none focus:ring-2 ring-primary/30",
          sizeClasses,
          className
        )}
      />
      <Popover open={calendarOpen} onOpenChange={setCalendarOpen}>
        <PopoverTrigger asChild>
          <button
            type="button"
            className={cn(
              "rounded-lg border border-input bg-muted hover:bg-accent transition-colors shrink-0",
              btnSizeClasses
            )}
          >
            <CalendarDays className={size === "sm" ? "w-3 h-3 text-muted-foreground" : "w-4 h-4 text-muted-foreground"} />
          </button>
        </PopoverTrigger>
        <PopoverContent className="w-auto p-0 z-[99999]" align="center" side="top" sideOffset={4} avoidCollisions>
          <Calendar
            mode="single"
            selected={selectedDate}
            onSelect={handleCalendarSelect}
            locale={ptBR}
            initialFocus
            className={cn("p-3 pointer-events-auto")}
          />
        </PopoverContent>
      </Popover>
    </div>
  );
};

export default DateInput;
