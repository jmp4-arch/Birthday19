import * as THREE from "https://cdn.skypack.dev/three@0.139.1/build/three.module";

const canvas = document.querySelector("#canvas");
const introScreen = document.querySelector("#intro-screen");
const recordPlayer = document.querySelector("#record-player");
const recordHint = document.querySelector(".record-hint");
const music = document.querySelector("#music");
const volumeSlider = document.querySelector("#volume-slider");
const progress = document.querySelector("#progress");
const progressFill = document.querySelector("#progress-fill");
const flowerArea = document.querySelector("#flower-area");
const nextArea = document.querySelector("#next-area");
const nextHeading = document.querySelector("#next-heading");
const calendarNextButton = document.querySelector("#calendar-next-button");
const afterCalendar = document.querySelector("#after-calendar");
const afterCalendarHeading = document.querySelector("#after-calendar-heading");
const afterCake = document.querySelector("#after-cake");
const afterCakeHeading = document.querySelector("#after-cake-heading");
const letterArea = document.querySelector("#letter-area");
const letterHeading = document.querySelector("#letter-heading");
const letterBackButton = document.querySelector("#letter-back-button");
const letterEnvelope = document.querySelector("#letter-envelope");
const birthdayLetterModal = document.querySelector("#birthday-letter-modal");
const letterModalClose = document.querySelector("#letter-modal-close");
const micLightStatus = document.querySelector("#mic-light-status");
const micLevelFill = document.querySelector("#mic-level-fill");
const skipButton = document.querySelector("#skip-button");
let renderLoopActive = false;
let currentStage = "intro";
let cakeAnimationStarted = false;
let microphoneStream = null;
let mediaPermissionPromise = null;
let mediaPermissionIssue = "";
let candleListeningStarted = false;
let audioContext = null;
let audioAnalyser = null;
let silentMonitorGain = null;
let microphoneInputGain = null;

music.volume = Number(volumeSlider.value);
volumeSlider.addEventListener("input", () => {
  music.volume = Number(volumeSlider.value);
});

function showFlowers() {
  if (currentStage !== "intro") return;
  currentStage = "flowers";
  introScreen.hidden = true;
  flowerArea.hidden = false;
  updateSize();
  startRenderLoop();
  skipButton.textContent = "Skip flowers";
}

skipButton.addEventListener("click", () => {
  if (currentStage === "intro") showFlowers();
  else if (currentStage === "flowers") moveToNextArea();
});

calendarNextButton.addEventListener("click", moveToAfterCalendar);
afterCake.addEventListener("click", moveToLetter);
afterCake.addEventListener("keydown", (event) => {
  if (event.key === "Enter" || event.key === " ") {
    event.preventDefault();
    moveToLetter();
  }
});
letterBackButton.addEventListener("click", returnToBirthday);

letterEnvelope.addEventListener("click", () => {
  letterEnvelope.classList.add("is-open");
  window.setTimeout(() => {
    birthdayLetterModal.hidden = false;
    letterModalClose.focus({ preventScroll: true });
  }, 650);
});

function closeBirthdayLetter() {
  birthdayLetterModal.hidden = true;
  letterEnvelope.focus({ preventScroll: true });
}

letterModalClose.addEventListener("click", closeBirthdayLetter);
birthdayLetterModal.addEventListener("click", (event) => {
  if (event.target === birthdayLetterModal) closeBirthdayLetter();
});
document.addEventListener("keydown", (event) => {
  if (event.key === "Escape" && !birthdayLetterModal.hidden) closeBirthdayLetter();
});

function beginExperience() {
  if (recordPlayer.disabled) return;
  recordPlayer.disabled = true;

  music.currentTime = 0;
  music.play().then(() => {
    introScreen.classList.add("is-playing");
    recordHint.textContent = "Now playing";

    window.setTimeout(() => {
      if (currentStage !== "intro") return;
      introScreen.classList.add("is-leaving");
      window.setTimeout(showFlowers, 900);
    }, 1600);
  }).catch(() => {
    recordPlayer.disabled = false;
    recordHint.textContent = "Could not load the music — click to retry";
  });
}

