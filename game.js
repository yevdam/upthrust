(() => {
  "use strict";

  const canvas = document.getElementById("game");
  const ctx = canvas.getContext("2d", { alpha: false });
  const ui = {
    altitude: document.getElementById("altitude"), best: document.getElementById("best"), velocity: document.getElementById("velocity"),
    zone: document.getElementById("zone"), threat: document.getElementById("threat"), briefing: document.getElementById("briefing"),
    gameOver: document.getElementById("gameOver"), finalAltitude: document.getElementById("finalAltitude"), peakStat: document.getElementById("peakStat"),
    timeStat: document.getElementById("timeStat"), shieldStat: document.getElementById("shieldStat"), shieldStatus: document.getElementById("shieldStatus"),
    shieldTime: document.getElementById("shieldTime"), shieldBar: document.getElementById("shieldBar"), launchButton: document.getElementById("launchButton"),
    restartButton: document.getElementById("restartButton"), soundButton: document.getElementById("soundButton"), effectsButton: document.getElementById("effectsButton"),
    ticks: document.getElementById("altimeterTicks"), toast: document.getElementById("toast"), touchLeft: document.getElementById("touchLeft"),
    touchRight: document.getElementById("touchRight"), touchThrust: document.getElementById("touchThrust")
  };

  const TAU = Math.PI * 2;
  const WORLD_WIDTH = 900;
  const PX_PER_METER = 0.75;
  const keys = { left: false, right: false, thrust: false };
  const stars = [];
  const clouds = [];
  let dpr = 1, width = 0, height = 0, scale = 1, lastTime = performance.now(), accumulator = 0;
  let state = "briefing", reducedFx = false, soundOn = true, audio = null, thrustOsc = null, thrustGain = null;
  let cameraY = 0, shake = 0, generatedTo = 350, flightTime = 0, fieldsFound = 0, toastTimer = 0;
  let asteroids = [], powerups = [], particles = [], debris = [];
  let best = Number(localStorage.getItem("upthrust-best") || 0);

  const rocket = { x: 450, y: 39, vx: 0, vy: 0, angle: 0, angularV: 0, radius: 15, maxAltitude: 0, shield: 0, onGround: true };

  const clamp = (v, a, b) => Math.max(a, Math.min(b, v));
  const lerp = (a, b, t) => a + (b - a) * t;
  const random = (a, b) => a + Math.random() * (b - a);
  const formatAltitude = (n) => String(Math.max(0, Math.floor(n))).padStart(5, "0");
  const altitudeOf = (y) => Math.max(0, (y - 39) / PX_PER_METER);

  function zoneAt(alt) {
    if (alt < 1000) return { name: "TROPOSPHERE", threat: "LOW", color: "#8bc991" };
    if (alt < 2500) return { name: "STRATOSPHERE", threat: "ELEVATED", color: "#f4b34b" };
    if (alt < 5000) return { name: "MESOSPHERE", threat: "HIGH", color: "#ff7958" };
    return { name: "EXOSPHERE", threat: "SEVERE", color: "#ff5d35" };
  }

  function resize() {
    dpr = Math.min(window.devicePixelRatio || 1, 2);
    width = window.innerWidth; height = window.innerHeight;
    canvas.width = Math.round(width * dpr); canvas.height = Math.round(height * dpr);
    scale = width / WORLD_WIDTH;
    ctx.setTransform(dpr, 0, 0, dpr, 0, 0);
    seedBackdrop();
  }

  function seedBackdrop() {
    stars.length = 0; clouds.length = 0;
    const count = Math.floor(width * height / 7000);
    for (let i = 0; i < count; i++) stars.push({ x: Math.random() * width, y: Math.random() * height, r: random(.35, 1.45), p: random(.08, .52) });
    for (let i = 0; i < 14; i++) clouds.push({ x: random(-100, width + 100), y: random(0, height), w: random(130, 360), a: random(.025, .08), p: random(.4, .75) });
  }

  function reset() {
    Object.assign(rocket, { x: 450, y: 39, vx: 0, vy: 0, angle: 0, angularV: 0, maxAltitude: 0, shield: 0, onGround: true });
    asteroids = []; powerups = []; particles = []; debris = [];
    cameraY = 0; shake = 0; generatedTo = 350; flightTime = 0; fieldsFound = 0;
    generateWorld(2000);
    updateUi();
  }

  function launch() {
    if (state === "playing") return;
    reset(); state = "playing";
    ui.gameOver.hidden = true;
    ui.briefing.classList.add("leaving");
    setTimeout(() => { ui.briefing.hidden = true; ui.briefing.classList.remove("leaving"); }, 280);
    initAudio();
  }

  function endGame() {
    if (state !== "playing") return;
    state = "gameover"; stopThrustSound();
    burst(rocket.x, rocket.y, 44, "#ff6a3d", 230);
    burst(rocket.x, rocket.y, 24, "#f2eedf", 170);
    shake = 18;
    const peak = Math.floor(rocket.maxAltitude);
    if (peak > best) { best = peak; localStorage.setItem("upthrust-best", String(best)); }
    setTimeout(() => {
      ui.finalAltitude.textContent = `${peak.toLocaleString()} m`;
      ui.peakStat.textContent = `${peak.toLocaleString()} m`;
      ui.timeStat.textContent = `${flightTime.toFixed(1)} s`;
      ui.shieldStat.textContent = String(fieldsFound);
      ui.gameOver.hidden = false;
    }, 650);
  }

  function generateWorld(targetY) {
    while (generatedTo < targetY) {
      const alt = altitudeOf(generatedTo);
      const difficulty = clamp(alt / 6500, 0, 1);
      const gap = lerp(195, 88, difficulty) + random(-25, 38);
      generatedTo += gap;
      const count = Math.random() < lerp(.08, .48, difficulty) ? 2 : 1;
      for (let i = 0; i < count; i++) {
        const r = random(20, 42 + difficulty * 18);
        let x = random(r + 24, WORLD_WIDTH - r - 24);
        if (generatedTo < 600 && Math.abs(x - 450) < 150) x = x < 450 ? random(70, 250) : random(650, 830);
        const moving = alt > 1000 && Math.random() < lerp(.08, .55, difficulty);
        asteroids.push({ x, y: generatedTo + i * random(22, 50), r, vx: moving ? random(25, 70) * (Math.random() < .5 ? -1 : 1) : 0, vy: alt > 2600 && Math.random() < .28 ? random(-24, 18) : 0, rot: random(0, TAU), vr: random(-.7, .7), seed: Math.random() * 1000, hit: false });
      }
      if (alt > 450 && Math.random() < .022 + difficulty * .012) {
        powerups.push({ x: random(85, 815), y: generatedTo + random(70, 150), r: 18, phase: random(0, TAU), collected: false });
      }
    }
  }

  function update(dt) {
    if (toastTimer > 0) { toastTimer -= dt; if (toastTimer <= 0) ui.toast.classList.remove("show"); }
    updateParticles(dt);
    if (state !== "playing") return;
    flightTime += dt;

    const steer = (keys.right ? 1 : 0) - (keys.left ? 1 : 0);
    rocket.angularV += steer * 3.25 * dt;
    rocket.angularV += -rocket.angle * .7 * dt;
    rocket.angularV *= Math.pow(.26, dt);
    rocket.angle += rocket.angularV * dt;
    rocket.angle = clamp(rocket.angle, -1.18, 1.18);

    if (keys.thrust) {
      const thrust = 500;
      rocket.vx += Math.sin(rocket.angle) * thrust * dt;
      rocket.vy += Math.cos(rocket.angle) * thrust * dt;
      rocket.onGround = false;
      spawnExhaust(); startThrustSound();
    } else stopThrustSound();

    rocket.vy -= 168 * dt;
    rocket.vx *= Math.pow(.84, dt);
    rocket.vx = clamp(rocket.vx, -275, 275);
    rocket.vy = clamp(rocket.vy, -330, 410);
    rocket.x += rocket.vx * dt;
    rocket.y += rocket.vy * dt;

    if (rocket.y < 39) {
      rocket.y = 39; rocket.vy = Math.max(0, rocket.vy); rocket.vx *= .8; rocket.onGround = true;
      rocket.angle *= .8;
    }
    if (rocket.x < 19) { rocket.x = 19; rocket.vx = Math.abs(rocket.vx) * .42; shake = 5; }
    if (rocket.x > WORLD_WIDTH - 19) { rocket.x = WORLD_WIDTH - 19; rocket.vx = -Math.abs(rocket.vx) * .42; shake = 5; }

    const altitude = altitudeOf(rocket.y);
    rocket.maxAltitude = Math.max(rocket.maxAltitude, altitude);
    if (rocket.shield > 0) rocket.shield = Math.max(0, rocket.shield - dt);

    const targetCamera = Math.max(0, rocket.y - height / scale * .42);
    cameraY = lerp(cameraY, targetCamera, 1 - Math.pow(.0008, dt));
    generateWorld(cameraY + height / scale + 1100);

    for (const rock of asteroids) {
      rock.x += rock.vx * dt; rock.y += rock.vy * dt; rock.rot += rock.vr * dt;
      if (rock.x < -rock.r) rock.x = WORLD_WIDTH + rock.r;
      if (rock.x > WORLD_WIDTH + rock.r) rock.x = -rock.r;
      if (!rock.hit && circleHit(rocket.x, rocket.y, rocket.radius, rock.x, rock.y, rock.r * .82)) {
        if (rocket.shield > 0) {
          rocket.shield = 0; rock.hit = true; rock.r *= .75; rock.vx += rocket.vx * .45; rock.vy += rocket.vy * .3;
          burst(rocket.x, rocket.y, 34, "#75e5e8", 210); shake = 13; tone(140, .16, "sawtooth", .08); showToast("FORCEFIELD DISCHARGED");
        } else endGame();
      }
    }

    for (const power of powerups) {
      power.phase += dt * 2.2;
      if (!power.collected && circleHit(rocket.x, rocket.y, rocket.radius, power.x, power.y, power.r + 5)) {
        power.collected = true; rocket.shield = 15; fieldsFound++;
        burst(power.x, power.y, 22, "#75e5e8", 110); tone(620, .22, "sine", .06); showToast("FORCEFIELD ONLINE / 15 SEC");
      }
    }

    asteroids = asteroids.filter(a => a.y > cameraY - 500 && !a.hit);
    powerups = powerups.filter(p => p.y > cameraY - 300 && !p.collected);
    if (rocket.y < cameraY - 130) endGame();
    updateUi();
  }

  function circleHit(ax, ay, ar, bx, by, br) { const dx = ax - bx, dy = ay - by; return dx * dx + dy * dy < (ar + br) ** 2; }

  function spawnExhaust() {
    const count = reducedFx ? 1 : 3;
    for (let i = 0; i < count; i++) {
      const len = 25;
      particles.push({ x: rocket.x - Math.sin(rocket.angle) * len + random(-4,4), y: rocket.y - Math.cos(rocket.angle) * len + random(-3,3), vx: rocket.vx * .25 - Math.sin(rocket.angle) * random(40,100) + random(-25,25), vy: rocket.vy * .2 - Math.cos(rocket.angle) * random(130,245), life: random(.2,.5), max: .5, r: random(2,5), color: Math.random() < .45 ? "#fff1b0" : "#ff5d35" });
    }
  }

  function burst(x, y, count, color, speed) {
    if (reducedFx) count = Math.floor(count * .45);
    for (let i = 0; i < count; i++) {
      const a = random(0, TAU), s = random(speed * .25, speed);
      particles.push({ x, y, vx: Math.cos(a) * s, vy: Math.sin(a) * s, life: random(.35, .95), max: 1, r: random(1.5, 5), color });
    }
  }

  function updateParticles(dt) {
    for (const p of particles) { p.x += p.vx * dt; p.y += p.vy * dt; p.vx *= Math.pow(.8, dt); p.vy -= 42 * dt; p.life -= dt; p.r *= Math.pow(.45, dt); }
    particles = particles.filter(p => p.life > 0);
    shake *= Math.pow(.04, dt);
  }

  function updateUi() {
    const alt = rocket.maxAltitude, zone = zoneAt(alt);
    ui.altitude.textContent = formatAltitude(alt);
    ui.best.textContent = formatAltitude(Math.max(best, alt));
    ui.velocity.textContent = String(Math.round(Math.hypot(rocket.vx, rocket.vy) / PX_PER_METER)).padStart(3, "0");
    ui.zone.textContent = zone.name; ui.threat.textContent = zone.threat;
    document.querySelector(".status-dot").style.cssText = `background:${zone.color};box-shadow:0 0 8px ${zone.color}`;
    ui.shieldStatus.hidden = rocket.shield <= 0;
    if (rocket.shield > 0) { ui.shieldTime.textContent = `${rocket.shield.toFixed(1)}s`; ui.shieldBar.style.transform = `scaleX(${rocket.shield / 15})`; }
    drawTicks(alt);
  }

  function drawTicks(alt) {
    if (!ui.ticks.clientHeight) return;
    const h = ui.ticks.clientHeight, base = Math.floor(alt / 100) * 100;
    let html = "";
    for (let i = -5; i <= 5; i++) {
      const v = base + i * 100; if (v < 0) continue;
      const y = h / 2 - (v - alt) * .23;
      html += `<i class="tick ${v % 500 === 0 ? "major" : ""}" style="top:${y}px">${v % 500 === 0 ? `<span>${v}</span>` : ""}</i>`;
    }
    html += `<i class="tick current" style="top:${h/2}px"></i>`; ui.ticks.innerHTML = html;
  }

  function render(time) {
    ctx.setTransform(dpr, 0, 0, dpr, 0, 0);
    drawSky();
    ctx.save();
    const sx = shake ? random(-shake, shake) : 0, sy = shake ? random(-shake, shake) : 0;
    ctx.translate(sx, sy);
    ctx.scale(scale, scale);
    const viewH = height / scale;
    ctx.translate(0, viewH + cameraY);
    ctx.scale(1, -1);
    drawGround();
    for (const p of powerups) drawPowerup(p, time);
    for (const rock of asteroids) if (rock.y > cameraY - 100 && rock.y < cameraY + viewH + 100) drawAsteroid(rock);
    for (const p of particles) drawParticle(p);
    if (!(state === "gameover" && flightTime > 0)) drawRocket(time);
    ctx.restore();
    drawVignette();
  }

  function drawSky() {
    const alt = rocket.maxAltitude;
    const t = clamp(alt / 5500, 0, 1);
    const top = mixColor([18,57,78], [2,6,13], t), bottom = mixColor([37,92,112], [7,16,28], t);
    const grad = ctx.createLinearGradient(0,0,0,height); grad.addColorStop(0,top); grad.addColorStop(1,bottom);
    ctx.fillStyle = grad; ctx.fillRect(0,0,width,height);
    ctx.save(); ctx.globalAlpha = clamp((alt - 650) / 2000, 0, .9);
    for (const s of stars) { const y = ((s.y + cameraY * s.p * scale) % (height + 20)) - 10; ctx.fillStyle = `rgba(242,238,223,${.3 + s.r*.25})`; ctx.beginPath(); ctx.arc(s.x,y,s.r,0,TAU); ctx.fill(); }
    ctx.restore();
    ctx.save(); ctx.globalCompositeOperation = "screen";
    const cloudFade = clamp(1 - alt/2100, 0, 1);
    for (const c of clouds) { let y = (c.y + cameraY * c.p * scale) % (height + 200) - 100; const g = ctx.createRadialGradient(c.x,y,0,c.x,y,c.w*.55); g.addColorStop(0,`rgba(224,237,230,${c.a*cloudFade})`); g.addColorStop(1,"rgba(224,237,230,0)"); ctx.fillStyle=g; ctx.fillRect(c.x-c.w,y-c.w*.4,c.w*2,c.w*.8); }
    ctx.restore();
  }

  function drawGround() {
    ctx.fillStyle = "#101b1c"; ctx.beginPath(); ctx.moveTo(0,0);
    for (let x=0;x<=WORLD_WIDTH;x+=35) ctx.lineTo(x, 10 + Math.sin(x*.021)*7 + Math.sin(x*.067)*3);
    ctx.lineTo(WORLD_WIDTH,-80); ctx.lineTo(0,-80); ctx.closePath(); ctx.fill();
    ctx.strokeStyle = "rgba(242,238,223,.25)"; ctx.lineWidth=1; ctx.beginPath(); ctx.moveTo(325,13); ctx.lineTo(575,13); ctx.stroke();
    ctx.fillStyle="rgba(255,93,53,.55)"; for(let x=360;x<560;x+=35) ctx.fillRect(x,14,18,2);
  }

  function drawRocket(time) {
    ctx.save(); ctx.translate(rocket.x,rocket.y); ctx.rotate(-rocket.angle);
    if (rocket.shield > 0) {
      const pulse = 1 + Math.sin(time*.007)*.025; ctx.save(); ctx.scale(pulse,pulse);
      ctx.strokeStyle = `rgba(117,229,232,${.58 + Math.sin(time*.01)*.15})`; ctx.lineWidth=2; ctx.beginPath(); ctx.arc(0,2,29,0,TAU); ctx.stroke();
      ctx.strokeStyle="rgba(117,229,232,.17)"; ctx.lineWidth=7; ctx.beginPath(); ctx.arc(0,2,31,0,TAU); ctx.stroke(); ctx.restore();
    }
    ctx.fillStyle="#c9d1cc"; ctx.beginPath(); ctx.moveTo(0,24); ctx.bezierCurveTo(12,15,14,-8,10,-20); ctx.lineTo(-10,-20); ctx.bezierCurveTo(-14,-8,-12,15,0,24); ctx.fill();
    ctx.fillStyle="#f2eedf"; ctx.beginPath(); ctx.moveTo(0,24); ctx.bezierCurveTo(4,18,6,-4,4,-20); ctx.lineTo(-3,-20); ctx.bezierCurveTo(-6,-4,-5,18,0,24); ctx.fill();
    ctx.fillStyle="#ff5d35"; ctx.beginPath(); ctx.moveTo(-9,-9); ctx.lineTo(-18,-23); ctx.lineTo(-8,-20); ctx.closePath(); ctx.fill(); ctx.beginPath(); ctx.moveTo(9,-9); ctx.lineTo(18,-23); ctx.lineTo(8,-20); ctx.closePath(); ctx.fill();
    ctx.fillStyle="#173140"; ctx.beginPath(); ctx.arc(0,7,5,0,TAU); ctx.fill(); ctx.strokeStyle="#75e5e8"; ctx.lineWidth=1; ctx.stroke();
    ctx.fillStyle="#182226"; ctx.fillRect(-8,-22,16,5);
    ctx.restore();
  }

  function drawAsteroid(a) {
    ctx.save(); ctx.translate(a.x,a.y); ctx.rotate(a.rot);
    ctx.fillStyle="#3e4544"; ctx.strokeStyle="rgba(242,238,223,.16)"; ctx.lineWidth=1.4;
    ctx.beginPath(); const n=10;
    for(let i=0;i<n;i++){ const ang=i/n*TAU, rr=a.r*(.82+.16*Math.sin(a.seed+i*4.3)); const x=Math.cos(ang)*rr,y=Math.sin(ang)*rr; i?ctx.lineTo(x,y):ctx.moveTo(x,y); }
    ctx.closePath(); ctx.fill(); ctx.stroke();
    ctx.fillStyle="rgba(7,16,24,.35)"; ctx.beginPath(); ctx.ellipse(-a.r*.2,a.r*.18,a.r*.24,a.r*.15,.3,0,TAU); ctx.fill();
    ctx.beginPath(); ctx.ellipse(a.r*.28,-a.r*.15,a.r*.17,a.r*.12,-.4,0,TAU); ctx.fill(); ctx.restore();
  }

  function drawPowerup(p,time) {
    ctx.save(); ctx.translate(p.x,p.y); ctx.rotate(p.phase*.3);
    const pulse=1+Math.sin(time*.006+p.phase)*.12; ctx.scale(pulse,pulse);
    ctx.shadowColor="#75e5e8"; ctx.shadowBlur=18; ctx.strokeStyle="#75e5e8"; ctx.lineWidth=2;
    ctx.beginPath(); for(let i=0;i<6;i++){ const a=i/6*TAU-Math.PI/2,x=Math.cos(a)*p.r,y=Math.sin(a)*p.r; i?ctx.lineTo(x,y):ctx.moveTo(x,y); } ctx.closePath(); ctx.stroke();
    ctx.rotate(-p.phase*.65); ctx.beginPath(); ctx.arc(0,0,8,0,TAU); ctx.stroke(); ctx.beginPath(); ctx.moveTo(0,-5);ctx.lineTo(0,5);ctx.moveTo(-5,0);ctx.lineTo(5,0);ctx.stroke(); ctx.restore();
  }

  function drawParticle(p) { ctx.save(); ctx.globalAlpha=clamp(p.life/p.max,0,1); ctx.fillStyle=p.color; ctx.beginPath(); ctx.arc(p.x,p.y,Math.max(.4,p.r),0,TAU); ctx.fill(); ctx.restore(); }
  function drawVignette(){ const g=ctx.createRadialGradient(width/2,height/2,height*.2,width/2,height/2,Math.max(width,height)*.72);g.addColorStop(0,"rgba(0,0,0,0)");g.addColorStop(1,"rgba(0,0,0,.43)");ctx.fillStyle=g;ctx.fillRect(0,0,width,height); }
  function mixColor(a,b,t){return `rgb(${a.map((v,i)=>Math.round(lerp(v,b[i],t))).join(",")})`;}

  function frame(now) {
    const raw = Math.min((now-lastTime)/1000,.05); lastTime=now; accumulator+=raw;
    while(accumulator>=1/120){update(1/120);accumulator-=1/120;}
    render(now); requestAnimationFrame(frame);
  }

  function initAudio(){ if(!soundOn)return; try{ audio ||= new (window.AudioContext||window.webkitAudioContext)(); if(audio.state==="suspended")audio.resume(); }catch{} }
  function tone(freq,duration,type="sine",gain=.04){ if(!soundOn)return;initAudio();if(!audio)return;const o=audio.createOscillator(),g=audio.createGain();o.type=type;o.frequency.value=freq;g.gain.setValueAtTime(gain,audio.currentTime);g.gain.exponentialRampToValueAtTime(.001,audio.currentTime+duration);o.connect(g).connect(audio.destination);o.start();o.stop(audio.currentTime+duration); }
  function startThrustSound(){ if(!soundOn)return;initAudio();if(!audio||thrustOsc)return;thrustOsc=audio.createOscillator();thrustGain=audio.createGain();thrustOsc.type="sawtooth";thrustOsc.frequency.value=48;thrustGain.gain.value=.018;thrustOsc.connect(thrustGain).connect(audio.destination);thrustOsc.start(); }
  function stopThrustSound(){ if(thrustOsc){try{thrustOsc.stop();}catch{}thrustOsc=null;thrustGain=null;} }
  function showToast(message){ui.toast.textContent=message;ui.toast.classList.add("show");toastTimer=2.2;}

  function setKey(code, pressed) {
    if(code==="Space")keys.thrust=pressed;
    if(code==="ArrowLeft"||code==="KeyA")keys.left=pressed;
    if(code==="ArrowRight"||code==="KeyD")keys.right=pressed;
    if(pressed&&code==="Space"&&state==="briefing")launch();
    if(pressed&&code==="KeyR"&&state==="gameover")launch();
  }

  window.addEventListener("keydown", e=>{ if(e.repeat&&e.code==="KeyR")return; if(["Space","ArrowLeft","ArrowRight"].includes(e.code))e.preventDefault(); setKey(e.code,true); });
  window.addEventListener("keyup", e=>setKey(e.code,false));
  window.addEventListener("blur", ()=>{keys.left=keys.right=keys.thrust=false;stopThrustSound();});
  window.addEventListener("resize", resize);
  ui.launchButton.addEventListener("click",launch); ui.restartButton.addEventListener("click",launch);
  ui.soundButton.addEventListener("click",()=>{soundOn=!soundOn;ui.soundButton.setAttribute("aria-pressed",String(soundOn));if(!soundOn)stopThrustSound();else tone(440,.08);});
  ui.effectsButton.addEventListener("click",()=>{reducedFx=!reducedFx;ui.effectsButton.textContent=reducedFx?"FX LOW":"FX HIGH";ui.effectsButton.setAttribute("aria-pressed",String(reducedFx));});
  const bindTouch=(el,key)=>{ const on=e=>{e.preventDefault();keys[key]=true;if(state==="briefing")launch();};const off=e=>{e.preventDefault();keys[key]=false;};el.addEventListener("pointerdown",on);el.addEventListener("pointerup",off);el.addEventListener("pointercancel",off);el.addEventListener("pointerleave",off);};
  bindTouch(ui.touchLeft,"left");bindTouch(ui.touchRight,"right");bindTouch(ui.touchThrust,"thrust");

  resize(); reset(); requestAnimationFrame(frame);
})();
