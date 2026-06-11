import type {
  AlertRuleInput,
  AlertRuleSnapshot,
} from "@sbox-analytics/api/alerts/schema";
import { Button } from "@sbox-analytics/ui/components/button";
import { Checkbox } from "@sbox-analytics/ui/components/checkbox";
import {
  Field,
  FieldGroup,
  FieldLabel,
} from "@sbox-analytics/ui/components/field";
import { Input } from "@sbox-analytics/ui/components/input";
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "@sbox-analytics/ui/components/select";
import { useForm } from "@tanstack/react-form";
import { z } from "zod";

const formSchema = z
  .object({
    channel: z.enum(["Webhook", "Email"]),
    destination: z.string().min(1, "Destination is required"),
    enabled: z.boolean(),
    metric: z.enum(["CrashSpike", "DauDrop"]),
    name: z.string().min(1, "Name is required").max(100),
    threshold: z.number().positive("Must be greater than 0"),
  })
  .refine(
    (value) =>
      value.channel === "Webhook"
        ? z.url().safeParse(value.destination).success
        : z.email().safeParse(value.destination).success,
    {
      message: "Enter a valid URL for webhooks, or an email address",
      path: ["destination"],
    }
  );

const METRIC_ITEMS = [
  { label: "Crash spike", value: "CrashSpike" },
  { label: "DAU drop", value: "DauDrop" },
] as const;

const CHANNEL_ITEMS = [
  { label: "Webhook", value: "Webhook" },
  { label: "Email", value: "Email" },
] as const;

interface AlertFormProps {
  alert?: AlertRuleSnapshot;
  isSaving: boolean;
  onSave: (input: AlertRuleInput) => void;
  submitLabel: string;
}

export const AlertForm = ({
  alert,
  isSaving,
  onSave,
  submitLabel,
}: AlertFormProps) => {
  const form = useForm({
    defaultValues: {
      channel: alert?.channel ?? "Webhook",
      destination: alert?.destination ?? "",
      enabled: alert?.enabled ?? true,
      metric: alert?.metric ?? "CrashSpike",
      name: alert?.name ?? "",
      threshold: alert?.threshold ?? 10,
    },
    onSubmit: ({ value }) => {
      onSave(value);
    },
    validators: { onSubmit: formSchema },
  });

  return (
    <form
      onSubmit={(event) => {
        event.preventDefault();
        event.stopPropagation();
        form.handleSubmit();
      }}
    >
      <FieldGroup>
        <form.Field name="name">
          {(field) => (
            <Field>
              <FieldLabel htmlFor={`alert-${field.name}`}>Name</FieldLabel>
              <Input
                autoComplete="off"
                id={`alert-${field.name}`}
                name={field.name}
                onBlur={field.handleBlur}
                onChange={(event) => field.handleChange(event.target.value)}
                placeholder="Crash spike watch"
                value={field.state.value}
              />
              {field.state.meta.errors.map((error) => (
                <p className="text-destructive text-sm" key={error?.message}>
                  {error?.message}
                </p>
              ))}
            </Field>
          )}
        </form.Field>

        <form.Field name="metric">
          {(field) => (
            <Field>
              <FieldLabel htmlFor={`alert-${field.name}`}>Metric</FieldLabel>
              <Select
                items={METRIC_ITEMS}
                onValueChange={(value) =>
                  field.handleChange(value as AlertRuleInput["metric"])
                }
                value={field.state.value}
              >
                <SelectTrigger id={`alert-${field.name}`}>
                  <SelectValue />
                </SelectTrigger>
                <SelectContent>
                  {METRIC_ITEMS.map((item) => (
                    <SelectItem key={item.value} value={item.value}>
                      {item.label}
                    </SelectItem>
                  ))}
                </SelectContent>
              </Select>
            </Field>
          )}
        </form.Field>

        <form.Subscribe selector={(state) => state.values.metric}>
          {(metric) => (
            <form.Field name="threshold">
              {(field) => (
                <Field>
                  <FieldLabel htmlFor={`alert-${field.name}`}>
                    {metric === "CrashSpike"
                      ? "Crashes in the last hour"
                      : "DAU drop vs. 7-day average (%)"}
                  </FieldLabel>
                  <Input
                    id={`alert-${field.name}`}
                    min={1}
                    name={field.name}
                    onBlur={field.handleBlur}
                    onChange={(event) =>
                      field.handleChange(Number(event.target.value))
                    }
                    type="number"
                    value={
                      Number.isNaN(field.state.value) ? "" : field.state.value
                    }
                  />
                  {field.state.meta.errors.map((error) => (
                    <p
                      className="text-destructive text-sm"
                      key={error?.message}
                    >
                      {error?.message}
                    </p>
                  ))}
                </Field>
              )}
            </form.Field>
          )}
        </form.Subscribe>

        <form.Field name="channel">
          {(field) => (
            <Field>
              <FieldLabel htmlFor={`alert-${field.name}`}>Channel</FieldLabel>
              <Select
                items={CHANNEL_ITEMS}
                onValueChange={(value) =>
                  field.handleChange(value as AlertRuleInput["channel"])
                }
                value={field.state.value}
              >
                <SelectTrigger id={`alert-${field.name}`}>
                  <SelectValue />
                </SelectTrigger>
                <SelectContent>
                  {CHANNEL_ITEMS.map((item) => (
                    <SelectItem key={item.value} value={item.value}>
                      {item.label}
                    </SelectItem>
                  ))}
                </SelectContent>
              </Select>
            </Field>
          )}
        </form.Field>

        <form.Subscribe selector={(state) => state.values.channel}>
          {(channel) => (
            <form.Field name="destination">
              {(field) => (
                <Field>
                  <FieldLabel htmlFor={`alert-${field.name}`}>
                    {channel === "Webhook" ? "Webhook URL" : "Email address"}
                  </FieldLabel>
                  <Input
                    autoComplete="off"
                    id={`alert-${field.name}`}
                    name={field.name}
                    onBlur={field.handleBlur}
                    onChange={(event) => field.handleChange(event.target.value)}
                    placeholder={
                      channel === "Webhook"
                        ? "https://hooks.example.com/…"
                        : "alerts@studio.com"
                    }
                    value={field.state.value}
                  />
                  {field.state.meta.errors.map((error) => (
                    <p
                      className="text-destructive text-sm"
                      key={error?.message}
                    >
                      {error?.message}
                    </p>
                  ))}
                </Field>
              )}
            </form.Field>
          )}
        </form.Subscribe>

        <form.Field name="enabled">
          {(field) => (
            <Field orientation="horizontal">
              <Checkbox
                checked={field.state.value}
                id={`alert-${field.name}`}
                onCheckedChange={(checked) =>
                  field.handleChange(checked === true)
                }
              />
              <FieldLabel htmlFor={`alert-${field.name}`}>Enabled</FieldLabel>
            </Field>
          )}
        </form.Field>

        <form.Subscribe selector={(state) => state.canSubmit}>
          {(canSubmit) => (
            <Field>
              <Button disabled={!canSubmit || isSaving} type="submit">
                {isSaving ? "Saving…" : submitLabel}
              </Button>
            </Field>
          )}
        </form.Subscribe>
      </FieldGroup>
    </form>
  );
};
