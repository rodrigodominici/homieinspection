## Problema

Los 12 documentos de handoff se generaron en `/mnt/documents/handoff/` en una sesión anterior, pero al intentar abrirlos te pide login. Esto pasa porque:

1. En la sesión anterior los archivos se crearon, pero **no se emitieron tags `<lov-artifact>`** dentro del chat — por lo que no aparecen como tarjetas descargables/previsualizables en la conversación.
2. Cualquier intento de abrirlos por una URL del proyecto (`id-preview…lovable.app/...`) cae en el guard de `ProtectedRoute` y te manda a `/auth`. Los `.md` no son rutas servidas por la app.

Es un problema de entrega, no de contenido. Los archivos siguen ahí.

## Plan

### 1. Re-emitir cada documento como artifact accesible

Volver a publicar los 12 archivos existentes con tags `<lov-artifact>` en el chat, uno por documento:

- `README.md` (índice)
- `00_Homie_Inspection_Technical_Overview.md`
- `01_Frontend_Architecture_and_Flows.md`
- `02_Database_Model_and_Backend.md`
- `03_Auth_Roles_Security_RLS.md`
- `04_Edge_Functions_and_Internal_APIs.md`
- `05_Integrations_and_External_Contracts.md`
- `06_Publishing_and_Public_Report_Model.md`
- `07_Operations_Monitoring_Runbooks.md`
- `08_Technical_Debt_Risks_Pending_Decisions.md`
- `09_Environment_Secrets_Access_Checklist.md`
- `Handoff_Readiness_Assessment.md`

Mime: `text/markdown`. Cada uno se podrá previsualizar y descargar desde el chat sin pedir login.

### 2. Empaquetar todo en un solo entregable

Generar dos artifacts adicionales para facilitar el handoff a un equipo externo:

- `Homie_Handoff_Package.zip` — todos los `.md` agrupados, listo para enviar a un tech lead.
- `Homie_Handoff_Package.pdf` — un único PDF consolidado (índice + todos los documentos concatenados con saltos de página) para lectura lineal sin necesidad de un visor de Markdown.

Ambos quedan en `/mnt/documents/handoff/` y se entregan como `<lov-artifact>`.

### 3. QA visual del PDF

Convertir cada página del PDF consolidado a imagen y revisar layout, cortes de texto, encabezados y tabla de contenidos antes de entregarlo. Si hay problemas (texto cortado, code blocks rotos), ajustar el script de generación y regenerar.

## Lo que NO se va a hacer

- No se tocará el código de la app ni las rutas de auth — el bloqueo de login en `ProtectedRoute` es correcto y debe quedarse.
- No se servirán los `.md` desde `public/` de la app (mezcla docs internos con la app pública).
- No se reescribirá el contenido de los documentos. Si después de leerlos quieres ajustes, se hacen como pase aparte.

## Resultado esperado

Vas a ver en el chat:
- 12 tarjetas individuales (una por documento) — clicables, sin login.
- 1 tarjeta `.zip` con el paquete completo.
- 1 tarjeta `.pdf` consolidado.
- Un resumen corto de qué se entregó y cómo usarlo.