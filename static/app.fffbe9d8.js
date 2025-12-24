// Header canvas with dithering effect
(function () {
  // Default dither mode - can be overridden via URL parameter ?dither=gaussian|atkinson|noise
  const DEFAULT_DITHER = 'atkinson';

  // State for cleanup
  let currentState = null;

  // Shared scroll progress for color interpolation
  let scrollProgress = 0;

  const vsSource = `
    attribute vec2 a_position;
    attribute vec2 a_texCoord;
    varying vec2 v_texCoord;
    void main() {
      gl_Position = vec4(a_position, 0, 1);
      v_texCoord = a_texCoord;
    }
  `;

  const fsSource = `
    precision highp float;
    uniform sampler2D u_image;
    uniform sampler2D u_bayer;
    uniform vec2 u_resolution;
    uniform int u_ditherMode;  // 0 = Gaussian, 1 = Atkinson, 2 = noise
    uniform vec3 u_bgColor;    // Background color from CSS --bg
    uniform vec3 u_fgColor;    // Foreground (wave) color from CSS --wave-fg
    uniform float u_scroll;    // Scroll progress (0 = top, 1 = scrolled past header)
    varying vec2 v_texCoord;

    // Hash function for stable random noise
    float hash(vec2 p) {
      vec3 p3 = fract(vec3(p.xyx) * 0.1031);
      p3 += dot(p3, p3.yzx + 33.33);
      return fract((p3.x + p3.y) * p3.z);
    }

    // Atkinson-style threshold pattern (4x4)
    // Mimics the high-contrast stippled look of Atkinson error diffusion
    float atkinsonThreshold(vec2 pos) {
      int x = int(mod(pos.x, 4.0));
      int y = int(mod(pos.y, 4.0));
      int idx = y * 4 + x;
      // Custom pattern optimized for Atkinson-like appearance
      // More clustered dots, higher contrast than Bayer
      float thresholds[16];
      thresholds[0] = 0.0;    thresholds[1] = 12.0;  thresholds[2] = 3.0;   thresholds[3] = 15.0;
      thresholds[4] = 8.0;   thresholds[5] = 4.0;   thresholds[6] = 11.0;  thresholds[7] = 7.0;
      thresholds[8] = 2.0;   thresholds[9] = 14.0;  thresholds[10] = 1.0;  thresholds[11] = 13.0;
      thresholds[12] = 10.0; thresholds[13] = 6.0;  thresholds[14] = 9.0;  thresholds[15] = 5.0;
      for (int i = 0; i < 16; i++) {
        if (i == idx) return thresholds[i] / 16.0;
      }
      return 0.0;
    }

    void main() {
      vec4 color = texture2D(u_image, v_texCoord);
      float gray = dot(color.rgb, vec3(0.299, 0.587, 0.114));

      // Fade to background at bottom - increases as user scrolls down
      float screenY = gl_FragCoord.y / u_resolution.y;
      // Fade region expands from 40% to 85% of height as scroll increases
      float fadeHeight = mix(0.4, 0.85, u_scroll);
      float fade = smoothstep(0.0, fadeHeight, screenY);
      // Also slightly reduce overall intensity when scrolled
      fade *= mix(1.0, 0.7, u_scroll * 0.5);
      gray *= fade;

      float threshold;
      if (u_ditherMode == 2) {
        // Noise-based random dithering (stable per pixel)
        threshold = hash(gl_FragCoord.xy);
      } else if (u_ditherMode == 1) {
        // Atkinson-style dithering
        // Apply slight contrast boost to mimic Atkinson's 75% error diffusion
        gray = gray * 1.2 - 0.1;
        gray = clamp(gray, 0.0, 1.0);
        threshold = atkinsonThreshold(gl_FragCoord.xy);
      } else {
        // Gaussian (Bayer) ordered dithering
        vec2 bayerCoord = mod(gl_FragCoord.xy, 8.0) / 8.0;
        threshold = texture2D(u_bayer, bayerCoord).r;
      }

      // Add small offset so gray=0 always renders as dark
      float dithered = step(threshold + 0.1, gray);
      gl_FragColor = vec4(mix(u_bgColor, u_fgColor, dithered), 1.0);
    }
  `;

  function createShader(gl, type, source) {
    const shader = gl.createShader(type);
    gl.shaderSource(shader, source);
    gl.compileShader(shader);
    if (!gl.getShaderParameter(shader, gl.COMPILE_STATUS)) {
      console.error(gl.getShaderInfoLog(shader));
    }
    return shader;
  }

  // Parse CSS hex color to RGB values (0-1 range)
  function parseHexColor(hex) {
    hex = hex.trim().replace('#', '');
    if (hex.length === 3) {
      hex = hex[0] + hex[0] + hex[1] + hex[1] + hex[2] + hex[2];
    }
    return [parseInt(hex.slice(0, 2), 16) / 255, parseInt(hex.slice(2, 4), 16) / 255, parseInt(hex.slice(4, 6), 16) / 255];
  }

  // Get background color interpolated between cold start and warm end based on scroll
  function getBgColor() {
    var style = getComputedStyle(document.documentElement);
    var bgStart = parseHexColor(style.getPropertyValue('--bg-start').trim());
    var bgEnd = parseHexColor(style.getPropertyValue('--bg-end').trim());
    // Interpolate based on scroll progress
    return [bgStart[0] + (bgEnd[0] - bgStart[0]) * scrollProgress, bgStart[1] + (bgEnd[1] - bgStart[1]) * scrollProgress, bgStart[2] + (bgEnd[2] - bgStart[2]) * scrollProgress];
  }

  // Get current foreground (wave) color from CSS custom property
  function getFgColor() {
    var fg = getComputedStyle(document.documentElement).getPropertyValue('--wave-fg').trim();
    return parseHexColor(fg);
  }

  function cleanup() {
    if (!currentState) return;

    // Cancel animation frame
    if (currentState.animationId) {
      cancelAnimationFrame(currentState.animationId);
    }

    // Remove event listeners
    document.removeEventListener('click', currentState.onFirstInteraction);
    document.removeEventListener('touchstart', currentState.onFirstInteraction);
    document.removeEventListener('keydown', currentState.onFirstInteraction);
    document.removeEventListener('scroll', currentState.onFirstInteraction);
    window.removeEventListener('resize', currentState.onResize);
    window.removeEventListener('scroll', currentState.onScroll);

    // Disconnect dark mode observer
    if (currentState.darkModeObserver) {
      currentState.darkModeObserver.disconnect();
    }

    // Lose WebGL context to free resources
    if (currentState.loseContext) {
      currentState.loseContext.loseContext();
    }

    currentState = null;
  }

  function init() {
    // Clean up any previous instance
    cleanup();

    const canvas = document.getElementById('header-canvas');
    if (!canvas) return; // No header canvas on this page

    const gl = canvas.getContext('webgl');
    if (!gl) return;

    const loseContext = gl.getExtension('WEBGL_lose_context');

    const vs = createShader(gl, gl.VERTEX_SHADER, vsSource);
    const fs = createShader(gl, gl.FRAGMENT_SHADER, fsSource);
    const program = gl.createProgram();
    gl.attachShader(program, vs);
    gl.attachShader(program, fs);
    gl.linkProgram(program);
    gl.useProgram(program);

    const posBuffer = gl.createBuffer();
    gl.bindBuffer(gl.ARRAY_BUFFER, posBuffer);
    gl.bufferData(gl.ARRAY_BUFFER, new Float32Array([-1, -1, 1, -1, -1, 1, 1, 1]), gl.STATIC_DRAW);
    const posLoc = gl.getAttribLocation(program, 'a_position');
    gl.enableVertexAttribArray(posLoc);
    gl.vertexAttribPointer(posLoc, 2, gl.FLOAT, false, 0, 0);

    const texLoc = gl.getAttribLocation(program, 'a_texCoord');
    gl.enableVertexAttribArray(texLoc);

    // Create 8x8 Bayer matrix texture
    const bayer = new Uint8Array([
      0, 128, 32, 160, 8, 136, 40, 168, 192, 64, 224, 96, 200, 72, 232, 104, 48, 176, 16, 144, 56, 184, 24, 152, 240, 112, 208, 80, 248, 120, 216, 88, 12, 140, 44, 172, 4, 132, 36, 164, 204, 76, 236,
      108, 196, 68, 228, 100, 60, 188, 28, 156, 52, 180, 20, 148, 252, 124, 220, 92, 244, 116, 212, 84,
    ]);
    const bayerTex = gl.createTexture();
    gl.activeTexture(gl.TEXTURE1);
    gl.bindTexture(gl.TEXTURE_2D, bayerTex);
    gl.texParameteri(gl.TEXTURE_2D, gl.TEXTURE_WRAP_S, gl.REPEAT);
    gl.texParameteri(gl.TEXTURE_2D, gl.TEXTURE_WRAP_T, gl.REPEAT);
    gl.texParameteri(gl.TEXTURE_2D, gl.TEXTURE_MIN_FILTER, gl.NEAREST);
    gl.texParameteri(gl.TEXTURE_2D, gl.TEXTURE_MAG_FILTER, gl.NEAREST);
    gl.texImage2D(gl.TEXTURE_2D, 0, gl.LUMINANCE, 8, 8, 0, gl.LUMINANCE, gl.UNSIGNED_BYTE, bayer);
    gl.uniform1i(gl.getUniformLocation(program, 'u_bayer'), 1);

    // Dither mode: 0 = Gaussian, 1 = Atkinson, 2 = noise
    const ditherModes = { gaussian: 0, atkinson: 1, noise: 2 };
    const urlParams = new URLSearchParams(window.location.search);
    const ditherParam = urlParams.get('dither');
    const ditherMode = ditherModes[ditherParam] ?? ditherModes[DEFAULT_DITHER];
    gl.uniform1i(gl.getUniformLocation(program, 'u_ditherMode'), ditherMode);

    // Colors from CSS (update with dark mode)
    const bgColorLoc = gl.getUniformLocation(program, 'u_bgColor');
    const fgColorLoc = gl.getUniformLocation(program, 'u_fgColor');
    function updateColors() {
      var bg = getBgColor();
      var fg = getFgColor();
      gl.uniform3f(bgColorLoc, bg[0], bg[1], bg[2]);
      gl.uniform3f(fgColorLoc, fg[0], fg[1], fg[2]);
    }
    updateColors();

    // Scroll-reactive effect - waves dissolve and header compresses as user scrolls
    const scrollLoc = gl.getUniformLocation(program, 'u_scroll');
    const headerContainer = canvas.parentElement;
    gl.uniform1f(scrollLoc, 0.0);
    function updateScroll() {
      var headerHeight = canvas.offsetHeight;
      // Very aggressive warmth transition - complete within 30% of header height
      var warmthDistance = headerHeight * 0.3;
      scrollProgress = Math.min(1.0, window.scrollY / warmthDistance);
      // Ease for smoother visual
      scrollProgress = scrollProgress * scrollProgress * (3 - 2 * scrollProgress);

      // Header dissolve uses full header height for its effect
      var headerScrollProgress = Math.min(1.0, window.scrollY / headerHeight);
      var easedHeaderProgress = headerScrollProgress * headerScrollProgress * (3 - 2 * headerScrollProgress);
      gl.uniform1f(scrollLoc, easedHeaderProgress);

      // Update shader background color based on scroll warmth
      updateColors();

      // Subtle header compression - shrinks to 85% height and shifts up slightly
      var scale = 1 - easedHeaderProgress * 0.15;
      var translateY = easedHeaderProgress * -10;
      headerContainer.style.transform = 'scaleY(' + scale + ') translateY(' + translateY + 'px)';
      headerContainer.style.opacity = 1 - easedHeaderProgress * 0.3;
    }

    // Detect mobile for appropriate video/fallback selection
    const isMobile = window.innerWidth < 768;

    const video = document.createElement('video');
    video.crossOrigin = 'anonymous';
    video.loop = true;
    video.muted = true;
    video.autoplay = true;
    video.playsInline = true;
    video.src = isMobile ? '/static/waves-mobile.mp4' : '/static/waves.mp4';

    const fallbackImage = new Image();
    fallbackImage.crossOrigin = 'anonymous';
    fallbackImage.src = isMobile ? '/static/waves-mobile-fallback.jpg' : '/static/waves-fallback.jpg';

    let texture = null;
    let texBuffer = null;
    let resolutionLoc = null;
    let animationId = null;
    let currentSource = null; // 'video' or 'image'
    let videoPlaying = false;

    function setupCanvas(source) {
      const sourceWidth = source === video ? video.videoWidth : fallbackImage.naturalWidth;
      const sourceHeight = source === video ? video.videoHeight : fallbackImage.naturalHeight;
      if (!sourceWidth || !sourceHeight) return;

      canvas.width = canvas.offsetWidth * window.devicePixelRatio;
      canvas.height = canvas.offsetHeight * window.devicePixelRatio;
      gl.viewport(0, 0, canvas.width, canvas.height);

      // Calculate texture coords to show bottom of source (cover behavior)
      const canvasAspect = canvas.width / canvas.height;
      const sourceAspect = sourceWidth / sourceHeight;
      let texTop = 1,
        texBottom = 0,
        texLeft = 0,
        texRight = 1;
      if (sourceAspect > canvasAspect) {
        const scale = canvasAspect / sourceAspect;
        texLeft = (1 - scale) / 2;
        texRight = 1 - texLeft;
      } else {
        const scale = sourceAspect / canvasAspect;
        texTop = scale;
        texBottom = 0;
      }

      if (!texBuffer) {
        texBuffer = gl.createBuffer();
      }
      gl.bindBuffer(gl.ARRAY_BUFFER, texBuffer);
      gl.bufferData(gl.ARRAY_BUFFER, new Float32Array([texLeft, texBottom, texRight, texBottom, texLeft, texTop, texRight, texTop]), gl.STATIC_DRAW);
      gl.vertexAttribPointer(texLoc, 2, gl.FLOAT, false, 0, 0);

      if (!texture) {
        texture = gl.createTexture();
        gl.activeTexture(gl.TEXTURE0);
        gl.bindTexture(gl.TEXTURE_2D, texture);
        gl.pixelStorei(gl.UNPACK_FLIP_Y_WEBGL, true);
        gl.texParameteri(gl.TEXTURE_2D, gl.TEXTURE_WRAP_S, gl.CLAMP_TO_EDGE);
        gl.texParameteri(gl.TEXTURE_2D, gl.TEXTURE_WRAP_T, gl.CLAMP_TO_EDGE);
        gl.texParameteri(gl.TEXTURE_2D, gl.TEXTURE_MIN_FILTER, gl.LINEAR);
        gl.uniform1i(gl.getUniformLocation(program, 'u_image'), 0);
      }

      resolutionLoc = gl.getUniformLocation(program, 'u_resolution');
      gl.uniform2f(resolutionLoc, canvas.width, canvas.height);

      currentSource = source === video ? 'video' : 'image';
    }

    function render() {
      if (!canvas.isConnected) {
        cleanup();
        return;
      }

      gl.activeTexture(gl.TEXTURE0);
      gl.bindTexture(gl.TEXTURE_2D, texture);
      const source = currentSource === 'video' ? video : fallbackImage;
      gl.texImage2D(gl.TEXTURE_2D, 0, gl.RGBA, gl.RGBA, gl.UNSIGNED_BYTE, source);
      gl.drawArrays(gl.TRIANGLE_STRIP, 0, 4);

      if (currentSource === 'video' && videoPlaying) {
        animationId = requestAnimationFrame(render);
        if (currentState) currentState.animationId = animationId;
      }
    }

    function tryPlayVideo() {
      if (videoPlaying) return;
      video
        .play()
        .then(function () {
          videoPlaying = true;
          if (currentSource === 'image' && video.readyState >= 2) {
            setupCanvas(video);
          }
          if (!animationId) {
            render();
          }
        })
        .catch(function () {
          // Autoplay blocked - we'll try again on user interaction
        });
    }

    function onFirstInteraction() {
      tryPlayVideo();
      document.removeEventListener('click', onFirstInteraction);
      document.removeEventListener('touchstart', onFirstInteraction);
      document.removeEventListener('keydown', onFirstInteraction);
      document.removeEventListener('scroll', onFirstInteraction);
    }

    function onResize() {
      const source = currentSource === 'video' ? video : fallbackImage;
      if (currentSource === 'video' && video.readyState >= 2) {
        setupCanvas(video);
      } else if (currentSource === 'image' && fallbackImage.complete) {
        setupCanvas(fallbackImage);
      }
    }

    // Watch for dark mode changes to update colors
    var darkModeObserver = new MutationObserver(function (mutations) {
      mutations.forEach(function (mutation) {
        if (mutation.attributeName === 'class') {
          updateColors();
        }
      });
    });
    darkModeObserver.observe(document.documentElement, { attributes: true });

    // Store state for cleanup
    currentState = {
      animationId: null,
      loseContext: loseContext,
      onFirstInteraction: onFirstInteraction,
      onResize: onResize,
      onScroll: updateScroll,
      darkModeObserver: darkModeObserver,
    };

    document.addEventListener('click', onFirstInteraction);
    document.addEventListener('touchstart', onFirstInteraction);
    document.addEventListener('keydown', onFirstInteraction);
    document.addEventListener('scroll', onFirstInteraction);
    window.addEventListener('scroll', updateScroll, { passive: true });

    fallbackImage.addEventListener('load', function () {
      if (!currentSource) {
        setupCanvas(fallbackImage);
        render();
      }
    });

    video.addEventListener('loadeddata', function () {
      video
        .play()
        .then(function () {
          videoPlaying = true;
          setupCanvas(video);
          render();
        })
        .catch(function () {
          if (fallbackImage.complete && fallbackImage.naturalWidth) {
            setupCanvas(fallbackImage);
            render();
          }
        });
    });

    window.addEventListener('resize', onResize);
  }

  // Initialize on page load
  if (document.readyState === 'loading') {
    document.addEventListener('DOMContentLoaded', init);
  } else {
    init();
  }

  // Note: No HTMX listeners needed - header is preserved across navigations
  // via hx-select="main" which only swaps the main content area
})();

