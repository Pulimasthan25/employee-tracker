import { createClient } from "npm:@supabase/supabase-js@2";
import { SignJWT, importPKCS8 } from "npm:jose@5";

type FirebaseLookupUser = {
  localId: string;
  customAttributes?: string;
};

type FirebaseLookupResponse = {
  users?: FirebaseLookupUser[];
};

const corsHeaders = {
  "Access-Control-Allow-Origin": "*",
  "Access-Control-Allow-Headers": "authorization, apikey, content-type",
  "Access-Control-Allow-Methods": "POST, OPTIONS",
};

/** Caches successful Firestore role reads to avoid hammering quota (429) on every screenshot batch. */
const firestoreAdminCache = new Map<string, { at: number; isAdmin: boolean }>();
const FIRESTORE_ADMIN_CACHE_MS = 10 * 60 * 1000;

function getCachedFirestoreAdmin(uid: string): boolean | null {
  const row = firestoreAdminCache.get(uid);
  if (!row) return null;
  if (Date.now() - row.at > FIRESTORE_ADMIN_CACHE_MS) {
    firestoreAdminCache.delete(uid);
    return null;
  }
  return row.isAdmin;
}

function setCachedFirestoreAdmin(uid: string, isAdmin: boolean): void {
  firestoreAdminCache.set(uid, { at: Date.now(), isAdmin });
}

function json(status: number, body: unknown): Response {
  return new Response(JSON.stringify(body), {
    status,
    headers: { ...corsHeaders, "Content-Type": "application/json" },
  });
}

function base64UrlToString(segment: string): string {
  let b64 = segment.replace(/-/g, "+").replace(/_/g, "/");
  const pad = b64.length % 4;
  if (pad) b64 += "=".repeat(4 - pad);
  return atob(b64);
}

/** Custom claims (e.g. role) are embedded in the Firebase ID token JWT after setCustomUserClaims. */
function roleFromIdTokenJwt(idToken: string): string | undefined {
  const parts = idToken.split(".");
  if (parts.length !== 3) return undefined;
  try {
    const payload = JSON.parse(base64UrlToString(parts[1])) as { role?: string };
    return typeof payload.role === "string" ? payload.role : undefined;
  } catch {
    return undefined;
  }
}

function roleFromCustomAttributes(raw: string | undefined): string | undefined {
  if (!raw) return undefined;
  try {
    const parsed = JSON.parse(raw) as { role?: string };
    return typeof parsed.role === "string" ? parsed.role : undefined;
  } catch {
    return undefined;
  }
}

async function verifyFirebaseLookup(
  idToken: string,
  firebaseApiKey: string,
): Promise<{ uid: string; user: FirebaseLookupUser } | null> {
  const res = await fetch(
    `https://identitytoolkit.googleapis.com/v1/accounts:lookup?key=${encodeURIComponent(firebaseApiKey)}`,
    {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ idToken }),
    },
  );

  if (!res.ok) return null;
  const data = (await res.json()) as FirebaseLookupResponse;
  const user = data.users?.[0];
  if (!user?.localId) return null;
  return { uid: user.localId, user };
}

type FirestoreValue = { stringValue?: string; integerValue?: string; booleanValue?: boolean };
type FirestoreUserDoc = {
  fields?: Record<string, FirestoreValue | undefined>;
};

function readFirestoreStringField(doc: FirestoreUserDoc, key: string): string | undefined {
  const v = doc.fields?.[key] as FirestoreValue | undefined;
  if (v?.stringValue !== undefined) return v.stringValue;
  if (v?.integerValue !== undefined) return String(v.integerValue);
  return undefined;
}

function isAdminRoleValue(raw: string | undefined): boolean {
  if (!raw) return false;
  return raw.trim().toLowerCase() === "admin";
}

type AccessTokenResult = { accessToken: string | null; oauthStatus: number; oauthSnippet?: string };

/** OAuth2 access token for Firestore (service account). */
async function getGoogleAccessTokenFromServiceAccount(sa: {
  client_email: string;
  private_key: string;
}, scope: string): Promise<AccessTokenResult> {
  const pem = sa.private_key.includes("\\n")
    ? sa.private_key.replace(/\\n/g, "\n")
    : sa.private_key;
  const key = await importPKCS8(pem, "RS256");
  const nowSec = Math.floor(Date.now() / 1000);
  const assertion = await new SignJWT({
    scope,
  })
    .setProtectedHeader({ alg: "RS256", typ: "JWT" })
    .setIssuer(sa.client_email)
    .setSubject(sa.client_email)
    .setAudience("https://oauth2.googleapis.com/token")
    .setIssuedAt(nowSec - 30)
    .setExpirationTime(nowSec + 3300)
    .sign(key);

  const tokenRes = await fetch("https://oauth2.googleapis.com/token", {
    method: "POST",
    headers: { "Content-Type": "application/x-www-form-urlencoded" },
    body: new URLSearchParams({
      grant_type: "urn:ietf:params:oauth:grant-type:jwt-bearer",
      assertion,
    }),
  });
  const rawBody = await tokenRes.text();
  let tokenJson: { access_token?: string; error?: string; error_description?: string } = {};
  try {
    tokenJson = JSON.parse(rawBody) as typeof tokenJson;
  } catch {
    /* ignore */
  }
  const snippet = rawBody.length > 220 ? rawBody.slice(0, 220) + "…" : rawBody;
  return {
    accessToken: tokenJson.access_token ?? null,
    oauthStatus: tokenRes.status,
    oauthError: tokenRes.ok ? undefined : (tokenJson.error ?? "Unknown OAuth error"),
  };
}

