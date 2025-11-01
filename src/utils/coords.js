import { useReactFlow } from 'reactflow';

export function useFlowScreenConverters() {
  const rf = useReactFlow();
  return {
    toScreenPoint: (p) => rf.flowToScreenPosition(p),   // p = position
    toScreenSize: (s) => {                              // s = size
      const zoom = rf.getZoom?.() ?? rf.getViewport?.().zoom ?? 1;
      return { width: s.width * zoom, height: s.height * zoom };
    },
    toScreenRect: (r) => {
      const { x, y } = rf.flowToScreenPosition({ x: r.x, y: r.y });
      const zoom = rf.getZoom?.() ?? rf.getViewport?.().zoom ?? 1;
      return { x, y, width: r.width * zoom, height: r.height * zoom };
    },
  };
}