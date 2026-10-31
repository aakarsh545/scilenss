const MAP_HOSTS = [
  "https://aakarsh545.github.io/scilenss-models/earth",
  "https://cdn.jsdelivr.net/gh/aakarsh545/scilenss-models@main/earth",
  "https://raw.githubusercontent.com/aakarsh545/scilenss-models/main/earth",
]

const MAPS = [
  ["day", "day.jpg"],
  ["night", "night.png"],
  ["clouds", "clouds.png"],
  ["specular", "specular.jpg"],
  ["normal", "normal.jpg"],
]

const SIDEREAL = 86164.1
const OBLIQUITY = 23.44 * Math.PI / 180
const PAD = 1.22
const VERT = `
attribute vec2 a_pos;
varying vec2 v_uv;
void main() {
  v_uv = a_pos * 0.5 + 0.5;
  gl_Position = vec4(a_pos, 0.0, 1.0);
}
`
const FRAG = `
precision highp float;
varying vec2 v_uv;
uniform sampler2D u_day;
uniform sampler2D u_night;
uniform sampler2D u_clouds;
uniform sampler2D u_spec;
uniform sampler2D u_normal;
uniform vec3 u_light;
uniform float u_rot;
uniform float u_cloud;
uniform float u_tilt;
uniform float u_hasDay;
uniform float u_hasNight;
uniform float u_hasClouds;
uniform float u_hasSpec;
uniform float u_hasNormal;

const float PI = 3.141592653589793;

vec2 sphereUv(vec3 n, float spin) {
  float c = cos(spin);
  float s = sin(spin);
  vec3 r = vec3(c * n.x + s * n.z, n.y, -s * n.x + c * n.z);
  float lon = atan(r.x, r.z);
  float lat = asin(clamp(r.y, -1.0, 1.0));
  return vec2(fract(lon / (2.0 * PI) + 0.5), 0.5 - lat / PI);
}

void main() {
  vec2 p = (v_uv * 2.0 - 1.0) * ${PAD.toFixed(2)};
  float r = length(p);
  vec3 light = normalize(u_light);

  if (r > 1.0) {
    float fall = 1.0 - smoothstep(1.0, ${PAD.toFixed(2)}, r);
    vec3 limb = normalize(vec3(p / max(r, 0.001), 0.12));
    float sunLit = pow(max(dot(limb, light), 0.0), 1.4);
    vec3 haze = mix(vec3(0.20, 0.42, 0.82), vec3(0.95, 0.58, 0.28), sunLit);
    float alpha = fall * fall * (0.22 + 0.55 * sunLit);
    gl_FragColor = vec4(haze * alpha, alpha);
    return;
  }

  vec3 n = vec3(p.x, p.y, sqrt(max(0.0, 1.0 - r * r)));
  float ct = cos(u_tilt);
  float st = sin(u_tilt);
  vec3 tn = vec3(n.x, ct * n.y - st * n.z, st * n.y + ct * n.z);
  vec2 uv = sphereUv(tn, u_rot);
  vec2 cloudUv = sphereUv(tn, u_rot + u_cloud);

  vec3 day = u_hasDay > 0.5 ? texture2D(u_day, uv).rgb : vec3(0.43, 0.58, 0.77);
  vec3 night = u_hasNight > 0.5 ? texture2D(u_night, uv).rgb : day * 0.08;
  float specMask = u_hasSpec > 0.5 ? texture2D(u_spec, uv).r : 0.0;
  float clouds = u_hasClouds > 0.5 ? texture2D(u_clouds, cloudUv).r : 0.0;

  vec3 nLit = n;
  if (u_hasNormal > 0.5) {
    vec3 bump = texture2D(u_normal, uv).xyz * 2.0 - 1.0;
    vec3 t = normalize(vec3(-tn.z, 0.0, tn.x));
    vec3 b = cross(tn, t);
    vec3 pn = normalize(t * bump.x + b * bump.y + tn * bump.z);
    float c = cos(-u_rot);
    float s = sin(-u_rot);
    vec3 unspin = vec3(c * pn.x + s * pn.z, pn.y, -s * pn.x + c * pn.z);
    float ct2 = cos(-u_tilt);
    float st2 = sin(-u_tilt);
    nLit = normalize(vec3(unspin.x, ct2 * unspin.y - st2 * unspin.z, st2 * unspin.y + ct2 * unspin.z));
  }

  float ndl = max(dot(nLit, light), 0.0);
  float wrap = 0.42 + 0.68 * ndl;
  float terminator = smoothstep(-0.18, 0.28, dot(n, light));
  vec3 lit = day * wrap;
  vec3 dark = night * 1.35 + day * 0.08;
  vec3 color = mix(dark, lit, terminator);

  vec3 cloudDay = vec3(0.93, 0.95, 0.98) * (0.28 + 0.72 * ndl);
  vec3 cloudNight = vec3(0.08, 0.10, 0.16);
  color = mix(color, mix(cloudNight, cloudDay, terminator), clouds * 0.88);

  vec3 view = vec3(0.0, 0.0, 1.0);
  vec3 halfV = normalize(light + view);
  float spec = pow(max(dot(nLit, halfV), 0.0), 42.0) * specMask * (1.0 - clouds) * terminator;
  color += vec3(0.82, 0.90, 1.0) * spec * 0.55;

  float fres = pow(1.0 - n.z, 2.6);
  vec3 air = mix(vec3(0.25, 0.52, 0.92), vec3(0.95, 0.52, 0.22), pow(1.0 - terminator, 2.0));
  color += air * fres * (0.18 + 0.42 * ndl);

  float limb = smoothstep(0.97, 1.0, r);
  color = mix(color, air, limb * 0.35);

  gl_FragColor = vec4(color, 1.0);
}
`

