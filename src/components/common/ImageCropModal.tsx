import { useState, useCallback } from "react";
import Cropper, { Area } from "react-easy-crop";
import { X, Check, ZoomIn, ZoomOut, RotateCw } from "lucide-react";

interface ImageCropModalProps {
  imageSrc: string;
  onCancel: () => void;
  onConfirm: (croppedBlob: Blob) => void;
}

// Creates a canvas-cropped blob from the image
const createCroppedImage = async (
  imageSrc: string,
  pixelCrop: Area
): Promise<Blob> => {
  const image = new Image();
  image.crossOrigin = "anonymous";
  await new Promise<void>((resolve) => {
    image.onload = () => resolve();
    image.src = imageSrc;
  });

  const canvas = document.createElement("canvas");
  canvas.width = pixelCrop.width;
  canvas.height = pixelCrop.height;
  const ctx = canvas.getContext("2d")!;

  ctx.drawImage(
    image,
    pixelCrop.x,
    pixelCrop.y,
    pixelCrop.width,
    pixelCrop.height,
    0,
    0,
    pixelCrop.width,
    pixelCrop.height
  );

  return new Promise((resolve) => {
    canvas.toBlob((blob) => resolve(blob!), "image/jpeg", 0.9);
  });
};

const ImageCropModal = ({ imageSrc, onCancel, onConfirm }: ImageCropModalProps) => {
  const [crop, setCrop] = useState({ x: 0, y: 0 });
  const [zoom, setZoom] = useState(1);
  const [rotation, setRotation] = useState(0);
  const [croppedAreaPixels, setCroppedAreaPixels] = useState<Area | null>(null);

  const onCropComplete = useCallback((_: Area, croppedPixels: Area) => {
    setCroppedAreaPixels(croppedPixels);
  }, []);

  const handleConfirm = async () => {
    if (!croppedAreaPixels) return;
    const blob = await createCroppedImage(imageSrc, croppedAreaPixels);
    onConfirm(blob);
  };

  return (
    <div className="fixed inset-0 z-50 bg-black/80 flex flex-col">
      {/* Header */}
      <div className="flex items-center justify-between px-4 py-3 bg-background/90 backdrop-blur-sm border-b border-border">
        <button onClick={onCancel} className="p-2 rounded-lg text-muted-foreground hover:text-foreground transition-colors">
          <X className="w-5 h-5" />
        </button>
        <span className="font-bold text-sm text-foreground">Ajustar foto</span>
        <button onClick={handleConfirm} className="p-2 rounded-lg text-primary hover:bg-primary/10 transition-colors">
          <Check className="w-5 h-5" />
        </button>
      </div>

      {/* Cropper */}
      <div className="flex-1 relative">
        <Cropper
          image={imageSrc}
          crop={crop}
          zoom={zoom}
          rotation={rotation}
          aspect={1}
          cropShape="rect"
          showGrid={true}
          onCropChange={setCrop}
          onZoomChange={setZoom}
          onCropComplete={onCropComplete}
        />
      </div>

      {/* Controls */}
      <div className="px-6 py-4 bg-background/90 backdrop-blur-sm border-t border-border space-y-3">
        <div className="flex items-center gap-3">
          <ZoomOut className="w-4 h-4 text-muted-foreground shrink-0" />
          <input
            type="range"
            min={1}
            max={3}
            step={0.05}
            value={zoom}
            onChange={(e) => setZoom(Number(e.target.value))}
            className="flex-1 accent-primary h-1"
          />
          <ZoomIn className="w-4 h-4 text-muted-foreground shrink-0" />
        </div>
        <div className="flex justify-center">
          <button
            onClick={() => setRotation((r) => (r + 90) % 360)}
            className="flex items-center gap-1.5 px-3 py-1.5 rounded-lg text-xs text-muted-foreground hover:text-foreground hover:bg-muted transition-colors"
          >
            <RotateCw className="w-3.5 h-3.5" /> Girar
          </button>
        </div>
      </div>
    </div>
  );
};

export default ImageCropModal;
