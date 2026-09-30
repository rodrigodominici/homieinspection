# Acceso con Google (SSO) usando sus credenciales de Google Cloud

## Qué vamos a lograr

El equipo podrá entrar a la app con el botón **"Continuar con Google"** en la pantalla de acceso, usando sus cuentas corporativas de Homie. Se usará la app que ya crearon en Google Cloud (sus propias credenciales), no las credenciales genéricas.

## Cambios

### 1. Pantalla de acceso (`src/pages/Auth.tsx`)
- Agregar el botón "Continuar con Google" sobre el formulario de email/contraseña, con un separador visual ("o continúa con email").
- Al hacer clic se abre el flujo de Google y, al volver, el usuario entra a la app con su sesión.
- Mantener el acceso con email/contraseña y el recupero de contraseña tal como están.

### 2. Activación del proveedor Google
- Activar el inicio de sesión con Google en la plataforma (herramienta de configuración de acceso social) en el mismo cambio; sin esto el botón falla.

### 3. Sus credenciales de Google Cloud (paso del usuario)
Como quieren usar su propia app de Google Cloud:
1. En la consola de Google Cloud, en la pantalla de consentimiento OAuth, agregar los dominios autorizados: `*.lovable.app` y `app.inspection.homie.mx`.
2. En Credenciales → OAuth Client ID (aplicación web), agregar la URL de redirección que muestra la configuración de Google en Cloud → Usuarios → Configuración de autenticación → Google.
3. Copiar el **Client ID** y **Client Secret** en esa misma sección de la configuración de Lovable Cloud.

### 4. Restricción a cuentas corporativas (recomendado)
- Configurar el parámetro de dominio de Google (`hd`) para que solo puedan entrar cuentas de los dominios de Homie (homierent.com / homie.mx), evitando registros con cuentas personales de Gmail.

### 5. Convivencia con el flujo de aprobación
- La app exige aprobación de un admin para usuarios nuevos. Quien entre por primera vez con Google quedará pendiente de aprobación como cualquier registro nuevo; los usuarios existentes con el mismo email entrarán directo.

## Detalles técnicos

- Se usa `lovable.auth.signInWithOAuth("google", { redirect_uri: window.location.origin, extraParams: { hd, prompt: "select_account" } })` del módulo `@/integrations/lovable` (generado por la herramienta de configuración; no se edita a mano).
- `redirect_uri` queda en el origen de la app (no en una ruta protegida); la navegación al destino ocurre después de confirmada la sesión.
- Verificación: compilar y probar el botón en el preview (el flujo completo con Google requiere las credenciales cargadas en el paso 3).

## Fuera de alcance

- Quitar el acceso con email/contraseña (se mantiene como respaldo).
- Migrar usuarios existentes o cambiar roles.
