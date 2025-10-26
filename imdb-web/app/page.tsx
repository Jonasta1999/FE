"use client";

import { useMemo, useState, useEffect } from "react";
import { Range } from "react-range";

type Movie = {
  tconst: string;
  primary_title: string;
  start_year: number | null;
  runtime_minutes: number | null;
  genres: string | null;
  average_rating: number | null;
  num_votes: number | null;
  providers?: string[] | null; // optional: streaming services
};

function buildQuery(params: Record<string, unknown>) {
  const qs = new URLSearchParams();
  for (const [k, v] of Object.entries(params)) {
    if (v === undefined || v === null || v === "") continue;
    if (Array.isArray(v)) {
      for (const item of v) qs.append(k, String(item));
    } else {
      qs.append(k, String(v));
    }
  }
  const s = qs.toString();
  return s ? `?${s}` : "";
}

function clamp(n: number, min: number, max: number) {
  return Math.min(max, Math.max(min, n));
}

function minutesToHHMM(mins: number) {
  const h = Math.floor(mins / 60)
    .toString()
    .padStart(2, "0");
  const m = Math.floor(mins % 60)
    .toString()
    .padStart(2, "0");
  return `${h}:${m}:00`;
}

function formatNumber(n: number) {
  return new Intl.NumberFormat().format(n);
}

function useDualRange(initial: [number, number], bounds: [number, number]) {
  const [[min, max], setRange] = useState<[number, number]>(initial);
  const [lo, hi] = bounds;
  const setMin = (v: number) =>
    setRange(([_, b]) => [clamp(v, lo, Math.min(b, hi)), b]);
  const setMax = (v: number) =>
    setRange(([a, _]) => [a, clamp(v, Math.max(a, lo), hi)]);
  const reset = () => setRange(initial);
  return { min, max, setMin, setMax, reset } as const;
}

/** Dual slider with blue fill between thumbs */
function DualSlider({
  min,
  max,
  step = 1,
  values,
  onChange,
}: {
  min: number;
  max: number;
  step?: number;
  values: [number, number];
  onChange: (values: [number, number]) => void;
}) {
  return (
    <Range
      step={step}
      min={min}
      max={max}
      values={values}
      onChange={(vals) => onChange([vals[0], vals[1]] as [number, number])}
      renderTrack={({ props, children }) => {
        // strip key before spread (Turbopack warning)
        const { key: _k, ...rest } = props as any;
        const percentageStart = ((values[0] - min) / (max - min)) * 100;
        const percentageEnd = ((values[1] - min) / (max - min)) * 100;
        return (
          <div
            {...rest}
            style={{
              ...rest.style,
              height: 6,
              borderRadius: 9999,
              background: `linear-gradient(
                to right,
                #2b2b2d ${percentageStart}%,
                #6ee7ff ${percentageStart}%,
                #6ee7ff ${percentageEnd}%,
                #2b2b2d ${percentageEnd}%
              )`,
            }}
          >
            {children}
          </div>
        );
      }}
      renderThumb={({ props, index }) => {
        const { key: _k, ...rest } = props as any; // strip key before spread
        return (
          <div
            key={index}
            {...rest}
            style={{
              ...rest.style,
              width: 14,
              height: 14,
              borderRadius: "50%",
              background: "#6ee7ff",
              boxShadow: "0 0 0 2px #0e0e0f",
            }}
          />
        );
      }}
    />
  );
}

function SmallNumber({ value }: { value: number | string }) {
  return <span className="small-num">{value}</span>;
}

/** ---------- Genres dropdown (multi-select, no libraries) ---------- */

const GENRE_FALLBACK = [
  "Action","Adventure","Animation","Biography","Comedy","Crime","Documentary","Drama",
  "Family","Fantasy","Film-Noir","History","Horror","Music","Musical","Mystery",
  "Romance","Sci-Fi","Sport","Thriller","War","Western"
];

