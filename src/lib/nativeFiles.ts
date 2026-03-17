import { Capacitor } from "@capacitor/core";

/**
 * Native file helper — saves/reads files using @capacitor/filesystem on native,
 * falls back to standard download on web.
 */

export async function saveFileToDevice(
  fileName: string,
  data: Blob | string,
  directory: "Documents" | "Downloads" | "Cache" = "Documents"
): Promise<string | null> {
  if (!Capacitor.isNativePlatform()) {
    // Web fallback — trigger browser download
    const url =
      typeof data === "string"
        ? `data:text/plain;base64,${data}`
        : URL.createObjectURL(data);
    const a = document.createElement("a");
    a.href = url;
    a.download = fileName;
    a.click();
    if (typeof data !== "string") URL.revokeObjectURL(url);
    return null;
  }

  const { Filesystem, Directory, Encoding } = await import(
    "@capacitor/filesystem"
  );

  const dirMap = {
    Documents: Directory.Documents,
    Downloads: Directory.Documents, // Downloads not available on iOS, use Documents
    Cache: Directory.Cache,
  };

  if (typeof data === "string") {
    const result = await Filesystem.writeFile({
      path: fileName,
      data,
      directory: dirMap[directory],
      encoding: Encoding.UTF8,
    });
    return result.uri;
  }

  // Convert Blob to base64
  const base64 = await blobToBase64(data);
  const result = await Filesystem.writeFile({
    path: fileName,
    data: base64,
    directory: dirMap[directory],
  });
  return result.uri;
}

export async function readFileFromDevice(
  fileName: string,
  directory: "Documents" | "Cache" = "Documents"
): Promise<string | null> {
  if (!Capacitor.isNativePlatform()) return null;

  const { Filesystem, Directory, Encoding } = await import(
    "@capacitor/filesystem"
  );

  const dirMap = {
    Documents: Directory.Documents,
    Cache: Directory.Cache,
  };

  try {
    const result = await Filesystem.readFile({
      path: fileName,
      directory: dirMap[directory],
      encoding: Encoding.UTF8,
    });
    return typeof result.data === "string" ? result.data : null;
  } catch {
    return null;
  }
}

export async function deleteFileFromDevice(
  fileName: string,
  directory: "Documents" | "Cache" = "Documents"
): Promise<boolean> {
  if (!Capacitor.isNativePlatform()) return false;

  const { Filesystem, Directory } = await import("@capacitor/filesystem");

  const dirMap = {
    Documents: Directory.Documents,
    Cache: Directory.Cache,
  };

  try {
    await Filesystem.deleteFile({
      path: fileName,
      directory: dirMap[directory],
    });
    return true;
  } catch {
    return false;
  }
}

function blobToBase64(blob: Blob): Promise<string> {
  return new Promise((resolve, reject) => {
    const reader = new FileReader();
    reader.onloadend = () => {
      const result = reader.result as string;
      // Remove data URL prefix (e.g. "data:image/jpeg;base64,")
      resolve(result.split(",")[1] || result);
    };
    reader.onerror = reject;
    reader.readAsDataURL(blob);
  });
}
