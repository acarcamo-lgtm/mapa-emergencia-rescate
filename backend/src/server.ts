import express from "express";
import { env, corsOrigins } from "@/config/env";
import { errorHandler } from "@/middleware";
import { missingRouter } from "@/routes/missing";
import { reportsRouter } from "@/routes/reports";
import { chatRouter } from "@/routes/chat";
import { hospitalsRouter } from "@/routes/hospitals";
import { donationsRouter } from "@/routes/donations";
import { patientsRouter } from "@/routes/patients";
import { geocodeRouter } from "@/routes/geocode";
import { geoRouter } from "@/routes/geo";
import { psychologyHelpRouter } from "@/routes/psychology-help";
import { contactRouter } from "@/routes/contact";
import { hubRouter } from "@/routes/hub";
import { syncRouter } from "@/routes/sync";
import { adminRouter } from "@/routes/admin";
import { opRouter } from "@/routes/op";

const app = express();

// Detrás del LB/Cloudflare: confiamos en el proxy para req.ip (fallback de
// clientIp). La cabecera de confianza real es cf-connecting-ip (ver client-ip.ts).
app.set("trust proxy", true);
app.disable("x-powered-by");

// CORS: solo orígenes del frontend permitidos. El frontend manda credenciales
// solo si hace falta; por ahora GET/POST públicos + cabeceras de admin/turnstile.
app.use((req, res, next) => {
  const origin = req.headers.origin;
  if (origin && corsOrigins.includes(origin)) {
    res.setHeader("Access-Control-Allow-Origin", origin);
    res.setHeader("Vary", "Origin");
    res.setHeader("Access-Control-Allow-Methods", "GET,POST,PATCH,DELETE,OPTIONS");
    res.setHeader(
      "Access-Control-Allow-Headers",
      "Content-Type, If-None-Match, x-admin-token, cf-turnstile-token, authorization",
    );
  }
  if (req.method === "OPTIONS") {
    res.status(204).end();
    return;
  }
  next();
});

// Límite de body por defecto; las rutas con foto suben su propio límite.
app.use(express.json({ limit: "256kb" }));

// Healthcheck para el LB de k8s (readinessProbe).
app.get("/api/readyz", (_req, res) => res.json({ ok: true }));

// Rutas. (Reference endpoint ahora; el resto las añade el workflow de port.)
app.use("/api/missing", missingRouter);
app.use("/api/reports", reportsRouter);
app.use("/api/chat", chatRouter);
app.use("/api/hospitals", hospitalsRouter);
app.use("/api/donations", donationsRouter);
app.use("/api/patients", patientsRouter);
app.use("/api/geocode", geocodeRouter);
app.use("/api/geo", geoRouter);
app.use("/api/stats/psychology-help", psychologyHelpRouter);
app.use("/api/contact", contactRouter);
app.use("/api/hub", hubRouter);
app.use("/api/sync", syncRouter);
app.use("/api/admin", adminRouter);
app.use("/api/op", opRouter);

// 404 JSON consistente para /api/*.
app.use("/api", (_req, res) => res.status(404).json({ error: "Ruta no encontrada." }));

// Error handler central (siempre el último middleware).
app.use(errorHandler);

app.listen(env.PORT, () => {
  console.log(`mapa-backend escuchando en :${env.PORT}`);
});