recordPlayer.addEventListener("click", beginExperience);
window.addEventListener("pagehide", () => {
  music.pause();
});

const fragmentShader = `
  uniform float u_ratio;
  uniform float u_moving;
  uniform float u_stop_time;
  uniform float u_speed;
  uniform vec2 u_stop_randomizer;
  uniform float u_started;
  uniform vec2 u_point;
  uniform sampler2D u_texture;
  varying vec2 vUv;

  // Floral palette annotations: rose #f6829f, blush #ffbbc2, pale #ffdddd,
  // sage #8b9c80, and light sage #bcceac.
  const vec3 PALETTE_ROSE = vec3(0.965, 0.510, 0.624);
  const vec3 PALETTE_BLUSH = vec3(1.000, 0.733, 0.761);
  const vec3 PALETTE_PALE = vec3(1.000, 0.867, 0.867);
  const vec3 PALETTE_SAGE = vec3(0.545, 0.612, 0.502);
  const vec3 PALETTE_SAGE_LIGHT = vec3(0.737, 0.808, 0.675);

  float rand(vec2 n) {
    return fract(sin(dot(n, vec2(12.9898, 4.1414))) * 43758.5453);
  }

  float noise(vec2 n) {
    const vec2 d = vec2(0.0, 1.0);
    vec2 b = floor(n);
    vec2 f = smoothstep(vec2(0.0), vec2(1.0), fract(n));
    return mix(
      mix(rand(b), rand(b + d.yx), f.x),
      mix(rand(b + d.xy), rand(b + d.yy), f.x),
      f.y
    );
  }

  float flower_shape(vec2 point, float size, float outline, float thickness, float noisePower, float angleOffset) {
    float randomByUv = noise(vUv);
    float petalsNumber = 5.0 + floor(u_stop_randomizer.x * 4.0);
    float animatedOffset = 0.7 * (randomByUv - 0.5) / (0.2 + 30.0 * u_stop_time);
    float flowerAngle = atan(point.y, point.x) - animatedOffset;
    float sectorShape = abs(sin(flowerAngle * 0.5 * petalsNumber + angleOffset)) + thickness * 0.5;
    vec2 sizeRange = vec2(4.0, 18.0);
    float radialShape = length(point) * (sizeRange.x + sizeRange.y * u_stop_randomizer.x);
    radialShape += noisePower * sin(flowerAngle * 13.0 + 15.0 * randomByUv);

    float growth = 1.0 / max(min(20000.0 * u_stop_time, 1.0), 0.0001);
    float shape = 1.0 - smoothstep(0.0, size * sectorShape, outline * growth * radialShape);
    shape *= 1.0 - u_moving;
    shape *= 1.0 - step(1.0, u_stop_time);
    return shape;
  }

  void main() {
    if (u_started < 0.5) {
      gl_FragColor = vec4(PALETTE_PALE, 1.0);
      return;
    }

    vec3 base = texture2D(u_texture, vUv).rgb;
    vec2 cursor = vUv - u_point;
    cursor.x *= u_ratio;

    vec3 stemColor = mix(PALETTE_SAGE, PALETTE_SAGE_LIGHT, 0.45 + 0.35 * u_stop_randomizer.x);
    float stemRadius = 0.005 * u_speed * u_moving;
    float stemShape = 1.0 - pow(smoothstep(0.0, max(stemRadius, 0.0001), dot(cursor, cursor)), 0.03);
    vec3 stem = stemShape * stemColor;

    vec3 flowerColor = mix(PALETTE_ROSE, PALETTE_BLUSH, step(0.38, u_stop_randomizer.y));
    flowerColor = mix(flowerColor, PALETTE_PALE, step(0.76, u_stop_randomizer.y));
    vec3 flowerNew = flowerColor * flower_shape(cursor, 1.0, 0.96, 1.0, 0.15, 0.0);
    vec3 flowerMask = 1.0 - vec3(flower_shape(cursor, 1.05, 1.07, 1.0, 0.15, 0.0));
    vec3 flowerMid = PALETTE_ROSE * flower_shape(cursor, 0.15, 1.0, 2.0, 0.1, 1.9);

    vec3 color = base * flowerMask + flowerNew + flowerMid + stem;
    gl_FragColor = vec4(clamp(color, vec3(0.0), vec3(1.0)), 1.0);
  }
`;

