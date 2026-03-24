/**
 * @license
 * SPDX-License-Identifier: Apache-2.0
 */

import React, { useEffect, useRef, useState } from 'react';
import * as THREE from 'three';
import { OrbitControls } from 'three/examples/jsm/controls/OrbitControls.js';
import { Box, Play, Pause, RotateCcw, Info, RefreshCw } from 'lucide-react';

// --- Constants ---
const CARDBOARD_COLOR = '#ffffff';
const CARDBOARD_INSIDE_COLOR = '#f8f8f8';
const CARDBOARD_STROKE_COLOR = '#e2e8f0';

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
  
  // 2D Canvas State
  const [zoom, setZoom] = useState(1);
  const [offset, setOffset] = useState({ x: 0, y: 0 });
  const [textureUrl, setTextureUrl] = useState<string | null>(null);
  const [isSceneReady, setIsSceneReady] = useState(false);
  const [imageLoadedTick, setImageLoadedTick] = useState(0);
  const textureImageRef = useRef<HTMLImageElement | null>(null);
  const fileInputRef = useRef<HTMLInputElement>(null);
  const isDragging = useRef(false);
  const lastMousePos = useRef({ x: 0, y: 0 });
  const engine = useRef<{
    scene: THREE.Scene;
    renderer: THREE.WebGLRenderer;
    parts: { [key: string]: THREE.Object3D };
    progress: number;
    playing: boolean;
  } | null>(null);

  // 预加载图片 Effect
  useEffect(() => {
    if (textureUrl) {
      const img = new Image();
      img.src = textureUrl;
      img.onload = () => {
        textureImageRef.current = img;
        setImageLoadedTick(t => t + 1); // 仅触发状态更新，不直接调用绘图
      };
      img.onerror = () => {
        console.error("Failed to load image:", textureUrl);
      };
    } else {
      textureImageRef.current = null;
      setImageLoadedTick(t => t + 1);
    }
  }, [textureUrl]);

  // --- 2D 刀模绘制逻辑 ---
  const drawDieline = () => {
    const canvas = canvas2dRef.current;
    if (!canvas) return;
    const ctx = canvas.getContext('2d');
    if (!ctx) return;

    const w = canvas.width;
    const h = canvas.height;
    ctx.clearRect(0, 0, w, h);
    
    // 基础缩放以适应画布
    const totalW = BOX.w + BOX.d * 2;
    const totalH = BOX.d * 2 + BOX.h * 2.8;
    const baseScale = Math.min(w / totalW, h / totalH) * 0.8;
    const finalScale = baseScale * zoom;
    
    ctx.save();
    // 应用平移和缩放
    ctx.translate(w / 2 + offset.x, h / 2 + offset.y);
    ctx.scale(finalScale, finalScale);
    // 整体向上偏移一点，因为顶盖比较长
    ctx.translate(0, -BOX.h * 0.5);

    // --- 1. 绘制贴图区域背景与边框 (辅助定位) ---
    const fw = BOX.w;
    const fh = BOX.h;
    const fx = -BOX.w / 2;
    const fy = -BOX.d / 2 - BOX.h;
    
    ctx.fillStyle = 'rgba(244, 63, 94, 0.03)'; 
    ctx.fillRect(fx, fy, fw, fh);
    ctx.strokeStyle = 'rgba(244, 63, 94, 0.2)';
    ctx.lineWidth = 1 / finalScale;
    ctx.strokeRect(fx, fy, fw, fh);

    // --- 2. 绘制贴图 ---
    if (textureImageRef.current) {
      const img = textureImageRef.current;
      const imgAspect = img.width / img.height;
      const panelAspect = fw / fh;
      let drawW, drawH;
      if (imgAspect > panelAspect) {
        drawW = fw;
        drawH = fw / imgAspect;
      } else {
        drawH = fh;
        drawW = fh * imgAspect;
      }
      ctx.drawImage(img, fx + (fw - drawW) / 2, fy + (fh - drawH) / 2, drawW, drawH);
    }

    const bleed = 0.3; // 出血线偏移量

    // 线条样式定义
    const styles = {
      cut: { color: '#0000FF', width: 2, dash: [] },
      crease: { color: '#FF0000', width: 1.5, dash: [0.15, 0.1] },
      bleed: { color: '#00FF00', width: 1, dash: [] }
    };

    const drawRect = (x: number, y: number, rw: number, rh: number, type: 'cut' | 'crease' | 'bleed') => {
      const s = styles[type];
      ctx.strokeStyle = s.color;
      ctx.lineWidth = s.width / finalScale;
      ctx.setLineDash(s.dash);
      ctx.strokeRect(x, y, rw, rh);
    };

    // 1. 绘制出血线 (外扩)
    ctx.globalAlpha = 0.4;
    drawRect(-BOX.w/2 - BOX.d - bleed, BOX.d/2 - bleed, BOX.w + BOX.d*2 + bleed*2, BOX.h + bleed*2, 'bleed');
    drawRect(-BOX.w/2 - bleed, -BOX.d/2 - BOX.h - bleed, BOX.w + bleed*2, BOX.d*2 + BOX.h*2.8 + bleed*2, 'bleed');
    ctx.globalAlpha = 1.0;

    // 2. 绘制割线 (外轮廓)
    drawRect(-BOX.w/2, -BOX.d/2, BOX.w, BOX.d, 'crease');
    drawRect(-BOX.w/2, -BOX.d/2 - BOX.h, BOX.w, BOX.h, 'cut');
    drawRect(-BOX.w/2, BOX.d/2, BOX.w, BOX.h, 'crease');
    drawRect(-BOX.w/2 - BOX.d, BOX.d/2, BOX.d, BOX.h, 'cut');
    drawRect(BOX.w/2, BOX.d/2, BOX.d, BOX.h, 'cut');
    drawRect(-BOX.w/2, BOX.d/2 + BOX.h, BOX.w, BOX.d, 'crease');
    drawRect(-BOX.w/2, BOX.d/2 + BOX.h + BOX.d, BOX.w, BOX.h * 0.8, 'cut');

    ctx.restore();

    // 绘制图例 (顶部一行展示)
    const legendY = 80;
    const legendSpacing = 160;
    const items: { label: string, type: 'cut' | 'crease' | 'bleed' }[] = [
      { label: 'Cut Line (割线)', type: 'cut' },
      { label: 'Crease Line (折线)', type: 'crease' },
      { label: 'Bleed Line (出血线)', type: 'bleed' }
    ];
    
    const totalLegendWidth = items.length * legendSpacing;
    const startX = (w - totalLegendWidth) / 2 + 20;

    // 背景
    ctx.fillStyle = 'rgba(255,255,255,0.8)';
    ctx.fillRect(startX - 40, legendY - 20, totalLegendWidth + 40, 40);
    ctx.strokeStyle = '#e2e8f0';
    ctx.lineWidth = 1;
    ctx.strokeRect(startX - 40, legendY - 20, totalLegendWidth + 40, 40);

    items.forEach((item, index) => {
      const x = startX + index * legendSpacing;
      const s = styles[item.type];
      ctx.strokeStyle = s.color;
      ctx.lineWidth = 2;
      const legendDash = s.dash.length > 0 ? s.dash.map(d => d * 40) : [];
      ctx.setLineDash(legendDash);
      ctx.beginPath();
      ctx.moveTo(x, legendY);
      ctx.lineTo(x + 30, legendY);
      ctx.stroke();
      
      ctx.setLineDash([]);
      ctx.fillStyle = '#64748b';
      ctx.font = '12px Inter';
      ctx.textAlign = 'left';
      ctx.fillText(item.label, x + 40, legendY + 4);
    });
  };

  // 2D 重绘 Effect
  useEffect(() => {
    drawDieline();
  }, [zoom, offset, textureUrl, imageLoadedTick]);

  // 2D 事件绑定 Effect (只运行一次)
  useEffect(() => {
    const canvas = canvas2dRef.current;
    if (!canvas) return;

    const handleResize = () => {
      canvas.width = canvas.clientWidth;
      canvas.height = canvas.clientHeight;
      drawDieline();
    };

    const handleWheel = (e: WheelEvent) => {
      e.preventDefault();
      const delta = -e.deltaY;
      const factor = delta > 0 ? 1.1 : 0.9;
      setZoom(prev => Math.min(10, Math.max(0.1, prev * factor)));
    };

    const handleMouseDown = (e: MouseEvent) => {
      isDragging.current = true;
      lastMousePos.current = { x: e.clientX, y: e.clientY };
    };

    const handleMouseMove = (e: MouseEvent) => {
      if (!isDragging.current) return;
      const dx = e.clientX - lastMousePos.current.x;
      const dy = e.clientY - lastMousePos.current.y;
      setOffset(prev => ({ x: prev.x + dx, y: prev.y + dy }));
      lastMousePos.current = { x: e.clientX, y: e.clientY };
    };

    const handleMouseUp = () => {
      isDragging.current = false;
    };

    canvas.addEventListener('wheel', handleWheel, { passive: false });
    canvas.addEventListener('mousedown', handleMouseDown);
    window.addEventListener('mousemove', handleMouseMove);
    window.addEventListener('mouseup', handleMouseUp);
    window.addEventListener('resize', handleResize);
    
    handleResize();

    return () => {
      canvas.removeEventListener('wheel', handleWheel);
      canvas.removeEventListener('mousedown', handleMouseDown);
      window.removeEventListener('mousemove', handleMouseMove);
      window.removeEventListener('mouseup', handleMouseUp);
      window.removeEventListener('resize', handleResize);
    };
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
        roughness: 1.0, // 完全粗糙，减少反光感
        metalness: 0.0, // 无金属感
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
    setIsSceneReady(true);

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

  // 8. 3D 贴图逻辑已根据用户要求完全移除
  
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

  const handleImageUpload = (e: React.ChangeEvent<HTMLInputElement>) => {
    const file = e.target.files?.[0];
    if (file) {
      const url = URL.createObjectURL(file);
      setTextureUrl(url);
    }
  };

  const clearTexture = () => {
    if (textureUrl) URL.revokeObjectURL(textureUrl);
    setTextureUrl(null);
    if (fileInputRef.current) {
      fileInputRef.current.value = '';
    }
  };

  return (
    <div className="flex h-screen w-screen bg-slate-50 overflow-hidden font-sans text-slate-900">
      {/* Left: 2D Dieline (70%) */}
      <div className="w-[70%] h-full relative border-r border-slate-200 bg-white">
        <div className="absolute top-6 left-8 z-10 flex items-center justify-between w-[calc(100%-4rem)]">
          <h1 className="text-xl font-black tracking-tight text-slate-800 flex items-center gap-2">
            <Box className="w-6 h-6 text-rose-500" />
            2D DIELINE VIEW <span className="text-xs font-normal text-slate-400 ml-2">Scale: 1:1 (Approx)</span>
          </h1>
          
          <div className="flex gap-3">
            <input 
              type="file" 
              ref={fileInputRef} 
              onChange={handleImageUpload} 
              accept="image/*" 
              className="hidden" 
            />
            <button 
              onClick={() => fileInputRef.current?.click()}
              className="flex items-center gap-2 px-4 py-2 bg-slate-900 text-white rounded-xl text-xs font-bold hover:bg-slate-800 transition-all shadow-lg active:scale-95"
            >
              <Info className="w-4 h-4" />
              UPLOAD ARTWORK 贴图
            </button>
            {textureUrl && (
              <button 
                onClick={clearTexture}
                className="px-4 py-2 bg-rose-100 text-rose-600 rounded-xl text-xs font-bold hover:bg-rose-200 transition-all active:scale-95"
              >
                CLEAR
              </button>
            )}
          </div>
        </div>
        <canvas ref={canvas2dRef} className="w-full h-full cursor-grab active:cursor-grabbing" />
        <div className="absolute bottom-6 right-8 z-10 flex gap-2">
          <button 
            onClick={() => setZoom(prev => Math.min(10, prev * 1.2))}
            className="w-10 h-10 flex items-center justify-center rounded-xl bg-white shadow-lg border border-slate-200 text-slate-600 hover:bg-slate-50 transition-all"
          >
            +
          </button>
          <button 
            onClick={() => setZoom(prev => Math.max(0.1, prev / 1.2))}
            className="w-10 h-10 flex items-center justify-center rounded-xl bg-white shadow-lg border border-slate-200 text-slate-600 hover:bg-slate-50 transition-all"
          >
            -
          </button>
          <button 
            onClick={() => { setZoom(1); setOffset({ x: 0, y: 0 }); }}
            className="px-4 h-10 flex items-center justify-center rounded-xl bg-white shadow-lg border border-slate-200 text-xs font-bold text-slate-600 hover:bg-slate-50 transition-all"
          >
            RESET
          </button>
        </div>
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
