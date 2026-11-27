import {
  createContext,
  useCallback,
  useContext,
  useId,
  useSyncExternalStore,
  type ReactNode,
  type RefObject,
} from "react";
import * as Popover from "@radix-ui/react-popover";

function mediaQuery(query: string) {
  const media = window.matchMedia(query);
  return [
    (update: () => void) => {
      media.addEventListener("change", update);
      return () => media.removeEventListener("change", update);
    },
    () => media.matches,
  ] as const;
}

const mobileScreen = mediaQuery("(max-width: 36rem)");
const compactInspector = mediaQuery("(width < 64rem)");
const videoCollisionPadding = { top: 12, right: 12, bottom: 0, left: 12 };

export const PlayerPortal = createContext<HTMLElement | null>(null);

export function useInspectorDock() {
  return !useSyncExternalStore(...compactInspector);
}

export function PlayerPanel({
  title,
  label = title,
  trigger = title,
  children,
  open,
  onOpenChange,
  side = "bottom",
  align = "start",
  anchor,
  collisionBoundary,
  sheetOnTablet = false,
  className = "panel-trigger",
}: {
  title: string;
  label?: string;
  trigger?: ReactNode;
  children: ReactNode;
  open?: boolean;
  onOpenChange?: (value: boolean) => void;
  side?: "top" | "bottom";
  align?: "start" | "end";
  anchor?: RefObject<HTMLElement | null>;
  collisionBoundary?: HTMLElement | null;
  sheetOnTablet?: boolean;
  className?: string;
}) {
  const container = useContext(PlayerPortal);
  const sheet = useSyncExternalStore(
    ...(sheetOnTablet ? compactInspector : mobileScreen),
  );
  const heading = useId();
  const fitSheet = useCallback(
    (node: HTMLDivElement | null) => {
      const viewport = window.visualViewport;
      if (!node || !viewport || !sheet) return;
      const fit = () => {
        const bottom = Math.max(
          0,
          window.innerHeight - viewport.height - viewport.offsetTop,
        );
        node.style.setProperty("--sheet-bottom", bottom + "px");
        node.style.setProperty("--sheet-height", viewport.height * 0.78 + "px");
      };
      fit();
      viewport.addEventListener("resize", fit);
      viewport.addEventListener("scroll", fit);
      return () => {
        viewport.removeEventListener("resize", fit);
        viewport.removeEventListener("scroll", fit);
      };
    },
    [sheet],
  );

  return (
    <Popover.Root modal={sheet} open={open} onOpenChange={onOpenChange}>
      {!sheet && anchor && <Popover.Anchor virtualRef={anchor} />}
      <Popover.Trigger aria-label={label} className={className} title={label}>
        {trigger}
      </Popover.Trigger>
      {container && (
        <Popover.Portal container={container}>
          <Popover.Content
            ref={fitSheet}
            aria-labelledby={heading}
            aria-modal={sheet || undefined}
            side={side}
            align={align}
            sideOffset={6}
            collisionPadding={
              !sheet && collisionBoundary ? videoCollisionPadding : 12
            }
            collisionBoundary={
              sheet ? undefined : (collisionBoundary ?? undefined)
            }
            className="player-panel"
            data-sheet={sheet ? "" : undefined}
          >
            <header className="panel-header">
              <h2 id={heading}>{title}</h2>
              <Popover.Close
                className="panel-close"
                aria-label={`Close ${title}`}
              >
                ×
              </Popover.Close>
            </header>
            <div className="panel-body">{children}</div>
          </Popover.Content>
        </Popover.Portal>
      )}
    </Popover.Root>
  );
}