function GenresDropdown({
  options,
  value,
  onChange,
  placeholder = "Select genres",
}: {
  options: string[];
  value: string[];
  onChange: (v: string[]) => void;
  placeholder?: string;
}) {
  const [open, setOpen] = useState(false);
  const [search, setSearch] = useState("");

  const filtered = useMemo(() => {
    const q = search.trim().toLowerCase();
    return options.filter((o) => o.toLowerCase().includes(q));
  }, [options, search]);

  function toggle(opt: string) {
    onChange(value.includes(opt) ? value.filter((v) => v !== opt) : [...value, opt]);
  }

  return (
    <div className="gdd">
      <button type="button" className="gdd-btn" onClick={() => setOpen((o) => !o)}>
        {value.length ? value.join(", ") : placeholder}
        <span className="caret">▾</span>
      </button>

      {open && (
        <div className="gdd-menu" role="listbox" aria-multiselectable>
          <input
            className="gdd-search"
            placeholder="Search…"
            value={search}
            onChange={(e) => setSearch(e.target.value)}
          />
          <div className="gdd-list">
            {filtered.map((opt) => (
              <label key={opt} className="gdd-item">
                <input
                  type="checkbox"
                  checked={value.includes(opt)}
                  onChange={() => toggle(opt)}
                />
                <span>{opt}</span>
              </label>
            ))}
            {filtered.length === 0 && <div className="gdd-empty">No matches</div>}
          </div>
          <div className="gdd-actions">
            <button className="muted" onClick={() => onChange([])}>Clear</button>
            <button onClick={() => setOpen(false)}>Done</button>
          </div>
        </div>
      )}
    </div>
  );
}

/** --------------------------- Page --------------------------- */

