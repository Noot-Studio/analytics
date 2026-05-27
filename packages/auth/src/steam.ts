import { createHmac, randomBytes, timingSafeEqual } from "node:crypto";

import { APIError, createAuthEndpoint } from "better-auth/api";
import { setSessionCookie } from "better-auth/cookies";
import { z } from "zod";

const STEAM_OPENID_URL = "https://steamcommunity.com/openid/login";
const STEAM_OPENID_NS = "http://specs.openid.net/auth/2.0";
const STEAM_OPENID_IDENTIFIER_SELECT =
  "http://specs.openid.net/auth/2.0/identifier_select";
const STEAM_CLAIMED_ID_PATTERN =
  /^https:\/\/steamcommunity\.com\/openid\/id\/(\d{17})$/u;
const STATE_COOKIE_NAME = "steam_oauth_state";
const STATE_COOKIE_MAX_AGE_SECONDS = 600;
const NONCE_BYTES = 32;

interface SteamPlayerSummary {
  steamid: string;
  personaname?: string;
  avatarfull?: string;
}

interface SteamProfile {
  steamId: string;
  name: string;
  image: string | null;
}

interface StatePayload {
  nonce: string;
  callbackURL: string;
}

export interface SteamPluginOptions {
  /** Steam Web API key (https://steamcommunity.com/dev/apikey). */
  apiKey: string;
  /**
   * Synthetic email domain. Steam OpenID never returns an email, so we mint
   * one from the SteamID. Defaults to `steam.local`.
   */
  emailDomain?: string;
}

const signState = (payload: StatePayload, secret: string): string => {
  const body = Buffer.from(JSON.stringify(payload)).toString("base64url");
  const sig = createHmac("sha256", secret).update(body).digest("base64url");
  return `${body}.${sig}`;
};

const verifyState = (
  cookie: string | undefined,
  secret: string
): StatePayload | null => {
  if (!cookie) {
    return null;
  }
  const dot = cookie.indexOf(".");
  if (dot === -1) {
    return null;
  }
  const body = cookie.slice(0, dot);
  const sig = cookie.slice(dot + 1);
  const expected = createHmac("sha256", secret)
    .update(body)
    .digest("base64url");
  const sigBuf = Buffer.from(sig);
  const expBuf = Buffer.from(expected);
  if (sigBuf.length !== expBuf.length || !timingSafeEqual(sigBuf, expBuf)) {
    return null;
  }
  try {
    return JSON.parse(Buffer.from(body, "base64url").toString("utf-8"));
  } catch {
    return null;
  }
};

const isTrustedCallback = (
  callbackURL: string,
  trustedOrigins: string[]
): boolean => {
  let parsed: URL;
  try {
    parsed = new URL(callbackURL);
  } catch {
    return false;
  }
  return trustedOrigins.some((origin) => {
    try {
      return new URL(origin).origin === parsed.origin;
    } catch {
      return false;
    }
  });
};

const buildSteamRedirect = (returnTo: string, realm: string): string => {
  const params = new URLSearchParams({
    "openid.claimed_id": STEAM_OPENID_IDENTIFIER_SELECT,
    "openid.identity": STEAM_OPENID_IDENTIFIER_SELECT,
    "openid.mode": "checkid_setup",
    "openid.ns": STEAM_OPENID_NS,
    "openid.realm": realm,
    "openid.return_to": returnTo,
  });
  return `${STEAM_OPENID_URL}?${params.toString()}`;
};

const verifyOpenIdAssertion = async (
  query: Record<string, string>
): Promise<boolean> => {
  const body = new URLSearchParams();
  for (const [key, value] of Object.entries(query)) {
    if (key.startsWith("openid.")) {
      body.set(key, value);
    }
  }
  body.set("openid.mode", "check_authentication");

  const response = await fetch(STEAM_OPENID_URL, {
    body,
    headers: { "content-type": "application/x-www-form-urlencoded" },
    method: "POST",
  });
  if (!response.ok) {
    return false;
  }
  const text = await response.text();
  return /is_valid\s*:\s*true/iu.test(text);
};

