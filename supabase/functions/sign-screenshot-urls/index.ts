import { createClient } from "npm:@supabase/supabase-js@2";

type FirebaseLookupResponse = {
  users?: Array<{
    localId: string;
  }>;
};

type FirestoreUserDoc = {
  fields?: {
    role?: {
      stringValue?: string;
    };
  };
};

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

async function verifyFirebaseToken(idToken: string, firebaseApiKey: string): Promise<string | null> {
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

async function isAdminUser(projectId: string, uid: string, idToken: string): Promise<boolean> {
  const docUrl =
    `https://firestore.googleapis.com/v1/projects/${encodeURIComponent(projectId)}` +
    `/databases/(default)/documents/users/${encodeURIComponent(uid)}`;

  const res = await fetch(docUrl, {
    headers: {
      Authorization: `Bearer ${idToken}`,
    },
  });
  if (!res.ok) return false;
  const doc = (await res.json()) as FirestoreUserDoc;
  return doc.fields?.role?.stringValue === "admin";
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

  const uid = await verifyFirebaseToken(idToken, firebaseApiKey);
  if (!uid) return json(401, { error: "Invalid Firebase token" });

  let payload: { paths?: string[] };
  try {
    payload = await req.json();
  } catch {
    return json(400, { error: "Invalid JSON body" });
  }

  const requested = Array.isArray(payload.paths) ? payload.paths : [];
  if (requested.length === 0) return json(200, { urls: {}, expiresIn: 120 });
  if (requested.length > 500) return json(400, { error: "Too many paths requested" });

  const admin = await isAdminUser(firebaseProjectId, uid, idToken);
  const allowedPaths = requested.filter((path) => {
    if (!path || typeof path !== "string") return false;
    const p = path.trim();
    if (!p) return false;
    if (admin) return true;
    return p.startsWith(`${uid}/`);
  });

  if (allowedPaths.length === 0) {
    return json(403, { error: "No permitted screenshot paths" });
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
