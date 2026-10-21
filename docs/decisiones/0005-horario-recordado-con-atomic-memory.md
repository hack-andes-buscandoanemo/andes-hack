# El horario habitual se recuerda en Atomic Memory solo si la persona lo pide

Cada vez que alguien abre **Buscar viaje**, el horario arranca en 7:30 a 8:30 a. m. Quien sale siempre a otra hora tiene que cambiarlo en cada búsqueda. Ahora puede tocar **Recordar este horario** y la próxima vez el formulario abre con su horario. En **Perfil** lo ve y lo puede olvidar.

## Qué se guarda y dónde

- Solo la hora de inicio y fin (`windowStart`, `windowEnd`). Ningún lugar: la búsqueda sigue sin guardar la dirección exacta.
- Se guarda en Atomic Memory (`POST /v1/memories/ingest/quick` sin extracción, `content_class: "summary"`), con `source_site: "te-jalo/commute-window"` y la hora en `metadata`. Se lee con `GET /v1/memories/list` y se borra con `DELETE /v1/memories/{id}`.
- El sujeto es `te-jalo:<id de la sesión>`. Sale de la sesión de `better-auth` en el servidor, nunca del cuerpo de la petición. La clave `ATOMICMEMORY_API_KEY` no sale del servidor.

## Por qué no una columna en `community_member`

Es una preferencia de comodidad, no un dato del dominio: no participa en el emparejamiento ni en las métricas. Tenerla fuera de la base deja intactos el esquema, las migraciones y el borrado de datos personales. La contra es depender de un servicio externo, y por eso la función es opcional.

## Cómo falla

- Sin `ATOMICMEMORY_API_URL` y `ATOMICMEMORY_API_KEY`, la opción no aparece y el formulario es el de siempre.
- Cada operación se corta a los 3 s. La búsqueda nunca espera a Atomic Memory.
- Al guardar uno nuevo, el anterior solo se borra después de confirmar el nuevo: tiene que volver un id y la lectura tiene que mostrar la misma hora. Si no se confirma, se le dice a la persona que no se pudo confirmar, y el horario anterior se queda. Si el nuevo se guardó pero el anterior no se pudo borrar, también se le dice.
- Una respuesta con un formato inesperado cuenta como falla, no como "no hay nada guardado".
- Olvidar se confirma leyendo de nuevo: un 2xx del borrado no basta si el registro sigue ahí.
- La URL tiene que ser HTTPS (HTTP solo hacia esta máquina), sin usuario, contraseña ni query, y las llamadas no siguen redirecciones, para que la clave no salga hacia otro host. Una configuración incompleta o inválida apaga solo esta función; el resto de la API arranca igual.
- Al borrar la cuenta (`DELETE /me`) se intenta olvidar el horario. Si Atomic Memory no confirma el borrado, la API responde 502 y conserva la cuenta para que la persona pueda reintentar. No se afirma que todos los datos fueron borrados mientras el horario siga en el proveedor.
