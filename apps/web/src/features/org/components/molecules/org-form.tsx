import { Button } from "@sbox-analytics/ui/components/button";
import {
  Field,
  FieldGroup,
  FieldLabel,
} from "@sbox-analytics/ui/components/field";
import { Input } from "@sbox-analytics/ui/components/input";
import { useForm } from "@tanstack/react-form";
import { useRef } from "react";
import z from "zod";

const orgSchema = z.object({
  name: z.string().min(2, "Name must be at least 2 characters"),
  slug: z
    .string()
    .min(2, "Slug must be at least 2 characters")
    .regex(
      /^[a-z0-9-]+$/u,
      "Slug can only contain lowercase letters, numbers, and hyphens"
    ),
});

const toSlug = (name: string) =>
  name
    .toLowerCase()
    .replaceAll(/\s+/gu, "-")
    .replaceAll(/[^a-z0-9-]/gu, "")
    .replaceAll(/-+/gu, "-")
    .replaceAll(/^-|-$/gu, "");

interface OrgFormProps {
  onSubmit: (values: { name: string; slug: string }) => Promise<void>;
  isLoading: boolean;
  submitLabel?: string;
}

export const OrgForm = ({
  onSubmit,
  isLoading,
  submitLabel = "Create Organization",
}: OrgFormProps) => {
  const slugManuallyEdited = useRef(false);

  const form = useForm({
    defaultValues: { name: "", slug: "" },
    onSubmit: async ({ value }) => {
      await onSubmit(value);
    },
    validators: {
      onSubmit: orgSchema,
    },
  });

  return (
    <form
      onSubmit={(e) => {
        e.preventDefault();
        e.stopPropagation();
        form.handleSubmit();
      }}
    >
      <FieldGroup>
        <form.Field name="name">
          {(field) => (
            <Field>
              <FieldLabel htmlFor={field.name}>Organization name</FieldLabel>
              <Input
                id={field.name}
                name={field.name}
                autoComplete="off"
                value={field.state.value}
                onBlur={field.handleBlur}
                onChange={(e) => {
                  field.handleChange(e.target.value);
                  if (!slugManuallyEdited.current) {
                    form.setFieldValue("slug", toSlug(e.target.value));
                  }
                }}
              />
              {field.state.meta.errors.map((error) => (
                <p key={error?.message} className="text-sm text-destructive">
                  {error?.message}
                </p>
              ))}
            </Field>
          )}
        </form.Field>

        <form.Field name="slug">
          {(field) => (
            <Field>
              <FieldLabel htmlFor={field.name}>Slug</FieldLabel>
              <Input
                id={field.name}
                name={field.name}
                autoComplete="off"
                value={field.state.value}
                onBlur={field.handleBlur}
                onChange={(e) => {
                  slugManuallyEdited.current = true;
                  field.handleChange(e.target.value);
                }}
              />
              {field.state.meta.errors.map((error) => (
                <p key={error?.message} className="text-sm text-destructive">
                  {error?.message}
                </p>
              ))}
            </Field>
          )}
        </form.Field>

        <form.Subscribe
          selector={(state) => ({
            canSubmit: state.canSubmit,
            isSubmitting: state.isSubmitting,
          })}
        >
          {({ canSubmit, isSubmitting }) => (
            <Field>
              <Button
                type="submit"
                disabled={!canSubmit || isSubmitting || isLoading}
              >
                {isSubmitting || isLoading ? "Creating..." : submitLabel}
              </Button>
            </Field>
          )}
        </form.Subscribe>
      </FieldGroup>
    </form>
  );
};