// Dithered image effect for .dithered-image elements
(function () {
  const DEFAULT_DITHER = 'atkinson';
  const FRAME_INTERVAL = 20; // ~20fps for subtle animation
  const REDUCED_MOTION = window.matchMedia('(prefers-reduced-motion: reduce)').matches;

  // Fragment shader with border fade + noise for jagged edges
  const fsSourceImage = `
    precision highp float;
    uniform sampler2D u_image;
    uniform sampler2D u_bayer;
    uniform vec2 u_resolution;
    uniform int u_ditherMode;
    uniform float u_time;
    varying vec2 v_texCoord;

    float hash(vec2 p) {
      vec3 p3 = fract(vec3(p.xyx) * 0.1031);
      p3 += dot(p3, p3.yzx + 33.33);
      return fract((p3.x + p3.y) * p3.z);
    }

    // Animated noise for the "alive" effect
    float animatedNoise(vec2 p, float t) {
      // Slow-moving noise pattern - transitions once per second
      float n1 = hash(p + floor(t));
      float n2 = hash(p + floor(t) + 1.0);
      float blend = fract(t);
      return mix(n1, n2, smoothstep(0.0, 1.0, blend));
    }

    float atkinsonThreshold(vec2 pos) {
      int x = int(mod(pos.x, 4.0));
      int y = int(mod(pos.y, 4.0));
      int idx = y * 4 + x;
      float thresholds[16];
      thresholds[0] = 0.0;    thresholds[1] = 12.0;  thresholds[2] = 3.0;   thresholds[3] = 15.0;
      thresholds[4] = 8.0;   thresholds[5] = 4.0;   thresholds[6] = 11.0;  thresholds[7] = 7.0;
      thresholds[8] = 2.0;   thresholds[9] = 14.0;  thresholds[10] = 1.0;  thresholds[11] = 13.0;
      thresholds[12] = 10.0; thresholds[13] = 6.0;  thresholds[14] = 9.0;  thresholds[15] = 5.0;
      for (int i = 0; i < 16; i++) {
        if (i == idx) return thresholds[i] / 16.0;
      }
      return 0.0;
    }

    void main() {
      vec4 color = texture2D(u_image, v_texCoord);
      float gray = dot(color.rgb, vec3(0.299, 0.587, 0.114));

      // Calculate distance from all edges with noise for jagged effect
      vec2 uv = gl_FragCoord.xy / u_resolution;
      float edgeNoise = hash(gl_FragCoord.xy * 0.5) * 0.15;

      float fadeLeft = smoothstep(0.0, 0.1 + edgeNoise, uv.x);
      float fadeRight = smoothstep(0.0, 0.1 + edgeNoise, 1.0 - uv.x);
      float fadeBottom = smoothstep(0.0, 0.1 + edgeNoise, uv.y);
      float fadeTop = smoothstep(0.0, 0.1 + edgeNoise, 1.0 - uv.y);

      float fade = fadeLeft * fadeRight * fadeBottom * fadeTop;
      gray *= fade;

      float threshold;
      if (u_ditherMode == 2) {
        threshold = hash(gl_FragCoord.xy);
      } else if (u_ditherMode == 1) {
        gray = gray * 1.2 - 0.1;
        gray = clamp(gray, 0.0, 1.0);
        threshold = atkinsonThreshold(gl_FragCoord.xy);
      } else {
        vec2 bayerCoord = mod(gl_FragCoord.xy, 8.0) / 8.0;
        threshold = texture2D(u_bayer, bayerCoord).r;
      }

      // Animated noise - affects the dither threshold to make bright pixels flicker
      vec2 noiseCoord = gl_FragCoord.xy * 0.15;
      float noise = animatedNoise(noiseCoord, u_time) - 0.5;

      // Subtle flicker - varies the threshold over time for organic movement
      float flicker = 0.08 * sin(u_time * 2.0 + hash(gl_FragCoord.xy * 0.2) * 6.28);

      // Effect intensity ramps up with brightness - no effect on dark areas
      // Starts at gray ~0.05, full effect at gray ~0.3+
      float effectIntensity = smoothstep(0.05, 0.3, gray);

      // Apply noise and flicker to the dither threshold, scaled by brightness
      float animatedThreshold = threshold + 0.1 + (noise * 0.15 + flicker) * effectIntensity;
      float dithered = step(animatedThreshold, gray);

      vec3 dark = vec3(0.067);
      vec3 cream = vec3(0.91, 0.835, 0.718);

      gl_FragColor = vec4(mix(dark, cream, dithered), 1.0);
    }
  `;

  const vsSource = `
    attribute vec2 a_position;
    attribute vec2 a_texCoord;
    varying vec2 v_texCoord;
    void main() {
      gl_Position = vec4(a_position, 0, 1);
      v_texCoord = a_texCoord;
    }
  `;

  function createShader(gl, type, source) {
    const shader = gl.createShader(type);
    gl.shaderSource(shader, source);
    gl.compileShader(shader);
    if (!gl.getShaderParameter(shader, gl.COMPILE_STATUS)) {
      console.error(gl.getShaderInfoLog(shader));
    }
    return shader;
  }

  function initDitheredImage(img) {
    // Wait for image to load before setting up canvas
    function setup() {
      const canvas = document.createElement('canvas');
      canvas.className = img.className.replace('dithered-image', '').trim();
      canvas.style.cssText = img.style.cssText;

      // Copy width/height attributes if the image has them (for fixed-size images)
      // Otherwise, let CSS handle responsive sizing with aspect-ratio
      if (img.hasAttribute('width')) {
        canvas.style.width = img.getAttribute('width') + 'px';
      }
      if (img.hasAttribute('height')) {
        canvas.style.height = img.getAttribute('height') + 'px';
      }
      // Set aspect ratio from image's natural dimensions for responsive sizing
      if (img.naturalWidth && img.naturalHeight) {
        canvas.style.aspectRatio = img.naturalWidth + ' / ' + img.naturalHeight;
      }

      const gl = canvas.getContext('webgl');
      if (!gl) {
        img.classList.remove('dithered-image');
        img.style.visibility = 'visible';
        return;
      }

      const vs = createShader(gl, gl.VERTEX_SHADER, vsSource);
      const fs = createShader(gl, gl.FRAGMENT_SHADER, fsSourceImage);
      const program = gl.createProgram();
      gl.attachShader(program, vs);
      gl.attachShader(program, fs);
      gl.linkProgram(program);
      gl.useProgram(program);

      // Position buffer
      const posBuffer = gl.createBuffer();
      gl.bindBuffer(gl.ARRAY_BUFFER, posBuffer);
      gl.bufferData(gl.ARRAY_BUFFER, new Float32Array([-1, -1, 1, -1, -1, 1, 1, 1]), gl.STATIC_DRAW);
      const posLoc = gl.getAttribLocation(program, 'a_position');
      gl.enableVertexAttribArray(posLoc);
      gl.vertexAttribPointer(posLoc, 2, gl.FLOAT, false, 0, 0);

      // Texture coord buffer
      const texBuffer = gl.createBuffer();
      gl.bindBuffer(gl.ARRAY_BUFFER, texBuffer);
      gl.bufferData(gl.ARRAY_BUFFER, new Float32Array([0, 0, 1, 0, 0, 1, 1, 1]), gl.STATIC_DRAW);
      const texLoc = gl.getAttribLocation(program, 'a_texCoord');
      gl.enableVertexAttribArray(texLoc);
      gl.vertexAttribPointer(texLoc, 2, gl.FLOAT, false, 0, 0);

      // Bayer matrix texture
      const bayer = new Uint8Array([
        0, 128, 32, 160, 8, 136, 40, 168, 192, 64, 224, 96, 200, 72, 232, 104, 48, 176, 16, 144, 56, 184, 24, 152, 240, 112, 208, 80, 248, 120, 216, 88, 12, 140, 44, 172, 4, 132, 36, 164, 204, 76,
        236, 108, 196, 68, 228, 100, 60, 188, 28, 156, 52, 180, 20, 148, 252, 124, 220, 92, 244, 116, 212, 84,
      ]);
      const bayerTex = gl.createTexture();
      gl.activeTexture(gl.TEXTURE1);
      gl.bindTexture(gl.TEXTURE_2D, bayerTex);
      gl.texParameteri(gl.TEXTURE_2D, gl.TEXTURE_WRAP_S, gl.REPEAT);
      gl.texParameteri(gl.TEXTURE_2D, gl.TEXTURE_WRAP_T, gl.REPEAT);
      gl.texParameteri(gl.TEXTURE_2D, gl.TEXTURE_MIN_FILTER, gl.NEAREST);
      gl.texParameteri(gl.TEXTURE_2D, gl.TEXTURE_MAG_FILTER, gl.NEAREST);
      gl.texImage2D(gl.TEXTURE_2D, 0, gl.LUMINANCE, 8, 8, 0, gl.LUMINANCE, gl.UNSIGNED_BYTE, bayer);
      gl.uniform1i(gl.getUniformLocation(program, 'u_bayer'), 1);

      // Dither mode
      const ditherModes = { gaussian: 0, atkinson: 1, noise: 2 };
      const urlParams = new URLSearchParams(window.location.search);
      const ditherParam = urlParams.get('dither');
      const ditherMode = ditherModes[ditherParam] ?? ditherModes[DEFAULT_DITHER];
      gl.uniform1i(gl.getUniformLocation(program, 'u_ditherMode'), ditherMode);

      // Image texture
      const texture = gl.createTexture();
      gl.activeTexture(gl.TEXTURE0);
      gl.bindTexture(gl.TEXTURE_2D, texture);
      gl.pixelStorei(gl.UNPACK_FLIP_Y_WEBGL, true);
      gl.texParameteri(gl.TEXTURE_2D, gl.TEXTURE_WRAP_S, gl.CLAMP_TO_EDGE);
      gl.texParameteri(gl.TEXTURE_2D, gl.TEXTURE_WRAP_T, gl.CLAMP_TO_EDGE);
      gl.texParameteri(gl.TEXTURE_2D, gl.TEXTURE_MIN_FILTER, gl.LINEAR);
      gl.uniform1i(gl.getUniformLocation(program, 'u_image'), 0);

      const resolutionLoc = gl.getUniformLocation(program, 'u_resolution');
      const timeLoc = gl.getUniformLocation(program, 'u_time');

      let startTime = performance.now();
      let needsResize = true;
      let isVisible = true;
      let lastFrameTime = 0;
      let animationId = null;
      let didCleanup = false;
      let observer = null;
      const loseContext = gl.getExtension('WEBGL_lose_context');

      function cleanup() {
        if (didCleanup) return;
        didCleanup = true;

        if (animationId) {
          cancelAnimationFrame(animationId);
          animationId = null;
        }

        if (observer) {
          observer.disconnect();
          observer = null;
        }

        window.removeEventListener('resize', onResize);
        if (loseContext) {
          loseContext.loseContext();
        }

        delete canvas.__darkDitherCleanup;
      }

      function onResize() {
        needsResize = true;
      }

      canvas.__darkDitherCleanup = cleanup;

      // Upload texture once (image is static)
      gl.activeTexture(gl.TEXTURE0);
      gl.bindTexture(gl.TEXTURE_2D, texture);
      gl.texImage2D(gl.TEXTURE_2D, 0, gl.RGBA, gl.RGBA, gl.UNSIGNED_BYTE, img);

      function render(timestamp) {
        if (!canvas.isConnected) {
          cleanup();
          return;
        }

        // Throttle to ~10fps
        if (timestamp - lastFrameTime < FRAME_INTERVAL) {
          if (isVisible && !REDUCED_MOTION) {
            animationId = requestAnimationFrame(render);
          }
          return;
        }
        lastFrameTime = timestamp;

        if (needsResize) {
          const rect = canvas.getBoundingClientRect();
          canvas.width = rect.width * window.devicePixelRatio;
          canvas.height = rect.height * window.devicePixelRatio;
          gl.viewport(0, 0, canvas.width, canvas.height);
          gl.uniform2f(resolutionLoc, canvas.width, canvas.height);
          needsResize = false;
        }

        // Update time uniform for animation (2000 = half speed)
        const elapsed = (performance.now() - startTime) / 2000.0;
        gl.uniform1f(timeLoc, elapsed);

        gl.drawArrays(gl.TRIANGLE_STRIP, 0, 4);

        // Continue animation only if visible and motion allowed
        if (isVisible && !REDUCED_MOTION) {
          animationId = requestAnimationFrame(render);
        }
      }

      // Replace image with canvas
      if (!img.parentNode) {
        cleanup();
        return;
      }
      img.parentNode.replaceChild(canvas, img);

      // Initial render
      render(performance.now());

      // Pause animation when off-screen
      observer = new IntersectionObserver(
        function (entries) {
          if (!canvas.isConnected) {
            cleanup();
            return;
          }

          isVisible = entries[0].isIntersecting;
          if (isVisible && !REDUCED_MOTION && !animationId) {
            animationId = requestAnimationFrame(render);
          } else if (!isVisible && animationId) {
            cancelAnimationFrame(animationId);
            animationId = null;
          }
        },
        { threshold: 0 }
      );
      observer.observe(canvas);

      window.addEventListener('resize', onResize);
    }

    // Ensure image is loaded before setup (fixes race condition)
    if (img.complete && img.naturalWidth > 0) {
      setup();
    } else {
      img.onload = setup;
    }
  }

  // Initialize all dithered images (re-run after PJAX navigations)
  function init(root) {
    (root || document).querySelectorAll('.dithered-image').forEach(initDitheredImage);
  }

  function initDocument() {
    init(document);
  }

  if (document.readyState === 'loading') {
    document.addEventListener('DOMContentLoaded', initDocument);
  } else {
    initDocument();
  }

  document.addEventListener('htmx:afterSettle', initDocument);
  document.addEventListener('htmx:beforeSwap', () => {
    document.querySelectorAll('canvas').forEach((canvas) => {
      const cleanup = canvas.__darkDitherCleanup;
      if (typeof cleanup === 'function') {
        cleanup();
      }
    });
  });
})();

