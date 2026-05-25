import { supabaseServer } from "@/lib/supabase-server";

export const dynamic = "force-dynamic";

const statusLabels = {
  green: "Active",
  yellow: "Quiet",
  red: "No signal",
} as const;

function formatAge(createdAt: string | null) {
  if (!createdAt) return "no signal";
  const ms = Date.now() - new Date(createdAt).getTime();
  if (ms < 60_000) return "just now";
  if (ms < 3_600_000) return `${Math.round(ms / 60_000)} min ago`;
  return `${Math.round(ms / 3_600_000)} h ago`;
}

function statusClasses(status: keyof typeof statusLabels) {
  switch (status) {
    case "green":
      return "bg-emerald-100 text-emerald-800 border-emerald-200";
    case "yellow":
      return "bg-amber-100 text-amber-800 border-amber-200";
    case "red":
    default:
      return "bg-rose-100 text-rose-800 border-rose-200";
  }
}

type PersonRow = {
  id: string;
  name: string;
  quiet_window_minutes: number;
  alert_window_minutes: number;
  last_seen_at: string | null;
  source_slug: string | null;
  status: "green" | "yellow" | "red";
};

async function getBoardData() {
  const db = supabaseServer();

  const { data: people, error: peopleError } = await db
    .from("people")
    .select("id, name, quiet_window_minutes, alert_window_minutes")
    .order("name", { ascending: true });
  if (peopleError || !people) {
    throw new Error(peopleError?.message ?? "Failed to load people");
  }

  const { data: enabledSources, error: sourcesError } = await db
    .from("person_sources")
    .select("person_id, source_slug")
    .eq("enabled", true);
  if (sourcesError || !enabledSources) {
    throw new Error(sourcesError?.message ?? "Failed to load enabled sources");
  }

  const enabledByPerson = new Map<string, Set<string>>();
  enabledSources.forEach((source) => {
    const set = enabledByPerson.get(source.person_id) ?? new Set<string>();
    set.add(source.source_slug);
    enabledByPerson.set(source.person_id, set);
  });

  const personIds = people.map((person) => person.id);
  const { data: pings, error: pingsError } = await db
    .from("pings")
    .select("person_id, source_slug, created_at")
    .in("person_id", personIds);
  if (pingsError || !pings) {
    throw new Error(pingsError?.message ?? "Failed to load pings");
  }

  const latestByPerson = new Map<string, { created_at: string; source_slug: string }>();
  pings.forEach((ping) => {
    const enabledSources = enabledByPerson.get(ping.person_id);
    if (!enabledSources?.has(ping.source_slug)) return;
    const current = latestByPerson.get(ping.person_id);
    if (!current || new Date(ping.created_at) > new Date(current.created_at)) {
      latestByPerson.set(ping.person_id, {
        created_at: ping.created_at,
        source_slug: ping.source_slug,
      });
    }
  });

  return people.map((person) => {
    const latest = latestByPerson.get(person.id) ?? null;
    const status = latest
      ? getStatus(person.quiet_window_minutes, person.alert_window_minutes, latest.created_at)
      : "red";

    return {
      id: person.id,
      name: person.name,
      quiet_window_minutes: person.quiet_window_minutes,
      alert_window_minutes: person.alert_window_minutes,
      last_seen_at: latest?.created_at ?? null,
      source_slug: latest?.source_slug ?? null,
      status,
    };
  });
}

function getStatus(
  quietWindow: number,
  alertWindow: number,
  lastSeenAt: string
): "green" | "yellow" | "red" {
  const ageMinutes = (Date.now() - new Date(lastSeenAt).getTime()) / 60_000;
  if (ageMinutes <= quietWindow) return "green";
  if (ageMinutes <= alertWindow) return "yellow";
  return "red";
}

export default async function Home() {
  const rows: PersonRow[] = await getBoardData();

  return (
    <div className="min-h-screen bg-slate-50 text-slate-950">
      <main className="mx-auto max-w-4xl px-6 py-12">
        <div className="mb-8">
          <p className="text-sm uppercase tracking-[0.3em] text-slate-500">Pulse</p>
          <h1 className="mt-3 text-4xl font-semibold tracking-tight">Family liveness board</h1>
          <p className="mt-2 max-w-2xl text-sm leading-6 text-slate-600">
            One row per person, calculated from enabled sources and the most recent sign of life.
          </p>
        </div>

        <div className="space-y-4">
          {rows.map((person) => (
            <article
              key={person.id}
              className="rounded-2xl border border-slate-200 bg-white p-6 shadow-sm"
            >
              <div className="flex flex-col gap-4 sm:flex-row sm:items-center sm:justify-between">
                <div>
                  <h2 className="text-xl font-semibold text-slate-900">{person.name}</h2>
                  <p className="mt-1 text-sm text-slate-600">
                    Last seen {formatAge(person.last_seen_at)}
                    {person.source_slug ? ` · ${person.source_slug}` : ""}
                  </p>
                </div>
                <span
                  className={`inline-flex rounded-full border px-3 py-1 text-sm font-semibold ${statusClasses(
                    person.status
                  )}`}
                >
                  {statusLabels[person.status]}
                </span>
              </div>
            </article>
          ))}
        </div>
      </main>
    </div>
  );
}
