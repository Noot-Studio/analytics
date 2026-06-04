import { Button } from "@sbox-analytics/ui/components/button";
import { Checkbox } from "@sbox-analytics/ui/components/checkbox";
import {
  Field,
  FieldGroup,
  FieldLabel,
} from "@sbox-analytics/ui/components/field";
import { Input } from "@sbox-analytics/ui/components/input";
import { Label } from "@sbox-analytics/ui/components/label";
import { useForm } from "@tanstack/react-form";
import { useState } from "react";
import { toast } from "sonner";
import z from "zod";

import { authClient } from "@/lib/auth-client";

const MIN_PASSWORD_LENGTH = 8;

const passwordSchema = z
  .object({
    confirmPassword: z.string(),
    currentPassword: z.string().min(1, "Current password is required"),
    newPassword: z
      .string()
      .min(
        MIN_PASSWORD_LENGTH,
        `Password must be at least ${MIN_PASSWORD_LENGTH} characters`
      ),
  })
  .refine((values) => values.newPassword === values.confirmPassword, {
    message: "Passwords don't match",
    path: ["confirmPassword"],
  });

export const ChangePasswordForm = () => {
  const [revokeOtherSessions, setRevokeOtherSessions] = useState(true);

  const form = useForm({
    defaultValues: {
      confirmPassword: "",
      currentPassword: "",
      newPassword: "",
    },
    onSubmit: async ({ value }) => {
      const { error } = await authClient.changePassword({
        currentPassword: value.currentPassword,
        newPassword: value.newPassword,
        revokeOtherSessions,
      });
      if (error) {
        toast.error(error.message ?? "Failed to change password");
        return;
      }
      toast.success("Password changed");
      form.reset();
    },
    validators: {
      onSubmit: passwordSchema,
    },
  });

  const passwordFields = [
    {
      autoComplete: "current-password",
      label: "Current password",
      name: "currentPassword",
    },
    {
      autoComplete: "new-password",
      label: "New password",
      name: "newPassword",
    },
    {
      autoComplete: "new-password",
      label: "Confirm new password",
      name: "confirmPassword",
    },
  ] as const;

  return (
    <form
      className="max-w-lg"
      onSubmit={(e) => {
        e.preventDefault();
        e.stopPropagation();
        form.handleSubmit();
      }}
    >
      <FieldGroup>
        {passwordFields.map(({ autoComplete, label, name }) => (
          <form.Field key={name} name={name}>
            {(field) => (
              <Field>
                <FieldLabel htmlFor={field.name}>{label}</FieldLabel>
                <Input
                  autoComplete={autoComplete}
                  id={field.name}
                  name={field.name}
                  onBlur={field.handleBlur}
                  onChange={(e) => field.handleChange(e.target.value)}
                  type="password"
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
        ))}

        <div className="flex items-center gap-2">
          <Checkbox
            checked={revokeOtherSessions}
            id="revoke-other-sessions"
            onCheckedChange={(checked) => setRevokeOtherSessions(checked)}
          />
          <Label htmlFor="revoke-other-sessions">
            Sign out all other sessions
          </Label>
        </div>

        <form.Subscribe
          selector={(state) => ({
            canSubmit: state.canSubmit,
            isSubmitting: state.isSubmitting,
          })}
        >
          {({ canSubmit, isSubmitting }) => (
            <div className="flex justify-end">
              <Button disabled={!canSubmit || isSubmitting} type="submit">
                {isSubmitting ? "Changing…" : "Change password"}
              </Button>
            </div>
          )}
        </form.Subscribe>
      </FieldGroup>
    </form>
  );
};
