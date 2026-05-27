import { env } from "@sbox-analytics/env/web";
import { Button } from "@sbox-analytics/ui/components/button";
import {
  Field,
  FieldDescription,
  FieldGroup,
  FieldLabel,
  FieldSeparator,
} from "@sbox-analytics/ui/components/field";
import { Input } from "@sbox-analytics/ui/components/input";
import { cn } from "@sbox-analytics/ui/lib/utils";
import { useForm } from "@tanstack/react-form";
import { useNavigate } from "@tanstack/react-router";
import { BarChart3 } from "lucide-react";
import { useState } from "react";
import { toast } from "sonner";
import z from "zod";

import { authClient } from "@/lib/auth-client";

import { SteamIcon } from "../atoms/steam-icon";

type Mode = "signin" | "signup";

const baseSchema = z.object({
  email: z.email("Invalid email address"),
  name: z.string(),
  password: z.string().min(8, "Password must be at least 8 characters"),
});

const signInSchema = baseSchema;
const signUpSchema = baseSchema.extend({
  name: z.string().min(2, "Name must be at least 2 characters"),
});

const startSteamSignIn = () => {
  const callbackURL = `${window.location.origin}/dashboard`;
  const url = new URL(`${env.VITE_SERVER_URL}/api/auth/sign-in/steam`);
  url.searchParams.set("callbackURL", callbackURL);
  window.location.href = url.toString();
};

const getSubmitLabel = (isSubmitting: boolean, isSignUp: boolean) => {
  if (isSubmitting) {
    return "Submitting...";
  }
  return isSignUp ? "Create account" : "Sign in";
};

export const LoginForm = ({
  className,
  ...props
}: React.ComponentProps<"div">) => {
  const navigate = useNavigate({ from: "/login" });
  const [mode, setMode] = useState<Mode>("signin");
  const isSignUp = mode === "signup";

  const form = useForm({
    defaultValues: {
      email: "",
      name: "",
      password: "",
    },
    onSubmit: async ({ value }) => {
      const callbacks = {
        onError: (error: {
          error: { message?: string; statusText: string };
        }) => {
          toast.error(error.error.message || error.error.statusText);
        },
        onSuccess: () => {
          navigate({ to: "/dashboard" });
          toast.success(isSignUp ? "Account created" : "Welcome back");
        },
      };

      if (isSignUp) {
        await authClient.signUp.email(
          { email: value.email, name: value.name, password: value.password },
          callbacks
        );
        return;
      }

      await authClient.signIn.email(
        { email: value.email, password: value.password },
        callbacks
      );
    },
    validators: {
      onSubmit: isSignUp ? signUpSchema : signInSchema,
    },
  });

  return (
    <div className={cn("flex flex-col gap-6", className)} {...props}>
      <form
        onSubmit={(e) => {
          e.preventDefault();
          e.stopPropagation();
          form.handleSubmit();
        }}
      >
        <FieldGroup>
          <div className="flex flex-col items-center gap-2 text-center">
            <div className="flex size-8 items-center justify-center rounded-md">
              <BarChart3 className="size-6" aria-hidden="true" />
            </div>
            <h1 className="text-xl font-bold">
              {isSignUp ? "Create your account" : "Welcome to sbox analytics"}
            </h1>
            <FieldDescription>
              {isSignUp ? "Already have an account?" : "Don't have an account?"}{" "}
              <button
                type="button"
                className="underline underline-offset-4 hover:text-primary"
                onClick={() => setMode(isSignUp ? "signin" : "signup")}
              >
                {isSignUp ? "Sign in" : "Sign up"}
              </button>
            </FieldDescription>
          </div>

          {isSignUp ? (
            <form.Field name="name">
              {(field) => (
                <Field>
                  <FieldLabel htmlFor={field.name}>Name</FieldLabel>
                  <Input
                    id={field.name}
                    name={field.name}
                    autoComplete="name"
                    value={field.state.value}
                    onBlur={field.handleBlur}
                    onChange={(e) => field.handleChange(e.target.value)}
                  />
                  {field.state.meta.errors.map((error) => (
                    <p
                      key={error?.message}
                      className="text-sm text-destructive"
                    >
                      {error?.message}
                    </p>
                  ))}
                </Field>
              )}
            </form.Field>
          ) : null}

          <form.Field name="email">
            {(field) => (
              <Field>
                <FieldLabel htmlFor={field.name}>Email</FieldLabel>
                <Input
                  id={field.name}
                  name={field.name}
                  type="email"
                  autoComplete="email"
                  placeholder="m@example.com"
                  value={field.state.value}
                  onBlur={field.handleBlur}
                  onChange={(e) => field.handleChange(e.target.value)}
                />
                {field.state.meta.errors.map((error) => (
                  <p key={error?.message} className="text-sm text-destructive">
                    {error?.message}
                  </p>
                ))}
              </Field>
            )}
          </form.Field>

          <form.Field name="password">
            {(field) => (
              <Field>
                <FieldLabel htmlFor={field.name}>Password</FieldLabel>
                <Input
                  id={field.name}
                  name={field.name}
                  type="password"
                  autoComplete={isSignUp ? "new-password" : "current-password"}
                  value={field.state.value}
                  onBlur={field.handleBlur}
                  onChange={(e) => field.handleChange(e.target.value)}
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
                <Button type="submit" disabled={!canSubmit || isSubmitting}>
                  {getSubmitLabel(isSubmitting, isSignUp)}
                </Button>
              </Field>
            )}
          </form.Subscribe>

          <FieldSeparator>Or</FieldSeparator>

          <Field>
            <Button type="button" variant="outline" onClick={startSteamSignIn}>
              <SteamIcon className="size-4" />
              Continue with Steam
            </Button>
          </Field>
        </FieldGroup>
      </form>

      <FieldDescription className="px-6 text-center">
        By continuing, you agree to our <a href="/terms">
          Terms of Service
        </a>{" "}
        and <a href="/privacy">Privacy Policy</a>.
      </FieldDescription>
    </div>
  );
};
