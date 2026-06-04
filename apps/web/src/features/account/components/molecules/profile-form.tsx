import { Button } from "@sbox-analytics/ui/components/button";
import {
  Field,
  FieldDescription,
  FieldGroup,
  FieldLabel,
} from "@sbox-analytics/ui/components/field";
import { Input } from "@sbox-analytics/ui/components/input";
import { useForm } from "@tanstack/react-form";
import { useMutation } from "@tanstack/react-query";
import { toast } from "sonner";
import z from "zod";

import { ImageUploadControl } from "@/components/image-upload-control";
import { UserAvatar } from "@/components/user-avatar";
import { authClient } from "@/lib/auth-client";
import { downscaleImage } from "@/lib/image";
import { client } from "@/utils/orpc";

const profileSchema = z.object({
  name: z.string().min(2, "Name must be at least 2 characters"),
});

interface ProfileFormProps {
  user: { name: string; email: string; image?: string | null };
}

export const ProfileForm = ({ user }: ProfileFormProps) => {
  const uploadAvatar = useMutation({
    mutationFn: async (file: File) => {
      const resized = await downscaleImage(file);
      const { url } = await client.images.uploadAvatar({ file: resized });
      const { error } = await authClient.updateUser({ image: url });
      if (error) {
        throw new Error(error.message ?? "Failed to update avatar");
      }
    },
    onError: (error) => toast.error(error.message),
    onSuccess: () => toast.success("Avatar updated"),
  });

  const removeAvatar = useMutation({
    mutationFn: async () => {
      const { error } = await authClient.updateUser({ image: null });
      if (error) {
        throw new Error(error.message ?? "Failed to remove avatar");
      }
    },
    onError: (error) => toast.error(error.message),
    onSuccess: () => toast.success("Avatar removed"),
  });

  const form = useForm({
    defaultValues: { name: user.name },
    onSubmit: async ({ value }) => {
      const { error } = await authClient.updateUser({ name: value.name });
      if (error) {
        toast.error(error.message ?? "Failed to update profile");
        return;
      }
      toast.success("Profile updated");
    },
    validators: {
      onSubmit: profileSchema,
    },
  });

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
        <div className="flex items-center gap-3">
          <UserAvatar
            image={user.image}
            name={user.name}
            seed={user.email}
            size="lg"
          />
          <div className="flex flex-col gap-1.5">
            <ImageUploadControl
              hasImage={Boolean(user.image)}
              onRemove={() => removeAvatar.mutate()}
              onUpload={(file) => uploadAvatar.mutate(file)}
              pending={uploadAvatar.isPending || removeAvatar.isPending}
            />
            <p className="text-muted-foreground text-xs">
              PNG, JPEG, or WebP. Without an upload, an avatar is generated from
              your email address.
            </p>
          </div>
        </div>

        <form.Field name="name">
          {(field) => (
            <Field>
              <FieldLabel htmlFor={field.name}>Name</FieldLabel>
              <Input
                autoComplete="name"
                id={field.name}
                name={field.name}
                onBlur={field.handleBlur}
                onChange={(e) => field.handleChange(e.target.value)}
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

        <Field>
          <FieldLabel htmlFor="profile-email">Email</FieldLabel>
          <Input disabled id="profile-email" readOnly value={user.email} />
          <FieldDescription>Email addresses can't be changed.</FieldDescription>
        </Field>

        <form.Subscribe
          selector={(state) => ({
            canSubmit: state.canSubmit,
            isSubmitting: state.isSubmitting,
          })}
        >
          {({ canSubmit, isSubmitting }) => (
            <div className="flex justify-end">
              <Button disabled={!canSubmit || isSubmitting} type="submit">
                {isSubmitting ? "Saving…" : "Save changes"}
              </Button>
            </div>
          )}
        </form.Subscribe>
      </FieldGroup>
    </form>
  );
};
