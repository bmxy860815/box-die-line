/**
 * @license
 * SPDX-License-Identifier: Apache-2.0
 */

import React, { useEffect, useRef, useState } from 'react';
import * as THREE from 'three';
import { OrbitControls } from 'three/examples/jsm/controls/OrbitControls.js';
import { Box, Play, Pause, RotateCcw, Info, RefreshCw } from 'lucide-react';

// --- Constants ---
const CARDBOARD_COLOR = '#cdaa7d';
const CARDBOARD_INSIDE_COLOR = '#b89b72';

const BOX = {
  w: 10,
  d: 7,
  h: 2,
  t: 0.1
};

export default function App() {
  const containerRef = useRef<HTMLDivElement>(null);
  const canvas2dRef = useRef<HTMLCanvasElement>(null);
  const [uiProgress, setUiProgress] = useState(0);
  const [isPlaying, setIsPlaying] = useState(false);
  
  const engine = useRef<{
    scene: THREE.Scene;
    renderer: THREE.WebGLRenderer;
    parts: { [key: string]: THREE.Object3D };
    progress: number;
    playing: boolean;
  } | null>(null);

  // --- 2D 刀模绘制逻辑 ---
  useEffect(() => {
    if (!canvas2dRef.current) return;
    const canvas = canvas2dRef.current;
    const ctx = canvas.getContext('2d')!;
    
    const drawDieline = () => {
      const w = canvas.width;
      const h = canvas.height;
      ctx.clearRect(0, 0, w, h);
      
      // 自动缩放以适应画布
      const totalW = BOX.w + BOX.d * 2;
      const totalH = BOX.d * 2 + BOX.h * 2.8;
      const scale = Math.min(w / totalW, h / totalH) * 0.8;
      
      ctx.save();
      ctx.translate(w / 2, h / 2);
      ctx.scale(scale, scale);
      // 整体向上偏移一点，因为顶盖比较长
      ctx.translate(0, -BOX.h * 0.5);

      const bleed = 0.3; // 出血线偏移量

      // 线条样式定义
      const styles = {
        cut: { color: '#ff0000', width: 2, dash: [] },
        crease: { color: '#0000ff', width: 1.5, dash: [2, 1.5] },
        bleed: { color: '#00ffff', width: 1, dash: [] }
      };

      const drawRect = (x: number, y: number, rw: number, rh: number, type: 'cut' | 'crease' | 'bleed') => {
        const s = styles[type];
        ctx.strokeStyle = s.color;
        ctx.lineWidth = s.width / scale;
        ctx.setLineDash(s.dash);
        ctx.strokeRect(x, y, rw, rh);
      };

      // 1. 绘制出血线 (外扩)
      ctx.globalAlpha = 0.4;
      // 简化处理：绘制一个包含所有面板的大轮廓外扩
      drawRect(-BOX.w/2 - BOX.d - bleed, BOX.d/2 - bleed, BOX.w + BOX.d*2 + bleed*2, BOX.h + bleed*2, 'bleed'); // 后壁+侧壁
      drawRect(-BOX.w/2 - bleed, -BOX.d/2 - BOX.h - bleed, BOX.w + bleed*2, BOX.d*2 + BOX.h*2.8 + bleed*2, 'bleed'); // 主轴线
      ctx.globalAlpha = 1.0;

      // 2. 绘制割线 (外轮廓)
      // 底座
      drawRect(-BOX.w/2, -BOX.d/2, BOX.w, BOX.d, 'crease');
      // 前壁
      drawRect(-BOX.w/2, -BOX.d/2 - BOX.h, BOX.w, BOX.h, 'cut');
      // 后壁
      drawRect(-BOX.w/2, BOX.d/2, BOX.w, BOX.h, 'crease');
      // 左侧壁 (连在后壁)
      drawRect(-BOX.w/2 - BOX.d, BOX.d/2, BOX.d, BOX.h, 'cut');
      // 右侧壁 (连在后壁)
      drawRect(BOX.w/2, BOX.d/2, BOX.d, BOX.h, 'cut');
      // 顶盖
      drawRect(-BOX.w/2, BOX.d/2 + BOX.h, BOX.w, BOX.d, 'crease');
      // 插口
      drawRect(-BOX.w/2, BOX.d/2 + BOX.h + BOX.d, BOX.w, BOX.h * 0.8, 'cut');

      // 3. 绘制折线 (内部连接处)
      // 已经在上面用 'crease' 绘制了部分重叠区域
      
      ctx.restore();

      // 绘制图例
      const legendX = 30;
      const legendY = h - 120;
      ctx.font = '12px Inter';
      ctx.textAlign = 'left';
      
      const drawLegendItem = (y: number, label: string, type: 'cut' | 'crease' | 'bleed') => {
        const s = styles[type];
        ctx.strokeStyle = s.color;
        ctx.lineWidth = 2;
        ctx.setLineDash(s.dash);
        ctx.beginPath();
        ctx.moveTo(legendX, y - 5);
        ctx.lineTo(legendX + 40, y - 5);
        ctx.stroke();
        ctx.fillStyle = '#64748b';
        ctx.fillText(label, legendX + 50, y);
      };

      ctx.fillStyle = 'rgba(255,255,255,0.9)';
      ctx.fillRect(legendX - 10, legendY - 25, 150, 100);
      ctx.strokeStyle = '#e2e8f0';
      ctx.strokeRect(legendX - 10, legendY - 25, 150, 100);
      
      ctx.fillStyle = '#1e293b';
      ctx.font = 'bold 12px Inter';
      ctx.fillText('DIELINE LEGEND 图例', legendX, legendY - 5);
      
      drawLegendItem(legendY + 20, 'Cut Line (割线)', 'cut');
      drawLegendItem(legendY + 45, 'Crease Line (折线)', 'crease');
      drawLegendItem(legendY + 70, 'Bleed Line (出血线)', 'bleed');
    };

    const handleResize = () => {
      canvas.width = canvas.clientWidth;
      canvas.height = canvas.clientHeight;
      drawDieline();
    };

    window.addEventListener('resize', handleResize);
    handleResize();
    return () => window.removeEventListener('resize', handleResize);
  }, []);

  useEffect(() => {
    if (!containerRef.current) return;

    const scene = new THREE.Scene();
    scene.background = new THREE.Color(0xf8fafc);

    const width = containerRef.current.clientWidth;
    const height = containerRef.current.clientHeight;

    const camera = new THREE.PerspectiveCamera(45, width / height, 0.1, 1000);
    // 增加距离以在窄屏中显示全
    camera.position.set(22, 18, 22);

    const renderer = new THREE.WebGLRenderer({ antialias: true });
    renderer.setSize(width, height);
    renderer.setPixelRatio(window.devicePixelRatio);
    renderer.shadowMap.enabled = true;
    containerRef.current.appendChild(renderer.domElement);

    const controls = new OrbitControls(camera, renderer.domElement);
    controls.enableDamping = true;

    scene.add(new THREE.AmbientLight(0xffffff, 0.8));
    const light = new THREE.DirectionalLight(0xffffff, 0.6);
    light.position.set(10, 20, 10);
    light.castShadow = true;
    scene.add(light);

    // --- 辅助函数：创建纸板面板 ---
    const createCardboardPanel = (w: number, h: number) => {
      const material = new THREE.MeshStandardMaterial({ 
        color: CARDBOARD_COLOR,
        roughness: 0.8,
        metalness: 0.1,
        side: THREE.DoubleSide 
      });

      const mesh = new THREE.Mesh(new THREE.BoxGeometry(w, h, BOX.t), material);
      mesh.castShadow = true;
      mesh.receiveShadow = true;
      return mesh;
    };

    const parts: { [key: string]: THREE.Object3D } = {};

    // 0: 基础底板 (w x d)
    const bottom = createCardboardPanel(BOX.w, BOX.d);
    scene.add(bottom);

    // 1: 后壁 (连接在底板上边缘) -> 2: 顶盖 -> 3: 前舌
    const backHinge = new THREE.Group();
    backHinge.position.set(0, BOX.d / 2, 0);
    bottom.add(backHinge);
    const backPanel = createCardboardPanel(BOX.w, BOX.h);
    backPanel.position.set(0, BOX.h / 2, 0);
    backHinge.add(backPanel);
    parts.back = backHinge;

    // 5: 左侧壁 (连接到后壁 1 的左边缘)
    const leftHinge = new THREE.Group();
    leftHinge.position.set(-BOX.w / 2, BOX.h / 2, 0);
    backHinge.add(leftHinge);
    const leftPanel = createCardboardPanel(BOX.d, BOX.h);
    leftPanel.position.set(-BOX.d / 2, 0, 0);
    leftHinge.add(leftPanel);
    parts.left = leftHinge;

    // 6: 右侧壁 (连接到后壁 1 的右边缘)
    const rightHinge = new THREE.Group();
    rightHinge.position.set(BOX.w / 2, BOX.h / 2, 0);
    backHinge.add(rightHinge);
    const rightPanel = createCardboardPanel(BOX.d, BOX.h);
    rightPanel.position.set(BOX.d / 2, 0, 0);
    rightHinge.add(rightPanel);
    parts.right = rightHinge;

    // 2: 顶盖 (连接到后壁 1 的顶边缘)
    const topHinge = new THREE.Group();
    topHinge.position.set(0, BOX.h, 0);
    backHinge.add(topHinge);
    const topPanel = createCardboardPanel(BOX.w, BOX.d);
    topPanel.position.set(0, BOX.d / 2, 0);
    topHinge.add(topPanel);
    parts.top = topHinge;

    // 3: 前舌/插口 (连接到顶盖 2)
    const lidHinge = new THREE.Group();
    lidHinge.position.set(0, BOX.d, 0);
    topHinge.add(lidHinge);
    const lidPanel = createCardboardPanel(BOX.w, BOX.h * 0.8);
    lidPanel.position.set(0, (BOX.h * 0.8) / 2, 0);
    lidHinge.add(lidPanel);
    parts.lid = lidHinge;

    // 4: 前壁 (连接在底板下边缘)
    const frontHinge = new THREE.Group();
    frontHinge.position.set(0, -BOX.d / 2, 0);
    bottom.add(frontHinge);
    const frontPanel = createCardboardPanel(BOX.w, BOX.h);
    frontPanel.position.set(0, -BOX.h / 2, 0);
    frontHinge.add(frontPanel);
    parts.front = frontHinge;

    // 4. 动画更新函数
    const updateVisuals = (p: number) => {
      const angle90 = Math.PI / 2;
      
      const p1 = Math.min(1, Math.max(0, p / 0.2));
      const p2 = Math.min(1, Math.max(0, (p - 0.2) / 0.2));
      const p3 = Math.min(1, Math.max(0, (p - 0.4) / 0.2));
      const p4 = Math.min(1, Math.max(0, (p - 0.6) / 0.2));
      const p5 = Math.min(1, Math.max(0, (p - 0.8) / 0.2));

      // 1. 后壁立起 (绕 X 轴)
      parts.back.rotation.x = p1 * angle90;
      
      // 2. 侧壁向内折叠 (绕 Y 轴，相对于后壁旋转)
      parts.left.rotation.y = p2 * angle90;
      parts.right.rotation.y = -p2 * angle90;
      
      // 3. 前壁立起 (绕 X 轴)
      parts.front.rotation.x = -p3 * angle90;
      
      // 4. 顶盖盖上
      parts.top.rotation.x = p4 * angle90;
      
      // 5. 插口塞入
      parts.lid.rotation.x = p5 * angle90;
    };

    // 5. 引擎对象
    engine.current = {
      scene,
      renderer,
      parts,
      progress: 0,
      playing: false
    };

    // 6. 渲染循环
    let lastTime = performance.now();
    const animate = () => {
      const frameId = requestAnimationFrame(animate);
      const now = performance.now();
      const delta = (now - lastTime) / 1000;
      lastTime = now;

      if (engine.current) {
        if (engine.current.playing) {
          engine.current.progress = Math.min(1, engine.current.progress + delta * 0.5);
          if (engine.current.progress >= 1) {
            engine.current.playing = false;
            setIsPlaying(false);
          }
          // 每帧更新 UI 进度条（可选，为了性能可以节流）
          setUiProgress(engine.current.progress);
        }
        updateVisuals(engine.current.progress);
        controls.update();
        renderer.render(scene, camera);
      }
    };
    animate();

    // 7. 清理
    const handleResize = () => {
      if (!containerRef.current) return;
      const w = containerRef.current.clientWidth;
      const h = containerRef.current.clientHeight;
      camera.aspect = w / h;
      camera.updateProjectionMatrix();
      renderer.setSize(w, h);
    };
    window.addEventListener('resize', handleResize);

    return () => {
      window.removeEventListener('resize', handleResize);
      renderer.dispose();
      if (containerRef.current) containerRef.current.removeChild(renderer.domElement);
      engine.current = null;
    };
  }, []);

  // 操作接口
  const togglePlay = () => {
    if (engine.current) {
      if (engine.current.progress >= 1) engine.current.progress = 0;
      engine.current.playing = !engine.current.playing;
      setIsPlaying(engine.current.playing);
    }
  };

  const handleSliderChange = (val: number) => {
    if (engine.current) {
      engine.current.progress = val;
      engine.current.playing = false;
      setIsPlaying(false);
      setUiProgress(val);
    }
  };

  const reset = () => {
    if (engine.current) {
      engine.current.progress = 0;
      engine.current.playing = false;
      setIsPlaying(false);
      setUiProgress(0);
    }
  };

  return (
    <div className="flex h-screen w-screen bg-slate-50 overflow-hidden font-sans text-slate-900">
      {/* Left: 2D Dieline (70%) */}
      <div className="w-[70%] h-full relative border-r border-slate-200 bg-white">
        <div className="absolute top-6 left-8 z-10">
          <h1 className="text-xl font-black tracking-tight text-slate-800 flex items-center gap-2">
            <Box className="w-6 h-6 text-rose-500" />
            2D DIELINE VIEW <span className="text-xs font-normal text-slate-400 ml-2">Scale: 1:1 (Approx)</span>
          </h1>
        </div>
        <canvas ref={canvas2dRef} className="w-full h-full" />
      </div>

      {/* Right: 3D Preview (30%) */}
      <div className="w-[30%] h-full relative bg-slate-50">
        <div className="absolute top-6 left-8 z-10">
          <h2 className="text-sm font-bold uppercase tracking-widest text-slate-400">3D Preview</h2>
        </div>
        
        {/* Canvas */}
        <div ref={containerRef} className="w-full h-full touch-none" />

        {/* Controls Card */}
        <div className="absolute bottom-8 left-1/2 -translate-x-1/2 w-[90%] z-30">
          <div className="bg-white/90 backdrop-blur-xl p-5 rounded-3xl shadow-2xl border border-white/20">
            <div className="flex items-center justify-between mb-4 px-1">
              <div className="flex flex-col">
                <span className="text-[9px] uppercase tracking-[0.2em] font-bold text-slate-400 mb-0.5">Assembly</span>
                <span className="text-xl font-mono font-black text-slate-800">
                  {(uiProgress * 100).toFixed(0)}<span className="text-xs ml-0.5 text-slate-400">%</span>
                </span>
              </div>
              <button 
                onClick={reset}
                className="p-2.5 rounded-xl bg-slate-100 text-slate-500 hover:bg-slate-200 hover:text-slate-800 transition-all"
              >
                <RefreshCw className="w-4 h-4" />
              </button>
            </div>

            <div className="flex items-center gap-4">
              <button 
                onClick={togglePlay}
                className={`w-12 h-12 flex items-center justify-center rounded-xl transition-all active:scale-90 shadow-lg ${
                  isPlaying ? 'bg-rose-500 text-white shadow-rose-200' : 'bg-slate-900 text-white shadow-slate-200'
                }`}
              >
                {isPlaying ? <Pause className="w-5 h-5 fill-current" /> : <Play className="w-5 h-5 fill-current ml-0.5" />}
              </button>

              <div className="flex-1 relative group">
                <input 
                  type="range" 
                  min="0" 
                  max="1" 
                  step="0.0001" 
                  value={uiProgress} 
                  onChange={(e) => handleSliderChange(parseFloat(e.target.value))}
                  className="w-full h-2 bg-slate-100 rounded-full appearance-none cursor-pointer accent-slate-900"
                />
              </div>
            </div>
          </div>
        </div>
      </div>

      {/* Vignette */}
      <div className="absolute inset-0 pointer-events-none shadow-[inset_0_0_100px_rgba(0,0,0,0.03)]" />
    </div>
  );
}
