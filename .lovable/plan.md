# Recupero de contraseña

## Qué se agrega
Hoy el único camino si alguien olvida su contraseña es pedirle a un Admin que la cambie desde Usuarios. Agregamos el flujo self-service en dos pasos:

1. **Login (/auth):** enlace "¿Olvidaste tu contraseña?" bajo el campo de contraseña. Al tocarlo, se pide el email y se envía el correo de recuperación con enlace a la app. Mensaje de confirmación neutro (no revela si el email existe o no).
2. **Página de nueva contraseña (/reset-password):** al abrir el enlace del correo, el usuario define una contraseña nueva (con confirmación y mínimo 8 caracteres) y queda dentro de la app. Redirige a su pantalla principal según rol.

## Detalles técnicos
- `src/pages/Auth.tsx`: modo "olvidé mi contraseña" (mismo form o paso extra) que llama `supabase.auth.resetPasswordForEmail(email, { redirectTo: \`${window.location.origin}/reset-password\` })`. Toast de confirmación: "Te enviamos un correo para restablecer tu contraseña".
- Nueva `src/pages/ResetPassword.tsx`: ruta pública `/reset-password` en `src/App.tsx`. Valida `type=recovery` en el hash; si falta, redirige a `/auth`. Formulario de nueva contraseña que llama `supabase.auth.updateUser({ password })` (sin `current_password`, es sesión de recovery). Al éxito, toast y `Navigate` a `/` (el redirect por rol hace el resto).
- La plantilla de correo `recovery` ya existe (scaffold de notify.homierent.com) con branding Homie; no se toca. Si el envío de correos aún está pendiente de verificación del dominio, los correos salen recién cuando esté verificado — se verifica el estado antes de probar el envío real.
- Verificación con Playwright: enlace visible en /auth, flujo de envío, y /reset-password renderiza el formulario.
