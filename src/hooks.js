export function readImageFile(file, maxMb = 5) {
  return new Promise((resolve, reject) => {
    if (!file.type.startsWith('image/')) reject(new Error('Hanya file gambar yang diperbolehkan'));
    else if (file.size > maxMb * 1024 * 1024) reject(new Error(`Ukuran file maksimal ${maxMb}MB`));
    else {
      const reader = new FileReader();
      reader.onload = () => resolve(reader.result);
      reader.onerror = () => reject(new Error('Gagal membaca gambar'));
      reader.readAsDataURL(file);
    }
  });
}
