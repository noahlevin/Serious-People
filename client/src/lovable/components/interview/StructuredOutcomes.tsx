import { useState } from "react";
import { Button } from "@/components/ui/button";

interface StructuredOption {
  id: string;
  label: string;
  value: string;
}

interface StructuredOutcomesProps {
  eventId: string;
  options: StructuredOption[];
  onSelect: (eventId: string, optionId: string, value: string) => Promise<void>;
  disabled?: boolean;
}

export default function StructuredOutcomes({
  eventId,
  options,
  onSelect,
  disabled = false,
}: StructuredOutcomesProps) {
  const [isSelecting, setIsSelecting] = useState(false);
  const [selectedId, setSelectedId] = useState<string | null>(null);

  const handleClick = async (option: StructuredOption) => {
    if (disabled || isSelecting) return;
    
    setIsSelecting(true);
    setSelectedId(option.id);
    
    try {
      await onSelect(eventId, option.id, option.value);
    } catch (error) {
      console.error("[StructuredOutcomes] Selection failed:", error);
      setIsSelecting(false);
      setSelectedId(null);
    }
  };

  return (
    <div className="py-2 flex justify-end" data-testid={`structured-outcomes-${eventId}`}>
      <div className="flex flex-wrap gap-2 justify-end">
        {options.map((option) => (
          <Button
            key={option.id}
            variant="outline"
            size="sm"
            onClick={() => handleClick(option)}
            disabled={disabled || isSelecting}
            className={`
              rounded-full px-4 py-1.5 text-sm font-normal
              transition-all duration-200
              ${selectedId === option.id ? "bg-accent text-accent-foreground" : ""}
              ${isSelecting && selectedId !== option.id ? "opacity-50" : ""}
            `}
            data-testid={`option-${option.id}`}
          >
            {option.label}
          </Button>
        ))}
      </div>
    </div>
  );
}