function compile(gl, type, source) {
  const shader = gl.createShader(type)
  gl.shaderSource(shader, source)
  gl.compileShader(shader)
  if (!gl.getShaderParameter(shader, gl.COMPILE_STATUS)) {
    const log = gl.getShaderInfoLog(shader)
    gl.deleteShader(shader)
    throw new Error(log || "Earth shader failed to compile.")
  }
  return shader
}

function program(gl) {
  const built = gl.createProgram()
  gl.attachShader(built, compile(gl, gl.VERTEX_SHADER, VERT))
  gl.attachShader(built, compile(gl, gl.FRAGMENT_SHADER, FRAG))
  gl.linkProgram(built)
  if (!gl.getProgramParameter(built, gl.LINK_STATUS)) {
    throw new Error(gl.getProgramInfoLog(built) || "Earth shader failed to link.")
  }
  return built
}

async function fetchBitmap(url) {
  const response = await fetch(url, { mode: "cors", signal: AbortSignal.timeout(8000) })
  if (!response.ok) throw new Error(`Could not load ${url}`)
  return createImageBitmap(await response.blob())
}

async function loadMap(file) {
  let last = new Error(`Missing ${file}`)
  for (const host of MAP_HOSTS) {
    try {
      return await fetchBitmap(`${host}/${file}`)
    } catch (error) {
      last = error
    }
  }
  throw last
}

function setTexture(gl, texture, bitmap, unit) {
  gl.activeTexture(gl.TEXTURE0 + unit)
  gl.bindTexture(gl.TEXTURE_2D, texture)
  gl.pixelStorei(gl.UNPACK_FLIP_Y_WEBGL, 1)
  gl.texParameteri(gl.TEXTURE_2D, gl.TEXTURE_WRAP_S, gl.REPEAT)
  gl.texParameteri(gl.TEXTURE_2D, gl.TEXTURE_WRAP_T, gl.CLAMP_TO_EDGE)
  gl.texParameteri(gl.TEXTURE_2D, gl.TEXTURE_MIN_FILTER, gl.LINEAR)
  gl.texParameteri(gl.TEXTURE_2D, gl.TEXTURE_MAG_FILTER, gl.LINEAR)
  gl.texImage2D(gl.TEXTURE_2D, 0, gl.RGBA, gl.RGBA, gl.UNSIGNED_BYTE, bitmap)
}

function setDummy(gl, texture) {
  gl.bindTexture(gl.TEXTURE_2D, texture)
  gl.texParameteri(gl.TEXTURE_2D, gl.TEXTURE_WRAP_S, gl.CLAMP_TO_EDGE)
  gl.texParameteri(gl.TEXTURE_2D, gl.TEXTURE_WRAP_T, gl.CLAMP_TO_EDGE)
  gl.texParameteri(gl.TEXTURE_2D, gl.TEXTURE_MIN_FILTER, gl.LINEAR)
  gl.texParameteri(gl.TEXTURE_2D, gl.TEXTURE_MAG_FILTER, gl.LINEAR)
  gl.texImage2D(gl.TEXTURE_2D, 0, gl.RGBA, 1, 1, 0, gl.RGBA, gl.UNSIGNED_BYTE, new Uint8Array([0, 0, 0, 255]))
}

function bindUnit(gl, texture, unit) {
  gl.activeTexture(gl.TEXTURE0 + unit)
  gl.bindTexture(gl.TEXTURE_2D, texture)
}

export function isEarthBody(body) {
  const name = body?.name ?? ""
  return name === "Earth" || name.startsWith("Earth ")
}

export function earthSpin(time, reducedMotion = false) {
  if (reducedMotion) return 0.85
  return ((time / SIDEREAL) % 1) * Math.PI * 2 + 0.42
}

