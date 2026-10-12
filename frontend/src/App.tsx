import { useEffect, useState, type ReactNode } from "react";
import { Icon, Logo } from "./components/ui";
import { SettingsDrawer } from "./components/SettingsDrawer";
import { SettingsProvider, useSettings } from "./lib/settings";
import { health } from "./lib/api";
import { Interpreter } from "./pages/Interpreter";
import { Test } from "./pages/Test";
import { Results } from "./pages/Results";

const ROUTES = [
  { path: "/", label: "Interpreter", icon: "hand" },
  { path: "/test", label: "Live test", icon: "target" },
  { path: "/results", label: "Model & results", icon: "layers" },
];

function useRoute() {
  const [path, setPath] = useState(location.pathname);
  useEffect(() => { const f = () => setPath(location.pathname); addEventListener("popstate", f); return () => removeEventListener("popstate", f); }, []);
  const go = (to: string) => { if (to !== location.pathname + location.search) { history.pushState({}, "", to); setPath(location.pathname); window.scrollTo(0, 0); } };
  return { path, go };
}

function Navbar({ path, go }: { path: string; go: (p: string) => void }) {
  const { setOpen } = useSettings();
  const [up, setUp] = useState<boolean | null>(null);
  useEffect(() => { const f = () => health().then(setUp); f(); const i = setInterval(f, 8000); return () => clearInterval(i); }, []);
  const qs = location.search;
  return (
    <header className="nav">
      <a className="brand" href="/" onClick={(e) => { e.preventDefault(); go("/" + qs); }} aria-label="ISL Interpreter home"><Logo /><span>ISL Interpreter</span></a>
      <nav className="seg" aria-label="Screens">
        {ROUTES.map((r) => (
          <a key={r.path} href={r.path + qs} className={path === r.path ? "active" : ""} aria-current={path === r.path ? "page" : undefined}
            onClick={(e) => { e.preventDefault(); go(r.path + qs); }}><Icon name={r.icon} size={18} />{r.label}</a>
        ))}
      </nav>
      <div className="nav-right">
        <span className={`health ${up === null ? "" : up ? "up" : "down"}`} title={up ? "Backend is running" : "Backend not reachable"}><i />{up === null ? "Checking" : up ? "Backend online" : "Backend offline"}</span>
        <button className="icon-btn" aria-label="Open settings" onClick={() => setOpen(true)}><Icon name="settings" /></button>
      </div>
    </header>
  );
}

function Shell() {
  const { path, go } = useRoute();
  let page: ReactNode;
  if (path === "/test") page = <Test />;
  else if (path === "/results") page = <Results />;
  else page = <Interpreter />;
  return (
    <>
      <a className="skip" href="#main">Skip to content</a>
      <Navbar path={path} go={go} />
      <main id="main">{page}</main>
      <SettingsDrawer />
    </>
  );
}

export function App() { return <SettingsProvider><Shell /></SettingsProvider>; }