const fetchSteamProfile = async (
  steamId: string,
  apiKey: string
): Promise<Omit<SteamProfile, "steamId">> => {
  try {
    const url = new URL(
      "https://api.steampowered.com/ISteamUser/GetPlayerSummaries/v2/"
    );
    url.searchParams.set("key", apiKey);
    url.searchParams.set("steamids", steamId);
    const response = await fetch(url, { method: "GET" });
    if (!response.ok) {
      return { image: null, name: steamId };
    }
    const data = (await response.json()) as {
      response?: { players?: SteamPlayerSummary[] };
    };
    const player = data.response?.players?.[0];
    return {
      image: player?.avatarfull ?? null,
      name: player?.personaname ?? steamId,
    };
  } catch {
    return { image: null, name: steamId };
  }
};

export const steam = (options: SteamPluginOptions) => {
  const emailDomain = options.emailDomain ?? "steam.local";

  return {
    endpoints: {
      signInWithSteam: createAuthEndpoint(
        "/sign-in/steam",
        {
          method: "GET",
          query: z.object({
            callbackURL: z.url(),
          }),
        },
        async (ctx) => {
          const { callbackURL } = ctx.query;
          const trustedOrigins = ctx.context.trustedOrigins ?? [];
          if (!isTrustedCallback(callbackURL, trustedOrigins)) {
            throw new APIError("BAD_REQUEST", {
              message: "callbackURL is not in trustedOrigins",
            });
          }

          const nonce = randomBytes(NONCE_BYTES).toString("base64url");
          const state = signState({ callbackURL, nonce }, ctx.context.secret);

          await ctx.setSignedCookie(
            STATE_COOKIE_NAME,
            state,
            ctx.context.secret,
            {
              httpOnly: true,
              maxAge: STATE_COOKIE_MAX_AGE_SECONDS,
              path: "/",
              sameSite: "lax",
              secure: true,
            }
          );

          const returnTo = `${ctx.context.baseURL}/callback/steam`;
          const realm = new URL(ctx.context.baseURL).origin;
          throw ctx.redirect(buildSteamRedirect(returnTo, realm));
        }
      ),

      steamCallback: createAuthEndpoint(
        "/callback/steam",
        {
          method: "GET",
          query: z.record(z.string(), z.string()),
        },
        async (ctx) => {
          const stateCookie = await ctx.getSignedCookie(
            STATE_COOKIE_NAME,
            ctx.context.secret
          );
          const state = verifyState(
            stateCookie || undefined,
            ctx.context.secret
          );
          ctx.setCookie(STATE_COOKIE_NAME, "", {
            httpOnly: true,
            maxAge: 0,
            path: "/",
            sameSite: "lax",
            secure: true,
          });
          if (!state) {
            throw new APIError("BAD_REQUEST", {
              message: "Missing or invalid Steam state cookie",
            });
          }

          const isValid = await verifyOpenIdAssertion(ctx.query);
          if (!isValid) {
            throw new APIError("UNAUTHORIZED", {
              message: "Steam OpenID assertion failed verification",
            });
          }

          const claimedId = ctx.query["openid.claimed_id"];
          const match = claimedId?.match(STEAM_CLAIMED_ID_PATTERN);
          const steamId = match?.[1];
          if (!steamId) {
            throw new APIError("BAD_REQUEST", {
              message: "Could not extract SteamID from OpenID response",
            });
          }

          const profile = await fetchSteamProfile(steamId, options.apiKey);

          const existingAccount =
            await ctx.context.internalAdapter.findAccountByProviderId(
              steamId,
              "steam"
            );

          let user = existingAccount
            ? await ctx.context.internalAdapter.findUserById(
                existingAccount.userId
              )
            : null;

          if (!user) {
            user = await ctx.context.internalAdapter.createUser({
              email: `${steamId}@${emailDomain}`,
              emailVerified: false,
              image: profile.image ?? undefined,
              name: profile.name,
            });
            await ctx.context.internalAdapter.createAccount({
              accountId: steamId,
              createdAt: new Date(),
              providerId: "steam",
              updatedAt: new Date(),
              userId: user.id,
            });
          }

          const session = await ctx.context.internalAdapter.createSession(
            user.id,
            false
          );
          if (!session) {
            throw new APIError("INTERNAL_SERVER_ERROR", {
              message: "Failed to create session",
            });
          }

          await setSessionCookie(ctx, { session, user });
          throw ctx.redirect(state.callbackURL);
        }
      ),
    },
    id: "steam" as const,
  };
};
