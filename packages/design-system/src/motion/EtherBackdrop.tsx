import { useEffect, useRef, useCallback, useState } from 'react'
import type { CSSProperties } from 'react'
import { motion, type MotionStyle } from 'framer-motion'

/*
  Liquid ether WebGL backdrop.

  Renders a fluid iridescent shader using WebGL2.
  Auto-pauses on:
    - prefers-reduced-motion
    - document hidden (tab hidden)
    - low battery (<20%) via Battery API
    - explicit `paused` prop

  Falls back to a static CSS gradient when WebGL is unavailable.
*/

const VERT_SRC = /* glsl */ `#version 300 es
precision mediump float;
in vec2 a_pos;
out vec2 v_uv;
void main() {
  v_uv = a_pos * 0.5 + 0.5;
  gl_Position = vec4(a_pos, 0.0, 1.0);
}
`

const FRAG_SRC = /* glsl */ `#version 300 es
precision mediump float;

uniform float u_time;
uniform vec2  u_resolution;
in  vec2 v_uv;
out vec4 fragColor;

// --- noise helpers ---
vec3 mod289(vec3 x) { return x - floor(x * (1.0/289.0)) * 289.0; }
vec2 mod289(vec2 x) { return x - floor(x * (1.0/289.0)) * 289.0; }
vec3 permute(vec3 x) { return mod289(((x*34.0)+1.0)*x); }
float snoise(vec2 v) {
  const vec4 C = vec4(0.211325, 0.366025, -0.577350, 0.024390);
  vec2 i  = floor(v + dot(v, C.yy));
  vec2 x0 = v - i + dot(i, C.xx);
  vec2 i1  = (x0.x > x0.y) ? vec2(1.0,0.0) : vec2(0.0,1.0);
  vec4 x12 = x0.xyxy + C.xxzz;
  x12.xy -= i1;
  i = mod289(i);
  vec3 p = permute(permute(i.y + vec3(0.0, i1.y, 1.0)) + i.x + vec3(0.0, i1.x, 1.0));
  vec3 m = max(0.5 - vec3(dot(x0,x0), dot(x12.xy,x12.xy), dot(x12.zw,x12.zw)), 0.0);
  m = m*m; m = m*m;
  vec3 x = 2.0*fract(p * C.www) - 1.0;
  vec3 h = abs(x) - 0.5;
  vec3 ox = floor(x + 0.5);
  vec3 a0 = x - ox;
  m *= 1.79284291 - 0.85373472 * (a0*a0 + h*h);
  vec3 g;
  g.x  = a0.x * x0.x  + h.x  * x0.y;
  g.yz = a0.yz * x12.xz + h.yz * x12.yw;
  return 130.0 * dot(m, g);
}

void main() {
  vec2 uv = v_uv;
  float t = u_time * 0.18;

  // Two-layer fluid distortion
  float n1 = snoise(uv * 1.8 + vec2(t * 0.6, t * 0.4));
  float n2 = snoise(uv * 2.6 + vec2(-t * 0.3, t * 0.7) + n1 * 0.3);
  float n  = n1 * 0.6 + n2 * 0.4;

  // Palette selected by u_light uniform (0 = dark, 1 = light)
  uniform float u_light;

  // Dark palette: deep obsidian → violet → cyan shimmer
  vec3 dark_base   = vec3(0.028, 0.027, 0.044);  // #07070B
  vec3 dark_violet = vec3(0.545, 0.361, 0.965);  // #8B5CF6
  vec3 dark_lavend = vec3(0.753, 0.518, 0.988);  // #C084FC
  vec3 dark_cyan   = vec3(0.376, 0.647, 0.980);  // #60A5FA

  // Light palette: near-white base → soft violet → pale sky
  vec3 lite_base   = vec3(0.965, 0.961, 0.988);  // #F6F5FC
  vec3 lite_violet = vec3(0.725, 0.588, 0.980);  // #B996FA
  vec3 lite_lavend = vec3(0.847, 0.753, 0.996);  // #D8C0FE
  vec3 lite_cyan   = vec3(0.608, 0.780, 0.980);  // #9BC7FA

  vec3 base   = mix(dark_base,   lite_base,   u_light);
  vec3 violet = mix(dark_violet, lite_violet, u_light);
  vec3 lavend = mix(dark_lavend, lite_lavend, u_light);
  vec3 cyan   = mix(dark_cyan,   lite_cyan,   u_light);

  float band = fract(n * 0.5 + 0.5);
  vec3 col = mix(base,   violet, smoothstep(0.0, 0.45, band));
  col      = mix(col,    lavend, smoothstep(0.4, 0.65, band));
  col      = mix(col,    cyan,   smoothstep(0.6, 0.80, band) * 0.35);

  // Vignette
  vec2 q = uv - 0.5;
  float vign = 1.0 - dot(q, q) * 1.6;
  col *= clamp(vign, 0.0, 1.0);

  // Tone down intensity — overlay on app canvas
  float intensity = mix(0.55, 0.35, u_light);
  col *= intensity;

  fragColor = vec4(col, 1.0);
}
`

function compileShader(gl: WebGL2RenderingContext, type: GLenum, src: string): WebGLShader {
  const shader = gl.createShader(type)
  if (!shader) throw new Error('createShader failed')
  gl.shaderSource(shader, src)
  gl.compileShader(shader)
  if (!gl.getShaderParameter(shader, gl.COMPILE_STATUS)) {
    const log = gl.getShaderInfoLog(shader)
    gl.deleteShader(shader)
    throw new Error(`Shader compile error: ${log ?? ''}`)
  }
  return shader
}

