# Estándar de componentes frontend (v2)

Reglas OBLIGATORIAS para todo componente nuevo o refactorizado. El objetivo:
**velocidad de carga, limpieza, modularización y buenas prácticas** consistentes.

## 1. Capas y responsabilidad única
- **Datos** → hooks en `hooks/<dominio>.ts` (TanStack Query). NUNCA `fetch` +
  `setInterval` + `setState` a mano en un componente.
- **UI presentacional** → `components/ui/*` (sin datos, solo props): Card, Modal,
  SearchInput, Pagination, ChipFilter, TabNav, ErrorBox, SuccessBox, Spinner.
- **Componentes de feature** → `components/features/<dominio>/*`: orquestan hooks
  + UI. Un archivo = una responsabilidad. NINGÚN componente > ~250 líneas; si
  crece, se divide.

## 2. Datos (TanStack Query)
- `useQuery` con `queryKey` de `lib/query-keys.ts` (NUNCA array inline → dedup).
- `queryFn` usa `apiGet(path, signal)` de `lib/api.ts`. Mutaciones: `apiSend` +
  `useMutation` + `invalidateQueries(qk.<dominio>.all)` en `onSuccess`.
- Polling: `refetchInterval` (el client ya pausa en background). Listas
  paginadas: `placeholderData: (prev) => prev` (sin parpadeo).
- Reusar hooks existentes (`useMissingList`, etc.) antes de crear uno nuevo.

## 3. Velocidad de carga (PRIORIDAD)
- **Code-splitting:** lo pesado (mapas Leaflet, modales grandes, vistas no
  iniciales) va con `next/dynamic` + `ssr:false` cuando aplica. El bundle inicial
  solo carga lo visible above-the-fold.
- **Lazy de imágenes:** `loading="lazy"` + tamaños explícitos (evita layout shift).
- **Memoización donde paga:** `React.memo` en items de lista (tarjetas), `useMemo`
  para derivaciones caras, `useCallback` para handlers pasados a hijos memoizados.
  No memoizar por reflejo — solo donde hay re-render real.
- **Identidad estable:** TanStack `structuralSharing` ya evita re-render si los
  datos no cambian; no romperlo mapeando a objetos nuevos en el render.
- **Debounce** de inputs de búsqueda y de eventos de alta frecuencia (p.ej.
  bounds del mapa) — ~300-400ms — para no disparar requests por cada tecla/pan.

## 4. Limpieza / buenas prácticas
- TypeScript estricto: nada de `any`, sin casts innecesarios. Tipos en el hook.
- Sin estado derivable: si se puede calcular en render, no es `useState`.
- Accesibilidad: `aria-label` en botones-icono, foco manejado en modales, `alt`
  en imágenes. (El proyecto es humanitario — la a11y no es opcional.)
- Nada de lógica de negocio en JSX; extraer a helpers puros.
- Sin dependencias nuevas salvo que se pida.

## 5. Preservar (NO romper)
- **El UI debe verse IDÉNTICO.** Copiar el JSX/Tailwind verbatim; solo cambia el
  cableado de datos y la división en módulos.
- **La cola offline (IndexedDB) de EmergencyApp se preserva TAL CUAL.** Es
  crítica: gente reporta sin señal en una emergencia. NO migrar a TanStack, NO
  "limpiar" su lógica de reintento. Aislarla en su módulo y dejarla intacta.
- Mismos endpoints, params y campos de respuesta (contrato idéntico).

## 6. Estructura objetivo por feature
```
components/features/<dominio>/
  index.tsx              # contenedor: compone hooks + subcomponentes
  <Algo>Card.tsx         # presentacional, React.memo
  <Algo>List.tsx
  <Algo>Modal.tsx
  ...
hooks/<dominio>.ts       # queries + mutations
```
