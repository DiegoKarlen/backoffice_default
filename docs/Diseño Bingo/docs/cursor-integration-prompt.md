# Prompt para Cursor: integrar assets de Bingo Broadcast

Usá los assets de esta carpeta para implementar o mejorar la pantalla pública del sorteo de Bingo.

Objetivo visual:
- Pantalla full-screen tipo broadcast/TV.
- Tema oscuro premium.
- Bolillero central.
- Bola actual destacada.
- Animación de bola cayendo desde el bolillero hacia el conducto.
- Lista de próximos sorteos a la derecha.
- Premios y métricas a la izquierda.
- Historial de últimas bolas abajo.

Restricciones:
- No mostrar cartones de jugador.
- No mostrar chat.
- No permitir modificar velocidad.
- No agregar controles administrativos.
- La pantalla es solo lectura.

Assets:
- Fondo: `backgrounds/bingo-broadcast-bg-1920x1080.webp`
- Bolillero: `bolillero/bolillero-transparent-1100x850.png`
- Conducto overlay: `bolillero/tube-overlay-transparent-1100x850.png`
- Bolas numeradas: `balls/numbered/ball-XX.png`
- Partículas: `effects/particles-overlay-1920x1080.png`

Implementación:
1. Crear componente `BingoBroadcastDisplay`.
2. Usar layout CSS grid: izquierda métricas/premios, centro bolillero + bola actual + últimas bolas, derecha próximos sorteos.
3. Renderizar bolillero como imagen absoluta.
4. Animar la bola nueva cuando llega `ballDrawn`.
5. La bola debe recorrer una trayectoria curva y terminar visible en el conducto.
6. Después de la animación, actualizar bola actual e historial.
7. Usar coordenadas relativas para pantalla completa.

Referencia:
```ts
const trajectory = [
  { x: 756, y: 565 },
  { x: 758, y: 620 },
  { x: 746, y: 682 },
  { x: 718, y: 750 },
  { x: 686, y: 818 },
];
```
