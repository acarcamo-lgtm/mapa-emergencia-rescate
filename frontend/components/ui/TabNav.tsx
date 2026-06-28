"use client";

export interface TabDef<T extends string> {
  id: T;
  label: string;
  /** id del botón-tab (para aria-controls del panel). */
  tabId: string;
  /** id del panel controlado. */
  panelId: string;
}

interface TabNavProps<T extends string> {
  tabs: ReadonlyArray<TabDef<T>>;
  active: T;
  onSelect: (tab: T) => void;
  ariaLabel: string;
}

/**
 * Barra de pestañas presentacional (role=tablist). UI verbatim del carousel:
 * clases e-tab-label + data-active. Sin datos: solo controla la pestaña activa.
 */
export function TabNav<T extends string>({
  tabs,
  active,
  onSelect,
  ariaLabel,
}: TabNavProps<T>) {
  return (
    <div role="tablist" aria-label={ariaLabel} className="flex min-w-0">
      {tabs.map((tab) => (
        <button
          key={tab.id}
          type="button"
          role="tab"
          id={tab.tabId}
          aria-selected={active === tab.id}
          aria-controls={tab.panelId}
          data-active={active === tab.id}
          onClick={() => onSelect(tab.id)}
          className="e-tab-label flex flex-1 items-center justify-center"
        >
          {tab.label}
        </button>
      ))}
    </div>
  );
}
