"use client";

import { useEffect, useState } from "react";
import { Activity, Droplets, Leaf, RefreshCw, ThermometerSun, Waves, Zap } from "lucide-react";
import { BarElement, CategoryScale, Chart as ChartJS, Filler, Legend, LineElement, LinearScale, PointElement, Tooltip, type ChartOptions } from "chart.js";
import { Bar, Line } from "react-chartjs-2";
import SiteHeader from "./SiteHeader";
import chartStyles from "./chart.module.css";
import dailyWaterStyles from "./daily-water.module.css";

ChartJS.register(CategoryScale, LinearScale, PointElement, LineElement, BarElement, Filler, Tooltip, Legend);

type Device = { device_id: string; name: string | null; device_type: string | null; last_seen_at: string | null };
type Reading = { id: number; device_id: string; timestamp: string; timestamp_utc: string; water_total: number | null; moisture: number | null; temperature: number | null; payload: Record<string, unknown> | null };
const API = process.env.NEXT_PUBLIC_API_URL ?? "http://95.217.220.40:8000/api";
const tabs = ["Overview", "Water", "Soil", "Energy", "Devices"] as const;
type Tab = (typeof tabs)[number];
const n = (value: number | null | undefined, digits = 1) => value == null ? "--" : value.toFixed(digits);
const istDay = (timestamp: string | Date) => new Intl.DateTimeFormat("en-CA", { timeZone: "Asia/Kolkata" }).format(new Date(timestamp));

function dailySeries(rows: Reading[]) {
  const values = rows.filter((row) => row.water_total != null).toSorted((a, b) => a.timestamp_utc.localeCompare(b.timestamp_utc));
  const lastByDay = new Map<string, number>();
  for (const row of values) lastByDay.set(istDay(row.timestamp_utc), row.water_total as number);
  const usage = new Map<string, number | null>();
  let previous: number | null = null;
  for (const [day, total] of lastByDay) {
    usage.set(day, previous === null || total < previous ? null : total - previous);
    previous = total;
  }
  return usage;
}

function DailyUseChart({ days, series, yTitle = "m³ per day" }: { days: string[]; series: { label: string; color: string; values: Map<string, number | null> }[]; yTitle?: string }) {
  const data = { labels: days, datasets: series.map((s) => ({ label: s.label, data: days.map((d) => s.values.get(d) ?? null), backgroundColor: s.color, borderRadius: 3 })) };
  const options: ChartOptions<"bar"> = {
    responsive: true,
    maintainAspectRatio: false,
    plugins: { legend: { position: "bottom", labels: { boxWidth: 12, font: { size: 11 } } }, tooltip: { callbacks: { label: (item) => `${item.dataset.label}: ${n(item.parsed.y, 2)} m³` } } },
    scales: {
      x: { grid: { display: false }, ticks: { color: "#667085", maxRotation: 0, autoSkip: true, font: { family: "DM Mono", size: 10 } } },
      y: { beginAtZero: true, grid: { color: "#e6eaf0" }, title: { display: true, text: yTitle }, ticks: { color: "#667085", maxTicksLimit: 5, font: { family: "DM Mono", size: 10 } } },
    },
  };
  return <div className={chartStyles.chart}>{days.length ? <div className={chartStyles.plot} role="img" aria-label="Daily water usage by location"><Bar data={data} options={options} /></div> : <div className={chartStyles.empty}>Awaiting readings</div>}</div>;
}

function compare(current: number | null, previous: number | null) {
  if (current === null || previous === null || previous === 0) return "No previous-period comparison";
  const percent = Math.round(Math.abs((current - previous) / previous) * 100);
  return `${percent}% ${current >= previous ? "higher" : "lower"} than the previous period`;
}