export default function Page() {
  // === Filters (backend-aligned) ===
  const [tconst, setTconst] = useState("");
  const [primaryTitle, setPrimaryTitle] = useState("");

  const [genres, setGenres] = useState<string[]>([]);
  const [applyAllGenres, setApplyAllGenres] = useState(false);

  const years = useDualRange([1985, new Date().getFullYear()], [1900, new Date().getFullYear()]);
  const runtime = useDualRange([60, 180], [30, 300]);
  const rating = useDualRange([7, 10], [0, 10]);
  const [numVotes, setNumVotes] = useState(100000);
  const [limit, setLimit] = useState(5);

  // Data state
  const [movies, setMovies] = useState<Movie[]>([]);
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);

  // Genres options: fetched from backend with static fallback
  const [genreOptions, setGenreOptions] = useState<string[]>([]);
  useEffect(() => {
    let cancelled = false;
    (async () => {
      try {
        const res = await fetch("api/genres", { cache: "no-store" });
        if (!res.ok) return;
        const list: string[] = await res.json();
        if (!cancelled && list?.length) setGenreOptions(list);
      } catch {
        /* keep fallback */
      }
    })();
    return () => {
      cancelled = true;
    };
  }, []);

  const queryString = useMemo(
    () =>
      buildQuery({
        tconst: tconst || undefined,
        primary_title: primaryTitle || undefined,
        genres: genres.join(",") || undefined,
        apply_all_genres: applyAllGenres ? 1 : 0,
        start_year: years.min,
        end_year: years.max,
        average_rating_min: rating.min,
        average_rating_max: rating.max,
        runtime_minutes_min: runtime.min,
        runtime_minutes_max: runtime.max,
        num_votes: numVotes,
        limit,
      }),
    [
      tconst,
      primaryTitle,
      genres,
      applyAllGenres,
      years.min,
      years.max,
      rating.min,
      rating.max,
      runtime.min,
      runtime.max,
      numVotes,
      limit,
    ]
  );

  async function fetchMovies() {
    setLoading(true);
    setError(null);
    try {
      const res = await fetch(`/api/movies${queryString}`, { cache: "no-store" });
      if (!res.ok) throw new Error(`HTTP ${res.status}`);
      const data = await res.json();
      const arr: Movie[] = Array.isArray(data) ? data : data?.movies ?? [];
      setMovies(arr);
    } catch (e: any) {
      setError(e?.message ?? "Unknown error");
      setMovies([]);
    } finally {
      setLoading(false);
    }
  }

  const votesPct = (numVotes / 500000) * 100; // for single-slider background

  return (
    <main className="wrap compact">
      <h1 className="title">IMDb Movie Suggestions</h1>

      <section className="layout">
        {/* LEFT: Filters */}
        <div className="panel">
          <div className="field two-col">
            <label className="sr-only">IDs & Title</label>
            <input
              className="text"
              value={tconst}
              onChange={(e) => setTconst(e.target.value)}
              placeholder="tconst (tt1234567)"
            />
            <input
              className="text"
              value={primaryTitle}
              onChange={(e) => setPrimaryTitle(e.target.value)}
              placeholder="Title contains"
            />
          </div>

          <div className="field">
            <label>Genres</label>
            <GenresDropdown options={genreOptions} value={genres} onChange={setGenres} />
            <div className="toggle" onClick={() => setApplyAllGenres((v) => !v)}>
              <input type="checkbox" checked={applyAllGenres} readOnly />
              <span>Must include all genres</span>
            </div>
          </div>

          <div className="field">
            <label>
              Years <SmallNumber value={`${years.min}—${years.max}`} />
            </label>
            <div className="range">
              <DualSlider
                min={1900}
                max={new Date().getFullYear()}
                step={1}
                values={[years.min, years.max]}
                onChange={([a, b]) => {
                  years.setMin(a);
                  years.setMax(b);
                }}
              />
            </div>
          </div>

          <div className="field">
            <label>
              Runtime <SmallNumber value={`${minutesToHHMM(runtime.min)}—${minutesToHHMM(runtime.max)}`} />
            </label>
            <div className="range">
              <DualSlider
                min={30}
                max={300}
                step={1}
                values={[runtime.min, runtime.max]}
                onChange={([a, b]) => {
                  runtime.setMin(a);
                  runtime.setMax(b);
                }}
              />
            </div>
          </div>

          <div className="field">
            <label>
              Rating <SmallNumber value={`${rating.min.toFixed(1)}—${rating.max.toFixed(1)}`} />
            </label>
            <div className="range">
              <DualSlider
                min={0}
                max={10}
                step={0.1}
                values={[rating.min, rating.max]}
                onChange={([a, b]) => {
                  rating.setMin(a);
                  rating.setMax(b);
                }}
              />
            </div>
          </div>

          <div className="field">
            <label>
              Min votes <SmallNumber value={formatNumber(numVotes)} />
            </label>
            <input
              type="range"
              min={0}
              max={500000}
              step={5000}
              value={numVotes}
              onChange={(e) => setNumVotes(Number(e.target.value))}
              style={{
                width: "100%",
                height: "6px",
                borderRadius: "9999px",
                appearance: "none",
                background: `linear-gradient(
                  to right,
                  #2b2b2d ${votesPct}%,
                  #6ee7ff ${votesPct}%,
                  #6ee7ff 100%
                )`,
                outline: "none",
              }}
            />
          </div>

          <div className="field inline">
            <label>Limit</label>
            <select value={limit} onChange={(e) => setLimit(Number(e.target.value))}>
              {[3, 5, 10, 15, 20].map((n) => (
                <option key={n} value={n}>
                  {n}
                </option>
              ))}
            </select>
            <div className="spacer" />
            <button onClick={fetchMovies} disabled={loading}>
              Generate
            </button>
            <button
              className="muted"
              onClick={() => {
                setTconst("");
                setPrimaryTitle("");
                setGenres([]);
                setApplyAllGenres(false);
                years.reset();
                runtime.reset();
                rating.reset();
                setNumVotes(100000);
                setLimit(5);
                setMovies([]);
                setError(null);
              }}
            >
              Reset
            </button>
          </div>
        </div>

        {/* RIGHT: Results */}
        <div className="results">
          <h2>Movie Suggestions</h2>
          <div className="table-wrap">
            <table>
              <thead>
                <tr>
                  {["Title", "Year", "Rating", "Length", "Genres", "Streaming Services"].map((h) => (
                    <th key={h}>{h}</th>
                  ))}
                </tr>
              </thead>
              <tbody>
                {loading && (
                  <tr>
                    <td colSpan={6} className="center">
                      Loading…
                    </td>
                  </tr>
                )}
                {error && (
                  <tr>
                    <td colSpan={6} className="error">
                      Error: {error}
                    </td>
                  </tr>
                )}
                {!loading && !error && movies.length === 0 && (
                  <tr>
                    <td colSpan={6} className="center">
                      No results
                    </td>
                  </tr>
                )}
                {movies.map((m) => (
                  <tr key={m.tconst}>
                    <td className="bold">{m.primary_title}</td>
                    <td>{m.start_year ?? "—"}</td>
                    <td>{m.average_rating ?? "—"}</td>
                    <td>{m.runtime_minutes != null ? minutesToHHMM(m.runtime_minutes) : "—"}</td>
                    <td>{m.genres ?? "—"}</td>
                    <td>{m.providers?.join(", ") ?? "—"}</td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        </div>
      </section>

      <style jsx global>{`
        :root { --bg:#0e0e0f; --panel:#161617; --ink:#fff; --muted:#aaa; --line:#2b2b2d; --accent:#6ee7ff; }
        html, body { background: var(--bg) !important; color: var(--ink) !important; }
        * { box-sizing: border-box; }
        .wrap { padding: 16px; }
        .title { font-size: 24px; margin: 0 0 12px; letter-spacing: 0.2px; }
        .layout { display: grid; grid-template-columns: 420px 1fr; gap: 20px; align-items: start; }
        .panel { background: var(--panel); border: 1px solid var(--line); border-radius: 10px; padding: 12px; }
        .field { margin-bottom: 12px; }
        .field.inline { display: grid; grid-template-columns: auto 1fr auto auto; gap: 8px; align-items: center; }
        .field label { display: inline-block; font-weight: 600; margin-bottom: 4px; font-size: 13px; }
        .two-col { display: grid; grid-template-columns: 1fr 1fr; gap: 8px; }
        .text { width: 100%; background: #111; color: #fff; border: 1px solid #444; border-radius: 8px; padding: 6px; font-size: 13px; }
        .toggle { margin-top: 8px; display: inline-flex; gap: 8px; align-items: center; cursor: pointer; user-select: none; }
        input[type="checkbox"] { width: 14px; height: 14px; }
        input[type="range"] { width: 100%; height: 4px; }
        select { background: #111; color: #fff; border: 1px solid #444; border-radius: 8px; padding: 6px; font-size: 13px; }
        .actions { display: flex; gap: 8px; }
        button { background: var(--accent); color: #031b1f; border: none; border-radius: 10px; padding: 8px 12px; font-weight: 700; cursor: pointer; font-size: 13px; }
        button:disabled { opacity: .6; cursor: default; }
        button.muted { background: #2a2a2c; color: var(--ink); }

        .results h2 { margin: 0 0 10px; font-size: 18px; }
        .table-wrap { overflow: auto; border: 1px solid var(--line); border-radius: 10px; }
        table { width: 100%; border-collapse: collapse; min-width: 800px; }
        th, td { text-align: left; padding: 8px 10px; border-bottom: 1px solid var(--line); font-size: 13px; }
        thead th { background: var(--panel); font-size: 11px; text-transform: uppercase; letter-spacing: .04em; }
        tbody tr:nth-child(even) { background: #1f1f21; }
        .bold { font-weight: 700; }
        .center { text-align: center; color: var(--muted); }
        .error { color: #ff6b6b; }

        .range { display: grid; gap: 6px; }
        .small-num { color: var(--muted); font-variant-numeric: tabular-nums; font-size: 12px; margin-left: 6px; }

        /* Genres dropdown styles */
        .gdd { position: relative; }
        .gdd-btn {
          width: 100%; background: #111; color: #fff; border: 1px solid #444;
          border-radius: 8px; padding: 6px 10px; text-align: left; display: flex;
          justify-content: space-between; align-items: center;
        }
        .caret { opacity: .8; }
        .gdd-menu {
          position: absolute; z-index: 20; top: calc(100% + 6px); left: 0; right: 0;
          background: #0f0f11; border: 1px solid #333; border-radius: 10px;
          box-shadow: 0 10px 30px rgba(0,0,0,.3); padding: 8px;
        }
        .gdd-search {
          width: 100%; background: #111; color: #fff; border: 1px solid #333;
          border-radius: 8px; padding: 6px 8px; margin-bottom: 6px;
        }
        .gdd-list { max-height: 220px; overflow: auto; display: grid; gap: 4px; }
        .gdd-item { display: flex; gap: 8px; align-items: center; padding: 6px 4px; border-radius: 8px; }
        .gdd-item:hover { background: #1b1b1e; }
        .gdd-empty { color: #aaa; font-size: 12px; padding: 8px; text-align: center; }
        .gdd-actions { display: flex; justify-content: space-between; padding-top: 6px; }

        @media (max-width: 1024px) { .layout { grid-template-columns: 1fr; } }
        .sr-only { position: absolute; width: 1px; height: 1px; padding: 0; margin: -1px; overflow: hidden; clip: rect(0,0,0,0); border: 0; }
      `}</style>
    </main>
  );
}