type AdminFirestoreDiag = {
  oauthOk: boolean;
  oauthStatus: number;
  oauthError?: string;
  firestoreHttpStatus?: number;
  roleRead?: string | null;
  serviceAccountProjectId?: string;
  fromCache?: boolean;
};

/** Firestore REST + service account. */
async function isAdminFromFirestoreWithServiceAccount(
  projectId: string,
  uid: string,
): Promise<{ isAdmin: boolean; diag: AdminFirestoreDiag }> {
  const emptyDiag: AdminFirestoreDiag = {
    oauthOk: false,
    oauthStatus: 0,
  };

  const raw = Deno.env.get("FIREBASE_SERVICE_ACCOUNT_JSON") ?? "";
  if (!raw.trim()) {
    return { isAdmin: false, diag: emptyDiag };
  }

  let sa: { client_email?: string; private_key?: string; project_id?: string };
  try {
    sa = JSON.parse(raw) as { client_email?: string; private_key?: string; project_id?: string };
  } catch {
    return { isAdmin: false, diag: { ...emptyDiag, oauthSnippet: "FIREBASE_SERVICE_ACCOUNT_JSON is not valid JSON" } };
  }
  if (!sa.client_email || !sa.private_key) {
    return { isAdmin: false, diag: { ...emptyDiag, oauthSnippet: "JSON missing client_email or private_key" } };
  }

  const cached = getCachedFirestoreAdmin(uid);
  if (cached !== null) {
    return {
      isAdmin: cached,
      diag: {
        oauthOk: true,
        oauthStatus: 200,
        firestoreHttpStatus: 200,
        roleRead: cached ? "admin" : "employee",
        serviceAccountProjectId: sa.project_id,
        fromCache: true,
      },
    };
  }

  try {
    const scopes = [
      "https://www.googleapis.com/auth/datastore",
      "https://www.googleapis.com/auth/cloud-platform",
    ];
    let accessToken: string | null = null;
    let lastOauth: AccessTokenResult = { accessToken: null, oauthStatus: 0 };
    for (const scope of scopes) {
      lastOauth = await getGoogleAccessTokenFromServiceAccount(
        { client_email: sa.client_email, private_key: sa.private_key },
        scope,
      );
      if (lastOauth.accessToken) {
        accessToken = lastOauth.accessToken;
        break;
      }
    }
    if (!accessToken) {
      return {
        isAdmin: false,
        diag: {
          oauthOk: false,
          oauthStatus: lastOauth.oauthStatus,
          oauthError: lastOauth.oauthError,
          serviceAccountProjectId: sa.project_id,
        },
      };
    }

    const docUrl =
      `https://firestore.googleapis.com/v1/projects/${encodeURIComponent(projectId)}` +
      `/databases/(default)/documents/users/${encodeURIComponent(uid)}`;

    const headers = { Authorization: `Bearer ${accessToken}` };
    let res = await fetch(docUrl, { headers });
    let bodyText = await res.text();
    if (res.status === 429) {
      await new Promise((r) => setTimeout(r, 1600));
      res = await fetch(docUrl, { headers });
      bodyText = await res.text();
    }

    let doc: FirestoreUserDoc = {};
    try {
      doc = JSON.parse(bodyText) as FirestoreUserDoc;
    } catch {
      /* ignore */
    }

    if (!res.ok) {
      return {
        isAdmin: false,
        diag: {
          oauthOk: true,
          oauthStatus: lastOauth.oauthStatus,
          firestoreHttpStatus: res.status,
          serviceAccountProjectId: sa.project_id,
        },
      };
    }

    const roleStr = readFirestoreStringField(doc, "role");
    const isAdmin = isAdminRoleValue(roleStr);
    setCachedFirestoreAdmin(uid, isAdmin);
    return {
      isAdmin,
      diag: {
        oauthOk: true,
        oauthStatus: lastOauth.oauthStatus,
        firestoreHttpStatus: res.status,
        roleRead: roleStr ?? null,
        serviceAccountProjectId: sa.project_id,
      },
    };
  } catch (e) {
    const msg = e instanceof Error ? e.message : String(e);
    return {
      isAdmin: false,
      diag: { oauthOk: false, oauthStatus: 0, oauthError: msg.slice(0, 200) },
    };
  }
}