function Chart({ rows, field, color, unit }: { rows: Reading[]; field: "water_total" | "moisture" | "temperature"; color: string; unit: string }) {
  const values = rows.filter((row) => row[field] != null).toSorted((a, b) => a.timestamp_utc.localeCompare(b.timestamp_utc));
  const seriesColor = color === "#d8c95b" || color === "#d59d38" ? "#2563eb" : color;
  const timeLabel = (timestamp: string) => new Intl.DateTimeFormat("en-IN", { timeZone: "Asia/Kolkata", dateStyle: "medium", timeStyle: "short" }).format(new Date(timestamp));
  const dateLabel = (timestamp: string) => new Intl.DateTimeFormat("en-IN", { timeZone: "Asia/Kolkata", day: "numeric", month: "short" }).format(new Date(timestamp));
  const data = {
    labels: values.map((row) => row.timestamp_utc),
    datasets: [{
      data: values.map((row) => row[field] as number),
      borderColor: seriesColor,
      backgroundColor: `${seriesColor}2b`,
      borderWidth: 2.5,
      pointRadius: values.length > 90 ? 0 : 2,
      pointHoverRadius: 5,
      pointBackgroundColor: seriesColor,
      pointBorderColor: "#f7f4e8",
      pointBorderWidth: 1,
      fill: true,
      tension: 0.32,
    }],
  };
  const options: ChartOptions<"line"> = {
    responsive: true,
    maintainAspectRatio: false,
    interaction: { mode: "index", intersect: false },
    plugins: {
      legend: { display: false },
      tooltip: {
        backgroundColor: "#172b21f2",
        titleColor: "#f7f4e8",
        bodyColor: "#f7f4e8",
        displayColors: false,
        padding: 10,
        callbacks: {
          title: (items) => items.length ? timeLabel(String(items[0].label)) : "",
          label: (item) => `${n(item.parsed.y, 2)} ${unit}`,
        },
      },
    },
    scales: {
      x: {
        grid: { display: false },
        border: { display: false },
        ticks: {
          color: "#667085",
          maxTicksLimit: 5,
          maxRotation: 0,
          font: { family: "DM Mono", size: 10 },
          callback: (_value, index) => values[index] ? dateLabel(values[index].timestamp_utc) : "",
        },
      },
      y: {
        beginAtZero: false,
        border: { display: false },
        grid: { color: "#e6eaf0" },
        ticks: {
          color: "#667085",
          maxTicksLimit: 4,
          font: { family: "DM Mono", size: 10 },
          callback: (value) => n(Number(value), 2),
        },
      },
    },
  };
  return <div className={chartStyles.chart}>
    {values.length ? <div className={chartStyles.plot} role="img" aria-label={`${values.length} readings showing ${field.replace("_", " ")} from ${timeLabel(values[0].timestamp_utc)} to ${timeLabel(values.at(-1)!.timestamp_utc)}`}><Line data={data} options={options} /></div> : <div className={chartStyles.empty}>Awaiting readings</div>}
  </div>;
}

function Metric({ label, value, unit, note }: { icon?: typeof Droplets; label: string; value: string; unit: string; note: string }) {
  return <article className={dailyWaterStyles.kpi}><span>{label}</span><b>{value} {unit}</b><small>{note}</small></article>;
}

