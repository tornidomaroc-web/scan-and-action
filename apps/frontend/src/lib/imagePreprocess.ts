/**
 * Safe, browser-side image enhancement (Contrast 1.15)
 * Skips PDFs and times out after 2 seconds.
 * (Moved verbatim from UploadModal so the mobile capture sheet shares it.)
 */
export const preprocessImage = async (file: File): Promise<File> => {
  if (!file.type.startsWith('image/') || file.type.includes('pdf')) {
    return file;
  }

  return new Promise((resolve) => {
    const timeoutId = setTimeout(() => {
      console.warn(`[Preprocessing] Timeout for ${file.name}, using original.`);
      resolve(file);
    }, 2000);

    const reader = new FileReader();
    reader.onload = (e) => {
      const img = new Image();
      img.onload = () => {
        try {
          const canvas = document.createElement('canvas');
          canvas.width = img.width;
          canvas.height = img.height;
          const ctx = canvas.getContext('2d');

          if (!ctx) {
            clearTimeout(timeoutId);
            return resolve(file);
          }

          // Apply light contrast (1.15)
          ctx.filter = 'contrast(1.15)';
          ctx.drawImage(img, 0, 0);

          canvas.toBlob((blob) => {
            clearTimeout(timeoutId);
            if (blob) {
              const processedFile = new File([blob], file.name, {
                type: file.type,
                lastModified: Date.now()
              });
              resolve(processedFile);
            } else {
              resolve(file);
            }
          }, file.type, 0.95);
        } catch (err) {
          console.error(`[Preprocessing] Error for ${file.name}:`, err);
          clearTimeout(timeoutId);
          resolve(file);
        }
      };
      img.onerror = () => {
        clearTimeout(timeoutId);
        resolve(file);
      };
      img.src = e.target?.result as string;
    };
    reader.onerror = () => {
      clearTimeout(timeoutId);
      resolve(file);
    };
    reader.readAsDataURL(file);
  });
};
