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
import { useQuery } from "@tanstack/react-query";
import { Plus } from "lucide-react";
import { useMemo, useState } from "react";
import { z } from "zod";

import { MetricDrawer } from "@/features/dashboards/components/molecules/metric-drawer";
import { orpc } from "@/utils/orpc";

const formSchema = z
  .object({
    channel: z.enum(["Webhook", "Email"]),
    destination: z.string().min(1, "Destination is required"),
    enabled: z.boolean(),
    metricId: z.string().min(1, "Pick a metric"),
    name: z.string().min(1, "Name is required").max(100),
    operator: z.enum(["Above", "Below"]),
    threshold: z.number(),
    window: z.enum(["LastHour", "Last24Hours", "Last7Days"]),
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

const OPERATOR_ITEMS = [
  { label: "Rises to or above", value: "Above" },
  { label: "Falls to or below", value: "Below" },
] as const;

const WINDOW_ITEMS = [
  { label: "Last hour", value: "LastHour" },
  { label: "Last 24 hours", value: "Last24Hours" },
  { label: "Last 7 days", value: "Last7Days" },
] as const;

const CHANNEL_ITEMS = [
  { label: "Webhook", value: "Webhook" },
  { label: "Email", value: "Email" },
] as const;

const PREVIEW_WINDOW_MS = 7 * 24 * 60 * 60 * 1000;

interface AlertFormProps {
  alert?: AlertRuleSnapshot;
  isSaving: boolean;
  onSave: (input: AlertRuleInput) => void;
  organizationId?: string;
  projectId?: string;
  submitLabel: string;
}

export const AlertForm = ({
  alert,
  isSaving,
  onSave,
  organizationId,
  projectId,
  submitLabel,
}: AlertFormProps) => {
  const [metricDrawerOpen, setMetricDrawerOpen] = useState(false);

  const { data: metrics } = useQuery(
    orpc.metrics.list.queryOptions({ input: { organizationId, projectId } })
  );
  const metricItems = (metrics ?? []).map((metric) => ({
    label: metric.name,
    value: metric.id,
  }));

  // The metric drawer previews the metric over a fixed trailing range; the
  // alert's own evaluation window is chosen separately on the rule.
  const previewRange = useMemo(() => {
    const to = new Date();
    return {
      from: new Date(to.getTime() - PREVIEW_WINDOW_MS).toISOString(),
      to: to.toISOString(),
    };
  }, []);

  const form = useForm({
    defaultValues: {
      channel: alert?.channel ?? "Webhook",
      destination: alert?.destination ?? "",
      enabled: alert?.enabled ?? true,
      metricId: alert?.metricId ?? "",
      name: alert?.name ?? "",
      operator: alert?.operator ?? "Above",
      threshold: alert?.threshold ?? 10,
      window: alert?.window ?? "LastHour",
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

        <form.Field name="metricId">
          {(field) => (
            <Field>
              <FieldLabel htmlFor={`alert-${field.name}`}>Metric</FieldLabel>
              <div className="flex items-center gap-2">
                <Select
                  items={metricItems}
                  onValueChange={(value) => value && field.handleChange(value)}
                  value={field.state.value}
                >
                  <SelectTrigger className="flex-1" id={`alert-${field.name}`}>
                    <SelectValue placeholder="Pick a metric" />
                  </SelectTrigger>
                  <SelectContent>
                    {metricItems.map((item) => (
                      <SelectItem key={item.value} value={item.value}>
                        {item.label}
                      </SelectItem>
                    ))}
                  </SelectContent>
                </Select>
                <Button
                  onClick={() => setMetricDrawerOpen(true)}
                  type="button"
                  variant="outline"
                >
                  <Plus />
                  New metric
                </Button>
              </div>
              {field.state.meta.errors.map((error) => (
                <p className="text-destructive text-sm" key={error?.message}>
                  {error?.message}
                </p>
              ))}
            </Field>
          )}
        </form.Field>

        <form.Field name="operator">
          {(field) => (
            <Field>
              <FieldLabel htmlFor={`alert-${field.name}`}>
                Fire when the metric
              </FieldLabel>
              <Select
                items={OPERATOR_ITEMS}
                onValueChange={(value) =>
                  field.handleChange(value as AlertRuleInput["operator"])
                }
                value={field.state.value}
              >
                <SelectTrigger id={`alert-${field.name}`}>
                  <SelectValue />
                </SelectTrigger>
                <SelectContent>
                  {OPERATOR_ITEMS.map((item) => (
                    <SelectItem key={item.value} value={item.value}>
                      {item.label}
                    </SelectItem>
                  ))}
                </SelectContent>
              </Select>
            </Field>
          )}
        </form.Field>

        <form.Field name="threshold">
          {(field) => (
            <Field>
              <FieldLabel htmlFor={`alert-${field.name}`}>Threshold</FieldLabel>
              <Input
                id={`alert-${field.name}`}
                name={field.name}
                onBlur={field.handleBlur}
                onChange={(event) =>
                  field.handleChange(Number(event.target.value))
                }
                type="number"
                value={Number.isNaN(field.state.value) ? "" : field.state.value}
              />
              {field.state.meta.errors.map((error) => (
                <p className="text-destructive text-sm" key={error?.message}>
                  {error?.message}
                </p>
              ))}
            </Field>
          )}
        </form.Field>

        <form.Field name="window">
          {(field) => (
            <Field>
              <FieldLabel htmlFor={`alert-${field.name}`}>
                Evaluated over
              </FieldLabel>
              <Select
                items={WINDOW_ITEMS}
                onValueChange={(value) =>
                  field.handleChange(value as AlertRuleInput["window"])
                }
                value={field.state.value}
              >
                <SelectTrigger id={`alert-${field.name}`}>
                  <SelectValue />
                </SelectTrigger>
                <SelectContent>
                  {WINDOW_ITEMS.map((item) => (
                    <SelectItem key={item.value} value={item.value}>
                      {item.label}
                    </SelectItem>
                  ))}
                </SelectContent>
              </Select>
            </Field>
          )}
        </form.Field>

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

      <MetricDrawer
        from={previewRange.from}
        onOpenChange={setMetricDrawerOpen}
        onSaved={(metric) => form.setFieldValue("metricId", metric.id)}
        open={metricDrawerOpen}
        organizationId={organizationId}
        projectId={projectId}
        to={previewRange.to}
      />
    </form>
  );
};