export default function Home() {
  const [tab, setTab] = useState<Tab>("Overview"), [zone, setZone] = useState<"all" | "mango" | "overhead">("all"), [mode, setMode] = useState<"daily" | "cumulative">("daily"), [devices, setDevices] = useState<Device[]>([]), [readings, setReadings] = useState<Reading[]>([]), [status, setStatus] = useState("Loading field data...");
  async function refresh() { setStatus("Loading field data..."); try { const deviceResponse = await fetch(`${API}/devices`, { cache: "no-store" }); if (!deviceResponse.ok) throw new Error(); const allReadings: Reading[] = []; for (let offset = 0; ; offset += 1000) { const response = await fetch(`${API}/telemetry?limit=1000&offset=${offset}`, { cache: "no-store" }); if (!response.ok) throw new Error(); const page: Reading[] = await response.json(); allReadings.push(...page); if (page.length < 1000) break; } setDevices(await deviceResponse.json()); setReadings(allReadings); setStatus(""); } catch { setStatus("The monitoring API is unavailable. Start the Python API on port 8000, then refresh."); } }
  useEffect(() => { const timer = window.setTimeout(() => { void refresh(); }, 0); return () => window.clearTimeout(timer); }, []);
  const soil = readings.filter((r) => r.device_id === "ao-ms-01"), water = readings.filter((r) => r.device_id === "aofm-sm-01");
  const latestSoil = soil[0], latestWater = water[0], mango = readings.filter((r) => r.device_id === "aofm-01"), latestMango = mango[0];
  const soilDaily = [...soil.reduce((map, r) => {
    const day = istDay(r.timestamp_utc), d = map.get(day) ?? { day, m: 0, mc: 0, t: 0, tc: 0, count: 0 };
    if (r.moisture != null) { d.m += r.moisture; d.mc++; }
    if (r.temperature != null) { d.t += r.temperature; d.tc++; }
    d.count++;
    return map.set(day, d);
  }, new Map<string, { day: string; m: number; mc: number; t: number; tc: number; count: number }>()).values()]
    .map((d) => ({ day: d.day, moisture: d.mc ? d.m / d.mc : null, temperature: d.tc ? d.t / d.tc : null, count: d.count }))
    .toSorted((a, b) => b.day.localeCompare(a.day));
  const mangoSeries = dailySeries(readings.filter((row) => row.device_id === "aofm-01")), overheadSeries = dailySeries(water);
  const dailyDays = [...new Set([...mangoSeries.keys(), ...overheadSeries.keys()])].toSorted().reverse();
  const battery = latestSoil?.payload?.BatV ?? latestWater?.payload?.Battery;
  const overview = tab === "Overview" || tab === "Water" || tab === "Soil";
  const latestReading = readings.reduce<Reading | null>((latest, row) => !latest || row.timestamp_utc > latest.timestamp_utc ? row : latest, null);
  const latestTimestamp = latestReading?.timestamp_utc ?? null;
  const latestDate = latestTimestamp ? istDay(latestTimestamp) : "";
  const todayStart = latestTimestamp ? new Date(`${latestDate}T00:00:00+05:30`) : new Date();
  const dayKey = (offset: number) => istDay(new Date(todayStart.getTime() + offset * 86400000 + 43200000));
  const totalUse = (from: number, to: number) => {
    let sum: number | null = null;
    for (let i = from; i <= to; i++) for (const series of [mangoSeries, overheadSeries]) { const v = series.get(dayKey(i)); if (v != null) sum = (sum ?? 0) + v; }
    return sum;
  };
  const todayUse = totalUse(0, 0);
  const yesterdayUse = totalUse(-1, -1);
  const weekUse = totalUse(-6, 0);
  const previousWeekUse = totalUse(-13, -7);
  const locations = [{ id: "mango", label: "Mango orchard irrigation", device: "aofm-01", color: "#2563eb", series: mangoSeries, image: "/mango-orchard.svg", latest: latestMango }, { id: "overhead", label: "Overhead tank", device: "aofm-sm-01", color: "#4d7c3a", series: overheadSeries, image: "/overhead-tank.svg", latest: latestWater }];
  const shown = zone === "all" ? locations : locations.filter((l) => l.id === zone);
  const chronological = [...dailyDays].reverse();
  const running = (series: Map<string, number | null>) => { let sum = 0; const out = new Map<string, number | null>(); for (const d of chronological) { sum += series.get(d) ?? 0; out.set(d, sum); } return out; };
  const sumToday = shown.reduce<number | null>((s, l) => { const v = l.series.get(dayKey(0)); return v == null ? s : (s ?? 0) + v; }, null);
  const sumTotal = shown.reduce<number | null>((s, l) => l.latest?.water_total == null ? s : (s ?? 0) + l.latest.water_total, null);
  const moistureCondition = latestSoil?.moisture == null ? "No current reading" : latestSoil.moisture < 10 ? "Below the provisional irrigation threshold" : "Within the provisional irrigation range";
  const unusualUse = todayUse !== null && yesterdayUse !== null && yesterdayUse > 0 && todayUse > yesterdayUse * 1.5;
  return <main><SiteHeader tabs={tabs} active={tab} onSelect={(item) => setTab(item as Tab)} /><div className="dashboard-status"><span><i /> FIELD MONITORING / AUROVILLE</span><span className="live"><i /> LIVE FIELD SIGNALS <button onClick={() => void refresh()} title="Refresh data"><RefreshCw size={17} /></button></span></div>
    <section className="hero"><p>AURO ORCHARD / SENSOR NETWORK</p><h1>Care begins with <em>attention.</em></h1><div>Water, soil, and field infrastructure observed in one quiet working view.</div></section>
    {status && <aside>{status}</aside>}<section className="content">
      {tab === "Overview" && <><div className={dailyWaterStyles.header}><h3>Today in the Field</h3><span>Last updated {latestReading?.timestamp ?? "--"}</span></div><div className={dailyWaterStyles.kpis}><Metric icon={Waves} label="Water used today" value={n(todayUse, 2)} unit="m³" note={compare(todayUse, yesterdayUse)} /><Metric icon={Waves} label="Water used this week" value={n(weekUse, 2)} unit="m³" note={compare(weekUse, previousWeekUse)} /><Metric icon={Droplets} label="Banana area soil moisture" value={n(latestSoil?.moisture, 2)} unit="%" note={moistureCondition} /><Metric icon={Activity} label="System condition" value={String(devices.length)} unit="devices reporting" note={unusualUse ? "Attention: unusual water use detected" : "No unusual water use detected"} /></div><section className={dailyWaterStyles.section}><div className={dailyWaterStyles.header}><h3>Smart Farm Telemetry</h3><span>Real-time field irrigation &amp; water metrics across active locations</span></div><div className={dailyWaterStyles.deck}><div className={dailyWaterStyles.group}><label htmlFor="water-location">Active Location:</label><select id="water-location" value={zone} onChange={(e) => setZone(e.target.value as typeof zone)}><option value="all">All locations</option>{locations.map((l) => <option key={l.id} value={l.id}>{l.label}</option>)}</select></div><div className={dailyWaterStyles.segmented}><button className={mode === "daily" ? dailyWaterStyles.selected : ""} onClick={() => setMode("daily")}>Daily Usage</button><button className={mode === "cumulative" ? dailyWaterStyles.selected : ""} onClick={() => setMode("cumulative")}>Cumulative</button></div></div><div className={dailyWaterStyles.kpis}><article className={dailyWaterStyles.kpi}><span>Used Today</span><b>{n(sumToday, 2)} m³</b><small>{dayKey(0)}</small></article><article className={dailyWaterStyles.kpi}><span>Meter Total</span><b>{n(sumTotal, 3)} m³</b><small>Cumulative reading</small></article><article className={dailyWaterStyles.kpi}><span>Meters Reporting</span><b>{shown.length}</b><small>{shown.map((l) => l.device).join(", ")}</small></article><article className={dailyWaterStyles.kpi}><span>Flow Status</span><b><i className={sumToday ? dailyWaterStyles.active : dailyWaterStyles.idle}>{sumToday ? "Flow Active" : "Idle"}</i></b><small>Based on today's usage</small></article></div><div className={dailyWaterStyles.cards}><div className={dailyWaterStyles.card}><div className={dailyWaterStyles.cardHeader}><span>{mode === "daily" ? "Daily Water Usage (m³)" : "Cumulative Water Usage (m³)"}</span><small>By day · IST</small></div><DailyUseChart days={chronological} yTitle={mode === "daily" ? "m³ per day" : "m³ total"} series={shown.map((l) => ({ label: l.label, color: l.color, values: mode === "daily" ? l.series : running(l.series) }))} /></div><div className={dailyWaterStyles.card}><div className={dailyWaterStyles.cardHeader}><span>Irrigation Areas</span><small>{shown.length} active</small></div><div className={dailyWaterStyles.photos}>{shown.map((l) => <figure key={l.id}><img src={l.image} alt={l.label} /><figcaption>{l.label}<small>{l.device}</small></figcaption></figure>)}</div></div></div><table className={dailyWaterStyles.table}><thead><tr><th>Date (IST)</th><th>Mango orchard irrigation (m³)</th><th>Overhead tank (m³)</th></tr></thead><tbody>{dailyDays.map((day) => <tr key={day}><td>{day}</td><td>{n(mangoSeries.get(day), 2)}</td><td>{n(overheadSeries.get(day), 2)}</td></tr>)}</tbody></table></section></>}
      {tab !== "Overview" && overview && <><div className={dailyWaterStyles.header}><h3>{tab === "Water" ? "Water Meters" : "Banana Field"}</h3><span>{tab === "Water" ? "Cumulative flow and today's consumption for each irrigation meter" : "Soil moisture and temperature from the banana field probe"}</span></div><div className={dailyWaterStyles.kpis}>{tab === "Water" && <><Metric icon={Waves} label="Mango orchard cumulative flow" value={n(latestMango?.water_total, 3)} unit="m³" note={`Today's consumption: ${n(mangoSeries.get(dayKey(0)), 2)} m³`} /><Metric icon={Droplets} label="Overhead tank cumulative flow" value={n(latestWater?.water_total, 3)} unit="m³" note={`Today's consumption: ${n(overheadSeries.get(dayKey(0)), 2)} m³`} /></>}{tab === "Soil" && <><Metric icon={Droplets} label="Soil moisture" value={n(latestSoil?.moisture)} unit="%" note="Banana field probe" /><Metric icon={ThermometerSun} label="Soil temperature" value={n(latestSoil?.temperature)} unit="°C" note="Root-zone temperature" /></>}</div><div className={dailyWaterStyles.chartsGrid}>{tab === "Water" && <><div className={dailyWaterStyles.card}><div className={dailyWaterStyles.cardHeader}><span>Mango Orchard Irrigation (m³)</span><small>Cumulative flow · IST</small></div><img className={dailyWaterStyles.cardPhoto} src="/mango-orchard.svg" alt="Mango orchard with drip irrigation" /><Chart rows={mango} field="water_total" color="#2563eb" unit="m³" /></div><div className={dailyWaterStyles.card}><div className={dailyWaterStyles.cardHeader}><span>Overhead Tank (m³)</span><small>Cumulative flow · IST</small></div><img className={dailyWaterStyles.cardPhoto} src="/overhead-tank.svg" alt="Overhead water tank" /><Chart rows={water} field="water_total" color="#4d7c3a" unit="m³" /></div><div className={`${dailyWaterStyles.card} ${dailyWaterStyles.wide}`}><div className={dailyWaterStyles.cardHeader}><span>Daily Water Usage (m³)</span><small>By day · IST</small></div><DailyUseChart days={chronological} series={locations.map((l) => ({ label: l.label, color: l.color, values: l.series }))} /></div></>}{tab === "Soil" && <><div className={dailyWaterStyles.card}><div className={dailyWaterStyles.cardHeader}><span>Soil Moisture (%)</span><small>Moisture trend · IST</small></div><Chart rows={soil} field="moisture" color="#2563eb" unit="%" /></div><div className={dailyWaterStyles.card}><div className={dailyWaterStyles.cardHeader}><span>Soil Temperature (°C)</span><small>Root-zone trend · IST</small></div><Chart rows={soil} field="temperature" color="#4d7c3a" unit="°C" /></div></>}</div>{tab === "Soil" && <table className={dailyWaterStyles.table}><thead><tr><th>Date (IST)</th><th>Avg moisture (%)</th><th>Avg temperature (°C)</th><th>Readings</th></tr></thead><tbody>{soilDaily.map((d) => <tr key={d.day}><td>{d.day}</td><td>{n(d.moisture, 2)}</td><td>{n(d.temperature, 2)}</td><td>{d.count}</td></tr>)}</tbody></table>}</>}
      {tab === "Energy" && <div className="energy"><div><p>POWER</p><h2>Field energy</h2><span>Battery readings reported by the latest device transmissions.</span></div><strong><Zap size={25} />{typeof battery === "number" || typeof battery === "string" ? battery : "--"}<small>{latestSoil?.payload?.BatV ? "V" : "%"}</small></strong></div>}
      {tab === "Devices" && <div className="devices">{devices.map((d) => <article key={d.device_id}><div className="leaf"><Leaf size={20} /></div><div><h3>{d.name ?? d.device_id}</h3><p>{d.device_id} / {d.device_type?.replace("_", " ") ?? "field device"}</p></div><aside><i /> Last seen<br /><b>{d.last_seen_at ?? "No signal received"}</b></aside></article>)}</div>}
      </section><footer>AURO ORCHARD / FIELD SYSTEMS <span>{readings.length} readings in view</span></footer></main>;
}