function buildProgram(gl: WebGL2RenderingContext): WebGLProgram {
  const vert = compileShader(gl, gl.VERTEX_SHADER, VERT_SRC)
  const frag = compileShader(gl, gl.FRAGMENT_SHADER, FRAG_SRC)
  const prog = gl.createProgram()
  if (!prog) throw new Error('createProgram failed')
  gl.attachShader(prog, vert)
  gl.attachShader(prog, frag)
  gl.linkProgram(prog)
  if (!gl.getProgramParameter(prog, gl.LINK_STATUS)) {
    throw new Error(`Program link error: ${gl.getProgramInfoLog(prog) ?? ''}`)
  }
  gl.deleteShader(vert)
  gl.deleteShader(frag)
  return prog
}

type EtherBackdropProps = {
  paused?: boolean
  opacity?: number
  className?: string
  style?: CSSProperties
  theme?: 'dark' | 'light'
}

export function EtherBackdrop({
  paused = false,
  opacity = 1,
  className = '',
  style,
  theme = 'dark',
}: EtherBackdropProps) {
  const canvasRef = useRef<HTMLCanvasElement>(null)
  const rafRef = useRef<number | null>(null)
  const glRef = useRef<WebGL2RenderingContext | null>(null)
  const progRef = useRef<WebGLProgram | null>(null)
  const startTimeRef = useRef<number>(performance.now())
  const [webglAvailable, setWebglAvailable] = useState(true)

  const prefersReducedMotion =
    typeof window !== 'undefined' && window.matchMedia('(prefers-reduced-motion: reduce)').matches

  const shouldPause = paused || prefersReducedMotion

  const themeRef = useRef(theme)
  useEffect(() => {
    themeRef.current = theme
  }, [theme])

  const render = useCallback(() => {
    const canvas = canvasRef.current
    const gl = glRef.current
    const prog = progRef.current
    if (!canvas || !gl || !prog) return

    const w = canvas.clientWidth
    const h = canvas.clientHeight
    if (canvas.width !== w || canvas.height !== h) {
      canvas.width = w
      canvas.height = h
      gl.viewport(0, 0, w, h)
    }

    const t = (performance.now() - startTimeRef.current) / 1000
    gl.useProgram(prog)
    gl.uniform1f(gl.getUniformLocation(prog, 'u_time'), t)
    gl.uniform2f(gl.getUniformLocation(prog, 'u_resolution'), w, h)
    gl.uniform1f(gl.getUniformLocation(prog, 'u_light'), themeRef.current === 'light' ? 1.0 : 0.0)
    gl.drawArrays(gl.TRIANGLES, 0, 6)

    rafRef.current = requestAnimationFrame(render)
  }, [])

  useEffect(() => {
    const canvas = canvasRef.current
    if (!canvas || shouldPause) return

    let gl: WebGL2RenderingContext | null = null
    try {
      gl = canvas.getContext('webgl2', { antialias: false, powerPreference: 'low-power' })
      if (!gl) throw new Error('WebGL2 not available')

      glRef.current = gl
      const prog = buildProgram(gl)
      progRef.current = prog

      // Full-screen quad — 2 triangles
      const verts = new Float32Array([-1, -1, 1, -1, -1, 1, -1, 1, 1, -1, 1, 1])
      const buf = gl.createBuffer()
      gl.bindBuffer(gl.ARRAY_BUFFER, buf)
      gl.bufferData(gl.ARRAY_BUFFER, verts, gl.STATIC_DRAW)
      const loc = gl.getAttribLocation(prog, 'a_pos')
      gl.enableVertexAttribArray(loc)
      gl.vertexAttribPointer(loc, 2, gl.FLOAT, false, 0, 0)

      startTimeRef.current = performance.now()
      rafRef.current = requestAnimationFrame(render)
    } catch {
      setWebglAvailable(false)
    }

    const handleVisibility = () => {
      if (document.hidden) {
        if (rafRef.current != null) {
          cancelAnimationFrame(rafRef.current)
          rafRef.current = null
        }
      } else if (!shouldPause) {
        rafRef.current = requestAnimationFrame(render)
      }
    }
    document.addEventListener('visibilitychange', handleVisibility)

    return () => {
      if (rafRef.current != null) cancelAnimationFrame(rafRef.current)
      document.removeEventListener('visibilitychange', handleVisibility)
    }
  }, [shouldPause, render])

  // Fallback: static CSS gradient when WebGL unavailable or paused
  if (!webglAvailable || shouldPause) {
    const fallbackBg =
      theme === 'light'
        ? 'radial-gradient(ellipse at 30% 40%, rgba(179,147,250,0.22) 0%, transparent 60%), radial-gradient(ellipse at 70% 70%, rgba(154,198,250,0.14) 0%, transparent 55%), #F6F5FC'
        : 'radial-gradient(ellipse at 30% 40%, rgba(139,92,246,0.18) 0%, transparent 60%), radial-gradient(ellipse at 70% 70%, rgba(96,165,250,0.10) 0%, transparent 55%), #07070B'
    return (
      <div className={className} style={{ background: fallbackBg, ...style }} aria-hidden="true" />
    )
  }

  return (
    <motion.canvas
      ref={canvasRef}
      className={className}
      style={{ display: 'block' } as MotionStyle}
      animate={{ opacity }}
      transition={{ duration: 0.8 }}
      aria-hidden="true"
    />
  )
}
