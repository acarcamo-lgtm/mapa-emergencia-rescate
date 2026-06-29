CREATE TABLE "coord_kinds" (
	"key" text PRIMARY KEY NOT NULL,
	"label" text NOT NULL,
	"icono" text NOT NULL,
	"categoria" text NOT NULL,
	"campos" jsonb DEFAULT '[]'::jsonb NOT NULL,
	"moviliza_con" jsonb DEFAULT '[]'::jsonb NOT NULL,
	"es_pieza_de_mision" boolean DEFAULT true NOT NULL,
	"orden" integer DEFAULT 0 NOT NULL
);
--> statement-breakpoint
CREATE TABLE "coord_recursos" (
	"id" text PRIMARY KEY NOT NULL,
	"kind" text NOT NULL,
	"estado" text DEFAULT 'disponible' NOT NULL,
	"nombre_contacto" text NOT NULL,
	"whatsapp" text NOT NULL,
	"zona" text,
	"atributos" jsonb DEFAULT '{}'::jsonb NOT NULL,
	"created_at" bigint NOT NULL
);
--> statement-breakpoint
ALTER TABLE "coord_recursos" ADD CONSTRAINT "coord_recursos_kind_coord_kinds_key_fk" FOREIGN KEY ("kind") REFERENCES "public"."coord_kinds"("key") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
CREATE INDEX "idx_coord_recursos_estado" ON "coord_recursos" USING btree ("estado","created_at" DESC NULLS LAST);--> statement-breakpoint
-- Seed del registro de tipos (reference data; idempotente). Lenguaje venezolano.
INSERT INTO "coord_kinds" ("key","label","icono","categoria","campos","moviliza_con","es_pieza_de_mision","orden") VALUES
('maquina','Maquinaria pesada','tractor','maquinaria','[{"key":"tipo_equipo","label":"Tipo de equipo","placeholder":"retroexcavadora, gandola, volqueta","required":true},{"key":"descripcion","label":"Descripción","placeholder":"capacidad, año, estado","required":false}]','["flete","combustible","operador"]',true,10),
('grua','Grúa','construction','maquinaria','[{"key":"capacidad","label":"Capacidad de izaje","placeholder":"25 t, 50 t","required":true},{"key":"detalle","label":"Detalle","placeholder":"alcance, con operador","required":false}]','["flete","combustible","operador"]',true,20),
('operador','Operador / maquinista','hard-hat','personas','[{"key":"especialidad","label":"Especialidad","placeholder":"retroexcavadora, grúa","required":true},{"key":"experiencia","label":"Experiencia","placeholder":"años, equipos que maneja","required":false}]','["transporte"]',true,30),
('voluntarios','Voluntarios','hand-helping','personas','[{"key":"cantidad","label":"¿Cuántos?","placeholder":"ej: 5 personas","required":true},{"key":"detalle","label":"Detalle","placeholder":"disponibilidad, qué pueden hacer","required":false}]','["transporte"]',true,40),
('ingeniero','Ingeniero estructural','ruler','personas','[{"key":"detalle","label":"Detalle","placeholder":"experiencia en evaluación de daños","required":true}]','["transporte"]',true,50),
('flete','Flete / carga','truck','transporte','[{"key":"capacidad","label":"Capacidad","placeholder":"gandola, camión, plataforma para máquina","required":true},{"key":"zona_operacion","label":"Zona de operación","placeholder":"hasta dónde puede llegar","required":false}]','[]',true,60),
('transporte','Transporte de personas','bus','transporte','[{"key":"capacidad","label":"Capacidad","placeholder":"buseta, camioneta","required":true},{"key":"zona_operacion","label":"Zona de operación","placeholder":"hasta dónde puede llegar","required":false}]','[]',true,70),
('combustible','Combustible','fuel','energia','[{"key":"tipo_combustible","label":"Tipo","placeholder":"gasoil, gasolina","required":true},{"key":"detalle","label":"Cantidad","placeholder":"litros, o pago en estación","required":false}]','[]',true,80),
('generador','Planta eléctrica','zap','energia','[{"key":"potencia","label":"Potencia","placeholder":"5 kVA, 100 kVA","required":true},{"key":"detalle","label":"Detalle","placeholder":"combustible que usa, autonomía","required":false}]','["flete","combustible"]',true,90),
('cisterna_agua','Agua / cisterna','droplets','agua','[{"key":"capacidad","label":"Capacidad","placeholder":"camión cisterna, pipa de agua","required":true},{"key":"detalle","label":"Detalle","placeholder":"¿potable?, frecuencia","required":false}]','["flete","combustible"]',true,100),
('montacargas','Montacargas','forklift','maquinaria','[{"key":"capacidad","label":"Capacidad","placeholder":"2 t, 5 t","required":true},{"key":"detalle","label":"Detalle","placeholder":"eléctrico/diésel, con operador","required":false}]','["flete","combustible","operador"]',true,25),
('soldador','Soldador / herrería de campo','flame','personas','[{"key":"detalle","label":"Detalle","placeholder":"equipo que trae, experiencia","required":true}]','["transporte"]',true,55),
('planta_potabilizadora','Planta potabilizadora','droplets','agua','[{"key":"capacidad","label":"Capacidad","placeholder":"litros por hora","required":true},{"key":"detalle","label":"Detalle","placeholder":"tipo, autonomía","required":false}]','["flete","combustible"]',true,105),
('internet_satelital','Internet satelital (Starlink)','satellite','conectividad','[{"key":"detalle","label":"Detalle","placeholder":"Starlink, cantidad de equipos, cobertura","required":true}]','[]',true,130),
('compresor','Compresor neumático','construction','maquinaria','[{"key":"capacidad","label":"Capacidad/caudal","placeholder":"CFM, con martillos","required":true},{"key":"detalle","label":"Detalle","placeholder":"herramientas que trae","required":false}]','["flete","combustible"]',true,26),
('mecanico','Mecánico de campo','wrench','personas','[{"key":"detalle","label":"Detalle","placeholder":"qué repara (hidráulica, diésel), herramientas","required":true}]','["transporte"]',true,56),
('electricista','Electricista','zap','personas','[{"key":"detalle","label":"Detalle","placeholder":"experiencia, baja/media tensión","required":true}]','["transporte"]',true,57),
('vehiculo_4x4','Vehículo 4x4 / rústico','truck','transporte','[{"key":"capacidad","label":"Capacidad","placeholder":"camioneta 4x4, pickup","required":true},{"key":"zona_operacion","label":"Zona de operación","placeholder":"hasta dónde llega","required":false}]','[]',true,72),
('lancha','Lancha / embarcación','ship','transporte','[{"key":"capacidad","label":"Capacidad","placeholder":"personas/carga, tipo","required":true},{"key":"detalle","label":"Detalle","placeholder":"zona costera","required":false}]','["flete","combustible"]',true,74),
('torre_iluminacion','Torre de iluminación','lightbulb','energia','[{"key":"detalle","label":"Detalle","placeholder":"potencia, autonomía, combustible","required":true}]','["flete","combustible"]',true,95),
('bomba_achique','Bomba de achique','droplets','agua','[{"key":"capacidad","label":"Capacidad","placeholder":"caudal, pulgadas","required":true},{"key":"detalle","label":"Detalle","placeholder":"eléctrica/combustión","required":false}]','["flete","combustible"]',true,102),
('banos_quimicos','Baños químicos / sanitarios','toilet','saneamiento','[{"key":"cantidad","label":"¿Cuántos?","placeholder":"ej: 10 unidades","required":true},{"key":"detalle","label":"Detalle","placeholder":"con mantenimiento","required":false}]','["flete"]',true,108),
('radio','Radiocomunicación (radios)','radio','conectividad','[{"key":"detalle","label":"Detalle","placeholder":"HF/VHF, cantidad, alcance","required":true}]','[]',true,132),
('rescate_usar','Equipo de rescate / USAR','life-buoy','rescate','[{"key":"detalle","label":"Detalle","placeholder":"personal, herramientas de corte/apuntalamiento","required":true}]','["transporte"]',true,140),
('perros_rescate','Perros de búsqueda y rescate','dog','rescate','[{"key":"detalle","label":"Detalle","placeholder":"binomios, certificación","required":true}]','["transporte"]',true,141),
('drone','Drone (búsqueda/mapeo)','drone','rescate','[{"key":"detalle","label":"Detalle","placeholder":"cámara térmica, mapeo, autonomía","required":true}]','[]',true,142)
ON CONFLICT ("key") DO NOTHING;