const vertexShader = `
  varying vec2 vUv;
  void main() {
    vUv = uv;
    gl_Position = vec4(position, 1.0);
  }
`;

const pointer = {
  x: 0.5,
  y: 0.5,
  previousX: 0.5,
  previousY: 0.5,
  moved: false,
  speed: 0,
  started: false,
};

const completionThreshold = 0.90;
let transitionStarted = false;
const coverage = { columns: 0, rows: 0, cells: new Uint8Array(), filled: 0 };
const clock = new THREE.Clock();
const sceneShader = new THREE.Scene();
const sceneBasic = new THREE.Scene();
const camera = new THREE.OrthographicCamera(-1, 1, 1, -1, 0, 10);
const renderer = new THREE.WebGLRenderer({
  canvas,
  alpha: false,
  antialias: true,
  preserveDrawingBuffer: true,
});
renderer.setPixelRatio(Math.min(window.devicePixelRatio || 1, 2));
renderer.setClearColor(0xf6f0e8, 1);

const renderTargets = [
  new THREE.WebGLRenderTarget(1, 1, { depthBuffer: false, stencilBuffer: false }),
  new THREE.WebGLRenderTarget(1, 1, { depthBuffer: false, stencilBuffer: false }),
];

const shaderMaterial = new THREE.ShaderMaterial({
  uniforms: {
    u_stop_time: { value: 0 },
    u_point: { value: new THREE.Vector2(pointer.x, 1 - pointer.y) },
    u_moving: { value: 0 },
    u_speed: { value: 0 },
    u_stop_randomizer: { value: new THREE.Vector2(Math.random(), Math.random()) },
    u_started: { value: 0 },
    u_ratio: { value: window.innerWidth / window.innerHeight },
    u_texture: { value: null },
  },
  vertexShader,
  fragmentShader,
});

const basicMaterial = new THREE.MeshBasicMaterial({ map: null });
const planeGeometry = new THREE.PlaneGeometry(2, 2);
sceneShader.add(new THREE.Mesh(planeGeometry, shaderMaterial));
sceneBasic.add(new THREE.Mesh(planeGeometry, basicMaterial));

function resetCoverageGrid() {
  coverage.columns = 144;
  coverage.rows = Math.max(72, Math.round(coverage.columns * window.innerHeight / window.innerWidth));
  coverage.cells = new Uint8Array(coverage.columns * coverage.rows);
  coverage.filled = 0;
  updateProgress(0);
}

function clearTargets() {
  renderer.setRenderTarget(null);
  renderer.setClearColor(0xf6f0e8, 1);
  for (const target of renderTargets) {
    renderer.setRenderTarget(target);
    renderer.clear(true, true, true);
  }
  renderer.setRenderTarget(null);
}

function updateSize() {
  const width = Math.max(1, window.innerWidth);
  const height = Math.max(1, window.innerHeight);
  const pixelRatio = Math.min(window.devicePixelRatio || 1, 2);
  renderer.setPixelRatio(pixelRatio);
  renderer.setSize(width, height, false);
  for (const target of renderTargets) {
    target.setSize(Math.round(width * pixelRatio), Math.round(height * pixelRatio));
  }
  shaderMaterial.uniforms.u_ratio.value = width / height;
  clearTargets();
  resetCoverageGrid();
}

function updateProgress(value) {
  const percent = Math.min(100, Math.floor(value * 100));
  progressFill.style.width = `${percent}%`;
  progress.setAttribute("aria-valuenow", String(percent));

  if (value >= completionThreshold) moveToNextArea();
}

