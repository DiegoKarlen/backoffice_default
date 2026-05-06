# Bingo Broadcast Asset Pack

Assets iniciales para la pantalla pública/broadcast del sorteo de Bingo.

## Archivos principales

- backgrounds/bingo-broadcast-bg-1920x1080.png
- backgrounds/bingo-broadcast-bg-1920x1080.webp
- bolillero/bolillero-transparent-1100x850.png
- bolillero/tube-overlay-transparent-1100x850.png
- balls/numbered/ball-01.png a ball-75.png
- balls/base/ball-base-*.png
- balls/falling-ball-47-demo-512.png
- effects/glow-purple-512.png
- effects/glow-gold-512.png
- effects/particles-overlay-1920x1080.png
- layout/layout-reference-1920x1080.png

## Capas recomendadas

1. Fondo general.
2. Paneles UI con CSS.
3. Bolillero PNG transparente.
4. Bola animada cayendo por encima del conducto.
5. Overlay del conducto.
6. Historial de bolas.
7. Panel de próximos sorteos.

## Trayectoria inicial 1920x1080

```ts
const trajectory = [
  { x: 756, y: 565 },
  { x: 758, y: 620 },
  { x: 746, y: 682 },
  { x: 718, y: 750 },
  { x: 686, y: 818 },
];

const ballDropDurationMs = 900;
const easing = 'cubic-bezier(0.22, 1, 0.36, 1)';
```

## Reglas de producto

- Pantalla solo broadcast.
- No mostrar cartones de jugador.
- No mostrar chat.
- No permitir modificar velocidad de sorteo.
- La velocidad viene del backend.
- La bola nueva se anima cuando llega el evento `ballDrawn`.
