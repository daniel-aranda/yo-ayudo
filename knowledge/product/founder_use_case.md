# Founder Use Case

## Objetivo Comercial

YoAyudo debe permitir vender bots de WhatsApp a negocios rapidamente.

El caso principal del founder es dar de alta un negocio, conectarle uno o mas numeros de WhatsApp y asignarles bots sin trabajo manual de ingenieria por cliente.

## Modelo Mental

1. `organization`
   - Representa al duenho o grupo empresarial.
   - Para muchos clientes pequenos, la organization sera el mismo negocio.

2. `account`
   - Representa un negocio dentro de la organization.
   - En el caso comun habra una organization con un account.
   - Si el mismo duenho tiene varios negocios, la organization tendra varios accounts.

3. `whatsapp_phone_numbers`
   - Cada account puede tener uno o varios numeros de WhatsApp.
   - Cada numero debe poder resolverse de forma directa desde `phone_number_id`.

4. `bots`
   - A cada numero se le asigna un bot activo.
   - El bot puede ser predefinido del sistema o custom.

5. `custom bots`
   - Un custom bot debe poder crearse casi con lenguaje humano.
   - El sistema debe convertir esa descripcion en configuracion estructurada en fases posteriores.

## Ruta Critica Para Vender

La ruta inicial para onboarding debe ser:

```text
organization -> account -> whatsapp_phone_number -> active bot assignment -> bot
```

`tenant`, `branch` y `bot_profile` siguen vivos como compatibilidad tecnica del runtime actual, pero no deben ser la ruta mental principal para vender o dar de alta clientes nuevos.

## Regla De Producto Fase 1

Un numero de WhatsApp tiene un solo bot activo asignado.

El modelo conserva historial de asignaciones para poder cambiar el bot de un numero sin perder trazabilidad, pero no implementa multiples bots activos por numero todavia.
