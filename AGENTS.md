# AGENTS.md

Guía operativa para agentes de código que trabajen en este repositorio. Esta
guía sigue el patrón de contexto portable descrito en
[Harness Engineering](https://openai.com/index/harness-engineering/): dejar aquí
las reglas que un agente necesita antes de editar.

## Antes de tocar código

- Lee `README.md`, `CONTRIBUTING.md` y el archivo que vas a modificar.
- Si el cambio toca arquitectura, sincronización, datos o flujos públicos,
  revisa también `docs/README.md` y los ADR/RFC relacionados.
- Si el cambio toca UI pública, estilos, layout, componentes visuales o copy de
  experiencia, revisa `docs/design/DESIGN.md` antes de editar y conserva sus tokens
  y criterios como fuente de verdad visual.
- Trabaja desde una rama nueva basada en `main`. Si no eres maintainer, usa el
  flujo fork-first descrito en `CONTRIBUTING.md`.
- No reescribas historial, no borres ramas ajenas y no reviertas cambios que no
  hiciste.
- Mantener el proyecto operativo vale más que una refactorización amplia. Haz
  cambios pequeños, revisables y con una razón clara.

## Seguridad y privacidad

Este proyecto opera en contexto humanitario. GitHub es público y no debe usarse
como canal de emergencia ni como base de datos de personas afectadas.

- Nunca publiques en código, issues, PRs, fixtures o capturas: teléfonos,
  correos personales, documentos de identidad, direcciones privadas completas,
  coordenadas sensibles no publicadas, notas médicas, fotos privadas, hashes de
  fotos reales, secretos, tokens o credenciales.
- No inventes datos reales. Para ejemplos y pruebas usa datos anónimos,
  sintéticos y claramente marcados como demo.
- No confirmes ni elimines reportes reales desde automatizaciones sin
- instrucciones explícitas de un maintainer.
- Si encuentras una vulnerabilidad o fuga de datos, no abras una issue pública.
  Sigue `SECURITY.md`.
- La información de rescate, desaparición, hospitales y acopio debe tratarse
  como sensible aunque ya sea visible en la web.

## Stack y comandos

- Framework: Next.js 16 con App Router y React 19.
- Lenguaje: TypeScript con `strict: true`.
- Datos: Neon Postgres con fallback local/en memoria cuando no hay
  `DATABASE_URL`.
- Mapas: Leaflet/OpenStreetMap.
- Analítica: OpenPanel cuando las variables públicas están configuradas.
- Package manager preferido para este repo: `npm` (hay `package-lock.json`).

Comandos útiles:

```bash
npm install
npm run dev
npm run lint
npm run build
```

> Importante: Next.js 16 puede tener APIs distintas a versiones anteriores.
> Antes de tocar rutas, metadata, server components, acciones, cache o config,
> consulta la documentación local instalada en `node_modules/next/dist/docs/`.

## Convenciones de implementación

- Mantén las validaciones de entrada en el servidor. No confíes en validaciones
  solo del cliente.
- Usa respuestas de error visibles y accionables. No silencieces fallos ni
  devuelvas éxito cuando la escritura no se guardó.
- Evita `as any`, casts innecesarios y helpers duplicados. Busca primero si ya
  existe una función en `lib/`.
- Conserva los límites de rate-limit, cache y tamaño de payload salvo que el PR
  explique el riesgo operativo.
- No serialices objetos completos de entrada hacia respuestas públicas. Expone
  solo campos permitidos.
- Si agregas variables de entorno, actualiza `.env.example` y documenta donde
  se usan.
- Si agregas endpoints o cambios de datos, documenta el contrato o el runbook en
  `docs/`.

### Acceso a datos (Drizzle ORM)

- Todo el acceso a la base va por **Drizzle**, no SQL crudo. Importa el helper
  central: `import { getDb, hasDbEnv, schema } from "@/lib/drizzle"`.
- El esquema es la **fuente de verdad** en `infra/db/schema.ts`. NO crees tablas
  en runtime (`CREATE TABLE IF NOT EXISTS`). Si cambias el esquema:
  1. edita `infra/db/schema.ts`,
  2. corre `npm run db:generate` (genera el `.sql` en `infra/db/migrations/`),
  3. commitea el `.sql` + el journal. El Job `migrate` lo aplica en cada deploy
     (idempotente). Las migraciones deben ser **expand-contract** (compatibles
     con el código viejo, que sigue sirviendo durante el roll).
- Para SQL que el query builder no expresa (CTEs, trigram, FILTER), usa el
  escape `sql\`...\`` de drizzle-orm; preserva la semántica exacta.

### Crear un endpoint — patrón OBLIGATORIO

Todo route en `app/api/**` DEBE seguir este patrón. `npm run endpoints:check`
(corre en `prebuild` y CI) FALLA el build si no se cumplen las reglas duras.

**Reglas DURAS (rompen el build):**

1. **Handler `async`.** Siempre `export async function GET|POST|...`, nunca
   `export function`. Los handlers hacen I/O.
2. **Nada de I/O largo de terceros inline.** Prohibido `export const maxDuration`.
   Si el trabajo tarda (crawl, geocode, reporte pesado, llamada a IA/API
   externa), se ENCOLA en una cola BullMQ y el handler devuelve `202 {jobId}`;
   el cliente consulta el estado por status-poll. Patrón:
   `worker/sourcesSync.queue.ts` + `app/api/sync/run/route.ts` +
   `app/api/sync/status/route.ts`.
3. **Nada de llamadas síncronas bloqueantes** (`readFileSync`, `execSync`, …) en
   el request path; usa variantes async o muévelo a un worker.
4. **Bloque `@swagger`** sobre el primer handler (ver abajo).

**Reglas RECOMENDADAS (avisos, con excepción vía `// endpoint-check: ok`):**

5. **Lecturas:** awaits independientes en paralelo con `Promise.all` (no en
   cascada). GET público polleado → `cached(key, ttl, fn)` + `jsonWithEtag(...)`
   (corto-circuito 304). Ejemplos: `app/api/reports`, `app/api/missing`,
   `app/api/chat`.
6. **Escrituras / mutaciones:** valida en servidor (`readJson` + `BODY_LIMIT_*`),
   y protege con auth (`isAdminRequest` / token POC) o `checkRateLimit(clientIp(...))`.
   Si persistes la IP, hashéala con `hashIp(request)` (NUNCA IP cruda).
7. **No serialices el objeto completo** a respuestas públicas; expón solo los
   campos permitidos (allowlist de DTO).

### Documentar el endpoint (OpenAPI/Swagger) — OBLIGATORIO

Cada route en `app/api/**` se auto-registra en la doc Swagger **solo si lleva un
bloque JSDoc `@swagger`** encima del primer handler exportado. Al crear o
modificar un endpoint:

1. Agrega/actualiza el bloque `@swagger` (OpenAPI 3.0 en YAML) sobre el primer
   `export async function GET|POST|...`. Documenta TODOS los métodos del archivo.
2. Referencia los modelos compartidos con `$ref: '#/components/schemas/<Modelo>'`
   (definidos en `lib/swagger.ts`: EmergencyReport, MissingPerson, Hospital,
   HospitalPatient, Donation, DonationStats, ChatMessage, MissingMapMarker,
   MissingStats, Error). Si tu endpoint devuelve un DTO nuevo, agrégalo ahí.
3. La spec se genera en build (`prebuild` → `scripts/gen-openapi.mts` →
   `public/openapi.json`) y se sirve en **`/api/docs`** (Swagger UI) y
   `/api/openapi` (JSON). Verifica local: `npm run openapi` y revisa el conteo
   de paths. Un endpoint sin `@swagger` NO aparece en la doc.
4. **Enforcement:** `npm run endpoints:check` (corre en `prebuild` y en CI) FALLA
   el build si un `route.ts` no tiene `@swagger` (o viola las reglas duras de
   arriba). No se puede mergear un endpoint sin documentar ni fuera de patrón.

Guía completa con ejemplo: `docs/guides/documentar-endpoints-openapi.md`.

## Mapa rápido del repo

```text
app/                     Rutas, páginas, componentes y API routes de Next.js
app/components/          UI pública y formularios
app/api/                 Superficie HTTP pública/admin/sync
lib/                     Tipos, acceso a datos, cache, sync, rate-limit, helpers
docs/                    RFCs, ADRs, arquitectura y guías operativas
design/                  Sistema visual, tokens y criterios en DESIGN.md
scripts/                 Importaciones y tareas manuales
public/                  Imágenes, iconos, service worker y assets estáticos
.github/                 Templates, workflows y automatización de GitHub
```

## Documentación

- Escribe documentación en español.
- Usa Markdown con líneas razonablemente cortas para diffs legibles.
- Cambios grandes propuestos antes de construir van en `docs/rfcs/`.
- Decisiones ya tomadas van en `docs/adr/`.
- Guías de operación van en `docs/guides/`.
- Si agregas docs nuevas, actualiza `docs/README.md` cuando corresponda.

## Pull requests

Antes de abrir o actualizar un PR:

- Enlaza la issue que rastrea el trabajo, o explica por qué el cambio es
  pequeño y no la necesita.
- Incluye capturas o video si cambia UI pública.
- Marca los comandos ejecutados (`npm run lint`, `npm run build`, pruebas
  manuales) o explica por qué no aplican.
- Describe cualquier impacto en privacidad, datos de crisis, performance,
  cache, variables de entorno, despliegue o migraciones.
- Mantén el PR enfocado. Si aparecen cambios vecinos, abre issues separadas.