// htmx configuration
(function () {
  if (typeof htmx === 'undefined') return;

  // Don't scroll target into view - we handle scroll via hx-swap show:window:top
  htmx.config.scrollIntoViewOnBoost = false;

  // Fall back to native navigation on htmx errors
  function htmxFallbackToNative(evt) {
    var path = evt.detail.pathInfo?.requestPath || evt.detail.requestConfig?.path;
    if (path) {
      window.location.href = path;
    }
  }

  // Network error (offline, DNS failure, etc.)
  htmx.on('htmx:sendError', htmxFallbackToNative);
  // Swap error (invalid HTML, can't find target, etc.)
  htmx.on('htmx:swapError', htmxFallbackToNative);
  // Server error responses (4xx, 5xx) - let browser handle natively
  htmx.on('htmx:responseError', htmxFallbackToNative);
})();

// Update nav aria-current after HTMX navigation
// (nav is preserved across navigations, so we update state via JS)
(function () {
  function updateNavState() {
    var path = window.location.pathname;
    document.querySelectorAll('nav a[href]').forEach(function (link) {
      var href = link.getAttribute('href');
      var isCurrent = false;

      if (href === '/') {
        // About: exact match for root
        isCurrent = path === '/' || path === '/index.html';
      } else {
        // Blog, Now, etc: match if path starts with href
        isCurrent = path.startsWith(href);
      }

      if (isCurrent) {
        link.setAttribute('aria-current', 'page');
      } else {
        link.removeAttribute('aria-current');
      }
    });
  }

  document.addEventListener('htmx:afterSettle', updateNavState);
})();

