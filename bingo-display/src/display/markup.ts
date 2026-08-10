export const DISPLAY_MARKUP = `
  <div class="bd-canvas sd--idle" id="bd-root">
    <div class="bd-fondo" aria-hidden="true"></div>

    <div class="bd-machine-cluster" aria-hidden="true">
      <div class="bd-glow bd-glow--bol"></div>
      <div class="bd-escenario bd-escenario--machine"></div>
      <div class="bd-bolillero-sombra"></div>
      <div class="bd-bolillero-wrap" id="bd-bolillero" data-mixing="0">
        <div class="bd-bolillero-inner">
          <img
            class="bd-bolillero bd-bolillero--main"
            src="/Bingo2/bolillero.png"
            alt=""
          />
          <img
            class="bd-bolillero bd-bolillero--reflect"
            src="/Bingo2/bolillero.png"
            alt=""
            aria-hidden="true"
          />
        </div>
      </div>
    </div>

    <section class="bd-live-stage sd-show-live" id="bd-live-stage" hidden aria-label="Transmisión en vivo">
      <div class="bd-live-video" id="bd-live-video">
        <span class="bd-live-video__label">TRANSMISIÓN EN VIVO</span>
      </div>
    </section>

    <div class="bd-fly" id="bd-fly-layer">
      <div class="bd-fly-spawn" id="bd-fly-spawn" hidden aria-hidden="true">
        <span class="bd-fly-spawn__dot"></span>
        <span class="bd-fly-spawn__dot"></span>
        <span class="bd-fly-spawn__dot"></span>
        <span class="bd-fly-spawn__dot"></span>
        <span class="bd-fly-spawn__dot"></span>
        <span class="bd-fly-spawn__dot"></span>
      </div>
      <img class="bd-fly-ball" id="bd-flying-ball-img" data-show="0" alt="" />
    </div>

    <div class="bd-current-hero sd-show-live" id="bd-current-hero" aria-label="Sorteo en vivo">
      <p class="bd-current-hero__title bd-faltan-line" id="bd-faltan-bolas">
        <span class="bd-faltan-bolas__label">FALTAN</span>
        <span class="bd-faltan-bolas__num mono" id="bd-faltan-count">—</span>
        <span class="bd-faltan-bolas__label">BOLAS</span>
      </p>
      <div class="bd-bola-actual" id="bd-current-disk">
        <img class="bd-bola-actual__img" id="bd-current-ball-img" hidden alt="" />
        <div id="bd-current-num" class="bd-bola-actual__num mono bd-bola-actual__num--ghost" aria-live="polite">—</div>
      </div>
    </div>

    <header class="bd-header">
      <div class="bd-brand">
        <span class="bd-brand__crown" aria-hidden="true">♛</span>
        <span class="bd-brand__text">BINGO</span>
      </div>
      <div class="bd-header__cluster">
        <div class="bd-hcard bd-hcard--live bd-live" id="bd-phase-live" data-active="0">
          <span class="bd-live__dot" id="bd-live-dot" data-on="0"></span>
          <span>EN VIVO</span>
        </div>
        <div class="bd-hcard bd-hcard--clock mono">
          <span class="bd-hcard__k">HORA</span>
          <span class="bd-hcard__v" id="bd-clock">00:00:00</span>
        </div>
        <div class="bd-hcard bd-hcard--meta sd-show-live">
          <span class="bd-hcard__k">SALA</span>
          <span class="bd-hcard__v mono" id="bd-room-line">—</span>
        </div>
        <div class="bd-hcard bd-hcard--meta sd-show-live">
          <span class="bd-hcard__k">BINGO</span>
          <span class="bd-hcard__v mono" id="bd-bingo-name">—</span>
        </div>
        <div class="bd-hcard bd-hcard--meta sd-show-live">
          <span class="bd-hcard__k">TIPO</span>
          <span class="bd-hcard__v mono" id="bd-bingo-type">—</span>
        </div>
        <div class="bd-hcard bd-hcard--meta sd-show-live">
          <span class="bd-hcard__k">PARTIDA</span>
          <span class="bd-hcard__v mono"><span id="bd-match-id">#—</span></span>
        </div>
        <div class="bd-hcard bd-hcard--next sd-show-live">
          <span class="bd-hcard__k">PRÓXIMO SORTEO EN</span>
          <span class="bd-hcard__v mono bd-hcard__v--gold" id="bd-next-cd">—</span>
        </div>
      </div>
    </header>

    <p class="bd-banner sd-next-banner" id="bd-next-banner" hidden></p>

    <section class="bd-idle sd-show-idle" aria-label="Próximo sorteo">
      <p class="bd-idle__kicker">Próximo sorteo</p>
      <p class="bd-idle__sala mono" id="bd-idle-sala">—</p>
      <p class="bd-idle__bingo mono" id="bd-idle-bingo">—</p>
      <p class="bd-idle__when mono" id="bd-idle-when"></p>
      <div class="bd-idle__cd mono" id="bd-idle-cd">—</div>
      <p class="bd-idle__sub">Tiempo restante para el inicio</p>
    </section>

    <aside class="bd-rail bd-rail--izq sd-show-live" aria-label="Premios">
      <div class="bd-rail-block">
        <h2 class="bd-rail-title">Premios</h2>
        <div class="bd-prizes-stack" id="bd-prizes"></div>
      </div>
    </aside>

    <aside class="bd-rail bd-rail--der sd-show-live" aria-label="Sorteo en vivo y próximos sorteos">
      <div class="bd-rail-der__ball-wrap">
        <div class="bd-live-ball-hero" id="bd-live-ball-hero" aria-label="Última bola sorteada">
          <div class="bd-bola-actual bd-live-bola-actual" id="bd-live-current-disk">
            <img class="bd-bola-actual__img" id="bd-live-current-ball-img" hidden alt="" />
            <div id="bd-live-current-num" class="bd-bola-actual__num mono bd-bola-actual__num--ghost" aria-live="polite">—</div>
          </div>
        </div>
      </div>
      <div class="bd-rail-der__upcoming">
        <h2 class="bd-rail-title">Próximos sorteos</h2>
        <div id="bd-upcoming-body"><p class="bd-muted">Cargando…</p></div>
      </div>
    </aside>

    <section class="bd-historial-panel sd-show-live" aria-label="Últimas bolas">
      <h3 class="bd-historial-panel__title">ÚLTIMAS BOLAS</h3>
      <div class="bd-historial-panel__strip">
        <div id="bd-history" class="bd-historial-panel__row"></div>
      </div>
    </section>

    <div class="bd-bingo-close" aria-hidden="true">
      <div class="bd-bingo-close__veil"></div>
      <div class="bd-bingo-close__content">
        <p class="bd-bingo-close__title">Sorteo finalizado</p>
        <p class="bd-bingo-close__sub">Gracias por jugar</p>
      </div>
    </div>

    <div id="bd-round-intro" class="bd-round-intro" hidden aria-hidden="true">
      <div class="bd-round-intro__backdrop" aria-hidden="true"></div>
      <div class="bd-round-intro__center">
        <span id="bd-round-intro-num" class="bd-round-intro__num mono" aria-live="assertive"></span>
      </div>
    </div>

    <div id="bd-prize-toast" class="bd-prize-toast" hidden aria-live="polite" aria-atomic="true">
      <div class="bd-prize-toast__panel">
        <span id="bd-prize-toast-badge" class="bd-prize-toast__badge">¡PREMIO LINEA!</span>
        <div id="bd-prize-toast-detail">
          <div id="bd-prize-toast-entries" class="bd-prize-toast__entries"></div>
        </div>
      </div>
    </div>
  </div>
`;