export function createEarthGlobe() {
  const canvas = document.createElement("canvas")
  const gl = canvas.getContext("webgl", {
    alpha: true,
    premultipliedAlpha: true,
    antialias: true,
    preserveDrawingBuffer: true,
  })
  const maps = {}
  let ready = false
  let failed = false
  let loading = null
  let gpu = null
  let lastSize = 0

  function setup() {
    if (!gl) throw new Error("WebGL is not available.")
    const built = program(gl)
    const buffer = gl.createBuffer()
    gl.bindBuffer(gl.ARRAY_BUFFER, buffer)
    gl.bufferData(gl.ARRAY_BUFFER, new Float32Array([-1, -1, 1, -1, -1, 1, 1, 1]), gl.STATIC_DRAW)
    const textures = {}
    for (const [key] of MAPS) {
      textures[key] = gl.createTexture()
      setDummy(gl, textures[key])
    }
    gpu = {
      built,
      buffer,
      textures,
      aPos: gl.getAttribLocation(built, "a_pos"),
      uniforms: Object.fromEntries([
        "u_day", "u_night", "u_clouds", "u_spec", "u_normal",
        "u_light", "u_rot", "u_cloud", "u_tilt",
        "u_hasDay", "u_hasNight", "u_hasClouds", "u_hasSpec", "u_hasNormal",
      ].map((name) => [name, gl.getUniformLocation(built, name)])),
    }
  }

  async function paintMap(key, file) {
    const bitmap = await loadMap(file)
    maps[key] = bitmap
    setTexture(gl, gpu.textures[key], bitmap, 0)
  }

  async function loadMaps() {
    if (failed || ready) return ready
    try {
      setup()
      await paintMap("day", "day.jpg")
      ready = true
      Promise.allSettled(MAPS.filter(([key]) => key !== "day").map(([key, file]) => paintMap(key, file)))
    } catch (error) {
      failed = true
      ready = false
      console.warn(error)
    }
    return ready
  }

  function resize(pixels) {
    const size = Math.max(64, Math.min(1536, pixels))
    if (size === lastSize) return
    lastSize = size
    canvas.width = size
    canvas.height = size
    gl.viewport(0, 0, size, size)
  }

  function draw(ctx, x, y, radius, options = {}) {
    if (!ready || !gl || !gpu || !(radius >= 6)) return false
    const dpr = Math.min(2, window.devicePixelRatio || 1)
    resize(Math.ceil(radius * 2 * PAD * dpr))
    gl.bindFramebuffer(gl.FRAMEBUFFER, null)
    gl.viewport(0, 0, canvas.width, canvas.height)
    gl.clearColor(0, 0, 0, 0)
    gl.clear(gl.COLOR_BUFFER_BIT)
    gl.enable(gl.BLEND)
    gl.blendFunc(gl.ONE, gl.ONE_MINUS_SRC_ALPHA)
    gl.useProgram(gpu.built)
    gl.bindBuffer(gl.ARRAY_BUFFER, gpu.buffer)
    gl.enableVertexAttribArray(gpu.aPos)
    gl.vertexAttribPointer(gpu.aPos, 2, gl.FLOAT, false, 0, 0)
    bindUnit(gl, gpu.textures.day, 0)
    bindUnit(gl, gpu.textures.night, 1)
    bindUnit(gl, gpu.textures.clouds, 2)
    bindUnit(gl, gpu.textures.specular, 3)
    bindUnit(gl, gpu.textures.normal, 4)
    gl.uniform1i(gpu.uniforms.u_day, 0)
    gl.uniform1i(gpu.uniforms.u_night, 1)
    gl.uniform1i(gpu.uniforms.u_clouds, 2)
    gl.uniform1i(gpu.uniforms.u_spec, 3)
    gl.uniform1i(gpu.uniforms.u_normal, 4)
    const light = options.light ?? { x: -0.22, y: 0.18, z: 0.96 }
    gl.uniform3f(gpu.uniforms.u_light, light.x, light.y, light.z)
    gl.uniform1f(gpu.uniforms.u_rot, options.rotation ?? 0.85)
    gl.uniform1f(gpu.uniforms.u_cloud, options.clouds ?? 0.08)
    gl.uniform1f(gpu.uniforms.u_tilt, options.tilt ?? OBLIQUITY)
    gl.uniform1f(gpu.uniforms.u_hasDay, maps.day ? 1 : 0)
    gl.uniform1f(gpu.uniforms.u_hasNight, maps.night ? 1 : 0)
    gl.uniform1f(gpu.uniforms.u_hasClouds, maps.clouds ? 1 : 0)
    gl.uniform1f(gpu.uniforms.u_hasSpec, maps.specular ? 1 : 0)
    gl.uniform1f(gpu.uniforms.u_hasNormal, maps.normal ? 1 : 0)
    gl.drawArrays(gl.TRIANGLE_STRIP, 0, 4)
    const span = radius * PAD
    ctx.drawImage(canvas, x - span, y - span, span * 2, span * 2)
    return true
  }

  return {
    get ready() {
      return ready
    },
    load() {
      loading ??= loadMaps()
      return loading
    },
    draw,
  }
}

let shared
export function earthGlobe() {
  if (!shared) {
    shared = createEarthGlobe()
    shared.load()
  }
  return shared
}