// Background warmth scroll effect - transitions from cold to warm as you scroll
(function () {
  // Parse hex color to RGB array
  function hexToRgb(hex) {
    hex = hex.trim().replace('#', '');
    if (hex.length === 3) {
      hex = hex[0] + hex[0] + hex[1] + hex[1] + hex[2] + hex[2];
    }
    return [parseInt(hex.slice(0, 2), 16), parseInt(hex.slice(2, 4), 16), parseInt(hex.slice(4, 6), 16)];
  }

  // Interpolate between two colors
  function lerpColor(color1, color2, t) {
    return [Math.round(color1[0] + (color2[0] - color1[0]) * t), Math.round(color1[1] + (color2[1] - color1[1]) * t), Math.round(color1[2] + (color2[2] - color1[2]) * t)];
  }

  // Convert RGB array to CSS rgb() string
  function rgbToCss(rgb) {
    return 'rgb(' + rgb[0] + ',' + rgb[1] + ',' + rgb[2] + ')';
  }

  // Get current color endpoints from CSS
  function getColorEndpoints() {
    var style = getComputedStyle(document.documentElement);
    return {
      start: hexToRgb(style.getPropertyValue('--bg-start').trim()),
      end: hexToRgb(style.getPropertyValue('--bg-end').trim()),
    };
  }

  var colors = null;
  var headerHeight = 256; // fallback

  function updateWarmth() {
    if (!colors) colors = getColorEndpoints();

    // Very aggressive warmth transition - complete within 30% of header height
    var scrollDistance = headerHeight * 0.3;
    var progress = Math.min(1.0, window.scrollY / scrollDistance);
    // Ease the progress for smoother transition
    progress = progress * progress * (3 - 2 * progress);

    var currentColor = lerpColor(colors.start, colors.end, progress);
    document.body.style.backgroundColor = rgbToCss(currentColor);
  }

  function init() {
    var header = document.querySelector('.header-image');
    if (header) {
      headerHeight = header.offsetHeight;
    }
    colors = getColorEndpoints();
    updateWarmth();
  }

  // Re-init on dark mode change
  var observer = new MutationObserver(function (mutations) {
    mutations.forEach(function (mutation) {
      if (mutation.attributeName === 'class') {
        colors = getColorEndpoints();
        updateWarmth();
      }
    });
  });
  observer.observe(document.documentElement, { attributes: true });

  window.addEventListener('scroll', updateWarmth, { passive: true });
  window.addEventListener('resize', function () {
    var header = document.querySelector('.header-image');
    if (header) headerHeight = header.offsetHeight;
  });

  if (document.readyState === 'loading') {
    document.addEventListener('DOMContentLoaded', init);
  } else {
    init();
  }

  document.addEventListener('htmx:afterSettle', init);
})();