async function resolveIsAdmin(
  projectId: string,
  uid: string,
  idToken: string,
  lookupUser: FirebaseLookupUser | undefined,
): Promise<{ admin: boolean; firestoreDiag?: AdminFirestoreDiag }> {
  const fromJwt = roleFromIdTokenJwt(idToken);
  if (isAdminRoleValue(fromJwt)) return { admin: true };

  const fromLookup = roleFromCustomAttributes(lookupUser?.customAttributes);
  if (isAdminRoleValue(fromLookup)) return { admin: true };

  const { isAdmin, diag } = await isAdminFromFirestoreWithServiceAccount(projectId, uid);
  if (isAdmin) return { admin: true };

  return { admin: false, firestoreDiag: diag };
}

Deno.serve(async (req) => {
  if (req.method === "OPTIONS") {
    return new Response("ok", { headers: corsHeaders });
  }

  if (req.method !== "POST") {
    return json(405, { error: "Method not allowed" });
  }

  const authHeader = req.headers.get("Authorization") ?? "";
  const idToken = authHeader.startsWith("Bearer ") ? authHeader.slice(7).trim() : "";
  if (!idToken) return json(401, { error: "Missing Firebase token" });

  const firebaseApiKey = Deno.env.get("FIREBASE_WEB_API_KEY") ?? "";
  const firebaseProjectId = Deno.env.get("FIREBASE_PROJECT_ID") ?? "";
  const bucket =
    Deno.env.get("SCREENSHOT_BUCKET") ??
    Deno.env.get("SUPABASE_SCREENSHOT_BUCKET") ??
    "screenshots";
  if (!firebaseApiKey || !firebaseProjectId) {
    return json(500, { error: "Missing function env configuration" });
  }

  const verified = await verifyFirebaseLookup(idToken, firebaseApiKey);
  if (!verified) return json(401, { error: "Invalid Firebase token" });
  const { uid, user: lookupUser } = verified;

  let payload: { paths?: string[] };
  try {
    payload = await req.json();
  } catch {
    return json(400, { error: "Invalid JSON body" });
  }

  const requested = Array.isArray(payload.paths) ? payload.paths : [];
  if (requested.length === 0) return json(200, { urls: {}, expiresIn: 120 });
  if (requested.length > 500) return json(400, { error: "Too many paths requested" });

  const { admin, firestoreDiag } = await resolveIsAdmin(firebaseProjectId, uid, idToken, lookupUser);
  const allowedPaths = requested.filter((path) => {
    if (!path || typeof path !== "string") return false;
    const p = path.trim();
    if (!p) return false;
    if (admin) return true;
    return p.startsWith(`${uid}/`);
  });

  if (allowedPaths.length === 0) {
    const saConfigured = Boolean(Deno.env.get("FIREBASE_SERVICE_ACCOUNT_JSON")?.trim());
    const firstPath = requested.find((p) => typeof p === "string" && p.trim());
    const firstSegment = firstPath?.includes("/") ? firstPath!.trim().split("/")[0] : null;
    const saProject = firestoreDiag?.serviceAccountProjectId;
    const projectMismatch =
      saProject && firebaseProjectId && saProject !== firebaseProjectId;
    const fsStatus = firestoreDiag?.firestoreHttpStatus;
    const quota429 = fsStatus === 429;
    return json(403, {
      error: "No permitted screenshot paths",
      hint:
        (quota429
          ? "Firestore returned 429 Quota exceeded (free tier daily limit or burst limit). Check Firebase Console → Firestore → Usage; wait for reset or enable billing. To avoid this read on every request, run: node scripts/set-admin-claims.js <yourUid> admin then sign out/in. "
          : "") +
        "FIREBASE_PROJECT_ID must be your Firebase project id (e.g. employee-tracker-42c98). " +
        "If firestoreHttpStatus is 404, users/{uid} is missing. If roleRead is not admin, update Firestore.",
      debug: {
        firebaseUid: uid,
        firebaseProjectIdUsed: firebaseProjectId,
        detectedAdmin: admin,
        serviceAccountJsonConfigured: saConfigured,
        serviceAccountJsonProjectId: saProject ?? null,
        serviceAccountProjectIdMismatch: projectMismatch ?? false,
        requestedPathCount: requested.length,
        firstPathPrefix: firstSegment,
        tokenRoleClaim: roleFromIdTokenJwt(idToken) ?? null,
        firestore: firestoreDiag ?? null,
      },
    });
  }

  const supabaseUrl = Deno.env.get("SUPABASE_URL") ?? "";
  const serviceRole = Deno.env.get("SUPABASE_SERVICE_ROLE_KEY") ?? "";
  const supabase = createClient(supabaseUrl, serviceRole, {
    auth: { persistSession: false },
  });

  const expiresIn = 120;
  const urls: Record<string, string> = {};

  await Promise.all(
    allowedPaths.map(async (path) => {
      const { data, error } = await supabase.storage.from(bucket).createSignedUrl(path, expiresIn);
      if (!error && data?.signedUrl) {
        urls[path] = data.signedUrl;
      }
    }),
  );

  return json(200, { urls, expiresIn });
});