function moveToNextArea() {
  if (transitionStarted) return;
  transitionStarted = true;
  currentStage = "transitioning";
  skipButton.hidden = true;
  flowerArea.classList.add("is-completing");
  window.setTimeout(() => {
    flowerArea.hidden = true;
    nextArea.hidden = false;
    currentStage = "calendar";
    requestAnimationFrame(() => nextArea.classList.add("is-visible"));
    nextHeading.focus({ preventScroll: true });
  }, 700);
}

function moveToAfterCalendar() {
  if (currentStage !== "calendar") return;
  requestMediaPermissions();
  currentStage = "transitioning";
  nextArea.classList.remove("is-visible");

  window.setTimeout(() => {
    nextArea.hidden = true;
    afterCalendar.hidden = false;
    requestAnimationFrame(() => {
      afterCalendar.classList.add("is-visible");
      playCakeAnimation();
      startCandleListening();
    });
    currentStage = "cake";
    afterCalendarHeading.focus({ preventScroll: true });
  }, 700);
}

function moveToAfterCake() {
  if (currentStage !== "candle-blown") return;
  currentStage = "transitioning";
  afterCalendar.classList.remove("is-visible");

  window.setTimeout(() => {
    afterCalendar.hidden = true;
    afterCake.hidden = false;
    requestAnimationFrame(() => afterCake.classList.add("is-visible"));
    currentStage = "after-cake";
    afterCakeHeading.focus({ preventScroll: true });
  }, 650);
}

function moveToLetter() {
  if (currentStage !== "after-cake") return;
  currentStage = "transitioning";
  afterCake.classList.remove("is-visible");
  window.setTimeout(() => {
    afterCake.hidden = true;
    letterArea.hidden = false;
    requestAnimationFrame(() => letterArea.classList.add("is-visible"));
    currentStage = "letter";
    letterHeading.focus({ preventScroll: true });
  }, 650);
}

function returnToBirthday() {
  if (currentStage !== "letter") return;
  currentStage = "transitioning";
  letterArea.classList.remove("is-visible");
  window.setTimeout(() => {
    letterArea.hidden = true;
    afterCake.hidden = false;
    requestAnimationFrame(() => afterCake.classList.add("is-visible"));
    currentStage = "after-cake";
    afterCakeHeading.focus({ preventScroll: true });
  }, 650);
}

function playCakeAnimation() {
  if (cakeAnimationStarted) return;
  cakeAnimationStarted = true;

  const cake = afterCalendar;
  if (!window.gsap) {
    cake.querySelector(".cake-greeting").style.transform = "scale(1)";
    return;
  }

  const gsap = window.gsap;
  const timeline = gsap.timeline({ defaults: { ease: "power2.out" } });

  timeline.fromTo(cake.querySelectorAll(".cake-tier"),
    { y: 24, opacity: 0 },
    { y: 0, opacity: 1, duration: 0.55, stagger: 0.13 }
  );
  timeline.fromTo(cake.querySelectorAll(".cake-blossom"),
    { scale: 0.65, opacity: 0 },
    { scale: 1, opacity: 1, duration: 0.45, stagger: 0.12, ease: "back.out(1.6)" },
    "-=0.25"
  );
  timeline.to(cake.querySelector(".cake-greeting"), {
    scale: 1,
    duration: 0.7,
    ease: "back.out(1.7)"
  });
}

