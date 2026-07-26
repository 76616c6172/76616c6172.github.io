(function(){let Z=null,X=0,U=`
    attribute vec2 a_position;
    attribute vec2 a_texCoord;
    varying vec2 v_texCoord;
    void main() {
      gl_Position = vec4(a_position, 0, 1);
      v_texCoord = a_texCoord;
    }
  `,Y=`
    precision highp float;
    uniform sampler2D u_image;
    uniform vec2 u_resolution;
    uniform vec3 u_bgColor;    // Background color from CSS --bg
    uniform vec3 u_fgColor;    // Foreground (wave) color from CSS --wave-fg
    uniform float u_scroll;    // Scroll progress (0 = top, 1 = scrolled past header)
    varying vec2 v_texCoord;


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

      gray = clamp(gray * 1.2 - 0.1, 0.0, 1.0);
      float threshold = atkinsonThreshold(gl_FragCoord.xy);

      // Add small offset so gray=0 always renders as dark
      float dithered = step(threshold + 0.1, gray);
      gl_FragColor = vec4(mix(u_bgColor, u_fgColor, dithered), 1.0);
    }
  `;function _(G,j,V){let J=G.createShader(j);if(G.shaderSource(J,V),G.compileShader(J),!G.getShaderParameter(J,G.COMPILE_STATUS))console.error(G.getShaderInfoLog(J));return J}function D(G){if(G=G.trim().replace("#",""),G.length===3)G=G[0]+G[0]+G[1]+G[1]+G[2]+G[2];return[parseInt(G.slice(0,2),16)/255,parseInt(G.slice(2,4),16)/255,parseInt(G.slice(4,6),16)/255]}function L(){var G=getComputedStyle(document.documentElement),j=D(G.getPropertyValue("--bg-start").trim()),V=D(G.getPropertyValue("--bg-end").trim());return[j[0]+(V[0]-j[0])*X,j[1]+(V[1]-j[1])*X,j[2]+(V[2]-j[2])*X]}function M(){var G=getComputedStyle(document.documentElement).getPropertyValue("--wave-fg").trim();return D(G)}function P(){if(!Z)return;if(Z.animationId)cancelAnimationFrame(Z.animationId);if(document.removeEventListener("click",Z.onFirstInteraction),document.removeEventListener("touchstart",Z.onFirstInteraction),document.removeEventListener("keydown",Z.onFirstInteraction),document.removeEventListener("scroll",Z.onFirstInteraction),window.removeEventListener("resize",Z.onResize),window.removeEventListener("scroll",Z.onScroll),Z.darkModeObserver)Z.darkModeObserver.disconnect();if(Z.loseContext)Z.loseContext.loseContext();Z=null}function K(){P();let G=document.getElementById("header-canvas");if(!G)return;let j=G.getContext("webgl");if(!j)return;let V=j.getExtension("WEBGL_lose_context"),J=_(j,j.VERTEX_SHADER,U),W=_(j,j.FRAGMENT_SHADER,Y),Q=j.createProgram();j.attachShader(Q,J),j.attachShader(Q,W),j.linkProgram(Q),j.useProgram(Q);let q=j.createBuffer();j.bindBuffer(j.ARRAY_BUFFER,q),j.bufferData(j.ARRAY_BUFFER,new Float32Array([-1,-1,1,-1,-1,1,1,1]),j.STATIC_DRAW);let h=j.getAttribLocation(Q,"a_position");j.enableVertexAttribArray(h),j.vertexAttribPointer(h,2,j.FLOAT,!1,0,0);let c=j.getAttribLocation(Q,"a_texCoord");j.enableVertexAttribArray(c);let O=j.getUniformLocation(Q,"u_bgColor"),l=j.getUniformLocation(Q,"u_fgColor");function b(){var A=L(),B=M();j.uniform3f(O,A[0],A[1],A[2]),j.uniform3f(l,B[0],B[1],B[2])}b();let n=j.getUniformLocation(Q,"u_scroll"),u=G.parentElement;j.uniform1f(n,0);function d(){var A=G.offsetHeight,B=A*0.3;X=Math.min(1,window.scrollY/B),X=X*X*(3-2*X);var I=Math.min(1,window.scrollY/A),w=I*I*(3-2*I);if(j.uniform1f(n,w),b(),R==="image"&&G.isConnected)k();var N=1-w*0.15,F=w*-10;u.style.transform="scaleY("+N+") translateY("+F+"px)",u.style.opacity=1-w*0.3}let i=window.innerWidth<768,$=document.createElement("video");$.crossOrigin="anonymous",$.loop=!0,$.muted=!0,$.autoplay=!0,$.playsInline=!0,$.src=i?"/static/waves-mobile.mp4":"/static/waves.mp4";let z=new Image;z.crossOrigin="anonymous",z.src=i?"/static/waves-mobile-fallback.jpg":"/static/waves-fallback.jpg";let p=null,m=null,x=null,v=null,R=null,H=!1;function T(A){let B=A===$?$.videoWidth:z.naturalWidth,I=A===$?$.videoHeight:z.naturalHeight;if(!B||!I)return;G.width=G.offsetWidth*window.devicePixelRatio,G.height=G.offsetHeight*window.devicePixelRatio,j.viewport(0,0,G.width,G.height);let w=G.width/G.height,N=B/I,F=1,S=0,s=0,g=1;if(N>w)s=(1-w/N)/2,g=1-s;else F=N/w,S=0;if(!m)m=j.createBuffer();if(j.bindBuffer(j.ARRAY_BUFFER,m),j.bufferData(j.ARRAY_BUFFER,new Float32Array([s,S,g,S,s,F,g,F]),j.STATIC_DRAW),j.vertexAttribPointer(c,2,j.FLOAT,!1,0,0),!p)p=j.createTexture(),j.activeTexture(j.TEXTURE0),j.bindTexture(j.TEXTURE_2D,p),j.pixelStorei(j.UNPACK_FLIP_Y_WEBGL,!0),j.texParameteri(j.TEXTURE_2D,j.TEXTURE_WRAP_S,j.CLAMP_TO_EDGE),j.texParameteri(j.TEXTURE_2D,j.TEXTURE_WRAP_T,j.CLAMP_TO_EDGE),j.texParameteri(j.TEXTURE_2D,j.TEXTURE_MIN_FILTER,j.LINEAR),j.uniform1i(j.getUniformLocation(Q,"u_image"),0);x=j.getUniformLocation(Q,"u_resolution"),j.uniform2f(x,G.width,G.height),R=A===$?"video":"image"}function k(){if(!G.isConnected){P();return}j.activeTexture(j.TEXTURE0),j.bindTexture(j.TEXTURE_2D,p);let A=R==="video"?$:z;if(j.texImage2D(j.TEXTURE_2D,0,j.RGBA,j.RGBA,j.UNSIGNED_BYTE,A),j.drawArrays(j.TRIANGLE_STRIP,0,4),R==="video"&&H){if(v=requestAnimationFrame(k),Z)Z.animationId=v}}function E(){if(H)return;$.play().then(function(){if(H=!0,R==="image"&&$.readyState>=2)T($);if(!v)k()}).catch(function(){})}function y(){E(),document.removeEventListener("click",y),document.removeEventListener("touchstart",y),document.removeEventListener("keydown",y),document.removeEventListener("scroll",y)}function f(){let A=R==="video"?$:z;if(R==="video"&&$.readyState>=2)T($);else if(R==="image"&&z.complete)T(z)}var C=new MutationObserver(function(A){A.forEach(function(B){if(B.attributeName==="class"){if(b(),R==="image"&&G.isConnected)k()}})});C.observe(document.documentElement,{attributes:!0,attributeFilter:["class"]}),Z={animationId:null,loseContext:V,onFirstInteraction:y,onResize:f,onScroll:d,darkModeObserver:C},document.addEventListener("click",y),document.addEventListener("touchstart",y),document.addEventListener("keydown",y),document.addEventListener("scroll",y),window.addEventListener("scroll",d,{passive:!0}),z.addEventListener("load",function(){if(!R)T(z),k()}),$.addEventListener("loadeddata",function(){$.play().then(function(){H=!0,T($),k()}).catch(function(){if(z.complete&&z.naturalWidth)T(z),k()})}),window.addEventListener("resize",f)}if(document.readyState==="loading")document.addEventListener("DOMContentLoaded",K);else K()})();(function(){let X=window.matchMedia("(prefers-reduced-motion: reduce)").matches,U=0;function Y(J){if(J=J.trim().replace("#",""),J.length===3)J=J[0]+J[0]+J[1]+J[1]+J[2]+J[2];return[parseInt(J.slice(0,2),16)/255,parseInt(J.slice(2,4),16)/255,parseInt(J.slice(4,6),16)/255]}function _(){var J=getComputedStyle(document.documentElement),W=Y(J.getPropertyValue("--bg-start").trim()),Q=Y(J.getPropertyValue("--bg-end").trim());return[W[0]+(Q[0]-W[0])*U,W[1]+(Q[1]-W[1])*U,W[2]+(Q[2]-W[2])*U]}function D(){return Y(getComputedStyle(document.documentElement).getPropertyValue("--wave-fg").trim())}function L(){var J=document.querySelector(".header-image"),W=J?J.offsetHeight:256,Q=W*0.3,q=Math.min(1,window.scrollY/Q);U=q*q*(3-2*q)}let M=`
    precision highp float;
    uniform sampler2D u_image;
    uniform vec2 u_resolution;
    uniform float u_time;
    uniform vec3 u_bgColor;
    uniform vec3 u_fgColor;
    uniform float u_invert;
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


    float clustered4Threshold(vec2 pos) {
      int x = int(mod(pos.x, 4.0));
      int y = int(mod(pos.y, 4.0));
      int idx = y * 4 + x;
      float thresholds[16];
      thresholds[0] = 12.0;  thresholds[1] = 5.0;   thresholds[2] = 6.0;   thresholds[3] = 13.0;
      thresholds[4] = 4.0;   thresholds[5] = 0.0;   thresholds[6] = 1.0;   thresholds[7] = 7.0;
      thresholds[8] = 11.0;  thresholds[9] = 3.0;   thresholds[10] = 2.0;  thresholds[11] = 8.0;
      thresholds[12] = 15.0; thresholds[13] = 10.0; thresholds[14] = 9.0;  thresholds[15] = 14.0;
      for (int i = 0; i < 16; i++) {
        if (i == idx) return thresholds[i] / 16.0;
      }
      return 0.0;
    }

    void main() {
      vec4 color = texture2D(u_image, v_texCoord);
      float gray = dot(color.rgb, vec3(0.299, 0.587, 0.114));

      // Invert grayscale in light mode so face renders correctly
      gray = mix(gray, 1.0 - gray, u_invert);

      // Calculate distance from all edges with noise for jagged effect
      vec2 uv = gl_FragCoord.xy / u_resolution;
      float edgeNoise = hash(gl_FragCoord.xy * 0.5) * 0.15;

      float fadeLeft = smoothstep(0.0, 0.1 + edgeNoise, uv.x);
      float fadeRight = smoothstep(0.0, 0.1 + edgeNoise, 1.0 - uv.x);
      float fadeBottom = smoothstep(0.0, 0.1 + edgeNoise, uv.y);
      float fadeTop = smoothstep(0.0, 0.1 + edgeNoise, 1.0 - uv.y);

      float fade = fadeLeft * fadeRight * fadeBottom * fadeTop;
      gray *= fade;

      gray = clamp(gray * 1.15 - 0.05, 0.0, 1.0);
      float threshold = clustered4Threshold(gl_FragCoord.xy);

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

      gl_FragColor = vec4(mix(u_bgColor, u_fgColor, dithered), 1.0);
    }
  `,P=`
    attribute vec2 a_position;
    attribute vec2 a_texCoord;
    varying vec2 v_texCoord;
    void main() {
      gl_Position = vec4(a_position, 0, 1);
      v_texCoord = a_texCoord;
    }
  `;function K(J,W,Q){let q=J.createShader(W);if(J.shaderSource(q,Q),J.compileShader(q),!J.getShaderParameter(q,J.COMPILE_STATUS))console.error(J.getShaderInfoLog(q));return q}function G(J){function W(){let Q=document.createElement("canvas");if(Q.className=J.className.replace("dithered-image","").trim(),Q.style.cssText=J.style.cssText,J.hasAttribute("width"))Q.style.width=J.getAttribute("width")+"px";if(J.hasAttribute("height"))Q.style.height=J.getAttribute("height")+"px";if(J.naturalWidth&&J.naturalHeight)Q.style.aspectRatio=J.naturalWidth+" / "+J.naturalHeight;let q=Q.getContext("webgl");if(!q){J.classList.remove("dithered-image"),J.style.visibility="visible";return}let h=K(q,q.VERTEX_SHADER,P),c=K(q,q.FRAGMENT_SHADER,M),O=q.createProgram();q.attachShader(O,h),q.attachShader(O,c),q.linkProgram(O),q.useProgram(O);let l=q.createBuffer();q.bindBuffer(q.ARRAY_BUFFER,l),q.bufferData(q.ARRAY_BUFFER,new Float32Array([-1,-1,1,-1,-1,1,1,1]),q.STATIC_DRAW);let b=q.getAttribLocation(O,"a_position");q.enableVertexAttribArray(b),q.vertexAttribPointer(b,2,q.FLOAT,!1,0,0);let n=q.createBuffer();q.bindBuffer(q.ARRAY_BUFFER,n),q.bufferData(q.ARRAY_BUFFER,new Float32Array([0,0,1,0,0,1,1,1]),q.STATIC_DRAW);let u=q.getAttribLocation(O,"a_texCoord");q.enableVertexAttribArray(u),q.vertexAttribPointer(u,2,q.FLOAT,!1,0,0);let d=q.createTexture();q.activeTexture(q.TEXTURE0),q.bindTexture(q.TEXTURE_2D,d),q.pixelStorei(q.UNPACK_FLIP_Y_WEBGL,!0),q.texParameteri(q.TEXTURE_2D,q.TEXTURE_WRAP_S,q.CLAMP_TO_EDGE),q.texParameteri(q.TEXTURE_2D,q.TEXTURE_WRAP_T,q.CLAMP_TO_EDGE),q.texParameteri(q.TEXTURE_2D,q.TEXTURE_MIN_FILTER,q.LINEAR),q.uniform1i(q.getUniformLocation(O,"u_image"),0);let i=q.getUniformLocation(O,"u_resolution"),$=q.getUniformLocation(O,"u_time"),z=q.getUniformLocation(O,"u_bgColor"),p=q.getUniformLocation(O,"u_fgColor"),m=q.getUniformLocation(O,"u_invert");function x(){var N=_(),F=D();q.uniform3f(z,N[0],N[1],N[2]),q.uniform3f(p,F[0],F[1],F[2]);var S=document.documentElement.classList.contains("dark");q.uniform1f(m,S?0:1)}function v(){if(L(),x(),!E&&Q.isConnected)H=!0,w(performance.now())}L(),x();let R=performance.now(),H=!0,T=!0,k=0,E=null,y=!1,f=null,C=null,A=q.getExtension("WEBGL_lose_context");function B(){if(y)return;if(y=!0,E)cancelAnimationFrame(E),E=null;if(f)f.disconnect(),f=null;if(C)C.disconnect(),C=null;if(window.removeEventListener("resize",I),window.removeEventListener("scroll",v),A)A.loseContext();delete Q.__darkDitherCleanup}function I(){H=!0}Q.__darkDitherCleanup=B,q.activeTexture(q.TEXTURE0),q.bindTexture(q.TEXTURE_2D,d),q.texImage2D(q.TEXTURE_2D,0,q.RGBA,q.RGBA,q.UNSIGNED_BYTE,J);function w(N){if(!Q.isConnected){B();return}if(N-k<20){if(T&&!X)E=requestAnimationFrame(w);return}if(k=N,H){let S=Q.getBoundingClientRect();Q.width=S.width*window.devicePixelRatio,Q.height=S.height*window.devicePixelRatio,q.viewport(0,0,Q.width,Q.height),q.uniform2f(i,Q.width,Q.height),H=!1}let F=(performance.now()-R)/2000;if(q.uniform1f($,F),q.drawArrays(q.TRIANGLE_STRIP,0,4),T&&!X)E=requestAnimationFrame(w)}if(!J.parentNode){B();return}J.parentNode.replaceChild(Q,J),w(performance.now()),f=new IntersectionObserver(function(N){if(!Q.isConnected){B();return}if(T=N[0].isIntersecting,T&&!X&&!E)E=requestAnimationFrame(w);else if(!T&&E)cancelAnimationFrame(E),E=null},{threshold:0}),f.observe(Q),C=new MutationObserver(function(N){N.forEach(function(F){if(F.attributeName==="class"){if(x(),!E&&Q.isConnected)H=!0,w(performance.now())}})}),C.observe(document.documentElement,{attributes:!0,attributeFilter:["class"]}),window.addEventListener("resize",I),window.addEventListener("scroll",v,{passive:!0})}if(J.complete&&J.naturalWidth>0)W();else J.onload=W}function j(J){(J||document).querySelectorAll(".dithered-image").forEach(G)}function V(){j(document)}if(document.readyState==="loading")document.addEventListener("DOMContentLoaded",V);else V();document.addEventListener("htmx:afterSettle",V),document.addEventListener("htmx:beforeSwap",()=>{document.querySelectorAll("canvas").forEach((J)=>{let W=J.__darkDitherCleanup;if(typeof W==="function")W()})})})();(function(){if(typeof htmx>"u")return;htmx.config.scrollIntoViewOnBoost=!1;function Z(X){var U=X.detail.pathInfo?.requestPath||X.detail.requestConfig?.path;if(U)window.location.href=U}htmx.on("htmx:sendError",Z),htmx.on("htmx:swapError",Z),htmx.on("htmx:responseError",Z)})();(function(){function Z(){var X=window.location.pathname;document.querySelectorAll("nav a[href]").forEach(function(U){var Y=U.getAttribute("href"),_=!1;if(Y==="/")_=X==="/"||X==="/index.html";else _=X.startsWith(Y);if(_)U.setAttribute("aria-current","page");else U.removeAttribute("aria-current")})}document.addEventListener("htmx:afterSettle",Z)})();(function(){function Z(K){if(K=K.trim().replace("#",""),K.length===3)K=K[0]+K[0]+K[1]+K[1]+K[2]+K[2];return[parseInt(K.slice(0,2),16),parseInt(K.slice(2,4),16),parseInt(K.slice(4,6),16)]}function X(K,G,j){return[Math.round(K[0]+(G[0]-K[0])*j),Math.round(K[1]+(G[1]-K[1])*j),Math.round(K[2]+(G[2]-K[2])*j)]}function U(K){return"rgb("+K[0]+","+K[1]+","+K[2]+")"}function Y(){var K=getComputedStyle(document.documentElement);return{start:Z(K.getPropertyValue("--bg-start").trim()),end:Z(K.getPropertyValue("--bg-end").trim())}}var _=null,D=256;function L(){if(!_)_=Y();var K=D*0.3,G=Math.min(1,window.scrollY/K);G=G*G*(3-2*G);var j=X(_.start,_.end,G);document.documentElement.style.setProperty("--bg",U(j))}function M(){var K=document.querySelector(".header-image");if(K)D=K.offsetHeight;_=Y(),L()}var P=new MutationObserver(function(K){K.forEach(function(G){if(G.attributeName==="class")_=Y(),L()})});if(P.observe(document.documentElement,{attributes:!0,attributeFilter:["class"]}),window.addEventListener("scroll",L,{passive:!0}),window.addEventListener("resize",function(){var K=document.querySelector(".header-image");if(K)D=K.offsetHeight}),document.readyState==="loading")document.addEventListener("DOMContentLoaded",M);else M();document.addEventListener("htmx:afterSettle",M)})();(function(){var Z=document.documentElement,X=document.createElement("div"),U,Y=!1,_=0,D=0;X.className="overlay-scrollbar",X.setAttribute("aria-hidden","true"),document.body.appendChild(X);function L(){var G=window.innerHeight,j=Math.max(Z.scrollHeight,document.body.scrollHeight),V=Math.max(32,G*G/j);return{viewportHeight:G,maxScroll:Math.max(0,j-G),thumbHeight:V,maxThumbTravel:Math.max(0,G-V)}}function M(){var G=L();if(X.hidden=G.maxScroll===0,X.hidden)return;var j=window.scrollY/G.maxScroll*G.maxThumbTravel;X.style.height=G.thumbHeight+"px",X.style.transform="translateY("+j+"px)"}function P(){if(X.hidden)return;X.classList.add("is-visible"),clearTimeout(U),U=setTimeout(function(){if(!Y)X.classList.remove("is-visible")},700)}function K(G){if(!Y)return;if(Y=!1,X.hasPointerCapture(G.pointerId))X.releasePointerCapture(G.pointerId);P()}X.addEventListener("pointerdown",function(G){G.preventDefault(),Y=!0,_=G.clientY,D=window.scrollY,X.setPointerCapture(G.pointerId),P()}),X.addEventListener("pointermove",function(G){if(!Y)return;var j=L();if(!j.maxThumbTravel)return;var V=(G.clientY-_)/j.maxThumbTravel*j.maxScroll;window.scrollTo(0,D+V)}),X.addEventListener("pointerup",K),X.addEventListener("pointercancel",K),window.addEventListener("scroll",function(){M(),P()},{passive:!0}),window.addEventListener("resize",M),window.addEventListener("load",M,{once:!0}),document.addEventListener("pointermove",function(G){if(window.innerWidth-G.clientX<=20)P()},{passive:!0}),document.addEventListener("htmx:afterSettle",M),M()})();
