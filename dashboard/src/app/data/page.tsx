"use client";

import { useEffect, useMemo, useState } from "react";
import { ArrowLeft, Download, RefreshCw, Search, X } from "lucide-react";
import Link from "next/link";
import SiteHeader from "../SiteHeader";
import "./data.css";

type Device = { device_id: string; name: string | null };
type Reading = {
  id: number;
  device_id: string;
  timestamp: string;
  timestamp_utc: string;
  water_total: number | null;
  flow_rate: number | null;
  moisture: number | null;
  temperature: number | null;
  payload: Record<string, unknown> | null;
};

const API = process.env.NEXT_PUBLIC_API_URL ?? "http://localhost:8000/api";
const PAGE_SIZE_OPTIONS = [25, 50, 100];
const istDate = (timestamp: string) => new Intl.DateTimeFormat("en-CA", { timeZone: "Asia/Kolkata" }).format(new Date(timestamp));
function csvCell(value: unknown) {
  const text = value == null ? "" : typeof value === "object" ? JSON.stringify(value) : String(value);
  return `"${text.replaceAll('"', '""')}"`;
}

export default function TelemetryDataPage() {
  const [rows, setRows] = useState<Reading[]>([]);
  const [devices, setDevices] = useState<Device[]>([]);
  const [device, setDevice] = useState("all");
  const [family, setFamily] = useState("all");
  const [from, setFrom] = useState("");
  const [to, setTo] = useState("");
  const [search, setSearch] = useState("");
  const [page, setPage] = useState(1);
  const [pageSize, setPageSize] = useState(50);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState("");

  async function loadData() {
    setLoading(true);
    setError("");
    try {
      const deviceResponse = await fetch(`${API}/devices`, { cache: "no-store" });
      if (!deviceResponse.ok) throw new Error("Could not load devices.");
      const allRows: Reading[] = [];
      for (let offset = 0; ; offset += 1000) {
        const response = await fetch(`${API}/telemetry?limit=1000&offset=${offset}`, { cache: "no-store" });
        if (!response.ok) throw new Error("Could not load telemetry records.");
        const batch: Reading[] = await response.json();
        allRows.push(...batch);
        if (batch.length < 1000) break;
      }
      setDevices(await deviceResponse.json());
      setRows(allRows);
    } catch (reason) {
      setError(reason instanceof Error ? reason.message : "The monitoring API is unavailable.");
    } finally {
      setLoading(false);
    }
  }

  useEffect(() => { const timer = window.setTimeout(() => { void loadData(); }, 0); return () => window.clearTimeout(timer); }, []);

  const filteredRows = useMemo(() => rows.filter((row) => {
    if (device !== "all" && row.device_id !== device) return false;
    if (from && istDate(row.timestamp_utc) < from) return false;
    if (to && istDate(row.timestamp_utc) > to) return false;
    if (family === "water" && row.water_total == null && row.flow_rate == null) return false;
    if (family === "soil" && row.moisture == null && row.temperature == null) return false;
    const query = search.trim().toLowerCase();
    if (query && !`${row.device_id} ${row.timestamp} ${row.water_total ?? ""} ${row.flow_rate ?? ""} ${row.moisture ?? ""} ${row.temperature ?? ""} ${JSON.stringify(row.payload ?? {})}`.toLowerCase().includes(query)) return false;
    return true;
  }), [rows, device, from, to, family, search]);

  const pageCount = Math.max(1, Math.ceil(filteredRows.length / pageSize));
  const currentPage = Math.min(page, pageCount);
  const visibleRows = filteredRows.slice((currentPage - 1) * pageSize, currentPage * pageSize);
  const deviceNames = new Map(devices.map((item) => [item.device_id, item.name ?? item.device_id]));
  const hasFilters = device !== "all" || family !== "all" || from !== "" || to !== "" || search !== "";

  function downloadCsv() {
    const columns = ["id", "device_id", "device_name", "timestamp_utc", "timestamp_ist", "water_total_m3", "flow_rate", "moisture_percent", "temperature_c", "payload_json"];
    const records = filteredRows.map((row) => [row.id, row.device_id, deviceNames.get(row.device_id), row.timestamp_utc, row.timestamp, row.water_total, row.flow_rate, row.moisture, row.temperature, row.payload]);
    const content = [columns, ...records].map((record) => record.map(csvCell).join(",")).join("\r\n");
    const url = URL.createObjectURL(new Blob([`\uFEFF${content}`], { type: "text/csv;charset=utf-8" }));
    const anchor = document.createElement("a");
    anchor.href = url;
    anchor.download = `auro-orchard-telemetry-${new Date().toISOString().slice(0, 10)}.csv`;
    anchor.click();
    URL.revokeObjectURL(url);
  }

  function clearFilters() {
    setDevice("all"); setFamily("all"); setFrom(""); setTo(""); setSearch(""); setPage(1);
  }

  return <main className="data-page">
    <SiteHeader tabs={["Overview", "Water", "Soil", "Energy", "Devices"]} />
    <div className="data-topbar"><Link href="/" className="data-back"><ArrowLeft size={16} /> Overview</Link><span>AURO ORCHARD / FIELD DATA</span><button className="data-icon-button" onClick={() => void loadData()} title="Refresh telemetry"><RefreshCw size={16} /></button></div>
    <section className="data-heading"><p>MONITORING ARCHIVE</p><h1>Telemetry data</h1><div>All recorded device readings, with decoded payloads preserved.</div></section>
    {error && <div className="data-error">{error} Check that the monitoring API is running, then refresh.</div>}
    <section className="data-workspace">
      <div className="data-toolbar"><div className="data-count"><strong>{filteredRows.length.toLocaleString("en-IN")}</strong><span>of {rows.length.toLocaleString("en-IN")} readings</span></div><button className="data-download" onClick={downloadCsv} disabled={!filteredRows.length}><Download size={16} /> Download CSV</button></div>
      <div className="data-filters">
        <label>Device<select value={device} onChange={(event) => { setDevice(event.target.value); setPage(1); }}><option value="all">All devices</option>{devices.map((item) => <option key={item.device_id} value={item.device_id}>{item.name ?? item.device_id}</option>)}</select></label>
        <label>Reading type<select value={family} onChange={(event) => { setFamily(event.target.value); setPage(1); }}><option value="all">All readings</option><option value="water">Water</option><option value="soil">Soil</option></select></label>
        <label>From (IST)<input type="date" value={from} onChange={(event) => { setFrom(event.target.value); setPage(1); }} /></label>
        <label>To (IST)<input type="date" value={to} onChange={(event) => { setTo(event.target.value); setPage(1); }} /></label>
        <label className="data-search"><span>Search values or payload</span><div><Search size={15} /><input type="search" value={search} placeholder="Search telemetry" onChange={(event) => { setSearch(event.target.value); setPage(1); }} /></div></label>
        {hasFilters && <button className="data-clear" onClick={clearFilters}><X size={14} /> Clear filters</button>}
      </div>
      <div className="data-table-wrap"><table className="data-table"><thead><tr><th>Timestamp (IST)</th><th>Device</th><th>Water total</th><th>Flow rate</th><th>Moisture</th><th>Temperature</th><th>Decoded payload</th></tr></thead><tbody>{visibleRows.map((row) => <tr key={row.id}><td className="data-time">{row.timestamp}</td><td><strong>{deviceNames.get(row.device_id) ?? row.device_id}</strong><small>{row.device_id}</small></td><td>{row.water_total == null ? "—" : `${row.water_total} m³`}</td><td>{row.flow_rate == null ? "—" : row.flow_rate}</td><td>{row.moisture == null ? "—" : `${row.moisture}%`}</td><td>{row.temperature == null ? "—" : `${row.temperature} °C`}</td><td><details><summary>View payload</summary><pre>{JSON.stringify(row.payload ?? {}, null, 2)}</pre></details></td></tr>)}{!visibleRows.length && <tr><td colSpan={7} className="data-empty">{loading ? "Loading telemetry…" : "No readings match these filters."}</td></tr>}</tbody></table></div>
      <div className="data-pagination"><span>Showing {filteredRows.length ? (currentPage - 1) * pageSize + 1 : 0}–{Math.min(currentPage * pageSize, filteredRows.length)} of {filteredRows.length.toLocaleString("en-IN")}</span><div><label>Rows<select value={pageSize} onChange={(event) => { setPageSize(Number(event.target.value)); setPage(1); }}>{PAGE_SIZE_OPTIONS.map((size) => <option key={size} value={size}>{size}</option>)}</select></label><button onClick={() => setPage(Math.max(1, currentPage - 1))} disabled={currentPage <= 1}>Previous</button><span>{currentPage} / {pageCount}</span><button onClick={() => setPage(Math.min(pageCount, currentPage + 1))} disabled={currentPage >= pageCount}>Next</button></div></div>
    </section>
    <footer className="data-footer">{loading ? "Syncing records…" : `Archive loaded · ${rows.length.toLocaleString("en-IN")} telemetry records`}</footer>
  </main>;
}