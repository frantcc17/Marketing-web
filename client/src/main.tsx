import { StrictMode } from "react";
import { createRoot } from "react-dom/client";
import { Host } from "./host/Host";
import { Play } from "./play/Play";
import { Aria } from "./components/Aria";
import "./styles.css";

function Home() {
  return (
    <div className="m-screen home">
      <Aria mood="idle" size={140} />
      <h1 className="display display--sm">Convence al algoritmo</h1>
      <p className="muted">Un juego de clase sobre retail media y comercio agéntico.</p>
      <div className="home-actions">
        <a className="btn btn--primary btn--lg" href="/host">Soy el profesor</a>
        <a className="btn btn--lg" href="/play">Soy alumno</a>
      </div>
    </div>
  );
}

const path = location.pathname.replace(/\/+$/, "");
const page = path.startsWith("/host") ? <Host /> : path.startsWith("/play") ? <Play /> : <Home />;
document.body.classList.add(path.startsWith("/host") ? "is-host" : "is-mobile");

createRoot(document.getElementById("root")!).render(<StrictMode>{page}</StrictMode>);
