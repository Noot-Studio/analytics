import { Button } from "@sbox-analytics/ui/components/button";
import { Checkbox } from "@sbox-analytics/ui/components/checkbox";
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogFooter,
  DialogHeader,
  DialogTitle,
} from "@sbox-analytics/ui/components/dialog";
import { DotmSquare4 } from "@sbox-analytics/ui/components/dotm-square-4";
import { Input } from "@sbox-analytics/ui/components/input";
import { Label } from "@sbox-analytics/ui/components/label";
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "@sbox-analytics/ui/components/select";
import { useEffect, useState } from "react";

export type AlertMetric = "CrashSpike" | "DauDrop";
export type AlertChannel = "Webhook" | "Email";

export interface AlertFormValues {
  name: string;
  metric: AlertMetric;
  threshold: number;
  channel: AlertChannel;
  destination: string;
  enabled: boolean;
}

const METRIC_LABELS: Record<AlertMetric, string> = {
  CrashSpike: "Crash spike",
  DauDrop: "DAU drop",
};

const CHANNEL_LABELS: Record<AlertChannel, string> = {
  Email: "Email",
  Webhook: "Webhook",
};

const THRESHOLD_HINT: Record<AlertMetric, string> = {
  CrashSpike: "Fire when crashes in the last hour reach this count.",
  DauDrop: "Fire when DAU falls this many percent below the 7-day average.",
};

const DESTINATION_HINT: Record<AlertChannel, string> = {
  Email: "Address to email when the alert fires.",
  Webhook: "HTTPS URL to POST the alert payload to.",
};

const EMPTY: AlertFormValues = {
  channel: "Webhook",
  destination: "",
  enabled: true,
  metric: "CrashSpike",
  name: "",
  threshold: 10,
};

interface AlertFormDialogProps {
  open: boolean;
  mode: "create" | "edit";
  initial: AlertFormValues | null;
  isPending: boolean;
  onOpenChange: (open: boolean) => void;
  onSubmit: (values: AlertFormValues) => void;
}

export const AlertFormDialog = ({
  initial,
  isPending,
  mode,
  onOpenChange,
  onSubmit,
  open,
}: AlertFormDialogProps) => {
  const [values, setValues] = useState<AlertFormValues>(initial ?? EMPTY);

  // Re-seed the form whenever it opens so editing a rule shows its current
  // values and creating starts blank.
  useEffect(() => {
    if (open) {
      setValues(initial ?? EMPTY);
    }
  }, [open, initial]);

  const update = <K extends keyof AlertFormValues>(
    key: K,
    value: AlertFormValues[K]
  ) => setValues((prev) => ({ ...prev, [key]: value }));

  const isValid = values.name.trim() !== "" && values.destination.trim() !== "";

  const handleSubmit = (event: { preventDefault(): void }) => {
    event.preventDefault();
    if (!isValid) {
      return;
    }
    onSubmit({
      ...values,
      destination: values.destination.trim(),
      name: values.name.trim(),
    });
  };

  return (
    <Dialog onOpenChange={onOpenChange} open={open}>
      <DialogContent>
        <DialogHeader>
          <DialogTitle>
            {mode === "create" ? "Create alert" : "Edit alert"}
          </DialogTitle>
          <DialogDescription>
            Watch a metric and notify a channel when it crosses a threshold.
          </DialogDescription>
        </DialogHeader>

        <form onSubmit={handleSubmit}>
          <div className="flex flex-col gap-4 py-2">
            <div className="flex flex-col gap-1.5">
              <Label htmlFor="alert-name">Name</Label>
              <Input
                autoFocus
                id="alert-name"
                maxLength={100}
                onChange={(event) => update("name", event.target.value)}
                placeholder="e.g. Crash spike"
                value={values.name}
              />
            </div>

            <div className="flex flex-col gap-1.5">
              <Label htmlFor="alert-metric">Metric</Label>
              <Select
                items={METRIC_LABELS}
                onValueChange={(next) =>
                  next && update("metric", next as AlertMetric)
                }
                value={values.metric}
              >
                <SelectTrigger className="w-full" id="alert-metric">
                  <SelectValue />
                </SelectTrigger>
                <SelectContent>
                  {Object.entries(METRIC_LABELS).map(([value, label]) => (
                    <SelectItem key={value} value={value}>
                      {label}
                    </SelectItem>
                  ))}
                </SelectContent>
              </Select>
            </div>

            <div className="flex flex-col gap-1.5">
              <Label htmlFor="alert-threshold">Threshold</Label>
              <Input
                id="alert-threshold"
                min={0}
                onChange={(event) =>
                  update("threshold", event.target.valueAsNumber || 0)
                }
                step="any"
                type="number"
                value={values.threshold}
              />
              <p className="text-muted-foreground text-xs">
                {THRESHOLD_HINT[values.metric]}
              </p>
            </div>

            <div className="flex flex-col gap-1.5">
              <Label htmlFor="alert-channel">Channel</Label>
              <Select
                items={CHANNEL_LABELS}
                onValueChange={(next) =>
                  next && update("channel", next as AlertChannel)
                }
                value={values.channel}
              >
                <SelectTrigger className="w-full" id="alert-channel">
                  <SelectValue />
                </SelectTrigger>
                <SelectContent>
                  {Object.entries(CHANNEL_LABELS).map(([value, label]) => (
                    <SelectItem key={value} value={value}>
                      {label}
                    </SelectItem>
                  ))}
                </SelectContent>
              </Select>
            </div>

            <div className="flex flex-col gap-1.5">
              <Label htmlFor="alert-destination">Destination</Label>
              <Input
                id="alert-destination"
                onChange={(event) => update("destination", event.target.value)}
                placeholder={
                  values.channel === "Email"
                    ? "alerts@studio.com"
                    : "https://hooks.example.com/sbox"
                }
                value={values.destination}
              />
              <p className="text-muted-foreground text-xs">
                {DESTINATION_HINT[values.channel]}
              </p>
            </div>

            {mode === "edit" ? (
              <Label
                className="flex items-center gap-2"
                htmlFor="alert-enabled"
              >
                <Checkbox
                  checked={values.enabled}
                  id="alert-enabled"
                  onCheckedChange={(checked) =>
                    update("enabled", checked === true)
                  }
                />
                Enabled
              </Label>
            ) : null}
          </div>

          <DialogFooter className="mt-4">
            <Button
              onClick={() => onOpenChange(false)}
              type="button"
              variant="outline"
            >
              Cancel
            </Button>
            <Button disabled={isPending || !isValid} type="submit">
              {isPending ? (
                <DotmSquare4 ariaLabel="Saving" dotSize={2} size={18} />
              ) : (
                "Save"
              )}
            </Button>
          </DialogFooter>
        </form>
      </DialogContent>
    </Dialog>
  );
};
