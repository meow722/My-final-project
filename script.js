// ================= 1. 全局状态与 DOM 元素 =================
const videoElement = document.getElementById('video');
const introEl = document.getElementById('intro');
const startBtn = document.getElementById('startBtn');
const loadingEl = document.getElementById('loading');
const statusText = document.getElementById('status-text');

// 交互状态 (用于平滑过渡)
let handState = {
    pointer: { x: 0.5, y: 0.5 }, // 食指位置
    openness: 0.0,               // 张开程度 0-1
    fist: 0.0,                   // 握拳程度 0-1
    isTracking: false
};

// ================= 2. Web Audio 音乐引擎 =================
let audioCtx, oscillator, filter, gainNode;
let isAudioInit = false;

function initAudio() {
    const AudioContext = window.AudioContext || window.webkitAudioContext;
    audioCtx = new AudioContext();

    // 创建振荡器 (特雷门琴音色)
    oscillator = audioCtx.createOscillator();
    oscillator.type = 'sawtooth'; // 锯齿波，科幻感
    oscillator.frequency.value = 220; // 初始音高

    // 创建滤波器 (控制声音明亮度)
    filter = audioCtx.createBiquadFilter();
    filter.type = 'lowpass';
    filter.frequency.value = 300; // 初始沉闷

    // 创建音量节点
    gainNode = audioCtx.createGain();
    gainNode.gain.value = 0.0; // 初始静音

    // 连接节点: 振荡器 -> 滤波器 -> 音量 -> 扬声器
    oscillator.connect(filter);
    filter.connect(gainNode);
    gainNode.connect(audioCtx.destination);

    oscillator.start();
    isAudioInit = true;
}

// 触发重低音下潜音效 (握拳时调用)
function playBassDrop() {
    if (!isAudioInit) return;
    const dropOsc = audioCtx.createOscillator();
    const dropGain = audioCtx.createGain();
    
    dropOsc.type = 'sine';
    dropOsc.frequency.setValueAtTime(150, audioCtx.currentTime);
    dropOsc.frequency.exponentialRampToValueAtTime(30, audioCtx.currentTime + 0.5);
    
    dropGain.gain.setValueAtTime(0.5, audioCtx.currentTime);
    dropGain.gain.exponentialRampToValueAtTime(0.01, audioCtx.currentTime + 0.5);
    
    dropOsc.connect(dropGain);
    dropGain.connect(audioCtx.destination);
    
    dropOsc.start();
    dropOsc.stop(audioCtx.currentTime + 0.5);
}

// ================= 3. WebGL 视觉引擎 (流体星云) =================
const canvas = document.getElementById('glCanvas');
const gl = canvas.getContext('webgl');

if (!gl) {
    alert('浏览器不支持 WebGL，请更换 Chrome 浏览器！');
}

const vsSource = `attribute vec2 a_position; void main() { gl_Position = vec4(a_position, 0.0, 1.0); }`;

const fsSource = `
    precision highp float;
    uniform vec2 u_resolution;
    uniform float u_time;
    uniform vec2 u_pointer;
    uniform float u_openness;
    uniform float u_fist;

    // 噪声函数
    float hash(vec2 p) { return fract(sin(dot(p, vec2(127.1, 311.7))) * 43758.5453); }
    float noise(vec2 p) {
        vec2 i = floor(p); vec2 f = fract(p);
        f = f * f * (3.0 - 2.0 * f);
        return mix(mix(hash(i), hash(i + vec2(1.0, 0.0)), f.x),
                   mix(hash(i + vec2(0.0, 1.0)), hash(i + vec2(1.0, 1.0)), f.x), f.y);
    }
    float fbm(vec2 p) {
        float v = 0.0, a = 0.5;
        for (int i = 0; i < 5; i++) { v += a * noise(p); p *= 2.0; a *= 0.5; }
        return v;
    }

    void main() {
        vec2 uv = (gl_FragCoord.xy * 2.0 - u_resolution) / min(u_resolution.x, u_resolution.y);
        vec2 pointer = (u_pointer * 2.0 - 1.0);
        pointer.y *= -1.0; // 翻转Y轴匹配屏幕

        // 1. 基础流动速度 (张开手掌时流动更快)
        float t = u_time * (0.15 + u_openness * 0.4);
        
        // 2. 食指漩涡扭曲
        float dist = distance(uv, pointer);
        float swirl = smoothstep(0.8, 0.0, dist) * 2.0;
        vec2 dir = normalize(uv - pointer);
        vec2 perp = vec2(-dir.y, dir.x);
        uv += perp * swirl * 0.3; // 扭曲坐标

        // 3. 手掌绽放缩放
        uv *= (1.0 + u_openness * 0.2);

        // 4. 流体噪声场
        vec2 q = vec2(fbm(uv + t), fbm(uv - t));
        float n = fbm(uv + q * (1.0 + u_openness * 2.0));

        // 5. 颜色映射 (冷色调 -> 暖色调)
        vec3 col1 = vec3(0.05, 0.1, 0.3); // 深蓝
        vec3 col2 = vec3(0.4, 0.1, 0.6);  // 紫红
        vec3 col3 = vec3(0.1, 0.8, 0.9);  // 青色
        
        vec3 color = mix(col1, col2, smoothstep(0.2, 0.6, n));
        color = mix(color, col3, smoothstep(0.6, 0.9, n));

        // 6. 握拳故障/冻结效果
        if (u_fist > 0.5) {
            color = vec3(1.0) - color; // 反色
            color *= 0.4; // 变暗
            // 加入一点撕裂
            uv.x += step(0.9, fract(uv.y * 10.0 + u_time * 5.0)) * 0.1;