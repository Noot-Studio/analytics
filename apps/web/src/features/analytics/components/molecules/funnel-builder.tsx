import { Button } from "@sbox-analytics/ui/components/button";
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "@sbox-analytics/ui/components/select";
import { IconX } from "@tabler/icons-react";

export const FunnelBuilder = ({
  availableEventTypes,
  onStepsChange,
  steps,
}: {
  availableEventTypes: string[];
  onStepsChange: (steps: string[]) => void;
  steps: string[];
}) => {
  const addStep = (eventType: string | null) => {
    if (eventType) {
      onStepsChange([...steps, eventType]);
    }
  };

  const removeStep = (index: number) => {
    onStepsChange(steps.filter((_step, i) => i !== index));
  };

  return (
    <div className="flex flex-col gap-3 rounded-lg border border-border p-4">
      <div className="flex flex-col gap-1">
        <h2 className="font-medium text-sm">Funnel steps</h2>
        <p className="text-muted-foreground text-xs">
          Add at least two events in the order players should complete them.
        </p>
      </div>

      {steps.length > 0 ? (
        <ol className="flex flex-col gap-2">
          {steps.map((eventType, index) => (
            <li
              className="flex items-center gap-2 rounded-md border border-border bg-muted/40 px-3 py-2"
              key={`${eventType}-${index}`}
            >
              <span className="font-mono text-muted-foreground text-xs">
                {index + 1}
              </span>
              <span className="flex-1 truncate text-sm">{eventType}</span>
              <Button
                aria-label={`Remove step ${index + 1}`}
                onClick={() => removeStep(index)}
                size="icon"
                variant="ghost"
              >
                <IconX />
              </Button>
            </li>
          ))}
        </ol>
      ) : null}

      <Select onValueChange={addStep} value="">
        <SelectTrigger className="w-full">
          <SelectValue placeholder="Add an event step…" />
        </SelectTrigger>
        <SelectContent>
          {availableEventTypes.map((eventType) => (
            <SelectItem key={eventType} value={eventType}>
              {eventType}
            </SelectItem>
          ))}
        </SelectContent>
      </Select>
    </div>
  );
};
