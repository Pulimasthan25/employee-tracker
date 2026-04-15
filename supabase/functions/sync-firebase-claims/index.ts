import { SignJWT, importPKCS8 } from "npm:jose@5";

const corsHeaders = {
  "Access-Control-Allow-Origin": "*",
  "Access-Control-Allow-Headers": "authorization, apikey, content-type",
  "Access-Control-Allow-Methods": "POST, OPTIONS",
};

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

type FirebaseLookupUser = { localId: string };
type FirebaseLookupResponse = { users?: FirebaseLookupUser[] };

async function verifyFirebaseUid(idToken: string, firebaseApiKey: string): Promise<string | null> {
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
  return data.users?.[0]?.localId ?? null;
}

type FirestoreValue = { stringValue?: string; integerValue?: string };
type FirestoreUserDoc = { fields?: Record<string, FirestoreValue | undefined> };

function readFirestoreStringField(doc: FirestoreUserDoc, key: string): string | undefined {
  const v = doc.fields?.[key] as FirestoreValue | undefined;
  if (v?.stringValue !== undefined) return v.stringValue;
  if (v?.integerValue !== undefined) return String(v.integerValue);
  return undefined;
}

async function getServiceAccountAccessToken(sa: {
  client_email: string;
  private_key: string;
}): Promise<string | null> {
  const pem = sa.private_key.includes("\\n")
    ? sa.private_key.replace(/\\n/g, "\n")
    : sa.private_key;
  const key = await importPKCS8(pem, "RS256");
  const nowSec = Math.floor(Date.now() / 1000);
  const assertion = await new SignJWT({
    scope: "https://www.googleapis.com/auth/cloud-platform",
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
  const raw = await tokenRes.text();
  let parsed: { access_token?: string } = {};
  try {
    parsed = JSON.parse(raw) as { access_token?: string };
  } catch {
    return null;
  }
  return parsed.access_token ?? null;
}

async function fetchFirestoreUserDoc(
  projectId: string,
  uid: string,
  accessToken: string,
): Promise<{ ok: boolean; status: number; doc: FirestoreUserDoc }> {
  const docUrl =
    `https://firestore.googleapis.com/v1/projects/${encodeURIComponent(projectId)}` +
    `/databases/(default)/documents/users/${encodeURIComponent(uid)}`;
  const res = await fetch(docUrl, {
    headers: { Authorization: `Bearer ${accessToken}` },
  });
  const text = await res.text();
  let doc: FirestoreUserDoc = {};
  try {
    doc = JSON.parse(text) as FirestoreUserDoc;
  } catch {
    /* ignore */
  }
  return { ok: res.ok, status: res.status, doc };
}

function normalizeRole(raw: string | undefined): "admin" | "employee" {
  if (raw && raw.trim().toLowerCase() === "admin") return "admin";
  return "employee";
}

/** Identity Toolkit v1 — requires service account OAuth + Web API key. */
async function setCustomClaims(
  projectId: string,
  webApiKey: string,
  accessToken: string,
  localId: string,
  claims: { role: "admin" | "employee" },
): Promise<{ ok: boolean; status: number; body: string }> {
  const url =
    `https://identitytoolkit.googleapis.com/v1/accounts:update?key=${encodeURIComponent(webApiKey)}`;
  const res = await fetch(url, {
    method: "POST",
    headers: {
      Authorization: `Bearer ${accessToken}`,
      "Content-Type": "application/json",
    },
    body: JSON.stringify({
      localId,
      customAttributes: JSON.stringify(claims),
    }),
  });
  const body = await res.text();
  return { ok: res.ok, status: res.status, body };
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
  const rawSa = Deno.env.get("FIREBASE_SERVICE_ACCOUNT_JSON") ?? "";

  if (!firebaseApiKey || !firebaseProjectId || !rawSa.trim()) {
    return json(500, { error: "Missing FIREBASE_WEB_API_KEY, FIREBASE_PROJECT_ID, or FIREBASE_SERVICE_ACCOUNT_JSON" });
  }

  let sa: { client_email?: string; private_key?: string };
  try {
    sa = JSON.parse(rawSa) as { client_email?: string; private_key?: string };
  } catch {
    return json(500, { error: "Invalid FIREBASE_SERVICE_ACCOUNT_JSON" });
  }
  if (!sa.client_email || !sa.private_key) {
    return json(500, { error: "Service account JSON missing client_email or private_key" });
  }

  const callerUid = await verifyFirebaseUid(idToken, firebaseApiKey);
  if (!callerUid) return json(401, { error: "Invalid Firebase token" });

  let body: { targetUid?: string } = {};
  try {
    const t = await req.text();
    if (t.trim()) body = JSON.parse(t) as { targetUid?: string };
  } catch {
    return json(400, { error: "Invalid JSON body" });
  }

  const requestedTarget = typeof body.targetUid === "string" ? body.targetUid.trim() : "";
  const targetUid = requestedTarget || callerUid;

  if (targetUid !== callerUid) {
    const jwtRole = roleFromIdTokenJwt(idToken);
    if (jwtRole?.toLowerCase() !== "admin") {
      return json(403, {
        error: "Only admins can sync another user's claims",
        hint: "Sign in as an admin (with role claim) or sync only yourself by omitting targetUid.",
      });
    }
  }

  const accessToken = await getServiceAccountAccessToken({
    client_email: sa.client_email,
    private_key: sa.private_key,
  });
  if (!accessToken) {
    return json(502, { error: "Could not obtain Google access token from service account" });
  }

  const { ok, status, doc } = await fetchFirestoreUserDoc(firebaseProjectId, targetUid, accessToken);
  if (!ok) {
    return json(status === 404 ? 404 : 502, {
      error: "Could not read Firestore user profile",
      firestoreHttpStatus: status,
    });
  }

  const role = normalizeRole(readFirestoreStringField(doc, "role"));
  const update = await setCustomClaims(firebaseProjectId, firebaseApiKey, accessToken, targetUid, {
    role,
  });

  if (!update.ok) {
    return json(502, {
      error: "Identity Toolkit accounts:update failed",
      httpStatus: update.status,
    });
  }

  return json(200, { ok: true, uid: targetUid, role });
});
