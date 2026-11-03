import { useState } from 'react';
import { Search, Minimize, Maximize, Download, Expand, RotateCcw } from 'lucide-react';
import { Button } from './Primitives';

export default function CanvasControls({ canvasRef, onExportPNG }) {
  const [fullscreen, setFullscreen] = useState(false);

  const toggleFullscreen = () => {
    const el = document.documentElement;
    if (!fullscreen) {
      el.requestFullscreen?.().then(() => setFullscreen(true));
    } else {
      document.exitFullscreen?.().then(() => setFullscreen(false));
    }
  };

  const handleExport = () => {
    if (!canvasRef.current) return;
    const data = canvasRef.current.exportPNG();
    if (data) onExportPNG?.();
  };

  return (
    <section className="canvas-controls">
      <div className="controls-group">
        <Button variant="ghost" icon={Search} size="small" onClick={() => canvasRef.current?.fitToScreen()}
          title="Fit ke layar">Fit</Button>
        <Button variant="ghost" icon={Minimize} size="small" onClick={() => canvasRef.current?.zoomOut()}
          title="Zoom out">−</Button>
        <Button variant="ghost" icon={Maximize} size="small" onClick={() => canvasRef.current?.zoomIn()}
          title="Zoom in">+</Button>
        <Button variant="ghost" icon={RotateCcw} size="small" onClick={() => canvasRef.current?.resetView()}
          title="Reset tampilan">Reset</Button>
      </div>
      <div className="controls-group">
        <Button variant="ghost" icon={fullscreen ? Minimize : Expand} size="small" onClick={toggleFullscreen}
          title={fullscreen ? 'Keluar layar penuh' : 'Layar penuh'}>
          {fullscreen ? 'Keluar' : 'Penuh'}
        </Button>
        <Button variant="primary" icon={Download} size="small" onClick={handleExport}
          title="Ekspor PNG">PNG</Button>
      </div>
    </section>
  );
}
