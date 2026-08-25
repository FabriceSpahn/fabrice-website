window.addEventListener("DOMContentLoaded", () => {
  const isEmbedded = window.self !== window.top;

  if (isEmbedded) {
    document.documentElement.classList.add("is-embedded");
    document.body.classList.add("is-embedded");
  }

  const navigation = document.querySelector(".site-nav");
  const viewButtons = Array.from(document.querySelectorAll("[data-view]"));
  const panels = Array.from(document.querySelectorAll("[data-panel]"));
  const video = document.getElementById("hero-video");
  const canvas = document.getElementById("hero-raster");
  const transitionCanvas = document.getElementById("hero-transition");
  const mediaFrame = document.querySelector(".hero-media-frame");
  const videoSources = [
    "assets/media/video-1.mp4?v=20260805-1",
    "assets/media/video-2.mp4?v=20260805-1",
    "assets/media/video-3.mp4?v=20260805-1",
  ];
  const preloadedVideos = [];
  const context = canvas?.getContext("2d", { alpha: false });
  const transitionContext = transitionCanvas?.getContext("2d", { alpha: false });
  const sampleCanvas = document.createElement("canvas");
  const sampleContext = sampleCanvas.getContext("2d", { alpha: false, willReadFrequently: true });
  const cursorPill = document.querySelector("[data-cursor-pill]");
  const cursorExpression = document.querySelector("[data-cursor-expression]");
  const prefersReducedMotion = window.matchMedia("(prefers-reduced-motion: reduce)");
  const constrainedDevice = window.matchMedia("(max-width: 680px), (pointer: coarse)");

  let activeView = "home";
  let currentVideoIndex = 0;
  let renderVideo = video;
  let frameCallbackVideo = null;
  let isMobileVideoSwitching = false;
  let isVideoTransitionPending = false;
  let isReady = false;
  let hasDrawnFrame = false;
  let fallbackApplied = false;
  let canReadVideoPixels = window.location.protocol !== "file:";
  let frameCallbackId = 0;
  let animationFrameId = 0;
  let rippleAnimationFrameId = 0;
  let rasterRecoveryTimeoutId = 0;
  let videoTransitionTimeoutId = 0;
  let lastRasterDrawTime = 0;
  let isFrameLoopActive = false;
  let cursorPillFrameId = 0;
  let cursorPillLastTime = 0;
  let cursorPillExpressionTimeoutId = 0;
  let ripples = [];
  const cursorPillPosition = {
    currentX: -120,
    currentY: -120,
    targetX: -120,
    targetY: -120,
    active: false,
    initialized: false,
  };

  function animateCursorPill(time) {
    cursorPillFrameId = 0;

    if (!cursorPill) {
      return;
    }

    const deltaTime = cursorPillLastTime ? Math.min(64, time - cursorPillLastTime) : 16;
    const easing = prefersReducedMotion.matches
      ? 1
      : 1 - Math.pow(0.0008, deltaTime / 1000);
    cursorPillLastTime = time;
    cursorPillPosition.currentX +=
      (cursorPillPosition.targetX - cursorPillPosition.currentX) * easing;
    cursorPillPosition.currentY +=
      (cursorPillPosition.targetY - cursorPillPosition.currentY) * easing;
    cursorPill.style.transform = `translate3d(${cursorPillPosition.currentX}px, ${cursorPillPosition.currentY}px, 0)`;

    const remainingDistance = Math.hypot(
      cursorPillPosition.targetX - cursorPillPosition.currentX,
      cursorPillPosition.targetY - cursorPillPosition.currentY,
    );

    if (cursorPillPosition.active && remainingDistance > 0.1) {
      cursorPillFrameId = window.requestAnimationFrame(animateCursorPill);
    }
  }

  function moveCursorPill(event) {
    if (!cursorPill || activeView !== "home") {
      return;
    }

    const offset = 18;
    const pillWidth = cursorPill.offsetWidth;
    const pillHeight = cursorPill.offsetHeight;
    cursorPillPosition.targetX =
      event.clientX + offset + pillWidth > window.innerWidth
        ? event.clientX - pillWidth - offset
        : event.clientX + offset;
    cursorPillPosition.targetY =
      event.clientY + offset + pillHeight > window.innerHeight
        ? event.clientY - pillHeight - offset
        : event.clientY + offset;

    if (!cursorPillPosition.initialized) {
      cursorPillPosition.currentX = cursorPillPosition.targetX;
      cursorPillPosition.currentY = cursorPillPosition.targetY;
      cursorPillPosition.initialized = true;
    }

    cursorPillPosition.active = true;
    cursorPill.classList.add("is-visible");

    if (!cursorPillFrameId) {
      cursorPillFrameId = window.requestAnimationFrame(animateCursorPill);
    }
  }

  function hideCursorPill() {
    cursorPillPosition.active = false;
    cursorPill?.classList.remove("is-visible");
  }

  function toggleCursorExpression() {
    if (!cursorExpression || activeView !== "home") {
      return;
    }

    window.clearTimeout(cursorPillExpressionTimeoutId);
    cursorExpression.textContent = ":-D";
    cursorPillExpressionTimeoutId = window.setTimeout(() => {
      cursorExpression.textContent = ":-)";
    }, 620);
  }

  function resetPanelScroll(panel) {
    panel.querySelectorAll(".content-panel__scroller").forEach((scroller) => {
      scroller.scrollTop = 0;
      scroller.scrollLeft = 0;
    });

    const frame = panel.querySelector(".legal-frame");

    if (frame?.contentWindow) {
      try {
        frame.contentWindow.scrollTo({ top: 0, left: 0, behavior: "auto" });
      } catch {
        // The embedded page is same-origin, but keep panel switching resilient.
      }
    }
  }

  function setView(nextView) {
    activeView = nextView;
    document.body.classList.toggle("is-panel-open", nextView !== "home");

    if (nextView !== "home") {
      hideCursorPill();
      stopVideoFrameLoop();
      window.cancelAnimationFrame(rippleAnimationFrameId);
      rippleAnimationFrameId = 0;
      ripples = [];
      renderVideo.pause();
    } else {
      window.requestAnimationFrame(() => {
        resizeCanvas();
        bootVideo();
        startVideoFrameLoop();
        scheduleRasterRecovery();
      });
    }

    viewButtons.forEach((button) => {
      const isActive = button.dataset.view === nextView;
      button.classList.toggle("is-active", isActive);
      button.setAttribute("aria-pressed", String(isActive));
    });

    panels.forEach((panel) => {
      const isVisible = panel.dataset.panel === nextView;

      if (isVisible) {
        panel.hidden = false;
        resetPanelScroll(panel);
        window.requestAnimationFrame(() => panel.classList.add("is-visible"));
      } else {
        panel.classList.remove("is-visible");
        window.setTimeout(() => {
          if (!panel.classList.contains("is-visible")) {
            panel.hidden = true;
          }
        }, 430);
      }
    });
  }

  viewButtons.forEach((button) => {
    button.addEventListener("click", () => setView(button.dataset.view || "home"));
  });

  const copyEmailButtons = Array.from(document.querySelectorAll("[data-copy-email]"));

  async function copyEmail(address) {
    if (navigator.clipboard?.writeText && window.isSecureContext) {
      await navigator.clipboard.writeText(address);
      return;
    }

    const textarea = document.createElement("textarea");
    textarea.value = address;
    textarea.setAttribute("readonly", "");
    textarea.style.position = "fixed";
    textarea.style.opacity = "0";
    document.body.append(textarea);
    textarea.select();
    const copied = document.execCommand("copy");
    textarea.remove();

    if (!copied) {
      throw new Error("Copying the email address failed.");
    }
  }

  copyEmailButtons.forEach((button) => {
    button.addEventListener("click", async () => {
      const address = button.dataset.email;
      const feedbackItems = Array.from(button.querySelectorAll("[data-copy-feedback]"));

      if (!address) {
        return;
      }

      try {
        await copyEmail(address);

        if (feedbackItems.length) {
          const originalLabels = feedbackItems.map((item) => item.textContent);
          feedbackItems.forEach((item) => {
            item.textContent = "Copied";
          });
          window.setTimeout(() => {
            feedbackItems.forEach((item, index) => {
              item.textContent = originalLabels[index];
            });
          }, 1800);
        }
      } catch {
        feedbackItems.forEach((item) => {
          item.textContent = "Copy failed";
        });
      }
    });
  });

  window.addEventListener("keydown", (event) => {
    if (event.key === "Escape" && activeView !== "home") {
      setView("home");
      navigation?.querySelector('[data-view="home"]')?.focus();
    }
  });

  if (
    !video ||
    !canvas ||
    !transitionCanvas ||
    !mediaFrame ||
    !context ||
    !transitionContext ||
    !sampleContext
  ) {
    return;
  }

  function resizeCanvas() {
    const width = Math.max(1, Math.round(canvas.clientWidth));
    const height = Math.max(1, Math.round(canvas.clientHeight));
    // The effect is intentionally coarse. Extra Retina pixels add memory and
    // GPU cost without a visible benefit on smaller touch devices.
    const maxDpr = constrainedDevice.matches ? 1 : 1.5;
    const dpr = Math.min(window.devicePixelRatio || 1, maxDpr);
    const outputWidth = Math.round(width * dpr);
    const outputHeight = Math.round(height * dpr);

    if (canvas.width === outputWidth && canvas.height === outputHeight) {
      return;
    }

    canvas.width = outputWidth;
    canvas.height = outputHeight;
    context.setTransform(dpr, 0, 0, dpr, 0, 0);
  }

  function fitCover(sourceWidth, sourceHeight, targetWidth, targetHeight) {
    const sourceRatio = sourceWidth / sourceHeight;
    const targetRatio = targetWidth / targetHeight;

    if (sourceRatio > targetRatio) {
      const drawHeight = targetHeight;
      const drawWidth = drawHeight * sourceRatio;
      return {
        drawWidth,
        drawHeight,
        offsetX: (targetWidth - drawWidth) / 2,
        offsetY: 0,
      };
    }

    const drawWidth = targetWidth;
    const drawHeight = drawWidth / sourceRatio;
    return {
      drawWidth,
      drawHeight,
      offsetX: 0,
      offsetY: (targetHeight - drawHeight) / 2,
    };
  }

  function roundedRect(x, y, width, height, radius, fill) {
    const safeRadius = Math.min(radius, width / 2, height / 2);
    context.beginPath();
    context.roundRect(x, y, width, height, safeRadius);
    context.fillStyle = fill;
    context.fill();
  }

  function smoothstep(edgeStart, edgeEnd, value) {
    const progress = Math.min(1, Math.max(0, (value - edgeStart) / (edgeEnd - edgeStart)));
    return progress * progress * (3 - 2 * progress);
  }

  function getRippleDuration() {
    return constrainedDevice.matches ? 1300 : 1600;
  }

  function drawFrame() {
    if (
      !isReady ||
      renderVideo.readyState < 2 ||
      !renderVideo.videoWidth ||
      !renderVideo.videoHeight
    ) {
      return false;
    }

    const width = canvas.clientWidth;
    const height = canvas.clientHeight;
    const targetCellWidth = width < 680 ? 9 : 11;
    const columns = Math.min(180, Math.max(46, Math.ceil(width / targetCellWidth)));
    const gap = 1;
    const cellWidth = (width - gap * (columns - 1)) / columns;
    const cellHeight = cellWidth * 2.08;
    const rows = Math.max(1, Math.ceil((height + gap) / (cellHeight + gap)));
    const now = performance.now();
    const rippleDuration = getRippleDuration();

    ripples = ripples.filter((ripple) => now - ripple.startedAt < rippleDuration);

    // Values that only change once per ripple are calculated once per frame,
    // rather than again for every individual tile.
    const rippleStates = ripples.map((ripple) => {
      const progress = Math.min(1, (now - ripple.startedAt) / rippleDuration);
      const waveProgress = 1 - Math.pow(1 - progress, 2);
      const farthestX = Math.max(ripple.x, width - ripple.x);
      const farthestY = Math.max(ripple.y, height - ripple.y);
      const maxRadius = Math.hypot(farthestX, farthestY);
      const bandWidth = Math.max(
        constrainedDevice.matches ? 30 : 38,
        Math.min(width, height) * 0.06,
      );

      return {
        ...ripple,
        progress,
        waveRadius: waveProgress * maxRadius,
        bandWidth,
      };
    });

    context.clearRect(0, 0, width, height);
    context.fillStyle = "#000000";
    context.fillRect(0, 0, width, height);

    sampleCanvas.width = columns;
    sampleCanvas.height = rows;
    const fit = fitCover(
      renderVideo.videoWidth,
      renderVideo.videoHeight,
      columns,
      rows,
    );
    sampleContext.drawImage(
      renderVideo,
      fit.offsetX,
      fit.offsetY,
      fit.drawWidth,
      fit.drawHeight,
    );
    let pixels = null;

    if (canReadVideoPixels) {
      try {
        pixels = sampleContext.getImageData(0, 0, columns, rows).data;
      } catch {
        canReadVideoPixels = false;
      }
    }

    context.imageSmoothingEnabled = false;

    for (let row = 0; row < rows; row += 1) {
      for (let column = 0; column < columns; column += 1) {
        const pixelIndex = (row * columns + column) * 4;
        const tileX = column * (cellWidth + gap);
        const tileY = row * (cellHeight + gap);
        const centerX = tileX + cellWidth / 2;
        const centerY = tileY + cellHeight / 2;
        let rippleStrength = 0;

        rippleStates.forEach((ripple) => {
          const distance = Math.hypot(centerX - ripple.x, centerY - ripple.y);
          const primaryRing = smoothstep(
            0,
            1,
            Math.max(0, 1 - Math.abs(distance - ripple.waveRadius) / ripple.bandWidth),
          );
          const secondaryRadius = Math.max(0, ripple.waveRadius - ripple.bandWidth * 1.8);
          const secondaryRing = smoothstep(
            0,
            1,
            Math.max(
              0,
              1 - Math.abs(distance - secondaryRadius) / (ripple.bandWidth * 0.8),
            ),
          );
          const decay = 1 - ripple.progress;
          const strength = Math.min(1, (primaryRing * 0.75 + secondaryRing * 0.28) * decay);

          rippleStrength = 1 - (1 - rippleStrength) * (1 - strength);
        });

        const scale = 1 - rippleStrength * (constrainedDevice.matches ? 0.68 : 0.78);
        const renderedWidth = cellWidth * scale;
        const renderedHeight = cellHeight * scale;
        const renderedX = centerX - renderedWidth / 2;
        const renderedY = centerY - renderedHeight / 2;

        if (pixels) {
          const red = pixels[pixelIndex];
          const green = pixels[pixelIndex + 1];
          const blue = pixels[pixelIndex + 2];

          roundedRect(
            renderedX,
            renderedY,
            renderedWidth,
            renderedHeight,
            1,
            `rgb(${red} ${green} ${blue})`,
          );
        } else {
          context.drawImage(
            sampleCanvas,
            column,
            row,
            1,
            1,
            renderedX,
            renderedY,
            renderedWidth,
            renderedHeight,
          );
        }
      }
    }

    context.imageSmoothingEnabled = true;

    if (fallbackApplied) {
      mediaFrame.classList.remove("has-video-fallback");
      fallbackApplied = false;
    }

    hasDrawnFrame = true;

    if (isVideoTransitionPending) {
      fadeVideoTransition();
    }

    return true;
  }

  function safeDrawFrame(force = false) {
    const now = performance.now();
    const targetFrameRate = constrainedDevice.matches && ripples.length === 0 ? 30 : 45;
    const targetFrameInterval = 1000 / targetFrameRate;

    // Video, ripple and recovery events may arrive together. Keep all of them
    // inside one shared render budget instead of redrawing the same frame.
    if (!force && now - lastRasterDrawTime < targetFrameInterval) {
      return false;
    }

    lastRasterDrawTime = now;

    try {
      return drawFrame();
    } catch {
      context.imageSmoothingEnabled = true;
      return false;
    }
  }

  function scheduleRasterRecovery() {
    window.clearTimeout(rasterRecoveryTimeoutId);
    let attempts = 0;

    function tryRenderRaster() {
      rasterRecoveryTimeoutId = 0;

      if (document.hidden) {
        return;
      }

      resizeCanvas();

      if (safeDrawFrame(true)) {
        return;
      }

      attempts += 1;

      if (attempts < 40) {
        rasterRecoveryTimeoutId = window.setTimeout(tryRenderRaster, 150);
      }
    }

    tryRenderRaster();
  }

  function queueVideoFrame() {
    if (!isFrameLoopActive) {
      return;
    }

    if (typeof renderVideo.requestVideoFrameCallback === "function") {
      frameCallbackVideo = renderVideo;
      frameCallbackId = renderVideo.requestVideoFrameCallback(() => {
        frameCallbackId = 0;
        frameCallbackVideo = null;

        if (!isFrameLoopActive) {
          return;
        }

        try {
          safeDrawFrame();
        } finally {
          queueVideoFrame();
        }
      });
      return;
    }

    animationFrameId = window.requestAnimationFrame(() => {
      animationFrameId = 0;

      if (!isFrameLoopActive) {
        return;
      }

      try {
        safeDrawFrame();
      } finally {
        queueVideoFrame();
      }
    });
  }

  function startVideoFrameLoop() {
    if (isFrameLoopActive) {
      return;
    }

    isFrameLoopActive = true;
    queueVideoFrame();
  }

  function stopVideoFrameLoop() {
    isFrameLoopActive = false;

    if (
      frameCallbackId &&
      frameCallbackVideo &&
      typeof frameCallbackVideo.cancelVideoFrameCallback === "function"
    ) {
      frameCallbackVideo.cancelVideoFrameCallback(frameCallbackId);
    }

    window.cancelAnimationFrame(animationFrameId);
    frameCallbackId = 0;
    frameCallbackVideo = null;
    animationFrameId = 0;
  }

  function animateRipples() {
    rippleAnimationFrameId = 0;
    const now = performance.now();
    ripples = ripples.filter((ripple) => now - ripple.startedAt < getRippleDuration());
    safeDrawFrame();

    if (ripples.length > 0 && !document.hidden) {
      rippleAnimationFrameId = window.requestAnimationFrame(animateRipples);
    }
  }

  function startEffect(targetVideo = renderVideo) {
    if (!targetVideo.videoWidth || !targetVideo.videoHeight) {
      return;
    }

    isReady = true;
    resizeCanvas();
    scheduleRasterRecovery();
  }

  function createRipple(event) {
    if (prefersReducedMotion.matches) {
      return;
    }

    const rect = canvas.getBoundingClientRect();
    ripples.push({
      x: event.clientX - rect.left,
      y: event.clientY - rect.top,
      startedAt: performance.now(),
    });

    if (ripples.length > 5) {
      ripples.shift();
    }

    if (!rippleAnimationFrameId) {
      rippleAnimationFrameId = window.requestAnimationFrame(animateRipples);
    }
  }

  async function bootVideo(targetVideo = renderVideo) {
    targetVideo.muted = true;
    targetVideo.defaultMuted = true;
    targetVideo.playsInline = true;

    try {
      await targetVideo.play();
      startEffect(targetVideo);
    } catch {
      startEffect(targetVideo);
    }
  }

  function clearVideoTransition() {
    window.clearTimeout(videoTransitionTimeoutId);
    isVideoTransitionPending = false;
    transitionCanvas.classList.remove("is-visible", "is-fading");
    transitionContext.clearRect(0, 0, transitionCanvas.width, transitionCanvas.height);
  }

  function fadeVideoTransition() {
    if (!isVideoTransitionPending) {
      return;
    }

    window.clearTimeout(videoTransitionTimeoutId);
    isVideoTransitionPending = false;

    window.requestAnimationFrame(() => {
      transitionCanvas.classList.add("is-fading");
    });

    const fadeCleanupDelay = constrainedDevice.matches ? 460 : 740;
    videoTransitionTimeoutId = window.setTimeout(clearVideoTransition, fadeCleanupDelay);
  }

  function captureVideoTransitionFrame() {
    window.clearTimeout(videoTransitionTimeoutId);

    try {
      transitionCanvas.width = canvas.width;
      transitionCanvas.height = canvas.height;
      transitionContext.setTransform(1, 0, 0, 1, 0, 0);
      transitionContext.clearRect(0, 0, transitionCanvas.width, transitionCanvas.height);
      transitionContext.drawImage(canvas, 0, 0);
      transitionCanvas.classList.remove("is-fading");
      transitionCanvas.classList.add("is-visible");
      isVideoTransitionPending = true;

      // Avoid a frozen overlay if the next video cannot render a frame.
      videoTransitionTimeoutId = window.setTimeout(fadeVideoTransition, 4000);
    } catch {
      clearVideoTransition();
    }
  }

  function performHeroVideoCycle() {
    if (activeView !== "home") {
      return;
    }

    captureVideoTransitionFrame();
    currentVideoIndex = (currentVideoIndex + 1) % videoSources.length;
    isReady = false;
    canReadVideoPixels = window.location.protocol !== "file:";
    fallbackApplied = false;
    mediaFrame.classList.remove("has-video-fallback");
    video.pause();
    video.src = videoSources[currentVideoIndex];
    video.load();
    bootVideo();
    scheduleRasterRecovery();
  }

  function waitForPlayableVideo(targetVideo) {
    if (targetVideo.readyState >= HTMLMediaElement.HAVE_CURRENT_DATA) {
      return Promise.resolve(true);
    }

    return new Promise((resolve) => {
      let timeoutId = 0;

      const finish = (isReadyToPlay) => {
        window.clearTimeout(timeoutId);
        targetVideo.removeEventListener("loadeddata", handleReady);
        targetVideo.removeEventListener("canplay", handleReady);
        targetVideo.removeEventListener("error", handleError);
        resolve(isReadyToPlay);
      };
      const handleReady = () => finish(true);
      const handleError = () => finish(false);

      targetVideo.addEventListener("loadeddata", handleReady, { once: true });
      targetVideo.addEventListener("canplay", handleReady, { once: true });
      targetVideo.addEventListener("error", handleError, { once: true });
      timeoutId = window.setTimeout(() => finish(false), 4000);
      targetVideo.load();
    });
  }

  async function cycleMobileHeroVideo() {
    if (activeView !== "home" || isMobileVideoSwitching) {
      return;
    }

    const nextIndex = (currentVideoIndex + 1) % videoSources.length;
    const nextVideo = nextIndex === 0 ? video : preloadedVideos[nextIndex - 1];

    if (!nextVideo) {
      return;
    }

    isMobileVideoSwitching = true;
    nextVideo.muted = true;
    nextVideo.defaultMuted = true;
    nextVideo.playsInline = true;
    const isPlayable = await waitForPlayableVideo(nextVideo);

    if (!isPlayable || activeView !== "home") {
      isMobileVideoSwitching = false;
      return;
    }

    try {
      await nextVideo.play();
    } catch {
      isMobileVideoSwitching = false;
      return;
    }

    const previousVideo = renderVideo;
    stopVideoFrameLoop();
    renderVideo = nextVideo;
    currentVideoIndex = nextIndex;
    isReady = true;
    lastRasterDrawTime = 0;
    safeDrawFrame(true);
    startVideoFrameLoop();

    if (previousVideo !== renderVideo) {
      previousVideo.pause();
    }

    isMobileVideoSwitching = false;
  }

  function cycleHeroVideo() {
    if (constrainedDevice.matches) {
      cycleMobileHeroVideo();
      return;
    }

    performHeroVideoCycle();
  }

  function preloadAlternateVideos() {
    videoSources.slice(1).forEach((source) => {
      const preloadVideo = document.createElement("video");
      preloadVideo.className = "hero-video-buffer";
      preloadVideo.setAttribute("aria-hidden", "true");
      preloadVideo.preload = "auto";
      preloadVideo.muted = true;
      preloadVideo.defaultMuted = true;
      preloadVideo.playsInline = true;
      preloadVideo.loop = true;
      preloadVideo.src = source;
      mediaFrame.append(preloadVideo);
      preloadVideo.load();
      preloadedVideos.push(preloadVideo);
    });
  }

  function resumeExperience() {
    resizeCanvas();

    if (renderVideo.videoWidth && renderVideo.videoHeight) {
      isReady = true;
    }

    if (renderVideo.networkState === HTMLMediaElement.NETWORK_EMPTY) {
      renderVideo.load();
    }

    bootVideo();
    startVideoFrameLoop();
    scheduleRasterRecovery();
  }

  const refreshPrimaryVideo = () => {
    if (renderVideo === video) {
      startEffect(video);
    }
  };

  video.addEventListener("loadedmetadata", refreshPrimaryVideo);
  video.addEventListener("loadeddata", refreshPrimaryVideo);
  video.addEventListener("canplay", refreshPrimaryVideo);
  video.addEventListener("playing", refreshPrimaryVideo);
  video.addEventListener("timeupdate", () => safeDrawFrame());
  video.addEventListener("pause", () => {
    if (!document.hidden && activeView === "home") {
      bootVideo();
    }
  });
  mediaFrame.addEventListener("pointerdown", createRipple);
  mediaFrame.addEventListener("pointerdown", toggleCursorExpression);
  mediaFrame.addEventListener("click", cycleHeroVideo);
  mediaFrame.addEventListener("pointermove", moveCursorPill);
  mediaFrame.addEventListener("pointerenter", moveCursorPill);
  mediaFrame.addEventListener("pointerleave", hideCursorPill);
  window.addEventListener("blur", hideCursorPill);

  function handleViewportResize() {
    resizeCanvas();
    safeDrawFrame(true);
  }

  window.addEventListener("resize", handleViewportResize);
  window.visualViewport?.addEventListener("resize", handleViewportResize);

  resumeExperience();
  preloadAlternateVideos();

  window.setTimeout(() => {
    if (!hasDrawnFrame) {
      fallbackApplied = true;
      mediaFrame.classList.add("has-video-fallback");
    }
  }, 2200);

  window.addEventListener("pageshow", resumeExperience);
  document.addEventListener("visibilitychange", () => {
    if (document.hidden) {
      stopVideoFrameLoop();
      renderVideo.pause();
      window.cancelAnimationFrame(rippleAnimationFrameId);
      rippleAnimationFrameId = 0;
      return;
    }

    resumeExperience();
  });

  window.addEventListener("pagehide", () => {
    stopVideoFrameLoop();
    window.cancelAnimationFrame(rippleAnimationFrameId);
    rippleAnimationFrameId = 0;
    window.clearTimeout(rasterRecoveryTimeoutId);
    window.clearTimeout(videoTransitionTimeoutId);
    window.cancelAnimationFrame(cursorPillFrameId);
    window.clearTimeout(cursorPillExpressionTimeoutId);
  });
});
