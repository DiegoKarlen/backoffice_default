Bingo — simplified (Backoffice)

---
OBJETIVO
Crear un ABM simple para configurar bingos con la mínima cantidad de campos.
---
ALCANCE
- Incluir: CRUD, activación/desactivación, premios por figura
- Excluir: lógica de juego, scheduler real, compra de cartones, pagos
---
LISTADO
Columnas:
- Sala (Room vinculado)
- Nombre del bingo (`name`)
- Tipo (75/90)
- Estado (ACTIVE/INACTIVE)
- Inicio (startDateTime)
- Repite (repeatEveryMinutes)
- Precio cartón (cardPrice)
- Mín. jugadores (minPlayersToStart)
Filtros:
- name (contiene, insensible a mayúsculas)
- roomId
- status
- bingoType
---
FORMULARIO
- roomId (Room)
- name (título del bingo)
- status
- bingoType
- startDateTime
- repeatEveryMinutes (opcional)
- cardPrice
- minPlayersToStart
- prizes[]: { figure, amount } (una por figura)

MODELO PRINCIPAL
- Bingo { id, roomId, name, status, bingoType, startDateTime, repeatEveryMinutes, cardPrice, minPlayersToStart }
- BingoPrize { id, bingoId, figure, amount }

BACKEND
Endpoints
GET    /backoffice/bingos
GET    /backoffice/bingos/:id
POST   /backoffice/bingos
PUT    /backoffice/bingos/:id
PATCH  /backoffice/bingos/:id/activate
PATCH  /backoffice/bingos/:id/deactivate
DELETE /backoffice/bingos/:id
Validaciones:
- repeatEveryMinutes >= 1 (si existe)
- cardPrice > 0
- minPlayersToStart >= 1
- al menos 1 premio, sin figuras duplicadas y amount > 0


MENU
Backoffice → sección "Juego" → "Bingos" (`admin-bingos.html`)

RESULTADO
ABM funcional de Bingo simplificado.
