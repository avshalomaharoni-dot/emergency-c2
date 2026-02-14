"use client";
import LiveMap from "@/app/components/LiveMap";
import { useEffect, useMemo, useRef, useState } from "react";
import { supabase } from "@/lib/supabaseClient";
import { ensureProfile } from "@/lib/ensureProfile";

type Profile = {
  id: string;
  email: string | null;
  role: "COMMANDER" | "RESPONDER";
};

type EventRow = {
  id: string;
  title: string;
  status: "OPEN" | "CLOSED" | string;
  created_at: string;
  closed_at: string | null;
  created_by: string | null;
};

export default function Home() {
  const [status, setStatus] = useState("Loading...");
  const [session, setSession] = useState<any>(null);
  const [tracking, setTracking] = useState(false);
  const watchIdRef = useRef<number | null>(null);
  const [profile, setProfile] = useState<Profile | null>(null);
  const [events, setEvents] = useState<EventRow[]>([]);
  const activeEventId = events.find((e) => e.status === "OPEN")?.id ?? null;
  const [newTitle, setNewTitle] = useState("");
  const isCommander = useMemo(() => profile?.role === "COMMANDER", [profile]);


  // ---- Auth bootstrap
  useEffect(() => {
    setStatus("Checking session...");
    supabase.auth.getSession().then(({ data, error }) => {
      if (error) setStatus(`Session error: ${error.message}`);
      setSession(data.session);
      if (data.session) ensureProfile();
    });

    const { data: listener } = supabase.auth.onAuthStateChange((_event, s) => {
      setSession(s);
      if (s) ensureProfile();
    });

    return () => {
      listener?.subscription?.unsubscribe();
    };
  }, []);

  // ---- Load profile + events when logged-in
  useEffect(() => {
    if (!session?.user?.id) return;

    const run = async () => {
      setStatus("Loading profile...");
      const { data: p, error: pErr } = await supabase
        .from("profiles")
        .select("id, email, role")
        .eq("id", session.user.id)
        .maybeSingle();

      if (pErr) {
        setStatus(`Profile error: ${pErr.message}`);
        return;
      }

      setProfile(p as Profile);

      setStatus("Loading events...");
      const { data: ev, error: evErr } = await supabase
        .from("events")
        .select("*")
        .order("created_at", { ascending: false });

      if (evErr) {
        setStatus(`Events error: ${evErr.message}`);
        return;
      }

      setEvents((ev ?? []) as EventRow[]);
      setStatus("Ready ✅");
    };

    run();
  }, [session?.user?.id]);

  async function reloadEvents() {
    const { data: ev, error } = await supabase
      .from("events")
      .select("*")
      .order("created_at", { ascending: false });

    if (error) {
      alert(`Reload failed: ${error.message}`);
      return;
    }
    setEvents((ev ?? []) as EventRow[]);
  }

  async function createEvent() {
    const title = newTitle.trim();
    if (!title) return alert("Please enter event title");

    const { error } = await supabase.from("events").insert({
      title,
      status: "OPEN",
      created_by: session.user.id,
    });

    if (error) {
      alert(`Create failed: ${error.message}`);
      return;
    }

    setNewTitle("");
    await reloadEvents();
  }

  async function closeEvent(id: string) {
    const { error } = await supabase
      .from("events")
      .update({ status: "CLOSED", closed_at: new Date().toISOString() })
      .eq("id", id);

    if (error) {
      alert(`Close failed: ${error.message}`);
      return;
    }

    await reloadEvents();
  }
async function upsertMyLocation(lat: number, lng: number) {
  if (!session?.user?.id) return;

  // בינתיים – עד שנחבר לאירוע פעיל – נכתוב ל-locations בלי event
  const { error } = await supabase.from("locations").upsert(
    {
      user_id: session.user.id,
      lat,
      lng,
      updated_at: new Date().toISOString(),
    },
    { onConflict: "user_id" }
  );

  if (error) console.error("upsert location error:", error.message);
}

function startTracking() {
  if (!("geolocation" in navigator)) {
    alert("Geolocation not supported on this device/browser.");
    return;
  }

  setTracking(true);

  watchIdRef.current = navigator.geolocation.watchPosition(
    (pos) => {
      upsertMyLocation(pos.coords.latitude, pos.coords.longitude);
    },
    (err) => {
      alert(`Location error: ${err.message}`);
      setTracking(false);
    },
    {
      enableHighAccuracy: true,
      maximumAge: 5000,
      timeout: 20000,
    }
  );
}

function stopTracking() {
  if (watchIdRef.current !== null) {
    navigator.geolocation.clearWatch(watchIdRef.current);
    watchIdRef.current = null;
  }
  setTracking(false);
}

  // ---- UI helpers
  async function loginWithEmailMagicLink(email: string) {
    const e = email.trim();
    if (!e) return;

    const { error } = await supabase.auth.signInWithOtp({
      email: e,
      options: {
        emailRedirectTo: typeof window !== "undefined" ? window.location.origin : undefined,
      },
    });

    if (error) alert(`Login error: ${error.message}`);
    else alert("Check your email for the login link.");
  }

  async function logout() {
    await supabase.auth.signOut();
    setProfile(null);
    setEvents([]);
    setStatus("Logged out");
  }

  // ---- Render
  if (!session) {
    // Simple login screen (magic link)
    return (
      <main className="min-h-screen flex items-center justify-center p-6 bg-zinc-50">
        <div className="w-full max-w-md bg-white rounded-2xl border p-6 shadow-sm">
          <h1 className="text-2xl font-bold">Emergency C2 – POC</h1>
          <p className="mt-2 text-zinc-600">{status}</p>

          <div className="mt-6">
            <label className="text-sm text-zinc-700">Email</label>
            <input
              className="mt-1 w-full rounded-xl border px-3 py-2 bg-white text-black placeholder:text-zinc-500"
              placeholder="name@example.com"
              onKeyDown={(e) => {
                if (e.key === "Enter") loginWithEmailMagicLink((e.target as HTMLInputElement).value);
              }}
            />
            <button
              className="mt-3 w-full rounded-xl bg-blue-600 text-white py-2 font-medium"
              onClick={() => {
                const input = document.querySelector("input") as HTMLInputElement | null;
                loginWithEmailMagicLink(input?.value ?? "");
              }}
            >
              Login with Email
            </button>
          </div>

          <div className="mt-6 text-xs text-zinc-500">
            Note: this sends a magic-link to your email.
          </div>
        </div>
      </main>
    );
  }

  return (
    <main className="min-h-screen p-6 bg-zinc-50">
      <div className="mx-auto max-w-4xl">
        <div className="flex items-start justify-between gap-4">
          <div>
            <h1 className="text-3xl font-bold">Emergency C2 – Dashboard</h1>
            <p className="mt-1 text-zinc-600">{status}</p>
            <p className="mt-2 text-sm">
              Signed in as: <b>{profile?.email ?? session.user.email}</b>{" "}
              {profile?.role ? (
                <span className="ml-2 inline-flex items-center rounded-full border px-2 py-0.5 text-xs">
                  {profile.role}
                </span>
              ) : null}
            </p>
          </div>

          <button
            className="rounded-xl border bg-white px-4 py-2"
            onClick={logout}
          >
            Logout
          </button>
        </div>

        {/* Commander create */}
        {isCommander ? (
          <div className="mt-6 rounded-2xl border bg-white p-5">
            <h2 className="text-lg font-semibold">Create Event</h2>
            <div className="mt-3 flex gap-2">
              <input
                className="flex-1 rounded-xl border px-3 py-2 bg-white text-black placeholder:text-zinc-500"
                placeholder="e.g., Wildfire near XYZ"
                value={newTitle}
                onChange={(e) => setNewTitle(e.target.value)}
              />
              <button
                className="rounded-xl bg-emerald-600 text-white px-4 py-2 font-medium"
                onClick={createEvent}
              >
                Create
              </button>
            </div>
            <p className="mt-2 text-xs text-zinc-500">
              POC rule: only COMMANDER can create/close events.
            </p>
          </div>
        ) : (
          <div className="mt-6 rounded-2xl border bg-white p-5">
            <h2 className="text-lg font-semibold">Events</h2>
            <p className="mt-1 text-sm text-zinc-600">
              You are a responder. You can view events.
            </p>
          </div>
        )}
<div className="mt-6">
  <h2 className="text-lg font-semibold mb-3">Live Map</h2>
  <LiveMap eventId={"poc"} />bat
</div>
<div className="mt-6 rounded-2xl border bg-white p-5">
  <h2 className="text-lg font-semibold">Live Tracking</h2>
  <p className="mt-1 text-sm text-zinc-600">
    Share your position to the event map.
  </p>

  <div className="mt-3 flex gap-2">
    <button
      className="rounded-xl bg-blue-600 text-white px-4 py-2 font-medium"
      onClick={() => alert("Tracking button works ✅ (next step: connect logic)")}
    >
      Start Tracking
    </button>
  </div>
</div>

        {/* Events list */}
        <div className="mt-6 rounded-2xl border bg-white p-5">
          <div className="flex items-center justify-between">
            <h2 className="text-lg font-semibold">Event List</h2>
            <button className="text-sm underline" onClick={reloadEvents}>
              Refresh
            </button>
          </div>

          <div className="mt-4 space-y-3">
            {events.length === 0 ? (
              <div className="text-sm text-zinc-600">No events yet.</div>
            ) : (
              events.map((ev) => (
                <div
                  key={ev.id}
                  className="rounded-xl border p-4 flex items-start justify-between gap-4"
                >
                  <div>
                    <div className="font-semibold">{ev.title}</div>
                    <div className="mt-1 text-xs text-zinc-600">
                      Status: <b>{ev.status}</b> • Created:{" "}
                      {new Date(ev.created_at).toLocaleString()}
                      {ev.closed_at ? (
                        <> • Closed: {new Date(ev.closed_at).toLocaleString()}</>
                      ) : null}
                    </div>
                    <div className="mt-1 text-xs text-zinc-500">
                      id: {ev.id}
                    </div>
                  </div>

                  {isCommander && ev.status === "OPEN" ? (
                    <button
                      className="rounded-xl bg-zinc-900 text-white px-4 py-2 text-sm"
                      onClick={() => closeEvent(ev.id)}
                    >
                      Close
                    </button>
                  ) : null}
                </div>
              ))
            )}
          </div>
        </div>
      </div>
    </main>
  );
}