function requestMediaPermissions() {
  if (mediaPermissionPromise) return mediaPermissionPromise;

  if (!navigator.mediaDevices?.getUserMedia) {
    mediaPermissionIssue = "Microphone access is unavailable. Open this page in a browser that allows microphone access.";
    mediaPermissionPromise = Promise.resolve(false);
    return mediaPermissionPromise;
  }

  // Start the audio context directly from the user's click so it is not blocked later.
  const AudioContextClass = window.AudioContext || window.webkitAudioContext;
  if (AudioContextClass) {
    try {
      audioContext = new AudioContextClass();
      audioContext.resume().catch(() => {});
      audioAnalyser = audioContext.createAnalyser();
      audioAnalyser.fftSize = 2048;
      audioAnalyser.smoothingTimeConstant = 0.18;
      microphoneInputGain = audioContext.createGain();
      microphoneInputGain.gain.value = 5;
      silentMonitorGain = audioContext.createGain();
      silentMonitorGain.gain.value = 0;
      audioAnalyser.connect(silentMonitorGain);
      silentMonitorGain.connect(audioContext.destination);
    } catch {
      audioContext = null;
      audioAnalyser = null;
      microphoneInputGain = null;
      silentMonitorGain = null;
    }
  }

  const audioConstraints = { echoCancellation: false, noiseSuppression: false, autoGainControl: false };
  const microphoneRequest = navigator.mediaDevices.getUserMedia({ audio: audioConstraints, video: false })
    .then((stream) => {
      microphoneStream = stream;
      if (audioContext && audioAnalyser && microphoneInputGain) {
        audioContext.createMediaStreamSource(stream).connect(microphoneInputGain);
        microphoneInputGain.connect(audioAnalyser);
      }
      return true;
    })
    .catch((error) => {
      mediaPermissionIssue = error.name === "NotAllowedError"
        ? "Microphone permission was blocked. Reload the page and allow microphone access to blow out the candle."
        : "Could not access the microphone. Check that one is connected, then reload the page.";
      return false;
    });

  mediaPermissionPromise = microphoneRequest.then((ready) => {
    if (ready) mediaPermissionIssue = "";
    return ready;
  });
  return mediaPermissionPromise;
}

async function startCandleListening() {
  if (candleListeningStarted) return;
  candleListeningStarted = true;

  const permissionsGranted = await mediaPermissionPromise;
  if (!permissionsGranted || !microphoneStream || !audioAnalyser || !audioContext || !microphoneInputGain) {
    micLightStatus.textContent = mediaPermissionIssue || "Microphone input is unavailable. Allow microphone access to continue.";
    return;
  }

  if (audioContext.state === "suspended") {
    try {
      await audioContext.resume();
    } catch {
      micLightStatus.textContent = "Microphone audio is paused by the browser. Reload and allow access when the cake opens.";
      return;
    }
  }
  const samples = new Uint8Array(audioAnalyser.fftSize);
  let noiseFloor = 0.012;
  let loudSince = 0;
  let listeningStartedAt = 0;
  micLightStatus.textContent = "Listening — blow toward your microphone to blow out the candle.";

  const detectBlow = (timestamp) => {
    if (currentStage !== "cake" || !microphoneStream) return;
    if (!listeningStartedAt) listeningStartedAt = timestamp;
    audioAnalyser.getByteTimeDomainData(samples);
    let energy = 0;
    for (const sample of samples) {
      const value = (sample - 128) / 128;
      energy += value * value;
    }
    const volume = Math.sqrt(energy / samples.length);
    micLevelFill.style.transform = `scaleX(${Math.min(1, volume * 12)})`;
    const threshold = Math.max(0.035, noiseFloor * 2.2);

    // Learn the room and music level first so background sound cannot blow it out.
    if (timestamp - listeningStartedAt < 650) {
      noiseFloor = noiseFloor * 0.88 + volume * 0.12;
      requestAnimationFrame(detectBlow);
      return;
    }

    if (volume > threshold) {
      if (!loudSince) loudSince = timestamp;
      if (timestamp - loudSince >= 180) {
        blowOutCandle();
        return;
      }
    } else {
      noiseFloor = noiseFloor * 0.94 + volume * 0.06;
      loudSince = 0;
    }
    requestAnimationFrame(detectBlow);
  };

  requestAnimationFrame(detectBlow);
}

function blowOutCandle() {
  if (currentStage !== "cake") return;
  currentStage = "candle-blown";
  microphoneStream?.getTracks().forEach((track) => track.stop());
  microphoneStream = null;
  audioContext?.close();
  audioContext = null;
  audioAnalyser = null;
  micLevelFill.style.transform = "scaleX(0)";
  micLightStatus.textContent = "Your wish is on its way…";

  const gsap = window.gsap;
  if (gsap) {
    gsap.to(afterCalendar.querySelector(".cake-flame"), {
      opacity: 0,
      scale: 0.2,
      duration: 0.35,
      onComplete: () => window.setTimeout(moveToAfterCake, 650)
    });
  } else window.setTimeout(moveToAfterCake, 900);
}

