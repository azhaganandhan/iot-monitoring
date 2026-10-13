import Image from "next/image";
import Link from "next/link";

export default function SiteHeader({ tabs, active, onSelect }: { tabs?: readonly string[]; active?: string; onSelect?: (tab: string) => void }) {
  return (
    <header className="site-header">
      <Link className="site-brand" href="/" aria-label="AuroOrchard dashboard home">
        <Image
          src="https://auroorchard.auroville.org/wp-content/uploads/2025/07/AO-Logo-Stamp_White.png"
          alt="AuroOrchard"
          width={172}
          height={54}
          priority
        />
      </Link>
      <nav className="site-nav" aria-label="Dashboard sections">
        {tabs?.map((item) => onSelect
          ? <button key={item} type="button" onClick={() => onSelect(item)} className={active === item ? "selected" : ""}>{item}</button>
          : <Link key={item} href="/">{item}</Link>)}
      </nav>
      <Link href="/data" className="site-data-link">TELEMETRY DATA</Link>
    </header>
  );
}