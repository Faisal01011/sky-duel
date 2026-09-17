export class UIManager {
  private overlay: HTMLElement;
  private healthBar!: HTMLElement;
  private healthText!: HTMLElement;
  private scoreEl!: HTMLElement;
  private aliveEl!: HTMLElement;
  private speedEl!: HTMLElement;
  private altEl!: HTMLElement;
  private playersEl!: HTMLElement;
  private logEl!: HTMLElement;
  private crosshair!: HTMLElement;
  private minimap!: HTMLCanvasElement;
  private minimapCtx!: CanvasRenderingContext2D;
  private flashTimeout: number | null = null;

  private health = 100;
  private score = 0;
  private alive = true;

  // References for minimap plotting (set externally)
  private getLocalPos: (() => { x: number; z: number; yaw: number }) | null = null;
  private getRemotes: (() => Map<string, { targetPos: { x: number; z: number }, health: number }>) | null = null;

  constructor() {
    this.overlay = document.getElementById("ui-overlay") as HTMLElement;
    if (!this.overlay) {
      this.overlay = document.createElement("div");
      this.overlay.id = "ui-overlay";
      document.body.appendChild(this.overlay);
    }
    this.buildHUD();
  }

  private buildHUD() {
    this.overlay.style.pointerEvents = "none";
    this.overlay.innerHTML = `
      <style>
        #hud-root { position:absolute; inset:0; font-family: monospace; color:#fff; text-shadow:0 1px 2px #000; }
        .hud-top { position:absolute; top:12px; left:12px; right:12px; display:flex; justify-content:space-between; pointer-events:none; }
        .hud-panel { background:rgba(0,0,0,0.45); border:1px solid rgba(255,255,255,0.15); padding:8px 12px; border-radius:8px; backdrop-filter:blur(6px); }
        .hud-health-wrap { position:absolute; bottom:18px; left:12px; width:260px; }
        .hud-health-bar { width:100%; height:18px; background:rgba(255,255,255,0.15); border-radius:9px; overflow:hidden; border:1px solid rgba(255,255,255,0.2); }
        .hud-health-fill { height:100%; width:100%; background:linear-gradient(90deg,#2ecc71,#27ae60); transition: width 0.18s ease, background 0.2s; }
        .hud-crosshair { position:absolute; left:50%; top:50%; transform:translate(-50%,-50%); width:28px; height:28px; pointer-events:none; }
        .hud-crosshair::before,.hud-crosshair::after{content:""; position:absolute; background:#fff; opacity:0.85; }
        .hud-crosshair::before{ left:50%; top:0; width:2px; height:100%; transform:translateX(-50%); }
        .hud-crosshair::after{ top:50%; left:0; height:2px; width:100%; transform:translateY(-50%); }
        .hud-crosshair-dot{ position:absolute; left:50%; top:50%; width:6px; height:6px; background:#ff3b30; border-radius:50%; transform:translate(-50%,-50%); border:1px solid #fff; }
        .hud-log { position:absolute; bottom:18px; right:12px; width:300px; max-height:160px; overflow:hidden; display:flex; flex-direction:column; gap:4px; font-size:12px; }
        .hud-log-entry{ background:rgba(0,0,0,0.5); padding:4px 6px; border-radius:4px; animation: fadeIn 0.2s; }
        .hud-minimap{ position:absolute; top:12px; left:50%; transform:translateX(-50%); border:1px solid rgba(255,255,255,0.2); border-radius:50%; background:rgba(0,20,40,0.55); }
        .hud-controls{ position:absolute; bottom:18px; left:50%; transform:translateX(-50%); font-size:11px; opacity:0.7; text-align:center; }
        @keyframes flashRed { 0%{background:rgba(255,0,0,0.35)} 100%{background:transparent} }
      </style>
      <div id="hud-root">
        <div class="hud-top">
          <div class="hud-panel" id="hud-score">Score: 0 • Alive • Players: 1</div>
          <div class="hud-panel" id="hud-flight">SPD 0 • ALT 0</div>
        </div>
        <canvas id="hud-minimap" class="hud-minimap" width="140" height="140"></canvas>
        <div class="hud-crosshair"><div class="hud-crosshair-dot"></div></div>
        <div class="hud-health-wrap">
          <div style="font-size:12px; margin-bottom:4px; display:flex; justify-content:space-between;"><span>HEALTH</span><span id="hud-health-text">100</span></div>
          <div class="hud-health-bar"><div id="hud-health-fill" class="hud-health-fill"></div></div>
        </div>
        <div id="hud-log" class="hud-log"></div>
        <div class="hud-controls">War Thunder: W/S Throttle • A/D Roll • Q/E Yaw • Mouse/↑↓ Pitch • LMB/Space Fire • RMB Free-look • Wheel Throttle</div>
      </div>
    `;
    this.healthBar = document.getElementById("hud-health-fill") as HTMLElement;
    this.healthText = document.getElementById("hud-health-text") as HTMLElement;
    this.scoreEl = document.getElementById("hud-score") as HTMLElement;
    this.speedEl = document.getElementById("hud-flight") as HTMLElement;
    this.logEl = document.getElementById("hud-log") as HTMLElement;
    this.crosshair = document.querySelector(".hud-crosshair") as HTMLElement;
    this.minimap = document.getElementById("hud-minimap") as HTMLCanvasElement;
    this.minimapCtx = this.minimap.getContext("2d")!;
    // alt and players are inside score/flight
  }

  update(dt: number) {
    this.drawMinimap();
  }

  setHealth(v: number) {
    this.health = Math.max(0, Math.min(100, v));
    this.healthText.textContent = String(Math.round(this.health));
    this.healthBar.style.width = `${this.health}%`;
    if (this.health < 30) this.healthBar.style.background = "linear-gradient(90deg,#e74c3c,#c0392b)";
    else if (this.health < 60) this.healthBar.style.background = "linear-gradient(90deg,#f39c12,#e67e22)";
    else this.healthBar.style.background = "linear-gradient(90deg,#2ecc71,#27ae60)";
  }

  setScore(v: number) {
    this.score = v;
    this.refreshScore();
  }

  setAlive(alive: boolean) {
    this.alive = alive;
    this.refreshScore();
  }

  setPlayers(count: number, remotes?: Map<string, any>) {
    this.refreshScore(count);
  }

  private refreshScore(count?: number) {
    const players = count ?? 1;
    this.scoreEl.textContent = `Score: ${this.score} • ${this.alive ? "Alive" : "DOWNED"} • Players: ${players}`;
  }

  setFlightInfo(speed: number, alt: number, throttle?: number) {
    if (this.speedEl) {
      const thr = throttle !== undefined ? ` • THR ${Math.round(throttle*100)}%` : "";
      this.speedEl.textContent = `SPD ${Math.round(speed)} • ALT ${Math.round(alt)}${thr}`;
    }
  }

  flashDamage() {
    const root = document.getElementById("hud-root");
    if (!root) return;
    root.style.animation = "flashRed 0.18s";
    setTimeout(() => root.style.animation = "", 180);
    // Crosshair pulse
    if (this.crosshair) {
      this.crosshair.style.transform = "translate(-50%,-50%) scale(1.25)";
      setTimeout(()=> this.crosshair.style.transform="translate(-50%,-50%) scale(1)",150);
    }
  }

  addLog(msg: string) {
    const entry = document.createElement("div");
    entry.className = "hud-log-entry";
    entry.textContent = msg;
    this.logEl.prepend(entry);
    while (this.logEl.children.length > 6) this.logEl.removeChild(this.logEl.lastChild!);
    setTimeout(()=> { if(entry.parentNode) entry.style.opacity="0.6"; }, 2500);
  }

  setMinimapSource(getLocal: () => { x: number; z: number; yaw: number }, getRemotes: () => Map<string, any>) {
    this.getLocalPos = getLocal;
    this.getRemotes = getRemotes;
  }

  private drawMinimap() {
    if (!this.minimapCtx || !this.getLocalPos) return;
    const ctx = this.minimapCtx;
    const W = this.minimap.width, H = this.minimap.height;
    ctx.clearRect(0,0,W,H);
    // Background
    ctx.fillStyle = "rgba(10,30,50,0.9)";
    ctx.beginPath(); ctx.arc(W/2,H/2, W/2-1, 0, Math.PI*2); ctx.fill();
    ctx.strokeStyle = "rgba(255,255,255,0.15)";
    ctx.lineWidth = 1.2;
    ctx.stroke();
    // Grid
    ctx.strokeStyle = "rgba(255,255,255,0.08)";
    ctx.beginPath();
    ctx.moveTo(W/2, 0); ctx.lineTo(W/2, H);
    ctx.moveTo(0, H/2); ctx.lineTo(W, H/2);
    ctx.stroke();

    const range = 1000; // world half size
    const toMini = (x: number, z: number) => {
      const mx = W/2 + (x / range) * (W/2 - 6);
      const mz = H/2 + (z / range) * (H/2 - 6);
      return { mx, mz };
    };

    // Remotes red
    if (this.getRemotes) {
      const remotes = this.getRemotes();
      for (const [, rp] of remotes) {
        const pos = (rp as any).targetPos ?? rp; // handle different shapes
        if (pos && typeof pos.x === "number") {
          const { mx, mz } = toMini(pos.x, pos.z);
          ctx.fillStyle = (rp as any).alive === false ? "#555" : "#ff3b30";
          ctx.beginPath(); ctx.arc(mx, mz, 3.5, 0, Math.PI*2); ctx.fill();
          ctx.strokeStyle = "#fff"; ctx.lineWidth = 0.8; ctx.stroke();
        }
      }
    }

    // Local green
    const local = this.getLocalPos();
    if (local) {
      const { mx, mz } = toMini(local.x, local.z);
      ctx.fillStyle = "#2ecc71";
      ctx.beginPath(); ctx.arc(mx, mz, 4.5, 0, Math.PI*2); ctx.fill();
      ctx.strokeStyle = "#fff"; ctx.lineWidth = 1; ctx.stroke();
      // Heading
      ctx.strokeStyle = "#2ecc71";
      ctx.lineWidth = 1.4;
      ctx.beginPath();
      ctx.moveTo(mx, mz);
      const len = 10;
      ctx.lineTo(mx + Math.sin(local.yaw) * len, mz + Math.cos(local.yaw) * len);
      ctx.stroke();
    }
  }
}