function markCoverage(x, y) {
  const width = window.innerWidth;
  const height = window.innerHeight;
  const radius = Math.min(width, height) * 0.06;
  const cellX = (x / width) * coverage.columns;
  const cellY = (y / height) * coverage.rows;
  const radiusX = (radius / width) * coverage.columns;
  const radiusY = (radius / height) * coverage.rows;
  const minX = Math.max(0, Math.floor(cellX - radiusX - 1));
  const maxX = Math.min(coverage.columns - 1, Math.ceil(cellX + radiusX + 1));
  const minY = Math.max(0, Math.floor(cellY - radiusY - 1));
  const maxY = Math.min(coverage.rows - 1, Math.ceil(cellY + radiusY + 1));

  for (let row = minY; row <= maxY; row += 1) {
    for (let column = minX; column <= maxX; column += 1) {
      const dx = (column + 0.5 - cellX) / radiusX;
      const dy = (row + 0.5 - cellY) / radiusY;
      if (dx * dx + dy * dy > 1) continue;
      const index = row * coverage.columns + column;
      if (coverage.cells[index]) continue;
      coverage.cells[index] = 1;
      coverage.filled += 1;
    }
  }

  const ratio = coverage.filled / coverage.cells.length;
  updateProgress(ratio);
  return ratio;
}

function positionPointer(event) {
  const bounds = canvas.getBoundingClientRect();
  const x = Math.max(0, Math.min(1, (event.clientX - bounds.left) / bounds.width));
  const y = Math.max(0, Math.min(1, (event.clientY - bounds.top) / bounds.height));
  const dx = 12 * (x - pointer.x);
  const dy = 12 * (y - pointer.y);

  pointer.previousX = pointer.x;
  pointer.previousY = pointer.y;
  pointer.x = x;
  pointer.y = y;
  pointer.speed = Math.min(2, dx * dx + dy * dy);
  pointer.moved = true;
  markCoverage(event.clientX - bounds.left, event.clientY - bounds.top);
}

function startFlowers(event) {
  if (event.button !== undefined && event.button !== 0) return;
  if (!pointer.started) {
    pointer.started = true;
    shaderMaterial.uniforms.u_started.value = 1;
  }
  positionPointer(event);
  canvas.setPointerCapture?.(event.pointerId);
}

function moveFlowers(event) {
  if (!pointer.started) return;
  positionPointer(event);
}

function render() {
  if (flowerArea.hidden) {
    renderLoopActive = false;
    return;
  }

  shaderMaterial.uniforms.u_texture.value = renderTargets[0].texture;
  shaderMaterial.uniforms.u_point.value.set(pointer.x, 1 - pointer.y);
  shaderMaterial.uniforms.u_ratio.value = window.innerWidth / window.innerHeight;
  shaderMaterial.uniforms.u_speed.value = pointer.speed;

  if (pointer.moved) {
    shaderMaterial.uniforms.u_moving.value = 1;
    shaderMaterial.uniforms.u_stop_randomizer.value.set(Math.random(), Math.random());
    shaderMaterial.uniforms.u_stop_time.value = 0;
  } else {
    shaderMaterial.uniforms.u_moving.value = 0;
    shaderMaterial.uniforms.u_stop_time.value += clock.getDelta();
  }

  renderer.setRenderTarget(renderTargets[1]);
  renderer.render(sceneShader, camera);
  basicMaterial.map = renderTargets[1].texture;
  renderer.setRenderTarget(null);
  renderer.render(sceneBasic, camera);

  [renderTargets[0], renderTargets[1]] = [renderTargets[1], renderTargets[0]];
  pointer.moved = false;
  requestAnimationFrame(render);
}

function startRenderLoop() {
  if (renderLoopActive) return;
  renderLoopActive = true;
  requestAnimationFrame(render);
}

canvas.addEventListener("pointerdown", startFlowers);
canvas.addEventListener("pointermove", moveFlowers);

resetCoverageGrid();
updateSize();
window.addEventListener("resize", updateSize);
