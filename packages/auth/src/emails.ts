import { sendEmail } from "@sbox-analytics/email";
import { env } from "@sbox-analytics/env/server";

export { canSendEmail } from "@sbox-analytics/email";

interface InvitationEmailData {
  id: string;
  email: string;
  organization: { name: string };
  inviter: { user: { name: string; email: string } };
}

const buildInvitationHtml = (
  data: InvitationEmailData,
  acceptUrl: string
): string => `
  <div style="font-family: sans-serif; max-width: 480px; margin: 0 auto;">
    <h2>You've been invited to ${data.organization.name}</h2>
    <p>
      ${data.inviter.user.name} (${data.inviter.user.email}) invited you to
      join <strong>${data.organization.name}</strong> on s&amp;box Analytics.
    </p>
    <p>
      <a href="${acceptUrl}"
         style="display: inline-block; padding: 10px 20px; background: #18181b; color: #fff; border-radius: 6px; text-decoration: none;">
        Accept invitation
      </a>
    </p>
    <p style="color: #71717a; font-size: 13px;">
      Or copy this link into your browser:<br />${acceptUrl}
    </p>
  </div>
`;

export const sendInvitationEmail = async (
  data: InvitationEmailData
): Promise<void> => {
  const acceptUrl = `${env.CORS_ORIGIN}/accept-invitation/${data.id}`;

  const sent = await sendEmail({
    html: buildInvitationHtml(data, acceptUrl),
    subject: `Join ${data.organization.name} on s&box Analytics`,
    to: data.email,
  });

  if (!sent) {
    // Dev fallback: no Resend key configured, surface the link in the console.
    console.warn(
      `[auth] RESEND_API_KEY not set — invitation for ${data.email}: ${acceptUrl}`
    );
  }
};

export const sendVerificationEmail = async (
  email: string,
  url: string
): Promise<void> => {
  // Only wired up when Resend is configured, so a no-op when it isn't.
  await sendEmail({
    html: `
      <div style="font-family: sans-serif; max-width: 480px; margin: 0 auto;">
        <h2>Verify your email</h2>
        <p>Confirm your email address to finish setting up your s&amp;box Analytics account.</p>
        <p>
          <a href="${url}"
             style="display: inline-block; padding: 10px 20px; background: #18181b; color: #fff; border-radius: 6px; text-decoration: none;">
            Verify email
          </a>
        </p>
        <p style="color: #71717a; font-size: 13px;">
          Or copy this link into your browser:<br />${url}
        </p>
      </div>
    `,
    subject: "Verify your email — s&box Analytics",
    to: email,
  });
};
