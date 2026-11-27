import type { ReactNode } from "react";

export function Workspace({
  playlist = false,
  children,
}: {
  playlist?: boolean;
  children: ReactNode;
}) {
  return (
    <>
      <header className="masthead">
        <div className="mast-inner">
          <div className="brand">
            <i className="brand-mark" aria-hidden="true">
              <b />
              <b />
              <b />
              <b />
            </i>
            Signal Desk
          </div>
          <nav aria-label="Playback workspace">
            <a href="./" aria-current={!playlist ? "page" : undefined}>
              Playground
            </a>
            <a href="?playlist" aria-current={playlist ? "page" : undefined}>
              VOD playlist
            </a>
          </nav>
        </div>
      </header>
      <main className="playground">
        <h1 className="sr-only">
          {playlist ? "VOD playlist" : "Playback playground"}
        </h1>
        {children}
      </main>
    </>
  );
}
